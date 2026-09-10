import React, { useEffect, useState, useDeferredValue, useMemo } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  FileText,
  Filter,
  Paperclip,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  User,
  X,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ExpenseModal } from './ExpenseModal';
import { ExpenseDetailsModal } from './ExpenseDetailsModal';

interface ExpensesViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  onExit?: () => void;
}

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [];
  pages.push(1);

  if (currentPage > 3) {
    pages.push('ellipsis');
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push('ellipsis');
  }

  pages.push(totalPages);
  return pages;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  autoOpenCreateModal = false,
  onModalClosed,
  onExit,
}) => {
  const { expenses, accounts, settings } = useBooks();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [isModalOpen, setIsModalOpen] = useState(autoOpenCreateModal);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);

  // Filter states
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'ACTIVE' | 'VOIDED'>('ALL');
  const [filterReceipt, setFilterReceipt] = useState<'ALL' | 'WITH_RECEIPT' | 'WITHOUT_RECEIPT'>('ALL');
  const [filterBillable, setFilterBillable] = useState<'ALL' | 'BILLABLE' | 'UNBILLED' | 'BILLED' | 'NON_BILLABLE'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'ITEMIZED' | 'SINGLE'>('ALL');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
    }
  }, [autoOpenCreateModal]);

  // Account lookup map for resolving category and payment names
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    if (Array.isArray(accounts)) {
      accounts.forEach((a) => map.set(a.id, a.name));
    }
    return map;
  }, [accounts]);

  const getExpenseAccountName = (e: Expense): string => {
    if (e.accountName && e.accountName.trim()) return e.accountName;
    if (e.accountId && accountMap.has(e.accountId)) return accountMap.get(e.accountId)!;
    return 'General Expense';
  };

  const getPaidFromAccountName = (e: Expense): string => {
    if (e.paidFromAccountName && e.paidFromAccountName.trim()) return e.paidFromAccountName;
    if (e.paidFromAccountId && accountMap.has(e.paidFromAccountId)) return accountMap.get(e.paidFromAccountId)!;
    return 'Cash / Bank';
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    onModalClosed?.();
    if (autoOpenCreateModal && onExit) {
      onExit();
    }
  };

  const handleOpenNew = () => {
    setIsModalOpen(true);
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilterStatus('ALL');
    setFilterReceipt('ALL');
    setFilterBillable('ALL');
    setFilterType('ALL');
    setCurrentPage(1);
  };

  // Enhanced Smart Multi-Field Tokenized Search & Filtering
  const filteredExpenses = useMemo(() => {
    const searchTokens = deferredSearch
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return expenses.filter((e) => {
      // Filter status
      if (filterStatus === 'ACTIVE' && e.status === 'VOIDED') return false;
      if (filterStatus === 'VOIDED' && e.status !== 'VOIDED') return false;

      // Filter receipt
      if (filterReceipt === 'WITH_RECEIPT' && !e.receiptFileName) return false;
      if (filterReceipt === 'WITHOUT_RECEIPT' && e.receiptFileName) return false;

      // Filter billable
      if (filterBillable === 'BILLABLE' && !e.isBillable) return false;
      if (filterBillable === 'UNBILLED' && (!e.isBillable || e.isBilled)) return false;
      if (filterBillable === 'BILLED' && (!e.isBillable || !e.isBilled)) return false;
      if (filterBillable === 'NON_BILLABLE' && e.isBillable) return false;

      // Filter type
      if (filterType === 'ITEMIZED' && !e.isItemized) return false;
      if (filterType === 'SINGLE' && e.isItemized) return false;

      if (searchTokens.length === 0) return true;

      const accName = getExpenseAccountName(e).toLowerCase();
      const paidFromName = getPaidFromAccountName(e).toLowerCase();
      const refNo = (e.referenceNumber || '').toLowerCase();
      const vendor = (e.vendorName || '').toLowerCase();
      const proj = (e.projectName || '').toLowerCase();
      const client = (e.clientName || '').toLowerCase();
      const invNo = (e.invoiceNumber || '').toLowerCase();
      const custInvNo = (e.customerInvoiceNumber || e.invoiceId || '').toLowerCase();
      const desc = (e.description || '').toLowerCase();
      const dateStr = (e.date || '').toLowerCase();
      const formattedDateStr = formatDate(e.date).toLowerCase();
      const amountStr = String(e.amount || 0);
      const formattedAmountStr = formatCurrency(e.amount, settings.currencySymbol).toLowerCase();
      const statusStr = (e.status || 'POSTED').toLowerCase();
      const billableStatusStr = e.isBillable ? (e.isBilled ? 'billable billed' : 'billable unbilled recoverable') : 'non-billable';

      // Itemized item descriptions and line accounts
      const itemDetails = (e.items || [])
        .map(
          (it) =>
            `${it.description || ''} ${it.accountName || accountMap.get(it.accountId) || ''} ${it.amount || ''}`
        )
        .join(' ')
        .toLowerCase();

      const searchableText = `${refNo} ${accName} ${paidFromName} ${vendor} ${proj} ${client} ${invNo} ${custInvNo} ${desc} ${dateStr} ${formattedDateStr} ${amountStr} ${formattedAmountStr} ${statusStr} ${billableStatusStr} ${itemDetails}`;

      // Every search token must match in the searchable text
      return searchTokens.every((token) => searchableText.includes(token));
    });
  }, [
    expenses,
    deferredSearch,
    filterStatus,
    filterReceipt,
    filterBillable,
    filterType,
    accountMap,
    settings.currencySymbol,
  ]);

  // Reset page to 1 whenever search, filters, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, filterStatus, filterReceipt, filterBillable, filterType, pageSize]);

  // Pagination computations
  const totalItems = filteredExpenses.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedExpenses = filteredExpenses.slice(startIndex, endIndex);

  const totalExpenseSum = filteredExpenses.reduce(
    (acc, e) => acc + (e.status === 'VOIDED' ? 0 : (e.amount || 0)),
    0
  );

  const isAnyFilterActive =
    search.trim() !== '' ||
    filterStatus !== 'ALL' ||
    filterReceipt !== 'ALL' ||
    filterBillable !== 'ALL' ||
    filterType !== 'ALL';

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
            <Receipt className="w-6 h-6 text-blue-600" />
            <span>Record Expenses & Vendor Bills</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Log vendor payments, attach receipts, manage itemized breakdowns & customer billable costs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onExit && (
            <button
              onClick={onExit}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
          )}

          <button
            onClick={handleOpenNew}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Recorded</p>
            <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
              {formatCurrency(totalExpenseSum, settings.currencySymbol)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
            {filteredExpenses.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Receipts Attached</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              {filteredExpenses.filter((e) => e.receiptFileName).length} Receipts
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
            <Paperclip className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer Billable</p>
            <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
              {filteredExpenses.filter((e) => e.isBillable).length} Billable
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search Input & Quick Filter Chips */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full max-w-lg">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search ref #, vendor, category, notes, amount, customer, project..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-9 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {isAnyFilterActive && (
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 transition-colors self-start sm:self-auto cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Quick Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Filters:
          </span>

          <button
            type="button"
            onClick={() => {
              setFilterReceipt('ALL');
              setFilterBillable('ALL');
              setFilterType('ALL');
              setFilterStatus('ALL');
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterReceipt === 'ALL' && filterBillable === 'ALL' && filterType === 'ALL' && filterStatus === 'ALL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All ({expenses.length})
          </button>

          <button
            type="button"
            onClick={() => setFilterReceipt((curr) => (curr === 'WITH_RECEIPT' ? 'ALL' : 'WITH_RECEIPT'))}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              filterReceipt === 'WITH_RECEIPT'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Paperclip className="w-3 h-3" />
            <span>Receipts ({expenses.filter((e) => e.receiptFileName).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterBillable((curr) => (curr === 'UNBILLED' ? 'ALL' : 'UNBILLED'))}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              filterBillable === 'UNBILLED'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Unbilled ({expenses.filter((e) => e.isBillable && !e.isBilled).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterBillable((curr) => (curr === 'BILLABLE' ? 'ALL' : 'BILLABLE'))}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              filterBillable === 'BILLABLE'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <User className="w-3 h-3" />
            <span>All Billable ({expenses.filter((e) => e.isBillable).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType((curr) => (curr === 'ITEMIZED' ? 'ALL' : 'ITEMIZED'))}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
              filterType === 'ITEMIZED'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Itemized ({expenses.filter((e) => e.isItemized).length})</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterStatus((curr) => (curr === 'VOIDED' ? 'ALL' : 'VOIDED'))}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'VOIDED'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Voided ({expenses.filter((e) => e.status === 'VOIDED').length})
          </button>
        </div>
      </div>

      {/* Mobile Expenses Cards Feed (lg:hidden) */}
      <div className="block lg:hidden space-y-3">
        {paginatedExpenses.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 space-y-2">
            <Receipt className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              No expenses recorded matching criteria
            </p>
            {isAnyFilterActive ? (
              <button
                onClick={handleResetFilters}
                className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-700 cursor-pointer"
              >
                Clear search & filters
              </button>
            ) : (
              <button
                onClick={handleOpenNew}
                className="mt-2 text-xs text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-700 cursor-pointer"
              >
                Click here to record a new expense
              </button>
            )}
          </div>
        ) : (
          paginatedExpenses.map((exp) => {
            const accName = getExpenseAccountName(exp);
            const paidFromName = getPaidFromAccountName(exp);
            return (
              <div
                key={exp.id}
                onClick={() => setViewingExpense(exp)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3 active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs">
                      {accName ? accName.charAt(0).toUpperCase() : 'E'}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {accName}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        Ref: #{exp.referenceNumber}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-extrabold text-sm font-mono block ${
                        exp.status === 'VOIDED'
                          ? 'text-slate-400 line-through'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatCurrency(exp.amount, settings.currencySymbol)}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatDate(exp.date)}</span>
                  </div>
                </div>

                {exp.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium line-clamp-2">
                    {exp.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                  <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-2 py-0.5 rounded-md">
                    Vendor: {exp.vendorName || 'General'}
                  </span>
                  <span className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                    Via: {paidFromName}
                  </span>
                  {exp.isItemized && (
                    <span className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800">
                      Itemized ({exp.items?.length || 1} items)
                    </span>
                  )}
                  {exp.isBillable && (
                    exp.isBilled ? (
                      <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                        Billed
                      </span>
                    ) : (
                      <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                        Billable (Unbilled)
                      </span>
                    )
                  )}
                  {exp.receiptFileName && (
                    <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                      <Paperclip className="w-3 h-3" /> Receipt Attached
                    </span>
                  )}
                  {exp.status === 'VOIDED' && (
                    <span className="bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-800">
                      Voided
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop High-Density Expenses Table (hidden lg:block) */}
      <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3 pl-4">Ref # & Date</th>
                <th className="p-3">Expense Category</th>
                <th className="p-3">Vendor / Invoice#</th>
                <th className="p-3">Customer / Project</th>
                <th className="p-3">Receipt</th>
                <th className="p-3">Amount</th>
                <th className="p-3 text-right pr-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {paginatedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="font-semibold text-xs text-slate-700 dark:text-slate-300">
                      No expenses recorded matching criteria
                    </p>
                    {isAnyFilterActive ? (
                      <button
                        onClick={handleResetFilters}
                        className="mt-3 text-xs text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-700 cursor-pointer"
                      >
                        Clear search & filters
                      </button>
                    ) : (
                      <button
                        onClick={handleOpenNew}
                        className="mt-3 text-xs text-blue-600 dark:text-blue-400 font-bold underline hover:text-blue-700 cursor-pointer"
                      >
                        Click here to record a new expense
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedExpenses.map((exp) => {
                  const accName = getExpenseAccountName(exp);
                  const paidFromName = getPaidFromAccountName(exp);
                  return (
                    <tr
                      key={exp.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                      onClick={() => setViewingExpense(exp)}
                    >
                      <td className="p-3 pl-4">
                        <div className="font-mono font-bold text-blue-600 dark:text-blue-400 text-xs">
                          {exp.referenceNumber}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          {formatDate(exp.date)}
                        </div>
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">{accName}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Paid via: {paidFromName}
                        </div>
                        {exp.description && (
                          <div
                            className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-xs mt-0.5"
                            title={exp.description}
                          >
                            {exp.description}
                          </div>
                        )}
                        {exp.isItemized && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[9px] font-bold rounded border border-purple-200 dark:border-purple-800">
                            Itemized ({exp.items?.length || 1} items)
                          </span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-400" />
                          <span>{exp.vendorName || 'General Vendor'}</span>
                        </div>
                        {exp.invoiceNumber && (
                          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            Inv#: {exp.invoiceNumber}
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        {exp.clientName ? (
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {exp.clientName}
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">Internal Firm</div>
                        )}
                        {exp.projectName && (
                          <span className="inline-block mt-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                            {exp.projectName}
                          </span>
                        )}
                        {exp.isBillable && (
                          exp.isBilled ? (
                            <span className="inline-block ml-1 mt-0.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[9px] font-bold border border-emerald-200 dark:border-emerald-800" title={exp.customerInvoiceNumber ? `Billed to Invoice #${exp.customerInvoiceNumber}` : 'Billed to Customer'}>
                              Billed
                            </span>
                          ) : (
                            <span className="inline-block ml-1 mt-0.5 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-200 dark:border-amber-800">
                              Billable (Unbilled)
                            </span>
                          )
                        )}
                      </td>

                      <td className="p-3">
                        {exp.receiptFileName ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                            <Paperclip className="w-3 h-3" /> Receipt
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-[11px]">—</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div
                          className={`font-extrabold text-sm ${
                            exp.status === 'VOIDED'
                              ? 'text-slate-400 line-through'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {exp.currency ? exp.currency : ''}{' '}
                          {formatCurrency(exp.amount, settings.currencySymbol)}
                        </div>
                      </td>

                      <td className="p-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                            exp.status === 'VOIDED'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {exp.status || 'POSTED'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Toolbar */}
      {filteredExpenses.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left: Summary */}
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center sm:text-left">
            Showing <span className="font-bold text-slate-800 dark:text-slate-200">{startIndex + 1}</span> to{' '}
            <span className="font-bold text-slate-800 dark:text-slate-200">{endIndex}</span> of{' '}
            <span className="font-bold text-slate-800 dark:text-slate-200">{totalItems}</span> expenses
            {totalItems !== expenses.length && (
              <span className="text-slate-400 dark:text-slate-500 text-[11px] ml-1.5">
                (filtered from {expenses.length} total)
              </span>
            )}
          </div>

          {/* Right: Controls & Page Selection */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {/* Page Size Selector */}
            <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Per page:</span>
              <select
                aria-label="Expenses per page"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1}
                aria-label="First page"
                title="First page"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                aria-label="Previous page"
                title="Previous page"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {/* Page Number Pills */}
              <div className="flex items-center space-x-1 px-1">
                {getPageNumbers(safeCurrentPage, totalPages).map((p, idx) =>
                  p === 'ellipsis' ? (
                    <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-slate-400 font-bold">
                      …
                    </span>
                  ) : (
                    <button
                      key={`page-${p}`}
                      onClick={() => setCurrentPage(p)}
                      aria-label={`Page ${p}`}
                      aria-current={p === safeCurrentPage ? 'page' : undefined}
                      className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        p === safeCurrentPage
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                aria-label="Next page"
                title="Next page"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages}
                aria-label="Last page"
                title="Last page"
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
      />

      <ExpenseDetailsModal
        isOpen={!!viewingExpense}
        onClose={() => setViewingExpense(null)}
        expense={viewingExpense}
      />
    </div>
  );
};
