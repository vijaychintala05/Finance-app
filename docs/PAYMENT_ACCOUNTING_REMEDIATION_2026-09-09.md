# Payment Accounting Remediation Report

**Date:** 2026-09-09  
**Baseline audit:** `docs/PAYMENT_ACCOUNTING_AUDIT_2026-09-08.md`

## Implemented

- Added one server-side monetary-account policy. Customer receipts, vendor payments, advances, refunds, transfers, statement-created transactions, and gateway postings now resolve an active tenant account by exact immutable ID or exact code and validate its monetary role.
- Routed approved manual journals, statement-created entries, and internal transfers through `ServerPostingEngine`, including period/account checks and synchronized GL and bank-account caches.
- Made customer and vendor refund accounting source-aware. Credit/debit-note refunds use AR/AP; advance refunds use customer/vendor advance control accounts and restore the source balance on reversal.
- Completed customer-advance creation and reversal API paths and made customer/vendor cached subledger balances symmetric across posting and reversal.
- Replaced the public portal's simulated receipt posting with confirmation of an already processed, signed gateway event. The portal can no longer create cash or mark an invoice paid by itself.
- Hardened gateway processing: exact raw request bytes, mandatory signatures/secrets, event claiming, positive amount/currency validation, truthful final state, persisted source links, clearing-account receipts, fees, and bank payout settlements.
- Added durable `bank_transfers` source records, create/reverse endpoints, audit history, journal links, reconciliation guards, and immutable reversal journals.
- Added a reversal lifecycle for journals created from bank-statement lines. Ordinary unmatch now refuses to orphan their GL posting.
- Added fail-closed tenant policies for journal lines and gateway events, deferred posted-journal balance triggers, final-status/journal checks, source uniqueness indexes, and organization-composite source links in the additive payment schema.
- Changed cash-flow account selection to explicit monetary classifications instead of account-name matching.
- Added durable `treasury_transactions` for payroll, employee reimbursement, owner capital/drawings, loan receipts and principal/interest repayments, and tax payments. These routes accept immutable account IDs, validate account classes per movement, post through the central engine, synchronize bank caches, retain audit history, and reverse by posting an opposite journal.
- Added gateway refund, chargeback, and reinstatement processing. Provider events must resolve one posted original receipt and invoice allocation; refunds debit AR and credit the payment-clearing monetary account. Reinstatements reverse that posting and restore the invoice/subledger state.
- Added direct-expense vendor recovery. A supplier refund for a paid direct expense now debits the selected monetary account and credits the original expense ledger; its source amount, vendor, and reversal are validated.
- Wired the banking workspace to create/reverse a journal from a selected statement line and to create/reverse durable internal transfers.

## Result against the seven invariants

| Invariant | Result after remediation |
|---|---|
| Final payment/receipt has one posting or reversal chain | Enforced for implemented payment sources by service lifecycle, unique source-journal indexes, and final-state constraints |
| Every implemented money movement affects a monetary GL account | Enforced by `MonetaryAccountPolicy` |
| Every posted journal balances | Enforced in the posting engine and by deferred PostgreSQL constraint triggers |
| Cash/bank caches agree with GL posting | Central posting engine updates both; reports continue to read posted journal lines |
| Source creation and journal posting are atomic | Implemented flows share one database transaction |
| Reversal preserves history | Payment, advance, refund, expense, transfer, and statement-created flows post opposite journals |
| Retries cannot duplicate route postings | Authenticated mutations use organization-scoped idempotency; gateway deliveries use provider-event uniqueness and atomic claiming |

## Verification

- TypeScript: `npm run lint` passed.
- Production build: `npm run build` passed, including client and server bundles.
- Full Vitest run: **128/128 files and 1,055/1,055 tests passed**.
- Targeted payment-accounting verification: 5 files and 48 tests passed, including the new gateway refund/reinstatement, direct-expense vendor recovery, treasury movement, transfer, schema, and statement-reversal coverage.
- Production build and TypeScript validation passed.
- `git diff --check` passed.

## Remaining product scope

- Production-only RLS, deferred triggers, and composite constraints were inspected and migration-tested structurally, but were not executed against a live PostgreSQL server in this workspace.
- Dedicated payroll calculation, employee claims approval, loan amortization schedules, and tax-return filing remain workflow modules outside the payment posting boundary. The completed treasury transaction path is the accounting settlement layer for each of those workflows.
