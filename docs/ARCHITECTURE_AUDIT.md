# Architecture audit status

This document supersedes the original browser-only prototype audit.

## Critical findings resolved

- The universal password and self-selected registration role were removed.
- Production secrets and PostgreSQL configuration now fail startup when missing.
- Financial records load from PostgreSQL instead of browser state.
- Core financial events use a central server posting engine and ACID transactions.
- Exact role permissions and organization membership protect APIs.
- Production cannot fall back to an in-memory database or seed demo identities.
- Posted records no longer expose local delete/edit behavior.
- Idempotency keys protect financial mutation retries.
- Audit records are append-only in PostgreSQL.
- Server report queries exclude drafts and out-of-period entries and bind account joins to the authenticated tenant.
- Dashboard financial cards derive from posted journals and disappear on authoritative-data failure.
- Database decimal values cross the API boundary through exact integer cents.
- Tax integrity independently reconciles the certified output- and input-tax controls.

## Structural debt still visible

`src/context/BooksContext.tsx` remains an oversized compatibility facade with unreachable legacy prototype code. Enabled workflows have been redirected to the API or fail closed, so this is maintainability debt rather than an authorized financial persistence path. Remove it incrementally as screens move to domain-specific hooks.

Several mature-domain services were written before the transactional posting boundary. Their routes remain gated until refactored and certified. Promotion needs both a reviewed source-code allowlist change and deployment configuration; the current allowlist is empty. The gated scope and release requirements are maintained in [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).

## Scale recommendations

- Split the UI facade into identity, organization, sales, purchases, accounting, and banking query modules.
- Move startup schema changes to versioned, reviewed migrations run by a separate deployment role.
- Add PostgreSQL row-level security after introducing transaction-scoped tenant context.
- Use a durable job queue for email, PDF, import, recurring, and webhook work.
- Add OpenTelemetry traces/metrics and structured logs keyed by request ID, organization, and posting reference.
- Run concurrency, failover, backup-restore, and high-volume reporting tests against real PostgreSQL.
