import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  CreditCard,
  DollarSign,
  FileText,
  History,
  MoreVertical,
  Printer,
  RotateCcw,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { CreditNote } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { apiClient } from '../../api/client';
import { ApplyCreditNoteModal } from './ApplyCreditNoteModal';
import { RecordRefundModal } from './RecordRefundModal';

interface CreditNoteDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  note: CreditNote | null;
}

interface CreditApplication {
  id: string;
  credit_note_id: string;
  invoice_id: string;
  invoice_number?: string;
  amount_applied: number | string;
  applied_date: string;
  status?: string;
}

export const CreditNoteDetailsModal: React.FC<CreditNoteDetailsModalProps> = ({
  isOpen,
  onClose,
  note,
}) => {
  const { settings, deleteCreditNote } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [isLoadingApps, setIsLoadingApps] = useState(false);

  // Fetch applications history
  useEffect(() => {
    if (isOpen && note?.id) {
      setIsLoadingApps(true);
      apiClient
        .get<CreditApplication[]>(
          `/finance/credit-note-applications?creditNoteId=${encodeURIComponent(note.id)}`
        )
        .then((res) => {
          if (res.data && Array.isArray(res.data)) {
            setApplications(res.data);
          } else {
            setApplications([]);
          }
        })
        .catch(() => setApplications([]))
        .finally(() => setIsLoadingApps(false));
    } else {
      setApplications([]);
    }
  }, [isOpen, note?.id]);

  if (!isOpen || !note) return null;

  const remaining = note.remainingAmount ?? note.totalAmount;
  const isAvailable = remaining > 0 && note.status !== 'Closed' && (note.status as any) !== 'Void' && (note.status as any) !== 'Reversed';

  const handleVoid = () => {
    setShowMoreMenu(false);
    if (deleteCreditNote) {
      deleteCreditNote(note.id);
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
        <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
          {/* TOP BAR */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Credit Note Details
                </h3>
                <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400">
                  {note.cnNumber}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-1 relative">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 top-12 w-52 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-20">
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
                    onClick={handleVoid}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Void / Reverse Credit Note</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* DETAILS BODY */}
          <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* HEADER AMOUNTS */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-slate-400">Total Credit Issued</p>
                <h2 className="text-3xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tight mt-0.5">
                  {formatCurrency(note.totalAmount, settings.currencySymbol)}
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Issued On: {formatDate(note.issueDate)}
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                  note.status === 'Open'
                    ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                }`}
              >
                {note.status}
              </span>
            </div>

            {/* SUMMARY CARD */}
            <div className="bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/60 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-rose-600 dark:text-rose-400 font-bold uppercase text-[10px] tracking-wider">
                  Customer
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-rose-500" />
                  <span>{note.clientName}</span>
                </span>
              </div>

              <div className="flex justify-between items-center text-xs pt-2 border-t border-rose-100/80 dark:border-rose-900/40">
                <span className="text-rose-600 dark:text-rose-400 font-bold uppercase text-[10px] tracking-wider">
                  Ref Invoice #
                </span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  {note.originalInvoiceNumber || 'N/A'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs pt-2 border-t border-rose-100/80 dark:border-rose-900/40">
                <span className="text-rose-600 dark:text-rose-400 font-bold uppercase text-[10px] tracking-wider">
                  Unused Available Credit
                </span>
                <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                  {formatCurrency(remaining, settings.currencySymbol)}
                </span>
              </div>
            </div>

            {/* REASON */}
            <div>
              <p className="text-xs text-slate-400 font-medium">Reason / Particulars</p>
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200 mt-1 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                {note.reason || 'Customer credit allowance / invoice adjustment.'}
              </p>
            </div>

            {/* ACTION BUTTONS */}
            {isAvailable && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() => setIsApplyModalOpen(true)}
                  className="py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-xs transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Apply to Invoices</span>
                </button>
                <button
                  onClick={() => setIsRefundModalOpen(true)}
                  className="py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-xs transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Refund Customer</span>
                </button>
              </div>
            )}

            {/* APPLICATION AUDIT HISTORY */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                <History className="w-4 h-4 text-slate-400" />
                <span>Invoice Allocation History</span>
              </h4>

              {isLoadingApps ? (
                <p className="text-xs text-slate-400 py-3 text-center">
                  Loading application history...
                </p>
              ) : applications.length === 0 ? (
                <div className="text-center py-4 px-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-400">
                  No invoices have been credited from this note yet.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-[10px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="p-2.5 pl-3">Invoice #</th>
                        <th className="p-2.5">Date</th>
                        <th className="p-2.5 text-right pr-3">Credited</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {applications.map((app) => (
                        <tr key={app.id}>
                          <td className="p-2.5 pl-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {app.invoice_number || app.invoice_id}
                          </td>
                          <td className="p-2.5 text-slate-500">
                            {formatDate(app.applied_date)}
                          </td>
                          <td className="p-2.5 text-right pr-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {formatCurrency(Number(app.amount_applied), settings.currencySymbol)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Modals */}
      <ApplyCreditNoteModal
        isOpen={isApplyModalOpen}
        onClose={() => setIsApplyModalOpen(false)}
        creditNote={note}
        onSuccess={() => {
          setIsApplyModalOpen(false);
          onClose();
        }}
      />

      <RecordRefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        creditNote={note}
        onSuccess={() => {
          setIsRefundModalOpen(false);
          onClose();
        }}
      />
    </>
  );
};
