import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  MoreVertical,
  Printer,
  Receipt,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { PaymentReceipt } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface PaymentReceivedDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentReceipt | null;
}

export const PaymentReceivedDetailsModal: React.FC<PaymentReceivedDetailsModalProps> = ({
  isOpen,
  onClose,
  payment,
}) => {
  const { settings, deletePaymentReceived } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!isOpen || !payment) return null;

  const handleDelete = () => {
    if (confirm(`Reverse payment ${payment.paymentNumber} and reopen its invoice balance?`)) {
      if (deletePaymentReceived) {
        void deletePaymentReceived(payment.id).then(onClose).catch((error) => window.alert(error.message));
      }
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
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
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
                  <span>Print Receipt</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Reverse Payment</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* AMOUNT & BADGE */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Total Payment Amount</p>
              <h2 className="text-2xl sm:text-3xl font-black text-teal-600 dark:text-teal-400 font-mono tracking-tight mt-0.5">
                {formatCurrency(payment.amount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Payment Date: {formatDate(payment.paymentDate)} • Ref #{payment.paymentNumber}
              </p>
            </div>

            <span className={`px-3 py-1 border rounded-full text-xs font-extrabold ${payment.status === 'REVERSED' ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-teal-100 text-teal-800 border-teal-200'}`}>
              {payment.status === 'REVERSED' ? 'Reversed' : 'Received'}
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
                <span>{payment.clientName}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-teal-100/80 dark:border-teal-900/80">
              <span className="text-teal-600 dark:text-teal-400 font-extrabold uppercase text-[10px] tracking-wider">
                Applied to Invoice #
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                {payment.invoiceNumber}
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-teal-100/80 dark:border-teal-900/80">
              <span className="text-teal-600 dark:text-teal-400 font-extrabold uppercase text-[10px] tracking-wider">
                Payment Method
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-teal-500" />
                <span>{payment.paymentMethod}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-teal-100/80 dark:border-teal-900/80">
              <span className="text-teal-600 dark:text-teal-400 font-extrabold uppercase text-[10px] tracking-wider">
                Bank / Wire Ref #
              </span>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {payment.referenceNumber}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
