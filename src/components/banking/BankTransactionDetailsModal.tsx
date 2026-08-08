import React from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Landmark,
  Printer,
  Receipt,
  User,
  X,
  Wallet,
  CreditCard,
} from 'lucide-react';
import { Account, FirmSettings } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';

export interface BankTransactionItem {
  id: string;
  date: string;
  ref: string;
  description: string;
  partyName?: string;
  type: 'DEBIT' | 'CREDIT'; // DEBIT = Money In (+), CREDIT = Money Out (-)
  amount: number;
  category?: string;
  source: 'JOURNAL' | 'EXPENSE' | 'RECEIPT' | 'PAYMENT' | 'DIRECT';
  status?: 'Posted' | 'Cleared' | 'Pending';
  accountId: string;
  accountName: string;
  accountCode: string;
  accountSubType?: string;
}

interface BankTransactionDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: BankTransactionItem | null;
  settings: FirmSettings;
}

export const BankTransactionDetailsModal: React.FC<BankTransactionDetailsModalProps> = ({
  isOpen,
  onClose,
  transaction,
  settings,
}) => {
  if (!isOpen || !transaction) return null;

  const isMoneyIn = transaction.type === 'DEBIT';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                isMoneyIn
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
              }`}
            >
              {isMoneyIn ? (
                <ArrowDownLeft className="w-5 h-5" />
              ) : (
                <ArrowUpRight className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Transaction Details
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                Ref #{transaction.ref}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrint}
              title="Print Receipt"
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <Printer className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY CONTENT */}
        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* AMOUNT & DIRECTION BADGE */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Transaction Amount
              </p>
              <h2
                className={`text-2xl sm:text-3xl font-black font-mono tracking-tight mt-1 ${
                  isMoneyIn
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {isMoneyIn ? '+' : '-'} {formatCurrency(transaction.amount, settings.currencySymbol)}
              </h2>
            </div>

            <div className="text-right space-y-1">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold border ${
                  isMoneyIn
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                }`}
              >
                {isMoneyIn ? 'Money In (Deposit)' : 'Money Out (Withdrawal)'}
              </span>
              <div className="flex items-center justify-end text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 mr-1" />
                <span>{transaction.status || 'Posted'}</span>
              </div>
            </div>
          </div>

          {/* ACCOUNT & PARTY DETAILS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Account Box */}
            <div className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Bank / Treasury Account
              </span>
              <p className="font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>{transaction.accountName}</span>
              </p>
              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                Code: #{transaction.accountCode}
              </p>
            </div>

            {/* Date Box */}
            <div className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400">
                Transaction Date
              </span>
              <p className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>{formatDate(transaction.date)}</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Entry Type: {transaction.source}
              </p>
            </div>
          </div>

          {/* DESCRIPTION & PARTICULARS */}
          <div className="space-y-3">
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Description / Particulars
              </span>
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-700/80 mt-1">
                {transaction.description || 'Standard Banking Ledger Transaction.'}
              </p>
            </div>

            {transaction.partyName && (
              <div className="flex items-center justify-between text-xs bg-indigo-50/50 dark:bg-indigo-950/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                  Associated Payee / Party
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{transaction.partyName}</span>
                </span>
              </div>
            )}
          </div>

          {/* DOUBLE ENTRY LEDGER IMPACT SUMMARY */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
            <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
              Accounting Entry Breakdown
            </span>
            <div className="text-xs space-y-1.5 font-mono">
              <div className="flex justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                <span className="text-slate-700 dark:text-slate-300">
                  {isMoneyIn ? `Debit (+): ${transaction.accountName}` : `Debit (+): Expense / Payable Account`}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(transaction.amount, settings.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700 dark:text-slate-300">
                  {isMoneyIn ? `Credit (-): Revenue / Receivable Account` : `Credit (-): ${transaction.accountName}`}
                </span>
                <span className="font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(transaction.amount, settings.currencySymbol)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
