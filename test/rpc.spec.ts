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
});
