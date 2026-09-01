# Production readiness and financial trust gate

## Implemented controls

- Secure password verification with no universal credential bypass
- Server-selected registration role and atomic tenant provisioning
- Short-lived signed JWTs in HttpOnly production cookies
- Persistent login throttling and token revocation
- Exact RBAC permissions and tenant membership checks
- Origin validation, API security headers, body limits, and production web CSP/HSTS
- Required production configuration and prohibited production memory fallback
- Mutation idempotency records, financial writes, and response outcomes in one ACID transaction, with reload-safe browser retry keys and response replay
- Transactional invoice, received-payment, expense, bill, and manual-journal posting
- Tenant-owned, active, and unlocked account validation with period-lock enforcement
- Database uniqueness, amount checks, journal-line checks, foreign keys, and an append-only audit trigger
- Server-authoritative financial hydration with no local financial persistence fallback
- Exact integer-cent conversion at the PostgreSQL/API boundary with rejection of sub-cent and unsafe-range values
- Posted-ledger dashboard totals and a bounded catalog of server-generated reports
- Independent invoice-output and bill-input tax control reconciliation
- Exact reconciliation of every cached account balance to the posted general ledger
- Linked, audited, duplicate-safe reversals for invoices, payments received, expenses, bills, and manual journals
- Versioned schema baseline (`2026.08.31-v7-expense-receipts`) enforced by migration checks
- V1 currency allowlist restricted to two-decimal AED, AUD, CAD, EUR, GBP, INR, SGD, and USD ledgers
- Fail-closed gates for workflows that have not completed financial certification
- Two-key optional-feature promotion: source-controlled certification plus deployment configuration
- Liveness/readiness endpoints and transactional schema migration under an advisory lock

## Mandatory deployment controls

These are operational requirements, not optional code enhancements:

1. Use managed PostgreSQL with encryption, point-in-time recovery, multi-zone availability, and automated backups.
2. Perform scheduled restore drills into an isolated environment and record recovery time and recovery point results.
3. Ship structured application and database logs to centralized, access-controlled storage with alerts for 5xx rates, failed postings, reconciliation differences, authentication abuse, and database saturation.
4. Store secrets in a managed secret store and rotate them. Do not put production secrets in `.env` files or source control.
5. Apply least-privilege database roles. The runtime role should not own the database; mature deployments should use a separate controlled migration role.
6. Run the full suite, build, dependency audit, migration rehearsal, and accounting reconciliation checks against a PostgreSQL staging database before release.
7. Use rolling or canary deployment with a tested rollback procedure. Database changes must remain backward-compatible during rollout.
8. Complete an independent security review and accountant-led validation of posting, tax, rounding, close/reopen, and statutory behavior for each supported jurisdiction.
9. Define retention, privacy, incident-response, business-continuity, and access-review policies appropriate to the customer and jurisdiction.

## Feature certification checklist

Keep a workflow gated until all items pass:

- validated request schema and currency/date rules
- exact permission and separation-of-duties decision
- tenant references resolved inside the authenticated organization
- one ACID transaction for document, allocations, journal, and audit event
- deterministic balanced posting and authoritative server totals
- unique source/reference constraints and retry tests
- reversal/void behavior with immutable history
- period/account lock tests
- concurrency and double-submit tests on real PostgreSQL
- subledger-to-GL reconciliation and report tests
- monitoring signals and operator runbook

For the authoritative status of all domain workflows and feature flags, see the [Capability Matrix](file:///c:/Users/HI/Desktop/APP/finance%20app/docs/CAPABILITY_MATRIX.md). Active feature flags require explicit environment configuration in production (`ENABLE_VENDOR_SETTLEMENTS`, `ENABLE_EXPENSE_RECEIPTS`, `ENABLE_APPROVALS`, `ENABLE_QUOTATIONS`, `ENABLE_CREDIT_NOTES`, `ENABLE_BANKING`). Prototype and untested paths remain strictly disabled.

## Certified application scope

The current trusted write scope is tenant registration/provisioning, chart-of-account creation outside reserved controls, invoices, payments received, expenses, bills, manual journals, their certified source-document reversals, and period locks. Each enabled financial write uses the server posting boundary and authoritative reload behavior.

The current trusted reporting scope is the posted-ledger dashboard, profit and loss, balance sheet, trial balance, general ledger, current AR aging/reconciliation, and current AP aging/reconciliation. Historical AR/AP reconstruction, cash-flow classification, tax filing reports, forecasts, comparative analytics, and accountant summaries are not certified and must not be marketed as available.

## Release evidence versus launch approval

Passing repository lint, unit/integration, browser E2E, build, and dependency audit is necessary but is not production launch approval. Before accepting live financial data, evidence every mandatory deployment control above in a real PostgreSQL staging environment. The launch decision must include recovery-drill results, concurrency/failover evidence, an independent security assessment, and accountant sign-off for every supported country, currency, and tax regime.

## V1 local release evidence (2026-08-12)

- TypeScript/type-check gate: passed, 0 errors
- Combined unit and integration suite: 40/40 test files and 441/441 tests passed, 0 failed, 0 skipped
- Playwright desktop/mobile E2E suite: 4/4 passed, 0 failed, 0 skipped
- Production client/server build: passed
- Complete and production-only npm audits at `high` severity: 0 vulnerabilities
- `git diff --check`: no whitespace errors (Windows line-ending conversion notices only)

This machine has no `DATABASE_URL`, PostgreSQL CLI, or Docker runtime. Therefore, this evidence uses pg-mem for database tests and does not include the mandatory real-PostgreSQL migration, isolation/concurrency, failover, backup/restore, or recovery rehearsal. The launch gate still requires the real-PostgreSQL staging evidence listed above; pg-mem results cannot replace it.
