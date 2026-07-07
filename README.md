# Pluts Ledger Durable Object

This is a simple demo implementation of a Cloudflare Worker using the [pluts](https://github.com/adamburmister/pluts) package.

It exposes a single-tenant JSON API for a double-entry accounting ledger via a Cloudflare Worker and Durable Object.

The Durable Object owns its embedded SQLite database (making it easy to extend this demo to be multi-tenant), runs the ledger schema migration on startup, and serializes writes through a named instance.

## Features

- Double-entry bookkeeping with Asset, Liability, Equity, Revenue, and Expense accounts
- Balanced journal entries with exact minor-unit amount storage
- Methods for account lookups and views, account-ledger history, balance sheets, income statements
- Durable Object SQLite persistence, with no separate D1 database required
- Idempotent entry posting through optional `idempotencyKey` values
- Demo seed data for a small retail business
- Simple JSON REST surface for local development and deployment on Cloudflare Workers

## Architecture

The outer Worker forwards every request to a Durable Object instance:

```text
HTTP request -> Worker -> PlutsLedgerDO("ledgerId") -> DO SQLite storage
```

`PlutsLedgerDO` calls `migrate(ctx.storage.sql)` during construction, so each Durable Object instance provisions its own schema before serving requests. The Worker currently uses one shared instance, which means the deployed service represents one isolated ledger.

## API

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/accounts` | Create an account |
| `GET`  | `/accounts` | List accounts with balances |
| `GET`  | `/accounts/:id` | Get an account by id |
| `GET`  | `/accounts/:id/balance` | Get the balance for an account |
| `GET`  | `/accounts/:id/entries` | Get journal entries that affected an account |
| `GET`  | `/accounts/:id/amounts` | Get debit/credit line items for an account |
| `POST` | `/entries` | Post a balanced journal entry |
| `GET`  | `/entries` | List entries, newest first |
| `GET`  | `/entries/:id` | Get an entry by id |
| `GET`  | `/trial-balance` | Return the current trial balance |
| `GET`  | `/balance-sheet` | Return the current balance sheet summary |
| `GET`  | `/income-statement` | Return the current income statement summary |
| `POST` | `/seed` | Seed the Harbor Goods demo ledger |
| `POST` | `/clear` | Clear all ledger data (reset) |

Validation errors return `400` with `{ "error": "...", "issues": [...] }`.

### Durable Object RPC methods

The Durable Object also exposes RPC methods for the same capabilities, which is useful when calling it directly from Worker code or tests:

- `createAccount(input)`
- `listAccounts()`
- `getAccount(id)`
- `getAccountBalance(id)`
- `getAccountEntries(id)`
- `getAccountAmounts(id)`
- `postEntry(input)`
- `listEntries()`
- `getEntry(id)`
- `getTrialBalance()`
- `getBalanceSheet()`
- `getIncomeStatement()`
- `seedLedger()`
- `clearLedger()`

## Getting Started

Install dependencies:

```sh
npm install
```

Start the local Worker:

```sh
npm run dev
```

Wrangler prints the local URL, usually `http://localhost:8787`.

Seed the demo ledger:

```sh
curl -X POST http://localhost:8787/seed
```

Check that debits and credits balance:

```sh
curl http://localhost:8787/trial-balance
```

A balanced ledger returns:

```json
{ "balance": "0.00" }
```

## Example Requests

Create accounts:

```sh
curl -X POST http://localhost:8787/accounts \
  -H "content-type: application/json" \
  -d '{"name":"Cash","type":"Asset"}'

curl -X POST http://localhost:8787/accounts \
  -H "content-type: application/json" \
  -d '{"name":"Sales Revenue","type":"Revenue"}'
```

Post a balanced entry:

```sh
curl -X POST http://localhost:8787/entries \
  -H "content-type: application/json" \
  -d '{
    "idempotencyKey": "sale-001",
    "description": "Sold goods for cash",
    "date": "2026-07-06",
    "debits": [{ "accountName": "Cash", "amount": "125.00" }],
    "credits": [{ "accountName": "Sales Revenue", "amount": "125.00" }]
  }'
```

List accounts and balances:

```sh
curl http://localhost:8787/accounts
```

List entries:

```sh
curl http://localhost:8787/entries
```

## Request Shapes

Account creation:

```json
{
  "name": "Cash",
  "type": "Asset",
  "contra": false
}
```

Valid account types are `Asset`, `Liability`, `Equity`, `Revenue`, and `Expense`. `contra` is optional and defaults to `false`.

Journal entry posting:

```json
{
  "idempotencyKey": "unique-entry-key",
  "description": "Entry description",
  "date": "2026-07-06",
  "debits": [{ "accountName": "Cash", "amount": "10.00" }],
  "credits": [{ "accountName": "Sales Revenue", "amount": "10.00" }]
}
```

`idempotencyKey` and `date` are optional. Amounts may be numbers or decimal strings. Every entry must include at least one debit, at least one credit, and equal debit and credit totals.

## Development

Useful scripts:

```sh
npm run dev       # Start Wrangler dev server
npm run deploy    # Deploy to Cloudflare
npm run typecheck # Run TypeScript without emitting files
npm run cf-typegen # Regenerate Worker binding types
```

Regenerate Worker types after changing Durable Object bindings or other Wrangler configuration:

```sh
npm run cf-typegen
```

## Deployment

Deploy with Wrangler:

```sh
npm run deploy
```

The deployed Worker name and Durable Object binding are configured in `wrangler.jsonc`.

## Project Layout

```text
src/index.ts     Worker entrypoint and Durable Object implementation
src/seed.ts      Harbor Goods demo data
wrangler.jsonc   Cloudflare Worker and Durable Object configuration
package.json     npm scripts and dependencies
```
