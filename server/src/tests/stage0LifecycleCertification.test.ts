import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { SalesEngine } from '../sales/SalesEngine';

describe('Stage 0: Certify Existing Invoice & Expense Lifecycle', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function tenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Lifecycle Test User',
      organizationName: `${label} Lifecycle Corp`,
    });
    return {
      orgId: registration.body.organizationId,
      userId: registration.body.user.id,
      auth: { Authorization: `Bearer ${registration.body.token}` },
    };
  }

  async function fixture(label: string) {
    const context = await tenant(label);
    const client = await request(app)
      .post('/api/v1/finance/clients')
      .set(context.auth)
      .send({ name: `${label} Customer`, email: `${label}@clientcorp.com` });

    const accounts = await db.query(
      'SELECT id, code, name FROM accounts WHERE organization_id = $1',
      [context.orgId]
    );

    const expenseAccount = accounts.rows.find((row) => row.code === '6000') || accounts.rows.find((row) => row.code.startsWith('6'));
    const paymentAccount = accounts.rows.find((row) => row.code === '1000') || accounts.rows.find((row) => row.code.startsWith('10'));

    return {
      ...context,
      client: client.body,
      expenseAccountId: expenseAccount.id,
      paidFromAccountId: paymentAccount.id,
    };
  }

  it('1. sendInvoiceEmail on a DRAFT invoice canonically posts the invoice and creates a balanced journal', async () => {
    const f = await fixture('draft-email-post');

    // Create a billable expense
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        vendorName: 'Acme Supplies',
        date: '2026-09-01',
        amount: 500.0,
        clientId: f.client.id,
        customerId: f.client.id,
        isBillable: true,
        description: 'Client recoverable travel',
      });
    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // Create a DRAFT invoice directly
    const invRes = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id,
      customerName: 'Client Customer',
      customerEmail: 'client@clientcorp.com',
      issueDate: '2026-09-02',
      dueDate: '2026-09-15',
      lineItems: [
        { description: 'Recoverable travel reimbursement', quantity: 1, unitPrice: 500.0, taxRate: 0 },
      ],
      status: 'DRAFT',
      createdBy: f.userId,
    } as any, f.userId);

    expect(invRes.status).toBe('DRAFT');
    expect(invRes.journalEntryId).toBeFalsy();

    // Link the expense to this draft invoice
    await db.query(
      `UPDATE expenses SET invoice_id = $1, is_billed = FALSE WHERE organization_id = $2 AND id = $3`,
      [invRes.id, f.orgId, expenseId]
    );

    // Call send-email on the draft invoice
    const sendRes = await request(app)
      .post(`/api/v1/finance/invoices/${invRes.id}/send-email`)
      .set(f.auth)
      .send({
        recipientEmail: 'client@clientcorp.com',
        subject: 'Your Invoice',
        message: 'Please review and pay.',
      });

    expect(sendRes.status).toBe(200);
    expect(sendRes.body.success).toBe(true);

    // Verify invoice is now POSTED with a certified journal
    const invoiceAfter = await db.query(
      `SELECT status, journal_entry_id, total_amount, balance_due FROM invoices WHERE organization_id = $1 AND id = $2`,
      [f.orgId, invRes.id]
    );
    expect(invoiceAfter.rows[0].status).toBe('POSTED');
    expect(invoiceAfter.rows[0].journal_entry_id).toBeTruthy();

    // Verify journal lines exist and balance
    const journalLines = await db.query(
      `SELECT debit, credit, account_code FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2`,
      [f.orgId, invoiceAfter.rows[0].journal_entry_id]
    );
    expect(journalLines.rows.length).toBeGreaterThanOrEqual(2);
    const totalDebit = journalLines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = journalLines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(500.0);
    expect(totalCredit).toBe(500.0);

    // Verify linked expense was marked is_billed = true
    const expAfter = await db.query(
      `SELECT is_billed, invoice_id FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expAfter.rows[0].is_billed).toBe(true);
    expect(expAfter.rows[0].invoice_id).toBe(invRes.id);

    // Verify customer receivables_balance increased
    const custAfter = await db.query(
      `SELECT receivables_balance FROM customers WHERE organization_id = $1 AND id = $2`,
      [f.orgId, f.client.id]
    );
    expect(Number(custAfter.rows[0].receivables_balance)).toBe(500.0);
  });

  it('2. sendInvoiceEmail rejects sending when an invoice is pending approval or voided', async () => {
    const f = await fixture('approval-email-gate');

    // Create an invoice in DRAFT status
    const invRes = await SalesEngine.createAndPostInvoice(f.orgId, {
      customerId: f.client.id,
      customerName: 'Client Customer',
      customerEmail: 'client@clientcorp.com',
      issueDate: '2026-09-02',
      dueDate: '2026-09-15',
      lineItems: [{ description: 'High value item', quantity: 1, unitPrice: 2000.0, taxRate: 0 }],
      status: 'DRAFT',
      createdBy: f.userId,
    } as any, f.userId);

    // Transition directly to SUBMITTED without journal entry (awaiting approval)
    await db.query(
      `UPDATE invoices SET status = 'SUBMITTED', journal_entry_id = NULL WHERE organization_id = $1 AND id = $2`,
      [f.orgId, invRes.id]
    );

    // Attempting to send-email on SUBMITTED must fail with 422
    const subRes = await request(app)
      .post(`/api/v1/finance/invoices/${invRes.id}/send-email`)
      .set(f.auth)
      .send({ recipientEmail: 'client@clientcorp.com' });

    expect(subRes.status).toBe(422);
    expect(subRes.body.error).toContain('awaiting approval');

    // Mark invoice VOIDED and verify rejection with 400
    await db.query(`UPDATE invoices SET status = 'VOIDED' WHERE organization_id = $1 AND id = $2`, [f.orgId, invRes.id]);
    const voidRes = await request(app)
      .post(`/api/v1/finance/invoices/${invRes.id}/send-email`)
      .set(f.auth)
      .send({ recipientEmail: 'client@clientcorp.com' });

    expect(voidRes.status).toBe(400);
    expect(voidRes.body.error).toContain('voided');
  });

  it('3. voidInvoice releases linked billable expenses back to unbilled with audit trail', async () => {
    const f = await fixture('void-release-expenses');

    // 1. Create a billable expense
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        vendorName: 'Vendor Services',
        date: '2026-09-05',
        amount: 320.0,
        clientId: f.client.id,
        customerId: f.client.id,
        isBillable: true,
        description: 'Software license to reimburse',
      });
    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // 2. Convert to posted customer invoice
    const convertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-09-06', dueDate: '2026-09-20' });

    expect(convertRes.status).toBe(201);
    const invoiceId = convertRes.body.invoice.id;

    // Verify expense is billed
    const expBilled = await db.query(
      `SELECT is_billed, invoice_id FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expBilled.rows[0].is_billed).toBe(true);
    expect(expBilled.rows[0].invoice_id).toBe(invoiceId);

    // 3. Void the customer invoice
    const voidResult = await FinancialDestructiveActionsService.voidInvoice(
      f.orgId,
      invoiceId,
      f.userId,
      'Customer project cancelled by mutual agreement'
    );
    expect(voidResult.success).toBe(true);

    // 4. Verify the linked expense was released back to unbilled!
    const expReleased = await db.query(
      `SELECT is_billed, invoice_id, is_billable FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expReleased.rows[0].is_billed).toBe(false);
    expect(expReleased.rows[0].invoice_id).toBeNull();
    expect(expReleased.rows[0].is_billable).toBe(true);

    // 5. Verify audit log recorded EXPENSES_RELEASED_FROM_VOIDED_INVOICE
    const auditLogs = await db.query(
      `SELECT action, after_state FROM audit_logs
        WHERE organization_id = $1 AND entity_type = 'Invoice' AND entity_id = $2 AND action = 'EXPENSES_RELEASED_FROM_VOIDED_INVOICE'`,
      [f.orgId, invoiceId]
    );
    expect(auditLogs.rows.length).toBe(1);

    // 6. Verify the released expense can now be converted to a NEW invoice!
    const reconvertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-09-10', dueDate: '2026-09-25' });

    expect(reconvertRes.status).toBe(201);
    expect(reconvertRes.body.invoice.id).not.toBe(invoiceId);
  });

  it('4. voidExpense is rejected when the expense is linked to an active customer invoice', async () => {
    const f = await fixture('void-expense-guard');

    // 1. Create billable expense
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        vendorName: 'Tool Rental Co',
        date: '2026-09-08',
        amount: 750.0,
        clientId: f.client.id,
        customerId: f.client.id,
        isBillable: true,
        description: 'Equipment rental',
      });
    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // 2. Convert to posted customer invoice
    const convertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-09-09', dueDate: '2026-09-23' });
    expect(convertRes.status).toBe(201);
    const invoiceId = convertRes.body.invoice.id;

    // 3. Attempting to void the billed expense directly must fail!
    await expect(
      FinancialDestructiveActionsService.voidExpense(
        f.orgId,
        expenseId,
        f.userId,
        'Attempting to void billed expense'
      )
    ).rejects.toThrow(/EXPENSE_ALREADY_BILLED/);

    // Verify expense is still valid and not voided
    const expCheck = await db.query(
      `SELECT status, is_billed FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expCheck.rows[0].status).not.toBe('VOIDED');
    expect(expCheck.rows[0].is_billed).toBe(true);

    // 4. Void the invoice first
    await FinancialDestructiveActionsService.voidInvoice(
      f.orgId,
      invoiceId,
      f.userId,
      'Voiding invoice to free expense'
    );

    // 5. Now voiding the released expense must succeed!
    const voidExpResult = await FinancialDestructiveActionsService.voidExpense(
      f.orgId,
      expenseId,
      f.userId,
      'Now voiding released expense'
    );
    expect(voidExpResult.success).toBe(true);

    const expFinal = await db.query(
      `SELECT status, reversal_journal_id FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(expFinal.rows[0].status).toBe('VOIDED');
    expect(expFinal.rows[0].reversal_journal_id).toBeTruthy();
  });

  it('5. runRecoverableCostPreflightAudit detects unposted invoices and orphaned states non-destructively', async () => {
    const f = await fixture('preflight-audit');

    // Clean initial state
    const initialAudit = await AccountingIntegrityService.runRecoverableCostPreflightAudit(f.orgId);
    expect(initialAudit.isClean).toBe(true);
    expect(initialAudit.unpostedInvoiceCount).toBe(0);
    expect(initialAudit.orphanedBilledExpenseCount).toBe(0);
    expect(initialAudit.expensesLinkedToVoidInvoicesCount).toBe(0);

    // Inject a simulated legacy uncertified posted invoice (POSTED without journal_entry_id)
    const testInvId = `inv-corrupt-${Date.now()}`;
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, total_amount, balance_due, status, issue_date, due_date)
       VALUES ($1, $2, $3, 'Legacy Customer', 1200, 1200, 'POSTED', '2026-01-01', '2026-01-15')`,
      [testInvId, f.orgId, `INV-LEGACY-001`]
    );

    // Inject an orphaned billed expense (is_billed = TRUE without invoice_id)
    const testExpId = `exp-corrupt-${Date.now()}`;
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, amount, date, is_billed, is_billable, status)
       VALUES ($1, $2, $3, $4, $5, 400, '2026-01-01', TRUE, TRUE, 'POSTED')`,
      [testExpId, f.orgId, `EXP-LEGACY-001`, f.expenseAccountId, f.paidFromAccountId]
    );

    // Run audit and verify detections
    const auditReport = await AccountingIntegrityService.runRecoverableCostPreflightAudit(f.orgId);
    expect(auditReport.isClean).toBe(false);
    expect(auditReport.unpostedInvoiceCount).toBe(1);
    expect(auditReport.unpostedInvoices[0].invoiceNumber).toBe('INV-LEGACY-001');
    expect(auditReport.orphanedBilledExpenseCount).toBe(1);
    expect(auditReport.orphanedBilledExpenses[0].expenseNumber).toBe('EXP-LEGACY-001');

    // Clean up test anomalies so tenant is left clean
    await db.query(`DELETE FROM invoices WHERE organization_id = $1 AND id = $2`, [f.orgId, testInvId]);
    await db.query(`DELETE FROM expenses WHERE organization_id = $1 AND id = $2`, [f.orgId, testExpId]);

    const finalAudit = await AccountingIntegrityService.runRecoverableCostPreflightAudit(f.orgId);
    expect(finalAudit.isClean).toBe(true);
  });
});
