import { db } from '../database/db';
import { LedgerQueryService } from './LedgerQueryService';
import { newId } from '../utils/ids';

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
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 160) {
      throw new Error('Budget name is required and cannot exceed 160 characters');
    }
    if (!/^\d{4}-\d{2}$/.test(String(input.financialYear || ''))) throw new Error('Financial year must use YYYY-YY format');
    if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 1200) {
      throw new Error('Budget requires between 1 and 1200 lines');
    }
    for (const [index, line] of input.lines.entries()) {
      const amount = Number(line.amount);
      if (!line.accountId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(line.periodKey || '')) || !Number.isFinite(amount) || amount < 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7 || !Number.isSafeInteger(Math.round(amount * 100))) {
        throw new Error(`Budget line ${index + 1} requires an account, YYYY-MM period, and a safe non-negative two-decimal amount`);
      }
    }

    const budgetId = newId('bgt');
    await db.transaction(async (client) => {
      const checkedAccounts = new Set<string>();
      const checkedProjects = new Set<string>();
      for (const line of input.lines) {
        if (!checkedAccounts.has(line.accountId)) {
          const account = await client.query(
            `SELECT id FROM accounts WHERE organization_id = $1 AND id = $2 AND status = 'Active'`,
            [orgId, line.accountId]
          );
          if (account.rows.length !== 1) throw new Error(`Budget account ${line.accountId} does not belong to this organization or is inactive`);
          checkedAccounts.add(line.accountId);
        }
        if (line.projectId && !checkedProjects.has(line.projectId)) {
          const project = await client.query(`SELECT id FROM projects WHERE organization_id = $1 AND id = $2`, [orgId, line.projectId]);
          if (project.rows.length !== 1) throw new Error(`Budget project ${line.projectId} does not belong to this organization`);
          checkedProjects.add(line.projectId);
        }
      }
      await client.query(
        `INSERT INTO budgets (id, organization_id, name, financial_year, version, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [budgetId, orgId, input.name.trim(), input.financialYear, 1, 'APPROVED', userId]
      );

      for (const line of input.lines) {
        await client.query(
          `INSERT INTO budget_lines (id, organization_id, budget_id, account_id, project_id, business_line, location_id, cost_center_id, period_key, amount)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            newId('bl'), orgId, budgetId, line.accountId, line.projectId || null,
            line.businessLine || null, line.locationId || null, line.costCenterId || null,
            line.periodKey, Number(line.amount),
          ]
        );
      }
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'BUDGET_CREATED', 'Budget', $4, $5)`,
        [newId('aud'), orgId, userId, budgetId, JSON.stringify({ name: input.name.trim(), financialYear: input.financialYear, lineCount: input.lines.length })]
      );
    });

    return { id: budgetId, name: input.name.trim() };
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
