import { db } from '../database/db';

export class ProfitAndLossReportService {
  public static async getProfitAndLoss(
    orgId: string,
    filter: { fromDate?: string; toDate?: string; projectId?: string; businessLine?: string } = {}
  ) {
    let sql = `
      SELECT 
        a.id, a.code, a.name, a.type, a.sub_type,
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
      FROM accounts a
      JOIN journal_lines jl ON a.id = jl.account_id
      JOIN journal_entries je ON jl.journal_entry_id = je.id AND UPPER(je.status) = 'POSTED'
      WHERE a.organization_id = $1 AND UPPER(a.type) IN ('INCOME', 'REVENUE', 'EXPENSE')
    `;
    const params: any[] = [orgId];

    if (filter.fromDate) {
      params.push(filter.fromDate);
      sql += ` AND je.date >= $${params.length}`;
    }
    if (filter.toDate) {
      params.push(filter.toDate);
      sql += ` AND je.date <= $${params.length}`;
    }

    sql += ` GROUP BY a.id, a.code, a.name, a.type, a.sub_type ORDER BY a.code ASC`;

    const res = await db.query(sql, params);

    let totalIncome = 0;
    let totalExpense = 0;

    const incomeAccounts: any[] = [];
    const expenseAccounts: any[] = [];

    for (const r of res.rows) {
      const deb = Number(r.total_debit || 0);
      const cred = Number(r.total_credit || 0);
      const type = r.type?.toUpperCase();

      if (type === 'INCOME' || type === 'REVENUE') {
        const amount = cred - deb;
        totalIncome += amount;
        incomeAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          amount: Math.round(amount * 100) / 100,
        });
      } else if (type === 'EXPENSE') {
        const amount = deb - cred;
        totalExpense += amount;
        expenseAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          amount: Math.round(amount * 100) / 100,
        });
      }
    }

    totalIncome = Math.round(totalIncome * 100) / 100;
    totalExpense = Math.round(totalExpense * 100) / 100;
    const netProfit = Math.round((totalIncome - totalExpense) * 100) / 100;

    return {
      organizationId: orgId,
      fromDate: filter.fromDate || null,
      toDate: filter.toDate || null,
      incomeAccounts,
      expenseAccounts,
      totalIncome,
      totalRevenue: totalIncome,
      totalExpense,
      totalExpenses: totalExpense,
      netProfit,
    };
  }
}
