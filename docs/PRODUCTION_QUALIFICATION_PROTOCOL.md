# Production qualification protocol

This protocol turns the remaining trust checks into release evidence. Automated
checks are required in CI. Human, legal, and provider checks require an attached
signed record because they cannot be truthfully simulated by a unit test.

## Automated gates

| Gate | Command | Required evidence |
| --- | --- | --- |
| Type and build | `npm run lint && npm run build` | CI logs and artifact digest |
| Regression suite | `npm test` | Test-file and test-count result |
| Real PostgreSQL | `DATABASE_URL=<disposable-db> npm run test:postgres` | PostgreSQL version, migration output, RLS, deferred-balance trigger, and posting results |
| Browser workflows | `DATABASE_URL=<disposable-db> npm run test:e2e` | Playwright report, screenshots/traces on failure |

`test:postgres` refuses to run without `DATABASE_URL` and refuses pg-mem. It
must use a disposable database and a role allowed to create a temporary
unprivileged qualification role.

## Required evidence outside automation

| Qualification | Test procedure | Approval evidence |
| --- | --- | --- |
| Accountant sign-off | Import a controlled opening-balance dataset; reconcile trial balance, GL, AR, AP, bank, tax, P&L, and balance sheet to the signed expected outputs. | Qualified accountant, dataset identifier, differences, and sign-off date. |
| Payment provider | Execute sandbox and controlled live receipt, refund, chargeback, reinstatement, fee, payout, delayed webhook, and retry cases. Reconcile provider reports to clearing and bank accounts. | Provider event IDs, bank references, GL journal IDs, and reconciliation result. |
| Security review | Test authentication, MFA, session revocation, public tokens, RBAC, cross-tenant access, rate limits, webhook signatures, cloud secrets, and deployment configuration. | Scope, tester, findings, severity, retest evidence. |
| Recovery drill | Restore a sealed artifact to staging; verify audit preservation, financial parity, rollback, tenant locks, RPO, and RTO. | Artifact ID, restore logs, timings, reconciliations, owner approval. |
| Scale and resilience | Run representative-volume reporting, reconciliation import, search, period close, concurrent payment retry, and worker-lease tests on PostgreSQL. | Dataset size, concurrency, latency percentiles, failures, capacity decision. |
| Role acceptance | Owner, accountant, sales, purchasing, approver, and viewer each complete their permitted workflows and are denied prohibited actions. | Test users, scenario results, screenshots, unresolved issues. |
| Tax and legal | Validate invoice content, tax calculation, filing support, data retention, privacy, and jurisdiction-specific obligations. | Jurisdiction, legal/accounting reviewer, signed exceptions. |

## Release decision

Release only when every automated gate passes and every required external row
has current evidence. A failed payment, reconciliation, tenant-isolation,
approval, audit, restore, or PostgreSQL test is a release blocker.
