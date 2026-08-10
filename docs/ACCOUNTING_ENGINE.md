# DOUBLE-ENTRY ACCOUNTING ENGINE SPECIFICATION

**Document Version**: 1.0  
**Target Backend**: Node.js / Express / PostgreSQL  

---

## 1. Overview & Fundamental Accounting Equations

The core financial integrity of the application relies on strict adherence to standard double-entry bookkeeping rules:

$$\text{Assets} = \text{Liabilities} + \text{Equity}$$

$$\text{Net Income} = \text{Revenue} - \text{Expenses}$$

Every financial transaction posted into the system MUST generate a balanced **General Ledger Journal Entry** consisting of two or more line items where:

$$\sum \text{Debits} = \sum \text{Credits}$$

No single balance may ever be modified directly in isolation. All account balances are authoritative derivatives computed from the sum of debits and credits posted to that account.

---

## 2. Standard Account Type Posting Rules

| Account Category | Normal Balance | Debit Action (+) | Credit Action (-) |
| :--- | :--- | :--- | :--- |
| **Asset** (Cash, AR, Bank, Inventory) | Debit | Increases Asset | Decreases Asset |
| **Liability** (AP, Credit Cards, Tax Payable) | Credit | Decreases Liability | Increases Liability |
| **Equity** (Capital, Retained Earnings) | Credit | Decreases Equity | Increases Equity |
| **Income / Revenue** (Sales, Services) | Credit | Decreases Revenue | Increases Revenue |
| **Expense / COGS** (Payroll, Rent, Supplies) | Debit | Increases Expense | Decreases Expense |

---

## 3. Automated Event Posting Matrix

When business events occur in the application, the Central Posting Engine automatically generates balanced Journal Entries:

### Event 1: Invoice Issuance (Approved/Sent to Client)
- **Debit**: Accounts Receivable (`1100`) — Total Invoice Amount
- **Credit**: Sales/Service Revenue (`4000`) — Subtotal Amount
- **Credit**: Tax Payable (`2100`) — Tax Amount (if applicable)

```text
Dr. Accounts Receivable          $1,180.00
    Cr. Sales Revenue                        $1,000.00
    Cr. Sales Tax Payable                      $180.00
```

### Event 2: Payment Received from Client
- **Debit**: Bank Account / Cash (`1010`) — Payment Amount Received
- **Credit**: Accounts Receivable (`1100`) — Payment Amount

```text
Dr. Operating Bank Account       $1,180.00
    Cr. Accounts Receivable                  $1,180.00
```

### Event 3: Bill Received from Vendor
- **Debit**: Expense / Cost of Goods Sold (`5000`) — Bill Subtotal
- **Debit**: Input Tax Credit Asset (`1400`) — Tax Amount (if applicable)
- **Credit**: Accounts Payable (`2000`) — Total Bill Amount

```text
Dr. Office & Subcontractor Expense  $500.00
Dr. Input Tax Credit Asset            $45.00
    Cr. Accounts Payable                        $545.00
```

### Event 4: Payment Made to Vendor
- **Debit**: Accounts Payable (`2000`) — Amount Paid
- **Credit**: Bank Account / Cash (`1010`) — Amount Paid

```text
Dr. Accounts Payable                $545.00
    Cr. Operating Bank Account                  $545.00
```

### Event 5: Credit Note Issued to Client
- **Debit**: Sales Returns / Allowances (`4900`) — Subtotal Credit
- **Debit**: Sales Tax Payable (`2100`) — Tax Portion Reversed
- **Credit**: Accounts Receivable (`1100`) — Total Credit Note Amount

```text
Dr. Sales Returns & Allowances      $100.00
Dr. Sales Tax Payable                $18.00
    Cr. Accounts Receivable                     $118.00
```

### Event 6: Vendor Credit Received
- **Debit**: Accounts Payable (`2000`) — Total Vendor Credit Amount
- **Credit**: Expense / Purchase Returns (`5900`) — Vendor Credit Amount

```text
Dr. Accounts Payable                $200.00
    Cr. Purchase Returns & Credits              $200.00
```

---

## 4. Centralized Posting Engine Architecture

```text
 Business Event Trigger
 (e.g. approveInvoice)
          │
          ▼
 [ Event Validation ] ──> Checks Period Lock Date & Org ID
          │
          ▼
 [ Posting Engine ] ───> Resolves Account Mapping Rules
          │
          ▼
 [ Double Entry Builder ]
   ├── Construct Journal Entry Header
   └── Construct Balanced Debits & Credits
          │
          ▼
 [ Balance Verification ]
   └── Assert: SUM(Debits) === SUM(Credits)
          │
          ▼
 [ Database Transaction ] (ACID Atomic Commit)
   ├── Insert Journal Entry & Lines
   ├── Update Source Document Status (e.g., Paid/Invoiced)
   └── Append Audit Trail Log Entry
```

---

## 5. Monetary Precision Rules

1. **Integer Minor Units**: In backend database storage, monetary values must be stored as 64-bit integers in minor currency units (e.g., cents, paise) or arbitrary-precision `NUMERIC(15, 4)` columns in PostgreSQL.
2. **Never round intermediate steps**: Perform percentage calculations (e.g. tax, discounts) using high precision before rounding the final line items to the nearest integer cent.
3. **Period Lock Enforcement**: Any attempt to post a journal entry with an event date $\le$ `periodLock.lockDate` MUST be rejected by the Posting Engine with an `ACCOUNTING_PERIOD_LOCKED` error code.
