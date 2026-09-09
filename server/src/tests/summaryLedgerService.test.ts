import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SummaryLedgerService } from '../accounting/SummaryLedgerService';
import { ServerPostingEngine } from '../accounting/postingEngine';

describe('Weakness Remediation 2: Materialized Monthly GL Rollups', () => {
  const ORG_ID = 'org-summary-rollup-001';
  const USER_ID = 'usr-summary-admin';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // 1. Seed user & org
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'rollup@firmbooks.test', 'hashed_pass', 'Rollup Admin', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-rollup-1', 'pub-rollup-1', 'ROLL1', 'Rollup Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // 2. Seed accounts
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ('acc-bank-1', $1, '1010', 'Primary Bank', 'Asset', 'Bank', 100000.00, 'Active'),
         ('acc-rev-1', $1, '4000', 'Enterprise Sales', 'Revenue', 'OperatingRevenue', 0.00, 'Active')
       ON CONFLICT DO NOTHING`,
      [ORG_ID]
    );
  });

  it('1. Incrementally aggregates debit and credit turnover into monthly summary table', async () => {
    await db.transaction(async (tx) => {
      await SummaryLedgerService.recordJournalLines(
        tx,
        ORG_ID,
        [
          { accountId: 'acc-bank-1', debit: 15000, credit: 0 },
          { accountId: 'acc-rev-1', debit: 0, credit: 15000 },
        ],
        '2026-09-15'
      );
    });

    const summary = await SummaryLedgerService.getAccountMonthlySummary(ORG_ID, 'acc-bank-1', 2026, 9);
    expect(summary).not.toBeNull();
    expect(summary!.debitTurnover).toBe(15000);
    expect(summary!.creditTurnover).toBe(0);
    expect(summary!.netTurnover).toBe(15000);

    // Second journal in same month updates incrementally
    await db.transaction(async (tx) => {
      await SummaryLedgerService.recordJournalLines(
        tx,
        ORG_ID,
        [{ accountId: 'acc-bank-1', debit: 5000, credit: 2000 }],
        '2026-09-20'
      );
    });

    const updated = await SummaryLedgerService.getAccountMonthlySummary(ORG_ID, 'acc-bank-1', 2026, 9);
    expect(updated!.debitTurnover).toBe(20000);
    expect(updated!.creditTurnover).toBe(2000);
    expect(updated!.netTurnover).toBe(18000);
  });

  it('2. Rebuilds historical monthly rollups with exact parity against posted journal lines', async () => {
    // Post real journal entries via ServerPostingEngine
    await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-ROLLUP-001',
      date: '2026-08-10',
      description: 'August transaction',
      lines: [
        { accountId: 'acc-bank-1', debit: 50000, credit: 0 },
        { accountId: 'acc-rev-1', debit: 0, credit: 50000 },
      ],
    });

    await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-ROLLUP-002',
      date: '2026-08-25',
      description: 'August transaction 2',
      lines: [
        { accountId: 'acc-bank-1', debit: 25000, credit: 0 },
        { accountId: 'acc-rev-1', debit: 0, credit: 25000 },
      ],
    });

    // Rebuild
    const rebuildRes = await SummaryLedgerService.rebuildMonthlyRollups(ORG_ID);
    expect(rebuildRes.processedRecords).toBeGreaterThanOrEqual(2);

    const augSummary = await SummaryLedgerService.getAccountMonthlySummary(ORG_ID, 'acc-bank-1', 2026, 8);
    expect(augSummary).not.toBeNull();
    expect(augSummary!.debitTurnover).toBe(75000);
    expect(augSummary!.creditTurnover).toBe(0);
    expect(augSummary!.netTurnover).toBe(75000);
  });
});
