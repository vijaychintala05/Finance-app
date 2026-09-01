# FirmBooks Parallel Pilot Go-Live Readiness Checklist

**Release Identifier:** `FirmBooks v1.0-pilot`  
**Git Commit Hash:** `cfb36de8709de50bee725e8e0cb6e380fd6e99fc`  
**Deployment Target:** Controlled Real-Data Parallel Pilot  

---

## 1. System Readiness Verification Criteria

All items below must be verified and checked off prior to ingesting the first real financial transaction into the Pilot environment:

### Phase A: Software & Automated Regression Integrity
- [x] **Release Codebase Frozen:** Application version stamped as `FirmBooks v1.0-pilot` and commit recorded in [`PILOT_RELEASE_BASELINE.md`](file:///c:/Users/HI/Desktop/APP/finance%20app/PILOT_RELEASE_BASELINE.md).
- [x] **Full Regression Green:** All **86 test files and 805 automated tests** passed with 0 failures, 0 skips.
- [x] **Gates 0 through 8 Certified:** All accounting, state matrix, concurrency, RBAC, reporting, migration, and disaster recovery gates formally signed off.
- [x] **Production Database Safety Active:** `assertProductionConfiguration()` active; in-memory `pg-mem` fallback permanently disabled in pilot mode.

### Phase B: Environment & Database Configuration
- [ ] **Clean Pilot Database Provisioned:** Dedicated PostgreSQL instance initialized with clean tables and zero synthetic transactions.
- [ ] **Schema Migration Synchronized:** `schema_migrations` table records latest version `2026.08.31-v7-expense-receipts`.
- [ ] **Isolated Credentials:** Pilot database credentials are distinct from development and test databases.
- [ ] **NAS Storage & Volume Health:** PostgreSQL data directory mounted on resilient storage (ZFS/RAID) with $>20\%$ free disk capacity.
- [ ] **Graceful Power & UPS Handling:** NAS configured for clean database shutdown on power interruption.

### Phase C: Master Data & Opening Balance Equilibrium
- [ ] **Master Data Cleaned & Verified:** Customers, Vendors, Chart of Accounts, Items, GSTINs, and Bank Accounts validated with zero duplicates.
- [ ] **Opening Balances Populated:** Opening balances entered as of agreed cutover date.
- [ ] **Opening Balance Reconciliation Sheet Completed:** Verified against [`PILOT_OPENING_BALANCE_CHECKLIST.md`](file:///c:/Users/HI/Desktop/APP/finance%20app/PILOT_OPENING_BALANCE_CHECKLIST.md) with **$\Delta = ₹0.00$** across all accounts.
- [ ] **Opening Trial Balance Balanced:** Total Debits = Total Credits ($\Delta = ₹0.00$).
- [ ] **Opening Suspense Account Balanced:** Account 3999 has an exact ₹0.00 balance.

### Phase D: Security, RBAC & Approval Governance
- [ ] **Internal Pilot Users Onboarded:** Legitimate internal users provisioned through Gate-5 RBAC system.
- [ ] **Role Assignments Enforced:** User accounts segregated by function (Accountant, Sales, Purchase, Auditor) with zero Owner account usage for routine daily bookkeeping.
- [ ] **MFA Enforced:** Multi-Factor Authentication enabled for Owner, Admin, and Accountant roles.
- [ ] **Test Accounts Purged:** All test, temporary, and mock accounts removed or disabled in the Pilot database.
- [ ] **Approval Workflows Configured:** Organization-approved threshold rules active for Invoices, Bills, and Vendor Payments.

### Phase E: Backup, Recovery & Operational Monitoring
- [ ] **Baseline Pilot Backup Created:** Full snapshot backup generated before first transaction.
- [ ] **Checksum Verified:** SHA-256 backup payload checksum matches metadata fingerprint.
- [ ] **Dry-Run Restore Validated:** Staging restore test successfully executed from the baseline backup.
- [ ] **Automated Daily Backup Scheduled:** Daily backup cron job active with off-NAS secondary copy.
- [ ] **Health & Log Monitoring Active:** Server health diagnostics and error logging endpoints operational.
- [ ] **Reconciliation Log Initialized:** Daily transaction register in [`PILOT_RECONCILIATION_LOG.md`](file:///c:/Users/HI/Desktop/APP/finance%20app/PILOT_RECONCILIATION_LOG.md) prepared for recording.

---

## 2. Final Pilot Go-Live Authorization

| Role | Authorized Signatory Name | Signature | Date |
| :--- | :--- | :--- | :--- |
| **Lead Software Engineer** | ___________________________ | ___________________________ | 2026-08-31 |
| **Chief Financial Officer / Controller** | ___________________________ | ___________________________ | ____________ |
| **Managing Partner / Business Owner** | ___________________________ | ___________________________ | ____________ |

---

## 3. Go-Live Determination

```text
[ ] PILOT ENVIRONMENT READY — AUTHORIZED TO COMMENCE PARALLEL RUN
[ ] PILOT BLOCKED — DEFECTS REQUIRE RESOLUTION
```
