import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { ApprovalWorkflowService, ApprovalEntityType } from '../approvals/ApprovalWorkflowService';
import { SecurityController } from '../controllers/securityController';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ManualJournalService } from '../services/ManualJournalService';
import { ExpensePostingService } from '../services/ExpensePostingService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { newId } from '../utils/ids';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';

describe('Stage 2: Repair Approvals & Separation of Duties', () => {
  let orgId: string;
  let ownerId: string;
  const submitterId = 'usr-stage2-submitter';
  const approverFinanceId = 'usr-stage2-finmgr';
  const approverBillingId = 'usr-stage2-billmgr';
  const unauthorizedClerkId = 'usr-stage2-clerk';

  beforeEach(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
    orgId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
    ownerId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;

    // Seed test personas with distinct roles for separation-of-duties verification
    const users = [
      { id: submitterId, email: 'submitter@stage2.org', name: 'Stage 2 Submitter', role: 'Finance Manager' },
      { id: approverFinanceId, email: 'finmgr@stage2.org', name: 'Finance Approver', role: 'Finance Manager' },
      { id: approverBillingId, email: 'billmgr@stage2.org', name: 'Billing Approver', role: 'Billing Manager' },
      { id: unauthorizedClerkId, email: 'clerk@stage2.org', name: 'Clerk User', role: 'Clerk' },
    ];
    for (const u of users) {
      await db.query(
        `INSERT INTO users (id, email, password_hash, full_name, status)
         VALUES ($1, $2, 'hash', $3, 'Active')
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.email, u.name]
      );
      await db.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at)
         VALUES ($1, $2, $3, $4, 'Active', NOW())
         ON CONFLICT DO NOTHING`,
        [newId('mem'), orgId, u.id, u.role]
      );
    }
  });

  // ===========================================================================
  // 1. ENDPOINT ACCEPTANCE OF IMMUTABLE approvalRequestId
  // ===========================================================================
  describe('1. Immutable approvalRequestId Endpoints', () => {
    it('accepts approval and rejection via immutable approvalRequestId', async () => {
      // Configure rule requiring approval
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'INVOICE',
        isRequired: true,
        thresholdAmount: 1000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      // Submit an approval request
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'INVOICE',
        'inv-mock-001',
        submitterId,
        5000
      );
      expect(req.id).toBeDefined();
      expect(req.status).toBe('SUBMITTED');

      // Test SecurityController.approveRequest with approvalRequestId in params
      let approveOutput: any;
      await SecurityController.approveRequest(
        {
          organizationId: orgId,
          params: { approvalRequestId: req.id },
          auth: { userId: approverFinanceId, role: 'Finance Manager' },
        } as any,
        {
          json: (data: any) => { approveOutput = data; },
          status: (code: number) => ({ json: (d: any) => { approveOutput = { code, ...d }; } }),
        } as any
      );

      expect(approveOutput?.request?.status).toBe('APPROVED');
      expect(approveOutput?.request?.approvedBy).toBe(approverFinanceId);

      // Verify DB row was updated to APPROVED with audit trail
      const dbReq = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(dbReq.rows[0].status).toBe('APPROVED');
      expect(dbReq.rows[0].approved_by).toBe(approverFinanceId);

      const audit = await db.query(
        "SELECT * FROM audit_logs WHERE entity_id = 'inv-mock-001' AND action = 'APPROVAL_GRANTED'"
      );
      expect(audit.rows.length).toBeGreaterThan(0);
    });

    it('universally rejects approval/rejection calls when approvalRequestId is missing, even if entityType and entityId are supplied', async () => {
      // 1. Calling approveRequest with empty params & body -> 400
      let approveError: any;
      await SecurityController.approveRequest(
        {
          organizationId: orgId,
          params: {},
          body: {},
          auth: { userId: approverFinanceId, role: 'Finance Manager' },
        } as any,
        {
          status: (code: number) => ({
            json: (err: any) => { approveError = { code, ...err }; },
          }),
          json: (d: any) => { approveError = d; },
        } as any
      );
      expect(approveError?.code).toBe(400);
      expect(approveError?.error).toContain('MISSING_APPROVAL_REQUEST_ID');

      // 2. Calling approveRequest with legacy entityType + entityId -> MUST STILL FAIL with 400 MISSING_APPROVAL_REQUEST_ID
      let legacyApproveError: any;
      await SecurityController.approveRequest(
        {
          organizationId: orgId,
          params: {},
          body: { entityType: 'INVOICE', entityId: 'inv-legacy-999' },
          auth: { userId: approverFinanceId, role: 'Finance Manager' },
        } as any,
        {
          status: (code: number) => ({
            json: (err: any) => { legacyApproveError = { code, ...err }; },
          }),
          json: (d: any) => { legacyApproveError = d; },
        } as any
      );
      expect(legacyApproveError?.code).toBe(400);
      expect(legacyApproveError?.error).toContain('MISSING_APPROVAL_REQUEST_ID');

      // 3. Calling rejectRequest with legacy entityType + entityId -> MUST STILL FAIL with 400 MISSING_APPROVAL_REQUEST_ID
      let legacyRejectError: any;
      await SecurityController.rejectRequest(
        {
          organizationId: orgId,
          params: {},
          body: { entityType: 'INVOICE', entityId: 'inv-legacy-999', reason: 'Invalid invoice' },
          auth: { userId: approverFinanceId, role: 'Finance Manager' },
        } as any,
        {
          status: (code: number) => ({
            json: (err: any) => { legacyRejectError = { code, ...err }; },
          }),
          json: (d: any) => { legacyRejectError = d; },
        } as any
      );
      expect(legacyRejectError?.code).toBe(400);
      expect(legacyRejectError?.error).toContain('MISSING_APPROVAL_REQUEST_ID');
    });

    it('forwards rejection reason and records rejection audit via approvalRequestId', async () => {
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'VENDOR_BILL',
        'bill-mock-reject',
        submitterId,
        15000
      );

      let rejectOutput: any;
      await SecurityController.rejectRequest(
        {
          organizationId: orgId,
          params: { approvalRequestId: req.id },
          body: { reason: 'Incorrect line items and vendor tax ID missing' },
          auth: { userId: approverFinanceId, role: 'Finance Manager' },
        } as any,
        {
          json: (data: any) => { rejectOutput = data; },
          status: (code: number) => ({ json: (d: any) => { rejectOutput = { code, ...d }; } }),
        } as any
      );

      expect(rejectOutput?.message).toBe('Request rejected successfully');

      const dbReq = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(dbReq.rows[0].status).toBe('REJECTED');
      expect(dbReq.rows[0].rejection_reason).toBe('Incorrect line items and vendor tax ID missing');
    });
  });

  // ===========================================================================
  // 2. ZERO AUTO-CREATION OF APPROVED REQUESTS (REQUIREMENT 3)
  // ===========================================================================
  describe('2. Zero Auto-Creation of APPROVED Requests', () => {
    it('strictly refuses approval or rejection for unsubmitted documents', async () => {
      // Attempting to approve by a non-existent approvalRequestId throws APPROVAL_REQUEST_NOT_FOUND
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, 'req-non-existent-999', {
          userId: approverFinanceId,
          role: 'Finance Manager',
        })
      ).rejects.toThrow(/APPROVAL_REQUEST_NOT_FOUND/);
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, 'req-non-existent', {
          userId: approverFinanceId,
          role: 'Finance Manager',
        })
      ).rejects.toThrow(/APPROVAL_REQUEST_NOT_FOUND/);

      // Ensure no phantom APPROVED request was created in the database
      const allReqs = await db.query('SELECT * FROM approval_requests WHERE organization_id = $1', [orgId]);
      expect(allReqs.rows).toHaveLength(0);
    });

    it('enforces single state transition: cannot approve already approved or rejected request', async () => {
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'EXPENSE',
        'exp-double-approve',
        submitterId,
        3000
      );

      // First approval succeeds
      await ApprovalWorkflowService.approveRequestById(orgId, req.id, {
        userId: approverFinanceId,
        role: 'Finance Manager',
      });

      // Second approval attempt fails with state machine error
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: approverFinanceId,
          role: 'Finance Manager',
        })
      ).rejects.toThrow(/already been approved/i);

      // Rejection after approval is rejected
      await expect(
        ApprovalWorkflowService.rejectRequestById(
          orgId,
          req.id,
          { userId: approverFinanceId, role: 'Finance Manager' },
          'Cannot reject post-approval'
        )
      ).rejects.toThrow(/Cannot reject a request that has already been approved/i);
    });
  });

  // ===========================================================================
  // 3. SEPARATION OF DUTIES & SELF-APPROVAL PROHIBITION (REQUIREMENTS 4 & EXIT GATE)
  // ===========================================================================
  describe('3. Separation of Duties & Self-Approval Prevention', () => {
    it('strictly forbids self-approval when allowSelfApproval = false, even for Organization Owner', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'MANUAL_JOURNAL',
        isRequired: true,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      // Owner submits a journal request
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'MANUAL_JOURNAL',
        'mj-self-test',
        ownerId,
        25000
      );

      // Owner without Finance Manager role cannot approve (Owner does not bypass configured approverRole)
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: ownerId,
          role: 'Owner',
        })
      ).rejects.toThrow(/not authorized to approve/i);

      // Owner even when holding Finance Manager role cannot self-approve
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: ownerId,
          role: 'Finance Manager',
        })
      ).rejects.toThrow(/Self-approval forbidden/i);

      // Submitter attempts to self-approve with Finance Manager role
      const req2 = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'MANUAL_JOURNAL',
        'mj-self-test-2',
        submitterId,
        15000
      );
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req2.id, {
          userId: submitterId,
          role: 'Finance Manager',
        })
      ).rejects.toThrow(/Self-approval forbidden/i);

      // Distinct qualified approver succeeds
      const approved = await ApprovalWorkflowService.approveRequestById(orgId, req2.id, {
        userId: approverFinanceId,
        role: 'Finance Manager',
      });
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedBy).toBe(approverFinanceId);
    });

    it('permits self-approval when explicitly configured with allowSelfApproval = true', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'CUSTOMER_PAYMENT',
        isRequired: true,
        approverRole: 'Finance Manager',
        allowSelfApproval: true,
        userId: ownerId,
      });

      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'CUSTOMER_PAYMENT',
        'pay-self-ok',
        submitterId,
        8000
      );

      const approved = await ApprovalWorkflowService.approveRequestById(orgId, req.id, {
        userId: submitterId,
        role: 'Finance Manager',
      });
      expect(approved.status).toBe('APPROVED');
    });

    it('rejects unauthorized roles from approving or rejecting', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'PAYMENT',
        isRequired: true,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'PAYMENT',
        'vdr-pay-role-test',
        submitterId,
        12000
      );

      // Clerk tries to approve
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: unauthorizedClerkId,
          role: 'Clerk',
        })
      ).rejects.toThrow(/not authorized to approve/i);

      // Clerk tries to reject
      await expect(
        ApprovalWorkflowService.rejectRequestById(
          orgId,
          req.id,
          { userId: unauthorizedClerkId, role: 'Clerk' },
          'No authority'
        )
      ).rejects.toThrow(/not authorized to reject/i);

      // Owner tries to approve when Finance Manager is required -> fails
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: ownerId,
          role: 'Owner',
        })
      ).rejects.toThrow(/not authorized to approve/i);

      // Admin tries to approve when Finance Manager is required -> fails
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: 'usr-admin-1',
          role: 'Admin',
        })
      ).rejects.toThrow(/not authorized to approve/i);

      // Owner tries to reject when Finance Manager is required -> fails
      await expect(
        ApprovalWorkflowService.rejectRequestById(orgId, req.id, {
          userId: ownerId,
          role: 'Owner',
        }, 'Unauthorized reject')
      ).rejects.toThrow(/not authorized to reject/i);

      // Admin tries to reject when Finance Manager is required -> fails
      await expect(
        ApprovalWorkflowService.rejectRequestById(orgId, req.id, {
          userId: 'usr-admin-1',
          role: 'Admin',
        }, 'Unauthorized reject')
      ).rejects.toThrow(/not authorized to reject/i);
    });
  });

  // ===========================================================================
  // 4. DOCUMENT HASH BINDING & MUTATION INVALIDATION (REQUIREMENT 5 & EXIT GATE)
  // ===========================================================================
  describe('4. Document Hash Binding & Mutation Invalidation', () => {
    it('computes deterministic document hash and invalidates approval upon draft alteration', async () => {
      const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;

      // 1. Configure approval rule for INVOICE > 1000
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'INVOICE',
        isRequired: true,
        thresholdAmount: 1000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      // 2. Create an invoice via createAndPostInvoice (saved in SUBMITTED status because > 1000)
      const inv = await SalesEngine.createAndPostInvoice(orgId, {
        customerId: customer.id,
        customerName: customer.name,
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        lineItems: [
          { description: 'Consulting Services', quantity: 1, unitPrice: 25000, taxRate: 0, amount: 25000 },
        ],
        createdBy: submitterId,
      });
      expect(inv.id).toBeDefined();
      expect(inv.status).toBe('SUBMITTED');

      // Verify approval request was submitted with document hash
      const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [inv.id]);
      expect(reqRes.rows.length).toBe(1);
      const req = reqRes.rows[0];
      expect(req.status).toBe('SUBMITTED');
      expect(req.document_hash).toBeDefined();

      // 3. Alter the invoice line items via SalesEngine.updateInvoice
      await SalesEngine.updateInvoice(
        orgId,
        inv.id,
        {
          lineItems: [
            { id: newId('item'), description: 'Consulting Services (Altered)', quantity: 2, unitPrice: 25000, amount: 50000 },
          ],
        } as any,
        submitterId
      );

      // 4. Verify that updateInvoice automatically invalidated the active approval request
      const reqAfterEdit = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(reqAfterEdit.rows[0].status).toBe('REJECTED');
      expect(reqAfterEdit.rows[0].rejection_reason).toContain('Document modified after submission');

      // 5. Attempting to approve this invalidated request must fail
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: approverFinanceId,
          role: 'Finance Manager',
        })
      ).rejects.toThrow(/Cannot approve a request that has already been rejected/i);
    });

    it('detects direct payload alterations before approval via transaction lock & hash comparison', async () => {
      const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;

      // Configure rule for VENDOR_BILL
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'VENDOR_BILL',
        isRequired: true,
        thresholdAmount: 1000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      // Create bill via PurchasesEngine
      const bill = await PurchasesEngine.createAndPostBill(orgId, {
        vendorId: vendor.id,
        vendorName: vendor.name,
        billDate: '2026-09-01',
        totalAmount: 15000,
        subtotal: 15000,
        createdBy: submitterId,
        lineItems: [
          {
            id: newId('bitem'),
            accountId: `acc-${orgId}-5000`,
            description: 'Hardware Server',
            quantity: 1,
            unitPrice: 15000,
            amount: 15000,
          },
        ],
      });
      expect(bill.status).toBe('SUBMITTED');

      const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [bill.id]);
      expect(reqRes.rows.length).toBe(1);
      const req = reqRes.rows[0];
      expect(req.document_hash).toBeDefined();

      // Tampering: direct update in DB alters total_amount to 99999
      await db.query(`UPDATE bills SET total_amount = 99999 WHERE id = $1`, [bill.id]);

      // Approval attempt must be rejected because entity amount and hash mismatch
      await expect(
        ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: approverFinanceId,
          role: 'Finance Manager',
        })
      ).rejects.toThrow(/DOCUMENT_AMOUNT_ALTERED|DOCUMENT_ALTERED_SINCE_SUBMISSION/i);
    });

    it('blocks canonical document posting if document is modified after approval was granted', async () => {
      // Configure approval rule for manual journal
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'MANUAL_JOURNAL',
        isRequired: true,
        thresholdAmount: 10000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      // Create manual journal via ManualJournalService
      const expAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Expense' LIMIT 1`, [orgId])).rows[0].id;
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

      const journal = await ManualJournalService.createJournal(orgId, submitterId, {
        date: '2026-09-05',
        reference: 'MJ-STAGE2-TAMPER',
        narration: 'Adjusting entry for equipment',
        lines: [
          { accountId: expAcc, debit: 20000, credit: 0 },
          { accountId: bankAcc, debit: 0, credit: 20000 },
        ],
      });
      expect(journal.status).toBe('Submitted');

      const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [journal.id]);
      expect(reqRes.rows.length).toBe(1);
      const req = reqRes.rows[0];

      // Manager approves the request
      await ApprovalWorkflowService.approveRequestById(orgId, req.id, {
        userId: approverFinanceId,
        role: 'Finance Manager',
      });

      // Verify status is APPROVED
      const approvedReq = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(approvedReq.rows[0].status).toBe('APPROVED');

      // Now tamper with journal lines after approval was granted
      await db.query(
        `UPDATE journal_lines SET debit = 99999 WHERE journal_entry_id = $1 AND debit > 0`,
        [journal.id]
      );

      // Attempting to post the approved journal must be blocked inside the posting transaction
      await expect(
        ManualJournalService.postApprovedJournal(orgId, approverFinanceId, journal.id)
      ).rejects.toThrow(/DOCUMENT_ALTERED_AFTER_APPROVAL/i);
    });
  });

  // ===========================================================================
  // 5. CANONICAL TRANSACTION CONSUMPTION (REQUIREMENT 6)
  // ===========================================================================
  describe('5. Canonical Transaction Approval Consumption', () => {
    it('consumes approval request atomically during document posting and blocks double consumption', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'MANUAL_JOURNAL',
        isRequired: true,
        thresholdAmount: 5000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      const expAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Expense' LIMIT 1`, [orgId])).rows[0].id;
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

      const journal = await ManualJournalService.createJournal(orgId, submitterId, {
        date: '2026-09-06',
        reference: 'MJ-CLEAN-01',
        narration: 'Clean journal posting',
        lines: [
          { accountId: expAcc, debit: 12000, credit: 0 },
          { accountId: bankAcc, debit: 0, credit: 12000 },
        ],
      });
      expect(journal.status).toBe('Submitted');

      const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [journal.id]);
      const req = reqRes.rows[0];

      // Approve cleanly
      await ApprovalWorkflowService.approveRequestById(orgId, req.id, {
        userId: approverFinanceId,
        role: 'Finance Manager',
      });

      // Post approved journal
      const posted = await ManualJournalService.postApprovedJournal(orgId, approverFinanceId, journal.id);
      expect(posted.id).toBe(journal.id);
      expect(posted.status).toBe('Posted');

      // Check request status is CONSUMED
      const reqCheck = await db.query('SELECT status FROM approval_requests WHERE id = $1', [req.id]);
      expect(reqCheck.rows[0].status).toBe('CONSUMED');

      // Attempting to re-post or re-consume throws APPROVAL_REQUIRED or JOURNAL_ALREADY_POSTED
      await expect(
        ManualJournalService.postApprovedJournal(orgId, approverFinanceId, journal.id)
      ).rejects.toThrow(/JOURNAL_ALREADY_POSTED|APPROVAL_REQUIRED/);
    });
  });

  // ===========================================================================
  // 6. PERMISSION MATRIX ACROSS ALL 6 DOCUMENT TYPES (REQUIREMENT 7 & EXIT GATE)
  // ===========================================================================
  describe('6. Full Permission Matrix Across All 6 Document Types', () => {
    const docTypes: Array<{
      type: ApprovalEntityType;
      name: string;
      threshold: number;
      testAmount: number;
    }> = [
      { type: 'INVOICE', name: 'Invoices', threshold: 1000, testAmount: 2500 },
      { type: 'VENDOR_BILL', name: 'Vendor Bills', threshold: 1000, testAmount: 3500 },
      { type: 'EXPENSE', name: 'Direct Expenses', threshold: 500, testAmount: 1200 },
      { type: 'CUSTOMER_PAYMENT', name: 'Customer Payments', threshold: 1000, testAmount: 4000 },
      { type: 'PAYMENT', name: 'Vendor Payments', threshold: 1000, testAmount: 5000 },
      { type: 'MANUAL_JOURNAL', name: 'Manual Journals', threshold: 1000, testAmount: 6000 },
    ];

    for (const dt of docTypes) {
      it(`Matrix for ${dt.type}: authorized approver succeeds, self-approver fails, unauthorized role fails`, async () => {
        // Configure rule for this document type
        await ApprovalWorkflowService.configureApprovalRule(orgId, {
          entityType: dt.type,
          isRequired: true,
          thresholdAmount: dt.threshold,
          approverRole: 'Finance Manager',
          allowSelfApproval: false,
          userId: ownerId,
        });

        // Submit request by submitter
        const entityId = `entity-${dt.type.toLowerCase()}-123`;
        const req = await ApprovalWorkflowService.submitForApproval(
          orgId,
          dt.type,
          entityId,
          submitterId,
          dt.testAmount
        );

        // Negative 1: Submitter cannot self-approve
        await expect(
          ApprovalWorkflowService.approveRequestById(orgId, req.id, {
            userId: submitterId,
            role: 'Finance Manager',
          })
        ).rejects.toThrow(/Self-approval forbidden/i);

        // Negative 2: Unauthorized role (Clerk) cannot approve
        await expect(
          ApprovalWorkflowService.approveRequestById(orgId, req.id, {
            userId: unauthorizedClerkId,
            role: 'Clerk',
          })
        ).rejects.toThrow(/not authorized to approve/i);

        // Negative 3: Wrong approver role (Billing Manager when Finance Manager is required) cannot approve
        await expect(
          ApprovalWorkflowService.approveRequestById(orgId, req.id, {
            userId: approverBillingId,
            role: 'Billing Manager',
          })
        ).rejects.toThrow(/not authorized to approve/i);

        // Positive: Distinct authorized approver (Finance Manager) succeeds
        const approved = await ApprovalWorkflowService.approveRequestById(orgId, req.id, {
          userId: approverFinanceId,
          role: 'Finance Manager',
        });
        expect(approved.status).toBe('APPROVED');
        expect(approved.approvedBy).toBe(approverFinanceId);
        expect(approved.entityType).toBe(dt.type);
      });
    }
  });

  // ===========================================================================
  // 7. AUTOMATIC APPROVAL INVALIDATION ACROSS ALL SIX DOCUMENT TYPES
  // ===========================================================================
  describe('7. Automatic Approval Invalidation Across All 6 Document Types', () => {
    it('automatically transitions approval request to REJECTED on INVOICE edit', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'INVOICE',
        isRequired: true,
        thresholdAmount: 5000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });
      const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
      const inv = await SalesEngine.createAndPostInvoice(orgId, {
        customerId: customer.id,
        customerName: customer.name,
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        lineItems: [{ description: 'Item 1', quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 }],
        createdBy: submitterId,
      });

      const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [inv.id]);
      expect(reqRes.rows.length).toBe(1);
      const reqId = reqRes.rows[0].id;

      // Mutate invoice via SalesEngine.updateInvoice
      await SalesEngine.updateInvoice(orgId, inv.id, {
        notes: 'Updated invoice payment terms',
      }, submitterId);

      // Confirm approval request transitioned to REJECTED
      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [reqId]);
      expect(reqAfter.rows[0].status).toBe('REJECTED');
      expect(reqAfter.rows[0].rejection_reason).toContain('Document modified after submission');
    });

    it('automatically transitions approval request to REJECTED on VENDOR_BILL edit', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'VENDOR_BILL',
        isRequired: true,
        thresholdAmount: 5000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });
      const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
      const bill = await PurchasesEngine.createAndPostBill(orgId, {
        vendorId: vendor.id,
        vendorName: vendor.name,
        billDate: '2026-09-01',
        totalAmount: 12000,
        subtotal: 12000,
        createdBy: submitterId,
        lineItems: [{ id: newId('bitem'), accountId: `acc-${orgId}-5000`, description: 'Hosting', quantity: 1, unitPrice: 12000, amount: 12000 }],
      });

      const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [bill.id]);
      expect(reqRes.rows.length).toBe(1);
      const reqId = reqRes.rows[0].id;

      // Mutate bill via PurchasesEngine.updateBill
      await PurchasesEngine.updateBill(orgId, bill.id, {
        notes: 'Updated vendor bill terms',
      });

      // Confirm approval request transitioned to REJECTED
      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [reqId]);
      expect(reqAfter.rows[0].status).toBe('REJECTED');
      expect(reqAfter.rows[0].rejection_reason).toContain('Document modified after submission');
    });

    it('automatically transitions approval request to REJECTED on EXPENSE edit', async () => {
      const expAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Expense' LIMIT 1`, [orgId])).rows[0].id;
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

      const exp = await ExpensePostingService.createAndPost(orgId, submitterId, {
        date: '2026-09-01',
        amount: 5000,
        expenseAccountId: expAcc,
        paidFromAccountId: bankAcc,
        vendorName: 'Office Supplies Inc',
        description: 'Initial supplies',
      });

      // Submit approval request for this expense
      const req = await ApprovalWorkflowService.submitForApproval(orgId, 'EXPENSE', exp.id, submitterId, 5000);
      expect(req.status).toBe('SUBMITTED');

      // Mutate expense via ExpensePostingService.updateExpense
      await ExpensePostingService.updateExpense(orgId, exp.id, {
        description: 'Updated office supplies description',
      });

      // Confirm approval request transitioned to REJECTED
      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(reqAfter.rows[0].status).toBe('REJECTED');
      expect(reqAfter.rows[0].rejection_reason).toContain('Document modified after submission');
    });

    it('automatically transitions approval request to REJECTED on CUSTOMER_PAYMENT edit', async () => {
      const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

      const pmt = await SalesEngine.recordCustomerPayment(orgId, {
        customerId: customer.id,
        amount: 8000,
        paymentDate: '2026-09-01',
        depositToAccountId: bankAcc,
        paymentMode: 'Bank Transfer',
        reference: 'REF-CUST-INIT',
        createdBy: submitterId,
      });

      // Submit approval request
      const req = await ApprovalWorkflowService.submitForApproval(orgId, 'CUSTOMER_PAYMENT', pmt.id, submitterId, 8000);
      expect(req.status).toBe('SUBMITTED');

      // Mutate payment via SalesEngine.updateCustomerPayment
      await SalesEngine.updateCustomerPayment(orgId, pmt.id, {
        reference: 'REF-CUST-MODIFIED',
        notes: 'Updated wire reference number',
      });

      // Confirm approval request transitioned to REJECTED
      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(reqAfter.rows[0].status).toBe('REJECTED');
      expect(reqAfter.rows[0].rejection_reason).toContain('Document modified after submission');
    });

    it('automatically transitions approval request to REJECTED on PAYMENT (vendor payment) edit', async () => {
      const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

      const vpmt = await PurchasesEngine.recordVendorPayment(orgId, {
        vendorId: vendor.id,
        amount: 7500,
        paymentDate: '2026-09-01',
        paidFromAccountId: bankAcc,
        paymentMode: 'Bank Transfer',
        reference: 'VPAY-INIT',
        createdBy: submitterId,
      });

      // Submit approval request
      const req = await ApprovalWorkflowService.submitForApproval(orgId, 'PAYMENT', vpmt.id, submitterId, 7500);
      expect(req.status).toBe('SUBMITTED');

      // Mutate vendor payment via PurchasesEngine.updateVendorPayment
      await PurchasesEngine.updateVendorPayment(orgId, vpmt.id, {
        reference: 'VPAY-MODIFIED',
        notes: 'Updated vendor wire reference',
      });

      // Confirm approval request transitioned to REJECTED
      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(reqAfter.rows[0].status).toBe('REJECTED');
      expect(reqAfter.rows[0].rejection_reason).toContain('Document modified after submission');
    });

    it('automatically transitions approval request to REJECTED on MANUAL_JOURNAL edit', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'MANUAL_JOURNAL',
        isRequired: true,
        thresholdAmount: 5000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });
      const expAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Expense' LIMIT 1`, [orgId])).rows[0].id;
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

      const journal = await ManualJournalService.createJournal(orgId, submitterId, {
        date: '2026-09-05',
        reference: 'MJ-STAGE2-INVALIDATE',
        narration: 'Initial draft journal',
        lines: [
          { accountId: expAcc, debit: 15000, credit: 0 },
          { accountId: bankAcc, debit: 0, credit: 15000 },
        ],
      });

      const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [journal.id]);
      expect(reqRes.rows.length).toBe(1);
      const reqId = reqRes.rows[0].id;

      // Mutate draft via ManualJournalService.updateDraft
      await ManualJournalService.updateDraft(orgId, submitterId, journal.id, {
        date: '2026-09-06',
        lines: [
          { accountId: expAcc, debit: 16000, credit: 0 },
          { accountId: bankAcc, debit: 0, credit: 16000 },
        ],
      });

      // Confirm approval request transitioned to REJECTED
      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [reqId]);
      expect(reqAfter.rows[0].status).toBe('REJECTED');
      expect(reqAfter.rows[0].rejection_reason).toContain('Draft modified after submission/approval');
    });

    it('automatically invalidates approval request when document is voided or reversed', async () => {
      // Create and submit bill
      const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
      const bill = await PurchasesEngine.createAndPostBill(orgId, {
        vendorId: vendor.id,
        vendorName: vendor.name,
        billDate: '2026-09-01',
        totalAmount: 9000,
        subtotal: 9000,
        createdBy: submitterId,
        lineItems: [{ id: newId('bitem'), accountId: `acc-${orgId}-5000`, description: 'Consulting', quantity: 1, unitPrice: 9000, amount: 9000 }],
      });

      // Force into POSTED status so voidBill can reverse certified posting
      await db.query(`UPDATE bills SET status = 'POSTED', journal_entry_id = 'jrn-mock-posting' WHERE id = $1`, [bill.id]);
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
         VALUES ('jrn-mock-posting', $1, 'JV/2026/MOCK', '2026-09-01', 'Posted', 'Mock bill posting')
         ON CONFLICT (id) DO NOTHING`,
        [orgId]
      );
      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
         VALUES ('jl-1', 'jrn-mock-posting', $1, 'acc-' || $1 || '-5000', 9000, 0),
                ('jl-2', 'jrn-mock-posting', $1, 'acc-' || $1 || '-2000', 0, 9000)
         ON CONFLICT (id) DO NOTHING`,
        [orgId]
      );

      // Submit approval request
      const req = await ApprovalWorkflowService.submitForApproval(orgId, 'VENDOR_BILL', bill.id, submitterId, 9000);
      expect(req.status).toBe('SUBMITTED');

      // Void bill via FinancialDestructiveActionsService
      await FinancialDestructiveActionsService.voidBill(orgId, bill.id, ownerId, 'Vendor sent incorrect invoice');

      // Approval request must be automatically REJECTED
      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(reqAfter.rows[0].status).toBe('REJECTED');
      expect(reqAfter.rows[0].rejection_reason).toContain('Document voided');
    });
  });

  // ===========================================================================
  // 8. PURCHASE ORDER APPROVAL ID & VENDOR PAYMENT REVERSAL REGRESSION
  // ===========================================================================
  describe('8. Purchase Order Approval ID & Vendor Payment Reversal Regression', () => {
    it('requires approvalRequestId when approving a purchase order requiring approval', async () => {
      // 1. Configure approval rule for PURCHASE_ORDER
      await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType: 'PURCHASE_ORDER',
        isRequired: true,
        thresholdAmount: 1000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerId,
      });

      // 2. Create purchase order exceeding threshold
      const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
      const po = await PurchasesEngine.createPurchaseOrder(orgId, {
        vendorId: vendor.id,
        vendorName: vendor.name,
        orderDate: '2026-09-01',
        totalAmount: 5000,
        subtotal: 5000,
        lineItems: [{ id: newId('poitem'), description: 'Server Hardware', quantity: 1, unitPrice: 5000, amount: 5000 }],
      });

      // 3. Negative: Approving without approvalRequestId fails with MISSING_APPROVAL_REQUEST_ID
      await expect(
        PurchasesEngine.approvePurchaseOrder(orgId, po.id, approverFinanceId, 'Finance Manager')
      ).rejects.toThrow(/MISSING_APPROVAL_REQUEST_ID/);

      // 4. Submit approval request for the purchase order
      const req = await ApprovalWorkflowService.submitForApproval(orgId, 'PURCHASE_ORDER', po.id, submitterId, 5000);
      expect(req.status).toBe('SUBMITTED');

      // 5. Negative: Approver with wrong role is rejected
      await expect(
        PurchasesEngine.approvePurchaseOrder(orgId, po.id, unauthorizedClerkId, 'Clerk', req.id)
      ).rejects.toThrow(/not authorized to approve/);

      // 6. Positive: Distinct approver holding configured role passes approvalRequestId and succeeds
      const approvedPo = await PurchasesEngine.approvePurchaseOrder(orgId, po.id, approverFinanceId, 'Finance Manager', req.id);
      expect(approvedPo.status).toBe('APPROVED');

      const poAfter = await PurchasesEngine.getPurchaseOrder(orgId, po.id);
      expect(poAfter?.status).toBe('APPROVED');

      const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
      expect(reqAfter.rows[0].status).toBe('APPROVED');
    });

    it('invalidates PAYMENT approval request on reverseVendorPayment and leaves unrelated PAYMENT untouched on reversePaymentReceived', async () => {
      const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
      const clientObj = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
      const vendorPaymentId = newId('pmt');
      const customerPaymentId = newId('rec');
      const jrnVendor = newId('jrn');
      const jrnCust = newId('jrn');

      // Create mock journals
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
         VALUES ($1, $3, 'JV/2026/VP', '2026-09-01', 'Posted', 'Vendor payment posting'),
                ($2, $3, 'JV/2026/CP', '2026-09-01', 'Posted', 'Customer payment posting')
         ON CONFLICT (id) DO NOTHING`,
        [jrnVendor, jrnCust, orgId]
      );
      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
         VALUES ('jl-vp-1', $1, $3, 'acc-' || $3 || '-2000', 2000, 0),
                ('jl-vp-2', $1, $3, 'acc-' || $3 || '-1000', 0, 2000),
                ('jl-cp-1', $2, $3, 'acc-' || $3 || '-1000', 3000, 0),
                ('jl-cp-2', $2, $3, 'acc-' || $3 || '-1100', 0, 3000)
         ON CONFLICT (id) DO NOTHING`,
        [jrnVendor, jrnCust, orgId]
      );

      // Set vendor advance balance so reversal can deduct unallocated advance
      await db.query(
        `UPDATE vendors SET advance_balance = 2000 WHERE organization_id = $1 AND id = $2`,
        [orgId, vendor.id]
      );

      // Insert payments_made (vendor payment)
      await db.query(
        `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, amount, unallocated_amount, payment_date, payment_mode, paid_from_account_id, status, journal_entry_id)
         VALUES ($1, $2, 'VP-TEST-001', $3, $4, 2000, 2000, '2026-09-01', 'BANK_TRANSFER', 'acc-' || $2 || '-1000', 'PAID', $5)`,
        [vendorPaymentId, orgId, vendor.id, vendor.name, jrnVendor]
      );

      // Insert payments_received (customer payment)
      await db.query(
        `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, amount, unallocated_amount, payment_date, payment_mode, deposit_to_account_id, status, journal_entry_id)
         VALUES ($1, $2, 'CR-TEST-001', $3, $4, 3000, 3000, '2026-09-01', 'BANK_TRANSFER', 'acc-' || $2 || '-1000', 'RECEIVED', $5)`,
        [customerPaymentId, orgId, clientObj.id, clientObj.name, jrnCust]
      );

      // Create approval request for PAYMENT (vendor payment)
      const pmtReq = await ApprovalWorkflowService.submitForApproval(orgId, 'PAYMENT', vendorPaymentId, submitterId, 2000);
      expect(pmtReq.status).toBe('SUBMITTED');

      // Create approval request for CUSTOMER_PAYMENT (customer payment)
      const custPmtReq = await ApprovalWorkflowService.submitForApproval(orgId, 'CUSTOMER_PAYMENT', customerPaymentId, submitterId, 3000);
      expect(custPmtReq.status).toBe('SUBMITTED');

      // Test 1: reversePaymentReceived must invalidate CUSTOMER_PAYMENT and must NOT touch the PAYMENT request
      await FinancialDestructiveActionsService.reversePaymentReceived(orgId, customerPaymentId, ownerId, 'Customer NSF check');
      
      const custPmtAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [custPmtReq.id]);
      expect(custPmtAfter.rows[0].status).toBe('REJECTED');
      expect(custPmtAfter.rows[0].rejection_reason).toContain('Document voided/reversed');

      const pmtReqBeforeReverse = await db.query('SELECT * FROM approval_requests WHERE id = $1', [pmtReq.id]);
      expect(pmtReqBeforeReverse.rows[0].status).toBe('SUBMITTED'); // NOT touched by customer payment reversal!

      // Test 2: reverseVendorPayment must invalidate the PAYMENT request
      await FinancialDestructiveActionsService.reverseVendorPayment(orgId, vendorPaymentId, ownerId, 'Payment recalled due to incorrect vendor IBAN');
      
      const pmtReqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [pmtReq.id]);
      expect(pmtReqAfter.rows[0].status).toBe('REJECTED');
      expect(pmtReqAfter.rows[0].rejection_reason).toContain('Document voided/reversed');
    });
  });
});
