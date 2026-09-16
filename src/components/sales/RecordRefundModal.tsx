import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  Building,
  CheckCircle,
  DollarSign,
  FileText,
  Loader2,
  Receipt,
  RotateCcw,
  Wallet,
  X,
} from 'lucide-react';
import { CreditNote } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency } from '../../utils/formatters';

interface RecordRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditNote: CreditNote | null;
  onSuccess?: () => void;
}

export const RecordRefundModal: React.FC<RecordRefundModalProps> = ({
  isOpen,
  onClose,
  creditNote,
  onSuccess,
}) => {
  const { accounts = [], clients = [], settings, recordCustomerRefund } = useBooks();

  const [amount, setAmount] = useState<string>('');
  const [refundDate, setRefundDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [refundAccountId, setRefundAccountId] = useState<string>('');
  const [paymentMode, setPaymentMode] = useState<string>('Bank Transfer');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Find bank / cash accounts (Asset monetary accounts)
  const bankAccounts = useMemo(() => {
    return (accounts || []).filter((acc) => {
      const typeMatch = acc.type === 'Asset';
      const nameOrCodeMatch =
        acc.name.toLowerCase().includes('bank') ||
        acc.name.toLowerCase().includes('cash') ||
        acc.name.toLowerCase().includes('checking') ||
        acc.name.toLowerCase().includes('savings') ||
        acc.code.startsWith('10') ||
        acc.code.startsWith('12');
      return typeMatch && nameOrCodeMatch;
    });
  }, [accounts]);

  const matchedClient = useMemo(() => {
    if (!creditNote) return null;
    return (
      clients.find(
        (c) =>
          c.name.toLowerCase() === creditNote.clientName.toLowerCase() ||
          c.id === (creditNote as any).clientId
      ) || null
    );
  }, [creditNote, clients]);

  // Pre-fill amount with remaining credit
  React.useEffect(() => {
    if (isOpen && creditNote) {
      const available = creditNote.remainingAmount ?? creditNote.totalAmount;
      setAmount(available.toString());
      setRefundDate(new Date().toISOString().split('T')[0]);
      setRefundAccountId(bankAccounts[0]?.id || '');
      setPaymentMode('Bank Transfer');
      setReference('');
      setNotes(`Refund for Credit Note ${creditNote.cnNumber}`);
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [isOpen, creditNote, bankAccounts]);

  if (!isOpen || !creditNote) return null;

  const availableCredit = creditNote.remainingAmount ?? creditNote.totalAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const refundAmount = parseFloat(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      setErrorMessage('Please enter a valid refund amount greater than 0.');
      return;
    }

    if (refundAmount > availableCredit + 0.009) {
      setErrorMessage(
        `Refund amount cannot exceed available credit (${formatCurrency(availableCredit, settings.currencySymbol)}).`
      );
      return;
    }

    if (!refundAccountId) {
      setErrorMessage('Please select a payment account to refund from.');
      return;
    }

    const customerId = (creditNote as any).clientId || matchedClient?.id;
    if (!customerId) {
      setErrorMessage('Customer ID could not be identified for this credit note.');
      return;
    }

    setIsSubmitting(true);
    try {
      await recordCustomerRefund({
        customerId,
        creditNoteId: creditNote.id,
        refundDate,
        amount: refundAmount,
        refundAccountId,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      setSuccessMessage('Customer refund recorded successfully!');
      setTimeout(() => {
        setIsSubmitting(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err?.message || 'Failed to record customer refund.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Refund Customer
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Return unused credit from {creditNote.cnNumber} to customer
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Info Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl flex justify-between items-center text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Customer</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                {creditNote.clientName}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 font-medium block">Available to Refund</span>
              <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm block mt-0.5">
                {formatCurrency(availableCredit, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Alerts */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Refund Amount *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs">
                  {settings.currencySymbol}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Refund Date *
              </label>
              <input
                type="date"
                required
                value={refundDate}
                onChange={(e) => setRefundDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Paid From Account */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Refunded From Account *
            </label>
            <div className="relative">
              <Building className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <select
                required
                value={refundAccountId}
                onChange={(e) => setRefundAccountId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {bankAccounts.length === 0 ? (
                  <option value="">No Bank or Cash Accounts Found</option>
                ) : (
                  bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} — {acc.name} ({acc.subType || acc.type})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Payment Mode & Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Payment Mode
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Reference / UTR #
              </label>
              <input
                type="text"
                placeholder="e.g. UTR-98765432"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Reason / Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal memo or reason for refund..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex justify-end items-center space-x-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || availableCredit <= 0}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center space-x-2 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Refund...</span>
                </>
              ) : (
                <span>Confirm Refund</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
