import React, { useState } from 'react';
import {
  X,
  Building2,
  FileText,
  Receipt,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Layers,
  Pencil,
  Plus,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FolderKanban,
} from 'lucide-react';
import { Account } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface AccountLedgerModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onAddSubAccount?: (account: Account) => void;
  onEditAccount?: (account: Account) => void;
}

interface LedgerTransaction {
  id: string;
  date: string;
  type: 'Expense' | 'Invoice' | 'Journal Entry';
  reference: string;
  entityName: string;
  description: string;
  projectName?: string;
  debit: number;
  credit: number;
  amount: number;
  status?: string;
}

export const AccountLedgerModal: React.FC<AccountLedgerModalProps> = ({
  account,
  isOpen,
  onClose,
  onAddSubAccount,
  onEditAccount,
}) => {
  const { accounts, expenses, invoices, journalEntries, settings } = useBooks();

  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  if (!isOpen || !account) return null;

  // Find all child accounts if this is a parent account
  const childAccountIds = accounts
    .filter((a) => a.parentId === account.id)
    .map((a) => a.id);

  const targetAccountIds = new Set([account.id, ...childAccountIds]);
  const targetAccountCodes = new Set([
    account.code,
    ...accounts.filter((a) => a.parentId === account.id).map((a) => a.code),
  ]);

  // Aggregate Transactions
  const ledgerTransactions: LedgerTransaction[] = [];

  // 1. Expenses
  expenses.forEach((exp) => {
    const isDirectMatch = targetAccountIds.has(exp.accountId);
    const isPaidFromMatch = targetAccountIds.has(exp.paidFromAccountId);
    const isItemizedMatch = exp.items?.some((i) => targetAccountIds.has(i.accountId));

    if (isDirectMatch || isPaidFromMatch || isItemizedMatch) {
      // For expense accounts or direct expenses, expense increases debit balance
      const isExpenseAcc = account.type === 'Expense' || account.type === 'Asset';
      const debit = isExpenseAcc ? exp.amount : 0;
      const credit = !isExpenseAcc ? exp.amount : 0;

      ledgerTransactions.push({
        id: `exp-${exp.id}`,
        date: exp.date,
        type: 'Expense',
        reference: exp.referenceNumber,
        entityName: exp.vendorName || exp.clientName || 'General Vendor',
        description: exp.description || `Expense under ${exp.accountName}`,
        projectName: exp.projectName,
        debit,
        credit,
        amount: exp.amount,
        status: exp.paymentStatus,
      });
    }
  });

  // 2. Invoices
  invoices.forEach((inv) => {
    const hasItemAccount = inv.items.some((i) => targetAccountIds.has(i.accountId));
    const isARAccount =
      account.code === '1100' || account.subType === 'Accounts Receivable';
    const isRevenueAccount = account.type === 'Revenue';

    if (hasItemAccount || isARAccount || isRevenueAccount) {
      // Revenue gets credit, AR / Assets get debit
      const debit = account.type === 'Asset' ? inv.totalAmount : 0;
      const credit = account.type === 'Revenue' ? inv.subtotal : 0;

      ledgerTransactions.push({
        id: `inv-${inv.id}`,
        date: inv.issueDate,
        type: 'Invoice',
        reference: inv.invoiceNumber,
        entityName: inv.clientName,
        description: inv.projectName ? `Project: ${inv.projectName}` : `Invoice to ${inv.clientName}`,
        projectName: inv.projectName,
        debit,
        credit,
        amount: inv.totalAmount,
        status: inv.status,
      });
    }
  });

  // 3. Journal Entries
  journalEntries.forEach((jrn) => {
    jrn.lines.forEach((line) => {
      if (targetAccountIds.has(line.accountId) || targetAccountCodes.has(line.accountCode)) {
        ledgerTransactions.push({
          id: `jrn-${jrn.id}-${line.id}`,
          date: jrn.date,
          type: 'Journal Entry',
          reference: jrn.entryNumber,
          entityName: jrn.reference || 'Manual Adjustment',
          description: line.description || jrn.description,
          debit: line.debit,
          credit: line.credit,
          amount: line.debit || line.credit,
          status: jrn.status,
        });
      }
    });
  });

  // Sort by date descending (newest first)
  ledgerTransactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Filter transactions
  const filteredTransactions = ledgerTransactions.filter((tx) => {
    const matchesSearch =
      tx.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.entityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tx.projectName && tx.projectName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = filterType === 'All' || tx.type === filterType;

    return matchesSearch && matchesType;
  });

  // Totals calculation
  const totalDebits = filteredTransactions.reduce((sum, tx) => sum + tx.debit, 0);
  const totalCredits = filteredTransactions.reduce((sum, tx) => sum + tx.credit, 0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl h-[94vh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="font-mono text-sm font-black bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-2.5 py-1 rounded-xl border border-blue-200 dark:border-blue-800 shrink-0">
              {account.code}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate">{account.name}</h3>
                {account.subCategory && (
                  <span className="text-[11px] sm:text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>{account.subCategory}</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Type: <strong>{account.type}</strong> ({account.subType}) {account.parentName && `• Parent: ${account.parentName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700">
            <div className="text-left sm:text-right">
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                NET LEDGER BALANCE
              </span>
              <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
                {formatCurrency(account.balance, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              {onEditAccount && (
                <button
                  onClick={() => {
                    onClose();
                    onEditAccount(account);
                  }}
                  className="px-2.5 sm:px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs min-h-[36px]"
                  title="Edit Account Details"
                >
                  <Pencil className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="hidden sm:inline">Edit Account</span>
                  <span className="sm:hidden">Edit</span>
                </button>
              )}

              <button
                onClick={() => window.print()}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                title="Print General Ledger"
              >
                <Printer className="w-4 h-4" />
              </button>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                aria-label="Close ledger modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Action & Filter Bar */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-3 text-xs">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search ref #, vendor, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-8 pr-3 py-1.5 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1 rounded-xl overflow-x-auto scrollbar-none">
              {['All', 'Expense', 'Invoice', 'Journal Entry'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    filterType === type
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {onAddSubAccount && (
            <button
              onClick={() => {
                onClose();
                onAddSubAccount(account);
              }}
              className="w-full sm:w-auto bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[36px]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Sub-Account</span>
            </button>
          )}
        </div>

        {/* Ledger Transactions Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                No Transactions Recorded Yet for [{account.code}] {account.name}
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Transactions recorded in Expenses, Invoices, or Journal Entries tagged with this account or its sub-categories will automatically reflect here.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Ledger Cards Feed (block lg:hidden) */}
              <div className="block lg:hidden space-y-3">
                {filteredTransactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3.5 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              tx.type === 'Expense'
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                                : tx.type === 'Invoice'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
                                : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900'
                            }`}
                          >
                            {tx.type}
                          </span>
                          <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                            {tx.reference}
                          </span>
                        </div>
                        <h5 className="font-bold text-xs text-slate-900 dark:text-slate-100 mt-1">
                          {tx.entityName}
                        </h5>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-sm font-bold text-slate-900 dark:text-white block">
                          {formatCurrency(tx.amount, settings.currencySymbol)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatDate(tx.date)}
                        </span>
                      </div>
                    </div>

                    {tx.description && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">
                        {tx.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[10px]">
                      {tx.projectName ? (
                        <div className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <FolderKanban className="w-3 h-3 text-blue-500" />
                          <span>{tx.projectName}</span>
                        </div>
                      ) : <span className="text-slate-400 italic">No project</span>}

                      <div className="flex items-center gap-2 font-mono">
                        {tx.debit > 0 && (
                          <span className="text-slate-600 dark:text-slate-300 font-semibold">
                            Dr: {formatCurrency(tx.debit, settings.currencySymbol)}
                          </span>
                        )}
                        {tx.credit > 0 && (
                          <span className="text-slate-600 dark:text-slate-300 font-semibold">
                            Cr: {formatCurrency(tx.credit, settings.currencySymbol)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop High-Density Table (hidden lg:block) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Ref Number</th>
                      <th className="p-3">Vendor / Client / Entity</th>
                      <th className="p-3">Description & Project</th>
                      <th className="p-3 text-right">Debit</th>
                      <th className="p-3 text-right">Credit</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors">
                        <td className="p-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {formatDate(tx.date)}
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              tx.type === 'Expense'
                                ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900'
                                : tx.type === 'Invoice'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900'
                                : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900'
                            }`}
                          >
                            {tx.type}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{tx.reference}</td>
                        <td className="p-3 font-bold text-slate-900 dark:text-slate-100">{tx.entityName}</td>
                        <td className="p-3">
                          <div className="text-slate-800 dark:text-slate-200 font-medium">{tx.description}</div>
                          {tx.projectName && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <FolderKanban className="w-3 h-3 text-blue-500" />
                              <span>{tx.projectName}</span>
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {tx.debit > 0 ? formatCurrency(tx.debit, settings.currencySymbol) : '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {tx.credit > 0 ? formatCurrency(tx.credit, settings.currencySymbol) : '-'}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {formatCurrency(tx.amount, settings.currencySymbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Summary */}
        <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 flex flex-col sm:flex-row justify-between items-center gap-2 sm:gap-3 text-xs">
          <div className="text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
            Showing <strong>{filteredTransactions.length}</strong> recorded entries for account{' '}
            <strong>[{account.code}] {account.name}</strong>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 font-bold flex-wrap justify-center">
            <span className="text-slate-600 dark:text-slate-300">
              Total Debits:{' '}
              <strong className="text-slate-900 dark:text-white font-mono">
                {formatCurrency(totalDebits, settings.currencySymbol)}
              </strong>
            </span>
            <span className="text-slate-600 dark:text-slate-300">
              Total Credits:{' '}
              <strong className="text-slate-900 dark:text-white font-mono">
                {formatCurrency(totalCredits, settings.currencySymbol)}
              </strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
