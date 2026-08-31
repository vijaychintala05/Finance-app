# Expense Receipts: Reviewed Implementation Plan

Date: 2026-08-31. Scope: Expenses page, Record Expense, saved receipt viewing, and persistence guarantees. Status: review in progress; not implementation approval or a claim that tests passed.

The shared main worktree changed during review. Receipt support was added concurrently; this plan reuses that work and describes acceptance requirements, not a claim that every item is still missing. Re-read affected files before implementation. Original request: `expense-receipts-autoplan-original.md`.

## Intake and Decisions

Premise accepted from the user's explicit request: receipts belong inside Record Expense, not in a separate promotional scanning banner. Success is a saved expense whose readable images can be reopened after refresh. Attachment is optional.

Auto-decisions use completeness, covering the affected workflow, pragmatic scope, reuse, explicit behavior, and action. No changes to accounting calculations, authentication configuration, or the running demo database.

| ID | Decision | Reason / alternative rejected |
| --- | --- | --- |
| D1 | Remove only the Quick Scan banner; preserve Record Expense and existing list/filter controls. | Explicit user request; no page redesign. |
| D2 | Optional JPEG, PNG, WebP images, up to three. | Reuse existing upload contract; PDF, HEIC and OCR are separate features. |
| D3 | Preview the prepared image before posting; remove or replace before save. | The user must see the image that will actually be retained. |
| D4 | Commit expense, images, journal and audit together. | A filename-only attachment or a separate untracked upload is incomplete. |
| D5 | Reopen saved images through existing authenticated API; retain images when an expense is reversed. | Evidence remains linked to the original financial record. |
| D6 | Keep current database attachment service and bounded JSON contract. | No new object-store service, upload queue, or external credentials. |

## What Already Exists

- `src/components/expenses/ExpensesView.tsx`: primary Record Expense action, banner, receipt indicator, filters.
- `src/components/expenses/ExpenseModal.tsx`: optional file selection, browser compression, posting flow. Current selection is a filename list, not an image preview.
- `src/components/expenses/ExpenseDetailsModal.tsx`: authenticated image fetch and thumbnail links added concurrently.
- `src/api/client.ts`: `getBlob`, tenant/auth headers, mutation fingerprint and idempotency retry keys.
- `src/context/BooksContext.tsx`: passes receiptImages to the existing expense POST and refreshes authoritative data.
- `server/src/services/ExpenseReceiptService.ts`: three-image limit, MIME/signature checks, per-file/aggregate bounds, tenant-scoped metadata and content lookup.
- `server/src/services/ExpensePostingService.ts`: receipt inserts are inside the existing posting transaction.
- `server/src/database/enterpriseHardeningSchema.ts`: attachment table, currently TEXT base64 content, with organization/expense index.
- `server/src/database/migrationRunner.ts`: v7 expense-receipt schema version already introduced.
- `server/src/tests/projectAccountingV1.test.ts`: receipt round-trip, cross-tenant denial and invalid-upload rollback tests added concurrently. Not executed by this review.
- `DESIGN.md`: server-confirmed success, exact authorization, atomic/idempotent financial writes, conservative interface, immutable posted records.

## Phase 1: Product / CEO Review

### Premises, Alternatives and Leverage

Named premises: P1 receipts are supporting evidence, not another expense creation mode; P2 attachment remains optional; P3 readable persisted bytes, not a badge, define success; P4 this is an internal app workflow, not a public developer product.

Do nothing leaves the banner the user rejected. Minimum complete option: move selection into the form, preview/remove, atomic save, protected reopen, recovery coverage. Chosen. Expanded ideal: OCR, PDF/HEIC conversion, standalone receipt inbox and post-save attachment management; rejected for this request because each creates new review, permissions and retention decisions.

Leverage map: reuse the posting transaction for consistency; reuse apiClient for authorization and retries; reuse image service for size/type limits; reuse details view for verification; extend recovery schema so receipts are not stranded. No second expense flow.

Dream state: current fragmented receipt entry -> one trustworthy record-and-attach flow -> in 12 months, optional receipt capture/extraction only if actual usage justifies it. This change does not pre-authorize that expansion.

### Eleven-Section Review

| Section | Finding and planned resolution |
| --- | --- |
| 1 Architecture | Existing transaction is the right boundary. No independent upload or orphan cleanup service. Empty receipts preserves existing posting. |
| 2 Errors / rescue | File errors stay by the file; transport uncertainty is not described as a rollback; read failures have retry. Full registry below. |
| 3 Security | Treat uploaded bytes as untrusted; bound bytes and decode work; enforce authenticated organization and expense ownership on reads. No public URLs or token query strings. |
| 4 Data / interaction | Refresh must not erase drafts; closing or switching organization invalidates async preparation and fetches; freeze payload on submit. |
| 5 Code quality | Reuse existing service and API helper. A small preparation helper is justified for tests; no generic attachment framework. |
| 6 Tests | Real decodable image fixtures, atomic rollback after insert, retry identity, reload/reopen and tenant denial are ship gates. |
| 7 Performance | Keep binary data out of list responses; prepare files sequentially; retain existing per-file and aggregate budgets. |
| 8 Observability | Record receipt IDs/count/bytes and request ID, not base64, image contents, or sensitive filenames in ordinary logs. |
| 9 Rollout | Additive migration plus recovery/export coverage, body/proxy limits, persistent-database round trip. Keep old attachment-free clients working. |
| 10 Trajectory | Database storage is acceptable for bounded images; measure storage growth before adding infrastructure. |
| 11 UX | One primary action, optional receipt area, real previews, no scanning promise, explicit loading/error/success states. |

Temporal interrogation: first validate current changes and contract; next complete picker/details states; then harden payload/recovery paths; finally execute unit/integration/browser tests and deploy checks. Do not rush the last step into an unchecked demo. No fixed delivery-time promise is made.

### Not in Scope

OCR or automatic field extraction; PDF/HEIC support; receipt inbox/camera scanning service; editing/deleting evidence on posted expenses; accounting, settings or dashboard redesign; object storage; general recovery-system redesign. These are exclusions, not promised future work. No speculative TODO backlog is created.

### Review Execution

Autoplan subskills were read for product, design, engineering and DX. Claude and bash-based gstack runners are unavailable on PATH; cross-model consensus will be N/A, never represented as confirmed. Native read-only Codex independent review is used where available. Artifacts are kept in this writable workspace rather than changing global skill state. jq is unavailable, so gstack JSONL aggregation is skipped; the Markdown implementation checklist remains authoritative.

Product outside voice: Carver (Codex) independently identified draft loss, absent inspectable previews/read-error recovery, client/server aggregate mismatch, and redundant banner scope. All four incorporated in the plan. Claude: unavailable. Cross-model consensus: N/A. Product review complete: 11 sections evaluated, 6 initial decisions, no premise disagreement, 7 excluded expansions.

## Phase 2: Design Review

Classifier: operational app UI. Reuse local typography/colors and Lucide icons; do not add hero panels, gradients, instruction paragraphs, or nested cards. The actual receipt is the visual asset. No generated mockup or live visual verification was performed; the wireframe below is the implementation reference, not an approved rendered design.

```text
Expenses                 [ + Record Expense ]
existing totals / filter / expense list
(Quick Scan banner removed, no replacement promo)

Record Expense                              [x]
date          expense account
amount        paid from
vendor / project / description
Receipt images (optional)        [ImagePlus Add images]
[contained thumbnail] filename          [Trash2]
[per-file status/error when necessary]
                            [Cancel] [Post expense]
```

Hierarchy: preserve existing financial fields first; receipt attachment immediately after description and before footer. Use a native multi-file chooser, not a custom camera workflow. Add images remains discoverable when no image is selected; no mandatory drag/drop or capture-only picker. Post expense is the sole primary submit action.

Selection: prepare and validate on file choice, not on final submit. Keep prepared bytes stable for preview and retry. Max 3, each <= 900 KiB and aggregate <= 2 MiB after preparation. Reject an over-count selection explicitly rather than silently slicing it. Unsupported files have a file-specific error and do not discard other valid files. Existing receipt-free posting remains available after invalid selections are removed. Block submit while any selected file is preparing/invalid; never silently omit a selected receipt.

### Visible State Contract

| Area | Empty | Loading / busy | Error | Success / partial |
| --- | --- | --- | --- | --- |
| Picker | Optional label and Add images | Preparing image; busy status announced | Filename plus cause and corrective action | Contained preview, filename, remove action; other valid files preserved |
| Posting | Existing form | Posting; disable submit, picker mutation, X, backdrop and Escape dismissal | Keep draft; distinguish validation from unknown commit outcome | Close only after confirmed commit; refresh authoritative expense list |
| Saved receipts | No receipt images; legacy name alone is not a working attachment | Per-image placeholder with stable dimensions | Could not load receipt + Retry; expired session uses auth flow | Successful images remain viewable when another fails |
| Image viewing | No action when bytes unavailable | Accessible busy state | Decode/download failure, recoverable retry | Full uncropped image with open/download action |

Draft lifecycle: initialize on a new open session, not on account-array identity changes. Update invalid account selection without clearing amount/description/images. Confirm discard when a user closes a dirty draft while idle. Organization change clears draft/previews and invalidates pending work; never submit old-organization data with new-organization headers. A submitted request can outlive the page: reconcile on return rather than claim cancellation rolled it back.

Responsive specifications: at 360/390px, single-column fields, image rows with 80px fixed contained thumbnails, wrapping filenames and 44px remove targets; at 798px and 1440px, retain existing two-column financial fields and full-width receipt section. Modal max-height respects viewport, body scrolls independently, footer remains reachable with keyboard open. No horizontal overflow at 200% zoom. Do not crop receipt text using object-cover.

Accessibility: dialog role, aria-modal, accessible title, focus trap and return focus to trigger. Every icon action has accessible name and hover tooltip; labels stay visible. Announce preparation/errors with polite live status and move focus to first invalid field on submit. Escape closes only when not posting and after dirty-draft confirmation. Visible focus, 4.5:1 text contrast and 44px pointer targets. Use existing dialog primitive if available; otherwise complete these within the touched modal.

Journey: open expense (clear purpose) -> enter details (uninterrupted draft) -> choose image (see actual prepared receipt) -> correct/remove (control) -> post (honest progress) -> reopen after reload (confidence). Five seconds: primary action obvious. Five minutes: one complete expense. Long term: evidence still readable and recoverable.

| Design pass | Initial specification | Planned specification | Decision |
| --- | --- | --- | --- |
| Information architecture | 6/10 | 9/10 | Remove redundant entry; optional inline section |
| Interaction states | 3/10 | 9/10 | Per-file states and uncertain outcome recovery |
| Journey | 5/10 | 9/10 | Inspect before save and reopen afterward |
| Generic visual clutter | 5/10 | 9/10 | Remove banner; use actual image and restrained controls |
| Design system | 7/10 | 9/10 | Reuse local controls and DESIGN.md trust rules |
| Responsive / accessibility | 3/10 | 9/10 | Explicit viewport, focus and target requirements |
| Unresolved decisions | 4/10 | 9/10 | Images only, three max, no forced camera, no cropped preview |

Scores assess plan specificity, not shipped UI quality. Litmus: clear product/action, actual receipt as visual focus, scannable headings, one job per section, framing only for the dialog/images, no decorative motion, understandable without shadows. Existing global app branding is unchanged. No design decisions require a new brand/theme direction.

Design outside voice: Boyle (Codex) identified three additional concrete requirements, accepted: add a keyboard-accessible named View expense action to list rows/mobile items; make prepared thumbnails open the full uncropped image before posting (browser image zoom is sufficient, no custom editor); remove the modal's transaction-explanation/assurance panels and use Record Expense as title. Preserve contextual errors. These complete the chosen hierarchy, not a page redesign. Closing preview preserves draft and restores focus. Claude unavailable; cross-model consensus N/A.

Design completion: all 7 passes evaluated; plan specificity 4.7/10 -> 9/10; 3 independent findings accepted; 0 mockups generated/approved; live visual checks pending. No additional design debt deferred. Phase 2 complete.

## Phase 3: Engineering Review

### Scope and Architecture

The change spans more than eight files because existing receipt support crosses UI, API, schema and recovery boundaries. This is justified by persistence and tenant isolation, not by extra product features. Reuse ExpenseReceiptService; add no service class or new deployment service. Keep one small testable image-preparation helper if extraction simplifies the modal. Do not rebuild apiClient, posting or recovery.

```text
ExpensesView -> ExpenseModal -> bounded preparation + preview
                                 | freeze draft + tenant + bytes
                                 v
BooksContext -> apiClient POST /finance/expenses + Idempotency-Key
                 -> auth / permission / organization / payload bounds
                 -> validated receipt bytes
                 -> transaction
                      expense + receipt rows + balanced journal + audit
                 -> commit -> authoritative list refresh

View expense -> ExpenseDetailsModal -> apiClient.getBlob
                 -> permission + org + expense + receipt ID lookup
                 -> private no-store image -> temporary object URL

Recovery export -> receipt table after expenses -> staging validation
                -> parent-first restore / child-first deletion -> byte equality
```

No upload is performed on selection: preparation is local. All receipt persistence occurs with posting. An empty array/omitted receipts follows the original expense flow. Validation failure produces no writes. A timeout after sending has an unknown outcome until reconciled.

### Verified Findings and Auto-Decisions

Line numbers are review-snapshot anchors and can change with concurrent work.

| ID / severity / confidence | Evidence | Required resolution |
| --- | --- | --- |
| E1 P1 10/10 | ExpenseModal.tsx:107: `}, [isOpen, expenseAccounts, paymentAccounts]);` follows field and receipt resets. | Reset only on new draft; preserve during account refresh. Reject submission after tenant change. |
| E2 P1 10/10 | ExpenseReceiptService.ts:29 accepts JPEG with only three signature bytes; projectAccountingV1.test.ts:72 uses `dataBase64: '/9j/'`. | Replace test fixture with a real decodable image; validate full decode with a maintained image library, not magic bytes alone. |
| E3 P1 10/10 | `.env.example:27`: `JSON_BODY_LIMIT=1mb`; server/src/index.ts:33 defaults to `4mb`. | Align documented deployment settings with receipt request budget; test parser/proxy rejection path. |
| E4 P1 9/10 | recovery/schema.ts defines `POINT1_RECOVERY_SCHEMA` with expenses but no receipt table; BackupRestoreService also has an explicit table list without receipts. | Extend active export/restore manifests and reconcile tenant/parent/bytes. Trace legacy backup use before deciding it is inactive. |
| E5 P2 10/10 | ExpenseDetailsModal.tsx:47: `if (!response.data) return null;`; rendered fallback says Loading receipt. | Explicit per-image error/retry; no permanent loading for 401/403/404/500. |
| E6 P2 9/10 | Details cleanup revokes current `urls` at lines55-59, but pending fetch can create another URL at line48 after cleanup. | Abort requests or ignore late response before URL creation; clear old state immediately and revoke all created URLs. |
| E7 P1 9/10 | Modal prepares via `Promise.all` at line140; service aggregate limit is 2 MiB while each of three files may reach 900 KiB. | Sequential, pre-submit preparation; enforce aggregate bound and freeze prepared bytes for safe retries. |
| E8 P2 10/10 | getExpenseReceipt sends MIME/length/disposition but no route cache policy at financeController.ts:902-905. | `Cache-Control: private, no-store`; verify global nosniff or set it here; no shared/public caching. |

Security implementation: reject invalid structures, noncanonical base64, empty data, unsupported MIME, MIME/decoded-format mismatch, malformed/truncated images, excessive byte counts and excessive dimensions. Use a maintained decoder such as Sharp for bounded full decode, failOn warning, at most 16 million decoded pixels, single image, no unlimited decoding. Browser original-file cap 10 MiB before decode; process at most one image at a time. Prepared long side remains at most 1600px as in current code; users inspect full prepared image and may reject unreadable compression. Avoid silently reducing quality to meet the aggregate budget.

Sharp is a proposed new package, not installed by this review. Verify Windows development and Linux/NAS production installation/build before approval to ship. Its constructor supports invalid-image failure and explicit pixel limits; full decode, not metadata alone, must be exercised. [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/)

Request limits: the encoded 2 MiB aggregate occupies about 2.67 MiB before JSON metadata. Use an effective 4 MiB cap for this route, finite metadata limits, and the existing smaller default elsewhere where practical. A route parser must run before any global lower-limit parser. Document any reverse-proxy cap; return clear 413 JSON. Do not edit production environment silently. Express reports payloads beyond the configured parser limit as entity-too-large errors. [Express body parser](https://expressjs.com/en/resources/middleware/body-parser/)

Data integrity: server derives organization from auth, never request body; use a same-organization parent relationship or equivalent DB validation. Add check constraints for positive byte size, allowed MIME and consistent stored payload where compatible with the database. Preserve current base64 TEXT storage to avoid an unrelated bytea conversion; acknowledge roughly one-third encoding overhead. Audit receipt IDs/count/bytes in the expense-created event, without contents. Retain evidence on reversal. Migration must be additive and verified on existing v6 and v7 databases; do not silently change an already-applied migration's meaning.

### Code Quality and Lifecycle

Reuse current DTO names (`receiptImages` upload, `receiptAttachments` metadata), and never include upload base64 in general expense list DTOs. Extract shared receipt-limit constants or add contract tests to prevent client/server drift. Client preparation produces stable bytes once; retries reuse them so the existing idempotency fingerprint remains identical. Synchronously guard repeated submit as well as disabling the button.

On unknown POST outcome keep the submitted payload immutable; allow Retry same submission / refresh reconciliation, not editing it into a second financial mutation. A successful commit followed by a list-refresh failure must show saved-but-refresh-failed, not offer to create another expense. No raw images in localStorage, sessionStorage, analytics or error logs. Browser API keys in sessionStorage are not receipt storage.

Use AbortSignal for saved-image requests where the current API permits it, or check an operation-generation token before creating/setting URLs. Include active organization in lifecycle invalidation; clear previews on logout/organization switch. Existing URLs must be released when no longer needed. [MDN object URL cleanup](https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static)

### Test Review and Coverage Diagram

Detected framework: Vitest + React Testing Library, Supertest, Playwright. Existing receipt API tests cover basic metadata round trip, cross-tenant 404 and invalid signature rejection. Their three-byte JPEG fixture does not prove image rendering. Existing apiClientReliability tests cover generic uncertain retries and tenant key separation, not receipt preparation identity. Recovery tests exist but no receipt coverage was found. All statuses below mean source coverage observed, not test execution.

```text
Entry: Record Expense (UI integration + E2E)
  banner removed / named entry remains                 GAP U1
  zero receipts -> original paid-expense path          existing baseline; extend U2
  choose valid image -> prepare -> preview -> remove   GAP U3
    bad MIME / decode / canvas unavailable / null blob GAP U4
    0 / 1 / 3 / 4 files, file and aggregate boundaries  GAP U5
    large dimensions / original cap / unreadable text GAP U6
  background refresh / close / org switch / unmount   GAP U7
  submit -> freeze / double click / validation        GAP U8
    network unknown -> identical bytes/key retry      generic API test; receipt GAP U9
    commit OK -> refresh fails                        GAP U10

POST /finance/expenses (service + API integration)
  input absent / null / []                            GAP S1 receipt regression
  type / base64 / size / dimension / actual decode    partial signature test; GAP S2
  auth / permission / account / period               existing financial tests; GAP S3 with receipts
  insert expense -> receipt -> journal -> audit       partial happy test; GAP S4 injected failures
  duplicate retry -> one expense/journal/receipt set GAP S5

GET /expenses/:id/receipts/:receiptId (API + UI + E2E)
  own tenant valid -> metadata + exact image bytes    partial test with invalid fixture; GAP R1
  wrong tenant / wrong expense / no permission / 404  partial tenant test; GAP R2
  getBlob headers / no-store / nosniff / no public URL GAP R3
  partial failure -> error/retry while others remain  GAP R4
  late fetch after close/org switch -> no leak        GAP R5
  refresh page -> keyboard reopen -> image decodes    GAP R6
  reverse expense -> image remains                    GAP R7

Deployment and recovery (integration + environment smoke)
  v6/v7 migration and rollback compatibility          GAP D1
  current config cap / 413 / max accepted request     GAP D2
  backup -> isolated restore -> exact bytes + tenant  GAP D3
  Windows/Linux decoder install and server start     GAP D4
```

Each GAP is a required implementation test, not deferred. Add `src/__tests__/expenseReceipts.test.tsx` and `server/src/tests/expenseReceipts.test.ts`; extend existing apiClientReliability/projectAccountingV1/recovery suites and add a receipt E2E spec matching repository conventions. Assert stored bytes and actual browser `naturalWidth > 0`, not merely nonempty HTTP body. Use synthetic non-sensitive receipt fixtures with legible text; never real financial documents. No LLM behavior changes or eval suites are applicable.

### Error / Rescue and Failure Registry

| Path / failure | Classification / response | Recovery visible to user | Test IDs | Current assessment |
| --- | --- | --- | --- | --- |
| File type/decode/oversize | Client error or EXPENSE_RECEIPT_INVALID, 400 | Name problem; choose another image; retain draft | U4-U6/S2 | Signature-only protection insufficient |
| Body exceeds parser/proxy | 413 | Receipt request too large; retain prepared files | D2 | Config mismatch verified |
| Missing auth / permission | 401 / 403 | Sign in / permission error; no cached receipt | S3/R2-R3 | Existing middleware; test new route |
| Wrong tenant/expense/missing image | 404, same nondisclosing shape | Receipt unavailable; Retry where appropriate | R2/R4 | Tenant case partly tested |
| Receipt insert / journal / audit error | Transaction rollback; unexpected error with request ID | Could not save; retain draft, safe retry | S4 | Mid-transaction failure coverage gap |
| Response lost after commit | Unknown outcome, not a rollback assertion | Retry original request/reconcile before edits | U9/S5 | Generic key reuse exists; receipt gap |
| Commit confirmed / refresh failed | Saved, list stale | Refresh list; do not create second expense | U10 | Verify facade behavior |
| Image fetch/decode fails | Per-image error | Retry; other images remain visible | R4 | Silent endless-loading path verified |
| Late file/fetch result | Canceled generation | No stale preview or tenant crossover | U7/R5 | URL cleanup race verified |
| Background account refresh | Preserve draft, revalidate accounts | Field-level correction only | U7 | Draft-loss bug verified |
| Recovery omits evidence | Block rollout until manifest covers bytes | Restore must include linked receipts | D3 | Critical silent data-loss gap |

Unexpected decoder/database errors must not expose stacks or raw payloads. Normalize known validation errors; route operational failures through the existing error handler/request ID mechanism. Receipt read failures cannot be represented as success or empty attachments.

### Performance, Deployment and Rollback

At most three prepared files and one sequential decoder task per submission. Do not keep redundant base64 copies in long-lived client state. Lists fetch metadata only, preferably restricted to returned expense IDs if pagination is present; no per-row content fetch. Fetch receipt content only when details/preview is opened. Index already matches organization + expense lookup. Rate limits and bounded decoder concurrency apply to upload routes; no unbounded multi-frame decoding.

Recovery is a ship gate: add receipt rows after expense parents in the approved manifest; delete children before parents when restoring; validate organization and expense references and reject malformed bytes. Test pre-feature backup compatibility against the existing exact schema-version policy and document supported migration or explicit rejection. Never silently drop receipts. Audit the legacy backup path if exposed. PostgreSQL durability/backup must be tested independently of the in-memory demo.

Deploy schema and backend support before the UI. Old clients without receipts remain valid. Roll back application code without deleting receipt rows; earlier backups are not silently interpreted as containing receipt evidence. Build/start the actual production server path and verify dependency availability. Do not restart port 3000 or reset the user's demo. Use an isolated test database/server on an unused port for mutation tests.

### Engineering Outside Voice and Resolution

McClintock (Codex) independently found four material concerns; source was re-read before accepting:

1. **Uncertain outcome must survive beyond the busy state.** apiClient fingerprints the whole body. Preserve immutable submitted bytes/key until retry resolves; after reload retain only a nonsensitive operation identity to query/reconcile, not the receipt itself. Do not offer an edited resubmission while the prior outcome is unknown. This extends U9/S5 to reload reconciliation; use existing mutation outcome machinery if available, rather than inventing a second posting path.
2. **Recovery ordering is already unsafe for linked expenses on PostgreSQL.** ProductionRecoveryAdapters.ts:121 uses reversed manifest order; recovery/schema.ts places expenses before journals; migrationRunner.ts:1284 creates restrictive expense-to-journal FK. Define dependency-safe order for affected relationships: attachments -> expenses -> journals on deletion, journals -> expenses -> attachments on insertion, including all other referencing tables. Verify actual PostgreSQL constraints, not pg-mem alone. This is a pre-existing adjacent blocker, not caused by removing the banner.
3. **Expense recovery projection loses posting identity.** recovery/schema.ts:47 omits journal/status/reversal/project/customer fields, while FinancialDestructiveActionsService.ts:803 requires journal_entry_id to reverse. Preserve existing expense fields needed to retain accounting identity and reconcile forward/reversal references. Test posted and voided expenses with receipts after restore. Do not silently fill omitted historical evidence with guessed relationships.
4. **Schema-version compatibility is not automatic.** RecoveryArtifactService.ts:190 checks exact schema version and exact manifest. Explicitly document the supported prior schema set. Authenticate/validate a historical artifact against its own versioned manifest before any deterministic migration; otherwise reject with actionable recovery instructions and preserve the old artifact. Never simply disable version/hash checks. A direct upgrade must have a tested recovery path before enabling new writes.

These recovery concerns must be fixed in a focused prerequisite patch or block production rollout of the complete workflow; they do not justify rebuilding recovery generally. No restore/promotion was performed in this review.

Engineering completion: architecture diagram produced; 8 primary source findings and 4 independent findings reviewed; code quality/lifecycle decisions specified; 26 labeled test groups mapped with explicit partial baseline coverage; 3 performance concerns addressed (memory, payload limits, list content); recovery and indefinite-loading silent failures flagged as critical gaps until implemented/tested. Existing-code and exclusions sections apply. Sequential implementation because the shared worktree is changing and contract/UI/recovery are coupled. No additional worktrees or source edits. Claude unavailable; all six cross-model engineering consensus dimensions (architecture, tests, performance, security, errors, deployment) N/A, not confirmed. Phase 3 complete.

## Phase 3.5: Internal Developer Experience

DX POLISH, limited to the internal REST contract and deployment/testing workflow. This does not create a public API/SDK, CLI or developer ecosystem. No competitive product benchmark is relevant; reference benchmarks are the existing apiClient, migration and Vitest patterns, plus official Express/MDN/Sharp documentation linked above.

Persona: a TypeScript maintainer testing a new expense in an existing local checkout. Empathy narrative: "I should not need cloud upload credentials. I need one image fixture, a typed request, an actionable size error, and proof that I can reopen the receipt after a restart. I need a test that fails if a backup loses evidence."

| Journey stage | Intended experience / friction removed |
| --- | --- |
| Discover | Plan links affected screen and existing receipt service |
| Evaluate | Inspect optional DTO and readable fixture before changing anything |
| Install | Existing npm workflow; explicit decoder platform prerequisite |
| Configure | Align effective body cap, isolated DB and test organization |
| First success | Create an expense with a synthetic image and reopen it |
| Integrate | Same apiClient auth/tenant/idempotency patterns |
| Debug | 400/413/401/403/404/5xx distinctions with request IDs |
| Deploy | Additive migration, supported artifact versions, build/start smoke test |
| Maintain | Receipt regression suite and byte-equality recovery test |

Time to first working receipt: unmeasured baseline; target under five minutes from an already-running, migrated local app, not from a fresh Windows machine. Measure rather than claim this target achieved. The useful first success is visible decoded image bytes after reload, not a 201 response alone.

| DX dimension | Current specification | Planned specification | Requirement |
| --- | --- | --- | --- |
| Getting started | 5/10 | 8/10 | One fixture + create/reopen walkthrough; no external upload service |
| API design | 7/10 | 9/10 | Keep optional upload/metadata DTOs; protected Blob response |
| Errors / debugging | 4/10 | 9/10 | Invalid image: choose valid image; 413: fix effective cap/size; 404: nondisclosing unavailable receipt |
| Documentation | 3/10 | 8/10 | Record limits, formats, retry identity and recovery compatibility |
| Upgrade path | 3/10 | 8/10 | Versioned schema/recovery compatibility and non-destructive rollback |
| Tooling | 7/10 | 8/10 | Typed interfaces, Vitest fixtures, Windows/Linux decoder smoke checks |
| Community / ecosystem | N/A | N/A | Internal feature; no new public ecosystem |
| Measurement | 3/10 | 8/10 | Test time-to-first-receipt; log failures/request IDs without image contents |

These are plan scores, not a live developer-experience audit. DX checklist: document effective limits; use real fixtures; include exact targeted test commands; verify decoder setup on supported deployments; document safe outcome reconciliation and backup compatibility; measure the first-receipt walkthrough. Primary review only for this narrow phase; additional DX outside review was not run, cross-model consensus N/A. No independent DX endorsement claimed. Phase 3.5 complete with this limitation.

## Decision Audit Trail

| ID | Phase | Decision | Classification | Principle | Rejected alternative |
| --- | --- | --- | --- | --- | --- |
| D1 | Product | Remove banner, retain primary action | User-directed | Explicit intent | Page redesign |
| D2 | Product | Optional three JPEG/PNG/WebP images | Auto, taste default | Reuse | PDF/OCR scope expansion |
| D3 | Product/design | Prepared thumbnail plus full preview/remove | Auto | Complete workflow | Filename-only display |
| D4 | Product | Atomic posting with images | Auto | Cover failure impact | Independent untracked upload |
| D5 | Product | Protected reopen, retain on reversal | Auto | Explicit trust | Public image URLs / delete evidence |
| D6 | Product | Existing DB service and bounded JSON | Auto | Pragmatic reuse | Object-store infrastructure |
| D7 | Design | Prepare on selection, deterministic limits | Auto | Explicit behavior | Failure only at final submit |
| D8 | Design | Preserve draft, confirm discard, block close while posting | Auto | Completeness | Silent field loss |
| D9 | Design | Named keyboard action and complete dialog focus behavior | Auto | Completeness | Mouse-only rows |
| D10 | Design | Contained thumbnails, wrapping names, responsive footer | Auto | Explicit behavior | Cropped receipt text |
| D11 | Design | Remove explanatory/assurance panels | Auto | Pragmatic scope | More instructional chrome |
| D12 | Engineering | Full bounded decode with maintained library | Auto | Completeness | Signature-only validation |
| D13 | Engineering | Align body/proxy limits, actionable 413 | Auto | Cover failure impact | Raise every limit without tests |
| D14 | Engineering | Explicit read errors, no-store, stale-result cleanup | Auto | Completeness | Indefinite loading / cached tenant evidence |
| D15 | Engineering | Freeze submitted payload through unknown outcome | Auto | Explicit trust | Edited retry with a new key |
| D16 | Engineering | Receipt recovery plus dependency/identity fixes | Auto | Cover failure impact | Export amounts without evidence |
| D17 | Engineering | Versioned compatibility, never relax integrity checks | Auto | Explicit trust | Assume additive DB migration means compatible backup |
| D18 | Engineering | Actual decode/rollback/retry/browser/PostgreSQL tests | Auto | Completeness | Header-only fixture / pg-mem-only confidence |
| D19 | Engineering | Shared limits or contract tests; no generic framework | Auto | DRY | Duplicate inconsistent constants |
| D20 | Engineering | Audit IDs/count/bytes, never images | Auto | Explicit trust | Logging base64 |
| D21 | DX | Local integration docs, no cloud credentials | Auto | Pragmatic | Public SDK or competitor benchmark project |
| D22 | DX | Platform build/start and restore are ship gates | Auto | Completeness | Frontend-only build success |

No user-direction challenge. The only product taste default is retaining three images rather than limiting the picker to one. Proposed defaults are review decisions, not recorded user approvals.

## Implementation Tasks

Tasks are sequential and unchecked. Estimates are rough effort ranges, not timing guarantees; re-evaluate against concurrent changes before coding.

- [ ] T1 (P1, product/design; human 1-2h / assisted 20-40m): remove banner, make Record Expense/row actions accessible, simplify modal title/copy. Files: ExpensesView.tsx, ExpenseModal.tsx. Verify U1/R6 and responsive screenshots.
- [ ] T2 (P1, design/eng; human 3-5h / assisted 45-90m): complete image preparation, limits, previews/removal and draft lifecycle. Files: ExpenseModal.tsx, optional focused preparation helper, frontend receipt tests. Verify U2-U8 and decode/legibility cases.
- [ ] T3 (P1, eng; human 3-5h / assisted 45-90m): harden validation/atomic metadata/audit and request limits. Files: ExpenseReceiptService.ts, ExpensePostingService.ts, financeController.ts, index.ts, schema migration, package/lock files and env example as needed. Verify S1-S4/D1-D2/D4 on actual build.
- [ ] T4 (P1, eng; human 2-4h / assisted 30-75m): finish protected details states, cleanup and unknown-outcome reconciliation. Files: ExpenseDetailsModal.tsx, api/client.ts, BooksContext.tsx and existing mutation outcome contract only as necessary. Verify U9-U10/S5/R1-R7; no second write after uncertain save.
- [ ] T5 (P1, eng; human 4-8h / assisted 1-3h): close receipt/expense recovery prerequisites. Files: recovery/schema.ts, ProductionRecoveryAdapters.ts, RecoveryArtifactService.ts, active backup manifest, migration/tests/docs. Verify D3 with PostgreSQL, both posted and voided expenses, supported historical artifacts, and no silent identity loss.
- [ ] T6 (P1, all phases; human 2-4h / assisted 45-90m): execute the companion test plan, full typecheck/tests/build, isolated Playwright checks, platform startup and persistent DB round trip; document exact results and effective upload settings. Tests must land alongside each task, not be postponed until T6.

Do not treat unrelated failing baseline tests as passing or change unrelated accounting behavior to make this feature appear green. No TODO additions: deferred product expansions were not requested and are not commitments; all receipt reliability requirements remain in scope.

## Cross-Phase Themes and Final Gate

One expense flow. Inspectable evidence. Honest save status. Bounded, tenant-scoped storage. Recoverable accounting identity. These themes connect product, design, engineering and internal DX without adding a receipt-management product.

Review artifacts: original request restore point, this reviewed plan, and `expense-receipts-test-plan.md`. Source code was read, not edited by this review. No live app tests, database mutations, package installs, server restarts, screenshot verification or production changes were performed. Other work in the shared workspace is not claimed as this review's implementation.

Tool limitations: Claude/cross-model voices, global bash review logging and jq JSONL aggregation were not available. Install jq for the skill's automatic JSONL aggregation; this run uses the Markdown checklist. Tests were saved under docs/plans rather than the global gstack artifact directory. Product/design/engineering have independent same-model reviews, DX only the primary review. Cross-model scorecards are N/A for every dimension, not 0 or confirmed. This is a degraded autoplan run with explicit limitations, not a claim that every optional automation ran.

Approval gate: approve the scoped plan before implementation. The user-visible change is small; production-ready evidence storage includes the recovery prerequisites found during review. No deployment approval is inferred.

## GSTACK REVIEW REPORT

Status: REVIEWED_WITH_IMPLEMENTATION_GAPS. Product: all 11 sections evaluated, premise accepted. Design: 7 passes, planned specificity 9/10, live QA pending. Engineering: architecture/error/test maps complete, critical receipt/recovery gaps assigned to T1-T6. DX: internal integration only, 7 applicable dimensions evaluated, no live TTHW measurement. Automated cross-model/JSONL/global logging unavailable as noted. Implementation: NOT PERFORMED. Verification: NOT RUN. Final approval: PENDING.
