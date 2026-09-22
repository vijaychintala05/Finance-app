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
  XCircle,
} from 'lucide-react';
import { Account, JournalEntry } from '../../types';
import { BankAccount, BankStatementTransaction } from '../../types/banking';
import { BankingService } from '../../services/bankingService';
import { formatCurrency, formatDate } from '../../utils/formatters';

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
  refreshTrigger?: number;
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
  refreshTrigger,
}) => {
  const [statementRows, setStatementRows] = useState<BankStatementTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'ALL' | 'TO_REVIEW' | 'POSSIBLE_DUPLICATES' | 'MATCHED' | 'CATEGORIZED' | 'RECONCILED'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvingTransactionId, setResolvingTransactionId] = useState<string | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  const [workspaceBalances, setWorkspaceBalances] = useState<{
    bookBalance: number | null;
    statementBalance: number | null;
    difference: number | null;
  } | null>(null);

  // Fetch statement rows and live balances for this bank account
  const loadWorkspaceTransactions = React.useCallback(async () => {
    let targetBnk = bankAccount;
    if (!targetBnk && account && typeof BankingService.getAccounts === 'function') {
      try {
        const list = await BankingService.getAccounts();
        targetBnk = list.find((b) => b.ledgerAccountId === account.id || b.id === account.id) || null;
      } catch (e) {
        // Fallback silently
      }
    }
    if (!targetBnk) return;
    setIsLoading(true);
    try {
      if (typeof BankingService.getWorkspace === 'function') {
        try {
          const ws = await BankingService.getWorkspace(targetBnk.id);
          if (ws?.transactions) {
            setStatementRows(ws.transactions);
            if (ws.balances) {
              setWorkspaceBalances(ws.balances);
            }
            return;
          }
        } catch (wsErr) {
          console.warn('Workspace endpoint failed, falling back to getTransactions:', wsErr);
        }
      }

      if (typeof BankingService.getTransactions === 'function') {
        const rows = await BankingService.getTransactions({
          bankAccountId: targetBnk.id,
          limit: 100,
        });
        setStatementRows(rows || []);
      }
    } catch (err) {
      console.warn('Could not load bank statement transactions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [bankAccount, account]);

  useEffect(() => {
    void loadWorkspaceTransactions();
  }, [loadWorkspaceTransactions, refreshTrigger]);

  // Bank workspaces show statement evidence only. Ledger movements remain in
  // the accounting workspace until an explicit bank match links the two.
  const mergedTransactions = useMemo(() => {
    return statementRows.map((tx: any) => {
      const isCredit = tx.direction === 'CREDIT' || tx.type === 'CREDIT' || tx.type === 'DEPOSIT';
      const isDebit = tx.direction === 'DEBIT' || tx.type === 'DEBIT' || tx.type === 'WITHDRAWAL';
      return {
        id: tx.id,
        date: tx.transactionDate,
        description: tx.narration || tx.description || 'Statement Transaction',
        particulars: tx.narration || tx.description,
        reference: tx.reference || tx.referenceNumber || tx.utr || tx.chequeNumber || '—',
        counterparty: tx.counterpartyName,
        withdrawal: isDebit ? Math.abs(tx.amount) : isCredit ? null : Math.abs(tx.amount),
        deposit: isCredit ? Math.abs(tx.amount) : null,
        status: tx.reconciliationStatus || tx.status || 'TO_REVIEW',
        rawTx: tx,
      };
    });
  }, [statementRows]);

  // Tab Filtering
  const filteredTransactions = useMemo(() => {
    let list = mergedTransactions;
    if (activeTab === 'TO_REVIEW') {
      list = list.filter(
        (tx) =>
          tx.status === 'UNMATCHED' ||
          tx.status === 'TO_REVIEW' ||
          tx.status === 'RECOGNIZED' ||
          tx.status === 'POSTED'
      );
    } else if (activeTab === 'POSSIBLE_DUPLICATES') {
      list = list.filter((tx) => tx.status === 'POSSIBLE_DUPLICATE');
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

  // Workspace Balances (prioritize live server reconciliation response)
  const bookBalance =
    workspaceBalances?.bookBalance !== undefined && workspaceBalances?.bookBalance !== null
      ? workspaceBalances.bookBalance
      : Number(account.balance || 0);
  const statementBalance =
    workspaceBalances?.statementBalance !== undefined && workspaceBalances?.statementBalance !== null
      ? workspaceBalances.statementBalance
      : (bankAccount?.currentBalance ?? null);
  const difference =
    workspaceBalances?.difference !== undefined && workspaceBalances?.difference !== null
      ? workspaceBalances.difference
      : (statementBalance !== null ? statementBalance - bookBalance : null);
  const isBalanced = difference === 0;

  const toReviewCount = mergedTransactions.filter(
    (tx) =>
      tx.status === 'UNMATCHED' ||
      tx.status === 'TO_REVIEW' ||
      tx.status === 'RECOGNIZED'
  ).length;
  const possibleDuplicatesCount = mergedTransactions.filter((tx) => tx.status === 'POSSIBLE_DUPLICATE').length;

  const resolvePossibleDuplicate = async (transactionId: string, keepAsNew: boolean) => {
    setResolvingTransactionId(transactionId);
    setResolutionError(null);
    try {
      // The existing audited ignore endpoint also restores a row to TO_REVIEW
      // when isIgnored=false. That is the explicit "keep" decision here.
      await BankingService.ignoreTransaction(transactionId, !keepAsNew);
      await loadWorkspaceTransactions();
      setActiveTab(keepAsNew ? 'TO_REVIEW' : 'ALL');
      onRefresh?.();
    } catch (error) {
      setResolutionError(error instanceof Error ? error.message : 'Could not resolve the possible duplicate.');
    } finally {
      setResolvingTransactionId(null);
    }
  };

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
      {resolutionError && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
          <span>{resolutionError}</span>
          <button type="button" onClick={() => setResolutionError(null)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss duplicate resolution error">
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}
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
          {possibleDuplicatesCount > 0 && (
            <button
              onClick={() => setActiveTab('POSSIBLE_DUPLICATES')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'POSSIBLE_DUPLICATES'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-2xs'
                  : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
              }`}
            >
              Possible duplicates ({possibleDuplicatesCount})
            </button>
          )}
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

        <div className="flex items-center gap-2">
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
          <button
            onClick={() => {
              void loadWorkspaceTransactions();
              onRefresh?.();
            }}
            disabled={isLoading}
            className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
            title="Refresh transactions"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* 5. THE ZOHO BOOKS BANKING TABLE COLUMNS */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="mobile-record-table w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="py-3.5 px-5">Date</th>
                <th className="py-3.5 px-5">Particulars / Description</th>
                <th className="py-3.5 px-5 text-right">Withdrawals (DR)</th>
                <th className="py-3.5 px-5 text-right">Deposits (CR)</th>
                <th className="py-3.5 px-5 text-center">Status</th>
                <th className="sticky right-0 z-10 bg-slate-50 py-3.5 px-5 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] dark:bg-slate-950">
                  Actions
                </th>
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
                      Import a CSV or spreadsheet statement to see bank evidence here. General-ledger activity stays separate until you explicitly match it.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const isUnmatched =
                    tx.status === 'UNMATCHED' || tx.status === 'TO_REVIEW' || tx.status === 'POSTED';
                  const isMatched = tx.status === 'MATCHED';
                  const isCategorized = tx.status === 'CATEGORIZED';
                  const isReconciled = tx.status === 'RECONCILED';
                  const isPossibleDuplicate = tx.status === 'POSSIBLE_DUPLICATE';
                  const isResolving = resolvingTransactionId === tx.id;

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
                        {isPossibleDuplicate ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
                            Possible duplicate
                          </span>
                        ) : isUnmatched ? (
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
                      <td
                        className="mobile-record-actions sticky right-0 z-[1] bg-white py-3.5 px-5 text-right shadow-[-8px_0_12px_-12px_rgba(15,23,42,0.45)] group-hover:bg-blue-50 dark:bg-slate-900 dark:group-hover:bg-slate-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end space-x-1.5">
                          {isPossibleDuplicate ? (
                            <>
                              <button
                                type="button"
                                disabled={isResolving}
                                onClick={() => void resolvePossibleDuplicate(tx.id, true)}
                                className="px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/40 rounded-lg transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-50 inline-flex items-center space-x-1 whitespace-nowrap"
                                title="Keep this row and move it to To Review"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isResolving ? 'Saving…' : 'Keep as new'}</span>
                              </button>
                              <button
                                type="button"
                                disabled={isResolving}
                                onClick={() => void resolvePossibleDuplicate(tx.id, false)}
                                className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-50 inline-flex items-center space-x-1"
                                title="Ignore this duplicate candidate without changing the ledger"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Ignore</span>
                              </button>
                            </>
                          ) : isUnmatched && (
                            <>
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
                            </>
                          )}
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
