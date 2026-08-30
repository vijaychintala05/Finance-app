import { db } from '../database/db';
import { databaseMoney } from '../utils/money';
import { AccountingIntegrityService } from './AccountingIntegrityService';
import { PeriodCloseService } from './PeriodCloseService';

export type DashboardViewKey = 'overview' | 'cash-operations' | 'close-controls';

export interface DashboardSummaryData {
  receivables: number;
  payables: number;
  bankBalance: number;
  salesThisMonth: number;
  outstandingInvoicesCount: number;
  overdueInvoicesCount: number;
  upcomingBillsCount: number;
  bankReconciliationAttentionCount: number;
  quotationsAwaitingResponseCount: number;
  recentTransactions: Array<{ type: string; documentNumber: string; partyName: string; amount: number; status: string; date: string }>;
}

export interface DashboardResponse {
  view: DashboardViewKey;
  asOfDate: string;
  generatedAt: string;
  availableViews: DashboardViewKey[];
  overview: {
    receivables: number; overdueReceivables: number; outstandingInvoicesCount: number; overdueInvoicesCount: number;
    payables: number; dueBillsCount: number; overduePayables: number; overdueBillsCount: number;
    bankBalance: number; salesThisMonth: number; expensesThisMonth: number;
    activityTrend: Array<{ date: string; income: number; expenses: number }>;
    bankReconciliationAttentionCount: number; quotationsAwaitingResponseCount: number; pendingJournalsCount: number | null;
    collections: Array<{ partyName: string; amount: number; overdue: boolean; dueDate: string | null }>;
    billsDue: Array<{ partyName: string; amount: number; overdue: boolean; dueDate: string | null }>;
    recentTransactions: DashboardSummaryData['recentTransactions'];
  };
  cashOperations: {
    available: boolean; bankReconciliationAttentionCount: number | null; oldestUnmatchedDate: string | null;
    collectionsDue7Days: number; collectionsDue30Days: number; billsDue7Days: number; billsDue30Days: number;
    forecast: { available: boolean; reason: string };
  };
  closeControls: {
    available: boolean;
    periodClose: { status: string; blockingFailuresCount: number; warningsCount: number } | null;
    integrity: { isHealthy: boolean; trialBalanceBalanced: boolean; accountsReceivableBalanced: boolean; accountsPayableBalanced: boolean } | null;
  };
}

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const endOfMonth = (date: Date): string => isoDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
const addDays = (date: string, days: number): string => isoDate(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000));

export class DashboardSummaryService {
  public static async getDashboard(
    organizationId: string,
    permissions: string[],
    requestedView: string | undefined,
    requestedAsOfDate: string | undefined,
  ): Promise<DashboardResponse> {
    if (requestedView && !['overview', 'cash-operations', 'close-controls'].includes(requestedView)) {
      throw new Error('DASHBOARD_VIEW_INVALID: Unsupported dashboard view');
    }
    if (requestedAsOfDate && !isIsoDate(requestedAsOfDate)) {
      throw new Error('DASHBOARD_DATE_INVALID: asOfDate must use YYYY-MM-DD');
    }

    const view = (requestedView || 'overview') as DashboardViewKey;
    const asOfDate = requestedAsOfDate || isoDate(new Date());
    const asOf = new Date(`${asOfDate}T00:00:00Z`);
    const periodStart = `${asOfDate.slice(0, 7)}-01`;
    const periodEnd = endOfMonth(asOf);
    const has = (permission: string) => permissions.includes(permission);
    const canSeeBanking = has('banking.view');
    const canSeeAccounting = has('accounting.view');
    const canSeeControls = has('audit.view') && canSeeAccounting;
    const availableViews: DashboardViewKey[] = ['overview'];
    if (canSeeBanking || has('invoices.view') || has('purchases.view')) availableViews.push('cash-operations');
    if (canSeeControls) availableViews.push('close-controls');
    if (!availableViews.includes(view)) throw new Error('DASHBOARD_VIEW_FORBIDDEN: You are not authorized to view this dashboard');

    const [receivablesRes, payablesRes, bankRes, activityRes, activityTrendRes, collectionsRes, billsRes, bankQueueRes, quotationRes, journalRes, recentRes, dueWindowsRes] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(balance_due), 0) AS total, COUNT(*) FILTER (WHERE balance_due > 0) AS open_count,
          COALESCE(SUM(balance_due) FILTER (WHERE balance_due > 0 AND due_date < $2), 0) AS overdue_total,
          COUNT(*) FILTER (WHERE balance_due > 0 AND due_date < $2) AS overdue_count
        FROM invoices WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`, [organizationId, asOfDate]),
      db.query(`SELECT COALESCE(SUM(balance_due), 0) AS total,
          COALESCE(SUM(balance_due) FILTER (WHERE balance_due > 0 AND due_date < $2), 0) AS overdue_total,
          COUNT(*) FILTER (WHERE balance_due > 0 AND due_date < $2) AS overdue_count,
          COUNT(*) FILTER (WHERE balance_due > 0 AND due_date >= $2 AND due_date <= $3) AS due_count
        FROM bills WHERE organization_id = $1 AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT')`, [organizationId, asOfDate, addDays(asOfDate, 7)]),
      canSeeBanking ? db.query(`SELECT COALESCE(SUM(CASE WHEN UPPER(a.type) = 'ASSET' THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END), 0) AS total
        FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
        JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'
        WHERE a.organization_id = $1 AND UPPER(a.type) = 'ASSET'
          AND (UPPER(a.sub_type) IN ('BANK', 'CASH', 'CASH & BANK') OR UPPER(a.name) LIKE '%BANK%' OR UPPER(a.name) LIKE '%CASH%')`, [organizationId]) : Promise.resolve({ rows: [{ total: 0 }] }),
      db.query(`SELECT COALESCE(SUM(CASE WHEN UPPER(a.type) IN ('INCOME', 'REVENUE', 'OTHER INCOME') THEN jl.credit - jl.debit ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN UPPER(a.type) IN ('EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE') THEN jl.debit - jl.credit ELSE 0 END), 0) AS expenses
        FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
        JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'
        WHERE a.organization_id = $1 AND je.date >= $2 AND je.date <= $3`, [organizationId, periodStart, asOfDate]),
      db.query(`SELECT je.date AS activity_date, a.type AS account_type, jl.debit, jl.credit
        FROM accounts a JOIN journal_lines jl ON jl.account_id = a.id
        JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'
        WHERE a.organization_id = $1 AND je.date >= $2 AND je.date <= $3
          AND UPPER(a.type) IN ('INCOME', 'REVENUE', 'OTHER INCOME', 'EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE')
        ORDER BY je.date ASC`, [organizationId, periodStart, asOfDate]),
      has('invoices.view') ? db.query(`SELECT COALESCE(client_name, 'Unassigned customer') AS party_name, balance_due, due_date
        FROM invoices WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND balance_due > 0
        ORDER BY CASE WHEN due_date < $2 THEN 0 ELSE 1 END, balance_due DESC, due_date ASC NULLS LAST LIMIT 5`, [organizationId, asOfDate]) : Promise.resolve({ rows: [] }),
      has('purchases.view') ? db.query(`SELECT COALESCE(vendor_name, 'Unassigned vendor') AS party_name, balance_due, due_date
        FROM bills WHERE organization_id = $1 AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT') AND balance_due > 0
        ORDER BY CASE WHEN due_date < $2 THEN 0 ELSE 1 END, due_date ASC NULLS LAST, balance_due DESC LIMIT 5`, [organizationId, asOfDate]) : Promise.resolve({ rows: [] }),
      canSeeBanking ? db.query(`SELECT COUNT(*) AS count, MIN(transaction_date) AS oldest_date
        FROM bank_statement_transactions WHERE organization_id = $1 AND reconciliation_status = 'UNMATCHED'`, [organizationId]) : Promise.resolve({ rows: [{ count: 0, oldest_date: null }] }),
      has('invoices.view') ? db.query(`SELECT COUNT(*) AS count FROM estimates WHERE organization_id = $1 AND status IN ('SENT', 'VIEWED', 'DRAFT')`, [organizationId]) : Promise.resolve({ rows: [{ count: 0 }] }),
      canSeeAccounting ? db.query(`SELECT COUNT(*) AS count FROM journal_entries WHERE organization_id = $1 AND UPPER(status) IN ('DRAFT', 'SUBMITTED', 'PENDING')`, [organizationId]) : Promise.resolve({ rows: [{ count: 0 }] }),
      db.query(`SELECT 'Invoice' AS type, invoice_number AS doc_num, client_name AS party_name, total_amount AS amount, status, issue_date AS doc_date
          FROM invoices WHERE organization_id = $1
        UNION ALL
        SELECT 'Bill' AS type, bill_number AS doc_num, vendor_name AS party_name, total_amount AS amount, status, bill_date AS doc_date
          FROM bills WHERE organization_id = $1
        ORDER BY doc_date DESC NULLS LAST LIMIT 5`, [organizationId]),
      db.query(`SELECT
          COALESCE(SUM(balance_due) FILTER (WHERE kind = 'invoice' AND due_date >= $2 AND due_date <= $3), 0) AS collections_7,
          COALESCE(SUM(balance_due) FILTER (WHERE kind = 'invoice' AND due_date >= $2 AND due_date <= $4), 0) AS collections_30,
          COALESCE(SUM(balance_due) FILTER (WHERE kind = 'bill' AND due_date >= $2 AND due_date <= $3), 0) AS bills_7,
          COALESCE(SUM(balance_due) FILTER (WHERE kind = 'bill' AND due_date >= $2 AND due_date <= $4), 0) AS bills_30
        FROM (
          SELECT 'invoice' AS kind, balance_due, due_date FROM invoices WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND balance_due > 0
          UNION ALL
          SELECT 'bill' AS kind, balance_due, due_date FROM bills WHERE organization_id = $1 AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT') AND balance_due > 0
        ) documents`, [organizationId, asOfDate, addDays(asOfDate, 7), addDays(asOfDate, 30)]),
    ]);

    const receivables = databaseMoney(receivablesRes.rows[0]?.total, 'Dashboard receivables');
    const payables = databaseMoney(payablesRes.rows[0]?.total, 'Dashboard payables');
    const bankBalance = databaseMoney(bankRes.rows[0]?.total, 'Dashboard bank balance');
    const activityTrendByDate = new Map<string, { date: string; income: number; expenses: number }>();
    for (const row of activityTrendRes.rows) {
      const date = String(row.activity_date).slice(0, 10);
      const point = activityTrendByDate.get(date) || { date, income: 0, expenses: 0 };
      const type = String(row.account_type || '').toUpperCase();
      if (['INCOME', 'REVENUE', 'OTHER INCOME'].includes(type)) {
        point.income += databaseMoney(Number(row.credit || 0) - Number(row.debit || 0), `Dashboard activity income for ${date}`);
      } else {
        point.expenses += databaseMoney(Number(row.debit || 0) - Number(row.credit || 0), `Dashboard activity expense for ${date}`);
      }
      activityTrendByDate.set(date, point);
    }
    const activityTrend = Array.from(activityTrendByDate.values());
    const overview = {
      receivables, overdueReceivables: databaseMoney(receivablesRes.rows[0]?.overdue_total, 'Dashboard overdue receivables'),
      outstandingInvoicesCount: Number(receivablesRes.rows[0]?.open_count || 0), overdueInvoicesCount: Number(receivablesRes.rows[0]?.overdue_count || 0),
      payables, dueBillsCount: Number(payablesRes.rows[0]?.due_count || 0),
      overduePayables: databaseMoney(payablesRes.rows[0]?.overdue_total, 'Dashboard overdue payables'), overdueBillsCount: Number(payablesRes.rows[0]?.overdue_count || 0),
      bankBalance, salesThisMonth: databaseMoney(activityRes.rows[0]?.income, 'Dashboard monthly income'), expensesThisMonth: databaseMoney(activityRes.rows[0]?.expenses, 'Dashboard monthly expenses'), activityTrend,
      bankReconciliationAttentionCount: Number(bankQueueRes.rows[0]?.count || 0), quotationsAwaitingResponseCount: Number(quotationRes.rows[0]?.count || 0), pendingJournalsCount: canSeeAccounting ? Number(journalRes.rows[0]?.count || 0) : null,
      collections: collectionsRes.rows.map((row: any) => ({ partyName: row.party_name, amount: databaseMoney(row.balance_due, 'Dashboard collection amount'), overdue: Boolean(row.due_date && String(row.due_date).slice(0, 10) < asOfDate), dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null })),
      billsDue: billsRes.rows.map((row: any) => ({ partyName: row.party_name, amount: databaseMoney(row.balance_due, 'Dashboard bill amount'), overdue: Boolean(row.due_date && String(row.due_date).slice(0, 10) < asOfDate), dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null })),
      recentTransactions: recentRes.rows.map((row: any) => ({ type: row.type, documentNumber: row.doc_num, partyName: row.party_name, amount: databaseMoney(row.amount, `Dashboard amount for ${row.doc_num}`), status: row.status, date: row.doc_date })),
    };

    let closeControls: DashboardResponse['closeControls'] = { available: false, periodClose: null, integrity: null };
    if (canSeeControls) {
      const [integrity, closeStatus] = await Promise.all([AccountingIntegrityService.verifyOrganizationIntegrity(organizationId), PeriodCloseService.validatePeriodClose(organizationId, asOfDate.slice(0, 7), periodStart, periodEnd)]);
      closeControls = { available: true, periodClose: { status: closeStatus.status, blockingFailuresCount: closeStatus.blockingFailuresCount, warningsCount: closeStatus.warningsCount }, integrity: { isHealthy: integrity.isHealthy, trialBalanceBalanced: integrity.checks.trialBalance.isBalanced, accountsReceivableBalanced: integrity.checks.accountsReceivable.isBalanced, accountsPayableBalanced: integrity.checks.accountsPayable.isBalanced } };
    }

    return { view, asOfDate, generatedAt: new Date().toISOString(), availableViews, overview,
      cashOperations: { available: availableViews.includes('cash-operations'), bankReconciliationAttentionCount: canSeeBanking ? overview.bankReconciliationAttentionCount : null, oldestUnmatchedDate: canSeeBanking && bankQueueRes.rows[0]?.oldest_date ? String(bankQueueRes.rows[0].oldest_date).slice(0, 10) : null, collectionsDue7Days: databaseMoney(dueWindowsRes.rows[0]?.collections_7, 'Dashboard collections due in seven days'), collectionsDue30Days: databaseMoney(dueWindowsRes.rows[0]?.collections_30, 'Dashboard collections due in thirty days'), billsDue7Days: databaseMoney(dueWindowsRes.rows[0]?.bills_7, 'Dashboard bills due in seven days'), billsDue30Days: databaseMoney(dueWindowsRes.rows[0]?.bills_30, 'Dashboard bills due in thirty days'), forecast: { available: false, reason: 'Cash forecasting is unavailable until its trusted finance capability is certified and enabled.' } }, closeControls };
  }

  /** Compatibility response for existing callers while the dashboard migrates. */
  public static async getSummary(organizationId: string): Promise<DashboardSummaryData> {
    const dashboard = await this.getDashboard(organizationId, ['reports.view', 'invoices.view', 'purchases.view', 'banking.view', 'accounting.view'], 'overview', undefined);
    const { overview } = dashboard;
    return { receivables: overview.receivables, payables: overview.payables, bankBalance: overview.bankBalance, salesThisMonth: overview.salesThisMonth, outstandingInvoicesCount: overview.outstandingInvoicesCount, overdueInvoicesCount: overview.overdueInvoicesCount, upcomingBillsCount: overview.dueBillsCount, bankReconciliationAttentionCount: overview.bankReconciliationAttentionCount, quotationsAwaitingResponseCount: overview.quotationsAwaitingResponseCount, recentTransactions: overview.recentTransactions };
  }
}
