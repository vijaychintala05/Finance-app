# FirmBooks Controlled Parallel Pilot — Reconciliation Log & Transaction Register

**Organization:** `org-pilot-firmbooks`  
**Pilot Start Date:** `2026-09-01`  
**Opening Position Cutoff:** `2026-08-31 (Closing of Business)`  
**Standard of Verification:** Daily & Weekly Dual-System Reconciliation against Trusted Books  

---

## 1. Discrepancy Taxonomy & Classification Code Guide

Every financial variance or transaction difference identified during the parallel run must be logged and classified under one of the 10 standard categories before any corrective action is taken:

| Classification Code | Description | Standard Resolution Protocol |
| :--- | :--- | :--- |
| **`DATA_ENTRY`** | Typo or discrepancy in user input (e.g. wrong amount, vendor, date entered). | Correct user input via standard business void/edit workflow in the respective system. |
| **`OPENING_BALANCE`** | Discrepancy originating from an incorrect opening balance or missing historical record. | Audit Opening Trial Balance against official cutover statements; update opening schedule. |
| **`DATE_TIMING`** | Transaction posted across date/month cutoff boundary (e.g. bank cleared next day). | Confirm bank value date vs. ledger posting date; verify timing reconciliation. |
| **`ROUNDING`** | Fractional cent/paisa difference in GST calculations or line-item discounts. | Verify round-off ledger allocation (+Cr / -Dr Round-Off) complies with statutory rules. |
| **`GST_TREATMENT`** | Difference in tax rate (e.g. 12% vs 18%), HSN/SAC code, or place-of-supply rule. | Check GSTIN state codes; adjust invoice/bill line tax rate according to statutory schedule. |
| **`ACCOUNT_MAPPING`** | Transaction posted to different Chart of Accounts nominals in the two systems. | Align nominal mapping rules between FirmBooks and Trusted Books. |
| **`WORKFLOW_DIFFERENCE`** | Difference in document state transitions (e.g. Draft vs Approved vs Posted). | Review workflow matrix (Gate 3) and advance document through proper approval state. |
| **`FIRMBOOKS_DEFECT`** | Mathematical, ledger, or system calculation defect in FirmBooks software. | Escalate via Defect Handling Protocol: reproduce in Staging, write regression test, deploy fix. |
| **`TRUSTED_BOOKS_ERROR`** | Legacy software error, unbalanced ledger bug, or manual ledger override in trusted system. | Document flaw in Trusted Books; record FirmBooks as mathematically correct standard. |
| **`UNRESOLVED`** | Discrepancy under active investigation by audit team. | Escalate to Lead Financial Auditor; resolve within 24 hours. |

---

## 2. Daily Pilot Transaction Reconciliation Register

```
+-------------------------------------------------------------------------------------------------------------------------------------------------------+
| DATE       | TYPE           | REF #       | TRUSTED (₹) | FIRMBOOKS (₹) | FIRMBOOKS ID    | STATUS   | DIFF (₹) | CLASSIFICATION | NOTES / ACTION       |
+------------+----------------+-------------+-------------+---------------+-----------------+----------+----------+----------------+----------------------+
| 2026-06-01 | INVOICE        | INV-2026-01 |   23,600.00 |     23,600.00 | inv-84b2c-001   | MATCHED  |     0.00 | NONE           | Verified item & tax  |
| 2026-06-01 | RECEIPT        | RCT-2026-01 |   23,600.00 |     23,600.00 | pmt-84b2c-001   | MATCHED  |     0.00 | NONE           | Bank allocation match|
| 2026-06-02 | BILL           | BILL-VND-01 |    5,900.00 |      5,900.00 | bill-84b2c-001  | MATCHED  |     0.00 | NONE           | AP Subledger posted  |
| 2026-06-02 | VENDOR_PAYMENT | CHQ-99102   |    5,900.00 |      5,900.00 | vpm-84b2c-001   | MATCHED  |     0.00 | NONE           | Bank cleared         |
| 2026-06-03 | EXPENSE        | EXP-001     |    1,200.00 |      1,200.00 | exp-84b2c-001   | MATCHED  |     0.00 | NONE           | Office supplies      |
+-------------------------------------------------------------------------------------------------------------------------------------------------------+
```

---

## 3. Weekly Control Reconciliation Log Sheet

### Week 1 Audit (`2026-06-01` to `2026-06-07`)

| Core Account / Control Metric | Trusted Books (₹) | FirmBooks (₹) | Variance ($\Delta$) | Classification | Resolution Status |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Bank Operating Balance** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |
| **Petty Cash Balance** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |
| **Accounts Receivable (AR)** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |
| **Accounts Payable (AP)** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |
| **Gross Sales Revenue** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |
| **Operating Expenses** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |
| **Output GST Liability** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |
| **Input Tax Credit (ITC)** | ₹0.00 | ₹0.00 | ₹0.00 | NONE | **RECONCILED** |

---

## 4. Discrepancy Investigation & Defect Log

| Discrepancy ID | Discovery Date | Entity Type & Ref | Impact (₹) | Category | Root Cause Analysis | Corrective Action Taken | Sign-Off Date |
| :--- | :---: | :--- | :---: | :--- | :--- | :--- | :---: |
| **DISC-001** | *[Date]* | *[Invoice / Bill / etc.]* | ₹0.00 | *[Taxonomy]* | *[Detailed investigation]* | *[Workflow adjustment or fix]* | *[Date]* |

---

## 5. Ten-Step Defect Escalation Protocol

If any discrepancy is classified as `FIRMBOOKS_DEFECT`:
1. **Preserve Evidence:** Capture exact request payload, database row state, and logs.
2. **Assign Defect ID:** Issue formal tracking ID (e.g. `DEF-PILOT-001`).
3. **Reproduce in Staging:** Recreate exact scenario in isolated Staging environment with synthetic data.
4. **Create Regression Test:** Write a failing test in `server/src/tests/`.
5. **Develop Patch:** Implement code fix strictly in development branch.
6. **Full Automated Suite:** Run `npx vitest run` across all 86+ test files (100% green required).
7. **Migration Rehearsal:** Validate migration safety if schema adjustments are involved.
8. **Pre-Deployment Backup:** Create full snapshot backup of Pilot database and verify checksum.
9. **Controlled Deployment:** Deploy patch to Pilot environment through CI/CD pipeline.
10. **Transaction Verification:** Rerun transaction and verify mathematical equilibrium restored ($\Delta = ₹0.00$).

> [!CAUTION]
> **Strict Prohibition of Direct SQL Mutation**: No operator, developer, or administrator may execute manual `UPDATE` or `DELETE` SQL queries against Pilot financial tables. All adjustments must occur through application workflows or approved patch releases.
