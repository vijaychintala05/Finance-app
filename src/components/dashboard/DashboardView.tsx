import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BadgeDollarSign, Banknote, BookOpenCheck, CalendarDays,
  CheckCircle2, CircleAlert, ClipboardCheck, FileBarChart2, FilePlus2, Landmark,
  RefreshCw, ReceiptText, TrendingDown, TrendingUp, WalletCards,
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { ExpenseModal } from '../expenses/ExpenseModal';
import { ClientModal } from '../clients/ClientModal';
import { MetricCardSkeleton, TableSkeleton } from '../common/TableSkeleton';

type DashboardViewKey = 'overview' | 'cash-operations' | 'close-controls';

interface DashboardData {
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
    recentTransactions: Array<{ type: string; documentNumber: string; partyName: string; amount: number; status: string; date: string }>;
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

interface LegacyDashboardSummary {
  receivables: number; payables: number; bankBalance: number; salesThisMonth: number;
  outstandingInvoicesCount: number; overdueInvoicesCount: number; upcomingBillsCount: number;
  bankReconciliationAttentionCount: number; quotationsAwaitingResponseCount: number;
  recentTransactions: DashboardData['overview']['recentTransactions'];
}

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab, options?: { autoCreate?: boolean }) => void;
}

const localIsoDate = () => new Date().toISOString().slice(0, 10);
const viewLabels: Record<DashboardViewKey, string> = {
  overview: 'Overview', 'cash-operations': 'Cash operations', 'close-controls': 'Close & controls',
};

const fromLegacySummary = (summary: LegacyDashboardSummary, asOfDate: string): DashboardData => ({
  view: 'overview', asOfDate, generatedAt: new Date().toISOString(), availableViews: ['overview'],
  overview: {
    receivables: summary.receivables, overdueReceivables: 0,
    outstandingInvoicesCount: summary.outstandingInvoicesCount, overdueInvoicesCount: summary.overdueInvoicesCount,
    payables: summary.payables, dueBillsCount: summary.upcomingBillsCount, overduePayables: 0, overdueBillsCount: 0,
    bankBalance: summary.bankBalance, salesThisMonth: summary.salesThisMonth, expensesThisMonth: 0,
    activityTrend: [],
    bankReconciliationAttentionCount: summary.bankReconciliationAttentionCount,
    quotationsAwaitingResponseCount: summary.quotationsAwaitingResponseCount, pendingJournalsCount: null,
    collections: [], billsDue: [], recentTransactions: summary.recentTransactions,
  },
  cashOperations: { available: false, bankReconciliationAttentionCount: null, oldestUnmatchedDate: null, collectionsDue7Days: 0, collectionsDue30Days: 0, billsDue7Days: 0, billsDue30Days: 0, forecast: { available: false, reason: 'Cash forecasting is unavailable.' } },
  closeControls: { available: false, periodClose: null, integrity: null },
});

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { settings } = useBooks();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [view, setView] = useState<DashboardViewKey>('overview');
  const [asOfDate, setAsOfDate] = useState(localIsoDate);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient.get<{ dashboard: DashboardData }>(`/dashboard?view=${encodeURIComponent(view)}&asOfDate=${encodeURIComponent(asOfDate)}`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.data?.dashboard) {
          setDashboard(response.data.dashboard);
          return;
        }
        // A development API may still be running pre-dashboard-route code. Its
        // established summary endpoint remains authoritative and keeps the home
        // screen usable until that process is restarted.
        const missingDashboardRoute = response.status === 404
          || /unexpected token|valid json/i.test(response.error || '');
        if (missingDashboardRoute && view === 'overview') {
          const legacy = await apiClient.get<{ summary: LegacyDashboardSummary }>('/dashboard-summary');
          if (legacy.data?.summary) {
            setDashboard(fromLegacySummary(legacy.data.summary, asOfDate));
            return;
          }
          throw new Error(legacy.error || 'Dashboard returned no data');
        }
        throw new Error(response.error || 'Dashboard returned no data');
      })
      .catch((dashboardError) => {
        if (!cancelled) {
          setDashboard(null);
          setError(dashboardError instanceof Error ? dashboardError.message : 'Dashboard unavailable');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [view, asOfDate, reloadToken]);

  const money = (value: number) => formatCurrency(value, settings.currencySymbol);
  const openView = (nextView: DashboardViewKey) => {
    if (dashboard?.availableViews.includes(nextView)) setView(nextView);
  };

  const Metric = ({ title, value, detail, icon: Icon, onClick, tone = 'text-slate-900 dark:text-white' }: { title: string; value: string; detail: string; icon: React.ElementType; onClick?: () => void; tone?: string }) => (
    <button onClick={onClick} disabled={!onClick} className="min-h-35 rounded-lg border border-slate-200 bg-white p-4 text-left shadow-xs transition-colors hover:border-blue-300 hover:bg-blue-50/30 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white dark:border-slate-800 dark:bg-slate-900 dark:disabled:hover:border-slate-800 dark:disabled:hover:bg-slate-900">
      <div className="flex items-center justify-between gap-3"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</span><Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
      <div className={`mt-3 font-financial text-2xl font-bold ${tone}`}>{value}</div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </button>
  );

  const ActionList = ({ title, items, empty, onOpen, actionLabel }: { title: string; items: Array<{ partyName: string; amount: number; overdue: boolean; dueDate: string | null }>; empty: string; onOpen: () => void; actionLabel: string }) => (
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800"><h2 className="text-sm font-bold">{title}</h2><button onClick={onOpen} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400"><span>{actionLabel}</span><ArrowRight className="h-3.5 w-3.5" /></button></div>
      {items.length === 0 ? <p className="p-4 text-xs text-slate-500">{empty}</p> : <ul className="divide-y divide-slate-100 dark:divide-slate-800">{items.map((item, index) => <li key={`${item.partyName}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.partyName}</p><p className={item.overdue ? 'text-xs font-semibold text-rose-700 dark:text-rose-300' : 'text-xs text-slate-500'}>{item.overdue ? 'Overdue' : item.dueDate ? `Due ${formatDate(item.dueDate)}` : 'No due date'}</p></div><span className="shrink-0 font-financial text-sm font-bold">{money(item.amount)}</span></li>)}</ul>}
    </section>
  );

  const ActivityTrend = ({ points }: { points: DashboardData['overview']['activityTrend'] }) => {
    const maxValue = Math.max(1, ...points.flatMap((point) => [point.income, point.expenses]));
    return <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-bold">Income and expenses</h2><p className="mt-0.5 text-xs text-slate-500">Posted activity through {formatDate(asOfDate)}</p></div><button onClick={() => onNavigate('reports')} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-400">Open Profit and Loss <ArrowRight className="h-3.5 w-3.5" /></button></div>
      {points.length === 0 ? <p className="flex h-44 items-center justify-center text-xs text-slate-500">No posted income or expense activity in this period.</p> : <div className="mt-5 flex h-44 items-end gap-1.5 border-b border-slate-200 pb-5 dark:border-slate-800" aria-label="Posted income and expense activity chart">
        {points.map((point) => <div key={point.date} className="flex min-w-0 flex-1 items-end justify-center gap-0.5" title={`${formatDate(point.date)}: income ${money(point.income)}, expenses ${money(point.expenses)}`}><span className="w-2 max-w-4 rounded-t-sm bg-blue-600" style={{ height: `${Math.max(3, (point.income / maxValue) * 100)}%` }} /><span className="w-2 max-w-4 rounded-t-sm bg-rose-400" style={{ height: `${Math.max(3, (point.expenses / maxValue) * 100)}%` }} /></div>)}
      </div>}
      <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-blue-600" />Income</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-rose-400" />Expenses</span></div>
    </section>;
  };

  const QuickActions = () => <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-bold">Create</h2><div className="mt-3 grid grid-cols-3 gap-2"><button title="New invoice" onClick={() => setIsInvoiceEditorOpen(true)} className="flex min-h-18 flex-col items-center justify-center gap-1 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><FilePlus2 className="h-4 w-4 text-blue-600" />Invoice</button><button title="Log expense" onClick={() => setIsExpenseModalOpen(true)} className="flex min-h-18 flex-col items-center justify-center gap-1 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><ReceiptText className="h-4 w-4 text-emerald-600" />Expense</button><button title="New customer" onClick={() => setIsClientModalOpen(true)} className="flex min-h-18 flex-col items-center justify-center gap-1 rounded-md border border-slate-200 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"><BadgeDollarSign className="h-4 w-4 text-violet-600" />Customer</button></div></section>;

  return <div className="mx-auto min-h-full max-w-[1400px] space-y-5 bg-slate-50 p-3 text-slate-900 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">Financial command center</p><h1 className="mt-1 text-2xl font-bold">Make the next money decision clear.</h1><p className="mt-1 text-xs text-slate-500">Server-calculated, tenant-scoped ledger and subledger data.</p></div>
      <div className="flex flex-wrap items-center gap-2"><label className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"><CalendarDays className="h-4 w-4 text-slate-500" /><span className="sr-only">As of date</span><input aria-label="As of date" type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} className="bg-transparent outline-none" /></label><button title="Open verified reports" onClick={() => onNavigate('reports')} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"><FileBarChart2 className="h-4 w-4" />Reports</button><button title="Refresh dashboard" onClick={() => setReloadToken((current) => current + 1)} disabled={loading} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
    </header>

    {dashboard && <nav aria-label="Dashboard views" className="flex w-full overflow-x-auto border-b border-slate-200 dark:border-slate-800">{dashboard.availableViews.map((item) => <button key={item} onClick={() => openView(item)} className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold ${view === item ? 'border-blue-600 text-blue-700 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'}`}>{viewLabels[item]}</button>)}</nav>}

    {loading && <div className="space-y-5"><MetricCardSkeleton count={4} /><TableSkeleton rows={5} columns={4} /></div>}
    {!loading && error && <div role="alert" className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-bold">Live totals unavailable</h2><p className="mt-1 text-xs">{error}. Financial values stay hidden until the server can verify them.</p></div></div>}

    {!loading && dashboard && view === 'overview' && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric title="Cash and bank" value={money(dashboard.overview.bankBalance)} detail="Posted bank and cash journals" icon={WalletCards} onClick={() => onNavigate('banking')} /><Metric title="Get paid" value={money(dashboard.overview.receivables)} detail={`${money(dashboard.overview.overdueReceivables)} overdue`} icon={TrendingUp} onClick={() => onNavigate('invoices')} tone={dashboard.overview.overdueInvoicesCount > 0 ? 'text-rose-700 dark:text-rose-300' : undefined} /><Metric title="Pay deliberately" value={money(dashboard.overview.payables)} detail={`${money(dashboard.overview.overduePayables)} overdue`} icon={TrendingDown} onClick={() => onNavigate('bills')} tone={dashboard.overview.overdueBillsCount > 0 ? 'text-rose-700 dark:text-rose-300' : undefined} /><Metric title="Period income" value={money(dashboard.overview.salesThisMonth)} detail={`${money(dashboard.overview.expensesThisMonth)} posted expenses`} icon={Landmark} onClick={() => onNavigate('reports')} /></section>
      <section className="grid gap-4 xl:grid-cols-3"><div className="xl:col-span-2"><ActivityTrend points={dashboard.overview.activityTrend} /></div><div className="space-y-4"><section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-bold">Attention queue</h2><div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800"><button onClick={() => onNavigate('bank_reconciliation')} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm"><span>Unreconciled bank entries</span><strong className={dashboard.overview.bankReconciliationAttentionCount > 0 ? 'font-financial text-amber-700 dark:text-amber-300' : 'font-financial'}>{dashboard.overview.bankReconciliationAttentionCount}</strong></button><button onClick={() => onNavigate('invoices')} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm"><span>Quotations awaiting response</span><strong className="font-financial">{dashboard.overview.quotationsAwaitingResponseCount}</strong></button>{dashboard.overview.pendingJournalsCount !== null && <button onClick={() => onNavigate('journals')} className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm"><span>Draft or pending journals</span><strong className="font-financial">{dashboard.overview.pendingJournalsCount}</strong></button>}</div></section><QuickActions /></div></section>
      <section className="grid gap-4 xl:grid-cols-2"><ActionList title="Collections needing attention" items={dashboard.overview.collections} empty="No open customer balances need follow-up." onOpen={() => onNavigate('invoices')} actionLabel="Open invoices" /><ActionList title="Bills to review" items={dashboard.overview.billsDue} empty="No open vendor bills need review." onOpen={() => onNavigate('bills')} actionLabel="Open bills" /></section>
    </>}

    {!loading && dashboard && view === 'cash-operations' && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric title="Due to collect" value={money(dashboard.cashOperations.collectionsDue7Days)} detail={`${money(dashboard.cashOperations.collectionsDue30Days)} due in 30 days`} icon={TrendingUp} onClick={() => onNavigate('invoices')} /><Metric title="Due to pay" value={money(dashboard.cashOperations.billsDue7Days)} detail={`${money(dashboard.cashOperations.billsDue30Days)} due in 30 days`} icon={TrendingDown} onClick={() => onNavigate('bills')} /><Metric title="Unmatched banking" value={dashboard.cashOperations.bankReconciliationAttentionCount === null ? 'Unavailable' : String(dashboard.cashOperations.bankReconciliationAttentionCount)} detail={dashboard.cashOperations.oldestUnmatchedDate ? `Oldest: ${formatDate(dashboard.cashOperations.oldestUnmatchedDate)}` : 'Banking access required'} icon={BookOpenCheck} onClick={dashboard.cashOperations.bankReconciliationAttentionCount === null ? undefined : () => onNavigate('bank_reconciliation')} /><Metric title="Cash forecast" value="Not enabled" detail="Trusted forecast capability required" icon={Banknote} /></div><section className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><div className="flex gap-3"><CircleAlert className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" /><div><h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">Forecast intentionally unavailable</h2><p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{dashboard.cashOperations.forecast.reason} Due-document totals above are not a cash forecast.</p></div></div></section></section>}

    {!loading && dashboard && view === 'close-controls' && dashboard.closeControls.available && <section className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric title="Period close" value={dashboard.closeControls.periodClose?.status || 'Open'} detail={`${dashboard.closeControls.periodClose?.blockingFailuresCount || 0} blockers, ${dashboard.closeControls.periodClose?.warningsCount || 0} warnings`} icon={ClipboardCheck} onClick={() => onNavigate('period_close')} /><Metric title="Accounting health" value={dashboard.closeControls.integrity?.isHealthy ? 'Healthy' : 'Review required'} detail="Authoritative integrity verification" icon={dashboard.closeControls.integrity?.isHealthy ? CheckCircle2 : CircleAlert} onClick={() => onNavigate('reports')} /><Metric title="AR control" value={dashboard.closeControls.integrity?.accountsReceivableBalanced ? 'Balanced' : 'Mismatch'} detail="Subledger to control account" icon={ReceiptText} onClick={() => onNavigate('reports')} /><Metric title="AP control" value={dashboard.closeControls.integrity?.accountsPayableBalanced ? 'Balanced' : 'Mismatch'} detail="Subledger to control account" icon={ReceiptText} onClick={() => onNavigate('reports')} /></div><section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-bold">Close evidence</h2><p className="mt-1 text-xs text-slate-500">The period-close workspace reruns integrity and reconciliation checks before a period can be closed.</p><button onClick={() => onNavigate('period_close')} className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800"><ClipboardCheck className="h-4 w-4" />Open period close</button></section></section>}

    {!loading && dashboard && <footer className="text-xs text-slate-500">As of {formatDate(dashboard.asOfDate)}. Refreshed {formatDate(dashboard.generatedAt)}. Figures are server-calculated from posted journals and open subledgers.</footer>}
    {isInvoiceEditorOpen && <InvoiceEditorModal isOpen onClose={() => setIsInvoiceEditorOpen(false)} />}{isExpenseModalOpen && <ExpenseModal isOpen onClose={() => setIsExpenseModalOpen(false)} />}{isClientModalOpen && <ClientModal isOpen onClose={() => setIsClientModalOpen(false)} />}
  </div>;
};
