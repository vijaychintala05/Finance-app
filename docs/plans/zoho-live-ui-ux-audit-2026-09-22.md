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
- The gstack browser executable also lacks its expected runtime source in the installed skill bundle. The visual findings below use the last successful local captures and source evidence instead of claiming a new live pass.

## Visual system: preserve and tighten

| Dimension | Current evidence | Score | Improvement to reach a Zoho-grade bar |
|---|---|---:|---|
| Typography | Strong amount hierarchy and readable IBM Plex family | 8/10 | Reduce all-caps micro-labels, standardize 3-4 type roles, and prevent dense metadata from competing with the primary task. |
| Color | Coherent blue navigation with green/orange status accents | 8/10 | Define semantic tokens for success, warning, overdue, draft, posted, reversed, disabled, and unknown; never encode status by color alone. |
| Spacing/layout | Polished desktop cards and clean mobile surfaces | 7/10 | Reduce oversized empty areas and repeated summary-card height; use progressive disclosure for complex forms. |
| Navigation | Clear desktop sidebar and mobile bottom navigation | 7/10 | Make every real route discoverable through one registry; preserve return context and surface capability-disabled reasons. |
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

**What works:** The Financial Command Center has clear date controls, receivable/payable prominence, direct quick actions, cash-flow context, and a stable desktop frame. The mobile navigation promotes the highest-frequency tasks.

**What blocks parity:** Three large cards consume the first viewport even when there are few exceptions; cash and period context repeat; indirect routes are hard to discover; global search is not yet a true command layer. The dashboard answers “what are the totals?” better than “what requires action now?”

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

**What works:** The desktop banking overview cleanly separates book balance, statement balance, review count, account type, import, and reconcile actions.

**What blocks parity:** The blank lower viewport and “No statement” rows show that the experience ends before guiding the user to a completed first reconciliation. Manual import is strong, but connected feed state, import history, duplicate/rejected rows, and reconciliation progress are not visible enough.

**Improve:** Add a first-reconciliation guide, connection/import health, last successful refresh, unreconciled-age buckets, import batch history, match confidence/reasons, exception queue, and explicit statement-to-ledger completion evidence. Keep direct feeds as a partner boundary until selected.

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

**What blocks parity:** The mobile administrative portal screen asks internal users to understand and paste a portal token, displays a large empty workspace, and lacks a clear customer-selection control in the captured state. Vendor self-service is absent; payment provider production readiness is separate.

**Improve:** Separate admin preview from customer experience. Admin flow: select customer → invite/generate → preview as customer → copy/open link → see last access and activity. Customer flow: branded login/token resolution, invoices, statements, downloads, disputes, payment history, and inline payment errors. Do not surface raw token mechanics as the primary concept.

### 12. Settings, onboarding, migration, and recovery

**What works:** Settings depth is substantial, PDF templates are visually polished, and migration/opening balances communicate double-entry validation.

**What blocks parity:** Settings are feature-oriented instead of task-oriented; mobile horizontal strips need stronger affordance; the opening-balance dialog exposes a dangerous “auto-balance variance” option too casually and places three similarly weighted footer actions together.

**Improve:** Add setup progress and search, group settings by Organization/Finance/Sales/Purchases/Automation/Security/Integrations, and show effective capability status. Migration should be a resumable wizard with source mapping, validation report, dry run, signed reconciliation, backup/rollback evidence, and explicit explanation of any suspense/opening-equity adjustment. Make “Commit to GL” unavailable until preview and acknowledgment succeed.

## Cross-module P0 UX backlog

1. Replace all blocking `alert`, `confirm`, and prompt-based financial feedback with the shared operation receipt and recovery pattern.
2. Generate a single route/capability/permission registry for sidebar, mobile navigation, search, quick create, breadcrumbs, and disabled-state explanations.
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
