# FirmBooks architecture baseline

Source baseline: `b6f5cfb` (2026-09-07). Internal context for future tasks; describes inspected code, not verified production behavior. Static repository review only: no application, migrations, or tests were executed. Recheck affected paths when the checkout changes. Historical audit documents and README claims may lag implementation.

## System overview

Single TypeScript application: React 19 SPA, Express 4 API, PostgreSQL through `pg` and handwritten SQL; no ORM. `server.ts` initializes the database before listening, serves Vite middleware in development and built SPA assets in production. `server/src/index.ts` composes API middleware, routes, migrations, and the email worker.

```text
React workspace -> BooksContext / domain API client -> Express route
  -> auth + organization + recovery lock + idempotency + permission/feature checks
  -> controller / domain service -> database transaction
  -> source documents + posting engine -> journals + lines + balance caches
  -> ledger reports / document statements -> API -> UI
```

PostgreSQL is required in production; development/tests can use `pg-mem`. Deployment uses Node 22 Docker images, PostgreSQL 16, NAS Compose configurations, GitHub Actions, and a separate database backup process.

## Module boundaries and key directories

| Boundary | Location | Responsibility / dependency |
|---|---|---|
| UI shell | `src/main.tsx`, `src/App.tsx`, `src/components/` | Auth gate, manual hash routing, lazy domain workspaces, capability guards. |
| Client state and requests | `src/context/`, `src/services/`, `src/hooks/` | BooksContext batches finance reads and reloads after mutations; newer screens also call domain APIs directly. Browser accounting helpers are previews, not posting authority. |
| HTTP boundary | `server/src/index.ts`, `routes/`, `middleware/`, `controllers/` under `server/src/` | Routing, validation, request security, access checks, response shaping. Some controllers also own business transactions. |
| Commercial domains | `server/src/sales/`, `purchases/` | Quotations, invoices, purchases, settlements and corrections; depend on accounting, approvals and database. |
| Accounting and reports | `server/src/accounting/`, `services/` | Posting, reversals, periods, expense/manual journals, assets, reports, integrity checks. |
| Identity and governance | `server/src/auth/`, `access/`, `approvals/`, `security/` | Sessions/MFA, memberships, permissions, approval requests, audit/security events. |
| Operational domains | `server/src/banking/`, `recurring/`, `recovery/` | Statement imports/matching, scheduled occurrence processing, encrypted tenant recovery. |
| Persistence | `server/src/database/` | SQL pool, ambient transactions, schema creation/upgrades and constraints. |
| Verification and operations | `server/src/tests/`, frontend `*.test.*`, `e2e/`, `scripts/`, `deploy/nas/`, `.github/workflows/` | Vitest, Playwright, build/deploy/backup tooling. |

These are logical boundaries within one process, not independently deployed services. Older compatibility paths coexist with newer modules; service existence does not prove a mounted route or usable UI.

## Core database entities

| Area | Principal tables and relationships |
|---|---|
| Tenant and identity | `organizations` -> `organization_profiles`, `organization_members`; memberships connect `users` to organizations/roles. `roles`, `permissions`, `role_permissions`; parallel `user_identities`, `auth_sessions`, `mfa_credentials`, `revoked_tokens`. |
| Master data | Tenant-owned `accounts`, `accounting_defaults`, `customers`, legacy `clients`, `vendors`, `items`, `projects`; projects have `time_entries`. Defaults map accounting roles to accounts. |
| Sales | `estimates`, `quotation_revisions`, `quotation_templates`, legacy `estimate_revisions`, `sales_orders`, `delivery_challans`, `invoices` -> `invoice_items`. Commercial snapshots preserve document details. |
| Receivables | `payments_received` -> `payment_received_allocations` -> invoices; `customer_advances`, `customer_advance_applications`, `credit_notes`, `credit_note_applications`, `customer_refunds`, `ar_write_offs`. |
| Payables | `purchase_orders`, `goods_service_receipts`, `bills`; `payments_made` -> `payment_made_allocations` -> bills; `vendor_advances`, `vendor_advance_applications`, `vendor_credits`, `debit_note_applications`, `ap_write_offs`. |
| Ledger | `journal_entries` -> `journal_lines` -> `accounts`; lines may reference project/customer/vendor dimensions. Source documents link to journals; original/reversal journal links and `financial_reversals` preserve correction evidence. |
| Controls | `approval_rules`, `approval_requests`, `period_locks`, `audit_logs`, `security_events`; fixed-asset and period-close tables/events hold lifecycle evidence. |
| Banking | `bank_accounts` link to GL accounts; imports -> `bank_statement_transactions` -> `bank_reconciliation_matches`; reconciliation sessions/rules store workflow state. |
| Operations | `recurring_transaction_profiles` -> `recurring_transaction_occurrences`; `outbox_emails`; recovery artifacts/jobs/staging rows and `tenant_recovery_locks`. |

Actual DDL lives in `database/migrationRunner.ts` plus `point1Schema.ts`, `identitySchema.ts`, and `enterpriseHardeningSchema.ts`. Root `schema.sql` is retired. Startup runs accumulated idempotent DDL and records a schema version; it is not a conventional sequence of independently applied migration files. Current version: `2026.08.31-v7-expense-receipts`.

## Critical services

- `SalesEngine`, `QuotationEngine`, `PurchasesEngine`: commercial validation, snapshots, document creation/conversion and settlements. `FinanceController.createBill` is a separate direct posting implementation.
- `ServerPostingEngine` (`accounting/postingEngine.ts`): validates and writes posted entries/lines, updates account balances. `ManualJournalService` and `ExpensePostingService` provide domain-specific validation and orchestration.
- `FinancialDestructiveActionsService`: linked reversing entries and source/settlement corrections. `OrganizationProvisioningService`: chart/default-account setup.
- `ApprovalWorkflowService`: rules, submission, decisions and consumption. `PeriodCloseService`, `AccountingPeriodService`, `FixedAssetService`: close/locks and asset lifecycle.
- `LedgerQueryService`, financial report services, `AccountingIntegrityService`: ledger queries, statements and consistency diagnostics.
- `RbacService`, `SessionService`, `MfaService`, `MembershipLifecycleService`: identity/access lifecycle. `AuditTrailService` records audit evidence.
- `BankReconciliationService`, matching engine and parsers: imported bank evidence and reconciliation. `RecurringTransactionService` creates documents through domain services.
- `RecoveryArtifactService`, `TenantRecoveryLockService`: encrypted snapshots, staging/validation/promotion and mutation exclusion. `EmailOutboxService`: persisted email delivery/retries.

## Important endpoints

Paths below are relative to `/api/v1`, except health probes. Router files define exact methods, payloads and guards.

| Surface | Representative endpoints |
|---|---|
| Health | `GET /api/healthz`, `GET /api/readyz` (database/schema readiness). |
| Identity/access | `/auth/*`, `/identity/*`, `/organizations/*`, `/access/*`, `/security/*`. |
| Master data | `/finance/accounts`, `/finance/accounting-defaults`, `/finance/customers`, `/finance/vendors`, `/finance/projects`, `/items`. |
| Commercial | `/quotations/*`, `/finance/invoices`, `/finance/bills`, `/finance/expenses`, `/finance/payments-received`, `/finance/vendor-payments`. |
| Posting/correction | `/finance/journals`; document-specific `/:id/post-approved` and `/:id/reverse` routes; advances, credits and write-offs under `/finance`. |
| Reports | `GET /finance/reports/{general-ledger,trial-balance,profit-loss,balance-sheet,ar-aging,ap-aging}`; `/finance/integrity`. |
| Operations | `/banking/*`, `POST /recurring/run`, `/recovery/*`, `GET /search`, `GET /dashboard-summary`. |
| Public quotation | `GET /public/quotation/:token`, `POST /public/quotation/:token/respond`; token-based, rate-limited public access. |

Finance routes also have backward-compatible `/api/v1` aliases. Optional features require both source certification and `TRUSTED_FINANCE_FEATURES`; production enables none by default. A route's presence is not evidence that its feature is enabled.

## Accounting source-of-truth rules and flows

1. **Posted `journal_entries` + `journal_lines` are financial statement authority.** `accounts.balance` and bank/customer/vendor balances are maintained caches or operational summaries, not substitutes for ledger queries.
2. **Source documents and allocations are subledger/workflow authority.** Their outstanding amounts, payment links, snapshots and approval states must agree with posted control accounts; they serve a different purpose from ledger balances.
3. **The server owns financial calculations and posting.** React state, local storage, dashboard totals and browser calculation helpers are not durable accounting truth.
4. **Default account mappings and account metadata guide posting.** Some reporting/legacy paths still use fixed control codes, notably AR `1100`, AP `2000`, input tax `1200`, output tax `2200`.
5. **Caller transactions coordinate source + journal + allocations + audit.** The posting engine can join an existing transaction; it does not independently guarantee every caller's audit or lifecycle behavior.

Typical flows:

- Invoice: UI -> invoice API -> SalesEngine recalculation/validation -> invoice/items -> Dr AR, Cr revenue/output tax (plus rounding) -> ledger reports and receivables.
- Customer receipt: payment API -> approval or locked allocation validation -> payment/allocations -> Dr bank, Cr AR and/or customer advance -> updated invoice balances and statements.
- Bill/expense: API -> controller or domain service -> source record -> Dr expense/input tax, Cr AP or payment account -> P&L, balance sheet and payables.
- Correction: domain reverse action -> lock/validate source and dependencies -> opposite journal with linked evidence -> adjust source/allocation state -> reports include original plus reversal.
- Bank import: parser -> deduplicated statement rows -> matching evidence -> reconciliation. Import/matching alone is not a new accounting posting.

## Document lifecycle/state model

There is no universal status enum; casing and transitions differ by entity. Frontend normalization can hide those differences.

| Entity | Lifecycle semantics |
|---|---|
| Invoice | Draft or approval submission -> posting -> partial/full settlement; void/reversal paths adjust source state. Approval rules may cause submission even when draft was requested. |
| Approval request | `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CONSUMED`; approval is not posting. Dedicated posting actions lock and consume approved requests with the financial transaction. |
| Bill/payment | Bills carry operational payment statuses such as `Unpaid`; settlement paths update balances/status. Approval-aware services persist submitted documents before posting. |
| Journal | Draft/submitted workflows precede `Posted`. Reversal creates another posted journal and links both; the original remains in ledger history. |
| Quotation/order | Stored revisions, customer response and conversion state; conversions validate snapshots and duplicate/remaining quantities. |
| Recurring occurrence | Claim/lease -> attempt -> success or retry/quarantine; unique organization/occurrence identity prevents duplicate generation. |
| Period/recovery | Close records checks/evidence and locks dates; reopen records reason/unlocks. Recovery stages and validates before promotion under a tenant mutation lock. |

### Stage 2 Document Lifecycles, Lineage, and Everyday Workflows

Stage 2 completes the bidirectional sales and purchasing lifecycles, ensuring document lineage, state transition guards, partial fulfillment/billing/settlements, and Indian accounting subledger integrity.

#### 1. Sales Journey (`Quotation -> Sales Order -> Delivery -> Invoice -> Payment`)
- **Quotation (`estimates`):**
  - States: `DRAFT`, `SENT`, `ACCEPTED`, `DECLINED`, `CONVERTED`.
  - Lineage: Converting quotation to sales order records `estimateId` on `sales_orders` and marks quotation as `CONVERTED`.
  - Guardrails: Quotations cancelled via `cancelQuotation` transition to `DECLINED`; attempting to convert a `DECLINED` quotation is rejected.
- **Sales Order (`sales_orders`):**
  - States: `DRAFT`, `CONFIRMED`, `PARTIALLY_FULFILLED`, `FULFILLED`, `PARTIALLY_INVOICED`, `INVOICED`, `CANCELLED`.
  - Guardrails: Sales orders with active deliveries (`fulfilled_amount > 0`) or active invoices (`invoiced_amount > 0`) cannot be cancelled until linked documents are voided/cancelled. Untouched sales orders cancel cleanly to `CANCELLED`. Cancelled sales orders cannot be fulfilled or converted.
- **Delivery Challan (`delivery_challans`):**
  - Fulfillment: `fulfillSalesOrder` supports partial and complete fulfillments, updating `sales_orders.fulfilled_amount` and transitioning status. Over-fulfillment beyond the sales order total is rejected.
- **Sales Invoice (`invoices`):**
  - Invoicing: `convertSalesOrderToInvoice` supports partial billing with scaled line items. Updates `sales_orders.invoiced_amount` and marks status `PARTIALLY_INVOICED` or `INVOICED`. Billing beyond the remaining uninvoiced balance is rejected. Invoices retain `salesOrderId`.
- **Customer Settlements & Advances:**
  - Customer Payments: `recordCustomerPayment` / `recordPayment` allocate funds to invoices using deterministic row locks.
  - Customer Advances (`customer_advances`): Unallocated receipts record a liability (Account `2100`). `applyCustomerAdvance` draws down the liability and reduces invoice `balance_due`. `reverseCustomerAdvanceApplication` restores both advance and invoice balances with linked reversing journals.
  - Credit Notes (`credit_notes`): Supports partial application (`applyCreditNote`), direct refunds via bank transfer (`recordCustomerRefund`), and bad debt write-offs (`recordWriteOff`, debiting `6000` Bad Debt Expense and crediting `1100` AR). All operations maintain balanced zero-discrepancy GL journals.

#### 2. Purchasing Journey (`Purchase Order -> Goods Receipt -> Bill -> Vendor Payment`)
- **Purchase Order (`purchase_orders`):**
  - States: `DRAFT`, `APPROVED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `PARTIALLY_BILLED`, `BILLED`, `CANCELLED`.
  - Guardrails: Approval workflow gates fulfillment and billing. Orders with active bills cannot be cancelled.
- **Goods Receipt (`goods_service_receipts`):**
  - Records receipt of materials with PO link (`purchaseOrderId`), updating PO status.
- **Vendor Bill (`bills`):**
  - Partial Billing: `convertPurchaseOrderToBill` supports partial conversion with unique document sequencing (`INV-{poNumber}-{count+1}`). Over-billing beyond PO amount is rejected.
- **Vendor Payments & Advances (`payments_made`, `vendor_advances`):**
  - Multi-bill payment allocations settle AP (Account `2000`). Unallocated payment amounts are held as vendor advance assets (Account `1150`). Vendor advances can be drawn down against bills or reversed atomically.
- **Debit Notes & AP Write-Offs:**
  - Settle payables or capture purchase discounts/variances, updating bill balances and vendor subledgers.

## Authentication, RBAC and tenant isolation

Authentication accepts a cookie before a bearer token. JWT access tokens use HS256, issuer/audience checks and a 15-minute expiry; active user/revocation checks apply. Opaque hashed sessions coexist with JWTs. Passwords use bcrypt; MFA supports TOTP and recovery codes. Session, cookie and JWT lifetimes differ; do not assume one unified refresh/revocation model.

RBAC resolves active organization membership to system-role templates or database-backed custom permissions. Roles include Owner, Admin, Finance Manager, Accountant, Sales, Purchase, Viewer and Approver. `requirePermission([a,b])` means **either permission**, not both. Legacy permission mappings coexist with granular permissions; custom-role results are cached. Approval decision roles, self-approval rules, owner protections and feature gates are additional controls. Separation-of-duties metadata is not proof of universal enforcement.

Tenant identity comes from the requested organization header/query/body, or a default active membership, then is validated against membership. Middleware populates request auth and AsyncLocalStorage organization context. Business SQL must scope records to that organization; posting also checks related accounts/dimensions. Selected composite foreign keys strengthen allocation isolation.

`db.transaction` sets transaction-local `app.current_org_id`; nested transactions use savepoints. PostgreSQL RLS covers only selected tables, is not forced, and policies allow access when the setting is absent. It is supplementary: isolation still depends on application predicates and transaction context. Recovery blocks ordinary tenant mutations while restoring. Frontend organization switching clears financial state and rejects stale responses; it is not an authorization boundary.

## Reporting and supporting operations

P&L, balance sheet, trial balance and general ledger aggregate posted lines. Balance sheet incorporates cumulative earnings. P&L has limited project filtering; ledger/TB reject unsupported dimensions rather than providing universal analytics.

AR/AP aging/reconciliation uses current document outstanding balances filtered by document date and compares them with ledger controls. It does **not** reconstruct historical settlements for an arbitrary past date. Customer/vendor statements use document/payment/correction sequences. Dashboard and project summaries mix operational sources with ledger aggregates; GST summaries are not a statutory filing integration. Cash flow, forecasting and budget reporting have separate gates and are not in the six-report authoritative catalog.

Search is permission-filtered, tenant-scoped SQL, not an external search index. Expense receipts are validated small images stored as base64 in PostgreSQL; PDFs render on demand. The email outbox has an in-process retry timer. Recurring execution is exposed by `/recurring/run`; no automatic recurring scheduler was established in this review. Recovery artifacts are encrypted database records, distinct from NAS `pg_dump` backups.

## Critical invariants

These are central-engine checks or cross-module consistency contracts; alternate paths require separate verification.

- Posted journals have at least two valid lines, positive exactly balanced debit/credit totals using integer cents, and only one positive side per line.
- Posting validates real dates, period locks, tenant ownership and usable accounts/dimensions; organization/entry numbers are unique.
- Settlement allocations cannot exceed available document/payment balances or cross customer/vendor/tenant boundaries; core flows use row locks.
- Financial mutation retries must not create duplicate effects. Production middleware requires an idempotency key and binds stored responses to organization and request content.
- Approved documents must be consumed once; reversals must preserve linked history and reconcile source balances with ledger effects.
- Audit history is intended to be append-only; PostgreSQL triggers reject audit row updates/deletes. Audit coverage is a caller responsibility.
- Bank evidence, source balances and cached balances must reconcile with posted ledger data; they do not override it.

## Known architectural risks and verification limits

- **Multiple mutation implementations:** direct bill posting, legacy journal/banking helpers, disabled UI facade methods and newer domain APIs coexist. Central posting/approval guarantees are not proven universal; invoice editing catches a reversal error and continues its path.
- **Partial database isolation:** missing RLS context is permissive, coverage is incomplete and ordinary pool queries need not carry a transaction-local tenant setting.
- **Identity/control overlap:** users versus identities, JWT versus opaque sessions, invitation flows, approval coverage and period-close implementations are not fully unified.
- **Accounting/report semantics:** current aging is not historical aging; fixed control codes and account mappings coexist; report dimensions are limited. Period close does not post an earnings-transfer journal.
- **Audit/recovery/jobs:** audit-chain coverage/concurrency, full restore parity, unattended recurring scheduling and crash recovery for workers remain unverified.
- **Runtime confidence:** `pg-mem` omits PostgreSQL trigger/RLS/locking behavior. Vitest service/API/property tests and Playwright browser tests are separate; normal CI does not run the full browser suite. Test names alone do not prove PostgreSQL coverage.
- **Configuration/documentation drift:** certification plus environment controls availability; historical docs may disagree. Native binary XLSX bank parsing and actual production configuration/health were not established.

No P0 conclusion was established in the static review. This baseline records boundaries and uncertainty; it is not a fix plan or production certification.
