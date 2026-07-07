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
        {
          rel: "self",
          href: expect.stringMatching(/^\/entries\//),
          method: "GET",
        },
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
        {
          rel: "self",
          href: expect.stringMatching(/^\/accounts\//),
          method: "GET",
        },
        {
          rel: "balance",
          href: expect.stringMatching(/\/balance$/),
          method: "GET",
        },
        {
          rel: "entries",
          href: expect.stringMatching(/\/entries$/),
          method: "GET",
        },
        {
          rel: "amounts",
          href: expect.stringMatching(/\/amounts$/),
          method: "GET",
        },
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

  describe("Validation and error handling", () => {
    const postEntry = (body: unknown) =>
      exports.default.fetch("http://example.com/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    it("rejects an unbalanced entry with 400 and a structured issue", async () => {
      const response = await postEntry({
        description: "unbalanced",
        date: "2026-07-01",
        debits: [{ accountName: "Cash", amount: 100 }],
        credits: [{ accountName: "Sales Revenue", amount: 90 }],
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Validation failed");
      expect(data.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: "The credit and debit amounts are not equal",
          }),
        ]),
      );
    });

    it("rejects a negative amount with 400", async () => {
      const response = await postEntry({
        description: "negative",
        date: "2026-07-01",
        debits: [{ accountName: "Cash", amount: -100 }],
        credits: [{ accountName: "Sales Revenue", amount: -100 }],
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Validation failed");
      expect(Array.isArray(data.issues)).toBe(true);
      expect(data.issues.length).toBeGreaterThan(0);
    });

    it("rejects a zero-total entry with 400", async () => {
      const response = await postEntry({
        description: "zero",
        date: "2026-07-01",
        debits: [{ accountName: "Cash", amount: 0 }],
        credits: [{ accountName: "Sales Revenue", amount: 0 }],
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: "Entry amounts must be greater than zero",
          }),
        ]),
      );
    });

    it("rejects an unknown account name with 400 and a path-tagged issue", async () => {
      const response = await postEntry({
        description: "unknown account",
        date: "2026-07-01",
        debits: [{ accountName: "Nonexistent Account", amount: 50 }],
        credits: [{ accountName: "Cash", amount: 50 }],
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ["debits", 0, "account"],
            message: 'Account "Nonexistent Account" not found',
          }),
        ]),
      );
    });

    it("rejects an entry with no debits or credits with 400", async () => {
      const response = await postEntry({
        description: "empty",
        date: "2026-07-01",
        debits: [],
        credits: [],
      });
      expect(response.status).toBe(400);
    });

    it("rejects an invalid account type with 400", async () => {
      const response = await exports.default.fetch(
        "http://example.com/accounts",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Weird", type: "NotAType" }),
        },
      );
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(typeof data.error).toBe("string");
      expect(data.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: ["type"] })]),
      );
    });

    it("recovers after POST /clear without bricking the DO", async () => {
      const clear = await exports.default.fetch("http://example.com/clear", {
        method: "POST",
      });
      expect(clear.status).toBe(200);
      expect(await clear.json()).toStrictEqual({ cleared: true });

      // The schema must survive the clear (migrate re-runs), so listing works and
      // returns an empty set rather than a 500 `no such table` error.
      const accounts = await exports.default.fetch(
        "http://example.com/accounts",
      );
      expect(accounts.status).toBe(200);
      expect(await accounts.json()).toStrictEqual([]);

      // And the ledger can be re-seeded back to a balanced state.
      const seed = await exports.default.fetch("http://example.com/seed", {
        method: "POST",
      });
      expect(seed.status).toBe(200);
      const trial = await exports.default.fetch(
        "http://example.com/trial-balance",
      );
      expect((await trial.json()).balance).toBe("0.00");
    });
  });
});
