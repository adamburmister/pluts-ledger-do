import { DurableObject } from "cloudflare:workers";
import { AutoRouter } from "itty-router";
import {
  type CreateAccountInput,
  type EntryInput,
  formatAmount,
  Ledger,
  migrate,
  SqlStorageRepository,
  toAccountDTO,
  toAmountLineDTO,
  toEntryDTO,
  ValidationError,
} from "pluts";
import {
  linkAccount,
  linkAmountLine,
  linkBalance,
  linkBalanceSheet,
  linkEntry,
  linkIncomeStatement,
  linkTrialBalance,
} from "./links";
import { seed } from "./seed";

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
 *   GET  /entries/:id                fetch a single entry
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
    // Validation happens inside the domain layer, which throws a typed
    // `ValidationError` (surfaced as HTTP 400 by the router's `catch`). Parsing
    // here too would double-validate and leak a raw `ZodError` as a 500.
    const created = await this.ledger().createAccount(
      accountData as CreateAccountInput,
    );
    return toAccountDTO(created);
  }

  async getAccount(accountId: string) {
    const account = await this.ledger().getAccount(accountId);
    return account ? toAccountDTO(account) : null;
  }

  async listAccounts() {
    const ledger = this.ledger();
    const accounts = await ledger.allAccounts();
    return Promise.all(
      accounts.map(async (account) => ({
        ...toAccountDTO(account),
        balance: formatAmount(await ledger.accountBalance(account)),
      })),
    );
  }

  async postEntry(entryData: unknown) {
    // See `createAccount`: let the domain layer validate and throw
    // `ValidationError` rather than re-parsing here.
    const created = await this.ledger().postEntry(entryData as EntryInput);
    return toEntryDTO(created);
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
    if (!account) return null; // 404
    const entries = await ledger.entriesForAccount(account);
    return entries.map((entry) => toEntryDTO(entry));
  }

  async getAccountAmounts(accountId: string) {
    const ledger = this.ledger();
    const account = await ledger.getAccount(accountId);
    if (!account) return null;
    const amounts = await ledger.amountsForAccount(account);
    return amounts.map((amountLine) => ({
      ...toAmountLineDTO(amountLine),
      account: toAccountDTO(amountLine.account),
    }));
  }

  async listEntries() {
    const entries = await this.ledger().allEntries("desc");
    return entries.map((entry) => toEntryDTO(entry));
  }

  async getEntry(entryId: string) {
    // The Ledger domain class does not expose entry-by-id, but the repository
    // does and returns the same fully-hydrated Entry as `allEntries`.
    const entry = await new SqlStorageRepository(this.ctx.storage).getEntry(
      entryId,
    );
    return entry ? toEntryDTO(entry) : null;
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

  async clearLedger() {
    await this.clearDo();
    return { cleared: true };
  }

  async fetch(request: Request): Promise<Response> {
    // `AutoRouter` ships a built-in `catch` that serializes any thrown error as
    // HTTP 500. We override it so domain validation failures surface as 400
    // with structured issues; only genuinely unexpected errors are 500.
    const router = AutoRouter({
      catch: (err: unknown) => {
        if (err instanceof ValidationError) {
          return Response.json(
            { error: err.message, issues: err.issues },
            { status: 400 },
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: message }, { status: 500 });
      },
    });

    router
      .post("/accounts", async (request) =>
        Response.json(
          linkAccount(await this.createAccount(await request.json())),
        ),
      )
      .get("/accounts", async () =>
        Response.json((await this.listAccounts()).map(linkAccount)),
      )
      .get("/accounts/:id/balance", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }
        const accountBalance = await this.getAccountBalance(accountId);
        if (!accountBalance) {
          return new Response("Not Found", { status: 404 });
        }
        return Response.json(linkBalance(accountId, accountBalance));
      })
      .get("/accounts/:id/entries", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }
        const accountEntries = await this.getAccountEntries(accountId);
        if (!accountEntries) {
          return new Response("Not Found", { status: 404 });
        }
        return Response.json(accountEntries.map(linkEntry));
      })
      .get("/accounts/:id/amounts", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }
        const accountAmounts = await this.getAccountAmounts(accountId);
        if (!accountAmounts) {
          return new Response("Not Found", { status: 404 });
        }
        return Response.json(accountAmounts.map(linkAmountLine));
      })
      .get("/accounts/:id", async (request) => {
        const accountId = request.params.id;
        if (!accountId) {
          return new Response("Not Found", { status: 404 });
        }
        const account = await this.getAccount(accountId);
        if (!account) {
          return new Response("Not Found", { status: 404 });
        }
        return Response.json(linkAccount(account));
      })
      .post("/entries", async (request) =>
        Response.json(linkEntry(await this.postEntry(await request.json()))),
      )
      .get("/entries", async () =>
        Response.json((await this.listEntries()).map(linkEntry)),
      )
      .get("/entries/:id", async (request) => {
        const entryId = request.params.id;
        if (!entryId) {
          return new Response("Not Found", { status: 404 });
        }
        const entry = await this.getEntry(entryId);
        if (!entry) {
          return new Response("Not Found", { status: 404 });
        }
        return Response.json(linkEntry(entry));
      })
      .get("/trial-balance", async () =>
        Response.json(linkTrialBalance(await this.getTrialBalance())),
      )
      .get("/balance-sheet", async () =>
        Response.json(linkBalanceSheet(await this.getBalanceSheet())),
      )
      .get("/income-statement", async () =>
        Response.json(linkIncomeStatement(await this.getIncomeStatement())),
      )
      .post("/seed", async () => Response.json(await this.seedLedger()))
      .post("/clear", async () => Response.json(await this.clearLedger()))
      .all("*", () => new Response("Not Found", { status: 404 }));

    return router.fetch(request);
  }

  /**
   * Clear all storage associated with this Durable Object instance, including
   * the embedded SQLite database schema and rows and any key-value data.
   * This is useful for resetting the ledger during development.
   *
   * `deleteAll()` drops the schema tables, but `migrate()` normally runs only
   * in the constructor — the live DO instance survives a clear, so we must
   * re-provision the schema here. Otherwise every subsequent request on this
   * instance would fail with `no such table` until the DO is evicted.
   */
  async clearDo(): Promise<void> {
    await this.ctx.storage.deleteAll();
    migrate(this.ctx.storage.sql);
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
