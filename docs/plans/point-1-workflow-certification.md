<!-- GSTACK_RESTORE_POINT: C:/Users/HI/.gstack/projects/vijaychintala05-Finance-app/point-1-workflow-certification-original-20260823-132933.md -->

# Point 1 Workflow Certification Plan

## Implementation Status (2026-08-23)

All Point-1 workflow slices are implemented behind source-controlled capability gates:

- AR/AP settlements, credits, refunds, advances, applications, write-offs, and audited reversals
- Durable recurring invoice, bill, and expense occurrence processing
- Fixed-asset capitalization, depreciation, disposal, reversal, and period close/reopen
- Invitation, role, revocation, last-owner, and accountant-access lifecycle
- Encrypted organization exports, isolated staging, reconciliation, and password-confirmed promotion
- Capability-aware desktop/mobile navigation and authoritative server-backed workspaces

Local release evidence: TypeScript passed, production build passed, 54 Vitest files and 509 tests passed, and the Point-1 Playwright lifecycle passed on desktop Chromium and Mobile Chrome. Package installation reported zero vulnerabilities.

Production remains fail-closed unless `TRUSTED_FINANCE_FEATURES` is explicitly configured. A production deployment must also provide PostgreSQL plus `RECOVERY_ACTIVE_KEY_ID`, `RECOVERY_ENCRYPTION_KEY_BASE64`, and `RECOVERY_HMAC_KEY_BASE64`, then complete the real-PostgreSQL migration, lock-contention, and restore drill described below.

## Objective

Finish, certify, and safely expose the accounting and governance workflows that already exist in partial, prototype, or gated form. The release must replace browser-only placeholders with authenticated, tenant-scoped, atomic server workflows and remove or clearly mark anything that remains unavailable.

## Target Users

- Small-business owner operating the books
- Staff accountant processing daily transactions
- External accountant reviewing and closing periods
- Organization administrator managing users and recovery controls

## Scope

### Financial Workflows

1. Vendor payments and vendor credits
2. Customer credit notes, refunds, and customer advances
3. Recurring invoices, recurring bills, and recurring expenses
4. Fixed assets, depreciation, disposal, and reversal
5. Period close, controlled reopen, and close evidence

### Governance and Operations

6. Verified organization backup, restore, and export
7. User invitations, role changes, membership revocation, and accountant access
8. UI availability cleanup for gated or incomplete workflows

## Certification Standard

Every enabled financial workflow must provide:

- Authenticated tenant isolation and exact RBAC permission checks
- One PostgreSQL transaction for source record, allocations, journal, audit event, and idempotency outcome
- Integer-cent validation at application boundaries
- Period-lock and account-lock enforcement
- Immutable posted records with an audited reversal or correction path
- Database constraints for tenant-safe references and valid states
- Integration tests for happy paths, validation, rollback, tenant boundaries, idempotency, and reversals
- Real PostgreSQL migration and concurrency verification where pg-mem cannot prove behavior
- Desktop and mobile browser coverage for the primary journey
- Loading, empty, error, success, disabled, and partial states in the UI
- Operational logging, request IDs, and recovery documentation

## Initial Delivery Slices

### Slice A: Current-State Reconciliation

- Inventory every enabled, gated, prototype, and duplicated implementation.
- Reconcile the existing uncommitted hardening work with the trusted controller routes.
- Establish one canonical service path per workflow.
- Add a certification matrix and release gates.

### Slice B: Receivables Corrections

- Credit-note issue, application, reversal, and customer ownership checks
- Customer advance receipt, application, refund, and reversal
- Customer refund posting and reconciliation

### Slice C: Payables Settlement

- Vendor payment allocation and reversal
- Vendor advance issue and application
- Vendor credit issue, application, and reversal
- Bill and AP-control reconciliation

### Slice D: Scheduled Transactions

- Durable job execution and retry model
- Recurring invoice, bill, and expense generation
- Idempotent occurrence keys, pause/resume, failure logs, and catch-up rules

### Slice E: Assets and Close

- Asset capitalization, depreciation schedules, disposal, and reversal
- Close checklist, integrity checks, lock creation, authorized reopen, and audit evidence

### Slice F: Governance and Recovery

- Invitation lifecycle, verified acceptance, role changes, revocation, and accountant role
- Encrypted backup artifact, validated restore into an isolated staging tenant, reconciliation, and promotion
- Audited organization export with manifest and integrity hashes

### Slice G: Product Surface Cleanup

- Remove duplicate or unreachable prototype paths.
- Expose only certified routes and actions.
- Show unavailable states with a concrete reason and required next action.
- Update production-readiness and operator documentation.

## Verification

Run before every slice checkpoint:

```text
npm run lint
npm test
npm run build
```

Run for relevant release candidates:

```text
npm run test:e2e
npm audit --omit=dev
PostgreSQL migration, rollback, restore, and concurrent-allocation suites
```

## Constraints

- Preserve the existing uncommitted work and do not silently replace overlapping changes.
- Do not expose a workflow merely because a UI or service class exists.
- Do not use browser persistence as financial storage or as a backup mechanism.
- Do not make automatic destructive repairs to accounting records.
- Do not add GST, payment gateways, portals, inventory, payroll, or AI in this point-1 effort.

## Open Premises

- The immediate product goal is reliability and completion of existing workflows, not Zoho-wide feature parity.
- PostgreSQL is available for certification and production-like verification.
- One organization may have owners, employees, and an external accountant with different permissions.
- Backups and restores must preserve auditability, tenant isolation, and accounting reconciliation.
- Existing prototypes may be removed when they conflict with the canonical certified path.

## Phase 1: CEO Review

### 0A. Premise Challenge

1. **One release versus one program:** implementing every domain is reasonable, but shipping all domains behind one release decision is not. Point 1 should be a multi-release certification program with an independent release gate for each workflow slice.
2. **Greenfield versus certification:** many named capabilities already have service code, schema, UI prototypes, or gated routes. The work is consolidation, completion, and certification, not eight unrelated greenfield builds.
3. **PostgreSQL evidence:** production-like PostgreSQL is a prerequisite, not an assumed local capability. Any workflow relying on locks, isolation, migrations, scheduling, or restore remains uncertified until real-PostgreSQL evidence exists.
4. **Backup meaning:** organization export/restore is an application feature. It does not replace managed PostgreSQL backups, point-in-time recovery, encrypted storage, retention, or infrastructure disaster recovery.
5. **Accountant access:** a static role name is not an access lifecycle. The product needs invitation issuance, verified acceptance, expiry, replay prevention, role change, revocation, owner safeguards, and audit evidence.
6. **Prototype removal:** prototype paths may be removed only after navigation and behavior are mapped and the existing uncommitted hardening work is preserved.
7. **Priority evidence:** the roadmap does not prove that fixed assets and tenant restore are as urgent as daily AR/AP work. AR/AP is the first user-value release, while all Point-1 domains remain in the program.

### 0B. Existing-Code Leverage Map

| Sub-problem | Existing leverage | Required delta |
|---|---|---|
| AR settlements | `SalesEngine`, finance routes, AR reconciliation, current atomicity tests | Canonical controller path, reversals, typed errors, UI certification, real PostgreSQL evidence |
| AP settlements | `PurchasesEngine`, AP reconciliation, vendor-credit/payment UI | Trusted routes, reversals, UI wiring, real PostgreSQL evidence |
| Recurring work | `RecurringJournalService`, recurring invoice/bill/expense views and types | Durable occurrence ledger, scheduler/worker, retries, catch-up policy, server APIs |
| Fixed assets | `FixedAssetService` and related schema | One transaction per event, complete lifecycle, reversal, UI workspace |
| Period close | `PeriodCloseService`, accounting integrity checks, transaction-lock UI | Validation under lock, close evidence, affected-row checks, controlled reopen UX |
| Backup/restore/export | `BackupRestoreService`, `DataExportService` | Encrypted server artifacts, manifest/checksums, staged restore, reconciliation and promotion |
| Membership/RBAC | Organization membership controller, `RbacService`, role model | Invitation tokens, acceptance/expiry, role-change/revocation APIs, accountant lifecycle |
| Product availability | Trusted-feature middleware, readiness documentation, alert-driven prototypes | Per-workflow certification matrix, truthful navigation and unavailable states |

### 0C. Dream State

```text
CURRENT
trusted core + gated services + browser prototypes + duplicated command paths
   |
   v
THIS PROGRAM
canonical commands + durable jobs + audited governance + certified UI slices
   |
   v
12-MONTH IDEAL
one accounting workflow platform sharing posting, reversal, scheduling,
authorization, evidence, reconciliation, observability, and recovery primitives
```

The plan reaches a trustworthy small-business accounting operations layer. It does not reach broad Zoho Books parity, jurisdiction-wide tax compliance, inventory, payroll, portals, or infrastructure disaster recovery.

### 0C-bis. Implementation Alternatives

| Approach | Effort | Risk | Completeness | Decision |
|---|---:|---:|---:|---|
| AR/AP only | Medium | Low | 5/10 | Defer as a fallback; too narrow for the stated Point-1 goal |
| Domain certification program | XL | Medium | 9/10 | **Recommended:** retain total scope, ship independently gated slices |
| Accounting command-platform rewrite | XL+ | High | 10/10 theoretical | Reject; replaces too much working trusted-core code |

### 0D. Selective Expansion Decisions

| ID | Decision | Principle | Result |
|---|---|---|---|
| CEO-01 | Convert the all-at-once release into independently certified slices | Completeness, reversibility | Accept |
| CEO-02 | Add a durable occurrence ledger and worker boundary | Completeness | Accept |
| CEO-03 | Add typed domain errors and one HTTP mapping layer | Simplicity, consistency | Accept |
| CEO-04 | Treat restore as staging validation plus explicit promotion | Reliability | Accept |
| CEO-05 | Keep managed PostgreSQL PITR outside the application feature | Avoid duplication | Accept |
| CEO-06 | Add invitation and membership lifecycle, not merely another role | Completeness | Accept |
| CEO-07 | Defer GST, payments, portals, inventory, payroll, AI, and broad parity | Scope control | Defer |
| CEO-08 | Avoid a wholesale `BooksContext` rewrite | Reversibility | Reject expansion |

### 0E. Temporal Interrogation

- **Hour 1:** inventory gates, routes, services, schemas, prototypes, and overlapping uncommitted changes; establish canonical ownership.
- **Hour 2:** build the certification matrix and identify the first AR/AP release boundary.
- **Hours 3-5:** specify shared command, error, reversal, audit, idempotency, and test contracts before adding endpoints.
- **Hour 6+:** deliver one slice at a time, verify it against real PostgreSQL and browser journeys, then promote only that slice to the allowlist.
- **Six-month regret to avoid:** a wide UI that appears Zoho-like while recurring runs, restore, close, and access management remain operationally unsafe.

### 0F. Mode

**SELECTIVE EXPANSION.** Preserve the complete Point-1 program, add only the shared primitives needed to make it coherent, and release by certification slice.

### Outside Voices

The Claude-specific subagent runtime was unavailable in this host. The Codex CLI was present but could not launch because Windows denied access, even after escalation. An independent Codex subagent completed a separate read-only CEO pass; its critical findings agreed with the primary review on release slicing, canonical service ownership, durable scheduling, staged restore, and real-PostgreSQL certification.

#### CEO Dual-Voice Consensus

| Dimension | Claude | Codex CLI | Independent subagent signal | Formal consensus |
|---|---|---|---|---|
| Premises valid? | N/A | N/A | Revised premises required | N/A |
| Right problem? | N/A | N/A | Yes, reframed as workflow certification | N/A |
| Scope calibrated? | N/A | N/A | Keep scope, split release gates | N/A |
| Alternatives explored? | N/A | N/A | Three approaches evaluated | N/A |
| Competitive risk covered? | N/A | N/A | Trust and operability matter more than feature count | N/A |
| Six-month trajectory sound? | N/A | N/A | Sound only with staged releases | N/A |

Formal two-model confirmation is **0/6** because the required Claude and Codex CLI voices were unavailable. The independent pass is retained as supporting evidence, not misrepresented as cross-model consensus.

### Section 1: Architecture and Boundaries

The current engines, services, controllers, jobs, and browser context overlap. Each financial command must have one canonical application-service owner called by HTTP controllers, scheduled jobs, and future integrations. The plan will reuse the existing transaction-capable database boundary and posting engines, while preventing direct controller reimplementations of allocation or posting logic.

Recurring work requires a durable occurrence record, deterministic occurrence key, claim/lease semantics, retry state, and worker ownership. Backup/restore requires a separate administrative orchestration boundary because long-running artifact validation and promotion should not occur inside an ordinary synchronous CRUD request.

### Section 2: Errors and Rescue

Generic `Error`, browser alerts, blanket 400/500 responses, and swallowed audit/backup failures are incompatible with certification. The implementation must define typed domain error codes and a single HTTP mapping policy, with request IDs propagated to UI errors and logs.

#### Error & Rescue Registry

| Codepath | Named failure | Rescue/action | User sees | Required test |
|---|---|---|---|---|
| Financial command | `ValidationError`, `PeriodLockedError` | Roll back; return 422/409 | Exact validation or locked period | Integration |
| Allocation | `OwnershipError`, `OverAllocationError`, `ConcurrentBalanceError` | Roll back and refresh balances | Conflict with current amount | Concurrency |
| Posting | `PostingInvariantError`, `AccountUnavailableError` | Roll back source, journal, audit | Failure plus request ID | Failure injection |
| Recurring occurrence | `OccurrenceConflictError`, `ScheduleError` | Deduplicate or quarantine | Run log and retry action | Worker concurrency |
| Fixed asset | `AssetStateError`, `DuplicateDepreciationError` | Roll back event and journal | No partial lifecycle event | Integration |
| Period close | `CloseValidationError`, `CloseConflictError` | Revalidate under lock | Failed checklist items | Concurrency |
| Invitation | `InvitationExpiredError`, `RoleConflictError` | Reject token; retain membership | Expired/conflict guidance | Security integration |
| Artifact creation | `ArtifactWriteError`, `ManifestMismatchError` | Abort incomplete artifact | Safe failure with request ID | Artifact integration |
| Restore | `RestoreValidationError`, `RestoreReconciliationError` | Destroy staging copy only | Production unchanged | Restore drill |
| Database | `DatabaseUnavailableError` | Fail closed; retry only safe reads/jobs | Temporary outage | Resilience |

### Section 3: Security and Tenant Safety

Every command requires authenticated organization context, exact RBAC, tenant-safe foreign keys, ownership checks, and audit evidence. Restore is the highest-risk surface: client-provided payloads, tenant deletion, ignored errors, and conflict-skipping cannot be certified. Invitation tokens must be hashed at rest, single-use, scoped, expiring, and protected against privilege escalation and last-owner removal.

### Section 4: Data Integrity and User State

All financial amounts cross application boundaries as integer cents or exact decimals; stale balances are rechecked under locks. The plan must specify double-submit, stale-page, navigation-away, expired-invitation, duplicate occurrence, partial export, close/reopen race, and failed-refresh behavior. Posted documents remain immutable and use explicit reversal/correction commands.

### Section 5: Code Quality

Remove duplicated posting/allocation paths only when the canonical replacement is covered. Avoid float arithmetic, timestamp-derived identifiers, swallowed exceptions, dynamic restore SQL, and repeated account-resolution logic. Shared abstractions are justified for commands, reversals, occurrence processing, artifact manifests, and domain-error mapping; a broad frontend context rewrite is not.

### Section 6: Test Strategy

Keep the current atomicity and allocation-concurrency tests, then add real-PostgreSQL isolation and migration suites, scheduler retry/catch-up and dual-worker tests, asset reversal tests, close/reopen races, invitation replay/expiry tests, staged-restore drills, export-integrity checks, an RBAC matrix, and desktop/mobile lifecycle coverage. `pg-mem` remains useful for fast tests but cannot certify row locks or production migrations.

### Section 7: Performance

Recurring due-work scans, allocations, advances, close records, backup history, and membership lookups need workload-specific indexes and pagination. Backup/restore and export must stream or batch rather than accumulate unbounded tenant data or issue unbounded row-by-row queries. Worker claims need bounded batches and retry backoff.

### Section 8: Observability and Operations

Every workflow carries request, command, and occurrence IDs. Required operations evidence includes structured logs, posting and retry metrics, reconciliation-difference alerts, artifact status, restore drill results, close evidence, and operator runbooks. Silent rescue is prohibited for financial, audit, backup, restore, and access-control writes.

### Section 9: Deployment and Rollback

Use additive migrations first, dormant code second, certification evidence third, allowlist promotion fourth, and tenant canaries fifth. Each workflow has its own kill switch and rollback/reversal procedure. Restore and period close require rehearsed operational rollback before promotion.

### Section 10: Long-Term Trajectory

The certification-program approach has reversibility **4/5** because slices remain gated and share explicit contracts. Direct in-place restore is **1/5** and is rejected. Command, reversal, scheduling, evidence, and reconciliation primitives create useful platform infrastructure without forcing a full rewrite.

### Section 11: Product Design

UI scope is material. Active controls that end in browser alerts are deceptive and must become certified workflows or explicit unavailable states. Each workflow needs loading, empty, validation, conflict, partial, success, and reversal states, with role-sensitive navigation and accessible desktop/mobile journeys.

### Failure Modes Registry

| Codepath | Failure mode | Current rescue | Current test | User-visible | Required change |
|---|---|---|---|---|---|
| Restore | Failed table or row silently skipped | None | Partial | No | Staged atomic restore and hard failure |
| Asset depreciation | Journal posts, asset entry fails | None | No | Generic 500 | One transaction and injected rollback test |
| Asset disposal | Journal posts, asset update fails | None | No | Generic 500 | One transaction and reversal |
| Recurring generation | Document posts, schedule update fails | None | No | No | Occurrence ledger and retry state |
| Period close | Validation becomes stale before lock | None | No | Ambiguous conflict | Validate and lock atomically |
| Reopen | Missing closed period updates zero rows as success | None | No | False success | State and row-count validation |
| Invitation | Expired or replayed token | Not implemented | No | N/A | Hashed single-use token lifecycle |
| Export | One query fails after others complete | Generic error | No | Partial | Manifested job with terminal failure |
| Allocation | Concurrent over-allocation | Transaction/locks | Current hardening tests | Yes | Retain and certify on PostgreSQL |
| Rollout | UI exposed before workflow certified | Trusted feature gate | Partial | 503/alert | Navigation and allowlist tied to certification |

### NOT in Scope

- GST filing and broad jurisdiction localization
- Payment gateways and bank-feed expansion beyond already certified scope
- Customer/vendor portals
- Inventory and order fulfillment
- Payroll
- AI features
- Historical AR/AP reconstruction and broad Zoho Books parity
- Replacing managed database PITR with application export
- A wholesale `BooksContext` rewrite
- Automatic repair or deletion of corrupt accounting records

### Completion Summary

| Item | Result |
|---|---|
| Recommended approach | Domain certification program |
| Mode | Selective Expansion |
| Critical gaps | Canonical service ownership, durable scheduler, staged restore, access lifecycle, typed errors, PostgreSQL certification |
| Release sequence | Reconciliation; AR/AP; recurring; assets; close; access; export/restore; product cleanup |
| UI scope | Yes |
| Architecture concerns | 6 material concerns |
| Security concerns | 3 high-severity surfaces |
| Major test gaps | 8 categories |
| Observability gaps | 5 categories |
| Existing uncommitted work | Preserve and reconcile; do not overwrite |
| External review status | Independent same-model pass completed; Claude and Codex CLI unavailable |
| Premise status | **Confirmed by user: Option A** |

### Premise Gate

- **A. Confirm revised premises (recommended, 9/10 completeness):** Point 1 is a multi-release certification program with independent gates; managed PostgreSQL/PITR remains mandatory infrastructure.
- **B. Keep one all-at-once release (7/10 completeness):** implement every domain together and accept materially higher integration and rollback risk.
- **C. Narrow to AR/AP first (5/10 completeness):** ship receivables/payables corrections and defer recurring, assets, close, recovery, and governance.

**Decision:** Option A confirmed. Proceed with independently certified releases while retaining the complete Point-1 program.

## Phase 2: Design Review

### Design Audit

The existing `DESIGN.md`, application shell, hash routing, common empty/loading components, and server-backed payment/period-lock patterns provide a usable base. The structural conflict is that routes and polished forms can exist while their actions still terminate in `window.alert`, and several Point-1 routes are absent from desktop and mobile navigation. Fixed assets, true period close, recovery, and membership lifecycle do not yet have complete workspaces.

The live auth surface was inspected at 1440x900 and a Pixel 7 viewport. Production startup correctly failed closed without PostgreSQL; test-mode startup succeeded, but account creation did not complete during the read-only browser inspection, so authenticated screenshots remain a required implementation checkpoint.

### Seven Design Passes

| Dimension | Before | Target after decisions | Decision |
|---|---:|---:|---|
| Information Architecture | 4/10 | 9/10 | Certified, role-sensitive domain navigation |
| Interaction States | 3/10 | 9/10 | Shared authoritative state contract |
| User Journey | 2/10 | 9/10 | Review, commit, evidence, recovery sequence |
| AI Slop Risk | 4/10 | 9/10 | Dense accounting workspace with fewer decorative cards |
| Design System Alignment | 5/10 | 9/10 | Extend `DESIGN.md` into reusable workflow primitives |
| Responsive & Accessibility | 3/10 | 9/10 | Purpose-built mobile rows and accessible dialogs |
| Unresolved Decisions | 2/10 | 9/10 | Functional choices settled; one visual taste choice retained |
| **Overall** | **3.3/10** | **9/10** | Authenticated visual validation remains before 10/10 |

### Information Architecture

```text
FirmBooks
|-- Dashboard
|-- Sales
|   |-- Invoices
|   |-- Payments Received
|   |-- Credits, Advances & Refunds
|   `-- Recurring Invoices
|-- Purchases
|   |-- Bills
|   |-- Payments Made
|   |-- Vendor Credits & Advances
|   `-- Recurring Bills / Expenses
|-- Accounting
|   |-- Chart of Accounts / Journals
|   |-- Fixed Assets
|   `-- Period Close
|-- Reports
`-- Settings
    |-- Team & Roles
    |-- Recovery & Export
    |-- Audit Log
    `-- Preferences
```

Navigation is derived from server-provided capabilities and permissions. Unauthorized modules are omitted. Read-only members see workspaces without mutation controls. An uncertified but relevant module appears as an informative unavailable row only when the user can act on its prerequisite; it never presents an enabled primary action that ends in an alert.

### Interaction-State Matrix

| Workspace | Loading | Empty | Error/conflict | Success | Partial/unavailable |
|---|---|---|---|---|---|
| AR corrections | Ledger skeleton | Create first credit/advance | Stale balance and refresh action | Posting/allocation references | Unused credit remains visible |
| AP settlement | Bill/allocation skeleton | Select unpaid bill | Over-allocation and refreshed balance | Payment/journal/balance | Unallocated vendor advance |
| Recurring | Schedule rows | Create first schedule | Failed occurrence with retry | Next run and generated document | Paused or quarantined run |
| Assets | Register skeleton | Add first asset | Invalid state or duplicate period | Asset and journal references | Depreciation overdue |
| Period close | Checklist skeleton | Choose period | Blocking checks listed | Immutable close evidence | Reopened with reason |
| Backup/export | Job-history skeleton | No artifacts | Request ID and safe retry | Manifest, hash, download | Expired or failed artifact |
| Restore | Validation progress | Select artifact | Production unchanged | Staging comparison ready | Awaiting promotion |
| Team access | Member rows | Invite first member | Expired/replayed/conflicting role | Invitation/role audit entry | Pending/expired invitation |

Errors remain inline until dismissed, preserve user input, and include request IDs for unexpected failures. Financial success appears only after the authoritative server response and refresh; toast-only confirmation is insufficient.

### User-Journey Storyboard

| Step | User action | Intended feeling | Required UI |
|---|---|---|---|
| 1 | Opens workspace | Oriented | Organization, period, status, primary action |
| 2 | Selects source records | Confident | Current balances and ownership |
| 3 | Enters action/allocation | In control | Immediate cent/date/account validation |
| 4 | Reviews consequences | Cautious | Posting summary and affected documents |
| 5 | Confirms | Certain | Explicit financial verb, never generic `Save` |
| 6 | Server commits | Patient | Locked controls and non-optimistic progress |
| 7 | Sees result | Reassured | Journal, source, audit, reversal, request reference |
| 8 | Returns after reload | Trusting | Durable status and history |

### Concrete Product Decisions

1. Combine customer credit notes, advances, refunds, and reversals into one receivables-corrections workspace with tabs and shared customer-balance context.
2. Mirror that structure for vendor payments, credits, advances, and reversals.
3. Use one recurring-schedules workspace with type filters and a shared occurrence/run-history model rather than three copied interaction designs.
4. Make Fixed Assets a first-class accounting register with lifecycle history, depreciation preview/posting, disposal, and reversal.
5. Keep Period Close distinct from simple period locks; close requires checklist, blockers, evidence, explicit confirmation, and reopen history.
6. Put backup, export, restore validation, staging comparison, and promotion in a Recovery Center. Promotion requires recent re-authentication and typed confirmation.
7. Add Team & Roles with pending invitations, expiry, a role matrix, accountant access, revocation, last-owner protection, and audit evidence.
8. Replace `window.alert`, `prompt`, and `confirm` in Point-1 flows with accessible inline errors and purpose-built dialogs.
9. Preserve canonical URLs and redirect retired prototype routes to their replacement workspace.
10. New workflow UI uses domain query/mutation modules and server DTOs, not new financial setters in `BooksContext`.

### Visual-System Decision

This is operational APP UI: use dense, unframed workspaces, compact filter/tool bands, tables on desktop, and ledger rows on mobile. Avoid stacked card mosaics, repeated `rounded-2xl`, decorative icon containers, hover-lift effects, and 10px body text. Blue remains the action accent; teal, amber, and rose are reserved for financial/status semantics. Standard radii are 6-8px.

**TASTE-DESIGN-01:** preferred typography is IBM Plex Sans with IBM Plex Mono for identifiers and amounts. The lower-risk alternative is retaining the current font while applying the same size, density, and hierarchy rules. This stays visible at the final gate.

### Responsive and Accessibility Contract

- Desktop uses persistent navigation and stable, dense tables.
- Mobile uses a drawer plus ledger rows showing identity, amount, status, and primary action; secondary data opens in details.
- Dialogs become full-height sheets below 640px.
- Touch targets are at least 44px; body text is at least 16px on mobile input surfaces.
- Rows are keyboard-operable with visible focus; dialogs trap and restore focus and support Escape when safe.
- Icon-only buttons have accessible names and tooltips where unfamiliar.
- Commit progress uses `aria-live`; status never relies on color alone.
- Text/background contrast meets WCAG AA; validation moves focus to an error summary.
- Every field has a persistent label; placeholders are examples, not labels.

### Approved Mockups

| Workflow | Artifact | Status |
|---|---|---|
| Point-1 workspaces | Source-informed specification only | No external mockup approved; generate and visually validate during each slice before implementation completion |

### Design Decisions Log

| ID | Decision | Principle | Result |
|---|---|---|---|
| DESIGN-01 | Capability-driven navigation | Truthfulness/completeness | Accept |
| DESIGN-02 | Shared financial mutation and error states | Consistency | Accept |
| DESIGN-03 | Consolidated AR/AP workspaces | Simplicity | Accept |
| DESIGN-04 | Shared recurring workspace and run history | Avoid duplication | Accept |
| DESIGN-05 | First-class asset and close workspaces | Completeness | Accept |
| DESIGN-06 | Staged Recovery Center | Safety/reversibility | Accept |
| DESIGN-07 | Role-sensitive visibility and read-only mode | Security/usability | Accept |
| DESIGN-08 | Replace browser dialogs in Point-1 flows | Accessibility | Accept |
| DESIGN-09 | Dense, card-light operational visual style | Domain fit | Accept |
| TASTE-DESIGN-01 | IBM Plex versus current typeface | Taste | Final gate |

### Design Implementation Tasks

- [ ] **P1:** Build capability-driven navigation and truthful unavailable states in `App`, `Sidebar`, and `MobileNav`.
- [ ] **P1:** Add shared financial mutation, error, request-ID, review, and authoritative-refresh primitives.
- [ ] **P1:** Replace credit-note prototypes with the receivables-corrections workspace.
- [ ] **P1:** Replace vendor payment/credit prototypes with the payables-settlement workspace.
- [ ] **P1:** Consolidate recurring profiles and occurrence history into one scheduled-transactions workspace.
- [ ] **P1:** Create fixed-assets register, lifecycle detail, and posting dialogs.
- [ ] **P1:** Create period-close checklist, evidence, close, and reopen workspace.
- [ ] **P1:** Create Recovery Center with artifact history, validation comparison, and promotion.
- [ ] **P1:** Create invitation, role, accountant-access, and revocation UI.
- [ ] **P2:** Replace browser dialogs and retire compatibility actions after route migration.
- [ ] **P2:** Implement mobile ledger layouts, accessible dialogs, focus management, and live regions.
- [ ] **P2:** Apply typography, radius, color, and density tokens across Point-1 workspaces.
- [ ] **P1:** Add desktop/mobile, keyboard, permission, state, reload, conflict, and recovery E2E coverage.

### Design Outside Voice and Completion

Claude-specific and Codex CLI voices remain unavailable. An independent same-model design subagent completed a full read-only pass and agreed with the primary review on truthful navigation, consolidated domain workspaces, shared state contracts, staged restore, responsive ledgers, and accessibility. This is supporting evidence, not cross-model consensus.

| Item | Result |
|---|---|
| Seven passes | Complete |
| Functional decisions | 10 auto-decided |
| Unresolved functional decisions | 0 |
| Taste decisions | 1 grouped visual-system choice |
| Initial to target score | 3.3/10 to 9/10 |
| UI scope | Confirmed |
| Authenticated visual validation | Required during implementation |
| Phase status | Complete with one taste decision |

**Final design decision:** TASTE-DESIGN-01 approved as recommended. Use IBM Plex Sans with IBM Plex Mono for identifiers and monetary values.

## Phase 3: Engineering Review

### Scope and Complexity Gate

This program exceeds eight files and two services, so a single-release implementation would be unsafe. The user already resolved this gate by selecting Option A: retain the full program while implementing and releasing independently certified slices. No direction-changing challenge remains.

### Canonical Architecture

```text
UI command
  -> API + organization isolation + RBAC + idempotency
  -> canonical domain command
       BEGIN
       -> lock tenant/source rows in deterministic order
       -> validate cents, dates, ownership, period, state
       -> source + allocations
       -> balanced posting journal
       -> audit/evidence + idempotency outcome
       COMMIT
  -> authoritative reload
  -> source, journal, audit, reversal, request references

Scheduler
  -> claim bounded due occurrences with SKIP LOCKED + lease
  -> deterministic occurrence key
  -> canonical invoice/bill/expense command
  -> success + next run OR retry/backoff/quarantine

Recovery
  -> immutable encrypted artifact
  -> manifest/schema/signature validation
  -> isolated staging tenant
  -> relational + subledger + GL reconciliation
  -> recent re-authentication + typed confirmation
  -> owner-only promotion transaction + evidence
```

### Architecture Findings

| Severity | Confidence | Finding and evidence | Decision |
|---|---:|---|---|
| P1 | 10/10 | AP commands exist in `PurchasesEngine`, but finance routes expose no vendor settlement command surface | Add gated canonical AP endpoints; retire browser setters after migration |
| P1 | 10/10 | Recurring invoices, bills, and expenses are browser placeholders; only recurring journals have server support | Add shared profile/occurrence schema and bounded worker |
| P1 | 10/10 | Asset journal posting and depreciation/disposal state writes are separate operations | Make each lifecycle event one transaction and add reversal commands |
| P1 | 9/10 | Period validation finishes before the close transaction | Lock organization/period and revalidate inside the transaction |
| P0 | 10/10 | Direct restore deletes tenant data and can suppress row/table failures | Replace with strict staging and explicit promotion; never certify current path |
| P1 | 10/10 | Membership requires a pre-registered user and lacks invitation/change/revoke lifecycle | Add hashed expiring single-use invitations and audited membership commands |
| P1 | 10/10 | Trusted-feature gates correctly prevent premature exposure | Preserve two-key promotion with one flag per certified slice |

### Code Quality Findings

1. **P0:** restore constructs SQL column lists from uploaded object keys. Replace generic reconstruction with explicit versioned table schemas and allowlisted columns.
2. **P1:** controller audit helpers can suppress failures. Certified domain commands own audit insertion and propagate failure inside the transaction.
3. **P1:** `PeriodCloseService` and `AccountingPeriodService` overlap. Consolidate close/reopen ownership while keeping simple period locks as a separate facade.
4. **P1:** generic error strings produce inconsistent statuses. Add typed domain errors and one Express error mapper carrying request IDs.
5. **P2:** replace timestamp-derived IDs in assets/close with `newId()`.
6. **P2:** extract Point-1 command/query modules from oversized controller/context surfaces without a wholesale rewrite.
7. **P2:** convert asset and settlement calculation boundaries to integer cents or exact database decimals.
8. **P2:** remove server imports of frontend services and restore proper dependency direction.

### Test Coverage Diagram

```text
API request
|-- authentication missing ------------------------------> 401 + no writes
|-- organization/permission invalid ---------------------> 403/404 + no disclosure
|-- idempotency replay
|   |-- same payload ------------------------------------> prior outcome
|   `-- changed payload ---------------------------------> 409
|-- validation/period/account/state failure -------------> 409/422 + no writes
|-- concurrent claim/allocation
|   |-- winner ------------------------------------------> commit once
|   `-- loser -------------------------------------------> conflict/current state
|-- injected failure after source/journal/audit ---------> complete rollback
`-- commit ----------------------------------------------> authoritative reload
    |-- source and balances match
    |-- journal balances at cents
    |-- audit/evidence exists
    `-- reversal restores reconciled state
```

### Certification Test Matrix

| Domain | Unit/integration | Real PostgreSQL and browser |
|---|---|---|
| AR/AP | validation, RBAC, tenant ownership, lock order, allocation aggregation, audit rollback, every reversal, GL reconciliation | Same-document and reversed-order concurrency; desktop/mobile create/apply/reverse/reload |
| Recurring | month-end, leap year, pause/resume, end date, catch-up, retry/backoff, quarantine | Two workers, `SKIP LOCKED`, crash after posting, occurrence replay |
| Assets | capitalization, residual value, partial/final depreciation, gain/loss, invalid states, reversal | Duplicate-period race, failure after journal, lifecycle reload |
| Close | blockers/warnings, immutable evidence, reopen reason/state/row count | Posting during close, duplicate close, close/reopen race |
| Recovery/export | manifest, schema, signature, tenant mismatch, corruption, missing rows, reconciliation | Staged restore drill, failed promotion, production unchanged, large streamed artifact |
| Access | expiry, replay, email mismatch, escalation, revoke, last owner, session effects | Invite/accept/change/revoke lifecycle and permission-sensitive navigation |
| UI cleanup | loading, empty, error, conflict, success, partial, disabled, keyboard/focus | Double-submit, stale tab, slow/500/offline, reload, desktop/mobile |

### Performance and Security

- Stream backup/export under a repeatable-read snapshot; do not materialize and stringify an unbounded organization in memory.
- Load validated restore data into staging tables in batches; do not use row-by-row conflict-skipping inserts.
- Claim recurring work in bounded batches with lease expiry and `(status, next_run_date)` indexes.
- Replace invoice/journal N+1 reads with joined or batched paginated queries.
- Add indexes for allocation parents, unapplied advances, credit applications, active locks, invitations, artifact history, and occurrence claims.
- Encrypt artifacts and add a keyed integrity signature; unkeyed SHA-256 alone is not authenticity protection.
- Require recent re-authentication and Owner permission for restore promotion; separate create, validate, download, and promote permissions.
- Treat exports as sensitive data with expiry, access logging, secure downloads, and no hard-coded jurisdiction metadata.

### Failure Contract

Every command returns a stable error code, request ID, retryability flag, and safe authoritative state. Audit failure, skipped artifact data, orphaned asset journals, duplicate recurring documents, stale close validation, inconsistent export snapshots, invitation replay, and promotion failure each require failure injection, rollback assertions, structured logs, metrics/alerts, and a recoverable UI state.

### Dependency Lanes and Merge Order

| Lane | Work | Dependency |
|---|---|---|
| A | Certification matrix, typed errors, capabilities, additive migrations, indexes | None |
| B | AR/AP commands, API routes, reversals | A |
| C | Occurrence ledger, worker, recurring profiles | A; uses stable document commands from B |
| D | Atomic assets and period close | A |
| E | Invitation/RBAC lifecycle | A |
| F | Artifact export and staged restore | A |
| G | Domain UI and navigation cleanup | Matching certified APIs from B-F |

Merge Lane A first. Run B, D, E, and F in parallel worktrees. Start C once canonical invoice, bill, and expense commands are stable. Merge each backend slice before its matching G workspace. Changes to `migrationRunner.ts`, finance routes, or capabilities remain coordinated additive changes.

### Engineering Decision Log

| ID | Decision | Result |
|---|---|---|
| ENG-01 | Keep full scope as sliced program | Accept; user-confirmed |
| ENG-02 | One canonical command per financial operation | Accept |
| ENG-03 | Typed error and request-ID contract | Accept |
| ENG-04 | Gated AP command routes and reversals | Accept |
| ENG-05 | Durable occurrence ledger and worker | Accept |
| ENG-06 | Atomic asset lifecycle and reversals | Accept |
| ENG-07 | Close validation under transaction lock | Accept |
| ENG-08 | Reject current direct restore; stage and promote | Accept, P0 |
| ENG-09 | Hashed invitation lifecycle and owner safeguards | Accept |
| ENG-10 | Real PostgreSQL certification suites | Accept |
| ENG-11 | Domain UI modules; no wholesale context rewrite | Accept |
| ENG-12 | Allowlist promotion only after slice evidence | Accept |

### Engineering Implementation Tasks

- [ ] **ENG-T1 P1:** Inventory routes/services/prototypes and create the certification matrix.
- [ ] **ENG-T2 P1:** Add typed errors, request IDs, canonical command contract, and capability DTOs.
- [ ] **ENG-T3 P1:** Complete AR corrections and reversals on the canonical Sales engine path.
- [ ] **ENG-T4 P1:** Add AP settlement routes, commands, and reversals on the Purchases engine path.
- [ ] **ENG-T5 P1:** Add occurrence schema, worker, schedule commands, retry/quarantine, and recurring document generation.
- [ ] **ENG-T6 P1:** Make asset capitalization/depreciation/disposal/reversal atomic.
- [ ] **ENG-T7 P1:** Make close/reopen validation, evidence, locking, and state transitions atomic.
- [ ] **ENG-T8 P0:** Replace direct backup/restore with secure artifacts, staging validation, reconciliation, and promotion.
- [ ] **ENG-T9 P1:** Implement invitation, role change, revocation, last-owner, and accountant access lifecycle.
- [ ] **ENG-T10 P1:** Add indexes, pagination, bounded batching, and streamed artifacts.
- [ ] **ENG-T11 P1:** Build capability-driven UI and remove/redirect prototype paths.
- [ ] **ENG-T12 P1:** Add real-PostgreSQL, integration, security, and desktop/mobile browser certification suites.

### Engineering Outside Voice and Completion

The independent same-model engineering pass agreed with the primary review on slicing, canonical ownership, durable scheduling, staged restore, access lifecycle, and truthful UI. Claude and Codex CLI remained unavailable, so there is no formal cross-model consensus.

| Item | Result |
|---|---|
| Architecture findings | 7 |
| Code-quality findings | 8 |
| Test-gap domains | 7 |
| Performance/security findings | 8 |
| Critical silent failures | 8 |
| Delivery lanes | 7 |
| Auto-decisions | 23/23 complete |
| Unresolved engineering decisions | 0 |
| Engineering verdict | Viable after P0 restore redesign and P1 certification work |

## Phase 3.5: Developer Experience Review

### Product Type and Persona

FirmBooks is a full-stack TypeScript accounting application with an internal REST/service platform, PostgreSQL migrations, financial engines, automated tests, and operator documentation. The primary Point-1 developer is the internal maintainer or small engineering team certifying accounting workflows. External integration and broad open-source ecosystem support are not Point-1 requirements.

```text
Who:       TypeScript engineer maintaining an accounting product
Context:   Adds or certifies workflows without corrupting tenant ledgers
Tolerance: 10 minutes to start; 30 minutes before setup friction blocks work
Expects:   one setup path, deterministic fixtures, explicit feature status,
           safe migrations, accounting invariants, actionable errors
```

### Developer Empathy Narrative

A new maintainer sees a credible trusted core but must reconstruct how frontend routes, controllers, engines, PostgreSQL, migrations, feature gates, and tests fit together. Existing advanced service classes do not reveal whether schema, RBAC, idempotency, reversal, API, UI, PostgreSQL evidence, and operations are all certified. The strongest asset is the broad test suite; the biggest friction is discovering the authoritative path and the exact promotion contract.

The README also drifts from code: it names an older schema version and says the optional allowlist is empty while the current migration and banking capability code differ. Documentation that describes trust boundaries must be generated or verified against source constants so future maintainers do not make release decisions from stale prose.

### Time to Hello World

| Measurement | Current estimate | Target |
|---|---:|---:|
| Clone to successful build | 15-30 min | <=5 min |
| Clone to running seeded app | 20-40 min | <=7 min |
| First verified Point-1 workflow | 30-60 min | <=10 min |
| Understand authoritative mutation path | Potentially >60 min | <=10 min |

These are estimates until measured on a clean machine. The target experience is one native-PostgreSQL bootstrap command that preflights Node/PostgreSQL, applies migrations, creates deterministic development data, starts the app, and prints the URL; `npm run verify:point1` then runs a deterministic lifecycle and reports the ledger result.

### Developer Journey

| Stage | Developer action | Current friction | Target |
|---|---|---|---|
| Discover | Reads README/readiness docs | Product and contributor paths mixed | `Developing FirmBooks` entry point |
| Install | Installs Node and PostgreSQL | Order and diagnostics are fragmented | One bootstrap/preflight command |
| Hello world | Starts app and creates tenant | No guaranteed golden data path | Deterministic dev fixture and printed credentials |
| Real work | Implements a workflow | Ownership/certification ambiguous | Matrix plus canonical service map |
| Debug | Traces controller, engine, DB, journal | Inconsistent error envelope | Code, cause, fix, request ID, docs link |
| Upgrade | Runs migrations | No complete rehearsal/rollback guide | Schema policy, rehearsal, rollback runbook |
| Scale | Adds concurrency | Invariants distributed across docs/tests | Executable certification checklist |
| Contribute | Opens change | No contributor contract | Required checks and test taxonomy |

### Eight DX Dimensions

| Dimension | Current | Target | Decision |
|---|---:|---:|---|
| Getting Started | 4/10 | 8/10 | Native PostgreSQL bootstrap and golden fixture |
| API/Service Design | 5/10 | 9/10 | Engines/canonical commands own mutations |
| Errors & Debugging | 5/10 | 9/10 | Stable diagnostic envelope and runbooks |
| Documentation | 6/10 | 8/10 | Task-oriented Point-1 and generated status docs |
| Upgrade & Migration | 5/10 | 8/10 | Rehearsal, compatibility, and rollback policy |
| Dev Environment | 6/10 | 8/10 | Reproducible scripts and preflight checks |
| Community & Ecosystem | 2/10 | 5/10 | Internal contribution contract; public API deferred |
| Measurement & Feedback | 3/10 | 8/10 | CI bootstrap and workflow TTHW artifacts |
| **Overall** | **4.5/10** | **8/10** | DX POLISH, not scope expansion |

### DX Decisions

| ID | Decision | Result |
|---|---|---|
| DX-01 | Use DX POLISH; do not expand product scope | Accept |
| DX-02 | Internal maintainer/small team is the primary persona | Accept |
| DX-03 | Financial engines/canonical commands own mutations | Accept |
| DX-04 | One shared certification definition for every feature | Accept |
| DX-05 | Debug failpoints remain test-only and production-inaccessible | Accept |
| DX-06 | Native PostgreSQL scripts are the baseline local path | Accept; Docker Compose deferred |
| DX-07 | `verify:point1` is deterministic/non-interactive; `dev:demo` is the optional visible fixture | Accept |
| DX-08 | Unauthorized navigation is hidden; actionable uncertified modules show a reason/prerequisite | Accept |
| DX-09 | Support Node 22 LTS and PostgreSQL 15+ as documented minimums; CI defines tested versions | Accept |
| DX-10 | Public integration/API documentation is outside Point 1 | Defer |
| DX-11 | Schema version and certified-capability docs are checked against source constants | Accept |
| DX-12 | Measure clean bootstrap and first-workflow TTHW in CI | Accept |

### DX Implementation Checklist

- [ ] **DX1 P1:** Add one-command native PostgreSQL bootstrap, dependency checks, deterministic fixture, and expected output.
- [ ] **DX2 P1:** Publish a certification matrix with owner, state, API, UI, permission, tests, and operational evidence.
- [ ] **DX3 P1:** Consolidate controller-level financial mutations behind canonical Sales/Purchases commands.
- [ ] **DX4 P1:** Define errors with `code`, `message`, `cause`, `fix`, `request_id`, retryability, and optional `doc_url`.
- [ ] **DX5 P1:** Add deterministic `verify:point1` coverage across all requested workflows and tenant boundaries.
- [ ] **DX6 P1:** Document migration rehearsal, recovery, rollback, close/reopen recovery, and feature promotion.
- [ ] **DX7 P2:** Add task guides for AR/AP corrections, recurring, assets, close, recovery, and user access.
- [ ] **DX8 P2:** Add `CONTRIBUTING.md`, required checks, test taxonomy, and accounting-invariant checklist.
- [ ] **DX9 P2:** Add changelog and schema/capability compatibility policy.
- [ ] **DX10 P2:** Measure clean-machine TTHW in CI and retain the report as an artifact.

### DX Outside Voice and Completion

The independent same-model DX pass agreed on one setup path, a certification matrix, canonical engine ownership, structured errors, deterministic verification, truthful unavailable states, and measured TTHW. Claude and Codex CLI remained unavailable, so this is not formal cross-model consensus.

| Item | Result |
|---|---|
| Mode | DX POLISH |
| Current to target score | 4.5/10 to 8/10 |
| Current first-workflow TTHW | Estimated 30-60 minutes |
| Target first-workflow TTHW | <=10 minutes |
| Dimensions reviewed | 8/8 |
| Auto-decisions | 12 |
| Unresolved DX decisions | 0 |
| DX verdict | Clear after the listed polish tasks |

## Cross-Phase Themes

1. **Canonical ownership:** CEO, Engineering, and DX independently identified overlapping service/controller/browser mutation paths as the largest maintainability risk.
2. **Truthful availability:** CEO, Design, Engineering, and DX all require the UI, routes, and source-controlled capability allowlist to describe the same product surface.
3. **Real PostgreSQL evidence:** CEO and Engineering require production-like locks, migrations, worker claims, concurrency, and recovery drills before certification.
4. **Recovery and reversibility:** every phase favored explicit reversal, staged restore, auditable evidence, and independent slice gates over optimistic or destructive shortcuts.
5. **Actionable failures:** typed errors, request IDs, preserved input, structured logs, and operator recovery recur across product, UI, engineering, and DX decisions.
6. **Certification as the operating model:** a feature is complete only when schema, service, RBAC, idempotency, posting, reversal, API, UI, tests, and operations agree.

## Decision Audit Trail Summary

The phase decision tables contain **42 decisions**: **41 auto-decided**, **1 user-approved taste decision**, and **0 direction-changing user challenges**. The user separately confirmed the revised program premise through Option A and approved the final plan as-is. No auto-decision silently expands beyond Point 1.

## Aggregated Implementation Tasks

### Lane 0: Preserve and Reconcile

- [ ] Record a clean baseline of the existing uncommitted hardening changes and reconcile every overlapping Point-1 file.
- [ ] Build the certification matrix: workflow owner, state, API, UI, permission, migrations, tests, operations, allowlist key, deployment flag.
- [ ] Identify and redirect duplicate controller, service, route, and browser-context paths.

### Lane 1: Shared Trust Platform

- [ ] Add typed domain errors, request IDs, retryability, safe authoritative state, and one Express error mapper.
- [ ] Add capability DTOs and capability-driven navigation.
- [ ] Add additive schema primitives and indexes shared by occurrences, reversals, invitations, artifacts, and close evidence.
- [ ] Add native PostgreSQL bootstrap, deterministic fixtures, source-checked schema/capability docs, and `verify:point1`.

### Lane 2: Receivables and Payables

- [ ] Complete credit, refund, advance, write-off, payment, allocation, and reversal commands on canonical Sales/Purchases engines.
- [ ] Add gated AP routes and remove controller/browser reimplementations.
- [ ] Build consolidated AR and AP workspaces with review, conflict, success, reversal, and reload states.
- [ ] Certify tenant, RBAC, idempotency, rollback, concurrency, reversal, and GL reconciliation on real PostgreSQL.

### Lane 3: Scheduled Transactions

- [ ] Add recurring profile and occurrence schema, deterministic occurrence keys, leases, bounded `SKIP LOCKED` claims, retry/backoff, quarantine, pause/resume, and catch-up policy.
- [ ] Generate invoices, bills, and expenses through canonical document commands.
- [ ] Build the scheduled-transactions workspace and occurrence history.

### Lane 4: Assets and Close

- [ ] Make capitalization, depreciation, disposal, reversal, and asset evidence atomic and cent-exact.
- [ ] Revalidate close under organization/period locks; persist immutable evidence; enforce affected-row checks and audited reopen.
- [ ] Build first-class Fixed Assets and Period Close workspaces.

### Lane 5: Access Governance

- [ ] Add hashed, expiring, single-use invitation tokens, acceptance, role change, revocation, last-owner protection, session effects, and accountant access review.
- [ ] Build role-sensitive Team & Roles UI with pending/expired states and audit evidence.

### Lane 6: Recovery and Export

- [ ] Replace direct restore with encrypted signed artifacts, explicit versioned schemas, repeatable-read export, staging load, reconciliation, and owner-only promotion.
- [ ] Add artifact expiry, secure download, access logging, progress/history, failure recovery, and operator drills.
- [ ] Build the Recovery Center and prove failed validation/promotion cannot change production data.

### Lane 7: Product and Release Certification

- [ ] Replace Point-1 browser alerts/prompts/confirms with accessible workflow states and dialogs; redirect retired routes.
- [ ] Add desktop/mobile ledger layouts, keyboard/focus/live-region behavior, and authenticated visual validation.
- [ ] Run lint, full tests, build, dependency audit, real-PostgreSQL suites, restore drills, and desktop/mobile E2E per slice.
- [ ] Promote only the passing slice to the source allowlist and deployment flag; update readiness evidence and operator guides.

## Deferred Scope

The detailed backlog is in `TODOS.md`. Deferred items are jurisdiction-specific tax filing, payment gateways and portals, inventory, payroll, historical AR/AP reconstruction, public integration APIs, optional Docker Compose setup, and AI features. Managed PostgreSQL PITR is not deferred product scope; it remains mandatory production infrastructure.

### What Already Exists

The plan reuses atomic Sales/Purchases engines, the server posting boundary, organization isolation and RBAC middleware, transactional migrations, accounting integrity checks, hash routing, common loading/empty components, trusted-feature gates, and the current rollback/concurrency tests. Existing uncommitted hardening remains the starting point and must be reconciled before overlapping edits.

### Engineering NOT in Scope

No accounting-platform rewrite, automatic data repair, broad frontend-context rewrite, managed-PITR replacement, public integration contract, or non-Point-1 product domain is part of the engineering implementation.

### Phase Consensus Tables

| Design dimension | Primary | Independent same-model pass | Result |
|---|---|---|---|
| Information architecture | Capability-driven domain workspaces | Agreed | Confirmed within available model |
| Interaction states | Authoritative shared state contract | Agreed | Confirmed within available model |
| User journey | Review, commit, evidence, recovery | Agreed | Confirmed within available model |
| Visual density | Dense, card-light | Agreed on direction | Confirmed; typography remains taste |
| Design system | Extend `DESIGN.md` primitives | Agreed | Confirmed within available model |
| Responsive/accessibility | Mobile ledgers and accessible dialogs | Agreed | Confirmed within available model |
| Unresolved decisions | One typography choice | Agreed | 6 functional dimensions confirmed, 1 taste choice |

| Engineering dimension | Primary | Independent same-model pass | Result |
|---|---|---|---|
| Architecture sound | Yes after canonical ownership and staged restore | Agreed | Confirmed within available model |
| Test coverage | Real PostgreSQL and browser matrix required | Agreed | Confirmed within available model |
| Performance | Streaming, batching, indexes, bounded claims | Agreed | Confirmed within available model |
| Security | Staged restore and invitation lifecycle required | Agreed | Confirmed within available model |
| Failure handling | Typed errors and no silent rescue | Agreed | Confirmed within available model |
| Delivery sequencing | Shared lane then independently gated slices | Agreed | Confirmed within available model |

| DX dimension | Primary | Independent same-model pass | Result |
|---|---|---|---|
| Getting started | Native bootstrap and deterministic fixture | Agreed | Confirmed within available model |
| API naming/ownership | Canonical commands | Agreed | Confirmed within available model |
| Errors | Actionable structured envelope | Agreed | Confirmed within available model |
| Documentation | Certification matrix and task guides | Agreed | Confirmed within available model |
| Upgrade path | Rehearsal and rollback policy | Agreed | Confirmed within available model |
| Measurement | Bootstrap and workflow TTHW | Agreed | Confirmed within available model |

These tables are independent same-model agreement only. Claude and Codex CLI were unavailable, so none is represented as formal cross-model consensus.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | `/plan-ceo-review` | Scope and strategy | 1 | CLEAR | 8 decisions; full scope retained as independently gated releases |
| Codex Review | independent same-model subagent | Independent challenge | 4 phase passes | LIMITED | Claude runtime and Codex CLI unavailable; no formal cross-model consensus |
| Eng Review | `/plan-eng-review` | Architecture and tests | 1 | CLEAR | 15 architecture/code findings, 7 test domains, 7 delivery lanes |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR | 3.3/10 to 9/10 target; typography recommendation approved |
| DX Review | `/plan-devex-review` | Developer experience | 1 | CLEAR | 4.5/10 to 8/10 target; TTHW 30-60 min to <=10 min |

- **CODEX:** Independent same-model passes supported slicing, canonical ownership, durable scheduling, staged recovery, truthful UI, and one developer path; this is not cross-model confirmation.
- **VERDICT:** CEO + DESIGN + ENG + DX CLEARED; plan approved as-is and ready for implementation.

NO UNRESOLVED DECISIONS
