import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { SalesEngine } from '../sales/SalesEngine';

describe('Zoho Books Customer-Billable Recoverable Expenses', () => {
  beforeAll(async () => MigrationRunner.runMigrations());

  async function tenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Billable Expense Manager',
      organizationName: `${label} Accounting Corp`,
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
      .send({ name: `${label} Acme Client`, email: `${label}@acme.com` });

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

  it('1. rejects billable expense when no customer is assigned', async () => {
    const f = await fixture('no-cust');

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-08-15',
        amount: 350.0,
        isBillable: true, // Billable checked, but no customer!
        description: 'Vendor travel cost without client',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('EXPENSE_CUSTOMER_REQUIRED');
  });

  it('2. rejects billable expense when assigned customer does not exist or belongs to another tenant', async () => {
    const f1 = await fixture('cust-tenant1');
    const f2 = await fixture('cust-tenant2');

    const crossTenantRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f1.auth)
      .send({
        expenseAccountId: f1.expenseAccountId,
        paidFromAccountId: f1.paidFromAccountId,
        clientId: f2.client.id, // from f2 tenant!
        date: '2026-08-15',
        amount: 500.0,
        isBillable: true,
        description: 'Cross tenant customer expense',
      });

    expect(crossTenantRes.status).toBe(400);
    expect(crossTenantRes.body.error).toContain('EXPENSE_CUSTOMER_INVALID');
  });

  it('3. creates customer-billable expense and records isBillable = true, isBilled = false', async () => {
    const f = await fixture('billable-create');

    const expenseRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        clientId: f.client.id,
        vendorName: 'IndiGo Airlines',
        date: '2026-08-16',
        amount: 4500.0,
        isBillable: true,
        description: 'Client onsite travel flight tickets',
      });

    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body.isBillable).toBe(true);
    expect(expenseRes.body.clientId).toBe(f.client.id);

    // Verify database record
    const dbRow = await db.query(
      'SELECT id, is_billable, is_billed, invoice_id, client_id FROM expenses WHERE id = $1',
      [expenseRes.body.id]
    );
    expect(dbRow.rows[0].is_billable).toBe(true);
    expect(dbRow.rows[0].is_billed).toBe(false);
    expect(dbRow.rows[0].invoice_id).toBeNull();
    expect(dbRow.rows[0].client_id).toBe(f.client.id);

    // Verify GET /finance/expenses returns client_name and billable flags
    const listRes = await request(app)
      .get('/api/v1/finance/expenses')
      .set(f.auth);

    expect(listRes.status).toBe(200);
    const item = listRes.body.find((e: any) => e.id === expenseRes.body.id);
    expect(item).toBeDefined();
    expect(item.clientName).toBe(f.client.name);
    expect(item.isBillable).toBe(true);
    expect(item.isBilled).toBe(false);
    expect(item.invoiceId).toBeUndefined();
  });

  it('4. converts unbilled billable expense into an authoritative customer invoice', async () => {
    const f = await fixture('convert-invoice');

    // 1. Post billable expense
    const expenseRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        clientId: f.client.id,
        vendorName: 'AWS Cloud Services',
        date: '2026-08-17',
        amount: 1850.75,
        isBillable: true,
        description: 'Dedicated cloud server hosting for client',
      });
    expect(expenseRes.status).toBe(201);
    const expenseId = expenseRes.body.id;

    // 2. Convert to invoice
    const convertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({
        issueDate: '2026-08-18',
        dueDate: '2026-09-18',
      });

    expect(convertRes.status).toBe(201);
    expect(convertRes.body.invoice).toBeDefined();
    expect(convertRes.body.invoice.customerId).toBe(f.client.id);
    expect(Number(convertRes.body.invoice.totalAmount)).toBe(1850.75);
    expect(convertRes.body.expense.isBilled).toBe(true);
    expect(convertRes.body.expense.invoiceId).toBe(convertRes.body.invoice.id);

    // 3. Verify in DB that is_billed = TRUE and invoice_id is set
    const dbCheck = await db.query(
      'SELECT is_billed, invoice_id FROM expenses WHERE id = $1',
      [expenseId]
    );
    expect(dbCheck.rows[0].is_billed).toBe(true);
    expect(dbCheck.rows[0].invoice_id).toBe(convertRes.body.invoice.id);

    // 4. Verify in GET /finance/expenses that invoice number and isBilled = true are returned
    const listRes = await request(app)
      .get('/api/v1/finance/expenses')
      .set(f.auth);
    const item = listRes.body.find((e: any) => e.id === expenseId);
    expect(item.isBilled).toBe(true);
    expect(item.invoiceId).toBe(convertRes.body.invoice.id);
    expect(item.customerInvoiceNumber).toBe(convertRes.body.invoice.invoiceNumber);

    // 5. Verify double-billing lock: attempting second conversion returns 409 Conflict
    const secondConvertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({
        issueDate: '2026-08-18',
        dueDate: '2026-09-18',
      });
    expect(secondConvertRes.status).toBe(409);
    expect(secondConvertRes.body.error).toContain('already been billed');
  });

  it('5. prevents converting non-billable or voided expenses to invoice', async () => {
    const f = await fixture('non-billable-guard');

    // Non-billable expense
    const nonBillable = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-08-18',
        amount: 300.0,
        isBillable: false,
        description: 'Internal office tea and coffee',
      });
    expect(nonBillable.status).toBe(201);

    const convertNonBillable = await request(app)
      .post(`/api/v1/finance/expenses/${nonBillable.body.id}/convert-to-invoice`)
      .set(f.auth)
      .send({});
    expect(convertNonBillable.status).toBe(422);
    expect(convertNonBillable.body.error).toContain('not marked as billable');

    // Billable expense that gets voided
    const billable = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        clientId: f.client.id,
        date: '2026-08-18',
        amount: 800.0,
        isBillable: true,
        description: 'To be voided expense',
      });
    expect(billable.status).toBe(201);

    // Void the expense
    const voidRes = await request(app)
      .post(`/api/v1/finance/expenses/${billable.body.id}/void`)
      .set(f.auth)
      .send({ reason: 'Incorrect vendor invoice amount' });
    expect(voidRes.status).toBe(200);

    // Attempt to convert voided expense
    const convertVoided = await request(app)
      .post(`/api/v1/finance/expenses/${billable.body.id}/convert-to-invoice`)
      .set(f.auth)
      .send({});
    expect(convertVoided.status).toBe(422);
    expect(convertVoided.body.error).toContain('Voided expenses cannot be billed');
  });

  it('6. reserves an expense during invoice approval and marks it billed only after posting', async () => {
    const f = await fixture('approval-reservation');
    await ApprovalWorkflowService.configureApprovalRule(f.orgId, {
      entityType: 'INVOICE',
      isRequired: true,
      thresholdAmount: 1,
      approverRole: 'Owner',
      allowSelfApproval: true,
      userId: f.userId,
    });

    const expenseRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        clientId: f.client.id,
        date: '2026-08-19',
        amount: 1900,
        isBillable: true,
        description: 'Recoverable service cost requiring invoice approval',
      });
    expect(expenseRes.status).toBe(201);

    const convertRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseRes.body.id}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-08-20', dueDate: '2026-09-20' });
    expect(convertRes.status).toBe(201);
    expect(convertRes.body.invoice.status).toBe('SUBMITTED');
    expect(convertRes.body.expense.isBilled).toBe(false);

    const beforePosting = await db.query(
      'SELECT is_billed, invoice_id FROM expenses WHERE organization_id = $1 AND id = $2',
      [f.orgId, expenseRes.body.id]
    );
    expect(beforePosting.rows[0].is_billed).toBe(false);
    expect(beforePosting.rows[0].invoice_id).toBe(convertRes.body.invoice.id);

    const duplicate = await request(app)
      .post(`/api/v1/finance/expenses/${expenseRes.body.id}/convert-to-invoice`)
      .set(f.auth)
      .send({ issueDate: '2026-08-20', dueDate: '2026-09-20' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toContain('awaiting invoice approval');

    const requestForInvoice = await ApprovalWorkflowService.getApprovalRequestByEntity(f.orgId, 'INVOICE', convertRes.body.invoice.id);
    await ApprovalWorkflowService.approveRequestById(f.orgId, requestForInvoice!.id, { userId: f.userId, role: 'Owner' });
    const posted = await SalesEngine.postApprovedInvoice(f.orgId, f.userId, convertRes.body.invoice.id);
    expect(posted.status).toBe('POSTED');
    expect(posted.journalEntryId).toBeTruthy();

    const afterPosting = await db.query(
      'SELECT is_billed, invoice_id FROM expenses WHERE organization_id = $1 AND id = $2',
      [f.orgId, expenseRes.body.id]
    );
    expect(afterPosting.rows[0].is_billed).toBe(true);
    expect(afterPosting.rows[0].invoice_id).toBe(convertRes.body.invoice.id);
  });
});
