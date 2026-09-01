# FirmBooks Capability & Acceptance Matrix

**Release Target:** `FirmBooks v1.0-pilot`  
**Git Base Commit:** `cfb36de8709de50bee725e8e0cb6e380fd6e99fc`  
**Purpose:** Truthful, evidence-linked inventory of supported workflows, personas, effective feature flags, endpoint owners, and acceptance statuses.

---

## 1. Status Taxonomy

| Status Label | Definition |
| :--- | :--- |
| **`Verified`** | Fully implemented, backed by automated tests, typechecked, and verified against candidate release. |
| **`Pending`** | Implemented or partially implemented in code, but pending complete end-to-end integration, UI wiring, or clean restore verification. |
| **`Template`** | Operational document, runbook, or checklist ready for human execution during live parallel pilot. |
| **`Not In Scope`** | Intentionally excluded from the 9/10 baseline (e.g. external OCR, payroll, multi-currency conversion, payment gateway). |

---

## 2. Core Capability & Workflow Matrix

| Domain / Workflow | Persona(s) | Endpoint / Service Owner | Feature Flag / Config | Current Status | Acceptance Evidence |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Order-to-Cash (O2C)** | Sales, Accountant, Owner | `SalesEngine`, `/api/sales/invoices` | Core | **`Verified`** | Automated O2C lifecycle, invoice posting, customer receipt allocation, and ledger updates. |
| **Quotation & Estimations** | Sales, Owner | `QuotationEngine`, `/api/quotations` | `quotations` | **`Verified`** | Detailed line items, GST rate calculation, PDF export, revisioning, conversion to invoice. |
| **Customer Master & Statements** | Sales, Accountant | `SalesService`, `CustomerStatementService` | Core | **`Verified`** | Master CRUD verified; statement date filtering (`MTD/Last Month/QTD/YTD/All`), opening balances, and ledger parity verified (T5b). |
| **Procure-to-Pay (P2P)** | Purchase, Accountant, Owner | `PurchasesEngine`, `/api/purchases/bills` | Core | **`Verified`** | Vendor bills, GST ITC input credit, bill status transitions, payables tracking. |
| **Vendor Settlement UI** | Purchase, Accountant | `PurchasesEngine`, `/api/vendor-payments` | `vendor-settlements` | **`Verified`** | Async BooksContext modal facade, payment allocation, server numbering, audited reversals. |
| **Vendor Advances & Allocations** | Accountant, Owner | `PurchasesEngine`, `/api/vendor-advances` | `vendor-settlements` | **`Verified`** | Advance payment recording, FIFO bill allocation, advance conservation tests passing. |
| **Expense Recording & Receipts** | Accountant, Staff, Owner | `ExpensePostingService`, `/api/expenses` | `expense-receipts` | **`Verified`** | Expense posting verified; multi-image thumbnail preview, MIME/size bounds, removal before save, and authenticated reopening verified (T5a). |
| **Double-Entry General Journal** | Accountant, Auditor, Owner | `ServerPostingEngine`, `ManualJournalService` | Core | **`Verified`** | Balanced debits/credits, period locking, manual journals, reversal symmetry. |
| **Multi-Tier GST Engine** | Accountant, Auditor | `GSTComplianceService`, `/api/gst` | Core | **`Verified`** | Intra-state (CGST/SGST), Inter-state (IGST), 0/5/12/18/28% slabs, B2B/B2C, GSTR-1/3B summaries. |
| **Financial Reporting** | Accountant, Auditor, Owner | `TrialBalanceReportService`, `BalanceSheetReportService`, `ProfitAndLossReportService` | Core | **`Verified`** | Trial balance equality, P&L derivation from posted entries, balance sheet equation ($A = L + E$). |
| **Security & Granular RBAC** | Admin, Owner, Security Officer | `RolePermissionService`, `SecurityService` | Core | **`Verified`** | Granular permissions, role assignment, session expiry, tenant boundary isolation. |
| **Approval Workflows** | Manager, Owner, Approver | `ApprovalWorkflowService`, `/api/approvals` | `approvals` | **`Verified`** | Multi-tier rules, rejection authorization, threshold checks in canonical posting transactions. |
| **Backup & Recovery Center** | Admin, Owner | `BackupRestoreService`, `RecoveryArtifactService` | Core | **`Pending`** | Snapshot creation & AES-256 sealing verified; append-only audit-safe clean restore pending (T6a). |
| **Operational Disaster Recovery** | Systems Operator, Owner | System Runbooks, Docker Volumes | Operational | **`Template`** | NAS runbooks, offsite backup scripts, and drill templates in place; owner RPO/RTO sign-off pending (T6b). |
| **Pilot Go-Live & Reconciliation** | CFO, Lead Auditor, Owner | Pilot Runbooks & Reconciliation Logs | Operational | **`Template`** | Checklists and closing report templates prepared for September 1, 2026 parallel pilot. |

---

## 3. Explicit Out-of-Scope Domains

The following domains are explicitly excluded from the 9/10 baseline and will not be evaluated:
1. **Third-Party OCR / AI Receipt Scanning:** Manual image attachment and preview supported; automated OCR extraction excluded.
2. **Payroll & Staff Attendance:** Dedicated payroll engine excluded.
3. **Physical Inventory / Warehouse Logistics:** Perpetual stock valuation and barcode scanning excluded.
4. **Live Payment Gateway Aggregators:** Bank transfers and offline settlement recorded; direct Razorpay/Stripe automated capture excluded.
5. **Multi-Currency Real-Time Forex:** Base currency INR enforced; foreign currency live revaluation excluded.
