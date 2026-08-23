# Point 1 Certification Test Plan

## Purpose

Certify each Point-1 workflow independently before it is added to the source-controlled trusted-feature allowlist. Fast pg-mem coverage is necessary but cannot substitute for real PostgreSQL locks, isolation, migrations, worker claims, or restore drills.

## Shared Command Contract

Every enabled mutation must prove:

- authenticated organization isolation and exact permission checks
- idempotent same-payload replay and changed-payload conflict
- integer-cent or exact-decimal validation
- period, account, ownership, and state validation under lock
- atomic source, allocation, journal, audit, and outcome writes
- complete rollback at each injected failure point
- balanced journals and subledger-to-GL reconciliation
- immutable posted records and audited reversal
- stable error code, request ID, retryability, and safe current state
- authoritative browser refresh after commit

## Workflow Matrix

| Domain | Integration coverage | PostgreSQL coverage | Browser coverage |
|---|---|---|---|
| AR corrections | credit issue/apply/refund/advance/write-off/reversal; tenant/RBAC/period/account checks | concurrent allocation, deterministic lock order, failure injection | create/apply/reverse/reload on desktop and mobile |
| AP settlement | payment/advance/vendor credit/write-off/reversal; bill/vendor ownership | concurrent bill allocation and reversed request order | pay/apply/reverse/reload on desktop and mobile |
| Recurring | schedule validation, dates, pause/resume, catch-up, retry, quarantine | two workers, lease expiry, `SKIP LOCKED`, crash after post, unique occurrence replay | create/pause/run/retry/history/reload |
| Assets | capitalize, depreciation, residual value, disposal gain/loss, reversal | duplicate-period race and failures after posting/state writes | register/detail/post/dispose/reverse/reload |
| Close | blockers/warnings, evidence, state transitions, reopen reason | posting-vs-close, duplicate close, close/reopen race | checklist/close/reopen/history/reload |
| Recovery/export | manifest/schema/signature/tenant/corruption/reconciliation | staging restore, promotion rollback, production unchanged, repeatable-read export | create/download/validate/compare/promote with re-auth |
| Access | issue/accept/expire/replay/change/revoke/last-owner/session effects | concurrent acceptance and role/revoke conflicts | invite/accept/change/revoke with role-sensitive navigation |
| Availability UI | capability and permission combinations; retired-route redirects | N/A | loading/empty/error/conflict/success/partial/unavailable, keyboard, slow/500/offline, double submit |

## Failure-Injection Points

For every financial lifecycle command, inject failure after source creation, journal creation, first allocation/event, audit insertion, outcome insertion, and derived-balance update. Assert that no partial source, journal, lines, allocation, balance, audit, idempotency outcome, occurrence, artifact, or membership transition remains.

## Migration Gates

1. Apply every migration to an empty PostgreSQL database.
2. Apply from the last production schema version with representative tenant data.
3. Verify read-only preflight failures preserve all data.
4. Verify composite tenant foreign keys and required indexes.
5. Verify migration retry behavior and schema-version recording.
6. Run backward-compatible application startup before allowlist promotion.

## Recovery Drill

1. Create an encrypted, signed organization artifact under a repeatable-read snapshot.
2. Validate schema version, manifest, row counts, hashes, and tenant identity.
3. Load into an isolated staging organization using explicit table schemas.
4. Run relational, trial-balance, AR, AP, asset, close, and audit reconciliation.
5. Inject a promotion failure and prove production is unchanged.
6. Promote with recent Owner re-authentication and typed confirmation.
7. Verify audit evidence, artifact expiry, secure download rules, and operator alerts.

## Release Gate Per Slice

```text
npm run lint
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
real PostgreSQL migration + concurrency + rollback suites
slice-specific reconciliation and reversal evidence
desktop and mobile screenshots with console/network checks
```

The allowlist and deployment flag may be updated only after every relevant gate passes and the production-readiness document records the evidence.
