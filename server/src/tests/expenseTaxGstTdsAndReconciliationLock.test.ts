import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { GSTComplianceService } from '../services/GSTComplianceService';
import { newId } from '../utils/ids';

describe('Direct Expense Tax, GST, TDS, and Reconciliation Lock (Stage 1 & Scope 8)', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function createTenantFixture(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Tax Parity Officer',
      organizationName: `${label} Parity Organization`,
    });
    const orgId = registration.body.organizationId;
    const userId = registration.body.user.id;
    const auth = { Authorization: `Bearer ${registration.body.token}` };

    const accountsRes = await db.query(
      `SELECT id, code, name, system_role FROM accounts WHERE organization_id = $1`,
      [orgId]
    );

    const expenseAccount = accountsRes.rows.find((r) => r.code === '6000') || accountsRes.rows.find((r) => r.code.startsWith('6'));
    const bankAccount = accountsRes.rows.find((r) => r.code === '1000') || accountsRes.rows.find((r) => r.code.startsWith('10'));
    const inputGstAccount = accountsRes.rows.find((r) => r.system_role === 'GST_INPUT' || r.code === '1200');
    const rcmLiabilityAccount = accountsRes.rows.find((r) => r.code === '2240' || r.name.toLowerCase().includes('reverse charge'));
    const tdsPayableAccount = accountsRes.rows.find((r) => r.system_role === 'TDS_PAYABLE' || r.code === '2250');

    return {
      orgId,
      userId,
      auth,
      expenseAccountId: expenseAccount.id,
      bankAccountId: bankAccount.id,
      inputGstAccountId: inputGstAccount?.id,
      rcmLiabilityAccountId: rcmLiabilityAccount?.id,
      tdsPayableAccountId: tdsPayableAccount?.id,
    };
  }

  it('1. posts a tax-exclusive direct expense with balanced compound journal lines', async () => {
    const f = await createTenantFixture('exp-tax-excl');

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Exclusive Cloud Hosting Ltd',
        date: '2026-08-10',
        amount: 1000.0,
        taxRate: 18,
        isTaxInclusive: false,
        description: 'Monthly cloud servers tax exclusive',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(Number(res.body.amount)).toBe(1000.0);
    expect(Number(res.body.taxAmount)).toBe(180.0);
    expect(res.body.isTaxInclusive).toBe(false);

    // Verify DB columns
    const dbRow = await db.query(
      `SELECT amount, tax_rate, tax_amount, is_tax_inclusive, journal_entry_id FROM expenses WHERE id = $1`,
      [res.body.id]
    );
    expect(Number(dbRow.rows[0].amount)).toBe(1000.0);
    expect(Number(dbRow.rows[0].tax_rate)).toBe(18.0);
    expect(Number(dbRow.rows[0].tax_amount)).toBe(180.0);
    expect(dbRow.rows[0].is_tax_inclusive).toBe(false);

    // Verify journal lines
    const lines = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [dbRow.rows[0].journal_entry_id]
    );
    expect(lines.rows.length).toBe(3);
    const totalDebit = lines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(1180.0);
    expect(totalCredit).toBe(1180.0);

    const expenseLine = lines.rows.find((l) => l.account_id === f.expenseAccountId);
    const bankLine = lines.rows.find((l) => l.account_id === f.bankAccountId);
    const taxLine = lines.rows.find((l) => l.account_id === f.inputGstAccountId);

    expect(Number(expenseLine?.debit)).toBe(1000.0);
    expect(Number(expenseLine?.credit)).toBe(0);
    expect(Number(taxLine?.debit)).toBe(180.0);
    expect(Number(taxLine?.credit)).toBe(0);
    expect(Number(bankLine?.credit)).toBe(1180.0);
    expect(Number(bankLine?.debit)).toBe(0);
  });

  it('2. posts a tax-inclusive direct expense backwards-calculating base and tax', async () => {
    const f = await createTenantFixture('exp-tax-incl');

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Stationery Supplier',
        date: '2026-08-11',
        amount: 1180.0,
        taxRate: 18,
        isTaxInclusive: true,
        description: 'Printer paper inclusive of tax',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(1180.0);
    expect(Number(res.body.taxAmount)).toBe(180.0);
    expect(res.body.isTaxInclusive).toBe(true);

    const dbRow = await db.query(
      `SELECT amount, tax_rate, tax_amount, is_tax_inclusive, journal_entry_id FROM expenses WHERE id = $1`,
      [res.body.id]
    );
    expect(Number(dbRow.rows[0].amount)).toBe(1180.0);
    expect(Number(dbRow.rows[0].tax_amount)).toBe(180.0);
    expect(dbRow.rows[0].is_tax_inclusive).toBe(true);

    const lines = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [dbRow.rows[0].journal_entry_id]
    );
    const totalDebit = lines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(1180.0);
    expect(totalCredit).toBe(1180.0);

    const expenseLine = lines.rows.find((l) => l.account_id === f.expenseAccountId);
    const taxLine = lines.rows.find((l) => l.account_id === f.inputGstAccountId);
    const bankLine = lines.rows.find((l) => l.account_id === f.bankAccountId);

    expect(Number(expenseLine?.debit)).toBe(1000.0);
    expect(Number(taxLine?.debit)).toBe(180.0);
    expect(Number(bankLine?.credit)).toBe(1180.0);
  });

  it('3. posts an expense with TDS deduction crediting TDS Payable and reducing bank payout', async () => {
    const f = await createTenantFixture('exp-tds');

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Contract Auditor',
        date: '2026-08-12',
        amount: 10000.0,
        tdsRate: 10,
        tdsSection: '194J',
        description: 'Professional audit fee with TDS',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(10000.0);
    expect(Number(res.body.tdsAmount)).toBe(1000.0);
    expect(res.body.tdsSection).toBe('194J');

    const dbRow = await db.query(
      `SELECT amount, tds_rate, tds_amount, tds_section, journal_entry_id FROM expenses WHERE id = $1`,
      [res.body.id]
    );
    expect(Number(dbRow.rows[0].amount)).toBe(10000.0);
    expect(Number(dbRow.rows[0].tds_rate)).toBe(10.0);
    expect(Number(dbRow.rows[0].tds_amount)).toBe(1000.0);
    expect(dbRow.rows[0].tds_section).toBe('194J');

    const lines = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [dbRow.rows[0].journal_entry_id]
    );
    const totalDebit = lines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(10000.0);
    expect(totalCredit).toBe(10000.0);

    const expenseLine = lines.rows.find((l) => l.account_id === f.expenseAccountId);
    const bankLine = lines.rows.find((l) => l.account_id === f.bankAccountId);
    const tdsLine = lines.rows.find((l) => l.account_id === f.tdsPayableAccountId);

    expect(Number(expenseLine?.debit)).toBe(10000.0);
    expect(Number(bankLine?.credit)).toBe(9000.0);
    expect(Number(tdsLine?.credit)).toBe(1000.0);
  });

  it('4. posts a combined Tax + TDS expense with exact compound double-entry balance', async () => {
    const f = await createTenantFixture('exp-tax-tds');

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Technical Architecture Consultants',
        date: '2026-08-13',
        amount: 20000.0,
        taxRate: 18,
        isTaxInclusive: false,
        tdsRate: 10,
        tdsSection: '194J',
        description: 'Consulting with 18% GST and 10% TDS',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(20000.0);
    expect(Number(res.body.taxAmount)).toBe(3600.0);
    expect(Number(res.body.tdsAmount)).toBe(2000.0);

    const lines = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [res.body.journalEntryId]
    );
    const totalDebit = lines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(23600.0);
    expect(totalCredit).toBe(23600.0);

    const expenseLine = lines.rows.find((l) => l.account_id === f.expenseAccountId);
    const taxLine = lines.rows.find((l) => l.account_id === f.inputGstAccountId);
    const bankLine = lines.rows.find((l) => l.account_id === f.bankAccountId);
    const tdsLine = lines.rows.find((l) => l.account_id === f.tdsPayableAccountId);

    expect(Number(expenseLine?.debit)).toBe(20000.0);
    expect(Number(taxLine?.debit)).toBe(3600.0);
    expect(Number(bankLine?.credit)).toBe(21600.0); // 20000 + 3600 - 2000 = 21600
    expect(Number(tdsLine?.credit)).toBe(2000.0);
  });

  it('5. posts an expense under Reverse Charge Mechanism (RCM) crediting RCM liability', async () => {
    const f = await createTenantFixture('exp-rcm');

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Unregistered Transport Operator',
        date: '2026-08-14',
        amount: 5000.0,
        taxRate: 5,
        isRcm: true,
        description: 'Goods transport agency under RCM',
      });

    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(5000.0);
    expect(Number(res.body.taxAmount)).toBe(250.0);
    expect(res.body.isRcm).toBe(true);

    const lines = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [res.body.journalEntryId]
    );
    const totalDebit = lines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(5250.0);
    expect(totalCredit).toBe(5250.0);

    const expenseLine = lines.rows.find((l) => l.account_id === f.expenseAccountId);
    const taxLine = lines.rows.find((l) => l.account_id === f.inputGstAccountId);
    const bankLine = lines.rows.find((l) => l.account_id === f.bankAccountId);
    const rcmLine = lines.rows.find((l) => l.account_id === f.rcmLiabilityAccountId);

    expect(Number(expenseLine?.debit)).toBe(5000.0);
    expect(Number(taxLine?.debit)).toBe(250.0);
    expect(Number(bankLine?.credit)).toBe(5000.0); // Vendor is paid base without GST
    expect(Number(rcmLine?.credit)).toBe(250.0); // GST liability is accrued to government
  });

  it('6. reconciles GST control accounts with direct expenses in AccountingIntegrityService and GSTComplianceService', async () => {
    const f = await createTenantFixture('exp-gst-integrity');

    // Post an exclusive expense with tax
    const exp1 = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Direct Vendor A',
        date: '2026-08-15',
        amount: 2000.0,
        taxRate: 18,
        isTaxInclusive: false,
      });
    expect(exp1.status).toBe(201);

    // Verify GST Integrity
    const integrity = await AccountingIntegrityService.verifyGSTIntegrity(f.orgId);
    expect(integrity.isBalanced).toBe(true);
    expect(integrity.difference).toBe('0.00');

    // Verify GST Compliance return summary
    const summary = await GSTComplianceService.getReturnSummary(f.orgId, '2026-08');
    expect(summary.inward.documentCount).toBeGreaterThanOrEqual(1);
    expect(summary.inward.taxAmount).toBe(360.0);
    expect(summary.integrity.isBalanced).toBe(true);
  });

  it('7. Scope 8: blocks void and correction when expense is matched in bank reconciliation', async () => {
    const f = await createTenantFixture('exp-recon-lock');

    const exp = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Reconciled Travel Agency',
        date: '2026-08-16',
        amount: 750.0,
        description: 'Flight tickets to be reconciled',
      });
    expect(exp.status).toBe(201);
    const expenseId = exp.body.id;

    // Simulate bank reconciliation match
    const mockMatchId = newId('brm');
    const mockTxId = newId('stx');
    await db.query(
      `INSERT INTO bank_reconciliation_matches 
         (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ($1, $2, $3, 'EXPENSE', $4, $5, 'MATCHED')`,
      [mockMatchId, f.orgId, mockTxId, expenseId, 750.0]
    );

    // Attempt voiding - MUST BE BLOCKED
    const voidBlocked = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/void`)
      .set(f.auth)
      .send({ reason: 'Attempting to void reconciled expense' });
    expect(voidBlocked.status).toBe(422);
    expect(voidBlocked.body.error).toContain('EXPENSE_RECONCILED');

    // Attempt correcting - MUST BE BLOCKED
    const correctBlocked = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/correct`)
      .set(f.auth)
      .send({
        reason: 'Attempting to correct reconciled expense',
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        date: '2026-08-17',
        amount: 800.0,
      });
    expect(correctBlocked.status).toBe(422);
    expect(correctBlocked.body.error).toContain('EXPENSE_RECONCILED');

    // Unmatch the bank reconciliation record
    await db.query(
      `UPDATE bank_reconciliation_matches SET status = 'UNMATCHED' WHERE id = $1`,
      [mockMatchId]
    );

    // Now correction succeeds cleanly with an audited reversal and replacement!
    const correctSuccess = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/correct`)
      .set(f.auth)
      .send({
        reason: 'Unmatched and corrected expense after review',
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Reconciled Travel Agency',
        date: '2026-08-17',
        amount: 800.0,
        description: 'Corrected flight tickets',
      });
    expect(correctSuccess.status).toBe(201);
    expect(correctSuccess.body.voidedExpenseId).toBe(expenseId);
    expect(correctSuccess.body.replacement.id).toBeTruthy();
    expect(Number(correctSuccess.body.replacement.amount)).toBe(800.0);
  });
});
