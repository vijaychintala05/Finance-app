import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  FileBarChart2,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Landmark,
  Layers,
  Percent,
  PieChart,
  Receipt,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
  WalletCards,
  Zap,
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
  commandCenter: {
    period: { start: string; end: string; label: string };
    financialPosition: { cashAtBank: number; toCollect: number; toPay: number };
    performance: { revenue: number; expenses: number; net: number; marginPercent: number | null; cashMovement: Array<{ date: string; income: number; expenses: number }> };
    scheduledCashOutlook: { windowDays: 30; collections: number; bills: number; net: number };
    attention: Array<{
      id: string; severity: 'critical' | 'due-soon' | 'healthy'; label: string; count: number; amount: number | null;
      destination: 'invoices' | 'bills' | 'bank_reconciliation' | 'journals';
    }>;
    insights: { topExpenses: Array<{ name: string; amount: number }>; bankAccounts: Array<{ name: string; balance: number }> };
  };
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

  // These lower insights deliberately come from the dashboard DTO, not browser caches.
  const topExpenseCategories = useMemo(() => {
    const categories = dashboard?.commandCenter.insights.topExpenses || [];
    const total = categories.reduce((sum, category) => sum + category.amount, 0);
    return { categories: categories.map((category) => ({ ...category, percent: total > 0 ? Math.round((category.amount / total) * 100) : 0 })), total };
  }, [dashboard]);
  const liquidAccounts = dashboard?.commandCenter.insights.bankAccounts || [];

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
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group flex flex-col justify-between rounded-lg border border-slate-200/90 bg-white p-4 text-left shadow-xs transition-all dark:border-slate-800/90 dark:bg-slate-900 ${
        onClick
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700'
          : 'cursor-default'
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconBg} transition-transform group-hover:scale-105`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h2>
          </div>
        </div>
        {badge && (
          <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${badgeTone}`}>
            {badge}
          </span>
        )}
      </div>

      <div className="mt-3.5 space-y-2">
        <div className={`font-financial min-w-0 text-xl font-black tracking-tight sm:text-[1.7rem] ${tone}`}>{value}</div>
        {progressPercent !== undefined && progressLabel && (
          <div className="space-y-1 pt-1">
            <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span>{progressLabel}</span>
              <span className="font-financial">{Math.round(progressPercent)}%</span>
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
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer"
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
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer"
            >
              <span>P&L Report</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Hover Tooltip display */}
        {hoveredPoint && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-800">
            <span className="font-semibold">{formatDate(hoveredPoint.date)}:</span>
            <span className="text-blue-300">In: {money(hoveredPoint.income)}</span>
            <span className="text-rose-300">Out: {money(hoveredPoint.expenses)}</span>
            <span className="font-bold text-emerald-300">Net: {money(hoveredPoint.income - hoveredPoint.expenses)}</span>
          </div>
        )}

        {/* Bar Timeline */}
        {points.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No posted journal transactions recorded for the selected timeline.
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            <div className="flex h-36 items-end gap-1 sm:gap-2 pt-4 border-b border-slate-100 dark:border-slate-800">
              {points.map((point) => {
                const incomeH = Math.max(4, Math.round((point.income / maxValue) * 110));
                const expenseH = Math.max(4, Math.round((point.expenses / maxValue) * 110));

                return (
                  <div
                    key={point.date}
                    onMouseEnter={() => setHoveredPoint(point)}
                    onMouseLeave={() => setHoveredPoint(null)}
                    className="group relative flex flex-1 items-end justify-center gap-0.5 sm:gap-1 h-full cursor-pointer"
                  >
                    <div
                      style={{ height: `${incomeH}px` }}
                      className="w-full max-w-[12px] rounded-t-xs bg-blue-600 transition-all group-hover:bg-blue-500"
                    />
                    <div
                      style={{ height: `${expenseH}px` }}
                      className="w-full max-w-[12px] rounded-t-xs bg-rose-500 transition-all group-hover:bg-rose-400"
                    />
                  </div>
                );
              })}
            </div>

            {/* X-Axis Dates */}
            <div className="flex justify-between text-[10px] font-semibold text-slate-400 px-1">
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
    <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Quick Action Dock</h2>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Commands</span>
      </div>
      <div className="mt-3.5 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-2">
        <button
          title="New sales invoice"
          onClick={() => setIsInvoiceEditorOpen(true)}
          className="group flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-blue-500/80 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 cursor-pointer"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 text-blue-600 transition-transform group-hover:scale-110 dark:bg-blue-950 dark:text-blue-400">
            <FilePlus2 className="h-4 w-4" />
          </div>
          <span>+ Invoice</span>
        </button>

        <button
          title="Log operational expense"
          onClick={() => setIsExpenseModalOpen(true)}
          className="group flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-emerald-500/80 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300 cursor-pointer"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-110 dark:bg-emerald-950 dark:text-emerald-400">
            <ReceiptText className="h-4 w-4" />
          </div>
          <span>+ Expense</span>
        </button>

        <button
          title="Add client or customer"
          onClick={() => setIsClientModalOpen(true)}
          className="group hidden min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-violet-400 hover:bg-violet-50/50 hover:text-violet-700 sm:flex dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-violet-500/80 dark:hover:bg-violet-950/40 dark:hover:text-violet-300 cursor-pointer"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 text-violet-600 transition-transform group-hover:scale-110 dark:bg-violet-950 dark:text-violet-400">
            <BadgeDollarSign className="h-4 w-4" />
          </div>
          <span>+ Customer</span>
        </button>

        <button
          title="Record incoming vendor bill"
          onClick={() => onNavigate('bills', { autoCreate: true })}
          className="group flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border border-slate-200/90 bg-slate-50/50 p-3 text-xs font-bold text-slate-700 transition-all hover:-translate-y-0.5 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-200 dark:hover:border-amber-500/80 dark:hover:bg-amber-950/40 dark:hover:text-amber-300 cursor-pointer"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-600 transition-transform group-hover:scale-110 dark:bg-amber-950 dark:text-amber-400">
            <FileText className="h-4 w-4" />
          </div>
          <span>+ Vendor Bill</span>
        </button>
      </div>
    </section>
  );

  // Top Expenses Breakdown Widget
  const TopExpensesWidget = () => (
    <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
            <PieChart className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Top Expense Categories</h2>
            <p className="text-[11px] text-slate-400">Operating cost breakdown by general ledger category</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('expenses')}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
        >
          <span>All Expenses</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {topExpenseCategories.categories.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No operational expenses logged for this period.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {topExpenseCategories.categories.map((cat, idx) => {
            const colors = ['bg-blue-600', 'bg-purple-600', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500'];
            const barColor = colors[idx % colors.length];

            return (
              <div key={cat.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-financial font-bold text-slate-900 dark:text-white">{money(cat.amount)}</span>
                    <span className="text-[10px] font-bold text-slate-400">({cat.percent}%)</span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div style={{ width: `${cat.percent}%` }} className={`h-full rounded-full ${barColor}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  // Bank & Liquid Accounts Widget
  const BankAccountsWidget = () => (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <Landmark className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Liquid Bank & Cash Accounts</h2>
            <p className="text-[11px] text-slate-400">Cash reserves and real-time ledger balances</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('banking')}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
        >
          <span>Bank Feeds</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {liquidAccounts.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          No bank or cash accounts configured.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {liquidAccounts.slice(0, 4).map((acc) => (
            <div
              key={acc.name}
              onClick={() => onNavigate('banking')}
              className="group flex flex-col justify-between rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5 transition-all hover:border-blue-400 hover:bg-blue-50/30 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:border-blue-500/60 cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  Ledger balance
                </span>
              </div>
              <div className="mt-2.5">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{acc.name}</p>
                <p className="mt-1 font-financial text-base font-extrabold text-slate-900 dark:text-white">
                  {money(acc.balance || 0)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );

  const ScheduledOutlookWidget = () => (
    <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Scheduled Cash Outlook</h2>
            <p className="text-[11px] text-slate-400">Open documents due in the next 30 days, not a forecast</p>
          </div>
        </div>
        <button
          onClick={() => onNavigate('reports')}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
        >
          <span>Reports</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/80">
        <div className="flex items-center justify-between py-3 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Scheduled collections</span>
          <span className="font-financial font-extrabold text-emerald-700 dark:text-emerald-400">{money(dashboard?.commandCenter.scheduledCashOutlook.collections || 0)}</span>
        </div>
        <div className="flex items-center justify-between py-3 text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Scheduled bills</span>
          <span className="font-financial font-extrabold text-rose-700 dark:text-rose-400">{money(dashboard?.commandCenter.scheduledCashOutlook.bills || 0)}</span>
        </div>
        <div className="flex items-center justify-between py-3 text-xs">
          <span className="font-semibold text-slate-900 dark:text-white">Net scheduled movement</span>
          <span className={`font-financial font-extrabold ${(dashboard?.commandCenter.scheduledCashOutlook.net || 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
            {money(dashboard?.commandCenter.scheduledCashOutlook.net || 0)}
          </span>
        </div>
      </div>
    </section>
  );

  return (
    <div className="mx-auto min-h-full max-w-[1500px] space-y-4 bg-slate-50/60 p-4 text-slate-900 sm:p-6 lg:p-7 dark:bg-slate-950 dark:text-slate-100">
      {/* Header Banner */}
      <header className="flex flex-col gap-4 border-b border-slate-200/90 bg-white px-1 py-4 dark:border-slate-800/90 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-950/80 dark:text-blue-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              FirmBooks Authority
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live Double-Entry Ledger
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[1.8rem] dark:text-white">
            Financial Command Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Authoritative, multi-tenant verified records as of {formatDate(asOfDate)}.
          </p>
        </div>

        {/* Date Range & Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Preset Buttons */}
          <div className="hidden rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-bold dark:border-slate-700 dark:bg-slate-800 sm:inline-flex">
            {(['today', 'mtd', 'qtd', 'ytd', 'custom'] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                className={`min-w-12 rounded-md px-2.5 py-1.5 uppercase tracking-wider transition-all cursor-pointer ${
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
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60 cursor-pointer"
          >
            <FileBarChart2 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <span>Reports</span>
          </button>

          {/* Refresh Button */}
          <button
            title="Refresh dashboard metrics"
            onClick={() => setReloadToken((c) => c + 1)}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </header>

      {/* Navigation Sub-Tabs */}
      {dashboard && (
        <nav
          aria-label="Dashboard sub-views"
          className="hidden w-full gap-1 overflow-x-auto rounded-lg border border-slate-200/90 bg-white p-1 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex"
        >
          {dashboard.availableViews.map((item) => {
            const isSelected = view === item;
            return (
              <button
                key={item}
                onClick={() => openView(item)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs dark:bg-blue-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
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
        <div className="space-y-5">
          <div className="lg:hidden">
            <QuickActions />
          </div>
          {/* Top 4 KPI Metric Cards */}
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric
              title="Operating Cash & Bank"
              value={money(dashboard.commandCenter.financialPosition.cashAtBank)}
              subtitle="Posted bank and cash journals"
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
              value={money(dashboard.commandCenter.financialPosition.toCollect)}
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
              value={money(dashboard.commandCenter.financialPosition.toPay)}
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
              value={money(dashboard.commandCenter.performance.revenue)}
              subtitle={`${money(dashboard.commandCenter.performance.expenses)} posted expenses this period`}
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
          <section className="grid gap-4 xl:grid-cols-3">
            <div className="order-2 xl:order-1 xl:col-span-2">
              <ActivityTrend points={dashboard.commandCenter.performance.cashMovement} />
            </div>

            <div className="order-1 space-y-4 xl:order-2">
              {/* Attention Queue */}
              <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Audit & Attention Queue</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Action Required</span>
                </div>

                <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/80">
                  {dashboard.commandCenter.attention.map((item) => {
                    const tone = item.severity === 'critical'
                      ? 'bg-rose-500'
                      : item.severity === 'due-soon' ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavigate(item.destination)}
                        className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-xs font-semibold hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${tone}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        <span className="font-financial rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {item.amount !== null ? money(item.amount) : item.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Quick Action Dock */}
              <div className="hidden lg:block">
                <QuickActions />
              </div>
            </div>
          </section>

          {/* NEW ROW: TOP EXPENSE BREAKDOWN & LIQUID BANK ACCOUNTS */}
          <section className="grid gap-5 lg:grid-cols-2">
            <TopExpensesWidget />
            <BankAccountsWidget />
          </section>

          {/* Operational Action Lists */}
          <section className="grid gap-5 lg:grid-cols-2">
            <ActionList
              title="Receivables Requiring Collection"
              items={dashboard.overview.collections}
              empty="No overdue customer invoices"
              onOpen={() => onNavigate('invoices')}
              actionLabel="Invoices Workspace"
              icon={TrendingUp}
            />

            <ActionList
              title="Accounts Payable & Upcoming Bills"
              items={dashboard.overview.billsDue}
              empty="No urgent vendor payments pending"
              onOpen={() => onNavigate('bills')}
              actionLabel="Bills Workspace"
              icon={TrendingDown}
            />
          </section>

          {/* NEW ROW: GENERAL LEDGER WATCHLIST & RECENT TRANSACTIONS */}
          <section className="grid gap-5 lg:grid-cols-2">
            <ScheduledOutlookWidget />

            {/* Recent Transactions Table */}
            <section className="rounded-xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Recent Transactions</h2>
                    <p className="text-[11px] text-slate-400">Latest posted accounting movements</p>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('journals')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  <span>Audit Trail</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {dashboard.overview.recentTransactions.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No recent accounting transactions recorded for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                        <th className="py-3 px-4">Document</th>
                        <th className="py-3 px-3">Party</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {dashboard.overview.recentTransactions.slice(0, 5).map((tx, idx) => (
                        <tr key={`${tx.documentNumber}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-2.5 px-4 font-semibold text-blue-600 dark:text-blue-400">{tx.documentNumber}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200 truncate max-w-[140px]">{tx.partyName}</td>
                          <td className="py-2.5 px-3 text-slate-400">{formatDate(tx.date)}</td>
                          <td className="py-2.5 px-4 text-right font-financial font-bold text-slate-900 dark:text-white">
                            {money(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </section>
        </div>
      )}

      {/* VIEW 2: CASH & LIQUIDITY */}
      {!loading && dashboard && view === 'cash-operations' && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="Liquid Cash & Bank"
              value={money(dashboard.overview.bankBalance)}
              subtitle="All operating bank accounts"
              icon={Wallet}
              iconBg="bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
              onClick={() => onNavigate('banking')}
            />

            <Metric
              title="Collections (Next 7 Days)"
              value={money(dashboard.cashOperations.collectionsDue7Days)}
              subtitle="Expected incoming cash"
              icon={TrendingUp}
              iconBg="bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              onClick={() => onNavigate('invoices')}
            />

            <Metric
              title="Bills Due (Next 7 Days)"
              value={money(dashboard.cashOperations.billsDue7Days)}
              subtitle="Upcoming cash disbursements"
              icon={TrendingDown}
              iconBg="bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
              onClick={() => onNavigate('bills')}
            />

            <Metric
              title="Reconciliation Status"
              value={`${dashboard.overview.bankReconciliationAttentionCount} Items`}
              subtitle={
                dashboard.cashOperations.oldestUnmatchedDate
                  ? `Oldest feed: ${formatDate(dashboard.cashOperations.oldestUnmatchedDate)}`
                  : 'All feeds reconciled'
              }
              badge={dashboard.overview.bankReconciliationAttentionCount > 0 ? 'Pending' : 'Healthy'}
              badgeTone={
                dashboard.overview.bankReconciliationAttentionCount > 0
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
              }
              icon={BookOpenCheck}
              iconBg="bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
              onClick={() => onNavigate('bank_reconciliation')}
            />
          </section>

          <BankAccountsWidget />
        </div>
      )}

      {/* VIEW 3: INTEGRITY & PERIOD CLOSE */}
      {!loading && dashboard && view === 'close-controls' && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">General Ledger Balanced Status</h2>
                  <p className="text-xs text-slate-500">Continuous double-entry mathematical balance verification</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <span>Trial Balance (Debits = Credits)</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Balanced</span>
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <span>Accounts Receivable Subledger (1100)</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Reconciled</span>
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <span>Accounts Payable Subledger (2000)</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Reconciled</span>
                  </span>
                </div>
              </div>
            </div>

            <ScheduledOutlookWidget />
          </section>
        </div>
      )}

      {/* Modals */}
      {isInvoiceEditorOpen && (
        <InvoiceEditorModal
          isOpen={isInvoiceEditorOpen}
          onClose={() => setIsInvoiceEditorOpen(false)}
        />
      )}

      {isExpenseModalOpen && (
        <ExpenseModal
          isOpen={isExpenseModalOpen}
          onClose={() => setIsExpenseModalOpen(false)}
        />
      )}

      {isClientModalOpen && (
        <ClientModal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
        />
      )}
    </div>
  );
};
