import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { newId } from '../utils/ids';

describe('Employee Reimbursements Lifecycle (Stage 2 & Scope 8)', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function createTenantFixture(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Reimbursement Officer',
      organizationName: `${label} Corp`,
    });
    const orgId = registration.body.organizationId;
    const userId = registration.body.user.id;
    const auth = { Authorization: `Bearer ${registration.body.token}` };

    const accountsRes = await db.query(
      `SELECT id, code, name, system_role FROM accounts WHERE organization_id = $1`,
      [orgId]
    );

    const expenseAccount1 = accountsRes.rows.find((r) => r.code === '6000') || accountsRes.rows.find((r) => r.code.startsWith('6'));
    const expenseAccount2 = accountsRes.rows.find((r) => r.code === '6120') || accountsRes.rows.find((r) => r.code !== expenseAccount1?.code && r.code.startsWith('6'));
    const bankAccount = accountsRes.rows.find((r) => r.code === '1000') || accountsRes.rows.find((r) => r.code.startsWith('10'));
    const payableAccount = accountsRes.rows.find((r) => r.code === '2105' || r.system_role === 'EMPLOYEE_REIMBURSEMENTS_PAYABLE');

    return {
      orgId,
      userId,
      auth,
      expenseAccount1Id: expenseAccount1.id,
      expenseAccount2Id: expenseAccount2 ? expenseAccount2.id : expenseAccount1.id,
      bankAccountId: bankAccount.id,
      payableAccountId: payableAccount?.id,
    };
  }

  it('1. creates an employee claim in DRAFT status without posting journal lines', async () => {
    const f = await createTenantFixture('claim-draft');

    const res = await request(app)
      .post('/api/v1/finance/claims')
      .set(f.auth)
      .send({
        claimantId: f.userId,
        claimantName: 'Jane Employee',
        claimDate: '2026-08-15',
        title: 'Client Onsite Travel Expenses',
        description: 'Hotel and meals for project kickoff',
        items: [
          {
            expenseAccountId: f.expenseAccount1Id,
            date: '2026-08-15',
            amount: 450.0,
            description: 'Hotel stay 2 nights',
          },
          {
            expenseAccountId: f.expenseAccount2Id,
            date: '2026-08-15',
            amount: 150.0,
            description: 'Team dinner with client',
          },
        ],
      });

    if (res.status !== 201) {
      console.log('TEST 1 FAILED WITH STATUS:', res.status, 'BODY:', res.body);
    }
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe('DRAFT');
    expect(Number(res.body.totalAmount)).toBe(600.0);

    // Verify DB
    const dbClaim = await db.query(
      `SELECT * FROM employee_claims WHERE id = $1`,
      [res.body.id]
    );
    expect(dbClaim.rows.length).toBe(1);
    expect(dbClaim.rows[0].status).toBe('DRAFT');
    expect(dbClaim.rows[0].claim_journal_entry_id).toBeNull();
    expect(Number(dbClaim.rows[0].total_amount)).toBe(600.0);
    expect(Number(dbClaim.rows[0].paid_amount)).toBe(0.0);

    // Verify Items
    const dbItems = await db.query(
      `SELECT * FROM employee_claim_items WHERE claim_id = $1 ORDER BY amount DESC`,
      [res.body.id]
    );
    expect(dbItems.rows.length).toBe(2);
    expect(Number(dbItems.rows[0].amount)).toBe(450.0);
    expect(Number(dbItems.rows[1].amount)).toBe(150.0);
  });

  it('2. submits, rejects, and re-submits an employee claim', async () => {
    const f = await createTenantFixture('claim-workflow');

    const createRes = await request(app)
      .post('/api/v1/finance/claims')
      .set(f.auth)
      .send({
        claimantId: f.userId,
        claimantName: 'John Developer',
        claimDate: '2026-08-16',
        title: 'Conference Registration',
        items: [
          {
            expenseAccountId: f.expenseAccount1Id,
            date: '2026-08-16',
            amount: 300.0,
            description: 'Tech Summit Ticket',
          },
        ],
      });
    const claimId = createRes.body.id;

    // Submit
    const submitRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/submit`)
      .set(f.auth);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe('SUBMITTED');

    // Reject with reason
    const rejectRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/reject`)
      .set(f.auth)
      .send({ reason: 'Please attach VAT tax receipt invoice' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');
    expect(rejectRes.body.reason).toBe('Please attach VAT tax receipt invoice');

    // Re-submit
    const reSubmitRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/submit`)
      .set(f.auth);
    expect(reSubmitRes.status).toBe(200);
    expect(reSubmitRes.body.status).toBe('SUBMITTED');
  });

  it('3. approves claim and posts balanced liability journal crediting 2105 Employee Reimbursements Payable', async () => {
    const f = await createTenantFixture('claim-approval');

    const createRes = await request(app)
      .post('/api/v1/finance/claims')
      .set(f.auth)
      .send({
        claimantId: f.userId,
        claimantName: 'Alice Engineer',
        claimDate: '2026-08-17',
        title: 'Equipment & Software',
        items: [
          {
            expenseAccountId: f.expenseAccount1Id,
            date: '2026-08-17',
            amount: 500.0,
            description: 'Ergonomic keyboard and monitor stand',
          },
          {
            expenseAccountId: f.expenseAccount2Id,
            date: '2026-08-17',
            amount: 250.0,
            description: 'Development tool annual license',
          },
        ],
      });
    const claimId = createRes.body.id;

    // Submit
    await request(app).post(`/api/v1/finance/claims/${claimId}/submit`).set(f.auth);

    // Approve
    const approveRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/approve`)
      .set(f.auth);

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');
    expect(Number(approveRes.body.approvedAmount)).toBe(750.0);
    expect(approveRes.body.journalEntryId).toBeTruthy();

    // Verify posted journal entry lines
    const journalLines = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [approveRes.body.journalEntryId]
    );
    expect(journalLines.rows.length).toBe(3);

    const totalDebit = journalLines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = journalLines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(750.0);
    expect(totalCredit).toBe(750.0);

    // Payable account should be credited 750.0
    const payableLine = journalLines.rows.find((l) => l.account_id === approveRes.body.payableAccountId);
    expect(payableLine).toBeDefined();
    expect(Number(payableLine?.credit)).toBe(750.0);
    expect(Number(payableLine?.debit)).toBe(0.0);

    // Expense accounts should be debited 500.0 and 250.0
    const exp1Line = journalLines.rows.find((l) => l.account_id === f.expenseAccount1Id);
    const exp2Line = journalLines.rows.find((l) => l.account_id === f.expenseAccount2Id);
    if (f.expenseAccount1Id === f.expenseAccount2Id) {
      expect(Number(exp1Line?.debit)).toBe(750.0);
    } else {
      expect(Number(exp1Line?.debit)).toBe(500.0);
      expect(Number(exp2Line?.debit)).toBe(250.0);
    }
  });

  it('4. records partial and full reimbursement payouts from bank to settle claim', async () => {
    const f = await createTenantFixture('claim-payments');

    // Create & Approve $1000 claim
    const createRes = await request(app)
      .post('/api/v1/finance/claims')
      .set(f.auth)
      .send({
        claimantId: f.userId,
        claimantName: 'Robert Tech Lead',
        claimDate: '2026-08-18',
        title: 'Hardware Upgrade',
        items: [
          {
            expenseAccountId: f.expenseAccount1Id,
            date: '2026-08-18',
            amount: 1000.0,
            description: 'Laptop motherboard replacement',
          },
        ],
      });
    const claimId = createRes.body.id;
    await request(app).post(`/api/v1/finance/claims/${claimId}/submit`).set(f.auth);
    const approveRes = await request(app).post(`/api/v1/finance/claims/${claimId}/approve`).set(f.auth);

    // 1st Payout: $400 partial
    const pay1Res = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/record-payment`)
      .set(f.auth)
      .send({
        paymentDate: '2026-08-19',
        amount: 400.0,
        paidFromAccountId: f.bankAccountId,
        paymentMethod: 'Bank Transfer',
        reference: 'WIRE-001',
      });

    expect(pay1Res.status).toBe(201);
    expect(pay1Res.body.claimStatus).toBe('PARTIALLY_PAID');
    expect(Number(pay1Res.body.claimPaidAmount)).toBe(400.0);

    // Check payment 1 journal: Debit Payable $400, Credit Bank $400
    const lines1 = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [pay1Res.body.journalEntryId]
    );
    expect(lines1.rows.length).toBe(2);
    const deb1 = lines1.rows.find((l) => l.account_id === approveRes.body.payableAccountId);
    const cred1 = lines1.rows.find((l) => l.account_id === f.bankAccountId);
    expect(Number(deb1?.debit)).toBe(400.0);
    expect(Number(cred1?.credit)).toBe(400.0);

    // 2nd Payout: $600 remaining
    const pay2Res = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/record-payment`)
      .set(f.auth)
      .send({
        paymentDate: '2026-08-20',
        amount: 600.0,
        paidFromAccountId: f.bankAccountId,
        paymentMethod: 'Bank Transfer',
        reference: 'WIRE-002',
      });

    expect(pay2Res.status).toBe(201);
    expect(pay2Res.body.claimStatus).toBe('PAID');
    expect(Number(pay2Res.body.claimPaidAmount)).toBe(1000.0);

    // Attempting further payment should fail
    const overpayRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/record-payment`)
      .set(f.auth)
      .send({
        paymentDate: '2026-08-21',
        amount: 50.0,
        paidFromAccountId: f.bankAccountId,
      });
    expect(overpayRes.status).toBe(400);
    expect(overpayRes.body.error).toContain('CLAIM_NOT_PAYABLE');
  });

  it('5. enforces Scope 8 Bank Reconciliation Lock on reimbursement payments', async () => {
    const f = await createTenantFixture('reimb-reconciled');

    // Create & Approve $500 claim
    const createRes = await request(app)
      .post('/api/v1/finance/claims')
      .set(f.auth)
      .send({
        claimantId: f.userId,
        claimantName: 'Finance Officer',
        claimDate: '2026-08-21',
        title: 'Office Stationery',
        items: [
          {
            expenseAccountId: f.expenseAccount1Id,
            date: '2026-08-21',
            amount: 500.0,
            description: 'Bulk paper and printer toner',
          },
        ],
      });
    const claimId = createRes.body.id;
    await request(app).post(`/api/v1/finance/claims/${claimId}/submit`).set(f.auth);
    await request(app).post(`/api/v1/finance/claims/${claimId}/approve`).set(f.auth);

    // Record Payment
    const payRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/record-payment`)
      .set(f.auth)
      .send({
        paymentDate: '2026-08-22',
        amount: 500.0,
        paidFromAccountId: f.bankAccountId,
      });
    const paymentId = payRes.body.id;

    // Simulate Bank Reconciliation Match for this payment
    const matchId = newId('brm');
    const mockTxId = newId('stx');
    await db.query(
      `INSERT INTO bank_reconciliation_matches 
         (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ($1, $2, $3, 'PAYMENT', $4, 500.0, 'MATCHED')`,
      [matchId, f.orgId, mockTxId, paymentId]
    );

    // Attempting to void the payment must be blocked with PAYMENT_RECONCILED (422)
    const voidRes = await request(app)
      .post(`/api/v1/finance/reimbursements/payments/${paymentId}/void`)
      .set(f.auth)
      .send({ reason: 'Try to void reconciled reimbursement' });

    expect(voidRes.status).toBe(422);
    expect(voidRes.body.error).toContain('PAYMENT_RECONCILED');

    // Un-match from bank reconciliation
    await db.query(
      `UPDATE bank_reconciliation_matches SET status = 'UNMATCHED' WHERE id = $1`,
      [matchId]
    );

    // Now voiding payment succeeds with audited reversal
    const voidSuccessRes = await request(app)
      .post(`/api/v1/finance/reimbursements/payments/${paymentId}/void`)
      .set(f.auth)
      .send({ reason: 'Voiding now that it is un-matched' });

    expect(voidSuccessRes.status).toBe(200);
    expect(voidSuccessRes.body.status).toBe('VOIDED');
    expect(voidSuccessRes.body.reversalEntryId).toBeTruthy();

    // Verify claim balance restored
    const claimAfterVoid = await db.query(
      `SELECT status, paid_amount FROM employee_claims WHERE id = $1`,
      [claimId]
    );
    expect(claimAfterVoid.rows[0].status).toBe('APPROVED');
    expect(Number(claimAfterVoid.rows[0].paid_amount)).toBe(0.0);
  });

  it('6. prevents voiding approved claim if payments exist, allows voiding after payments are voided', async () => {
    const f = await createTenantFixture('claim-void-guard');

    const createRes = await request(app)
      .post('/api/v1/finance/claims')
      .set(f.auth)
      .send({
        claimantId: f.userId,
        claimantName: 'Mark Sales',
        claimDate: '2026-08-23',
        title: 'Sales Trip Accommodation',
        items: [
          {
            expenseAccountId: f.expenseAccount1Id,
            date: '2026-08-23',
            amount: 800.0,
            description: 'Hotel room',
          },
        ],
      });
    const claimId = createRes.body.id;
    await request(app).post(`/api/v1/finance/claims/${claimId}/submit`).set(f.auth);
    await request(app).post(`/api/v1/finance/claims/${claimId}/approve`).set(f.auth);

    // Pay $800
    const payRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/record-payment`)
      .set(f.auth)
      .send({
        paymentDate: '2026-08-24',
        amount: 800.0,
        paidFromAccountId: f.bankAccountId,
      });

    // Attempting to void claim directly while payment exists must fail
    const voidFailRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/void`)
      .set(f.auth)
      .send({ reason: 'Voiding claim with active payment' });
    expect(voidFailRes.status).toBe(400);
    expect(voidFailRes.body.error).toContain('CLAIM_HAS_SETTLED_PAYMENTS');

    // Void the payment first
    await request(app)
      .post(`/api/v1/finance/reimbursements/payments/${payRes.body.id}/void`)
      .set(f.auth)
      .send({ reason: 'Reversing payment first' });

    // Now voiding the claim succeeds
    const voidClaimRes = await request(app)
      .post(`/api/v1/finance/claims/${claimId}/void`)
      .set(f.auth)
      .send({ reason: 'Trip was fully refunded by airline' });

    expect(voidClaimRes.status).toBe(200);
    expect(voidClaimRes.body.status).toBe('VOIDED');
    expect(voidClaimRes.body.reversalEntryId).toBeTruthy();

    const dbClaim = await db.query(
      `SELECT status FROM employee_claims WHERE id = $1`,
      [claimId]
    );
    expect(dbClaim.rows[0].status).toBe('VOIDED');
  });

  it('7. strictly isolates employee claims by tenant organization_id', async () => {
    const fA = await createTenantFixture('tenant-claim-a');
    const fB = await createTenantFixture('tenant-claim-b');

    // Org A creates a claim
    const createResA = await request(app)
      .post('/api/v1/finance/claims')
      .set(fA.auth)
      .send({
        claimantId: fA.userId,
        claimantName: 'Employee Tenant A',
        claimDate: '2026-08-25',
        title: 'Secret Project A Expenses',
        items: [
          {
            expenseAccountId: fA.expenseAccount1Id,
            date: '2026-08-25',
            amount: 250.0,
            description: 'Item Tenant A',
          },
        ],
      });
    const claimIdA = createResA.body.id;

    // Org B attempts to fetch Org A's claim
    const getResB = await request(app)
      .get(`/api/v1/finance/claims/${claimIdA}`)
      .set(fB.auth);
    expect(getResB.status).toBe(404);

    // Org B attempts to submit Org A's claim
    const submitResB = await request(app)
      .post(`/api/v1/finance/claims/${claimIdA}/submit`)
      .set(fB.auth);
    expect(submitResB.status).toBe(404);

    // Org B listing claims must not contain Org A's claim
    const listResB = await request(app)
      .get('/api/v1/finance/claims')
      .set(fB.auth);
    expect(listResB.status).toBe(200);
    const found = listResB.body.items?.some((c: any) => c.id === claimIdA);
    expect(found).toBe(false);
  });
});
