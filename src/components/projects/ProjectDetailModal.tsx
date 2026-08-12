import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  TrendingUp,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Invoice, Project } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { InvoicePreviewModal } from '../invoices/InvoicePreviewModal';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { ExpenseModal } from '../expenses/ExpenseModal';

interface ProjectDetailModalProps {
  project: Project | null;
  onClose: () => void;
  onOpenLogTime: (projectId: string) => void;
}

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  project,
  onClose,
  onOpenLogTime,
}) => {
  const {
    settings,
    getProjectSummary,
    timeEntries,
    expenses,
    invoices,
    clients,
    projects,
    convertUnbilledTimeToInvoice,
    deleteTimeEntry,
  } = useBooks();

  const [activeTab, setActiveTab] = useState<'overview' | 'time' | 'expenses' | 'invoices' | 'client' | 'pnl'>(
    'overview'
  );
  const [timeSearch, setTimeSearch] = useState('');
  const [timeStaffFilter, setTimeStaffFilter] = useState('ALL');
  const [timeStatusFilter, setTimeStatusFilter] = useState('ALL');

  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [isCreateInvoiceOpen, setIsCreateInvoiceOpen] = useState(false);
  const [isRecordExpenseOpen, setIsRecordExpenseOpen] = useState(false);

  if (!project) return null;

  const summary = getProjectSummary(project.id);
  const prjTimesAll = timeEntries.filter((t) => t.projectId === project.id);
  const uniquePrjStaff = Array.from(new Set(prjTimesAll.map((t) => t.staffName).filter(Boolean))).sort();

  const prjTimes = prjTimesAll.filter((t) => {
    if (timeStaffFilter !== 'ALL' && t.staffName !== timeStaffFilter) return false;
    if (timeStatusFilter === 'UNBILLED' && (!t.isBillable || t.isBilled)) return false;
    if (timeStatusFilter === 'BILLED' && !t.isBilled) return false;
    if (timeStatusFilter === 'NON_BILLABLE' && t.isBillable) return false;
    if (timeSearch.trim()) {
      const q = timeSearch.toLowerCase();
      const matchTask = t.taskName.toLowerCase().includes(q);
      const matchStaff = t.staffName.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q);
      if (!matchTask && !matchStaff && !matchDesc) return false;
    }
    return true;
  });
  const prjExpenses = expenses.filter((e) => e.projectId === project.id);
  const prjInvoices = invoices.filter((i) => i.projectId === project.id);

  const client =
    clients.find((c) => c.id === project.clientId) ||
    clients.find((c) => c.name === project.clientName || c.companyName === project.clientName) ||
    null;

  const clientProjects = projects.filter(
    (p) => p.clientId === project.clientId || p.clientName === project.clientName
  );

  const handleGenerateInvoice = () => {
    const newInv = convertUnbilledTimeToInvoice(project.id, project.clientId);
    if (newInv) {
      setPreviewInvoice(newInv);
      setActiveTab('invoices');
    } else {
      alert('No unbilled billable hours found for this project.');
    }
  };

  // Calculations for Dashboard Analytics
  const billableHours = prjTimes.filter((t) => t.isBillable).reduce((acc, t) => acc + t.hours, 0);
  const nonBillableHours = prjTimes.filter((t) => !t.isBillable).reduce((acc, t) => acc + t.hours, 0);
  const unbilledHoursCount = prjTimes.filter((t) => t.isBillable && !t.isBilled).reduce((acc, t) => acc + t.hours, 0);
  const billedHoursCount = prjTimes.filter((t) => t.isBilled).reduce((acc, t) => acc + t.hours, 0);

  const effectiveHourlyYield =
    summary.totalLoggedHours > 0
      ? (summary.netProfit / summary.totalLoggedHours)
      : 0;

  const financialChartData = [
    { name: 'Budget', amount: project.totalBudget, color: '#3b82f6' },
    { name: 'Invoiced', amount: summary.totalInvoiced, color: '#6366f1' },
    { name: 'Collected', amount: summary.totalCollected, color: '#10b981' },
    { name: 'Expenses', amount: summary.directExpenses, color: '#f43f5e' },
    { name: 'Net Profit', amount: Math.max(0, summary.netProfit), color: '#8b5cf6' },
  ];

  const hoursPieData = [
    { name: 'Billed Hours', value: billedHoursCount, color: '#10b981' },
    { name: 'Unbilled Hours', value: unbilledHoursCount, color: '#f59e0b' },
    { name: 'Non-Billable', value: nonBillableHours, color: '#94a3b8' },
  ].filter((d) => d.value > 0);

  // Recent combined project activity trail
  const recentActivities = [
    ...prjTimes.map((t) => ({
      id: `time-${t.id}`,
      type: 'time' as const,
      date: t.date,
      title: `Logged ${t.hours} hrs by ${t.staffName}`,
      subtitle: t.taskName,
      amount: t.hours * t.hourlyRate,
      isBillable: t.isBillable,
    })),
    ...prjExpenses.map((e) => ({
      id: `exp-${e.id}`,
      type: 'expense' as const,
      date: e.date,
      title: `Expense: ${e.accountName}`,
      subtitle: e.vendorName || e.referenceNumber,
      amount: e.amount,
      isBillable: false,
    })),
    ...prjInvoices.map((i) => ({
      id: `inv-${i.id}`,
      type: 'invoice' as const,
      date: i.issueDate,
      title: `Invoice ${i.invoiceNumber}`,
      subtitle: `Status: ${i.status}`,
      amount: i.totalAmount,
      isBillable: true,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Page Navigation & Title Header */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="space-y-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Projects List</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-lg border border-blue-500/20">
              {project.code}
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full border font-bold ${getStatusBadgeStyle(
                project.status
              )}`}
            >
              {project.status}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Client: <strong className="text-slate-700 dark:text-slate-300">{project.clientName}</strong>
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center space-x-2.5 pt-0.5">
            <FolderKanban className="w-7 h-7 text-blue-600 shrink-0" />
            <span>{project.name}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setIsCreateInvoiceOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all"
            title="Create a new prefilled invoice for this project"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRecordExpenseOpen(true)}
            className="bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all"
            title="Record an expense prefilled for this project"
          >
            <Receipt className="w-4 h-4" />
            <span>Record Expense</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenLogTime(project.id)}
            className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all"
            title="Log staff hours for this project"
          >
            <Clock className="w-4 h-4" />
            <span>Log Time Entry</span>
          </button>
        </div>
      </div>

      {/* Main Tab Dashboard Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 text-xs font-medium space-x-6 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 border-b-2 font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Project Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('time')}
            className={`py-3 border-b-2 font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'time'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Time Logs ({prjTimes.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('expenses')}
            className={`py-3 border-b-2 font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'expenses'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Direct Expenses ({prjExpenses.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-3 border-b-2 font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'invoices'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Invoices ({prjInvoices.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('client')}
            className={`py-3 border-b-2 font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'client'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Client Details</span>
          </button>
          <button
            onClick={() => setActiveTab('pnl')}
            className={`py-3 border-b-2 font-semibold transition-colors flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'pnl'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Project P&L Statement</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top KPI Summary Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500 font-medium block">Total Budget</span>
                  <span className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 block">
                    {formatCurrency(project.totalBudget, settings.currencySymbol)}
                  </span>
                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="text-slate-500">{project.budgetType}</span>
                    <span
                      className={`font-bold ${
                        summary.budgetUsedPercent > 90
                          ? 'text-rose-600'
                          : summary.budgetUsedPercent > 75
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {summary.budgetUsedPercent}% Used
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500 font-medium block">Total Invoiced</span>
                  <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 block">
                    {formatCurrency(summary.totalInvoiced, settings.currencySymbol)}
                  </span>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                    {formatCurrency(summary.totalCollected, settings.currencySymbol)} Cash Collected
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500 font-medium block">Direct Expenses</span>
                  <span className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 block">
                    {formatCurrency(summary.directExpenses, settings.currencySymbol)}
                  </span>
                  <div className="text-[11px] text-slate-500 pt-1">
                    {prjExpenses.length} Expense Vouchers
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                  <span className="text-slate-500 font-medium block">Net Profit & Margin</span>
                  <span
                    className={`text-lg font-bold font-mono block ${
                      summary.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'
                    }`}
                  >
                    {formatCurrency(summary.netProfit, settings.currencySymbol)}
                  </span>
                  <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 pt-1">
                    {summary.profitMarginPercent}% Net Profit Margin
                  </div>
                </div>
              </div>

              {/* Unbilled Time Alert Banner */}
              {summary.unbilledHoursAmount > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-2xs">
                  <div className="flex items-start space-x-3">
                    <DollarSign className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-amber-900 dark:text-amber-300 text-sm block">
                        Unbilled Work Balance Ready for Invoicing
                      </span>
                      <p className="text-slate-600 dark:text-slate-300 mt-0.5">
                        You have <span className="font-bold font-mono text-amber-900 dark:text-amber-200">{formatCurrency(summary.unbilledHoursAmount, settings.currencySymbol)}</span> ({unbilledHoursCount} billable hours) recorded that have not yet been billed.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleGenerateInvoice}
                    className="bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors shrink-0 cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    Convert to Invoice Now &rarr;
                  </button>
                </div>
              )}

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Financial Overview Bar Chart */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center space-x-1.5">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      <span>Financial Performance Breakdown ({settings.currencySymbol})</span>
                    </h3>
                    <span className="text-[10px] text-slate-400">Live Project Ledger Data</span>
                  </div>

                  <div className="h-52 w-full text-xs">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={financialChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(val) => `${settings.currencySymbol}${val}`} />
                        <Tooltip
                          formatter={(value: number) => [
                            formatCurrency(value, settings.currencySymbol),
                            'Amount',
                          ]}
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '12px',
                            color: '#fff',
                            fontSize: '11px',
                          }}
                        />
                        <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                          {financialChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Hours Breakdown & Effective Yield Gauge */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center space-x-1.5">
                        <Clock className="w-4 h-4 text-indigo-500" />
                        <span>Staff Time Distribution</span>
                      </h3>
                      <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 font-mono">
                        {summary.totalLoggedHours} total hrs
                      </span>
                    </div>

                    <div className="pt-3 space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center space-x-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                          <span>Billed Hours</span>
                        </span>
                        <span className="font-bold font-mono text-slate-800 dark:text-slate-200">{billedHoursCount} hrs</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center space-x-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                          <span>Unbilled Hours</span>
                        </span>
                        <span className="font-bold font-mono text-amber-600 dark:text-amber-400">{unbilledHoursCount} hrs</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 flex items-center space-x-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
                          <span>Non-Billable</span>
                        </span>
                        <span className="font-bold font-mono text-slate-500">{nonBillableHours} hrs</span>
                      </div>
                    </div>
                  </div>

                  {/* Effective Hourly Yield Box */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                    <span className="text-slate-500 text-[11px] block">Effective Hourly Yield Earned</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(effectiveHourlyYield, settings.currencySymbol)}/hr
                      </span>
                      <span className="text-[10px] text-slate-400">Target: ${project.hourlyRate}/hr</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Calculated as Net Profit &divide; Total Hours Worked.</p>
                  </div>
                </div>
              </div>

              {/* Budget Burn Rate Gauge & Project Meta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Budget Progress Box */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center space-x-1.5">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <span>Budget Burn & Allocation Status</span>
                    </h4>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        summary.budgetUsedPercent > 90
                          ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300'
                          : summary.budgetUsedPercent > 75
                          ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {summary.budgetUsedPercent}% Consumed
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-500">
                      <span>Invoiced & Expenses: {formatCurrency(summary.totalInvoiced + summary.directExpenses, settings.currencySymbol)}</span>
                      <span>Total Budget: {formatCurrency(project.totalBudget, settings.currencySymbol)}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          summary.budgetUsedPercent > 90
                            ? 'bg-rose-500'
                            : summary.budgetUsedPercent > 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, summary.budgetUsedPercent)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Project Manager:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{project.manager}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Standard Billing Rate:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">${project.hourlyRate}/hr</span>
                    </div>
                  </div>
                </div>

                {/* Project Scope */}
                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs border-b border-slate-100 dark:border-slate-800 pb-1.5">
                      Project Scope & Description
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed mt-2">
                      {project.description || 'No detailed scope description entered.'}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between text-[11px] text-slate-400">
                    <span>Started: {formatDate(project.startDate)}</span>
                    <span>Billing Type: {project.budgetType}</span>
                  </div>
                </div>
              </div>

              {/* Recent Activity Trail */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center space-x-1.5">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span>Recent Project Activity Feed</span>
                  </h4>
                  <span className="text-[10px] text-slate-400">Latest transactions & logs</span>
                </div>

                {recentActivities.length === 0 ? (
                  <p className="text-slate-400 text-center py-4 text-xs">No activity logged yet for this project.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {recentActivities.map((act) => (
                      <div key={act.id} className="py-2.5 flex justify-between items-center text-xs">
                        <div className="flex items-center space-x-2.5">
                          {act.type === 'time' && <Clock className="w-4 h-4 text-blue-500 shrink-0" />}
                          {act.type === 'expense' && <Receipt className="w-4 h-4 text-rose-500 shrink-0" />}
                          {act.type === 'invoice' && <FileText className="w-4 h-4 text-emerald-500 shrink-0" />}
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block line-clamp-1">{act.title}</span>
                            <span className="text-[10px] text-slate-400">{act.subtitle}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-bold font-mono text-slate-900 dark:text-slate-100 block">
                            {formatCurrency(act.amount, settings.currencySymbol)}
                          </span>
                          <span className="text-[10px] text-slate-400">{formatDate(act.date)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'time' && (
            <div className="space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    Logged Staff Hours & Timesheet
                  </h3>
                  <p className="text-slate-500 text-xs">
                    View time entries logged for {project.name}, filter by staff/employee, billable status, and search tasks.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenLogTime(project.id)}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs shrink-0 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log Time Entry</span>
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Search task, staff, description..."
                  value={timeSearch}
                  onChange={(e) => setTimeSearch(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-slate-800 dark:text-slate-200"
                />

                <select
                  value={timeStaffFilter}
                  onChange={(e) => setTimeStaffFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-slate-800 dark:text-slate-200 font-semibold"
                >
                  <option value="ALL">👤 All Staff ({uniquePrjStaff.length})</option>
                  {uniquePrjStaff.map((staff) => (
                    <option key={staff} value={staff}>
                      👤 {staff}
                    </option>
                  ))}
                </select>

                <select
                  value={timeStatusFilter}
                  onChange={(e) => setTimeStatusFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-slate-800 dark:text-slate-200 font-semibold"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="UNBILLED">⏳ Unbilled Hours Only</option>
                  <option value="BILLED">✅ Billed Only</option>
                  <option value="NON_BILLABLE">🚫 Non-Billable</option>
                </select>
              </div>

              {prjTimes.length === 0 ? (
                <p className="text-slate-500 py-6 text-center">
                  {prjTimesAll.length === 0
                    ? 'No time entries logged for this project yet.'
                    : 'No time entries match the selected filters.'}
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Staff</th>
                        <th className="p-2.5">Task & Description</th>
                        <th className="p-2.5 text-center">Hours</th>
                        <th className="p-2.5 text-right">Rate</th>
                        <th className="p-2.5 text-right">Amount</th>
                        <th className="p-2.5 text-center">Status</th>
                        <th className="p-2.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {prjTimes.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 text-slate-500 whitespace-nowrap">{formatDate(t.date)}</td>
                          <td className="p-2.5 font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                            {t.staffName}
                          </td>
                          <td className="p-2.5 text-slate-800 dark:text-slate-200">
                            <div className="font-semibold">{t.taskName}</div>
                            {t.description && (
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                {t.description}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-bold font-mono text-slate-800 dark:text-slate-200">
                            {t.hours} hrs
                          </td>
                          <td className="p-2.5 text-right text-slate-500 font-mono">
                            ${t.hourlyRate}/hr
                          </td>
                          <td className="p-2.5 text-right font-bold font-mono text-slate-800 dark:text-slate-200">
                            {formatCurrency(t.hours * t.hourlyRate, settings.currencySymbol)}
                          </td>
                          <td className="p-2.5 text-center">
                            {t.isBilled ? (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded font-semibold">
                                Billed
                              </span>
                            ) : t.isBillable ? (
                              <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded font-semibold">
                                Unbilled
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-500/10 text-slate-500 px-2 py-0.5 rounded">
                                Non-billable
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => deleteTimeEntry(t.id)}
                              className="text-rose-500 hover:underline cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    Direct Project Expenses
                  </h3>
                  <p className="text-slate-500 text-xs">
                    Record vendor bills, subcontractor fees, and material expenses for {project.name}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecordExpenseOpen(true)}
                  className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs shrink-0 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Record Expense</span>
                </button>
              </div>

              {prjExpenses.length === 0 ? (
                <div className="text-center py-10 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                  <Receipt className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-slate-500 font-medium">No direct expenses recorded for this project yet.</p>
                  <button
                    type="button"
                    onClick={() => setIsRecordExpenseOpen(true)}
                    className="text-rose-600 dark:text-rose-400 font-bold hover:underline"
                  >
                    + Record first project expense
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Ref #</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5">Category</th>
                        <th className="p-2.5">Vendor</th>
                        <th className="p-2.5">Amount</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {prjExpenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 font-mono text-blue-600 font-bold">
                            {exp.referenceNumber}
                          </td>
                          <td className="p-2.5 text-slate-500">{formatDate(exp.date)}</td>
                          <td className="p-2.5 text-slate-800 dark:text-slate-200">
                            {exp.accountName}
                          </td>
                          <td className="p-2.5 text-slate-500">{exp.vendorName || '-'}</td>
                          <td className="p-2.5 font-semibold font-mono text-rose-600">
                            {formatCurrency(exp.amount, settings.currencySymbol)}
                          </td>
                          <td className="p-2.5">
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded font-semibold">
                              {exp.paymentStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                    Project Invoices
                  </h3>
                  <p className="text-slate-500 text-xs">
                    Issue new invoices to {project.clientName} prefilled with project details.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsCreateInvoiceOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Custom Invoice</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateInvoice}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl font-bold flex items-center space-x-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>Convert Unbilled Time</span>
                  </button>
                </div>
              </div>

              {prjInvoices.length === 0 ? (
                <div className="text-center py-10 bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                  <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-slate-500 font-medium">No invoices issued for this project yet.</p>
                  <div className="flex justify-center space-x-4 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCreateInvoiceOpen(true)}
                      className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                    >
                      + Create custom invoice
                    </button>
                    {summary.unbilledHoursAmount > 0 && (
                      <button
                        type="button"
                        onClick={handleGenerateInvoice}
                        className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
                      >
                        + Convert unbilled time ({formatCurrency(summary.unbilledHoursAmount, settings.currencySymbol)})
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5">Invoice #</th>
                        <th className="p-2.5">Issue Date</th>
                        <th className="p-2.5">Due Date</th>
                        <th className="p-2.5">Total Amount</th>
                        <th className="p-2.5">Paid Amount</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {prjInvoices.map((inv) => (
                        <tr
                          key={inv.id}
                          onClick={() => setPreviewInvoice(inv)}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 cursor-pointer transition-colors"
                        >
                          <td className="p-2.5 font-mono text-blue-600 font-bold flex items-center space-x-1">
                            <span>{inv.invoiceNumber}</span>
                          </td>
                          <td className="p-2.5 text-slate-500">{formatDate(inv.issueDate)}</td>
                          <td className="p-2.5 text-slate-500">{formatDate(inv.dueDate)}</td>
                          <td className="p-2.5 font-bold font-mono text-slate-800 dark:text-slate-200">
                            {formatCurrency(inv.totalAmount, settings.currencySymbol)}
                          </td>
                          <td className="p-2.5 text-emerald-600 font-semibold font-mono">
                            {formatCurrency(inv.paidAmount, settings.currencySymbol)}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded font-semibold ${getStatusBadgeStyle(
                                inv.status
                              )}`}
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <span className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                              View Invoice &rarr;
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'client' && (
            <div className="space-y-6 text-xs animate-fadeIn">
              {/* Main Client Profile Header */}
              <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-blue-600/10 text-blue-600 rounded-2xl border border-blue-500/20 shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                        Project Client Account
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {client?.companyName || project.clientName}
                      </h3>
                      {client?.name && (
                        <p className="text-xs text-slate-500 flex items-center space-x-1.5 mt-0.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Contact Person:{' '}
                            <strong className="text-slate-700 dark:text-slate-300">{client.name}</strong>
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {client?.paymentTerms && (
                      <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold px-2.5 py-1 rounded-lg text-[11px] flex items-center space-x-1">
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Terms: {client.paymentTerms}</span>
                      </span>
                    )}
                    {client?.currency && (
                      <span className="bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold px-2.5 py-1 rounded-lg text-[11px]">
                        Currency: {client.currency}
                      </span>
                    )}
                  </div>
                </div>

                {/* Contact & Address Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium text-[11px] flex items-center space-x-1.5">
                      <Mail className="w-3.5 h-3.5 text-blue-500" />
                      <span>Email Address</span>
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {client?.email ? (
                        <a
                          href={`mailto:${client.email}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
                        >
                          <span>{client.email}</span>
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">Not provided</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium text-[11px] flex items-center space-x-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Phone Number</span>
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {client?.phone ? (
                        <a href={`tel:${client.phone}`} className="hover:underline">
                          {client.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400 italic">Not provided</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1">
                    <div className="text-slate-400 font-medium text-[11px] flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-rose-500" />
                      <span>Billing Address & Tax Registration</span>
                    </div>
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {client?.billingAddress || (
                        <span className="text-slate-400 italic">No address on file</span>
                      )}
                      {client?.taxId && (
                        <span className="block text-[11px] text-slate-500 mt-1 font-mono">
                          Tax ID / GSTIN: <strong>{client.taxId}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {client?.notes && (
                  <div className="p-3.5 bg-amber-50/60 dark:bg-slate-800/80 border border-amber-200/80 dark:border-slate-700 rounded-xl space-y-1 text-slate-700 dark:text-slate-300">
                    <span className="font-bold text-amber-900 dark:text-amber-300 text-[11px]">
                      Client Account Notes:
                    </span>
                    <p className="italic text-xs leading-relaxed">{client.notes}</p>
                  </div>
                )}
              </div>

              {/* Financial Relationship Summary for this Project */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-400 font-medium">Invoiced to Client (This Project)</span>
                  <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 block">
                    {formatCurrency(summary.totalInvoiced, settings.currencySymbol)}
                  </span>
                  <span className="text-[10px] text-slate-400">{prjInvoices.length} invoice(s) generated</span>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-400 font-medium">Payments Received</span>
                  <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 block">
                    {formatCurrency(summary.totalCollected, settings.currencySymbol)}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    {summary.totalInvoiced > 0
                      ? Math.round((summary.totalCollected / summary.totalInvoiced) * 100)
                      : 0}
                    % Paid
                  </span>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="text-slate-400 font-medium">Outstanding Balance Due</span>
                  <span
                    className={`text-lg font-bold font-mono block ${
                      summary.outstandingBalance > 0 ? 'text-amber-600' : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {formatCurrency(summary.outstandingBalance, settings.currencySymbol)}
                  </span>
                  <span className="text-[10px] text-slate-400">Accounts Receivable</span>
                </div>
              </div>

              {/* All Projects with this Client */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center space-x-1.5">
                    <Briefcase className="w-4 h-4 text-blue-500" />
                    <span>
                      All Projects Associated with {client?.companyName || project.clientName} (
                      {clientProjects.length})
                    </span>
                  </h4>
                  <span className="text-[10px] text-slate-400">Active & Historical Engagements</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {clientProjects.map((cp) => {
                    const cpSummary = getProjectSummary(cp.id);
                    const isCurrent = cp.id === project.id;
                    return (
                      <div
                        key={cp.id}
                        className={`py-3 flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs rounded-xl px-2 transition-colors ${
                          isCurrent
                            ? 'bg-blue-50/60 dark:bg-slate-800/60 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            {cp.code}
                          </span>
                          <div>
                            <span className="text-slate-900 dark:text-slate-100 font-bold flex items-center space-x-1.5">
                              <span>{cp.name}</span>
                              {isCurrent && (
                                <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.2 rounded font-bold">
                                  Current
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Manager: {cp.manager} • Start: {formatDate(cp.startDate)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4 text-right">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Budget</span>
                            <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                              {formatCurrency(cp.totalBudget, settings.currencySymbol)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Invoiced</span>
                            <span className="font-bold font-mono text-blue-600 dark:text-blue-400">
                              {formatCurrency(cpSummary.totalInvoiced, settings.currencySymbol)}
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getStatusBadgeStyle(
                              cp.status
                            )}`}
                          >
                            {cp.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pnl' && (
            <div className="space-y-4 text-xs bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="border-b border-slate-200 dark:border-slate-700 pb-3 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    Project Profit & Loss (P&L) Statement
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Dedicated income statement for [{project.code}] {project.name}
                  </p>
                </div>
                <span className="font-mono text-slate-500">{settings.currencyCode}</span>
              </div>

              <div className="space-y-2 font-mono">
                <div className="font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-1">
                  1. PROJECT OPERATING REVENUE
                </div>
                <div className="flex justify-between pl-4 text-slate-600 dark:text-slate-400">
                  <span>Gross Client Invoiced Amount:</span>
                  <span>{formatCurrency(summary.totalInvoiced, settings.currencySymbol)}</span>
                </div>

                <div className="font-bold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pt-3 pb-1">
                  2. DIRECT PROJECT EXPENSES & SUBCONTRACTORS
                </div>
                <div className="flex justify-between pl-4 text-rose-600">
                  <span>Direct Vendor Expenses Tagged:</span>
                  <span>-{formatCurrency(summary.directExpenses, settings.currencySymbol)}</span>
                </div>

                <div className="border-t-2 border-slate-900 dark:border-slate-100 pt-3 flex justify-between font-bold text-sm text-slate-900 dark:text-slate-100">
                  <span>PROJECT NET PROFIT:</span>
                  <span className={summary.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                    {formatCurrency(summary.netProfit, settings.currencySymbol)} (
                    {summary.profitMarginPercent}% Margin)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <InvoicePreviewModal
        invoice={previewInvoice}
        onClose={() => setPreviewInvoice(null)}
      />

      <InvoiceEditorModal
        isOpen={isCreateInvoiceOpen}
        onClose={() => setIsCreateInvoiceOpen(false)}
        defaultProjectId={project.id}
        defaultClientId={project.clientId}
        onInvoiceCreated={(newInv) => {
          setIsCreateInvoiceOpen(false);
          setPreviewInvoice(newInv);
        }}
      />

      <ExpenseModal
        isOpen={isRecordExpenseOpen}
        onClose={() => setIsRecordExpenseOpen(false)}
        defaultProjectId={project.id}
        defaultClientId={project.clientId}
      />
    </div>
  );
};

