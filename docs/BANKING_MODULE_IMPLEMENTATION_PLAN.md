# App-wide Bank Statement Reconciliation — Autoplan

Date: 2026-09-27
Status: Owner approved implementation on 2026-09-27; implementation, local qualification, and Sol review complete; branch promotion pending
Product design: [Office Hours design](BANKING_STATEMENT_RECONCILIATION_DESIGN.md)
Scope: firm-wide accounting behavior, not a single page

## Engineering checkpoint — 2026-09-28

The workflow now imports CSV/XLS/XLSX statement evidence, previews incomplete rows and duplicate candidates, shows posted bank-ledger movement suggestions, confirms exact journal-line matches, creates a genuinely missing entry through the posting engine, and links the new journal to the exact remaining statement cents. Shared status/projection data feeds Banking, dashboard, accountant overview, reports, and period-close warnings. Statement close records allocation, duplicate-proof, and import-observation snapshots. Reversal requires the selected statement-created allocation when a line has more than one eligible entry. Direct bank feeds remain unavailable.

The two canonical write capabilities are certified and published as opt-in production features. Add `bank-movement-allocations` and `bank-statement-entry-creation` to the deployment's existing `TRUSTED_FINANCE_FEATURES` value along with `bank-statement-import` and `bank-reconciliation`; the server and UI both keep them disabled when omitted. Do not add `bank-feed-connections`.

Local qualification on 2026-09-28: full Vitest suite **282 files passed, 2 skipped; 2,113 tests passed, 18 skipped**; real PostgreSQL suite **14 passed** including file import, exact remainder, reversal, legacy verification, duplicate-proof close/reopen, projections, HTTP idempotency replay for import/close/reopen, and close/posting plus allocation/reversal concurrency; Playwright **30 passed** on desktop and mobile; lint and production build passed; `npm audit --omit=dev` found zero vulnerabilities. Sol's final review passed. Validate the owner's actual sanitized bank export before claiming broad bank-format coverage.

## Product outcome

The owner records about 50–100 business transactions a month and spends about two hours doing so. The first release should let them import a bank statement, see every statement line beside the corresponding posted book activity, confirm suggested matches, and explicitly create missing transactions. At the end, each line has a clear disposition and the statement-to-books difference is explained. This is a file-based workflow; there is no direct bank connection.

The experience belongs to the whole app. A bank movement created in Sales, Purchases, Expenses, Reimbursements, Transfers, Treasury, Gateway settlement, Fixed Assets, Recurring activity, or Journals should appear once in Banking because it posted to that bank's ledger. Its effects on balances, reports, dashboard attention, audit, reversals, and period close must remain consistent. Imported statement evidence never becomes a financial posting by itself.

## Office Hours decisions carried forward

- Start with the owner's own business workflow; future CA collaboration is not a launch requirement.
- Preserve statement evidence separately from book transactions.
- Suggestions may help discover a match, but a person confirms a match or a new accounting entry.
- Add missing entries through existing posting services, never by inserting synthetic feed rows.
- Success means both complete visibility and resolved lines before reconciliation close.
- Validate one actual sanitized bank export before claiming support for formats or banks.

## CEO review — SELECTIVE EXPANSION

### Product judgment

This is a missing close workflow across the accounting product, not a request for an isolated transaction list. The narrow wedge remains statement import → complete book/statement comparison → explicit resolution → auditable close. Expanding to a common posted-ledger movement projection and shared reconciliation semantics is necessary because otherwise Banking can look correct while dashboard, reports, source edits, or period close disagree.

### 10-star direction

At month end, the owner imports a statement and sees a reliable checklist: what the bank reported, what the books posted, what matches, what needs a decision, and which book movements are still outstanding. The owner can add a genuinely missing transaction through the correct accounting flow and can trace it from the statement line to its source document and journal. A completed close explains any permitted outstanding items and preserves evidence for the future CA.

```text
Bank export ──> immutable statement evidence ──┐
                                               ├─> reconciliation projection ─> exception queue ─> audited close
Business modules ─> posting engine ─> posted GL┘           │
                                                           ├─> Banking register and match suggestions
                                                           ├─> Dashboard attention
                                                           ├─> Bank reports at a shared cutoff
                                                           └─> Period-close controls
```

### Alternatives and scope

Selected complete file-based reconciliation, delivered in gated increments. A register-only patch does not meet the resolution requirement; import-only/manual search keeps most of the two-hour burden. Direct bank linking, silent auto-posting, arbitrary-format promises, CA collaboration, and broad accounting redesign are deferred. This choice respects the explicit no-bank-link direction while extending scope only where app-wide consistency requires it.

### CEO verdict

Proceed with the full workflow, sequenced behind financial integrity gates. The business value is measurable against the owner's two-hour monthly baseline; the first launch must prove every imported row remains visible and every exception is understandable.

## Design review — 8/10, accepted with required workflow refinements

The prior Luna review scored the first specification 8/10 and identified missing terminal dispositions, an unclear reconciliation equation, excessive launch breadth, unclear legacy migration, and unspecified statement-format validation. The spec was revised and independently re-reviewed by Luna at 9/10. Remaining notes—opening balance and partial allocations—were addressed in the Office Hours design.

### App-wide information architecture

Keep Banking as the user's reconciliation workspace, with distinct Statement lines and Transactions in FirmBooks views. Do not create a second accounting register with independent balances. Shared server-side status must power dashboard warnings, bank reports, and period close. Source modules retain ownership of creating and correcting their documents; reconciliation links provide traceability and constrain unsafe corrections.

### User flow and states

1. Choose a bank account and import its report.
2. Preview mapped columns, row/date/currency totals, parse failures, duplicate signals, and supplied statement balances.
3. Confirm import; preserve source evidence and row observations.
4. Review each imported line with exact/strong candidates, weak candidates flagged for review, or an explicit add flow.
5. Confirm a match, add a transaction using a suitable existing business workflow, or record an allowed disposition with reason. Duplicate, invalid, and unresolved rows stay visible.
6. Review unmatched book movements and the balance difference at one statement cutoff.
7. Close only when the policy's line dispositions, allocations, balance equation, period boundary, permissions, and audit requirements pass atomically.

### Visual and interaction requirements

The existing rough sketch is structure-only and is not an approved visual design. Preserve `DESIGN.md` patterns when implementation begins. Use explicit labels for statement evidence and posted books, accessible table actions, server-backed filters/counts/search, pagination, and links to source documents. Include loading, empty, import validation, partial/error, duplicate, review-needed, permission-denied, period-locked, and retry/idempotency states. Mobile must keep amount, date, status, and primary action understandable without hiding an unresolved line.

### NOT in scope

Live bank APIs or credential storage; AI-generated or silently posted accounting; unlimited unvalidated file formats; automatic acceptance of weak matches; CA multi-client collaboration; changing accounting recognition or ledger reporting rules; replacing the posted GL with statement balances.

### What already exists

Import preview/confirmation, parsers, fingerprints/observations, bank-account ledger linkage, tenant/permission gates, posting engine, journal history, reconciliation tables, matching scorer, Banking workspace/drawers, account/journal refresh paths, and feature gates. The current workspace only reads statement rows; the real suggestions call does not supply candidates; category posting double-increments the cached bank balance; and status/close calculations are inconsistent. Reuse and repair these seams instead of introducing parallel source writes.

### Design verdict

The desired screen concept is clear enough for implementation planning, but visual polish waits until the server contract and states are final. No visual mockup binary or browser tool was available for rendering the rough sketch in this session.

## Engineering review — CRITICAL financial workflow

### Architecture and source of truth

Use immutable posted `journal_entries` and `journal_lines`, joined to the bank account's ledger account, as the authoritative book-movement source. Do not emit shadow bank transactions from each business module. Create a stable movement identity at the journal-line (or equivalent canonical movement) boundary, preserving source IDs for navigation and old matches. Journals may contain multiple bank lines; multiple source documents may share a journal. Exclude drafts and non-bank lines. Model transfer legs independently by account, gateway clearing separately from a later bank payout, and tax/withholding by actual bank movement rather than gross document value.

The shared reconciliation projection must define status, outstanding book activity, allocation totals, exception counts, statement/date cutoffs, and balance equation once. Use it from Banking, DashboardSummaryService, ReportWorkspaceService, and PeriodCloseService. Reconciliation status affects attention/close only; it must never affect posted GL inclusion in balances or financial reports.

### Current code findings

- `BankAccountWorkspace.tsx` receives `journalEntries` but does not use them; workspace lists statement evidence only.
- `BankReconciliationService.getWorkspace` selects only `bank_statement_transactions`.
- The UI's suggestions request has no candidate payload while the controller passes an empty candidate list; scorer is otherwise supplied-candidates only.
- Categorization posts through `ServerPostingEngine.postEntry`, which updates the bank cache, then separately increments that cache again in reconciliation code.
- Summary/close logic recognizes too few states; close is not fully atomic and does not reliably set the reconciled-through date.
- `DashboardSummaryService` and `PeriodCloseService` only count `UNMATCHED` statement rows.
- `ReportWorkspaceService` treats statuses such as `RECONCILED` and `CATEGORIZED` as unmatched and can compare book balance at a later date with statement balance at an earlier date.
- Destructive/reversal guards often key off source IDs while new matching would key off journal/line identity. Generic journal reversal and manual-journal reversal lack a common allocation dependency guard.

### Invariants and data flow

- All writes are authenticated, tenant-scoped, permission-checked, idempotent, audited, and transactionally committed with journals, source documents, account cache, and audit events as applicable.
- Amounts use exact minor units; every allocation is positive, direction/currency/account compatible, within remaining capacity, and cannot allocate draft, voided, or otherwise ineligible activity.
- A match allocation does not post money. Add-from-statement invokes the appropriate existing posting workflow, and posting plus statement resolution link commits once or rolls back together.
- Match/unmatch, source edit, void, reversal, close, and reopen serialize against the same allocation/session invariants. Reconciled movement corrections require authorized audited unmatch/reopen and linked reversal; originals remain immutable.
- Historical document-level matches are preserved. Migrate only when a deterministic one-to-one journal-line mapping is proven; otherwise preserve as historical/non-allocatable and keep new writes gated until reviewed.
- Categorize/create must not double-update cached balances. Committed-write refresh failure must not invite a duplicate resubmission.
- Import duplicate controls are account/tenant/source aware and preserve the original evidence; uncertain duplicate detection is an exception, not silent deletion.

```text
Authenticated import -> preview + validation -> immutable statement rows
                                                   │
Posted business source -> posting engine -> journal line -> bank movement projection
                                                   │                 │
                                                   └─ suggestions ───┘
                                                           │ user confirmation
                                                           v
                                                  allocation + audit
                                                           │
                     shared reconciliation projection ─────┼──── Banking
                     (same cutoff/status semantics)        ├──── Dashboard
                                                           ├──── Reports
                                                           └──── Period close
```

### Phases and gates

1. **Preflight and compatibility:** identify the owner's first bank/sample format, inspect active/historical match links and posting paths, record permissions/feature gate and rollback. No new allocation writes if legacy identity is ambiguous.
2. **Read-only app-wide register:** implement a tenant-safe, permission-checked server projection of posted bank movements with source/reversal metadata; supply server-discovered candidates. Show evidence and books distinctly. Add read-side integration for all source paths without writing duplicated feed rows.
3. **Allocation model:** add stable line identity and additive allocation/session schema, safe legacy retention, database constraints/indexes, exact capacity validation, idempotency, locking, and authorized unmatch/reversal dependencies. Keep gate off until PostgreSQL concurrency and migration coverage pass.
4. **Resolution and posting repair:** explicit confirmation for match/categorization/add-entry; route create through existing source flows/posting engine; atomically link statement disposition and journal; remove duplicate cache increment; guard source edits/reversals across receipts, advances, expenses, refunds, payments, transfers, journals, treasury, gateway, recurring activity, and related aliases.
5. **Shared app state and close:** make the shared reconciliation projection power dashboard attention, bank reports, gateway payout state where applicable, and period close; align cutoffs; compute outstanding book movements and permitted dispositions; atomic close/reopen plus audit.
6. **First-format completion:** validate preview/mapping/control totals against one sanitized real export; test representative 50–100-line workflow, responsive/accessible exception handling, observability, rollback, and feature gate. Do not advertise unsupported formats.

### Verification plan (required before implementation completion)

Do not run checks during this planning-only review. Implementation checks should include focused unit tests, API/service integration tests, PostgreSQL migration and concurrency tests, and the repo's relevant lint/build/e2e subset. Financial integrity tests must prove:

- receipts, advances, refunds, vendor payments, expenses, reimbursements, transfers, journals, treasury, gateway payouts, fixed assets, recurring entries, and reversals appear exactly once when and only when posted to the selected bank ledger;
- drafts/non-cash invoices/bills/clearing balances do not appear as bank movement; actual fee/withholding/net amount is used;
- import and match do not alter GL, AR/AP, tax, P&L, customer/vendor balances; add-entry uses ordinary postings;
- retries, duplicate imports, concurrent matches, multi-allocation, partial allocations, reversals, source edits, period locks, tenant switches, permissions, and audit failures are safe;
- statement opening/closing arithmetic, sign convention, cutoff dates, outstanding book items, ignored/duplicate/invalid/review-required lines, zero difference, and unresolved line count agree across Banking/dashboard/report/close;
- failure injection between source posting, allocation, balance-cache update, and audit rolls back atomically and avoids duplicate resubmission;
- a reconciliation match cannot bypass a source or generic journal reversal guard.

Passing tests do not replace direct assertions for these invariants. Required release gates: Sol architecture design (completed), Sol reviewer PASS on actual implementation, PostgreSQL integration/concurrency evidence, validated sample format, and optional-feature certification.

### Failure and recovery registry

| Failure | User-visible result | Recovery / invariant |
|---|---|---|
| Unsupported or malformed file | Preview lists row/column errors; nothing is imported | Correct mapping/file and retry; no partial silent import |
| Duplicate/possible duplicate import | Existing evidence is linked or row is flagged | Preserve original; user resolves ambiguity |
| Candidate query unavailable | Lines stay visible as needs review | Retry candidate discovery; do not lose evidence or post |
| Match race/over-allocation | One request succeeds; competing request receives conflict and refreshed remaining amount | Transaction lock and idempotency; never exceed line/movement capacity |
| Posting/audit/cache failure | Entire create operation fails or exposes committed status clearly | Atomic rollback where possible; if commit succeeded, refresh by operation ID before offering retry |
| Historical match cannot map to journal line | Legacy history remains viewable but excluded from new allocation capacity | Feature gate remains off for writes until an explicit migration resolution |
| Source edit/reversal touches allocated movement | Block with actionable link to authorized unmatch/reopen path | Preserve original/reversal chain and audit |
| Statement and GL cutoffs differ | Report identifies mismatch; no misleading reconciliation conclusion | Apply the same date boundary and show outstanding later/earlier book activity |
| Close has unresolved item or non-zero explained difference | Close reports exact lines and reason; policy determines block vs explicit disposition | No implicit reconciliation from zero balance alone |
| Tenant/permission/period check fails | No cross-tenant disclosure or mutation; clear authorization/lock result | Audit denied action where policy requires; safely refresh context |

### Error / rescue mapping

| Operation | Expected errors | Rescue behavior |
|---|---|---|
| Import preview/confirm | Invalid schema, unmapped columns, bad date/currency, duplicate source, row parse errors | Preview row diagnostics; idempotent confirm; preserve original import evidence |
| Candidate lookup | No candidates, stale source, unavailable query | Empty state distinct from failure; refresh and retain line status |
| Match allocation | Stale capacity, wrong account/direction/currency, duplicate request, closed period | Conflict/validation response with current state; never silently pick another movement |
| Add from statement | Permission/period lock, validation, posting or audit failure | Source-form errors; transaction rollback; retry-safe operation identity |
| Close/reopen | unresolved dispositions, difference, lock contention, period closed, unauthorized reopen | Return blocking rows/calculation; retry from refreshed state; audited transition only |

## Developer experience review

The owner workflow is not developer DX in the narrow CLI sense, but a complex cross-module financial capability has implementation DX implications. The main friction today is finding each posting source, establishing which journal line is actual bank cash, then separately interpreting reconciliation states in dashboard/report/close. The shared projection and explicit acceptance matrix reduce rediscovery and prevent per-module implementations from drifting. No numeric DX score is claimed because the dedicated design/DX binaries were unavailable and no live developer journey was run.

### Developer-facing plan quality improvements

- Keep the register query, reconciliation status projection, and allocation/dependency contracts centralized and documented.
- Publish a source-path matrix and named invariants before splitting implementation tasks.
- Add fixtures for one shared-journal receipt/advance, two-leg transfer, gateway clearing/payout, fees/withholding, recurring draft/post, and historical match with no deterministic mapping.
- Provide migration rollback strategy that disables new writes while preserving evidence and posted journals.
- Make feature gates and optional certification explicit in the release checklist.

### DX scope

No new CLI or external developer product is required. Improve internal implementation and supportability through centralized contracts, trace IDs/idempotency responses, row-level diagnostics, operational counters for imported/matched/review/exception states, and reconciliation audit trails. Avoid introducing a second API/model vocabulary for every business module.

## Dual-model review record

- **Luna (exploration and specification review):** confirmed the core UI/service candidate gap; independently reviewed the revised specification at 9/10, then noted opening-balance and partial-allocation cases, which were incorporated.
- **Sol6 `sol_architect`:** reviewed as CRITICAL financial architecture; approved the posted-GL projection as the shared integration seam and identified reversal-guard bypass, inconsistent dashboard/close/report status semantics, legacy link compatibility, and source-path edge cases. Those are captured above.
- **Sol6 `sol_reviewer`:** reviewed the implementation diff and returned `REQUIRES_FIXES`; the final report identifies the unavailable confirm-match/add-missing-entry workflow and missing PostgreSQL qualification as blockers. A follow-up review also caught parser order and recovery-provenance gaps, which are now addressed in code and focused tests; those latest changes still require a final review.
- Claude voice and gstack design/DX binaries were unavailable in this environment. The user-requested Sol6/Luna6 workflow was used; no Claude, mockup rendering, or final Sol review is claimed.

## Decision audit trail

| Decision | Choice | Basis | State |
|---|---|---|---|
| Product scope | Full app-wide reconciliation consistency | User said not to treat as a single page | User-directed |
| Bank data | File import only; no live connection | Explicit user constraint | User-directed |
| Unmatched lines | Explicitly add through normal posting flow | User said add missing entries | User-directed |
| Match automation | Suggestions, human confirmation | Accounting trust and error cost | Auto-decided |
| Source of truth | Posted GL lines plus separate statement evidence | Repository invariant | Auto-decided |
| First format | One sample-validated bank export | Bank/file unknown; avoid unsupported promises | Auto-decided |
| Legacy mappings | Preserve ambiguous history; migrate only deterministic links | Prevent corruption/over-allocation | Auto-decided |
| Close policy | Require fully resolved rows or explicit allowed disposition and explainable difference | User wants lines resolved before close | Auto-decided; close policy must honor existing app rules |
| CA collaboration | Defer | Future possibility only | Auto-decided |
| Phase order | Read-only register → allocation → posting/resolution → shared close/report | Prevent unsafe writes before invariants | Auto-decided |

## Cross-phase themes

1. Completeness and traceability recur in product, design, engineering, and workflow/supportability: imported evidence must never disappear from counts or queues.
2. A shared ledger/status contract is necessary across modules and user-facing surfaces; local page-specific logic would create conflicting financial answers.
3. Human-confirmed, reversible workflow boundaries reduce the cost of uncertain bank descriptions and candidate ambiguity.

## User challenges and taste choices

No user-direction challenge was raised by Sol or Luna. The core premise was approved by the owner before Autoplan continued. Key automated choices are listed in the decision audit trail; first-bank format and sanitized sample are implementation prerequisites, not reasons to narrow app-wide architecture.

## Aggregated implementation tasks

- [ ] P1 — Inspect/migrate historical reconciliation links to stable journal-line movement identity without guessing; keep write feature gate off if unresolved.
- [ ] P1 — Build tenant-safe server bank-movement projection from posted GL lines and wire all source paths to it without duplicate rows.
- [ ] P1 — Centralize matching, allocation, disposition, outstanding-book, cutoff, and close semantics; repair candidate discovery and summary/report/close consumers.
- [ ] P1 — Add safe allocation schema/transactions/idempotency/locks and unified edit/void/reversal dependency guards.
- [ ] P1 — Repair double bank-cache increment and atomically create/link missing transactions through existing posting workflows.
- [ ] P1 — Validate first real file format; complete 50–100-line workflow and permission, financial-integrity, concurrency, and responsive checks; obtain Sol reviewer PASS.
- [ ] P2 — Add operational counters/traceability and an accountant-friendly audit navigation path that can support future CA use without adding collaboration scope now.

## Approval gate

Owner explicitly approved implementation on 2026-09-27. This does not waive critical financial verification gates. The only known launch prerequisites that need owner-provided data are the first bank and a sanitized statement export; until provided, do not claim format coverage beyond verified parser behavior.
