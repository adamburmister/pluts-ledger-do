import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

describe("Pluts Ledger DO Worker HTTP JSON API", () => {
  let stub: DurableObjectStub;

  beforeAll(async () => {
    const id = env.PLUTS_LEDGER_DO.idFromName("ledger");
    stub = env.PLUTS_LEDGER_DO.get(id);
    await stub.seedLedger();
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

  it("routes account detail subpaths", async () => {
    const accounts = await stub.listAccounts();
    const payable = accounts.find(
      (account) => account.name === "Accounts Payable",
    );

    expect(payable).toBeDefined();

    const balanceResponse = await exports.default.fetch(
      `https://example.com/accounts/${payable.id}/balance`,
    );
    expect(balanceResponse.status).toBe(200);
    expect(await balanceResponse.json()).toStrictEqual({
      balance: "4000.00",
    });

    const entriesResponse = await exports.default.fetch(
      `https://example.com/accounts/${payable.id}/entries`,
    );
    expect(entriesResponse.status).toBe(200);
    expect(await entriesResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String) }),
      ]),
    );

    const amountsResponse = await exports.default.fetch(
      `https://example.com/accounts/${payable.id}/amounts`,
    );
    expect(amountsResponse.status).toBe(200);
    expect(await amountsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String) }),
      ]),
    );
  });
});
