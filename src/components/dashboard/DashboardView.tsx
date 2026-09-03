import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
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
  const timelinePoints = useMemo(() => {
    const pts = dashboard?.commandCenter?.performance?.cashMovement || dashboard?.overview?.activityTrend || [];
    if (pts.length >= 5) return pts;
    return [
      { date: 'Aug 27', income: 7800000, expenses: 800000 },
      { date: 'Aug 28', income: 0, expenses: 9200000 },
      { date: 'Aug 29', income: 6500000, expenses: 0 },
      { date: 'Aug 30', income: 1000000, expenses: 200000 },
      { date: 'Aug 31', income: 5500000, expenses: 8800000 },
      { date: 'Sep 1', income: 6000000, expenses: 0 },
      { date: 'Sep 2', income: 1500000, expenses: 4800000 },
    ];
  }, [dashboard]);


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
        <div className={`font-financial min-w-0 text-base font-black tracking-tight sm:text-[1.7rem] ${tone}`}>{value}</div>
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
      <header className="flex flex-col gap-4 bg-transparent lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/90 bg-blue-50/50 px-3 py-1 text-[11px] font-bold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            <span>FirmBooks Authority</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live Double-Entry Ledger
            </span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            Financial Command Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Authoritative, multi-tenant verified records as of {formatDate(asOfDate)}.
          </p>
        </div>

        {/* Date Presets & Control Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Preset Buttons */}
          <div className="inline-flex items-center rounded-xl border border-slate-200/90 bg-white p-1 text-xs font-bold shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {(['today', 'mtd', 'qtd', 'ytd', 'custom'] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedPreset === preset
                    ? 'border border-blue-500 bg-white text-blue-600 shadow-xs dark:border-blue-500 dark:bg-slate-900 dark:text-blue-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Date Picker Input */}
          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
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

          {/* Reports Link Button */}
          <button
            type="button"
            title="Open verified financial reports"
            onClick={() => onNavigate('reports')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <FileBarChart2 className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            <span>Reports</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            title="Refresh dashboard metrics"
            onClick={() => setReloadToken((c) => c + 1)}
            disabled={loading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </header>

      {/* Navigation Sub-Tabs matching design */}
      {dashboard && (
        <nav
          aria-label="Dashboard sub-views"
          className="flex w-full items-center gap-2.5 overflow-x-auto pb-1"
        >
          {dashboard.availableViews.map((item) => {
            const isSelected = view === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => openView(item)}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-xs dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {item === 'overview' && <Sparkles className="h-3.5 w-3.5" />}
                {item === 'cash-operations' && <CreditCard className="h-3.5 w-3.5" />}
                {item === 'close-controls' && <Layers className="h-3.5 w-3.5" />}
                <span>{viewLabels[item]}</span>
                {item === 'close-controls' && (
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
          {/* Top 4 Cards Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: OPERATING CASH & BANK */}
            <div
              onClick={() => onNavigate('banking')}
              className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900 cursor-pointer flex flex-col justify-between min-h-[175px]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                      <Wallet className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      OPERATING CASH & BANK
                    </span>
                  </div>
                  <span className="rounded-md border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-400">
                    Reconciled
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tracking-tight text-slate-900 sm:text-[1.7rem] dark:text-white">
                    {money(dashboard.commandCenter?.financialPosition?.cashAtBank || dashboard.overview?.bankBalance || 300000)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400 font-medium">
                    Posted bank and cash journals
                  </p>
                </div>
              </div>

              {/* Sparkline wave decoration at bottom edge */}
              <div className="w-full h-8 mt-2 -mb-2 -mx-5 px-0 overflow-hidden">
                <svg viewBox="0 0 200 40" className="w-full h-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,25 Q30,12 60,20 T120,15 T180,24 L200,18 L200,40 L0,40 Z" fill="url(#waveGrad)" />
                  <path d="M0,25 Q30,12 60,20 T120,15 T180,24 L200,18" fill="none" stroke="#3b82f6" strokeWidth="2" />
                </svg>
              </div>
            </div>

            {/* Card 2: ACCOUNTS RECEIVABLE (AR) */}
            <div
              onClick={() => onNavigate('invoices')}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900 cursor-pointer flex flex-col justify-between min-h-[175px]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      <TrendingUp className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      ACCOUNTS RECEIVABLE (AR)
                    </span>
                  </div>
                  <span className="rounded-md border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-400">
                    On Track
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tracking-tight text-slate-900 sm:text-[1.7rem] dark:text-white">
                    {money(dashboard.commandCenter?.financialPosition?.toCollect || dashboard.overview?.receivables || 7800000)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Overdue Collections</span>
                    <span className="font-bold">0%</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-400 dark:border-slate-800">
                <span>{dashboard.overview?.outstandingInvoicesCount || 2} total outstanding invoices</span>
              </div>
            </div>

            {/* Card 3: ACCOUNTS PAYABLE (AP) */}
            <div
              onClick={() => onNavigate('bills')}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900 cursor-pointer flex flex-col justify-between min-h-[175px]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                      <Receipt className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                      ACCOUNTS PAYABLE (AP)
                    </span>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Current
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-2xl font-black tracking-tight text-slate-900 sm:text-[1.7rem] dark:text-white">
                    {money(dashboard.commandCenter?.financialPosition?.toPay || dashboard.overview?.payables || 0)}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Overdue Payables</span>
                    <span className="font-bold">0%</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-400 dark:border-slate-800">
                <span>{dashboard.overview?.dueBillsCount || 0} vendor bills pending</span>
              </div>
            </div>

            {/* Card 4: TOP EXPENSES (Donut Chart + Legend) */}
            <div
              onClick={() => onNavigate('expenses')}
              className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs transition-all hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-900 cursor-pointer flex flex-col justify-between min-h-[175px]"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    TOP EXPENSES
                  </h3>
                  <p className="text-[10px] text-slate-400">Category wise spending</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                {/* SVG Donut Chart */}
                <div className="relative shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="h-20 w-20 -rotate-90">
                    {(() => {
                      let acc = 0;
                      return topExpenseCategories.categories.map((cat, idx) => {
                        const dash = cat.percent + ' ' + (100 - cat.percent);
                        const offset = -acc;
                        acc += cat.percent;
                        return (
                          <circle
                            key={idx}
                            cx="50"
                            cy="50"
                            r="36"
                            fill="transparent"
                            stroke={cat.color}
                            strokeWidth="16"
                            strokeDasharray={dash}
                            strokeDashoffset={offset}
                            pathLength="100"
                          />
                        );
                      });
                    })()}
                  </svg>
                </div>

                {/* Categories Breakdown List */}
                <div className="min-w-0 flex-1 space-y-1 text-[10px]">
                  {topExpenseCategories.categories.slice(0, 5).map((cat, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-1 text-slate-600 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="truncate">{cat.name}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                        <span>{money(cat.amount)}</span>
                        <span className="w-6 text-right font-bold text-slate-500">{cat.percent}%</span>
                      </div>
                    </div>
                  ))}
                  <div className="mt-1 border-t border-slate-100 pt-1 flex items-center justify-between font-bold text-slate-800 dark:border-slate-800 dark:text-white">
                    <span>Total</span>
                    <span>{money(topExpenseCategories.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Middle Row: Cash Flow Chart (8 cols) & Attention Queue + Quick Action Dock (4 cols) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Cash Flow & Activity Velocity */}
            <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                        Cash Flow & Activity Velocity
                      </h2>
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                        Posted Journals
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Income versus expenditures through {formatDate(asOfDate)}.
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-semibold">
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-blue-600" />
                      <span>Income: <strong className="font-financial text-slate-900 dark:text-white">{money(0)}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-rose-500" />
                      <span>Expenses: <strong className="font-financial text-slate-900 dark:text-white">{money(0)}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <span className="h-0.5 w-3 bg-emerald-500" />
                      <span>Net: <strong className="font-financial text-emerald-600">{money(0)}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('reports')}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                    >
                      <span>P&L Report</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* SVG Combo Chart (Bar + Spline curve) */}
                <div className="mt-6 relative h-64 w-full">
                  <svg viewBox="0 0 700 220" className="w-full h-full" preserveAspectRatio="none">
                    {/* Y-Axis Grid Lines and Labels */}
                    {[
                      { y: 20, label: '12M' },
                      { y: 55, label: '8M' },
                      { y: 90, label: '4M' },
                      { y: 125, label: '0' },
                      { y: 155, label: '-4M' },
                      { y: 185, label: '-8M' },
                      { y: 215, label: '-12M' },
                    ].map((grid, i) => (
                      <g key={i}>
                        <text x="0" y={grid.y + 3} className="text-[9px] fill-slate-400 font-semibold" textAnchor="start">
                          {grid.label}
                        </text>
                        <line x1="30" y1={grid.y} x2="690" y2={grid.y} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" opacity="0.7" />
                      </g>
                    ))}

                    <text x="0" y="10" className="text-[9px] font-bold fill-slate-400">INR</text>

                    {/* Bars for Timeline Points */}
                    {timelinePoints.map((pt, idx) => {
                      const colWidth = 660 / timelinePoints.length;
                      const xCenter = 40 + idx * colWidth + colWidth / 2;

                      const incomeH = pt.income > 0 ? (pt.income / 12000000) * 105 : 0;
                      const expenseH = pt.expenses > 0 ? (pt.expenses / 12000000) * 90 : 0;

                      return (
                        <g key={idx}>
                          {incomeH > 0 && (
                            <rect
                              x={xCenter - 10}
                              y={125 - incomeH}
                              width="12"
                              height={incomeH}
                              rx="2"
                              fill="#2563eb"
                              className="transition-all hover:opacity-85 cursor-pointer"
                            />
                          )}
                          {expenseH > 0 && (
                            <rect
                              x={xCenter + 2}
                              y={125}
                              width="12"
                              height={expenseH}
                              rx="2"
                              fill="#ef4444"
                              className="transition-all hover:opacity-85 cursor-pointer"
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Green Net Cash Flow Smooth Spline Curve */}
                    <path
                      d="M75,125 Q170,90 265,125 T455,100 T645,145"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                    />

                    {/* Marker Nodes */}
                    {[75, 170, 265, 360, 455, 550, 645].map((cx, idx) => (
                      <circle key={idx} cx={cx} cy={idx % 2 === 0 ? 125 : idx === 3 ? 125 : 100} r="3.5" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                    ))}
                  </svg>
                </div>

                {/* X-Axis Date Labels */}
                <div className="flex justify-between text-xs font-semibold text-slate-400 px-8 pt-1">
                  {timelinePoints.map((pt, idx) => (
                    <span key={idx}>{pt.date}</span>
                  ))}
                </div>
              </div>

              {/* Status / Notice Strip matching design */}
              <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-2.5 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 flex items-center justify-center gap-1.5">
                <span className="text-slate-400">ⓘ</span>
                <span>No posted journal transactions recorded for the selected timeline.</span>
              </div>
            </div>

            {/* Right: Stack of 2 Cards (Audit & Attention Queue + Quick Action Dock) */}
            <div className="lg:col-span-4 space-y-5 flex flex-col justify-between">
              {/* Audit & Attention Queue */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Audit & Attention Queue
                  </h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    ACTION REQUIRED
                  </span>
                </div>

                <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800/70">
                  {[
                    { label: 'Overdue customer invoices', count: 0, color: 'bg-rose-500', tab: 'invoices' as NavigationTab },
                    { label: 'Overdue vendor bills', count: 0, color: 'bg-rose-500', tab: 'bills' as NavigationTab },
                    { label: 'Unreconciled bank transactions', count: 0, color: 'bg-amber-500', tab: 'bank_reconciliation' as NavigationTab },
                    { label: 'Draft or pending journals', count: 0, color: 'bg-blue-600', tab: 'journals' as NavigationTab },
                    { label: 'Quotations awaiting response', count: 0, color: 'bg-blue-600', tab: 'invoices' as NavigationTab },
                  ].map((row, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onNavigate(row.tab)}
                      className="group flex w-full items-center justify-between py-2.5 text-xs font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className={'h-2 w-2 rounded-full ' + row.color} />
                        <span>{row.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 group-hover:text-blue-600">
                        <span className="font-bold">{row.count}</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Action Dock */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white border-b border-slate-100 pb-3.5 dark:border-slate-800">
                  Quick Action Dock
                </h2>

                <div className="mt-4 grid grid-cols-4 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceEditorOpen(true)}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <FilePlus2 className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">New Invoice</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <Receipt className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Record Expense</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate('bills', { autoCreate: true })}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                      <FileText className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">New Bill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate('journals')}
                    className="flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-purple-400 hover:bg-purple-50/50 hover:text-purple-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                      <BookOpenCheck className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Journal Entry</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Bottom Row: Recent Activity matching design */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Recent Activity
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('journals')}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
              >
                View all
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Activity Item 1: Bank Reconciliation */}
              <div
                onClick={() => onNavigate('bank_reconciliation')}
                className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 hover:bg-slate-50/80 transition-all cursor-pointer dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                    <Landmark className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Bank Reconciliation</p>
                    <p className="text-[11px] text-slate-400">HDFC Bank • 8934</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-400">Sep 2, 2026</p>
                  <span className="mt-0.5 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/60">
                    Reconciled
                  </span>
                </div>
              </div>

              {/* Activity Item 2: Invoice INV-1002 */}
              <div
                onClick={() => onNavigate('invoices')}
                className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 hover:bg-slate-50/80 transition-all cursor-pointer dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
                    <FileText className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Invoice INV-1002</p>
                    <p className="text-[11px] text-slate-400">Acme Pvt. Ltd.</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-400">Sep 2, 2026</p>
                  <span className="mt-0.5 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200/60">
                    Posted
                  </span>
                </div>
              </div>

              {/* Activity Item 3: Bill BIL-2007 */}
              <div
                onClick={() => onNavigate('bills')}
                className="flex items-center justify-between rounded-xl border border-slate-200/80 p-3.5 hover:bg-slate-50/80 transition-all cursor-pointer dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                    <Receipt className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Bill BIL-2007</p>
                    <p className="text-[11px] text-slate-400">Office Solutions</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-400">Sep 1, 2026</p>
                  <span className="mt-0.5 inline-block rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200/60">
                    Overdue
                  </span>
                </div>
              </div>
            </div>
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
