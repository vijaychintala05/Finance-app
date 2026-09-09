import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecurityController } from '../controllers/securityController';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Approval authorization boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('forwards the authenticated role when rejecting an approval request', async () => {
    const reject = vi.spyOn(ApprovalWorkflowService, 'rejectRequestById').mockResolvedValue();
    const response = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as any;

    await SecurityController.rejectRequest({
      organizationId: 'org-approval-boundary',
      auth: { userId: 'usr-expense-approver', role: 'Expense Approver' },
      body: { approvalRequestId: 'app-req-123', reason: 'Receipt is incomplete' },
    } as any, response);

    expect(reject).toHaveBeenCalledWith(
      'org-approval-boundary',
      'app-req-123',
      { userId: 'usr-expense-approver', role: 'Expense Approver', organizationId: 'org-approval-boundary' },
      'Receipt is incomplete'
    );
    expect(response.json).toHaveBeenCalledWith({ message: 'Request rejected successfully' });
  });

  describe('submitted-request lifecycle', () => {
    const runId = Date.now().toString(36);
    const orgId = `org_apb_${runId}`;
    const ownerId = `usr_apb_${runId}`;

    beforeEach(async () => {
      db.initPgMem();
      await MigrationRunner.runMigrations();
      await db.query(
        `INSERT INTO users (id, email, password_hash, full_name, status)
         VALUES ($1, $2, 'hash', 'Approval Boundary Owner', 'Active')`,
        [ownerId, `${ownerId}@firmbooks.test`],
      );
      await db.query(
        `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
         VALUES ($1, $2, $3, 'APB', 'Approval Boundary Org', 'US', 'USD', '$', $4)`,
        [orgId, `uuid-${orgId}`, `pub-${orgId}`, ownerId],
      );
    });

    it('refuses approval or rejection when the document was never submitted', async () => {
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, 'req-nonexistent', { userId: ownerId, role: 'Owner' }),
      ).rejects.toThrow(/APPROVAL_REQUEST_NOT_FOUND/);

      await expect(
        ApprovalWorkflowService.rejectRequestById(orgId, 'req-nonexistent', { userId: ownerId, role: 'Owner' }, 'Missing supporting evidence'),
      ).rejects.toThrow(/APPROVAL_REQUEST_NOT_FOUND/);
    });

    it('rejects a cross-domain approver before changing a submitted request', async () => {
      const request = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'PAYMENT',
        'payment-awaiting-finance-approval',
        'usr-submitter',
        5000,
      );

      await expect(
        ApprovalWorkflowService.rejectRequestById(
          orgId,
          request.id,
          { userId: 'usr-expense-approver', role: 'Expense Approver' },
          'Expense documentation is incomplete',
        ),
      ).rejects.toThrow(/not authorized to reject PAYMENT/i);

      const persisted = await db.query(
        `SELECT status FROM approval_requests WHERE organization_id = $1 AND id = $2`,
        [orgId, request.id],
      );
      expect(persisted.rows[0].status).toBe('SUBMITTED');
    });
  });
});
