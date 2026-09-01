# FirmBooks Disaster Recovery Runbook

## Standard Operating Procedures for Catastrophic Recovery & Hardware Rebuild

---

## 1. Overview & Recovery Scenarios

This runbook defines the exact step-by-step procedures for recovering FirmBooks across four primary disaster scenarios:

1. **Database Corruption / Data Loss**: Relational state is damaged or accidentally deleted.
2. **Hardware / NAS Disk Failure**: Physical server or NAS volume fails completely.
3. **Application Upgrade Failure**: Schema migration or version update encounters critical errors.
4. **Accidental Deletion / Operator Error**: Critical records or periods deleted mistakenly.

---

## 2. Emergency Recovery Checklist

### Prerequisites
- Access to the latest backup artifact (`.json` snapshot or `.sealed.json` Point-1 package).
- PostgreSQL database access with administrative privileges.
- Application secrets: `JWT_SECRET`, `RECOVERY_ENCRYPTION_KEY_BASE64`, `RECOVERY_HMAC_KEY_BASE64` (from secure key vault).

---

## 3. Standard Recovery Procedures

### Scenario A: Database Corruption (Restore into Clean Database)

```bash
# Step 1: Stop the FirmBooks application container to prevent incoming writes
docker stop firmbooks-app

# Step 2: Create a fresh, empty PostgreSQL database
psql -U postgres -h localhost -c "DROP DATABASE IF EXISTS firmbooks_corrupt;"
psql -U postgres -h localhost -c "ALTER DATABASE firmbooks RENAME TO firmbooks_corrupt;"
psql -U postgres -h localhost -c "CREATE DATABASE firmbooks WITH OWNER firmbooks_user ENCODING 'UTF8';"

# Step 3: Run schema migrations to bootstrap pristine DDL structure
export DATABASE_URL="postgresql://firmbooks_user:secure_password@localhost:5432/firmbooks"
node dist/index.js --migrate-only

# Step 4: Execute BackupRestoreService restoration script
node scripts/restoreBackup.js --orgId "org-acme-ap" --backupFile "/backups/backup-latest.json"

# Step 5: Run Automated Financial Integrity Validation
node scripts/verifyIntegrity.js --orgId "org-acme-ap"

# Step 6: Restart FirmBooks application
docker start firmbooks-app
```

---

### Scenario B: Replacement Hardware / Total NAS Rebuild

```bash
# Step 1: Provision clean OS & Docker / Node.js runtime environment on replacement hardware

# Step 2: Restore application environment configuration and secrets
cat <<EOF > .env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://firmbooks_user:secure_password@postgres:5432/firmbooks
JWT_SECRET=[RESTORED_FROM_SECRETS_VAULT]
RECOVERY_ENCRYPTION_KEY_BASE64=[RESTORED_FROM_SECRETS_VAULT]
RECOVERY_HMAC_KEY_BASE64=[RESTORED_FROM_SECRETS_VAULT]
TRUSTED_FINANCE_FEATURES=recovery-center,recurring-transactions
EOF

# Step 3: Restore physical attachment volume from off-device backup
rsync -avz /external-backup/firmbooks/attachments/ /var/lib/firmbooks/attachments/

# Step 4: Start PostgreSQL database container
docker compose up -d postgres

# Step 5: Execute database bootstrap and restoration
docker compose run --rm firmbooks-app npm run db:migrate
docker compose run --rm firmbooks-app node scripts/restoreBackup.js --all --dir /external-backup/firmbooks/backups/

# Step 6: Start all services and verify web dashboard access
docker compose up -d
curl -I http://localhost:5000/health
```

---

### Scenario C: Rollback Failed Restore / Migration

```text
[Failed Staging / Broken Migration]
       │
       ▼
1. Abort transaction immediately (Point-1 staging namespaces prevent live corruption).
2. Clean up staging namespace:
   `DELETE FROM recovery_jobs WHERE status = 'FAILED' AND created_at < NOW() - INTERVAL '1 hour';`
3. If primary database was partially modified, restore from the pre-upgrade snapshot.
4. Verify historical financial totals match pre-upgrade values:
   `node scripts/verifyIntegrity.js --orgId "TARGET_ORG"`
```

---

## 4. Post-Restore Verification Checklist

After every restoration, perform the following verification steps:

- [ ] **Authentication**: Owner and standard users can log in successfully.
- [ ] **Trial Balance**: $\sum \text{Debits} \equiv \sum \text{Credits}$ with **₹0.00 difference**.
- [ ] **Balance Sheet**: $\text{Assets} \equiv \text{Liabilities} + \text{Equity}$ with **₹0.00 difference**.
- [ ] **Subledgers**: AR subledger agrees with account `1100`; AP subledger agrees with account `2000`.
- [ ] **Bank Balances**: Match reconciled statement balances.
- [ ] **Period Locks**: Historical locked periods reject new entries with error: `PERIOD_LOCKED`.
- [ ] **Audit Logs**: Cryptographic SHA-256 hash chains verify continuously from genesis to head.
- [ ] **Operational Test**: Create a test draft invoice or journal to verify sequence increment and database writes.

---

## 5. Recommended Backup Policy

1. **Daily Automated Full Snapshots**: Run at 01:00 UTC daily via cron/scheduler.
2. **Multi-Generation Retention**:
   - Keep 7 daily snapshots.
   - Keep 4 weekly snapshots.
   - Keep 12 monthly snapshots.
3. **Off-Device Copying**: Replicate snapshots and attachment volumes to a separate physical drive or secure local storage server.
4. **Quarterly Restore Drill**: Perform a full clean-instance restore drill every 90 days into an isolated staging container.
