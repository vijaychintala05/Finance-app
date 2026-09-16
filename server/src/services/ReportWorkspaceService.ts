import { db } from '../database/db';
import { ARAgingReportService } from './ARAgingReportService';
import { APAgingReportService } from './APAgingReportService';
import { CashFlowStatementService } from './CashFlowStatementService';
import { ProfitAndLossReportService } from './ProfitAndLossReportService';
import { BalanceSheetReportService } from './BalanceSheetReportService';
import { BudgetService } from './BudgetService';
import { CashFlowForecastService } from './CashFlowForecastService';

export type WorkspaceReportValueType = 'text' | 'date' | 'number' | 'money' | 'percent' | 'status';

export interface WorkspaceReportColumn {
  key: string;
  label: string;
  type: WorkspaceReportValueType;
  align?: 'left' | 'right';
}

export interface WorkspaceReportFilter {
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
  projectId?: string;
  customerId?: string;
  vendorId?: string;
  accountId?: string;
  status?: string;
  search?: string;
}

export interface WorkspaceReportResult {
  id: string;
  title: string;
  description: string;
  basis: 'POSTED_DOCUMENTS' | 'POSTED_LEDGER' | 'RECONCILED_SUBLEDGER' | 'OPERATIONAL';
  generatedAt: string;
  period: { fromDate?: string; toDate?: string; asOfDate?: string };
  columns: WorkspaceReportColumn[];
  rows: Array<Record<string, unknown>>;
  summary: Array<{ key: string; label: string; value: number; type: 'money' | 'number' | 'percent' }>;
  chart?: { categoryKey: string; valueKeys: Array<{ key: string; label: string }> };
  warnings?: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const number = (value: unknown): number => roundMoney(Number(value || 0));
const dateOnly = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const excludedStatuses = new Set(['DRAFT', 'SUBMITTED', 'VOID', 'VOIDED', 'REVERSED', 'CANCELLED']);

function validDate(value: string | undefined, fallback: string): string {
  const date = value || fallback;
  if (!ISO_DATE.test(date)) throw new Error('REPORT_DATE_INVALID: Dates must use YYYY-MM-DD format');
  return date;
}

function period(filter: WorkspaceReportFilter) {
  const today = new Date().toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const fyStart = `${month < 4 ? year - 1 : year}-04-01`;
  const fromDate = validDate(filter.fromDate, fyStart);
  const toDate = validDate(filter.toDate, today);
  const asOfDate = validDate(filter.asOfDate, toDate);
  if (fromDate > toDate) throw new Error('REPORT_DATE_INVALID: From date must be on or before to date');
  return { fromDate, toDate, asOfDate };
}

function includesSearch(row: Record<string, unknown>, search?: string): boolean {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return true;
  return Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle));
}

function baseResult(
  id: string,
  title: string,
  description: string,
  basis: WorkspaceReportResult['basis'],
  dates: ReturnType<typeof period>,
  columns: WorkspaceReportColumn[],
  rows: Array<Record<string, unknown>>,
  summary: WorkspaceReportResult['summary'] = [],
  chart?: WorkspaceReportResult['chart'],
  warnings: string[] = [],
): WorkspaceReportResult {
  return {
    id, title, description, basis, generatedAt: new Date().toISOString(),
    period: { fromDate: dates.fromDate, toDate: dates.toDate }, columns, rows, summary, chart,
    ...(warnings.length ? { warnings } : {}),
  };
}

function sum(rows: Array<Record<string, unknown>>, key: string): number {
  return roundMoney(rows.reduce((total, row) => total + Number(row[key] || 0), 0));
}

export const WORKSPACE_REPORT_IDS = [
  'cash_flow_statement', 'comparative_profit_loss', 'comparative_balance_sheet',
  'business_ratio_analysis', 'budget_vs_actual', 'cash_flow_forecast',
  'sales_by_customer', 'sales_by_item', 'sales_by_salesperson', 'invoice_details',
  'payments_received', 'time_to_get_paid', 'customer_balance_summary',
  'expense_details', 'expenses_by_category', 'expenses_by_vendor', 'expenses_by_project',
  'billable_expense_details', 'bill_details', 'purchases_by_vendor', 'payments_made',
  'vendor_balance_summary', 'timesheet_details', 'bank_reconciliation_summary',
  'bank_transaction_details', 'gst_summary', 'tds_summary', 'journal_report',
  'fixed_asset_register', 'activity_logs', 'movement_of_equity',
] as const;

export type WorkspaceReportId = typeof WORKSPACE_REPORT_IDS[number];

export class ReportWorkspaceService {
  public static isSupported(reportId: string): reportId is WorkspaceReportId {
    return (WORKSPACE_REPORT_IDS as readonly string[]).includes(reportId);
  }

  public static async run(organizationId: string, reportId: string, filter: WorkspaceReportFilter = {}): Promise<WorkspaceReportResult> {
    if (!this.isSupported(reportId)) throw new Error('REPORT_NOT_SUPPORTED: Unknown report');
    const dates = period(filter);
    switch (reportId) {
      case 'cash_flow_statement': return this.cashFlowStatement(organizationId, dates, filter);
      case 'comparative_profit_loss': return this.comparativeProfitLoss(organizationId, dates, filter);
      case 'comparative_balance_sheet': return this.comparativeBalanceSheet(organizationId, dates, filter);
      case 'business_ratio_analysis': return this.businessRatioAnalysis(organizationId, dates, filter);
      case 'budget_vs_actual': return this.budgetVsActual(organizationId, dates, filter);
      case 'cash_flow_forecast': return this.cashFlowForecast(organizationId, dates, filter);
      case 'sales_by_customer': return this.salesByCustomer(organizationId, dates, filter);
      case 'sales_by_item': return this.salesByItem(organizationId, dates, filter);
      case 'sales_by_salesperson': return this.salesBySalesperson(organizationId, dates, filter);
      case 'invoice_details': return this.invoiceDetails(organizationId, dates, filter);
      case 'payments_received': return this.paymentsReceived(organizationId, dates, filter);
      case 'time_to_get_paid': return this.timeToGetPaid(organizationId, dates, filter);
      case 'customer_balance_summary': return this.customerBalanceSummary(organizationId, dates, filter);
      case 'expense_details': return this.expenseDetails(organizationId, dates, filter);
      case 'expenses_by_category': return this.expensesByCategory(organizationId, dates, filter);
      case 'expenses_by_vendor': return this.expensesByVendor(organizationId, dates, filter);
      case 'expenses_by_project': return this.expensesByProject(organizationId, dates, filter);
      case 'billable_expense_details': return this.billableExpenseDetails(organizationId, dates, filter);
      case 'bill_details': return this.billDetails(organizationId, dates, filter);
      case 'purchases_by_vendor': return this.purchasesByVendor(organizationId, dates, filter);
      case 'payments_made': return this.paymentsMade(organizationId, dates, filter);
      case 'vendor_balance_summary': return this.vendorBalanceSummary(organizationId, dates, filter);
      case 'timesheet_details': return this.timesheetDetails(organizationId, dates, filter);
      case 'bank_reconciliation_summary': return this.bankReconciliationSummary(organizationId, dates, filter);
      case 'bank_transaction_details': return this.bankTransactionDetails(organizationId, dates, filter);
      case 'gst_summary': return this.gstSummary(organizationId, dates, filter);
      case 'tds_summary': return this.tdsSummary(organizationId, dates, filter);
      case 'journal_report': return this.journalReport(organizationId, dates, filter);
      case 'fixed_asset_register': return this.fixedAssetRegister(organizationId, dates, filter);
      case 'activity_logs': return this.activityLogs(organizationId, dates, filter);
      case 'movement_of_equity': return this.movementOfEquity(organizationId, dates, filter);
    }
  }

  private static previousPeriod(dates: ReturnType<typeof period>) {
    const start = new Date(`${dates.fromDate}T00:00:00Z`);
    const end = new Date(`${dates.toDate}T00:00:00Z`);
    const duration = end.getTime() - start.getTime();
    const priorEnd = new Date(start.getTime() - 86_400_000);
    const priorStart = new Date(priorEnd.getTime() - duration);
    return { fromDate: priorStart.toISOString().slice(0, 10), toDate: priorEnd.toISOString().slice(0, 10) };
  }

  private static async cashFlowStatement(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const report = await CashFlowStatementService.getCashFlowStatement(orgId, dates);
    const rows = [
      ...report.operatingActivities.lines.map((row) => ({ section: 'Operating activities', account_code: row.accountCode, account_name: row.accountName, amount: number(row.amount) })),
      ...report.investingActivities.lines.map((row) => ({ section: 'Investing activities', account_code: row.accountCode, account_name: row.accountName, amount: number(row.amount) })),
      ...report.financingActivities.lines.map((row) => ({ section: 'Financing activities', account_code: row.accountCode, account_name: row.accountName, amount: number(row.amount) })),
    ].filter((row) => includesSearch(row, filter.search));
    return baseResult('cash_flow_statement', 'Cash Flow Statement', 'Cash movements classified as operating, investing and financing activities.', 'POSTED_LEDGER', dates,
      [{ key: 'section', label: 'Activity', type: 'text' }, { key: 'account_code', label: 'Code', type: 'text' }, { key: 'account_name', label: 'Account', type: 'text' }, { key: 'amount', label: 'Cash movement', type: 'money', align: 'right' }], rows,
      [{ key: 'opening', label: 'Opening cash', value: number(report.openingCashBalance), type: 'money' }, { key: 'net', label: 'Net cash flow', value: number(report.netCashFlow), type: 'money' }, { key: 'closing', label: 'Closing cash', value: number(report.closingCashBalance), type: 'money' }],
      { categoryKey: 'section', valueKeys: [{ key: 'amount', label: 'Cash movement' }] }, report.isReconciled ? [] : [`Cash-flow classification differs from net cash movement by ${number(report.difference).toFixed(2)}.`]);
  }

  private static async comparativeProfitLoss(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const prior = this.previousPeriod(dates);
    const report = await ProfitAndLossReportService.getComparativeProfitAndLoss(orgId, {
      currentFromDate: dates.fromDate, currentToDate: dates.toDate, priorFromDate: prior.fromDate, priorToDate: prior.toDate, projectId: filter.projectId,
    });
    const normalize = (section: string, rows: any[]) => rows.map((row) => ({ section, account_code: row.accountCode, account_name: row.accountName, current_amount: number(row.currentAmount), prior_amount: number(row.priorAmount), variance: number(row.varianceAmount), variance_percent: row.variancePercentage === null ? null : number(row.variancePercentage) }));
    const rows = [...normalize('Income', report.incomeAccounts), ...normalize('Direct costs', report.directCostAccounts), ...normalize('Expenses', report.expenseAccounts)].filter((row) => includesSearch(row, filter.search));
    return baseResult('comparative_profit_loss', 'Comparative Profit and Loss', `Current period compared with ${prior.fromDate} through ${prior.toDate}.`, 'POSTED_LEDGER', dates,
      [{ key: 'section', label: 'Section', type: 'text' }, { key: 'account_code', label: 'Code', type: 'text' }, { key: 'account_name', label: 'Account', type: 'text' }, { key: 'current_amount', label: 'Current', type: 'money', align: 'right' }, { key: 'prior_amount', label: 'Previous', type: 'money', align: 'right' }, { key: 'variance', label: 'Variance', type: 'money', align: 'right' }, { key: 'variance_percent', label: 'Variance %', type: 'percent', align: 'right' }], rows,
      [{ key: 'revenue', label: 'Current revenue', value: number(report.totalRevenue.current), type: 'money' }, { key: 'expenses', label: 'Current expenses', value: number(report.totalExpenses.current), type: 'money' }, { key: 'profit', label: 'Current net profit', value: number(report.netProfit.current), type: 'money' }, { key: 'variance', label: 'Profit variance', value: number(report.netProfit.varianceAmount), type: 'money' }]);
  }

  private static async comparativeBalanceSheet(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const current = new Date(`${dates.asOfDate}T00:00:00Z`); current.setUTCFullYear(current.getUTCFullYear() - 1);
    const priorAsOfDate = current.toISOString().slice(0, 10);
    const report = await BalanceSheetReportService.getComparativeBalanceSheet(orgId, { currentAsOfDate: dates.asOfDate, priorAsOfDate });
    const normalize = (section: string, rows: any[]) => rows.map((row) => ({ section, account_code: row.accountCode, account_name: row.accountName, current_balance: number(row.currentBalance), prior_balance: number(row.priorBalance), variance: number(row.varianceAmount), variance_percent: row.variancePercentage === null ? null : number(row.variancePercentage) }));
    const rows = [...normalize('Assets', report.assets.accounts), ...normalize('Liabilities', report.liabilities.accounts), ...normalize('Equity', report.equity.accounts)].filter((row) => includesSearch(row, filter.search));
    const output = baseResult('comparative_balance_sheet', 'Comparative Balance Sheet', `Balances as of ${dates.asOfDate} compared with ${priorAsOfDate}.`, 'POSTED_LEDGER', dates,
      [{ key: 'section', label: 'Section', type: 'text' }, { key: 'account_code', label: 'Code', type: 'text' }, { key: 'account_name', label: 'Account', type: 'text' }, { key: 'current_balance', label: 'Current', type: 'money', align: 'right' }, { key: 'prior_balance', label: 'Previous', type: 'money', align: 'right' }, { key: 'variance', label: 'Variance', type: 'money', align: 'right' }, { key: 'variance_percent', label: 'Variance %', type: 'percent', align: 'right' }], rows,
      [{ key: 'assets', label: 'Current assets', value: number(report.totalAssets.current), type: 'money' }, { key: 'liabilities', label: 'Current liabilities', value: number(report.totalLiabilities.current), type: 'money' }, { key: 'equity', label: 'Current equity', value: number(report.totalEquity.current), type: 'money' }], undefined,
      report.isBalancedCurrent && report.isBalancedPrior ? [] : ['One of the compared balance sheets does not satisfy the accounting equation.']);
    output.period = { asOfDate: dates.asOfDate }; return output;
  }

  private static async businessRatioAnalysis(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const [pnl, balanceSheet] = await Promise.all([
      ProfitAndLossReportService.getProfitAndLoss(orgId, { fromDate: dates.fromDate, toDate: dates.toDate, projectId: filter.projectId }),
      BalanceSheetReportService.getBalanceSheet(orgId, { asOfDate: dates.asOfDate }),
    ]);
    const revenue = number(pnl.totalRevenue); const grossProfit = number(pnl.grossProfit); const netProfit = number(pnl.netProfit);
    const assets = number(balanceSheet.totalAssets); const liabilities = number(balanceSheet.totalLiabilities); const equity = number(balanceSheet.totalEquity);
    const rows = [
      { ratio: 'Gross profit margin', value: revenue ? number(grossProfit / revenue * 100) : 0, interpretation: 'Gross profit as a percentage of revenue' },
      { ratio: 'Net profit margin', value: revenue ? number(netProfit / revenue * 100) : 0, interpretation: 'Net profit as a percentage of revenue' },
      { ratio: 'Return on assets', value: assets ? number(netProfit / assets * 100) : 0, interpretation: 'Period profit relative to closing assets' },
      { ratio: 'Return on equity', value: equity ? number(netProfit / equity * 100) : 0, interpretation: 'Period profit relative to closing equity' },
      { ratio: 'Debt to equity', value: equity ? number(liabilities / equity) : 0, interpretation: 'Closing liabilities divided by closing equity' },
    ];
    return baseResult('business_ratio_analysis', 'Business Ratio Analysis', 'Core profitability and leverage indicators derived from the posted ledger.', 'POSTED_LEDGER', dates,
      [{ key: 'ratio', label: 'Ratio', type: 'text' }, { key: 'value', label: 'Value', type: 'number', align: 'right' }, { key: 'interpretation', label: 'Definition', type: 'text' }], rows,
      [{ key: 'revenue', label: 'Revenue', value: revenue, type: 'money' }, { key: 'gross_profit', label: 'Gross profit', value: grossProfit, type: 'money' }, { key: 'net_profit', label: 'Net profit', value: netProfit, type: 'money' }]);
  }

  private static async budgetVsActual(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const budgets = await BudgetService.getBudgets(orgId);
    const budget = budgets.find((item) => String(item.status).toUpperCase() === 'APPROVED') || budgets[0];
    if (!budget) return baseResult('budget_vs_actual', 'Budget vs Actual', 'Approved budget compared with posted ledger actuals.', 'POSTED_LEDGER', dates,
      [{ key: 'account_code', label: 'Code', type: 'text' }, { key: 'account_name', label: 'Account', type: 'text' }, { key: 'budgeted_amount', label: 'Budget', type: 'money', align: 'right' }, { key: 'actual_amount', label: 'Actual', type: 'money', align: 'right' }, { key: 'variance', label: 'Variance', type: 'money', align: 'right' }, { key: 'variance_percentage', label: 'Variance %', type: 'percent', align: 'right' }], [], [], undefined, ['Create and approve a budget before running this report.']);
    const report = await BudgetService.getBudgetVsActualReport(orgId, budget.id, dates.fromDate, dates.toDate);
    const rows = report.lines.map((row) => ({ account_code: row.accountCode, account_name: row.accountName, account_type: row.accountType, budgeted_amount: number(row.budgetedAmount), actual_amount: number(row.actualAmount), variance: number(row.variance), variance_percentage: number(row.variancePercentage) })).filter((row) => includesSearch(row, filter.search));
    return baseResult('budget_vs_actual', `Budget vs Actual: ${report.budgetName}`, `Budget ${report.financialYear} compared with posted ledger actuals.`, 'POSTED_LEDGER', dates,
      [{ key: 'account_code', label: 'Code', type: 'text' }, { key: 'account_name', label: 'Account', type: 'text' }, { key: 'account_type', label: 'Type', type: 'text' }, { key: 'budgeted_amount', label: 'Budget', type: 'money', align: 'right' }, { key: 'actual_amount', label: 'Actual', type: 'money', align: 'right' }, { key: 'variance', label: 'Variance', type: 'money', align: 'right' }, { key: 'variance_percentage', label: 'Variance %', type: 'percent', align: 'right' }], rows,
      [{ key: 'budget', label: 'Budget', value: number(report.totalBudgeted), type: 'money' }, { key: 'actual', label: 'Actual', value: number(report.totalActual), type: 'money' }, { key: 'variance', label: 'Variance', value: number(report.totalVariance), type: 'money' }], { categoryKey: 'account_name', valueKeys: [{ key: 'budgeted_amount', label: 'Budget' }, { key: 'actual_amount', label: 'Actual' }] });
  }

  private static async cashFlowForecast(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const report = await CashFlowForecastService.getForecast(orgId, 90);
    const rows = report.periods.map((row) => ({ period: row.periodLabel, start_date: row.startDate, end_date: row.endDate, opening_balance: number(row.openingBalance), expected_inflows: number(row.expectedInflows), expected_outflows: number(row.expectedOutflows), net_flow: number(row.netFlow), closing_balance: number(row.closingBalance) })).filter((row) => includesSearch(row, filter.search));
    return baseResult('cash_flow_forecast', 'Cash Flow Forecast', 'A 90-day projection based on current cash plus due invoice and bill balances.', 'OPERATIONAL', dates,
      [{ key: 'period', label: 'Forecast period', type: 'text' }, { key: 'start_date', label: 'From', type: 'date' }, { key: 'end_date', label: 'To', type: 'date' }, { key: 'opening_balance', label: 'Opening cash', type: 'money', align: 'right' }, { key: 'expected_inflows', label: 'Expected inflows', type: 'money', align: 'right' }, { key: 'expected_outflows', label: 'Expected outflows', type: 'money', align: 'right' }, { key: 'net_flow', label: 'Net flow', type: 'money', align: 'right' }, { key: 'closing_balance', label: 'Projected cash', type: 'money', align: 'right' }], rows,
      [{ key: 'current', label: 'Current cash', value: number(report.currentBankCashBalance), type: 'money' }, { key: 'projected', label: 'Projected closing cash', value: number(report.projectedClosingBalance), type: 'money' }], { categoryKey: 'period', valueKeys: [{ key: 'expected_inflows', label: 'Inflows' }, { key: 'expected_outflows', label: 'Outflows' }, { key: 'closing_balance', label: 'Closing cash' }] }, ['Forecasts are estimates based on due documents, not guaranteed cash movements.']);
  }

  private static async salesByCustomer(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT COALESCE(i.customer_id, i.client_id, '') AS customer_id, i.client_name AS customer,
              COUNT(*) AS invoice_count, COALESCE(SUM(i.subtotal), 0) AS sales,
              COALESCE(SUM(i.tax_total), 0) AS tax, COALESCE(SUM(i.total_amount), 0) AS total,
              COALESCE(SUM(i.paid_amount), 0) AS received, COALESCE(SUM(i.balance_due), 0) AS outstanding
         FROM invoices i
        WHERE i.organization_id = $1 AND i.issue_date >= $2 AND i.issue_date <= $3
          AND UPPER(COALESCE(i.status, '')) NOT IN ('DRAFT','SUBMITTED','VOID','VOIDED','REVERSED','CANCELLED')
          AND ($4 = '' OR COALESCE(i.customer_id, i.client_id, '') = $4)
          AND ($5 = '' OR COALESCE(i.project_id, '') = $5)
        GROUP BY COALESCE(i.customer_id, i.client_id, ''), i.client_name ORDER BY sales DESC, customer`,
      [orgId, dates.fromDate, dates.toDate, filter.customerId || '', filter.projectId || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, invoice_count: Number(row.invoice_count), sales: number(row.sales), tax: number(row.tax), total: number(row.total), received: number(row.received), outstanding: number(row.outstanding) })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('sales_by_customer', 'Sales by Customer', 'Invoiced sales, receipts and outstanding balances by customer.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'customer', label: 'Customer', type: 'text' }, { key: 'invoice_count', label: 'Invoices', type: 'number', align: 'right' }, { key: 'sales', label: 'Sales before tax', type: 'money', align: 'right' }, { key: 'tax', label: 'Tax', type: 'money', align: 'right' }, { key: 'total', label: 'Total sales', type: 'money', align: 'right' }, { key: 'received', label: 'Received', type: 'money', align: 'right' }, { key: 'outstanding', label: 'Outstanding', type: 'money', align: 'right' }], rows,
      [{ key: 'sales', label: 'Sales before tax', value: sum(rows, 'sales'), type: 'money' }, { key: 'received', label: 'Payments received', value: sum(rows, 'received'), type: 'money' }, { key: 'outstanding', label: 'Outstanding', value: sum(rows, 'outstanding'), type: 'money' }], { categoryKey: 'customer', valueKeys: [{ key: 'sales', label: 'Sales' }, { key: 'received', label: 'Received' }] });
  }

  private static async salesByItem(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT COALESCE(ii.item_id, ii.description) AS item_key, ii.description AS item,
              COALESCE(it.sku, '') AS sku, COALESCE(SUM(ii.quantity), 0) AS quantity,
              COALESCE(SUM(ii.amount), 0) AS sales,
              CASE WHEN SUM(ii.quantity) = 0 THEN 0 ELSE SUM(ii.amount) / SUM(ii.quantity) END AS average_price
         FROM invoice_items ii
         JOIN invoices i ON i.organization_id = ii.organization_id AND i.id = ii.invoice_id
         LEFT JOIN items it ON it.organization_id = ii.organization_id AND it.id = ii.item_id
        WHERE ii.organization_id = $1 AND i.issue_date >= $2 AND i.issue_date <= $3
          AND UPPER(COALESCE(i.status, '')) NOT IN ('DRAFT','SUBMITTED','VOID','VOIDED','REVERSED','CANCELLED')
          AND ($4 = '' OR COALESCE(i.project_id, '') = $4)
        GROUP BY COALESCE(ii.item_id, ii.description), ii.description, it.sku ORDER BY sales DESC, item`,
      [orgId, dates.fromDate, dates.toDate, filter.projectId || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, quantity: number(row.quantity), sales: number(row.sales), average_price: number(row.average_price) })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('sales_by_item', 'Sales by Item', 'Quantity, value and average selling price by invoiced item or service.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'item', label: 'Item or service', type: 'text' }, { key: 'sku', label: 'SKU', type: 'text' }, { key: 'quantity', label: 'Quantity', type: 'number', align: 'right' }, { key: 'average_price', label: 'Average price', type: 'money', align: 'right' }, { key: 'sales', label: 'Sales', type: 'money', align: 'right' }], rows,
      [{ key: 'quantity', label: 'Quantity sold', value: sum(rows, 'quantity'), type: 'number' }, { key: 'sales', label: 'Sales', value: sum(rows, 'sales'), type: 'money' }], { categoryKey: 'item', valueKeys: [{ key: 'sales', label: 'Sales' }] });
  }

  private static async salesBySalesperson(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT COALESCE(sp.name, 'Unassigned') AS salesperson, COUNT(*) AS invoice_count,
              COALESCE(SUM(i.subtotal), 0) AS sales, COALESCE(SUM(i.total_amount), 0) AS sales_with_tax,
              COALESCE(SUM(i.paid_amount), 0) AS received
         FROM invoices i
         LEFT JOIN customers c ON c.organization_id = i.organization_id AND (c.id = i.customer_id OR c.id = i.client_id)
         LEFT JOIN salespersons sp ON sp.organization_id = i.organization_id AND sp.id = COALESCE(i.salesperson_id, c.salesperson_id)
        WHERE i.organization_id = $1 AND i.issue_date >= $2 AND i.issue_date <= $3
          AND UPPER(COALESCE(i.status, '')) NOT IN ('DRAFT','SUBMITTED','VOID','VOIDED','REVERSED','CANCELLED')
        GROUP BY COALESCE(sp.name, 'Unassigned') ORDER BY sales DESC, salesperson`,
      [orgId, dates.fromDate, dates.toDate],
    );
    const rows = result.rows.map((row: any) => ({ ...row, invoice_count: Number(row.invoice_count), sales: number(row.sales), sales_with_tax: number(row.sales_with_tax), received: number(row.received) })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('sales_by_salesperson', 'Sales by Salesperson', 'Invoice value and collections attributed to each salesperson.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'salesperson', label: 'Salesperson', type: 'text' }, { key: 'invoice_count', label: 'Invoices', type: 'number', align: 'right' }, { key: 'sales', label: 'Sales', type: 'money', align: 'right' }, { key: 'sales_with_tax', label: 'Sales with tax', type: 'money', align: 'right' }, { key: 'received', label: 'Received', type: 'money', align: 'right' }], rows,
      [{ key: 'sales', label: 'Sales', value: sum(rows, 'sales'), type: 'money' }, { key: 'received', label: 'Received', value: sum(rows, 'received'), type: 'money' }], { categoryKey: 'salesperson', valueKeys: [{ key: 'sales', label: 'Sales' }] });
  }

  private static async invoiceDetails(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT i.id, i.invoice_number, i.issue_date, i.due_date, i.client_name AS customer,
              COALESCE(p.name, '') AS project, i.status, i.subtotal, i.tax_total, i.total_amount,
              i.paid_amount, i.balance_due
         FROM invoices i LEFT JOIN projects p ON p.organization_id = i.organization_id AND p.id = i.project_id
        WHERE i.organization_id = $1 AND i.issue_date >= $2 AND i.issue_date <= $3
          AND ($4 = '' OR COALESCE(i.customer_id, i.client_id, '') = $4)
          AND ($5 = '' OR COALESCE(i.project_id, '') = $5)
          AND ($6 = '' OR UPPER(COALESCE(i.status, '')) = UPPER($6))
        ORDER BY i.issue_date DESC, i.invoice_number DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.customerId || '', filter.projectId || '', filter.status || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, issue_date: dateOnly(row.issue_date), due_date: dateOnly(row.due_date), subtotal: number(row.subtotal), tax_total: number(row.tax_total), total_amount: number(row.total_amount), paid_amount: number(row.paid_amount), balance_due: number(row.balance_due), source_type: 'invoice', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('invoice_details', 'Invoice Details', 'Invoice status, tax, collections and balance details.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'invoice_number', label: 'Invoice', type: 'text' }, { key: 'issue_date', label: 'Date', type: 'date' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'project', label: 'Project', type: 'text' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'subtotal', label: 'Subtotal', type: 'money', align: 'right' }, { key: 'tax_total', label: 'Tax', type: 'money', align: 'right' }, { key: 'total_amount', label: 'Total', type: 'money', align: 'right' }, { key: 'paid_amount', label: 'Received', type: 'money', align: 'right' }, { key: 'balance_due', label: 'Balance', type: 'money', align: 'right' }], rows,
      [{ key: 'total_amount', label: 'Invoiced', value: sum(rows, 'total_amount'), type: 'money' }, { key: 'paid_amount', label: 'Received', value: sum(rows, 'paid_amount'), type: 'money' }, { key: 'balance_due', label: 'Outstanding', value: sum(rows, 'balance_due'), type: 'money' }]);
  }

  private static async paymentsReceived(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT pr.id, pr.payment_number, pr.payment_date, pr.client_name AS customer, pr.payment_mode,
              pr.reference, pr.status, pr.amount, pr.unallocated_amount, a.name AS deposited_to
         FROM payments_received pr
         JOIN accounts a ON a.organization_id = pr.organization_id AND a.id = pr.deposit_to_account_id
        WHERE pr.organization_id = $1 AND pr.payment_date >= $2 AND pr.payment_date <= $3
          AND ($4 = '' OR pr.client_id = $4) AND ($5 = '' OR UPPER(COALESCE(pr.status, '')) = UPPER($5))
        ORDER BY pr.payment_date DESC, pr.payment_number DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.customerId || '', filter.status || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, payment_date: dateOnly(row.payment_date), amount: number(row.amount), unallocated_amount: number(row.unallocated_amount), source_type: 'payment_received', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('payments_received', 'Payments Received', 'Customer receipts, deposit accounts and unallocated amounts.', 'RECONCILED_SUBLEDGER', dates,
      [{ key: 'payment_number', label: 'Payment', type: 'text' }, { key: 'payment_date', label: 'Date', type: 'date' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'payment_mode', label: 'Mode', type: 'text' }, { key: 'deposited_to', label: 'Deposited to', type: 'text' }, { key: 'reference', label: 'Reference', type: 'text' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'amount', label: 'Amount', type: 'money', align: 'right' }, { key: 'unallocated_amount', label: 'Unallocated', type: 'money', align: 'right' }], rows,
      [{ key: 'amount', label: 'Payments received', value: sum(rows, 'amount'), type: 'money' }, { key: 'unallocated_amount', label: 'Unallocated', value: sum(rows, 'unallocated_amount'), type: 'money' }]);
  }

  private static async timeToGetPaid(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT i.id, i.invoice_number, i.client_name AS customer, i.issue_date, i.total_amount,
              pr.payment_number, pr.payment_date, pra.amount
         FROM payment_received_allocations pra
         JOIN payments_received pr ON pr.organization_id = pra.organization_id AND pr.id = pra.payment_id
         JOIN invoices i ON i.organization_id = pra.organization_id AND i.id = pra.invoice_id
        WHERE pra.organization_id = $1 AND pr.payment_date >= $2 AND pr.payment_date <= $3
          AND ($4 = '' OR pr.client_id = $4)
          AND UPPER(COALESCE(pr.status, '')) NOT IN ('DRAFT','SUBMITTED','VOID','VOIDED','REVERSED','CANCELLED')
        ORDER BY pr.payment_date DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.customerId || ''],
    );
    const rows = result.rows.map((row: any) => {
      const issue = dateOnly(row.issue_date); const paid = dateOnly(row.payment_date);
      const days = Math.max(0, Math.floor((new Date(paid).getTime() - new Date(issue).getTime()) / 86_400_000));
      return { invoice_number: row.invoice_number, customer: row.customer, issue_date: issue, payment_number: row.payment_number, payment_date: paid, amount: number(row.amount), days_to_pay: days, source_type: 'invoice', source_id: row.id };
    }).filter((row: any) => includesSearch(row, filter.search));
    const allocated = sum(rows, 'amount');
    const weightedDays = allocated === 0 ? 0 : roundMoney(rows.reduce((total: number, row: any) => total + row.days_to_pay * row.amount, 0) / allocated);
    return baseResult('time_to_get_paid', 'Time to Get Paid', 'Elapsed days between invoice issue and allocated customer payments.', 'RECONCILED_SUBLEDGER', dates,
      [{ key: 'invoice_number', label: 'Invoice', type: 'text' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'issue_date', label: 'Invoice date', type: 'date' }, { key: 'payment_number', label: 'Payment', type: 'text' }, { key: 'payment_date', label: 'Paid date', type: 'date' }, { key: 'amount', label: 'Allocated', type: 'money', align: 'right' }, { key: 'days_to_pay', label: 'Days to pay', type: 'number', align: 'right' }], rows,
      [{ key: 'amount', label: 'Allocated receipts', value: allocated, type: 'money' }, { key: 'days_to_pay', label: 'Weighted average days', value: weightedDays, type: 'number' }]);
  }

  private static async customerBalanceSummary(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const aging = await ARAgingReportService.getARAgingReport(orgId, dates.asOfDate);
    const grouped = new Map<string, any>();
    for (const row of aging.rows) {
      if (filter.customerId && ![row.customer_id, row.client_id].includes(filter.customerId)) continue;
      const key = row.customer_id || row.client_id || row.name;
      const current = grouped.get(key) || { customer_id: key, customer: row.name, invoice_count: 0, invoiced: 0, received_or_settled: 0, closing_balance: 0 };
      current.invoice_count += 1; current.invoiced += row.total_amount; current.received_or_settled += row.paid_amount_as_of; current.closing_balance += row.balance_due;
      grouped.set(key, current);
    }
    const rows = Array.from(grouped.values()).map((row) => ({ ...row, invoiced: number(row.invoiced), received_or_settled: number(row.received_or_settled), closing_balance: number(row.closing_balance) })).filter((row) => includesSearch(row, filter.search));
    const result = baseResult('customer_balance_summary', 'Customer Balance Summary', 'Open invoice balances by customer as of the selected date.', 'RECONCILED_SUBLEDGER', dates,
      [{ key: 'customer', label: 'Customer', type: 'text' }, { key: 'invoice_count', label: 'Open invoices', type: 'number', align: 'right' }, { key: 'invoiced', label: 'Invoiced', type: 'money', align: 'right' }, { key: 'received_or_settled', label: 'Settled', type: 'money', align: 'right' }, { key: 'closing_balance', label: 'Closing balance', type: 'money', align: 'right' }], rows,
      [{ key: 'closing_balance', label: 'Receivables', value: sum(rows, 'closing_balance'), type: 'money' }], { categoryKey: 'customer', valueKeys: [{ key: 'closing_balance', label: 'Balance' }] }, aging.isReconciled ? [] : [`AR control account differs by ${aging.difference.toFixed(2)}.`]);
    result.period = { asOfDate: dates.asOfDate }; return result;
  }

  private static async expenseBase(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT e.id, e.expense_number, e.date, e.vendor_name, e.vendor_invoice_number, e.description,
              e.amount, e.tax_amount, e.tds_amount, e.is_tax_inclusive, e.status, e.is_billable, e.is_billed,
              a.id AS account_id, a.code AS account_code, a.name AS account_name,
              COALESCE(p.name, '') AS project, COALESCE(c.display_name, c.legal_name, '') AS customer
         FROM expenses e
         JOIN accounts a ON a.organization_id = e.organization_id AND a.id = e.expense_account_id
         LEFT JOIN projects p ON p.organization_id = e.organization_id AND p.id = e.project_id
         LEFT JOIN customers c ON c.organization_id = e.organization_id AND c.id = e.client_id
        WHERE e.organization_id = $1 AND e.date >= $2 AND e.date <= $3
          AND ($4 = '' OR COALESCE(e.project_id, '') = $4) AND ($5 = '' OR COALESCE(e.vendor_id, '') = $5)
          AND ($6 = '' OR COALESCE(e.client_id, '') = $6) AND ($7 = '' OR e.expense_account_id = $7)
          AND ($8 = '' OR UPPER(COALESCE(e.status, '')) = UPPER($8))
        ORDER BY e.date DESC, e.expense_number DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.projectId || '', filter.vendorId || '', filter.customerId || '', filter.accountId || '', filter.status || ''],
    );
    return result.rows.map((row: any) => {
      const enteredAmount = number(row.amount);
      const taxAmount = number(row.tax_amount);
      const taxInclusive = Boolean(row.is_tax_inclusive);
      return {
        ...row,
        date: dateOnly(row.date),
        amount: taxInclusive ? number(enteredAmount - taxAmount) : enteredAmount,
        entered_amount: enteredAmount,
        gross_amount: taxInclusive ? enteredAmount : number(enteredAmount + taxAmount),
        tax_amount: taxAmount,
        tds_amount: number(row.tds_amount),
        is_tax_inclusive: taxInclusive,
        is_billable: Boolean(row.is_billable),
        is_billed: Boolean(row.is_billed),
        source_type: 'expense',
        source_id: row.id,
      };
    }).filter((row: any) => includesSearch(row, filter.search));
  }

  private static async expenseDetails(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const rows = await this.expenseBase(orgId, dates, filter);
    return baseResult('expense_details', 'Expense Details', 'Paid expense records with category, vendor, project, tax and billing status.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'expense_number', label: 'Expense', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'account_name', label: 'Category', type: 'text' }, { key: 'vendor_name', label: 'Vendor', type: 'text' }, { key: 'project', label: 'Project', type: 'text' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'amount', label: 'Taxable amount', type: 'money', align: 'right' }, { key: 'tax_amount', label: 'Tax', type: 'money', align: 'right' }, { key: 'gross_amount', label: 'Total paid', type: 'money', align: 'right' }, { key: 'tds_amount', label: 'TDS', type: 'money', align: 'right' }], rows,
      [{ key: 'amount', label: 'Taxable expenses', value: sum(rows, 'amount'), type: 'money' }, { key: 'tax_amount', label: 'Input tax', value: sum(rows, 'tax_amount'), type: 'money' }, { key: 'gross_amount', label: 'Total paid', value: sum(rows, 'gross_amount'), type: 'money' }]);
  }

  private static aggregateExpenses(id: string, title: string, description: string, dates: ReturnType<typeof period>, raw: any[], key: string, label: string) {
    const grouped = new Map<string, any>();
    for (const row of raw) {
      const name = String(row[key] || `No ${label.toLowerCase()}`);
      const current = grouped.get(name) || { name, expense_count: 0, amount: 0, tax_amount: 0, total: 0 };
      current.expense_count += 1; current.amount += row.amount; current.tax_amount += row.tax_amount; current.total += row.gross_amount;
      grouped.set(name, current);
    }
    const rows = Array.from(grouped.values()).map((row) => ({ ...row, amount: number(row.amount), tax_amount: number(row.tax_amount), total: number(row.total) })).sort((a, b) => b.total - a.total);
    return baseResult(id, title, description, 'POSTED_DOCUMENTS', dates,
      [{ key: 'name', label, type: 'text' }, { key: 'expense_count', label: 'Expenses', type: 'number', align: 'right' }, { key: 'amount', label: 'Amount', type: 'money', align: 'right' }, { key: 'tax_amount', label: 'Tax', type: 'money', align: 'right' }, { key: 'total', label: 'Total', type: 'money', align: 'right' }], rows,
      [{ key: 'amount', label: 'Expense amount', value: sum(rows, 'amount'), type: 'money' }, { key: 'tax_amount', label: 'Tax', value: sum(rows, 'tax_amount'), type: 'money' }], { categoryKey: 'name', valueKeys: [{ key: 'amount', label: 'Expenses' }] });
  }

  private static async expensesByCategory(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) { return this.aggregateExpenses('expenses_by_category', 'Expenses by Category', 'Paid expenses grouped by chart-of-account category.', dates, await this.expenseBase(orgId, dates, filter), 'account_name', 'Expense account'); }
  private static async expensesByVendor(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) { return this.aggregateExpenses('expenses_by_vendor', 'Expenses by Vendor', 'Paid expenses grouped by vendor.', dates, await this.expenseBase(orgId, dates, filter), 'vendor_name', 'Vendor'); }
  private static async expensesByProject(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) { return this.aggregateExpenses('expenses_by_project', 'Expenses by Project', 'Paid expenses grouped by project.', dates, await this.expenseBase(orgId, dates, filter), 'project', 'Project'); }

  private static async billableExpenseDetails(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const rows = (await this.expenseBase(orgId, dates, filter)).filter((row: any) => row.is_billable).map((row: any) => ({ ...row, billing_status: row.is_billed ? 'Billed' : 'Unbilled' }));
    return baseResult('billable_expense_details', 'Billable Expense Details', 'Customer-chargeable expenses and their invoicing status.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'expense_number', label: 'Expense', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'project', label: 'Project', type: 'text' }, { key: 'vendor_name', label: 'Vendor', type: 'text' }, { key: 'billing_status', label: 'Billing status', type: 'status' }, { key: 'amount', label: 'Amount', type: 'money', align: 'right' }], rows,
      [{ key: 'amount', label: 'Billable expenses', value: sum(rows, 'amount'), type: 'money' }, { key: 'unbilled', label: 'Unbilled', value: sum(rows.filter((row: any) => !row.is_billed), 'amount'), type: 'money' }]);
  }

  private static async billBase(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT b.id, b.bill_number, b.vendor_invoice_number, b.bill_date, b.due_date, b.vendor_id,
              b.vendor_name, b.status, b.subtotal, b.tax_total, b.total_amount, b.amount_paid, b.balance_due
         FROM bills b WHERE b.organization_id = $1 AND b.bill_date >= $2 AND b.bill_date <= $3
          AND ($4 = '' OR COALESCE(b.vendor_id, '') = $4) AND ($5 = '' OR UPPER(COALESCE(b.status, '')) = UPPER($5))
        ORDER BY b.bill_date DESC, b.bill_number DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.vendorId || '', filter.status || ''],
    );
    return result.rows.map((row: any) => ({ ...row, bill_date: dateOnly(row.bill_date), due_date: dateOnly(row.due_date), subtotal: number(row.subtotal), tax_total: number(row.tax_total), total_amount: number(row.total_amount), amount_paid: number(row.amount_paid), balance_due: number(row.balance_due), source_type: 'bill', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
  }

  private static async billDetails(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const rows = await this.billBase(orgId, dates, filter);
    return baseResult('bill_details', 'Bill Details', 'Vendor bills with tax, payment and outstanding balances.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'bill_number', label: 'Bill', type: 'text' }, { key: 'vendor_invoice_number', label: 'Vendor invoice', type: 'text' }, { key: 'bill_date', label: 'Date', type: 'date' }, { key: 'due_date', label: 'Due date', type: 'date' }, { key: 'vendor_name', label: 'Vendor', type: 'text' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'subtotal', label: 'Subtotal', type: 'money', align: 'right' }, { key: 'tax_total', label: 'Tax', type: 'money', align: 'right' }, { key: 'total_amount', label: 'Total', type: 'money', align: 'right' }, { key: 'amount_paid', label: 'Paid', type: 'money', align: 'right' }, { key: 'balance_due', label: 'Balance', type: 'money', align: 'right' }], rows,
      [{ key: 'total_amount', label: 'Billed', value: sum(rows, 'total_amount'), type: 'money' }, { key: 'amount_paid', label: 'Paid', value: sum(rows, 'amount_paid'), type: 'money' }, { key: 'balance_due', label: 'Outstanding', value: sum(rows, 'balance_due'), type: 'money' }]);
  }

  private static async purchasesByVendor(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const raw = await this.billBase(orgId, dates, filter); const grouped = new Map<string, any>();
    for (const row of raw) { const key = row.vendor_id || row.vendor_name; const current = grouped.get(key) || { vendor_id: key, vendor: row.vendor_name, bill_count: 0, purchases: 0, tax: 0, paid: 0, outstanding: 0 }; current.bill_count++; current.purchases += row.subtotal; current.tax += row.tax_total; current.paid += row.amount_paid; current.outstanding += row.balance_due; grouped.set(key, current); }
    const rows = Array.from(grouped.values()).map((row) => ({ ...row, purchases: number(row.purchases), tax: number(row.tax), paid: number(row.paid), outstanding: number(row.outstanding) })).sort((a, b) => b.purchases - a.purchases);
    return baseResult('purchases_by_vendor', 'Purchases by Vendor', 'Vendor bill value, payments and balances grouped by vendor.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'vendor', label: 'Vendor', type: 'text' }, { key: 'bill_count', label: 'Bills', type: 'number', align: 'right' }, { key: 'purchases', label: 'Purchases', type: 'money', align: 'right' }, { key: 'tax', label: 'Tax', type: 'money', align: 'right' }, { key: 'paid', label: 'Paid', type: 'money', align: 'right' }, { key: 'outstanding', label: 'Outstanding', type: 'money', align: 'right' }], rows,
      [{ key: 'purchases', label: 'Purchases', value: sum(rows, 'purchases'), type: 'money' }, { key: 'outstanding', label: 'Outstanding', value: sum(rows, 'outstanding'), type: 'money' }], { categoryKey: 'vendor', valueKeys: [{ key: 'purchases', label: 'Purchases' }, { key: 'paid', label: 'Paid' }] });
  }

  private static async paymentsMade(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT pm.id, pm.payment_number, pm.payment_date, pm.vendor_name AS vendor, pm.payment_mode,
              pm.reference, pm.status, pm.amount, pm.unallocated_amount, a.name AS paid_from
         FROM payments_made pm JOIN accounts a ON a.organization_id = pm.organization_id AND a.id = pm.paid_from_account_id
        WHERE pm.organization_id = $1 AND pm.payment_date >= $2 AND pm.payment_date <= $3
          AND ($4 = '' OR pm.vendor_id = $4) AND ($5 = '' OR UPPER(COALESCE(pm.status, '')) = UPPER($5))
        ORDER BY pm.payment_date DESC, pm.payment_number DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.vendorId || '', filter.status || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, payment_date: dateOnly(row.payment_date), amount: number(row.amount), unallocated_amount: number(row.unallocated_amount), source_type: 'payment_made', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('payments_made', 'Payments Made', 'Vendor settlements and advances by payment account.', 'RECONCILED_SUBLEDGER', dates,
      [{ key: 'payment_number', label: 'Payment', type: 'text' }, { key: 'payment_date', label: 'Date', type: 'date' }, { key: 'vendor', label: 'Vendor', type: 'text' }, { key: 'payment_mode', label: 'Mode', type: 'text' }, { key: 'paid_from', label: 'Paid from', type: 'text' }, { key: 'reference', label: 'Reference', type: 'text' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'amount', label: 'Amount', type: 'money', align: 'right' }, { key: 'unallocated_amount', label: 'Unallocated', type: 'money', align: 'right' }], rows,
      [{ key: 'amount', label: 'Payments made', value: sum(rows, 'amount'), type: 'money' }, { key: 'unallocated_amount', label: 'Unallocated', value: sum(rows, 'unallocated_amount'), type: 'money' }]);
  }

  private static async vendorBalanceSummary(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const aging = await APAgingReportService.getAPAgingReport(orgId, dates.asOfDate); const grouped = new Map<string, any>();
    for (const row of aging.rows) { if (filter.vendorId && row.vendor_id !== filter.vendorId) continue; const key = row.vendor_id || row.name; const current = grouped.get(key) || { vendor_id: key, vendor: row.name, bill_count: 0, billed: 0, paid_or_settled: 0, closing_balance: 0 }; current.bill_count++; current.billed += row.total_amount; current.paid_or_settled += row.paid_amount_as_of; current.closing_balance += row.balance_due; grouped.set(key, current); }
    const rows = Array.from(grouped.values()).map((row) => ({ ...row, billed: number(row.billed), paid_or_settled: number(row.paid_or_settled), closing_balance: number(row.closing_balance) })).filter((row) => includesSearch(row, filter.search));
    const result = baseResult('vendor_balance_summary', 'Vendor Balance Summary', 'Open bill balances by vendor as of the selected date.', 'RECONCILED_SUBLEDGER', dates,
      [{ key: 'vendor', label: 'Vendor', type: 'text' }, { key: 'bill_count', label: 'Open bills', type: 'number', align: 'right' }, { key: 'billed', label: 'Billed', type: 'money', align: 'right' }, { key: 'paid_or_settled', label: 'Settled', type: 'money', align: 'right' }, { key: 'closing_balance', label: 'Closing balance', type: 'money', align: 'right' }], rows,
      [{ key: 'closing_balance', label: 'Payables', value: sum(rows, 'closing_balance'), type: 'money' }], { categoryKey: 'vendor', valueKeys: [{ key: 'closing_balance', label: 'Balance' }] }, aging.isReconciled ? [] : [`AP control account differs by ${aging.difference.toFixed(2)}.`]);
    result.period = { asOfDate: dates.asOfDate }; return result;
  }

  private static async timesheetDetails(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT te.id, te.project_id, te.date, te.project_name AS project, te.client_name AS customer, te.staff_name AS staff,
              te.task_name AS task, te.hours, te.hourly_rate, te.is_billable, te.is_billed,
              (te.hours * te.hourly_rate) AS value
         FROM time_entries te WHERE te.organization_id = $1 AND te.date >= $2 AND te.date <= $3
          AND ($4 = '' OR te.project_id = $4) ORDER BY te.date DESC, te.project_name, te.staff_name`,
      [orgId, dates.fromDate, dates.toDate, filter.projectId || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, date: dateOnly(row.date), hours: number(row.hours), hourly_rate: number(row.hourly_rate), value: number(row.value), billing_status: row.is_billable ? (row.is_billed ? 'Billed' : 'Unbilled') : 'Non-billable', source_type: 'project', source_id: row.project_id })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('timesheet_details', 'Timesheet Details', 'Logged, billable and billed hours by project, task and staff member.', 'OPERATIONAL', dates,
      [{ key: 'date', label: 'Date', type: 'date' }, { key: 'project', label: 'Project', type: 'text' }, { key: 'customer', label: 'Customer', type: 'text' }, { key: 'staff', label: 'Staff', type: 'text' }, { key: 'task', label: 'Task', type: 'text' }, { key: 'billing_status', label: 'Billing status', type: 'status' }, { key: 'hours', label: 'Hours', type: 'number', align: 'right' }, { key: 'hourly_rate', label: 'Rate', type: 'money', align: 'right' }, { key: 'value', label: 'Value', type: 'money', align: 'right' }], rows,
      [{ key: 'hours', label: 'Logged hours', value: sum(rows, 'hours'), type: 'number' }, { key: 'value', label: 'Time value', value: sum(rows, 'value'), type: 'money' }]);
  }

  private static async bankReconciliationSummary(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const [accountsResult, importsResult, transactionsResult] = await Promise.all([
      db.query(
        `SELECT ba.id, ba.ledger_account_id, ba.account_name, ba.bank_name, ba.masked_account_number, ba.currency,
                COALESCE(SUM(CASE WHEN UPPER(COALESCE(je.status, '')) = 'POSTED' AND je.date <= $2 THEN jl.debit - jl.credit ELSE 0 END), 0) AS book_balance
           FROM bank_accounts ba
           LEFT JOIN journal_lines jl ON jl.organization_id = ba.organization_id AND jl.account_id = ba.ledger_account_id
           LEFT JOIN journal_entries je ON je.organization_id = ba.organization_id AND je.id = jl.journal_entry_id
          WHERE ba.organization_id = $1 AND ba.is_active = TRUE
          GROUP BY ba.id, ba.ledger_account_id, ba.account_name, ba.bank_name, ba.masked_account_number, ba.currency
          ORDER BY ba.account_name`,
        [orgId, dates.asOfDate],
      ),
      db.query(
        `SELECT bank_account_id, closing_balance, statement_to
           FROM bank_statement_imports
          WHERE organization_id = $1 AND statement_to <= $2
          ORDER BY bank_account_id, statement_to DESC, imported_at DESC`,
        [orgId, dates.asOfDate],
      ),
      db.query(
        `SELECT bank_account_id, COUNT(*) AS total_count,
                SUM(CASE WHEN reconciliation_status = 'MATCHED' THEN 1 ELSE 0 END) AS matched_count,
                SUM(CASE WHEN reconciliation_status <> 'MATCHED' THEN 1 ELSE 0 END) AS unmatched_count
           FROM bank_statement_transactions
          WHERE organization_id = $1 AND transaction_date <= $2
          GROUP BY bank_account_id`,
        [orgId, dates.asOfDate],
      ),
    ]);
    const latestByAccount = new Map<string, any>();
    for (const statement of importsResult.rows) if (!latestByAccount.has(statement.bank_account_id)) latestByAccount.set(statement.bank_account_id, statement);
    const transactionsByAccount = new Map(transactionsResult.rows.map((row: any) => [row.bank_account_id, row]));
    const rows = accountsResult.rows.map((row: any) => {
      const latest = latestByAccount.get(row.id);
      const transaction = transactionsByAccount.get(row.id) as any;
      const bookBalance = number(row.book_balance);
      const statementBalance = latest ? number(latest.closing_balance) : 0;
      return {
        ...row,
        statement_to: latest ? dateOnly(latest.statement_to) : '',
        book_balance: bookBalance,
        statement_balance: statementBalance,
        difference: latest ? number(statementBalance - bookBalance) : 0,
        statement_transactions: Number(transaction?.total_count || 0),
        matched: Number(transaction?.matched_count || 0),
        unmatched: Number(transaction?.unmatched_count || 0),
      };
    }).filter((row: any) => includesSearch(row, filter.search));
    const output = baseResult('bank_reconciliation_summary', 'Bank Reconciliation Summary', 'Book balances compared with the latest uploaded statement balance.', 'RECONCILED_SUBLEDGER', dates,
      [{ key: 'account_name', label: 'Bank account', type: 'text' }, { key: 'bank_name', label: 'Bank', type: 'text' }, { key: 'masked_account_number', label: 'Account', type: 'text' }, { key: 'statement_to', label: 'Statement through', type: 'date' }, { key: 'book_balance', label: 'Balance in FirmBooks', type: 'money', align: 'right' }, { key: 'statement_balance', label: 'Balance in bank', type: 'money', align: 'right' }, { key: 'difference', label: 'Difference', type: 'money', align: 'right' }, { key: 'matched', label: 'Matched', type: 'number', align: 'right' }, { key: 'unmatched', label: 'Unmatched', type: 'number', align: 'right' }], rows,
      [{ key: 'book_balance', label: 'Balance in FirmBooks', value: sum(rows, 'book_balance'), type: 'money' }, { key: 'statement_balance', label: 'Balance in bank', value: sum(rows, 'statement_balance'), type: 'money' }, { key: 'unmatched', label: 'Unmatched entries', value: sum(rows, 'unmatched'), type: 'number' }]);
    output.period = { asOfDate: dates.asOfDate }; return output;
  }

  private static async bankTransactionDetails(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT bst.id, bst.transaction_date, ba.account_name AS bank_account, bst.narration, bst.reference,
              bst.counterparty_name AS counterparty, bst.direction, bst.amount, bst.running_balance,
              bst.reconciliation_status AS status
         FROM bank_statement_transactions bst
         JOIN bank_accounts ba ON ba.organization_id = bst.organization_id AND ba.id = bst.bank_account_id
        WHERE bst.organization_id = $1 AND bst.transaction_date >= $2 AND bst.transaction_date <= $3
          AND ($4 = '' OR bst.bank_account_id = $4 OR ba.ledger_account_id = $4) AND ($5 = '' OR UPPER(COALESCE(bst.reconciliation_status, '')) = UPPER($5))
        ORDER BY bst.transaction_date DESC, bst.id DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.accountId || '', filter.status || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, transaction_date: dateOnly(row.transaction_date), amount: number(row.amount), running_balance: row.running_balance === null ? null : number(row.running_balance), money_in: row.direction === 'CREDIT' ? number(row.amount) : 0, money_out: row.direction === 'DEBIT' ? number(row.amount) : 0, source_type: 'bank_transaction', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('bank_transaction_details', 'Bank Transaction Details', 'Uploaded statement transactions and their matching status. Statement rows never become expenses automatically.', 'RECONCILED_SUBLEDGER', dates,
      [{ key: 'transaction_date', label: 'Date', type: 'date' }, { key: 'bank_account', label: 'Bank account', type: 'text' }, { key: 'narration', label: 'Description', type: 'text' }, { key: 'reference', label: 'Reference', type: 'text' }, { key: 'counterparty', label: 'Counterparty', type: 'text' }, { key: 'status', label: 'Match status', type: 'status' }, { key: 'money_in', label: 'Money in', type: 'money', align: 'right' }, { key: 'money_out', label: 'Money out', type: 'money', align: 'right' }, { key: 'running_balance', label: 'Bank balance', type: 'money', align: 'right' }], rows,
      [{ key: 'money_in', label: 'Money in', value: sum(rows, 'money_in'), type: 'money' }, { key: 'money_out', label: 'Money out', value: sum(rows, 'money_out'), type: 'money' }, { key: 'unmatched', label: 'Unmatched', value: rows.filter((row: any) => row.status !== 'MATCHED').length, type: 'number' }]);
  }

  private static async gstSummary(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const [sales, purchases, expenses] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(tax_total),0) AS tax, COALESCE(SUM(subtotal),0) AS taxable FROM invoices WHERE organization_id=$1 AND issue_date >= $2 AND issue_date <= $3 AND UPPER(COALESCE(status,'')) NOT IN ('DRAFT','SUBMITTED','VOID','VOIDED','REVERSED','CANCELLED')`, [orgId, dates.fromDate, dates.toDate]),
      db.query(`SELECT COALESCE(SUM(tax_total),0) AS tax, COALESCE(SUM(subtotal),0) AS taxable FROM bills WHERE organization_id=$1 AND bill_date >= $2 AND bill_date <= $3 AND UPPER(COALESCE(status,'')) NOT IN ('DRAFT','SUBMITTED','VOID','VOIDED','REVERSED','CANCELLED')`, [orgId, dates.fromDate, dates.toDate]),
      db.query(`SELECT COALESCE(SUM(tax_amount),0) AS tax,
                       COALESCE(SUM(CASE WHEN is_tax_inclusive THEN amount - COALESCE(tax_amount, 0) ELSE amount END),0) AS taxable
                  FROM expenses
                 WHERE organization_id=$1 AND date >= $2 AND date <= $3
                   AND UPPER(COALESCE(status,'')) NOT IN ('VOID','VOIDED','REVERSED')`, [orgId, dates.fromDate, dates.toDate]),
    ]);
    const rows = [
      { section: 'Output tax on sales', taxable_amount: number(sales.rows[0]?.taxable), tax_amount: number(sales.rows[0]?.tax) },
      { section: 'Input tax on vendor bills', taxable_amount: number(purchases.rows[0]?.taxable), tax_amount: number(purchases.rows[0]?.tax) },
      { section: 'Input tax on paid expenses', taxable_amount: number(expenses.rows[0]?.taxable), tax_amount: number(expenses.rows[0]?.tax) },
    ];
    const outputTax = rows[0].tax_amount; const inputTax = rows[1].tax_amount + rows[2].tax_amount;
    return baseResult('gst_summary', 'GST Summary', 'Recorded output and input tax evidence for the selected period.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'section', label: 'Tax section', type: 'text' }, { key: 'taxable_amount', label: 'Taxable amount', type: 'money', align: 'right' }, { key: 'tax_amount', label: 'Tax amount', type: 'money', align: 'right' }], rows,
      [{ key: 'output', label: 'Output tax', value: outputTax, type: 'money' }, { key: 'input', label: 'Input tax', value: inputTax, type: 'money' }, { key: 'net', label: 'Net tax position', value: roundMoney(outputTax - inputTax), type: 'money' }], undefined, ['This management summary is not a filed GST return. Use GST Compliance for return evidence and filing workflows.']);
  }

  private static async tdsSummary(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT CASE WHEN COALESCE(tds_section, '') = '' THEN 'Unspecified' ELSE tds_section END AS tds_section, COUNT(*) AS transaction_count,
              COALESCE(SUM(amount),0) AS gross_amount, COALESCE(SUM(tds_amount),0) AS tds_amount
         FROM expenses WHERE organization_id=$1 AND date >= $2 AND date <= $3 AND COALESCE(tds_amount,0) > 0
          AND UPPER(COALESCE(status,'')) NOT IN ('VOID','VOIDED','REVERSED')
        GROUP BY CASE WHEN COALESCE(tds_section, '') = '' THEN 'Unspecified' ELSE tds_section END ORDER BY tds_section`,
      [orgId, dates.fromDate, dates.toDate],
    );
    const rows = result.rows.map((row: any) => ({ ...row, transaction_count: Number(row.transaction_count), gross_amount: number(row.gross_amount), tds_amount: number(row.tds_amount) })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('tds_summary', 'TDS Summary', 'TDS recorded on paid expenses, grouped by section.', 'POSTED_DOCUMENTS', dates,
      [{ key: 'tds_section', label: 'TDS section', type: 'text' }, { key: 'transaction_count', label: 'Transactions', type: 'number', align: 'right' }, { key: 'gross_amount', label: 'Gross amount', type: 'money', align: 'right' }, { key: 'tds_amount', label: 'TDS', type: 'money', align: 'right' }], rows,
      [{ key: 'gross_amount', label: 'Gross amount', value: sum(rows, 'gross_amount'), type: 'money' }, { key: 'tds_amount', label: 'TDS', value: sum(rows, 'tds_amount'), type: 'money' }]);
  }

  private static async journalReport(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT je.id, je.entry_number, je.date, je.reference, je.description, je.status,
              COALESCE(SUM(jl.debit),0) AS debit, COALESCE(SUM(jl.credit),0) AS credit, COUNT(jl.id) AS line_count
         FROM journal_entries je JOIN journal_lines jl ON jl.organization_id = je.organization_id AND jl.journal_entry_id = je.id
        WHERE je.organization_id=$1 AND je.date >= $2 AND je.date <= $3
          AND ($4 = '' OR UPPER(COALESCE(je.status,'')) = UPPER($4))
        GROUP BY je.id, je.entry_number, je.date, je.reference, je.description, je.status
        ORDER BY je.date DESC, je.entry_number DESC`,
      [orgId, dates.fromDate, dates.toDate, filter.status || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, date: dateOnly(row.date), debit: number(row.debit), credit: number(row.credit), line_count: Number(row.line_count), source_type: 'journal', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('journal_report', 'Journal Report', 'Chronological journal entries with debit-credit equality.', 'POSTED_LEDGER', dates,
      [{ key: 'entry_number', label: 'Journal', type: 'text' }, { key: 'date', label: 'Date', type: 'date' }, { key: 'reference', label: 'Reference', type: 'text' }, { key: 'description', label: 'Description', type: 'text' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'line_count', label: 'Lines', type: 'number', align: 'right' }, { key: 'debit', label: 'Debit', type: 'money', align: 'right' }, { key: 'credit', label: 'Credit', type: 'money', align: 'right' }], rows,
      [{ key: 'debit', label: 'Total debits', value: sum(rows, 'debit'), type: 'money' }, { key: 'credit', label: 'Total credits', value: sum(rows, 'credit'), type: 'money' }]);
  }

  private static async fixedAssetRegister(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT fa.id, fa.asset_code, fa.name, fa.asset_category, fa.purchase_date, fa.in_service_date,
              fa.status, fa.purchase_value, fa.residual_value, fa.useful_life_months,
              COALESCE(dep.accumulated_depreciation,0) AS accumulated_depreciation,
              (fa.purchase_value - COALESCE(dep.accumulated_depreciation,0)) AS net_book_value
         FROM fixed_assets fa
         LEFT JOIN (SELECT asset_id, SUM(depreciation_amount) AS accumulated_depreciation FROM fixed_asset_depreciation_entries WHERE organization_id=$1 AND posted_date <= $2 GROUP BY asset_id) dep ON dep.asset_id=fa.id
        WHERE fa.organization_id=$1 AND fa.purchase_date <= $2 AND ($3 = '' OR UPPER(fa.status)=UPPER($3)) ORDER BY fa.asset_code`,
      [orgId, dates.asOfDate, filter.status || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, purchase_date: dateOnly(row.purchase_date), in_service_date: dateOnly(row.in_service_date), purchase_value: number(row.purchase_value), residual_value: number(row.residual_value), accumulated_depreciation: number(row.accumulated_depreciation), net_book_value: number(row.net_book_value), useful_life_months: Number(row.useful_life_months), source_type: 'fixed_asset', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
    const output = baseResult('fixed_asset_register', 'Fixed Asset Register', 'Asset cost, accumulated depreciation and net book value.', 'POSTED_LEDGER', dates,
      [{ key: 'asset_code', label: 'Asset code', type: 'text' }, { key: 'name', label: 'Asset', type: 'text' }, { key: 'asset_category', label: 'Category', type: 'text' }, { key: 'purchase_date', label: 'Purchased', type: 'date' }, { key: 'status', label: 'Status', type: 'status' }, { key: 'purchase_value', label: 'Cost', type: 'money', align: 'right' }, { key: 'accumulated_depreciation', label: 'Accumulated depreciation', type: 'money', align: 'right' }, { key: 'net_book_value', label: 'Net book value', type: 'money', align: 'right' }], rows,
      [{ key: 'purchase_value', label: 'Asset cost', value: sum(rows, 'purchase_value'), type: 'money' }, { key: 'accumulated_depreciation', label: 'Accumulated depreciation', value: sum(rows, 'accumulated_depreciation'), type: 'money' }, { key: 'net_book_value', label: 'Net book value', value: sum(rows, 'net_book_value'), type: 'money' }]);
    output.period = { asOfDate: dates.asOfDate }; return output;
  }

  private static async activityLogs(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const exclusiveToDate = new Date(`${dates.toDate}T00:00:00Z`);
    exclusiveToDate.setUTCDate(exclusiveToDate.getUTCDate() + 1);
    const result = await db.query(
      `SELECT al.id, al.timestamp, COALESCE(u.full_name,u.email,al.user_id) AS user_name,
              al.action, al.entity_type, al.entity_id
         FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id
        WHERE al.organization_id=$1 AND al.timestamp >= $2 AND al.timestamp < $3
          AND ($4 = '' OR UPPER(al.action)=UPPER($4)) ORDER BY al.timestamp DESC LIMIT 5000`,
      [orgId, dates.fromDate, exclusiveToDate.toISOString(), filter.status || ''],
    );
    const rows = result.rows.map((row: any) => ({ ...row, timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp), source_type: 'audit', source_id: row.id })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('activity_logs', 'Activity Logs', 'Audited user and system activity for the selected period.', 'OPERATIONAL', dates,
      [{ key: 'timestamp', label: 'Time', type: 'text' }, { key: 'user_name', label: 'User', type: 'text' }, { key: 'action', label: 'Action', type: 'text' }, { key: 'entity_type', label: 'Entity', type: 'text' }, { key: 'entity_id', label: 'Record ID', type: 'text' }], rows,
      [{ key: 'events', label: 'Audit events', value: rows.length, type: 'number' }]);
  }

  private static async movementOfEquity(orgId: string, dates: ReturnType<typeof period>, filter: WorkspaceReportFilter) {
    const result = await db.query(
      `SELECT a.id, a.code AS account_code, a.name AS account_name,
              COALESCE(SUM(CASE WHEN je.date < $2 THEN jl.credit-jl.debit ELSE 0 END),0) AS opening_balance,
              COALESCE(SUM(CASE WHEN je.date >= $2 AND je.date <= $3 THEN jl.credit-jl.debit ELSE 0 END),0) AS movement,
              COALESCE(SUM(CASE WHEN je.date <= $3 THEN jl.credit-jl.debit ELSE 0 END),0) AS closing_balance
         FROM accounts a LEFT JOIN journal_lines jl ON jl.organization_id=a.organization_id AND jl.account_id=a.id
         LEFT JOIN journal_entries je ON je.organization_id=a.organization_id AND je.id=jl.journal_entry_id AND UPPER(COALESCE(je.status,''))='POSTED'
        WHERE a.organization_id=$1 AND UPPER(COALESCE(a.type,''))='EQUITY'
        GROUP BY a.id,a.code,a.name ORDER BY a.code,a.name`,
      [orgId, dates.fromDate, dates.toDate],
    );
    const rows = result.rows.map((row: any) => ({ ...row, opening_balance: number(row.opening_balance), movement: number(row.movement), closing_balance: number(row.closing_balance) })).filter((row: any) => includesSearch(row, filter.search));
    return baseResult('movement_of_equity', 'Movement of Equity', 'Opening equity, period movements and closing equity from posted journals.', 'POSTED_LEDGER', dates,
      [{ key: 'account_code', label: 'Code', type: 'text' }, { key: 'account_name', label: 'Equity account', type: 'text' }, { key: 'opening_balance', label: 'Opening balance', type: 'money', align: 'right' }, { key: 'movement', label: 'Movement', type: 'money', align: 'right' }, { key: 'closing_balance', label: 'Closing balance', type: 'money', align: 'right' }], rows,
      [{ key: 'opening_balance', label: 'Opening equity', value: sum(rows, 'opening_balance'), type: 'money' }, { key: 'movement', label: 'Net movement', value: sum(rows, 'movement'), type: 'money' }, { key: 'closing_balance', label: 'Closing equity', value: sum(rows, 'closing_balance'), type: 'money' }]);
  }
}
