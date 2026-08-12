import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, Search, ShieldCheck, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PaymentReceipt } from '../../types';
import { PaymentReceivedDetailsModal } from './PaymentReceivedDetailsModal';

interface PaymentsReceivedViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const PaymentsReceivedView: React.FC<PaymentsReceivedViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { paymentsReceived, addPaymentReceived, invoices, accounts, settings } = useBooks();
  const outstandingInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.balanceDue > 0 && !['Draft', 'Void'].includes(invoice.status)),
    [invoices]
  );
  const depositAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.type === 'Asset' &&
          account.status !== 'Inactive' &&
          !account.isLocked &&
          (account.code === '1000' ||
            ['Bank', 'Cash', 'Cash & Bank', 'Digital Wallet', 'Undeposited Funds'].includes(account.subType))
      ),
    [accounts]
  );

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingPayment, setViewingPayment] = useState<PaymentReceipt | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [depositAccountId, setDepositAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openCreateModal = () => {
    const invoice = outstandingInvoices[0];
    setInvoiceId(invoice?.id || '');
    setDepositAccountId(depositAccounts[0]?.id || '');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('Bank Transfer');
    setReferenceNumber('');
    setAmount(invoice ? invoice.balanceDue.toFixed(2) : '');
    setError('');
    setIsSubmitting(false);
    setIsModalOpen(true);
  };

  useEffect(() => {
    if (autoOpenCreateModal) {
      openCreateModal();
      onModalClosed?.();
    }
  }, [autoOpenCreateModal]);

  useEffect(() => {
    if (!selectedEntityId) return;
    const found = paymentsReceived.find(
      (payment) => payment.id === selectedEntityId || payment.paymentNumber === selectedEntityId
    );
    if (found) setViewingPayment(found);
  }, [selectedEntityId, paymentsReceived]);

  const selectedInvoice = outstandingInvoices.find((invoice) => invoice.id === invoiceId);
  const filtered = paymentsReceived.filter((payment) => {
    const query = search.toLowerCase();
    return (
      payment.paymentNumber.toLowerCase().includes(query) ||
      payment.clientName.toLowerCase().includes(query) ||
      payment.invoiceNumber.toLowerCase().includes(query) ||
      payment.referenceNumber.toLowerCase().includes(query)
    );
  });

  const handleInvoiceChange = (nextInvoiceId: string) => {
    setInvoiceId(nextInvoiceId);
    const invoice = outstandingInvoices.find((candidate) => candidate.id === nextInvoiceId);
    setAmount(invoice ? invoice.balanceDue.toFixed(2) : '');
    if (invoice && paymentDate < invoice.issueDate) setPaymentDate(invoice.issueDate);
  };

  const handleRecordPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const invoice = outstandingInvoices.find((candidate) => candidate.id === invoiceId);
    const depositAccount = depositAccounts.find((account) => account.id === depositAccountId);
    const parsedAmount = Number(amount);
    if (!invoice || !depositAccount) {
      setError('Select an outstanding invoice and an active deposit account.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 1e-7) {
      setError('Amount must be positive and contain no more than two decimal places.');
      return;
    }
    if (paymentDate < invoice.issueDate) {
      setError('Payment date cannot precede the invoice issue date.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addPaymentReceived({
        paymentNumber: '',
        clientName: invoice.clientName,
        invoiceNumber: invoice.invoiceNumber,
        paymentDate,
        paymentMethod,
        referenceNumber: referenceNumber.trim(),
        amount: parsedAmount,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        depositToAccountId: depositAccount.id,
      });
      setIsModalOpen(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Payment could not be recorded. No financial data was changed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center space-x-2 text-xl font-bold text-slate-900 dark:text-white">
            <Receipt className="h-6 w-6 text-teal-600" />
            <span>Payments received</span>
          </h2>
          <p className="mt-1 text-xs text-slate-500">Server-posted customer receipts and invoice allocations.</p>
        </div>
        <button onClick={openCreateModal} disabled={outstandingInvoices.length === 0 || depositAccounts.length === 0} className="flex items-center space-x-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          <Plus className="h-4 w-4" />
          <span>Record payment</span>
        </button>
      </div>

      {(outstandingInvoices.length === 0 || depositAccounts.length === 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Recording requires an outstanding posted invoice and an active bank, cash, wallet, or undeposited-funds account.
        </div>
      )}

      <div className="flex items-center rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input type="text" placeholder="Search payment, customer, invoice, or reference" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs font-medium text-slate-900 outline-hidden focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/80">
              <tr><th className="p-3 pl-4">Payment #</th><th className="p-3">Customer</th><th className="p-3">Allocated invoice</th><th className="p-3">Date</th><th className="p-3">Method</th><th className="p-3">Reference</th><th className="p-3 pr-4 text-right">Amount</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-10 text-center text-sm text-slate-500">No authoritative payment records found.</td></tr>
              ) : filtered.map((payment) => (
                <tr key={payment.id} onClick={() => setViewingPayment(payment)} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="p-3 pl-4 font-mono font-bold text-teal-600">{payment.paymentNumber}{payment.status === 'REVERSED' ? ' · Reversed' : ''}</td>
                  <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{payment.clientName}</td>
                  <td className="p-3 font-mono font-bold text-blue-600">{payment.invoiceNumber || 'Unallocated'}</td>
                  <td className="p-3 text-slate-500">{formatDate(payment.paymentDate)}</td>
                  <td className="p-3 font-medium text-slate-700 dark:text-slate-300">{payment.paymentMethod}</td>
                  <td className="p-3 font-mono text-slate-500">{payment.referenceNumber || '—'}</td>
                  <td className="p-3 pr-4 text-right font-mono text-sm font-extrabold text-teal-700">{formatCurrency(payment.amount, settings.currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs" onClick={() => !isSubmitting && setIsModalOpen(false)}>
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><Receipt className="h-5 w-5 text-teal-600" />Record payment received</h3><p className="mt-1 text-xs text-slate-500">Payment number and ledger entry are assigned by the server.</p></div>
              <button type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>The receipt, allocation, invoice balance, journal, and audit record commit atomically. Any excess is posted as a customer advance.</p></div>
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Outstanding invoice</span><select required value={invoiceId} onChange={(event) => handleInvoiceChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="">Select invoice</option>{outstandingInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} — {invoice.clientName} — {formatCurrency(invoice.balanceDue, settings.currencySymbol)} due</option>)}</select></label>
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Deposit account</span><select required value={depositAccountId} onChange={(event) => setDepositAccountId(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="">Select account</option>{depositAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Payment date</span><input required type="date" min={selectedInvoice?.issueDate} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Amount ({settings.currencyCode})</span><input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              </div>
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option>Bank Transfer</option><option>Cheque</option><option>Cash</option><option>Card Processor</option><option>UPI</option></select></label>
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>External reference (optional)</span><input maxLength={255} value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="Bank, cheque, processor, or UPI reference" className="w-full rounded-lg border border-slate-300 bg-white p-2.5 font-mono font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setIsModalOpen(false)} disabled={isSubmitting} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel</button><button type="submit" disabled={isSubmitting} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Posting…' : 'Post receipt'}</button></div>
            </form>
          </div>
        </div>
      )}

      <PaymentReceivedDetailsModal isOpen={Boolean(viewingPayment)} onClose={() => { setViewingPayment(null); onSelectedEntityClosed?.(); }} payment={viewingPayment} />
    </div>
  );
};
