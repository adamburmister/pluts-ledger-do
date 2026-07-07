import { env, exports } from "cloudflare:workers";
import { describe, it, expect, beforeAll } from "vitest";

describe("Pluts Ledger DO Worker HTTP JSON API", () => {
  beforeAll(async () => {
    const id = env.PLUTS_LEDGER_DO.idFromName("ledger");
    const stub = env.PLUTS_LEDGER_DO.get(id);
    await stub.__testSeedData();
  });

  it("serves a 404", async () => {
    const response = await exports.default.fetch("http://example.com/404");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("GETs trial balance with `balance` as a formatted number string", async () => {
    const response = await exports.default.fetch(
      "http://example.com/trial-balance",
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.balance).toBe("0.00");
  });

  it("GETs entries with `creditAmounts` and `debitAmounts` nodes with `amount` as a formatted number string", async () => {
    const response = await exports.default.fetch("http://example.com/entries");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.length).toBe(10);
    expect(data[0]).toStrictEqual({
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

  it("GETs accounts with `balance` as a formatted number string", async () => {
    const response = await exports.default.fetch("http://example.com/accounts");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.length).toBe(15);
    expect(data[0]).toStrictEqual({
      id: expect.any(String),
      name: "Accounts Payable",
      type: "Liability",
      contra: false,
      createdAt: expect.any(String),
      balance: "4000.00",
    });
  });
});
