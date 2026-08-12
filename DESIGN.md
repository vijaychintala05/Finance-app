# FirmBooks architecture and product design

## Product principle

FirmBooks should feel calm, precise, and conservative. Financial truth is more important than optimistic UI. A screen changes only after the server confirms a commit; unavailable workflows say so clearly; destructive corrections are expressed as reversals, never silent deletion.

## System boundaries

```text
React UI
  -> authenticated, tenant-scoped REST request + Idempotency-Key
  -> authorization middleware
  -> financial use-case transaction
       source document
       balanced journal + lines
       derived balance cache
       append-only audit event
  -> PostgreSQL commit
  -> authoritative response updates the UI
```

PostgreSQL is the system of record. The general ledger is the source for financial reports. Browser storage may contain session hints, selected organization, and non-financial display preferences; it is not a financial database.

## Trust invariants

1. Every tenant-owned query includes the authenticated organization ID.
2. A user holds an active membership and an exact permission for every action.
3. Every enabled financial mutation is atomic and idempotent.
4. Every posted journal has at least two lines and equal debit/credit totals at cent precision.
5. Posting accounts belong to the same tenant and are active and unlocked.
6. Closed dates reject new postings.
7. Source documents, journal entries, and audit events cannot diverge at commit time.
8. Posted records are corrected through traceable reversal—not update or deletion.
9. Cross-tenant lookup failures do not disclose that another tenant's record exists.
10. When the database or outcome record is unavailable, financial writes fail closed.
11. PostgreSQL monetary decimals are parsed to integer cents before application arithmetic.
12. Financial dashboards and reports use server-side posted-ledger queries only.

## Growth model

New financial features enter behind a two-key gate. Promotion first requires a reviewed change to the source-controlled certification allowlist and then explicit deployment enablement through `TRUSTED_FINANCE_FEATURES`. Certification requires a single-transaction implementation, exact RBAC mapping, schema validation, idempotency behavior, tenant-isolation tests, balanced-posting tests, reversal tests, reconciliation tests, and operational dashboards. The optional-feature allowlist is empty in this build.

The large `BooksContext` remains a compatibility facade. New UI work should use domain-specific query/mutation modules and server DTOs. Do not add new financial state setters to the context.

## Interface rules

- Use explicit states: Draft, Posted, Paid, Reversed, Locked, Unavailable.
- Never show success before server commit.
- Show the request ID with unexpected errors so support can trace them.
- Display money using organization currency and accept no more precision than the currency supports.
- Keep audit, posting reference, source number, and reversal link visible in transaction details.
- Do not fabricate security status, devices, IP addresses, users, balances, or sample records in authenticated workspaces.
