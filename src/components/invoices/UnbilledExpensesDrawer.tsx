import React, { useEffect, useMemo, useState } from 'react';
import { X, CheckSquare, Square, Search, ShieldCheck, DollarSign, Calendar, Tag, Folder, AlertCircle } from 'lucide-react';
import { Expense } from '../../types';
import { formatCurrency } from '../../utils/formatters';

interface UnbilledExpensesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName?: string;
  projectId?: string;
  currencySymbol: string;
  alreadySelectedExpenseIds?: string[];
  expenses?: Expense[];
  onApply: (selectedExpenses: Expense[]) => void;
}

const EMPTY_STRING_ARRAY: string[] = [];

export const UnbilledExpensesDrawer: React.FC<UnbilledExpensesDrawerProps> = ({
  isOpen,
  onClose,
  clientId,
  clientName,
  projectId,
  currencySymbol,
  alreadySelectedExpenseIds = EMPTY_STRING_ARRAY,
  expenses: propExpenses = [],
  onApply,
}) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<string>(projectId || 'all');

  const selectedKey = alreadySelectedExpenseIds.join(',');

  useEffect(() => {
    if (!isOpen || !clientId) return;

    const excluded = new Set(alreadySelectedExpenseIds);
    const available = propExpenses.filter((e) => !excluded.has(e.id));
    setExpenses(available);
    setSelectedIds(new Set(available.map((e) => e.id)));
    setLoading(false);
    setError(null);
  }, [isOpen, clientId, propExpenses, selectedKey]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (filterProjectId !== 'all' && e.projectId !== filterProjectId) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const descMatch = (e.description || '').toLowerCase().includes(term);
        const refMatch = (e.referenceNumber || '').toLowerCase().includes(term);
        const accMatch = (e.accountName || '').toLowerCase().includes(term);
        if (!descMatch && !refMatch && !accMatch) return false;
      }
      return true;
    });
  }, [expenses, filterProjectId, searchTerm]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map((e) => e.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedExpenses = useMemo(() => {
    return expenses.filter((e) => selectedIds.has(e.id));
  }, [expenses, selectedIds]);

  const totalSelectedAmount = useMemo(() => {
    return selectedExpenses.reduce((sum, e) => {
      const price = e.sellingPrice !== undefined && e.sellingPrice !== null ? e.sellingPrice : e.amount;
      return sum + Number(price || 0);
    }, 0);
  }, [selectedExpenses]);

  const handleApply = () => {
    if (selectedExpenses.length === 0) return;
    onApply(selectedExpenses);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end animate-fade-in" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col transition-transform transform duration-300 ease-out">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/75 dark:bg-slate-800/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
                Zoho Books Workflow
              </span>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Unbilled Billable Expenses
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Select recoverable costs to add as line items for <span className="font-semibold text-slate-700 dark:text-slate-300">{clientName || 'this customer'}</span>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close unbilled drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Privacy Notice Banner */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50 px-6 py-3 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
            <span className="font-bold">Customer Privacy Guarantee:</span> Invoice lines bill at the approved customer selling price. Internal cost basis, vendor identity, and markup percentages remain private.
          </p>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 bg-white dark:bg-slate-900">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search expenses by description or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="button"
            onClick={toggleSelectAll}
            className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition flex items-center gap-1.5"
          >
            {selectedIds.size === filteredExpenses.length && filteredExpenses.length > 0 ? (
              <>
                <CheckSquare className="w-4 h-4 text-blue-600" />
                Deselect All
              </>
            ) : (
              <>
                <Square className="w-4 h-4 text-slate-400" />
                Select All ({filteredExpenses.length})
              </>
            )}
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-sm">Loading unbilled expenses...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">Failed to retrieve unbilled expenses</p>
                <p className="text-xs mt-1">{error}</p>
              </div>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center">
              <DollarSign className="w-12 h-12 stroke-1 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-base font-medium text-slate-600 dark:text-slate-300">No unbilled expenses found</p>
              <p className="text-xs text-slate-400 mt-1">
                {searchTerm ? 'Try adjusting your search criteria.' : 'All billable expenses for this customer have already been invoiced.'}
              </p>
            </div>
          ) : (
            filteredExpenses.map((expense) => {
              const isSelected = selectedIds.has(expense.id);
              const sellingPrice = expense.sellingPrice !== undefined && expense.sellingPrice !== null ? expense.sellingPrice : expense.amount;
              const hasMarkup = expense.markupPercentage !== undefined && expense.markupPercentage > 0;

              return (
                <div
                  key={expense.id}
                  onClick={() => toggleSelectOne(expense.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer select-none flex items-start gap-3.5 ${
                    isSelected
                      ? 'border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="pt-0.5">
                    {isSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Square className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900 dark:text-white">
                          {expense.description || expense.accountName || 'Reimbursable expense'}
                        </span>
                        {expense.referenceNumber && (
                          <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                            {expense.referenceNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-base font-bold text-slate-900 dark:text-white">
                          {formatCurrency(sellingPrice, currencySymbol)}
                        </span>
                        {hasMarkup && (
                          <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                            +{expense.markupPercentage}% markup
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {expense.date}
                      </span>
                      {expense.accountName && (
                        <span className="flex items-center gap-1">
                          <Tag className="w-3.5 h-3.5 text-slate-400" />
                          {expense.accountName}
                        </span>
                      )}
                      {expense.projectName && (
                        <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                          <Folder className="w-3.5 h-3.5" />
                          {expense.projectName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Summary & Action Bar */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-800/80 backdrop-blur-sm flex items-center justify-between gap-4">
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400 block">
              {selectedExpenses.length} expense{selectedExpenses.length === 1 ? '' : 's'} selected
            </span>
            <span className="text-lg font-extrabold text-slate-900 dark:text-white">
              {formatCurrency(totalSelectedAmount, currencySymbol)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={selectedExpenses.length === 0}
              className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md hover:shadow-lg transition flex items-center gap-2"
            >
              Add to Invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
