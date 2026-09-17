import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ExpensePostingService } from '../services/ExpensePostingService';

describe('Stage 1: Billable Expense Pricing & Project Markup Backend Certification', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function tenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Stage 1 Test User',
      organizationName: `${label} Pricing Corp`,
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
      .send({ name: `${label} Client`, email: `${label}@clientcorp.com` });

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

  it('1. Posts billable expense with 15% markup on ₹1,000 and persists selling_price = 1150.00', async () => {
    const f = await fixture('s1-markup');

    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 1000,
        clientId: f.client.id,
        isBillable: true,
        markupPercentage: 15,
        description: 'Server hosting expense',
      });

    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // Verify stored row in database
    const dbRow = await db.query('SELECT * FROM expenses WHERE id = $1', [expenseId]);
    expect(dbRow.rows.length).toBe(1);
    expect(Number(dbRow.rows[0].amount)).toBe(1000);
    expect(Boolean(dbRow.rows[0].is_billable)).toBe(true);
    expect(Number(dbRow.rows[0].markup_percentage)).toBe(15.0);
    expect(Number(dbRow.rows[0].selling_price)).toBe(1150.0);

    // Verify GET /finance/expenses returns markup and selling price
    const listRes = await request(app).get('/api/v1/finance/expenses').set(f.auth);
    expect(listRes.status).toBe(200);
    const listed = listRes.body.find((e: any) => e.id === expenseId);
    expect(listed).toBeDefined();
    expect(listed.isBillable).toBe(true);
    expect(listed.markupPercentage).toBe(15);
    expect(listed.sellingPrice).toBe(1150);

    // Verify GL journal integrity: expense debit is cost (1000) and bank credit is cost (1000)
    const journalId = listed.journalEntryId;
    const lines = await db.query('SELECT * FROM journal_lines WHERE journal_entry_id = $1', [journalId]);
    const debitSum = lines.rows.reduce((s, l) => s + Number(l.debit), 0);
    const creditSum = lines.rows.reduce((s, l) => s + Number(l.credit), 0);
    expect(debitSum).toBe(1000);
    expect(creditSum).toBe(1000);
  });

  it('2. Posts billable expense with explicit 0% markup (At Cost) and persists selling_price = 1000.00', async () => {
    const f = await fixture('s1-atcost');

    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 1000,
        clientId: f.client.id,
        isBillable: true,
        markupPercentage: 0,
        description: 'Raw materials at cost',
      });

    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    const dbRow = await db.query('SELECT * FROM expenses WHERE id = $1', [expenseId]);
    expect(Number(dbRow.rows[0].markup_percentage)).toBe(0);
    expect(Number(dbRow.rows[0].selling_price)).toBe(1000.0);
  });

  it('3. Rejects negative markup percentage with validation error', async () => {
    const f = await fixture('s1-negative');

    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 500,
        clientId: f.client.id,
        isBillable: true,
        markupPercentage: -10,
        description: 'Invalid markup test',
      });

    expect(expRes.status).toBe(422);
    expect(expRes.body.error).toMatch(/non-negative number/i);
  });

  it('4. Converts marked-up expense to invoice using the final selling_price without exposing markup on the invoice line', async () => {
    const f = await fixture('s1-convert');

    // Create ₹2,000 expense with 20% markup (selling price = ₹2,400)
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.paidFromAccountId,
        date: '2026-09-17',
        amount: 2000,
        clientId: f.client.id,
        isBillable: true,
        markupPercentage: 20,
        description: 'Equipment rental',
      });

    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // Convert to customer invoice
    const convRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/convert-to-invoice`)
      .set(f.auth)
      .send({
        issueDate: '2026-09-17',
        dueDate: '2026-09-24',
      });

    expect(convRes.status).toBe(201);
    const invoice = convRes.body.invoice;
    expect(invoice).toBeDefined();

    // Verify the invoice items were billed at the marked-up price ₹2,400
    const invItems = await db.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoice.id]);
    expect(invItems.rows.length).toBe(1);
    expect(Number(invItems.rows[0].unit_price)).toBe(2400);
    expect(Number(invItems.rows[0].amount)).toBe(2400);

    // Customer Privacy Check: Invoice description must NOT expose the markup percentage or cost
    expect(invItems.rows[0].description).not.toContain('20%');
    expect(invItems.rows[0].description).not.toContain('2000');
  });
});
