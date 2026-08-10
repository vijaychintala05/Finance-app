import { db } from '../database/db';

export class TrialBalanceReportService {
  public static async getTrialBalance(
    orgId: string,
    filter: { fromDate?: string; toDate?: string; projectId?: string } = {}
  ) {
    let sql = `
      SELECT 
        a.id, a.code, a.name, a.type, a.sub_type,
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
      FROM accounts a
      LEFT JOIN journal_lines jl ON a.id = jl.account_id
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id AND UPPER(je.status) = 'POSTED'
      WHERE a.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (filter.fromDate) {
      params.push(filter.fromDate);
      sql += ` AND (je.date IS NULL OR je.date >= $${params.length})`;
    }
    if (filter.toDate) {
      params.push(filter.toDate);
      sql += ` AND (je.date IS NULL OR je.date <= $${params.length})`;
    }

    sql += ` GROUP BY a.id, a.code, a.name, a.type, a.sub_type ORDER BY a.code ASC`;

    const res = await db.query(sql, params);

    let totalClosingDebit = 0;
    let totalClosingCredit = 0;

    const rows = res.rows.map((r: any) => {
      const debit = Math.round(Number(r.total_debit || 0) * 100) / 100;
      const credit = Math.round(Number(r.total_credit || 0) * 100) / 100;

      totalClosingDebit += debit;
      totalClosingCredit += credit;

      return {
        accountId: r.id,
        accountCode: r.code,
        accountName: r.name,
        accountType: r.type,
        accountSubType: r.sub_type,
        debit,
        credit,
        netBalance: Math.round((debit - credit) * 100) / 100,
      };
    });

    totalClosingDebit = Math.round(totalClosingDebit * 100) / 100;
    totalClosingCredit = Math.round(totalClosingCredit * 100) / 100;
    const diff = Math.abs(Math.round((totalClosingDebit - totalClosingCredit) * 100) / 100);

    return {
      organizationId: orgId,
      fromDate: filter.fromDate || null,
      toDate: filter.toDate || null,
      rows,
      totalClosingDebit,
      totalClosingCredit,
      totalDebits: totalClosingDebit,
      totalCredits: totalClosingCredit,
      difference: diff,
      isBalanced: diff === 0,
    };
  }
}
