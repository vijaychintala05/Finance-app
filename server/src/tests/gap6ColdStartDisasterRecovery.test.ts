import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BackupRestoreService } from '../database/BackupRestoreService';

describe('Gap 6: Zero-State Cold Start & Disaster Recovery Rehearsal', () => {
  const ORG_ID = 'org-gap6-coldstart';
  const USER_ID = 'usr-gap6-admin';

  beforeEach(async () => {
    db.initPgMem();
  });

  it('1. Executes zero-state cold start database initialization and verifies health status', async () => {
    // Before migrations, database is empty
    const initCheck = await db.checkHealth();
    expect(initCheck.isConnected).toBe(true);

    // Run complete enterprise schema migration from scratch
    await MigrationRunner.runMigrations();

    const isCurrent = await MigrationRunner.isCurrent();
    expect(isCurrent).toBe(true);
  });

  it('2. Creates verifiable snapshot with SHA-256 checksum and executes full restore drill', async () => {
    await MigrationRunner.runMigrations();

    // 1. Seed user and organization
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'dr@firmbooks.test', 'hashed_pass', 'DR Officer', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-gap6', 'pub-gap6', 'GAP6', 'ColdStart Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // 2. Seed accounts
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ('acc-gap6-bank', $1, '1010', 'Disaster Vault Bank', 'Asset', 'Bank', 250000.00, 'Active'),
         ('acc-gap6-rev', $1, '4000', 'Enterprise Operations', 'Revenue', 'OperatingRevenue', 0.00, 'Active')
       ON CONFLICT DO NOTHING`,
      [ORG_ID]
    );

    // 3. Seed customer
    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, currency, active)
       VALUES ('cust-gap6-1', $1, 'CUST-DR-1', 'Resilient Corp', 'Resilient Corp Ltd', 'INR', true)
       ON CONFLICT DO NOTHING`,
      [ORG_ID]
    );

    // 4. Create snapshot
    const backup = await BackupRestoreService.createBackup(ORG_ID, USER_ID);
    expect(backup.metadata.checksum).toBeDefined();
    expect(backup.metadata.organizationId).toBe(ORG_ID);

    const verification = BackupRestoreService.verifyBackup(backup);
    expect(verification.isValid).toBe(true);

    // 5. Simulate disaster: Wipe accounts and customers
    await db.query(`DELETE FROM accounts WHERE organization_id = $1`, [ORG_ID]);
    await db.query(`DELETE FROM customers WHERE organization_id = $1`, [ORG_ID]);

    const accCountBefore = await db.query(`SELECT COUNT(*) AS total FROM accounts WHERE organization_id = $1`, [ORG_ID]);
    expect(Number(accCountBefore.rows[0].total)).toBe(0);

    // 6. Restore from snapshot
    const restoreResult = await BackupRestoreService.restoreBackup(ORG_ID, backup, USER_ID);
    expect(restoreResult.success).toBe(true);

    // 7. Verify post-restore parity
    const accCountAfter = await db.query(`SELECT COUNT(*) AS total FROM accounts WHERE organization_id = $1`, [ORG_ID]);
    const custCountAfter = await db.query(`SELECT COUNT(*) AS total FROM customers WHERE organization_id = $1`, [ORG_ID]);

    expect(Number(accCountAfter.rows[0].total)).toBeGreaterThanOrEqual(2);
    expect(Number(custCountAfter.rows[0].total)).toBe(1);
  });

  it('3. Rejects tampered backup snapshots failing cryptographic integrity verification', async () => {
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'dr2@firmbooks.test', 'hashed_pass', 'DR Officer 2', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-gap6-2', 'pub-gap6-2', 'GAP6B', 'ColdStart Org B', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    const backup = await BackupRestoreService.createBackup(ORG_ID, USER_ID);

    // Tamper with data without recomputing checksum
    backup.data.accounts = [{ id: 'tampered-acc', organization_id: ORG_ID, name: 'Hacked' }];

    await expect(
      BackupRestoreService.restoreBackup(ORG_ID, backup, USER_ID)
    ).rejects.toThrow(/Backup verification failed/i);
  });
});
