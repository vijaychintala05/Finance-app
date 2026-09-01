import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { BackupRestoreService, BackupPayload } from '../database/BackupRestoreService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';

describe('Gate 8: Backup Snapshot Integrity, Fingerprinting & Tamper Detection Suite', () => {
  const ORG_A = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const ORG_B = MASTER_FIXTURE_CONSTANTS.ORG_B.id;
  const CUST_A1 = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
  const VEND_A1 = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id;
  const CUST_B1 = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1.id;
  const VEND_B1 = MASTER_FIXTURE_CONSTANTS.VENDORS.B1.id;

  beforeEach(async () => {
    await MasterFinanceFixture.reset();

    // Create realistic financial data in ORG-A
    await MasterFinanceFixture.createStandardInvoice(ORG_A, {
      customerId: CUST_A1,
      customerName: 'Customer A1',
      issueDate: '2026-06-01',
      dueDate: '2026-06-30',
    });

    await MasterFinanceFixture.createStandardBill(ORG_A, {
      vendorId: VEND_A1,
      vendorName: 'Vendor A1',
      billDate: '2026-06-05',
      dueDate: '2026-07-05',
    });

    // Create distinct financial data in ORG-B
    await MasterFinanceFixture.createStandardInvoice(ORG_B, {
      customerId: CUST_B1,
      customerName: 'Customer B1',
      issueDate: '2026-06-10',
      dueDate: '2026-07-10',
    });
  });

  it('1. Creates comprehensive backup snapshot with verified SHA-256 checksum and metadata', async () => {
    const backupA = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');

    expect(backupA.metadata.id).toMatch(/^bkp[-_]/);
    expect(backupA.metadata.organizationId).toBe(ORG_A);
    expect(backupA.metadata.createdBy).toBe('usr-owner-a');
    expect(backupA.metadata.recordCount).toBeGreaterThan(0);
    expect(backupA.metadata.checksum).toHaveLength(64);

    // Verify calculated checksum matches payload data
    const verification = BackupRestoreService.verifyBackup(backupA);
    expect(verification.isValid).toBe(true);
    expect(verification.recordCount).toBe(backupA.metadata.recordCount);
  });

  it('2. Tamper Detection: Detects modified payload bytes and rejects corrupted backup', async () => {
    const backupA = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');

    // Create a deep copy and maliciously tamper with data
    const corruptedBackup: BackupPayload = JSON.parse(JSON.stringify(backupA));
    if (corruptedBackup.data.invoices && corruptedBackup.data.invoices.length > 0) {
      corruptedBackup.data.invoices[0].total_amount = 999999.99;
    }

    const verification = BackupRestoreService.verifyBackup(corruptedBackup);
    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('Checksum mismatch');

    // Verify original backup remains valid and untouched
    const originalVerification = BackupRestoreService.verifyBackup(backupA);
    expect(originalVerification.isValid).toBe(true);
  });

  it('3. Multi-Tenant Isolation: Backup for ORG-A strictly contains zero records from ORG-B', async () => {
    const backupA = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
    const backupB = await BackupRestoreService.createBackup(ORG_B, 'usr-owner-b');

    // Inspect all tables in ORG-A backup
    for (const [table, rows] of Object.entries(backupA.data)) {
      for (const row of rows) {
        if (row.organization_id) {
          expect(row.organization_id, `Table ${table} must strictly belong to ORG-A`).toBe(ORG_A);
        }
      }
    }

    // Inspect all tables in ORG-B backup
    for (const [table, rows] of Object.entries(backupB.data)) {
      for (const row of rows) {
        if (row.organization_id) {
          expect(row.organization_id, `Table ${table} must strictly belong to ORG-B`).toBe(ORG_B);
        }
      }
    }
  });

  it('4. Backup Listing & History: Backups are properly indexed in the backups table', async () => {
    await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
    await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');

    const history = await BackupRestoreService.listBackups(ORG_A);
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].organizationId).toBe(ORG_A);
    expect(history[0].checksum).toBeDefined();
  });

  it('5. Generates deterministic pre-backup recovery manifest with table counts and hashes', async () => {
    const backupA = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');

    const manifest: Record<string, { count: number; hash: string }> = {};
    for (const [table, rows] of Object.entries(backupA.data)) {
      manifest[table] = {
        count: rows.length,
        hash: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
      };
    }

    expect(manifest.invoices.count).toBeGreaterThan(0);
    expect(manifest.bills.count).toBeGreaterThan(0);
    expect(manifest.accounts.count).toBeGreaterThan(0);
    expect(manifest.customers.count).toBeGreaterThan(0);
  });
});
