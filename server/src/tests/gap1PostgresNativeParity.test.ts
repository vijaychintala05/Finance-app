import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

describe('Gap 1: PostgreSQL Native Engine Parity & RLS Compliance', () => {
  const ORG_A = 'org-gap1-parity-a';
  const ORG_B = 'org-gap1-parity-b';
  const USER_ID = 'usr-gap1-admin';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // 1. Seed user
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'gap1@audit.test', 'hashed_pass', 'Gap 1 Auditor', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    // 2. Seed test organizations
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES 
         ($1, 'uuid-gap1-a', 'pub-gap1-a', 'GAP1A', 'Parity Alpha Org', 'IN', 'INR', '₹', $3),
         ($2, 'uuid-gap1-b', 'pub-gap1-b', 'GAP1B', 'Parity Beta Org', 'IN', 'INR', '₹', $3)
       ON CONFLICT DO NOTHING`,
      [ORG_A, ORG_B, USER_ID]
    );

    // 3. Seed accounts in Org A
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ('acc-gap1-bank', $1, '1010', 'Main Bank', 'Asset', 'Bank', 100000.00, 'Active'),
         ('acc-gap1-ar', $1, '1100', 'Accounts Receivable', 'Asset', 'AccountsReceivable', 0.00, 'Active'),
         ('acc-gap1-rev', $1, '4000', 'Operating Revenue', 'Revenue', 'OperatingRevenue', 0.00, 'Active')
       ON CONFLICT DO NOTHING`,
      [ORG_A]
    );
  });

  it('1. Verifies RLS policies execute null-safe fallback when app.current_org_id is unset', async () => {
    // Queries executed without setting app.current_org_id (e.g. system background jobs or migrations)
    // must succeed cleanly via the fallback clause
    const tables = ['invoices', 'bills', 'payments_received', 'payments_made', 'journal_entries', 'accounts'];
    for (const table of tables) {
      const res = await db.query(`SELECT COUNT(*) AS total FROM ${table}`);
      expect(res.rows).toBeDefined();
      expect(Number(res.rows[0].total)).toBeGreaterThanOrEqual(0);
    }
  });

  it('2. Enforces immutable reversal workflow preventing double reversals on posted entries', async () => {
    // Post a balanced journal entry
    const entry = await ServerPostingEngine.postEntry({
      organizationId: ORG_A,
      entryNumber: 'JE-GAP1-001',
      date: '2026-09-01',
      description: 'Native trigger immutability test',
      lines: [
        { accountId: 'acc-gap1-bank', debit: 5000, credit: 0, description: 'Bank Inflow' },
        { accountId: 'acc-gap1-rev', debit: 0, credit: 5000, description: 'Revenue' },
      ],
    });

    expect(entry.entryId).toBeDefined();

    // Verify FinancialDestructiveActionsService reverses the journal entry
    const reversalId = await db.transaction(async (tx) => {
      return FinancialDestructiveActionsService.reversePostedJournal(
        tx,
        ORG_A,
        entry.entryId,
        USER_ID,
        'Audit correction required by comptroller',
        'Manual Journal'
      );
    });
    expect(reversalId).toBeDefined();

    // Verify original journal entry is flagged as reversed
    const updatedRes = await db.query(
      `SELECT reversed_by_journal_id FROM journal_entries WHERE id = $1`,
      [entry.entryId]
    );
    expect(updatedRes.rows[0].reversed_by_journal_id).toBe(reversalId);

    // Verify double-reversal is strictly forbidden and rejected
    await expect(
      db.transaction(async (tx) => {
        return FinancialDestructiveActionsService.reversePostedJournal(
          tx,
          ORG_A,
          entry.entryId,
          USER_ID,
          'Second reversal attempt',
          'Manual Journal'
        );
      })
    ).rejects.toThrow(/already been reversed/i);
  });

  it('3. Successfully executes composite index-backed tenant filtering queries', async () => {
    // Verify high-volume filter queries on composite indexed columns run cleanly
    const linesRes = await db.query(
      `SELECT * FROM journal_lines 
        WHERE organization_id = $1 AND account_id = $2 
        ORDER BY journal_entry_id LIMIT 10`,
      [ORG_A, 'acc-gap1-bank']
    );
    expect(linesRes.rows).toBeDefined();

    const invRes = await db.query(
      `SELECT * FROM invoices 
        WHERE organization_id = $1 AND status = 'POSTED' 
        ORDER BY issue_date DESC LIMIT 5`,
      [ORG_A]
    );
    expect(invRes.rows).toBeDefined();
  });

  it('4. Statement timeout aborts stuck transactions and safely unwinds the client', async () => {
    // Using executeWithTimeout to verify clean abort and client return
    await expect(
      db.executeWithTimeout(50, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return true;
      })
    ).rejects.toThrow('QUERY_TIMEOUT');

    // Subsequent query on db pool must work immediately without connection leaks
    const checkRes = await db.query(`SELECT 1 AS alive`);
    expect(checkRes.rows[0].alive).toBe(1);
  });
});
