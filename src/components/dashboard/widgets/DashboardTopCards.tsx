import React from 'react';
import { ArrowUpRight, Clock, FolderKanban, Landmark, Receipt, Wallet } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

interface DashboardTopCardsProps {
  accountsReceivable: number;
  totalPayables: number;
  totalCashBank: number;
  activeProjectsCount: number;
  unbilledHoursTotal: number;
  currencySymbol: string;
  onNavigate: (tab: any) => void;
}

export const DashboardTopCards: React.FC<DashboardTopCardsProps> = ({
  accountsReceivable,
  totalPayables,
  totalCashBank,
  activeProjectsCount,
  unbilledHoursTotal,
  currencySymbol,
  onNavigate,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Accounts Receivable */}
      <div
        onClick={() => onNavigate('invoices')}
        className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Receivables</span>
          <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Receipt className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-black font-mono text-slate-900 dark:text-white">
          {formatCurrency(accountsReceivable, currencySymbol)}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Outstanding Invoices</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-0.5">
            View <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* 2. Accounts Payable */}
      <div
        onClick={() => onNavigate('expenses')}
        className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Payables</span>
          <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Wallet className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-black font-mono text-slate-900 dark:text-white">
          {formatCurrency(totalPayables, currencySymbol)}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Unsettled Bills & Costs</span>
          <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-0.5">
            View <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* 3. Cash & Bank */}
      <div
        onClick={() => onNavigate('banking')}
        className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cash & Bank</span>
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Landmark className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
          {formatCurrency(totalCashBank, currencySymbol)}
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Liquid Operating Reserves</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5">
            Banking <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>

      {/* 4. Active Projects & WIP */}
      <div
        onClick={() => onNavigate('projects')}
        className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Projects & WIP</span>
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
            <FolderKanban className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-black text-slate-900 dark:text-white">{activeProjectsCount}</span>
          <span className="text-xs text-slate-400 font-bold">Active</span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">{unbilledHoursTotal}h Unbilled</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Client Projects Ledger</span>
          <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-0.5">
            Manage <ArrowUpRight className="w-3 h-3" />
          </span>
        </div>
      </div>
    </div>
  );
};
