import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  Plus,
  Receipt,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  DashboardCustomizerModal,
  DEFAULT_WIDGETS,
  WidgetConfig,
} from './DashboardCustomizerModal';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { ExpenseModal } from '../expenses/ExpenseModal';
import { ClientModal } from '../clients/ClientModal';
import { CashFlowChartWidget } from './widgets/CashFlowChartWidget';
import { IncomeExpenseWidget } from './widgets/IncomeExpenseWidget';
import { ReceivablesPayablesWidget } from './widgets/ReceivablesPayablesWidget';
import { DashboardQuickActions } from './widgets/DashboardQuickActions';
import { BankAndCashWidget } from './widgets/BankAndCashWidget';
import { ProjectProfitabilityWidget } from './widgets/ProjectProfitabilityWidget';
import { RecentActivityWidget } from './widgets/RecentActivityWidget';
import { DashboardTopCards } from './widgets/DashboardTopCards';

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
    return accounts.filter((a) => a.subType === 'Cash' || a.name.toLowerCase().includes('petty cash'));
  }, [accounts]);

  const creditCardAccounts = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Credit Card' ||
        (a.type === 'Liability' && a.name.toLowerCase().includes('credit card'))
    );
  }, [accounts]);

  const totalBankBalance = useMemo(
    () => bankAccounts.filter((a) => a.subType === 'Bank').reduce((sum, a) => sum + (a.balance || 0), 0),
    [bankAccounts]
  );
  const totalCashBalance = useMemo(
    () => cashAccounts.reduce((sum, a) => sum + (a.balance || 0), 0),
    [cashAccounts]
  );
  const totalCreditBalance = useMemo(
    () => creditCardAccounts.reduce((sum, a) => sum + Math.abs(a.balance || 0), 0),
    [creditCardAccounts]
  );
  const totalCashBank = useMemo(
    () => bankAccounts.reduce((sum, a) => sum + (a.balance || 0), 0),
    [bankAccounts]
  );

  const accountsReceivable = useMemo(
    () => invoices.reduce((sum, i) => sum + (i.balanceDue || 0), 0),
    [invoices]
  );
  const currentReceivables = useMemo(
    () =>
      invoices
        .filter((i) => i.status === 'Sent' || i.status === 'Draft')
        .reduce((sum, i) => sum + (i.balanceDue || 0), 0),
    [invoices]
  );
  const overdueReceivables = useMemo(
    () =>
      invoices
        .filter((i) => i.status === 'Overdue')
        .reduce((sum, i) => sum + (i.balanceDue || 0), 0),
    [invoices]
  );
  const overdueInvoicesCount = useMemo(
    () => invoices.filter((i) => i.status === 'Overdue').length,
    [invoices]
  );

  const totalPayables = useMemo(
    () => bills.reduce((sum, b) => sum + (b.balanceDue || (b.status === 'Paid' ? 0 : b.total)), 0),
    [bills]
  );
  const overdueBillsCount = useMemo(
    () => bills.filter((b) => b.status === 'Overdue').length,
    [bills]
  );

  const totalRevenue = useMemo(
    () => invoices.reduce((sum, i) => sum + (i.totalAmount || 0), 0),
    [invoices]
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses]
  );
  const netOperatingProfit = totalRevenue - totalExpenses;

  const activeProjectsCount = useMemo(
    () => projects.filter((p) => p.status === 'In Progress').length,
    [projects]
  );
  const unbilledHoursTotal = useMemo(
    () =>
      timeEntries
        .filter((t) => !t.isBilled)
        .reduce((sum, t) => sum + (t.hours || 0), 0),
    [timeEntries]
  );
  const totalUnbilledAmount = unbilledHoursTotal * (settings.defaultHourlyRate || 150);

  // Monthly P&L Data
  const monthlyData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((m) => ({
      month: m,
      Income: Math.floor(Math.random() * 25000) + 15000,
      Expense: Math.floor(Math.random() * 12000) + 5000,
    })).slice(-6);
  }, []);

  const PIE_COLORS = ['#4f46e5', '#06b6d4', '#f59e0b', '#f43f5e', '#10b981', '#8b5cf6', '#ec4899', '#64748b'];

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

  const totalExpensePieAmount = useMemo(
    () => topExpensesData.reduce((sum, item) => sum + item.value, 0),
    [topExpensesData]
  );

  // Cash Flow Analysis Data Breakdown
  const cashFlowAnalysisData = useMemo(() => {
    const monthsMap: Record<string, { month: string; inflow: number; outflow: number; netFlow: number; timestamp: number }> = {};
    const now = new Date();

    if (cashFlowPeriod === 'six_months') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = d.toLocaleString('en-US', { month: 'short' });
        const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthsMap[yearMonth] = { month: monthKey, inflow: 0, outflow: 0, netFlow: 0, timestamp: d.getTime() };
      }
    } else {
      const startMonth = parseInt(String(settings.fiscalYearStart || '4'), 10) || 4;
      const currentMonth = now.getMonth() + 1;
      const fiscalYearStartYear = currentMonth >= startMonth ? now.getFullYear() : now.getFullYear() - 1;

      for (let i = 0; i < 12; i++) {
        const monthIndex = (startMonth - 1 + i) % 12;
        const yearOffset = Math.floor((startMonth - 1 + i) / 12);
        const year = fiscalYearStartYear + yearOffset;
        const d = new Date(year, monthIndex, 1);
        const monthKey = d.toLocaleString('en-US', { month: 'short' });
        const yearMonth = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
        monthsMap[yearMonth] = { month: monthKey, inflow: 0, outflow: 0, netFlow: 0, timestamp: d.getTime() };
      }
    }

    invoices.forEach((inv) => {
      if (inv.status !== 'Void' && inv.issueDate) {
        const dateObj = new Date(inv.issueDate);
        if (!isNaN(dateObj.getTime())) {
          const yearMonth = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
          if (monthsMap[yearMonth]) {
            monthsMap[yearMonth].inflow += inv.paidAmount || (inv.status === 'Paid' ? inv.totalAmount : 0);
          }
        }
      }
    });

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

  const projectSummaries = useMemo(
    () => projects.map((p) => ({ ...p, summary: getProjectSummary(p.id) })),
    [projects, getProjectSummary]
  );

  const arPercentCurrent = accountsReceivable > 0 ? Math.round((currentReceivables / accountsReceivable) * 100) : 100;
  const arPercentOverdue = 100 - arPercentCurrent;

  const renderWidget = (widget: WidgetConfig) => {
    if (!widget.enabled) return null;

    switch (widget.id) {
      case 'cash_flow_analysis':
        return (
          <CashFlowChartWidget
            key={widget.id}
            cashFlowAnalysisData={cashFlowAnalysisData}
            cashFlowPeriod={cashFlowPeriod}
            setCashFlowPeriod={setCashFlowPeriod}
            totalInflowPeriod={totalInflowPeriod}
            totalOutflowPeriod={totalOutflowPeriod}
            netCashFlowPeriod={netCashFlowPeriod}
            currencySymbol={settings.currencySymbol}
            onNavigate={onNavigate}
          />
        );

      case 'top_expenses_pie':
        return (
          <IncomeExpenseWidget
            key={widget.id}
            topExpensesData={topExpensesData}
            totalExpensePieAmount={totalExpensePieAmount}
            pieColors={PIE_COLORS}
            currencySymbol={settings.currencySymbol}
            onNavigate={onNavigate}
          />
        );

      case 'receivables':
        return (
          <ReceivablesPayablesWidget
            key={widget.id}
            accountsReceivable={accountsReceivable}
            currentReceivables={currentReceivables}
            overdueReceivables={overdueReceivables}
            arPercentCurrent={arPercentCurrent}
            arPercentOverdue={arPercentOverdue}
            totalPayables={totalPayables}
            overdueBillsCount={overdueBillsCount}
            currencySymbol={settings.currencySymbol}
            onNavigate={onNavigate}
          />
        );

      case 'quick_actions':
        return (
          <DashboardQuickActions
            key={widget.id}
            onOpenInvoiceEditor={() => setIsInvoiceEditorOpen(true)}
            onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
            onOpenClientModal={() => setIsClientModalOpen(true)}
          />
        );

      case 'cash_reserves':
      case 'banking_module':
        return (
          <BankAndCashWidget
            key={widget.id}
            totalBankBalance={totalBankBalance}
            totalCashBalance={totalCashBalance}
            totalCreditBalance={totalCreditBalance}
            bankAccounts={bankAccounts}
            cashAccounts={cashAccounts}
            creditCardAccounts={creditCardAccounts}
            currencySymbol={settings.currencySymbol}
            onNavigate={onNavigate}
          />
        );

      case 'selected_project':
      case 'projects_overview':
        return (
          <ProjectProfitabilityWidget
            key={widget.id}
            projectSummaries={projectSummaries}
            projects={projects}
            currencySymbol={settings.currencySymbol}
            onNavigate={onNavigate}
            onSelectProject={onSelectProject}
          />
        );

      case 'recent_invoices':
        return (
          <RecentActivityWidget
            key={widget.id}
            invoices={invoices}
            currencySymbol={settings.currencySymbol}
            onNavigate={onNavigate}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto bg-slate-50 dark:bg-slate-950 min-h-full font-sans text-slate-900 dark:text-slate-100">
      {/* Mobile Top Controls */}
      <div className="block lg:hidden space-y-4">
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
              <SlidersHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <DashboardTopCards
        accountsReceivable={accountsReceivable}
        totalPayables={totalPayables}
        totalCashBank={totalCashBank}
        activeProjectsCount={activeProjectsCount}
        unbilledHoursTotal={unbilledHoursTotal}
        currencySymbol={settings.currencySymbol}
        onNavigate={onNavigate}
      />

      {/* Desktop Dashboard Controls Header */}
      <div className="hidden lg:flex items-center justify-between pt-2">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <span>Executive Financial Command Center</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time accounting ledger overview, cash metrics, and workflow shortcuts
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCustomizerOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 transition-all shadow-2xs cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-blue-600" />
            <span>Customize Dashboard</span>
          </button>
        </div>
      </div>

      {/* Dynamic Widget Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {widgets.filter((w) => w.enabled).map((widget) => renderWidget(widget))}
      </div>

      {/* Modals */}
      {isCustomizerOpen && (
        <DashboardCustomizerModal
          isOpen={isCustomizerOpen}
          widgets={widgets}
          projects={projects}
          onSave={handleSaveWidgets}
          onClose={() => setIsCustomizerOpen(false)}
        />
      )}

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
