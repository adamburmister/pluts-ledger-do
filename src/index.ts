import { DurableObject } from "cloudflare:workers";
import {
	formatAmount,
	Ledger,
	migrate,
	SqlStorageRepository,
	ValidationError,
	createAccountSchema,
	entryInputSchema,
} from "pluts";
import { seed } from "./seed";

/**
 * Ledger Durable Object — a single-writer coordinator backed by its own
 * embedded SQLite database (`ctx.storage.sql`).
 *
 * The DO routes the Pluts JSON REST surface (ported from `pluts/worker`) and
 * self-provisions its schema in the constructor via the `migrate()` exported
 * by the `pluts` dependency. There is no separate D1 binding — the DO's private
 * SQLite storage (declared via `new_sqlite_classes` in `wrangler.jsonc`) is the
 * ledger. One DO instance = one isolated ledger.
 *
 * All requests are routed to one DO instance named "ledger" — every write is
 * serialized through it, which is what makes the ledger safe under retries.
 *
 * Routes (forwarded verbatim from the outer Worker):
 *   POST /accounts         create an account           { name, type, contra? }
 *   GET  /accounts         list accounts (with balances)
 *   POST /entries          post a balanced entry       { description, debits, credits, ... }
 *   GET  /entries          list entries (newest first)
 *   GET  /trial-balance    { balance }  (should be "0.00" for a balanced ledger)
 *   POST /seed             seed the Harbor Goods demo data (idempotent)
 */
export class PlutsLedgerDO extends DurableObject<Env> {
	/**
	 * Provision the schema before any request is served. `ctx.storage.sql` is
	 * synchronous, local SQLite, so running migrations here (under
	 * `blockConcurrencyWhile`) is the recommended DO pattern and avoids a
	 * per-request migration check. Idempotent — a warm DB is a no-op.
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(() => {
			migrate(ctx.storage.sql);
			return Promise.resolve();
		});
	}

	private ledger(): Ledger {
		return new Ledger(new SqlStorageRepository(this.ctx.storage));
	}

	async fetch(request: Request): Promise<Response> {
		const ledger = this.ledger();
		const url = new URL(request.url);

		try {
			if (request.method === "POST" && url.pathname === "/accounts") {
				const accountData = await createAccountSchema.parse(
					await request.json(),
				);
				const account = await ledger.createAccount(accountData);
				return Response.json(account);
			}

			if (request.method === "GET" && url.pathname === "/accounts") {
				const accounts = await ledger.allAccounts();
				const withBalances = await Promise.all(
					accounts.map(async (a) => ({
						...a,
						balance: formatAmount(await ledger.accountBalance(a)),
					})),
				);
				return Response.json(withBalances);
			}

			if (request.method === "POST" && url.pathname === "/entries") {
				const entryData = await entryInputSchema.parse(await request.json());
				const entry = await ledger.postEntry(entryData);
				return Response.json(entry);
			}

			if (request.method === "GET" && url.pathname === "/entries") {
				const entries = await ledger.allEntries("desc");
				return Response.json(entries);
			}

			if (request.method === "GET" && url.pathname === "/trial-balance") {
				return Response.json({
					balance: formatAmount(await ledger.trialBalance()),
				});
			}

			if (request.method === "POST" && url.pathname === "/seed") {
				return Response.json(await seed(ledger));
			}

			return new Response("Not Found", { status: 404 });
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
	 * Clears all storage associated with this Durable Object instance — the
	 * embedded SQLite database (schema + all rows) and any key-value data.
	 * Useful for resetting a ledger during development.
	 */
	async clearDo(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		// In practice you would probably use a per-tenant DO instance,
		// but for this demo we just use a single DO named "ledger".
		const stub = env.PLUTS_LEDGER_DO.getByName("ledger");
		return stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
