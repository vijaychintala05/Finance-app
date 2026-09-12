import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';

describe('Edit Customer Payment Received Integration Tests', () => {
  let orgId: string;
  let ownerId: string;
  let bankAccountId: string;
  let customerId: string;
  let customerName: string;

  beforeEach(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
    orgId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
    ownerId = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;

    // Get asset bank accounts
    const bankRes = await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND code LIKE '10%' ORDER BY code ASC`,
      [orgId]
    );
    bankAccountId = bankRes.rows[0].id;

    const customer = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1;
    customerId = customer.id;
    customerName = customer.name;
  });

  it('1. updates non-financial metadata (reference, notes, paymentMode) without mutating journal entry', async () => {
    // 1. Create invoice for $1000
    const inv = await SalesEngine.createAndPostInvoice(orgId, {
      customerId,
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      lineItems: [{ description: 'Consulting services', quantity: 1, unitPrice: 1000, taxRate: 0 }],
    });

    // 2. Record payment of $400 against invoice
    const pmt = await SalesEngine.recordPayment(orgId, {
      customerId,
      customerName,
      invoiceId: inv.id,
      amount: 400,
      paymentDate: '2026-09-05',
      paymentMode: 'Bank Transfer',
      depositToAccountId: bankAccountId,
      reference: 'WIRE-INIT-001',
      notes: 'Initial deposit',
    });

    expect(pmt.id).toBeDefined();
    expect(pmt.journalEntryId).toBeTruthy();

    // Verify invoice balance
    const invAfter1 = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter1.paid_amount)).toBe(400);
    expect(Number(invAfter1.balance_due)).toBe(600);
    expect(invAfter1.status).toBe('PARTIALLY_PAID');

    // 3. Perform metadata update via updateOrCorrectCustomerPayment
    const updateResult = await SalesEngine.updateOrCorrectCustomerPayment(orgId, ownerId, pmt.id, {
      reference: 'WIRE-UPDATED-002',
      notes: 'Customer confirmed transaction ref',
      paymentMode: 'UPI',
    });

    expect(updateResult).toBeDefined();

    // 4. Verify payment in DB
    const pmtDb = (await db.query(`SELECT * FROM payments_received WHERE id = $1`, [pmt.id])).rows[0];
    expect(pmtDb.reference).toBe('WIRE-UPDATED-002');
    expect(pmtDb.notes).toBe('Customer confirmed transaction ref');
    expect(pmtDb.payment_mode).toBe('UPI');
    expect(pmtDb.journal_entry_id).toBe(pmt.journalEntryId); // Journal entry remains identical!
    expect(pmtDb.status).not.toBe('REVERSED');

    // 5. Verify invoice balance unchanged
    const invAfter2 = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter2.paid_amount)).toBe(400);
    expect(Number(invAfter2.balance_due)).toBe(600);
  });

  it('2. performs audited financial adjustment when amount changes, updating ledger & invoice balances', async () => {
    // 1. Create invoice for $1000
    const inv = await SalesEngine.createAndPostInvoice(orgId, {
      customerId,
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      lineItems: [{ description: 'Engineering design', quantity: 1, unitPrice: 1000, taxRate: 0 }],
    });

    // 2. Record initial payment of $300
    const initialPayment = await SalesEngine.recordPayment(orgId, {
      customerId,
      customerName,
      invoiceId: inv.id,
      amount: 300,
      paymentDate: '2026-09-05',
      paymentMode: 'Bank Transfer',
      depositToAccountId: bankAccountId,
      reference: 'INITIAL-300',
    });

    // 3. Edit payment to $750 (increase received amount)
    const result = await SalesEngine.updateOrCorrectCustomerPayment(orgId, ownerId, initialPayment.id, {
      amount: 750,
      invoiceId: inv.id,
      reason: 'Under-reported remittance corrected after bank statement verification',
    });

    expect(result.success).toBe(true);
    expect(result.payment).toBeDefined();
    expect(result.payment.amount).toBe(750);
    expect(result.correction.voidedPaymentId).toBe(initialPayment.id);

    // 4. Verify original payment was reversed with reversal journal
    const origPmtDb = (await db.query(`SELECT * FROM payments_received WHERE id = $1`, [initialPayment.id])).rows[0];
    expect(origPmtDb.status).toBe('REVERSED');
    expect(origPmtDb.reversal_journal_id).toBeTruthy();

    // 5. Verify invoice balances updated accurately to 750 paid / 250 balance due
    const invAfter = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter.paid_amount)).toBe(750);
    expect(Number(invAfter.balance_due)).toBe(250);
    expect(invAfter.status).toBe('PARTIALLY_PAID');

    // 6. Verify new replacement payment in DB
    const newPmtDb = (await db.query(`SELECT * FROM payments_received WHERE id = $1`, [result.payment.id])).rows[0];
    expect(Number(newPmtDb.amount)).toBe(750);
    expect(newPmtDb.status).toBe('ALLOCATED');
    expect(newPmtDb.journal_entry_id).toBeTruthy();

    // 7. Verify journal entries balance:
    // Replacement journal has debit 750 and credit 750
    const linesRes = await db.query(
      `SELECT SUM(debit) as total_debit, SUM(credit) as total_credit FROM journal_lines WHERE journal_entry_id = $1`,
      [newPmtDb.journal_entry_id]
    );
    expect(Number(linesRes.rows[0].total_debit)).toBe(750);
    expect(Number(linesRes.rows[0].total_credit)).toBe(750);
  });

  it('3. performs audited financial adjustment when payment date changes', async () => {
    const inv = await SalesEngine.createAndPostInvoice(orgId, {
      customerId,
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      lineItems: [{ description: 'Audit services', quantity: 1, unitPrice: 500, taxRate: 0 }],
    });

    const pmt = await SalesEngine.recordPayment(orgId, {
      customerId,
      customerName,
      invoiceId: inv.id,
      amount: 500,
      paymentDate: '2026-09-05',
      paymentMode: 'Cheque',
      depositToAccountId: bankAccountId,
      reference: 'CHQ-001',
    });

    // Correct the date from 2026-09-05 to 2026-09-08
    const result = await SalesEngine.updateOrCorrectCustomerPayment(orgId, ownerId, pmt.id, {
      paymentDate: '2026-09-08',
      reason: 'Value date cleared on Sep 8th',
    });

    expect(result.success).toBe(true);
    expect(result.payment.paymentDate).toBe('2026-09-08');

    // Verify invoice remains PAID
    const invAfter = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter.paid_amount)).toBe(500);
    expect(Number(invAfter.balance_due)).toBe(0);
    expect(invAfter.status).toBe('PAID');
  });

  it('4. invalidates active approval requests on payment modification', async () => {
    const inv = await SalesEngine.createAndPostInvoice(orgId, {
      customerId,
      issueDate: '2026-09-01',
      dueDate: '2026-09-30',
      lineItems: [{ description: 'Software license', quantity: 1, unitPrice: 2000, taxRate: 0 }],
    });

    const pmt = await SalesEngine.recordPayment(orgId, {
      customerId,
      customerName,
      invoiceId: inv.id,
      amount: 1000,
      paymentDate: '2026-09-05',
      paymentMode: 'Bank Wire',
      depositToAccountId: bankAccountId,
      reference: 'WIRE-APPROVAL-TEST',
    });

    // Submit approval request for this payment
    const req = await ApprovalWorkflowService.submitForApproval(orgId, 'CUSTOMER_PAYMENT', pmt.id, ownerId, 1000);
    expect(req.status).toBe('SUBMITTED');

    // Edit metadata of payment
    await SalesEngine.updateOrCorrectCustomerPayment(orgId, ownerId, pmt.id, {
      reference: 'WIRE-MODIFIED-APPROVAL',
    });

    // Verify approval request was transitioned to REJECTED
    const reqAfter = await db.query('SELECT * FROM approval_requests WHERE id = $1', [req.id]);
    expect(reqAfter.rows[0].status).toBe('REJECTED');
    expect(reqAfter.rows[0].rejection_reason).toContain('Document modified after submission');
  });
});
