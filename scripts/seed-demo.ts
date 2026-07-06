/**
 * Seeds the local worker (default http://localhost:8787) with realistic
 * small-business demo data: Harbor Goods' first month of operations.
 *
 * Run it against `npm run dev` (wrangler dev) in another terminal:
 *
 *   npm run dev                   # terminal 1
 *   npm run seed                  # terminal 2
 *
 * Seeding is idempotent: the Ledger Durable Object's `POST /seed` handler
 * skips already-existing accounts and reuses each entry's idempotency key,
 * so re-running the script is a no-op.
 */

const BASE = process.env.LEDGER_BASE_URL ?? 'http://localhost:8787';

async function main(): Promise<void> {
	console.log(`Seeding ${BASE} with Harbor Goods demo data…`);
	const res = await fetch(`${BASE}/seed`, { method: 'POST' });
	if (!res.ok) {
		throw new Error(`seed failed: ${res.status} ${await res.text()}`);
	}
	const { accounts, entries } = (await res.json()) as { accounts: number; entries: number };
	console.log(`  + ${accounts} account(s), ${entries} entr(y/ies) posted`);
	console.log('Done. Try:');
	console.log(`  curl ${BASE}/accounts`);
	console.log(`  curl ${BASE}/entries`);
	console.log(`  curl ${BASE}/trial-balance`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
