# PDF Goal Defect Log - September 2026

This log records non-PDF issues observed while validating the PDF-template goal. They are not being changed here unless a PDF regression is established.

## Critical / High

- **D-001 - Period-close review note intermittently returned empty.** Module: Period Close. A full browser run's `e2e/period-close-and-lock-lifecycle.spec.ts` observed the save response with `review.note` equal to an empty string when the test expected its submitted note. Isolated reruns passed; the failure was intermittent. Severity: High because close-review evidence must persist. Reproducibility: intermittent in full-suite sequencing. Classification: uncertain, unrelated to PDF work. PDF blocker: no. Next: investigate review persistence/read ordering and verify with a reload-focused regression test.

## Medium

- **D-002 - Recovery Center export returns HTTP 500 on PostgreSQL.** Module: general Recovery Center export API. In the latest real PostgreSQL 16 E2E run, both desktop and mobile `e2e/point1-workspaces.spec.ts` recovery-export cases failed (28 passed, 2 failed overall); the export POST returned HTTP 500, so no artifact appeared in the list. The generic idempotency middleware opens an outer `READ COMMITTED` transaction, while `RecoveryArtifactService.createArtifact` requests a nested `REPEATABLE READ` transaction; the database transaction helper rejects the isolation-level mismatch. Severity: High. Reproducibility: reproduced in both desktop and mobile cases in that run. Classification: unrelated to PDF-template artifacts; not caused by PDF work. PDF blocker: no, provided direct PDF recovery export/stage/promote verification passes. Next: investigate and fix transaction ownership and the associated recovery security/lock behavior in a separate stabilization goal, then rerun both E2E cases.
- **D-003 - P2P payment was not visible after reload within the original mobile wait.** Module: Procure-to-Pay. `e2e/procure-to-pay-lifecycle.spec.ts` did not find the 1,500 payment after reload within the original 15-second assertion during a full run; isolated runs passed. A later full E2E run passed with temporary longer waits, which have since been removed. Severity: Medium pending confirmation of persisted financial state. Reproducibility: intermittent/full-suite only. Classification: uncertain and unrelated to PDF work. PDF blocker: no. Next: verify the authoritative payment row and reload completion on a real PostgreSQL-backed test.

## Low

- **D-004 - Mobile report catalog intermittently stayed in a loading state.** Module: Reporting navigation. `e2e/report-catalog-responsive.spec.ts` failed once in an earlier full browser run and passed in a later isolated/full rerun; no report code was changed for this goal. Severity: Low. Reproducibility: intermittent. Classification: uncertain and unrelated to PDF work. PDF blocker: no. Next: investigate only if the flake recurs.

## Test / Environment

- **E-001 - PostgreSQL 16 qualification resolved.** Earlier credentials were unavailable. A disposable PostgreSQL 16 Docker database was subsequently used, and `npm run test:postgres` passed 7/7. The existing PostgreSQL service and NAS data were not modified. This is no longer a PDF blocker.
- The in-memory migration runner also emits non-fatal `pg-mem` warnings because it does not implement `BTRIM`; do not treat those warnings as PostgreSQL qualification evidence.

## Browser Gate Note

A later full Playwright run against disposable PostgreSQL 16 completed with 28 passed and 2 failed, both in the unrelated Recovery Center export flow documented as D-002. This is not a clean all-green release gate. PDF-specific browser evidence should be reported separately from the unrelated failures.
