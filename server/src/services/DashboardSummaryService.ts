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
  commandCenter: {
    period: { start: string; end: string; label: string };
    financialPosition: { cashAtBank: number; toCollect: number; toPay: number };
    performance: {
      revenue: number; expenses: number; net: number; marginPercent: number | null;
      cashMovement: Array<{ date: string; income: number; expenses: number }>;
    };
    scheduledCashOutlook: { windowDays: 30; collections: number; bills: number; net: number };
    attention: Array<{
      id: 'overdue-receivables' | 'overdue-payables' | 'bank-reconciliation' | 'pending-journals' | 'quotations';
      severity: 'critical' | 'due-soon' | 'healthy'; label: string; count: number; amount: number | null;
      destination: 'invoices' | 'bills' | 'bank_reconciliation' | 'journals';
    }>;
    insights: {
      topExpenses: Array<{ name: string; amount: number }>;
      bankAccounts: Array<{ name: string; balance: number }>;
    };
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
    const canSeeAccounting = has('accounting.view') || has('journals.view') || has('periods.view');
    const canSeeControls = (has('audit.view') || has('periods.close') || has('periods.lock') || has('settings.close_period')) && canSeeAccounting;
    const availableViews: DashboardViewKey[] = ['overview'];
    if (canSeeBanking || has('invoices.view') || has('purchases.view')) availableViews.push('cash-operations');
    if (canSeeControls) availableViews.push('close-controls');
    if (!availableViews.includes(view)) throw new Error('DASHBOARD_VIEW_FORBIDDEN: You are not authorized to view this dashboard');

    const [documentsRes, bankRes, activityTrendRes, collectionsRes, billsRes, bankQueueRes, quotationRes, journalRes, recentRes, topExpensesRes] = await Promise.all([
      db.query(`WITH documents AS (
          SELECT 'invoice' AS kind, balance_due, due_date, issue_date AS document_date
            FROM invoices
           WHERE organization_id = $1 AND issue_date <= $2
             AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')
          UNION ALL
          SELECT 'bill' AS kind, balance_due, due_date, bill_date AS document_date
            FROM bills
           WHERE organization_id = $1 AND bill_date <= $2
             AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT')
        )
        SELECT
          COALESCE(SUM(CASE WHEN kind = 'invoice' THEN balance_due ELSE 0 END), 0) AS receivables_total,
          COALESCE(SUM(CASE WHEN kind = 'invoice' AND balance_due > 0 THEN 1 ELSE 0 END), 0) AS invoice_open_count,
          COALESCE(SUM(CASE WHEN kind = 'invoice' AND balance_due > 0 AND due_date < $2 THEN balance_due ELSE 0 END), 0) AS receivables_overdue_total,
          COALESCE(SUM(CASE WHEN kind = 'invoice' AND balance_due > 0 AND due_date < $2 THEN 1 ELSE 0 END), 0) AS invoice_overdue_count,
          COALESCE(SUM(CASE WHEN kind = 'bill' THEN balance_due ELSE 0 END), 0) AS payables_total,
          COALESCE(SUM(CASE WHEN kind = 'bill' AND balance_due > 0 AND due_date < $2 THEN balance_due ELSE 0 END), 0) AS payables_overdue_total,
          COALESCE(SUM(CASE WHEN kind = 'bill' AND balance_due > 0 AND due_date < $2 THEN 1 ELSE 0 END), 0) AS bill_overdue_count,
          COALESCE(SUM(CASE WHEN kind = 'bill' AND balance_due > 0 AND due_date >= $2 AND due_date <= $3 THEN 1 ELSE 0 END), 0) AS bill_due_count,
          COALESCE(SUM(CASE WHEN kind = 'invoice' AND balance_due > 0 AND due_date >= $2 AND due_date <= $3 THEN balance_due ELSE 0 END), 0) AS collections_7,
          COALESCE(SUM(CASE WHEN kind = 'bill' AND balance_due > 0 AND due_date >= $2 AND due_date <= $3 THEN balance_due ELSE 0 END), 0) AS bills_7,
          COALESCE(SUM(CASE WHEN kind = 'invoice' AND balance_due > 0 AND due_date >= $2 AND due_date <= $4 THEN balance_due ELSE 0 END), 0) AS collections_30,
          COALESCE(SUM(CASE WHEN kind = 'bill' AND balance_due > 0 AND due_date >= $2 AND due_date <= $4 THEN balance_due ELSE 0 END), 0) AS bills_30
        FROM documents`, [organizationId, asOfDate, addDays(asOfDate, 7), addDays(asOfDate, 30)]),
      canSeeBanking ? db.query(`SELECT a.name, COALESCE(SUM(jl.debit - jl.credit), 0) AS balance
        FROM accounts a
        JOIN journal_lines jl ON jl.account_id = a.id AND jl.organization_id = a.organization_id
        JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id
          AND UPPER(je.status) = 'POSTED' AND je.date <= $2
        WHERE a.organization_id = $1 AND UPPER(a.type) = 'ASSET'
          AND (UPPER(a.sub_type) IN ('BANK', 'CASH', 'CASH & BANK') OR UPPER(a.name) LIKE '%BANK%' OR UPPER(a.name) LIKE '%CASH%')
        GROUP BY a.id, a.name
        ORDER BY balance DESC, a.name ASC`, [organizationId, asOfDate]) : Promise.resolve({ rows: [] }),
      db.query(`SELECT je.date AS activity_date,
          COALESCE(SUM(CASE WHEN UPPER(a.type) IN ('INCOME', 'REVENUE', 'OTHER INCOME') THEN jl.credit - jl.debit ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN UPPER(a.type) IN ('EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE') THEN jl.debit - jl.credit ELSE 0 END), 0) AS expenses
        FROM accounts a
        JOIN journal_lines jl ON jl.account_id = a.id AND jl.organization_id = a.organization_id
        JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id
          AND UPPER(je.status) = 'POSTED'
        WHERE a.organization_id = $1 AND je.date >= $2 AND je.date <= $3
          AND UPPER(a.type) IN ('INCOME', 'REVENUE', 'OTHER INCOME', 'EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE')
        GROUP BY je.date
        ORDER BY je.date ASC`, [organizationId, periodStart, asOfDate]),
      has('invoices.view') ? db.query(`SELECT COALESCE(client_name, 'Unassigned customer') AS party_name, balance_due, due_date
        FROM invoices WHERE organization_id = $1 AND issue_date <= $2
          AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND balance_due > 0
        ORDER BY CASE WHEN due_date < $2 THEN 0 ELSE 1 END, balance_due DESC, due_date ASC NULLS LAST LIMIT 5`, [organizationId, asOfDate]) : Promise.resolve({ rows: [] }),
      has('purchases.view') ? db.query(`SELECT COALESCE(vendor_name, 'Unassigned vendor') AS party_name, balance_due, due_date
        FROM bills WHERE organization_id = $1 AND bill_date <= $2
          AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT') AND balance_due > 0
        ORDER BY CASE WHEN due_date < $2 THEN 0 ELSE 1 END, due_date ASC NULLS LAST, balance_due DESC LIMIT 5`, [organizationId, asOfDate]) : Promise.resolve({ rows: [] }),
      canSeeBanking ? db.query(`SELECT COUNT(*) AS count, MIN(transaction_date) AS oldest_date
        FROM bank_statement_transactions WHERE organization_id = $1 AND reconciliation_status = 'UNMATCHED'`, [organizationId]) : Promise.resolve({ rows: [{ count: 0, oldest_date: null }] }),
      has('invoices.view') ? db.query(`SELECT COUNT(*) AS count FROM estimates WHERE organization_id = $1 AND status IN ('SENT', 'VIEWED', 'DRAFT')`, [organizationId]) : Promise.resolve({ rows: [{ count: 0 }] }),
      canSeeAccounting ? db.query(`SELECT COUNT(*) AS count FROM journal_entries WHERE organization_id = $1 AND UPPER(status) IN ('DRAFT', 'SUBMITTED', 'PENDING')`, [organizationId]) : Promise.resolve({ rows: [{ count: 0 }] }),
      db.query(`SELECT 'Invoice' AS type, invoice_number AS doc_num, client_name AS party_name, total_amount AS amount, status, issue_date AS doc_date
          FROM invoices WHERE organization_id = $1 AND issue_date <= $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')
        UNION ALL
        SELECT 'Bill' AS type, bill_number AS doc_num, vendor_name AS party_name, total_amount AS amount, status, bill_date AS doc_date
          FROM bills WHERE organization_id = $1 AND bill_date <= $2 AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT')
        ORDER BY doc_date DESC NULLS LAST LIMIT 5`, [organizationId, asOfDate]),
      db.query(`SELECT a.name, COALESCE(SUM(jl.debit - jl.credit), 0) AS amount
        FROM accounts a
        JOIN journal_lines jl ON jl.account_id = a.id AND jl.organization_id = a.organization_id
        JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id
          AND UPPER(je.status) = 'POSTED'
        WHERE a.organization_id = $1 AND je.date >= $2 AND je.date <= $3
          AND UPPER(a.type) IN ('EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE')
        GROUP BY a.id, a.name
        ORDER BY amount DESC, a.name ASC
        LIMIT 5`, [organizationId, periodStart, asOfDate]),
    ]);

    const documents = documentsRes.rows[0] || {};
    const receivables = databaseMoney(documents.receivables_total, 'Dashboard receivables');
    const payables = databaseMoney(documents.payables_total, 'Dashboard payables');
    const bankAccounts = bankRes.rows.map((row: any) => ({ name: String(row.name), balance: databaseMoney(row.balance, `Dashboard bank balance for ${row.name}`) }));
    const bankBalance = bankAccounts.reduce((total, account) => total + account.balance, 0);
    const activityTrend = activityTrendRes.rows.map((row: any) => ({
      date: String(row.activity_date).slice(0, 10),
      income: databaseMoney(row.income, `Dashboard activity income for ${row.activity_date}`),
      expenses: databaseMoney(row.expenses, `Dashboard activity expense for ${row.activity_date}`),
    }));
    const salesThisMonth = activityTrend.reduce((total, point) => total + point.income, 0);
    const expensesThisMonth = activityTrend.reduce((total, point) => total + point.expenses, 0);
    const overview = {
      receivables, overdueReceivables: databaseMoney(documents.receivables_overdue_total, 'Dashboard overdue receivables'),
      outstandingInvoicesCount: Number(documents.invoice_open_count || 0), overdueInvoicesCount: Number(documents.invoice_overdue_count || 0),
      payables, dueBillsCount: Number(documents.bill_due_count || 0),
      overduePayables: databaseMoney(documents.payables_overdue_total, 'Dashboard overdue payables'), overdueBillsCount: Number(documents.bill_overdue_count || 0),
      bankBalance, salesThisMonth, expensesThisMonth, activityTrend,
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

    const collectionsDue30Days = databaseMoney(documents.collections_30, 'Dashboard collections due in thirty days');
    const billsDue30Days = databaseMoney(documents.bills_30, 'Dashboard bills due in thirty days');
    const attention: DashboardResponse['commandCenter']['attention'] = [
      { id: 'overdue-receivables', severity: overview.overdueInvoicesCount > 0 ? 'critical' : 'healthy', label: 'Overdue customer invoices', count: overview.overdueInvoicesCount, amount: overview.overdueReceivables || null, destination: 'invoices' },
      { id: 'overdue-payables', severity: overview.overdueBillsCount > 0 ? 'critical' : 'healthy', label: 'Overdue vendor bills', count: overview.overdueBillsCount, amount: overview.overduePayables || null, destination: 'bills' },
      ...(canSeeBanking ? [{ id: 'bank-reconciliation' as const, severity: overview.bankReconciliationAttentionCount > 0 ? 'due-soon' as const : 'healthy' as const, label: 'Unreconciled bank transactions', count: overview.bankReconciliationAttentionCount, amount: null, destination: 'bank_reconciliation' as const }] : []),
      ...(overview.pendingJournalsCount !== null ? [{ id: 'pending-journals' as const, severity: overview.pendingJournalsCount > 0 ? 'due-soon' as const : 'healthy' as const, label: 'Draft or pending journals', count: overview.pendingJournalsCount, amount: null, destination: 'journals' as const }] : []),
      ...(has('invoices.view') ? [{ id: 'quotations' as const, severity: overview.quotationsAwaitingResponseCount > 0 ? 'due-soon' as const : 'healthy' as const, label: 'Quotations awaiting response', count: overview.quotationsAwaitingResponseCount, amount: null, destination: 'invoices' as const }] : []),
    ];
    const commandCenter: DashboardResponse['commandCenter'] = {
      period: { start: periodStart, end: asOfDate, label: `${periodStart} to ${asOfDate}` },
      financialPosition: { cashAtBank: bankBalance, toCollect: receivables, toPay: payables },
      performance: { revenue: salesThisMonth, expenses: expensesThisMonth, net: salesThisMonth - expensesThisMonth, marginPercent: salesThisMonth > 0 ? Number((((salesThisMonth - expensesThisMonth) / salesThisMonth) * 100).toFixed(1)) : null, cashMovement: activityTrend },
      scheduledCashOutlook: { windowDays: 30, collections: collectionsDue30Days, bills: billsDue30Days, net: collectionsDue30Days - billsDue30Days },
      attention,
      insights: { topExpenses: topExpensesRes.rows.map((row: any) => ({ name: String(row.name), amount: databaseMoney(row.amount, `Dashboard top expense for ${row.name}`) })), bankAccounts: bankAccounts.slice(0, 5) },
    };

    return { view, asOfDate, generatedAt: new Date().toISOString(), availableViews, overview,
      cashOperations: { available: availableViews.includes('cash-operations'), bankReconciliationAttentionCount: canSeeBanking ? overview.bankReconciliationAttentionCount : null, oldestUnmatchedDate: canSeeBanking && bankQueueRes.rows[0]?.oldest_date ? String(bankQueueRes.rows[0].oldest_date).slice(0, 10) : null, collectionsDue7Days: databaseMoney(documents.collections_7, 'Dashboard collections due in seven days'), collectionsDue30Days, billsDue7Days: databaseMoney(documents.bills_7, 'Dashboard bills due in seven days'), billsDue30Days, forecast: { available: false, reason: 'Cash forecasting is unavailable until its trusted finance capability is certified and enabled.' } }, closeControls, commandCenter };
  }

  /** Compatibility response for existing callers while the dashboard migrates. */
  public static async getSummary(organizationId: string): Promise<DashboardSummaryData> {
    const dashboard = await this.getDashboard(organizationId, ['reports.view', 'invoices.view', 'purchases.view', 'banking.view', 'accounting.view'], 'overview', undefined);
    const { overview } = dashboard;
    return { receivables: overview.receivables, payables: overview.payables, bankBalance: overview.bankBalance, salesThisMonth: overview.salesThisMonth, outstandingInvoicesCount: overview.outstandingInvoicesCount, overdueInvoicesCount: overview.overdueInvoicesCount, upcomingBillsCount: overview.dueBillsCount, bankReconciliationAttentionCount: overview.bankReconciliationAttentionCount, quotationsAwaitingResponseCount: overview.quotationsAwaitingResponseCount, recentTransactions: overview.recentTransactions };
  }
}
