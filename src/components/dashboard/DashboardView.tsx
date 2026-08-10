import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  Bell,
  Briefcase,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Plus,
  Receipt,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import {
  DashboardCustomizerModal,
  DEFAULT_WIDGETS,
  WidgetConfig,
} from './DashboardCustomizerModal';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { ExpenseModal } from '../expenses/ExpenseModal';
import { ClientModal } from '../clients/ClientModal';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab, options?: { autoCreate?: boolean }) => void;
  onOpenQuickCreate?: () => void;
  onSelectProject?: (projectId: string) => void;
}

const STORAGE_KEY = 'ca_books_dashboard_widgets_v3';

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenQuickCreate,
  onSelectProject,
}) => {
  const {
    settings,
    accounts,
    invoices,
    expenses,
    bills,
    projects,
    clients,
    timeEntries,
    getProjectSummary,
  } = useBooks();

  // Mobile Dashboard & Widget Customization State
  const [mobileTab, setMobileTab] = useState<'dashboard' | 'announcements' | 'help'>('dashboard');
  const [cashFlowPeriod, setCashFlowPeriod] = useState<'fiscal' | 'six_months'>('fiscal');
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [widgets, setWidgets] = useState<WidgetConfig[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Merge missing default widgets if any new category added
          const existingIds = new Set(parsed.map((w: WidgetConfig) => w.id));
          const missing = DEFAULT_WIDGETS.filter((w) => !existingIds.has(w.id));
          return [...parsed, ...missing];
        }
      }
    } catch (e) {
      console.error('Failed to parse saved dashboard layout', e);
    }
    return DEFAULT_WIDGETS;
  });

  const handleSaveWidgets = (updatedWidgets: WidgetConfig[]) => {
    setWidgets(updatedWidgets);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedWidgets));
    } catch (e) {
      console.error('Failed to save dashboard layout', e);
    }
  };

  // Financial Metric Calculations
  const bankAccounts = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Bank' ||
        a.subType === 'Cash' ||
        a.subType === 'Cash & Bank' ||
        (a.type === 'Asset' && (a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash')))
    );
  }, [accounts]);

  const cashAccounts = useMemo(() => {
    return accounts.filter((a) => a.subType === 'Cash' || a.subType === 'Cash & Bank');
  }, [accounts]);

  const creditCardAccounts = useMemo(() => {
    return accounts.filter((a) => a.subType === 'Credit Cards');
  }, [accounts]);

  const totalBankBalance = useMemo(
    () => bankAccounts.filter((a) => a.subType === 'Bank').reduce((sum, a) => sum + a.balance, 0),
    [bankAccounts]
  );
  const totalCashBalance = useMemo(
    () => cashAccounts.reduce((sum, a) => sum + a.balance, 0),
    [cashAccounts]
  );
  const totalCreditBalance = useMemo(
    () => creditCardAccounts.reduce((sum, a) => sum + a.balance, 0),
    [creditCardAccounts]
  );

  const totalCashBank = useMemo(
    () => bankAccounts.reduce((sum, a) => sum + a.balance, 0),
    [bankAccounts]
  );

  const totalInvoiced = invoices
    .filter((i) => i.status !== 'Void')
    .reduce((sum, i) => sum + i.totalAmount, 0);

  const totalCollected = invoices
    .filter((i) => i.status !== 'Void')
    .reduce((sum, i) => sum + i.paidAmount, 0);

  const accountsReceivable = invoices
    .filter((i) => i.status !== 'Void')
    .reduce((sum, i) => sum + i.balanceDue, 0);

  const overdueReceivables = invoices
    .filter((i) => i.status === 'Overdue')
    .reduce((sum, i) => sum + i.balanceDue, 0);

  const currentReceivables = accountsReceivable - overdueReceivables;

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netOperatingProfit = totalInvoiced - totalExpenses;

  // Unbilled Billable Hours
  const unbilledTimeEntries = timeEntries.filter((t) => t.isBillable && !t.isBilled);
  const totalUnbilledAmount = unbilledTimeEntries.reduce((sum, t) => sum + t.hours * t.hourlyRate, 0);

  const overdueInvoicesCount = useMemo(() => {
    return invoices.filter((i) => i.status === 'Overdue').length;
  }, [invoices]);

  const overdueBillsCount = useMemo(() => {
    return bills ? bills.filter((b) => b.status === 'Overdue').length : 0;
  }, [bills]);

  const totalPayables = useMemo(() => {
    const billsUnpaid = bills
      ? bills
          .filter((b) => b.status !== 'Void' && b.status !== 'Paid')
          .reduce((sum, b) => sum + (b.balanceDue ?? (b.totalAmount - (b.paidAmount || 0))), 0)
      : 0;
    return billsUnpaid > 0 ? billsUnpaid : totalExpenses;
  }, [bills, totalExpenses]);

  // Income vs Expense Chart Data - dynamically aggregated from real-time invoices & expenses
  const monthlyData = useMemo(() => {
    const monthsMap: Record<string, { month: string; Income: number; Expense: number; timestamp: number }> = {};

    // Generate baseline for last 5 months
    const now = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = d.toLocaleString('en-US', { month: 'short' });
      const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsMap[yearMonth] = {
        month: monthKey,
        Income: 0,
        Expense: 0,
        timestamp: d.getTime(),
      };
    }

    // Aggregate Invoices (Income)
    invoices.forEach((inv) => {
      if (inv.status !== 'Void' && inv.issueDate) {
        const dateObj = new Date(inv.issueDate);
        if (!isNaN(dateObj.getTime())) {
          const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          if (!monthsMap[yearMonth]) {
            monthsMap[yearMonth] = {
              month: dateObj.toLocaleString('en-US', { month: 'short' }),
              Income: 0,
              Expense: 0,
              timestamp: dateObj.getTime(),
            };
          }
          monthsMap[yearMonth].Income += inv.totalAmount;
        }
      }
    });

    // Aggregate Expenses
    expenses.forEach((exp) => {
      if (exp.date) {
        const dateObj = new Date(exp.date);
        if (!isNaN(dateObj.getTime())) {
          const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          if (!monthsMap[yearMonth]) {
            monthsMap[yearMonth] = {
              month: dateObj.toLocaleString('en-US', { month: 'short' }),
              Income: 0,
              Expense: 0,
              timestamp: dateObj.getTime(),
            };
          }
          monthsMap[yearMonth].Expense += exp.amount;
        }
      }
    });

    return Object.values(monthsMap)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-6);
  }, [invoices, expenses]);

  // Top Expenses Pie Chart Data
  const PIE_COLORS = [
    '#4f46e5', // Indigo
    '#06b6d4', // Cyan
    '#f59e0b', // Amber
    '#f43f5e', // Rose
    '#10b981', // Emerald
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#64748b', // Slate
  ];

  const topExpensesData = useMemo(() => {
    const categoryMap: Record<string, number> = {};

    expenses.forEach((e) => {
      const cat = e.accountName || e.description || 'General Operating Expense';
      categoryMap[cat] = (categoryMap[cat] || 0) + e.amount;
    });

    const sorted = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (sorted.length === 0) {
      return [
        { name: 'Rent & Facilities', value: 4500 },
        { name: 'Software & Cloud', value: 2800 },
        { name: 'Professional Fees', value: 2100 },
        { name: 'Office Supplies', value: 1200 },
        { name: 'Marketing & Adverts', value: 950 },
      ];
    }

    if (sorted.length > 5) {
      const top5 = sorted.slice(0, 5);
      const othersValue = sorted.slice(5).reduce((sum, item) => sum + item.value, 0);
      return [...top5, { name: 'Other Expenses', value: othersValue }];
    }

    return sorted;
  }, [expenses]);

  const totalExpensePieAmount = useMemo(() => {
    return topExpensesData.reduce((sum, item) => sum + item.value, 0);
  }, [topExpensesData]);

  // Cash Flow Analysis Data Breakdown
  const cashFlowAnalysisData = useMemo(() => {
    const monthsMap: Record<
      string,
      {
        month: string;
        inflow: number;
        outflow: number;
        netFlow: number;
        timestamp: number;
      }
    > = {};

    const now = new Date();

    if (cashFlowPeriod === 'six_months') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = d.toLocaleString('en-US', { month: 'short' });
        const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthsMap[yearMonth] = {
          month: monthKey,
          inflow: 0,
          outflow: 0,
          netFlow: 0,
          timestamp: d.getTime(),
        };
      }
    } else {
      // Fiscal Year Calculation
      // Default fiscal year start month is 4 (April) unless specified
      const startMonth = parseInt(String(settings.fiscalYearStart || '4'), 10) || 4; // 1-12
      const currentMonth = now.getMonth() + 1; // 1-12
      const fiscalYearStartYear = currentMonth >= startMonth ? now.getFullYear() : now.getFullYear() - 1;

      for (let i = 0; i < 12; i++) {
        const monthIndex = (startMonth - 1 + i) % 12;
        const yearOffset = Math.floor((startMonth - 1 + i) / 12);
        const year = fiscalYearStartYear + yearOffset;
        const d = new Date(year, monthIndex, 1);
        const monthKey = d.toLocaleString('en-US', { month: 'short' });
        const yearMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
        monthsMap[yearMonth] = {
          month: monthKey,
          inflow: 0,
          outflow: 0,
          netFlow: 0,
          timestamp: d.getTime(),
        };
      }
    }

    // Inflows from collected invoices
    invoices.forEach((inv) => {
      if (inv.status !== 'Void' && inv.issueDate) {
        const dateObj = new Date(inv.issueDate);
        if (!isNaN(dateObj.getTime())) {
          const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          if (monthsMap[yearMonth]) {
            monthsMap[yearMonth].inflow += inv.paidAmount || (inv.status === 'Paid' ? inv.totalAmount : inv.paidAmount);
          }
        }
      }
    });

    // Outflows from expenses
    expenses.forEach((exp) => {
      if (exp.date) {
        const dateObj = new Date(exp.date);
        if (!isNaN(dateObj.getTime())) {
          const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          if (monthsMap[yearMonth]) {
            monthsMap[yearMonth].outflow += exp.amount;
          }
        }
      }
    });

    // Calculate Net Flow
    Object.keys(monthsMap).forEach((key) => {
      monthsMap[key].netFlow = monthsMap[key].inflow - monthsMap[key].outflow;
    });

    return Object.values(monthsMap).sort((a, b) => a.timestamp - b.timestamp);
  }, [invoices, expenses, cashFlowPeriod, settings.fiscalYearStart]);

  const totalInflowPeriod = useMemo(
    () => cashFlowAnalysisData.reduce((sum, m) => sum + m.inflow, 0),
    [cashFlowAnalysisData]
  );
  const totalOutflowPeriod = useMemo(
    () => cashFlowAnalysisData.reduce((sum, m) => sum + m.outflow, 0),
    [cashFlowAnalysisData]
  );
  const netCashFlowPeriod = totalInflowPeriod - totalOutflowPeriod;

  // Project Profitability Summaries
  const projectSummaries = useMemo(
    () =>
      projects.map((p) => ({
        ...p,
        summary: getProjectSummary(p.id),
      })),
    [projects, getProjectSummary]
  );

  const arPercentCurrent =
    accountsReceivable > 0 ? Math.round((currentReceivables / accountsReceivable) * 100) : 100;
  const arPercentOverdue = 100 - arPercentCurrent;

  // Render Widget Helper
  const renderWidget = (widget: WidgetConfig) => {
    if (!widget.enabled) return null;

    switch (widget.id) {
      case 'cash_flow_analysis':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 font-bold text-[10px] uppercase px-2 py-0.5 rounded">
                      Financial Performance
                    </span>
                    <span className="text-xs text-slate-400">Inflow vs Outflow Analysis</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">Cash Flow Analysis</h3>
                </div>

                <div className="flex items-center space-x-2">
                  <select
                    value={cashFlowPeriod}
                    onChange={(e) => setCashFlowPeriod(e.target.value as any)}
                    className="text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-700 dark:text-slate-200 focus:outline-hidden cursor-pointer"
                  >
                    <option value="fiscal">This Fiscal Year</option>
                    <option value="six_months">Last 6 Months</option>
                  </select>
                  <button
                    onClick={() => onNavigate('reports')}
                    className="p-1.5 text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold"
                  >
                    Statement →
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 block">Total Cash Inflow</span>
                  <span className="text-base font-black font-mono text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(totalInflowPeriod, settings.currencySymbol)}
                  </span>
                </div>
                <div className="bg-rose-50/70 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900/50">
                  <span className="text-[10px] uppercase font-bold text-rose-800 dark:text-rose-400 block">Total Cash Outflow</span>
                  <span className="text-base font-black font-mono text-rose-700 dark:text-rose-300">
                    {formatCurrency(totalOutflowPeriod, settings.currencySymbol)}
                  </span>
                </div>
                <div className={`p-3 rounded-xl border ${
                  netCashFlowPeriod >= 0
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50'
                    : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50'
                }`}>
                  <span className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-400 block">Net Cash Flow</span>
                  <span className={`text-base font-black font-mono ${
                    netCashFlowPeriod >= 0 ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'
                  }`}>
                    {netCashFlowPeriod >= 0 ? '+' : ''}{formatCurrency(netCashFlowPeriod, settings.currencySymbol)}
                  </span>
                </div>
              </div>

              {/* Bar Chart */}
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashFlowAnalysisData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                    <Tooltip
                      formatter={(val: number) => formatCurrency(val, settings.currencySymbol)}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        color: '#ffffff',
                        borderRadius: '12px',
                        fontSize: '11px',
                      }}
                    />
                    <Bar dataKey="inflow" fill="#10b981" name="Inflow (Revenue)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outflow" fill="#f43f5e" name="Outflow (Expense)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );

      case 'top_expenses_pie':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-slate-900 dark:text-white font-bold text-base">Top Expenses Breakdown</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Distribution by operating category</p>
                </div>
                <button
                  onClick={() => onNavigate('expenses')}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View Expenses →
                </button>
              </div>

              {/* Pie Chart & Legend Container */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                <div className="sm:col-span-6 h-52 relative flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={topExpensesData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {topExpensesData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: number) => [
                          formatCurrency(val, settings.currencySymbol),
                          'Amount',
                        ]}
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#1e293b',
                          color: '#ffffff',
                          borderRadius: '12px',
                          fontSize: '11px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Stat */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Total</span>
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                      {formatCurrency(totalExpensePieAmount, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Legend Breakdown */}
                <div className="sm:col-span-6 space-y-2 text-xs">
                  {topExpensesData.map((item, idx) => {
                    const percent =
                      totalExpensePieAmount > 0
                        ? Math.round((item.value / totalExpensePieAmount) * 100)
                        : 0;
                    return (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2 truncate pr-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                          />
                          <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {formatCurrency(item.value, settings.currencySymbol)}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-1 font-mono">({percent}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );

      case 'receivables':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-2xs h-full">
            <div className="space-y-4">
              {/* Receivables Section */}
              <div>
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-blue-600 dark:text-blue-400 block">
                      Accounts Receivable
                    </span>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Total Receivables</h3>
                  </div>
                  <button
                    onClick={() => onNavigate('invoices')}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Invoices →
                  </button>
                </div>

                <div className="text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                  {formatCurrency(accountsReceivable, settings.currencySymbol)}
                </div>

                <div className="mt-2.5 space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-slate-400 uppercase tracking-wider font-bold text-[9px]">Current</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatCurrency(currentReceivables, settings.currencySymbol)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${arPercentCurrent}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-slate-400 uppercase tracking-wider font-bold text-[9px]">Overdue</span>
                      <span className="font-mono font-bold text-rose-500">
                        {formatCurrency(overdueReceivables, settings.currencySymbol)}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${arPercentOverdue}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Payables Section */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-rose-600 dark:text-rose-400 block">
                      Accounts Payable
                    </span>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Total Payables</h3>
                  </div>
                  <button
                    onClick={() => onNavigate('expenses')}
                    className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
                  >
                    Expenses →
                  </button>
                </div>

                <div className="text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                  {formatCurrency(totalPayables, settings.currencySymbol)}
                </div>

                <div className="mt-2.5 p-2.5 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-100 dark:border-rose-900/50 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-bold text-rose-900 dark:text-rose-200 block text-[11px]">Overdue Bills</span>
                    <span className="text-[10px] text-rose-700 dark:text-rose-400">
                      {overdueBillsCount} {overdueBillsCount === 1 ? 'bill requires' : 'bills require'} settlement
                    </span>
                  </div>
                  <button
                    onClick={() => onNavigate('expenses')}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] transition-colors cursor-pointer"
                  >
                    Settle
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case 'quick_actions':
        return (
          <div key={widget.id} className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Quick Actions</h3>
                <div className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm">
                  ⚡
                </div>
              </div>
              <p className="text-blue-100 text-xs mt-1">Instant double-entry & billing actions.</p>
            </div>

            <div className="flex flex-col gap-2.5 mt-6">
              <button
                onClick={() => setIsInvoiceEditorOpen(true)}
                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl border border-white/15 transition-all text-left cursor-pointer"
              >
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
                  +
                </div>
                <div>
                  <span className="text-xs font-bold block">New Invoice</span>
                  <span className="text-[10px] text-blue-100">Bill a client project</span>
                </div>
              </button>

              <button
                onClick={() => setIsExpenseModalOpen(true)}
                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl border border-white/15 transition-all text-left cursor-pointer"
              >
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
                  $
                </div>
                <div>
                  <span className="text-xs font-bold block">Log Expense</span>
                  <span className="text-[10px] text-blue-100">Record vendor cost</span>
                </div>
              </button>

              <button
                onClick={() => setIsClientModalOpen(true)}
                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl border border-white/15 transition-all text-left cursor-pointer"
              >
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center font-bold text-sm">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold block">New Customer</span>
                  <span className="text-[10px] text-blue-100">Add client profile</span>
                </div>
              </button>
            </div>
          </div>
        );

      case 'cash_reserves':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl p-6 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-[11px] uppercase font-bold tracking-widest text-slate-500 dark:text-slate-400">
                    Operating Cash Flow
                  </span>
                </div>
                <span className="text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-200 dark:border-slate-700">
                  Real-time Ledger
                </span>
              </div>

              <div className="mt-4">
                <div className="text-xs text-slate-500 dark:text-slate-400">Liquid Reserves & Bank Accounts</div>
                <div className="text-3xl sm:text-4xl font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatCurrency(totalCashBank, settings.currencySymbol)}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold block">
                    Net Operating Profit
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-100 text-base">
                    {formatCurrency(netOperatingProfit, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold block">
                    Unbilled Time (WIP)
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400 text-base">
                    {formatCurrency(totalUnbilledAmount, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
              <span>Double-entry Verified</span>
              <span className="font-mono text-slate-500">
                {invoices.length} Invoices • {expenses.length} Expenses
              </span>
            </div>
          </div>
        );

      case 'banking_module':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 flex items-center justify-center font-bold">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-bold text-base">Banking & Cash Overview</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Live balances across operating accounts</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onNavigate('bank_reconciliation')}
                    className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Reconcile</span>
                  </button>
                  <button
                    onClick={() => onNavigate('banking')}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                  >
                    <span>Open Banking</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Bank */}
                <div className="bg-blue-50/60 dark:bg-blue-950/40 p-3.5 rounded-xl border border-blue-100 dark:border-blue-900/60">
                  <div className="flex items-center justify-between text-blue-700 dark:text-blue-400 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Bank Accounts</span>
                    <Landmark className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-black text-slate-900 dark:text-white">
                    {formatCurrency(totalBankBalance, settings.currencySymbol)}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {bankAccounts.filter((a) => a.subType === 'Bank').length} Active Accounts
                  </span>
                </div>

                {/* Cash */}
                <div className="bg-emerald-50/60 dark:bg-emerald-950/40 p-3.5 rounded-xl border border-emerald-100 dark:border-emerald-900/60">
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Cash Drawers</span>
                    <Wallet className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-black text-slate-900 dark:text-white">
                    {formatCurrency(totalCashBalance, settings.currencySymbol)}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {cashAccounts.length} Cash & Vault Accounts
                  </span>
                </div>

                {/* Credit */}
                <div className="bg-purple-50/60 dark:bg-purple-950/40 p-3.5 rounded-xl border border-purple-100 dark:border-purple-900/60">
                  <div className="flex items-center justify-between text-purple-700 dark:text-purple-400 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider">Credit Owed</span>
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <p className="text-lg font-black text-slate-900 dark:text-white">
                    {formatCurrency(totalCreditBalance, settings.currencySymbol)}
                  </p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    {creditCardAccounts.length} Corporate Cards
                  </span>
                </div>
              </div>

              {/* Individual Account Mini-List */}
              <div className="mt-4 space-y-2">
                {bankAccounts.slice(0, 3).map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => onNavigate('banking')}
                    className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-700/80 transition-colors cursor-pointer text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{acc.name}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">#{acc.code}</span>
                    </div>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-white">
                      {formatCurrency(acc.balance, settings.currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );

      case 'selected_project': {
        const configuredProjectId = widget.config?.selectedProjectId;
        const targetProject =
          projects.find((p) => p.id === configuredProjectId) || projects[0] || null;

        if (!targetProject) {
          return (
            <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center text-slate-400">
              <FolderKanban className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">No active projects available to feature</p>
            </div>
          );
        }

        const projectSummary = getProjectSummary(targetProject.id);

        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 font-bold text-[10px] uppercase px-2 py-0.5 rounded">
                      Featured Project Deep Dive
                    </span>
                    <span className="font-mono text-xs text-slate-400">#{targetProject.code}</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1">{targetProject.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Client: {targetProject.clientName}</p>
                </div>

                <button
                  onClick={() => onSelectProject && onSelectProject(targetProject.id)}
                  className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1"
                >
                  <span>Project Details</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Grid Metrics for Featured Project */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 mb-4 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Invoiced Sales
                  </span>
                  <span className="font-mono font-black text-slate-900 dark:text-white text-sm">
                    {formatCurrency(projectSummary.totalInvoiced, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Direct Expenses
                  </span>
                  <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                    {formatCurrency(projectSummary.directExpenses, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Net Profit
                  </span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                    {formatCurrency(projectSummary.netProfit, settings.currencySymbol)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Margin
                  </span>
                  <span className="font-mono font-black text-indigo-600 dark:text-indigo-400 text-sm">
                    {projectSummary.profitMarginPercent}%
                  </span>
                </div>
              </div>

              {/* Progress bar for Hours Burned */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-slate-500 dark:text-slate-400">Logged Hours vs Budget:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {projectSummary.loggedHours} hrs / {targetProject.estimatedHours || 100} hrs budget
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((projectSummary.loggedHours / (targetProject.estimatedHours || 100)) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'projects_overview':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-slate-900 dark:text-white font-bold text-base">Active Projects Performance</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Invoiced revenue vs direct project expenses</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-indigo-500 rounded-xs"></div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Invoiced</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-slate-200 dark:bg-slate-700 rounded-xs"></div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Expenses</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {projectSummaries.slice(0, 4).map((p) => {
                  const { summary } = p;
                  const totalActivity = summary.totalInvoiced + summary.directExpenses || 1;
                  const invoicedRatio = Math.round((summary.totalInvoiced / totalActivity) * 100);
                  const expenseRatio = 100 - invoicedRatio;

                  return (
                    <div
                      key={p.id}
                      onClick={() => onSelectProject && onSelectProject(p.id)}
                      className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-500/50 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="sm:w-40">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{p.name}</div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{p.code} • {p.clientName}</div>
                      </div>

                      <div className="flex-1 h-6 flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-l-md transition-all duration-300"
                          style={{ width: `${Math.max(10, invoicedRatio)}%` }}
                          title={`Invoiced: ${formatCurrency(summary.totalInvoiced, settings.currencySymbol)}`}
                        />
                        <div
                          className="bg-slate-300 dark:bg-slate-600 h-full rounded-r-md transition-all duration-300"
                          style={{ width: `${Math.max(10, expenseRatio)}%` }}
                          title={`Expense: ${formatCurrency(summary.directExpenses, settings.currencySymbol)}`}
                        />
                      </div>

                      <div className="sm:w-28 text-right font-mono text-xs">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {formatCurrency(summary.netProfit, settings.currencySymbol)}
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${
                            summary.profitMarginPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                          }`}
                        >
                          {summary.profitMarginPercent}% Margin
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={() => onNavigate('projects')}
              className="mt-4 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 text-left cursor-pointer"
            >
              Manage All Projects & Bookkeeping →
            </button>
          </div>
        );

      case 'pnl_chart':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-slate-900 dark:text-white font-bold text-base">Revenue vs Expense Trend</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Monthly P&L breakdown</p>
                </div>
                <button
                  onClick={() => onNavigate('reports')}
                  className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
                >
                  Full P&L →
                </button>
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                    <Tooltip
                      formatter={(val: number) => formatCurrency(val, settings.currencySymbol)}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        color: '#ffffff',
                        borderRadius: '12px',
                        fontSize: '11px',
                      }}
                    />
                    <Bar dataKey="Income" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Expense" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="flex justify-around items-center pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">Gross Sales</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                <span className="font-semibold text-slate-700 dark:text-slate-300">Operating Costs</span>
              </div>
            </div>
          </div>
        );

      case 'tax_compliance':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 flex items-center justify-center font-bold">
                    <ShieldAlert className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h3 className="text-slate-900 dark:text-white font-bold text-base">Tax & Compliance Monitor</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Statutory MSME alerts, GST & TDS status</p>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('settings')}
                  className="text-xs font-bold text-amber-800 dark:text-amber-400 hover:underline"
                >
                  Configure Rules
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-900/60 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-bold text-amber-900 dark:text-amber-200 block">45-Day MSME Payment Rule Active</span>
                    <span className="text-[11px] text-amber-700 dark:text-amber-400">Section 43B(h) compliance tagging enabled</span>
                  </div>
                  <span className="text-amber-900 dark:text-amber-200 font-mono font-bold bg-amber-200/80 dark:bg-amber-900/80 px-2 py-0.5 rounded text-[10px]">
                    COMPLIANT
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">GST Output Tax</span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-white text-sm">
                      {formatCurrency(totalInvoiced * 0.18, settings.currencySymbol)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase block">Estimated TDS</span>
                    <span className="font-mono font-extrabold text-slate-900 dark:text-white text-sm">
                      {formatCurrency(totalInvoiced * 0.1, settings.currencySymbol)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'recent_invoices':
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-slate-900 dark:text-white font-bold text-base">Recent Ledger Invoices</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Latest client billing activity and payment status</p>
              </div>
              <button
                onClick={() => onNavigate('invoices')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                All Invoices
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 uppercase tracking-wider font-semibold text-[10px]">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Entity / Client</th>
                    <th className="py-2.5 px-3">Project</th>
                    <th className="py-2.5 px-3 text-right">Total Amount</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.slice(0, 5).map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono">{formatDate(inv.issueDate)}</td>
                      <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">{inv.invoiceNumber}</td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900 dark:text-white">{inv.clientName}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                        {inv.projectName || '-'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {formatCurrency(inv.totalAmount, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(inv.balanceDue, settings.currencySymbol)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`text-[10px] px-2.5 py-1 rounded-lg border font-bold uppercase ${getStatusBadgeStyle(
                            inv.status
                          )}`}
                        >
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      default:
        return (
          <div key={widget.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded">
                  {widget.category || 'CUSTOM MODULE'}
                </span>
                <span className="text-xs font-bold text-slate-400">Custom Module</span>
              </div>
              <h3 className="text-slate-900 dark:text-white font-extrabold text-base">{widget.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{widget.description}</p>

              <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
                <span>Status / Configuration</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                  ACTIVE
                </span>
              </div>
            </div>
          </div>
        );
    }
  };

  const CustomCashFlowTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const income = data.Income || 0;
      const outgoing = data.Expense || 0;
      const openingBal = totalCashBank;
      const endingBal = openingBal + income - outgoing;

      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 p-3 rounded-2xl shadow-xl text-xs min-w-[200px] z-50">
          <div className="font-bold text-slate-800 dark:text-white pb-1.5 mb-1.5 border-b border-slate-100 dark:border-slate-800">
            {label} 2026
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Opening Bal.</span>
              <span className="font-mono font-medium">{formatCurrency(openingBal, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
              <span>Income</span>
              <span className="font-mono">{formatCurrency(income, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-rose-500 dark:text-rose-400 font-medium">
              <span>Outgoing</span>
              <span className="font-mono">{formatCurrency(outgoing, settings.currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-slate-900 dark:text-white font-bold pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <span>Ending Bal.</span>
              <span className="font-mono">{formatCurrency(endingBal, settings.currencySymbol)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto bg-slate-50 dark:bg-slate-950 min-h-full font-sans text-slate-900 dark:text-slate-100">
      {/* ========================================== */}
      {/* MOBILE NATIVE DASHBOARD VIEW (lg:hidden)   */}
      {/* ========================================== */}
      <div className="block lg:hidden space-y-4 pb-8">
        {/* Mobile Header Bar */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md pt-1 pb-0 border-b border-slate-200/80 dark:border-slate-800 sticky top-0 z-20 -mx-3 px-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
              {settings.firmName || 'Sense studios design'}
            </h1>
            <button
              onClick={() => setIsCustomizerOpen(true)}
              className="relative p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Dashboard Settings & Layout"
            >
              <Bell className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full"></span>
            </button>
          </div>

          {/* Sub-Tabs Row */}
          <div className="flex items-center space-x-6 text-xs font-semibold">
            <button
              onClick={() => setMobileTab('dashboard')}
              className={`pb-2.5 transition-colors cursor-pointer ${
                mobileTab === 'dashboard'
                  ? 'text-blue-600 dark:text-blue-400 font-extrabold border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <LayoutDashboard className="w-3.5 h-3.5" />
                Dashboard
              </span>
            </button>
            <button
              onClick={() => setMobileTab('announcements')}
              className={`pb-2.5 transition-colors cursor-pointer ${
                mobileTab === 'announcements'
                  ? 'text-blue-600 dark:text-blue-400 font-extrabold border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Megaphone className="w-3.5 h-3.5" />
                Announcements
              </span>
            </button>
            <button
              onClick={() => setMobileTab('help')}
              className={`pb-2.5 transition-colors cursor-pointer ${
                mobileTab === 'help'
                  ? 'text-blue-600 dark:text-blue-400 font-extrabold border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5" />
                Help
              </span>
            </button>
          </div>
        </div>

        {mobileTab === 'dashboard' && (
          <>
            {/* 1. Top Metrics Cards: Receivables & Payables (Left), Overdue Stack (Right) */}
            <div className="grid grid-cols-12 gap-3">
              {/* Left Receivables / Payables Card */}
              <div className="col-span-7 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100/80 dark:border-blue-900/50 rounded-2xl p-3.5 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px] font-bold mb-1">
                    <span>Total Receivables</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="text-base font-black font-mono text-slate-900 dark:text-white tracking-tight">
                    {formatCurrency(accountsReceivable, settings.currencySymbol)}
                  </div>

                  <div className="my-2.5 border-t border-blue-200/60 dark:border-blue-900/60" />

                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 text-[11px] font-bold mb-1">
                    <span>Total Payables</span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                  <div className="text-base font-black font-mono text-slate-900 dark:text-white tracking-tight">
                    {formatCurrency(totalPayables, settings.currencySymbol)}
                  </div>
                </div>
              </div>

              {/* Right Stacked Overdue Cards */}
              <div className="col-span-5 flex flex-col gap-2">
                {/* Overdue Invoices */}
                <div
                  onClick={() => onNavigate('invoices')}
                  className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-100/90 dark:border-rose-900/50 rounded-2xl p-3 shadow-2xs cursor-pointer hover:bg-rose-100/60 dark:hover:bg-rose-950/70 transition-all flex flex-col justify-between h-full"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {overdueInvoicesCount}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 leading-tight">
                    Overdue Invoices
                  </span>
                </div>

                {/* Overdue Bills */}
                <div
                  onClick={() => onNavigate('expenses')}
                  className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-100/90 dark:border-rose-900/50 rounded-2xl p-3 shadow-2xs cursor-pointer hover:bg-rose-100/60 dark:hover:bg-rose-950/70 transition-all flex flex-col justify-between h-full"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black text-slate-900 dark:text-white">
                      {overdueBillsCount}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 leading-tight">
                    Overdue Bills
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Quick Create Section */}
            <div className="pt-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                <span>⚡</span>
                <span>Quick Create</span>
              </h3>

              <div className="grid grid-cols-4 gap-2">
                {/* New Customer */}
                <div className="flex flex-col items-center text-center">
                  <button
                    onClick={() => setIsClientModalOpen(true)}
                    className="w-14 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-800 dark:text-slate-100 shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <UserPlus className="w-6 h-6 text-slate-700 dark:text-slate-200" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1.5 leading-tight">
                    New Customer
                  </span>
                </div>

                {/* New Invoice */}
                <div className="flex flex-col items-center text-center">
                  <button
                    onClick={() => setIsInvoiceEditorOpen(true)}
                    className="w-14 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-800 dark:text-slate-100 shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <FileText className="w-6 h-6 text-slate-700 dark:text-slate-200" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1.5 leading-tight">
                    New Invoice
                  </span>
                </div>

                {/* New Bill */}
                <div className="flex flex-col items-center text-center">
                  <button
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="w-14 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-800 dark:text-slate-100 shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <Receipt className="w-6 h-6 text-slate-700 dark:text-slate-200" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1.5 leading-tight">
                    New Bill
                  </span>
                </div>

                {/* New Expense */}
                <div className="flex flex-col items-center text-center">
                  <button
                    onClick={() => setIsExpenseModalOpen(true)}
                    className="w-14 h-14 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-2xl flex items-center justify-center text-slate-800 dark:text-slate-100 shadow-2xs transition-all cursor-pointer active:scale-95"
                  >
                    <CreditCard className="w-6 h-6 text-slate-700 dark:text-slate-200" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1.5 leading-tight">
                    New Expense
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Cash Flow Analysis Widget */}
            {renderWidget({
              id: 'cash_flow_analysis',
              title: 'Cash Flow Analysis & Trends',
              description: '',
              enabled: true,
              category: 'FINANCIAL',
            })}

            {/* 4. Top Expenses Pie Chart Widget */}
            {renderWidget({
              id: 'top_expenses_pie',
              title: 'Top Expenses Breakdown (Pie Chart)',
              description: '',
              enabled: true,
              category: 'FINANCIAL',
            })}

            {/* 5. Banking Overview Widget */}
            {renderWidget({
              id: 'banking_module',
              title: 'Banking & Cash Overview',
              description: '',
              enabled: true,
              category: 'BANKING',
            })}

            {/* 6. Recent Ledger Invoices Section */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Recent Ledger Invoices
                </h3>
                <button
                  onClick={() => onNavigate('invoices')}
                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>All Invoices</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                {invoices.slice(0, 4).map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => onNavigate('invoices')}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                        {inv.clientName ? inv.clientName.charAt(0).toUpperCase() : 'I'}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                          {inv.clientName || 'Client'}
                        </h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          #{inv.invoiceNumber} • {formatDate(inv.issueDate)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-bold font-mono text-slate-900 dark:text-white block">
                        {formatCurrency(inv.totalAmount, settings.currencySymbol)}
                      </span>
                      <span className={`inline-block px-2 py-0.5 text-[9px] font-bold rounded-full mt-0.5 ${getStatusBadgeStyle(inv.status)}`}>
                        {inv.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {mobileTab === 'announcements' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Firm Announcements & Updates
            </h3>
            <div className="space-y-2 text-xs">
              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/50 rounded-xl border border-blue-100 dark:border-blue-900">
                <span className="font-bold text-slate-900 dark:text-white block">Q3 Tax Filing & Compliance Schedule Ready</span>
                <span className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5 block">Review GST/TDS reconciliations for accuracy before month-end closing.</span>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-900 dark:text-white block">Automated Bank Feed Sync Active</span>
                <span className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5 block">Real-time double-entry matching enabled for all integrated accounts.</span>
              </div>
            </div>
          </div>
        )}

        {mobileTab === 'help' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Help & Support Knowledge Base
            </h3>
            <div className="space-y-2 text-xs">
              <button
                onClick={() => onNavigate('coa')}
                className="w-full text-left p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200 flex justify-between items-center cursor-pointer"
              >
                <span>How Chart of Accounts & Ledgers work</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
              <button
                onClick={() => onNavigate('invoices')}
                className="w-full text-left p-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-200 flex justify-between items-center cursor-pointer"
              >
                <span>Setting up auto-billing & recurring invoices</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* DESKTOP DASHBOARD VIEW (hidden lg:block)   */}
      {/* ========================================== */}
      <div className="hidden lg:block space-y-6">
        {/* Top Banner / Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-slate-200/80 dark:bg-slate-800 rounded-full px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                FY {settings.fiscalYearStart}-2026
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">• Firm Bookkeeping</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
              {settings.firmName}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Customizer Button */}
            <button
              onClick={() => setIsCustomizerOpen(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Customize Layout</span>
            </button>

            <button
              onClick={() => onNavigate('reports')}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold transition-all shadow-2xs cursor-pointer"
            >
              View P&L
            </button>
          </div>
        </div>

        {/* TOP-LEVEL 4 KPI CARDS: Revenue, Expenses, Profit, Cash */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Revenue */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Revenue</span>
              <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400 flex items-center justify-center font-bold">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
              {formatCurrency(totalInvoiced, settings.currencySymbol)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Total invoiced sales revenue
            </p>
          </div>

          {/* Expenses */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Expenses</span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400 flex items-center justify-center font-bold">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
              {formatCurrency(totalExpenses, settings.currencySymbol)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Total operational & vendor costs
            </p>
          </div>

          {/* Profit */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Profit</span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 flex items-center justify-center font-bold">
                <Calculator className="w-4 h-4" />
              </div>
            </div>
            <div className={`text-2xl font-black font-mono tracking-tight ${netOperatingProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatCurrency(netOperatingProfit, settings.currencySymbol)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Gross sales minus operational expenses
            </p>
          </div>

          {/* Cash */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider">Cash</span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 flex items-center justify-center font-bold">
                <Landmark className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
              {formatCurrency(totalCashBank, settings.currencySymbol)}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Liquid balances across Bank & Cash accounts
            </p>
          </div>
        </div>

        {/* Render Enabled Widgets in User Preference Order */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-5">
          {widgets.map((w) => {
            if (!w.enabled) return null;

            // Span mapping for grid layout responsiveness
            let colSpanClass = 'lg:col-span-6';
            if (w.id === 'cash_flow_analysis') colSpanClass = 'lg:col-span-7';
            if (w.id === 'top_expenses_pie') colSpanClass = 'lg:col-span-5';
            if (w.id === 'banking_module') colSpanClass = 'lg:col-span-12';
            if (w.id === 'receivables') colSpanClass = 'lg:col-span-4';
            if (w.id === 'quick_actions') colSpanClass = 'lg:col-span-3';
            if (w.id === 'cash_reserves') colSpanClass = 'lg:col-span-5';
            if (w.id === 'selected_project') colSpanClass = 'lg:col-span-6';
            if (w.id === 'projects_overview') colSpanClass = 'lg:col-span-6';
            if (w.id === 'pnl_chart') colSpanClass = 'lg:col-span-6';
            if (w.id === 'tax_compliance') colSpanClass = 'lg:col-span-6';
            if (w.id === 'recent_invoices') colSpanClass = 'lg:col-span-12';

            return (
              <div key={w.id} className={colSpanClass}>
                {renderWidget(w)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Dashboard Layout Customizer Modal */}
      <DashboardCustomizerModal
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
        widgets={widgets}
        onSaveWidgets={handleSaveWidgets}
        projects={projects}
      />

      {/* Direct Invoice Creation Modal */}
      <InvoiceEditorModal
        isOpen={isInvoiceEditorOpen}
        onClose={() => setIsInvoiceEditorOpen(false)}
      />

      {/* Direct Expense Modal */}
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
      />

      {/* Direct New Customer / Client Modal */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
      />
    </div>
  );
};

