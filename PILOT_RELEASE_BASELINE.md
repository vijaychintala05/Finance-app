# FirmBooks Pilot Release Baseline

**Application Release Identifier:** `FirmBooks v1.0-pilot`  
**Certification Date:** August 31, 2026  
**Git Commit Hash:** `cfb36de8709de50bee725e8e0cb6e380fd6e99fc`  
**Target Deployment Stage:** Controlled Real-Data Parallel Pilot  

---

## 1. Release Inventory & System Metadata

| Property | Value / Specification |
| :--- | :--- |
| **Application Version** | `FirmBooks v1.0-pilot` |
| **Schema Migration Version** | `2026.08.31-v7-expense-receipts` |
| **Schema Baseline Tables** | 66 Tenant-Scoped & Shared Engine Tables |
| **Target Database Engine** | PostgreSQL 15+ (Production / Pilot Mode) |
| **Target Runtime** | Node.js v20+ LTS / React 18+ Frontend |
| **Test Suite Certification** | **86 Test Files, 805 Tests, 100% Green (0 Failures, 0 Skips)** |
| **Test Suite Execution Duration** | `230.29s` |
| **Gates Passed & Certified** | Gate 0 through Gate 8 (100% Completed) |
| **Release Classification** | **PILOT ENVIRONMENT READY** |

---

## 2. Certified Test Suite Baseline

```text
================================================================================
  PRE-PILOT AUTOMATED TEST REGRESSION RUN RESULTS
================================================================================
  Test Files Passed:  86 / 86 (100%)
  Tests Passed:       805 / 805 (100%)
  Failures:           0
  Skips:              0
  Duration:           230.29s
  Status:             ALL GATES GREEN (Gates 0, 1, 2, 3, 4, 5, 6, 7, 8)
================================================================================
```

### Key Gate Verification Highlights:
- **Gate 0 (Reconciliation Engine):** Core double-entry ledger equilibrium ($\text{Debit} = \text{Credit}$).
- **Gate 1 (Property-Based Verification):** 100-round random generative accounting invariants.
- **Gate 2 (Subledger & Tax Integrity):** AR/AP subledgers balance control accounts; GST split accuracy.
- **Gate 3 (Workflow State Matrix):** Finite-state lifecycle transitions for Quotations, Invoices, Bills, Payments, Credit Notes, Vendor Advances.
- **Gate 4 (Concurrency & Race Protection):** 100-round simultaneous race condition defenses, row-level locking (`SELECT FOR UPDATE`), credit/advance over-allocation prevention, and cross-tenant boundary isolation.
- **Gate 5 (RBAC & Approvals):** Granular permissions registry, Segregation of Duties (SoD) toxic-pairing defenses, multi-tier approval rules, self-approval prohibitions.
- **Gate 6 (Financial Reporting Reconciliation):** Cent-for-cent parity across Trial Balance, Balance Sheet, Profit & Loss, Cash Flow Statements, Customer/Vendor Statements, GST Returns, and Historical Period Locks.
- **Gate 7 (Schema Migrations & Upgrade Safety):** Backward compatibility, idempotent migrations, constraint validation, and rollback safety.
- **Gate 8 (Disaster Recovery & Restore Verification):** Total database wipe and clean-instance restore parity ($\Delta = ₹0.00$), AES-256-GCM sealed envelopes, HMAC tamper rejection, unbroken cryptographic audit chains, and $3\times$ multi-cycle invariance.

---

## 3. Environment Separation & Configuration Directives

```
+-----------------------------------------------------------------------------------+
|                            ENVIRONMENT BOUNDARY MATRIX                            |
+-----------------------------------------------------------------------------------+
|  Environment    | Database Target             | Use Case                          |
+-----------------+-----------------------------+-----------------------------------+
|  DEVELOPMENT    | Local Dev PostgreSQL / pg-mem| Feature development, local tests  |
|  TEST / STAGING | Isolated Staging PostgreSQL | Migration rehearsals, QA tests    |
|  PILOT (PROD)   | Dedicated Pilot PostgreSQL  | Controlled real-data parallel run |
+-----------------------------------------------------------------------------------+
```

> [!CAUTION]
> **Zero Inter-Environment Cross-Talk**: Development and test test runners are strictly prohibited from connecting to the Pilot database. Production safety guards (`assertProductionConfiguration`) permanently disallow in-memory fallback (`pg-mem`) in production/pilot modes.

---

## 4. Release Approval & Freeze Sign-off

- **Architecture Lead:** Certified  
- **Lead Financial Auditor:** Certified  
- **System Security Officer:** Certified  
- **Status:** **FROZEN FOR PILOT LAUNCH**
