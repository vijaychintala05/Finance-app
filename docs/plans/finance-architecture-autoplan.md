<!-- /autoplan restore point: none - source was pasted chat architecture, not an existing plan file -->

# Finance Architecture Autoplan Review

Generated: 2026-08-30
Branch: codex/point-1-features
Base branch: main

## Original Plan Summary

Build the finance/accounting application as a modular monolith with a separate PostgreSQL database, a strict double-entry accounting engine, immutable posted journals, ACID financial transactions, idempotency, period locking, RBAC, audit logging, backups, restore testing, reporting from the general ledger, and later background jobs/outbox processing.

The core architecture says business modules such as invoices, bills, receipts, payments, banking, purchases, and projects are operational systems. They must converge into one authoritative accounting layer:

```text
Business Documents
  -> Accounting Engine
  -> Journal Entries
  -> Journal Lines
  -> General Ledger
  -> Trial Balance / P&L / Balance Sheet / Cash Flow
```

## Repo Evidence Already Found

- `docs/ACCOUNTING_ENGINE.md` documents the core ledger invariants, enabled posting rules, and certification gates.
- `docs/ARCHITECTURE_AUDIT.md` records resolved prototype risks and remaining structural debt.
- `docs/PRODUCTION_READINESS.md` separates local test evidence from real production launch controls.
- `server/src/accounting/postingEngine.ts` enforces balanced journals, active tenant-owned accounts, period locks, duplicate journal detection, and transactional posting.
- `server/src/services/AccountingIntegrityService.ts` verifies journal balance, trial balance, AR/AP controls, GST controls, banking integrity, and account-balance cache reconciliation.
- `server/src/middleware/idempotency.middleware.ts` protects mutation retries in production and replays completed responses.
- `server/src/database/migrationRunner.ts` owns the idempotent schema baseline and adds key constraints, including journal-line one-sided checks and append-only audit-log trigger.
- `server/src/database/BackupRestoreService.ts` provides tenant backup/export/restore behavior, but its current error tolerance is not production-grade disaster recovery.

## Initial Scope Detection

UI scope: yes. The architecture implies admin panels, certification dashboards, reports, workflow states, recovery center, and accountant-facing operational screens.

DX scope: yes. The plan affects backend API contracts, migrations, deployment, staging evidence, runbooks, restore drills, and developer onboarding.

## Premises For Confirmation

1. The app should optimize first for correctness, auditability, data integrity, security, and recoverability.
2. The general ledger, not invoices or bills, is the financial source of truth.
3. A modular monolith is the right near-term architecture; microservices are premature.
4. PostgreSQL is the production system of record and must be separated from the application lifecycle.
5. Posted financial history should be immutable; corrections use reversals plus corrected entries.
6. Reports should derive from posted ledger data and integrity checks, not from mutable UI state or document totals.
7. Uncertified finance workflows should remain gated until they pass transactional, reconciliation, concurrency, audit, and reporting tests.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|----------------|-----------|-----------|----------|
| 1 | Intake | Use pasted architecture as plan source and write this review artifact | Mechanical | Explicit over clever | Autoplan requires a plan file; the pasted source needed a durable target for review outputs. | Leaving the review only in chat |
| 2 | CEO | Use SELECTIVE_EXPANSION mode | Mechanical | Choose completeness | The architecture is right but has adoption, UX, deployment, and DX consequences that need review. | Hold-scope only |
| 3 | CEO | Prefer trust-boundary architecture over minimal patching | Taste | Choose completeness | Typed posting contracts, DB invariants, certification surface, and runbooks make the ledger promise enforceable. | Patch-only hardening |
| 4 | CEO | Defer public API, payment gateways, payroll, inventory, and AI finance assistant | Mechanical | DRY / pragmatic | These domains add compliance and trust scope before the core trust cockpit is proven. | Broad accounting-suite parity |
| 5 | CEO | Surface sharper product wedge as a user challenge | User challenge | Bias toward action | The architecture is sound, but both local and independent review found the buyer promise too broad. | Silently changing product direction |

## Phase 1: CEO Strategy Review

### 0A. Premise Challenge

The confirmed premises are directionally right for a serious finance product. Ledger-first architecture, immutable posted entries, separate PostgreSQL, transactional posting, idempotency, period locking, audit trails, and gated uncertified workflows match the codebase and the risk profile.

The weak premise is not technical. It is product framing. "World-class finance/accounting application" is too broad, and it invites comparison to mature accounting suites. The stronger premise is: FirmBooks should make every trusted financial number explainable, recoverable, and tied to a next action for the owner/accountant.

### 0B. Existing Code Leverage

| Sub-problem | Existing code/docs | Leverage decision |
|---|---|---|
| Double-entry posting | `server/src/accounting/postingEngine.ts`, `server/src/sales/SalesEngine.ts`, `server/src/purchases/PurchasesEngine.ts` | Reuse and formalize as the only trusted posting path. |
| Ledger integrity | `server/src/services/AccountingIntegrityService.ts` | Promote results into operator/admin UX and release gates. |
| Optional workflow certification | `server/src/middleware/trustedFeature.middleware.ts`, `docs/PRODUCTION_READINESS.md` | Generate one source-of-truth capability matrix from code. |
| Recovery | `server/src/recovery/*`, `src/components/settings/RecoveryCenterView.tsx` | Keep staged validation UX; tighten production DR semantics. |
| RBAC/tenant access | `server/src/access/*`, `server/src/middleware/organizationIsolation.middleware.ts` | Keep server-derived permission/capability decisions. |
| Daily dashboard wedge | `docs/plans/role-adaptive-dashboard-plan.md`, `src/components/dashboard/DashboardView.tsx` | Make trust visible through cash, AR, AP, reconciliation, and close exceptions. |
| Legacy UI facade | `src/context/BooksContext.tsx` | Continue shrinking as screens move to domain hooks. |

### 0C. Dream State Delta

```text
CURRENT STATE
  Trusted core exists for key writes; many advanced workflows are gated;
  docs and code disagree in places about certified optional features.

THIS PLAN
  Turns the finance architecture into explicit trust boundaries:
  typed financial events, one posting path, DB invariants, visible certification,
  recovery evidence, and staged launch controls.

12-MONTH IDEAL
  A close-ready finance cockpit where owners and accountants can answer:
  what changed, who approved it, why this number is true, what needs action,
  and how the business recovers if infrastructure fails.
```

### 0C-bis. Implementation Alternatives

| Approach | Summary | Effort | Risk | Pros | Cons | Reuses |
|---|---|---:|---|---|---|---|
| A. Minimal hardening | Patch obvious gaps: fix docs drift, add tests around existing posting paths, tighten restore docs. | M | Medium | Fast; low churn; preserves current feature work. | Leaves generic journal payloads and side-door risk partially unresolved. | Existing posting engine, readiness docs, current tests. |
| B. Trust-boundary architecture | Add typed financial event contract, DB-level journal-balance enforcement, source-generated capability matrix, operator trust dashboard, and recovery runbook evidence. | L | Medium | Makes the architecture enforceable; creates a trust cockpit; supports production launch evidence. | Touches backend, docs, admin UI, and tests. | Posting engine, integrity service, trusted feature middleware, recovery center, dashboard plan. |
| C. Full platform accounting suite | Add event sourcing, payment gateways, public APIs, portals, payroll/inventory, AI categorization, and multi-jurisdiction filing. | XL | High | Big surface; long-term platform potential. | Premature; competes with incumbents on breadth before trust loop wins. | Some current modules, but would outgrow current certification model. |

Recommendation: choose **Approach B**. It is the smallest plan that makes the ledger promise operationally credible.

### 0D. Selective Expansion Decisions

Accepted into scope:

- Add an explicit typed financial-event posting contract above `ServerPostingEngine`.
- Add database-level whole-journal balance enforcement for production PostgreSQL.
- Generate or verify the certified-capability matrix from `CERTIFIED_OPTIONAL_FEATURES` so docs, UI, and deployment cannot drift.
- Add accountant/operator trust surface: last integrity status, gated features, recovery evidence, period-close readiness, failed posting alerts.
- Tighten production recovery semantics so restore errors fail loudly and trigger integrity verification.

Deferred:

- Payment gateways, customer/vendor portals, payroll, inventory, public API, AI finance assistant, and statutory tax filing.
- Event sourcing or microservices. Revisit only after the trusted daily workflow has real scale pressure.

Skipped:

- Broad "full accounting suite parity" positioning for the next phase.

### 0E. Temporal Interrogation

| Time | Decisions implementation will hit | Resolve now |
|---|---|---|
| Hour 1 foundations | What is the trusted posting primitive? | Use typed business events that compile to journal payloads; generic manual journal remains separate and permission-gated. |
| Hours 2-3 core logic | Can banking/reconciliation create journals directly? | No trusted financial mutation should bypass the posting boundary; exception paths must be refactored or gated. |
| Hours 4-5 integration | How does UI know what is certified? | Server returns capability/certification state from source-controlled allowlist plus environment enablement. |
| Hour 6+ tests/polish | What proves the launch gate? | Real PostgreSQL migration rehearsal, concurrency, restore drill, integrity suite, and accountant sign-off remain mandatory. |

### CEO Dual Voices

CODEX SAYS (CEO - strategy challenge): the local review agrees the architecture is technically serious, but the product needs a narrower trust promise: "every number traceable, every financial action recoverable, every uncertified workflow honest."

CLAUDE SUBAGENT (CEO - strategic independence): the independent voice flagged a high-risk wedge problem: correctness is table stakes, and the architecture plan does not name the daily buyer pain sharply enough. It recommends a six-week proof milestone around trusted cash/AR/AP/close actions and evidence, not horizontal accounting parity.

CEO DUAL VOICES - CONSENSUS TABLE:

```text
Dimension                            Claude     Codex      Consensus
Premises valid?                      partial    partial    CONFIRMED: technical premises valid, product promise too broad
Right problem to solve?              partial    partial    CONFIRMED: solve trust plus daily action, not architecture alone
Scope calibration correct?           no         no         CONFIRMED: narrow the promise, keep trust architecture
Alternatives sufficiently explored?  no         no         CONFIRMED: compare cash-control and close-evidence wedges
Competitive/market risks covered?    no         no         CONFIRMED: broad parity is a trap
6-month trajectory sound?            partial    partial    CONFIRMED: sound only with a daily trust workflow milestone
```

### CEO Review Sections

1. Architecture and scope: **issue found**. The architecture is strong, but its product promise is broader than the first trust-winning workflow. Auto-decision: keep architecture scope, add a user challenge at final gate for product wedge.

2. Error and rescue: **issue found**. The plan names backups and restore tests, but does not require product-visible recovery evidence or loud restore failure semantics. Auto-decision: add recovery evidence and fail-loud restore as P1 tasks.

3. Security and trust: **issue found**. Role, audit, and tenant boundaries exist, but certified capability truth currently drifts between code and README. Auto-decision: source-generate/verify the capability matrix.

4. Data and UX edge cases: **issue found**. Gated workflows must render unavailable/disabled/error states distinctly; hiding them creates distrust. Auto-decision: specify capability states in admin/accounting UI.

5. Quality: **issue found**. Direct journal insert paths in banking create a possible "side door" to ledger truth. Auto-decision: refactor or gate until they use the posting contract.

6. Tests: **issue found**. Local evidence is strong but pg-mem cannot replace real PostgreSQL tests for constraints, triggers, locks, and recovery. Auto-decision: require real-PostgreSQL staging proof.

7. Performance: examined reports, dashboard, and integrity queries. No immediate architecture reduction; performance risk is in heavy reports and integrity checks, best handled by measured indexes and read replicas later.

8. Observability: **issue found**. The plan names monitoring, but not specific money alerts as product/admin artifacts. Auto-decision: add failed-posting, imbalance, capability drift, backup failure, and restore-drill alerts.

9. Deployment: **issue found**. README and production docs disagree about optional feature allowlist state. Auto-decision: CI should fail on capability documentation drift.

10. Long-term trajectory: **issue found**. Microservices/event sourcing remain out of scope; the next platform capability is a typed posting contract and certification matrix.

11. Design: UI scope detected and passed to Phase 2.

### CEO Error And Rescue Registry

| Codepath | Failure | Rescue | User impact | Gap |
|---|---|---|---|---|
| Posting event -> journal | Unbalanced payload | Reject before write | User sees posting failure; no partial ledger | Needs typed event errors |
| Journal lines DB write | App bug inserts unbalanced entry outside engine | No whole-entry DB trigger seen | Silent corruption possible if side door exists | CRITICAL |
| Optional feature route | Feature not enabled | 503 with feature code | User sees unavailable workflow | Needs UI capability matrix |
| Recovery restore | Row/table restore error | Some errors ignored in backup service | False restore success possible | CRITICAL for production DR |
| Idempotent mutation | Retry with same key | Replay stored response | User avoids duplicate mutation | OK |
| Real PostgreSQL launch | Migration/constraint mismatch | Readiness + required staging evidence | Launch blocked if followed | Needs operational proof |

### CEO Failure Modes Registry

| Codepath | Failure mode | Rescued? | Test? | User sees? | Logged? |
|---|---|---:|---:|---|---|
| `BankReconciliationService` direct journal insert | Bypasses posting rules/account cache/audit conventions | N | partial | maybe success | partial |
| `journal_entries` + `journal_lines` | Whole journal imbalance through non-engine write | N | partial | silent | N |
| `BackupRestoreService.restoreBackup` | Insert/delete error swallowed | partial | partial | success count may mislead | partial |
| `trustedFeature.middleware.ts` vs README | Certified surface drift | N | N | wrong docs/UI promise | N |
| pg-mem-only release evidence | Real DB constraint/lock behavior unproven | Y by docs | N local | launch gate warning | Y |

### CEO Completion Summary

```text
Mode selected: SELECTIVE_EXPANSION
System audit: strong trusted core, weak product wedge, docs/code capability drift
Issues found: 6 P1/P2 concerns
Critical gaps: 2 (DB whole-journal enforcement, production restore semantics)
Scope proposals: 5 accepted, 6 deferred, 1 skipped
Unresolved decisions: 1 user challenge reserved for final gate
Phase 1 complete. Passing to Phase 2.
```

## Phase 2: Design Review

### Design Scope Assessment

Initial score: 6/10. The architecture names the right control concepts, but the user-facing design is under-specified. For finance, vague "admin panel" and "reports" wording is not enough; the UI must show what is certified, what is stale, what is blocked, and what evidence supports a number.

DESIGN.md exists and the current UI uses dense operational screens, reports, settings, recovery, and dashboard components. Existing patterns worth keeping: `RecoveryCenterView` requires explicit confirmation before promotion, `CapabilityUnavailable` makes gated workflows honest, and report views already trend toward server-authoritative data.

### Design Dual Voices

CODEX SAYS (design - UX challenge): make financial trust visible in every place a user sees money. A number without provenance should visually lose authority.

CLAUDE SUBAGENT (design - independent review): add a first-class Financial Trust Center, provenance labels for totals, recovery readiness evidence, stronger close hierarchy, actionable integrity triage, report state templates, governance map, dense mobile accounting patterns, and non-color-only status semantics.

Design litmus scorecard:

| Dimension | Score | Finding | Auto-decision |
|---|---:|---|---|
| Information hierarchy | 7 | Cash/AR/AP/close actions exist in dashboard plan, but certification status lacks a home. | Add Financial Trust Center. |
| State coverage | 5 | Loading/empty/error/partial/stale/integrity-failed states are not standardized for reports and trust widgets. | Add shared state templates. |
| Trust/provenance | 5 | Posted-ledger, subledger, forecast, stale, and uncertified values can look equally authoritative. | Add provenance labels and downgrade uncertain totals. |
| Recovery UX | 6 | Recovery Center exists, but operational readiness evidence is not surfaced as an ongoing health state. | Add last drill, RPO/RTO, environment label, and failed drill details. |
| Period close UX | 6 | Period lock can be mistaken for full close. | Separate Period Lock from Certified Period Close. |
| Responsive accounting UX | 6 | Mobile stacking risks losing table meaning. | Use exception-first mobile layouts with pinned key fields. |
| Accessibility | 7 | Icons/colors exist, but audit statuses need labels, copyable refs, and keyboard-safe destructive flows. | Add status text, journal refs, request IDs, and modal keyboard checks. |

Overall design score after review: 8/10 if accepted changes are incorporated.

### Design Passes 1-7

1. Information architecture: **issue found**. Add a `Financial Trust Center` under Settings/Governance or Accounting Controls. It should show certified workflows, gated workflows, last integrity run, last restore drill, period close readiness, jurisdiction/currency scope, and evidence links.

2. Interaction states: **issue found**. Define shared templates for loading, no data, no permission, disabled capability, stale data, partial data, integrity failed, unsupported historical report, export failed, and success.

3. User journey: **issue found**. The accountant's path should be: see trust state -> inspect exception -> drill to source document/journal -> resolve or escalate -> see integrity pass. The current architecture says these pieces exist but does not storyboard the loop.

4. Specificity: **issue found**. "Admin panel" is too generic. Rename the surface around user jobs: `Trust Center`, `Close & Controls`, `Recovery Readiness`, `Audit Evidence`.

5. Responsive behavior: **issue found**. Do not turn ledger tables into decorative cards. Mobile should prioritize exception queues, filters, key fields, and drill-down; desktop can keep dense tables.

6. Accessibility: **issue found**. Financial state must not rely on color. Add labels/icons, semantic table headers, copyable journal/request IDs, visible focus, and reviewable reversal/restore confirmations.

7. Visual language: examined DESIGN.md and current settings/report patterns. Keep quiet, dense, utilitarian finance UI. Avoid marketing-style cards around controls.

### Required Design Diagram

```text
User lands in Accounting / Settings
  -> Financial Trust Center
      -> Certified / Gated / Disabled feature matrix
      -> Integrity status
          -> Pass: show timestamp + evidence link
          -> Warning: group as Needs Review
          -> Fail: group as Blocking + source drill-down
      -> Recovery readiness
          -> Last backup
          -> Last restore drill
          -> RPO/RTO evidence
      -> Period close readiness
          -> Lock state
          -> Certified close checklist
      -> Audit evidence search
```

### Design Implementation Checklist

- Add Trust Center information architecture before adding more finance modules.
- Add `FinancialValueProvenance` display pattern for all important totals.
- Add shared report/trust state templates.
- Separate period lock from certified close in copy and layout.
- Make recovery readiness visible as a health surface, not only an action surface.

### Phase 2 Completion Summary

```text
Initial score: 6/10
Final planned score: 8/10
Issues found: 8
Taste choices: 1 (Trust Center location)
User challenges: 0
Phase 2 complete. Passing to Phase 3.
```

## Phase 3: Engineering Review

### Engineering Verdict

The pasted architecture is directionally strong for finance software: PostgreSQL as the system of record, integer money, immutable posted journals, idempotent posting, period locks, audit logs, and server-side reporting are the right instincts. The repo already implements a credible posting engine in `server/src/accounting/postingEngine.ts` and meaningful integrity checks in `server/src/services/AccountingIntegrityService.ts`.

The gap is not philosophy. The gap is enforcement closure: every trusted financial mutation must go through the same posting contract, every launch claim must be backed by executable checks, and every documented certified feature must match the code gates exactly.

### Engineering Scorecard

| Dimension | Score | Finding | Auto-decision |
|---|---:|---|---|
| Ledger correctness | 7 | Posting engine is strong, but direct journal side doors remain possible. | Seal all journal writes behind one server contract. |
| Database enforcement | 6 | Line-level checks exist, but whole-journal balance is not enforced at the DB layer. | Add PostgreSQL deferred trigger/constraint. |
| Feature governance | 5 | Docs say optional production features are empty while code certifies many. | Generate a capability matrix from source and test it. |
| Recovery/DR | 5 | Recovery Center is promising, but legacy backup restore can report success after partial failure. | Fail loudly and separate legacy backup from certified recovery. |
| Concurrency | 6 | Posting checks period lock before inserts, but close/post race needs a stronger lock protocol. | Add org-period advisory lock or equivalent DB lock. |
| Performance | 6 | Bank import and reconciliation paths need scaling work before high-volume launch. | Batch/cache rule and matching workloads. |
| Error contracts | 6 | Some controllers return 500/raw messages for domain failures. | Add machine-readable domain errors. |
| Testability | 6 | Good test intent exists, but lint/typecheck currently fails. | Fix mocks and add real PostgreSQL launch gates. |

Overall engineering score after review: 7/10. It can become 9/10 after the P1 enforcement and evidence gates are implemented.

### Engineering Findings

1. **P1 - Banking reconciliation can bypass the posting engine.** `server/src/banking/BankReconciliationService.ts` directly inserts `journal_entries` and `journal_lines` in transfer/statement flows. That risks bypassing active-account checks, lock-date rejection, account code/name denormalization, balance cache updates, and consistent journal numbering. Route all journal creation through `ServerPostingEngine.postEntry` or a narrower certified posting facade.

2. **P1 - Whole-journal balance is not DB-enforced.** The server validates debit equals credit, but PostgreSQL should also reject an unbalanced posted journal using a deferred trigger or equivalent transaction-level check. Finance systems need invariant defense even when future code accidentally writes around the service layer.

3. **P1 - Feature certification truth has drifted.** `docs/PRODUCTION_READINESS.md` and `README.md` still describe an empty optional production allowlist, while `server/src/middleware/trustedFeature.middleware.ts` now includes many certified optional features. This is a launch-blocking trust issue because operators cannot tell which workflows are actually production-certified.

4. **P1 - Legacy backup/restore can imply success after partial failure.** `server/src/database/BackupRestoreService.ts` catches table read, cleanup, and insert failures in ways that can return a successful result with incomplete data. For a finance app, restore must be atomic, noisy, verified, and clearly separated from any legacy convenience export.

5. **P1 - Period lock/posting concurrency needs a stronger protocol.** Posting checks locks before writing, but close/lock operations and posting should coordinate on the same org-period lock. Otherwise a close can race with in-flight posting near the boundary.

6. **P2 - Recovery routes and capability gates are split.** `server/src/routes/security.routes.ts` uses legacy feature names such as `backup-restore`, while newer recovery routes use `recovery-center`. Collapse this into one visible trust model or document which path is legacy/admin-only.

7. **P2 - Bank import performance has scale risks.** Current matching/import paths load large existing transaction windows and repeatedly evaluate rules. Add batching, indexed matching windows, cached rule compilation, and measured import limits.

8. **P2 - Domain errors leak as generic 500s.** Banking controllers catch domain failures and return raw `e.message` with status 500. Period locks, duplicate imports, inactive accounts, and unsupported capabilities need stable status codes and machine-readable error bodies.

9. **Rejected finding - migration runner syntax.** A sub-review flagged `server/src/database/migrationRunner.ts` as syntactically broken, but local inspection confirmed it exports `CURRENT_SCHEMA_VERSION`, `MigrationRunner`, and `runMigrations`. This finding is rejected.

### Engineering Architecture Diagram

```text
Client workflow
  -> API route
      -> Auth/RBAC
      -> Trusted feature gate
      -> Idempotency boundary
      -> Certified domain service
          -> ServerPostingEngine
              -> PostgreSQL transaction
                  -> period/account validation
                  -> deferred whole-journal balance trigger
                  -> journal + lines insert
                  -> balance cache update
                  -> audit event
                  -> outbox event
          -> IntegrityService evidence
      -> typed response / typed domain error
```

### Test Coverage Map

```text
PostingEngine
  needs: real PostgreSQL balance trigger test
  needs: account locked/inactive/org mismatch tests
  needs: period close/post race test

BankReconciliationService
  needs: "no direct journal insert" regression test
  needs: transfer posts through posting engine
  needs: high-volume import benchmark fixture

TrustedFeatureMiddleware
  needs: generated source-of-truth capability snapshot
  needs: README/PRODUCTION_READINESS matrix consistency test

BackupRestoreService / Recovery Center
  needs: partial failure restore test
  needs: restore drill evidence test
  needs: legacy route deprecation/gate test

API errors
  needs: period lock, duplicate idempotency, inactive account, disabled feature schemas
```

### Verification Run

`npm run lint` was run through the local npm entrypoint and failed during TypeScript checking. The failures are test mocks in `src/__tests__/authContext.test.tsx` and `src/__tests__/booksContext.test.tsx` missing the now-required `ApiResponse.status` and sometimes `ApiResponse.error` fields. This is a DX/engineering blocker because the repo cannot currently prove a clean baseline.

### Phase 3 Completion Summary

```text
Initial score: 7/10
Final planned score: 9/10
Issues found: 8 accepted, 1 rejected
Blocking implementation themes: posting contract, DB invariant, feature truth, recovery evidence
Phase 3 complete. Passing to Phase 3.5.
```

## Phase 3.5: Developer Experience Review

### DX Verdict

The architecture is unusually explicit about financial trust boundaries, which is good. The DX weakness is that launch obligations are still too document-shaped. A world-class finance product should turn readiness into commands, evidence artifacts, CI gates, and API contracts that a developer or operator can run without interpretation.

### DX Scorecard

| Dimension | Score | Finding | Auto-decision |
|---|---:|---|---|
| First run | 6 | README is clear enough for an experienced dev, but Windows/PostgreSQL setup and expected health output are under-specified. | Add exact commands and startup verification. |
| Launch gates | 5 | Readiness demands real PostgreSQL/concurrency/recovery proof but package scripts do not expose those gates. | Add `test:postgres`, `db:migrate:check`, `accounting:integrity`, and `release:staging`. |
| Operator runbooks | 5 | Migration, restore drill, upgrade, rollback, and NAS production limits need executable steps. | Add runbooks with evidence fields. |
| API contract | 5 | Capability and domain error payloads are not fully documented. | Add machine-readable contract table. |
| Environment clarity | 6 | `.env.example` exists, but validation, SSL modes, JWT strength, and common errors need stronger guidance. | Add env validation docs and readyz examples. |
| Finance trust feedback | 6 | Developers can read docs, but cannot easily generate evidence that a workflow is certified. | Add capability matrix and staging transcript. |

Overall DX score after review: 6/10. It can become 8.5/10 once readiness becomes runnable.

### DX Findings

1. **P1 - NAS deployment can sound production-ready for live financial data.** `NAS-DEPLOYMENT.md` gives a concrete launch path, while `docs/PRODUCTION_READINESS.md` requires managed PostgreSQL, PITR, multi-zone, centralized logs, secret storage, and restore drills. Label NAS as home/lab or self-managed single-node unless it has a mapped control checklist.

2. **P1 - Real PostgreSQL launch gate is not executable.** Add scripts for real PostgreSQL migration, concurrency, recovery, and integrity proof. The architecture should not rely on prose for the most important launch criteria.

3. **P1 - Ledger integrity claim overstates DB protection.** README says every journal balances. Until a PostgreSQL whole-journal trigger exists, docs should say the posting engine enforces this and DB-level enforcement is a launch blocker.

4. **P2 - Migration runbook is too thin.** Add `docs/MIGRATIONS.md` covering preflight, privileges, advisory-lock behavior, lock timeout, apply, verify, rollback policy, and hotfix sequencing.

5. **P2 - API/capability contract is unclear.** Define feature identifiers, capability endpoint response, 503 payload, idempotency conflict behavior, period/account lock payloads, request IDs, retryability, and remediation.

6. **P2 - Local setup lacks first-run certainty.** Add exact `createdb` or SQL commands, expected startup logs, first registration path, `/readyz` sample output, and common environment failures.

7. **P2 - Backup/restore guidance names the duty but not the drill.** Add a restore target, commands, integrity checks, acceptance criteria, RPO/RTO fields, and failed-drill escalation.

8. **P3 - Upgrade path is under-specified.** Add upgrade, rollback, and post-upgrade verification steps for app version, DB compatibility, migrated schemas, login, registration state, integrity checks, and reports.

### Developer Journey Map

```text
Clone
  -> install dependencies
  -> create PostgreSQL database
  -> validate environment
  -> run migrations
  -> seed/register first org
  -> run integrity checks
  -> run real PostgreSQL tests
  -> generate staging evidence
  -> promote with capability matrix attached
```

### Phase 3.5 Completion Summary

```text
Initial score: 6/10
Final planned score: 8.5/10
Issues found: 8
Blocking DX themes: executable launch gates, runbooks, API contracts, NAS scope clarity
Phase 3.5 complete. Aggregating final plan.
```

## Aggregated Implementation Plan

### P1: Certification And Ledger Safety

1. Seal journal write paths behind `ServerPostingEngine`.
   - Update bank statement transaction creation and internal transfer posting.
   - Add regression tests that fail if certified services write directly to `journal_entries` or `journal_lines`.

2. Add PostgreSQL whole-journal balance enforcement.
   - Implement a deferred trigger or transaction-level constraint.
   - Cover balanced, unbalanced, draft, posted, update, and delete cases against real PostgreSQL.

3. Reconcile feature certification truth.
   - Make `trustedFeature.middleware.ts` the generated source or consume a generated source.
   - Update README and `docs/PRODUCTION_READINESS.md`.
   - Add a test that docs, API capability output, and middleware feature IDs agree.

4. Make recovery fail loud and evidence-based.
   - Deprecate or hard-label legacy backup/restore.
   - Ensure restore is atomic or explicitly failed.
   - Add restore drill evidence fields and acceptance criteria.

5. Add close/post concurrency locking.
   - Use org-period advisory locks or equivalent DB locks for period close and posting.
   - Add a concurrency test that attempts posting during close.

### P2: Operator And Product Trust Surfaces

6. Add a Financial Trust Center.
   - Certified/gated/disabled capability matrix.
   - Last integrity check and last restore drill.
   - Period lock versus certified close.
   - Evidence links and actionable exceptions.

7. Add financial value provenance.
   - Posted-ledger, subledger, forecast, stale, partial, and uncertified markers.
   - Shared report states for empty, loading, permission denied, disabled, stale, failed, and partial data.

8. Add executable launch/runbook scripts.
   - `test:postgres`
   - `db:migrate:check`
   - `accounting:integrity`
   - `release:staging`
   - `docs/MIGRATIONS.md`
   - restore drill and upgrade/rollback runbooks

9. Stabilize API/domain errors.
   - Machine-readable `code`, `requestId`, `feature`, `retryable`, and `remediation`.
   - Correct status codes for disabled capabilities, duplicate idempotency keys, locked periods, inactive accounts, and validation failures.

### P3: Scale And Polish

10. Improve bank import scaling.
    - Indexed matching windows.
    - Cached/compiled rules.
    - Batch processing.
    - Volume benchmark fixtures.

11. Fix current TypeScript lint baseline.
    - Update test mocks to include `ApiResponse.status` and `ApiResponse.error`.
    - Treat clean lint/typecheck as a merge gate for this architecture work.

12. Clarify NAS deployment scope.
    - Mark NAS as home/lab or self-managed single-node unless production controls are fully mapped.
    - Add off-device restore, monitoring, TLS, rollback, and access review requirements.

## Final Approval Gate

Recommended path: **approve with P1 enforcement first**.

Taste decision already made by autoplan: avoid a broad accounting-suite race. Turn the architecture into a trusted finance operating system for a narrow urgent job first: cash, AR/AP, close evidence, recovery, and audit confidence.

User approval choices:

```text
A) Approve the plan as written and proceed to P1 implementation.
B) Keep the architecture review only; do not implement yet.
C) Expand scope toward a broader full-suite accounting roadmap.
D) Narrow scope further to one wedge, such as cash/AR/AP control or accountant close evidence.
E) Challenge a specific finding before implementation.
```

## GSTACK REVIEW REPORT

FINAL_SCORE: 8.0/10 for architecture direction, 6.5/10 for launch readiness.

HIGHEST_LEVERAGE_CHANGE: make every trusted financial mutation provably pass through one posting contract, then enforce whole-journal balance in PostgreSQL.

APPROVED_AUTO_DECISIONS:

- Position the product around financial trust and operational evidence, not broad feature parity.
- Add Financial Trust Center before expanding optional finance modules.
- Treat docs/code capability drift as a P1 launch blocker.
- Treat executable PostgreSQL/recovery/integrity evidence as part of the architecture, not release paperwork.
- Reject the migration-runner syntax finding after local verification.

REQUIRED_BEFORE_PRODUCTION:

- No direct certified journal writes outside the posting engine.
- PostgreSQL-level balanced-journal enforcement.
- Capability matrix consistency across code, docs, API, and UI.
- Atomic, verified restore path with drill evidence.
- Close/post concurrency lock.
- Clean lint/typecheck baseline.

UNRESOLVED DECISIONS:

- Final user approval is pending: choose A, B, C, D, or E from the Final Approval Gate.
