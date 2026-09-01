import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { JwtAuth } from '../auth/jwt';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { ManualJournalService } from '../services/ManualJournalService';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { SalesEngine } from '../sales/SalesEngine';
import financeRoutes from '../routes/finance.routes';
import securityRoutes from '../routes/security.routes';
import { authMiddleware, organizationIsolationMiddleware } from '../middleware/organizationIsolation.middleware';

describe('Financial Posting & Approval Mutation Integrity Tests (T3/T4 Hardening)', () => {
  let app: Express;
  let orgId: string;
  let ownerUserId: string;
  let accountantUserId: string;
  let managerUserId: string;
  let viewerUserId: string;

  let ownerToken: string;
  let managerToken: string;
  let accountantToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });

    orgId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
    ownerUserId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;
    accountantUserId = newId('usr-acct');
    managerUserId = newId('usr-mgr');
    viewerUserId = newId('usr-view');

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'acct.t3@example.com', 'hash', 'Accountant T3', 'Active'),
              ($2, 'mgr.t3@example.com', 'hash', 'Manager T3', 'Active'),
              ($3, 'view.t3@example.com', 'hash', 'Viewer T3', 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [accountantUserId, managerUserId, viewerUserId]
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, 'Accountant', 'Active', NOW()),
              ($4, $5, $6, 'Finance Manager', 'Active', NOW()),
              ($7, $8, $9, 'Viewer', 'Active', NOW())
       ON CONFLICT DO NOTHING`,
      [newId('mem'), orgId, accountantUserId, newId('mem'), orgId, managerUserId, newId('mem'), orgId, viewerUserId]
    );

    ownerToken = JwtAuth.generateToken({ userId: ownerUserId, email: 'owner@acme-test.com' });
    managerToken = JwtAuth.generateToken({ userId: managerUserId, email: 'mgr.t3@example.com' });
    accountantToken = JwtAuth.generateToken({ userId: accountantUserId, email: 'acct.t3@example.com' });
    viewerToken = JwtAuth.generateToken({ userId: viewerUserId, email: 'view.t3@example.com' });

    app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(organizationIsolationMiddleware);
    app.use('/api/v1/finance', financeRoutes);
    app.use('/api/v1/security', securityRoutes);
  });

  // ---------------------------------------------------------------------------
  // 1. MANUAL JOURNAL WORKFLOW & APPROVAL INTEGRITY
  // ---------------------------------------------------------------------------
  it('1. Manual Journal: cannot bypass approval rule and preserves exact draft ID upon postApprovedJournal', async () => {
    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'MANUAL_JOURNAL',
      isRequired: true,
      thresholdAmount: 50000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    const expAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Expense' LIMIT 1`, [orgId])).rows[0].id;
    const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

    // Attempt to bypass by passing status: 'Approved' / 'Posted'
    const res = await ManualJournalService.createJournal(orgId, accountantUserId, {
      date: '2026-08-15',
      reference: 'TRY-BYPASS-001',
      narration: 'Attempting to bypass approval rule',
      status: 'Posted',
      lines: [
        { accountId: expAcc, debit: 100000, credit: 0 },
        { accountId: bankAcc, debit: 0, credit: 100000 },
      ],
    });

    expect(res.status).toBe('Submitted');

    // Confirm journal and lines are persisted
    const jRes = await db.query('SELECT * FROM journal_entries WHERE id = $1', [res.id]);
    expect(jRes.rows.length).toBe(1);
    expect(jRes.rows[0].status).toBe('Submitted');

    // Attempting to post without approval throws error
    await expect(
      ManualJournalService.postApprovedJournal(orgId, accountantUserId, res.id)
    ).rejects.toThrow(/APPROVAL_REQUIRED/);

    // Manager approves the request
    await ApprovalWorkflowService.approveRequest(orgId, 'MANUAL_JOURNAL', res.id, managerUserId, 'Finance Manager');

    // Now posting succeeds on the exact same draft ID
    const posted = await ManualJournalService.postApprovedJournal(orgId, accountantUserId, res.id);
    expect(posted.id).toBe(res.id);
    expect(posted.status).toBe('Posted');

    // Approval request is atomically consumed
    const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [res.id]);
    expect(reqRes.rows[0].status).toBe('CONSUMED');

    // Double post is rejected
    await expect(
      ManualJournalService.postApprovedJournal(orgId, accountantUserId, res.id)
    ).rejects.toThrow(/JOURNAL_ALREADY_POSTED/);
  });

  // ---------------------------------------------------------------------------
  // 2. VENDOR BILL WORKFLOW & POST-APPROVED DRAFT INTEGRITY
  // ---------------------------------------------------------------------------
  it('2. Vendor Bill: draft preserved, AP unaffected until approval, posted cleanly via postApprovedBill', async () => {
    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'VENDOR_BILL',
      isRequired: true,
      thresholdAmount: 20000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const vendorBefore = await db.query('SELECT payables_balance FROM vendors WHERE id = $1', [vendor.id]);
    const balanceBefore = Number(vendorBefore.rows[0]?.payables_balance || 0);

    const bill = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      billDate: '2026-08-20',
      totalAmount: 45000,
      subtotal: 45000,
      createdBy: accountantUserId,
      lineItems: [
        {
          id: newId('bitem'),
          accountId: 'acc-expense',
          description: 'Consulting Services',
          quantity: 1,
          unitPrice: 45000,
          amount: 45000,
        },
      ],
    });

    expect(bill.status).toBe('SUBMITTED');

    // AP balance is not inflated while unapproved
    const vendorMid = await db.query('SELECT payables_balance FROM vendors WHERE id = $1', [vendor.id]);
    expect(Number(vendorMid.rows[0]?.payables_balance || 0)).toBe(balanceBefore);

    // Approve bill
    await ApprovalWorkflowService.approveRequest(orgId, 'VENDOR_BILL', bill.id, managerUserId, 'Finance Manager');

    // Post approved bill using the exact same ID
    const postedBill = await PurchasesEngine.postApprovedBill(orgId, accountantUserId, bill.id);
    expect(postedBill.id).toBe(bill.id);
    expect(postedBill.status).toBe('POSTED');

    // AP balance is now updated
    const vendorAfter = await db.query('SELECT payables_balance FROM vendors WHERE id = $1', [vendor.id]);
    expect(Number(vendorAfter.rows[0]?.payables_balance || 0)).toBe(balanceBefore + 45000);

    // Approval request is consumed
    const reqRes = await db.query('SELECT * FROM approval_requests WHERE entity_id = $1', [bill.id]);
    expect(reqRes.rows[0].status).toBe('CONSUMED');

    // Double post is rejected
    await expect(
      PurchasesEngine.postApprovedBill(orgId, accountantUserId, bill.id)
    ).rejects.toThrow(/BILL_ALREADY_POSTED/);
  });

  // ---------------------------------------------------------------------------
  // 3. VENDOR PAYMENT WORKFLOW & POST-APPROVED DRAFT INTEGRITY
  // ---------------------------------------------------------------------------
  it('3. Vendor Payment: preserves draft, applies allocations upon postApprovedVendorPayment without duplicate document', async () => {
    // Create an approved posted bill of ₹50,000 to allocate to
    const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const targetBill = await PurchasesEngine.createAndPostBill(orgId, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      billDate: '2026-08-21',
      totalAmount: 10000,
      subtotal: 10000,
      status: 'POSTED',
      lineItems: [{ id: newId('bitem'), accountId: 'acc-expense', description: 'Office supplies', quantity: 1, unitPrice: 10000, amount: 10000 }],
    });

    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'PAYMENT',
      isRequired: true,
      thresholdAmount: 5000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    // Record vendor payment of ₹10,000 allocating to targetBill
    const pmt = await PurchasesEngine.recordVendorPayment(orgId, {
      vendorId: vendor.id,
      vendorName: vendor.name,
      amount: 10000,
      paymentDate: '2026-08-22',
      paidFromAccountId: 'acc-bank-1',
      allocations: [{ billId: targetBill.id, amount: 10000 }],
      createdBy: accountantUserId,
    });

    expect(pmt.status).toBe('SUBMITTED');

    // Target bill balance is not reduced yet
    const billCheckBefore = await db.query('SELECT balance_due FROM bills WHERE id = $1', [targetBill.id]);
    expect(Number(billCheckBefore.rows[0].balance_due)).toBe(10000);

    // Approve the payment
    await ApprovalWorkflowService.approveRequest(orgId, 'PAYMENT', pmt.id, managerUserId, 'Finance Manager');

    // Post approved vendor payment
    const postedPmt = await PurchasesEngine.postApprovedVendorPayment(orgId, accountantUserId, pmt.id);
    expect(postedPmt.id).toBe(pmt.id);
    expect(postedPmt.status).toBe('ALLOCATED');

    // Target bill balance is now 0 (Paid)
    const billCheckAfter = await db.query('SELECT balance_due, status FROM bills WHERE id = $1', [targetBill.id]);
    expect(Number(billCheckAfter.rows[0].balance_due)).toBe(0);
    expect(billCheckAfter.rows[0].status).toBe('PAID');

    // Double post rejected
    await expect(
      PurchasesEngine.postApprovedVendorPayment(orgId, accountantUserId, pmt.id)
    ).rejects.toThrow(/PAYMENT_ALREADY_POSTED/);
  });

  // ---------------------------------------------------------------------------
  // 4. SALES INVOICE WORKFLOW & POST-APPROVED DRAFT INTEGRITY
  // ---------------------------------------------------------------------------
  it('4. Sales Invoice: approval requirement routes invoice to SUBMITTED and posts cleanly via postApprovedInvoice', async () => {
    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'INVOICE',
      isRequired: true,
      thresholdAmount: 30000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
    const custBefore = await db.query('SELECT receivables_balance FROM customers WHERE id = $1', [customer.id]);
    const balanceBefore = Number(custBefore.rows[0]?.receivables_balance || 0);

    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: customer.id,
      customerName: customer.name,
      issueDate: '2026-08-25',
      dueDate: '2026-09-25',
      lineItems: [{ description: 'Cloud Engineering Support', quantity: 1, unitPrice: 75000, taxRate: 0, amount: 75000 }],
      createdBy: accountantUserId,
    });

    // Check invoice saved with SUBMITTED status
    const invCheck = await db.query('SELECT * FROM invoices WHERE id = $1', [invoice.id]);
    expect(invCheck.rows[0].status).toBe('SUBMITTED');

    // Customer AR balance is not inflated
    const custMid = await db.query('SELECT receivables_balance FROM customers WHERE id = $1', [customer.id]);
    expect(Number(custMid.rows[0]?.receivables_balance || 0)).toBe(balanceBefore);

    // Approve the invoice
    await ApprovalWorkflowService.approveRequest(orgId, 'INVOICE', invoice.id, managerUserId, 'Finance Manager');

    // Post approved invoice
    const postedInv = await SalesEngine.postApprovedInvoice(orgId, accountantUserId, invoice.id);
    expect(postedInv.id).toBe(invoice.id);
    expect(postedInv.status).toBe('POSTED');

    // Customer AR balance is now updated
    const custAfter = await db.query('SELECT receivables_balance FROM customers WHERE id = $1', [customer.id]);
    expect(Number(custAfter.rows[0]?.receivables_balance || 0)).toBe(balanceBefore + 75000);

    // Double post rejected
    await expect(
      SalesEngine.postApprovedInvoice(orgId, accountantUserId, invoice.id)
    ).rejects.toThrow(/INVOICE_ALREADY_POSTED/);
  });

  // ---------------------------------------------------------------------------
  // 5. CUSTOMER PAYMENT WORKFLOW & POST-APPROVED DRAFT INTEGRITY
  // ---------------------------------------------------------------------------
  it('5. Customer Payment: approval requirement preserves draft and allocates cleanly upon postApprovedPayment', async () => {
    const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;

    // Create a posted invoice of ₹15,000
    const targetInvoice = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: customer.id,
      customerName: customer.name,
      issueDate: '2026-08-26',
      dueDate: '2026-09-26',
      lineItems: [{ description: 'Monthly Retainer', quantity: 1, unitPrice: 15000, taxRate: 0, amount: 15000 }],
      status: 'POSTED',
    });

    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'CUSTOMER_PAYMENT',
      isRequired: true,
      thresholdAmount: 10000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    // Record customer payment of ₹15,000 allocating to targetInvoice
    const pmt = await SalesEngine.recordPayment(orgId, {
      customerId: customer.id,
      customerName: customer.name,
      amount: 15000,
      paymentDate: '2026-08-27',
      depositToAccountId: `acc-${orgId}-1010`,
      allocations: [{ invoiceId: targetInvoice.id, amount: 15000 }],
      actorId: accountantUserId,
    } as any);

    // Check payment saved in SUBMITTED status
    const pmtCheck = await db.query('SELECT status FROM payments_received WHERE id = $1', [pmt.id]);
    expect(pmtCheck.rows[0].status).toBe('SUBMITTED');

    // Target invoice balance is not reduced yet
    const invCheckBefore = await db.query('SELECT balance_due FROM invoices WHERE id = $1', [targetInvoice.id]);
    expect(Number(invCheckBefore.rows[0].balance_due)).toBe(15000);

    // Approve the customer payment
    await ApprovalWorkflowService.approveRequest(orgId, 'CUSTOMER_PAYMENT', pmt.id, managerUserId, 'Finance Manager');

    // Post approved payment
    const postedPmt = await SalesEngine.postApprovedPayment(orgId, accountantUserId, pmt.id);
    expect(postedPmt.id).toBe(pmt.id);

    // Target invoice balance is now 0 (Paid)
    const invCheckAfter = await db.query('SELECT balance_due, status FROM invoices WHERE id = $1', [targetInvoice.id]);
    expect(Number(invCheckAfter.rows[0].balance_due)).toBe(0);
    expect(invCheckAfter.rows[0].status).toBe('PAID');

    // Double post rejected
    await expect(
      SalesEngine.postApprovedPayment(orgId, accountantUserId, pmt.id)
    ).rejects.toThrow(/PAYMENT_ALREADY_POSTED/);
  });

  // ---------------------------------------------------------------------------
  // 6. ATOMIC TRANSACTION ROLLBACK: ZERO ORPHAN APPROVAL REQUESTS
  // ---------------------------------------------------------------------------
  it('6. Transaction Rollback Atomicity: failure during draft write leaves zero orphan approval requests', async () => {
    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'VENDOR_BILL',
      isRequired: true,
      thresholdAmount: 10000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const reqsBefore = await db.query('SELECT count(*) FROM approval_requests WHERE organization_id = $1', [orgId]);
    const countBefore = Number(reqsBefore.rows[0].count);

    // Trigger failure via transaction rollback
    await expect(
      db.transaction(async (tx) => {
        await PurchasesEngine.createAndPostBill(orgId, {
          vendorId: vendor.id,
          vendorName: vendor.name,
          billDate: '2026-08-28',
          totalAmount: 25000,
          subtotal: 25000,
          createdBy: accountantUserId,
          lineItems: [{ id: newId('bitem'), accountId: 'acc-expense', description: 'Services', quantity: 1, unitPrice: 25000, amount: 25000 }],
        }, tx);

        // Simulated crash inside transaction
        throw new Error('SIMULATED_TRANSACTION_CRASH');
      })
    ).rejects.toThrow('SIMULATED_TRANSACTION_CRASH');

    // Assert zero orphan approval requests were committed
    const reqsAfter = await db.query('SELECT count(*) FROM approval_requests WHERE organization_id = $1', [orgId]);
    expect(Number(reqsAfter.rows[0].count)).toBe(countBefore);
  });

  // ---------------------------------------------------------------------------
  // 7. SUBMITTER IDENTITY & SELF-APPROVAL SECURITY
  // ---------------------------------------------------------------------------
  it('7. Submitter Security: strictly rejects self-approval even if user has approver role', async () => {
    // Manager submits a manual journal draft
    const expAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Expense' LIMIT 1`, [orgId])).rows[0].id;
    const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' LIMIT 1`, [orgId])).rows[0].id;

    const draft = await ManualJournalService.createJournal(orgId, managerUserId, {
      date: '2026-08-29',
      reference: 'MGR-SUBMIT-001',
      narration: 'Self-approval test',
      lines: [
        { accountId: expAcc, debit: 60000, credit: 0 },
        { accountId: bankAcc, debit: 0, credit: 60000 },
      ],
    });

    // Manager attempts to approve their own request
    await expect(
      ApprovalWorkflowService.approveRequest(orgId, 'MANUAL_JOURNAL', draft.id, managerUserId, 'Finance Manager')
    ).rejects.toThrow(/Self-approval forbidden/);
  });

  // ---------------------------------------------------------------------------
  // 8. DIRECT HTTP ENDPOINT PERMISSION HARDENING (UNAUTHORIZED POSTING REJECTION)
  // ---------------------------------------------------------------------------
  it('8. HTTP Security: unauthorized users (Viewer role or unauthenticated) are rejected from post-approved endpoints', async () => {
    // Unauthenticated request
    const unauthRes = await request(app).post('/api/v1/finance/invoices/inv-123/post-approved');
    expect(unauthRes.status).toBe(401);

    // Viewer role lacks accounting.post / invoices.create
    const viewerRes = await request(app)
      .post('/api/v1/finance/invoices/inv-123/post-approved')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerRes.status).toBe(403);

    const viewerBillRes = await request(app)
      .post('/api/v1/finance/bills/bill-123/post-approved')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerBillRes.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 9. DIRECT HTTP END-TO-END WORKFLOW: SUBMIT -> APPROVE -> POST-APPROVED -> DOUBLE-POST REJECT
  // ---------------------------------------------------------------------------
  it('9. HTTP E2E: submitted invoice & bill can be approved and posted via HTTP post-approved endpoints', async () => {
    // Set rule: Invoices > 20000 require approval
    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'INVOICE',
      isRequired: true,
      thresholdAmount: 20000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;

    // 1. Accountant creates invoice via HTTP
    const createRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        clientId: customer.id,
        clientName: customer.name,
        issueDate: '2026-08-30',
        dueDate: '2026-09-30',
        items: [{ description: 'Enterprise Support', quantity: 1, unitPrice: 35000, taxRate: 0, amount: 35000 }],
      });

    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.id;
    expect(createRes.body.status).toBe('SUBMITTED');

    // Confirm it is stored in SUBMITTED status
    const dbCheck = await db.query('SELECT status FROM invoices WHERE id = $1', [invoiceId]);
    expect(dbCheck.rows[0].status).toBe('SUBMITTED');

    // 2. Attempt to call post-approved BEFORE approval -> must fail
    const prematurePostRes = await request(app)
      .post(`/api/v1/finance/invoices/${invoiceId}/post-approved`)
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(prematurePostRes.status).toBeGreaterThanOrEqual(400);

    // 3. Manager approves the request via HTTP security endpoint
    const approveRes = await request(app)
      .post('/api/v1/security/approvals/approve')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        entityType: 'INVOICE',
        entityId: invoiceId,
      });
    expect(approveRes.status).toBe(200);

    // 4. Accountant calls post-approved via HTTP
    const postRes = await request(app)
      .post(`/api/v1/finance/invoices/${invoiceId}/post-approved`)
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(postRes.status).toBe(200);
    expect(postRes.body.status).toBe('POSTED');
    expect(postRes.body.id).toBe(invoiceId);

    // Confirm approval request status is CONSUMED
    const reqCheck = await db.query('SELECT status FROM approval_requests WHERE entity_id = $1', [invoiceId]);
    expect(reqCheck.rows[0].status).toBe('CONSUMED');

    // 5. Double-posting via HTTP is strictly rejected
    const doublePostRes = await request(app)
      .post(`/api/v1/finance/invoices/${invoiceId}/post-approved`)
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(doublePostRes.status).toBeGreaterThanOrEqual(400);
  });

  // ---------------------------------------------------------------------------
  // 10. REJECTION OF DEPRECATED approvedDraftId IN CREATE PAYLOADS
  // ---------------------------------------------------------------------------
  it('10. HTTP Hardening: approvedDraftId is strictly rejected in invoice and bill create payloads', async () => {
    const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;

    // Passing approvedDraftId to createInvoice is forbidden
    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        clientId: customer.id,
        clientName: customer.name,
        issueDate: '2026-08-30',
        dueDate: '2026-09-30',
        items: [{ description: 'Test Line', quantity: 1, unitPrice: 1000, taxRate: 0, amount: 1000 }],
        approvedDraftId: 'fake-draft-123',
      });
    expect(invRes.status).toBeGreaterThanOrEqual(400);

    // Passing approvedDraftId to createBill is forbidden
    const vendor = MASTER_FIXTURE_CONSTANTS.VENDORS.A1;
    const billRes = await request(app)
      .post('/api/v1/finance/bills')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        vendorId: vendor.id,
        vendorName: vendor.name,
        billDate: '2026-08-30',
        dueDate: '2026-09-30',
        totalAmount: 1000,
        subtotal: 1000,
        taxTotal: 0,
        lineItems: [{ description: 'Test Vendor Item', quantity: 1, unitPrice: 1000, taxRate: 0, amount: 1000 }],
        approvedDraftId: 'fake-draft-456',
      });
    expect(billRes.status).toBeGreaterThanOrEqual(400);
  });

  // ---------------------------------------------------------------------------
  // 11. AUDIT FAILURE TRANSACTION ROLLBACK ATOMICITY
  // ---------------------------------------------------------------------------
  it('11. Audit Failure Rollback: audit log write failure inside post-approved transaction rolls back posting cleanly', async () => {
    await ApprovalWorkflowService.configureApprovalRule(orgId, {
      entityType: 'INVOICE',
      isRequired: true,
      thresholdAmount: 10000,
      approverRole: 'Finance Manager',
      allowSelfApproval: false,
      userId: ownerUserId,
    });

    const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
    const custBefore = await db.query('SELECT receivables_balance FROM customers WHERE id = $1', [customer.id]);
    const balanceBefore = Number(custBefore.rows[0]?.receivables_balance || 0);

    // Create submitted invoice
    const inv = await SalesEngine.createAndPostInvoice(orgId, {
      customerId: customer.id,
      customerName: customer.name,
      issueDate: '2026-08-31',
      dueDate: '2026-09-30',
      lineItems: [{ description: 'Security Architecture Audit', quantity: 1, unitPrice: 40000, taxRate: 0, amount: 40000 }],
      createdBy: accountantUserId,
    });
    expect(inv.status).toBe('SUBMITTED');

    // Manager approves invoice
    await ApprovalWorkflowService.approveRequest(orgId, 'INVOICE', inv.id, managerUserId, 'Finance Manager');

    // Verify approval request is currently APPROVED
    const reqBefore = await db.query('SELECT status FROM approval_requests WHERE entity_id = $1', [inv.id]);
    expect(reqBefore.rows[0].status).toBe('APPROVED');

    // Execute postApproved within a transaction where audit log write fails
    await expect(
      db.transaction(async (txClient) => {
        await SalesEngine.postApprovedInvoice(orgId, accountantUserId, inv.id, txClient);
        // Injected audit log write failure (e.g. strict audit constraint violation or failure)
        throw new Error('SIMULATED_AUDIT_LOG_INSERT_FAILURE');
      })
    ).rejects.toThrow('SIMULATED_AUDIT_LOG_INSERT_FAILURE');

    // Assert that the entire financial transaction was rolled back:
    // 1. Invoice status is STILL 'SUBMITTED'
    const invAfter = await db.query('SELECT status, journal_entry_id FROM invoices WHERE id = $1', [inv.id]);
    expect(invAfter.rows[0].status).toBe('SUBMITTED');
    expect(invAfter.rows[0].journal_entry_id).toBeNull();

    // 2. Approval request status is STILL 'APPROVED' (not 'CONSUMED')
    const reqAfter = await db.query('SELECT status FROM approval_requests WHERE entity_id = $1', [inv.id]);
    expect(reqAfter.rows[0].status).toBe('APPROVED');

    // 3. Customer AR balance was NOT modified
    const custAfter = await db.query('SELECT receivables_balance FROM customers WHERE id = $1', [customer.id]);
    expect(Number(custAfter.rows[0]?.receivables_balance || 0)).toBe(balanceBefore);

    // 4. No GL lines were committed for this invoice
    const glCheck = await db.query('SELECT count(*) FROM journal_entries WHERE reference = $1', [inv.invoiceNumber]);
    expect(Number(glCheck.rows[0].count)).toBe(0);
  });
});
