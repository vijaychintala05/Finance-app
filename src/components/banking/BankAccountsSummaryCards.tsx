import React from 'react';
import { CreditCard, Landmark, Plus, RefreshCw, Upload, Wallet } from 'lucide-react';
import { Account } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { QuickAccountCategory } from '../common/QuickAddAccountModal';

interface BankAccountsSummaryCardsProps {
  totalCashInBank: number;
  totalPettyCash: number;
  totalCreditCardLoans: number;
  bankAccountsList: Account[];
  pettyCashList: Account[];
  creditCardLoansList: Account[];
  currencySymbol: string;
  showMoreDetails: boolean;
  setShowMoreDetails: (show: boolean) => void;
  onOpenReconcile: () => void;
  onOpenImportStatement: () => void;
  onOpenAddAccount: (cat: QuickAccountCategory) => void;
}

export const BankAccountsSummaryCards: React.FC<BankAccountsSummaryCardsProps> = ({
  totalCashInBank,
  totalPettyCash,
  totalCreditCardLoans,
  bankAccountsList,
  pettyCashList,
  creditCardLoansList,
  currencySymbol,
  showMoreDetails,
  setShowMoreDetails,
  onOpenReconcile,
  onOpenImportStatement,
  onOpenAddAccount,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-5">
      {/* Title & Top Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-2xs">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Banking & Cash Management
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
              Live treasury balances across bank accounts, petty cash drawers, and corporate credit cards.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={onOpenReconcile}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reconcile Bank</span>
          </button>
          <button
            onClick={onOpenImportStatement}
            className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Import Statement</span>
          </button>
          <button
            onClick={() => onOpenAddAccount('Bank')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* 3 TOP KPI SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Bank Balance */}
        <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/40 dark:from-blue-950/40 dark:to-slate-900 border border-blue-100 dark:border-blue-900/60 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">
              Bank Balance
            </span>
            <Landmark className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight mt-1">
            {formatCurrency(totalCashInBank, currencySymbol)}
          </p>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {bankAccountsList.length} active bank {bankAccountsList.length === 1 ? 'account' : 'accounts'}
          </p>
        </div>

        {/* Card 2: Cash Balance */}
        <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/40 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-100 dark:border-emerald-900/60 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">
              Cash Balance
            </span>
            <Wallet className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight mt-1">
            {formatCurrency(totalPettyCash, currencySymbol)}
          </p>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {pettyCashList.length} physical cash & wallet {pettyCashList.length === 1 ? 'vault' : 'vaults'}
          </p>
        </div>

        {/* Card 3: Credit & Loans */}
        <div className="bg-gradient-to-br from-purple-50/80 to-pink-50/40 dark:from-purple-950/40 dark:to-slate-900 border border-purple-100 dark:border-purple-900/60 p-4 rounded-2xl space-y-1">
          <div className="flex items-center justify-between text-purple-700 dark:text-purple-400">
            <span className="text-[11px] font-extrabold uppercase tracking-wider">
              Credit & Loans
            </span>
            <CreditCard className="w-4 h-4" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight mt-1">
            {formatCurrency(totalCreditCardLoans, currencySymbol)}
          </p>
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            {creditCardLoansList.length} credit card & loan {creditCardLoansList.length === 1 ? 'account' : 'accounts'}
          </p>
        </div>
      </div>

      {/* MORE DETAILS TOGGLE */}
      <div className="flex items-center space-x-3 pt-2">
        <button
          onClick={() => setShowMoreDetails(!showMoreDetails)}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-2 border ${
            showMoreDetails
              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
              : 'bg-slate-100 text-slate-700 border-transparent hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          <span>{showMoreDetails ? 'Hide Account Details' : 'Show Account Details'}</span>
        </button>
      </div>
    </div>
  );
};
