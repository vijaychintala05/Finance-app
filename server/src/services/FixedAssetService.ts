import { db } from '../database/db';
import { ManualJournalService } from './ManualJournalService';

export interface FixedAssetInput {
  assetCode: string;
  name: string;
  description?: string;
  assetCategory: string;
  purchaseDate: string;
  inServiceDate: string;
  purchaseValue: number;
  residualValue?: number;
  usefulLifeMonths: number;
  assetAccountId: string;
  accumulatedDepreciationAccountId: string;
  depreciationExpenseAccountId: string;
  vendorId?: string;
  billId?: string;
  projectId?: string;
  locationId?: string;
}

export class FixedAssetService {
  public static async createAsset(
    orgId: string,
    userId: string,
    input: FixedAssetInput
  ): Promise<any> {
    const assetId = `fa-${Date.now()}`;
    await db.query(
      `INSERT INTO fixed_assets (
        id, organization_id, asset_code, name, description, asset_category, purchase_date, in_service_date,
        purchase_value, residual_value, useful_life_months, depreciation_method, asset_account_id,
        accumulated_depreciation_account_id, depreciation_expense_account_id, vendor_id, bill_id, project_id, location_id, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        assetId,
        orgId,
        input.assetCode,
        input.name,
        input.description || '',
        input.assetCategory,
        input.purchaseDate,
        input.inServiceDate,
        input.purchaseValue,
        input.residualValue || 0,
        input.usefulLifeMonths,
        'STRAIGHT_LINE',
        input.assetAccountId,
        input.accumulatedDepreciationAccountId,
        input.depreciationExpenseAccountId,
        input.vendorId || null,
        input.billId || null,
        input.projectId || null,
        input.locationId || null,
        'ACTIVE',
      ]
    );

    return { id: assetId, assetCode: input.assetCode, name: input.name, status: 'ACTIVE' };
  }

  public static async getAssets(orgId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT fa.*,
        (SELECT COALESCE(SUM(depreciation_amount), 0) FROM fixed_asset_depreciation_entries WHERE asset_id = fa.id) as total_accumulated_depreciation
       FROM fixed_assets fa
       WHERE fa.organization_id = $1
       ORDER BY fa.created_at DESC`,
      [orgId]
    );

    return res.rows.map((r: any) => {
      const pVal = Number(r.purchase_value || 0);
      const accDep = Number(r.total_accumulated_depreciation || 0);
      const nbv = Math.max(0, pVal - accDep);

      return {
        ...r,
        purchase_value: pVal,
        residual_value: Number(r.residual_value || 0),
        accumulated_depreciation: accDep,
        net_book_value: Math.round(nbv * 100) / 100,
      };
    });
  }

  public static async postMonthlyDepreciation(
    orgId: string,
    userId: string,
    assetId: string,
    periodKey: string // e.g. "2026-08"
  ): Promise<any> {
    const aRes = await db.query(
      `SELECT * FROM fixed_assets WHERE organization_id = $1 AND id = $2`,
      [orgId, assetId]
    );
    if (aRes.rows.length === 0) {
      throw new Error('FIXED_ASSET_NOT_FOUND: Fixed asset does not exist');
    }
    const asset = aRes.rows[0];

    if (asset.status === 'DISPOSED') {
      throw new Error('FIXED_ASSET_DISPOSED: Cannot post depreciation for a disposed asset');
    }

    // Check duplicate depreciation
    const dupRes = await db.query(
      `SELECT id FROM fixed_asset_depreciation_entries WHERE organization_id = $1 AND asset_id = $2 AND period_key = $3`,
      [orgId, assetId, periodKey]
    );
    if (dupRes.rows.length > 0) {
      throw new Error(`FIXED_ASSET_ALREADY_DEPRECIATED: Depreciation for asset ${asset.asset_code} in period ${periodKey} has already been posted.`);
    }

    // Calculate straight-line depreciation
    const pVal = Number(asset.purchase_value || 0);
    const rVal = Number(asset.residual_value || 0);
    const lifeMonths = Number(asset.useful_life_months || 36);

    const depreciableAmount = Math.max(0, pVal - rVal);
    const monthlyDep = Math.round((depreciableAmount / lifeMonths) * 100) / 100;

    if (monthlyDep <= 0) {
      throw new Error('FIXED_ASSET_ZERO_DEPRECIATION: Calculated monthly depreciation is zero');
    }

    const todayStr = new Date().toISOString().split('T')[0];

    // Post depreciation journal entry
    const journal = await ManualJournalService.createJournal(orgId, userId, {
      date: todayStr,
      reference: `DEP-${asset.asset_code}-${periodKey}`,
      narration: `Monthly Depreciation for Asset ${asset.asset_code} (${asset.name}) - Period ${periodKey}`,
      lines: [
        {
          accountId: asset.depreciation_expense_account_id,
          debit: monthlyDep,
          credit: 0,
          description: `Depreciation Expense - ${asset.name}`,
          projectId: asset.project_id,
        },
        {
          accountId: asset.accumulated_depreciation_account_id,
          debit: 0,
          credit: monthlyDep,
          description: `Accumulated Depreciation - ${asset.name}`,
          projectId: asset.project_id,
        },
      ],
      status: 'Posted',
    });

    // Record depreciation entry
    const depEntryId = `fde-${Date.now()}`;
    await db.query(
      `INSERT INTO fixed_asset_depreciation_entries (id, organization_id, asset_id, period_key, depreciation_amount, journal_entry_id, posted_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [depEntryId, orgId, assetId, periodKey, monthlyDep, journal.id, todayStr]
    );

    return {
      assetId,
      periodKey,
      monthlyDepreciation: monthlyDep,
      journalId: journal.id,
      entryNumber: journal.entryNumber,
    };
  }

  public static async disposeAsset(
    orgId: string,
    userId: string,
    assetId: string,
    disposalDate: string,
    saleProceeds: number,
    proceedsBankAccountId: string,
    gainLossAccountId: string
  ): Promise<any> {
    const aRes = await db.query(
      `SELECT fa.*,
        (SELECT COALESCE(SUM(depreciation_amount), 0) FROM fixed_asset_depreciation_entries WHERE asset_id = fa.id) as total_acc_dep
       FROM fixed_assets fa
       WHERE fa.organization_id = $1 AND fa.id = $2`,
      [orgId, assetId]
    );
    if (aRes.rows.length === 0) {
      throw new Error('FIXED_ASSET_NOT_FOUND: Asset not found');
    }
    const asset = aRes.rows[0];

    const cost = Number(asset.purchase_value || 0);
    const accDep = Number(asset.total_acc_dep || 0);
    const nbv = Math.max(0, cost - accDep);
    const gainOrLoss = Math.round((saleProceeds - nbv) * 100) / 100;

    // Build disposal journal
    // Dr Bank Account (Proceeds)
    // Dr Accumulated Depreciation (accDep)
    // Cr Fixed Asset Account (cost)
    // Dr/Cr Gain/Loss on Disposal Account
    const lines: any[] = [];
    if (saleProceeds > 0) {
      lines.push({ accountId: proceedsBankAccountId, debit: saleProceeds, credit: 0, description: `Proceeds from sale of ${asset.name}` });
    }
    if (accDep > 0) {
      lines.push({ accountId: asset.accumulated_depreciation_account_id, debit: accDep, credit: 0, description: `Clear Acc. Dep. for ${asset.name}` });
    }
    lines.push({ accountId: asset.asset_account_id, debit: 0, credit: cost, description: `Remove Asset ${asset.name} at Cost` });

    if (gainOrLoss > 0) {
      // Gain on disposal (Credit)
      lines.push({ accountId: gainLossAccountId, debit: 0, credit: gainOrLoss, description: `Gain on disposal of ${asset.name}` });
    } else if (gainOrLoss < 0) {
      // Loss on disposal (Debit)
      lines.push({ accountId: gainLossAccountId, debit: Math.abs(gainOrLoss), credit: 0, description: `Loss on disposal of ${asset.name}` });
    }

    const journal = await ManualJournalService.createJournal(orgId, userId, {
      date: disposalDate,
      reference: `DISP-${asset.asset_code}`,
      narration: `Disposal of Fixed Asset ${asset.asset_code} (${asset.name})`,
      lines,
      status: 'Posted',
    });

    await db.query(
      `UPDATE fixed_assets SET status = 'DISPOSED', disposal_date = $1, disposal_proceeds = $2, disposal_journal_id = $3 WHERE id = $4 AND organization_id = $5`,
      [disposalDate, saleProceeds, journal.id, assetId, orgId]
    );

    return {
      assetId,
      status: 'DISPOSED',
      netBookValue: nbv,
      saleProceeds,
      gainOrLoss,
      journalId: journal.id,
    };
  }
}
