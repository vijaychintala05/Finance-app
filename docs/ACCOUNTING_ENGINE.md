# Double-entry accounting engine

## Invariants

- Every posted event creates a journal with at least two lines.
- Each line contains one positive debit or one positive credit, never both.
- Debit and credit totals must be equal at cent precision before any write occurs.
- Referenced accounts must be active, unlocked, and owned by the same organization.
- A posting on or before an active lock date is rejected.
- Journal entry numbers are unique inside an organization.
- The source document, journal, derived balance cache, and audit event commit together.
- Posted entries are immutable. Corrections post a linked reversing journal.

PostgreSQL `NUMERIC` columns preserve stored decimal values. Application validation restricts posted ledger amounts to currency precision. Reports calculate from journal lines rather than trusting the mutable browser or a standalone source-document total.

## Enabled posting rules

| Event | Debit | Credit |
| --- | --- | --- |
| Invoice | Accounts receivable (total) | Revenue (net) and tax payable |
| Payment received | Bank/cash (received amount) | Accounts receivable (allocated) and customer advance (unallocated) |
| Expense paid | Expense account | Bank/cash account |
| Vendor bill | Expense/purchase account | Accounts payable |
| Manual journal | User-selected validated lines | User-selected validated lines |
| Reversal | Original credit lines | Original debit lines |

Control accounts are provisioned per tenant and resolved by code inside the transaction. IDs supplied by a client are never accepted as proof of tenant ownership.

## Certification requirement

Credit notes, refunds, vendor credits/payments, fixed assets, recurring generation, and period-close workflows remain gated until their source documents, allocations, postings, reversals, and audit records share the same transaction and pass reconciliation/concurrency tests. See [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md).
