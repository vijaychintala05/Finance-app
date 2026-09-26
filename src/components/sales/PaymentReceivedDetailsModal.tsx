import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  MoreVertical,
  Pencil,
  Printer,
  Receipt,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { PaymentReceipt } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { OperationNoticeBanner } from '../common/OperationNoticeBanner';
import { mutationExceptionNotice, type OperationNotice } from '../../utils/operationNotice';

interface PaymentReceivedDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentReceipt | null;
  onEdit?: (payment: PaymentReceipt) => void;
}

export const PaymentReceivedDetailsModal: React.FC<PaymentReceivedDetailsModalProps> = ({
  isOpen,
  onClose,
  payment,
  onEdit,
}) => {
  const { settings, currentOrg, paymentsReceived, deletePaymentReceived, paymentReversalGuards = [], verifyPaymentReversalStatus } = useBooks();
  const listedPayment = payment ? paymentsReceived.find((entry) => entry.id === payment.id) : undefined;
  const reversalGuard = listedPayment && currentOrg ? paymentReversalGuards.find((guard) => guard.paymentId === listedPayment.id && guard.organizationId === currentOrg.id) : undefined;
  const hasPaymentReversalGuard = Boolean(reversalGuard);
  const isReversalGuarded = Boolean(reversalGuard && reversalGuard.status !== 'verified');
  const currentPayment = listedPayment && reversalGuard?.committed && reversalGuard.status !== 'conflict' && reversalGuard.reversalJournalId
    ? { ...listedPayment, status: 'REVERSED' as const, reversalJournalId: reversalGuard.reversalJournalId }
    : listedPayment;
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReverseDialog, setShowReverseDialog] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [isReversing, setIsReversing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [notice, setNotice] = useState<OperationNotice | null>(null);

  useEffect(() => {
    setNotice(reversalGuard?.notice || null);
  }, [reversalGuard]);

  if (!isOpen || !currentPayment) return null;

  const handleReversePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReversing || hasPaymentReversalGuard || reverseReason.trim().length < 3 || reverseReason.trim().length > 1000) return;
    try {
      setIsReversing(true);
      const result = await deletePaymentReceived(currentPayment.id, reverseReason.trim());
      setShowReverseDialog(false);
      setReverseReason('');
      setNotice(result.refreshFailed
        ? { tone: 'warning', title: 'Payment reversed; refreshed state unavailable', message: 'The server committed reversal journal ' + (result.reversalJournalId || 'successfully') + ', but the refreshed payment register is not available yet.', recovery: 'Verify the authoritative payment status before taking any further action.', requestId: result.requestId }
        : { tone: 'success', title: 'Payment reversal completed', message: 'The payment remains in history with reversal journal ' + (result.reversalJournalId || 'recorded by the server') + '.', requestId: result.requestId });
    } catch (error) {
      setNotice(mutationExceptionNotice(error, { action: 'Payment reversal', failureTitle: 'Payment was not reversed', uncertainTitle: 'Payment reversal outcome could not be confirmed', uncertainRecovery: 'Verify the authoritative payment status before retrying; the reversal may already have posted.' }));
    } finally {
      setIsReversing(false);
    }
  };

  const handleVerifyStatus = async () => {
    if (isVerifying || !verifyPaymentReversalStatus) return;
    try {
      setIsVerifying(true);
      const result = await verifyPaymentReversalStatus(currentPayment.id);
      if (result.status === 'reversed') setNotice(reversalGuard?.notice || { tone: 'success', title: 'Payment reversal verified', message: 'The server confirms the payment is reversed.', requestId: result.requestId });
      else if (result.status === 'conflict') setNotice({ tone: 'error', title: 'Payment reversal needs review', message: 'The authoritative payment and reversal evidence do not agree. Financial actions remain paused.', requestId: result.requestId });
      else if (result.status === 'pending') setNotice({ tone: 'warning', title: 'Payment reversal is still unresolved', message: 'The payment still appears active. The previous request may still be processing; do not submit another reversal.', requestId: reversalGuard?.requestId || result.requestId });
      else setNotice({ tone: 'warning', title: 'Payment is still active', message: 'The server confirms the payment is active. Financial actions remain paused because the earlier reversal outcome is unresolved.', requestId: result.requestId });
    } catch (error) {
      setNotice(mutationExceptionNotice(error, { action: 'Payment status check', failureTitle: 'Payment status could not be verified', uncertainTitle: 'Payment status could not be verified', uncertainRecovery: 'Retry the status check before taking any further action.' }));
    } finally {
      setIsVerifying(false);
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
              Payment Received Receipt
            </h3>
          </div>

          <div className="flex items-center space-x-1 relative">
            {currentPayment.status !== 'REVERSED' && !hasPaymentReversalGuard && onEdit && (
              <button
                onClick={() => {
                  onClose();
                  onEdit(currentPayment);
                }}
                title="Edit payment"
                className="p-2.5 rounded-full hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}

            <button
              aria-label="More payment actions"
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-12 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-20">
                {currentPayment.status !== 'REVERSED' && !hasPaymentReversalGuard && onEdit && (
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      onClose();
                      onEdit(currentPayment);
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                  >
                    <Pencil className="w-4 h-4 text-blue-500" />
                    <span>Edit Payment</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    window.print();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print Receipt</span>
                </button>

                {currentPayment.status !== 'REVERSED' && !hasPaymentReversalGuard && <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowReverseDialog(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Reverse Payment</span>
                </button>}
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {notice && !showReverseDialog && <OperationNoticeBanner notice={notice} />}
          {isReversalGuarded && <button type="button" onClick={handleVerifyStatus} disabled={isVerifying} className="text-sm font-semibold text-blue-700 dark:text-blue-300 disabled:opacity-60">{isVerifying ? 'Verifying…' : 'Verify status'}</button>}
          {/* AMOUNT & BADGE */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Payment Amount</p>
              <h2 className="text-2xl sm:text-3xl font-black text-teal-600 dark:text-teal-400 font-mono tracking-tight mt-0.5">
                {formatCurrency(currentPayment.amount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Payment Date: {formatDate(currentPayment.paymentDate)} • Ref #{currentPayment.paymentNumber}
              </p>
            </div>

            <span className={`px-3 py-1 border rounded-full text-xs font-extrabold ${currentPayment.status === 'REVERSED' ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-teal-100 text-teal-800 border-teal-200'}`}>
              {currentPayment.status === 'REVERSED' ? 'Reversed' : 'Received'}
            </span>
          </div>

          {/* BOX */}
          <div className="bg-teal-50/70 dark:bg-teal-950/40 border border-teal-100 dark:border-teal-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-teal-600 dark:text-teal-400 font-extrabold uppercase text-[10px] tracking-wider">
                Customer Name
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-500" />
                <span>{currentPayment.clientName}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-teal-100/80 dark:border-teal-900/80">
              <span className="text-teal-600 dark:text-teal-400 font-extrabold uppercase text-[10px] tracking-wider">
                Applied to Invoice #
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                {currentPayment.invoiceNumber}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-teal-100/80 dark:border-teal-900/80">
              <span className="text-teal-600 dark:text-teal-400 font-extrabold uppercase text-[10px] tracking-wider">
                Payment Method
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-teal-500" />
                <span>{currentPayment.paymentMethod}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-teal-100/80 dark:border-teal-900/80">
              <span className="text-teal-600 dark:text-teal-400 font-extrabold uppercase text-[10px] tracking-wider">
                Bank / Wire Ref #
              </span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {currentPayment.referenceNumber}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Allocation breakdown</h4>
                {currentPayment.status === 'REVERSED' ? (
                  currentPayment.unallocatedAmountBeforeReversal == null
                    ? <span className="text-xs font-semibold text-slate-500">Unapplied amount unavailable for this earlier reversal</span>
                    : <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Unapplied at reversal {formatCurrency(Number(currentPayment.unallocatedAmountBeforeReversal), settings.currencySymbol)}</span>
                ) : Number(currentPayment.unallocatedAmount || 0) > 0 ? (
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Unallocated {formatCurrency(Number(currentPayment.unallocatedAmount), settings.currencySymbol)}</span>
                ) : null}
              </div>
              {currentPayment.allocations?.length ? (
                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {currentPayment.allocations.map((allocation, index) => (
                    <li key={allocation.invoiceId + '-' + index} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Invoice {allocation.invoiceNumber || allocation.invoiceId}</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white">{formatCurrency(Number(allocation.amount), settings.currencySymbol)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-slate-500">No invoice allocation is recorded for this payment.</p>}
              {currentPayment.status === 'REVERSED' && <p className="mt-2 text-xs text-slate-500">These are the original allocations; the reversal reopened the corresponding invoice balances.</p>}
            </div>
          </div>
        </div>
      </div>
      {showReverseDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="reverse-payment-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <h4 id="reverse-payment-title" className="text-lg font-bold text-slate-900 dark:text-white">Reverse payment {currentPayment.paymentNumber}?</h4>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This posts an audited journal reversal and reopens the allocated invoice balance. The original payment stays in history.</p>
            <form onSubmit={handleReversePayment} className="mt-4 space-y-3">
              <label htmlFor="payment-reversal-reason" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Reason for reversal</label>
              <textarea id="payment-reversal-reason" value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} minLength={3} maxLength={1000} required rows={3} className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-950" placeholder="Explain why this payment must be reversed" />
              {notice && <OperationNoticeBanner notice={notice} />}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" disabled={isReversing} onClick={() => setShowReverseDialog(false)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-200 dark:hover:bg-slate-800">Keep payment</button>
                <button type="submit" disabled={isReversing || hasPaymentReversalGuard || reverseReason.trim().length < 3 || reverseReason.trim().length > 1000} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{isReversing ? 'Reversing…' : 'Reverse payment'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
