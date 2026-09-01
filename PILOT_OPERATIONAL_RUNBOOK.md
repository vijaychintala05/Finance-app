# FirmBooks Controlled Parallel Pilot — Operational Runbook

**Release Version:** `FirmBooks v1.0-pilot`  
**Git Commit Hash:** `cfb36de8709de50bee725e8e0cb6e380fd6e99fc`  
**Purpose:** Comprehensive standard operating procedures for executing the controlled real-data parallel pilot.  

---

## 1. Environment Architecture & Safety Guards

```
+---------------------------------------------------------------------------------------------------+
|                                 ENVIRONMENT TOPOLOGY & GUARDS                                     |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [DEVELOPMENT]                [TEST / STAGING]               [PILOT / PROD-LIKE]                  |
|  * Local Dev Engine           * Automated Test PostgreSQL    * Dedicated Pilot PostgreSQL         |
|  * pg-mem Allowed in Tests    * Full Migration Rehearsals    * pg-mem STRICTLY PROHIBITED         |
|  * Mock Data Only             * Synthetic Master Data Fixtures* Real Parallel Financial Data      |
|  * Rapid Iteration            * Regression Runs (86 files)   * Isolated Credentials               |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### Production Safety Invariants:
1. **In-Memory Prohibited:** In `production` and `pilot` runtime modes, `NODE_ENV=production` triggers `assertProductionConfiguration()`. If `DATABASE_URL` is missing or `USE_PG_MEM=true` is present, the server refuses to start.
2. **Destructive Helpers Disabled:** Test reset endpoints (`/api/test/*`, `reset()`) are physically stripped or rejected with HTTP 403 in pilot/production.
3. **Dedicated Credentials:** The pilot database uses isolated user credentials with no network visibility to dev/test instances.

---

## 2. Pilot Database Provisioning

1. **Create Database:**
   ```sql
   CREATE DATABASE firmbooks_pilot_db WITH OWNER firmbooks_app ENCODING 'UTF8';
   ```
2. **Run Initial Migrations:**
   ```bash
   NODE_ENV=production DATABASE_URL=postgres://firmbooks_app:secret@localhost:5432/firmbooks_pilot_db npm run migrate
   ```
3. **Verify Schema Version:**
   ```sql
   SELECT version, executed_at FROM schema_migrations ORDER BY executed_at DESC LIMIT 1;
   -- Must return: 2026.08.31-v7-expense-receipts
   ```

---

## 3. Master Data Ingestion & Sanitization

Before importing master records:
- **Customers & Vendors:**
  - Verify GSTIN structure (15 alphanumeric characters).
  - Validate state codes match GSTIN prefix (e.g. 37 for AP, 36 for Telangana).
  - Deduplicate by legal entity name and PAN.
- **Chart of Accounts:**
  - Load standard Chart of Accounts or customized company hierarchy.
  - Verify each nominal has an explicit `type` (Asset, Liability, Equity, Revenue, Expense) and `sub_type`.
- **Items & Services:**
  - Ensure HSN (goods) or SAC (services) codes are specified.
  - Ensure GST tax rate is explicitly mapped (0%, 5%, 12%, 18%, 28%).

---

## 4. User Onboarding, RBAC & Security

Configure user accounts under least-privilege principles:

| Role Name | Permitted Operations | Restricted Operations |
| :--- | :--- | :--- |
| **Owner** | Full system administration, backup creation, system settings. | **Prohibited from routine daily invoice/bill entry**. |
| **Accountant** | General journal entries, bank reconciliation, financial reports, tax returns. | Cannot unlock closed historical periods. |
| **Sales** | Quotations, sales orders, invoices, customer receipt logging. | Cannot write off bad debt; cannot disburse vendor payments. |
| **Purchase** | Purchase orders, goods receipts, vendor bills. | Cannot disburse vendor payments (SoD segregation). |
| **Viewer / Auditor** | Read-only access to reports, journals, customer/vendor statements, audit trail. | Strictly zero write/post/edit permissions. |

- **Multi-Factor Authentication (MFA):** Enable MFA for all Owner, Admin, and Accountant accounts before go-live.

---

## 5. Daily Pilot Operating Controls

1. **Morning Ingestion Routine:**
   - Record previous day's sales invoices, customer receipts, vendor bills, and disbursements into both Trusted Books and FirmBooks.
2. **Daily Sanity Verification:**
   - Log transactions into the Daily Register in [`PILOT_RECONCILIATION_LOG.md`](file:///c:/Users/HI/Desktop/APP/finance%20app/PILOT_RECONCILIATION_LOG.md).
   - Check that no customer or vendor account exhibits an unexplained negative balance.
   - Confirm unallocated payment receipts or advances match real unapplied funds.
3. **Daily Backup:**
   - Trigger snapshot backup via `BackupRestoreService` or automated cron script:
     ```bash
     curl -X POST http://localhost:5000/api/backups/create -H "Authorization: Bearer <TOKEN>"
     ```

---

## 6. Weekly Control Reconciliation

Every Friday or end-of-week:
1. Extract Trial Balance from both systems.
2. Extract AR and AP Aging summaries.
3. Reconcile Bank Statement transactions against cleared book balances.
4. Verify Output GST and Input Tax Credit balances.
5. Log any difference in the Weekly Worksheet of [`PILOT_RECONCILIATION_LOG.md`](file:///c:/Users/HI/Desktop/APP/finance%20app/PILOT_RECONCILIATION_LOG.md).

---

## 7. NAS Container & Storage Architecture

For Synology / QNAP / TrueNAS / Linux NAS deployments:

```yaml
version: '3.8'
services:
  firmbooks-db:
    image: postgres:15-alpine
    container_name: firmbooks_postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: firmbooks_pilot_db
      POSTGRES_USER: firmbooks_app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - /volume1/firmbooks_data/pgdata:/var/lib/postgresql/data
      - /volume1/firmbooks_backups:/backups
    ports:
      - "127.0.0.1:5432:5432"

  firmbooks-api:
    image: firmbooks:v1.0-pilot
    container_name: firmbooks_server
    restart: unless-stopped
    depends_on:
      - firmbooks-db
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://firmbooks_app:${DB_PASSWORD}@firmbooks-db:5432/firmbooks_pilot_db
      PORT: 5000
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - /volume1/firmbooks_data/attachments:/app/uploads
    ports:
      - "5000:5000"
```

### UPS & Power Handling:
- The NAS must be linked to an Uninterruptible Power Supply (UPS) via USB or SNMP.
- The NAS must be configured to trigger a graceful shutdown of Docker containers when battery falls below 20%.

---

## 8. Two-Cycle Parallel Pilot Roadmap

```
+-------------------------------------------------------------------------------------------+
|                               PARALLEL PILOT EXECUTION PHASES                             |
+-------------------------------------------------------------------------------------------+
|                                                                                           |
|  [PHASE 1: PREPARATION & OPENING RECONCILIATION]                                          |
|  * Clean Pilot DB provisioned & schema validated                                          |
|  * Master data cleaned & imported                                                         |
|  * Opening Trial Balance balanced to ₹0.00                                                 |
|  * Baseline backup created & verified                                                     |
|                                                                                           |
|  [PHASE 2: CYCLE 1 PARALLEL RUN (30 DAYS)]                                                |
|  * Daily dual-entry in Trusted Books & FirmBooks                                          |
|  * Daily transaction register tracking                                                    |
|  * Weekly control reconciliation                                                          |
|  * Month 1 closing: Balance Sheet & P&L comparison                                        |
|                                                                                           |
|  [PHASE 3: CYCLE 2 REFINEMENT & EDGE VALIDATION (30 DAYS)] [RECOMMENDED]                  |
|  * Month-to-month carryforward verification                                               |
|  * Historical period lock enforcement                                                     |
|  * Complex operations (credits, advances, refunds, write-offs)                            |
|  * Month 2 closing: Complete dual-cycle reconciliation                                    |
|                                                                                           |
|  [PHASE 4: FINAL EVALUATION & PRODUCTION CUTOVER]                                         |
|  * Author PILOT_CLOSING_REPORT.md                                                         |
|  * Stakeholder review & sign-off                                                          |
|  * Full Production Cutover                                                                |
|                                                                                           |
+-------------------------------------------------------------------------------------------+
```
