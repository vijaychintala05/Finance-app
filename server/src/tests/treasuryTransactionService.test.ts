import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { TreasuryTransactionService, type TreasuryTransactionInput } from '../services/TreasuryTransactionService';

const ORG = 'org-treasury-flow';
const USER = 'usr-treasury-flow';

const ACCOUNT = {
  bank: 'acc-treasury-bank',
  payroll: 'acc-treasury-payroll',
  reimbursements: 'acc-treasury-reimbursements',
  equity: 'acc-treasury-equity',
  loan: 'acc-treasury-loan',
  interest: 'acc-treasury-interest',
  tax: 'acc-treasury-tax',
};

describe('TreasuryTransactionService', () => {
  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'treasury@example.test', 'hash', 'Treasury User', 'Active')`,
      [USER]
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-treasury', 'public-treasury', 'TREASURY', 'Treasury Test Org', 'IN', 'INR', '₹', $2)`,
      [ORG, USER]
    );
    const accounts = [
      [ACCOUNT.bank, '1010', 'Operating Bank', 'Asset', 'Bank', 'Debit'],
      [ACCOUNT.payroll, '6100', 'Salaries', 'Expense', 'Payroll', 'Debit'],
      [ACCOUNT.reimbursements, '6180', 'Employee Reimbursements', 'Expense', 'Payroll', 'Debit'],
      [ACCOUNT.equity, '3000', 'Owner Equity', 'Equity', 'Equity', 'Credit'],
      [ACCOUNT.loan, '2400', 'Term Loan', 'Liability', 'Long Term Liability', 'Credit'],
      [ACCOUNT.interest, '7000', 'Interest Expense', 'Other Expense', 'Financial Expenses', 'Debit'],
      [ACCOUNT.tax, '2200', 'Tax Payable', 'Liability', 'Taxes Payable', 'Credit'],
    ];
    for (const [id, code, name, type, subType, normalBalance] of accounts) {
      await db.query(
        `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status, balance, normal_balance, normal_balance_is_explicit)
         VALUES ($1, $2, $3, $4, $5, $6, 'Active', 0, $7, TRUE)`,
        [id, ORG, code, name, type, subType, normalBalance]
      );
    }
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, current_balance, status, is_active)
       VALUES ('bank-treasury', $1, $2, 'Operating Bank', '1234', 'Test Bank', 'INR', 0, 'Active', TRUE)`,
      [ORG, ACCOUNT.bank]
    );
  });

  const cases: Array<{ name: string; input: TreasuryTransactionInput; cashDirection: 'IN' | 'OUT' }> = [
    { name: 'payroll payment', input: { transactionType: 'PAYROLL_PAYMENT', transactionDate: '2026-09-09', monetaryAccountId: ACCOUNT.bank, counterAccountId: ACCOUNT.payroll, amount: 100, employeeName: 'Asha' }, cashDirection: 'OUT' },
    { name: 'employee reimbursement', input: { transactionType: 'EMPLOYEE_REIMBURSEMENT', transactionDate: '2026-09-09', monetaryAccountId: ACCOUNT.bank, counterAccountId: ACCOUNT.reimbursements, amount: 110, employeeName: 'Ravi' }, cashDirection: 'OUT' },
    { name: 'owner contribution', input: { transactionType: 'OWNER_CONTRIBUTION', transactionDate: '2026-09-09', monetaryAccountId: ACCOUNT.bank, counterAccountId: ACCOUNT.equity, amount: 120 }, cashDirection: 'IN' },
    { name: 'owner withdrawal', input: { transactionType: 'OWNER_WITHDRAWAL', transactionDate: '2026-09-09', monetaryAccountId: ACCOUNT.bank, counterAccountId: ACCOUNT.equity, amount: 130 }, cashDirection: 'OUT' },
    { name: 'loan received', input: { transactionType: 'LOAN_RECEIVED', transactionDate: '2026-09-09', monetaryAccountId: ACCOUNT.bank, counterAccountId: ACCOUNT.loan, amount: 140 }, cashDirection: 'IN' },
    { name: 'loan repayment including interest', input: { transactionType: 'LOAN_REPAYMENT', transactionDate: '2026-09-09', monetaryAccountId: ACCOUNT.bank, counterAccountId: ACCOUNT.loan, amount: 165, principalAmount: 150, interestAmount: 15, interestExpenseAccountId: ACCOUNT.interest }, cashDirection: 'OUT' },
    { name: 'tax payment', input: { transactionType: 'TAX_PAYMENT', transactionDate: '2026-09-09', monetaryAccountId: ACCOUNT.bank, counterAccountId: ACCOUNT.tax, amount: 170 }, cashDirection: 'OUT' },
  ];

  for (const scenario of cases) {
    it(`posts a balanced, durable, bank-linked ${scenario.name}`, async () => {
      const created = await TreasuryTransactionService.create(ORG, USER, scenario.input);
      const source = await db.query(
        `SELECT status, monetary_account_id, counter_account_id, journal_entry_id FROM treasury_transactions WHERE organization_id = $1 AND id = $2`,
        [ORG, created.id]
      );
      expect(source.rows[0]).toMatchObject({ status: 'POSTED', monetary_account_id: ACCOUNT.bank, counter_account_id: scenario.input.counterAccountId, journal_entry_id: created.journalEntryId });
      const lines = await db.query(
        `SELECT account_id, debit, credit FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2`,
        [ORG, created.journalEntryId]
      );
      expect(lines.rows.reduce((sum, row) => sum + Number(row.debit), 0)).toBe(lines.rows.reduce((sum, row) => sum + Number(row.credit), 0));
      const bankLine = lines.rows.find((row) => row.account_id === ACCOUNT.bank);
      expect(scenario.cashDirection === 'IN' ? Number(bankLine?.debit) : Number(bankLine?.credit)).toBe(scenario.input.amount);
      const balance = await db.query(`SELECT current_balance FROM bank_accounts WHERE organization_id = $1 AND ledger_account_id = $2`, [ORG, ACCOUNT.bank]);
      expect(Number(balance.rows[0].current_balance)).toBe(scenario.cashDirection === 'IN' ? scenario.input.amount : -scenario.input.amount);
    });
  }

  it('reverses through a new journal and restores the GL-derived bank balance', async () => {
    const created = await TreasuryTransactionService.create(ORG, USER, cases[0].input);
    const reversed = await TreasuryTransactionService.reverse(ORG, created.id, USER, 'Payroll was entered twice');
    const source = await db.query(`SELECT status, reversal_journal_id FROM treasury_transactions WHERE organization_id = $1 AND id = $2`, [ORG, created.id]);
    expect(source.rows[0]).toMatchObject({ status: 'REVERSED', reversal_journal_id: reversed.reversalJournalEntryId });
    const balances = await db.query(
      `SELECT a.balance, ba.current_balance FROM accounts a JOIN bank_accounts ba ON ba.organization_id = a.organization_id AND ba.ledger_account_id = a.id WHERE a.organization_id = $1 AND a.id = $2`,
      [ORG, ACCOUNT.bank]
    );
    expect(Number(balances.rows[0].balance)).toBe(0);
    expect(Number(balances.rows[0].current_balance)).toBe(0);
    await expect(TreasuryTransactionService.reverse(ORG, created.id, USER, 'Duplicate reversal')).rejects.toThrow('TREASURY_TRANSACTION_ALREADY_REVERSED');
  });

  it('rejects account codes and counter accounts from a different account class', async () => {
    await expect(TreasuryTransactionService.create(ORG, USER, {
      ...cases[0].input,
      monetaryAccountId: '1010',
    })).rejects.toThrow('MONETARY_ACCOUNT_ID_REQUIRED');
    await expect(TreasuryTransactionService.create(ORG, USER, {
      ...cases[2].input,
      counterAccountId: ACCOUNT.payroll,
    })).rejects.toThrow('TREASURY_COUNTER_ACCOUNT_TYPE_INVALID');
  });
});
