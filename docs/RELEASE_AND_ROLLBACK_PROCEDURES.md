# FirmBooks Production Release, Rollback & Incident Response Standard Operating Procedures (SOP)

**Document Reference:** FB-OPS-SOP-2026-V1  
**Target Environment:** Production / Multi-Tenant Cloud / On-Premise Enterprise  
**Owner:** DevOps & Financial Engineering Systems Reliability Team  

---

## 1. Release Management & Staging Qualification Gate

Every release deployed to production must satisfy the following gates in staging:

### Pre-Deployment Qualification Checklist
- [ ] **CI Pipeline Green**: All GitHub Actions workflows (`Lint`, `Vitest Unit & Integration`, `Playwright E2E`, `Build`) pass.
- [ ] **Database Migration Dry-Run**: Run `MigrationRunner.runMigrations()` against staging snapshot with 0 errors.
- [ ] **Zero Unbalanced Entries**: `AccountantSignOffAuditService.conductSignOffAudit()` returns status `QUALIFIED`.
- [ ] **Production Hardening Verification**:
  - `isProduction()` strictly rejects `mock` payment gateway webhook requests.
  - CSV exports neutralize formula triggers (`=,+,-,@,\t,\r`).
  - RBAC policy blocks non-accounting roles from posting opening balances.
- [ ] **Load & Latency Compliance**: Sub-500ms p99 query latency on multi-year Trial Balance and P&L under realistic document volumes.

---

## 2. Zero-Downtime Deployment Strategy

FirmBooks uses blue/green deployment orchestration with backward-compatible schema migrations.

### Schema Migration Compatibility Rules
1. **Expand and Contract Pattern**:
   - **Step 1 (Expand)**: New columns must be added as `NULL` or with explicit defaults (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
   - **Step 2 (Deploy Code)**: Deploy code that writes to new columns while reading from old or fallback columns.
   - **Step 3 (Contract)**: In subsequent releases, drop deprecated columns after all active nodes run the latest version.
2. **Never Rename Columns Directly**: Renaming columns locks tables and breaks running app instances. Add a new column, backfill via idempotent background job, and deprecate old columns.
3. **Index Creation**: Always use `CREATE INDEX IF NOT EXISTS` concurrently to avoid table locks in PostgreSQL.

---

## 3. Rollback Procedures

### Trigger Conditions for Rollback
A rollback is mandatory if any of the following occur within 30 minutes of deployment:
- Error rate on `/api/v1/*` exceeds 0.5% for > 2 consecutive minutes.
- Unhandled HTTP 500 spikes or database connection pool exhaustion.
- Operational monitoring endpoint (`/api/v1/operational/monitoring`) flags `databaseConnected: false` or `unbalancedJournalsCount > 0`.
- Any tenant reports balance drift or subledger reconciliation discrepancy.

### Application Rollback
```bash
# 1. Revert container traffic to previous stable image tag
docker service update --image registry.firmbooks.internal/firmbooks:v1.0.9 firmbooks_api

# 2. Verify health of the rolled-back instances
curl -fsSL https://api.firmbooks.com/api/v1/operational/monitoring | jq .
```

### Database Rollback & Schema Reversal
- Backward migrations should only be run if schema migrations caused structural errors and the previous application version cannot operate.
- If data was written during the anomalous window:
  1. Engage Tenant Recovery Lock:
     ```sql
     INSERT INTO tenant_recovery_locks (organization_id, state, reason, locked_by)
     VALUES ('ALL', 'RECOVERING', 'Emergency Rollback Remediation', 'SRE_ONCALL');
     ```
  2. Restore to pre-deployment PostgreSQL WAL point-in-time recovery (PITR).
  3. Replay validated webhook events from idempotency logs.

---

## 4. Disaster Recovery & Tenant Restoration Drill

### Recovery Objectives
- **Recovery Time Objective (RTO)**: < 30 seconds for single-tenant hot recovery.
- **Recovery Point Objective (RPO)**: 0 seconds (zero data loss via synchronous WAL streaming).

### Tenant Recovery Steps
1. **Quarantine Tenant**:
   Activate `TenantRecoveryLockService.acquireLock(orgId, jobId, 'DRILL', 'Admin')`. This instantly blocks write mutations while allowing read access.
2. **Snapshot & Point-in-Time Restore**:
   Execute `BackupRestoreService.restoreOrganization(orgId, snapshotId)`.
3. **Integrity Validation**:
   Run `AccountingIntegrityService.verifyOrganizationIntegrity(orgId)`:
   - Ensure GL balanced.
   - Ensure AR & AP subledgers equal control accounts.
4. **Release Quarantine**:
   Invoke `TenantRecoveryLockService.releaseLock(orgId)`.

---

## 5. Incident Response SOP & Severity Matrix

| Severity | Definition | Target MTTA | Target MTTR | Escalation Path |
| :--- | :--- | :--- | :--- | :--- |
| **SEV-1** | Outage, data corruption, GL ledger imbalance, or tenant isolation breach. | < 5 mins | < 30 mins | Page VP Eng, Lead Architect, Lead Controller, On-Call SRE |
| **SEV-2** | Core feature degradation (e.g. invoice posting failure, payment webhook failures). | < 15 mins | < 2 hours | Page On-Call SRE, Module Lead |
| **SEV-3** | Non-critical bug or reporting latency degradation. | < 2 hours | < 24 hours | Jira Ticket, Eng Standup triage |
| **SEV-4** | Cosmetic UI defect or minor export formatting issue. | < 1 business day | Next Sprint | Product Backlog |

### SEV-1 Financial Incident Runbook
1. **Immediate Quarantine**: If ledger corruption is suspected, activate `TenantRecoveryLockService` for the affected tenant.
2. **Audit Extraction**: Query `audit_logs` for `action IN ('JOURNAL_POSTED', 'PAYMENT_RECEIVED', 'DOCUMENT_MUTATED')` filtered by transaction timestamp.
3. **Root Cause Analysis**: Inspect application logs for unhandled rejections or race conditions.
4. **Post-Mortem**: Publish blameless RCA within 48 hours covering timeline, root cause, preventative action items, and regression test additions.

---

## 6. Operational Telemetry & Monitoring Endpoints

FirmBooks exposes structured operational telemetry at:
```http
GET /api/v1/operational/monitoring
Authorization: Bearer <ADMIN_OR_AUDITOR_TOKEN>
```

### Metrics Monitored
- **System Health**: PostgreSQL connectivity, server uptime, heap memory usage.
- **Ledger Invariants**: Unbalanced journal entries count across all tenants.
- **Reconciliation Exceptions**: Open bank reconciliation discrepancies and anomaly flags.
- **Integration Reliability**: Payment gateway webhook failure rates and queue backlogs.
