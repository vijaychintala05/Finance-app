import React, { useState } from 'react';
import {
  X,
  Calculator,
  Calendar,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Loader2,
} from 'lucide-react';
import { JournalEntry } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { displayJournalNumber, isInternalExpenseJournalNumber } from '../../utils/journalDisplay';
import { TransactionHistoryTab } from '../common/TransactionHistoryTab';
import { AccountingService } from '../../services/accountingService';
import { useBooks } from '../../context/BooksContext';

interface JournalDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  journal: JournalEntry | null;
  onReversed?: () => void;
}

export const JournalDetailsModal: React.FC<JournalDetailsModalProps> = ({
  isOpen,
  onClose,
  journal,
  onReversed,
}) => {
  const { settings, refreshBooks } = useBooks();
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [isReversing, setIsReversing] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);

  if (!isOpen || !journal) return null;

  const totalDebit = journal.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalCredit = journal.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const isLegacyExpense = isInternalExpenseJournalNumber(journal.entryNumber);
  const isReversed = (journal.status || '').toUpperCase() === 'REVERSED';

  const handleReverseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const reasonTrimmed = reverseReason.trim();
    if (reasonTrimmed.length < 5) {
      setReverseError('Reversal reason must be at least 5 characters.');
      return;
    }

    try {
      setIsReversing(true);
      setReverseError(null);
      await AccountingService.reverseJournal(journal.id, reasonTrimmed);
      if (refreshBooks) await refreshBooks();
      setShowReverseDialog(false);
      setReverseReason('');
      if (onReversed) onReversed();
      setActiveTab('history');
    } catch (err: any) {
      setReverseError(err.message || 'Failed to reverse journal entry');
    } finally {
      setIsReversing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 sticky top-0 z-10 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {displayJournalNumber(journal.entryNumber, journal.reference)}
                </h3>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    isReversed
                      ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                  }`}
                >
                  {journal.status || 'Posted'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Posted on {formatDate(journal.date)}</span>
                {journal.reference && (
                  <span className="text-slate-400">• Ref: {journal.reference}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isReversed && (
              <button
                type="button"
                onClick={() => setShowReverseDialog(true)}
                className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Post an audited reversal of this journal"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reverse Journal</span>
              </button>
            )}

            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Subheader Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 px-5 py-2.5 shrink-0 select-none">
          <div role="tablist" aria-label="Journal view modes" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'details'}
              onClick={() => setActiveTab('details')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'details'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              Voucher Details
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              History & Audit Trail
            </button>
          </div>
          <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
            Total: {formatCurrency(totalDebit, settings.currencySymbol)}
          </span>
        </div>

        {/* Reversal Confirmation Dialog Modal / Panel */}
        {showReverseDialog && (
          <div className="p-4 bg-rose-50/90 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-800">
            <form onSubmit={handleReverseSubmit} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-rose-600" />
                  Audited Reversal: Provide Mandatory Reason
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowReverseDialog(false);
                    setReverseError(null);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Cancel
                </button>
              </div>

              {reverseError && (
                <div className="text-2xs text-rose-700 flex items-center gap-1 font-semibold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{reverseError}</span>
                </div>
              )}

              <input
                type="text"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                placeholder="Reason for reversal (e.g. Posted to wrong account, duplicate entry, period reclassification)"
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
                minLength={5}
                maxLength={1000}
                autoFocus
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReverseDialog(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200/50 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReversing || reverseReason.trim().length < 5}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  {isReversing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Reversing...</span>
                    </>
                  ) : (
                    <span>Confirm & Reverse Journal</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 1: Details */}
        {activeTab === 'details' && (
          <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {/* Narration */}
            {journal.description && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-2xs uppercase tracking-wider font-bold text-slate-400 mb-1">
                  Narration / Notes
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {journal.description}
                </p>
              </div>
            )}

            {/* Lines Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs shadow-2xs">
              <table className="w-full text-left">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3 pl-4">Account Code</th>
                    <th className="p-3">Account Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Debit</th>
                    <th className="p-3 text-right pr-4">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {journal.lines.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="p-3 pl-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {l.accountCode || '-'}
                      </td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                        {l.accountName}
                      </td>
                      <td className="p-3 text-slate-500 max-w-xs truncate">
                        {(l as any).description || '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                        {l.debit > 0 ? formatCurrency(l.debit, settings.currencySymbol) : '-'}
                      </td>
                      <td className="p-3 text-right pr-4 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                        {l.credit > 0 ? formatCurrency(l.credit, settings.currencySymbol) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={3} className="p-3 pl-4 text-slate-700 dark:text-slate-300">
                      Balanced Total
                    </td>
                    <td className="p-3 text-right font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(totalDebit, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-right pr-4 font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      {formatCurrency(totalCredit, settings.currencySymbol)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: History & Audit Trail */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto">
            <TransactionHistoryTab
              entityType="JournalEntry"
              entityId={journal.id}
              entity={journal}
              title={`Journal #${journal.entryNumber} History & Audit Trail`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
export default JournalDetailsModal;
