# PDF Goal Defect Log - September 2026

This log records non-PDF issues observed while validating the PDF-template goal. They are not being changed here unless a PDF regression is established.

## Critical / High

- **D-001 - Period-close review note intermittently returned empty.** Module: Period Close. A full browser run's `e2e/period-close-and-lock-lifecycle.spec.ts` observed the save response with `review.note` equal to an empty string when the test expected its submitted note. Isolated reruns passed; the failure was intermittent. Severity: High because close-review evidence must persist. Reproducibility: intermittent in full-suite sequencing. Classification: uncertain, unrelated to PDF work. PDF blocker: no. Next: investigate review persistence/read ordering and verify with a reload-focused regression test.

## Medium

- **D-002 - Recovery Center artifact list was empty after export.** Module: general Recovery Center UI. `e2e/point1-workspaces.spec.ts` observed the newly created encrypted export absent from the mobile list; an isolated rerun passed. Severity: Medium. Reproducibility: intermittent. Classification: unrelated to PDF-template artifacts; suspected cause is unconfirmed. PDF blocker: no. Next: investigate export completion versus list refresh sequencing.
- **D-003 - P2P payment was not visible after reload within the original mobile wait.** Module: Procure-to-Pay. `e2e/procure-to-pay-lifecycle.spec.ts` did not find the 1,500 payment after reload within the original 15-second assertion during a full run; isolated runs passed. A later full E2E run passed with temporary longer waits, which have since been removed. Severity: Medium pending confirmation of persisted financial state. Reproducibility: intermittent/full-suite only. Classification: uncertain and unrelated to PDF work. PDF blocker: no. Next: verify the authoritative payment row and reload completion on a real PostgreSQL-backed test.

## Low

- **D-004 - Mobile report catalog intermittently stayed in a loading state.** Module: Reporting navigation. `e2e/report-catalog-responsive.spec.ts` failed once in an earlier full browser run and passed in a later isolated/full rerun; no report code was changed for this goal. Severity: Low. Reproducibility: intermittent. Classification: uncertain and unrelated to PDF work. PDF blocker: no. Next: investigate only if the flake recurs.

## Test / Environment

- **E-001 - PostgreSQL 16 qualification credentials unavailable.** `npm run test:postgres` passes 5/5 against a fresh, disposable PostgreSQL 17.10 Docker database. A local PostgreSQL 16 test service is running on port 54329, but it requires SCRAM authentication and no isolated test credentials/`DATABASE_URL` are configured. The existing PostgreSQL 16 service was not modified or used. PostgreSQL 16-specific qualification remains pending. PDF blocker: yes for claiming the PG16 release gate; not a blocker for the passing PG17 and in-memory PDF tests. Next: configure a disposable PG16 database URL and rerun the qualification suite.
- The in-memory migration runner also emits non-fatal `pg-mem` warnings because it does not implement `BTRIM`; do not treat those warnings as PostgreSQL qualification evidence.

## Browser Gate Note

A 26/26 Playwright run completed in 8.1 minutes while temporary unrelated timing/request-sequencing diagnostics were present. Those exact non-PDF changes were subsequently removed. That run is useful evidence, but it is not a clean final browser result for the restored non-PDF baseline; a full rerun is intentionally deferred to avoid turning this PDF goal into general stabilization.
