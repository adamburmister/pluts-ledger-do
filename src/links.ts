import type {
  SerializableAccount,
  SerializableAmountLine,
  SerializableEntry,
} from "./serializer";

/**
 * HATEOAS hypermedia links for the HTTP JSON API.
 *
 * These decorators are applied at the HTTP layer only (in the Durable Object's
 * `fetch` router). The Durable Object RPC methods and the `serialize*`
 * functions stay free of URL-shaped data, so direct RPC callers receive clean
 * domain objects while HTTP clients get a self-describing, navigable API.
 *
 * All `href` values are relative so links work behind any host, proxy, or
 * custom domain without threading the request origin through the serializers.
 */

export interface Link {
  rel: string;
  href: string;
  method: string;
}

export type Linked<T> = T & { links: Link[] };

/** Links for an account: itself and its three sub-resources. */
export function linkAccount(
  account: SerializableAccount,
): Linked<SerializableAccount> {
  return {
    ...account,
    links: [
      { rel: "self", href: `/accounts/${account.id}`, method: "GET" },
      {
        rel: "balance",
        href: `/accounts/${account.id}/balance`,
        method: "GET",
      },
      {
        rel: "entries",
        href: `/accounts/${account.id}/entries`,
        method: "GET",
      },
      {
        rel: "amounts",
        href: `/accounts/${account.id}/amounts`,
        method: "GET",
      },
    ],
  };
}

/**
 * Links for an amount line: to its account and its parent entry. Amount lines
 * have no dedicated route, so there is no `self` link. The nested account is
 * decorated too, so its own links are available in place.
 */
export function linkAmountLine(
  line: SerializableAmountLine,
): Linked<SerializableAmountLine> {
  return {
    ...line,
    account: linkAccount(line.account),
    links: [
      { rel: "account", href: `/accounts/${line.account.id}`, method: "GET" },
      { rel: "entry", href: `/entries/${line.entryId}`, method: "GET" },
    ],
  };
}

/** Links for an entry: itself, recursing into its amount lines. */
export function linkEntry(entry: SerializableEntry): Linked<SerializableEntry> {
  return {
    ...entry,
    debitAmounts: entry.debitAmounts.map(linkAmountLine),
    creditAmounts: entry.creditAmounts.map(linkAmountLine),
    links: [{ rel: "self", href: `/entries/${entry.id}`, method: "GET" }],
  };
}

/** Links for the `/accounts/:id/balance` sub-resource response. */
export function linkBalance<T extends object>(
  accountId: string,
  payload: T,
): Linked<T> {
  return {
    ...payload,
    links: [
      {
        rel: "self",
        href: `/accounts/${accountId}/balance`,
        method: "GET",
      },
      { rel: "account", href: `/accounts/${accountId}`, method: "GET" },
    ],
  };
}

/**
 * The three report resources. Each report's response links to itself (as
 * `self`) and to the two sibling reports, so a client can hop between them.
 */
const REPORTS = [
  { rel: "trial-balance", href: "/trial-balance" },
  { rel: "balance-sheet", href: "/balance-sheet" },
  { rel: "income-statement", href: "/income-statement" },
] as const;

type ReportRel = (typeof REPORTS)[number]["rel"];

/**
 * Decorate a report response with its link set: `self` first, then the sibling
 * reports in table order. Driven by the single `REPORTS` table so the link
 * shape can never drift between reports.
 */
function linkReport<T extends object>(self: ReportRel, payload: T): Linked<T> {
  const links: Link[] = [
    { rel: "self", href: `/${self}`, method: "GET" },
    ...REPORTS.filter((report) => report.rel !== self).map((report) => ({
      rel: report.rel,
      href: report.href,
      method: "GET",
    })),
  ];
  return { ...payload, links };
}

export function linkTrialBalance<T extends object>(payload: T): Linked<T> {
  return linkReport("trial-balance", payload);
}

export function linkBalanceSheet<T extends object>(payload: T): Linked<T> {
  return linkReport("balance-sheet", payload);
}

export function linkIncomeStatement<T extends object>(payload: T): Linked<T> {
  return linkReport("income-statement", payload);
}
