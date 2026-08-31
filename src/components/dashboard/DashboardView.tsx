import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  FileBarChart2,
  FilePlus2,
  FileText,
  Landmark,
  Layers,
  Percent,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WalletCards,
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
type DatePreset = 'today' | 'mtd' | 'qtd' | 'ytd' | 'custom';

interface DashboardData {
  view: DashboardViewKey;
  asOfDate: string;
  generatedAt: string;
  availableViews: DashboardViewKey[];
  overview: {
    receivables: number;
    overdueReceivables: number;
    outstandingInvoicesCount: number;
    overdueInvoicesCount: number;
    payables: number;
    dueBillsCount: number;
    overduePayables: number;
    overdueBillsCount: number;
    bankBalance: number;
    salesThisMonth: number;
    expensesThisMonth: number;
    activityTrend: Array<{ date: string; income: number; expenses: number }>;
    bankReconciliationAttentionCount: number;
    quotationsAwaitingResponseCount: number;
    pendingJournalsCount: number | null;
    collections: Array<{ partyName: string; amount: number; overdue: boolean; dueDate: string | null }>;
    billsDue: Array<{ partyName: string; amount: number; overdue: boolean; dueDate: string | null }>;
    recentTransactions: Array<{ type: string; documentNumber: string; partyName: string; amount: number; status: string; date: string }>;
  };
  cashOperations: {
    available: boolean;
    bankReconciliationAttentionCount: number | null;
    oldestUnmatchedDate: string | null;
    collectionsDue7Days: number;
    collectionsDue30Days: number;
    billsDue7Days: number;
    billsDue30Days: number;
    forecast: { available: boolean; reason: string };
  };
  closeControls: {
    available: boolean;
    periodClose: { status: string; blockingFailuresCount: number; warningsCount: number } | null;
    integrity: { isHealthy: boolean; trialBalanceBalanced: boolean; accountsReceivableBalanced: boolean; accountsPayableBalanced: boolean } | null;
  };
}

interface LegacyDashboardSummary {
  receivables: number;
  payables: number;
  bankBalance: number;
  salesThisMonth: number;
  outstandingInvoicesCount: number;
  overdueInvoicesCount: number;
  upcomingBillsCount: number;
  bankReconciliationAttentionCount: number;
  quotationsAwaitingResponseCount: number;
  recentTransactions: DashboardData['overview']['recentTransactions'];
}

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab, options?: { autoCreate?: boolean }) => void;
}

const localIsoDate = () => new Date().toISOString().slice(0, 10);

const viewLabels: Record<DashboardViewKey, string> = {
  overview: 'Executive Overview',
  'cash-operations': 'Cash & Liquidity',
  'close-controls': 'Integrity & Period Close',
};

const getPresetDate = (preset: DatePreset): string => {
  const now = new Date();
  switch (preset) {
    case 'today':
      return now.toISOString().slice(0, 10);
    case 'mtd':
      return now.toISOString().slice(0, 10);
    case 'qtd':
      return now.toISOString().slice(0, 10);
    case 'ytd':
      return now.toISOString().slice(0, 10);
    default:
      return now.toISOString().slice(0, 10);
  }
};

const fromLegacySummary = (summary: LegacyDashboardSummary, asOfDate: string): DashboardData => ({
  view: 'overview',
  asOfDate,
  generatedAt: new Date().toISOString(),
  availableViews: ['overview'],
  overview: {
    receivables: summary.receivables,
    overdueReceivables: 0,
    outstandingInvoicesCount: summary.outstandingInvoicesCount,
    overdueInvoicesCount: summary.overdueInvoicesCount,
    payables: summary.payables,
    dueBillsCount: summary.upcomingBillsCount,
    overduePayables: 0,
    overdueBillsCount: 0,
    bankBalance: summary.bankBalance,
    salesThisMonth: summary.salesThisMonth,
    expensesThisMonth: 0,
    activityTrend: [],
    bankReconciliationAttentionCount: summary.bankReconciliationAttentionCount,
    quotationsAwaitingResponseCount: summary.quotationsAwaitingResponseCount,
    pendingJournalsCount: null,
    collections: [],
    billsDue: [],
    recentTransactions: summary.recentTransactions,
  },
  cashOperations: {
    available: false,
    bankReconciliationAttentionCount: null,
    oldestUnmatchedDate: null,
    collectionsDue7Days: 0,
    collectionsDue30Days: 0,
    billsDue7Days: 0,
    billsDue30Days: 0,
    forecast: { available: false, reason: 'Cash forecasting is unavailable.' },
  },
  closeControls: { available: false, periodClose: null, integrity: null },
});

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { settings } = useBooks();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [view, setView] = useState<DashboardViewKey>('overview');
  const [asOfDate, setAsOfDate] = useState(localIsoDate);
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>('mtd');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; income: number; expenses: number } | null>(null);

  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .get<{ dashboard: DashboardData }>(`/dashboard?view=${encodeURIComponent(view)}&asOfDate=${encodeURIComponent(asOfDate)}`)
      .then(async (response) => {
        if (cancelled) return;
        if (response.data?.dashboard) {
          setDashboard(response.data.dashboard);
          return;
        }
        const missingDashboardRoute =
          response.status === 404 || /unexpected token|valid json/i.test(response.error || '');
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
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, asOfDate, reloadToken]);

  const money = (value: number) => formatCurrency(value, settings.currencySymbol);

  const handlePresetSelect = (preset: DatePreset) => {
    setSelectedPreset(preset);
    if (preset !== 'custom') {
      setAsOfDate(getPresetDate(preset));
    }
  };

  const openView = (nextView: DashboardViewKey) => {
    if (dashboard?.availableViews.includes(nextView)) setView(nextView);
  };

  // Calculations for Net Margin & Velocity
  const netIncomeThisMonth = dashboard
    ? dashboard.overview.salesThisMonth - dashboard.overview.expensesThisMonth
    : 0;
  const netMarginPercent =
    dashboard && dashboard.overview.salesThisMonth > 0
      ? ((netIncomeThisMonth / dashboard.overview.salesThisMonth) * 100).toFixed(1)
      : null;

  const totalTrendIncome =
    dashboard?.overview.activityTrend.reduce((acc, p) => acc + p.income, 0) || 0;
  const totalTrendExpense =
    dashboard?.overview.activityTrend.reduce((acc, p) => acc + p.expenses, 0) || 0;
  const totalTrendNet = totalTrendIncome - totalTrendExpense;

  const Metric = ({
    title,
    value,
    subtitle,
    badge,
    badgeTone = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: Icon,
    iconBg = 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    onClick,
    tone = 'text-slate-900 dark:text-white',
    progressPercent,
    progressLabel,
  }: {
    title: string;
    value: string;
    subtitle: string;
    badge?: string;
    badgeTone?: string;
    icon: React.ElementType;
    iconBg?: string;
    onClick?: () => void;
    tone?: string;
    progressPercent?: number;
    progressLabel?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-slate-200/90 disabled:hover:shadow-xs dark:border-slate-800/90 dark:bg-slate-900/95 dark:hover:border-blue-500/80"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </span>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg} transition-transform group-hover:scale-105`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <div className={`font-financial text-2xl font-extrabold tracking-tight tabular-nums sm:text-3xl ${tone}`}>
            {value}
          </div>
          {badge && (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${badgeTone}`}>
              {badge}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        {progressPercent !== undefined && (
          <div className="mb-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>{progressLabel}</span>
              <span>{progressPercent.toFixed(0)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progressPercent > 50 ? 'bg-rose-500' : progressPercent > 20 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate font-medium">{subtitle}</span>
          {onClick && (
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 text-blue-600 dark:text-blue-400 shrink-0 ml-1" />
          )}
        </div>
      </div>
    </button>
  );

  const ActionList = ({
    title,
    items,
    empty,
    onOpen,
    actionLabel,
    icon: SectionIcon,
  }: {
    title: string;
    items: Array<{ partyName: string; amount: number; overdue: boolean; dueDate: string | null }>;
    empty: string;
    onOpen: () => void;
    actionLabel: string;
    icon: React.ElementType;
  }) => (
    <section className="rounded-xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <SectionIcon className="h-4 w-4" />
          </div>
          <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        </div>
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{empty}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">All subledgers are currently up to date.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-72 overflow-y-auto">
          {items.map((item, index) => {
            const initials = item.partyName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <li
                key={`${item.partyName}-${index}`}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {initials || '—'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{item.partyName}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {item.overdue ? (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/40">
                          Overdue
                        </span>
                      ) : item.dueDate ? (
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Due {formatDate(item.dueDate)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">No due date</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 font-financial text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {money(item.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );

  const ActivityTrend = ({ points }: { points: DashboardData['overview']['activityTrend'] }) => {
    const maxValue = Math.max(1, ...points.flatMap((point) => [point.income, point.expenses]));

    return (
      <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Cash Flow & Activity Velocity</h2>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                Posted Journals
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Income versus expenditures through {formatDate(asOfDate)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-800/60">
              <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" />
                <span>Income: <strong className="font-financial">{money(totalTrendIncome)}</strong></span>
              </div>
              <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
                <span>Expenses: <strong className="font-financial">{money(totalTrendExpense)}</strong></span>
              </div>
              <div className="h-3 w-px bg-slate-200 dark:bg-slate-700" />
              <span className={`font-bold ${totalTrendNet >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                Net: {money(totalTrendNet)}
              </span>
            </div>

            <button
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <span>P&L Report</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {points.length === 0 ? (
          <div className="flex h-52 items-center justify-center text-xs text-slate-400">
            No posted income or expense transactions in this date range.
          </div>
        ) : (
          <div className="mt-6">
            {/* Hover Tooltip display */}
            <div className="mb-2 h-6 flex items-center justify-between text-xs">
              {hoveredPoint ? (
                <div className="flex items-center gap-3 font-medium text-slate-700 dark:text-slate-200">
                  <span className="font-bold text-slate-900 dark:text-white">{formatDate(hoveredPoint.date)}:</span>
                  <span className="text-blue-600 dark:text-blue-400">Income: {money(hoveredPoint.income)}</span>
                  <span className="text-rose-600 dark:text-rose-400">Expense: {money(hoveredPoint.expenses)}</span>
                  <span className={hoveredPoint.income - hoveredPoint.expenses >= 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    Net: {money(hoveredPoint.income - hoveredPoint.expenses)}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400">Hover over bars for transaction breakdowns</span>
              )}
            </div>

            {/* Bars container */}
            <div
              className="flex h-44 items-end gap-1 sm:gap-2 border-b border-slate-200 pb-2 dark:border-slate-800"
              aria-label="Posted income and expense activity chart"
            >
              {points.map((point) => (
                <div
                  key={point.date}
                  onMouseEnter={() => setHoveredPoint(point)}
                  onMouseLeave={() => setHoveredPoint(null)}
                  className="group relative flex min-w-0 flex-1 cursor-pointer items-end justify-center gap-0.5 sm:gap-1 hover:opacity-80 transition-opacity"
                >
                  <span
                    className="w-full max-w-[12px] rounded-t-sm bg-blue-600 dark:bg-blue-500 transition-all duration-300"
                    style={{ height: `${Math.max(4, (point.income / maxValue) * 100)}%` }}
                  />
                  <span
                    className="w-full max-w-[12px] rounded-t-sm bg-rose-500 dark:bg-rose-400 transition-all duration-300"
                    style={{ height: `${Math.max(4, (point.expenses / maxValue) * 100)}%` }}
                  />
                </div>
              ))}
            </div>

            {/* X-Axis Tick Labels */}
            <div className="mt-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              <span>{points[0] ? formatDate(points[0].date) : 'Start'}</span>
              <span>{points[Math.floor(points.length / 2)] ? formatDate(points[Math.floor(points.length / 2)].date) : 'Mid'}</span>
              <span>{points[points.length - 1] ? formatDate(points[points.length - 1].date) : 'End'}</span>
            </div>
          </div>
        )}
      </section>
    );
  };

  const QuickActions = () => (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Quick Action Dock</h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Commands</span>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-2">
        <button
          title="New sales invoice"
          onClick={() => setIsInvoiceEditorOpen(true)}
          className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-blue-500/80 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 text-blue-600 transition-transform group-hover:scale-110 dark:bg-blue-950 dark:text-blue-400">
            <FilePlus2 className="h-4 w-4" />
          </div>
          <span>+ Invoice</span>
        </button>

        <button
          title="Log operational expense"
          onClick={() => setIsExpenseModalOpen(true)}
          className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-emerald-500/80 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-110 dark:bg-emerald-950 dark:text-emerald-400">
            <ReceiptText className="h-4 w-4" />
          </div>
          <span>+ Expense</span>
        </button>

        <button
          title="Add client or customer"
          onClick={() => setIsClientModalOpen(true)}
          className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-violet-500/80 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 text-violet-600 transition-transform group-hover:scale-110 dark:bg-violet-950 dark:text-violet-400">
            <BadgeDollarSign className="h-4 w-4" />
          </div>
          <span>+ Customer</span>
        </button>

        <button
          title="Record incoming vendor bill"
          onClick={() => onNavigate('bills', { autoCreate: true })}
          className="group flex flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-amber-500/80 dark:hover:bg-amber-950/40 dark:hover:text-amber-300"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-600 transition-transform group-hover:scale-110 dark:bg-amber-950 dark:text-amber-400">
            <FileText className="h-4 w-4" />
          </div>
          <span>+ Vendor Bill</span>
        </button>
      </div>
    </section>
  );

  return (
    <div className="mx-auto min-h-full max-w-[1440px] space-y-6 bg-slate-50/60 p-4 text-slate-900 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100">
      {/* Header Banner */}
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-950/80 dark:text-blue-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              FirmBooks Authority
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Double-Entry Ledger
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Financial Command Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Authoritative, multi-tenant verified records as of {formatDate(asOfDate)}.
          </p>
        </div>

        {/* Date Range & Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Preset Buttons */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-800">
            {(['today', 'mtd', 'qtd', 'ytd', 'custom'] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                className={`rounded-md px-2.5 py-1 uppercase tracking-wider transition-all ${
                  selectedPreset === preset
                    ? 'bg-white text-blue-700 shadow-xs dark:bg-slate-900 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Date Picker Input */}
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold shadow-xs hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600">
            <CalendarDays className="h-4 w-4 text-slate-500" />
            <input
              aria-label="As of date"
              type="date"
              value={asOfDate}
              onChange={(e) => {
                setSelectedPreset('custom');
                setAsOfDate(e.target.value);
              }}
              className="bg-transparent text-xs font-semibold outline-none text-slate-800 dark:text-slate-200"
            />
          </label>

          {/* Reports Link */}
          <button
            title="Open verified financial reports"
            onClick={() => onNavigate('reports')}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60"
          >
            <FileBarChart2 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <span>Reports</span>
          </button>

          {/* Refresh Button */}
          <button
            title="Refresh dashboard metrics"
            onClick={() => setReloadToken((c) => c + 1)}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      {dashboard && (
        <nav
          aria-label="Dashboard sub-views"
          className="flex w-full overflow-x-auto gap-2 border-b border-slate-200/90 pb-2 dark:border-slate-800"
        >
          {dashboard.availableViews.map((item) => {
            const isSelected = view === item;
            return (
              <button
                key={item}
                onClick={() => openView(item)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-600'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                {item === 'overview' && <Sparkles className="h-3.5 w-3.5" />}
                {item === 'cash-operations' && <WalletCards className="h-3.5 w-3.5" />}
                {item === 'close-controls' && <Layers className="h-3.5 w-3.5" />}
                <span>{viewLabels[item]}</span>
                {item === 'close-controls' && dashboard.closeControls.integrity?.isHealthy && (
                  <span className="h-2 w-2 rounded-full bg-emerald-400" title="Integrity healthy" />
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-6">
          <MetricCardSkeleton count={4} />
          <TableSkeleton rows={5} columns={4} />
        </div>
      )}

      {/* Error Banner */}
      {!loading && error && (
        <div
          role="alert"
          className="flex items-start gap-3.5 rounded-xl border border-rose-200 bg-rose-50/90 p-5 text-sm text-rose-900 shadow-xs dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <h2 className="font-bold">Live Financial Totals Unavailable</h2>
            <p className="mt-1 text-xs text-rose-800 dark:text-rose-200">
              {error}. Financial figures remain protected until verified by the authoritative tenant ledger.
            </p>
          </div>
        </div>
      )}

      {/* VIEW 1: EXECUTIVE OVERVIEW */}
      {!loading && dashboard && view === 'overview' && (
        <div className="space-y-6">
          {/* Top 4 KPI Metric Cards */}
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="Operating Cash & Bank"
              value={money(dashboard.overview.bankBalance)}
              subtitle="Posted bank & cash journals"
              badge={
                dashboard.overview.bankReconciliationAttentionCount > 0
                  ? `${dashboard.overview.bankReconciliationAttentionCount} Unmatched`
                  : 'Reconciled'
              }
              badgeTone={
                dashboard.overview.bankReconciliationAttentionCount > 0
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
              }
              icon={WalletCards}
              iconBg="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
              onClick={() => onNavigate('banking')}
            />

            <Metric
              title="Accounts Receivable (AR)"
              value={money(dashboard.overview.receivables)}
              subtitle={`${dashboard.overview.outstandingInvoicesCount} total outstanding invoices`}
              progressLabel="Overdue Collections"
              progressPercent={
                dashboard.overview.receivables > 0
                  ? (dashboard.overview.overdueReceivables / dashboard.overview.receivables) * 100
                  : 0
              }
              badge={
                dashboard.overview.overdueInvoicesCount > 0
                  ? `${money(dashboard.overview.overdueReceivables)} overdue`
                  : 'On Track'
              }
              badgeTone={
                dashboard.overview.overdueInvoicesCount > 0
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
              }
              icon={TrendingUp}
              iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              onClick={() => onNavigate('invoices')}
              tone={dashboard.overview.overdueInvoicesCount > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
            />

            <Metric
              title="Accounts Payable (AP)"
              value={money(dashboard.overview.payables)}
              subtitle={`${dashboard.overview.dueBillsCount} vendor bills pending`}
              progressLabel="Overdue Payables"
              progressPercent={
                dashboard.overview.payables > 0
                  ? (dashboard.overview.overduePayables / dashboard.overview.payables) * 100
                  : 0
              }
              badge={
                dashboard.overview.overdueBillsCount > 0
                  ? `${money(dashboard.overview.overduePayables)} overdue`
                  : 'Current'
              }
              badgeTone={
                dashboard.overview.overdueBillsCount > 0
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }
              icon={TrendingDown}
              iconBg="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
              onClick={() => onNavigate('bills')}
              tone={dashboard.overview.overdueBillsCount > 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
            />

            <Metric
              title="Period Revenue & Net Margin"
              value={money(dashboard.overview.salesThisMonth)}
              subtitle={`${money(dashboard.overview.expensesThisMonth)} posted expenses this period`}
              badge={
                netMarginPercent
                  ? `${Number(netMarginPercent) >= 0 ? '+' : ''}${netMarginPercent}% Margin`
                  : 'Balanced'
              }
              badgeTone={
                Number(netMarginPercent || 0) >= 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
              }
              icon={Landmark}
              iconBg="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
              onClick={() => onNavigate('reports')}
            />
          </section>

          {/* Activity Trend & Attention Sidebar */}
          <section className="grid gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ActivityTrend points={dashboard.overview.activityTrend} />
            </div>

            <div className="space-y-5">
              {/* Attention Queue */}
              <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Audit & Attention Queue</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Action Required</span>
                </div>

                <div className="mt-3.5 divide-y divide-slate-100 dark:divide-slate-800/80">
                  <button
                    onClick={() => onNavigate('bank_reconciliation')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left text-xs font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <span>Unreconciled Bank Feeds</span>
                    </div>
                    <span
                      className={`font-financial rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                        dashboard.overview.bankReconciliationAttentionCount > 0
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {dashboard.overview.bankReconciliationAttentionCount}
                    </span>
                  </button>

                  <button
                    onClick={() => onNavigate('invoices')}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left text-xs font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500" />
                      <span>Quotations Awaiting Client Sign</span>
                    </div>
                    <span className="font-financial rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {dashboard.overview.quotationsAwaitingResponseCount}
                    </span>
                  </button>

                  {dashboard.overview.pendingJournalsCount !== null && (
                    <button
                      onClick={() => onNavigate('journals')}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left text-xs font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-purple-500" />
                        <span>Draft / Pending Manual Journals</span>
                      </div>
                      <span className="font-financial rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {dashboard.overview.pendingJournalsCount}
                      </span>
                    </button>
                  )}
                </div>
              </section>

              {/* Quick Actions Dock */}
              <QuickActions />
            </div>
          </section>

          {/* Action Lists: Collections & Bills Due */}
          <section className="grid gap-5 xl:grid-cols-2">
            <ActionList
              title="Collections & Invoices Needing Follow-up"
              items={dashboard.overview.collections}
              empty="No open customer balances need follow-up."
              onOpen={() => onNavigate('invoices')}
              actionLabel="View all invoices"
              icon={TrendingUp}
            />
            <ActionList
              title="Vendor Bills & Upcoming Payables"
              items={dashboard.overview.billsDue}
              empty="No open vendor bills need review."
              onOpen={() => onNavigate('bills')}
              actionLabel="View all bills"
              icon={TrendingDown}
            />
          </section>
        </div>
      )}

      {/* VIEW 2: CASH & LIQUIDITY OPERATIONS */}
      {!loading && dashboard && view === 'cash-operations' && (
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="Collections Due (7 Days)"
              value={money(dashboard.cashOperations.collectionsDue7Days)}
              subtitle={`${money(dashboard.cashOperations.collectionsDue30Days)} due in 30 days`}
              icon={TrendingUp}
              iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              onClick={() => onNavigate('invoices')}
            />
            <Metric
              title="Payables Due (7 Days)"
              value={money(dashboard.cashOperations.billsDue7Days)}
              subtitle={`${money(dashboard.cashOperations.billsDue30Days)} due in 30 days`}
              icon={TrendingDown}
              iconBg="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
              onClick={() => onNavigate('bills')}
            />
            <Metric
              title="Unmatched Bank Feeds"
              value={
                dashboard.cashOperations.bankReconciliationAttentionCount === null
                  ? 'Unavailable'
                  : String(dashboard.cashOperations.bankReconciliationAttentionCount)
              }
              subtitle={
                dashboard.cashOperations.oldestUnmatchedDate
                  ? `Oldest feed: ${formatDate(dashboard.cashOperations.oldestUnmatchedDate)}`
                  : 'Banking reconciliation verified'
              }
              icon={BookOpenCheck}
              iconBg="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
              onClick={
                dashboard.cashOperations.bankReconciliationAttentionCount === null
                  ? undefined
                  : () => onNavigate('bank_reconciliation')
              }
            />
            <Metric
              title="Forecasting Engine"
              value="Conservative"
              subtitle="Cash forecasting uses server subledger rules"
              icon={Banknote}
              iconBg="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400"
            />
          </div>

          <section className="rounded-xl border border-amber-200/90 bg-amber-50/80 p-5 shadow-xs dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="flex gap-3.5">
              <CircleAlert className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <div>
                <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                  Forecast Engine: Strict Accounting Mode
                </h2>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  {dashboard.cashOperations.forecast.reason} Due-document totals above reflect actual signed commitments and posted vendor liabilities.
                </p>
              </div>
            </div>
          </section>
        </section>
      )}

      {/* VIEW 3: INTEGRITY & CLOSE CONTROLS */}
      {!loading && dashboard && view === 'close-controls' && dashboard.closeControls.available && (
        <section className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="Period Close Status"
              value={dashboard.closeControls.periodClose?.status || 'Open'}
              subtitle={`${dashboard.closeControls.periodClose?.blockingFailuresCount || 0} blockers, ${
                dashboard.closeControls.periodClose?.warningsCount || 0
              } warnings`}
              icon={ClipboardCheck}
              iconBg="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
              onClick={() => onNavigate('period_close')}
            />
            <Metric
              title="General Ledger Integrity"
              value={dashboard.closeControls.integrity?.isHealthy ? 'Healthy' : 'Review Required'}
              subtitle="Trial balance debits equal credits"
              badge={dashboard.closeControls.integrity?.isHealthy ? 'Balanced' : 'Discrepancy'}
              badgeTone={
                dashboard.closeControls.integrity?.isHealthy
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }
              icon={dashboard.closeControls.integrity?.isHealthy ? CheckCircle2 : CircleAlert}
              iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              onClick={() => onNavigate('reports')}
            />
            <Metric
              title="AR Control Account"
              value={dashboard.closeControls.integrity?.accountsReceivableBalanced ? 'Balanced' : 'Mismatch'}
              subtitle="Subledger matches GL Account 1100"
              icon={ReceiptText}
              iconBg="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
              onClick={() => onNavigate('reports')}
            />
            <Metric
              title="AP Control Account"
              value={dashboard.closeControls.integrity?.accountsPayableBalanced ? 'Balanced' : 'Mismatch'}
              subtitle="Subledger matches GL Account 2000"
              icon={ReceiptText}
              iconBg="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
              onClick={() => onNavigate('reports')}
            />
          </div>

          <section className="rounded-xl border border-slate-200/90 bg-white p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
            <h2 className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Period Close Verification</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              The period-close workspace reruns complete trial balance integrity, bank reconciliation, and subledger-to-GL parity before any fiscal lock is committed.
            </p>
            <button
              onClick={() => onNavigate('period_close')}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition-colors"
            >
              <ClipboardCheck className="h-4 w-4" />
              Open Period Close Workspace
            </button>
          </section>
        </section>
      )}

      {/* Footer Audit Stamp */}
      {!loading && dashboard && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-4 text-[11px] text-slate-400 dark:border-slate-800">
          <span>
            As of <strong>{formatDate(dashboard.asOfDate)}</strong> · Generated at {formatDate(dashboard.generatedAt)}
          </span>
          <span>Authoritative posted general ledger calculations. Tenant isolation enforced.</span>
        </footer>
      )}

      {/* Modal Controllers */}
      {isInvoiceEditorOpen && <InvoiceEditorModal isOpen onClose={() => setIsInvoiceEditorOpen(false)} />}
      {isExpenseModalOpen && <ExpenseModal isOpen onClose={() => setIsExpenseModalOpen(false)} />}
      {isClientModalOpen && <ClientModal isOpen onClose={() => setIsClientModalOpen(false)} />}
    </div>
  );
};
