import { db } from '../database/db';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

export class ProfitAndLossReportService {
  public static async getProfitAndLoss(
    orgId: string,
    filter: { fromDate?: string; toDate?: string; projectId?: string; businessLine?: string } = {}
  ) {
    if (filter.businessLine) throw new Error('Business-line profit and loss filters are not implemented');
    if (filter.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(filter.fromDate)) throw new Error('Invalid profit and loss start date');
    if (filter.toDate && !/^\d{4}-\d{2}-\d{2}$/.test(filter.toDate)) throw new Error('Invalid profit and loss end date');
    if (filter.fromDate && filter.toDate && filter.fromDate > filter.toDate) throw new Error('Profit and loss start date cannot be after end date');

    let sql = `
      SELECT 
        a.id, a.code, a.name, a.type, a.sub_type, a.system_role,
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
      FROM accounts a
      JOIN journal_lines jl ON a.id = jl.account_id
      JOIN journal_entries je ON jl.journal_entry_id = je.id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'
      WHERE a.organization_id = $1 AND UPPER(a.type) IN ('INCOME', 'REVENUE', 'OTHER INCOME', 'EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE')
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
    if (filter.projectId) {
      params.push(filter.projectId);
      sql += ` AND jl.project_id = $${params.length}`;
    }

    sql += ` GROUP BY a.id, a.code, a.name, a.type, a.sub_type, a.system_role ORDER BY a.code ASC`;

    const res = await db.query(sql, params);

    let totalIncomeCents = 0n;
    let totalExpenseCents = 0n;
    let totalDirectCostCents = 0n;

    const incomeAccounts: any[] = [];
    const expenseAccounts: any[] = [];
    const directCostAccounts: any[] = [];

    for (const r of res.rows) {
      const deb = databaseMoneyToCents(r.total_debit, `Profit and loss debit for ${r.code}`);
      const cred = databaseMoneyToCents(r.total_credit, `Profit and loss credit for ${r.code}`);
      const type = r.type?.toUpperCase();

      if (type === 'INCOME' || type === 'REVENUE' || type === 'OTHER INCOME') {
        const amount = cred - deb;
        totalIncomeCents += amount;
        incomeAccounts.push({
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          amount: centsToSafeNumber(amount, `Profit and loss income for ${r.code}`),
        });
      } else if (type === 'EXPENSE' || type === 'COST OF GOODS SOLD' || type === 'OTHER EXPENSE') {
        const amount = deb - cred;
        totalExpenseCents += amount;
        const account = {
          accountId: r.id,
          accountCode: r.code,
          accountName: r.name,
          amount: centsToSafeNumber(amount, `Profit and loss expense for ${r.code}`),
        };
        expenseAccounts.push(account);
        if (type === 'COST OF GOODS SOLD' || r.system_role === 'DIRECT_COSTS' || r.sub_type === 'Direct Expense / Cost of Goods') {
          totalDirectCostCents += amount;
          directCostAccounts.push(account);
        }
      }
    }

    const totalIncome = centsToSafeNumber(totalIncomeCents, 'Profit and loss total income');
    const totalExpense = centsToSafeNumber(totalExpenseCents, 'Profit and loss total expense');
    const totalDirectCost = centsToSafeNumber(totalDirectCostCents, 'Profit and loss total direct cost');
    const grossProfit = centsToSafeNumber(totalIncomeCents - totalDirectCostCents, 'Profit and loss gross profit');
    const netProfit = centsToSafeNumber(totalIncomeCents - totalExpenseCents, 'Profit and loss net profit');

    return {
      organizationId: orgId,
      fromDate: filter.fromDate || null,
      toDate: filter.toDate || null,
      incomeAccounts,
      expenseAccounts,
      directCostAccounts,
      totalIncome,
      totalRevenue: totalIncome,
      totalExpense,
      totalExpenses: totalExpense,
      totalDirectCost,
      grossProfit,
      netProfit,
    };
  }
}
