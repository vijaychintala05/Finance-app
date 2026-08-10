import React, { useState } from 'react';
import {
  CheckCircle,
  Plus,
  Receipt,
  Search,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PaymentReceipt } from '../../types';
import { PaymentReceivedDetailsModal } from './PaymentReceivedDetailsModal';

interface PaymentsReceivedViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
}

export const PaymentsReceivedView: React.FC<PaymentsReceivedViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
}) => {
  const { paymentsReceived, addPaymentReceived, invoices, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingPayment, setViewingPayment] = useState<PaymentReceipt | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal, onModalClosed]);

  // Modal
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id || '');
  const [paymentMethod, setPaymentMethod] = useState('Bank Wire Transfer');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [amount, setAmount] = useState('5000');

  const filtered = paymentsReceived.filter(
    (r) =>
      r.paymentNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.clientName.toLowerCase().includes(search.toLowerCase()) ||
      r.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.referenceNumber.toLowerCase().includes(search.toLowerCase())
  );

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const inv = invoices.find((i) => i.id === invoiceId) || invoices[0];

    addPaymentReceived({
      paymentNumber: `REC-2026-00${paymentsReceived.length + 1}`,
      clientName: inv?.clientName || 'Client',
      invoiceNumber: inv?.invoiceNumber || 'INV-NEW',
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod,
      referenceNumber: referenceNumber || `REF-${Math.floor(Math.random() * 1000000)}`,
      amount: Number(amount) || 0,
    });

    setIsModalOpen(false);
    setReferenceNumber('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <Receipt className="w-6 h-6 text-teal-600" />
            <span>Payments Received</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete transaction ledger for incoming client payments, wire confirmations, and bank deposits
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment Received</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search payment #, client, invoice #, ref #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Payment #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Payment Date</th>
                <th className="p-3">Payment Method</th>
                <th className="p-3">Reference / Txn #</th>
                <th className="p-3 text-right pr-4">Amount Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setViewingPayment(r)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="p-3 pl-4 font-mono font-bold text-teal-600">{r.paymentNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{r.clientName}</td>
                  <td className="p-3 font-mono font-bold text-blue-600">{r.invoiceNumber}</td>
                  <td className="p-3 text-slate-500">{formatDate(r.paymentDate)}</td>
                  <td className="p-3 text-slate-700 font-medium">{r.paymentMethod}</td>
                  <td className="p-3 font-mono text-slate-500">{r.referenceNumber}</td>
                  <td className="p-3 text-right pr-4 font-mono font-extrabold text-teal-700 text-sm">
                    {formatCurrency(r.amount, settings.currencySymbol)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-teal-600" />
              <span>Record Payment Received</span>
            </h3>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Select Invoice</label>
                <select
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  {invoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} - {inv.clientName} ({formatCurrency(inv.totalAmount, settings.currencySymbol)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  <option value="Bank Wire Transfer">Bank Wire Transfer</option>
                  <option value="Credit Card / Stripe">Credit Card / Stripe</option>
                  <option value="Cheque / Draft">Cheque / Draft</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI / Online Transfer">UPI / Online Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Transaction / Reference #</label>
                <input
                  type="text"
                  placeholder="e.g. TXN-109923"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Amount Received ({settings.currencySymbol})</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer transition-colors"
                >
                  Save Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <PaymentReceivedDetailsModal
        isOpen={!!viewingPayment}
        onClose={() => setViewingPayment(null)}
        payment={viewingPayment}
      />
    </div>
  );
};
