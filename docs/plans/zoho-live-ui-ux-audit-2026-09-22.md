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

### Session inventory and per-device revocation — fixed

The browser previously used sessionless JWTs while session controls operated on separate opaque-session rows. “Revoke all other devices” could therefore revoke every row without invalidating the current JWT, and targeted revocation left the selected JWT usable. Ordinary access JWTs now carry a signed session ID, every authenticated request validates that same active user-owned session row through a conditional active-and-unexpired update, and refresh retains the binding. Older unbound JWTs are rejected and require sign-in again; MFA challenge tokens remain separate and sessionless. Password-login and MFA completion recheck credential state while holding the user row lock before creating a session; password changes take that same lock, update both password stores, and revoke all sessions/tokens transactionally. MFA tickets carry an HMAC credential-state proof. Logout revokes only the current device. Session row changes and security-event writes share a transaction; session listings exclude user IDs and token hashes. The Security Center checks server receipts, shows failures, clears stale device identity when a session refresh fails, disables session actions when current-device identity is unavailable, and shows “Unknown” instead of a fabricated IP. Focused HTTP/service coverage passes 39 tests; session UI coverage passes 3 tests; TypeScript and production build pass. PostgreSQL concurrency/rollback qualification remains open.
### Report catalog favorites — persisted per user and organization

Report favorites previously existed only in component state and reset when Reports unmounted. Favorites now save in browser storage under the authenticated user and active organization, restore when Reports opens again, and show a visible warning if storage is unavailable or invalid. Saved report views continue using the server API. Focused Reports workspace coverage passes (5 tests), and TypeScript lint passes. Browser storage does not sync favorites across devices; server-backed preference storage remains a follow-up.

### Item catalog inventory boundary — clarified

The item master stores document rates, SKU/unit references, tax data, and account defaults; it has no stock ledger or valuation model. Its header now says that SKU and unit appear on document lines and explicitly identifies on-hand quantity, valuation, warehouse availability, and reorder levels as unsupported. This keeps the UI honest while inventory remains a separate, uncertified product capability.
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

Invoice and bill detail corrections now use one accessible, reason-required void dialog instead of browser confirmation followed by a second context prompt. Both preserve structured failure and request-ID evidence; invoice void reports success only after the exact operation receipt, posted reversal journal links, and matching audit row reconcile. Invoice void guards are saved in sessionStorage before POST and restored after reload, pinned to the initiating user and organization, and retain the exact reason and idempotency key for same-request recovery. A tenant/user/permission-scoped status endpoint recomputes the canonical POST hash from the route invoice ID and base64url-decoded reason before returning status; `UNKNOWN` and `PROCESSING` keep actions paused, while a verified terminal 4xx clears only the matching guard. Unexpected failures remain 5xx so the outer idempotency transaction rolls back; typed business conflicts return stable 4xx codes. The operation status proof checks the invoice, original and reversal journal linkage/status, and `INVOICE_VOIDED` audit evidence. Invoice void now writes hash-chained audit evidence in the financial transaction, and the status proof validates the exact receipt audit ID, stored event hash, and predecessor link. Legacy unhashed audit rows remain gaps, so this verifies the void event locally rather than claiming that the organization-wide chain is valid. Audit failure rolls the invoice and reversal back together; linked expense release verifies both ordered event hashes. PostgreSQL concurrency and JSONB qualification remain open. PDF, email, reminder, journal, write-off, and print failures also use non-blocking feedback.

Invoice-void receipt verification now passes final GPT-6 Sol review. The focused API/status/context/detail bundle passes 44 tests across 4 files; TypeScript and the production build pass; the audited void, receipt, and reload browser journey passes desktop and mobile Chromium (2/2) against the local in-memory test server. Regression coverage includes unexpected-failure rollback, exact-key retry/replay, multiline Unicode reason binding, posted journal and matching audit status/reason, cross-tenant anonymity, pending guard recovery after reload, stale browser-state rejection, rejected-but-already-voided refresh, and delayed pre-void reads. Persisted verified state is only a recovery hint; invoice status and balances come from server rows, and older list responses cannot overwrite a newer verified result. Fresh continuation verification passed 81 focused receipt/void tests across eight client/server files. The updated create-receipt → exact original posting journal → audited void/reload Playwright journey passes on desktop and mobile Chromium (2/2) against the local in-memory test server. PostgreSQL concurrency and JSONB qualification remain open; hosted CI qualification remains open.

Invoice creation now has a durable browser receipt for the exact request. Before POST, it saves the initiating user and organization, frozen payload, idempotency key, and request hash; only a complete posted receipt or an approval-submitted receipt is treated as committed. Recovery checks the matching completed idempotency record, financial command, invoice, original posted journal, and invoice-to-journal evidence link, even when the invoice lifecycle later advances. Account changes during hash generation cancel the unsent operation, and failed list refreshes retain accurate approval-pending language. The new route-level pg-mem replay test confirms one command and linked evidence; the focused bundle passes 77 tests, lint/build pass, and final Sol review is PASS. PostgreSQL qualification remains open because automatic approval did not establish the configured database as local or disposable. The committed POSTED receipt stores its original journal ID and opens that exact journal through a tenant-, evidence-, and completed-command-checked endpoint; approval-submitted receipts have no journal action. Drill-down ID collisions fail closed, the modal only labels a loaded matching journal as original, and late responses from superseded requests are ignored. Pointer revision, mismatch, tenant, missing-evidence, reswitch, out-of-order response, and SUBMITTED regressions pass in the 80-test focused bundle; TypeScript and production build pass, and final Sol review is PASS.

Customer payment reversal now uses one accessible reason-required dialog and the audited server reversal route. The client validates the returned payment and journal IDs, verifies the authoritative payment list includes the same reversal journal, and keeps organization-scoped guards through uncertain outcomes, conflicts, refresh failures, and organization switches. Delayed older reads cannot restore an editable/reversible view: guarded rows retain their confirmed reversal display, all guard states block editing and repeat reversal, and an already-open edit form closes when a reversal starts. Focused payment recovery and modal tests pass (2 files, 10 tests).

Purchase-order creation, receiving, cancellation, and conversion to a bill now share the same request-aware receipt contract and pending-state guard. Vendor selection is keyed by the authoritative vendor ID instead of a stale default name, positive order amounts are validated inline, and cancellation uses one accessible reason-required dialog that keeps the cancelled order and linked evidence in history. The list and detail actions use the same handlers, eliminating ten blocking alerts and the context-level cancellation prompt. Four focused UI regressions cover creation identity, generated-bill evidence, goods receipt, audited cancellation, and committed-but-refresh-failed recovery.

Expense details now use durable receipts for billable conversion, voucher download and print, receipt evidence, and audited voiding. Conversion and voiding use accessible in-app confirmations; the reason-required void preserves reversal history, while receipt upload and post-commit refresh recovery retain request IDs. This removes nine blocking dialogs and the context-level prompt. Focused expense coverage passes 31 tests across conversion, voiding, receipt, account, pagination, and shared receipt behavior.

Customer master-data actions now use an awaited server edit and soft archive rather than alert-only compatibility methods. The list and workspace share one accessible archive dialog explaining that historical records remain; the editor and list show request-aware success, failure, uncertain-outcome, and committed-but-refresh-failed receipts. The unused legacy detail modal with its separate delete confirmation was removed. Customer edit and archive are permission-guarded, audited tenant mutations that synchronize the canonical customer and client projection, while archived customers leave active lists and new-business creation. Narrow, audited reconciliation preserves the two proven legacy address/tax gaps without undoing explicit field clears; clients-only legacy rows fail with an explicit 409 until canonicalized. Focused customer UI, context, and statement coverage passes 34 tests; customer lifecycle, quotation, and portal server coverage passes 77 tests, as do TypeScript and the production client/server build. The GPT-6 Sol final review passed.

Project master workflows now include audited tenant-scoped edit and archive APIs, permission gates, case-insensitive code uniqueness, linked identity freezing, persisted start dates, request-aware UI receipts, archive confirmation, and archived-project guards across new-work selectors. Archive uncertainty stays attached to the affected project across dialog close/reopen and blocks list/detail actions until a refresh confirms archival. Existing unbilled time settles atomically with its invoice and audit event; the server reserves the invoice number before customer/project/time locks and permits archived customer/project attachment only through this server-owned settlement path. Legacy clients are canonicalized under lock and audited when newly assigned. The API regression covers date round-trip/no-op, customer-name injection rejection, archived customer metadata edits, claim-linked freezing, legacy conversion, tenant boundaries, archive behavior, and settlement. Focused project/accounting/UI suites pass (7 files, 40 tests), including budget/fixed-asset archive guards and pre-archive history; TypeScript and the production client/server build pass. PostgreSQL concurrency qualification remains separate.
Project time logs now confirm deletion in an accessible in-app dialog and retain a request-aware receipt for success, deterministic rejection, uncertain server outcome, and committed-but-refresh-failed state. The shared API client now accepts successful empty responses (204/205 and empty 200/201/202) while still parsing JSON bodies, fixing a prior false network error after audited time deletion. Unbilled-time conversion shows the posted invoice receipt instead of opening a second invoice-creation form. The screen prevents duplicate submissions while pending or until authoritative state resolves an uncertain/stale result. Focused client and UI regressions pass (12 tests); TypeScript and the production client/server build pass. PostgreSQL-backed release qualification remains separate.

This is a foundation, not closure: the current source scan finds 6 blocking `alert`/`confirm` calls across 4 component files, plus legacy blocking alerts and prompts in `BooksContext`. Payment-received reversal and item archive now use guarded, request-aware in-app flows. Estimate conversion from the list now uses a structured inline operation notice instead of a blocking alert, blocks concurrent conversion clicks, preserves the API error metadata, and retries through the same endpoint so uncertain requests reuse the client idempotency key. The focused quotation UI suite passes 31 tests, a direct quotation API metadata regression passes, and TypeScript checks pass. Sales-order creation now returns a structured committed-write receipt, reports refresh failure as already committed, and retains the exact request payload for uncertain retry. Its focused UI and context suites pass 25 tests; retries are blocked outside the originating organization; TypeScript checks pass. Remaining component workflows include salesperson deletion, chart-of-accounts confirmations, role deletion, and sales-order and delivery-challan deletion. These should move onto accessible, retry-safe in-app feedback before the cross-module P0 can be marked complete.
Quotation editing now replaces its native unsaved-change confirmation with an accessible in-app alert dialog. Keyboard focus moves to “Keep editing”; the user can return to the draft or explicitly discard it. Three quotation UI suites pass (62 tests), including dirty close, preserving the draft, and clean close. The focused change does not alter quotation persistence.

Vendor create/edit now shows a non-blocking duplicate review hint for exact normalized GSTIN, PAN, or email matches in the canonical vendor directory and excludes the vendor being edited. The hint never prevents saving. Four focused vendor duplicate regressions cover case/whitespace normalization, shared-email review, save-through, and edit self-exclusion; no automatic merge or server uniqueness rule was introduced. Vendor purchase-order rows now route to the selected PO in the authoritative detail workflow, where conversion and its operation receipt already live; focused workspace coverage confirms the handoff uses the PO ID without a browser alert. The workspace now reloads vendor attachment metadata from the permission-checked API when opened. Removing a document uses an accessible confirmation, calls the existing audited soft-archive endpoint, and reports the request ID; the focused component test covers loading, cancel, archive, and success feedback with a mocked API. A desktop/mobile Playwright journey also uploads a PDF through the API, reloads and reopens the workspace to verify it persists, archives it, then reloads to confirm it disappears; both projects pass against the local in-memory server. PostgreSQL qualification remains separate.

Global search now has an accessible modal dialog and combobox; grouped results expose listbox options with `aria-selected` and `aria-activedescendant` that track keyboard navigation. Up to five selected records remain available in component memory when the palette reopens, clear when the active organization changes, invalidate in-flight results from the prior organization, and omit cached financial metadata. A typed category allowlist opens only exact-record views supported by the destination screen; Expense is mapped, while Credit Note, Bank Transaction, and unknown categories remain visible without a direct-view action. The client ignores API-provided `linkRoute` values, rejects missing/oversized IDs, and passes the active organization with each result. Search navigation now shares the bounded internal return-route contract and shows a safe origin breadcrumb; changing organizations clears record/return context. Four focused suites pass 61 tests, with lint and production build passing. Safe entity previews, saved search, and a broader command layer remain open.
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

### Sales-order cancellation and lifecycle bypass — backend guardrails verified; qualification remains open

The sales-order detail menu now uses a reason-required accessible cancellation dialog, request-aware receipts, tenant-pinned exact-payload recovery, and a committed-state projection that disables further actions. Server lifecycle changes now serialize linked invoice creation/posting/void and fulfillment/cancellation on the sales-order row; direct and delayed posting recheck terminal status and exact-cent capacity. Cancellation checks linked nonvoid invoices (including drafts/submissions), active challans, and exact zero counters instead of trusting cached totals alone. Generic edits cannot rewrite lifecycle status or posted order-linked invoice amounts; void restores billing/fulfillment status without reopening a cancelled or closed order. Linked challan creation uses the authoritative fulfillment workflow, always issues the document, rejects over-fulfillment rather than clamping, and keeps standalone draft challans out of fulfillment counters. Changed POST routes now record their live OR-permission requirements for same-key idempotent replay; an injected transient conversion failure returns retryable 500, same-key retry commits once, replay returns the same receipt, and replay is denied after the actor loses permission.

Full conversion takes lines, GST mode, document discount, and round-off from the persisted sales order and checks the trusted resulting total before posting. Caller-supplied conversion lines are rejected. Partial conversion of GST-bearing orders remains unavailable until installment tax allocation can preserve the source tax liability; issued linked challans also remain cancellation blockers because no audited challan-cancellation workflow exists. Sol architecture and final Sol review passed this bounded backend change. Focused lifecycle, API, posting/void, and concurrency suites passed 64 tests before the last conversion-source assertions; the final stage2 lifecycle and API/idempotency suites pass 12 tests, including forged-GST-line, discount/GST, exact-cent, stale-counter, and status-restoration cases. Production build and TypeScript lint pass. PostgreSQL-backed qualification remains unverified; do not treat the in-memory results as that qualification.

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

**What blocks parity:** Three large cards consume the first viewport even when there are few exceptions; cash and period context repeat; typed search-result navigation and a source-return breadcrumb now use the route contract, while quick create and permission explanations do not yet share it; global search is not yet a true command layer. The dashboard answers “what are the totals?” better than “what requires action now?”

**Improve:** Put an exception/action queue first, allow role-specific layouts, collapse zero-value cards, add saved views, show freshness/basis on every figure, and make search handle navigation, records, and safe commands.

**Verified correction:** The mobile summary no longer infers a separate “Cash In Hand” number from current client account balances or account-name matches. It shows the server’s all-liquid posted ledger total as “Liquid Cash & Bank,” uses the response’s as-of date, and opens Banking through a labeled keyboard-accessible button. A regression with conflicting client balances passes; dashboard tests pass (17), with TypeScript and production build. The mobile overview now puts the server-provided attention queue before financial summary cards; its focused dashboard tests pass (26), and desktop/mobile browser checks pass (2). The desktop action-first hierarchy and broader period/basis/freshness/drill-down work remain open.

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

**What blocks parity:** The desktop create dialog is visually dense and tall, critical fields are spread across sections before the user sees the posting effect, and immutable correction lineage is not prominent enough. Receipt architecture will not scale gracefully if binary data remains in PostgreSQL payloads.

**Improve:** Use a stepped or progressively disclosed form; show a live accounting/tax preview; keep the primary action and validation summary visible; add receipt extraction confidence and human confirmation; move binaries behind a storage provider.

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

**What blocks parity:** The desktop catalog has excessive horizontal whitespace and weak “recent/frequent/attention” prioritization. Mobile now uses a compact section picker beside search, verified in desktop and mobile Chromium; scheduling, sharing, column customization, drill paths, and confidence/provenance remain uneven.

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

**What blocks parity:** The customer selector, link generation, revocation confirmation, and recoverable checkout feedback are functional. Manual token entry is now a masked advanced disclosure when a customer can be selected and remains available when none can; focused component tests cover both states. Portal activity, invitation delivery, token history, customer identity/session options, and production payment-provider evidence remain incomplete. Vendor self-service is absent.

**Improve:** Separate admin preview from customer experience. Admin flow: select customer → invite/generate → preview as customer → copy/open link → see last access and activity. Customer flow: branded login/token resolution, invoices, statements, downloads, disputes, payment history, and inline payment errors. Do not surface raw token mechanics as the primary concept.

### 12. Settings, onboarding, migration, and recovery

**What works:** Settings depth is substantial, PDF templates are visually polished, and migration/opening balances communicate double-entry validation.

**What blocks parity:** Settings are feature-oriented instead of task-oriented; mobile horizontal strips need stronger affordance; the opening-balance dialog exposes a dangerous “auto-balance variance” option too casually and places three similarly weighted footer actions together.

**Improve:** Add setup progress and search, group settings by Organization/Finance/Sales/Purchases/Automation/Security/Integrations, and show effective capability status. Migration should be a resumable wizard with source mapping, validation report, dry run, signed reconciliation, backup/rollback evidence, and explicit explanation of any suspense/opening-equity adjustment. Make “Commit to GL” unavailable until preview and acknowledgment succeed.

### Report-to-source navigation context — implemented

The shared hash-route parser/builder now allowlists application tabs and report IDs, bounds identifiers and search/pagination values, validates calendar dates and status filters, and rebuilds return destinations as canonical internal tab, record, or report routes without recursion. Report selection, period/entity/status filters, local search, page, and focused source survive exact-record drill-down. Global search uses an explicit category-to-supported-view allowlist, ignores server route strings, and preserves the validated origin. The source view offers a validated return action; browser Back/Forward restores route state; closing a selected detail removes the stale record ID while retaining a valid return route. Report rows link only to supported exact-record views (invoice, expense, bill, receipt/payment, journal, and bank transaction); project/fixed-asset rows remain text because their views do not honor exact selection. Invalid or missing focused rows produce a visible status message and never synthesize financial data. Focused search/route/report coverage passes (61 tests), O2C drill-down and return passes Chromium desktop/mobile (2/2) against the local in-memory test server, and TypeScript plus production build pass. Customer portal tokens remain on their existing separate route path. Applying this contract to saved views, quick create, permission explanations, and remaining module links remains open.
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


Time-entry creation now returns a structured committed receipt after the POST and targeted refresh, preserving the distinction between a failed write, an uncertain write, and a committed write whose refresh failed. The exact idempotency key, payload, and organization are persisted before dispatch. An uncertain create is confirmed only by an authenticated server status lookup scoped to that tenant and initiating user, with the original create permission still granted; matching field values in Time Logs never clear the guard. Exact replay reuses the same key, malformed or incomplete receipts stay verification-only, and committed-but-stale timer feedback survives remount. Focused client/provider/server tests pass (7 files, 78 tests); TypeScript lint and production build pass. Dashboard timer state remains browser-local rather than server-authoritative.

### Account lifecycle recovery slice — 2026-09-24

Chart of Accounts archive, restore, and permanent delete use accessible in-app confirmations. BooksContext saves an organization/account/user/action/payload/idempotency-key guard before dispatch and binds ownership to AuthContext’s verified session revision and credential. Token changes, out-of-order profile responses, and A→B sign-in transitions fail closed; an in-flight verification cannot clear another user’s guard, and the initiating user can recover after returning. Legacy guards without a recorded owner remain blocked for manual server-audit reconciliation. Create returns a committed receipt and verifies the exact saved row before Quick Add begins bank setup. Account-only read tickets prevent older mount, manual-refresh, or verification responses from overwriting newer account state, while unrelated mount-batch domains still update. Invalid organization switches remain visible in the switcher. Banking HTTP failures preserve status, error code, request ID, and recovery text; Quick Add differentiates deterministic bank rejection from uncertain outcomes and keeps duplicate ledger creation blocked. Seven focused suites pass (98 tests), including delayed mount, session/org changes, live identity swaps, ownerless legacy guards, overlapping-read completion orders, bank HTTP/network failures, and modal feedback. TypeScript and production build pass; final Sol 6 review PASS.

### Custom-role deletion recovery slice — 2026-09-24

Custom-role deletion now uses an accessible alert dialog and saves the organization, role, and exact idempotency key before dispatch. Exact success receipts are required; uncertain outcomes can be checked or retried with that same key, and a role-list read failure or unverified 404 remains unknown instead of being mistaken for deletion. The server serializes role deletion with assignment, rename, and invitation acceptance, rejects assigned roles, and commits the delete with strict audit evidence in one transaction. Six focused suites pass (78 tests); TypeScript lint and production build pass. Sol 6 final review returned PASS. PostgreSQL qualification remains open.

### Salesperson directory and invoice attribution — 2026-09-24

Salesperson create/edit/archive/restore now use authenticated tenant-scoped APIs with separate permissions, strict audit writes, duplicate-code checks, and a monotonically advancing update token. Deactivation is blocked while active customers reference the salesperson; customer assignment and invoice posting lock and validate the active salesperson. New invoices inherit the customer’s current assignment unless explicitly overridden, then freeze name/code/rate snapshots. Editing an invoice preserves snapshots when attribution is unchanged, refreshes them on reassignment, and clears them only on explicit null. The sales-by-salesperson report uses stored invoice IDs, one row per ID, the current master name, and Unassigned for null IDs; it does not compute commission payouts from current rates. The deactivation action uses an accessible identity-specific alert dialog and keeps the dialog open with server error feedback on failure. Focused salesperson UI/API tests pass (5), adjacent reporting/context tests pass (38), typecheck and production build pass, and Sol 6 final review returned PASS. PostgreSQL migration, normalized uniqueness, and row-lock qualification remain open because no disposable database target was established.
### Delivery challan action truthfulness — 2026-09-24

Removed delete and direct “mark delivered” controls from challan detail because there is no matching audited mutation route. The list now creates standalone challans as Draft, waits for the server receipt before closing, maps persisted server status fields for display, and offers details instead of an alert-only “Mark Delivered” action. Copy identifies the dispatch/supply reason and explains that linked delivery status changes belong to audited sales-order fulfillment. Focused list/detail coverage passes 3 tests, including waiting for the server receipt before close and the absence of unsupported controls. TypeScript and production build pass. Printing remains available. The component scan now finds no blocking browser alert/confirm calls (the install prompt is native PWA behavior). The current frontend scan finds 16 `window.alert` calls and 1 `window.prompt`, all inside `BooksContext`; replace these remaining facade messages with capability-driven UI or typed errors as those methods are retired.
### Invoice email delivery evidence — 2026-09-24

Invoice email and payment reminder actions now say they are queued and open the history tab. Invoice sends attach a PDF snapshot rendered at queue time. The delivery panel shows each invoice-linked message and its status; “SENT” is described as mail-server acceptance, not confirmed inbox delivery. Pending messages are suppressed if the invoice is voided, and reminders are suppressed if the balance is settled. A missing SMTP transport produces retry/failure evidence instead of a false success. The focused invoice/outbox/permission/UI bundle passes 66 tests across six files; lint, production build, and final GPT-6 Sol review pass. PostgreSQL qualification remains open.

### Invoice edit conflict recovery — 2026-09-24

Invoice updates now require a tenant-scoped edit-version token. If another user changes the invoice while the editor is open, the server rejects the stale request before financial or audit effects and returns the current invoice snapshot. The editor keeps the unsaved form values visible, shows the latest header, settlement, notes, terms, attribution, and full line-item values, and only retries after the user explicitly rebases and saves again. UI regression covers preserved notes and line values, the rejected first token, explicit rebase, and second save. Payment settlement also advances the invoice token; a focused backend regression confirms an open edit becomes stale after a payment. TypeScript, production build, focused client/server tests, and Sol 6 review pass. PostgreSQL migration and concurrent transaction qualification remain open.

### Payment allocation and reversal evidence — 2026-09-24

The payment receipt detail now shows each invoice allocation and the unapplied remainder from the tenant-scoped API. When a payment is reversed, the existing current remainder still becomes zero while a separate nullable snapshot records its pre-reversal value; the UI distinguishes a recorded $0 from unknown history on legacy reversals. Recovery upgrades sealed v15 artifacts by verifying their pinned historical manifest and hashes before adding a null snapshot. Focused recovery, API, UI, and schema tests pass (31); TypeScript lint and production build pass, and final GPT-6 Sol review is PASS. PostgreSQL migration qualification remains open because no database target is configured.
