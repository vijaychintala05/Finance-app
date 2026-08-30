import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { FixedAssetService } from '../services/FixedAssetService';
import { PeriodCloseService } from '../services/PeriodCloseService';

const orgId = 'org-point1-assets-close';
const userId = 'usr-point1-assets-close';

const healthyIntegrity = (balanced = true): any => ({
  checks: {
    trialBalance: { isBalanced: balanced, difference: balanced ? '0.00' : '1.00' },
    accountsReceivable: { isBalanced: true, difference: '0.00' },
    accountsPayable: { isBalanced: true, difference: '0.00' },
  },
});

async function seed(): Promise<void> {
  await db.query(
    `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
     VALUES ($1,$2,$3,$4,'Point 1 Org','India','INR','INR',$5)`,
    [orgId, `uuid-${orgId}`, `public-${orgId}`, 'P1AC', userId]
  );
  await db.query(`INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status, is_locked) VALUES
    ('asset-cost', $1, '1500', 'Equipment', 'Asset', 'Fixed Asset', 0, 'Active', FALSE),
    ('asset-accdep', $1, '1510', 'Accumulated Depreciation', 'Asset', 'Fixed Asset', 0, 'Active', FALSE),
    ('asset-depexp', $1, '6100', 'Depreciation Expense', 'Expense', 'Operating Expense', 0, 'Active', FALSE),
    ('asset-bank', $1, '1010', 'Bank', 'Asset', 'Bank', 0, 'Active', FALSE),
    ('asset-gainloss', $1, '6200', 'Asset Gain Loss', 'Expense', 'Other Expense', 0, 'Active', FALSE)`, [orgId]);
}

async function createAsset(code = 'LAP-001') {
  return FixedAssetService.createAsset(orgId, userId, {
    assetCode: code, name: 'Laptop', assetCategory: 'Equipment', purchaseDate: '2026-01-01',
    inServiceDate: '2026-01-01', purchaseValue: 1000.01, residualValue: 0, usefulLifeMonths: 3,
    assetAccountId: 'asset-cost', accumulatedDepreciationAccountId: 'asset-accdep',
    depreciationExpenseAccountId: 'asset-depexp',
  });
}

beforeEach(async () => {
  vi.restoreAllMocks();
  db.initPgMem();
  await MigrationRunner.runMigrations();
  await seed();
});

describe('Point-1 fixed asset atomic lifecycle', () => {
  it('posts exact-cent depreciation with evidence and audit, then rejects a duplicate period', async () => {
    const asset = await createAsset();
    const result = await FixedAssetService.postMonthlyDepreciation(orgId, userId, asset.id, '2026-01');
    expect(result.monthlyDepreciation).toBe(333.34);
    const entry = await db.query('SELECT * FROM fixed_asset_depreciation_entries WHERE asset_id=$1', [asset.id]);
    expect(entry.rows).toHaveLength(1);
    expect(entry.rows[0].status).toBe('POSTED');
    expect(Number(entry.rows[0].depreciation_amount)).toBe(333.34);
    expect((await db.query("SELECT id FROM audit_logs WHERE entity_id=$1 AND action='FIXED_ASSET_DEPRECIATION_POSTED'", [entry.rows[0].id])).rows).toHaveLength(1);
    await expect(FixedAssetService.postMonthlyDepreciation(orgId, userId, asset.id, '2026-01'))
      .rejects.toThrow(/ALREADY_DEPRECIATED/);
  });

  it('rolls back the posted journal when the lifecycle command fails after posting', async () => {
    const asset = await createAsset('ROLLBACK-1');
    const original = ServerPostingEngine.postEntry.bind(ServerPostingEngine);
    vi.spyOn(ServerPostingEngine, 'postEntry').mockImplementationOnce(async (...args: Parameters<typeof ServerPostingEngine.postEntry>) => {
      await original(...args);
      throw new Error('forced failure after journal');
    });
    await expect(FixedAssetService.postMonthlyDepreciation(orgId, userId, asset.id, '2026-01'))
      .rejects.toThrow('forced failure after journal');
    expect((await db.query("SELECT id FROM journal_entries WHERE organization_id=$1 AND entry_number LIKE 'FADEP-%'", [orgId])).rows).toHaveLength(0);
    expect((await db.query('SELECT id FROM fixed_asset_depreciation_entries WHERE asset_id=$1', [asset.id])).rows).toHaveLength(0);
  });

  it('atomically reverses depreciation and prevents replay', async () => {
    const asset = await createAsset('REV-DEP-1');
    await FixedAssetService.postMonthlyDepreciation(orgId, userId, asset.id, '2026-01');
    const result = await FixedAssetService.reverseDepreciation(orgId, userId, asset.id, '2026-01', 'Posting correction', '2026-02-01');
    expect(result.status).toBe('REVERSED');
    const entry = (await db.query('SELECT * FROM fixed_asset_depreciation_entries WHERE asset_id=$1', [asset.id])).rows[0];
    expect(entry.status).toBe('REVERSED');
    expect(entry.reversal_journal_id).toBe(result.reversalJournalId);
    await expect(FixedAssetService.reverseDepreciation(orgId, userId, asset.id, '2026-01', 'Replay correction', '2026-02-01'))
      .rejects.toThrow(/ALREADY_REVERSED/);
  });

  it('disposes and reverses an asset with journal, event, source state, and audit in each transaction', async () => {
    const asset = await createAsset('DISPOSE-1');
    const disposal = await FixedAssetService.disposeAsset(orgId, userId, asset.id, '2026-02-01', 800,
      'asset-bank', 'asset-gainloss');
    expect(disposal).toMatchObject({ status: 'DISPOSED', netBookValue: 1000.01, gainOrLoss: -200.01 });
    expect((await db.query("SELECT id FROM fixed_asset_lifecycle_events WHERE asset_id=$1 AND status='POSTED'", [asset.id])).rows).toHaveLength(1);
    const reversal = await FixedAssetService.reverseDisposal(orgId, userId, asset.id, 'Sale was cancelled', '2026-02-02');
    expect(reversal.status).toBe('ACTIVE');
    const current = (await db.query('SELECT * FROM fixed_assets WHERE id=$1', [asset.id])).rows[0];
    expect(current.status).toBe('ACTIVE');
    expect(current.disposal_journal_id).toBeNull();
    expect((await db.query("SELECT id FROM fixed_asset_lifecycle_events WHERE asset_id=$1 AND status='REVERSED'", [asset.id])).rows).toHaveLength(1);
    await expect(FixedAssetService.reverseDisposal(orgId, userId, asset.id, 'Replay cancellation', '2026-02-02'))
      .rejects.toThrow(/NOT_DISPOSED/);
  });
});

describe('Point-1 period close and reopen atomic lifecycle', () => {
  it('requires a saved review to be ready before close and retains the review evidence', async () => {
    vi.spyOn(AccountingIntegrityService, 'verifyOrganizationIntegrity').mockResolvedValue(healthyIntegrity());
    await PeriodCloseService.saveReview(orgId, userId, '2026-04', '2026-04-01', '2026-04-30', [], 'Initial close review');
    await expect(PeriodCloseService.closePeriod(orgId, userId, '2026-04', '2026-04-01', '2026-04-30'))
      .rejects.toThrow(/REVIEW_INCOMPLETE/);
    await PeriodCloseService.saveReview(orgId, userId, '2026-04', '2026-04-01', '2026-04-30', [
      { code: 'REVIEW_TRIAL_BALANCE', title: '', completed: true },
      { code: 'REVIEW_AR_AGING', title: '', completed: true },
      { code: 'REVIEW_AP_AGING', title: '', completed: true },
      { code: 'REVIEW_BANK_RECON', title: '', completed: true },
    ], 'All month-end review tasks completed');
    const ready = await PeriodCloseService.getWorkspace(orgId, '2026-04', '2026-04-01', '2026-04-30');
    expect(ready.review?.status).toBe('READY_TO_CLOSE');
    await PeriodCloseService.closePeriod(orgId, userId, '2026-04', '2026-04-01', '2026-04-30');
    const close = (await db.query("SELECT status, close_evidence FROM accounting_period_closes WHERE organization_id=$1 AND period_key='2026-04'", [orgId])).rows[0];
    expect(close.status).toBe('CLOSED');
    expect(close.close_evidence).toBeTruthy();
  });

  it('locks, revalidates, records evidence and audit, and treats duplicate close as idempotent', async () => {
    const integrity = vi.spyOn(AccountingIntegrityService, 'verifyOrganizationIntegrity').mockResolvedValue(healthyIntegrity());
    await PeriodCloseService.closePeriod(orgId, userId, '2026-01', '2026-01-01', '2026-01-31');
    await PeriodCloseService.closePeriod(orgId, userId, '2026-01', '2026-01-01', '2026-01-31');
    expect(integrity).toHaveBeenCalledTimes(1);
    const close = (await db.query("SELECT * FROM accounting_period_closes WHERE organization_id=$1 AND period_key='2026-01'", [orgId])).rows[0];
    expect(close.status).toBe('CLOSED');
    expect(close.checklist_summary).toBeTruthy();
    expect((await db.query("SELECT id FROM period_locks WHERE organization_id=$1 AND period_name='2026-01' AND is_locked=TRUE", [orgId])).rows).toHaveLength(1);
    expect((await db.query("SELECT id FROM accounting_period_close_events WHERE organization_id=$1 AND period_key='2026-01' AND event_type='CLOSED'", [orgId])).rows).toHaveLength(1);
    expect((await db.query("SELECT id FROM audit_logs WHERE entity_id=$1 AND action='ACCOUNTING_PERIOD_CLOSED'", [close.id])).rows).toHaveLength(1);
  });

  it('rolls back the lock and close record when in-transaction revalidation blocks close', async () => {
    vi.spyOn(AccountingIntegrityService, 'verifyOrganizationIntegrity').mockResolvedValue(healthyIntegrity(false));
    await expect(PeriodCloseService.closePeriod(orgId, userId, '2026-02', '2026-02-01', '2026-02-28'))
      .rejects.toThrow(/PERIOD_CLOSE_BLOCKED/);
    expect((await db.query("SELECT id FROM accounting_period_closes WHERE organization_id=$1 AND period_key='2026-02'", [orgId])).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM period_locks WHERE organization_id=$1 AND period_name='2026-02'", [orgId])).rows).toHaveLength(0);
  });

  it('reopens only a closed, actively locked period and writes evidence and audit atomically', async () => {
    vi.spyOn(AccountingIntegrityService, 'verifyOrganizationIntegrity').mockResolvedValue(healthyIntegrity());
    await PeriodCloseService.closePeriod(orgId, userId, '2026-03', '2026-03-01', '2026-03-31');
    await PeriodCloseService.reopenPeriod(orgId, userId, '2026-03', 'Late bank statement received');
    const close = (await db.query("SELECT * FROM accounting_period_closes WHERE organization_id=$1 AND period_key='2026-03'", [orgId])).rows[0];
    expect(close.status).toBe('REOPENED');
    expect((await db.query("SELECT id FROM period_locks WHERE organization_id=$1 AND period_name='2026-03' AND is_locked=FALSE", [orgId])).rows).toHaveLength(1);
    expect((await db.query("SELECT id FROM accounting_period_close_events WHERE organization_id=$1 AND period_key='2026-03'", [orgId])).rows).toHaveLength(2);
    expect((await db.query("SELECT id FROM audit_logs WHERE entity_id=$1 AND action='ACCOUNTING_PERIOD_REOPENED'", [close.id])).rows).toHaveLength(1);
    await expect(PeriodCloseService.reopenPeriod(orgId, userId, '2026-03', 'Replay reopen request'))
      .rejects.toThrow(/PERIOD_NOT_CLOSED/);
  });
});
