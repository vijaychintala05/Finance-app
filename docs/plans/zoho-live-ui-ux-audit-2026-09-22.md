# FirmBooks Live UI/UX Audit Against Zoho-Grade Operations

Date: 2026-09-22  
Evidence: screenshots from the 2026-09-21 browser QA, the mobile UI audit, the 2026-09-22 PDF settings QA, current source/routes, and a fresh isolated startup attempt.  
Status: evidence audit, not production certification.

## Executive verdict

FirmBooks already has a credible visual system: IBM Plex typography, restrained blue/neutral surfaces, consistent iconography, clear amount hierarchy, responsive navigation, useful summary cards, and mobile record cards. The gap to a Zoho-grade product is not visual novelty. It is **workflow coherence, information density control, recovery guidance, and consistency between what the interface promises and what the active deployment can complete**.

The highest-leverage UX move is a shared workspace and operation contract across every module. Every list, document, posting action, and report should expose the same answers: where am I, what period/basis am I seeing, what can I do, what will that action change, did it commit, and how do I recover?

## Evidence quality and current blocker

- The most recent browser QA passed authenticated dashboard, receipt, banking journal, cash-flow, Expenses mobile, and Reports mobile flows with clean console evidence.
- Current screenshots show the product at desktop and 390 px mobile widths without document-level overflow in the tested flows.
- A fresh isolated server on port 55123 initialized the in-memory database and demo data. Its Vite child process failed only inside the managed filesystem sandbox because esbuild was denied while traversing ancestor directories; direct reads proved the referenced React, Lucide, Recharts, and QRCode files were present. The identical `npm run build` then passed outside that sandbox: 2,452 modules transformed and both client and server bundles were produced. This is a test-harness boundary, not dependency corruption or an application release defect.
- The gstack browser executable also lacks its expected runtime source in the installed skill bundle. The in-app browser was used instead for a fresh authenticated pass of Dashboard, Banking, Invoices, Reports, Settings, and Customer Portal at desktop and 390 px mobile widths.

## Implemented during this audit

### Customer Portal administration dead end — fixed

The standalone Customer Portal route told administrators to select a customer, but rendered no selector. `/api/v1/finance/clients` returns a canonical raw array while `CustomerPortalView` only inspected wrapped `clients` or `customers` properties. The view now accepts the canonical array and both legacy wrapped shapes, selects the first available customer without triggering a second fetch, and gives accessible names to the customer and expiry controls.

Fresh browser verification proved that all three seeded customers, the expiry selector, and **Generate / Switch** render at both 1280 px and 390 px with no horizontal overflow or console errors. The focused regression test, TypeScript check, and production client/server build pass. A full-suite rerun was started twice but its result was not retained across user interruptions, so it is not claimed as passing evidence here.

### Customer Portal blocking feedback and revocation — fixed

Portal administration and checkout initiation no longer use browser `alert` or `confirm` dialogs. Link-generation failures remain visible with the server cause and a concrete retry path; successful generation identifies the customer and expiry. Revocation now uses an accessible in-app confirmation that names the affected customer, explains that links stop working while financial history remains intact, supports Escape and focus return, and distinguishes confirmed revocation from an uncertain failure where existing links may still work.

Payment amount validation and hosted-checkout startup failures now remain inside the labeled payment dialog and explicitly state whether a payment was submitted. Focused portal UI, Stage 6 server lifecycle, and release-containment coverage pass (28 tests), as do TypeScript and the 2,457-module production client build.

### Team access facade and destructive-action ambiguity — fixed

The client compatibility facade exposed unused identity, membership, session, ownership, and organization-status methods that could only open browser alerts, even though Team Access already had a transactional and audited server lifecycle. Those false APIs are removed; the server-backed Team Access workspace is now the only membership path.

The workspace exposes active-member and pending-invitation counts, explicit invitation expiry and Accepted/Revoked/Expired history, the complete supported non-owner role list, and one-time token handling. Role changes, membership revocation, and invitation revocation use accessible in-app confirmations that name the affected person and explain session invalidation or token consequences. Persistent receipts distinguish rejection, uncertain network outcome, confirmed commit, and committed-but-refresh-failed state so administrators are not encouraged to repeat a completed security mutation. Focused UI and membership lifecycle/router coverage passes (14 tests), as does TypeScript.

### Recurring document split-brain and hidden failures — fixed

Recurring invoices, bills, and expenses previously had two contradictory client paths: the real server-backed scheduler and duplicate legacy screens whose `BooksContext` methods only displayed “not enabled” alerts. Four dead screens, nine false mutation methods, and three browser-cache collections are removed. The vendor workspace now reads recurring bill profiles from the authoritative API instead of an always-empty local collection.

The canonical recurring workspace now fulfills its “generated document history” promise by showing every occurrence’s scheduled date, status, attempt count, generated document type/ID, completion time, next retry, and quarantine error. Generated records open their owning document workspace, and quarantined occurrences have a permission-guarded retry action that preserves failure evidence while returning the occurrence to the scheduler. Malformed legacy templates no longer crash amount rendering. Create, pause/resume, and retry operations expose persistent success, rejected, uncertain-outcome, and committed-but-refresh-failed receipts; the create form is an accessible labeled dialog. Focused UI plus scheduler API/service/schedule coverage passes (17 tests), and TypeScript passes.

### Payable corrections split-brain and missing refund recovery — fixed

Payments and vendor credits previously had duplicate legacy screens even though navigation already used the server-backed settlement workspace. The duplicate vendor-credit screen called three `BooksContext` mutations that only displayed “paused” or “unavailable” alerts, while the vendor workspace read an always-empty credit collection. Both legacy screens, the false credit mutations, and the unused prompt-based payment reversal facade are removed. Vendor workspaces now fetch canonical debit notes on demand.

The payable settlement workspace now includes source-linked vendor refunds from a debit note, unapplied advance, or direct expense; settings-aware currency; record totals; posting and reversal evidence; report/search deep links; and an accessible reversal dialog that explains immutable history and requires a reason. Persistent receipts distinguish rejection, uncertain outcome, confirmed commit, and committed-but-refresh-failed state. Payable and receivable write-offs are separately published deployment capabilities, so their tabs and create actions remain hidden when disabled instead of failing after selection. Focused payable UI, context, money-movement, permission, and compatibility coverage passes (56 tests), as does TypeScript.

### Banking mobile action labels - fixed

At 390 px, the generic record-card label reserved 42% of the Banking action row. The remaining space could not hold **Import**, **Reconcile**, and the open-workspace control, while the shared `overflow-wrap: anywhere` rule split action labels mid-word. The Banking action cell now releases that generic reservation and prevents its controls from shrinking or wrapping without changing other record-table layouts.

Fresh 390 x 844 browser verification showed intact action labels on every seeded bank-account card. Measured controls use `white-space: nowrap`, `flex-shrink: 0`, and 40 px touch height; the action label uses an automatic basis, and the page logged no console errors. The focused Banking tests (3/3), TypeScript check, and production client/server build pass.

### PostgreSQL browser release gate - fixed

Browser qualification previously ran against the in-memory database and did not block the release build. CI now provisions PostgreSQL for the full Playwright desktop/mobile matrix, explicitly disables memory mode, and enables a fail-closed configuration guard that rejects a purported real-database run without `DATABASE_URL`. The release build depends on that browser job.

Container publication now has a second boundary: before registry login and publication, five critical desktop journeys run against the exact release image connected to PostgreSQL: order-to-cash, procure-to-pay, payment allocation, bank reconciliation, and period close. Failures retain the Playwright report. Contract tests protect the workflow dependency, database mode, pre-publish ordering, critical spec list, and fail-closed configuration.

The lifecycle specs were also tightened where their names overstated their evidence. Procure-to-pay now creates a vendor and bill, posts a vendor payment through the authoritative settlement workspace, reloads, and proves the ledger record persists. Period close now saves review state, reloads, and proves the checklist and note persist. A local Chromium run passed both strengthened journeys; the payable run additionally exposed and fixed an ambiguous accessible name on the Vendor control. This validates the journeys locally, while the first hosted run remains the required evidence that the new PostgreSQL CI wiring executes successfully in its deployment environment.

### Financial failure and trace contract - shared foundation implemented

The server already returned useful domain metadata and an `X-Request-ID`, but the browser client discarded retryability, cause, fix, current state, documentation links, and usually the trace itself. Every API request now carries a client trace ID, retains the server trace on success or failure, and preserves the complete structured failure contract. A network failure retains the outbound ID so support can correlate a request that may have reached the server.

One operation-receipt model and accessible banner now serve Team Access, recurring transactions, and receivable/payable settlements. They distinguish deterministic rejection from unknown mutation outcome (including `COMMAND_IN_PROGRESS`), surface the server-authored next step, show error code and request ID, and treat a committed mutation followed by a failed refresh as committed rather than inviting resubmission. This also fixes the previous logic that treated every HTTP 409 as an uncertain commit, including definitive period-lock and validation conflicts.

Focused API reliability, receipt classification, and migrated-workspace coverage passes (23 tests), and TypeScript passes. This is a foundation, not closure: a current source audit still finds 62 blocking `alert`/`confirm` calls across 24 component files, led by invoice, expense, purchase-order, customer, and settings workflows. Those flows must move onto the shared contract before the cross-module P0 can be marked complete.

### First-reconciliation dead end - fixed

Accounts without statement evidence previously showed passive **No statement** badges and an import button, but did not explain the safe path from import to a completed reconciliation. Banking now computes statement coverage for bank and credit-card accounts (excluding petty cash), shows the uncovered-account count, names the three steps, and states that importing bank evidence does not post to the ledger until a row is explicitly matched or categorized. When only one account is uncovered, the guide opens that account directly.

The responsive hierarchy is task-first: at 390 px the guide appears before the three passive totals, while desktop retains its compact metrics-first layout. Live verification confirmed a 44 px CTA, no content beyond the layout viewport, successful handoff to the statement-import dialog, and no console errors. The two new guide regressions plus the existing three Banking UI tests pass; TypeScript and the production client/server build also pass.

### Possible-duplicate review dead end - fixed

The import preview previously reported aggregate duplicate counts while hiding each row's disposition. After confirmation, the completion banner reported only new rows, and `POSSIBLE_DUPLICATE` transactions appeared in **To Review** without a dedicated queue or any available decision. The preview now labels every visible row as ready, review-required, or exact-duplicate/skip; explains the immutable audit behavior; and reports new, skipped, and review-required counts after import.

The account workspace now exposes a dedicated possible-duplicates queue with explicit **Keep as new** and **Ignore** decisions. Both use the existing non-posting statement mutation boundary, refresh the workspace, and create accurate restore/ignore audit actions. Missing or cross-organization transaction IDs fail instead of producing false-success audit records. The workspace table opts into the phone record-card system so the candidate narration, amounts, status, and decisions remain visible without document-level overflow.

Focused client/server coverage passes (12 tests across duplicate resolution, import dispositions, statement integration, and mobile record labels), as do TypeScript and the final 2,457-module client production build. A live two-import flow verified row disposition, the review queue, both visible decisions at 390 px, zero document overflow, successful keep resolution, and no failing Banking API requests before the final record-card refinement. The host approval service reached its usage limit before one last screenshot of that refinement; do not treat the final mobile card render as independently re-verified yet.

### Spreadsheet import and export security boundary — fixed

The unpatched `xlsx@0.18.5` dependency has been removed from both bank-statement ingestion and report export. XLSX files now use ExcelJS behind archive-entry, encryption, ZIP64, compressed-size, expanded-size, row, column, and cell limits. Formula cells are never evaluated; only cached scalar results may enter statement parsing. Common Indian-bank HTML or delimited exports named `.xls` remain supported, while true legacy binary XLS is rejected with instructions to export CSV or XLSX. Import evidence now records the actual CSV/XLSX/XLS source and parser version instead of labeling every file CSV.

The replacement also generates report workbooks through ExcelJS and reopens them in regression tests. The final dependency audit reports zero known vulnerabilities; 54 banking/report tests, TypeScript, the 2,457-module client build, and the 2.1 MB server production bundle pass.

## Visual system: preserve and tighten

| Dimension | Current evidence | Score | Improvement to reach a Zoho-grade bar |
|---|---|---:|---|
| Typography | Strong amount hierarchy and readable IBM Plex family | 8/10 | Reduce all-caps micro-labels, standardize 3-4 type roles, and prevent dense metadata from competing with the primary task. |
| Color | Coherent blue navigation with green/orange status accents | 8/10 | Define semantic tokens for success, warning, overdue, draft, posted, reversed, disabled, and unknown; never encode status by color alone. |
| Spacing/layout | Polished desktop cards and clean mobile surfaces | 7/10 | Reduce oversized empty areas and repeated summary-card height; use progressive disclosure for complex forms. |
| Navigation | Desktop/mobile now share one route inventory; real module routes are discoverable and capability-disabled items explain their state | 8/10 | Extend the registry to search, quick create, breadcrumbs, permissions, and preserved return context. |
| Data density | Attractive but sometimes dashboard-heavy | 6/10 | Offer compact/comfortable density for tables, use sticky identifiers/actions, and prioritize exceptions over decorative summaries. |
| Feedback/recovery | Strong server semantics, inconsistent UI handling | 4/10 | Replace `alert`/`confirm` with inline validation, persistent receipts, retry-safe recovery, and trace/request IDs. |
| Accessibility | Responsive tests and labeled controls exist | 7/10 | Add automated axe coverage, 200% zoom, focus-return, keyboard grid/dialog flows, reduced motion, and non-color status tests. |
| Trust/provenance | Dashboard and reports increasingly disclose ledger basis | 7/10 | Put basis, period, freshness, source, and drill-down beside every financial number and operation result. |

## Shared workspace contract

All modules should converge on the following shell rather than inventing their own page grammar:

1. **Context header:** module/entity, organization, status, period, accounting basis, freshness.
2. **Primary action:** one dominant action; secondary actions grouped by frequency and risk.
3. **Exception strip:** overdue, failed, unreviewed, capability-disabled, approval-required, or data-quality items.
4. **Filter state in the URL:** query, status, date, owner, sort, density, and selected record survive refresh/back navigation.
5. **List/detail continuity:** desktop split view where useful; mobile card list followed by full-screen detail; return to the same scroll/filter state.
6. **Operation receipt:** pending → committed → refresh-recovered, with affected document/journal IDs and a safe next action.
7. **Audit drawer:** who, when, before/after, linked documents, ledger effect, reversal path, request ID.
8. **Empty and unavailable states:** explain why, prerequisites, permissions, deployment capability, and a real next step.

## Point-by-point module findings

### 1. Dashboard and global navigation

**What works:** The Financial Command Center has clear date controls, receivable/payable prominence, direct quick actions, cash-flow context, and a stable desktop frame. Desktop and mobile module navigation now share one typed registry, expose the same real routes, and keep deployment-disabled workflows visible with an explanation while deep links enforce the same capability gate.

**What blocks parity:** Three large cards consume the first viewport even when there are few exceptions; cash and period context repeat; navigation metadata has not yet reached search, breadcrumbs, quick create, or permission explanations; global search is not yet a true command layer. The dashboard answers “what are the totals?” better than “what requires action now?”

**Improve:** Put an exception/action queue first, allow role-specific layouts, collapse zero-value cards, add saved views, show freshness/basis on every figure, and make search handle navigation, records, and safe commands.

### 2. Customers, vendors, items, and salespersons

**What works:** Consistent entity cards and links into financial documents create a useful operational frame.

**What blocks parity:** Edit/archive/merge behavior varies; compatibility facades still advertise unavailable actions; duplicate resolution and change history are not first-class. Salesperson management is visually present without a canonical server-backed lifecycle.

**Improve:** One master-data workspace with overview, transactions, statements, activity, notes/files, duplicate detection, merge preview, archive constraints, and effective permissions. Hide unsupported actions rather than acknowledging them with an alert.

### 3. Sales documents and receivables

**What works:** The mobile invoice page has strong hierarchy, readable status, summary metrics, search/filter chips, and clear record cards. Estimate/order/invoice/payment lineage exists in the product model.

**What blocks parity:** Summary cards dominate mobile before the list; actions and feedback vary among documents; blocking alerts interrupt invoice and portal flows; conversion provenance is hard to scan.

**Improve:** Use one document shell across estimate → order → challan → invoice → receipt/credit. Add a linked-document timeline, sticky total/status/actions, compact summaries, delivery/payment evidence, version-conflict recovery, and a persistent post/issue receipt.

### 4. Purchases and payables

**What works:** Bills and payments have substantial accounting depth, and expense/bill forms use clear sections and account terminology.

**What blocks parity:** Receiving is not a strong first-class workspace, PO/bill/payment screens do not consistently show remaining quantities/value, and alert-based outcomes weaken confidence.

**Improve:** Mirror the sales document shell, emphasize ordered/received/billed/paid conservation, add duplicate vendor-invoice warnings, show approval blockers inline, and expose three-way evidence where the selected buyer actually needs it.

### 5. Expenses and document evidence

**What works:** The Record Expense dialog clearly separates expense details, payment/vendor, and receipt evidence. Itemized split mode and receipt upload are valuable. Mobile expense QA passed without overflow.

**What blocks parity:** The desktop dialog is visually dense and tall, critical fields are spread across sections before the user sees the posting effect, and detail actions still rely on browser alerts. Receipt architecture will not scale gracefully if binary data remains in PostgreSQL payloads.

**Improve:** Use a stepped or progressively disclosed form; show a live accounting/tax preview; keep the primary action and validation summary visible; replace alerts; add receipt extraction confidence and human confirmation; move binaries behind a storage provider.

### 6. Banking and reconciliation

**What works:** The banking overview cleanly separates book balance, statement balance, review count, account type, import, and reconcile actions. Its record cards preserve readable actions at 390 px, statement previews disclose every row's disposition, and possible duplicates have a dedicated audited resolution queue.

**What blocks parity:** The initial manual-import and duplicate-decision paths are now explicit, but connected feed state, import-batch history, parser-rejected rows/files, reconciliation progress, and recurring exception health are not visible enough.

**Implemented correction:** A responsive first-reconciliation guide exposes statement coverage, the import -> review -> closing-balance sequence, and the non-posting import boundary. Import previews and completion receipts now disclose new/exact/possible-duplicate outcomes, and a dedicated audited queue lets users keep or ignore possible duplicates without posting to the ledger.

**Improve next:** Add connection/import health, last successful refresh, unreconciled-age buckets, import batch history, match confidence/reasons, exception queue, and explicit statement-to-ledger completion evidence. Keep direct feeds as a partner boundary until selected.

### 7. Accounting, close, assets, and controls

**What works:** The product has deep ledger, journal, lock, close, reversal, recovery, and asset primitives.

**What blocks parity:** The UI exposes these as separate tools rather than one guided accountant workflow. Control-account mappings, close readiness, unresolved exceptions, and reversal lineage require too much system knowledge.

**Improve:** Build an Accountant Operations Center: close checklist, reconciliation status, draft/imbalanced/late-posting exceptions, tax readiness, control-account health, backups, approvals, and sign-off. Every journal should trace to source, ledger impact, correction, and reversal.

### 8. Reports and analytics

**What works:** The desktop 38-report catalog is structured and searchable; mobile report cards disclose posted-ledger basis and remain readable at 390 px.

**What blocks parity:** The desktop catalog has excessive horizontal whitespace and weak “recent/frequent/attention” prioritization; mobile makes users traverse category navigation before content; scheduling, sharing, column customization, drill paths, and confidence/provenance are uneven.

**Improve:** Add recents/favorites first, role-based collections, consistent report header controls, saved parameter sets, compare periods, drill-to-source, export history, scheduled delivery only through a durable job system, and reconciliation footers. Use exact-money types at report boundaries.

### 9. GST and India compliance

**What works:** GST fields, calculations, summaries, documents, and compliance services form a strong base.

**What blocks parity:** Filing/e-invoice/e-way-bill integration status is not an end-to-end user journey. A screen that calculates tax is not statutory submission parity.

**Improve:** Choose the product promise explicitly: either accountant/GSP-ready exports with validation, or certified partner submission. Then show period status, validation errors by document, acknowledgement IDs, cancellation windows, retry state, and immutable evidence. Never label calculated data as filed.

### 10. Projects and profitability

**What works:** Project links, costs, billing, timesheets, and profitability reports exist.

**What blocks parity:** Project edit/archive paths and unbilled-cost conversion are split across legacy and newer flows; users cannot see a single “health of project economics” story.

**Improve:** A project cockpit with estimate/budget, time, expenses, billable/unbilled, invoiced, collected, margin, write-offs, and forecast. Make conversion lineage explicit and keep project/customer/document context through navigation.

### 11. Portals and external collaboration

**What works:** The customer portal communicates secure token access and supports invoice/statement/payment foundations.

**What blocks parity:** The customer selector, link generation, revocation confirmation, and recoverable checkout feedback are now functional, but the administrative page still gives raw portal-token entry equal visual weight to the guided customer flow. Portal activity, invitation delivery, token history, customer identity/session options, and production payment-provider evidence remain incomplete. Vendor self-service is absent.

**Improve:** Separate admin preview from customer experience. Admin flow: select customer → invite/generate → preview as customer → copy/open link → see last access and activity. Customer flow: branded login/token resolution, invoices, statements, downloads, disputes, payment history, and inline payment errors. Do not surface raw token mechanics as the primary concept.

### 12. Settings, onboarding, migration, and recovery

**What works:** Settings depth is substantial, PDF templates are visually polished, and migration/opening balances communicate double-entry validation.

**What blocks parity:** Settings are feature-oriented instead of task-oriented; mobile horizontal strips need stronger affordance; the opening-balance dialog exposes a dangerous “auto-balance variance” option too casually and places three similarly weighted footer actions together.

**Improve:** Add setup progress and search, group settings by Organization/Finance/Sales/Purchases/Automation/Security/Integrations, and show effective capability status. Migration should be a resumable wizard with source mapping, validation report, dry run, signed reconciliation, backup/rollback evidence, and explicit explanation of any suspense/opening-equity adjustment. Make “Commit to GL” unavailable until preview and acknowledgment succeed.

## Cross-module P0 UX backlog

1. Replace all blocking `alert`, `confirm`, and prompt-based financial feedback with the shared operation receipt and recovery pattern.
2. ~~Generate the route/capability registry for sidebar, mobile navigation, deep links, and disabled-state explanations.~~ Completed. Extend it to permissions, search, quick create, breadcrumbs, and generated documentation.
3. Introduce the common workspace/document shell and status vocabulary, beginning with invoices, bills, customers, vendors, banking, and reports.
4. Build the accountant exception queue and close checklist instead of adding more dashboard summaries.
5. Make provenance mandatory: period, basis, freshness, source, request ID, linked journal/document, and reversal/correction route.
6. Add accessibility release checks for keyboard flow, focus trapping/return, axe-critical violations, 200% zoom, reduced motion, and semantic status labels.
7. Add a clean-checkout/browser smoke gate and document that esbuild/Vite verification must run with workspace ancestor traversal permitted; do not treat sandbox-only resolution failures as dependency corruption.

## 90-day UX outcome measures

| Journey | Measure | Initial target |
|---|---|---:|
| New organization | Time to first correctly posted invoice | < 15 minutes |
| Banking | Time from statement import to completed reconciliation | < 10 minutes for 100 rows |
| Month-end | Time to identify and resolve close blockers | < 30 minutes for target SMB dataset |
| Invoice/bill posting | Successful first-attempt completion | > 95% |
| Failed/uncertain mutation | Recovery without support intervention | > 90% |
| Migration | Dry-run to balanced accepted import | > 90% of design partners |
| Mobile core tasks | Task completion without horizontal overflow or hidden primary action | 100% of supported flows |
| Accessibility | Keyboard-only completion of six core journeys | 100% |

These targets must be validated with a defined beachhead customer; they are operating hypotheses, not product commitments.
