# Bill payment feature gate mismatch

The capability API and navigation advertise `payables-settlement` as vendor
payments, credits and advances. The container CI configuration also uses that
key. Finance routes instead check `vendor-settlements` (payments and advances)
or `vendor-credits` (credits). Previously, enabling the published capability
left these routes returning HTTP 503 before the controller ran.

The middleware now expands the published payables capability into these two
source-certified route features. Explicit granular configuration still works.
An empty production configuration still fails closed; write-offs and unrelated
features are not enabled by this mapping. Payment logic, permissions, approval
checks, database schema and recorded data are unchanged.

Regression evidence: two production-configuration tests failed before the
mapping and passed after it. The middleware and payment accounting audit suites
passed together (21 tests); TypeScript checking passed. Tests cover empty and
unrelated configuration as well as keeping write-offs/uncertified routes blocked.

Final verification: full suite exited successfully with 179 test files passed,
1 skipped; 1,341 tests passed, 3 skipped. Production build passed after retrying
outside the sandbox to resolve an esbuild directory-access denial. Skipped tests
and this local run do not establish live NAS/PostgreSQL qualification.

NAS follow-up: this fix requires deploying the corrected build. Verify the
running application's capabilities and its `TRUSTED_FINANCE_FEATURES` setting.
If neither `payables-settlement` nor `vendor-settlements` is enabled, the payment
route remains intentionally disabled. Preserve existing environment entries.
The live NAS configuration and a live payment have not been verified by this
investigation; do not create a real payment solely as a smoke test.
