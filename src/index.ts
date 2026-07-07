import { DurableObject } from "cloudflare:workers";
import { AutoRouter } from "itty-router";
import {
  createAccountSchema,
  entryInputSchema,
  formatAmount,
  Ledger,
  migrate,
  SqlStorageRepository,
  ValidationError,
} from "pluts";
import { seed } from "./seed";
import {
  serializeAccount,
  serializeAmountLine,
  serializeEntry,
} from "./serializer";

/**
 * Ledger Durable Object — a single-writer coordinator backed by its own
 * embedded SQLite database (`ctx.storage.sql`).
 *
 * The DO exposes the Pluts JSON REST surface and self-provisions its schema in
 * the constructor via the `migrate()` export from the `pluts` dependency.
 * There is no separate D1 binding for the ledger data; the DO's private SQLite
 * storage (declared via `new_sqlite_classes` in `wrangler.jsonc`) is the
 * backing store. One DO instance corresponds to one isolated ledger.
 *
 * Requests are routed through a single DO instance named "ledger", so writes
 * are serialized through the same object and remain safe under retries.
 *
 * Routes handled by this Durable Object:
 *   POST /accounts                   create an account
 *   GET  /accounts                   list accounts with balances
 *   GET  /accounts/:id               fetch a single account
 *   GET  /accounts/:id/balance       get an account balance
 *   GET  /accounts/:id/entries       list entries for an account
 *   GET  /accounts/:id/amounts       list amount lines for an account
 *   POST /entries                    post a balanced entry
 *   GET  /entries                    list entries (newest first)
 *   GET  /trial-balance              get the trial balance
 *   GET  /balance-sheet              get the balance sheet summary
 *   GET  /income-statement           get the income statement summary
 *   POST /seed                       seed the Harbor Goods demo data
 */
export class PlutsLedgerDO extends DurableObject<Env> {
  /**
   * Provision the schema before any request is served. The DO's private SQLite
   * backing store is available synchronously through `ctx.storage.sql`, so
   * running migrations here under `blockConcurrencyWhile` is the recommended
   * pattern and avoids a per-request migration check. Re-running this on an
   * existing database is a no-op.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(() => {
      migrate(ctx.storage.sql);
      return Promise.resolve();
    });
  }

  /**
   * Create a Ledger instance backed by this DO's private SQLite database.
   * Every ledger operation in this class flows through this instance.
   */
  private ledger(): Ledger {
    return new Ledger(new SqlStorageRepository(this.ctx.storage));
  }

  async createAccount(accountData: unknown) {
    const created = await this.ledger().createAccount(
      createAccountSchema.parse(accountData),
    );
    return serializeAccount(created);
  }

  async getAccount(accountId: string) {
    const account = await this.ledger().getAccount(accountId);
    return account ? serializeAccount(account) : null;
  }

  async listAccounts() {
    const ledger = this.ledger();
    const accounts = await ledger.allAccounts();
    return Promise.all(
      accounts.map(async (account) => ({
        ...serializeAccount(account),
        balance: formatAmount(await ledger.accountBalance(account)),
      })),
    );
  }

  async postEntry(entryData: unknown) {
    const created = await this.ledger().postEntry(
      entryInputSchema.parse(entryData),
    );
    return serializeEntry(created);
  }

  async getAccountBalance(accountId: string) {
    const ledger = this.ledger();
    const account = await ledger.getAccount(accountId);
    if (!account) return null;
    return {
      balance: formatAmount(await ledger.accountBalance(account)),
    };
  }

  async getAccountEntries(accountId: string) {
    const ledger = this.ledger();
    const account = await ledger.getAccount(accountId);
    if (!account) return [];
    const entries = await ledger.entriesForAccount(account);
    return entries.map((entry) => serializeEntry(entry));
  }

  async getAccountAmounts(accountId: string) {
    const ledger = this.ledger();
    const account = await ledger.getAccount(accountId);
    if (!account) return [];
    const amounts = await ledger.amountsForAccount(account);
    return amounts.map((amountLine) => ({
      ...serializeAmountLine(amountLine),
      account: serializeAccount(amountLine.account),
    }));
  }

  async listEntries() {
    const entries = await this.ledger().allEntries("desc");
    return entries.map((entry) => serializeEntry(entry));
  }

  async getTrialBalance() {
    const ledger = this.ledger();
    return {
      balance: formatAmount(await ledger.trialBalance()),
    };
  }

  async getBalanceSheet() {
    const ledger = this.ledger();
    const [balanceSheet, incomeStatement] = await Promise.all([
      ledger.balanceSheet(),
      ledger.incomeStatement(),
    ]);
    return {
      assets: formatAmount(balanceSheet.assets),
      liabilities: formatAmount(balanceSheet.liabilities),
      equity: formatAmount(balanceSheet.equity),
      netIncome: formatAmount(incomeStatement.netIncome),
      balanced: formatAmount(balanceSheet.balanced),
    };
  }

  async getIncomeStatement() {
    const ledger = this.ledger();
    const incomeStatement = await ledger.incomeStatement();
    return {
      revenue: formatAmount(incomeStatement.revenue),
      expenses: formatAmount(incomeStatement.expenses),
      netIncome: formatAmount(incomeStatement.netIncome),
    };
  }

  async seedLedger() {
    return seed(this.ledger());
  }

  /**
   * Internal helper used by tests to seed the ledger data. It is not exposed
   * as a public route, but it delegates to the same idempotent seeding logic
   * as `POST /seed`.
   * @returns {Promise<void>}
   */
  async __testSeedData(): Promise<void> {
    await this.seedLedger();
  }

  async fetch(request: Request): Promise<Response> {
    const router = AutoRouter();

    router
      .post("/accounts", async (request) =>
        Response.json(await this.createAccount(await request.json())),
      )
      .get("/accounts", async () => Response.json(await this.listAccounts()))
      .get("/accounts/:id/balance", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }

        return Response.json(await this.getAccountBalance(accountId));
      })
      .get("/accounts/:id/entries", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }

        return Response.json(await this.getAccountEntries(accountId));
      })
      .get("/accounts/:id/amounts", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }

        return Response.json(await this.getAccountAmounts(accountId));
      })
      .get("/accounts/:id", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }

        return Response.json(await this.getAccount(accountId));
      })
      .post("/entries", async (request) =>
        Response.json(await this.postEntry(await request.json())),
      )
      .get("/entries", async () => Response.json(await this.listEntries()))
      .get("/trial-balance", async () =>
        Response.json(await this.getTrialBalance()),
      )
      .get("/balance-sheet", async () =>
        Response.json(await this.getBalanceSheet()),
      )
      .get("/income-statement", async () =>
        Response.json(await this.getIncomeStatement()),
      )
      .post("/seed", async () => Response.json(await this.seedLedger()))
      .all("*", () => new Response("Not Found", { status: 404 }));

    try {
      return await router.fetch(request);
    } catch (e) {
      if (e instanceof ValidationError) {
        return Response.json(
          { error: e.message, issues: e.issues },
          { status: 400 },
        );
      }
      const message = e instanceof Error ? e.message : String(e);
      return Response.json({ error: message }, { status: 500 });
    }
  }

  /**
   * Clear all storage associated with this Durable Object instance, including
   * the embedded SQLite database schema and rows and any key-value data.
   * This is useful for resetting the ledger during development.
   */
  async clearDo(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // This demo uses a single Durable Object instance named "ledger" for the
    // entire worker. In a multi-tenant deployment, you would typically route
    // requests to a per-tenant DO instance instead.
    const stub = env.PLUTS_LEDGER_DO.getByName("ledger");
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
