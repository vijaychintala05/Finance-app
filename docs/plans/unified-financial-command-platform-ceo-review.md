---
status: ACTIVE
review: plan-ceo-review
date: 2026-09-12
branch: nas-deploy
mode: SCOPE_EXPANSION
base: main
candidate: 5f517b4
---

# CEO Plan: Unified Financial Command Platform

## Verdict

FirmBooks should become a trustworthy daily finance operating system, not a collection of screens that independently write accounting data. The current release candidate contains valuable banking, invoice, payment, and document-output work, plus follow-up QA compatibility fixes. It should become the first migration slice of a platform that has one authoritative command boundary, one evidence trail, and one release-certification process.

The product outcome is simple: an owner can see what cash is in the bank, understand which invoices are paid, and explain every reported number without guessing whether an action succeeded.

## Vision

### 10x Check

The ideal experience is a calm financial cockpit. Bank statements arrive as evidence. FirmBooks identifies overlaps and proposes matches but never invents an expense. A user approves a meaningful action, receives a durable result, and can open any balance, invoice, or PDF to see the source documents, journal lines, approval, and reconciliation evidence behind it.

### Twelve-Month Direction

```text
CURRENT
multiple UI surfaces and mutation paths
        |
        v
THIS PROGRAM
one command ledger, evidence graph, trustworthy workspaces
        |
        v
IDEAL
bank evidence -> controlled commands -> double-entry ledger
              -> explainable documents, reports, and operations queue
```

## Accepted Scope

1. A unified server-side financial command platform.
2. A durable `financial_commands` ledger and typed, versioned command receipts.
3. A typed financial-error contract with status recovery for uncertain outcomes.
4. An append-only evidence-link graph across documents, journals, bank evidence, attachments, approvals, and corrections.
5. Versioned lifecycle definitions and server-side transition guards.
6. Command-internal policy enforcement for tenancy, RBAC, approvals, and locks.
7. A real-PostgreSQL command-certification suite and golden-ledger fixtures.
8. Transactional-outbox-driven read models, projection freshness, and query budgets.
9. Structured operational events, support lookup, alerts, and a deploy-readiness panel.
10. A release registry with shadow parity, canary, default-on, retirement, and rollback states.
11. A statement-first banking workspace with explicit human matching and categorization.
12. A universal financial document workspace and shared desktop/mobile finance interaction system.
13. Versioned internal contracts and audited export formats; no public integration API in this program.
14. A staged strangler migration; legacy paths become read-only only after parity evidence.

## Explicitly Out Of Scope

- Public API, third-party webhooks, SDKs, or partner authentication.
- Automatic categorization that posts without a user-approved command.
- Payment gateways, payroll, inventory valuation, or jurisdiction-specific filing.
- A big-bang rewrite or destructive modification of posted financial history.

## Architecture

### Target System

```text
React desktop/mobile workspaces
        |
        v
HTTP adapters / scheduled jobs / internal import adapters
        |
        v
FinancialCommandService
  |-- CommandPolicyRegistry
  |-- LifecycleRegistry
  |-- Idempotency and command receipt store
  |-- Domain command handlers
  |-- ServerPostingEngine
  |-- EvidenceLinkService
  |-- Audit and transactional outbox
        |
        v
PostgreSQL transaction
  source documents + allocations + journal entries/lines + evidence links
  command receipt + audit event + outbox event
        |
        v
Projection workers
  banking overview | operations queue | document timeline | dashboard totals
```

### Command Data Flow

```text
happy path
request -> validate -> authorize -> lock -> persist source + journal + evidence
        -> commit -> command receipt COMMITTED -> project -> UI refresh

missing input
request -> validate -> receipt REJECTED(INPUT_INVALID) -> safe field feedback

empty input
request -> validate -> receipt REJECTED(EMPTY_ALLOCATION_OR_STATEMENT) -> no posting

upstream/connection failure
request -> receipt PENDING/UNKNOWN -> client retrieves command by idempotency key
        -> COMMITTED result or retryable failure; never duplicate-post
```

### Lifecycle Contract

```text
Financial command
RECEIVED -> VALIDATING -> EXECUTING -> COMMITTED
                    \-> REJECTED
COMMITTED -> COMPENSATING -> COMPENSATED

Posted financial document
DRAFT -> APPROVAL_REQUIRED -> APPROVED -> POSTED -> REVERSED

Bank statement evidence
IMPORTED -> REVIEW -> MATCHED | CATEGORIZED | IGNORED

Only CATEGORIZED invokes a posting command.
MATCHED links evidence to an existing accounting transaction and never creates a new expense.
```

## Error and Recovery Contract

| Code family | Example | User experience | System response |
|---|---|---|---|
| `INPUT_INVALID` | Non-positive amount | Explain invalid field | Persist rejected receipt; no journal |
| `PERIOD_LOCKED` | Posting in closed period | Explain restriction and next action | No mutation; audit denied attempt |
| `DUPLICATE_IMPORT` | Re-uploaded statement row | Show existing evidence and review link | Preserve original; no duplicate row |
| `ALREADY_MATCHED` | Categorize matched bank row | Explain current linkage | No second command |
| `UNAUTHORIZED` | Cross-tenant document reference | Generic access denial | Security event with correlation ID |
| `OUTCOME_UNKNOWN` | Timeout after server commit | "Checking result" state | Fetch command receipt by idempotency key |
| `PDF_RENDER_FAILED` | Template/render failure | Document remains available; retry PDF | Operational event and retryable receipt |

No financial controller may convert these outcomes into a generic success, an unverifiable alert, or a silently swallowed exception.

## Evidence Graph

```text
financial_command
  -> source document
  -> journal entry -> journal lines
  -> audit event
  -> outbox event

bank statement transaction -> reconciliation match -> financial command
invoice/expense/bill -> receipt/attachment
reversal/correction -> original command + original journal
```

`financial_evidence_links` is tenant-scoped and append-only. Corrections add a relation to the original record; they never rewrite the original chain.

## Banking Product Contract

- Accept CSV, XLS, and XLSX statements only for the current release path.
- Keep original import metadata, mapping, fingerprint, import window, actor, and import command receipt.
- Mark exact overlaps as duplicates and possible overlaps as an explicit review queue.
- Show each bank account's book balance, statement balance, date basis, difference, and outstanding review count.
- Never create an expense merely because a statement row was imported or matched.
- Categorization must show the proposed ledger effect before confirmation and create a balanced command only after explicit approval.
- Reopen, unmatch, reverse, and ignore actions must have evidence and permissions.

## Universal Document UX Contract

Every invoice, bill, expense, payment, and journal uses the same workspace structure:

```text
Header: state + reference + amount + only valid actions
Tabs: Details | Payments/Allocations | Accounting | Attachments | Activity
Footer: command receipt / projection freshness / safe next action
```

The UI distinguishes evidence, proposals, and posted outcomes. It uses correction/reversal flows for posted records, not unsafe editing. Print/PDF output derives from the same authoritative document read model and retains a visible source reference.

Financial records open in stable, URL-addressable full-page workspaces. A quick-create or lightweight preview may use a modal, but accounting review, attachments, activity, corrections, print, and recovery never depend on an oversized overlay. Desktop lists retain their selection and return position; mobile uses a clear back action to return to the originating list.

### Required Interaction States

| Feature | Loading | Empty | Error | Success | Partial / stale |
|---|---|---|---|---|---|
| Document workspace | Header and tab-content skeletons; actions remain unavailable | Explain the missing/archived record and return to the source list | Inline recovery panel with safe message, `commandId`, and reload/back action | Compact status strip under the header; transient toast only for low-risk confirmation | Status strip shows saved fact versus pending activity/projection, plus last-known freshness |
| Attachments | Fixed-size placeholders | Evidence panel says no files are attached and offers one upload/drop action | Per-file error with retry/remove; valid files remain visible | Thumbnail/file row appears with uploaded timestamp and source | Upload queue labels each file as pending, uploaded, or failed |
| Bank overview | Table-row skeletons and stable columns | Explain that no bank account/statement exists and offer add account or import statement | Inline retry panel without replacing prior good data | Import/reconciliation result appears in the affected account row | Last successful balances stay visible with a freshness label and refresh action |
| Bank account workspace | Statement-table skeletons; toolbar stays fixed | Explain no statement has been imported; primary action is import CSV/XLS/XLSX | Inline workspace panel with retry and preserved filters | Match/categorize result updates only the affected row | Import/review counters distinguish imported, duplicate, candidate, and unresolved rows |

Financial command status is persistent contextual UI, not an alert-only side effect. The header status strip contains the safe explanation, command receipt reference, and a specific reload/retry/review action. Toasts never carry the only explanation for a committed or uncertain financial outcome.

### Role-Aware Financial Operations Center

All roles can access the shared financial overview permitted by their membership, but the first screen orders work by the user's responsibility:

| Role / job | First things shown | First safe action |
|---|---|---|
| Owner | Cash position, overdue receivables/payables, period margin, material exceptions | Open the exception or shared overview; no implied approval or posting right |
| Accountant | Reconciliation queue, period locks, approvals, unmatched statement activity, missing evidence | Resolve/review the next permitted accounting task |
| Operations | Assigned draft documents, requested evidence, payment collection follow-up, next valid action | Continue the assigned document workflow |

The user can always switch to the shared overview. This is ordering and wayfinding, not a different financial truth per role.

| Journey step | User does | Intended feeling | Interface support |
|---|---|---|---|
| Arrives | Opens the app | Oriented within five seconds | Role-aware priority queue, clear as-of time, shared-overview escape route |
| Identifies work | Scans exceptions or assigned work | Focused, not overwhelmed | One primary queue and compact financial summary, not a card mosaic |
| Reviews a record | Opens a document or bank row | Certain where the facts came from | Stable full-page workspace, visible state/reference/evidence/activity |
| Takes action | Posts, matches, requests evidence, or reverses | Confident but appropriately cautious | Only valid actions are prominent; risky actions explain their consequence |
| Encounters a problem | Sees a delay, error, conflict, or stale projection | Recoverable, never blamed | Contextual status strip, preserved work, command ID, concrete retry/review path |
| Returns later | Reopens the record or queue | Trust that history remains intact | URL-addressable workspace, durable activity trail, recognizable state |

### Visual Hierarchy and Density

FirmBooks is an application workspace, not a marketing surface. The primary visual pattern is a calm data canvas:

- Banking overview: one concise summary band followed by a dense, sortable account table.
- Bank account: stable toolbar, status tabs, filter/search row, and transaction ledger grid.
- Document workspace: structured header, command area, tab rail, and an unframed working body.
- Operations Center: one priority queue and one compact summary region; no dashboard-card mosaic.
- Cards are reserved for a compact summary, a genuine standalone tool, or an empty-state call to action. They are never used as nested page sections.
- Decorative icon circles, large gradients, thick borders, and status-chip clutter are excluded. Status color supports labels and never becomes the only signal.

### Workspace Design Tokens

New financial workspaces reuse the existing IBM Plex Sans reading face and IBM Plex Mono with tabular numerals for financial values. They use a restricted token set:

- 4 px spacing increments; 8 px maximum radius for controls, tables, and panels.
- Canvas, surface, and muted-surface layers only, separated by one hairline border or spacing, not stacked shadows.
- Body text is at least 16 px; supporting metadata may be 12 px only when contrast remains at least 4.5:1 and it is never the sole source of meaning.
- One primary action color and a small semantic set for success, warning, danger, and informational state. Color always accompanies text or an icon label.
- Monetary values are right-aligned, tabular, and stable-width; headings use sentence case and labels remain visible after input contains a value.
- New components consume these tokens. Legacy components are not visually rewritten unless the implementation touches their workspace.

### Responsive and Accessibility Contract

| Viewport | Navigation | Workspace layout | Action behavior |
|---|---|---|---|
| Desktop, 1024 px and wider | Persistent sidebar and top search | Data canvas with stable toolbar and table/document body | Primary action in the command area; related secondary actions in an explicit overflow menu |
| Tablet, 768–1023 px | Collapsible sidebar with persistent page identity | Full-width canvas; columns hide only by established priority | Command bar wraps without changing action order |
| Mobile, below 768 px | Five-item bottom bar: Dashboard, Sales, Purchases, Accounting, More | Full-page document/bank workspace with a back action, compact header, and horizontally scrollable labelled tabs | Sticky bottom bar exposes one valid primary action plus labelled overflow; never hides an enabled destructive action |

- Transaction tables retain compact rows on mobile. A row opens its full workspace; it is not replaced with a stack of decorative cards.
- Every interactive target is at least 44 by 44 px. Keyboard focus is visible, follows visual order, and returns to the originating row when a workspace closes.
- Tabs use semantic tab roles, tables expose header relationships, status has text plus non-color indication, and errors use an announced `role="alert"` region.
- Long names wrap or truncate with an accessible full label; monetary values do not wrap or shift column width.

### Bank Review Interaction

Selecting a statement row preserves the source evidence. On desktop, the transaction ledger remains visible with the selected row pinned while a right-side review panel presents source details, candidate matches, match rationale, and only the permitted match/categorize/transfer/review actions. On mobile, that same review opens as a full-page route with a back action, preserved source reference, and sticky valid-action control. Modals are not used for bank matching or categorization.

## Performance Contract

- Financial command writes remain synchronous and fully transactional.
- Derived operational views may be projected asynchronously through the transactional outbox.
- Every read model exposes its freshness/version when it can lag.
- Add organization-scoped indexes and query budgets for account/date/status/document lookups.
- Require query-count and latency tests for banking overview, operations queue, document timelines, and dashboard totals.

## Security Contract

Every command validates tenant ownership, command-specific permission, approval/self-approval policy, recovery lock, period lock, document state, and references to all dimensions/attachments. The check lives inside `FinancialCommandService`, not only in HTTP routes, so a scheduled job or future integration cannot bypass it.

## Engineering Review Decisions

### Transaction and Command Boundary

- Legacy routes retain their current idempotency middleware transaction boundary during staged migration. This is an intentional compatibility constraint, not the final architecture.
- A command-family compatibility adapter passes the middleware-owned transaction client into `FinancialCommandService`; it must not open a second transaction.
- Within that one transaction, the adapter writes the idempotency outcome, `financial_commands` receipt, business document mutation, balanced journals, audit record, evidence links, and outbox events.
- Each receipt stores a typed `command_type`, immutable redacted canonical payload, payload hash, `schema_version`, result version, correlation ID, and terminal result. Compatible historical payloads use explicit upcasters; unsupported versions fail safely with a recovery code.

### Delivery and Read Models

- Commands publish through a PostgreSQL transactional outbox. Relay workers claim records with `FOR UPDATE SKIP LOCKED`; handlers must be idempotent and checkpointed. The guarantee is at-least-once delivery with rebuildable projections.
- Banking uses an organization-scoped workspace projection, built from canonical records and backfilled before cutover. The projection provides fast balances, import status, attention counts, and reconciliation state without making it a financial source of truth.
- Dashboard and banking reads target p95 below 400 ms for normal organizations. Projection freshness is displayed and alerts at more than 60 seconds; imports are chunked/streamed rather than loaded wholesale.

### Banking Integrity

- Statement rows use a tenant-and-bank scoped source fingerprint with a uniqueness constraint. Preview and confirmation validate fingerprints in bulk.
- Near matches caused by edited descriptions or references remain explicit duplicate candidates. They are never silently merged.
- Bank evidence remains bank evidence until an approved match, categorization, or transfer command creates an explicit accounting link.

### Code Boundaries

- The universal document workspace is composed from `DocumentShell`, `DocumentCommandBar`, `DocumentActivity`, `DocumentAttachments`, `DocumentPrint`, and a typed document-specific details panel. New document types supply data and allowed actions rather than duplicating layouts.
- Banking code separates `BankStatementImportService`, `BankReconciliationCommandService`, `BankWorkspaceQueryService`, and `BankMatchEngine`, with shared repositories/query helpers.
- Controllers translate domain failures through one typed command-error mapper: stable error code, user-safe message, retry/reload guidance, and `commandId`. Raw database errors never reach the UI.

### Certification

- Critical accounting and banking suites run against PostgreSQL 16 in CI with an isolated schema per worker, migrations, lock/concurrency tests, and the existing fast tests retained for feedback.
- Versioned organization-level scenario fixtures include commands, documents, journal lines, statement rows, attachments, locks, expected reports, and evidence paths. They can replay through migrations and recovery drills.

## Design Review Decisions

### What Already Exists

- `DESIGN.md` establishes a calm, precise, conservative finance product where server-confirmed facts outrank optimistic UI.
- `src/index.css` already provides IBM Plex Sans, IBM Plex Mono with tabular numerals, and foundational color tokens.
- `BankAccountWorkspace`, `BankingOverviewTable`, `ExpenseDetailsModal`, and the existing receipt/voucher work provide migration leverage. `InvoicePreviewModal` is a migration source, not a shared component to extend.

### Approved Workspace Direction

- Financial documents are full-page, URL-addressable workspaces. Quick create and lightweight preview may remain modals; detailed review does not.
- The first post-login view is a role-aware Financial Operations Center that reorders the same permitted facts by the user's responsibility.
- Workspace state is persistent and contextual. Header status strips explain saved, stale, failed-refresh, and action-required states with a command ID and recovery action; toasts are never the only record of a financial outcome.
- Banking and document surfaces are calm data canvases. Summary bands earn their space; tables, ledgers, and structured headers are primary. Decorative card grids, nested panels, icon circles, and status-chip clutter are excluded.
- New work uses IBM Plex Sans, tabular IBM Plex Mono, 4 px spacing increments, 8 px maximum radii, one hairline border, three surface levels, accessible text sizes, and limited labeled semantic states.
- On mobile, the app uses the five-item bottom bar and full-page workspaces. Wide tables retain compact rows that open detail workspaces rather than becoming decorative card stacks.
- Bank matching/categorization keeps statement context visible: desktop uses a pinned selected row plus right-side review panel; mobile uses a full-page review route.

### Explicitly Deferred Design Work

- App-wide conversion of every legacy screen to the workspace visual system is a tracked P2 follow-up. The command-platform release changes only workspaces it touches, preventing a risky global UI rewrite.

## Certification and Test Plan

Each command family must pass real PostgreSQL certification before promotion:

```text
valid command
missing / empty inputs
same idempotency key replay
same key with changed payload
concurrent identical and conflicting submissions
cross-tenant attempt
period/recovery lock denial
transaction failure rollback at every write stage
balanced journal + source/subledger reconciliation
correction/reversal parity
desktop and mobile primary journey
```

Golden-ledger fixtures record expected command receipts, evidence links, journal lines, balances, and reconciliation outcomes for deterministic release comparison.

## Release and Rollback

```text
SHADOW
  -> compare legacy and new command outcomes, legacy remains authoritative
CERTIFIED
  -> PostgreSQL + browser + parity gates pass
CANARY
  -> selected organization uses new path
DEFAULT_ON
  -> new path is standard; legacy is read-only
RETIRED
  -> legacy mutation path removed after retention window
```

Rollback changes the command-family flag to the previous certified path. It does not delete commands, evidence, journals, or migrations. Every NAS promotion reports migration version, enabled command families, command-error rate, outbox lag, and `readyz` health.

## Implementation Tasks

- [ ] **T1 (P0)** — Create the command platform schema and kernel.
  - Files: `server/src/database/`, `server/src/accounting/`, `server/src/middleware/`
  - Deliver: `financial_commands`, typed receipt/error model, correlation IDs, lifecycle registry, and a compatibility adapter that uses the existing idempotency transaction client.
  - Verify: PostgreSQL transaction, replay, and failure-recovery suites.
- [ ] **T2 (P0)** — Add command-internal policy enforcement and append-only evidence links.
  - Files: `server/src/access/`, `server/src/accounting/`, `server/src/database/`
  - Deliver: policy registry, evidence-link service, cross-tenant/lock/approval denial coverage.
  - Verify: permission matrix and evidence immutability tests.
- [ ] **T3 (P0)** — Migrate expenses, invoices, payments, bills, and reversals through staged adapters.
  - Files: `server/src/controllers/financeController.ts`, `server/src/sales/`, `server/src/purchases/`, `server/src/services/ExpensePostingService.ts`
  - Deliver: shadow/parity comparison and per-family cutover flags.
  - Verify: golden-ledger parity against legacy commands.
- [ ] **T4 (P0)** — Complete statement-first banking on the platform boundary.
  - Files: `server/src/banking/`, `server/src/controllers/bankingController.ts`, `src/components/banking/`
  - Deliver: import evidence, fingerprint uniqueness, bulk overlap review, explicit match/categorize/reverse behavior, account workspaces, and a rebuildable query projection.
  - Verify: CSV/XLS/XLSX overlap and no-auto-expense certification.
- [ ] **T5 (P1)** — Build command projections and the Financial Operations Center.
  - Files: `server/src/services/`, `server/src/database/`, `src/components/dashboard/`, `src/components/`
  - Deliver: `FOR UPDATE SKIP LOCKED` outbox relay, idempotent projector checkpoints, freshness indicators, attention queue, role-aware priority ordering, query budgets, and replay tools.
  - Verify: projection replay, lag, dashboard/banking performance tests, and owner/accountant/operations information-hierarchy checks.
- [ ] **T6 (P1)** — Create the universal financial document workspace.
  - Files: `src/components/invoices/`, `src/components/expenses/`, `src/components/purchases/`, `src/components/journals/`
  - Deliver: URL-addressable `DocumentShell`, command bar, activity, attachment, print primitives, typed detail panels, persistent command-state strip, and valid-action policy.
  - Verify: desktop/mobile workflows, keyboard/focus, screen-reader states, return-to-list behavior, and print/PDF visual checks.
- [ ] **T7 (P1)** — Consolidate authoritative document/PDF rendering.
  - Files: `server/src/services/InvoicePdfService.ts`, `server/src/services/ExpensePdfService.ts`, document read models.
  - Deliver: shared templates, source references, render receipts, retryable delivery failures.
  - Verify: PDF content, multi-page, print, and failure-retry tests.
- [ ] **T8 (P0)** — Establish the PostgreSQL command-certification harness.
  - Files: `server/src/tests/`, CI workflows, deploy scripts.
  - Deliver: PostgreSQL 16 CI service, isolated schemas, golden scenario fixtures, concurrency tests, migration compatibility tests, and release artifact.
  - Verify: required CI gate on every command-family promotion.
- [ ] **T9 (P0)** — Add the release registry and NAS promotion controls.
  - Files: `server/src/database/`, `server/src/services/`, `.github/workflows/`, `deploy/nas/`
  - Deliver: family states, parity report, canary controls, readiness panel, rollback procedure.
  - Verify: staged deploy/rollback rehearsal on a PostgreSQL copy.
- [ ] **T10 (P1)** — Publish the private internal data-contract and audited export specification.
  - Files: `docs/`, `server/src/`
  - Deliver: versioned command and export schemas; no public endpoint commitment.
  - Verify: compatibility tests across two schema versions.
- [ ] **T11 (P2)** — Migrate remaining legacy finance UI to workspace design tokens.
  - Files: `src/components/`, `src/index.css`
  - Deliver: remove legacy rounded-card mosaics, tiny body text, and inconsistent status/chip treatments as each remaining financial workspace is revisited.
  - Verify: desktop/mobile visual regression and accessibility review per migrated workspace.

## Notable Existing Leverage

- `ServerPostingEngine` already supplies balanced journal-posting primitives.
- `ExpensePostingService`, `SalesEngine`, and banking services contain valuable domain validation that should move behind adapters rather than be discarded.
- Existing idempotency middleware, audit logs, trusted-feature flags, and PostgreSQL migration infrastructure are foundations to consolidate.
- The current statement import, payment allocation, and PDF services are first migration slices, not parallel product subsystems.

## Risks

- A broad migration can accidentally create two posting paths for one business action. Shadow parity is mandatory before cutover.
- Existing NAS releases have shown schema/image drift. Release registry evidence and live readiness must be a gate, not documentation.
- `pg-mem` cannot certify row locks, triggers, or real migration behavior. PostgreSQL is required for promotion.
- UI work must not expose a command until its family is certified; visible-but-unavailable actions erode accounting trust.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 1 | COMPLETE | 10 accepted platform decisions |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | COMPLETE | 12 accepted execution decisions, including staged compatibility, PostgreSQL certification, outbox projections, and banking query contracts |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | COMPLETE | score: 6/10 to 10/10, 8 decisions |

**VERDICT:** CEO, engineering, and design gates are complete. The unified command-platform program is ready for staged implementation, beginning with the command kernel and certified first command family.

NO UNRESOLVED DECISIONS
