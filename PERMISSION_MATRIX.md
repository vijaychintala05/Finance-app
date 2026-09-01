# FirmBooks System Permission Matrix & Access Control Specification

```text
Specification Version: 2.0.0
Taxonomy Syntax: resource.action
Supported Roles: Owner, Admin, Finance Manager, Accountant, Sales, Purchase, Viewer/Auditor, Approver
Status: CERTIFIED ARCHITECTURE SPECIFICATION
```

---

## 1. Matrix Legend

* **`✓` (Granted)**: Unrestricted authorization to perform the specified action.
* **`⚠️` (Conditional)**: Allowed subject to organization approval workflow or threshold limit.
* **`—` (Forbidden)**: Access denied; returns HTTP 403 Forbidden.
* **Risk Levels**:
  * `[LOW]`: Read-only queries, drafts, and basic non-financial actions.
  * `[MED]`: Standard business record creation, edits, and communications.
  * `[HIGH]`: General Ledger state mutations, cash disbursements, and fiscal close.
  * `[CRIT]`: Destructive reversals, voids, period unlocks, and disaster recovery.

---

## 2. Comprehensive Role-Permission Matrix

### 2.1 Sales & Accounts Receivable

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `customers.view` | `LOW` | View customer roster and details | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `customers.create` | `MED` | Register new customer records | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `customers.view` |
| `customers.edit` | `MED` | Update customer billing info | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `customers.view` |
| `customers.archive` | `MED` | Archive inactive customers | ✓ | ✓ | ✓ | — | — | — | — | — | `customers.view` |
| `estimates.view` | `LOW` | View quotation records | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `estimates.create` | `MED` | Create draft quotations | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `estimates.view` |
| `estimates.edit` | `MED` | Edit draft/sent quotations | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `estimates.view` |
| `estimates.send` | `LOW` | Email quotation to client | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `estimates.view` |
| `estimates.convert` | `HIGH` | Convert quote to invoice/SO | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `invoices.create` |
| `estimates.delete` | `MED` | Delete unaccepted quotes | ✓ | ✓ | ✓ | — | ✓ | — | — | — | `estimates.view` |
| `sales_orders.view` | `LOW` | View sales orders | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `sales_orders.create`| `MED` | Create sales orders | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `sales_orders.view` |
| `sales_orders.edit` | `MED` | Modify open sales orders | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `sales_orders.view` |
| `sales_orders.convert`| `HIGH`| Convert SO to invoice | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `invoices.create` |
| `sales_orders.cancel` | `MED` | Cancel sales order | ✓ | ✓ | ✓ | — | ✓ | — | — | — | `sales_orders.view` |
| `delivery_challans.view` | `LOW`| View delivery challans | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `delivery_challans.create`| `MED`| Issue delivery challan | ✓ | ✓ | ✓ | — | ✓ | — | — | — | `customers.view` |
| `invoices.view` | `LOW` | View posted invoices | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `invoices.create` | `HIGH`| Post invoice to GL & AR | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `customers.view` |
| `invoices.send` | `LOW` | Email invoice PDF to client| ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `invoices.view` |
| `invoices.void` | `CRIT`| Cancel invoice & reverse GL| ✓ | ✓ | ✓ | ⚠️ | — | — | — | — | `invoices.view` |
| `invoices.write_off`| `CRIT`| Write off bad debt AR | ✓ | ✓ | ✓ | — | — | — | — | — | `invoices.view` |
| `customer_payments.view` | `LOW` | View payment receipts | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `customer_payments.create` | `HIGH`| Record customer payment | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `invoices.view` |
| `customer_payments.allocate`| `HIGH`| Apply advance to invoice | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `invoices.view` |
| `customer_payments.reverse` | `CRIT`| Void payment voucher | ✓ | ✓ | ✓ | ⚠️ | — | — | — | — | `customer_payments.view` |
| `credit_notes.view` | `LOW` | View credit notes | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `credit_notes.create` | `HIGH`| Issue sales return / credit| ✓ | ✓ | ✓ | ✓ | ⚠️ | — | — | — | `customers.view` |
| `credit_notes.apply` | `HIGH`| Apply credit to invoice | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `invoices.view` |
| `credit_notes.refund`| `HIGH`| Process cash/bank refund | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `credit_notes.view` |
| `credit_notes.void` | `CRIT`| Void unallocated credit | ✓ | ✓ | ✓ | — | — | — | — | — | `credit_notes.view` |

---

### 2.2 Purchases & Accounts Payable

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `vendors.view` | `LOW` | View vendor directory | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | None |
| `vendors.create` | `MED` | Register new suppliers | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | `vendors.view` |
| `vendors.edit` | `MED` | Update vendor bank/tax info| ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | `vendors.view` |
| `vendors.archive` | `MED` | Archive inactive vendors | ✓ | ✓ | ✓ | — | — | — | — | — | `vendors.view` |
| `purchase_orders.view` | `LOW` | View purchase orders | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | None |
| `purchase_orders.create` | `MED` | Issue draft PO commitments | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | `vendors.view` |
| `purchase_orders.edit` | `MED` | Edit draft purchase orders | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | `purchase_orders.view` |
| `purchase_orders.submit` | `LOW` | Submit PO to approval queue| ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | `purchase_orders.view` |
| `purchase_orders.approve` | `HIGH`| Authorize PO over threshold| ✓ | ✓ | ✓ | — | — | — | — | ✓ | `purchase_orders.view` |
| `purchase_orders.cancel` | `MED` | Cancel open PO commitments | ✓ | ✓ | ✓ | — | — | ✓ | — | — | `purchase_orders.view` |
| `purchase_orders.convert_to_bill` | `HIGH`| Convert PO to vendor Bill| ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | `bills.create` |
| `bills.view` | `LOW` | View vendor bills & AP | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | None |
| `bills.create` | `HIGH`| Post bill to AP & Expense | ✓ | ✓ | ✓ | ✓ | — | ⚠️ | — | — | `vendors.view` |
| `bills.void` | `CRIT`| Cancel bill & reverse AP | ✓ | ✓ | ✓ | ⚠️ | — | — | — | — | `bills.view` |
| `vendor_payments.view` | `LOW` | View payment vouchers | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | None |
| `vendor_payments.create` | `HIGH`| Disburse vendor settlement | ✓ | ✓ | ✓ | ⚠️ | — | — | — | ⚠️ | `bills.view` |
| `vendor_payments.allocate`| `HIGH`| Apply advance to open bill | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `bills.view` |
| `vendor_payments.reverse` | `CRIT`| Void payment disbursement | ✓ | ✓ | ✓ | — | — | — | — | — | `vendor_payments.view` |
| `vendor_advances.view` | `LOW` | View vendor prepayments | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | None |
| `vendor_advances.create` | `HIGH`| Pay advance before bill | ✓ | ✓ | ✓ | ⚠️ | — | ⚠️ | — | — | `vendors.view` |
| `vendor_advances.apply` | `HIGH`| Apply advance to bill | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `bills.view` |
| `vendor_advances.reverse`| `CRIT`| Void unapplied advance | ✓ | ✓ | ✓ | — | — | — | — | — | `vendor_advances.view` |
| `vendor_credits.view` | `LOW` | View debit notes / credits | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | None |
| `vendor_credits.create` | `HIGH`| Record debit note / return | ✓ | ✓ | ✓ | ✓ | — | ⚠️ | — | — | `vendors.view` |
| `vendor_credits.apply` | `HIGH`| Apply credit to bill balance| ✓ | ✓ | ✓ | ✓ | — | — | — | — | `bills.view` |
| `vendor_credits.refund` | `HIGH`| Receive supplier refund | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `vendor_credits.view` |
| `vendor_credits.void` | `CRIT`| Void unapplied debit note | ✓ | ✓ | ✓ | — | — | — | — | — | `vendor_credits.view` |

---

### 2.3 Operating Expenses

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `expenses.view` | `LOW` | View expense records | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | None |
| `expenses.create` | `HIGH`| Post direct expense to GL | ✓ | ✓ | ✓ | ✓ | — | ⚠️ | — | — | `accounts.view` |
| `expenses.edit_draft` | `MED` | Edit draft expense claim | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | `expenses.view` |
| `expenses.submit` | `LOW` | Submit claim for approval | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | `expenses.view` |
| `expenses.approve` | `HIGH`| Authorize expense claim | ✓ | ✓ | ✓ | — | — | — | — | ✓ | `expenses.view` |
| `expenses.void` | `CRIT`| Void posted expense in GL | ✓ | ✓ | ✓ | — | — | — | — | — | `expenses.view` |
| `expenses.attach_receipt`| `LOW` | Upload receipt image/PDF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | `expenses.view` |

---

### 2.4 Accounting & General Ledger

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `accounts.view` | `LOW` | View Chart of Accounts | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | None |
| `accounts.create` | `MED` | Add new ledger account | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `accounts.view` |
| `accounts.edit` | `HIGH`| Rename or classify account | ✓ | ✓ | ✓ | — | — | — | — | — | `accounts.view` |
| `accounts.archive` | `HIGH`| Archive zero-balance account| ✓ | ✓ | ✓ | — | — | — | — | — | `accounts.view` |
| `journals.view` | `LOW` | View manual journal entries| ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | None |
| `journals.create` | `MED` | Draft manual journal | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `accounts.view` |
| `journals.post` | `HIGH`| Post manual journal to GL | ✓ | ✓ | ✓ | ⚠️ | — | — | — | — | `accounts.view` |
| `journals.reverse` | `CRIT`| Post reversing journal entry| ✓ | ✓ | ✓ | — | — | — | — | — | `journals.view` |
| `periods.view` | `LOW` | View period close status | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | None |
| `periods.close` | `HIGH`| Execute period close lock | ✓ | ✓ | ✓ | — | — | — | — | — | `periods.view` |
| `periods.lock` | `HIGH`| Freeze historical dates | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `periods.view` |
| `periods.unlock` | `CRIT`| Reopen closed/locked period| ✓ | — | — | — | — | — | — | — | `periods.view` (Owner Only) |
| `opening_balances.view`| `LOW` | View opening balances | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | None |
| `opening_balances.manage`| `CRIT`| Set opening balances | ✓ | ✓ | ✓ | — | — | — | — | — | `accounts.view` |
| `fixed_assets.view` | `LOW` | View asset schedules | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | None |
| `fixed_assets.manage` | `HIGH`| Depreciate & dispose assets | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `accounts.view` |

---

### 2.5 Banking & Cash

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `banking.view` | `LOW` | View bank balances & feeds | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | None |
| `bank_accounts.create` | `HIGH`| Connect new bank account | ✓ | ✓ | ✓ | — | — | — | — | — | `accounts.view` |
| `bank_accounts.edit` | `HIGH`| Update bank account info | ✓ | ✓ | ✓ | — | — | — | — | — | `banking.view` |
| `bank_transactions.view`| `LOW`| View statement lines | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | `banking.view` |
| `bank_statements.import`| `MED` | Upload bank statement file | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `banking.view` |
| `bank_reconciliation.view`| `LOW`| View reconciliation UI | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | `banking.view` |
| `bank_reconciliation.match`| `MED`| Match statement to ledger | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `bank_reconciliation.view` |
| `bank_reconciliation.reconcile`| `HIGH`| Certify recon session | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `bank_reconciliation.view` |
| `bank_reconciliation.unreconcile`| `HIGH`| Unlink reconciled item | ✓ | ✓ | ✓ | — | — | — | — | — | `bank_reconciliation.view` |
| `bank_transfers.create` | `HIGH`| Post inter-bank transfer | ✓ | ✓ | ✓ | ✓ | — | — | — | — | `accounts.view` |

---

### 2.6 Reports & Analytics

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `reports.view` | `LOW` | Access standard reports | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | None |
| `reports.financial_statements` | `HIGH`| View P&L, BS, Trial Balance| ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | `reports.view` |
| `reports.receivables` | `MED` | View AR Aging & Statements | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | `reports.view` |
| `reports.payables` | `MED` | View AP Aging & Statements | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | `reports.view` |
| `reports.gst` | `HIGH`| View GST Tax Return reports| ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | `reports.view` |
| `reports.bank` | `MED` | View Cash Flow & Recon rpts| ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | `reports.view` |
| `reports.projects` | `MED` | View project profitability | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | `reports.view` |
| `reports.audit` | `HIGH`| View audit log reports | ✓ | ✓ | ✓ | — | — | — | ✓ | — | `reports.view` |
| `reports.export` | `MED` | Export CSV / Excel / PDF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | `reports.view` |

---

### 2.7 Projects & Time Tracking

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `projects.view` | `LOW` | View projects & tasks | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | None |
| `projects.create` | `MED` | Create project & budget | ✓ | ✓ | ✓ | — | ✓ | — | — | — | `projects.view` |
| `projects.edit` | `MED` | Update project metadata | ✓ | ✓ | ✓ | — | ✓ | — | — | — | `projects.view` |
| `projects.financials` | `HIGH`| View project margin & cost | ✓ | ✓ | ✓ | ✓ | — | — | ✓ | — | `projects.view` |
| `projects.time_entries` | `LOW` | Log employee hours | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | `projects.view` |
| `projects.invoice_time` | `HIGH`| Convert hours to invoice | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | `invoices.create` |

---

### 2.8 Workspace Administration & Security

| Permission Code | Risk | Description | Owner | Admin | Fin Mgr | Acct | Sales | Purch | Viewer | Appr | Prerequisites |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| `users.view` | `LOW` | View team member directory | ✓ | ✓ | ✓ | — | — | — | — | — | None |
| `users.invite` | `MED` | Send workspace invitations | ✓ | ✓ | — | — | — | — | — | — | `users.view` |
| `users.deactivate` | `HIGH`| Remove member access | ✓ | ✓ | — | — | — | — | — | — | `users.view` |
| `roles.view` | `LOW` | View roles and permissions | ✓ | ✓ | ✓ | — | — | — | — | — | None |
| `roles.manage` | `CRIT`| Create / edit custom roles | ✓ | ✓ | — | — | — | — | — | — | `roles.view` |
| `settings.view` | `LOW` | View general settings | ✓ | ✓ | ✓ | ✓ | — | — | — | — | None |
| `settings.manage` | `HIGH`| Update company profile & terms| ✓ | ✓ | — | — | — | — | — | — | `settings.view` |
| `settings.financial_config`| `CRIT`| Modify control accounts/tax | ✓ | — | — | — | — | — | — | — | `accounts.view` |
| `approvals.manage` | `HIGH`| Configure approval rules | ✓ | ✓ | ✓ | — | — | — | — | — | `settings.view` |
| `audit.view` | `HIGH`| View server audit stream | ✓ | ✓ | ✓ | — | — | — | ✓ | — | None |
| `security.manage` | `CRIT`| Enforce MFA & session rules | ✓ | ✓ | — | — | — | — | — | — | `settings.view` |
| `backup.view` | `HIGH`| View backup history | ✓ | — | — | — | — | — | — | — | None |
| `backup.create` | `HIGH`| Take encrypted backup snapshot| ✓ | — | — | — | — | — | — | — | `backup.view` |
| `backup.restore` | `CRIT`| Restore backup database | ✓ | — | — | — | — | — | — | — | `backup.view` (Owner Only) |
