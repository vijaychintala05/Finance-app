import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { RbacService } from '../auth/RbacService';
import { AuditTrailService } from '../security/AuditTrailService';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { BackupRestoreService } from '../database/BackupRestoreService';
import { DataExportService } from '../services/DataExportService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { SessionSecurity } from '../auth/SessionSecurity';

const ORG_A = 'ORG-2026-PRIMARY';
const ORG_B = 'ORG-TEST-SEC-B';
const USER_OWNER = 'usr-owner-101';
const USER_SALES = 'usr-sales-102';
const USER_VIEWER = 'usr-viewer-103';

describe('Phase 7 — Security, Roles, Audit Trail, Backup & Production Hardening', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Setup Test Organizations and Members
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
      [ORG_A, 'uuid-org-a', 'PUB-ORG-A', 'ORG-01', 'FirmBooks Core Org', 'Accounting', 'United States', 'USD', USER_OWNER]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
      [ORG_B, 'uuid-org-b', 'PUB-ORG-B', 'ORG-02', 'Isolated Partner Org', 'Finance', 'United States', 'USD', 'usr-owner-org-b']
    );

    // Organization Memberships with granular roles
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      ['mem-owner-1', ORG_A, USER_OWNER, 'Owner']
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      ['mem-sales-1', ORG_A, USER_SALES, 'Sales']
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      ['mem-viewer-1', ORG_A, USER_VIEWER, 'Viewer']
    );
  });

  describe('1. RBAC & Granular Role Permissions Matrix', () => {
    it('verifies RbacService permission resolution for standard roles', () => {
      const viewerPerms = RbacService.getPermissionsForRole('Viewer');
      expect(viewerPerms).toContain('invoices.view');
      expect(viewerPerms).not.toContain('invoices.create');
      expect(viewerPerms).not.toContain('settings.backup');

      const salesPerms = RbacService.getPermissionsForRole('Sales');
      expect(salesPerms).toContain('invoices.create');
      expect(salesPerms).not.toContain('settings.manage_users');

      const accountantPerms = RbacService.getPermissionsForRole('Accountant');
      expect(accountantPerms).toContain('settings.close_period');
      expect(accountantPerms).not.toContain('settings.manage_users');

      const ownerPerms = RbacService.getPermissionsForRole('Owner');
      expect(ownerPerms).toContain('settings.manage_users');
      expect(ownerPerms).toContain('settings.backup');
    });

    it('enforces RBAC permission boundaries via middleware (Viewer cannot trigger backup)', async () => {
      const res = await request(app)
        .post('/api/v1/security/backup')
        .set('x-user-id', USER_VIEWER)
        .set('x-organization-id', ORG_A);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden: Missing required permission');
    });

    it('allows Owner to trigger backup endpoint', async () => {
      const res = await request(app)
        .post('/api/v1/security/backup')
        .set('x-user-id', USER_OWNER)
        .set('x-organization-id', ORG_A);

      expect(res.status).toBe(201);
      expect(res.body.backup).toBeDefined();
      expect(res.body.backup.metadata.checksum).toBeDefined();
    });
  });

  describe('2. Multi-Tenant Organization Isolation & Cross-Tenant Security', () => {
    it('prevents user from accessing organization they are not a member of', async () => {
      const res = await request(app)
        .get('/api/v1/security/audit-logs')
        .set('x-user-id', USER_SALES)
        .set('x-organization-id', ORG_B);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden: You do not have access to the requested organization');
    });
  });

  describe('3. Audit Trail Service & Immutability Safeguards', () => {
    it('creates immutable audit logs and retrieves them with filters', async () => {
      const logEntry = await AuditTrailService.logAction({
        organizationId: ORG_A,
        userId: USER_OWNER,
        action: 'PERIOD_CLOSED',
        entityType: 'PERIOD_LOCK',
        entityId: 'lock-2026-Q1',
        afterState: { year: 2026, month: 3, lockedBy: USER_OWNER },
      });

      expect(logEntry.id).toBeDefined();
      expect(logEntry.action).toBe('PERIOD_CLOSED');

      const logs = await AuditTrailService.getAuditLogs(ORG_A, { entityType: 'PERIOD_LOCK' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].entityType).toBe('PERIOD_LOCK');
    });

    it('rejects attempts to edit or delete audit trail logs (immutability rule)', async () => {
      await expect(
        AuditTrailService.verifyImmutability(ORG_A, 'aud-any-id')
      ).rejects.toThrow('Audit log records are immutable');
    });
  });

  describe('4. Configurable Approval Workflows', () => {
    it('configures an approval rule and enforces approval requirements', async () => {
      await ApprovalWorkflowService.configureApprovalRule(ORG_A, {
        entityType: 'PAYMENT',
        isRequired: true,
        thresholdAmount: 10000,
        approverRole: 'Admin',
        userId: USER_OWNER,
      });

      const smallPayReq = await ApprovalWorkflowService.requiresApproval(ORG_A, 'PAYMENT', 5000);
      expect(smallPayReq).toBe(false);

      const largePayReq = await ApprovalWorkflowService.requiresApproval(ORG_A, 'PAYMENT', 25000);
      expect(largePayReq).toBe(true);
    });

    it('submits, rejects unauthorized approver, and completes approval with authorized role', async () => {
      const reqSubmitted = await ApprovalWorkflowService.submitForApproval(
        ORG_A,
        'PAYMENT',
        'pay-ref-999',
        USER_SALES,
        30000
      );
      expect(reqSubmitted.status).toBe('SUBMITTED');

      // Viewer cannot approve
      await expect(
        ApprovalWorkflowService.approveRequest(ORG_A, 'PAYMENT', 'pay-ref-999', USER_VIEWER, 'Viewer')
      ).rejects.toThrow('is not authorized to approve');

      // Owner can approve
      const approved = await ApprovalWorkflowService.approveRequest(
        ORG_A,
        'PAYMENT',
        'pay-ref-999',
        USER_OWNER,
        'Owner'
      );
      expect(approved.status).toBe('APPROVED');
    });
  });

  describe('5. Backup, SHA256 Checksum Verification & Transactional Restore', () => {
    it('detects checksum tampering in backup payloads', async () => {
      const backup = await BackupRestoreService.createBackup(ORG_A, USER_OWNER);
      expect(BackupRestoreService.verifyBackup(backup).isValid).toBe(true);

      // Tamper with data
      const tampered = JSON.parse(JSON.stringify(backup));
      tampered.data.accounts = [{ id: 'fake-acc', name: 'Tampered Account' }];

      const verification = BackupRestoreService.verifyBackup(tampered);
      expect(verification.isValid).toBe(false);
      expect(verification.error).toContain('Checksum mismatch');
    });

    it('executes atomic transactional restoration from valid backup payload', async () => {
      const backup = await BackupRestoreService.createBackup(ORG_A, USER_OWNER);
      const restoreResult = await BackupRestoreService.restoreBackup(ORG_A, backup, USER_OWNER);

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.restoredRecords).toBeGreaterThanOrEqual(0);
    });
  });

  describe('6. Production Database Safety & Memory Fallback Restrictions', () => {
    it('prohibits in-memory database fallback when NODE_ENV is production', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalUsePgMem = process.env.USE_PG_MEM;

      try {
        process.env.NODE_ENV = 'production';
        delete process.env.USE_PG_MEM;

        expect(db.isMemoryAllowed()).toBe(false);
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalUsePgMem) process.env.USE_PG_MEM = originalUsePgMem;
      }
    });
  });

  describe('7. Session Security, Password Validation & Rate Limiting', () => {
    it('validates password strength and hashes passwords securely', async () => {
      await expect(SessionSecurity.hashPassword('short')).rejects.toThrow('at least 8 characters');

      const hash = await SessionSecurity.hashPassword('SecurePass123!');
      expect(await SessionSecurity.verifyPassword('SecurePass123!', hash)).toBe(true);
      expect(await SessionSecurity.verifyPassword('WrongPass', hash)).toBe(false);
    });

    it('enforces brute force rate limiting after consecutive failed login attempts', () => {
      const key = 'test-ip-127.0.0.1';
      SessionSecurity.clearRateLimit(key);

      for (let i = 0; i < 5; i++) {
        SessionSecurity.recordFailedAttempt(key);
      }

      const status = SessionSecurity.checkRateLimit(key);
      expect(status.allowed).toBe(false);
      expect(status.attempts).toBe(5);
      expect(status.lockoutSecondsRemaining).toBeGreaterThan(0);

      SessionSecurity.clearRateLimit(key);
    });
  });

  describe('8. Safe Destructive Financial Actions (Void & Reversals)', () => {
    it('safely voids an invoice, updates balance due to 0, and posts reversing journal entry', async () => {
      const invId = `inv-test-void-${Date.now()}`;
      await db.query(
        `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_name, issue_date, due_date, status, total_amount, balance_due)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [invId, ORG_A, 'INV-VOID-01', 'cust-01', 'Test Client Inc', '2026-03-01', '2026-03-15', 'Unpaid', 1200.00, 1200.00]
      );

      const voidResult = await FinancialDestructiveActionsService.voidInvoice(
        ORG_A,
        invId,
        USER_OWNER,
        'Customer cancelled project before delivery'
      );

      expect(voidResult.success).toBe(true);
      expect(voidResult.journalEntryId).toBeDefined();

      const invCheck = await db.query('SELECT status, balance_due FROM invoices WHERE id = $1', [invId]);
      expect(invCheck.rows[0].status).toBe('VOID');
      expect(Number(invCheck.rows[0].balance_due)).toBe(0);
    });

    it('safely reverses a journal entry by swapping debits and credits', async () => {
      const jeId = `je-test-rev-${Date.now()}`;
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [jeId, ORG_A, 'JE-TEST-100', '2026-03-01', 'REF-100', 'Original Manual Entry', 'Posted']
      );

      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`jl-1-${jeId}`, jeId, 'acc-cash', '1010', 'Cash', 500.00, 0.00]
      );

      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`jl-2-${jeId}`, jeId, 'acc-rev', '4010', 'Sales Revenue', 0.00, 500.00]
      );

      const revResult = await FinancialDestructiveActionsService.reverseJournalEntry(
        ORG_A,
        jeId,
        USER_OWNER,
        'Correction of improper classification'
      );

      expect(revResult.success).toBe(true);
      expect(revResult.reversingId).toBeDefined();

      const jeCheck = await db.query('SELECT status FROM journal_entries WHERE id = $1', [jeId]);
      expect(jeCheck.rows[0].status).toBe('REVERSED');

      const revLines = await db.query('SELECT * FROM journal_lines WHERE journal_entry_id = $1', [revResult.reversingId]);
      expect(revLines.rows.length).toBe(2);
      // Verify swapped debits and credits
      const cashRevLine = revLines.rows.find((l) => l.account_code === '1010');
      expect(Number(cashRevLine.credit)).toBe(500.00);
      expect(Number(cashRevLine.debit)).toBe(0.00);
    });
  });

  describe('9. Data Export Bundle Service', () => {
    it('generates a complete organization data export bundle', async () => {
      const bundle = await DataExportService.exportOrganizationBundle(ORG_A, USER_OWNER);
      expect(bundle.organizationId).toBe(ORG_A);
      expect(bundle.exportDate).toBeDefined();
      expect(Array.isArray(bundle.chartOfAccounts)).toBe(true);
      expect(Array.isArray(bundle.invoices)).toBe(true);
      expect(Array.isArray(bundle.auditLogs)).toBe(true);
    });
  });
});
