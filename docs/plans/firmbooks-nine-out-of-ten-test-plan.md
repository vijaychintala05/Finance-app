# FirmBooks 9/10 Acceptance Test Plan

2026-08-31. This is planned verification, not an executed certification. Parent plan: firmbooks-nine-out-of-ten-autoplan.md. Preserve the current user's demo and data.

## Isolation First

Use a uniquely named disposable database and test-only server on an unused port. Fail closed if DB identity, database name/owner, server process or environment is not the expected test target. No test reuse of port3000, no production credentials, no fallback from failed PostgreSQL setup to pg-mem for the real-DB suite. Clean up only resources created by the run.

## Commands and Artifacts

1. Production source typecheck: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json`.
2. Full source/test typecheck: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`, or equivalent explicit complete test config after repairing drift; do not exclude broken tests.
3. `npm test` with final suite/test/pass/fail/skip counts and candidate source identity. Memory suite and actual PostgreSQL suite must be labeled separately.
4. `npm run build`; assert complete server and browser artifacts. Build the image once, then test and publish the same digest.
5. `npm run test:e2e` only after isolated config is in place. Run full desktop/mobile suite, not just selected happy paths.
6. PostgreSQL concurrency, migration and recovery runs on the supported target version, using deterministic fixtures and independent connections. Include startup/upgrade/rollback and missing-config failure.

Attach exact commands, timestamps, exit codes, stdout/report paths, source commit + dirty-state identity, schema/config/features, DB version and image digest. A Markdown claim alone is not evidence. Baseline typecheck results: production-source pass, full-project fail; all other gates pending fresh execution.

## Fixed Ten-Scenario User Script

1. Create customer/invoice, reload and verify invoice and ledger.
2. Record partial then final customer receipt, reload and verify balance.
3. Create vendor/bill, record payment from a specifically selected bank; verify bill, payment and GL.
4. Explicit vendor advance, later allocation and remaining advance balance.
5. Expense without image, then another with image preview/remove/reselect; reload and open readable saved receipt.
6. Manual journal plus supported reversal; verify original/reversal links and report effect.
7. Customer and vendor statement period changes with opening, movements, closing and matching print output.
8. Settings edit/search/back navigation; cancel discard, failed save and successful reload; no lost draft or false success.
9. Approval threshold setup; unauthorized/self/stale approval denial and authorized posting through real endpoints.
10. Find/reopen/reverse an existing transaction and follow related document links with keyboard, preserving filters and receipts.

Use three representative users, 30 attempts total. Observe without coaching, record success/assistance/errors/time; >=27/30 unassisted completion, every critical money-moving task safe. Failed critical tasks block the target even if aggregate completion is high. Do not fabricate participation.

## Automated Failure Matrix

For each mutation test null/empty/invalid type; date/currency/precision limits; missing or locked account; stale balance; session expiry; insufficient permission; cross-tenant ID; feature unavailable; approval below/at/above threshold; double submit; response lost after commit; same-key replay; changed-body retry; confirmed commit + refresh failure; close/unmount/organization switch. Assert persisted state, response and visible UI.

Receipt tests use genuinely decodable synthetic images, MIME mismatch/truncation, per-file and aggregate boundaries, late fetch cleanup, unsupported types, recovery-byte parity and retained evidence after reversal. Reuse the earlier expense-receipts-test-plan.md for detail.

Recovery: write while taking snapshot, export complete supported manifest, restore into a provably clean isolated database, assert all financial rows/references/statuses/receipts and independent report expectations; test corrupt/missing/cross-tenant/old-version input and failed import. Verify original target survives failure, next document number remains unique, and audit history treatment is explicitly correct. Do not swallow cleanup errors and call the target empty.

Concurrency: two independent connections attempt competing allocations, numbering and approval/posting races. Record connection IDs and synchronization barriers. Assert no over-allocation, duplicates, cross-tenant effects or partial journal/audit state. A memory run or sequential Promise wrapper is insufficient evidence.

Release: one immutable image starts with production-like flags/auth and disposable PostgreSQL; health+readiness plus authenticated create/read/reverse and browser asset load pass. Force a failed smoke gate and assert no publication/promotion. Verify pushed/pulled digest equals tested digest. Test previous-digest rollback with schema compatibility and no data deletion.

## Visual, Accessibility and Performance

Capture 360x800, 390x844, 798x912 and 1440x900, light/dark, 200% zoom. Verify no overlap/page overflow, all actions reachable, contained receipt images, wrapped long labels/errors, focus trap/return, keyboard tabs/row actions, 44px targets, contrast and live error/status announcements. No critical accessibility findings.

Document hardware, network, DB version and dataset (10k mixed documents/org, 10 active users). Measure p95 list/workspace <2s, posting <3s, local UI feedback <100ms as proposed targets; report cold and warm samples separately, at least 30 measured operations after warm-up. No silent exclusion of slow failures. RPO/RTO drill targets require owner approval; proposed <=24h/<=4h, not claimed achieved.

## Verdict

Additional independent-review regressions: approval rejection requires domain-specific permission; direct/bulk posting cannot bypass approval policy; populated append-only audit logs survive recovery; required capabilities are exercised with production-like flags and ephemeral test keys; native/container documented startup works with production-only dependencies; isolation preflight rejects wrong targets; failed test runs retain evidence; deployed release identity resolves to the tested manifest.

No P0/P1 open, all critical paths passed, exact reconciliations, six-dimension score >=90/100 with no dimension <8/10, same-release evidence attached. Product quality, deployability and live-data authorization remain separate sign-offs. Unmeasured or missing evidence is Pending, never Certified.
