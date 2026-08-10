import { db } from '../database/db';
import { ProfitAndLossReportService } from './ProfitAndLossReportService';

export class BalanceSheetReportService {
  public static async getBalanceSheet(
    orgId: string,
    filter: { toDate?: string; asOfDate?: string } = {}
  ) {
    const toDate = filter.asOfDate || filter.toDate || new Date().toISOString().split('T')[0];

    // Query all balance sheet account balances as of toDate
    let sql = `
      SELECT 
        a.id, a.code, a.name, a.type, a.sub_type,
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id AND UPPER(je.status) = 'POSTED' AND je.date <= $2
      WHERE a.organization_id = $1 AND UPPER(a.type) IN ('ASSET', 'LIABILITY', 'EQUITY')
      GROUP BY a.id, a.code, a.name, a.type, a.sub_type
      ORDER BY a.code ASC
    `;

    const res = await db.query(sql, [orgId, toDate]);

    const assetAccounts: any[] = [];
    const liabilityAccounts: any[] = [];
    const equityAccounts: any[] = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquityBeforeEarnings = 0;

    for (const r of res.rows) {
      const deb = Number(r.total_debit || 0);
      const cred = Number(r.total_credit || 0);
      const type = r.type?.toUpperCase();

      if (type === 'ASSET') {
        const balance = Math.round((deb - cred) * 100) / 100;
        totalAssets += balance;
        assetAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          subType: r.sub_type,
          balance,
        });
      } else if (type === 'LIABILITY') {
        const balance = Math.round((cred - deb) * 100) / 100;
        totalLiabilities += balance;
        liabilityAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          subType: r.sub_type,
          balance,
        });
      } else if (type === 'EQUITY') {
        const balance = Math.round((cred - deb) * 100) / 100;
        totalEquityBeforeEarnings += balance;
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
    const currentYearEarnings = pnl.netProfit;

    const totalEquity = Math.round((totalEquityBeforeEarnings + currentYearEarnings) * 100) / 100;
    totalAssets = Math.round(totalAssets * 100) / 100;
    totalLiabilities = Math.round(totalLiabilities * 100) / 100;
    const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100;

    const diff = Math.abs(Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100);

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
