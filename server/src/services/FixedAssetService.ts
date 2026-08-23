import { ServerPostingEngine } from '../accounting/postingEngine';
import { db, DbQueryClient } from '../database/db';
import { isIsoCalendarDate } from '../utils/date';
import { newId } from '../utils/ids';
import { centsToSafeNumber, databaseMoneyToCents, moneyInputToCents } from '../utils/money';

export interface FixedAssetInput {
  assetCode: string; name: string; description?: string; assetCategory: string;
  purchaseDate: string; inServiceDate: string; purchaseValue: number; residualValue?: number;
  usefulLifeMonths: number; assetAccountId: string; accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string; vendorId?: string; billId?: string; projectId?: string; locationId?: string;
}

const asNumber = (value: bigint, field: string) => centsToSafeNumber(value, field);
const dbDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

function periodEnd(periodKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
    throw new Error('FIXED_ASSET_PERIOD_INVALID: Period must use YYYY-MM format');
  }
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return `${periodKey}-${String(day).padStart(2, '0')}`;
}

function reversalReason(reason: string): string {
  const value = String(reason || '').trim();
  if (value.length < 5 || value.length > 1000) {
    throw new Error('FIXED_ASSET_REVERSAL_REASON_INVALID: Reversal reason must contain 5-1000 characters');
  }
  return value;
}

async function reverseSourceJournal(
  tx: DbQueryClient, orgId: string, userId: string, journalId: string, date: string, reason: string
) {
  const journalRes = await tx.query(
    'SELECT * FROM journal_entries WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, journalId]
  );
  if (journalRes.rows.length !== 1) throw new Error('FIXED_ASSET_JOURNAL_NOT_FOUND: Source journal does not exist');
  const original = journalRes.rows[0];
  if (original.reversed_by_journal_id) throw new Error('FIXED_ASSET_JOURNAL_ALREADY_REVERSED: Source journal is already reversed');
  const lines = await tx.query(
    `SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.organization_id = $1 AND jl.journal_entry_id = $2 ORDER BY jl.id FOR UPDATE`,
    [orgId, journalId]
  );
  if (lines.rows.length < 2) throw new Error('FIXED_ASSET_JOURNAL_INVALID: Source journal has insufficient lines');
  const reversalEntryNumber = `RV-${original.entry_number}`;
  const posting = await ServerPostingEngine.postEntry({
    organizationId: orgId, entryNumber: reversalEntryNumber, date,
    reference: `REV-${original.reference || original.entry_number}`,
    description: `Reversal of ${original.entry_number}: ${reason}`,
    lines: lines.rows.map((line: any) => ({
      accountId: line.account_id,
      debit: asNumber(databaseMoneyToCents(line.credit, 'Reversal debit'), 'Reversal debit'),
      credit: asNumber(databaseMoneyToCents(line.debit, 'Reversal credit'), 'Reversal credit'),
      description: `Reversal: ${line.description || ''}`,
    })),
  }, tx);
  const originalUpdate = await tx.query(
    `UPDATE journal_entries SET reversed_by_journal_id = $1, reversed_at = CURRENT_TIMESTAMP,
      reversed_by = $2, reversal_reason = $3
      WHERE organization_id = $4 AND id = $5 AND reversed_by_journal_id IS NULL`,
    [posting.entryId, userId, reason, orgId, journalId]
  );
  if (originalUpdate.rowCount !== 1) throw new Error('FIXED_ASSET_JOURNAL_ALREADY_REVERSED: Source journal is already reversed');
  const reversalUpdate = await tx.query(
    `UPDATE journal_entries SET reversal_of_journal_id = $1, reversal_reason = $2
      WHERE organization_id = $3 AND id = $4 AND reversal_of_journal_id IS NULL`,
    [journalId, reason, orgId, posting.entryId]
  );
  if (reversalUpdate.rowCount !== 1) throw new Error('FIXED_ASSET_REVERSAL_JOURNAL_INVALID: Reversal journal was not linked');
  return { reversalJournalId: posting.entryId, reversalEntryNumber };
}

export class FixedAssetService {
  public static async createAsset(orgId: string, userId: string, input: FixedAssetInput): Promise<any> {
    if (!input?.assetCode?.trim() || !input.name?.trim() || !input.assetCategory?.trim()) {
      throw new Error('FIXED_ASSET_INPUT_INVALID: Asset code, name, and category are required');
    }
    if (!isIsoCalendarDate(input.purchaseDate) || !isIsoCalendarDate(input.inServiceDate)) {
      throw new Error('FIXED_ASSET_DATE_INVALID: Purchase and in-service dates must be real YYYY-MM-DD dates');
    }
    if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths <= 0) {
      throw new Error('FIXED_ASSET_LIFE_INVALID: Useful life must be a positive whole number of months');
    }
    const purchase = moneyInputToCents(input.purchaseValue, 'Purchase value');
    const residual = moneyInputToCents(input.residualValue ?? 0, 'Residual value');
    if (purchase <= 0n || residual < 0n || residual > purchase) {
      throw new Error('FIXED_ASSET_VALUE_INVALID: Purchase value must be positive and residual value cannot exceed it');
    }
    return db.transaction(async (tx) => {
      const id = newId('fa');
      await tx.query(
        `INSERT INTO fixed_assets (id, organization_id, asset_code, name, description, asset_category,
          purchase_date, in_service_date, purchase_value, residual_value, useful_life_months, depreciation_method,
          asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
          vendor_id, bill_id, project_id, location_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'STRAIGHT_LINE',$12,$13,$14,$15,$16,$17,$18,'ACTIVE')`,
        [id, orgId, input.assetCode.trim(), input.name.trim(), input.description || '', input.assetCategory.trim(),
          input.purchaseDate, input.inServiceDate, asNumber(purchase, 'Purchase value'), asNumber(residual, 'Residual value'),
          input.usefulLifeMonths, input.assetAccountId, input.accumulatedDepreciationAccountId,
          input.depreciationExpenseAccountId, input.vendorId || null, input.billId || null,
          input.projectId || null, input.locationId || null]
      );
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1,$2,$3,'FIXED_ASSET_CREATED','FixedAsset',$4,$5)`,
        [newId('aud'), orgId, userId, id, JSON.stringify({ assetCode: input.assetCode.trim(), status: 'ACTIVE', purchaseValue: asNumber(purchase, 'Purchase value') })]
      );
      return { id, assetCode: input.assetCode.trim(), name: input.name.trim(), status: 'ACTIVE' };
    });
  }

  public static async getAssets(orgId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT fa.*, COALESCE(dep.total_accumulated_depreciation, 0) AS total_accumulated_depreciation
         FROM fixed_assets fa
         LEFT JOIN (
           SELECT organization_id, asset_id, SUM(depreciation_amount) AS total_accumulated_depreciation
             FROM fixed_asset_depreciation_entries
            WHERE status = 'POSTED'
            GROUP BY organization_id, asset_id
         ) dep ON dep.organization_id = fa.organization_id AND dep.asset_id = fa.id
        WHERE fa.organization_id = $1 ORDER BY fa.created_at DESC`, [orgId]
    );
    return result.rows.map((row: any) => {
      const cost = databaseMoneyToCents(row.purchase_value, 'Purchase value');
      const accumulated = databaseMoneyToCents(row.total_accumulated_depreciation, 'Accumulated depreciation');
      return { ...row, purchase_value: asNumber(cost, 'Purchase value'),
        residual_value: asNumber(databaseMoneyToCents(row.residual_value, 'Residual value'), 'Residual value'),
        accumulated_depreciation: asNumber(accumulated, 'Accumulated depreciation'),
        net_book_value: asNumber(cost - accumulated, 'Net book value') };
    });
  }

  public static async postMonthlyDepreciation(orgId: string, userId: string, assetId: string, periodKey: string): Promise<any> {
    const date = periodEnd(periodKey);
    return db.transaction(async (tx) => {
      const assetRes = await tx.query('SELECT * FROM fixed_assets WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, assetId]);
      if (assetRes.rows.length !== 1) throw new Error('FIXED_ASSET_NOT_FOUND: Fixed asset does not exist');
      const asset = assetRes.rows[0];
      if (asset.status !== 'ACTIVE') throw new Error('FIXED_ASSET_NOT_ACTIVE: Only active assets can be depreciated');
      if (dbDate(asset.in_service_date) > date) throw new Error('FIXED_ASSET_NOT_IN_SERVICE: Asset was not in service during this period');
      await tx.query(
        'SELECT id FROM fixed_asset_depreciation_entries WHERE organization_id = $1 AND asset_id = $2 ORDER BY id FOR UPDATE',
        [orgId, assetId]
      );
      const duplicate = await tx.query(
        'SELECT id FROM fixed_asset_depreciation_entries WHERE organization_id = $1 AND asset_id = $2 AND period_key = $3',
        [orgId, assetId, periodKey]
      );
      if (duplicate.rows.length) throw new Error('FIXED_ASSET_ALREADY_DEPRECIATED: This asset and period already have a lifecycle record');
      const total = await tx.query(
        `SELECT COALESCE(SUM(depreciation_amount),0) AS amount FROM fixed_asset_depreciation_entries
          WHERE organization_id = $1 AND asset_id = $2 AND status = 'POSTED'`, [orgId, assetId]
      );
      const cost = databaseMoneyToCents(asset.purchase_value, 'Purchase value');
      const residual = databaseMoneyToCents(asset.residual_value, 'Residual value');
      const accumulated = databaseMoneyToCents(total.rows[0]?.amount, 'Accumulated depreciation');
      const depreciable = cost - residual;
      const remaining = depreciable - accumulated;
      if (remaining <= 0n) throw new Error('FIXED_ASSET_FULLY_DEPRECIATED: No depreciable value remains');
      const life = BigInt(asset.useful_life_months);
      const regular = (depreciable + life / 2n) / life;
      const cents = regular < remaining ? regular : remaining;
      if (cents <= 0n) throw new Error('FIXED_ASSET_ZERO_DEPRECIATION: Calculated depreciation is zero');
      const amount = asNumber(cents, 'Monthly depreciation');
      const entryNumber = `FADEP-${assetId}-${periodKey}`;
      const journal = await ServerPostingEngine.postEntry({
        organizationId: orgId, entryNumber, date, reference: `DEP-${asset.asset_code}-${periodKey}`,
        description: `Monthly depreciation for ${asset.asset_code} (${asset.name})`,
        lines: [
          { accountId: asset.depreciation_expense_account_id, debit: amount, credit: 0, description: `Depreciation expense - ${asset.name}` },
          { accountId: asset.accumulated_depreciation_account_id, debit: 0, credit: amount, description: `Accumulated depreciation - ${asset.name}` },
        ],
      }, tx);
      const entryId = newId('fde');
      await tx.query(
        `INSERT INTO fixed_asset_depreciation_entries
          (id, organization_id, asset_id, period_key, depreciation_amount, journal_entry_id, posted_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'POSTED')`, [entryId, orgId, assetId, periodKey, amount, journal.entryId, date]
      );
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1,$2,$3,'FIXED_ASSET_DEPRECIATION_POSTED','FixedAssetDepreciation',$4,$5)`,
        [newId('aud'), orgId, userId, entryId, JSON.stringify({ assetId, periodKey, amount, journalId: journal.entryId })]
      );
      return { assetId, periodKey, monthlyDepreciation: amount, journalId: journal.entryId, entryNumber };
    });
  }

  public static async disposeAsset(orgId: string, userId: string, assetId: string, disposalDate: string,
    saleProceeds: number, proceedsBankAccountId: string, gainLossAccountId: string): Promise<any> {
    if (!isIsoCalendarDate(disposalDate)) throw new Error('FIXED_ASSET_DISPOSAL_DATE_INVALID: Disposal date must be a real YYYY-MM-DD date');
    const proceeds = moneyInputToCents(saleProceeds, 'Sale proceeds');
    if (proceeds < 0n) throw new Error('FIXED_ASSET_PROCEEDS_INVALID: Sale proceeds cannot be negative');
    return db.transaction(async (tx) => {
      const assetRes = await tx.query('SELECT * FROM fixed_assets WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, assetId]);
      if (assetRes.rows.length !== 1) throw new Error('FIXED_ASSET_NOT_FOUND: Asset not found');
      const asset = assetRes.rows[0];
      if (asset.status !== 'ACTIVE') throw new Error('FIXED_ASSET_ALREADY_DISPOSED: Only active assets can be disposed');
      await tx.query('SELECT id FROM fixed_asset_depreciation_entries WHERE organization_id = $1 AND asset_id = $2 ORDER BY id FOR UPDATE', [orgId, assetId]);
      const total = await tx.query(
        `SELECT COALESCE(SUM(depreciation_amount),0) AS amount FROM fixed_asset_depreciation_entries
          WHERE organization_id = $1 AND asset_id = $2 AND status = 'POSTED'`, [orgId, assetId]
      );
      const cost = databaseMoneyToCents(asset.purchase_value, 'Asset cost');
      const accumulated = databaseMoneyToCents(total.rows[0]?.amount, 'Accumulated depreciation');
      const netBook = cost - accumulated;
      const gainLoss = proceeds - netBook;
      const lines: any[] = [];
      if (proceeds > 0n) lines.push({ accountId: proceedsBankAccountId, debit: asNumber(proceeds, 'Sale proceeds'), credit: 0, description: `Proceeds from ${asset.name}` });
      if (accumulated > 0n) lines.push({ accountId: asset.accumulated_depreciation_account_id, debit: asNumber(accumulated, 'Accumulated depreciation'), credit: 0, description: `Clear accumulated depreciation - ${asset.name}` });
      lines.push({ accountId: asset.asset_account_id, debit: 0, credit: asNumber(cost, 'Asset cost'), description: `Remove asset at cost - ${asset.name}` });
      if (gainLoss > 0n) lines.push({ accountId: gainLossAccountId, debit: 0, credit: asNumber(gainLoss, 'Disposal gain'), description: `Gain on disposal - ${asset.name}` });
      if (gainLoss < 0n) lines.push({ accountId: gainLossAccountId, debit: asNumber(-gainLoss, 'Disposal loss'), credit: 0, description: `Loss on disposal - ${asset.name}` });
      const entryNumber = `FADISP-${assetId}`;
      const journal = await ServerPostingEngine.postEntry({ organizationId: orgId, entryNumber, date: disposalDate,
        reference: `DISP-${asset.asset_code}`, description: `Disposal of fixed asset ${asset.asset_code} (${asset.name})`, lines }, tx);
      const updated = await tx.query(
        `UPDATE fixed_assets SET status='DISPOSED', disposal_date=$1, disposal_proceeds=$2, disposal_journal_id=$3
          WHERE organization_id=$4 AND id=$5 AND status='ACTIVE'`, [disposalDate, asNumber(proceeds, 'Sale proceeds'), journal.entryId, orgId, assetId]
      );
      if (updated.rowCount !== 1) throw new Error('FIXED_ASSET_DISPOSAL_CONFLICT: Asset state changed during disposal');
      const eventId = newId('faevt');
      await tx.query(
        `INSERT INTO fixed_asset_lifecycle_events
          (id, organization_id, asset_id, event_type, event_date, journal_entry_id, amount, status, evidence, created_by)
         VALUES ($1,$2,$3,'DISPOSAL',$4,$5,$6,'POSTED',$7,$8)`,
        [eventId, orgId, assetId, disposalDate, journal.entryId, asNumber(proceeds, 'Sale proceeds'),
          JSON.stringify({ netBookValue: asNumber(netBook, 'Net book value'), gainOrLoss: asNumber(gainLoss, 'Gain or loss') }), userId]
      );
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1,$2,$3,'FIXED_ASSET_DISPOSED','FixedAsset',$4,$5,$6)`,
        [newId('aud'), orgId, userId, assetId, JSON.stringify({ status: 'ACTIVE' }), JSON.stringify({ status: 'DISPOSED', eventId, journalId: journal.entryId })]
      );
      return { assetId, status: 'DISPOSED', netBookValue: asNumber(netBook, 'Net book value'), saleProceeds: asNumber(proceeds, 'Sale proceeds'), gainOrLoss: asNumber(gainLoss, 'Gain or loss'), journalId: journal.entryId };
    });
  }

  public static async reverseDepreciation(orgId: string, userId: string, assetId: string, periodKey: string,
    reason: string, reversalDate = new Date().toISOString().slice(0, 10)): Promise<any> {
    const why = reversalReason(reason);
    if (!isIsoCalendarDate(reversalDate)) throw new Error('FIXED_ASSET_REVERSAL_DATE_INVALID: Reversal date must be a real YYYY-MM-DD date');
    return db.transaction(async (tx) => {
      const asset = await tx.query('SELECT id, status FROM fixed_assets WHERE organization_id=$1 AND id=$2 FOR UPDATE', [orgId, assetId]);
      if (asset.rows.length !== 1) throw new Error('FIXED_ASSET_NOT_FOUND: Asset not found');
      if (asset.rows[0].status !== 'ACTIVE') throw new Error('FIXED_ASSET_NOT_ACTIVE: Depreciation cannot be reversed after disposal');
      const entryRes = await tx.query(
        'SELECT * FROM fixed_asset_depreciation_entries WHERE organization_id=$1 AND asset_id=$2 AND period_key=$3 FOR UPDATE',
        [orgId, assetId, periodKey]
      );
      if (entryRes.rows.length !== 1) throw new Error('FIXED_ASSET_DEPRECIATION_NOT_FOUND: Depreciation lifecycle record does not exist');
      const entry = entryRes.rows[0];
      if (entry.status !== 'POSTED') throw new Error('FIXED_ASSET_DEPRECIATION_ALREADY_REVERSED: Depreciation is not posted');
      const reversal = await reverseSourceJournal(tx, orgId, userId, entry.journal_entry_id, reversalDate, why);
      const updated = await tx.query(
        `UPDATE fixed_asset_depreciation_entries SET status='REVERSED', reversed_at=CURRENT_TIMESTAMP,
          reversed_by=$1, reversal_reason=$2, reversal_journal_id=$3
          WHERE organization_id=$4 AND id=$5 AND status='POSTED'`, [userId, why, reversal.reversalJournalId, orgId, entry.id]
      );
      if (updated.rowCount !== 1) throw new Error('FIXED_ASSET_DEPRECIATION_REVERSAL_CONFLICT: Depreciation state changed');
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1,$2,$3,'FIXED_ASSET_DEPRECIATION_REVERSED','FixedAssetDepreciation',$4,$5,$6)`,
        [newId('aud'), orgId, userId, entry.id, JSON.stringify({ status: 'POSTED', journalId: entry.journal_entry_id }), JSON.stringify({ status: 'REVERSED', ...reversal, reason: why })]
      );
      return { assetId, periodKey, status: 'REVERSED', ...reversal };
    });
  }

  public static async reverseDisposal(orgId: string, userId: string, assetId: string, reason: string,
    reversalDate = new Date().toISOString().slice(0, 10)): Promise<any> {
    const why = reversalReason(reason);
    if (!isIsoCalendarDate(reversalDate)) throw new Error('FIXED_ASSET_REVERSAL_DATE_INVALID: Reversal date must be a real YYYY-MM-DD date');
    return db.transaction(async (tx) => {
      const assetRes = await tx.query('SELECT * FROM fixed_assets WHERE organization_id=$1 AND id=$2 FOR UPDATE', [orgId, assetId]);
      if (assetRes.rows.length !== 1) throw new Error('FIXED_ASSET_NOT_FOUND: Asset not found');
      const asset = assetRes.rows[0];
      if (asset.status !== 'DISPOSED' || !asset.disposal_journal_id) throw new Error('FIXED_ASSET_NOT_DISPOSED: Only a disposed asset can have its disposal reversed');
      const eventRes = await tx.query(
        `SELECT * FROM fixed_asset_lifecycle_events WHERE organization_id=$1 AND asset_id=$2
          AND event_type='DISPOSAL' AND status='POSTED' ORDER BY id FOR UPDATE`, [orgId, assetId]
      );
      if (eventRes.rows.length !== 1) throw new Error('FIXED_ASSET_DISPOSAL_EVENT_INVALID: One posted disposal event is required');
      const event = eventRes.rows[0];
      const reversal = await reverseSourceJournal(tx, orgId, userId, asset.disposal_journal_id, reversalDate, why);
      const eventUpdate = await tx.query(
        `UPDATE fixed_asset_lifecycle_events SET status='REVERSED', reversed_at=CURRENT_TIMESTAMP,
          reversed_by=$1, reversal_reason=$2, reversal_journal_id=$3
          WHERE organization_id=$4 AND id=$5 AND status='POSTED'`, [userId, why, reversal.reversalJournalId, orgId, event.id]
      );
      if (eventUpdate.rowCount !== 1) throw new Error('FIXED_ASSET_DISPOSAL_REVERSAL_CONFLICT: Disposal event state changed');
      const assetUpdate = await tx.query(
        `UPDATE fixed_assets SET status='ACTIVE', disposal_date=NULL, disposal_proceeds=NULL, disposal_journal_id=NULL
          WHERE organization_id=$1 AND id=$2 AND status='DISPOSED' AND disposal_journal_id=$3`, [orgId, assetId, asset.disposal_journal_id]
      );
      if (assetUpdate.rowCount !== 1) throw new Error('FIXED_ASSET_DISPOSAL_REVERSAL_CONFLICT: Asset state changed');
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1,$2,$3,'FIXED_ASSET_DISPOSAL_REVERSED','FixedAsset',$4,$5,$6)`,
        [newId('aud'), orgId, userId, assetId, JSON.stringify({ status: 'DISPOSED', journalId: asset.disposal_journal_id }), JSON.stringify({ status: 'ACTIVE', ...reversal, reason: why })]
      );
      return { assetId, status: 'ACTIVE', ...reversal };
    });
  }
}
