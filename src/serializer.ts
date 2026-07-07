import type { Account, AmountRecord, Entry } from "pluts";

/**
 * Durable Object RPC methods return the native Pluts objects, which are not JSON-serializable.
 * This module provides a set of serialization functions to convert them into JSON-friendly objects for the HTTP API.
 */

export interface SerializableAccount {
  id: string;
  name: string;
  type: string;
  contra: boolean;
  createdAt: string;
  balance?: string;
}

export interface SerializableAmountLine {
  id: string;
  kind: "debit" | "credit";
  account: SerializableAccount;
  amount: string;
  entryId: string;
}

export interface SerializableEntry {
  id: string;
  description: string;
  date: string;
  debitAmounts: SerializableAmountLine[];
  creditAmounts: SerializableAmountLine[];
  postedAt: string;
}

export function serializeAccount(account: Account): SerializableAccount {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    contra: account.contra,
    createdAt: account.createdAt,
  };
}

export function serializeAmountLine(
  amountLine: AmountRecord,
): SerializableAmountLine {
  return {
    id: amountLine.id,
    kind: amountLine.kind,
    account: serializeAccount(amountLine.account),
    amount: amountLine.amount.toMajor(),
    entryId: amountLine.entryId,
  };
}

export function serializeEntry(entry: Entry): SerializableEntry {
  return {
    id: entry.id,
    description: entry.description,
    date: entry.date,
    debitAmounts: entry.debitAmounts.map((amountLine) =>
      serializeAmountLine(amountLine),
    ),
    creditAmounts: entry.creditAmounts.map((amountLine) =>
      serializeAmountLine(amountLine),
    ),
    postedAt: entry.postedAt,
  };
}
