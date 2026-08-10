import { db } from '../database/db';
import { LedgerQueryService } from './LedgerQueryService';

export interface BudgetLineInput {
  accountId: string;
  projectId?: string;
  businessLine?: string;
  locationId?: string;
  costCenterId?: string;
  periodKey: string; // e.g. "2026-04" or "Apr"
  amount: number;
}

export interface CreateBudgetInput {
  name: string;
  financialYear: string;
  lines: BudgetLineInput[];
}

export interface BudgetVsActualLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  budgetedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercentage: number;
}

export interface BudgetVsActualReportResponse {
  budgetId: string;
  budgetName: string;
  financialYear: string;
  totalBudgeted: number;
  totalActual: number;
  totalVariance: number;
  lines: BudgetVsActualLine[];
}

export class BudgetService {
  public static async createBudget(
    orgId: string,
    userId: string,
    input: CreateBudgetInput
  ): Promise<{ id: string; name: string }> {
    const budgetId = `bgt-${Date.now()}`;
    await db.query(
      `INSERT INTO budgets (id, organization_id, name, financial_year, version, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [budgetId, orgId, input.name, input.financialYear, 1, 'APPROVED', userId]
    );

    for (const line of input.lines) {
      const lineId = `bl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await db.query(
        `INSERT INTO budget_lines (id, organization_id, budget_id, account_id, project_id, business_line, location_id, cost_center_id, period_key, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          lineId,
          orgId,
          budgetId,
          line.accountId,
          line.projectId || null,
          line.businessLine || null,
          line.locationId || null,
          line.costCenterId || null,
          line.periodKey,
          line.amount || 0,
        ]
      );
    }

    return { id: budgetId, name: input.name };
  }

  public static async getBudgets(orgId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM budgets WHERE organization_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    return res.rows;
  }

  public static async getBudgetVsActualReport(
    orgId: string,
    budgetId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<BudgetVsActualReportResponse> {
    const bRes = await db.query(
      `SELECT * FROM budgets WHERE organization_id = $1 AND id = $2`,
      [orgId, budgetId]
    );
    if (bRes.rows.length === 0) {
      throw new Error('BUDGET_NOT_FOUND: Specified budget does not exist');
    }
    const budget = bRes.rows[0];

    const linesRes = await db.query(
      `SELECT bl.*, a.code as account_code, a.name as account_name, a.type as account_type
       FROM budget_lines bl
       JOIN accounts a ON bl.account_id = a.id
       WHERE bl.organization_id = $1 AND bl.budget_id = $2`,
      [orgId, budgetId]
    );

    // Get GL actual balances
    const glBalances = await LedgerQueryService.getAccountBalances(orgId, {
      fromDate,
      toDate,
    });
    const glMap = new Map<string, number>();
    for (const b of glBalances) {
      // Income -> periodCredit - periodDebit, Expense -> periodDebit - periodCredit
      const type = (b.type || '').toUpperCase();
      if (['INCOME', 'REVENUE'].includes(type)) {
        glMap.set(b.id, b.totalCredit - b.totalDebit);
      } else {
        glMap.set(b.id, b.totalDebit - b.totalCredit);
      }
    }

    // Aggregate by account
    const accBudgetMap = new Map<string, { code: string; name: string; type: string; amount: number }>();
    for (const r of linesRes.rows) {
      const existing = accBudgetMap.get(r.account_id) || {
        code: r.account_code,
        name: r.account_name,
        type: r.account_type,
        amount: 0,
      };
      existing.amount += Number(r.amount || 0);
      accBudgetMap.set(r.account_id, existing);
    }

    let totalBudgeted = 0;
    let totalActual = 0;
    const lines: BudgetVsActualLine[] = [];

    accBudgetMap.forEach((val, accId) => {
      const budgetedAmount = Math.round(val.amount * 100) / 100;
      const actualAmount = Math.round((glMap.get(accId) || 0) * 100) / 100;
      const variance = Math.round((actualAmount - budgetedAmount) * 100) / 100;
      const variancePercentage = budgetedAmount !== 0 ? Math.round((variance / budgetedAmount) * 10000) / 100 : 0;

      totalBudgeted += budgetedAmount;
      totalActual += actualAmount;

      lines.push({
        accountId: accId,
        accountCode: val.code,
        accountName: val.name,
        accountType: val.type,
        budgetedAmount,
        actualAmount,
        variance,
        variancePercentage,
      });
    });

    const totalVariance = Math.round((totalActual - totalBudgeted) * 100) / 100;

    return {
      budgetId: budget.id,
      budgetName: budget.name,
      financialYear: budget.financial_year,
      totalBudgeted: Math.round(totalBudgeted * 100) / 100,
      totalActual: Math.round(totalActual * 100) / 100,
      totalVariance,
      lines,
    };
  }
}
