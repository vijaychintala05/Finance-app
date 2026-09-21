<!-- /autoplan restore point: C:/Users/HI/Desktop/APP/finance app/.gstack/autoplan-restores/main-autoplan-restore-20260922-020000.md -->

# FirmBooks: Zoho-Competitive Module Audit and Improvement Program

Date: 2026-09-22  
Branch: `main`  
Inspected commit: `20635ea` plus an existing user-owned dirty worktree.  
Status: REVIEW IN PROGRESS. Plan and evidence only until the approval gate.

## User Goal

Make FirmBooks competitive with Zoho Books by auditing every product module point by point across product scope, UI, UX, architecture, business logic, accounting correctness, security, reliability, performance, observability, tests, documentation, and developer experience.

## Phase 0: Intake

FirmBooks is already a large multi-organization accounting application: 542 TypeScript/TSX files and roughly 145,716 source/test lines across 24 frontend component domains, 49 backend services, 151 server test files, and 11 end-to-end files. The correct strategy is not a greenfield rewrite. It is an evidence-based parity program that preserves the trustworthy accounting core, removes parallel implementations and oversized modules, closes high-value workflow gaps, and raises every visible workflow to a consistent quality bar.

### Scope detection

- UI scope: **yes**. The goal explicitly covers every screen, workflow, responsive state, and interaction.
- DX scope: **yes**. The goal includes architecture, APIs, error handling, tests, setup, and developer documentation.
- Comparison target: **Zoho Books for India**, not the separate Zoho Analytics BI product. This is a working assumption for the premise gate.

### Current product modules

1. Dashboard and global navigation
2. Organizations, identity, sessions, MFA, users, roles, and permissions
3. Customers, vendors, salespersons, and item master data
4. Quotations, sales orders, delivery challans, invoices, customer receipts, credits, refunds, and recurring sales
5. Purchase orders, goods/service receipts, bills, vendor payments, advances, credits, and recurring purchases
6. Expenses, receipt evidence, reimbursements, and billable-cost recovery
7. Banking, statement import, rules, matching, categorization, transfers, and reconciliation
8. Chart of accounts, journals, approvals, transaction locking, period close, fixed assets, GST, settlements, and bulk operations
9. Projects, time logs, profitability, unbilled time/expenses, and billing
10. Reports, exports, saved views, schedules, and drill-downs
11. Documents, PDF templates, email/outbox, portal experiences, data migration, backup/recovery, audit, and security center
12. Platform operations: migrations, feature certification, idempotency, tenant isolation, observability, CI, deployment, and developer workflow

### Existing strengths to preserve

- PostgreSQL and posted double-entry journals are the stated financial source of truth.
- Financial mutations use tenant scoping, permissions, idempotency, transactional posting, audit evidence, locks, and reversals.
- The codebase already includes strong accounting, security, recovery, concurrency, and lifecycle test coverage.
- Mobile navigation and record layouts have recent browser evidence; core dashboard, receipts, bank posting, cash-flow reporting, lint, build, and 1,433 automated tests passed in the 2026-09-21 QA run.
- A calm, conservative design contract and authoritative-data rules already exist in `DESIGN.md` and `CLAUDE.md`.

### Current risks already evidenced

- Several architectural hotspots are too large: `financeController.ts` (4,037 lines), `SalesEngine.ts` (3,631), `PurchasesEngine.ts` (2,582), `BankReconciliationService.ts` (2,206), `BooksContext.tsx` (1,895), and multiple 1,000-2,800 line UI components.
- Parallel/legacy mutation paths and overlapping identity, approval, period-close, and reporting semantics remain a known risk.
- Local PostgreSQL-specific qualification is opt-in, but `.github/workflows/ci.yaml` does run `npm run test:postgres` against PostgreSQL 16. The remaining evidence gap is freshness and integration: the latest local QA did not run PostgreSQL, and Playwright CI still runs against the in-memory database rather than a production-like PostgreSQL configuration.
- `xlsx@0.18.5` remains a direct production dependency with a high-severity advisory and no upstream fix in the latest QA evidence.
- Zoho's current benchmark includes direct GST filing/e-invoicing/e-way bills, connected bank feeds, richer multi-currency, inventory/payroll, automation, portals, and a much broader report catalog. FirmBooks must separate parity-critical workflows from product-family expansions.
- The working tree already contains unrelated dashboard, reports, PDF, portal, money, banking, and UI edits. This audit will not overwrite or reformat them.

## Phase 1: Premise Challenge

### Premises requiring confirmation

| # | Premise | Assessment |
|---|---|---|
| P1 | “Zoho” means Zoho Books India, not Zoho Analytics. | Reasonable from the repository's accounting and GST focus, but only the user can confirm the intended benchmark. |
| P2 | Competitive quality means safer and easier completion of core accounting work before literal feature-count parity. | Recommended. A smaller trustworthy system beats a broad surface with uncertified financial paths. |
| P3 | FirmBooks should preserve its self-hosted/NAS and conservative accounting identity rather than copy Zoho's cloud architecture. | Recommended. This is a real differentiator and avoids a destructive platform rewrite. |
| P4 | The review may recommend large roadmap items, but implementation should proceed in small certified vertical slices. | Recommended. Every slice must include UI, API, domain logic, database, permissions, observability, and tests. |
| P5 | “Every module” includes hidden platform modules and failure states, not only visible navigation screens. | Required for an honest quality claim. |
| P6 | Existing user-owned uncommitted changes remain untouched unless a later approved implementation task directly requires coordination. | Required to preserve current work safely. |

### What already exists

| Sub-problem | Existing leverage |
|---|---|
| Accounting truth | `postingEngine.ts`, financial command services, exact-money utilities, ledger/report services |
| Sales and purchases | `SalesEngine`, `PurchasesEngine`, quotation and settlement services, lifecycle tests |
| Banking | statement parsers, rules, matching, reconciliation, treasury services |
| Access and trust | organization isolation, RBAC, MFA, session security, idempotency, audit trail |
| Reliability | recovery services, migration runner, integrity service, production readiness/runbooks |
| UI consistency | IBM Plex design tokens, shared empty/loading components, responsive navigation, existing workspace patterns |
| QA | Vitest, Testing Library, Supertest, Playwright, property tests, PostgreSQL qualification harness |

### Dream-state delta

```text
CURRENT
Broad, capable, heavily tested product with uneven module maturity,
large ownership hotspots, some overlapping paths, and partial production proof
  ->
THIS PROGRAM
One truthful capability catalog + point-by-point module contracts +
certified vertical slices + consistent workspace UX + real PostgreSQL gates
  ->
12-MONTH IDEAL
The best self-hosted accounting operations product for Indian SMBs:
Zoho-grade daily usability and workflow breadth, stronger auditability,
recoverability, data ownership, and explicit evidence for every financial claim
```

### Implementation alternatives

| Approach | Completeness | Effort | Risk | Decision |
|---|---:|---:|---:|---|
| A. Visual imitation of Zoho | 3/10 | Medium | High trust debt | Reject. It improves appearance without fixing workflow or accounting gaps. |
| B. Literal feature parity across all Zoho modules at once | 10/10 breadth | Very high | Extreme delivery and compliance risk | Defer as a roadmap, not one implementation batch. |
| C. Module-by-module parity matrix plus certified vertical slices | 9/10 | High but staged | Manageable | Recommended. It produces measurable progress without parallel unsafe systems. |

### Temporal interrogation

- **Hour 1:** freeze the benchmark, module inventory, evidence standard, and scoring rubric.
- **Hours 2-6:** review every module and cross-cutting platform layer; build prioritized gaps and acceptance tests.
- **First implementation lake:** fix P0/P1 trust, security, production-database, and misleading-state gaps.
- **Following lakes:** standardize workspaces and error states, decompose hotspots, then add selected parity features.
- **Long horizon:** pursue GST portal/e-invoice/bank-feed/inventory/payroll breadth only with domain, compliance, and operational ownership.

### Proposed mode

`SELECTIVE EXPANSION`: make the current product bulletproof and surface high-value Zoho-parity expansions separately. Do not silently add payroll, inventory, statutory filing, connected banking providers, or AI simply because Zoho offers them.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| 1 | Intake | Treat the target as Zoho Books India pending confirmation. | Taste | Explicit over clever | The repository is an India-focused accounting app; the benchmark must be named before scoring. | Ambiguous “Zoho” comparison |
| 2 | CEO | Prefer certified vertical-slice parity over a rewrite or visual clone. | Mechanical | Completeness + pragmatic | Preserves the strongest existing assets and closes user-visible gaps with evidence. | Visual-only clone; big-bang rewrite |
| 3 | CEO | Preserve self-hosted/NAS product identity. | Taste | DRY + pragmatic | Existing deployment, recovery, and data-ownership work is a differentiator. | Cloud-platform rewrite |
| 4 | CEO | Continue evidence collection while leaving market positioning unresolved. | Mechanical | Bias toward action | The static audit is reversible and helps choose the wedge; implementation priority will not assume the missing answer. | Stop all analysis at the premise gate |

## Point-by-point module scorecard

The first complete static pass is in [`zoho-module-scorecard-2026-09-22.md`](./zoho-module-scorecard-2026-09-22.md). It covers 56 workflows and platform areas across dashboard/navigation, identity/access, master data, sales, purchases, expenses, banking, accounting/compliance, projects/time, reports, documents/portals/recovery, and architecture/DX. Each row includes current state, diagnostic score, evidence gaps, and its highest-value improvement.

The scorecard is not production proof. Browser role/state testing, mutation-to-database tracing, PostgreSQL-backed critical E2E, performance measurements, accessibility checks, and a deployment-aware capability export remain required.

## Phase 1 Review Sections

### 1. Architecture review

The intended architecture is sound: React calls authenticated, tenant-scoped APIs; domain use cases commit source records, balanced journals, derived caches, idempotency outcomes, and audit evidence inside PostgreSQL transactions; authoritative responses refresh the UI. The weakness is ownership fragmentation. The same product concept can pass through `BooksContext`, domain client services, a 4,000-line finance controller, large sales/purchases engines, dedicated command services, and legacy aliases. The plan must establish one command registry and delete alternate paths as each family is certified.

```text
TODAY
React screens
  ├─ BooksContext compatibility methods ──┐
  ├─ domain service wrappers ─────────────┼─> route/controller mix
  └─ direct apiClient calls ──────────────┘      ├─ command/domain services
                                                  ├─ direct controller SQL
                                                  └─ legacy aliases
                                                        -> PostgreSQL

TARGET
Workspace screen
  -> typed query/mutation module
  -> generated capability + permission contract
  -> one domain command/query owner
  -> transaction: source + journal + audit + idempotency
  -> authoritative DTO + refresh receipt
  -> PostgreSQL + observable command ID
```

Decision: do not rewrite the ledger or framework. Freeze new `BooksContext` financial setters, publish command ownership, migrate by workflow, and remove the legacy path in the same slice.

### 2. Error and rescue map

The backend has a promising structured `DomainError` envelope and a financial-command recovery map. Coverage is inconsistent: many controllers still return ad hoc `{error}`, the API client drops `cause`, `fix`, `docUrl`, `currentState`, and `requestId`, network failures are represented as status 500, and many screens still use browser alerts. Competitive quality requires the same rescue semantics on every financial action.

| Failure | Current signal | Required user rescue | Verification |
|---|---|---|---|
| Field/domain validation | 400/422 messages; some stable codes | Keep draft, highlight exact field/line, state cause and correction | Unit + browser validation tests |
| Permission/tenant denial | 403/404 guards | Explain required permission without leaking another tenant's record; no retry button | Direct API role/tenant matrix |
| Capability disabled | 503 trusted-feature response | Show setup/certification state and owner action; never render a dead primary button | Capability contract test + browser state |
| Stale/version conflict | Some 409/current-state support | Show changed fields, reload/compare, never overwrite silently | Concurrent PostgreSQL + UI conflict test |
| Command already in progress | Stable code exists | Disable resubmit, poll/reload command receipt, retain immutable request key | Double-click/network retry E2E |
| Unknown mutation outcome | Idempotency key retained for 5xx/network | Say “do not submit again,” reconcile by command key, then exact replay if safe | Connection-drop fault test |
| Commit succeeded, refresh failed | Some facade alerts | Display committed receipt/reference and a Refresh action, not Post Again | API success + forced refresh failure |
| Session expired | Auth errors vary by caller | Preserve non-sensitive draft, reauthenticate, resume exact safe action | Expiry browser test |
| Database unavailable | Fail-closed startup/runtime errors | Block writes, show service status/request ID, preserve draft | Database outage/failover test |
| Import/parser rejection | Parser/service errors | Per-file/per-row explanation, safe supported-format fallback, no partial commit | Fuzz/resource-limit/browser tests |
| Integration/provider failure | Job/webhook/email states exist | Pending/failed/retry/dead-letter status with provider reference and support path | Sandbox + injected fault + operator test |
| Report/widget partial failure | Some dashboard/report isolation | Hide uncertain figures, identify unavailable section, retry only that query | Partial-service failure browser test |
| Recovery validation failure | Staging/validation exists | Keep live tenant unchanged; show failed invariant and downloadable operator evidence | Destructive staging-only recovery test |

Decision: introduce one client error type that preserves the full server envelope, then replace alert/confirm flows with accessible field errors, status regions, dialogs, and operation receipts.

### 3. Security and threat model

Authentication, MFA, rate limits, CSP, tenant predicates, permissions, idempotency, webhook signatures, encrypted recovery, and security tests are real strengths. The highest risks are partial/permissive RLS, caller-owned audit coverage, the vulnerable XLSX parser processing untrusted bank files, provider/portal token boundaries, production feature configuration, and localStorage bearer-token compatibility. Production should rely on HttpOnly cookies and avoid exposing a reusable access token to browser script.

| Threat | Boundary | Required control |
|---|---|---|
| Cross-tenant ID substitution | Every entity lookup and relationship | Organization predicate plus composite constraints/RLS where practical; indistinguishable 404; matrix tests |
| Role/approval bypass | Direct API calls | Generated route-command permission contract; no client authorization; self-approval/consumption tests |
| Duplicate/replayed money movement | Mutations, webhooks, imports | Payload-bound idempotency, provider event uniqueness, row locks, exact replay receipts |
| Stored/reflected script and token theft | Portal, templates, notes, filenames | Cookie-only production auth, strict output encoding, CSP, sanitized templates/files, token expiry/revocation |
| Malicious spreadsheet/document | Bank import/OCR/receipts | Replace vulnerable parser, size/time/memory limits, MIME validation, malware scanning, isolated processing |
| Secret/configuration exposure | GSP, bank feeds, gateways, recovery | Secret store, encryption, rotation, least privilege, no logs/exports, readiness validation |
| Audit evidence omission/tampering | Every financial command | Command registry declares mandatory audit event; append-only enforcement; completeness reconciliation |
| Backup/restore abuse | Recovery center/operators | Owner plus step-up auth, dual control, tenant lock, staged validation, immutable operator evidence |

Decision: security is a P0 workstream, not a post-parity hardening phase. No external integration enters the roadmap without credential, consent, webhook, outage, replay, and reconciliation design.

### 4. Data flow and interaction edge cases

Every financial flow must cover missing/empty input, stale data, upstream failure, double submit, navigation during submission, organization switch, expired session, capability change, locked period, inactive account, partial allocation, unsafe amount/date precision, and committed-but-not-refreshed state. Current idempotency and authoritative reload foundations are good, but large UI components and facade fallbacks make coverage uneven.

The standard state machine will be:

```text
IDLE -> EDITING -> VALIDATING -> SUBMITTING
  -> REJECTED (draft retained)
  -> UNKNOWN (payload + idempotency key frozen; reconcile first)
  -> COMMITTED (receipt shown)
       -> REFRESHED
       -> REFRESH_FAILED (receipt retained; refresh only)
```

Decision: add the state machine to shared mutation tooling and test every critical command against all terminal branches.

### 5. Code quality review

The largest correctness risk is mixed responsibility, not formatting. `financeController.ts`, `SalesEngine.ts`, `PurchasesEngine.ts`, `BankReconciliationService.ts`, `BooksContext.tsx`, `PdfTemplatesSettings.tsx`, `ExpenseModal.tsx`, and several workspaces are too large to make ownership obvious. Duplication also exists in desktop/mobile navigation, feature/capability naming, error envelopes, report money conversion, and UI feedback.

Decision: split only behind explicit business contracts. Do not create generic repositories or a new state framework. Add dependency rules preventing UI from importing server concepts, prevent new business calculations in React, and make exact-money/date utilities mandatory at API boundaries.

### 6. Test review

The suite is broad: more than 1,400 tests plus PostgreSQL CI, Playwright, property/fuzz, concurrency, recovery, lifecycle, accounting, and security coverage. The weak link is release composition. Standard Playwright uses the in-memory database, the release workflow smoke-tests a locally built image but rebuilds again for publishing, and the publish job does not depend on the separate browser/PostgreSQL qualification jobs.

```text
Command/schema unit tests
  -> pg-mem service/API tests
  -> PostgreSQL command/concurrency/migration tests
  -> PostgreSQL-backed browser critical journeys
  -> exact release image smoke + reconciliation
  -> publish same digest
  -> staging canary + recovery drill
```

Required critical browser journeys: onboarding; invoice-to-receipt; PO-to-bill-to-payment; expense-with-evidence-to-reversal; statement-import-to-match-to-reconcile; approval-to-post; period-close/reopen; backup-to-isolated-restore. Each must verify persistence after reload, permissions, tenant isolation, ledger/subledger agreement, audit evidence, and an error/retry branch.

Decision: keep fast memory tests, add a smaller PostgreSQL E2E gate, and publish exactly the tested image digest.

### 7. Performance review

Existing compression, indexes, static metadata cache, query services, bundle tests, and load tests are useful. Main risks are broad report/list queries, large React trees, repeated hydration through `BooksContext`, base64 receipt payloads, in-process job work, and lack of a stable production-scale dataset/SLO dashboard.

Decision: define representative small/medium/large tenant fixtures and budgets for dashboard, global search, record lists, document open/save, bank import/matching, and core reports. Record p50/p95/p99, SQL count/time, response bytes, render time, and worker lag. Optimize from traces, not blanket caching.

### 8. Observability and debuggability review

Request correlation, structured logging, Prometheus-style process/database metrics, operational monitoring, job health, reconciliation exceptions, and integration-health summaries exist. Gaps: some monitoring queries swallow errors and return zeros/warnings, request context appears to read legacy auth fields, metrics lack command-level counters/latency, and there is no evidence here of production alert routing.

Decision: propagate request/organization/user/command IDs through every layer; add command success/failure/replay/latency metrics, posting/reconciliation drift, queue lag/dead letters, integration status, backup age/restore drill, and schema/capability readiness. An unavailable monitor must never look like zero incidents.

### 9. Deployment and rollout review

The container workflow runs dependency policy, typecheck, build, tests, a PostgreSQL container smoke test, and GHCR publish. However it builds the smoke image and then invokes a separate build-and-push step, so the digest tested is not necessarily the digest published. Optional feature configuration is broad in smoke, but deployment-specific certification evidence is not attached to the artifact.

Decision: build once, sign/SBOM/scan, run all gates against that digest, publish/promote the same digest, store schema/capability/test evidence, and rehearse rollback with backward-compatible migrations. Deployment success and authorization to accept live financial data remain separate decisions.

### 10. Long-term trajectory review

Without a command/capability registry, FirmBooks will accumulate more certified-looking but differently wired modules. Without a buyer wedge, it will chase Zoho's breadth while incumbents keep advancing banking, compliance, AI, mobile, integrations, and distribution. The 12-month ideal is not “same number of screens”; it is a narrower product that wins on trustworthy daily operations and then expands through partner boundaries.

Decision: use a 90-day scoreboard: onboarding time, successful task completion, reconciliation time, close time, support incidents, migration success, release escape rate, and active design partners. Require evidence before starting the next product lake.

### 11. Design and UX review

The visual foundation is coherent: IBM Plex, neutral surfaces, Lucide icons, responsive navigation, mobile record layouts, and explicit loading/empty components. The experience is uneven because large legacy workspaces, alert/confirm feedback, indirect navigation, duplicated cards, mixed status language, and capability-dependent dead ends remain.

Decision: do not perform a theme rewrite. Standardize the workspace shell, document shell, status vocabulary, action hierarchy, feedback/rescue states, tables/cards, filter persistence, mobile action layout, focus return, keyboard flow, 200% zoom, contrast, and reduced motion. Live visual scoring will follow the premise gate.

## Error and Rescue Registry Summary

Twelve named failure classes are specified above. P0 gaps are full error-envelope preservation, uncertain-command reconciliation, capability-disabled UX, session-resume behavior, parser containment, and removal of blocking browser alerts from financial workflows.

## Failure Modes Registry

| Failure mode | Impact | Critical gap? | Planned prevention/detection |
|---|---|---:|---|
| UI, route, deployment, and docs disagree on capability | Dead ends or false claims | Yes | Generated capability registry + deployment export + contract tests |
| Two implementations mutate the same financial concept | Divergent ledger/audit behavior | Yes | Command ownership registry + legacy deletion gate |
| Browser retry creates a second financial effect | Duplicate money movement | Yes | Payload-bound idempotency + command receipt + unknown-state UX |
| Cross-tenant relationship accepted | Confidentiality/accounting breach | Yes | Scoped lookups, constraints/RLS, adversarial matrix tests |
| Release image differs from tested image | Unverified production binary | Yes | Build once and promote same digest |
| Memory E2E passes while PostgreSQL behavior fails | False release confidence | Yes | PostgreSQL-backed critical browser suite |
| Spreadsheet parser exploited | Server compromise/DoS | Yes | Replace/contain XLSX, resource limits and scanning |
| Report money uses unsafe conversion | Incorrect totals | Yes | Exact-money boundary and golden reconciliations |
| Commit succeeds but UI reports failure | User reposts transaction | Yes | Durable receipt + refresh-only recovery |
| Background timer/worker stops silently | Missing emails/recurrences/imports | Yes | Durable leases, queue health, dead letters, alerts |
| Monitoring query fails and returns reassuring zero | Hidden operational incident | Yes | Explicit `UNKNOWN/UNAVAILABLE` monitoring states |
| Base64 receipt growth inflates DB and responses | Slow backup/restore and UI | No, P1 | Blob storage abstraction, metadata/checksum DB rows |
| Documentation status goes stale | Wrong operational decisions | No, P1 | Generated evidence manifests, owners and expiry |
| Broad parity roadmap outruns customer demand | Months of low-value work | Yes, strategic | Buyer wedge, 90-day scoreboard, kill criteria |

## NOT in scope until explicitly selected

- A visual clone of Zoho or a global theme rewrite.
- A ledger/database/framework rewrite.
- Claims of statutory GST filing, direct bank feeds, foreign-currency transaction accounting, inventory, payroll, vendor portal, public API, or custom BI before their product and partner decisions are made.
- Production deployment, database mutation, dependency replacement, or broad source refactoring during this review stage.
- Treating source code or test names as proof that a capability is enabled in the target deployment.

## Phase 1 completion summary

| Area | Result |
|---|---|
| Premises | Six named; four reasonable, two require explicit product confirmation |
| Existing leverage | Strong bounded core in posting, reversals, access, recovery, reports, and tests |
| Alternatives | Visual clone rejected; big-bang breadth rejected; staged certified parity recommended; partner/narrow-wedge alternatives added |
| Architecture | Direction sound, ownership fragmented |
| Error/rescue | Strong server primitives, inconsistent client propagation and UI |
| Security | Strong foundation; RLS, parser, token, integration, and audit-coverage gaps remain |
| Data/edge cases | Standard mutation state machine specified |
| Code quality | Large mixed-responsibility hotspots and duplicated contracts identified |
| Tests | Broad coverage; PostgreSQL browser/release-digest composition gap |
| Performance | Needs representative datasets, SLOs, traces, and blob separation |
| Observability | Good primitives; command metrics, unknown states, and alert routing needed |
| Rollout | Good container smoke; build-once/promote-same-digest required |
| Trajectory | Requires buyer wedge and 90-day outcome scoreboard |
| Design | Preserve visual system; standardize workspaces and feedback states |

Phase 1 analysis is complete. A separate evidence-only UI/UX audit has also been completed at `docs/plans/zoho-live-ui-ux-audit-2026-09-22.md`; it preserves the current visual system and defines cross-module workspace, feedback, accessibility, and provenance standards. The premise/user-challenge gate remains unanswered, so Design, Engineering, and DX prioritization decisions are not yet approved to begin.

## Pending gate

The premise set above must be confirmed before the design, engineering, DX, and per-module scoring phases continue.

## Independent CEO challenge

### Subagent voice

The independent strategy review agrees with certified vertical slices but rejects “Zoho parity” as a sufficient strategy. Its central finding is that the plan needs a customer wedge and measurable outcomes before a 12-module roadmap can be prioritized.

| Severity | Finding | Plan correction |
|---|---|---|
| Critical | No narrow buyer or job-to-be-done; “Indian SMBs” spans incompatible needs. | Define the beachhead, switching trigger, and outcome metrics such as onboarding time, reconciliation time, close time, filing-readiness errors, support load, and migration success. |
| Critical | The point-by-point module matrix has not yet been produced. | After this premise gate, score every workflow by product availability, UX states, accounting effect, permission boundary, failure cost, Zoho gap, evidence, and priority. |
| Critical | India compliance cannot be grouped casually with payroll, AI, and speculative breadth. | Choose either a trusted-books-with-CA/GSP-export position or make e-invoice, e-way bill, GST filing/IMS, and connected banking Phase-1 necessities through partner integrations. |
| High | “Trustworthy core” overstates current coverage. | Use “bounded certified core” and credit only capabilities enabled in the target deployment with provenance. |
| High | NAS/self-hosting differentiation is assumed rather than validated. | Compare NAS, managed private cloud, and hybrid delivery with 5-10 target users before making deployment model the primary wedge. |
| High | Evidence and documents drift over time. | Attach commit, date, command, database mode, environment, and artifact to every capability claim; reconcile contradictory status documents. |
| High | New slices can compound existing parallel ownership. | Publish a financial command-ownership map and retirement milestone before adding new mutation paths. |
| High | Partner, buy, migration-led, accountant-first, and narrow close/reconciliation strategies are missing. | Evaluate them explicitly during the module audit and roadmap synthesis. |
| High | There is no 90-day customer scoreboard or kill criteria. | Freeze non-wedge feature work, ship 2-3 complete journeys to design partners, and require usage/task-success evidence before expansion. |

Independent score: premises **partial**; right problem **no**; scope calibration **partial**; alternatives **no**; competitive risks **partial**; six-month trajectory **no**.

### Primary Codex voice

The primary review agrees with the independent critique on four points: feature parity is not a positioning strategy; statutory/compliance boundaries must be explicit; capability claims need deployment-aware evidence; and canonical command ownership must precede further breadth. It differs only in sequencing: the complete module audit is still worth doing now because it supplies the evidence needed to choose the wedge, but implementation priority must wait for the wedge decision.

The separate Codex CLI voice was attempted in read-only mode but was unavailable because its local TLS certificate chain could not connect. No consensus is claimed for that missing voice.

### CEO consensus table

| Dimension | Independent reviewer | Primary Codex | Consensus |
|---|---|---|---|
| Premises valid | Partial | Partial | Confirmed gap |
| Right problem | No | Partial until buyer is chosen | Disagree in degree; user decision required |
| Scope calibration | Partial | Partial | Confirmed gap |
| Alternatives explored | No | No | Confirmed gap |
| Competitive risks covered | Partial | Partial | Confirmed gap |
| Six-month trajectory | No | No | Confirmed gap |

### User challenge

The original direction is “make the app as good as Zoho.” Both reviewers recommend changing the decision rule from broad competitor parity to **a narrow target customer plus measurable workflow outcomes**, while still completing the module audit as an evidence base. What may be missing is the user's actual commercial target and whether literal Zoho feature breadth is itself the goal. If this recommendation is wrong, FirmBooks may underinvest in modules the user considers mandatory.
