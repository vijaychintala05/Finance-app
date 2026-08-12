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

  it('persists a valid expense, balanced journal, account balances, and audit event together', async () => {
    const registration = await register('balanced-expense');
    const orgId = registration.body.organizationId;
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [orgId]);
    const expenseAccountId = accounts.rows.find((row) => row.code === '6000').id;
    const bankAccountId = accounts.rows.find((row) => row.code === '1000').id;

    const response = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .set('Idempotency-Key', `valid-expense-${Date.now()}`)
      .send({ expenseNumber: `EXP-${Date.now()}`, expenseAccountId, paidFromAccountId: bankAccountId, date: '2026-08-11', amount: 250.75 });

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
