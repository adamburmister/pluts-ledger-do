import { ValidationError } from "pluts";
import type { Ledger, CreateAccountInput, EntryInput } from "pluts";

interface SeedAccount {
	name: string;
	type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
	contra?: boolean;
}

interface SeedAmountLine {
	accountName: string;
	amount: number | string;
}

interface SeedEntry {
	idempotencyKey: string;
	description: string;
	date: string;
	debits: SeedAmountLine[];
	credits: SeedAmountLine[];
}

// Harbor Goods — a small retail store's opening month. Each entry is a plausible
// real-world transaction; debits always equal credits.
const SEED_ACCOUNTS: SeedAccount[] = [
	{ name: "Cash", type: "Asset" },
	{ name: "Checking Account", type: "Asset" },
	{ name: "Inventory", type: "Asset" },
	{ name: "Accounts Receivable", type: "Asset" },
	{ name: "Equipment", type: "Asset" },
	{ name: "Accounts Payable", type: "Liability" },
	{ name: "Sales Tax Payable", type: "Liability" },
	{ name: "Loan Payable", type: "Liability" },
	{ name: "Owner's Capital", type: "Equity" },
	{ name: "Sales Revenue", type: "Revenue" },
	{ name: "Service Revenue", type: "Revenue" },
	{ name: "Cost of Goods Sold", type: "Expense" },
	{ name: "Rent Expense", type: "Expense" },
	{ name: "Salaries Expense", type: "Expense" },
	{ name: "Utilities Expense", type: "Expense" },
];

const SEED_ENTRIES: SeedEntry[] = [
	{
		idempotencyKey: "seed-01-capital",
		description: "Owner invests opening capital into the business",
		date: "2026-06-01",
		debits: [{ accountName: "Checking Account", amount: 50000 }],
		credits: [{ accountName: "Owner's Capital", amount: 50000 }],
	},
	{
		idempotencyKey: "seed-02-equipment",
		description: "Purchase store equipment and fixtures",
		date: "2026-06-02",
		debits: [{ accountName: "Equipment", amount: 5000 }],
		credits: [{ accountName: "Checking Account", amount: 5000 }],
	},
	{
		idempotencyKey: "seed-03-inventory",
		description: "Buy initial inventory on credit from supplier",
		date: "2026-06-03",
		debits: [{ accountName: "Inventory", amount: 8000 }],
		credits: [{ accountName: "Accounts Payable", amount: 8000 }],
	},
	{
		idempotencyKey: "seed-04-cash-sale",
		description: "Cash sale to walk-in customer (incl. 10% sales tax)",
		date: "2026-06-05",
		debits: [{ accountName: "Cash", amount: 1100 }],
		credits: [
			{ accountName: "Sales Revenue", amount: 1000 },
			{ accountName: "Sales Tax Payable", amount: 100 },
		],
	},
	{
		idempotencyKey: "seed-05-rent",
		description: "Pay monthly store rent",
		date: "2026-06-06",
		debits: [{ accountName: "Rent Expense", amount: 1500 }],
		credits: [{ accountName: "Checking Account", amount: 1500 }],
	},
	{
		idempotencyKey: "seed-06-payroll",
		description: "Pay staff salaries for the first half of the month",
		date: "2026-06-15",
		debits: [{ accountName: "Salaries Expense", amount: 3000 }],
		credits: [{ accountName: "Checking Account", amount: 3000 }],
	},
	{
		idempotencyKey: "seed-07-pay-supplier",
		description: "Partial payment to inventory supplier",
		date: "2026-06-18",
		debits: [{ accountName: "Accounts Payable", amount: 4000 }],
		credits: [{ accountName: "Checking Account", amount: 4000 }],
	},
	{
		idempotencyKey: "seed-08-cogs",
		description: "Recognize cost of goods sold for the month",
		date: "2026-06-30",
		debits: [{ accountName: "Cost of Goods Sold", amount: 2500 }],
		credits: [{ accountName: "Inventory", amount: 2500 }],
	},
	{
		idempotencyKey: "seed-09-utilities",
		description: "Pay electricity and water bill",
		date: "2026-06-28",
		debits: [{ accountName: "Utilities Expense", amount: 200 }],
		credits: [{ accountName: "Cash", amount: 200 }],
	},
	{
		idempotencyKey: "seed-10-credit-sale",
		description: "Sale on credit to a wholesale customer (incl. 10% sales tax)",
		date: "2026-06-25",
		debits: [{ accountName: "Accounts Receivable", amount: 2200 }],
		credits: [
			{ accountName: "Sales Revenue", amount: 2000 },
			{ accountName: "Sales Tax Payable", amount: 200 },
		],
	},
];

/**
 * Seed the Harbor Goods demo data (ported from `pluts/scripts/seed-demo.ts`).
 * Idempotent: duplicate accounts are skipped and entries reuse their
 * idempotency keys, so re-running `POST /seed` is a no-op.
 */
export async function seed(
	ledger: Ledger,
): Promise<{ accounts: number; entries: number }> {
	let accounts = 0;
	let entries = 0;

	for (const a of SEED_ACCOUNTS) {
		try {
			await ledger.createAccount(a as CreateAccountInput);
			accounts++;
		} catch (e) {
			// A duplicate (name, type) means the account already exists from a prior
			// seed run — treat as success so seeding stays idempotent.
			if (
				e instanceof ValidationError &&
				/already exists|has already been taken/i.test(e.message)
			)
				continue;
			throw e;
		}
	}

	for (const e of SEED_ENTRIES) {
		await ledger.postEntry(e as EntryInput);
		entries++;
	}

	return { accounts, entries };
}
