import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  CreditCard,
  DollarSign,
  FileText,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';
import { CreditNote, Invoice } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface ApplyCreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditNote: CreditNote | null;
  onSuccess?: () => void;
}

export const ApplyCreditNoteModal: React.FC<ApplyCreditNoteModalProps> = ({
  isOpen,
  onClose,
  creditNote,
  onSuccess,
}) => {
  const { invoices = [], clients = [], settings, applyCreditNoteToInvoice } = useBooks();

  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [applyDate, setApplyDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Find customer
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

  // Find eligible unpaid/partially paid invoices for this customer
  const eligibleInvoices = useMemo(() => {
    if (!creditNote) return [];
    return invoices
      .filter((inv) => {
        const clientMatches =
          inv.clientName?.toLowerCase() === creditNote.clientName.toLowerCase() ||
          (matchedClient && inv.clientId === matchedClient.id);
        const hasBalance = Number(inv.balanceDue || 0) > 0;
        const notVoid =
          inv.status !== 'Paid' && inv.status !== 'Void' && inv.status !== 'Draft';
        return clientMatches && hasBalance && notVoid;
      })
      .sort(
        (a, b) =>
          new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()
      );
  }, [creditNote, invoices, matchedClient]);

  // Reset state whenever modal opens with new note
  React.useEffect(() => {
    if (isOpen) {
      setAllocations({});
      setErrorMessage('');
      setSuccessMessage('');
      setApplyDate(new Date().toISOString().split('T')[0]);
    }
  }, [isOpen, creditNote]);

  if (!isOpen || !creditNote) return null;

  const availableCredit = creditNote.remainingAmount ?? creditNote.totalAmount;

  // Calculate total allocated
  const totalAllocated: number = (Object.values(allocations) as string[]).reduce<number>((acc, val) => {
    const num = parseFloat(val);
    return acc + (isNaN(num) || num < 0 ? 0 : num);
  }, 0);

  const remainingAfterAllocation = Math.max(
    0,
    Math.round((availableCredit - totalAllocated) * 100) / 100
  );

  // Auto-allocate available credit from oldest to newest invoices
  const handleAutoAllocate = () => {
    let unallocated = availableCredit;
    const newAllocations: Record<string, string> = {};

    for (const inv of eligibleInvoices) {
      if (unallocated <= 0) break;
      const due = inv.balanceDue || 0;
      const applyAmount = Math.min(due, unallocated);
      if (applyAmount > 0) {
        newAllocations[inv.id] = (Math.round(applyAmount * 100) / 100).toFixed(2);
        unallocated = Math.round((unallocated - applyAmount) * 100) / 100;
      }
    }

    setAllocations(newAllocations);
    setErrorMessage('');
  };

  const handleClearAllocations = () => {
    setAllocations({});
    setErrorMessage('');
  };

  const handleAmountChange = (invoiceId: string, value: string, maxAllowed: number) => {
    const numVal = parseFloat(value);
    if (!isNaN(numVal) && numVal > maxAllowed) {
      setErrorMessage(`Cannot apply more than the invoice balance due (${formatCurrency(maxAllowed, settings.currencySymbol)}).`);
    } else {
      setErrorMessage('');
    }
    setAllocations((prev) => ({
      ...prev,
      [invoiceId]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (totalAllocated <= 0) {
      setErrorMessage('Please allocate an amount to at least one invoice.');
      return;
    }

    if (totalAllocated > availableCredit + 0.009) {
      setErrorMessage(
        `Total allocated (${formatCurrency(totalAllocated, settings.currencySymbol)}) exceeds available credit (${formatCurrency(availableCredit, settings.currencySymbol)}).`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // Apply to each invoice sequentially
      for (const [invoiceId, amountStr] of Object.entries(allocations)) {
        const amount = parseFloat(amountStr as string);
        if (amount && amount > 0) {
          await applyCreditNoteToInvoice(
            creditNote.id,
            invoiceId,
            amount,
            applyDate
          );
        }
      }

      setSuccessMessage('Credit note applied successfully!');
      setTimeout(() => {
        setIsSubmitting(false);
        if (onSuccess) onSuccess();
        onClose();
      }, 700);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err?.message || 'Failed to apply credit note to invoice.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Apply Credits to Invoices
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Allocate {creditNote.cnNumber} to open customer invoices
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

        {/* Summary Card */}
        <div className="p-6 pb-2 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl text-xs">
            <div>
              <span className="text-slate-400 font-medium block">Customer</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                {creditNote.clientName}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Available Credit</span>
              <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm block mt-0.5">
                {formatCurrency(availableCredit, settings.currencySymbol)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-medium block">Balance Remaining</span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm block mt-0.5">
                {formatCurrency(remainingAfterAllocation, settings.currencySymbol)}
              </span>
            </div>
          </div>

          {/* Allocation Action Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-1">
            <div className="flex items-center space-x-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                Application Date:
              </label>
              <input
                type="date"
                value={applyDate}
                onChange={(e) => setApplyDate(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleAutoAllocate}
                disabled={eligibleInvoices.length === 0}
                className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-xs font-bold flex items-center space-x-1.5 transition-colors disabled:opacity-40"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Allocate</span>
              </button>
              {totalAllocated > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllocations}
                  className="px-2.5 py-1.5 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-xs font-semibold transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error / Success alerts */}
        {errorMessage && (
          <div className="mx-6 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Invoice List Table */}
        <form onSubmit={handleSubmit}>
          <div className="p-6 pt-2 max-h-[45vh] overflow-y-auto">
            {eligibleInvoices.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  No open invoices found for {creditNote.clientName}
                </p>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                  This customer currently has no unpaid or partially paid invoices. You can carry forward this credit or issue a direct refund.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Invoice #</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Invoice Total</th>
                      <th className="p-3 text-right">Balance Due</th>
                      <th className="p-3 text-right pr-4 w-36">Amount to Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {eligibleInvoices.map((inv) => {
                      const balanceDue = inv.balanceDue || 0;
                      const allocatedVal = allocations[inv.id] || '';
                      return (
                        <tr
                          key={inv.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="p-3 pl-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {inv.invoiceNumber}
                          </td>
                          <td className="p-3 text-slate-500 dark:text-slate-400">
                            {formatDate(inv.issueDate)}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            {formatCurrency(inv.total, settings.currencySymbol)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {formatCurrency(balanceDue, settings.currencySymbol)}
                          </td>
                          <td className="p-2.5 text-right pr-4">
                            <div className="relative">
                              <span className="absolute left-2.5 top-2 text-slate-400 font-mono text-xs">
                                {settings.currencySymbol}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={balanceDue}
                                placeholder="0.00"
                                value={allocatedVal}
                                onChange={(e) =>
                                  handleAmountChange(inv.id, e.target.value, balanceDue)
                                }
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-2.5 py-1.5 text-xs text-right font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-xs text-slate-500">
              Total to Credit:{' '}
              <span className="font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                {formatCurrency(totalAllocated, settings.currencySymbol)}
              </span>
            </div>

            <div className="flex items-center space-x-2">
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
                disabled={isSubmitting || totalAllocated <= 0 || eligibleInvoices.length === 0}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center space-x-2 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <>
                    <span>Apply Credit</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
