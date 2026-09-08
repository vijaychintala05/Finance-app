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

  public static async getComparativeProfitAndLoss(
    orgId: string,
    options: {
      currentFromDate: string;
      currentToDate: string;
      priorFromDate: string;
      priorToDate: string;
      projectId?: string;
    }
  ) {
    const [currentPnl, priorPnl] = await Promise.all([
      this.getProfitAndLoss(orgId, { fromDate: options.currentFromDate, toDate: options.currentToDate, projectId: options.projectId }),
      this.getProfitAndLoss(orgId, { fromDate: options.priorFromDate, toDate: options.priorToDate, projectId: options.projectId }),
    ]);

    const alignRows = (currentRows: any[], priorRows: any[]) => {
      const map = new Map<string, { accountId: string; accountCode: string; accountName: string; currentAmount: number; priorAmount: number }>();
      for (const r of priorRows) {
        map.set(r.accountCode, { accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName, currentAmount: 0, priorAmount: Number(r.amount || 0) });
      }
      for (const r of currentRows) {
        const existing = map.get(r.accountCode);
        if (existing) {
          existing.currentAmount = Number(r.amount || 0);
        } else {
          map.set(r.accountCode, { accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName, currentAmount: Number(r.amount || 0), priorAmount: 0 });
        }
      }
      return Array.from(map.values())
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode))
        .map((item) => {
          const varianceAmount = Math.round((item.currentAmount - item.priorAmount) * 100) / 100;
          const variancePercentage = item.priorAmount !== 0
            ? Math.round(((item.currentAmount - item.priorAmount) / Math.abs(item.priorAmount)) * 10000) / 100
            : null;
          return {
            ...item,
            varianceAmount,
            variancePercentage,
          };
        });
    };

    const calcTotalVariance = (currentTotal: number, priorTotal: number) => {
      const varianceAmount = Math.round((currentTotal - priorTotal) * 100) / 100;
      const variancePercentage = priorTotal !== 0
        ? Math.round(((currentTotal - priorTotal) / Math.abs(priorTotal)) * 10000) / 100
        : null;
      return { current: currentTotal, prior: priorTotal, varianceAmount, variancePercentage };
    };

    return {
      organizationId: orgId,
      currentPeriod: { fromDate: options.currentFromDate, toDate: options.currentToDate },
      priorPeriod: { fromDate: options.priorFromDate, toDate: options.priorToDate },
      incomeAccounts: alignRows(currentPnl.incomeAccounts, priorPnl.incomeAccounts),
      expenseAccounts: alignRows(currentPnl.expenseAccounts, priorPnl.expenseAccounts),
      directCostAccounts: alignRows(currentPnl.directCostAccounts, priorPnl.directCostAccounts),
      totalRevenue: calcTotalVariance(currentPnl.totalRevenue, priorPnl.totalRevenue),
      totalExpenses: calcTotalVariance(currentPnl.totalExpenses, priorPnl.totalExpenses),
      grossProfit: calcTotalVariance(currentPnl.grossProfit, priorPnl.grossProfit),
      netProfit: calcTotalVariance(currentPnl.netProfit, priorPnl.netProfit),
    };
  }
}

