import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileCheck2,
  FileSpreadsheet,
  History,
  Landmark,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Wallet,
} from 'lucide-react';
import { Account, JournalEntry } from '../../types';
import { BankAccount, BankStatementTransaction } from '../../types/banking';
import { BankingService } from '../../services/bankingService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { displayJournalNumber } from '../../utils/journalDisplay';

interface BankAccountWorkspaceProps {
  account: Account;
  bankAccount: BankAccount | null;
  journalEntries: JournalEntry[];
  currencySymbol: string;
  onBackToOverview: () => void;
  onImportStatement: () => void;
  onReconcile: () => void;
  onTransferFunds: () => void;
  onRecordTransaction: () => void;
  onOpenMatch: (tx: any) => void;
  onOpenCategorize: (tx: any) => void;
  onSelectTxDetails: (tx: any) => void;
  onRefresh: () => void;
}

export const BankAccountWorkspace: React.FC<BankAccountWorkspaceProps> = ({
  account,
  bankAccount,
  journalEntries,
  currencySymbol,
  onBackToOverview,
  onImportStatement,
  onReconcile,
  onTransferFunds,
  onRecordTransaction,
  onOpenMatch,
  onOpenCategorize,
  onSelectTxDetails,
  onRefresh,
}) => {
  const [statementRows, setStatementRows] = useState<BankStatementTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'ALL' | 'TO_REVIEW' | 'MATCHED' | 'CATEGORIZED' | 'RECONCILED'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch statement rows for this bank account
  const loadWorkspaceTransactions = React.useCallback(async () => {
    if (!bankAccount || typeof BankingService.getTransactions !== 'function') return;
    setIsLoading(true);
    try {
      const rows = await BankingService.getTransactions({
        bankAccountId: bankAccount.id,
        limit: 100,
      });
      setStatementRows(rows || []);
    } catch (err) {
      console.warn('Could not load bank statement transactions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [bankAccount]);

  useEffect(() => {
    void loadWorkspaceTransactions();
  }, [loadWorkspaceTransactions]);

  // If no statement rows uploaded yet, generate fallback rows from posted GL journals
  const mergedTransactions = useMemo(() => {
    if (statementRows.length > 0) {
      return statementRows.map((tx) => {
        const isCredit = tx.type === 'CREDIT' || tx.type === 'DEPOSIT';
        return {
          id: tx.id,
          date: tx.transactionDate,
          description: tx.description || 'Statement Transaction',
          particulars: tx.description,
          reference: tx.referenceNumber || tx.utr || tx.chequeNumber || '—',
          counterparty: tx.counterpartyName,
          withdrawal: isCredit ? null : Math.abs(tx.amount),
          deposit: isCredit ? Math.abs(tx.amount) : null,
          status: tx.reconciliationStatus, // 'UNMATCHED' | 'MATCHED' | 'CATEGORIZED' | 'RECONCILED'
          rawTx: tx,
        };
      });
    }

    // Fallback to posted journals on this ledger account
    const fallbackList: any[] = [];
    const postedJournals = journalEntries.filter(
      (j) => String(j.status || '').toUpperCase() === 'POSTED'
    );
    postedJournals.forEach((jrn) => {
      jrn.lines.forEach((line) => {
        if (line.accountId === account.id) {
          const isDebit = line.debit > 0;
          fallbackList.push({
            id: `jrn-${jrn.id}-${line.id}`,
            date: jrn.date,
            description: line.description || jrn.description || 'GL Movement',
            particulars: line.description || jrn.description,
            reference: displayJournalNumber(jrn.entryNumber, jrn.reference),
            counterparty: undefined,
            withdrawal: line.credit > 0 ? line.credit : null,
            deposit: line.debit > 0 ? line.debit : null,
            status: 'POSTED',
            rawTx: {
              id: `jrn-${jrn.id}-${line.id}`,
              date: jrn.date,
              description: line.description || jrn.description,
              amount: isDebit ? line.debit : line.credit,
              type: isDebit ? 'CREDIT' : 'DEBIT',
            },
          });
        }
      });
    });

    return fallbackList.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [statementRows, journalEntries, account.id]);

  // Tab Filtering
  const filteredTransactions = useMemo(() => {
    let list = mergedTransactions;
    if (activeTab === 'TO_REVIEW') {
      list = list.filter(
        (tx) => tx.status === 'UNMATCHED' || tx.status === 'TO_REVIEW' || tx.status === 'POSTED'
      );
    } else if (activeTab === 'MATCHED') {
      list = list.filter((tx) => tx.status === 'MATCHED');
    } else if (activeTab === 'CATEGORIZED') {
      list = list.filter((tx) => tx.status === 'CATEGORIZED');
    } else if (activeTab === 'RECONCILED') {
      list = list.filter((tx) => tx.status === 'RECONCILED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (tx) =>
          tx.description.toLowerCase().includes(q) ||
          (tx.reference && tx.reference.toLowerCase().includes(q)) ||
          (tx.counterparty && tx.counterparty.toLowerCase().includes(q))
      );
    }

    return list;
  }, [mergedTransactions, activeTab, searchQuery]);

  // Workspace Balances
  const bookBalance = Number(account.balance || 0);
  const statementBalance = bankAccount?.currentBalance ?? null;
  const difference = statementBalance !== null ? statementBalance - bookBalance : null;
  const isBalanced = difference === 0;

  const toReviewCount = mergedTransactions.filter(
    (tx) => tx.status === 'UNMATCHED' || tx.status === 'TO_REVIEW'
  ).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. BREADCRUMB & BACK BUTTON */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToOverview}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Bank Accounts</span>
        </button>

        <span className="text-[11px] font-mono font-semibold text-slate-400">
          Account ID: #{account.code || account.id.slice(0, 6)}
        </span>
      </div>

      {/* 2. ACCOUNT HEADER BANNER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 flex items-center justify-center shrink-0">
              {account.subType === 'Credit Card' || account.subType === 'Credit Cards' ? (
                <CreditCard className="w-6 h-6" />
              ) : account.subType === 'Cash' || account.subType === 'Cash & Bank' ? (
                <Wallet className="w-6 h-6" />
              ) : (
                <Landmark className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-black text-slate-900 dark:text-white">
                  {account.name}
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-bold">
                  {bankAccount?.accountNumber ? `•••• ${bankAccount.accountNumber.slice(-4)}` : `#${account.code}`}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {account.status || 'Active'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                {bankAccount?.bankName || 'Bank Account'} • {account.subType || account.type}
              </p>
            </div>
          </div>

          {/* Top Actions */}
          <div className="flex items-center flex-wrap gap-2">
            <button
              onClick={onImportStatement}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl flex items-center space-x-2 shadow-sm cursor-pointer transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import Statement</span>
            </button>

            <button
              onClick={onReconcile}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-indigo-600" />
              <span>Reconcile</span>
            </button>

            <button
              onClick={onTransferFunds}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              <ArrowDownLeft className="w-4 h-4 text-violet-600 rotate-[-90deg]" />
              <span>Transfer Funds</span>
            </button>

            <button
              onClick={onRecordTransaction}
              className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl flex items-center space-x-1.5 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Record Transaction</span>
            </button>
          </div>
        </div>

        {/* 3. ZOHO BOOKS 3 BALANCE CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4 border-t border-slate-200/80 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Amount in FirmBooks
            </span>
            <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
              {formatCurrency(bookBalance, currencySymbol)}
            </div>
            <span className="text-[10px] text-slate-400">General Ledger Balance</span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Amount in Bank
            </span>
            <div className="text-xl font-black font-mono text-blue-700 dark:text-blue-300 mt-1">
              {statementBalance !== null ? formatCurrency(statementBalance, currencySymbol) : 'No statement'}
            </div>
            <span className="text-[10px] text-slate-400">
              {statementBalance !== null ? 'Latest statement closing balance' : 'Import statement to update'}
            </span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Difference
            </span>
            <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1">
              {difference === null ? (
                <span className="text-slate-400">—</span>
              ) : isBalanced ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1">
                  <CheckCircle2 className="w-5 h-5 inline-block mr-1" />
                  <span>{formatCurrency(0, currencySymbol)}</span>
                </span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400">
                  {formatCurrency(difference, currencySymbol)}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400">
              {isBalanced ? 'Books are fully reconciled' : 'Unreconciled discrepancy'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. TABS & SEARCH TOOLBAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'ALL'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Transactions ({mergedTransactions.length})
          </button>
          <button
            onClick={() => setActiveTab('TO_REVIEW')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'TO_REVIEW'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            To Review ({toReviewCount})
          </button>
          <button
            onClick={() => setActiveTab('MATCHED')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'MATCHED'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Matched
          </button>
          <button
            onClick={() => setActiveTab('CATEGORIZED')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'CATEGORIZED'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Categorized
          </button>
          <button
            onClick={() => setActiveTab('RECONCILED')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'RECONCILED'
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Reconciled
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search description, reference, party..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold pl-9 pr-3 py-2 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
          />
        </div>
      </div>

      {/* 5. THE ZOHO BOOKS BANKING TABLE COLUMNS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="py-3.5 px-5">Date</th>
                <th className="py-3.5 px-5">Particulars / Description</th>
                <th className="py-3.5 px-5 text-right">Withdrawals (DR)</th>
                <th className="py-3.5 px-5 text-right">Deposits (CR)</th>
                <th className="py-3.5 px-5 text-center">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <History className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="font-bold text-slate-700 dark:text-slate-300">
                      No transactions found for this filter
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Upload a statement or record a manual transaction to populate feeds.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isUnmatched = tx.status === 'UNMATCHED' || tx.status === 'TO_REVIEW';
                  const isMatched = tx.status === 'MATCHED';
                  const isCategorized = tx.status === 'CATEGORIZED';
                  const isReconciled = tx.status === 'RECONCILED';

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => onSelectTxDetails(tx.rawTx)}
                      className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      {/* 1. DATE */}
                      <td className="py-3.5 px-5 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {formatDate(tx.date)}
                      </td>

                      {/* 2. PARTICULARS / DESCRIPTION */}
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {tx.particulars || tx.description}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                          {tx.reference && tx.reference !== '—' && (
                            <span className="font-mono">{tx.reference}</span>
                          )}
                          {tx.counterparty && (
                            <>
                              <span>•</span>
                              <span>{tx.counterparty}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 3. WITHDRAWALS (DR) */}
                      <td className="py-3.5 px-5 text-right font-mono font-bold whitespace-nowrap">
                        {tx.withdrawal ? (
                          <span className="text-slate-900 dark:text-slate-100">
                            {formatCurrency(tx.withdrawal, currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* 4. DEPOSITS (CR) */}
                      <td className="py-3.5 px-5 text-right font-mono font-bold whitespace-nowrap">
                        {tx.deposit ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{formatCurrency(tx.deposit, currencySymbol)}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>

                      {/* 5. STATUS */}
                      <td className="py-3.5 px-5 text-center whitespace-nowrap">
                        {isUnmatched ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Uncategorized
                          </span>
                        ) : isMatched ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                            Matched
                          </span>
                        ) : isCategorized ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                            Categorized
                          </span>
                        ) : isReconciled ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            Reconciled
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {tx.status || 'Posted'}
                          </span>
                        )}
                      </td>

                      {/* 6. ACTIONS */}
                      <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenMatch(tx.rawTx)}
                            className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Match</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenCategorize(tx.rawTx)}
                            className="px-2.5 py-1 text-xs font-bold text-purple-600 hover:text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg transition-colors cursor-pointer inline-flex items-center space-x-1"
                          >
                            <FileCheck2 className="w-3.5 h-3.5" />
                            <span>Categorize</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectTxDetails(tx.rawTx)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                            title="View details"
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
