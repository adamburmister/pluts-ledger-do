import { env } from "cloudflare:workers";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

describe("Pluts Ledger DO Worker RPC methods", () => {
  beforeAll(async () => {
    const id = env.PLUTS_LEDGER_DO.idFromName("ledger");
    const stub = env.PLUTS_LEDGER_DO.get(id);
    await stub.__testSeedData();
  });

  let stub: DurableObjectStub;
  beforeEach(() => {
    const id = env.PLUTS_LEDGER_DO.idFromName("ledger");
    stub = env.PLUTS_LEDGER_DO.get(id);
  });

  it("exposes getTrialBalance", async () => {
    const trialBalance = await stub.getTrialBalance();
    expect(trialBalance).toStrictEqual({ balance: "0.00" });
  });

  it("exposes listAccounts", async () => {
    const accounts = await stub.listAccounts();
    expect(accounts.length).toBeGreaterThan(0);
    expect(accounts[0]).toStrictEqual({
      id: expect.any(String),
      name: "Accounts Payable",
      type: "Liability",
      balance: "4000.00",
      contra: false,
      createdAt: expect.any(String),
    });
  });

  it("exposes listEntries", async () => {
    const entries = await stub.listEntries();
    expect(entries.length).toBe(10);
    expect(entries[0]).toStrictEqual({
      id: expect.any(String),
      description: "Recognize cost of goods sold for the month",
      date: "2026-06-30",
      debitAmounts: [
        {
          id: expect.any(String),
          kind: "debit",
          account: {
            id: expect.any(String),
            name: "Cost of Goods Sold",
            type: "Expense",
            contra: false,
            createdAt: expect.any(String),
          },
          amount: "2500.00",
          entryId: expect.any(String),
        },
      ],
      creditAmounts: [
        {
          id: expect.any(String),
          kind: "credit",
          account: {
            id: expect.any(String),
            name: "Inventory",
            type: "Asset",
            contra: false,
            createdAt: expect.any(String),
          },
          amount: "2500.00",
          entryId: expect.any(String),
        },
      ],
      postedAt: expect.any(String),
    });
  });

  it("exposes account-specific ledger queries", async () => {
    const accounts = await stub.listAccounts();
    const payable = accounts.find(
      (account) => account.name === "Accounts Payable",
    );

    expect(payable).toBeDefined();

    const account = await stub.getAccount(payable.id);
    const balance = await stub.getAccountBalance(payable.id);
    const entries = await stub.getAccountEntries(payable.id);
    const amounts = await stub.getAccountAmounts(payable.id);

    expect(account).toStrictEqual({
      id: payable.id,
      name: "Accounts Payable",
      type: "Liability",
      contra: false,
      createdAt: expect.any(String),
    });
    expect(balance).toStrictEqual({ balance: "4000.00" });
    expect(entries.length).toBeGreaterThan(0);
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts[0]).toStrictEqual({
      id: expect.any(String),
      kind: expect.any(String),
      account: {
        id: payable.id,
        name: "Accounts Payable",
        type: "Liability",
        contra: false,
        createdAt: expect.any(String),
      },
      amount: expect.any(String),
      entryId: expect.any(String),
    });
  });

  it("exposes balance sheet", async () => {
    const balanceSheet = await stub.getBalanceSheet();

    expect(balanceSheet).toStrictEqual({
      assets: "50100.00",
      liabilities: "4300.00",
      equity: "50000.00",
      netIncome: "-4200.00",
      balanced: "0.00",
    });
  });

  it("exposes income statement reporting", async () => {
    const incomeStatement = await stub.getIncomeStatement();

    expect(incomeStatement).toStrictEqual({
      expenses: "7200.00",
      netIncome: "-4200.00",
      revenue: "3000.00",
    });
  });
});
