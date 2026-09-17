import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Stage 2: Customer Invoice Unbilled Expense Selection & Batch Linking Certification', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function tenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Stage 2 Test User',
      organizationName: `${label} Invoicing Corp`,
    });
    return {
      orgId: registration.body.organizationId,
      userId: registration.body.user.id,
      auth: { Authorization: `Bearer ${registration.body.token}` },
    };
  }

  async function fixture(label: string) {
    const context = await tenant(label);
    const clientA = await request(app)
      .post('/api/v1/finance/clients')
      .set(context.auth)
      .send({ name: `${label} Client A`, email: `${label}A@clientcorp.com` });

    const clientB = await request(app)
      .post('/api/v1/finance/clients')
      .set(context.auth)
      .send({ name: `${label} Client B`, email: `${label}B@clientcorp.com` });

    const accounts = await db.query(
      'SELECT id, code, name FROM accounts WHERE organization_id = $1',
      [context.orgId]
    );

    const expenseAccount = accounts.rows.find((row) => row.code === '6000') || accounts.rows.find((row) => row.code.startsWith('6'));
    const paymentAccount = accounts.rows.find((row) => row.code === '1000') || accounts.rows.find((row) => row.code.startsWith('10'));

    return {
      ...context,
      clientA: clientA.body,
      clientB: clientB.body,
      expenseAccountId: expenseAccount.id,
      paidFromAccountId: paymentAccount.id,
    };
  }

  it('1. Correctly filters unbilled billable expenses by clientId, isBillable, and isBilled', async () => {
    const f = await fixture('s2-filter');

    // Expense 1: Client A, Billable with 20% markup (1,000 -> 1,200), Unbilled
    const exp1 = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 1000,
        clientId: f.clientA.id,
        isBillable: true,
        markupPercentage: 20,
        description: 'Site survey travel',
      });
    expect(exp1.status).toBe(201);

    // Expense 2: Client A, Non-billable
    const exp2 = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 500,
        clientId: f.clientA.id,
        isBillable: false,
        description: 'Office supplies',
      });
    expect(exp2.status).toBe(201);

    // Expense 3: Client B, Billable
    const exp3 = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 800,
        clientId: f.clientB.id,
        isBillable: true,
        markupPercentage: 10,
        description: 'Software license',
      });
    expect(exp3.status).toBe(201);

    // Query unbilled expenses for Client A
    const listA = await request(app)
      .get(`/api/v1/finance/expenses?clientId=${f.clientA.id}&isBillable=true&isBilled=false`)
      .set(f.auth);

    expect(listA.status).toBe(200);
    expect(listA.body.length).toBe(1);
    expect(listA.body[0].id).toBe(exp1.body.id);
    expect(listA.body[0].sellingPrice).toBe(1200);
    expect(listA.body[0].markupPercentage).toBe(20);

    // Query unbilled expenses for Client B
    const listB = await request(app)
      .get(`/api/v1/finance/expenses?clientId=${f.clientB.id}&isBillable=true&isBilled=false`)
      .set(f.auth);

    expect(listB.status).toBe(200);
    expect(listB.body.length).toBe(1);
    expect(listB.body[0].id).toBe(exp3.body.id);
    expect(listB.body[0].sellingPrice).toBe(880);
  });

  it('2. Atomically links multiple selected unbilled expenses to a newly posted invoice', async () => {
    const f = await fixture('s2-batch-link');

    // Create Expense 1: ₹1,000 + 15% markup = ₹1,150
    const exp1 = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 1000,
        clientId: f.clientA.id,
        isBillable: true,
        markupPercentage: 15,
        description: 'Specialist consulting travel',
      });

    // Create Expense 2: ₹2,000 + 10% markup = ₹2,200
    const exp2 = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 2000,
        clientId: f.clientA.id,
        isBillable: true,
        markupPercentage: 10,
        description: 'Materials & Equipment rental',
      });
    expect(exp1.status).toBe(201);
    expect(exp2.status).toBe(201);
    console.log('EXP1 ID:', exp1.body.id, 'EXP2 ID:', exp2.body.id);
    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set(f.auth)
      .send({
        clientId: f.clientA.id,
        clientName: f.clientA.name,
        issueDate: '2026-09-17',
        dueDate: '2026-10-17',
        items: [
          {
            description: 'Specialist consulting travel',
            quantity: 1,
            unitPrice: 1150,
            amount: 1150,
            taxRate: 0,
          },
          {
            description: 'Materials & Equipment rental',
            quantity: 1,
            unitPrice: 2200,
            amount: 2200,
            taxRate: 0,
          },
        ],
        expenseIds: [exp1.body.id, exp2.body.id],
      });

    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.id;
    expect(invoiceId).toBeDefined();
    expect(invRes.body.totalAmount).toBe(3350);

    // Verify in database that both expenses are marked is_billed = TRUE and linked to invoiceId
    const checkExpenses = await db.query(
      `SELECT id, is_billed, invoice_id, selling_price FROM expenses WHERE organization_id = $1 AND id IN ($2, $3)`,
      [f.orgId, exp1.body.id, exp2.body.id]
    );

    expect(checkExpenses.rows.length).toBe(2);
    expect(checkExpenses.rows[0].is_billed).toBe(true);
    expect(checkExpenses.rows[0].invoice_id).toBe(invoiceId);
    expect(checkExpenses.rows[1].is_billed).toBe(true);
    expect(checkExpenses.rows[1].invoice_id).toBe(invoiceId);

    // Verify unbilled query now returns empty for Client A
    const listAfter = await request(app)
      .get(`/api/v1/finance/expenses?clientId=${f.clientA.id}&isBillable=true&isBilled=false`)
      .set(f.auth);
    expect(listAfter.body.length).toBe(0);
  });

  it('3. Rejects invoice creation if any selected expense is already billed (anti double-billing)', async () => {
    const f = await fixture('s2-double-bill');

    const exp1 = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 500,
        clientId: f.clientA.id,
        isBillable: true,
        markupPercentage: 0,
        description: 'Delivery fee',
      });

    // Invoice 1 bills exp1
    const inv1 = await request(app)
      .post('/api/v1/finance/invoices')
      .set(f.auth)
      .send({
        clientId: f.clientA.id,
        clientName: f.clientA.name,
        issueDate: '2026-09-17',
        dueDate: '2026-10-17',
        items: [{ description: 'Delivery fee', quantity: 1, unitPrice: 500, amount: 500, taxRate: 0 }],
        expenseIds: [exp1.body.id],
      });
    expect(inv1.status).toBe(201);

    // Invoice 2 attempts to bill exp1 again -> must be rejected
    const inv2 = await request(app)
      .post('/api/v1/finance/invoices')
      .set(f.auth)
      .send({
        clientId: f.clientA.id,
        clientName: f.clientA.name,
        issueDate: '2026-09-17',
        dueDate: '2026-10-17',
        items: [{ description: 'Delivery fee retry', quantity: 1, unitPrice: 500, amount: 500, taxRate: 0 }],
        expenseIds: [exp1.body.id],
      });

    expect(inv2.status).toBeGreaterThanOrEqual(400);
    expect(inv2.body.error).toContain('already billed');
  });
});
