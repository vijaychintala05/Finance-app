import React from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Plus,
  Receipt,
  RotateCcw,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { NavigationTab } from '../../types';

interface SalesOverviewProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const SalesOverview: React.FC<SalesOverviewProps> = ({ onNavigate }) => {
  const { invoices, estimates, clients, settings } = useBooks();

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const paidInvoiced = invoices.filter((i) => i.status === 'Paid').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const overdueInvoiced = invoices.filter((i) => i.status === 'Overdue').reduce((sum, inv) => sum + inv.totalAmount, 0);
  const pendingInvoiced = invoices.filter((i) => i.status === 'Sent' || i.status === 'Partially Paid').reduce((sum, inv) => sum + (inv.totalAmount - (inv.amountPaid || 0)), 0);

  const activeEstimatesVal = estimates.filter((e) => e.status !== 'Declined').reduce((sum, est) => sum + est.totalAmount, 0);

  const quickLinks: { id: NavigationTab; title: string; desc: string; icon: React.ReactNode; color: string }[] = [
    {
      id: 'invoices',
      title: 'Invoices',
      desc: 'Create, edit & manage client bills',
      icon: <FileText className="w-5 h-5 text-blue-600" />,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
    },
    {
      id: 'clients',
      title: 'Customers',
      desc: 'Client directory & outstanding balances',
      icon: <Users className="w-5 h-5 text-emerald-600" />,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
    {
      id: 'estimates',
      title: 'Quotes',
      desc: 'Proposals & estimated costings',
      icon: <FileSpreadsheet className="w-5 h-5 text-amber-600" />,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
    },
    {
      id: 'sales_orders',
      title: 'Sales Orders',
      desc: 'Confirmed customer work orders',
      icon: <FileCheck className="w-5 h-5 text-indigo-600" />,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    },
    {
      id: 'recurring_invoices',
      title: 'Recurring Invoices',
      desc: 'Automated billing schedules',
      icon: <RotateCcw className="w-5 h-5 text-purple-600" />,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
    },
    {
      id: 'delivery_challans',
      title: 'Delivery Challans',
      desc: 'Goods dispatch & delivery slips',
      icon: <Truck className="w-5 h-5 text-sky-600" />,
      color: 'bg-sky-50 border-sky-200 text-sky-700',
    },
    {
      id: 'payments_received',
      title: 'Payments Received',
      desc: 'Client payment receipts & ledger',
      icon: <Receipt className="w-5 h-5 text-teal-600" />,
      color: 'bg-teal-50 border-teal-200 text-teal-700',
    },
    {
      id: 'credit_notes',
      title: 'Credit Notes',
      desc: 'Memos & customer refunds',
      icon: <DollarSign className="w-5 h-5 text-rose-600" />,
      color: 'bg-rose-50 border-rose-200 text-rose-700',
    },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            <span>Sales & Receivables Overview</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete high-level hub for all client billing, quotes, sales orders, delivery challans, and receipts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('invoices', { autoCreate: true })}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Total Revenue Invoiced</span>
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
            {formatCurrency(totalInvoiced, settings.currencySymbol)}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{invoices.length} Invoices Generated</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Total Collected Payments</span>
            <Receipt className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="text-xl font-extrabold text-teal-700 dark:text-teal-400 font-mono">
            {formatCurrency(paidInvoiced, settings.currencySymbol)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Directly deposited into bank
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Pending Receivables</span>
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
            {formatCurrency(pendingInvoiced + overdueInvoiced, settings.currencySymbol)}
          </div>
          <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
            {formatCurrency(overdueInvoiced, settings.currencySymbol)} Overdue
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Active Quotes Pipeline</span>
            <FileSpreadsheet className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 font-mono">
            {formatCurrency(activeEstimatesVal, settings.currencySymbol)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            {estimates.length} Active Proposals
          </div>
        </div>
      </div>

      {/* Quick Access Categories Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Sales Navigation Modules
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickLinks.map((link) => (
            <div
              key={link.id}
              onClick={() => onNavigate(link.id)}
              className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 group-hover:scale-105 transition-transform">
                  {link.icon}
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              </div>
              <div className="mt-4">
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm group-hover:text-blue-600 transition-colors">
                  {link.title}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{link.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden space-y-0">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Recent Sales Invoices</h3>
          <button
            onClick={() => onNavigate('invoices')}
            className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View All Invoices</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Issue Date</th>
                <th className="p-3">Due Date</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.slice(0, 5).map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono font-bold text-blue-600">{inv.invoiceNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{inv.clientName}</td>
                  <td className="p-3 text-slate-500">{formatDate(inv.issueDate)}</td>
                  <td className="p-3 text-slate-500">{formatDate(inv.dueDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(inv.totalAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${getStatusBadgeStyle(inv.status)}`}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
