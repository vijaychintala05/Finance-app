import React from 'react';
import { formatCurrency } from '../../../utils/formatters';

interface ReceivablesPayablesWidgetProps {
  accountsReceivable: number;
  currentReceivables: number;
  overdueReceivables: number;
  arPercentCurrent: number;
  arPercentOverdue: number;
  totalPayables: number;
  overdueBillsCount: number;
  currencySymbol: string;
  onNavigate: (tab: any) => void;
}

export const ReceivablesPayablesWidget: React.FC<ReceivablesPayablesWidgetProps> = ({
  accountsReceivable,
  currentReceivables,
  overdueReceivables,
  arPercentCurrent,
  arPercentOverdue,
  totalPayables,
  overdueBillsCount,
  currencySymbol,
  onNavigate,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between shadow-2xs h-full">
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
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Invoices →
            </button>
          </div>

          <div className="text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
            {formatCurrency(accountsReceivable, currencySymbol)}
          </div>

          <div className="mt-2.5 space-y-1.5">
            <div>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="text-slate-400 uppercase tracking-wider font-bold text-[9px]">Current</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {formatCurrency(currentReceivables, currencySymbol)}
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
                  {formatCurrency(overdueReceivables, currencySymbol)}
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
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
            >
              Expenses →
            </button>
          </div>

          <div className="text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
            {formatCurrency(totalPayables, currencySymbol)}
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
};
