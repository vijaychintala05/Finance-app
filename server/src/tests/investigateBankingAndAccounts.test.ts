import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';

describe('Investigate Banking and Accounts data reflection & expense adjustments', () => {
  beforeAll(async () => MigrationRunner.runMigrations());

  async function setupTenant(label: string) {
    const reg = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Finance Tester',
      organizationName: `${label} Org`,
    });
    const auth = { Authorization: `Bearer ${reg.body.token}` };
    const orgId = reg.body.organizationId;
    return { auth, orgId, user: reg.body.user };
  }

  it('verifies accounts and banking reflection on expense, payment received, and adjustment', async () => {
    const { auth } = await setupTenant('bank-acc-investigate');

    // 1. Fetch initial accounts
    const initialAccRes = await request(app).get('/api/v1/finance/accounts').set(auth);
    expect(initialAccRes.status).toBe(200);
    const bankAcc = initialAccRes.body.find((a: any) => a.code === '1000');
    const expAcc = initialAccRes.body.find((a: any) => a.code === '6000');
    expect(bankAcc).toBeDefined();
    expect(expAcc).toBeDefined();
    expect(parseFloat(bankAcc.balance)).toBe(0);

    // 1b. Fetch initial banking accounts (/api/v1/banking/accounts)
    const initialBankRes = await request(app).get('/api/v1/banking/accounts').set(auth);
    expect(initialBankRes.status).toBe(200);
    expect(initialBankRes.body.success).toBe(true);
    expect(initialBankRes.body.data.length).toBeGreaterThanOrEqual(1);
    const primaryBankProfile = initialBankRes.body.data.find((b: any) => b.ledgerAccountId === bankAcc.id);
    expect(primaryBankProfile).toBeDefined();
    expect(primaryBankProfile.currentBalance).toBe(0);

    // 2. Add an expense of $250 paid from bankAcc
    const expenseRes = await request(app).post('/api/v1/finance/expenses').set(auth).send({
      expenseAccountId: expAcc.id,
      paidFromAccountId: bankAcc.id,
      amount: 250,
      date: '2026-09-10',
      description: 'Test Office Supplies',
    });
    expect(expenseRes.status).toBe(201);
    expect(expenseRes.body.id).toBeDefined();

    // Check accounts balance after expense
    const afterExpAccRes = await request(app).get('/api/v1/finance/accounts').set(auth);
    const bankAfterExp = afterExpAccRes.body.find((a: any) => a.id === bankAcc.id);
    const expAfterExp = afterExpAccRes.body.find((a: any) => a.id === expAcc.id);
    expect(parseFloat(bankAfterExp.balance)).toBe(-250);
    expect(parseFloat(expAfterExp.balance)).toBe(250);

    // Check banking accounts after expense
    const bankAccountsAfterExp = await request(app).get('/api/v1/banking/accounts').set(auth);
    const bankProfileAfterExp = bankAccountsAfterExp.body.data.find((b: any) => b.ledgerAccountId === bankAcc.id);
    expect(bankProfileAfterExp.currentBalance).toBe(-250);

    // 3. Create a client and record customer payment of $1000 deposited to bankAcc
    const clientRes = await request(app).post('/api/v1/finance/clients').set(auth).send({
      name: 'Acme Corp',
      email: 'billing@acme.com',
    });
    const payRes = await request(app).post('/api/v1/finance/payments-received').set(auth).send({
      clientId: clientRes.body.id,
      amount: 1000,
      paymentDate: '2026-09-11',
      depositToAccountId: bankAcc.id,
      paymentMode: 'Bank Transfer',
    });
    expect(payRes.status).toBe(201);

    // Check accounts balance after payment: -250 + 1000 = 750
    const afterPayAccRes = await request(app).get('/api/v1/finance/accounts').set(auth);
    const bankAfterPay = afterPayAccRes.body.find((a: any) => a.id === bankAcc.id);
    expect(parseFloat(bankAfterPay.balance)).toBe(750);

    // Check banking accounts after payment: current balance = 750
    const bankAccountsAfterPay = await request(app).get('/api/v1/banking/accounts').set(auth);
    const bankProfileAfterPay = bankAccountsAfterPay.body.data.find((b: any) => b.ledgerAccountId === bankAcc.id);
    expect(bankProfileAfterPay.currentBalance).toBe(750);

    // 4. Correct the expense (adjusting amount from 250 to 300) via /correct
    const correctRes = await request(app).post(`/api/v1/finance/expenses/${expenseRes.body.id}/correct`).set(auth).send({
      reason: 'Adjusting amount to 300 due to revised invoice',
      expenseAccountId: expAcc.id,
      paidFromAccountId: bankAcc.id,
      amount: 300,
      date: '2026-09-10',
      description: 'Adjusted Office Supplies',
    });
    expect(correctRes.status).toBe(201);
    expect(correctRes.body.voidedExpenseId).toBe(expenseRes.body.id);
    expect(correctRes.body.replacement.amount).toBe(300);

    // After adjustment: 1000 - 300 = 700
    const afterCorrectAccRes = await request(app).get('/api/v1/finance/accounts').set(auth);
    const bankAfterCorrect = afterCorrectAccRes.body.find((a: any) => a.id === bankAcc.id);
    expect(parseFloat(bankAfterCorrect.balance)).toBe(700);

    const bankAccountsAfterCorrect = await request(app).get('/api/v1/banking/accounts').set(auth);
    const bankProfileAfterCorrect = bankAccountsAfterCorrect.body.data.find((b: any) => b.ledgerAccountId === bankAcc.id);
    expect(bankProfileAfterCorrect.currentBalance).toBe(700);

    // 5. Test PUT /expenses/:id for metadata updates
    const activeExpenseId = correctRes.body.replacement.id;
    const putMetaRes = await request(app).put(`/api/v1/finance/expenses/${activeExpenseId}`).set(auth).send({
      description: 'Updated description for audit note',
    });
    expect(putMetaRes.status).toBe(200);

    // 6. Test PUT /expenses/:id for financial adjustment (auto-routes to correctAndPost)
    const putFinancialRes = await request(app).put(`/api/v1/finance/expenses/${activeExpenseId}`).set(auth).send({
      amount: 350,
      expenseAccountId: expAcc.id,
      paidFromAccountId: bankAcc.id,
      date: '2026-09-10',
      reason: 'Further adjustment to 350',
    });
    expect(putFinancialRes.status).toBe(200);
    expect(putFinancialRes.body.success).toBe(true);

    // Final balance check: 1000 - 350 = 650
    const finalBankAcc = await request(app).get('/api/v1/banking/accounts').set(auth);
    const finalBankProfile = finalBankAcc.body.data.find((b: any) => b.ledgerAccountId === bankAcc.id);
    expect(finalBankProfile.currentBalance).toBe(650);
  });
});
