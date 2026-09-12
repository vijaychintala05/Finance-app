import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Wallet,
} from 'lucide-react';
import { Account } from '../../types';
import { BankingAccountOverviewItem } from '../../types/banking';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface BankingOverviewTableProps {
  accounts: Account[];
  overviewData: BankingAccountOverviewItem[];
  currencySymbol: string;
  onSelectAccount: (accountId: string) => void;
  onImportStatement: (account?: Account | null) => void;
  onReconcile: (account?: Account | null) => void;
  onTransferFunds: () => void;
  onRecordTransaction: () => void;
}

export const BankingOverviewTable: React.FC<BankingOverviewTableProps> = ({
  accounts,
  overviewData,
  currencySymbol,
  onSelectAccount,
  onImportStatement,
  onReconcile,
  onTransferFunds,
  onRecordTransaction,
}) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'BANKS' | 'CREDIT_CARDS' | 'CASH'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Merge overviewData from backend with context accounts
  const mergedAccounts = useMemo(() => {
    return accounts
      .filter(
        (a) =>
          a.type === 'Bank' ||
          a.subType === 'Bank' ||
          a.subType === 'Cash' ||
          a.subType === 'Cash & Bank' ||
          a.subType === 'Credit Card' ||
          a.subType === 'Credit Cards' ||
          (a.type === 'Asset' && (a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash'))) ||
          (a.type === 'Liability' && a.name.toLowerCase().includes('credit card'))
      )
      .map((acc) => {
        const item = overviewData.find(
          (o) => o.ledgerAccountId === acc.id || o.id === acc.id || o.accountName.toLowerCase() === acc.name.toLowerCase()
        );
        const bookBalance = Number(acc.balance || 0);
        const statementBalance = item?.statementBalance ?? null;
        const diff =
          item?.difference !== undefined && item?.difference !== null
            ? item.difference
            : statementBalance !== null
              ? statementBalance - bookBalance
              : null;

        return {
          account: acc,
          id: acc.id,
          name: acc.name,
          code: acc.code,
          type: acc.type,
          subType: acc.subType || 'Bank',
          bankName: item?.bankName || (acc.subType === 'Bank' ? 'Bank Account' : acc.name),
          maskedAccountNumber: item?.maskedAccountNumber || (acc.code ? `•••• ${acc.code}` : '•••• 0000'),
          bookBalance,
          statementBalance,
          difference: diff,
          toReviewCount: item?.toReviewCount || 0,
          lastStatementDate: item?.lastStatementDate || null,
          hasStatement: item?.hasStatement || Boolean(statementBalance !== null),
        };
      });
  }, [accounts, overviewData]);

  // Tab Filtering
  const filteredAccounts = useMemo(() => {
    let list = mergedAccounts;
    if (activeTab === 'BANKS') {
      list = list.filter((a) => a.subType === 'Bank' || a.account.type === 'Bank');
    } else if (activeTab === 'CREDIT_CARDS') {
      list = list.filter((a) => a.subType === 'Credit Card' || a.subType === 'Credit Cards');
    } else if (activeTab === 'CASH') {
      list = list.filter((a) => a.subType === 'Cash' || a.subType === 'Cash & Bank');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.bankName.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q)
      );
    }

    return list;
  }, [mergedAccounts, activeTab, searchQuery]);

  // Aggregate Totals
  const totalBookBalance = useMemo(
    () => mergedAccounts.reduce((sum, a) => sum + a.bookBalance, 0),
    [mergedAccounts]
  );
  const totalStatementBalance = useMemo(
    () =>
      mergedAccounts
        .filter((a) => a.statementBalance !== null)
        .reduce((sum, a) => sum + (a.statementBalance || 0), 0),
    [mergedAccounts]
  );
  const totalToReview = useMemo(
    () => mergedAccounts.reduce((sum, a) => sum + a.toReviewCount, 0),
    [mergedAccounts]
  );

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & PRIMARY ACTION BUTTONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Banking &amp; Cash Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Reconcile your statement feeds, review pending transactions, and keep your books balanced.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => onImportStatement(null)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center space-x-2 shadow-sm cursor-pointer transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Import Statement</span>
          </button>

          <button
            onClick={onTransferFunds}
            className="px-3.5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors shadow-2xs"
          >
            <ArrowDownLeft className="w-4 h-4 text-violet-600 rotate-[-90deg]" />
            <span>Transfer Funds</span>
          </button>

          <button
            onClick={onRecordTransaction}
            className="px-3.5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors shadow-2xs"
          >
            <Plus className="w-4 h-4 text-emerald-600" />
            <span>Record Transaction</span>
          </button>
        </div>
      </div>

      {/* 2. ZOHO-STYLE 3 SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Bank Balance
            </span>
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Book Balance
            </span>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mt-1.5">
            {formatCurrency(totalBookBalance, currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total across all ledger accounts</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Amount in Bank (Statement Balance)
          </span>
          <div className="text-2xl font-black font-mono text-blue-700 dark:text-blue-300 mt-1.5">
            {formatCurrency(totalStatementBalance, currencySymbol)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Confirmed from uploaded statements</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Feeds to Review
          </span>
          <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1.5">
            {totalToReview}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Uncategorized transactions awaiting match</p>
        </div>
      </div>

      {/* 3. TABS & SEARCH TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${activeTab === 'ALL'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            All Accounts ({mergedAccounts.length})
          </button>
          <button
            onClick={() => setActiveTab('BANKS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${activeTab === 'BANKS'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            Bank Accounts
          </button>
          <button
            onClick={() => setActiveTab('CREDIT_CARDS')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${activeTab === 'CREDIT_CARDS'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            Credit Cards
          </button>
          <button
            onClick={() => setActiveTab('CASH')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${activeTab === 'CASH'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
          >
            Petty Cash
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter bank accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold pl-9 pr-3 py-2 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* 4. ZOHO BOOKS BANKING TABLE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="py-3.5 px-5">Bank Account</th>
                <th className="py-3.5 px-5">Amount in FirmBooks</th>
                <th className="py-3.5 px-5">Amount in Bank</th>
                <th className="py-3.5 px-5">Difference</th>
                <th className="py-3.5 px-5 text-center">To Review</th>
                <th className="py-3.5 px-5">Last Imported</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <FileSpreadsheet className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="font-bold text-slate-700 dark:text-slate-300">No bank accounts match your search</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Upload a bank statement to provision or configure an account.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((item) => {
                  const isBalanced = item.difference === 0;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectAccount(item.id)}
                      className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      {/* 1. BANK ACCOUNT */}
                      <td className="py-4 px-5">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center shrink-0">
                            {item.subType === 'Credit Card' || item.subType === 'Credit Cards' ? (
                              <CreditCard className="w-5 h-5" />
                            ) : item.subType === 'Cash' || item.subType === 'Cash & Bank' ? (
                              <Wallet className="w-5 h-5" />
                            ) : (
                              <Landmark className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {item.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                              <span className="font-mono">{item.maskedAccountNumber}</span>
                              <span>•</span>
                              <span className="capitalize">{item.subType}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. AMOUNT IN FIRMBOOKS */}
                      <td className="py-4 px-5">
                        <div className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                          {formatCurrency(item.bookBalance, currencySymbol)}
                        </div>
                        <span className="text-[10px] text-slate-400">Book Balance</span>
                      </td>

                      {/* 3. AMOUNT IN BANK */}
                      <td className="py-4 px-5">
                        {item.statementBalance !== null ? (
                          <div>
                            <div className="font-mono font-bold text-blue-600 dark:text-blue-400 text-sm">
                              {formatCurrency(item.statementBalance, currencySymbol)}
                            </div>
                            <span className="text-[10px] text-slate-400">Statement Balance</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center space-x-1 text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                            <span>No statement</span>
                          </div>
                        )}
                      </td>

                      {/* 4. DIFFERENCE */}
                      <td className="py-4 px-5">
                        {item.difference === null ? (
                          <span className="text-slate-400 text-xs">—</span>
                        ) : isBalanced ? (
                          <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Balanced</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 text-[11px] font-mono font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2.5 py-0.5 rounded-full">
                            <span>Diff: {formatCurrency(item.difference, currencySymbol)}</span>
                          </span>
                        )}
                      </td>

                      {/* 5. TO REVIEW */}
                      <td className="py-4 px-5 text-center">
                        {item.toReviewCount > 0 ? (
                          <span className="inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            {item.toReviewCount} to review
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            0
                          </span>
                        )}
                      </td>

                      {/* 6. LAST IMPORTED */}
                      <td className="py-4 px-5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {item.lastStatementDate ? formatDate(item.lastStatementDate) : '—'}
                      </td>

                      {/* 7. ACTIONS */}
                      <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => onImportStatement(item.account)}
                            className="px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer"
                            title="Import statement for this bank"
                          >
                            Import
                          </button>
                          <button
                            type="button"
                            onClick={() => onReconcile(item.account)}
                            className="px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:text-slate-900 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Reconcile bank account"
                          >
                            Reconcile
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectAccount(item.id)}
                            className="p-1.5 text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Open workspace"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
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
