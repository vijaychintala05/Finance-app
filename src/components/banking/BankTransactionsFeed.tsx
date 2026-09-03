import React from 'react';
import {
  ArrowDownLeft,
  Building2,
  ChevronRight,
  CreditCard,
  History,
  Landmark,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Wallet,
} from 'lucide-react';
import { Account } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { BankTransactionItem } from './BankTransactionDetailsModal';

interface BankTransactionsFeedProps {
  activeAccount: Account | null;
  accountTransactions: BankTransactionItem[];
  txSearch: string;
  setTxSearch: (val: string) => void;
  txFilter: 'ALL' | 'IN' | 'OUT';
  setTxFilter: (filter: 'ALL' | 'IN' | 'OUT') => void;
  currencySymbol: string;
  onOpenReconcile: () => void;
  onOpenImportStatement: () => void;
  onOpenRecordTx: () => void;
  onSelectTx: (tx: BankTransactionItem) => void;
}

export const BankTransactionsFeed: React.FC<BankTransactionsFeedProps> = ({
  activeAccount,
  accountTransactions,
  txSearch,
  setTxSearch,
  txFilter,
  setTxFilter,
  currencySymbol,
  onOpenReconcile,
  onOpenImportStatement,
  onOpenRecordTx,
  onSelectTx,
}) => {
  if (!activeAccount) {
    return (
      <div className="lg:col-span-9 bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
        <Landmark className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
        <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">No Account Selected</h3>
        <p className="text-xs text-slate-400 mt-1">Please select an account from the left list to view transactions.</p>
      </div>
    );
  }

  return (
    <div className="lg:col-span-9 space-y-5">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
        {/* BANK'S DASHBOARD HEADER */}
        <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white p-6 border-b border-slate-200 dark:border-slate-800 space-y-4">
          {/* Account Name & Primary Workflows Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30 flex items-center justify-center font-bold text-xl shrink-0">
                {activeAccount.subType === 'Bank' && <Landmark className="w-6 h-6" />}
                {(activeAccount.subType === 'Cash' || activeAccount.subType === 'Cash & Bank') && (
                  <Wallet className="w-6 h-6" />
                )}
                {activeAccount.subType === 'Credit Cards' && <CreditCard className="w-6 h-6" />}
                {activeAccount.subType !== 'Bank' &&
                  activeAccount.subType !== 'Cash' &&
                  activeAccount.subType !== 'Credit Cards' && <Building2 className="w-6 h-6" />}
              </div>

              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">{activeAccount.name}</h2>
                  <span className="text-[10px] font-mono bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-bold">
                    #{activeAccount.code}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                      (activeAccount.status || 'Active') === 'Active'
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                        : 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30'
                    }`}
                  >
                    {activeAccount.status || 'Active'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                  Subtype: {activeAccount.subType} • Account Type: {activeAccount.type}
                </p>
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex items-center flex-wrap gap-2">
              <button
                onClick={onOpenReconcile}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold rounded-xl flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reconcile</span>
              </button>

              <button
                onClick={onOpenImportStatement}
                className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                <span>Import Statement</span>
              </button>

              {activeAccount.type === 'Asset' && (
                <button
                  onClick={onOpenRecordTx}
                  className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Record Transaction</span>
                </button>
              )}

            </div>
          </div>

          {/* RECONCILIATION & GL METRICS PANEL */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-slate-900/80 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">GL Balance</span>
              <span className="text-base font-black font-mono text-slate-900 dark:text-slate-100 mt-0.5 block">
                {formatCurrency(activeAccount.balance, currencySymbol)}
              </span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block">Statement Balance</span>
              <span className="text-xs font-bold text-slate-500 mt-1 block">Unavailable</span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Unreconciled Diff</span>
              <span className="text-xs font-bold text-slate-500 mt-1 block">Unavailable</span>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Reconciled Through</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1 block">
                Not reconciled
              </span>
            </div>
          </div>
        </div>

        {/* RECORDED TRANSACTIONS HEADER & FILTERS */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
              Recorded Transactions ({accountTransactions.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tx Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold pl-8 pr-2.5 py-1.5 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* Tx Filter Tabs: ALL / IN / OUT */}
            <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-0.5 rounded-xl text-xs font-bold">
              <button
                onClick={() => setTxFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  txFilter === 'ALL'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setTxFilter('IN')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  txFilter === 'IN'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Debits
              </button>
              <button
                onClick={() => setTxFilter('OUT')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  txFilter === 'OUT'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Credits
              </button>
            </div>
          </div>
        </div>

        {/* TRANSACTIONS TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Description / Particulars</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Source Status</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {accountTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="font-bold text-slate-600 dark:text-slate-400">
                      No recorded transactions for {activeAccount.name}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Click "Record Transaction" to log your first entry.
                    </p>
                  </td>
                </tr>
              ) : (
                accountTransactions.map((tx) => {
                  const isDebit = tx.type === 'DEBIT';

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => onSelectTx(tx)}
                      className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                        {tx.ref}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">{tx.description}</div>
                        {tx.partyName && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{tx.partyName}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            isDebit
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {isDebit ? 'Debit' : 'Credit'}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase border bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                          {tx.status || 'Posted'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className="text-slate-900 dark:text-white">
                          {formatCurrency(tx.amount, currencySymbol)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mx-auto" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
