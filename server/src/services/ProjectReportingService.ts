import { db } from '../database/db';

export interface ProjectProfitabilityFilter {
  fromDate?: string;
  toDate?: string;
  projectId?: string;
}

interface AccountAmount {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

interface VendorAmount {
  vendorName: string;
  amount: number;
}

interface CollectionDetail {
  paymentId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
}

interface ProjectInvoiceDetail {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  isOverdue: boolean;
}

interface OperationalWip {
  unbilledBillableHours: number;
  unbilledBillableValue: number;
  nonBillableHours: number;
  status: 'OPERATIONAL_ONLY';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const roundHours = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const toDateOnly = (value: unknown): string => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

function toAmountMap(rows: any[]): Map<string, AccountAmount[]> {
  const result = new Map<string, AccountAmount[]>();
  for (const row of rows) {
    const list = result.get(row.project_id) || [];
    const amount = roundMoney(Number(row.amount || 0));
    if (Math.abs(amount) < 0.01) continue;
    list.push({
      accountId: row.account_id,
      accountCode: row.account_code || '',
      accountName: row.account_name || 'Unassigned account',
      amount,
    });
    result.set(row.project_id, list);
  }
  return result;
}

function sumAccountAmounts(rows: AccountAmount[]): number {
  return roundMoney(rows.reduce((total, row) => total + row.amount, 0));
}

/**
 * Project profitability is derived from posted GL lines. Document and time
 * details are included only for operational follow-up, never as a substitute
 * for the posted revenue and cost totals.
 */
export class ProjectReportingService {
  public static async getProfitabilityReport(
    organizationId: string,
    filter: ProjectProfitabilityFilter = {},
  ): Promise<any> {
    const today = new Date().toISOString().slice(0, 10);
    const currentYear = Number(today.slice(0, 4));
    const currentMonth = Number(today.slice(5, 7));
    const financialYearStart = `${currentMonth < 4 ? currentYear - 1 : currentYear}-04-01`;
    const fromDate = filter.fromDate || financialYearStart;
    const toDate = filter.toDate || today;
    if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate) || fromDate > toDate) {
      throw new Error('Project profitability requires a valid date range');
    }

    const projectParams: unknown[] = [organizationId];
    let projectSql = `SELECT id, code, name, client_name, status, budget_type, total_budget
                      FROM projects WHERE organization_id = $1`;
    if (filter.projectId) {
      projectParams.push(filter.projectId);
      projectSql += ` AND id = $2`;
    }
    projectSql += ' ORDER BY code, name';
    const projectsResult = await db.query(projectSql, projectParams);
    if (filter.projectId && projectsResult.rows.length !== 1) {
      throw new Error('Project was not found in this organization');
    }
    const projects = projectsResult.rows;
    const projectIds = projects.map((project: any) => project.id);
    if (projectIds.length === 0) return this.emptyReport(organizationId, fromDate, toDate, filter.projectId);

    const [revenueResult, costResult, collectionResult, invoiceResult, vendorResult, timeResult] = await Promise.all([
      db.query(
        `SELECT COALESCE(jl.project_id, i.project_id) AS project_id, a.id AS account_id, a.code AS account_code, a.name AS account_name,
                COALESCE(SUM(jl.credit - jl.debit), 0) AS amount
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
           JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
           LEFT JOIN invoices i ON i.organization_id = je.organization_id AND i.journal_entry_id = je.id
          WHERE jl.organization_id = $1
            AND COALESCE(jl.project_id, i.project_id) = ANY($2::text[])
            AND UPPER(COALESCE(je.status, '')) = 'POSTED'
            AND je.date >= $3 AND je.date <= $4
            AND UPPER(COALESCE(a.type, '')) IN ('INCOME', 'REVENUE', 'OTHER INCOME')
          GROUP BY COALESCE(jl.project_id, i.project_id), a.id, a.code, a.name
          ORDER BY COALESCE(jl.project_id, i.project_id), a.code`,
        [organizationId, projectIds, fromDate, toDate],
      ),
      db.query(
        `SELECT jl.project_id, a.id AS account_id, a.code AS account_code, a.name AS account_name,
                COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
           JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
          WHERE jl.organization_id = $1
            AND jl.project_id = ANY($2::text[])
            AND UPPER(COALESCE(je.status, '')) = 'POSTED'
            AND je.date >= $3 AND je.date <= $4
            AND UPPER(COALESCE(a.type, '')) IN ('EXPENSE', 'COST OF GOODS SOLD')
          GROUP BY jl.project_id, a.id, a.code, a.name
          ORDER BY jl.project_id, a.code`,
        [organizationId, projectIds, fromDate, toDate],
      ),
      db.query(
        `SELECT i.project_id, pr.id AS payment_id, pr.payment_number, pr.payment_date,
                COALESCE(SUM(pra.amount), 0) AS amount
           FROM payment_received_allocations pra
           JOIN payments_received pr ON pr.id = pra.payment_id AND pr.organization_id = pra.organization_id
           JOIN invoices i ON i.id = pra.invoice_id AND i.organization_id = pra.organization_id
          WHERE pra.organization_id = $1
            AND i.project_id = ANY($2::text[])
            AND pr.payment_date >= $3 AND pr.payment_date <= $4
            AND UPPER(COALESCE(pr.status, 'ALLOCATED')) NOT IN ('VOID', 'VOIDED')
          GROUP BY i.project_id, pr.id, pr.payment_number, pr.payment_date
          ORDER BY i.project_id, pr.payment_date DESC, pr.payment_number DESC`,
        [organizationId, projectIds, fromDate, toDate],
      ),
      db.query(
        `SELECT id, project_id, invoice_number, issue_date, due_date, status,
                total_amount, paid_amount, balance_due
           FROM invoices
          WHERE organization_id = $1
            AND project_id = ANY($2::text[])
            AND issue_date <= $3
            AND UPPER(COALESCE(status, 'DRAFT')) NOT IN ('DRAFT', 'VOID', 'VOIDED', 'WRITTEN_OFF')
          ORDER BY project_id, issue_date DESC, invoice_number DESC`,
        [organizationId, projectIds, toDate],
      ),
      db.query(
        `SELECT e.project_id, COALESCE(e.vendor_name, '') AS vendor_name,
                COALESCE(SUM(e.amount), 0) AS amount
           FROM expenses e
           JOIN journal_entries je ON je.id = e.journal_entry_id AND je.organization_id = e.organization_id
          WHERE e.organization_id = $1
            AND e.project_id = ANY($2::text[])
            AND UPPER(COALESCE(je.status, '')) = 'POSTED'
            AND e.date >= $3 AND e.date <= $4
          GROUP BY e.project_id, COALESCE(e.vendor_name, '')
          ORDER BY e.project_id, amount DESC, vendor_name`,
        [organizationId, projectIds, fromDate, toDate],
      ),
      db.query(
        `SELECT project_id,
                COALESCE(SUM(CASE WHEN is_billable = TRUE AND is_billed = FALSE THEN hours ELSE 0 END), 0) AS unbilled_billable_hours,
                COALESCE(SUM(CASE WHEN is_billable = TRUE AND is_billed = FALSE THEN hours * hourly_rate ELSE 0 END), 0) AS unbilled_billable_value,
                COALESCE(SUM(CASE WHEN is_billable = FALSE THEN hours ELSE 0 END), 0) AS non_billable_hours
           FROM time_entries
          WHERE organization_id = $1
            AND project_id = ANY($2::text[])
            AND date >= $3 AND date <= $4
          GROUP BY project_id`,
        [organizationId, projectIds, fromDate, toDate],
      ),
    ]);

    const revenueByProject = toAmountMap(revenueResult.rows);
    const costByProject = toAmountMap(costResult.rows);
    const collectionsByProject = new Map<string, CollectionDetail[]>();
    for (const row of collectionResult.rows) {
      const entries = collectionsByProject.get(row.project_id) || [];
      entries.push({
        paymentId: row.payment_id,
        paymentNumber: row.payment_number,
        paymentDate: toDateOnly(row.payment_date),
        amount: roundMoney(Number(row.amount || 0)),
      });
      collectionsByProject.set(row.project_id, entries);
    }
    const invoicesByProject = new Map<string, ProjectInvoiceDetail[]>();
    for (const row of invoiceResult.rows) {
      const entries = invoicesByProject.get(row.project_id) || [];
      const balanceDue = roundMoney(Number(row.balance_due || 0));
      entries.push({
        invoiceId: row.id,
        invoiceNumber: row.invoice_number,
        issueDate: toDateOnly(row.issue_date),
        dueDate: toDateOnly(row.due_date),
        status: row.status,
        totalAmount: roundMoney(Number(row.total_amount || 0)),
        paidAmount: roundMoney(Number(row.paid_amount || 0)),
        balanceDue,
        isOverdue: balanceDue > 0 && toDateOnly(row.due_date) < toDate,
      });
      invoicesByProject.set(row.project_id, entries);
    }
    const vendorsByProject = new Map<string, VendorAmount[]>();
    for (const row of vendorResult.rows) {
      const entries = vendorsByProject.get(row.project_id) || [];
      const vendorName = String(row.vendor_name || '').trim() || 'No vendor';
      const existing = entries.find((entry) => entry.vendorName === vendorName);
      if (existing) {
        existing.amount = roundMoney(existing.amount + Number(row.amount || 0));
      } else {
        entries.push({ vendorName, amount: roundMoney(Number(row.amount || 0)) });
      }
      vendorsByProject.set(row.project_id, entries);
    }
    const timeByProject = new Map<string, OperationalWip>();
    for (const row of timeResult.rows) {
      timeByProject.set(row.project_id, {
        unbilledBillableHours: roundHours(Number(row.unbilled_billable_hours || 0)),
        unbilledBillableValue: roundMoney(Number(row.unbilled_billable_value || 0)),
        nonBillableHours: roundHours(Number(row.non_billable_hours || 0)),
        status: 'OPERATIONAL_ONLY',
      });
    }

    const reportProjects = projects.map((project: any) => {
      const revenueByAccount = revenueByProject.get(project.id) || [];
      const directCostsByAccount = costByProject.get(project.id) || [];
      const revenue = sumAccountAmounts(revenueByAccount);
      const directCosts = sumAccountAmounts(directCostsByAccount);
      const grossProfit = roundMoney(revenue - directCosts);
      const collections = collectionsByProject.get(project.id) || [];
      const invoices = invoicesByProject.get(project.id) || [];
      const collectedCash = roundMoney(collections.reduce((total, row) => total + row.amount, 0));
      const outstandingReceivables = roundMoney(invoices.reduce((total, invoice) => total + invoice.balanceDue, 0));
      const overdueReceivables = roundMoney(invoices.filter((invoice) => invoice.isOverdue).reduce((total, invoice) => total + invoice.balanceDue, 0));
      const operationalWip = timeByProject.get(project.id) || {
        unbilledBillableHours: 0,
        unbilledBillableValue: 0,
        nonBillableHours: 0,
        status: 'OPERATIONAL_ONLY' as const,
      };
      const budgetAmount = roundMoney(Number(project.total_budget || 0));
      const budgetUsesHours = project.budget_type === 'Task Hours';
      const actualBudgetValue = budgetUsesHours ? operationalWip.unbilledBillableHours + operationalWip.nonBillableHours : directCosts;

      return {
        projectId: project.id,
        projectCode: project.code,
        projectName: project.name,
        clientName: project.client_name || 'No customer',
        status: project.status,
        revenue,
        directCosts,
        grossProfit,
        grossMarginPercent: revenue === 0 ? 0 : roundMoney((grossProfit / revenue) * 100),
        collectedCash,
        outstandingReceivables,
        overdueReceivables,
        invoiceCount: invoices.length,
        budget: {
          type: project.budget_type || 'Fixed Cost',
          amount: budgetAmount,
          actual: roundMoney(actualBudgetValue),
          unit: budgetUsesHours ? 'HOURS' : 'CURRENCY',
          usedPercent: budgetAmount === 0 ? 0 : roundMoney((actualBudgetValue / budgetAmount) * 100),
        },
        operationalWip,
        revenueByAccount,
        directCostsByAccount,
        expensesByVendor: vendorsByProject.get(project.id) || [],
        collections,
        invoices,
      };
    });

    const totals = reportProjects.reduce((total: any, project: any) => ({
      revenue: total.revenue + project.revenue,
      directCosts: total.directCosts + project.directCosts,
      grossProfit: total.grossProfit + project.grossProfit,
      collectedCash: total.collectedCash + project.collectedCash,
      outstandingReceivables: total.outstandingReceivables + project.outstandingReceivables,
      overdueReceivables: total.overdueReceivables + project.overdueReceivables,
      unbilledBillableValue: total.unbilledBillableValue + project.operationalWip.unbilledBillableValue,
      unbilledBillableHours: total.unbilledBillableHours + project.operationalWip.unbilledBillableHours,
    }), { revenue: 0, directCosts: 0, grossProfit: 0, collectedCash: 0, outstandingReceivables: 0, overdueReceivables: 0, unbilledBillableValue: 0, unbilledBillableHours: 0 });

    return {
      organizationId,
      fromDate,
      toDate,
      projectId: filter.projectId || null,
      reportBasis: 'POSTED_GL',
      operationalWipDisclosure: 'Unbilled time is operational work-in-progress. It is not a posted accounting WIP asset.',
      projects: reportProjects,
      totals: {
        ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, roundMoney(Number(value))])),
        grossMarginPercent: totals.revenue === 0 ? 0 : roundMoney((totals.grossProfit / totals.revenue) * 100),
      },
      integrity: {
        postedLedgerOnly: true,
        projectScoped: true,
        operationalWipIsNotFinancialWip: true,
      },
    };
  }

  private static emptyReport(organizationId: string, fromDate: string, toDate: string, projectId?: string) {
    return {
      organizationId,
      fromDate,
      toDate,
      projectId: projectId || null,
      reportBasis: 'POSTED_GL',
      operationalWipDisclosure: 'Unbilled time is operational work-in-progress. It is not a posted accounting WIP asset.',
      projects: [],
      totals: { revenue: 0, directCosts: 0, grossProfit: 0, grossMarginPercent: 0, collectedCash: 0, outstandingReceivables: 0, overdueReceivables: 0, unbilledBillableValue: 0, unbilledBillableHours: 0 },
      integrity: { postedLedgerOnly: true, projectScoped: true, operationalWipIsNotFinancialWip: true },
    };
  }
}
