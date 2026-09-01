# Walkthrough — Payment & Approval Integrity (Tasks T3 & T4 Remediation)

FirmBooks has fully remediated and verified all critical integrity items across the **T3/T4 Payment + Approval Integrity** lane of the Evidence-Based 9/10 Plan.

---

## 1. Concrete Remediation of Identified Issues

### Item 1 (P0): Unbypassable Approval Enforcement & Safe Draft Posting across All 5 Financial Subsystems
- **Manual Journals:**
  - `ManualJournalService.createJournal`: If approval is required, direct posting is strictly prevented. The complete draft is persisted into `journal_entries` with `status = 'Submitted'` along with all `journal_lines`.
  - `ManualJournalService.postApprovedJournal`: Locks draft row `FOR UPDATE`, atomically marks approval request `'CONSUMED'`, posts ledger balances, updates status to `'Posted'`, and prevents double-posting.
- **Vendor Bills:**
  - `PurchasesEngine.createAndPostBill`: If approval is required, creates bill in `status = 'SUBMITTED'`, defers GL posting, PO billing, and AP updates, and links approval request.
  - `PurchasesEngine.postApprovedBill`: Locks the original bill row `FOR UPDATE`, atomically consumes the approval request, posts GL entry (Dr Expense, Dr GST Input, Cr AP), updates vendor `payables_balance`, transitions bill status to `'POSTED'`, and preserves the exact document ID without leaving orphan or duplicate records.
- **Vendor Payments:**
  - `PurchasesEngine.recordVendorPayment`: If approval is required, creates payment in `status = 'SUBMITTED'`, persists pending allocations into `payment_made_allocations`, and defers cash outflow and AP settlement.
  - `PurchasesEngine.postApprovedVendorPayment`: Locks original payment row `FOR UPDATE`, atomically consumes approval, loads allocations, locks and updates target bills, posts GL cash outflow and AP settlement, updates vendor balance, and transitions status to `'ALLOCATED'`.
- **Sales Invoices:**
  - `SalesEngine.createAndPostInvoice`: If approval is required, creates invoice in `status = 'SUBMITTED'`, defers GL posting, Sales Order invoiced amount updates, and Customer `receivables_balance` updates.
  - `SalesEngine.postApprovedInvoice`: Locks original invoice row `FOR UPDATE`, atomically consumes approval, posts GL entry (Dr AR, Cr Revenue, Cr GST Output, Dr/Cr Round-Off), updates Sales Order, updates customer `receivables_balance`, and transitions status to `'POSTED'`.
- **Customer Payments:**
  - `SalesEngine.recordPayment`: If approval is required, creates payment in `status = 'SUBMITTED'`, persists pending allocations into `payment_received_allocations`, and defers cash inflow and AR settlement.
  - `SalesEngine.postApprovedPayment`: Locks original payment row `FOR UPDATE`, atomically consumes approval, loads allocations, locks and updates target invoices, posts GL cash inflow and AR settlement, updates customer balance, and transitions status to `'ALLOCATED'`.

### Item 2 (P0): Draft & Approval Request Transaction Atomicity
- `ApprovalWorkflowService.submitForApproval`, `ApprovalWorkflowService.consumeApproval`, and `ApprovalWorkflowService.requiresApproval` now accept `transactionClient?: QueryClient`.
- When an entity requires approval inside a transaction, the approval request and audit log rows are written directly through the caller's transaction client (`client`/`tx`), guaranteeing that any rollback automatically rolls back the approval request and leaves **zero orphan approval rows**.

### Item 3 (P0): Submitter Identity & Self-Approval Security
- In `financeController.ts` (`recordVendorPayment`, `recordPaymentReceived`, `createInvoice`, etc.), submitter identity is securely injected from `req.auth!.userId`.
- `ApprovalWorkflowService.approveRequest` strictly verifies `allowSelfApproval = false` and rejects any approval where the authenticated approver matches the submitter ID, preventing self-approval bypass even if a client attempts to spoof the payload.

### Item 4 (P1): Vendor Advance Frontend & Backend Lifecycle
- In `RecordVendorPaymentModal.tsx`, switching to "Advance Prepayment Mode" calls `addVendorAdvance` (`POST /api/v1/finance/vendor-advances`) and validates explicit selection of an active bank/cash account (`paidFromAccountId`).
- In `BooksContext.tsx`, `addVendorAdvance` and `applyVendorAdvance` provide typed state management and authoritative data re-hydration.

---

## 2. Automated Test & Typecheck Verification Results

```text
================================================================================
  T3 + T4 PAYMENT & APPROVAL INTEGRITY REMEDIATION: PASS
  - Full Project Typecheck (tsconfig.json): 0 Errors (Exit Code 0)
  - Source Build Typecheck (tsconfig.build.json): 0 Errors (Exit Code 0)
  - Full Vitest Test Suite: 87 test files, 818 tests, 100% PASS (0 Failures)
  - Approval Integrity Suite: server/src/tests/financialPostingApprovalIntegrity.test.ts (7/7 PASS)
    ✓ 1. Manual Journal: cannot bypass approval rule and preserves exact draft ID upon postApprovedJournal
    ✓ 2. Vendor Bill: draft preserved, AP unaffected until approval, posted cleanly via postApprovedBill
    ✓ 3. Vendor Payment: preserves draft, applies allocations upon postApprovedVendorPayment without duplicate document
    ✓ 4. Sales Invoice: approval requirement routes invoice to SUBMITTED and posts cleanly via postApprovedInvoice
    ✓ 5. Customer Payment: approval requirement preserves draft and allocates cleanly upon postApprovedPayment
    ✓ 6. Transaction Rollback Atomicity: failure during draft write leaves zero orphan approval requests
    ✓ 7. Submitter Security: strictly rejects self-approval even if user has approver role
  - Concurrency Suite: server/src/tests/gate4ConcurrencySecurityHardening.test.ts (28/28 PASS)
  - Frontend BooksContext Suite: src/__tests__/booksContext.test.tsx (10/10 PASS)
================================================================================
```

---

## 3. Linear Roadmap Position

```text
[T1 Evidence & Matrix] -> [T2 Isolated Harness & Full tsc Green]  <-- COMPLETED
                                    |
            [Payment + Approval Integrity (T3 + T4)]               <-- REMEDIATED & VERIFIED
                                    |
    >>> Receipts (T5a) / Statements (T5b) / Recovery (T6a + T6b) <<< (NEXT)
                                    |
                    Same-Digest Release (T7)
                                    |
                User Validation (T8) + Final Score (T9)
```
