import React, { useState } from 'react';
import {
  CreditCard,
  Eye,
  Plus,
  Receipt,
  Search,
  X,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PaymentMade } from '../../types';
import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';

interface PaymentsMadeViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const PaymentsMadeView: React.FC<PaymentsMadeViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { paymentsMade, vendors, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingPayment, setViewingPayment] = useState<PaymentMade | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = paymentsMade.find(
        (p) => p.id === selectedEntityId || p.paymentNumber === selectedEntityId
      );
      if (found) {
        setViewingPayment(found);
      }
    }
  }, [selectedEntityId, paymentsMade]);

  const filtered = paymentsMade.filter(
    (p) =>
      p.paymentNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      p.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      p.referenceNumber.toLowerCase().includes(search.toLowerCase())
  );

  const handleCloseCreateModal = () => {
    setIsModalOpen(false);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const handleCloseDetailModal = () => {
    setViewingPayment(null);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <CreditCard className="w-6 h-6 text-emerald-600" />
            <span>Payments Made to Vendors</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Outflow cash ledger for vendor bill settlements, bank wire disbursements, and supplier payments
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Record Payment Made</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search payment #, vendor, bill #, reference..."
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
                <th className="p-3">Vendor</th>
                <th className="p-3">Bill #</th>
                <th className="p-3">Date</th>
                <th className="p-3">Method</th>
                <th className="p-3">Reference</th>
                <th className="p-3 text-right">Amount Paid</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td
                    onClick={() => setViewingPayment(p)}
                    className="p-3 pl-4 font-mono font-bold text-emerald-600 cursor-pointer hover:underline"
                  >
                    {p.paymentNumber}
                  </td>
                  <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{p.vendorName}</td>
                  <td className="p-3 font-mono text-slate-500 dark:text-slate-400">{p.billNumber}</td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">{formatDate(p.paymentDate)}</td>
                  <td className="p-3 text-slate-600 dark:text-slate-300">{p.paymentMethod}</td>
                  <td className="p-3 font-mono text-slate-400">{p.referenceNumber}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(p.amount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right pr-4">
                    <button
                      onClick={() => setViewingPayment(p)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Detail Modal */}
      {viewingPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Payment Made: <span className="font-mono">{viewingPayment.paymentNumber}</span>
                </h3>
              </div>
              <button
                onClick={handleCloseDetailModal}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Vendor / Payee</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{viewingPayment.vendorName}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Amount Paid</span>
                <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(viewingPayment.amount, settings.currencySymbol)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Payment Date</span>
                <p className="font-medium text-slate-700 dark:text-slate-300">{formatDate(viewingPayment.paymentDate)}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Payment Method</span>
                <p className="font-medium text-slate-700 dark:text-slate-300">{viewingPayment.paymentMethod}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Bill Number</span>
                <p className="font-mono text-slate-700 dark:text-slate-300">{viewingPayment.billNumber}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Reference</span>
                <p className="font-mono text-slate-700 dark:text-slate-300">{viewingPayment.referenceNumber || 'N/A'}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleCloseDetailModal}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <RecordVendorPaymentModal
          isOpen={isModalOpen}
          onClose={handleCloseCreateModal}
        />
      )}
    </div>
  );
};
