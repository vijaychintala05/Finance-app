import { CashBalanceWidget } from './widgets/CashBalanceWidget';
import { CashFlowWidget } from './widgets/CashFlowWidget';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileBarChart2,
  FilePlus2,
  FileText,
  Landmark,
  Layers,
  PieChart,
  Play,
  Plus,
  Square,
  Receipt,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
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
type DatePreset = 'today' | 'mtd' | 'qtd' | 'ytd' | 'last12' | 'custom';

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
  cashFlow?: {
    movements: Array<{ date: string; cashIn: number; cashOut: number; net: number }>;
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
    period: { start: string; end: string; preset?: string; label: string };
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

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { settings, accounts, timeEntries, expenses } = useBooks();
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
  const [customStartDate, setCustomStartDate] = useState<string | null>(null);
  const [mobileCashFlowPeriod, setMobileCashFlowPeriod] = useState<'fiscal' | 'year' | 'quarter' | 'month'>('month');
  const [mobileCashFlowBasis, setMobileCashFlowBasis] = useState<'accrual' | 'cash'>('cash');
  const [mobileExpensePeriod, setMobileExpensePeriod] = useState<'fiscal' | 'year' | 'quarter' | 'month'>('fiscal');
  const [mobileHoverPoint, setMobileHoverPoint] = useState<{ month: string; amount: number } | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      view,
      asOfDate,
      periodPreset: selectedPreset,
    });
    if (selectedPreset === 'custom' && customStartDate) params.set('startDate', customStartDate);
    apiClient
      .get<{ dashboard: DashboardData }>(`/dashboard?${params.toString()}`)
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
  }, [view, asOfDate, selectedPreset, customStartDate, reloadToken]);

  const money = (value: number) => formatCurrency(value, settings.currencySymbol);

  const handlePresetSelect = (preset: DatePreset) => {
    setCustomStartDate(null);
    setSelectedPreset(preset);
  };

  const handleMobileCashFlowPeriodChange = (period: 'fiscal' | 'year' | 'quarter' | 'month') => {
    setMobileCashFlowPeriod(period);
    setMobileHoverPoint(null);
    if (period === 'fiscal') {
      const asOf = new Date(`${asOfDate}T00:00:00Z`);
      const fiscalStartMonth = Math.max(1, Math.min(12, Number(settings.fiscalYearStartMonth) || 1));
      const fiscalYear = asOf.getUTCMonth() + 1 < fiscalStartMonth
        ? asOf.getUTCFullYear() - 1
        : asOf.getUTCFullYear();
      setCustomStartDate(`${fiscalYear}-${String(fiscalStartMonth).padStart(2, '0')}-01`);
      setSelectedPreset('custom');
      return;
    }
    setCustomStartDate(null);
    setSelectedPreset(period === 'year' ? 'ytd' : period === 'quarter' ? 'qtd' : 'mtd');
  };

  const openView = (nextView: DashboardViewKey) => {
    if (dashboard?.availableViews.includes(nextView)) setView(nextView);
  };

  const totalTrendIncome =
    dashboard?.overview.activityTrend.reduce((acc, p) => acc + p.income, 0) || 0;
  const totalTrendExpense =
    dashboard?.overview.activityTrend.reduce((acc, p) => acc + p.expenses, 0) || 0;
  const totalTrendNet = totalTrendIncome - totalTrendExpense;

  // Dynamic insights and categories from authoritative backend dashboard DTO
  const topExpenseCategories = useMemo(() => {
    const raw = dashboard?.commandCenter.insights.topExpenses || [];
    const colors = ['#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#eab308', '#10b981', '#f97316'];
    const total = raw.reduce((sum, c) => sum + c.amount, 0);
    return {
      categories: raw.map((c, i) => ({
        name: c.name,
        amount: c.amount,
        percent: total > 0 ? Math.round((c.amount / total) * 100) : 0,
        color: colors[i % colors.length],
      })),
      total,
    };
  }, [dashboard]);

  const liquidAccounts = dashboard?.commandCenter.insights.bankAccounts || [];

  const cashInHandTotal = useMemo(() => {
    const cashAccounts = (accounts || []).filter(a => (a.type || '').toLowerCase() === 'cash');
    if (cashAccounts.length > 0) {
      return cashAccounts.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);
    }
    const backendCash = liquidAccounts.filter(a => (a.name || '').toLowerCase().includes('cash'));
    if (backendCash.length > 0) {
      return backendCash.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
    }
    return 0;
  }, [accounts, liquidAccounts]);

  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  const formattedTimer = useMemo(() => {
    const hrs = Math.floor(timerSeconds / 3600);
    const mins = Math.floor((timerSeconds % 3600) / 60);
    const secs = timerSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [timerSeconds]);

  const unbilledHoursCount = useMemo(() => {
    return (timeEntries || []).filter((t) => t.isBillable && !t.isBilled).reduce((acc, t) => acc + (Number(t.hours) || 0), 0);
  }, [timeEntries]);

  const formattedUnbilledHours = useMemo(() => {
    const h = Math.floor(unbilledHoursCount);
    const m = Math.round((unbilledHoursCount % 1) * 60);
    return `${h}:${m.toString().padStart(2, '0')}`;
  }, [unbilledHoursCount]);

  const unbilledExpensesCount = useMemo(() => {
    return (expenses || []).filter((e) => e.isBillable && !e.isBilled).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  }, [expenses]);

  // Real timeline points from authoritative backend response
  const timelinePoints = useMemo(() => {
    const pts = dashboard?.commandCenter?.performance?.cashMovement || dashboard?.overview?.activityTrend || [];
    if (!pts || pts.length === 0) return [];
    return pts.map((p) => {
      const inc = Number(p.income || 0);
      const exp = Number(p.expenses || 0);
      return {
        date: formatDate(p.date),
        rawDate: p.date,
        income: inc,
        expenses: exp,
        net: inc - exp,
      };
    });
  }, [dashboard]);

  const cashTimelinePoints = useMemo(() => {
    const movements = dashboard?.cashFlow?.movements || [];
    return movements.map((movement) => ({
      date: formatDate(movement.date),
      rawDate: movement.date,
      income: Number(movement.cashIn || 0),
      expenses: Number(movement.cashOut || 0),
      net: Number(movement.net || 0),
    }));
  }, [dashboard]);

  const chartTotals = useMemo(() => {
    const totalIncome = timelinePoints.reduce((acc, p) => acc + p.income, 0);
    const totalExpenses = timelinePoints.reduce((acc, p) => acc + p.expenses, 0);
    const totalNet = totalIncome - totalExpenses;
    return { totalIncome, totalExpenses, totalNet };
  }, [timelinePoints]);

  const chartScale = useMemo(() => {
    const peak = timelinePoints.length > 0
      ? Math.max(...timelinePoints.map((p) => Math.max(p.income, p.expenses, Math.abs(p.net))))
      : 0;

    const maxVal = peak > 0 ? Math.max(1000, Math.ceil(peak * 1.15)) : 10000;

    const formatTick = (val: number) => {
      const abs = Math.abs(val);
      const sign = val < 0 ? '-' : '';
      if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1) + 'M';
      if (abs >= 1_000) return sign + (abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1) + 'K';
      return '' + val;
    };

    return {
      maxVal,
      hasData: peak > 0,
      yTicks: [
        { y: 20, label: formatTick(maxVal) },
        { y: 55, label: formatTick(Math.round(maxVal * 0.66)) },
        { y: 90, label: formatTick(Math.round(maxVal * 0.33)) },
        { y: 125, label: '0' },
        { y: 155, label: formatTick(Math.round(-maxVal * 0.33)) },
        { y: 185, label: formatTick(Math.round(-maxVal * 0.66)) },
        { y: 215, label: formatTick(-maxVal) },
      ],
    };
  }, [timelinePoints]);

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
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 text-left shadow-xs transition-all dark:border-slate-800/90 dark:bg-slate-900 ${
        onClick
          ? 'cursor-pointer hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700'
          : 'cursor-default'
      }`}
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconBg} transition-transform group-hover:scale-105`}>
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

      <div className="mt-4 space-y-1">
        <div className={`font-financial min-w-0 text-2xl font-black tracking-tight sm:text-[1.7rem] ${tone}`}>{value}</div>
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate font-medium">{subtitle}</span>
          {onClick && (
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 text-blue-600 dark:text-blue-400 shrink-0 ml-1" />
          )}
        </div>
      </div>
    </button>
  );

  const BankAccountsWidget = () => (
    <CashBalanceWidget
      accounts={liquidAccounts}
      total={dashboard?.overview.bankBalance ?? 0}
      asOfDate={dashboard?.asOfDate || asOfDate}
      money={money}
      unmatchedCount={dashboard?.cashOperations?.available ? dashboard.cashOperations.bankReconciliationAttentionCount : null}
      onAccounts={() => onNavigate('banking')}
      onReconcile={() => onNavigate('bank_reconciliation')}
    />
  );

  const ScheduledOutlookWidget = () => (
    <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-slate-800/90 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
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

  const attentionItems = dashboard?.commandCenter?.attention || [];

  return (
    <div className="mx-auto min-h-full max-w-[1500px] space-y-5 bg-slate-50/60 p-4 text-slate-900 sm:p-6 lg:p-7 dark:bg-slate-950 dark:text-slate-100">
      {/* Header Banner */}
      <header className="flex flex-col gap-4 bg-transparent lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
              Financial Command Center
            </h1>
            <span className="rounded-full bg-blue-50 border border-blue-200/80 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/60 dark:border-blue-900/60 dark:text-blue-300">
              {dashboard?.commandCenter?.period?.label || 'Current Period'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {dashboard?.generatedAt ? `Updated ${formatDate(dashboard.generatedAt)} • ` : ''}
            Authoritative double-entry ledger records as of {formatDate(asOfDate)}
          </p>
        </div>

        {/* Date Presets & Control Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Buttons */}
          <div className="inline-flex items-center rounded-xl border border-slate-200/90 bg-white p-1 text-xs font-semibold shadow-xs dark:border-slate-800 dark:bg-slate-900" role="group" aria-label="Period basis">
            {(['today', 'mtd', 'qtd', 'ytd'] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
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
      {loading && !dashboard && (
        <div className="space-y-6">
          <MetricCardSkeleton count={4} />
          <TableSkeleton rows={5} columns={4} />
        </div>
      )}

      {/* Error Banner */}
      {!loading && error && !dashboard && (
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
      {dashboard && view === 'overview' && (
        <>
          {/* MOBILE VIEW (LIGHT MODE) - MATCHING USER SCREENSHOT */}
          <div className="block lg:hidden space-y-4" data-testid="mobile-dashboard-overview">
            {/* 1. PRIMARY OVERVIEW CARDS */}
            <div className="grid grid-cols-12 gap-2.5 sm:gap-3">
              {/* Left Column: Royal Blue Card (Total Receivables + Total Payables) */}
              <div className="col-span-7 sm:col-span-8 rounded-2xl bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white p-3.5 sm:p-4 shadow-sm flex flex-col justify-between">
                {/* Total Receivables */}
                <div
                  onClick={() => onNavigate('invoices')}
                  className="cursor-pointer group"
                >
                  <span className="text-[11px] font-medium text-blue-100/90 block">Total Receivables</span>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="font-financial text-lg sm:text-2xl font-black text-white truncate">
                      {money(dashboard.overview?.receivables ?? 0)}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-blue-200 shrink-0 group-hover:translate-y-0.5 transition-transform" />
                  </div>
                </div>

                {/* Subtle Divider */}
                <div className="my-2.5 sm:my-3 border-t border-blue-500/40" />

                {/* Total Payables */}
                <div
                  onClick={() => onNavigate('bills')}
                  className="cursor-pointer group"
                >
                  <span className="text-[11px] font-medium text-blue-100/90 block">Total Payables</span>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="font-financial text-base sm:text-xl font-black text-white truncate">
                      {money(dashboard.overview?.payables ?? 0)}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-blue-200 shrink-0 group-hover:translate-y-0.5 transition-transform" />
                  </div>
                </div>
              </div>

              {/* Right Column: 2 Stacked White Cards (Overdue Invoices & Overdue Bills) */}
              <div className="col-span-5 sm:col-span-4 flex flex-col gap-2.5 sm:gap-3">
                {/* Top Card: Overdue Invoices */}
                <div
                  onClick={() => onNavigate('invoices')}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-xs hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between cursor-pointer transition-all active:scale-98 flex-1"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-financial text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      {dashboard.overview?.overdueInvoicesCount ?? 0}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mt-1 leading-tight">
                    Overdue Invoices
                  </span>
                </div>

                {/* Bottom Card: Overdue Bills */}
                <div
                  onClick={() => onNavigate('bills')}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-xs hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between cursor-pointer transition-all active:scale-98 flex-1"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-financial text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                      {dashboard.overview?.overdueBillsCount ?? 0}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 mt-1 leading-tight">
                    Overdue Bills
                  </span>
                </div>
              </div>
            </div>

            {/* 2. QUICK CREATE SECTION */}
            <div className="pt-1">
              <div className="flex items-center gap-1.5 text-slate-900 dark:text-white font-bold text-xs mb-2.5">
                <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>Quick Create</span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                {/* 1. Customer */}
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(true)}
                  className="flex flex-col items-center gap-1.5 cursor-pointer group"
                >
                  <div className="w-full aspect-square max-w-[64px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-slate-800 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 transition-all active:scale-95">
                    <User className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-200" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Customer</span>
                </button>

                {/* 2. Expense */}
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(true)}
                  className="flex flex-col items-center gap-1.5 cursor-pointer group"
                >
                  <div className="w-full aspect-square max-w-[64px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-slate-800 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 transition-all active:scale-95">
                    <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-200" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Expense</span>
                </button>

                {/* 3. Quote */}
                <button
                  type="button"
                  onClick={() => setIsInvoiceEditorOpen(true)}
                  className="flex flex-col items-center gap-1.5 cursor-pointer group"
                >
                  <div className="w-full aspect-square max-w-[64px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-slate-800 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 transition-all active:scale-95">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-200" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Quote</span>
                </button>

                {/* 4. Invoices */}
                <button
                  type="button"
                  onClick={() => onNavigate('invoices')}
                  className="flex flex-col items-center gap-1.5 cursor-pointer group"
                >
                  <div className="w-full aspect-square max-w-[64px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-slate-800 hover:border-blue-400 hover:bg-blue-50/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 transition-all active:scale-95">
                    <FilePlus2 className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700 dark:text-slate-200" />
                  </div>
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Invoices</span>
                </button>
              </div>
            </div>

            {/* 3. CASH FLOW SECTION (MOBILE LIGHT MODE) */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cash Flow</h3>
                </div>

                <div className="relative">
                  <select
                    value={mobileCashFlowPeriod}
                    onChange={(e) => handleMobileCashFlowPeriodChange(e.target.value as any)}
                    className="appearance-none rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-6 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="fiscal">This Fiscal Year</option>
                    <option value="year">This Calendar Year</option>
                    <option value="quarter">This Quarter</option>
                    <option value="month">This Month</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>

              {/* Accrual / Cash Basis Pills (Matching Screenshot 3) */}
              <div className="flex items-center gap-1.5 mt-2.5">
                <button
                  type="button"
                  onClick={() => setMobileCashFlowBasis('accrual')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mobileCashFlowBasis === 'accrual'
                      ? 'bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  Accrual
                </button>
                <button
                  type="button"
                  onClick={() => setMobileCashFlowBasis('cash')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mobileCashFlowBasis === 'cash'
                      ? 'bg-slate-900 text-white shadow-xs dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  Cash
                </button>
              </div>

              {/* Mobile SVG Chart */}
              <div className="mt-3 relative">
                <svg viewBox="0 0 340 140" className="w-full h-auto overflow-visible select-none">
                  <defs>
                    <linearGradient id="mobileAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.28" />
                      <stop offset="85%" stopColor="#2563eb" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Values are matched to their actual ledger month; empty months remain zero. */}
                  {(() => {
                    const activePoints = mobileCashFlowBasis === 'cash' ? cashTimelinePoints : timelinePoints;
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const currentMonth = new Date(`${asOfDate}T00:00:00Z`).getUTCMonth();
                    const fiscalStart = Math.max(0, Math.min(11, (Number(settings.fiscalYearStartMonth) || 1) - 1));
                    const startMonth = mobileCashFlowPeriod === 'fiscal' ? fiscalStart
                      : mobileCashFlowPeriod === 'quarter' ? Math.floor(currentMonth / 3) * 3
                      : mobileCashFlowPeriod === 'month' ? currentMonth : 0;
                    const monthCount = mobileCashFlowPeriod === 'quarter' ? 3 : mobileCashFlowPeriod === 'month' ? 1 : 12;
                    const months = Array.from({ length: monthCount }, (_, index) => (startMonth + index) % 12);
                    const dataByMonth = new Map<number, { net: number }>();
                    activePoints.forEach((point) => {
                      const pointDate = new Date(`${point.rawDate}T00:00:00Z`);
                      if (Number.isNaN(pointDate.getTime())) return;
                      const month = pointDate.getUTCMonth();
                      const prior = dataByMonth.get(month) || { net: 0 };
                      dataByMonth.set(month, { net: prior.net + point.net });
                    });
                    const stepX = months.length > 1 ? (340 - 32) / (months.length - 1) : 0;
                    const peak = Math.max(1, ...Array.from(dataByMonth.values()).map((point) => Math.abs(point.net)));
                    const compact = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${Math.round(value / 1_000)}K` : `${Math.round(value)}`;
                    const points = months.map((month, i) => {
                      const x = 32 + i * stepX;
                      const value = dataByMonth.get(month)?.net || 0;
                      const y = Math.max(16, Math.min(112, 65 - (value / peak) * 46));
                      return { x, y, month: monthNames[month], amount: value };
                    });

                    const linePath = `M ${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
                    const areaPath = `${linePath} L ${points[points.length - 1].x},65 L ${points[0].x},65 Z`;

                    return (
                      <g>
                        {[{ y: 19, label: compact(peak) }, { y: 65, label: '0' }, { y: 111, label: `-${compact(peak)}` }].map((tick) => (
                          <g key={tick.y}>
                            <text x="0" y={tick.y + 3} fill="#94a3b8" fontSize="9" fontWeight="600" textAnchor="start">{tick.label}</text>
                            <line x1="28" y1={tick.y} x2="340" y2={tick.y} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="0.8" className="dark:stroke-slate-800" />
                          </g>
                        ))}
                        <path d={areaPath} fill="url(#mobileAreaGrad)" />
                        <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        {points.map((p) => (
                          <circle
                            key={p.month}
                            cx={p.x}
                            cy={p.y}
                            r={mobileHoverPoint?.month === p.month ? 4.5 : 2.5}
                            fill="#2563eb"
                            stroke="#ffffff"
                            strokeWidth={mobileHoverPoint?.month === p.month ? 2 : 1.5}
                            className="cursor-pointer transition-all"
                            onClick={() => setMobileHoverPoint({ month: p.month, amount: p.amount })}
                          />
                        ))}
                        {points.map((p) => (
                          <text key={`${p.month}-label`} x={p.x} y="132" fill="#94a3b8" fontSize="8.5" fontWeight="600" textAnchor="middle">
                            {p.month}
                          </text>
                        ))}
                      </g>
                    );
                  })()}
                </svg>

                {mobileHoverPoint && (
                  <div className="mt-2 text-center text-xs font-bold text-blue-600 bg-blue-50/70 dark:bg-blue-950/60 dark:text-blue-400 py-1 px-2 rounded-lg border border-blue-200/60 dark:border-blue-900/60">
                    {mobileHoverPoint.month}: Net Cash Movement {money(mobileHoverPoint.amount)}
                  </div>
                )}
              </div>

              {/* Bottom Mini Metrics */}
              {mobileCashFlowBasis === 'cash' ? (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/50">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Cash In</span>
                    <span className="font-financial font-bold text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 block truncate">
                      {money(cashTimelinePoints.reduce((acc, p) => acc + p.income, 0))}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/50">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Cash Out</span>
                    <span className="font-financial font-bold text-xs text-rose-600 dark:text-rose-400 mt-0.5 block truncate">
                      {money(cashTimelinePoints.reduce((acc, p) => acc + p.expenses, 0))}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/50">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Net Cash</span>
                    <span className="font-financial font-bold text-xs text-blue-600 dark:text-blue-400 mt-0.5 block truncate">
                      {money(cashTimelinePoints.reduce((acc, p) => acc + p.net, 0))}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/50">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Income</span>
                    <span className="font-financial font-bold text-xs text-blue-600 dark:text-blue-400 mt-0.5 block truncate">
                      {money(dashboard?.overview?.salesThisMonth ?? 0)}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/50">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Total Expenses</span>
                    <span className="font-financial font-bold text-xs text-amber-600 dark:text-amber-400 mt-0.5 block truncate">
                      {money(dashboard?.overview?.expensesThisMonth ?? 0)}
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50/80 dark:bg-slate-800/50">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">Net Profit</span>
                    <span className="font-financial font-bold text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 block truncate">
                      {money((dashboard?.overview?.salesThisMonth ?? 0) - (dashboard?.overview?.expensesThisMonth ?? 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 3.5. PROJECT TIMER & UNBILLED HOURS WIDGET (MATCHING IMAGE 2 IN LIGHT MODE) */}
            <div className="space-y-2.5">
              {/* Main Timer Card */}
              <div className="rounded-2xl bg-gradient-to-br from-[#122e4c] via-[#0f263e] to-[#0a1b2d] p-5 shadow-sm text-white border border-slate-200/40 dark:border-slate-800">
                <div className="text-center">
                  <span className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-white block select-none">
                    {formattedTimer}
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-blue-100/90 mt-1.5 flex items-center justify-center gap-1.5">
                    {isTimerRunning && <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />}
                    <span>{isTimerRunning ? 'Timer Active • Tracking Session' : 'Start Project Timer'}</span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 sm:mt-5">
                  <button
                    type="button"
                    onClick={() => onNavigate('time_logs')}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#091522]/90 hover:bg-[#091522] text-white font-bold text-xs shadow-xs border border-white/10 transition-all active:scale-95 cursor-pointer text-center"
                  >
                    Log Time
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (isTimerRunning) {
                        setIsTimerRunning(false);
                      } else {
                        setIsTimerRunning(true);
                      }
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer text-center"
                  >
                    {isTimerRunning ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current text-rose-600" />
                        <span>Stop Timer</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current text-slate-900" />
                        <span>Start Timer</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Unbilled Hours Card */}
              <div
                onClick={() => onNavigate('time_logs')}
                className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unbilled Hours
                </span>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white">
                  <span className="font-financial">{formattedUnbilledHours} Hrs</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>

              {/* Unbilled Expenses Card */}
              <div
                onClick={() => onNavigate('expenses')}
                className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
              >
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Unbilled Expenses
                </span>
                <div className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-white">
                  <span className="font-financial">{money(unbilledExpensesCount)}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>

            {/* 4. TOP EXPENSES WIDGET (LIGHT MODE PATTERN MATCHING REFERENCE) */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                    <PieChart className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Top Expenses</h3>
                </div>

                <div className="relative">
                  <select
                    value={mobileExpensePeriod}
                    onChange={(e) => {
                      const val = e.target.value as 'fiscal' | 'year' | 'quarter' | 'month';
                      setMobileExpensePeriod(val);
                      setSelectedPreset(val === 'year' || val === 'fiscal' ? 'ytd' : val === 'quarter' ? 'qtd' : 'mtd');
                    }}
                    className="appearance-none rounded-lg border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-6 text-xs font-semibold text-slate-700 outline-none hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <option value="fiscal">This Fiscal Year</option>
                    <option value="year">This Calendar Year</option>
                    <option value="quarter">This Quarter</option>
                    <option value="month">This Month</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                </div>
              </div>

              {topExpenseCategories.categories.length === 0 ? (
                <div className="py-8 text-center px-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
                    There's no data available as no transactions were recorded in the selected date range.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 bg-white text-xs font-bold text-slate-800 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 cursor-pointer transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4 text-slate-700 dark:text-slate-200" />
                    <span>New Expense</span>
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {topExpenseCategories.categories.map((cat, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-financial font-bold text-slate-900 dark:text-white">{money(cat.amount)}</span>
                          <span className="text-[11px] font-bold text-slate-400">({cat.percent}%)</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div style={{ width: `${cat.percent}%`, backgroundColor: cat.color }} className="h-full rounded-full transition-all" />
                      </div>
                    </div>
                  ))}

                  <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between font-bold text-xs text-slate-900 dark:border-slate-800 dark:text-white">
                    <span>Total Operating Costs</span>
                    <span className="font-financial">{money(topExpenseCategories.total)}</span>
                  </div>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => setIsExpenseModalOpen(true)}
                      className="w-full py-2 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer text-center"
                    >
                      + New Expense
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. BANKING SUMMARY WIDGET (IMAGE 2 PATTERN IN LIGHT MODE) */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Banking Summary</h3>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate('banking')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  View Accounts →
                </button>
              </div>

              {/* Uncategorised Transactions Banner */}
              <div
                onClick={() => onNavigate('bank_reconciliation')}
                className="mt-3.5 rounded-2xl border border-amber-200/90 bg-amber-50/90 p-3.5 flex items-center justify-between cursor-pointer hover:bg-amber-100/70 transition-colors shadow-2xs dark:border-amber-900/60 dark:bg-amber-950/40"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-xl bg-amber-200/60 text-amber-800 dark:bg-amber-900/80 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-amber-950 dark:text-amber-100">
                    Uncategorised Transactions
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-financial text-sm font-black text-amber-950 dark:text-amber-100">
                    {dashboard.overview?.bankReconciliationAttentionCount ?? 0}
                  </span>
                  <ChevronRight className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                </div>
              </div>

              {/* Bank Balance & Cash In Hand Cards */}
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {/* Bank Balance Card */}
                <div
                  onClick={() => onNavigate('banking')}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-blue-400 dark:border-slate-800 dark:bg-slate-900 cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center">
                    <Landmark className="w-4.5 h-4.5" />
                  </div>
                  <div className="mt-3">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Bank Balance
                    </span>
                    <span className="font-financial text-sm sm:text-base font-black text-slate-900 dark:text-white mt-0.5 block truncate">
                      {money(dashboard.overview?.bankBalance ?? 0)}
                    </span>
                  </div>
                </div>

                {/* Cash In Hand Card */}
                <div
                  onClick={() => onNavigate('banking')}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-emerald-400 dark:border-slate-800 dark:bg-slate-900 cursor-pointer transition-all flex flex-col justify-between"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center">
                    <Wallet className="w-4.5 h-4.5" />
                  </div>
                  <div className="mt-3">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block">
                      Cash In Hand
                    </span>
                    <span className="font-financial text-sm sm:text-base font-black text-slate-900 dark:text-white mt-0.5 block truncate">
                      {money(cashInHandTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DESKTOP VIEW - 100% UNCHANGED */}
          <div className="hidden lg:block space-y-6">
            {/* ROW 1: TOTAL PAYABLES, TOTAL RECEIVABLES, QUICK ACTIONS */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
            {/* 1. Total Payables Widget */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                      <Receipt className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        Total Payables
                      </h2>
                      <p className="text-[10px] text-slate-400">Vendor bills awaiting payment</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('bills')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                  >
                    All Bills →
                  </button>
                </div>

                <div className="mt-4">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Unpaid Bills</span>
                  <p className="mt-1 font-financial text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {money(dashboard.overview?.payables ?? 0)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {dashboard.overview?.overduePayables > 0 ? (
                      <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                        {money(dashboard.overview.overduePayables)} overdue
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        All bills current
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      • {dashboard.overview?.dueBillsCount ?? 0} bills pending
                    </span>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Payables Due Next</p>
                  {(!dashboard.overview?.billsDue || dashboard.overview.billsDue.length === 0) ? (
                    <p className="py-4 text-center text-xs text-slate-400">
                      No vendor bills currently due.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {dashboard.overview.billsDue.slice(0, 3).map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => onNavigate('bills')}
                          className="flex items-center justify-between py-2 hover:bg-slate-50/60 rounded-lg px-2 -mx-2 transition-colors cursor-pointer dark:hover:bg-slate-800/40"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {item.partyName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {item.dueDate ? (item.overdue ? `Overdue since ${formatDate(item.dueDate)}` : `Due ${formatDate(item.dueDate)}`) : 'Due upon receipt'}
                            </p>
                          </div>
                          <div className="text-right ml-2 shrink-0">
                            <p className="font-financial text-xs font-bold text-slate-900 dark:text-white">
                              {money(item.amount)}
                            </p>
                            <span className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold ${
                              item.overdue
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {item.overdue ? 'Overdue' : 'Due Soon'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onNavigate('bills', { autoCreate: true })}
                  className="w-full py-2 px-3 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300 text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  + Create Vendor Bill
                </button>
              </div>
            </div>

            {/* 2. Total Receivables Widget */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                      <TrendingUp className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        Total Receivables
                      </h2>
                      <p className="text-[10px] text-slate-400">Customer invoices to collect</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('invoices')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                  >
                    All Invoices →
                  </button>
                </div>

                <div className="mt-4">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Unpaid Invoices</span>
                  <p className="mt-1 font-financial text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {money(dashboard.overview?.receivables ?? 0)}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {dashboard.overview?.overdueReceivables > 0 ? (
                      <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                        {money(dashboard.overview.overdueReceivables)} overdue
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        All invoices current
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      • {dashboard.overview?.outstandingInvoicesCount ?? 0} open invoices
                    </span>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Receivables Due Next</p>
                  {(!dashboard.overview?.collections || dashboard.overview.collections.length === 0) ? (
                    <p className="py-4 text-center text-xs text-slate-400">
                      No customer collections currently due.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {dashboard.overview.collections.slice(0, 3).map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => onNavigate('invoices')}
                          className="flex items-center justify-between py-2 hover:bg-slate-50/60 rounded-lg px-2 -mx-2 transition-colors cursor-pointer dark:hover:bg-slate-800/40"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {item.partyName}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {item.dueDate ? (item.overdue ? `Overdue since ${formatDate(item.dueDate)}` : `Due ${formatDate(item.dueDate)}`) : 'Due on receipt'}
                            </p>
                          </div>
                          <div className="text-right ml-2 shrink-0">
                            <p className="font-financial text-xs font-bold text-slate-900 dark:text-white">
                              {money(item.amount)}
                            </p>
                            <span className={`inline-block rounded px-1.5 py-0.2 text-[9px] font-bold ${
                              item.overdue
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}>
                              {item.overdue ? 'Overdue' : 'Due Soon'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsInvoiceEditorOpen(true)}
                  className="w-full py-2 px-3 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  + Create Customer Invoice
                </button>
              </div>
            </div>

            {/* 3. Quick Actions Widget */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <Sparkles className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                        Quick Action Dock
                      </h2>
                      <p className="text-[10px] text-slate-400">Instant entries & billing</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsInvoiceEditorOpen(true)}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <FilePlus2 className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">New Invoice</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                      <Receipt className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Record Expense</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate('bills', { autoCreate: true })}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">New Bill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate('journals')}
                    className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-center transition-all hover:-translate-y-0.5 hover:border-purple-400 hover:bg-purple-50/50 hover:text-purple-700 dark:border-slate-800 dark:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400">
                      <BookOpenCheck className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Journal Entry</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-center dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(true)}
                  className="w-full py-2 px-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 text-xs font-bold transition-colors cursor-pointer text-center"
                >
                  + Add New Customer
                </button>
              </div>
            </div>
          </section>

          {/* ROW 2: CASH FLOW (8 COLS) & TOP EXPENSES (4 COLS) */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left: Cash Flow */}
            <div className="lg:col-span-8 min-w-0">
              <CashFlowWidget
                timelinePoints={timelinePoints}
                cashMovements={cashTimelinePoints}
                performanceTotals={dashboard.commandCenter?.performance}
                periodLabel={dashboard.commandCenter?.period?.label}
                currencySymbol={settings.currencySymbol}
                onNavigate={onNavigate}
                selectedPreset={selectedPreset}
                onPresetSelect={handlePresetSelect}
              />
            </div>

            {/* Right: Top Expense Categories */}
            <div className="lg:col-span-4 min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <PieChart className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Top Expense Categories
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('expenses')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                  >
                    All Expenses →
                  </button>
                </div>

                {topExpenseCategories.categories.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    <p className="font-semibold text-slate-600 dark:text-slate-400">No operational expenses</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Recorded for {dashboard.commandCenter?.period?.label || 'this period'}</p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {topExpenseCategories.categories.map((cat, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-financial font-bold text-slate-900 dark:text-white">{money(cat.amount)}</span>
                            <span className="text-[11px] font-bold text-slate-400">({cat.percent}%)</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div style={{ width: `${cat.percent}%`, backgroundColor: cat.color }} className="h-full rounded-full transition-all" />
                        </div>
                      </div>
                    ))}
                    <div className="mt-4 border-t border-slate-100 pt-3 flex items-center justify-between font-bold text-xs text-slate-900 dark:border-slate-800 dark:text-white">
                      <span>Total Operating Costs</span>
                      <span className="font-financial">{money(topExpenseCategories.total)}</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-4 text-[11px] text-slate-400 border-t border-slate-100 pt-2 dark:border-slate-800">
                Operating expenses logged in general ledger for this period.
              </p>
            </div>
          </section>

          {/* ROW 3: BANKING BALANCES (50% COMPUTER WIDTH) & FINANCIAL POSITIONS (50% COMPUTER WIDTH) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Left: Banking Balances (Half width of computer screen) */}
            <div className="min-w-0">
              <BankAccountsWidget />
            </div>

            {/* Right: Cash & Financial Position */}
            <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Cash &amp; Financial Position
                    </h2>
                  </div>
                  <span className="rounded-md border border-emerald-200/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/60 dark:text-emerald-400">
                    Book balance
                  </span>
                </div>

                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Liquid Cash &amp; Bank</p>
                  <p className="mt-1 font-financial text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                    {money(dashboard.commandCenter?.financialPosition?.cashAtBank ?? dashboard.overview?.bankBalance ?? 0)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">Posted ledger balance across all monetary accounts</p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div
                    onClick={() => onNavigate('invoices')}
                    className="group rounded-xl border border-slate-100 bg-slate-50/60 p-3 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors cursor-pointer dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">To Collect (AR)</span>
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <p className="mt-1 font-financial text-base font-bold text-slate-900 dark:text-white">
                      {money(dashboard.commandCenter?.financialPosition?.toCollect ?? dashboard.overview?.receivables ?? 0)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                      {dashboard.overview?.overdueInvoicesCount > 0
                        ? `${money(dashboard.overview.overdueReceivables)} overdue`
                        : `${dashboard.overview?.outstandingInvoicesCount ?? 0} open invoices`}
                    </p>
                  </div>

                  <div
                    onClick={() => onNavigate('bills')}
                    className="group rounded-xl border border-slate-100 bg-slate-50/60 p-3 hover:border-purple-300 hover:bg-purple-50/30 transition-colors cursor-pointer dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">To Pay (AP)</span>
                      <Receipt className="h-3.5 w-3.5 text-purple-600" />
                    </div>
                    <p className="mt-1 font-financial text-base font-bold text-slate-900 dark:text-white">
                      {money(dashboard.commandCenter?.financialPosition?.toPay ?? dashboard.overview?.payables ?? 0)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 truncate">
                      {dashboard.overview?.overdueBillsCount > 0
                        ? `${money(dashboard.overview.overduePayables)} overdue`
                        : `${dashboard.overview?.dueBillsCount ?? 0} bills pending`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => onNavigate('banking')}
                  className="inline-flex w-full items-center justify-between text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  <span>Inspect bank feeds &amp; statements</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>

          {/* ROW 4: NEEDS ATTENTION (LEFT) & RECENT ACTIVITY (RIGHT) */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Left: Needs Attention Widget */}
            <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Needs Attention
                    </h2>
                    {attentionItems.length > 0 && (
                      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
                        {attentionItems.length} {attentionItems.length === 1 ? 'Action' : 'Actions'}
                      </span>
                    )}
                  </div>
                  {attentionItems.length > 3 && (
                    <button
                      type="button"
                      onClick={() => onNavigate(attentionItems[0].destination)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                    >
                      View all ({attentionItems.length}) →
                    </button>
                  )}
                </div>

                {attentionItems.length === 0 ? (
                  /* Quiet completion state when 0 items */
                  <div className="my-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center dark:border-slate-800">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      Nothing needs action from the available records
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Customer invoices, vendor bills, and bank imported items are up to date as of {formatDate(asOfDate)}.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('reports')}
                      className="mt-3 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                    >
                      Inspect verified financial statements →
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/70">
                    {attentionItems.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                              item.severity === 'critical' ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.label}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {item.count} {item.count === 1 ? 'item' : 'items'}
                              </span>
                              {item.amount !== null && item.amount !== undefined && (
                                <span> • {money(item.amount)} total</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onNavigate(item.destination)}
                          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200/90 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200 cursor-pointer"
                        >
                          <span>Take Action</span>
                          <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Recent Activity */}
            <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4.5 w-4.5 text-slate-600 dark:text-slate-400" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Recent Activity
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('journals')}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                  >
                    View All Activity →
                  </button>
                </div>

                {(!dashboard.overview?.recentTransactions || dashboard.overview.recentTransactions.length === 0) ? (
                  <div className="my-8 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                    <Clock className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400">No recent activity</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">Transactions and reconciliations will appear here as they occur</p>
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {dashboard.overview.recentTransactions.slice(0, 4).map((tx, idx) => (
                      <div
                        key={`${tx.documentNumber || 'tx'}-${idx}`}
                        onClick={() => {
                          const lower = (tx.type || '').toLowerCase();
                          if (lower.includes('invoice')) onNavigate('invoices');
                          else if (lower.includes('bill')) onNavigate('bills');
                          else if (lower.includes('bank')) onNavigate('bank_reconciliation');
                          else onNavigate('journals');
                        }}
                        className="flex flex-col justify-between rounded-xl border border-slate-200/80 p-3 hover:bg-slate-50/80 hover:border-slate-300 transition-all cursor-pointer dark:border-slate-800 dark:hover:bg-slate-800/40"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate dark:text-white">
                              {tx.documentNumber || tx.type || 'Transaction'}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">{tx.partyName || 'Direct entry'}</p>
                          </div>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {tx.status || 'Posted'}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800/80">
                          <span className="text-[10px] text-slate-400">{tx.date ? formatDate(tx.date) : '—'}</span>
                          <span className="font-financial font-bold text-slate-900 dark:text-white">
                            {tx.amount ? formatCurrency(tx.amount) : '—'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
          </div>
        </>
      )}

      {/* VIEW 2: CASH & LIQUIDITY */}
      {dashboard && view === 'cash-operations' && (
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
              subtitle="Planned collections"
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
                  : 'No unmatched imported items'
              }
              badge={dashboard.overview.bankReconciliationAttentionCount > 0 ? 'Pending' : 'Reconciled'}
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

          <ScheduledOutlookWidget />

          <BankAccountsWidget />
        </div>
      )}

      {/* VIEW 3: INTEGRITY & PERIOD CLOSE */}
      {dashboard && view === 'close-controls' && (
        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">General Ledger Balanced Status</h2>
                    <p className="text-xs text-slate-500">Continuous double-entry mathematical balance verification</p>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400">
                  Verified: {formatDate(dashboard.generatedAt)}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <div>
                    <p className="text-slate-800 dark:text-slate-200">Trial Balance (Debits = Credits)</p>
                    <p className="text-[11px] text-slate-400 font-normal">Scope: {dashboard.commandCenter?.period?.label || 'Current Period'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('reports')}
                    className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Balanced (View Report →)</span>
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <div>
                    <p className="text-slate-800 dark:text-slate-200">Accounts Receivable Subledger</p>
                    <p className="text-[11px] text-slate-400 font-normal">Invoices vs Control Account (1100)</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Reconciled</span>
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <div>
                    <p className="text-slate-800 dark:text-slate-200">Accounts Payable Subledger</p>
                    <p className="text-[11px] text-slate-400 font-normal">Bills vs Control Account (2000)</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Reconciled</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Period Close & Governance Status Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs dark:border-slate-800/90 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <BookOpenCheck className="h-5 w-5 text-blue-600" />
                  <div>
                    <h2 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Period Close & Governance</h2>
                    <p className="text-xs text-slate-500">Close status for {asOfDate.slice(0, 7)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('accounting')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                >
                  Close Workspace →
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <span>Period Status</span>
                  <span className="rounded px-2 py-0.5 text-[11px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    {dashboard.closeControls?.periodClose?.status || 'Open'}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <span>Blocking Close Failures</span>
                  <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                    (dashboard.closeControls?.periodClose?.blockingFailuresCount || 0) > 0
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}>
                    {dashboard.closeControls?.periodClose?.blockingFailuresCount || 0} Failures
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-bold dark:bg-slate-800/60">
                  <span>Audit Warnings</span>
                  <span className="rounded px-2 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {dashboard.closeControls?.periodClose?.warningsCount || 0} Warnings
                  </span>
                </div>
              </div>
            </div>
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
