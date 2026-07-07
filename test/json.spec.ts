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
            links: expect.any(Array),
          },
          amount: "2500.00",
          entryId: expect.any(String),
          links: expect.any(Array),
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
            links: expect.any(Array),
          },
          amount: "2500.00",
          entryId: expect.any(String),
          links: expect.any(Array),
        },
      ],
      postedAt: expect.any(String),
      links: [
        { rel: "self", href: expect.stringMatching(/^\/entries\//), method: "GET" },
      ],
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
      links: [
        { rel: "self", href: expect.stringMatching(/^\/accounts\//), method: "GET" },
        { rel: "balance", href: expect.stringMatching(/\/balance$/), method: "GET" },
        { rel: "entries", href: expect.stringMatching(/\/entries$/), method: "GET" },
        { rel: "amounts", href: expect.stringMatching(/\/amounts$/), method: "GET" },
      ],
    });
  });

  it("404s when an account is not found", async () => {
    const response = await exports.default.fetch(
      "http://example.com/accounts/does-not-exist",
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("GETs a single entry by id with a `self` link", async () => {
    const entries = await stub.listEntries();
    const entryId = entries[0].id;

    const response = await exports.default.fetch(
      `http://example.com/entries/${entryId}`,
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(entryId);
    expect(data.links).toContainEqual({
      rel: "self",
      href: `/entries/${entryId}`,
      method: "GET",
    });
    expect(data.debitAmounts[0].links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rel: "account" }),
        expect.objectContaining({ rel: "entry" }),
      ]),
    );
  });

  it("404s when an entry is not found", async () => {
    const response = await exports.default.fetch(
      "http://example.com/entries/does-not-exist",
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
  });

  it("routes account detail subpaths", async () => {
    const accounts = await stub.listAccounts();
    const payable = accounts.find(
      (account) => account.name === "Accounts Payable",
    );
    const accountId = payable.id;

    expect(payable).toBeDefined();

    const balanceResponse = await exports.default.fetch(
      `https://example.com/accounts/${accountId}/balance`,
    );
    expect(balanceResponse.status).toBe(200);
    expect(await balanceResponse.json()).toStrictEqual({
      balance: "4000.00",
      links: [
        {
          rel: "self",
          href: `/accounts/${accountId}/balance`,
          method: "GET",
        },
        { rel: "account", href: `/accounts/${accountId}`, method: "GET" },
      ],
    });

    const entriesResponse = await exports.default.fetch(
      `https://example.com/accounts/${accountId}/entries`,
    );
    expect(entriesResponse.status).toBe(200);
    expect(await entriesResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String) }),
      ]),
    );

    const amountsResponse = await exports.default.fetch(
      `https://example.com/accounts/${accountId}/amounts`,
    );
    expect(amountsResponse.status).toBe(200);
    expect(await amountsResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String) }),
      ]),
    );
  });
});
