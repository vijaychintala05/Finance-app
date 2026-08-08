import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  Edit2,
  FileText,
  FolderKanban,
  MoreVertical,
  Paperclip,
  Printer,
  Receipt,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Expense } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface ExpenseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  onEdit: (expense: Expense) => void;
  onDelete?: (expenseId: string) => void;
}

export const ExpenseDetailsModal: React.FC<ExpenseDetailsModalProps> = ({
  isOpen,
  onClose,
  expense,
  onEdit,
  onDelete,
}) => {
  const { settings, deleteExpense } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!isOpen || !expense) return null;

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete expense #${expense.referenceNumber}?`)) {
      if (onDelete) {
        onDelete(expense.id);
      } else {
        deleteExpense(expense.id);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Expense details
            </h3>
          </div>

          <div className="flex items-center space-x-1 relative">
            <button
              onClick={() => {
                onClose();
                onEdit(expense);
              }}
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
              title="Edit Expense"
            >
              <Edit2 className="w-4 h-4 text-slate-800 dark:text-slate-200" />
            </button>

            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-12 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-20">
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    window.print();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print Details</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Expense</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* AMOUNT & RECEIPT SECTION */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Expense Amount
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-500 font-mono tracking-tight mt-0.5">
                {expense.currency ? expense.currency : ''}{' '}
                {formatCurrency(expense.amount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                on {formatDate(expense.date)} • Ref #{expense.referenceNumber}
              </p>
            </div>

            {/* Receipt Box */}
            <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-2 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
              <Paperclip className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-tight">
                {expense.receiptFileName || expense.receiptMockUrl
                  ? 'Receipt Attached'
                  : 'Attach Receipt'}
              </span>
              {(expense.receiptFileName || expense.receiptMockUrl) && (
                <span className="text-[9px] text-emerald-600 font-bold mt-0.5">Uploaded</span>
              )}
            </div>
          </div>

          {/* BILLABLE / NON-BILLABLE TAG */}
          <div>
            <span
              className={`inline-block text-xs font-bold px-3 py-1 rounded-lg border ${
                expense.isBillable
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {expense.isBillable ? 'Billable Customer Cost' : 'Non-Billable'}
            </span>
          </div>

          {/* CATEGORY / ACCOUNT HIGHLIGHT PILL */}
          <div className="bg-sky-50/80 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-xl p-3">
            <p className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 tracking-wider">
              Expense Account / Category
            </p>
            <p className="text-sm font-bold text-sky-900 dark:text-sky-200 mt-0.5">
              {expense.accountName || 'Uncategorized Expense'}
            </p>

            {/* Itemized breakdown if present */}
            {expense.isItemized && expense.items && expense.items.length > 0 && (
              <div className="mt-3 pt-2 border-t border-sky-200/60 dark:border-sky-800 space-y-1">
                <p className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase">
                  Item Breakdown ({expense.items.length} items)
                </p>
                {expense.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-sky-900 dark:text-sky-200 font-medium">
                    <span>{it.description || `Item #${idx + 1}`} ({it.quantity} x {formatCurrency(it.unitPrice, settings.currencySymbol)})</span>
                    <span className="font-bold">{formatCurrency(it.amount, settings.currencySymbol)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* METADATA FIELDS GRID */}
          <div className="space-y-4 pt-1">
            {/* Paid Through */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Paid Through</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <span>{expense.paidFromAccountName || 'Undeposited Funds / Cash'}</span>
              </p>
            </div>

            {/* Customer */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Customer</p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                <span>{expense.clientName || 'N/A (Internal Firm Expense)'}</span>
              </p>
            </div>

            {/* Paid To (Vendor) */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Paid To</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-400" />
                <span>{expense.vendorName || 'N/A'}</span>
              </p>
            </div>

            {/* Project Name */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Project Name</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-amber-500" />
                <span>{expense.projectName || 'General Organization'}</span>
              </p>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Description / Particulars</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                {expense.notes || expense.description || 'No notes provided.'}
              </p>
            </div>
          </div>

          {/* BOTTOM EDIT BUTTON */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              onClick={handleDelete}
              className="px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
            >
              Delete
            </button>

            <button
              onClick={() => {
                onClose();
                onEdit(expense);
              }}
              className="flex-1 max-w-xs bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit Expense Details</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
