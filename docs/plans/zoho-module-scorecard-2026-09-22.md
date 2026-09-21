# FirmBooks vs Zoho Books India: Point-by-Point Module Scorecard

Date: 2026-09-22  
Evidence base: current `main` worktree at `20635ea`, source inspection, capability gates, route ownership, test inventory, architecture documents, and the 2026-09-21 QA report.  
Status: static audit in progress. Scores are diagnostic, not production certification.

## Scoring and evidence rules

- **8-10:** coherent, server-backed workflow with strong accounting/security/test evidence; remaining work is polish, production qualification, or breadth.
- **5-7:** useful implementation exists but has material UX, ownership, evidence, deployment, or edge-case gaps.
- **2-4:** partial/prototype/supporting primitives; not competitive as a complete workflow.
- **0-1:** absent or explicitly out of scope.
- **Core:** source-enabled in production. **Certified optional:** code-reviewed but deployment-gated. **Partial:** code exists without a complete or consistently exposed contract. **Absent:** no product workflow.

Every future “done” claim must identify the commit, configuration, database mode, command, browser evidence, and target deployment. A route, component, test name, or service alone does not prove a product capability.

## 1. Dashboard, navigation, and global work

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Role-aware dashboard | Partial/in flight | 6 | Server-backed summary, permissions, attention data, ledger widgets, mobile tests, and recent browser QA exist. `DashboardView.tsx` remains very large and is currently modified; prior audits found hierarchy, repeated cash, period-label, and misleading-health risks. | Finish the action-first hierarchy; split shell/widgets/query state; make every figure disclose basis, period, freshness, and drill-down destination. |
| Global navigation | Core | 7 | Desktop/mobile module groups and capability-aware visibility exist. Several real routes (`estimates`, `sales_orders`, `purchase_orders`, `delivery_challans`, `salespersons`, security) are not first-class sidebar entries and depend on overview/indirect navigation. | Add one route registry shared by desktop, mobile, search, breadcrumbs, permissions, and deep links; eliminate duplicated nav arrays. |
| Global search | Core | 6 | Tenant- and permission-filtered server search exists and is being edited. Search is not yet the universal command/navigation layer. | Add typed results, keyboard command palette, recent actions, safe entity previews, and direct deep links with preserved return context. |
| Quick create | Core/partial | 6 | Multiple create paths exist and are tested, but availability and post-save behavior vary by module. | Use one capability/permission registry, consistent drafts, validation summary, pending state, success receipt, and committed-but-refresh-failed recovery. |
| Cross-module continuity | Partial | 5 | `App.tsx` uses hash/query state and some entity deep linking; filters and return context are inconsistent. | Introduce typed URL routes and a common workspace navigation contract that preserves filter, period, selected record, and origin. |

## 2. Organization, identity, security, and access

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Registration and organization provisioning | Core | 8 | Atomic tenant/control-account provisioning, supported base currencies, auth safety tests, and organization switching exist. | Add an explicit onboarding checklist and migration path; measure time to first posted invoice and first reconciled bank statement. |
| Login, refresh, logout, password recovery | Core/partial | 7 | JWT/cookie/session controls, rate limits, and expiry checks exist. Password recovery intentionally fails closed until verified email delivery is configured. | Complete email-backed one-time recovery; unify JWT and opaque-session lifecycle; expose clear device/session consequences. |
| MFA and recovery codes | Core | 8 | TOTP/recovery workflows and security tests exist. | Add enforce-by-role/org policy, trusted-device rules if desired, recovery-code rotation, and administrator visibility without exposing secrets. |
| Sessions and device management | Partial | 4 | Session services exist, but compatibility methods and `ActiveSessionsSettings` state that targeted session inventory/revocation is not enabled. | Wire server session inventory and per-session revocation with device/IP privacy guidance, audit evidence, and “revoke all others.” |
| Users, invitations, memberships | Certified optional/partial | 6 | Membership lifecycle service, team view, routes, and tests exist, while `BooksContext` still exposes alert-only invitation/revocation placeholders. | Remove facade placeholders; make the membership service the only path; add pending/expired invite states, resend, revoke, and ownership safeguards. |
| Roles, permissions, separation of duties | Core/partial | 8 | Extensive permission registry, custom roles, approval boundaries, SoD metadata, and tests exist. OR-semantics and legacy mappings increase reasoning cost. | Generate one permission catalog for UI and API; show effective permission explanations; retire legacy aliases; enforce and report SoD conflicts. |
| Organization governance | Partial | 6 | Settings, audit, immutable base currency after posting, and recovery locks exist; status/ownership changes remain intentionally guarded or incomplete. | Add audited ownership transfer and organization lifecycle with dual confirmation, recovery plan, and no ambiguous destructive actions. |

## 3. Master data

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Customers | Core/partial | 7 | Creation, workspaces, statements, invoices, and receipts exist. Compatibility facade says edits and archival are not enabled; delete/confirm/alert patterns are inconsistent. | Add canonical edit/archive/merge with duplicate detection, financial-history guards, activity timeline, and inline field errors. |
| Vendors | Core | 7 | Vendor CRUD/workspace, statements, P2P documents, payments, and status handling exist. `VendorWorkspace.tsx` is oversized and contains an alert-only “ready to convert” path. | Decompose workspace, route PO conversion through the real flow everywhere, add duplicate/merge/archive and vendor portal readiness. |
| Items and services | Core/partial | 6 | Item master, quotation/invoice use, GST fields, and tests exist. No stock ledger, valuation, reorder, warehouse, or batch/serial workflow. | Clarify service-item vs inventory-item contract; keep inventory fields hidden until an inventory subledger is selected and certified. |
| Salespersons | Partial | 4 | UI and sales report support exist, but compatibility methods state management is not server-backed. | Implement canonical salesperson CRUD, active/inactive history, reassignment, targets/commissions only if in scope, and report attribution rules. |
| Chart-linked defaults | Core | 7 | Account defaults and server provisioning exist; fixed control codes and configurable mappings coexist. | Complete the migration from magic control codes to validated organization mappings and surface configuration health. |

## 4. Sales and receivables

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Quotations/estimates | Core | 8 | Server engine, revisions, PDF, GST, public response token, conversion, and tests exist. | Standardize workspace shell, approval/send timeline, expiry/reminders, edit conflict handling, and conversion provenance. |
| Sales orders | Core | 7 | Partial fulfillment/invoicing, cancellation guards, lineage, UI, and tests exist. | Improve document workspace consistency, fulfillment visibility, linked-document graph, partial conversion affordances, and mobile action density. |
| Delivery challans | Certified optional | 7 | Lifecycle and feature gate exist, but navigation is indirect and direct mutation paths are intentionally restricted. | Add clear status/lineage workspace, print/e-way-bill boundary, partial delivery handling, and certified reversal/cancellation UX. |
| Invoices | Core | 8 | Posting, approvals, edits/revisions, PDFs, email, reminders, payments, write-offs, unbilled costs, and strong tests exist. UI still uses numerous blocking alerts. | Replace alerts/prompts with inline/toast/dialog patterns; add consistent version conflict, save receipt, delivery status, and trace-to-ledger experience. |
| Payments received | Core | 8 | Allocation, advances, reversals, idempotency, checkout/webhook scaffolding, and tests exist. | Make uncertain outcomes explicit, show allocation evidence, add provider reconciliation and settlement status before claiming online-payment parity. |
| Credits, refunds, write-offs, advances | Certified optional | 7 | Server-backed correction families and reversal tests exist, deployment-gated. | Consolidate them into one receivables settlement workspace with policy-driven valid actions, linked evidence, and deployment readiness status. |
| Recurring invoices | Certified optional/partial | 6 | Recurring service, scheduler primitives, occurrence leasing, UI, and tests exist; compatibility facade still says recurring invoices are not enabled. | Remove duplicate facade path; expose next run, failures, retries, pause/resume, generated-document lineage, and worker health. |
| Customer portal and online payment | Partial | 6 | Token portal, invoice viewing, checkout initiation, provider adapters, and tests exist. Current UI uses blocking alerts and production provider qualification remains separate. | Add customer identity/session option, portal activity, statement/download/payment history, accessible inline errors, and provider settlement/reconciliation evidence. |

## 5. Purchases and payables

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Purchase orders | Core | 7 | Create/update/approve/receive/convert/cancel routes, partial billing, lineage, and tests exist. Some UI success/error feedback is alert-based. | Use the common document shell; show ordered/received/billed quantities and remaining value; replace alerts with persistent operation receipts. |
| Goods/service receipts | Core/partial | 6 | Server lifecycle and tests exist, but it is not a strong first-class workspace in navigation. | Add receiving workspace, partial/over receipt rules, attachments, quality exceptions if needed, and direct PO/bill lineage. |
| Bills | Core | 8 | Posting, approvals, updates, voids, taxes, payments, and reconciliation tests exist. | Align editor/details with invoice UX, add duplicate/vendor-invoice detection, evidence completeness, and committed-refresh recovery. |
| Vendor payments and advances | Certified optional | 8 | Atomic allocations, approvals, advances, reversals, UI, and tests exist. Production exposure depends on capability configuration. | Show deployment readiness, allocation conservation, payment account evidence, and uncertainty/retry states consistently. |
| Vendor credits, debit notes, refunds, write-offs | Certified optional/partial | 7 | Most server correction paths and tests exist; facade messages still call parts paused/unavailable. | Make one payable settlement contract authoritative; remove stale facade methods and certify UI-to-PostgreSQL-to-reversal flows. |
| Recurring bills and expenses | Certified optional/partial | 6 | Shared recurring service/UI exists; legacy facade still says scheduler is unavailable. | Same recurring operations center as sales, with durable queue, retry/quarantine, alerting, and generated-record drill-down. |
| Vendor portal | Absent | 1 | No vendor self-service workspace comparable to the customer portal. | Decide whether the target buyer needs PO acknowledgement, invoice upload, payment status, and statements; partner/build only after security model is defined. |

## 6. Expenses, evidence, and employee spend

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Direct expenses | Core | 8 | Posting, receipts, updates/corrections/voids, PDFs, billable conversion, mobile UI, and tests exist. Details UI uses many blocking alerts. | Replace alerts with field/action feedback; consolidate create/detail state; show immutable posting evidence and correction lineage. |
| Receipt attachments | Core | 8 | Image bounds, preview, persistence, reopening, and QA evidence exist. Base64-in-PostgreSQL is not a scalable document architecture. | Move binary evidence behind `StorageProvider`, store metadata/checksums in DB, scan content, generate thumbnails, and stream securely. |
| Document inbox and OCR | Partial | 5 | Inbox UI, OCR service, and APIs exist, but external OCR is not part of the certified baseline and failure/privacy economics are unclear. | Treat as assisted draft extraction only; show confidence per field, human approval, provider/data-retention controls, and never auto-post. |
| Employee claims/reimbursements | Core/partial | 7 | Claim lifecycle, approval, payment, void, treasury integration, and tests exist. Discoverability in the UI is weaker than the server capability. | Add a first-class employee spend workspace with policy checks, approver queue, receipt completeness, mileage/per-diem only if demanded. |
| Billable expenses and cost recovery | Core | 8 | Project/client association, markup, invoice selection/conversion, lineage, and tests exist. | Make recovery status visible from expense, project, customer, and invoice; protect internal cost/markup from portal/PDF leakage. |

## 7. Banking and cash

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Bank/cash account management | Core | 8 | Core-enabled account lifecycle, GL linkage, account workspace, and tests exist. | Add opening/setup health, archive/close workflow, statement coverage, and clearer distinction between book and bank balance. |
| Statement import | Certified optional | 7 | CSV/XLSX/OFX/MT940/CAMT parsers, preview/confirm, fingerprints, fuzz and real-world tests exist. `xlsx@0.18.5` is a high-risk dependency. | Replace/contain XLSX parser, add file sandbox/resource limits, richer duplicate review, and import provenance. |
| Matching and categorization | Certified optional | 8 | Match engine, rules, bulk/partial flows, categorization, reversals, and E2E exist. | Explain match confidence, support split/many-to-many review clearly, and maintain a complete evidence trail. |
| Reconciliation | Certified optional | 8 | Sessions, complete/reopen, verification, reports, permissions, and E2E exist. | Add attachment support, close readiness integration, exception aging, and production-like PostgreSQL browser qualification. |
| Bank rules | Certified optional/partial | 6 | Server rule CRUD and engine exist. UI/analytics and safe automation controls are less evident. | Add rule simulation, priority/conflict detection, approval threshold, audit/version history, and “never auto-post” default. |
| Connected bank feeds | Prototype | 3 | `BankFeedSyncService` has a mock provider; no certified real provider connection, OAuth lifecycle, consent, or provider operations. | Partner with a bank-feed aggregator; implement connection health, consent renewal, cursor/idempotency, outage handling, and reconciliation-first import. |
| Treasury movements | Core | 7 | Payroll/reimbursement/owner/loan/tax movements post durable source records and journals. | Integrate into a coherent cash workspace, add approval policies and evidence, and avoid presenting this as full payroll or tax-payment automation. |

## 8. Accounting, close, and compliance

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Chart of accounts and subaccounts | Core | 8 | Hierarchy, defaults, validation, locks, and tests exist. Components are large and some category/control-code semantics overlap. | Add account-health checks, merge/archive workflow, mapping migration, usage impact preview, and smaller domain components. |
| Manual and bulk journals | Core | 8 | Balanced posting, approvals, bulk entry, locks, reversals, and tests exist. | Standardize drafts, templates, attachments, recurring handoff, import validation, and line-level error navigation. |
| Transaction approvals | Core | 8 | Rules, requests, decisions, consumption, self-approval controls, and tests exist. Coverage differs by document family. | Publish the approval coverage matrix in-product; ensure every supported financial command uses the same registry and state language. |
| Period locks | Core | 8 | Server-enforced locks and UI exist. | Add scoped locks, impact preview, exception workflow, and link lock decisions to close evidence and audit trails. |
| Period close/reopen | Certified optional | 7 | Validation, workspace, review, close/reopen, audit, and E2E exist. Prior architecture notes say earnings transfer and universal close semantics remain limited. | Define a jurisdiction/accounting close checklist, retained-earnings policy, sign-off package, and immutable close evidence bundle. |
| Fixed assets | Certified optional | 7 | Create, depreciate, dispose, reverse, register report, and tests exist. | Add asset classes, schedules, componentization, impairment/transfer only if demanded, and close integration. |
| GST evidence and calculation | Core/partial | 6 | CGST/SGST/IGST, slabs, GST summaries, cross-validation, and HSN/SAC-related fields exist. It is explicitly not statutory filing integration. | Harden place-of-supply/registration/master-data validation and produce return-ready exception queues with accountant sign-off. |
| GST filing, e-invoice, e-way bill, IMS | Absent/partner decision | 1 | No direct GST portal/IRP filing workflow. This is a major Zoho Books India gap. | Decide the product position; if parity is required, integrate certified GSP APIs with credential vaulting, retries, reconciliation, cancellation, and regulatory update ownership. |
| Multi-currency transactions | Partial primitives | 3 | Multiple base currencies and an FX revaluation service exist, but the capability matrix excludes foreign-currency transaction conversion and settlements. | Design currency-aware document amounts, exchange-rate sources, realized/unrealized gains, revaluation, reports, and migration before exposing export templates as capability. |

## 9. Projects and time

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Project master and workspace | Core/partial | 6 | Project creation, details, customers, costs, and tests exist; compatibility facade says edits/archive are not enabled. | Add canonical edit/archive, project status/budget, activity timeline, duplicate handling, and smaller project detail components. |
| Time tracking | Core/partial | 6 | Time log screens and invoice generation exist. Dashboard timer persists in localStorage and may not be authoritative across devices. | Move active timer/session state server-side or clearly label it local; add approvals, locking, conflict recovery, and mobile-safe start/stop. |
| Unbilled time and expenses | Core | 8 | Selection, markup, invoice integration, project/customer views, and tests exist. | Provide one unbilled queue with aging, ownership, bulk review, leakage protections, and traceable invoice conversion. |
| Project profitability | Core | 7 | Dedicated server report and tests exist. | Clarify cost basis, allocations, WIP, period cutoffs, cash vs accrual, and drill down from every total. |

## 10. Reports and analytics

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Financial statements | Core | 8 | P&L, balance sheet, trial balance, general ledger, cash flow, comparisons, and reconciliations exist with authoritative renderers. | Add consistent drill-down, accounting basis disclosure, comparative presets, close snapshots, and export parity. |
| Operational report catalog | Core/partial | 7 | UI lists 38 reports; 31 use `ReportWorkspaceService` and the remainder use authoritative services. Several workspace calculations use generic `Number` conversion and one large service owns all reports. | Replace float helpers with exact money; split by domain; give each report ownership, query budget, lineage, permission, and certification status. |
| Filters and drill-down | Partial | 6 | Date/entity/status/search filters and some ledger drill-downs exist; coverage varies by report. | Define a universal filter contract, shareable URLs, source-document drill-down, back-stack preservation, and unsupported-filter errors. |
| Saved views and favorites | Partial | 6 | Server-backed saved views exist; favorites are component-local state. | Persist favorites, columns, filters, sharing, ownership, and last-run metadata consistently. |
| Scheduled/shared reports | Absent/partial | 2 | Email outbox exists, but report schedules, subscriptions, delivery history, and access-aware sharing are not established. | Add scheduled report definitions, immutable parameters, recipient authorization, delivery evidence, retries, and revocation. |
| Advanced analytics/custom reports | Absent/partial | 3 | Fixed catalog, budgets/forecast gates, and charts exist; no safe semantic custom-report builder or Zoho Analytics-class BI. | First expose a versioned reporting semantic layer; then add safe dimensions/measures or integrate an external BI tool read-only. |

## 11. Documents, communication, portals, migration, and recovery

| Workflow | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| PDF/document templates | Core | 8 | Versioned templates, branding, historical snapshots, preview, multiple financial documents, responsive settings, and tests exist. `PdfTemplatesSettings.tsx` is 2,800+ lines. | Break into schema/editor/preview/persistence modules; add accessibility, template migration, visual regression, and only show fields supported by document data. |
| Email and reminders | Core/partial | 7 | Invoice send/reminders and durable email outbox/retries exist. Broader automation and delivery analytics are limited. | Centralize communication templates, sender policy, bounce/delivery state, customer preferences, retries, and document timeline events. |
| Customer portal | Partial | 6 | Token access, documents, checkout, and tests exist. | Add authenticated invitation option, statement/history, secure document center, payment status, accessibility, and in-context errors. |
| Vendor portal | Absent | 1 | No equivalent workflow. | Only build if the buyer needs supplier collaboration; begin with PO acknowledgement, invoice upload, and payment status. |
| Data migration/opening balances | Partial | 6 | Server migration service, modal, schemas, and tests exist. | Build a staged mapping/validation/reconciliation wizard with resumability, rollback, provenance, and supported-source templates. |
| Data export | Certified optional/partial | 6 | Export services and guarded endpoints exist. | Publish an audited portable export contract, checksums, encryption, completeness manifest, and restore compatibility. |
| Backup and recovery | Certified optional | 8 | Encrypted artifacts, staging, validation, promotion, locks, recovery tests, runbooks, and center UI exist. Deployment keys/config remain decisive. | Add scheduled drills, operator evidence, RPO/RTO dashboard, off-device copy policy, alerting, and production restore certification. |
| Audit/security center | Core | 7 | Audit logs, security events, metrics, MFA, and settings views exist. Coverage is a caller responsibility and append-only chain completeness has limits. | Create an audit-coverage registry per command, tamper-evidence health, export/sign-off, alert triage, and request/document drill-down. |

## 12. Platform, architecture, quality, and developer experience

| Area | State | Score | Evidence and gaps | Highest-value improvement |
|---|---|---:|---|---|
| Financial command ownership | Partial | 5 | Posting and command services exist, but direct controller, engine, legacy facade, and newer service paths coexist. | Publish a command registry: owner, input schema, permissions, transaction, idempotency, audit, reversal, tests, feature state, and legacy deletion date. |
| Frontend state/data architecture | Partial | 5 | Domain services coexist with a 1,895-line `BooksContext` compatibility facade containing many alert-only methods. | Freeze new facade setters; move each domain to typed query/mutation hooks; delete stale placeholders after caller migration. |
| Backend modularity | Partial | 5 | Strong domain logic exists inside 2,000-4,000 line controllers/engines. | Split by command/query/document family behind stable contracts; keep transactions at use-case boundaries; add dependency rules. |
| Database/migrations | Core | 7 | Transactional accumulated DDL, advisory locking, constraints, schema version, and PostgreSQL CI exist. Migrations are not independently reversible/versioned files and RLS is partial/permissive when context is absent. | Move toward explicit ordered migrations, force/expand RLS carefully, verify context on every pool path, add forward/backward compatibility and restore tests. |
| API consistency | Partial | 6 | Auth, org, permission, error middleware, correlation, and idempotency exist. Route aliases, error shapes, OR-permission semantics, and large controllers increase inconsistency. | Version a standard error envelope and DTO conventions; generate client types; add OpenAPI/internal contract tests; retire aliases deliberately. |
| Error experience | Partial | 4 | Server domain errors exist, but UI still uses many `alert`/`confirm` calls and facade alerts. | One error model with field errors, problem/cause/fix, request ID, retry safety, uncertainty status, and accessible notifications. |
| Performance/scalability | Partial | 6 | Compression, indexes, caches, batch tests, and performance plans exist. Large list/report components and base64 receipts are risks; SLO evidence is limited. | Define datasets and SLOs per workspace; capture query counts/p95; paginate/stream; move blobs; eliminate N+1 and oversized payloads. |
| Observability and jobs | Partial | 6 | Correlation IDs, metrics controller, operational monitoring, outbox, recurring scheduler, and tests exist. In-process timers and production alert wiring remain concerns. | Durable external worker/lease ownership, queue dashboards, dead-letter replay, SLO alerts, and runbooks tied to command IDs. |
| Security | Partial/strong foundation | 7 | Auth, MFA, rate limits, CSP, tenant filters, permissions, webhook checks, recovery encryption, and security tests exist. RLS is partial, XLSX is vulnerable, and external independent assessment is pending. | Replace XLSX dependency, complete tenant-boundary verification, secret rotation, dependency/SAST/DAST gates, and independent penetration review. |
| Test and CI system | Strong | 8 | 1,400+ tests, PostgreSQL CI, Playwright, property/fuzz/concurrency/recovery suites, build and lint exist. Browser CI is memory-backed and the release job does not depend on browser qualification. | Run critical E2E against PostgreSQL, make release depend on browser/security gates, test the exact image, and publish evidence manifests. |
| Developer experience | Partial | 5 | README and commands exist, but setup needs Node/PostgreSQL/manual env; docs are numerous and sometimes stale/conflicting. | One-command disposable dev stack, seeded personas, <5-minute hello world, generated API/schema docs, doc ownership/expiry, and actionable errors. |
| Mobile/accessibility | Partial | 7 | Responsive web audits cover 45 routes and key forms; bottom nav/card tables exist. No native/offline experience or physical-device/Safari certification. | Establish accessibility automation plus manual screen-reader/keyboard/zoom checks; test Safari/iOS; define whether PWA/offline capture is strategic. |
| Integrations/public API/webhooks | Partial/absent product | 3 | Internal REST and payment webhooks exist; public versioning, SDKs, broad webhooks, marketplace, and compatibility guarantees are explicitly deferred. | Decide partner strategy; first create a private versioned contract/event model, then expose narrowly with scopes, signatures, replay, rate limits, and audit. |
| Workflow automation | Partial | 4 | Recurring documents, approvals, bank rules, email outbox, and reminders are separate primitives. No unified trigger-condition-action product. | Build a constrained automation registry over certified commands with dry-run, approvals, rate limits, audit, retries, and safe templates. |
| Inventory | Absent | 1 | Accounts and document item lines include inventory concepts, but no stock subledger, valuation, warehouse, fulfillment, or COGS engine. | Treat as a separate product program or integrate Zoho Inventory/partner; do not imply support from account names/templates. |
| Payroll | Absent | 1 | Payroll payment journals and accounts exist, but no employee, attendance, statutory payroll, payslip, or filing product. | Keep treasury payment labeling explicit; partner with payroll software unless this becomes the chosen wedge. |

## Cross-module findings

1. **Capability truth is fragmented.** Navigation uses `financeCapabilities`, routes use granular trusted-feature keys, docs use their own status tables, and older facade methods expose different messages. Build one generated capability registry consumed by server, UI, tests, docs, and deployment validation.
2. **The compatibility facade is now architectural debt.** It contains alert-only methods for workflows that newer services partly or fully implement. Caller-dependent behavior is a direct UX and trust problem.
3. **The strongest differentiator is evidence, not breadth.** The accounting, reversal, recovery, and test systems can beat generic SaaS trust if every visible action is backed by proof and production configuration.
4. **The largest competitive gaps are ecosystem gaps.** Direct GST/IRP filing, real bank feeds, multi-currency documents, supplier collaboration, scheduled reporting, inventory, payroll, integrations, and unified automation are not small UI additions.
5. **UI feedback is inconsistent.** Blocking browser alerts and confirms remain across invoice, expense, purchase, project, portal, and client flows. Financial operations need durable, accessible status with retry-safety guidance.
6. **Large files hide ownership.** File size is not itself a defect, but 2,000-4,000 line controllers/engines and 1,000-2,800 line screens correlate with mixed responsibilities and slow confident change.
7. **Reports are broad but need truth hardening.** Thirty-eight catalog entries are competitive, but exact-money handling, query ownership, drill-down consistency, scheduling, sharing, and production evidence matter more than count.

## Provisional priority order

### P0: trust and release blockers

1. Replace or strictly contain vulnerable `xlsx` statement parsing.
2. Generate a single capability/command ownership registry and resolve route/UI/doc drift.
3. Remove stale alert-only facade paths from workflows with authoritative APIs; hide truly unavailable actions.
4. Run critical financial Playwright journeys against PostgreSQL and make release depend on the result.
5. Standardize financial error/uncertain-outcome UX and request-ID support.

### P1: daily-workflow quality

1. One workspace shell for sales, purchases, expenses, banking, and accounting documents.
2. Typed URL navigation, preserved context, universal search/command palette, and consistent notifications.
3. Decompose `BooksContext`, `financeController`, sales/purchases engines, report workspace, PDF settings, and the largest screens by business capability.
4. Production-grade recurring/outbox/job operations and report scheduling.
5. Evidence-backed onboarding, migration, and close/reconciliation experiences.

### P2: competitive expansions requiring a product decision

1. GST GSP integration: e-invoice, e-way bill, return/IMS reconciliation.
2. Connected bank feeds.
3. Foreign-currency document and settlement accounting.
4. Vendor portal and broader integrations/API.
5. Inventory and payroll, preferably through partners unless they become the wedge.

## Completion condition for this scorecard

This static scorecard is only the first evidence layer. A final module audit requires a browser pass through every route in representative roles and states, API/database trace for every mutation family, PostgreSQL E2E for critical journeys, performance measurements, accessibility checks, and a deployment-aware capability export.
