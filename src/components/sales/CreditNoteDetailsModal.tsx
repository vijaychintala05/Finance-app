import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  DollarSign,
  MoreVertical,
  Printer,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { CreditNote } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface CreditNoteDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: CreditNote | null;
}

export const CreditNoteDetailsModal: React.FC<CreditNoteDetailsModalProps> = ({
  isOpen,
  onClose,
  note,
}) => {
  const { settings, updateCreditNote, deleteCreditNote } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!isOpen || !note) return null;

  const handleApplyRefund = () => {
    updateCreditNote(note.id, { remainingAmount: 0, status: 'Closed' });
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete credit note ${note.cnNumber}?`)) {
      if (deleteCreditNote) {
        deleteCreditNote(note.id);
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
              Credit Note Details
            </h3>
          </div>

          <div className="flex items-center space-x-1 relative">
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
                  <span>Print Credit Memo</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Credit Memo</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* HEADER AMOUNTS */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Credit Issued</p>
              <h2 className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight mt-0.5">
                {formatCurrency(note.totalAmount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Issued On: {formatDate(note.issueDate)} • Ref #{note.cnNumber}
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                note.status === 'Open'
                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              {note.status}
            </span>
          </div>

          {/* BOX */}
          <div className="bg-rose-50/70 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-rose-600 dark:text-rose-400 font-extrabold uppercase text-[10px] tracking-wider">
                Customer Name
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-rose-500" />
                <span>{note.clientName}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-rose-100/80 dark:border-rose-900/80">
              <span className="text-rose-600 dark:text-rose-400 font-extrabold uppercase text-[10px] tracking-wider">
                Original Ref Invoice #
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                {note.originalInvoiceNumber}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-rose-100/80 dark:border-rose-900/80">
              <span className="text-rose-600 dark:text-rose-400 font-extrabold uppercase text-[10px] tracking-wider">
                Unused Credit Balance
              </span>
              <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                {formatCurrency(note.remainingAmount, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* REASON */}
          <div>
            <p className="text-xs text-slate-400 font-medium">Credit Memo Particulars / Reason</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              {note.reason || 'Customer credit allowance / invoice adjustment.'}
            </p>
          </div>

          {/* ACTION BUTTON */}
          {note.status === 'Open' && (
            <div className="pt-2">
              <button
                onClick={handleApplyRefund}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Apply Credit to Invoice / Process Refund</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
