import { db } from '../database/db';
import { ProfitAndLossReportService } from './ProfitAndLossReportService';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

export class BalanceSheetReportService {
  public static async getBalanceSheet(
    orgId: string,
    filter: { toDate?: string; asOfDate?: string } = {}
  ) {
    const toDate = filter.asOfDate || filter.toDate || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) throw new Error('Invalid balance sheet date');

    // Query all balance sheet account balances as of toDate
    let sql = `
      SELECT 
        a.id, a.code, a.name, a.type, a.sub_type,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit ELSE 0 END), 0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED' AND je.date <= $2
      WHERE a.organization_id = $1 AND UPPER(a.type) IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY a.id, a.code, a.name, a.type, a.sub_type
      ORDER BY a.code ASC
    `;

    const res = await db.query(sql, [orgId, toDate]);

    const assetAccounts: any[] = [];
    const liabilityAccounts: any[] = [];
    const equityAccounts: any[] = [];

    let totalAssetsCents = 0n;
    let totalLiabilitiesCents = 0n;
    let totalEquityBeforeEarningsCents = 0n;

    for (const r of res.rows) {
      const deb = databaseMoneyToCents(r.total_debit, `Balance sheet debit for ${r.code}`);
      const cred = databaseMoneyToCents(r.total_credit, `Balance sheet credit for ${r.code}`);
      const type = r.type?.toUpperCase();

      if (type === 'ASSET') {
        const balanceCents = deb - cred;
        const balance = centsToSafeNumber(balanceCents, `Balance sheet asset ${r.code}`);
        totalAssetsCents += balanceCents;
        assetAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          subType: r.sub_type,
          balance,
        });
      } else if (type === 'LIABILITY') {
        const balanceCents = cred - deb;
        const balance = centsToSafeNumber(balanceCents, `Balance sheet liability ${r.code}`);
        totalLiabilitiesCents += balanceCents;
        liabilityAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          subType: r.sub_type,
          balance,
        });
      } else if (type === 'EQUITY') {
        const balanceCents = cred - deb;
        const balance = centsToSafeNumber(balanceCents, `Balance sheet equity ${r.code}`);
        totalEquityBeforeEarningsCents += balanceCents;
        equityAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          subType: r.sub_type,
          balance,
        });
      }
    }

    // Get P&L net profit up to toDate
    const pnl = await ProfitAndLossReportService.getProfitAndLoss(orgId, { toDate });
    const currentYearEarningsCents = databaseMoneyToCents(pnl.netProfit, 'Balance sheet current earnings');
    const currentYearEarnings = centsToSafeNumber(currentYearEarningsCents, 'Balance sheet current earnings');
    const totalEquityCents = totalEquityBeforeEarningsCents + currentYearEarningsCents;
    const totalLiabilitiesAndEquityCents = totalLiabilitiesCents + totalEquityCents;
    const differenceCents = totalAssetsCents >= totalLiabilitiesAndEquityCents ? totalAssetsCents - totalLiabilitiesAndEquityCents : totalLiabilitiesAndEquityCents - totalAssetsCents;
    const totalAssets = centsToSafeNumber(totalAssetsCents, 'Balance sheet total assets');
    const totalLiabilities = centsToSafeNumber(totalLiabilitiesCents, 'Balance sheet total liabilities');
    const totalEquityBeforeEarnings = centsToSafeNumber(totalEquityBeforeEarningsCents, 'Balance sheet equity before earnings');
    const totalEquity = centsToSafeNumber(totalEquityCents, 'Balance sheet total equity');
    const totalLiabilitiesAndEquity = centsToSafeNumber(totalLiabilitiesAndEquityCents, 'Balance sheet liabilities and equity');
    const diff = centsToSafeNumber(differenceCents, 'Balance sheet difference');

    return {
      organizationId: orgId,
      asOfDate: toDate,
      assets: {
        accounts: assetAccounts,
        totalAssets,
      },
      liabilities: {
        accounts: liabilityAccounts,
        totalLiabilities,
      },
      equity: {
        accounts: equityAccounts,
        totalEquityBeforeEarnings,
        currentYearEarnings,
        totalEquity,
      },
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
      currentYearEarnings,
      difference: diff,
      isBalanced: diff === 0,
    };
  }
}
