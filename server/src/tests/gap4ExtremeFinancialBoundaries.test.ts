import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ServerPostingEngine, JournalLineItem } from '../accounting/postingEngine';

describe('Gap 4: Extreme Financial Boundaries & Precision Arithmetic', () => {
  const ORG_ID = 'org-gap4-boundaries';
  const USER_ID = 'usr-gap4-accountant';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Seed user
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'gap4@accountant.test', 'hashed_pass', 'Gap 4 Accountant', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    // Seed organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-gap4', 'pub-gap4', 'GAP4', 'Boundaries Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // Seed accounts
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ('acc-bank', $1, '1010', 'Primary Operating Bank', 'Asset', 'Bank', 500000.00, 'Active'),
         ('acc-exp-1', $1, '5001', 'Cloud Infrastructure', 'Expense', 'OperatingExpense', 0.00, 'Active'),
         ('acc-exp-2', $1, '5002', 'Software Licensing', 'Expense', 'OperatingExpense', 0.00, 'Active'),
         ('acc-exp-3', $1, '5003', 'Consulting & Legal', 'Expense', 'OperatingExpense', 0.00, 'Active'),
         ('acc-exp-4', $1, '5004', 'Office Supplies', 'Expense', 'OperatingExpense', 0.00, 'Active'),
         ('acc-rev', $1, '4000', 'Enterprise Services Revenue', 'Revenue', 'OperatingRevenue', 0.00, 'Active')
       ON CONFLICT DO NOTHING`,
      [ORG_ID]
    );
  });

  it('1. Perfectly reconciles odd 3-way splits down to the exact penny without rounding leakage', async () => {
    // A $100 expense split across 3 expense accounts: $33.33, $33.33, $33.34 balancing against $100.00
    const entry = await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-SPLIT-001',
      date: '2026-09-01',
      description: '3-way odd split test',
      lines: [
        { accountId: 'acc-exp-1', debit: 33.33, credit: 0, description: 'Split 1/3' },
        { accountId: 'acc-exp-2', debit: 33.33, credit: 0, description: 'Split 2/3' },
        { accountId: 'acc-exp-3', debit: 33.34, credit: 0, description: 'Split 3/3 penny balance' },
        { accountId: 'acc-bank', debit: 0, credit: 100.00, description: 'Bank payment' },
      ],
    });

    expect(entry.entryId).toBeDefined();

    // Verify lines in database
    const lines = await db.query(
      `SELECT SUM(debit) AS total_debit, SUM(credit) AS total_credit
         FROM journal_lines WHERE journal_entry_id = $1`,
      [entry.entryId]
    );
    expect(Number(lines.rows[0].total_debit)).toBe(100.00);
    expect(Number(lines.rows[0].total_credit)).toBe(100.00);

    // Verify account balances reflect exact pennies
    const b1 = await db.query(`SELECT balance FROM accounts WHERE id = 'acc-exp-1'`);
    const b2 = await db.query(`SELECT balance FROM accounts WHERE id = 'acc-exp-2'`);
    const b3 = await db.query(`SELECT balance FROM accounts WHERE id = 'acc-exp-3'`);
    expect(Number(b1.rows[0].balance)).toBe(33.33);
    expect(Number(b2.rows[0].balance)).toBe(33.33);
    expect(Number(b3.rows[0].balance)).toBe(33.34);
  });

  it('2. Atomically posts high-volume batch of 250 journal lines with exact debit-credit parity', async () => {
    const lines: JournalLineItem[] = [];
    const accounts = ['acc-exp-1', 'acc-exp-2', 'acc-exp-3', 'acc-exp-4'];
    let totalDebit = 0;

    // Create 249 debit lines of $10.00 each = $2,490.00
    for (let i = 0; i < 249; i++) {
      const accId = accounts[i % accounts.length];
      lines.push({
        accountId: accId,
        debit: 10.00,
        credit: 0,
        description: `Batch item ${i + 1}`,
      });
      totalDebit += 10.00;
    }

    // 1 balancing credit line for $2,490.00
    lines.push({
      accountId: 'acc-bank',
      debit: 0,
      credit: totalDebit,
      description: 'Balancing bank outflow',
    });

    const entry = await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-BULK-250',
      date: '2026-09-02',
      description: 'Bulk 250-line journal posting',
      lines,
    });

    expect(entry.entryId).toBeDefined();

    // Verify all 250 lines are recorded
    const lineCount = await db.query(
      `SELECT COUNT(*) AS total FROM journal_lines WHERE journal_entry_id = $1`,
      [entry.entryId]
    );
    expect(Number(lineCount.rows[0].total)).toBe(250);
  });

  it('3. Strictly rejects unbalanced journals and micro-cent fraction discrepancies', async () => {
    // A. 1 cent discrepancy ($100.00 debit vs $99.99 credit) must fail
    await expect(
      ServerPostingEngine.postEntry({
        organizationId: ORG_ID,
        entryNumber: 'JE-ERR-001',
        date: '2026-09-03',
        description: 'Unbalanced 1-cent entry',
        lines: [
          { accountId: 'acc-exp-1', debit: 100.00, credit: 0 },
          { accountId: 'acc-bank', debit: 0, credit: 99.99 },
        ],
      })
    ).rejects.toThrow(/Journal is unbalanced/i);

    // B. Negative amount must fail
    await expect(
      ServerPostingEngine.postEntry({
        organizationId: ORG_ID,
        entryNumber: 'JE-ERR-002',
        date: '2026-09-03',
        description: 'Negative debit entry',
        lines: [
          { accountId: 'acc-exp-1', debit: -50.00, credit: 0 },
          { accountId: 'acc-bank', debit: 0, credit: -50.00 },
        ],
      })
    ).rejects.toThrow(/must be a non-negative amount/i);

    // C. Zero debit and credit on a line must fail
    await expect(
      ServerPostingEngine.postEntry({
        organizationId: ORG_ID,
        entryNumber: 'JE-ERR-003',
        date: '2026-09-03',
        description: 'Zero line entry',
        lines: [
          { accountId: 'acc-exp-1', debit: 0, credit: 0 },
          { accountId: 'acc-bank', debit: 0, credit: 0 },
        ],
      })
    ).rejects.toThrow();
  });
});
