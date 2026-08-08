import React from 'react';
import {
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Plus,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { NavigationTab } from '../../types';

interface PurchasesOverviewProps {
  onNavigate: (tab: NavigationTab, options?: { autoCreate?: boolean }) => void;
}

export const PurchasesOverview: React.FC<PurchasesOverviewProps> = ({ onNavigate }) => {
  const { expenses, settings } = useBooks();

  const totalExpenseSum = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  const billableCount = expenses.filter((e) => e.isBillable).length;

  const quickLinks: { id: NavigationTab; title: string; desc: string; icon: React.ReactNode; color: string }[] = [
    {
      id: 'vendors',
      title: 'Vendors',
      desc: 'Suppliers & payables directory',
      icon: <Building2 className="w-5 h-5 text-indigo-600" />,
      color: 'bg-indigo-50 border-indigo-200 text-indigo-700',
    },
    {
      id: 'expenses',
      title: 'Expenses',
      desc: 'Record cash & card operational expenses',
      icon: <Receipt className="w-5 h-5 text-blue-600" />,
      color: 'bg-blue-50 border-blue-200 text-blue-700',
    },
    {
      id: 'recurring_expenses',
      title: 'Recurring Expenses',
      desc: 'Automated hosting & software subs',
      icon: <RotateCcw className="w-5 h-5 text-purple-600" />,
      color: 'bg-purple-50 border-purple-200 text-purple-700',
    },
    {
      id: 'purchase_orders',
      title: 'Purchase Orders',
      desc: 'Issue official POs to suppliers',
      icon: <FileCheck className="w-5 h-5 text-sky-600" />,
      color: 'bg-sky-50 border-sky-200 text-sky-700',
    },
    {
      id: 'bills',
      title: 'Bills',
      desc: 'Vendor accounts payable invoices',
      icon: <FileText className="w-5 h-5 text-amber-600" />,
      color: 'bg-amber-50 border-amber-200 text-amber-700',
    },
    {
      id: 'recurring_bills',
      title: 'Recurring Bills',
      desc: 'Scheduled rent & utility payments',
      icon: <Clock className="w-5 h-5 text-teal-600" />,
      color: 'bg-teal-50 border-teal-200 text-teal-700',
    },
    {
      id: 'payments_made',
      title: 'Payments Made',
      desc: 'Ledger of bank wires & cash paid out',
      icon: <CreditCard className="w-5 h-5 text-emerald-600" />,
      color: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    },
    {
      id: 'vendor_credits',
      title: 'Vendor Credits',
      desc: 'Supplier debit memos & refund credits',
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
            <ShoppingBag className="w-6 h-6 text-indigo-600" />
            <span>Purchases & Accounts Payable Overview</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Unified management hub for suppliers, vendor bills, purchase orders, recurring costs & payments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('expenses', { autoCreate: true })}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Total Purchases & Expenses</span>
            <Receipt className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
            {formatCurrency(totalExpenseSum, settings.currencySymbol)}
          </div>
          <div className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{expenses.length} Expense Transactions</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Outstanding Vendor Bills</span>
            <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
            {formatCurrency(14850, settings.currencySymbol)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            3 Bills Due in Next 14 Days
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Active Purchase Orders</span>
            <FileCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="text-xl font-extrabold text-sky-600 dark:text-sky-400 font-mono">
            {formatCurrency(28400, settings.currencySymbol)}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            2 Pending Goods Receipt
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-bold">
            <span>Customer Billable Costs</span>
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
            {billableCount} Expenses
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Reimbursable by clients
          </div>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
          Purchases Navigation Modules
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

      {/* Recent Purchases Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Recent Operational Expenses & Purchases</h3>
          <button
            onClick={() => onNavigate('expenses')}
            className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>View All Expenses</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Ref #</th>
                <th className="p-3">Category / Account</th>
                <th className="p-3">Vendor</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-center">Billable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expenses.slice(0, 5).map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono font-bold text-indigo-600">{exp.referenceNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{exp.accountName}</td>
                  <td className="p-3 text-slate-600">{exp.vendorName || '—'}</td>
                  <td className="p-3 text-slate-500">{formatDate(exp.expenseDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(exp.amount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    {exp.isBillable ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                        Billable
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
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
