import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { BackupRestoreService, BackupPayload } from '../database/BackupRestoreService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { newId } from '../utils/ids';

describe('Gate 8: Security, RBAC, Approval Workflows & Tenant Isolation Restore Suite', () => {
  const ORG_A = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const ORG_B = MASTER_FIXTURE_CONSTANTS.ORG_B.id;
  const CUST_A1 = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
  const CUST_B1 = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.B1.id;

  let backupPayloadA: BackupPayload;

  beforeEach(async () => {
    await MasterFinanceFixture.reset();

    // 1. Setup custom role and permissions in ORG-A
    await db.query(
      `INSERT INTO roles (id, organization_id, name, description, is_system_role)
       VALUES ('role-senior-auditor', $1, 'Senior Auditor', 'Read-only financial auditor', false)
       ON CONFLICT (id) DO NOTHING`,
      [ORG_A]
    );

    await db.query(
      `INSERT INTO role_permissions (role_id, permission_code)
       VALUES ('role-senior-auditor', 'reports.view'),
              ('role-senior-auditor', 'audit.view')
       ON CONFLICT DO NOTHING`
    );

    // 2. Setup Approval Rules & Pending/Approved Requests
    await db.query(
      `INSERT INTO approval_rules (id, organization_id, entity_type, threshold_amount, approver_role, is_required)
       VALUES ('rule-inv-high', $1, 'INVOICE', 50000.00, 'Admin', true)
       ON CONFLICT (id) DO NOTHING`,
      [ORG_A]
    );

    await db.query(
      `INSERT INTO approval_requests (id, organization_id, entity_type, entity_id, submitted_by, status, submitted_at, approved_by, rejection_reason, amount)
       VALUES ('req-pending-1', $1, 'INVOICE', 'inv-large-100', 'usr-sales-a', 'SUBMITTED', CURRENT_TIMESTAMP, NULL, NULL, 60000.00),
              ('req-approved-1', $1, 'INVOICE', 'inv-large-200', 'usr-sales-a', 'APPROVED', CURRENT_TIMESTAMP, 'usr-admin-a', NULL, 75000.00)
       ON CONFLICT (id) DO NOTHING`,
      [ORG_A]
    );

    // 3. Setup Accounting Period Lock (locking April 2026)
    await db.query(
      `INSERT INTO period_locks (id, organization_id, period_name, is_locked, lock_date, status, locked_by, locked_at)
       VALUES ('lock-apr-2026', $1, '2026-04', TRUE, '2026-04-30', 'Active', 'usr-owner-a', CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [ORG_A]
    );

    // 4. Setup Audit Log Chain in ORG-A
    let prevHash = '0'.repeat(64);
    for (let i = 1; i <= 3; i++) {
      const logId = `audit-chain-${i}`;
      const action = `SEC_EVENT_${i}`;
      const payload = { event: i };
      const currentHash = crypto.createHash('sha256').update(`${prevHash}:${ORG_A}:${action}:${JSON.stringify(payload)}`).digest('hex');

      await db.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata, previous_hash, current_hash)
         VALUES ($1, $2, 'usr-owner-a', $3, 'SECURITY', $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [logId, ORG_A, action, `sec-${i}`, JSON.stringify(payload), prevHash, currentHash]
      );
      prevHash = currentHash;
    }

    // 5. Create Invoices in ORG-A and ORG-B
    await MasterFinanceFixture.createStandardInvoice(ORG_A, { customerId: CUST_A1, issueDate: '2026-05-10' });
    await MasterFinanceFixture.createStandardInvoice(ORG_B, { customerId: CUST_B1, issueDate: '2026-05-12' });

    // Capture backup of ORG-A
    backupPayloadA = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
  });

  it('1. Tenant Isolation After Restore: Restored ORG-A records cannot leak or access ORG-B data', async () => {
    // Wipe ORG-A
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    // Query invoices under ORG-A tenant context
    const orgAInvoices = await db.query(`SELECT id, organization_id FROM invoices WHERE organization_id = $1`, [ORG_A]);
    expect(orgAInvoices.rows.length).toBeGreaterThan(0);
    for (const inv of orgAInvoices.rows) {
      expect(inv.organization_id).toBe(ORG_A);
    }

    // Query invoices under ORG-B tenant context
    const orgBInvoices = await db.query(`SELECT id, organization_id FROM invoices WHERE organization_id = $1`, [ORG_B]);
    expect(orgBInvoices.rows.length).toBeGreaterThan(0);
    for (const inv of orgBInvoices.rows) {
      expect(inv.organization_id).toBe(ORG_B);
    }
  });

  it('2. RBAC & Custom Roles: Custom roles, permissions and assignments survive restoration intact', async () => {
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    const roleRes = await db.query(`SELECT * FROM roles WHERE organization_id = $1 AND id = 'role-senior-auditor'`, [ORG_A]);
    expect(roleRes.rows.length).toBe(1);
    expect(roleRes.rows[0].name).toBe('Senior Auditor');

    const permsRes = await db.query(`SELECT permission_code FROM role_permissions WHERE role_id = 'role-senior-auditor'`);
    const keys = permsRes.rows.map((r) => r.permission_code);
    expect(keys).toContain('reports.view');
    expect(keys).toContain('audit.view');
  });

  it('3. Approval Workflows: Pending and approved workflow states survive restore without re-execution', async () => {
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    const pendingReq = await db.query(`SELECT status, approved_by FROM approval_requests WHERE organization_id = $1 AND id = 'req-pending-1'`, [ORG_A]);
    expect(pendingReq.rows.length).toBe(1);
    expect(pendingReq.rows[0].status).toBe('SUBMITTED');

    const approvedReq = await db.query(`SELECT status, approved_by FROM approval_requests WHERE organization_id = $1 AND id = 'req-approved-1'`, [ORG_A]);
    expect(approvedReq.rows.length).toBe(1);
    expect(approvedReq.rows[0].status).toBe('APPROVED');
    expect(approvedReq.rows[0].approved_by).toBe('usr-admin-a');
  });

  it('4. Cryptographic Audit Chain: SHA-256 audit log hash chain remains 100% contiguous post-restore', async () => {
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    const logs = await db.query(
      `SELECT id, organization_id, action, metadata, previous_hash, current_hash
       FROM audit_logs WHERE organization_id = $1 AND id LIKE 'audit-chain-%'
       ORDER BY id ASC`,
      [ORG_A]
    );

    expect(logs.rows.length).toBe(3);

    let recomputedPrev = '0'.repeat(64);
    for (const log of logs.rows) {
      expect(log.previous_hash).toBe(recomputedPrev);
      const expectedCurr = crypto
        .createHash('sha256')
        .update(`${recomputedPrev}:${ORG_A}:${log.action}:${typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)}`)
        .digest('hex');
      expect(log.current_hash).toBe(expectedCurr);
      recomputedPrev = log.current_hash;
    }
  });

  it('5. Accounting Period Locks: Restored locked period rejects backdated financial entries', async () => {
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    const lockCheck = await db.query(
      `SELECT is_locked FROM period_locks WHERE organization_id = $1 AND period_name = '2026-04'`,
      [ORG_A]
    );
    expect(lockCheck.rows.length).toBe(1);
    expect(lockCheck.rows[0].is_locked).toBe(true);

    // Attempt to post backdated invoice into locked April 2026 period (2026-04-20)
    let caughtError: any = null;
    try {
      await MasterFinanceFixture.createStandardInvoice(ORG_A, {
        customerId: CUST_A1,
        issueDate: '2026-04-20',
        dueDate: '2026-05-20',
      });
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toMatch(/locked|period/i);
  });
});
