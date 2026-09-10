import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { GlobalSearchService } from '../services/GlobalSearchService';

describe('GlobalSearchService - Expense Search & Tenant Security', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function tenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Global Search Tester',
      organizationName: `${label} Search Org`,
    });
    return {
      orgId: registration.body.organizationId,
      auth: { Authorization: `Bearer ${registration.body.token}` },
    };
  }

  it('finds expenses by expense number, vendor, description, account name, and exact amount', async () => {
    const t = await tenant('exp-search');

    const accounts = await db.query(
      'SELECT id, code, name FROM accounts WHERE organization_id = $1',
      [t.orgId]
    );

    const expenseAccount = accounts.rows.find((r) => r.code.startsWith('6')) || accounts.rows[0];
    const paidAccount = accounts.rows.find((r) => r.code.startsWith('10')) || accounts.rows[1];

    // Create a unique expense
    const uniqueVendor = `NexusHosting-${Date.now()}`;
    const uniqueDesc = `Cloud infrastructure monthly fee ${Date.now()}`;
    const uniqueAmount = 4567.80;

    const createRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(t.auth)
      .send({
        expenseAccountId: expenseAccount.id,
        paidFromAccountId: paidAccount.id,
        date: '2026-09-01',
        amount: uniqueAmount,
        vendorName: uniqueVendor,
        description: uniqueDesc,
      });

    expect(createRes.status).toBe(201);
    const expNum = createRes.body.expenseNumber;

    // 1. Search by expense number
    const resultsByNum = await GlobalSearchService.search(t.orgId, expNum, ['expenses.view']);
    const matchNum = resultsByNum.find((r) => r.category === 'Expense' && r.title === expNum);
    expect(matchNum).toBeDefined();
    expect(matchNum?.amount).toBe(uniqueAmount);
    expect(matchNum?.type).toBe('EXPENSE');

    // 2. Search by vendor name
    const resultsByVendor = await GlobalSearchService.search(t.orgId, uniqueVendor.slice(0, 10), ['expenses.view']);
    const matchVendor = resultsByVendor.find((r) => r.category === 'Expense' && r.title === expNum);
    expect(matchVendor).toBeDefined();
    expect(matchVendor?.subtitle).toContain(uniqueVendor);

    // 3. Search by description
    const resultsByDesc = await GlobalSearchService.search(t.orgId, 'infrastructure monthly', ['expenses.view']);
    const matchDesc = resultsByDesc.find((r) => r.category === 'Expense' && r.title === expNum);
    expect(matchDesc).toBeDefined();

    // 4. Search by expense account name
    const resultsByAccount = await GlobalSearchService.search(t.orgId, expenseAccount.name, ['expenses.view']);
    const matchAcc = resultsByAccount.find((r) => r.category === 'Expense' && r.title === expNum);
    expect(matchAcc).toBeDefined();

    // 5. Search by exact numeric amount
    const resultsByAmount = await GlobalSearchService.search(t.orgId, '4567.80', ['expenses.view']);
    const matchAmount = resultsByAmount.find((r) => r.category === 'Expense' && r.title === expNum);
    expect(matchAmount).toBeDefined();
  });

  it('strictly enforces tenant isolation: org A cannot see org B expenses in search', async () => {
    const orgA = await tenant('org-a-search');
    const orgB = await tenant('org-b-search');

    const expResA = await db.query(
      "SELECT id FROM accounts WHERE organization_id = $1 AND (code = '6000' OR type = 'Expense') LIMIT 1",
      [orgA.orgId]
    );
    const paidResA = await db.query(
      "SELECT id FROM accounts WHERE organization_id = $1 AND (code = '1000' OR sub_type IN ('Bank', 'Cash')) LIMIT 1",
      [orgA.orgId]
    );

    const secretSecret = `TOP-SECRET-EXPENSE-${Date.now()}`;

    const expPostRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(orgA.auth)
      .send({
        expenseAccountId: expResA.rows[0].id,
        paidFromAccountId: paidResA.rows[0].id,
        date: '2026-09-02',
        amount: 8888.0,
        vendorName: 'Secret Vendor',
        description: secretSecret,
      });

    expect(expPostRes.status).toBe(201);

    // Org A can find it
    const searchA = await GlobalSearchService.search(orgA.orgId, secretSecret, ['expenses.view']);
    expect(searchA.filter((r) => r.category === 'Expense').length).toBeGreaterThanOrEqual(1);

    // Org B searching for exact same text MUST find 0
    const searchB = await GlobalSearchService.search(orgB.orgId, secretSecret, ['expenses.view']);
    expect(searchB.filter((r) => r.category === 'Expense').length).toBe(0);
  });

  it('respects permission gating: denies expense results when user lacks purchases/expenses view permission', async () => {
    const t = await tenant('perm-gate');

    const accounts = await db.query('SELECT id, code, sub_type FROM accounts WHERE organization_id = $1', [t.orgId]);
    const expAcc = accounts.rows.find((r) => r.code === '6000' || r.code.startsWith('6')) || accounts.rows[0];
    const paidAcc = accounts.rows.find((r) => r.code === '1000' || r.sub_type === 'Bank') || accounts.rows[0];

    const uniqueTag = `GATED-EXP-${Date.now()}`;

    await request(app)
      .post('/api/v1/finance/expenses')
      .set(t.auth)
      .send({
        expenseAccountId: expAcc.id,
        paidFromAccountId: paidAcc.id,
        date: '2026-09-03',
        amount: 250.0,
        vendorName: uniqueTag,
      });

    // With purchases.view or expenses.view permission: returns result
    const allowed = await GlobalSearchService.search(t.orgId, uniqueTag, ['expenses.view']);
    expect(allowed.filter((r) => r.category === 'Expense').length).toBeGreaterThanOrEqual(1);

    // With only invoices.view (sales): returns 0 expense results
    const restricted = await GlobalSearchService.search(t.orgId, uniqueTag, ['invoices.view']);
    expect(restricted.filter((r) => r.category === 'Expense').length).toBe(0);
  });
});
