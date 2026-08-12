import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('SaaS trust and reliability boundaries', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function register(label: string, role?: string) {
    return request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Trust Test Owner',
      organizationName: 'Trust Test Firm',
      role,
    });
  }

  it('never trusts a self-selected registration role and provisions a tenant chart atomically', async () => {
    const registration = await register('self-role', 'Viewer');
    expect(registration.status).toBe(201);

    const membership = await db.query(
      'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [registration.body.organizationId, registration.body.user.id]
    );
    expect(membership.rows[0].role).toBe('Owner');

    const accounts = await db.query('SELECT code FROM accounts WHERE organization_id = $1', [registration.body.organizationId]);
    expect(accounts.rows.map((row) => row.code)).toEqual(expect.arrayContaining(['1000', '1100', '2000', '4000', '6000']));
  });

  it('rejects base currencies whose minor-unit precision the v1 ledger cannot represent', async () => {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `unsupported-currency-${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Currency Boundary Owner',
      organizationName: 'Unsupported Currency Firm',
      country: 'Japan',
      baseCurrency: 'JPY',
    });
    expect(registration.status).toBe(400);
    expect(registration.body.error).toContain('supported two-decimal base currency');
  });

  it('rejects the former universal development password', async () => {
    const registration = await register('password-bypass');
    const login = await request(app).post('/api/v1/auth/login').send({
      email: registration.body.user.email,
      password: 'AdminPassword123!',
    });
    expect(login.status).toBe(401);
  });

  it('rolls back an expense when its journal cannot be posted', async () => {
    const registration = await register('atomic-expense');
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const before = await db.query('SELECT COUNT(*) AS count FROM expenses WHERE organization_id = $1', [registration.body.organizationId]);

    const response = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .set('Idempotency-Key', `invalid-expense-${Date.now()}`)
      .send({
        expenseNumber: `EXP-INVALID-${Date.now()}`,
        expenseAccountId: 'cross-tenant-or-missing-account',
        paidFromAccountId: 'also-missing',
        date: '2026-08-11',
        amount: 125.25,
      });

    expect(response.status).toBe(422);
    const after = await db.query('SELECT COUNT(*) AS count FROM expenses WHERE organization_id = $1', [registration.body.organizationId]);
    expect(Number(after.rows[0].count)).toBe(Number(before.rows[0].count));
  });

  it('rejects impossible calendar dates before a financial write', async () => {
    const registration = await register('calendar-date');
    const orgId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [orgId]);
    const response = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .set('Idempotency-Key', `invalid-calendar-${Date.now()}`)
      .send({
        expenseAccountId: accounts.rows.find((row) => row.code === '6000').id,
        paidFromAccountId: accounts.rows.find((row) => row.code === '1000').id,
        date: '2026-02-31',
        amount: 10,
      });
    expect(response.status).toBe(400);
    expect(Number((await db.query('SELECT COUNT(*) AS count FROM expenses WHERE organization_id = $1', [orgId])).rows[0].count)).toBe(0);
  });

  it('persists a valid expense, balanced journal, account balances, and audit event together', async () => {
    const registration = await register('balanced-expense');
    const orgId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [orgId]);
    const expenseAccountId = accounts.rows.find((row) => row.code === '6000').id;
    const bankAccountId = accounts.rows.find((row) => row.code === '1000').id;

    const idempotencyKey = `valid-expense-${Date.now()}`;
    const payload = { expenseNumber: `EXP-${Date.now()}`, expenseAccountId, paidFromAccountId: bankAccountId, date: '2026-08-11', amount: 250.75 };
    const response = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(response.status).toBe(201);
    const lines = await db.query('SELECT debit, credit FROM journal_lines WHERE journal_entry_id = $1', [response.body.journalEntryId]);
    const debit = lines.rows.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = lines.rows.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(debit).toBe(250.75);
    expect(credit).toBe(250.75);

    const audit = await db.query(
      'SELECT id FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = $3',
      [orgId, response.body.id, 'EXPENSE_CREATED']
    );
    expect(audit.rows).toHaveLength(1);

    const replay = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);
    expect(replay.status).toBe(201);
    expect(replay.body.id).toBe(response.body.id);
    const oneDocument = await db.query(
      'SELECT COUNT(*) AS count FROM expenses WHERE organization_id = $1 AND id = $2',
      [orgId, response.body.id]
    );
    expect(Number(oneDocument.rows[0].count)).toBe(1);

    const conflicting = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...payload, amount: 250.76 });
    expect(conflicting.status).toBe(409);
  });

  it('voids an expense through an atomic source-document reversal and preserves zero ledger impact', async () => {
    const registration = await register('reverse-expense');
    const orgId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [orgId]);
    const expenseAccountId = accounts.rows.find((row) => row.code === '6000').id;
    const bankAccountId = accounts.rows.find((row) => row.code === '1000').id;
    const created = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .set('Idempotency-Key', `reverse-expense-create-${Date.now()}`)
      .send({ expenseAccountId, paidFromAccountId: bankAccountId, date: '2026-08-11', amount: 41.27 });
    expect(created.status).toBe(201);

    const voided = await request(app)
      .post(`/api/v1/finance/expenses/${created.body.id}/void`)
      .set(auth)
      .set('Idempotency-Key', `reverse-expense-void-${Date.now()}`)
      .send({ reason: 'Duplicate receipt entered by mistake' });
    expect(voided.status).toBe(200);

    const expense = await db.query(
      'SELECT status, journal_entry_id, reversal_journal_id FROM expenses WHERE organization_id = $1 AND id = $2',
      [orgId, created.body.id]
    );
    expect(expense.rows[0].status).toBe('VOIDED');
    const ledger = await db.query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS net
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.organization_id = $1 AND jl.account_id = $2
          AND je.id IN ($3, $4) AND UPPER(je.status) = 'POSTED'`,
      [orgId, expenseAccountId, expense.rows[0].journal_entry_id, expense.rows[0].reversal_journal_id]
    );
    expect(Number(ledger.rows[0].net)).toBe(0);
    expect((await db.query(
      `SELECT id FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'EXPENSE_VOIDED' AND user_id = $3`,
      [orgId, created.body.id, registration.body.user.id]
    )).rows).toHaveLength(1);

    const repeat = await request(app)
      .post(`/api/v1/finance/expenses/${created.body.id}/void`)
      .set(auth)
      .set('Idempotency-Key', `reverse-expense-repeat-${Date.now()}`)
      .send({ reason: 'Attempt a duplicate expense reversal' });
    expect(repeat.status).toBe(422);
  });

  it('reverses an allocated customer payment, reopens the invoice, and nets the bank posting to zero', async () => {
    const registration = await register('reverse-payment');
    const orgId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth)
      .set('Idempotency-Key', `reverse-payment-customer-${Date.now()}`)
      .send({ displayName: 'Payment Reversal Customer' });
    const customerId = customer.body.id || customer.body.customer?.id;
    const invoice = await request(app)
      .post('/api/v1/finance/invoices')
      .set(auth)
      .set('Idempotency-Key', `reverse-payment-invoice-${Date.now()}`)
      .send({
        clientId: customerId,
        issueDate: '2026-08-10',
        dueDate: '2026-09-10',
        items: [{ description: 'Reversal service', quantity: 1, unitPrice: 100, taxRate: 0 }],
      });
    expect(invoice.status).toBe(201);
    const bank = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [orgId]);
    const payment = await request(app)
      .post('/api/v1/finance/payments-received')
      .set(auth)
      .set('Idempotency-Key', `reverse-payment-create-${Date.now()}`)
      .send({
        customerId,
        customerName: 'Payment Reversal Customer',
        paymentDate: '2026-08-11',
        amount: 100,
        paymentMode: 'Bank Transfer',
        depositToAccountId: bank.rows[0].id,
        invoiceId: invoice.body.id,
      });
    expect(payment.status).toBe(201);

    const reversed = await request(app)
      .post('/api/v1/security/reverse-payment')
      .set(auth)
      .set('Idempotency-Key', `reverse-payment-action-${Date.now()}`)
      .send({ paymentId: payment.body.id, reason: 'Customer bank transfer was returned' });
    expect(reversed.status).toBe(200);

    const invoiceState = await db.query(
      'SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2',
      [orgId, invoice.body.id]
    );
    expect(Number(invoiceState.rows[0].paid_amount)).toBe(0);
    expect(Number(invoiceState.rows[0].balance_due)).toBe(100);
    expect(invoiceState.rows[0].status).toBe('POSTED');
    const paymentState = await db.query(
      'SELECT status, journal_entry_id, reversal_journal_id FROM payments_received WHERE organization_id = $1 AND id = $2',
      [orgId, payment.body.id]
    );
    expect(paymentState.rows[0].status).toBe('REVERSED');
    const bankNet = await db.query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS net
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE je.organization_id = $1 AND jl.account_id = $2
          AND je.id IN ($3, $4) AND UPPER(je.status) = 'POSTED'`,
      [orgId, bank.rows[0].id, paymentState.rows[0].journal_entry_id, paymentState.rows[0].reversal_journal_id]
    );
    expect(Number(bankNet.rows[0].net)).toBe(0);
  });

  it('excludes reversed source documents from trusted customer totals and reconciliations', async () => {
    const registration = await register('reversal-reporting');
    const orgId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth)
      .set('Idempotency-Key', `report-customer-${Date.now()}`)
      .send({ displayName: 'Reporting Reversal Customer' });
    const customerId = customer.body.id || customer.body.customer?.id;
    const invoice = await request(app)
      .post('/api/v1/finance/invoices')
      .set(auth)
      .set('Idempotency-Key', `report-invoice-${Date.now()}`)
      .send({
        clientId: customerId,
        issueDate: '2026-08-10',
        dueDate: '2026-09-10',
        items: [{ description: 'Reporting reversal service', quantity: 1, unitPrice: 125, taxRate: 0 }],
      });
    expect(invoice.status).toBe(201);

    const voided = await request(app)
      .post('/api/v1/security/void-invoice')
      .set(auth)
      .set('Idempotency-Key', `report-invoice-void-${Date.now()}`)
      .send({ invoiceId: invoice.body.id, reason: 'Cancel invoice to verify downstream reporting filters' });
    expect(voided.status).toBe(200);

    const summary = await request(app).get(`/api/v1/customers/${customerId}/summary`).set(auth);
    expect(summary.status).toBe(200);
    expect(summary.body.totalSales).toBe(0);
    expect(summary.body.outstandingReceivable).toBe(0);

    const integrity = await request(app).get('/api/v1/ar-integrity').set(auth);
    expect(integrity.status).toBe(200);
    expect(integrity.body.isBalanced).toBe(true);
    expect(integrity.body.expectedAmount).toBe('0.00');
    expect(integrity.body.actualAmount).toBe('0.00');
  });

  it('converts a quotation to one invoice atomically and rejects a duplicate conversion', async () => {
    const registration = await register('single-conversion');
    const orgId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth)
      .set('Idempotency-Key', `customer-${Date.now()}`)
      .send({ displayName: 'Conversion Trust Customer' });
    expect(customer.status).toBe(201);

    const quotation = await request(app)
      .post('/api/v1/quotations')
      .set(auth)
      .set('Idempotency-Key', `quotation-${Date.now()}`)
      .send({
        customerId: customer.body.id || customer.body.customer?.id,
        status: 'SENT',
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [{ name: 'Controlled conversion', quantity: 1, rate: 1000, taxRate: 18 }],
      });
    expect(quotation.status).toBe(201);
    const quotationId = quotation.body.quotation.id;

    const first = await request(app)
      .post(`/api/v1/quotations/${quotationId}/convert-inv`)
      .set(auth)
      .set('Idempotency-Key', `convert-first-${Date.now()}`);
    expect(first.status).toBe(200);

    const duplicate = await request(app)
      .post(`/api/v1/quotations/${quotationId}/convert-inv`)
      .set(auth)
      .set('Idempotency-Key', `convert-duplicate-${Date.now()}`);
    expect(duplicate.status).toBe(409);

    const invoices = await db.query(
      'SELECT id, journal_entry_id FROM invoices WHERE organization_id = $1 AND estimate_id = $2',
      [orgId, quotationId]
    );
    expect(invoices.rows).toHaveLength(1);
    expect(invoices.rows[0].journal_entry_id).toBeTruthy();

    const actorAudit = await db.query(
      `SELECT user_id FROM audit_logs
        WHERE organization_id = $1 AND entity_id = $2 AND action = 'INVOICE_POSTED'`,
      [orgId, invoices.rows[0].id]
    );
    expect(actorAudit.rows).toHaveLength(1);
    expect(actorAudit.rows[0].user_id).toBe(registration.body.user.id);
  });

  it('keeps public quotation responses idempotent and prevents contradictory final decisions', async () => {
    const registration = await register('public-finality');
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const customer = await request(app)
      .post('/api/v1/customers')
      .set(auth)
      .set('Idempotency-Key', `public-customer-${Date.now()}`)
      .send({ displayName: 'Public Decision Customer' });
    const quotation = await request(app)
      .post('/api/v1/quotations')
      .set(auth)
      .set('Idempotency-Key', `public-quotation-${Date.now()}`)
      .send({
        customerId: customer.body.id || customer.body.customer?.id,
        status: 'SENT',
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [{ name: 'Public decision', quantity: 1, rate: 500, taxRate: 0 }],
      });
    const token = quotation.body.quotation.publicToken;

    const accepted = await request(app)
      .post(`/api/v1/public/quotation/${token}/respond`)
      .send({ status: 'ACCEPTED', notes: 'Approved' });
    expect(accepted.status).toBe(200);
    const repeated = await request(app)
      .post(`/api/v1/public/quotation/${token}/respond`)
      .send({ status: 'ACCEPTED', notes: 'Approved' });
    expect(repeated.status).toBe(200);
    const contradictory = await request(app)
      .post(`/api/v1/public/quotation/${token}/respond`)
      .send({ status: 'DECLINED', notes: 'Changed mind' });
    expect(contradictory.status).toBe(409);

    const revisions = await db.query(
      `SELECT COUNT(*) AS count FROM quotation_revisions WHERE quotation_id = $1 AND status = 'ACCEPTED'`,
      [quotation.body.quotation.id]
    );
    expect(Number(revisions.rows[0].count)).toBe(1);
  });
});
