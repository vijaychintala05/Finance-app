import React from 'react';
import { ArrowUpRight, CreditCard, Landmark, RefreshCw, Wallet } from 'lucide-react';
import { Account } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface BankAndCashWidgetProps {
  totalBankBalance: number;
  totalCashBalance: number;
  totalCreditBalance: number;
  bankAccounts: Account[];
  cashAccounts: Account[];
  creditCardAccounts: Account[];
  currencySymbol: string;
  onNavigate: (tab: any) => void;
}

export const BankAndCashWidget: React.FC<BankAndCashWidgetProps> = ({
  totalBankBalance,
  totalCashBalance,
  totalCreditBalance,
  bankAccounts,
  cashAccounts,
  creditCardAccounts,
  currencySymbol,
  onNavigate,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs flex flex-col justify-between">
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
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 cursor-pointer"
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
              {formatCurrency(totalBankBalance, currencySymbol)}
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
              {formatCurrency(totalCashBalance, currencySymbol)}
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
              {formatCurrency(totalCreditBalance, currencySymbol)}
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
                {formatCurrency(acc.balance, currencySymbol)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
