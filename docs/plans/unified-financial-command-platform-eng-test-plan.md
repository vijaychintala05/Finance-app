# Unified Financial Command Platform: Engineering Test Plan

## Certification Layers

| Layer | Environment | Required proof |
|---|---|---|
| Unit | Node test runner | Payload validation, policy mapping, error mapping, fingerprint construction, document action policy |
| Command integration | PostgreSQL 16 | One transaction creates receipt, domain mutation, journals, audit, evidence links, and outbox; retry returns original result |
| Concurrency | PostgreSQL 16 | Concurrent duplicate command, overlapping statement import, account-code race, posting into locked period, and outbox worker claim |
| Projection | PostgreSQL 16 | At-least-once replay remains idempotent; rebuild equals canonical financial state; freshness is recorded |
| Browser workflow | Desktop and mobile | Create/view/approve/reverse document, add attachment, print PDF, import overlap, explicit bank match, reload/recovery guidance |
| NAS release | Built container plus PostgreSQL | Migrate, readiness, one command-family smoke path, release-registry evidence, rollback rehearsal |

## Reusable Scenario Fixtures

Each fixture creates a complete isolated organization and expected assertions:

- `expense-with-receipt`: attachment, expense command, balanced journal, audit trail, print/PDF.
- `invoice-payment-allocation`: invoice, partial/full payment, AR control reconciliation, document activity.
- `vendor-bill-and-advance`: bill, vendor advance, allocation, reversal guard.
- `locked-period-correction`: allowed reversal/correction path and blocked direct mutation.
- `overlapping-bank-statements`: January/February followed by February/March, exact row fingerprints, near-match review candidates, no automatic expense creation.
- `projection-rebuild`: command/outbox records replay into dashboard and banking read models with matching totals.
- `recovery-restore`: encrypted snapshot restore preserves financial facts, evidence links, locks, and audit history.

## Required Assertions

1. Every posted journal balances; no command may commit a partially posted document.
2. Command retry returns the prior outcome and never produces a second journal or bank effect.
3. Organization boundaries, roles, approval policy, and period locks are checked inside the command transaction.
4. Statement rows never create accounting entries without an explicit approved command.
5. Source fingerprint duplicates are rejected; non-identical possible matches are explainable review candidates.
6. Projection replay and rebuild agree with canonical journals/documents, including after duplicate event delivery.
7. User-visible failures contain a stable code, recovery instruction, and command ID; they never expose database internals.
8. Representative dashboard/banking queries meet the p95 400 ms target and projection freshness alerts after 60 seconds.

## CI Gate

The command-family promotion gate runs migration, PostgreSQL integration/concurrency suites, browser critical journeys, projection replay, and container smoke against the same build artifact. A failed required gate blocks a NAS promotion.
