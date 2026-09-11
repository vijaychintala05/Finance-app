import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Expense activity projections', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  it('projects one paid expense once in a bank or account activity feed', async () => {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `expense-projection-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Expense Projection Tester',
      organizationName: 'Expense Projection Organization',
    });
    expect(registration.status).toBe(201);

    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const organizationId = registration.body.organizationId;
    const accounts = await db.query(
      'SELECT id, code FROM accounts WHERE organization_id = $1',
      [organizationId]
    );
    const expenseAccountId = accounts.rows.find((account) => account.code === '6000')?.id;
    const bankAccountId = accounts.rows.find((account) => account.code === '1000')?.id;
    expect(expenseAccountId).toBeTruthy();
    expect(bankAccountId).toBeTruthy();

    const created = await request(app)
      .post('/api/v1/finance/expenses')
      .set(auth)
      .send({
        expenseAccountId,
        paidFromAccountId: bankAccountId,
        vendorName: 'Single Projection Vendor',
        date: '2026-09-11',
        amount: 1250,
        description: 'One expense must produce one activity movement',
      });
    expect(created.status).toBe(201);

    const [expensesResponse, journalsResponse] = await Promise.all([
      request(app).get('/api/v1/finance/expenses').set(auth),
      request(app).get('/api/v1/finance/journals').set(auth),
    ]);
    expect(expensesResponse.status).toBe(200);
    expect(journalsResponse.status).toBe(200);

    const expense = expensesResponse.body.find((item: { id: string }) => item.id === created.body.id);
    expect(expense.journalEntryId).toBeTruthy();

    const journalBankLines = journalsResponse.body.flatMap((journal: { id: string; lines: Array<{ account_id?: string; accountId?: string; debit: number; credit: number }> }) =>
      journal.lines.filter((line) => (line.accountId || line.account_id) === bankAccountId && (Number(line.debit) > 0 || Number(line.credit) > 0))
    );
    const legacyExpenseRows = expensesResponse.body.filter((item: { paidFromAccountId: string; journalEntryId?: string }) =>
      item.paidFromAccountId === bankAccountId && !item.journalEntryId
    );

    expect(journalBankLines).toHaveLength(1);
    expect(legacyExpenseRows).toHaveLength(0);
    expect(journalBankLines.length + legacyExpenseRows.length).toBe(1);
  });
});
