import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Receipt, ShieldCheck, Wallet, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Invoice } from '../../types';

interface RecordCustomerPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetInvoice?: Invoice | null;
  clientId?: string;
  onPaymentSuccess?: () => void;
}

export const RecordCustomerPaymentModal: React.FC<RecordCustomerPaymentModalProps> = ({
  isOpen,
  onClose,
  targetInvoice,
  clientId,
  onPaymentSuccess,
}) => {
  const { invoices, accounts, refreshAccounts, settings, addPaymentReceived } = useBooks();

  const clientInvoices = useMemo(() => {
    return invoices.filter(
      (inv) =>
        inv.balanceDue > 0 &&
        !['Draft', 'Void'].includes(inv.status) &&
        (clientId ? inv.clientId === clientId : true)
    );
  }, [invoices, clientId]);

  const depositAccounts = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.type === 'Asset' &&
        (a.status || 'Active') === 'Active' &&
        a.allowDirectPosting !== false &&
        !a.isLocked &&
        (a.code === '1000' ||
          ['bank', 'cash', 'cash & bank', 'digital wallet', 'undeposited funds', 'payment clearing'].includes(
            String(a.subType || '').toLowerCase()
          ))
    );
  }, [accounts]);

  useEffect(() => {
    if (isOpen && refreshAccounts) {
      refreshAccounts().catch((err) => console.error('Error fetching accounts for customer payment:', err));
    }
  }, [isOpen, refreshAccounts]);

  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (targetInvoice) {
      setSelectedInvoiceId(targetInvoice.id);
      setAmount(targetInvoice.balanceDue.toFixed(2));
    } else if (clientInvoices.length > 0) {
      setSelectedInvoiceId(clientInvoices[0].id);
      setAmount(clientInvoices[0].balanceDue.toFixed(2));
    } else {
      setSelectedInvoiceId('');
      setAmount('');
    }

    if (depositAccounts.length > 0) {
      setDepositAccountId(depositAccounts[0].id);
    }

    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMode('Bank Transfer');
    setReference('');
    setError('');
    setIsSubmitting(false);
  }, [isOpen, targetInvoice, clientInvoices, depositAccounts]);

  const activeInvoice = useMemo(() => {
    return clientInvoices.find((inv) => inv.id === selectedInvoiceId) || targetInvoice;
  }, [clientInvoices, selectedInvoiceId, targetInvoice]);

  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    const found = clientInvoices.find((inv) => inv.id === invId);
    if (found) {
      setAmount(found.balanceDue.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvoice) {
      setError('Please select an outstanding invoice.');
      return;
    }
    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      setError('Payment amount must be greater than 0.');
      return;
    }
    if (payAmount > activeInvoice.balanceDue) {
      setError(`Payment cannot exceed open balance of ${formatCurrency(activeInvoice.balanceDue, settings.currencySymbol)}.`);
      return;
    }
    if (!depositAccountId) {
      setError('Please select a deposit bank or cash account.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await addPaymentReceived({
        paymentNumber: '',
        invoiceId: activeInvoice.id,
        invoiceNumber: activeInvoice.invoiceNumber,
        clientId: activeInvoice.clientId,
        clientName: activeInvoice.clientName,
        paymentDate,
        paymentMode,
        reference,
        amount: payAmount,
        notes: `Direct remittance for Invoice #${activeInvoice.invoiceNumber}`,
        depositToAccountId: depositAccountId,
      });

      onPaymentSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to record customer payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Record Customer Payment</h3>
              <p className="text-xs text-slate-500">Settle outstanding customer receivables into the general ledger.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/50 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Invoice Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Target Invoice</label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {clientInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — {inv.clientName} (Balance: {formatCurrency(inv.balanceDue, settings.currencySymbol)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Date */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Amount Received</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                  {settings.currencySymbol || '$'}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-7 pr-3 py-2 text-xs font-financial font-bold text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Payment Date</label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Deposit Account & Payment Method */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Deposit Account</label>
              <select
                value={depositAccountId}
                onChange={(e) => setDepositAccountId(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {depositAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} — {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">Payment Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="Bank Transfer">Bank Transfer / NEFT / IMPS</option>
                <option value="Cash">Cash</option>
                <option value="Credit Card">Credit Card</option>
                <option value="Cheque">Cheque</option>
                <option value="UPI">UPI / Digital Wallet</option>
              </select>
            </div>
          </div>

          {/* Reference # */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Reference / Transaction / Cheque # (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. TXN-9482910"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{isSubmitting ? 'Recording Remittance…' : 'Post Payment'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
