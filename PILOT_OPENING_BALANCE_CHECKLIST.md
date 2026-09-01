# FirmBooks Pilot Opening Balance Reconciliation Checklist

**Target Organization:** `org-pilot-firmbooks`  
**Cutover Date:** `2026-08-31 (Closing of Business)`  
**Pilot Active Start Date:** `2026-09-01 (Transaction #1)`  
**Baseline Standard:** Cent-for-Cent Parity with Trusted Legacy Accounting System ($\Delta = ₹0.00$)  

---

## 1. Opening Balance Cutover Strategy

FirmBooks adopts the **Clean Monthly Boundary Cutover Strategy**:
* **Cutover Date:** Close of business on **August 31, 2026**.
* **Live Ingestion:** Real transactions commence from **September 1, 2026** (Cycle 1: September 2026, Cycle 2: October 2026).
* **Historical Data Boundary:** No bulk historical transactions imported. Only verified opening account balances and individual outstanding subledger documents (unpaid invoices and bills) are brought across.

> [!IMPORTANT]
> **Mandatory Balancing Rule**: The Opening Trial Balance must balance perfectly ($\sum \text{Debits} = \sum \text{Credits}$) before posting the first real pilot transaction. Any discrepancy will corrupt all subsequent P&L and Balance Sheet comparisons.

---

## 2. Opening Balance Account Matrix & Verification Worksheet

| Account Code | Account Name / Description | Account Type | Trusted Books Balance (₹) | FirmBooks Opening Balance (₹) | Difference ($\Delta$) | Reconciled By / Notes |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **1010** | Operating Current Account (Primary Bank) | Asset | 0.00 | 0.00 | ₹0.00 | Statement confirmed |
| **1020** | Secondary Current Account / Escrow | Asset | 0.00 | 0.00 | ₹0.00 | Statement confirmed |
| **1050** | Petty Cash / Cash on Hand | Asset | 0.00 | 0.00 | ₹0.00 | Cash physical audit |
| **1100** | Accounts Receivable (Trade Debtors) | Asset | 0.00 | 0.00 | ₹0.00 | Subledger sum verified |
| **1200** | Merchandise / Raw Material Inventory | Asset | 0.00 | 0.00 | ₹0.00 | Physical valuation |
| **1300** | Input Tax Credit — CGST (Asset) | Asset | 0.00 | 0.00 | ₹0.00 | GSTR-2B agreed |
| **1310** | Input Tax Credit — SGST (Asset) | Asset | 0.00 | 0.00 | ₹0.00 | GSTR-2B agreed |
| **1320** | Input Tax Credit — IGST (Asset) | Asset | 0.00 | 0.00 | ₹0.00 | GSTR-2B agreed |
| **1400** | Prepaid Expenses & Security Deposits | Asset | 0.00 | 0.00 | ₹0.00 | Schedule matched |
| **1500** | Plant, Machinery & Office Equipment | Asset | 0.00 | 0.00 | ₹0.00 | Fixed Asset Register |
| **1510** | Accumulated Depreciation | Contra-Asset | 0.00 | 0.00 | ₹0.00 | Depreciation Schedule |
| **2000** | Accounts Payable (Trade Creditors) | Liability | 0.00 | 0.00 | ₹0.00 | Subledger sum verified |
| **2100** | Output Tax Payable — CGST (Liability) | Liability | 0.00 | 0.00 | ₹0.00 | GSTR-3B liability |
| **2110** | Output Tax Payable — SGST (Liability) | Liability | 0.00 | 0.00 | ₹0.00 | GSTR-3B liability |
| **2120** | Output Tax Payable — IGST (Liability) | Liability | 0.00 | 0.00 | ₹0.00 | GSTR-3B liability |
| **2200** | Customer Advance Receipts (Unallocated) | Liability | 0.00 | 0.00 | ₹0.00 | Advance register |
| **2300** | Statutory Dues (TDS, PF, ESI, PT) | Liability | 0.00 | 0.00 | ₹0.00 | Challan matched |
| **2400** | Bank Overdraft / Term Loans | Liability | 0.00 | 0.00 | ₹0.00 | Bank loan statement |
| **3000** | Partners' Capital / Equity Share Capital | Equity | 0.00 | 0.00 | ₹0.00 | Shareholding ledger |
| **3100** | Retained Earnings / General Reserves | Equity | 0.00 | 0.00 | ₹0.00 | Net historical surplus |
| **3999** | Opening Balance Suspense Account | Equity | 0.00 | 0.00 | **₹0.00** | **MUST BE ZERO** |

---

## 3. Subledger Itemized Breakdown Protocol

### A. Accounts Receivable (Trade Debtors) Opening Invoices
For every customer with an outstanding balance at cutover:
1. Enter each individual unpaid invoice with its historical invoice number, issue date, due date, and exact balance due.
2. Confirm the sum of all customer opening invoices equals **Account 1100 (Accounts Receivable)**.
3. Validate that no invoice balance is negative.

### B. Accounts Payable (Trade Creditors) Opening Bills
For every vendor with an outstanding balance at cutover:
1. Enter each individual unpaid bill with its original bill number, bill date, due date, and exact balance due.
2. Confirm the sum of all vendor opening bills equals **Account 2000 (Accounts Payable)**.
3. Validate that no bill balance is negative.

### C. Unallocated Advances
- **Customer Advances:** Record each unapplied customer advance voucher with customer link and advance date.
- **Vendor Advances:** Record each unapplied vendor advance payment voucher with vendor link and payment reference.

---

## 4. Opening Balance Sign-off Protocol

Before proceeding to transaction entry:
- [ ] Trial Balance Total Debits = Total Credits ($\Delta = ₹0.00$).
- [ ] Bank opening balances verified against official bank statements as of cutover date.
- [ ] AR Subledger sum matches Account 1100.
- [ ] AP Subledger sum matches Account 2000.
- [ ] Input Tax Credit (ITC) balances match GST portal electronic credit ledger.
- [ ] Opening Balance Suspense Account (3999) has a **₹0.00 balance**.
- [ ] Organization Baseline Backup taken and checksum verified.

**Reconciliation Completed By:** ___________________________  
**Finance Lead Sign-Off:** ___________________________  
**Date:** ___________________________  
