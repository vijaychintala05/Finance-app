# FirmBooks Segregation of Duties (SoD) & Conflict Matrix

```text
Specification Version: 1.0.0
Domain: Internal Controls, Fraud Prevention & Audit Integrity
Target: FirmBooks Financial Operations Engine
Status: ARCHITECTURE SPECIFICATION
```

---

## 1. Segregation of Duties Principles in FirmBooks

Segregation of Duties (SoD) is the primary internal control mechanism preventing financial fraud, unauthorized disbursements, asset misappropriation, and un-audited ledger modifications.

### Four Cardinal Duties:
1. **Authorization**: Approving a commitment or disbursement (e.g., approving a PO, authorizing a vendor wire).
2. **Custody / Execution**: Executing the monetary movement or receiving physical assets (e.g., issuing payments, receiving bank funds).
3. **Recordkeeping**: Entering source documents into the accounting system (e.g., recording bills, posting journal entries).
4. **Reconciliation**: Verifying the parity between internal records and external statements (e.g., bank reconciliation, inventory counts).

> **Rule of Thumb**: No single individual should control more than one cardinal duty for any financial cycle.

---

## 2. Incompatible Permission Combinations (Toxic Pairings)

The matrix below defines prohibited and dangerous permission combinations within custom or assigned roles:

| Conflict ID | Primary Permission (Duty 1) | Competing Permission (Duty 2) | Risk Classification | Fraud / Error Vector | Required System Control |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **SOD-001** | `vendors.create` / `vendors.edit`<br>*(Vendor Master)* | `vendor_payments.create`<br>*(Disbursement Execution)* | **CRITICAL** | Actor creates a fictitious vendor with a personal bank account and immediately disburses payment. | **Hard Warning in Role Builder**.<br>Dual authorization required for payment to newly registered vendors within 14 days. |
| **SOD-002** | `bills.create`<br>*(Payables Recordkeeping)* | `vendor_payments.create`<br>*(Disbursement Execution)* | **HIGH** | Actor enters fraudulent or inflated supplier bills and executes payment settlement without external review. | **Approval Workflow Trigger**.<br>If creator === payor, payment requires secondary approval by `Finance Manager` or `Owner`. |
| **SOD-003** | `invoices.create`<br>*(Receivables Recordkeeping)* | `invoices.write_off`<br>*(Bad Debt Write-Off)* | **CRITICAL** | Actor intercepts cash payments from a customer and marks the open invoice as an uncollectible bad debt write-off. | **Hard Permission Separation**.<br>`invoices.write_off` restricted strictly to `Owner` and `Finance Manager`. |
| **SOD-004** | `journals.post`<br>*(General Ledger Posting)* | `bank_reconciliation.reconcile`<br>*(Cash Reconciliation)* | **HIGH** | Actor posts balancing journal adjustments to cash accounts and certifies the bank reconciliation to conceal discrepancies. | **Audit Log Flagging**.<br>Reconciliation detects manual journals posted to bank clearing accounts without statement match. |
| **SOD-005** | `purchase_orders.create`<br>*(Procurement Commitment)* | `purchase_orders.approve`<br>*(Procurement Authorization)* | **HIGH** | Actor issues purchase orders above spending limits and self-approves without supervisory oversight. | **Enforced Self-Approval Policy**.<br>`allow_self_approval = false` blocks creator from authorizing their own PO. |
| **SOD-006** | `periods.close`<br>*(Period Closing)* | `periods.unlock`<br>*(Period Reopening)* | **CRITICAL** | Actor closes books, alters historical financial figures post-audit, and re-closes without board or owner knowledge. | **Role Restriction**.<br>`periods.unlock` is exclusively available to `Owner` with mandatory cryptographic audit reason. |
| **SOD-007** | `backup.create`<br>*(Data Snapshot)* | `backup.restore`<br>*(Disaster Recovery)* | **CRITICAL** | Non-owner actor overwrites production database with an outdated or tampered backup artifact. | **Sole-Owner Authority**.<br>`backup.restore` requires Owner session + password re-authentication. |
| **SOD-008** | `customers.edit`<br>*(Credit Limit Settings)* | `invoices.create`<br>*(Credit Extension)* | **MEDIUM** | Sales actor artificially increases a customer credit limit to push through high-risk uncollateralized sales. | **Credit Warning Interceptor**.<br>Invoicing above standard customer credit limit requires Manager override. |
| **SOD-009** | `expenses.create`<br>*(Expense Claim)* | `expenses.approve`<br>*(Expense Reimbursement)* | **HIGH** | Employee submits personal expense reimbursement claims and self-authorizes company payout. | **Self-Approval Lock**.<br>Reimbursement cannot be approved by the submitting user ID. |

---

## 3. High-Risk Operational Cycles Breakdown

### 3.1 Procure-to-Pay (P2P) Cycle

```text
[Step 1: Requisition / PO] ─── Restricted to Purchase Executive
         │
[Step 2: PO Approval]      ─── Restricted to Approver / Finance Manager (No Self-Approval)
         │
[Step 3: Goods Receipt]    ─── Restricted to Warehouse / Operations
         │
[Step 4: Bill Entry]       ─── Restricted to Accountant (3-Way Matching: PO vs Receipt vs Bill)
         │
[Step 5: Payment Approval] ─── Restricted to Finance Manager / Owner
         │
[Step 6: Bank Payout]      ─── Restricted to Cashier / Bank Integration
```

* **Control Invariant**: No single actor can execute both Step 4 (Bill Entry) and Step 6 (Bank Payout) without an intervening approval at Step 5.

---

### 3.2 Order-to-Cash (O2C) Cycle

```text
[Step 1: Quotation / Order]  ─── Sales Executive
         │
[Step 2: Invoicing]          ─── Sales / Billing Clerk
         │
[Step 3: Payment Receipt]    ─── Accounts Receivable Clerk / Automated Bank Feed
         │
[Step 4: Credit Note / Adj]  ─── Finance Manager Approval Required
         │
[Step 5: Bad Debt Write-Off] ─── Owner / Finance Manager Only (Strictly Prohibited for Sales)
```

* **Control Invariant**: Sales actors who earn commission on billing volume must never have write-off or credit note issuance authority without Finance Manager review.

---

## 4. System Enforcement Mechanisms

### 4.1 Real-Time Conflict Detection in Role Builder
When an administrator creates or edits a custom role in the Settings panel, the UI evaluates active permission selections against the SoD Conflict Matrix:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ SEGREGATION OF DUTIES CONFLICT DETECTED                                             │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ You have selected both:                                                                │
│  • bills.create (Create Vendor Bills)                                                  │
│  • vendor_payments.create (Disburse Vendor Payments)                                   │
│                                                                                        │
│ Risk Level: HIGH (SOD-002)                                                             │
│ Assigning these permissions to the same role allows users to record bills and disburse │
│ funds without independent review.                                                      │
│                                                                                        │
│ Recommended Action:                                                                    │
│ Separate entry and payment duties into 'Purchase Executive' and 'Finance Manager'.     │
│                                                                                        │
│ [x] I acknowledge the internal control risk and wish to proceed anyway                 │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 In-Engine Transaction Self-Approval Guard
Inside transactional services (e.g. `ApprovalWorkflowService.ts`), the engine actively compares the authenticated actor ID against the entity creator ID:

```typescript
if (!orgPolicy.allowSelfApproval && request.submittedBy === approvedByUserId) {
  throw new Error(
    `Segregation of Duties Violation: User '${approvedByUserId}' cannot approve a transaction submitted by themselves.`
  );
}
```

---

## 5. Compensating Controls for Small Organizations

In small business deployments where one or two individuals perform multiple roles, strict segregation of duties may be operationally challenging. In such cases, FirmBooks activates **Compensating Controls**:

1. **Mandatory Audit Logging**: All actions under toxic pairings (e.g., self-approved bills, direct write-offs) are tagged with `severity = 'Warning'` and summarized in the monthly Owner compliance digest.
2. **Threshold-Based Dual Control**: Dual approval activates only above configured material thresholds (e.g., transactions exceeding ₹50,000).
3. **Automated Exception Reports**: Real-time email alerts are dispatched to the Organization Owner whenever:
   * A vendor bank account is modified.
   * A customer receivable is written off.
   * An accounting period is reopened.
   * An manual journal is posted directly to cash/bank ledger accounts.
