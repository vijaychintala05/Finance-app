# FirmBooks: The Evidence-Based 9/10 Plan

Date: 2026-08-31. Base branch: main. Inspected HEAD: cfb36de8709de50bee725e8e0cb6e380fd6e99fc plus a substantial, actively changing worktree.

Status: REVIEW IN PROGRESS. Plan only. No source changes, deployment, financial writes or certification by this review.

## Outcome and Scoring Contract

The user wants a better application, not a larger feature count. Target: a dependable internal bookkeeping application for the current organization's supported workflows, with complete entry/save/reload/correction/reporting journeys and evidence-backed releases. The prior 6/10 and 7.5/10 ratings were impressions, not audited benchmarks.

Freeze an explicit capability matrix before implementation: workflow, persona, supported currency, effective feature flag, endpoint/service owner, visible entry points, and acceptance evidence. Begin with invoice/customer receipt, bill/vendor settlement, expenses/receipts, journal/reversal, reporting, settings/permissions and recovery. Existing optional domains are inventoried and honestly gated, not silently counted as working. Exact deployment and jurisdiction support require owner/accountant confirmation before live use.

Proposed scoring rubric, agreed by approving this plan: six dimensions, five acceptance checks each; each check scores 0 (missing/unverified), 1 (partial evidence), 2 (verified on the candidate release). Dimension score = points / 10. Weighted total out of 100 below. Do not award points for writing this plan or adding tests that were not executed.

| Dimension | Weight | Five acceptance checks |
| --- | --- | --- |
| Accounting correctness | 25 | Balanced posting; AR/AP-to-GL agreement; exact money/date boundaries; duplicate-safe correction/reversal; independent expected-results reconciliation |
| End-to-end workflows | 20 | Sales receipt journey; bill/payment journey; expense evidence journey; journal/correction journey; settings change -> server enforcement journey |
| Security and isolation | 15 | Authentication/session expiry; tenant isolation; direct API RBAC; approval/self-approval enforcement; sensitive-data/cache handling |
| Recovery and operations | 15 | Consistent complete backup; isolated actual restore; old-version/rollback compatibility; monitored backup failures; defined and measured RPO/RTO |
| Usability and accessibility | 15 | >=90% routine scenario completion; keyboard/focus; mobile/zoom layout; explicit loading/empty/error/partial states; measured responsiveness targets |
| Release and developer confidence | 10 | Source+test typechecks; complete regression run; real PostgreSQL integration; same-image build/smoke/publish; reproducible setup and truthful release evidence |

9/10 means >=90/100, each dimension >=8/10, AND all hard gates below pass. Unknown is unverified, not success. Current formal score: not assigned; insufficient comparable evidence.

Hard gates cannot be averaged away: zero open P0/P1 defects; no unexplained financial reconciliation differences; no unauthorized access or duplicate postings; all critical journeys pass in both applicable roles and supported device classes; actual PostgreSQL concurrency and restore evidence; immutable release identity; no false save-success or certification claims. P1 includes blocked essential work, not only data corruption.

Keep three decisions separate: product quality score, deployability, and authorization to accept live financial data. Passing the first two does not manufacture the third. Observed pilot outcomes cannot be supplied by an automated planning session.

## Fresh Evidence

| Observation | Evidence / status | Consequence |
| --- | --- | --- |
| Production source compiles | Ran `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json`: exit 0. | Credit only this specific gate, on this worktree snapshot. |
| Full-project typecheck fails | Ran `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`: exit 1; fixture DTO drift, missing arguments, nonexistent OrganizationRoleService imports. | Repair test contracts; a source-only lint success is not a full green release. |
| Test exclusion | tsconfig.build.json excludes frontend/backend tests and E2E. | Keep separate configs if useful, but CI must typecheck tests too. |
| Vendor payment does not persist | RecordVendorPaymentModal calls addPaymentMade then onClose; BooksContext.tsx:1162 alerts that vendor payments are paused and returns null. | Essential workflow blocker. Do not bypass controls; wire existing server workflow after verification. |
| Vendor PO action is a placeholder | VendorWorkspace.tsx:682 calls window.alert for Convert to Bill. | Replace with real supported journey or explicit unavailable state; never pretend conversion occurred. |
| Production DB evidence gap | gate4ConcurrencySecurityHardening.test.ts calls MasterFinanceFixture.setup({ usePgMem: true }). | Good fast coverage, not evidence of PostgreSQL row locks/isolation. |
| Restore proof incomplete | gate8FullRestoreParity.test.ts swallows DELETE failures and checks only invoices are empty; tracked table set excludes expenses/receipts. | Cannot prove clean-instance complete recovery from this test. |
| Release pipeline improved but incomplete | Current workflow runs checks and PostgreSQL readiness, then builds again for publish; no browser journey on smoke image. | Promote the exact tested artifact, not an untested rebuild. |
| Local browser test risk | playwright.config.ts uses port 3000 and reuseExistingServer outside CI. | Test-specific port/database/process identity required; do not test mutations against the user's demo. |
| Readiness claims disagree | PILOT_RELEASE_BASELINE claims frozen/all-certified; current worktree is dirty and go-live checklist has unfinished environment/recovery/authorization. docs/PRODUCTION_READINESS.md also describes older scope. | Replace unsupported statuses with evidence-linked Verified/Pending/Template. |

No full runtime test suite, browser audit, performance test, Docker run or real PostgreSQL restore was executed during this review. Do not reuse the 805-tests claim as fresh proof.

## What Already Exists / Reuse

- `docs/plans/deploy-readiness-autoplan.md`: reuse release contract and build repairs; revalidate stale observations rather than duplicate the project.
- `docs/plans/expense-receipts-autoplan.md` and companion test plan: reuse picker, lifecycle, image validation and recovery requirements; current implementation remains partial.
- `src/api/client.ts`: auth/tenant headers and idempotent requests; preserve exact payload identity through uncertain outcomes.
- `BooksContext` compatibility facade, SalesEngine, PurchasesEngine, ExpensePostingService and posting engine: reuse canonical ownership. No parallel ledger or new framework.
- `finance.routes.ts`: existing `/vendor-payments`, `/vendor-advances` and reversals, protected by permissions and vendor-settlements flag. Verify before connecting UI.
- `trustedFeature.middleware.ts`: actual allowlist is populated; non-production defaults enable these features while production requires configuration. The old comment/document claiming an empty list is stale.
- Current dashboard/customer/vendor workspaces, payment forms, settings controls and Lucide/IBM Plex styling: complete behavior and reduce clutter, do not redesign every page.
- Existing Vitest, Testing Library, Supertest, Playwright, master fixtures, permission registry and recovery services: extend rather than replace.

## Phase 1: Product / CEO Review

Mode: selective expansion for quality, not feature growth. User intent supplies the premise; intermediate decisions are auto-selected using completeness, affected-workflow coverage, practicality, reuse, explicit behavior and action. Approval of the final plan is still required.

### Premise Challenge and Alternatives

P1: More screens do not imply a better accounting application. P2: A test report is not production evidence. P3: Most value now comes from completing existing workflows. P4: A clean financial record requires evidence, correction and recovery as well as creation. P5: Scope must be frozen so the score cannot improve merely by removing difficult requirements.

Alternative A, visual polish only: faster apparent improvement, leaves vendor payment and recovery blockers. Reject. Alternative B, complete current critical journeys plus evidence/release hardening: chosen. Alternative C, add AI/OCR, payroll, inventory, external portals or a general platform rewrite: reject for this goal. Do nothing leaves misleading actions and unverified claims.

Leverage map: canonical server contracts remove local fake-save paths; API idempotency avoids second payment logic; real PostgreSQL fixtures test both existing and new workflows; one release evidence manifest replaces inconsistent certificates; shared state/error patterns improve every touched form without a global component rewrite.

Dream delta: polished but uneven feature set -> verifiable end-to-end bookkeeping -> after 12 months, a stable evidence-backed platform whose added domains go through the same gates. A 10x vision is confidence that every visible action does exactly what its label promises, not 10x more modules.

Selective improvements accepted: retain failed drafts; preview full receipt; return focus after closing dialogs; preserve filters after viewing documents; link report amounts to source records when existing navigation supports it. These directly improve affected workflows. No new public API, infrastructure service, paid product, or speculative backlog is authorized.

### Eleven Review Sections

| Section | Decision / acceptance requirement |
| --- | --- |
| 1 Architecture | Reuse UI -> authenticated API -> canonical transaction -> authoritative refresh. Vendor settlement facade must become async and typed; never generate document numbers or balances in UI. |
| 2 Error/rescue | Every save differentiates validation failure, denied action, uncertain commit and committed-but-refresh-failed. Explicit registry in engineering phase. |
| 3 Threat model | Direct HTTP authorization tests, tenant-linked IDs, self-approval denial, expired sessions, poisoned receipt inputs. Existing production gates remain fail closed. |
| 4 Data/interaction | Handle missing/empty inputs, stale balances, 2-tab duplicates, modal close, org switch, negative/overprecision amounts and locked dates. |
| 5 Code quality | Repair DTO drift rather than weaken typechecks; reusable domain APIs, no new all-purpose framework. |
| 6 Tests | Verify each promised journey with real persistence/reload/reversal; establish independent expected results, not two reports agreeing on the same bug. |
| 7 Performance | Measure dashboard, workspace and report latency on a documented seeded dataset; no unbounded receipt content in list payloads. |
| 8 Observability | Evidence keyed by commit/image/schema/config; request IDs, posting/backup failure signals; no secrets or document contents in logs. |
| 9 Rollout | One tested immutable image, actual PostgreSQL migration/restore, previous digest and backward-compatible schema rollback plan. |
| 10 Trajectory | Scope/quality evidence persists beyond this conversation; add domains only when existing workflows are stable. |
| 11 UX | Truthful available actions, complete states, preserved draft/filter context, keyboard/mobile accessibility and no decorative redesign. |

Temporal interrogation: first freeze capability/claim boundaries and resolve type drift; next finish canonical mutations and recoverability; then test failure/retry scenarios; finally measure usability/performance and deploy rehearsals. The observed user pilot cannot be compressed into coding time. Estimates later are implementation effort, not elapsed certification time.

Product outside review: Carver (independent Codex) supplied four decisions: fixed scope, complete journeys, evidence-linked claims, and separation of quality/deployability/live-data approval. All accepted. No challenge to user intent. Claude is unavailable in this environment; cross-model consensus N/A, not confirmed.

Product completion: all 11 sections evaluated; 3 alternatives; five accepted small workflow improvements; no new feature-domain expansion. No current 9/10 claim. Phase 1 complete.

## Not in Scope

AI/OCR, payroll/inventory, payment gateways, public portals/SDKs, broad theme replacement, general ledger rewrite, or a database/storage platform migration. Do not certify statutory filing or historical reporting merely because a screen exists. Existing TODOS already tracks these domains. New scope exclusions cannot silently remove a frozen critical journey; any requested scope change must be recorded and approved.

## Phase 2: Design Review

App UI, not marketing. Preserve existing navigation, typography and visual identity. The primary design change is behavioral honesty. Reuse current dialogs/inputs/icons and actual receipt images. No new hero, KPI-card collection, decorative gradient, generated illustration or broad CSS rewrite.

```text
Dashboard: period / financial summary -> exceptions -> source-document navigation
Customer or Vendor: identity / balance -> documents -> one contextual action
Record payment: counterparty / document -> amount / selected account -> save status
Record expense: financial fields -> optional image preview -> save status
Settings: category -> actual current rule -> edit -> confirmed server result
```

### Concrete Interaction Contract

1. Vendor settlement uses an actual vendor ID, bill ID, selected paid-from account and explicit allocations. Amount defaults to selected open balance, or blank with no bill; remove fabricated `5000`, `PAY-2026-...` and reference defaults. Reopening a fully paid bill never defaults to paying its original total. No result is marked successful or closed because a null-returning function was called.
2. Vendor advance and bill payment are distinct modes with separate server contracts. Keep the selected mode stable during submission. UI availability comes from effective capability + permission, not a hardcoded optimistic button. A pending approval is shown as pending, never paid.
3. Fix ApprovalSettings response handling: apiClient returns `{data,error,status}` on HTTP failure; current handleSaveRule awaits it then unconditionally shows success. Check error/status/data and re-fetch persisted rule on success. Loading failure is not an empty rules list. A failed save preserves edits and cannot show the saved indicator.
4. Remove Quick Scan banner and complete inline receipt previews/removal/full-image inspection per the existing receipt plan. No automatic OCR claim.
5. Audit all visible actions in customer/vendor/settings workspaces against the frozen capability matrix. Essential actions must be completed. For excluded optional features, remove the misleading action or expose a factual unavailable state; do not award workflow points for hiding a critical missing feature.

### Visible State Matrix

| Surface | Loading | Empty | Error / denied | Success | Partial / uncertain |
| --- | --- | --- | --- | --- | --- |
| Workspace/list/report | Stable layout; existing data visibly refreshing | Distinguish no records from no filter matches | Inline retry or permission message; no fake zero balance | Server result with correct period/currency | Failed module separated from other available data |
| Customer/vendor payment | Posting; freeze payload/actions | No open documents or account selected; no invented amount | Field/account/period error; preserve draft | Server receipt/reference; updated document and ledger | Unknown outcome requires exact retry/reconciliation; confirmed save + refresh failure gets Refresh, not Post again |
| Receipt picker/details | Per-image preparing/loading | Optional Add images / No receipts | Invalid image or load failure with correction/retry | Contained image, filename, open/download | Other images remain visible; late response cannot cross tenant/session |
| Roles/approval rules | Loading current rules; save disabled until loaded | Explain genuine no custom rules, not request failure | Show server-denied/save error; retain changes | Re-fetched value agrees with confirmation | Rule saved but refresh failed shown accurately |

Draft state machine: CLOSED -> EDITING -> VALIDATING -> SUBMITTING -> CONFIRMED or REJECTED or UNKNOWN. REJECTED returns to editable draft. UNKNOWN preserves immutable submitted payload/key and exposes reconciliation/exact retry, not a changed second mutation. CONFIRMED may still need a failed-list refresh. Invalid transitions (edit during submit, organization switch retaining old data) are guarded.

### Responsive / Accessibility / Performance Targets

- Test at 360x800, 390x844, 798x912, 1440x900 and 200% zoom. At small widths use stacked fields and reachable action footer; preserve access to every tab without page overflow. Tables scroll within their region, not the page. Filenames and errors wrap without moving adjacent controls.
- Named action buttons for table rows/cards, dialog role/title/focus trap/return, Escape and dirty-discard rules, visible focus, persistent field labels, 44px touch targets, contrast >=4.5:1 for normal text. Use icons with accessible names/tooltips; no fake text-only tool symbols.
- Preserve tabs, search and filters after viewing a document. Maintain draft on unrelated data refresh; clear sensitive state on logout/organization change. Validation sends focus to the first error and announces status.
- Provisional synthetic performance budget: local UI feedback <100ms; p95 primary list/workspace <2s and server-confirmed posting <3s on documented pilot-equivalent hardware with 10,000 mixed documents/org and 10 simultaneous users. Report slow paths honestly; these targets are not current measurements or internet-speed guarantees.
- User trial: three representative users complete a fixed 10-scenario script each; >=27/30 unassisted completions, every money-moving critical scenario completed safely, no hidden developer intervention. Repeat failed tasks after fixes. Record observed completion time, errors and assistance. Scores are unavailable until users actually participate.

Journey/emotional arc: orient in workspace -> choose real document -> enter minimal details -> inspect evidence -> see truthful commit result -> reopen/reconcile. Confidence comes from persistence and recoverability, not assurance panels. Immediate clarity, five-minute task completion, long-term audit trust.

| Design pass | Initial plan completeness | After specification | Notes |
| --- | --- | --- | --- |
| Information architecture | 5 | 9 | Document-first hierarchy; one contextual primary action |
| States | 3 | 9 | Complete failure/partial/unknown outcomes |
| Journey | 5 | 9 | Save -> reload -> correction -> reports |
| Visual clutter | 6 | 9 | Preserve design; remove deceptive promotion/dead ends |
| Design system | 7 | 9 | Existing IBM Plex/Lucide/form patterns |
| Responsive/accessibility | 4 | 9 | Viewports, focus, zoom, targets and observed tests |
| Decisions | 4 | 9 | Explicit defaults, modes, availability and score evidence |

Scores describe this plan's specificity, not the application's quality. Litmus: product context clear; actual document is visual focus; scannable headings; one job per section; no gratuitous nested cards; motion only for status; legible without decorative shadows. No mockup generated or approved; existing screen structure is retained. Live visual verification remains pending.

Independent design review (Boyle, Codex): four requirements accepted. (1) Settings search/back/navigation must preserve dirty state or offer Save/Discard/Stay; failed Save must not navigate away. (2) Customer MTD/QTD/YTD controls must change server-backed statement boundaries, rows and totals, not just styling; show opening balance + period movements = closing balance; printed output matches. Apply same semantics to vendor statements. CustomerWorkspace.tsx:296 currently builds all entries from client arrays without the selected period. (3) Vendor payment mode must be explicit; clear bill/amount when counterparty changes and show remaining balance before commit. (4) Reversal confirmation identifies original document/counterparty/amount; completion exposes reversal reference and updated balances; repeat reversal disabled; original evidence remains accessible.

The date-range statement fix does not silently certify all historical aging or tax reports. Trace statements to existing CustomerStatementService/VendorStatementService and verify their expected results. Preserve capability gates for unrelated report types.

Design completion: 7 passes evaluated, planned specificity 9/10; four independent additions; no branding decision or generated mockup. User-testing and live visual scores pending. Claude unavailable; cross-model design consensus N/A. Phase 2 complete.

## Phase 3: Engineering Review

### Scope Challenge

This is a multi-module stabilization effort, not a one-file polish change. More than eight files are justified by existing UI/API/test/recovery contract breaks; implement as bounded dependent patches. Reuse the two earlier plans, current services and test harness. Do not solve type errors with `any`, skip broken financial tests, delete assertions, silently weaken approval rules, or bypass production feature gates. No general BooksContext rewrite.

### Architecture / Ownership

```text
Capability matrix (promise + effective config + role)
        |
Workspace action -> typed domain mutation -> apiClient (tenant + stable operation key)
        |                                    |
        |                                    v
        |                       auth -> permission -> effective feature gate
        |                                    |
        |                          input + approval + period/account checks
        |                                    |
        |                       one transaction: document + allocations
        |                         + journal + audit + outcome record
        |                                    |
        +---- authoritative response/refresh <- commit

Reports <- canonical posted data and explicit period boundaries
Recovery <- versioned authenticated snapshot -> isolated staging -> reconciliation
         -> owner-authorized promotion -> post-restore evidence

Release commit+lockfile+schema+config -> typechecks+tests+build
   -> image digest -> real PostgreSQL + browser smoke -> publish same digest
   -> staging/NAS rehearsal -> authorized promotion or previous digest
```

Before: vendor UI -> paused synchronous facade; settings -> response envelope ignored. After: await server-confirmed typed result, preserve failures and replay unknown outcomes. No new ledger owner. Expose selected account, actual allocation IDs and server-returned reference in payment DTOs. Empty allocations do not implicitly turn a bill payment into an advance; the explicit mode selects the correct endpoint.

Approval configuration must demonstrably affect the canonical financial write path, not just approval-management endpoints. Tests change threshold/rule, attempt direct API posting below/at/above threshold, deny self-approval, and reject payload edits after approval. Recheck rule/approval version inside the posting transaction, including retries, so stale approval cannot authorize a different payment. If a workflow has no supported approval enforcement, it cannot display a working approval toggle.

### Source Findings and Fixes

| Finding | Severity / confidence | Required change |
| --- | --- | --- |
| Vendor modal closes after a no-op; selected bank omitted; generated local number | P1 / 10, modal handleSubmit and BooksContext:1162 read | Async settlement/advance DTOs, account and allocation IDs, await result, server numbering, no fabricated amount/reference |
| ApprovalSettings:90 awaits apiClient.post then announces success without response check | P1 / 10, apiClient:115 returns error envelope | Check envelope, retain draft, show error, reload saved rule; test denied and server-error paths |
| Test fixtures fail actual full-project tsc | P1 release gate / 10, command executed | Correct DTOs/imports/call signatures and typecheck tests separately if retaining build config |
| Customer statement ignores selected period in useMemo:296 | P1 / 10, dependency list and transaction loops read | Fetch canonical period statement, opening/movements/closing; print same data |
| VendorWorkspace:682 alert-only conversion | P1 for promised workflow / 10 | Real approved conversion contract or factual unavailable status if outside fixed scope; no success illusion |
| Playwright reuses local port3000 server | P1 test safety / 10, config read | Dedicated test port, database and process identity; reject accidental reuse |
| pg-mem concurrency suite and incomplete clean-restore test | P1 evidence gap / 10, setup and cleanup code read | PostgreSQL separate connections plus genuinely clean isolated restore; assert every covered table, bytes and relationships |
| CI smoke-tests local build then invokes build-push-action to rebuild | P1 provenance gate / 9, workflow read | Build once, test its digest, publish/promote those same bytes; if multiarch, verify each target artifact |

### Code Quality

Make domain mutation types Promise-based and checked at call sites. Keep apiClient's established envelope contract and fix callers; avoid changing every API caller to throwing behavior as part of this work. Reuse server money/date helpers; server totals win over client calculations. Preserve idempotency through uncertainty rather than deriving a new key after modifying a failed draft. On confirmed save and failed refresh show saved + refresh error. Keep financial payload out of persistent browser storage.

Map settings fields to server rules and exact permissions. Remove stale certification comments only after checking actual allowlist/config; do not auto-enable optional production flags. Prefer existing report endpoints over recomputing statements from incomplete client arrays. Audit touched component imports/callers, but leave unrelated architecture and formatting alone.

### Tests: Branch and Journey Map

Existing frameworks: Vitest/Testing Library/Supertest/Playwright; master fixtures. Basic rendering/tab tests are not financial persistence tests. Fast memory tests remain useful but do not replace real PostgreSQL. Vitest transforms TypeScript without normally typechecking runtime tests, so both gates are needed. [Vitest documentation](https://main.vitest.dev/guide/learn/writing-tests)

```text
W1 Sales invoice -> receive payment -> reload -> statement -> reverse
   existing services/tests; GAP current full browser+PostgreSQL proof
   branches: no invoice, partial/full, exact balance, overpay, stale balance,
             account/currency/period, denied user, repeated reversal
W2 Bill -> explicit vendor settlement or advance -> reload -> allocation -> reverse
   BLOCKED UI no-op; GAP real end-to-end test
   branches: no bill, paid bill, vendor change, distinct account, invalid mode,
             partial/full/overpay, one/multiple allocations, server rejection
W3 Expense -> select/prepare/remove image -> post -> reload -> open -> reverse
   partial API tests; GAP valid decoded fixture, full lifecycle and backup
   branches: 0/1/3/4 files, MIME/bytes/pixels, preparation/fetch error, org switch
W4 Journal -> post -> report -> reverse; closed period rejects new posting
   existing engine tests; GAP candidate-release E2E and real DB lock proof
   branches: unbalanced/empty, precision/date, locked accounts, duplicate request
W5 Settings/rules -> change -> save -> reload -> enforcement
   tests exist; GAP false-success regression and direct-posting enforcement
   branches: 400/401/403/409/500, empty vs failed fetch, dirty navigation,
             threshold below/at/above, self/stale approval, unauthorized role
W6 Customer/vendor statement -> period change -> print -> source document
   GAP period-filter regression and independent expected amounts
   branches: opening-only, no rows, date boundary, reversal, cross-org, period mismatch
W7 Backup under writes -> isolate -> clean restore -> compare -> promotion
   partial tests; GAP real full snapshot, identity and receipt parity
   branches: corrupt/untrusted/old-version, missing rows, wrong tenant, failed import,
             FK order, journal/reversal references, restored next sequence
W8 Frozen release -> build once -> smoke -> browser -> publish -> rollback
   partial pipeline; GAP same-digest proof and full test typecheck
   branches: missing env/DB, migration error, auth denial, failing smoke, image mismatch

Every W1-W5 mutation also:
  submit -> success | validation/permission rejection | network unknown | refresh failure
  submit again -> same operation replays, changed operation cannot accidentally duplicate
  navigate/org change/expiry -> stale result ignored; sensitive draft invalidated
```

For each branch: use pure unit tests for transformation/validation; real API+PostgreSQL integration for permissions, balances, constraints, locks and recovery; browser E2E for selection -> real request -> visible outcome -> reload. No mocked happy-only E2E to certify posting. Use deterministic synthetic fixtures and explicitly fixed clocks/seeds. LLM evals N/A.

Friday-release test: lose response after successful vendor payment, retry, reload, reverse and reconcile exactly once. Hostile test: altered tenant/account/approval IDs via direct HTTP plus competing payments on the same open bill. Chaos test: interrupt backup/posting in isolated infrastructure, then prove consistent restore or clean rejection without losing the current database. No chaos on user's local demo or live data.

### Failure and Rescue Registry

| Codepath/failure | Expected handling / visible result | Required test |
| --- | --- | --- |
| Missing/empty/invalid financial input | 400/422 stable validation code, field correction; zero writes | W1-W5 boundary cases |
| Auth expiry / permission denial | 401/403, safe reauthentication or denied message; never success | W1-W6 direct API + UI |
| Feature disabled | Existing 503 capability response; clear unavailable state | W2/W4/W5 prod-like configuration |
| Stale bill/approval or concurrent update | Reject/reconcile with current authoritative state; preserve safe draft | W2/W5 PostgreSQL concurrent connections |
| DB deadlock/serialization error | SQLSTATE 40P01/40001 follows existing bounded transaction-retry policy; replay idempotently or return retriable error | W1/W2 integration fault injection |
| Network outcome unknown | Keep immutable submission identity; reconcile or exact retry | W1-W5 lost-response tests |
| Commit confirmed, read refresh failed | Saved with reference; retry read only | W1-W5 refresh failure |
| Settings response error envelope | Display error, no success toast, no dirty-state loss | W5 403/500 regression |
| Receipt invalid/load failed | Per-file problem/retry; no silent omission or endless loading | W3 |
| Backup incomplete/tampered/old schema | Fail before promotion; preserve target; explicit supported-version instructions | W7 |
| Restore step fails | Abort transaction/staging promotion; original target remains usable | W7 |
| Wrong release image/migration/health | Block publish/promotion; preserve previous digest and data | W8 |

Critical silent gaps at baseline: null-return vendor save closes form; approval-rule save reports success on failed request; statement date filters do not constrain results. Restore omission/partial-state tolerance is a release-blocking evidence gap. All assigned below; none deferred as cosmetic.

### Performance and Reliability

Measure before optimizing: dashboard/report query plans, list payload sizes and client render time. Use metadata-only receipt lists, bounded content loads, query-level period filtering, existing indexes, paginated tables where dataset warrants it; avoid N+1 per document. Test 10k documents/org and 10 concurrent users; then 10x input to identify first bottleneck without promising that scale. Large reports/backups need bounded memory and consistent snapshot semantics, not unbounded JSON on request threads.

PostgreSQL concurrency tests require independent connections and barriers proving simultaneous transactions, plus real constraints enabled. Check invariants in a fresh connection after both finish; test both same and different idempotency keys. PostgreSQL row locks can block competing transactions until completion, which a mocked/in-memory run cannot establish. [PostgreSQL 16 locking](https://www.postgresql.org/docs/16/explicit-locking.html)

Release safety: no production mutation tests. An isolated test server must not reuse the user's port 3000. Playwright explicitly supports reusing an existing server when configured, which is why the current config needs separation. [Playwright web server](https://playwright.dev/docs/test-webserver)

Reconcile active logical export, Recovery Center and NAS database backup coverage instead of certifying one path by testing another. Define which restore path is supported for each artifact/version. Verify receipts, posted/voided status, journal links, approvals/roles, numbering and audit semantics; reject unsupported artifacts before any destructive action. A valid checksum alone is not proof of authenticity. Owner authorization, staging and transactional promotion remain required.

Proposed operating baseline for owner approval: RPO <=24h, RTO <=4h on the current NAS, encrypted off-NAS backup, daily backup-failure alert and recorded isolated restore drill. These are target policy choices, not current guarantees. Managed-PostgreSQL requirements in older documentation versus NAS pilot operation must be reconciled as an explicit policy decision; do not pretend NAS has multi-zone/PITR guarantees it has not demonstrated.

### Independent Engineering Findings

McClintock (Codex) identified four additional P1 requirements. Source anchors were re-read; no runtime exploit or restore was attempted.

1. Approval policy is disconnected from posting. `requiresApproval` has no production callers found; ManualJournalService.ts:111 defaults `input.status || 'Posted'` and posts without policy evaluation. Implement persisted draft/submitted/approved/posted transitions with payload revision binding and approval consumed atomically at the canonical write boundary. Direct API, bulk and alternate write paths must obey the same policy. Add state enforcement tests to W4/W5; existing rule-service tests are insufficient.
2. Approval rejection permission is too broad. security.routes.ts:28 admits any of several approval permissions; ApprovalWorkflowService.ts:278 resolves a caller-named entity but does not check entity-specific approver eligibility before updating SUBMITTED rows. Resolve stored request ID/tenant/entity, authorize its domain and configured role, lock the exact request, transition once and audit in the transaction. An expense-only approver cannot reject a payment or journal. Test positive and negative matrix for approve, reject and list visibility.
3. Application backup restore attempts to delete append-only audit rows. BackupRestoreService lists audit_logs for restore, while migrationRunner.ts:1318 installs a trigger raising on UPDATE/DELETE. PostgreSQL failure cannot be cured by swallowing an exception. Preserve audit history, restore financial state through the approved staging/promotion path, retain imported audit evidence without rewriting the existing chain, and append a recovery event. No disabling triggers to make tests pass. Test with populated audit logs and real constraints enabled. If this legacy restore path is not supported, keep it gated and explicitly document the supported Recovery Center/NAS path; do not claim its tests certify that other path.
4. Readiness does not prove required capabilities work. Current CI starts production without effective feature configuration or recovery keys and checks DB/schema readiness only. Add an explicit release capability manifest and ephemeral test-only recovery keys; exercise supported authenticated financial and recovery flows with the intended production flags before publish. Do not overload basic healthz with a destructive restore; run isolated capability smoke tests separately.

Engineering completion: architecture, code-quality, test and performance sections evaluated; eight primary findings plus four independent findings; eight journey groups with branch coverage requirements; failure registry and companion test plan saved. All critical gaps assigned to implementation gates below. No test pass rate fabricated. Claude unavailable, so six cross-model dimensions (architecture, coverage, performance, security, errors, deployment) remain N/A; independent same-model review is recorded as such. Phase 3 complete.

## Phase 3.5: Developer / Operator Experience

Classification: internal API + deployment platform/documentation, DX POLISH. Persona: TypeScript maintainer on Windows, deploying the existing container to the chosen PostgreSQL/NAS environment. No public SDK/ecosystem project. Existing runtime versions, package lock, apiClient and test frameworks are the reference; no competitor purchase or platform change required.

Empathy narrative: "I need to know which command checked tests, which database it touched, whether the selected capability was enabled, and whether the deployed digest is the one that passed. I should not need to infer these from a document that says Certified."

| Journey stage | Requirement |
| --- | --- |
| Discover | README points to one capability matrix and release evidence index |
| Evaluate | Supported scope, configuration and pending verification are explicit |
| Install | Node22 + npm ci; exact lockfile, no unexplained global tools |
| Configure | Separate test/dev/pilot identities; flags/DB/port checked before mutations |
| First success | One real synthetic invoice/payment round trip and readable receipt |
| Integrate | Typed async domain APIs, stable error envelope and request ID |
| Debug | Exact failed command/field/permission/config; no swallowed errors |
| Upgrade | Current schema/feature manifest and tested previous-version path |
| Operate | Same-image release, backup alert, restore drill and rollback instructions |

Three traced errors: (1) wrong test DTO currently slips past source-only lint -> separate full test typecheck gives file/line and blocks CI; fix fixture contract, not exclusion. (2) failed approval-rule save currently reports success -> user gets actual denied/server message and maintainer gets request ID/status; fix error-envelope handling. (3) production feature disabled currently surprises an apparently enabled UI -> capability state and explicit feature name/release configuration let operator diagnose without editing financial code or bypassing the gate.

Time to first useful result: unmeasured today. Target <=5 minutes from a ready checkout with dependencies and disposable DB available; <=15 minutes with prerequisites already installed from a clean checkout, excluding downloads. Document actual measured Windows/Linux times, not claimed instantaneous setup. Use no real bank data, no Google OAuth dependency and no cloud upload credentials for this flow.

| DX pass | Baseline plan completeness | Target specification | Work |
| --- | --- | --- | --- |
| Getting started | 5 | 9 | Isolated, reproducible first financial round trip |
| API/CLI usability | 5 | 9 | Typed async mutation, clear envelope and operation identity |
| Errors/debugging | 3 | 9 | Distinct failure states, request IDs, corrective action |
| Documentation | 3 | 9 | Reconcile stale schema/allowlist/certification statements |
| Migration/upgrade | 4 | 9 | Supported artifact versions, rollback compatibility |
| Environment/tooling | 5 | 9 | Windows/Linux, full typecheck, real-DB test command |
| Community/ecosystem | N/A | N/A | Internal product; no new public plugin/SDK surface |
| Measurement/feedback | 3 | 9 | Evidence manifest, measured setup and failure rates |

Scores measure specification, not proven developer experience. Checklist: exact scoped commands; DB/process identity guard; original failure logs; stable config/schema definitions; actionable response contract; Windows and deployment-platform smoke; fresh evidence links. No externally imposed success metric beyond the proposed scoring/operating targets.

## Implementation Tasks and Dependencies

All tasks are planned, unchecked and require implementation approval. They include tests alongside code; final verification is not a substitute for task-level regressions. Rough effort below includes implementation and automated verification, excludes human pilot elapsed time and unexpected unrelated defects.

| Task | Priority / effort | Specific work and ownership | Verification / dependency |
| --- | --- | --- | --- |
| T1 Evidence baseline | P1; human 0.5-1d / assisted 1-3h | Capability matrix, reconcile README/readiness/pilot documents, register current source/config/test evidence. Labels Verified/Pending/Template, no invented signatories. | Freeze scope and evidence schema before scoring; no service mutation. |
| T2 Trustworthy test harness | P1; human 1-2d / assisted 3-6h | Repair test DTO/import drift; source + test typechecks; isolated PostgreSQL fixture and test-only browser port/process guard. Files: tsconfigs, package scripts, master fixture, failing test callers, playwright config. | Both tsc gates green; deliberate wrong DB/server target rejected; W1-W8 harness can run. After T1. |
| T3 Real payment workflow | P1; human 1-2d / assisted 3-6h | Async typed vendor payment/advance facade, modal sends account/vendor/allocation IDs, awaits confirmed commit, stable retry, correct mode/amount, reliable refresh. Existing PurchasesEngine remains owner. Audit customer payment equivalent lifecycle. | W1/W2 full save/reload/reversal, two-bank selection, partial/overpay, unknown outcome and denied action. After T2; enable only with T4 controls. |
| T4 Enforced settings/approvals | P1; human 2-4d / assisted 1-2d | Fix API-envelope success bug and dirty state; connect approval policy/revision to canonical mutations; exact domain permissions on approve/reject/list; approval+posting+audit atomicity. Files: approval service, security routes/controller, touched posting entry points, settings. | W4/W5 direct HTTP and browser: stale/self/cross-domain/threshold/duplicate cases. After T2, coordinate with T3. |
| T5 Complete documents/reports | P1; human 1-2d / assisted 3-6h | Implement receipt plan's missing UI/validation/lifecycle work; correct period statements with server service; finish essential action inventory, preserve filters and correction references. | W3/W6 + receipt companion plan; actual image decode, expected opening/movements/closing and print parity. After T2; coordinate facade edits with T3. |
| T6 Recoverable production data | P1; human 2-4d / assisted 1-2d | Reconcile supported backup paths; consistent/authenticated snapshots, receipts/status/journal/roles parity, append-only audit-safe restore, artifact-version policy, fresh PostgreSQL failure-safe rehearsal. Existing recovery services, not new backup platform. | W7 with populated audit/receipt/reversal data, concurrent writes and rejected corruption; measured RPO/RTO. After T2 and affected schema contracts. |
| T7 Immutable release gate | P1; human 1-2d / assisted 3-6h | Extend existing deploy-readiness plan: build once, test exact digest with intended flags/ephemeral keys, authenticated browser/API/capability/recovery smoke, publish only tested image; rollback test. CI/Docker/deploy docs. | W8; deliberately failed gate cannot publish; tested/published/pulled digest matches. After T3-T6. |
| T8 Usability/performance verification | P2, critical findings escalate P1; human 1-2d / assisted 3-6h plus user sessions | Responsive/a11y/state checks on touched workflows; measured seeded performance; optimize demonstrated bottlenecks; three-user ten-task script. | >=90% unassisted completion and all critical safe; viewport checks; targets measured. After functional paths ready; complete before score. |
| T9 Final score and authorized pilot | P1 verdict; human review duration unknown | Execute full candidate-release tests; calculate rubric from evidence; independently review money/security outcomes; owner/accountant approve chosen operational policy and parallel pilot. | >=90/100 + all hard gates; no missing sign-off represented as complete. After T1-T8. |

```text
T1 Evidence -> T2 Isolated Harness
                    |
        Payment + Approval Integrity (T3 + T4)
                    |
    Receipts (T5a) / Statements (T5b) / Recovery (T6a + T6b)
                    |
            Same-Digest Release (T7)
                    |
       User Validation (T8) + Final Score (T9)
```

Workstream coordination:
- `T1` Evidence -> `T2` Isolated Harness & Full `tsc` Green (Sequential prerequisite).
- `T3` Vendor Payments & `T4` Approvals joined into a single sequential **Payment + Approval Integrity** lane (Payment UI is enabled only after server transaction enforces approval, permissions, idempotency, audit logging, and allocation rules).
- `T5` split into distinct acceptance gates: **T5a Receipts** (images, preview, upload, lifecycle) and **T5b Period Statements** (server-bound date filtering, opening/closing balances, print parity).
- `T6` split conceptually into: **T6a PostgreSQL Restore Correctness** (audit-preserving clean restores, reverse-FKs) and **T6b Operational Recovery Policy & Drill** (owner RPO/RTO decision, off-NAS backups).
- `T7` Same-Digest Release pipeline.
- `T8` Usability, accessibility & performance benchmarking.
- `T9` External gate with user testing, pilot reconciliation, and owner/accountant approval.

## Decision Audit Trail

| ID | Phase / classification | Decision | Principle / rejected alternative |
| --- | --- | --- | --- |
| D1 | Product / mechanical | Freeze scope and evidence-based rubric | Explicit; no score by feature count or hidden exclusions |
| D2 | Product / mechanical | Separate quality/deployability/live approval | Completeness; no fabricated certification |
| D3 | Product / taste | Stabilize existing modules before new features | Pragmatic; reject more dashboards/AI scope |
| D4 | Product / mechanical | Existing prior plans remain inputs, not completed work | DRY; no duplicate implementation projects |
| D5 | Design / mechanical | Async confirmed saves and unknown-outcome states | Completeness; no null-save close or false success |
| D6 | Design / mechanical | Explicit payment modes/IDs/accounts; no invented defaults | Explicit; no inferred advance or fake numbering |
| D7 | Design / mechanical | Full prepared receipt preview and saved reopen | Completeness; no filename-only evidence |
| D8 | Design / mechanical | Preserve draft/filter state and named keyboard actions | Completeness; no silent loss on search/navigation |
| D9 | Design / mechanical | Actual date-bound statements and matched print totals | Explicit; no styling-only filters |
| D10 | Design / taste | Retain existing design; targeted density/a11y fixes | Pragmatic; reject whole-app theme replacement |
| D11 | Engineering / mechanical | Fix test contracts, check both source/tests | Completeness; no blanket exclusions/any |
| D12 | Engineering / mechanical | Independent-connection real PostgreSQL tests | Explicit; pg-mem cannot prove production concurrency |
| D13 | Engineering / mechanical | Canonical policy enforcement and domain authorization | Completeness; no management-only approval checks |
| D14 | Engineering / mechanical | Audit-preserving authenticated restore with parity | Completeness; no trigger disabling/swallowed failures |
| D15 | Engineering / mechanical | Test/publish same digest and intended capabilities | Explicit; readiness-only/rebuilt image insufficient |
| D16 | Engineering / mechanical | Isolated DB/server guards | Explicit; no user-demo reuse |
| D17 | Engineering / taste | Provisional NAS RPO/RTO <=24h/<=4h | Owner policy approval needed; no managed-DB guarantees inferred |
| D18 | DX / mechanical | One evidence index, reproducible commands and real errors | DRY; reject parallel unsupported certification docs |
| D19 | Validation / taste | Proposed performance budget and three-user script | Measure; no present performance claim |

Taste choices surfaced at approval: stabilization-first scope; preserve current visual identity; provisional performance/user-test targets; NAS recovery objectives. The user has not approved live-data policy by asking for a better rating.

## Cross-Phase Themes

Every action must be real; every number must reconcile; every rule must be enforced; every failed/unknown save must be recoverable; every release claim must link to evidence. The theme is completing and verifying existing behavior, not building a larger application.

No new speculative TODOS: the existing backlog already holds deferred domains. All defects affecting the frozen critical scope remain in this plan, not postponed to inflate the score. Any newly discovered critical dependency is added to its owning task with a regression test before proceeding.

## DX Outside Review and Final Decisions

Newton (independent Codex) added three requirements, accepted:

- **Production startup after pruning:** deploy/nas/deploy.sh removes dev dependencies while npm start invokes tsx, a dev dependency. T7 must test the documented non-PM2 production start with production dependencies only, or explicitly retire that unsupported native route in favor of the tested container path. No instruction may direct an operator to a missing executable. Add this to W8/DX startup regression.
- **Executable isolation:** T2 supplies a documented verification command with separate prerequisite installation and execution stages. Provision uniquely named disposable PostgreSQL and a test-only port; verify database/process/resource ownership; fail within bounded time on occupied ports, missing dependencies or unreachable DB. Cleanup only IDs recorded by that run. Never install dependencies or mutate a database before the preflight reports the target and purpose. No fallback to the demo.
- **Persistent evidence identity:** T1/T7 define a machine-readable release manifest with source commit/tree state, image digest, schema/config-feature fingerprint (no secrets), commands/exit codes/pass-fail-skip counts, timestamps and retained artifact paths. Write it for failed runs too. Bind immutable release ID to operator-visible version info or CLI inspection, with sensitive infrastructure details restricted to operators. Retain CI evidence at least through the supported rollback window; no package version alone as identity.

Decision log additions: D20 DX/mechanical, production-only startup proof (completeness); D21 DX/mechanical, executable isolated verification (explicit); D22 DX/mechanical, failed-run evidence and running-release identity (explicit). Total 22 plan decisions; policy/taste defaults remain subject to approval.

DX completion: eight passes considered, seven applicable, one ecosystem pass N/A; nine-stage journey, empathy narrative, target TTHW and implementation checklist present. Three independent additions. No actual TTHW measured. Cross-model consensus N/A because Claude is unavailable; no independent Claude endorsement claimed.

## Approval and Verification Status

Artifacts written: original request restore point; this reviewed plan; companion acceptance-test plan. CEO/design/engineering/DX native Codex reviews completed sequentially and their independent findings incorporated. Product and design each had four outside findings; engineering four; DX three. Same-model review is not cross-model consensus.

Autoplan tooling limitations: Claude and jq were not available on PATH. Per-skill JSONL aggregation/global gstack logging was not run; Markdown task/decision records in this workspace are authoritative for this review. Git Bash exists but was not used to install tools or write global metadata. No global dashboard entry, generated mockup, browser QA, audit certificate or pilot completion is claimed. jq can enable the optional automatic task aggregation later.

Fresh executed verification only: production-source TypeScript gate PASS; full-project TypeScript gate FAIL. The full test, build/container, real PostgreSQL, browser, performance and human validation gates are pending. No financial writes, database resets, package installs, deployments or source edits occurred in this review. Concurrent work must be re-read before implementation and candidate tests rerun after integration.

Final gate: approve T1-T9 to begin implementation, with T1/T2 first and no deployment/live-data approval implied. The target is earned only from the stated evidence, not from completing the checklist text. Actual user trials, infrastructure access and owner/accountant/security sign-off remain external dependencies.

## GSTACK REVIEW REPORT

Status: REVIEW_COMPLETE_IMPLEMENTATION_PENDING. Product: 11 sections, explicit scope and evidence rubric, 4 independent findings accepted. Design: 7 passes, planned specificity 9/10, 4 independent findings accepted; live quality unscored. Engineering: all 4 sections, diagrams/coverage/failure maps, 4 independent findings accepted; eight journey groups and nine implementation tasks. DX: 7 applicable passes plus ecosystem N/A, 3 independent findings accepted. Current verified result: source tsc pass / full tsc fail. Application 9/10: NOT YET ESTABLISHED. Approval: PENDING. Cross-model/global aggregation tooling limitations recorded above.
