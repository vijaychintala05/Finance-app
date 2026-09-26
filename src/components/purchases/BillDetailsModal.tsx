import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit2,
  FileText,
  MoreVertical,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { Bill } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';
import { TransactionHistoryTab } from '../common/TransactionHistoryTab';
import { OperationNoticeBanner } from '../common/OperationNoticeBanner';
import { committedButStaleNotice, mutationExceptionNotice, type OperationNotice } from '../../utils/operationNotice';

interface BillDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: Bill | null;
  onEdit?: (bill: Bill) => void;
  onRecordPayment?: (bill: Bill) => void;
}

export const BillDetailsModal: React.FC<BillDetailsModalProps> = ({
  isOpen,
  onClose,
  bill,
  onEdit,
  onRecordPayment,
}) => {
  const { settings, deleteBill } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [notice, setNotice] = useState<OperationNotice | null>(null);

  if (!isOpen || !bill) return null;

  const balanceDue =
    bill.balanceDue !== undefined
      ? bill.balanceDue
      : Math.max(0, bill.totalAmount - (bill.amountPaid || 0));

  const handleDelete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isVoiding || voidReason.trim().length < 3) return;
    try {
      setIsVoiding(true);
      const result = await deleteBill(bill.id, voidReason.trim());
      setShowVoidDialog(false);
      setVoidReason('');
      setNotice(result?.refreshFailed
        ? committedButStaleNotice(
            'Bill voided; refreshed state unavailable',
            `Bill ${bill.billNumber} and its reversal were committed, but the refreshed document could not be loaded.`,
            result.requestId
          )
        : {
            tone: 'success',
            title: 'Bill voided',
            message: `Bill ${bill.billNumber} was voided. The original remains in history with its audited general ledger reversal.`,
            requestId: result?.requestId,
          });
    } catch (error) {
      setNotice(mutationExceptionNotice(error, {
        action: 'Bill void',
        failureTitle: 'Bill was not voided',
        uncertainTitle: 'Bill void outcome could not be confirmed',
        uncertainRecovery: 'Refresh the bill and journal history before retrying; the reversal may already have posted.',
      }));
    } finally {
      setIsVoiding(false);
    }
  };

  const handlePay = () => {
    if (onRecordPayment) {
      onRecordPayment(bill);
      onClose();
    } else {
      setShowPaymentModal(true);
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
              Bill details
            </h3>
          </div>

          <div className="flex items-center space-x-1 relative">
            {onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(bill);
                }}
                className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                title="Edit Bill"
              >
                <Edit2 className="w-4 h-4 text-slate-800 dark:text-slate-200" />
              </button>
            )}

            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-label="More actions"
              title="More actions"
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
                  <span>Print Bill</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowVoidDialog(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Void Bill</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {notice && <div className="px-5 pt-4"><OperationNoticeBanner notice={notice} /></div>}

        {/* SUBHEADER TABS */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 px-5 py-2.5 shrink-0 select-none">
          <div role="tablist" aria-label="Bill view modes" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'details'}
              onClick={() => setActiveTab('details')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'details'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              Bill Details
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              History & Audit Trail
            </button>
          </div>
          <span className="font-mono text-2xs font-bold text-slate-500">
            {bill.billNumber}
          </span>
        </div>

        {activeTab === 'history' && (
          <div className="flex-1 max-h-[80vh] overflow-y-auto">
            <TransactionHistoryTab
              entityType="Bill"
              entityId={bill.id}
              entity={bill}
              title={`Bill #${bill.billNumber} History & Audit Trail`}
            />
          </div>
        )}

        {/* DETAILS BODY */}
        <div className={`p-5 space-y-6 max-h-[80vh] overflow-y-auto ${activeTab !== 'details' ? 'hidden' : ''}`}>
          {/* AMOUNT & STATUS */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Total Bill Amount
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-amber-600 font-mono tracking-tight mt-0.5">
                {formatCurrency(bill.totalAmount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                Bill Date: {formatDate(bill.billDate)} • Ref #{bill.billNumber}
              </p>
            </div>

            {/* Status Pill */}
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                bill.status === 'Paid'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : bill.status === 'Partially Paid'
                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
              }`}
            >
              {bill.status}
            </span>
          </div>

          {/* BALANCE DUE HIGHLIGHT BOX */}
          <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider">
                Balance Due
              </p>
              <p className="text-xl font-black text-amber-900 dark:text-amber-200 font-mono mt-0.5">
                {formatCurrency(balanceDue, settings.currencySymbol)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400">Due Date</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                {formatDate(bill.dueDate)}
              </p>
            </div>
          </div>

          {/* METADATA FIELDS */}
          <div className="space-y-4">
            {/* Vendor */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Vendor / Supplier</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-600" />
                <span>{bill.vendorName}</span>
              </p>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Particulars / Notes</p>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                {bill.notes || 'Vendor bill for received goods or services.'}
              </p>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            {bill.status !== 'Paid' ? (
              <button
                onClick={handlePay}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Record Bill Payment</span>
              </button>
            ) : (
              <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 mx-auto">
                <CheckCircle2 className="w-4 h-4" />
                <span>Bill Fully Paid</span>
              </p>
            )}
          </div>
        </div>
      </div>
      {showPaymentModal && (
        <RecordVendorPaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            onClose();
          }}
          initialBill={bill}
        />
      )}
      {showVoidDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="void-bill-title"
            onSubmit={handleDelete}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 id="void-bill-title" className="text-sm font-bold text-slate-900 dark:text-white">Void bill {bill.billNumber}?</h3>
                <p className="mt-1 text-[11px] text-slate-500">This posts an audited general-ledger reversal; it does not delete history.</p>
              </div>
              <button type="button" aria-label="Close void bill confirmation" disabled={isVoiding} onClick={() => setShowVoidDialog(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              The bill remains visible as Void. Its payable, tax, and expense postings are reversed through linked journal evidence.
            </div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Reason for voiding
              <textarea
                required
                minLength={3}
                rows={3}
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder="Explain the correction for the audit trail"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-amber-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={isVoiding} onClick={() => setShowVoidDialog(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Keep bill</button>
              <button type="submit" disabled={isVoiding || voidReason.trim().length < 3} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {isVoiding ? 'Posting reversal...' : 'Void with reversal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
