# FirmBooks

FirmBooks is a multi-organization accounting application built with React, Express, and PostgreSQL. PostgreSQL and the posted general ledger are authoritative; the browser does not persist or independently mutate financial records.

## Reliability model

- Every enabled financial write is tenant-scoped, authenticated, permission-checked, and retry-safe. The idempotency outcome and financial mutation commit in the same PostgreSQL transaction.
- Invoice, payment-received, expense, bill, and manual-journal posting commit the source document, balanced journal, account cache, and audit event in one database transaction.
- Journal lines contain exactly one positive debit or credit, and every entry balances to the cent.
- Posted documents are immutable. Certified corrections for invoices, payments received, expenses, bills, and manual journals use linked audited reversal journals.
- Period and account locks are enforced by the server posting engine.
- PostgreSQL decimals cross the API boundary through exact integer cents; unsafe-range and sub-cent values fail closed.
- Dashboard totals come from posted journals. Certified reports are server-generated profit and loss, balance sheet, trial balance, general ledger, AR aging/reconciliation, and AP aging/reconciliation.
- Tax integrity reconciles invoice output tax to control account `2200` and bill input tax to control account `1200` independently. The integrity suite also verifies every account balance cache against the posted ledger.
- V1 base currencies are `AED`, `AUD`, `CAD`, `EUR`, `GBP`, `INR`, `SGD`, and `USD`; they all use two decimal minor units, matching the v1 ledger schema.
- Production cannot use the in-memory database or demo seed identities.
- Uncertified workflows fail closed instead of simulating financial success in the browser.

No software can honestly promise "100%" reliability by code alone. This repository defines and tests a bounded trusted core. Production trust also depends on managed PostgreSQL, tested backups/restores, monitoring, access controls, deployment discipline, and independent accounting/security review. See [Production readiness](docs/PRODUCTION_READINESS.md).

## Local setup

Requirements: Node.js 22+, npm, and PostgreSQL 15+.

1. Copy `.env.example` to `.env` and replace all placeholder credentials.
2. Create the PostgreSQL database referenced by `DATABASE_URL`.
3. Install exact dependencies with `npm ci`.
4. Start the application with `npm run dev`.

The server applies its versioned, idempotent schema migration set in one transaction under a PostgreSQL advisory lock. Readiness fails if schema version `2026.08.12-v1` is absent. It never seeds demo identities automatically. Registration provisions a tenant and its control accounts atomically.

## Verification

Run these before every release:

```text
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
```

Health endpoints:

- `GET /api/healthz` — process liveness
- `GET /api/readyz` — database readiness and migration state

## Production configuration

Production startup fails unless `DATABASE_URL` is present and `JWT_SECRET` contains at least 32 characters. Deploy behind TLS, set `TRUST_PROXY=true` only behind a trusted reverse proxy, configure `ALLOWED_ORIGINS`, and enable PostgreSQL TLS when required.

Optional financial features use a two-key release gate: a feature must first be added to the source-controlled certification allowlist and then named in `TRUSTED_FINANCE_FEATURES`. This build's allowlist is intentionally empty, so configuration alone cannot expose prototype financial code.

The authentication cookie is HttpOnly, Secure in production, SameSite=Strict, and short-lived. Financial mutation clients must send a unique `Idempotency-Key`.

## Main code areas

- `server/src/accounting/postingEngine.ts` — central double-entry posting boundary
- `server/src/controllers/financeController.ts` — transactional financial use cases
- `server/src/middleware/organizationIsolation.middleware.ts` — authentication, tenant isolation, and permissions
- `server/src/middleware/idempotency.middleware.ts` — mutation replay protection
- `server/src/database/migrationRunner.ts` — transactional schema constraints and indexes
- `server/src/services/AccountingIntegrityService.ts` — journal, subledger, bank, and tax control checks
- `src/context/BooksContext.tsx` — UI compatibility facade over server-authoritative data

Architecture details are in [DESIGN.md](DESIGN.md), and accounting rules are in [docs/ACCOUNTING_ENGINE.md](docs/ACCOUNTING_ENGINE.md).

NAS release branching, environment setup, health checks, and rollback guidance are in [docs/NAS_DEPLOYMENT.md](docs/NAS_DEPLOYMENT.md).
