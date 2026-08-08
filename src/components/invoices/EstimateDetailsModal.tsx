import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  FileCheck,
  FileSpreadsheet,
  MoreVertical,
  Printer,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Estimate, Invoice } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';

interface EstimateDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  estimate: Estimate | null;
  onConverted?: (inv: Invoice) => void;
}

export const EstimateDetailsModal: React.FC<EstimateDetailsModalProps> = ({
  isOpen,
  onClose,
  estimate,
  onConverted,
}) => {
  const { settings, convertEstimateToInvoice, deleteEstimate } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!isOpen || !estimate) return null;

  const handleConvert = () => {
    const inv = convertEstimateToInvoice(estimate.id);
    if (inv && onConverted) {
      onConverted(inv);
    }
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete quote ${estimate.estimateNumber}?`)) {
      if (deleteEstimate) {
        deleteEstimate(estimate.id);
      }
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
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
              Estimate & Quote Details
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
                  <span>Print Quote</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Quote</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* HEADER */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Quote Reference</p>
              <h2 className="text-xl font-mono font-black text-blue-600 dark:text-blue-400 tracking-tight mt-0.5">
                {estimate.estimateNumber}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Issued: {formatDate(estimate.issueDate)} • Expires: {formatDate(estimate.expiryDate)}
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${getStatusBadgeStyle(
                estimate.status
              )}`}
            >
              {estimate.status}
            </span>
          </div>

          {/* CLIENT */}
          <div className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-2xl p-4 flex justify-between items-center text-xs">
            <span className="text-blue-600 dark:text-blue-400 font-extrabold uppercase text-[10px] tracking-wider">
              Client
            </span>
            <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-500" />
              <span>{estimate.clientName}</span>
            </span>
          </div>

          {/* LINE ITEMS TABLE */}
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-2">
              Quoted Items & Services
            </h4>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/80 dark:bg-slate-800 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200/60 dark:border-slate-700">
                  <tr>
                    <th className="p-3 pl-4">Item & Description</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Unit Price</th>
                    <th className="p-3 text-right pr-4">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/50 dark:divide-slate-700/50">
                  {estimate.items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="p-3 pl-4 font-medium text-slate-800 dark:text-slate-200">
                        {item.description}
                      </td>
                      <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-400">
                        {item.quantity}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">
                        {formatCurrency(item.unitPrice, settings.currencySymbol)}
                      </td>
                      <td className="p-3 text-right pr-4 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(item.amount, settings.currencySymbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* TOTALS SUMMARY */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span>
                  <span className="font-mono">
                    {formatCurrency(estimate.subtotal, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Tax ({settings.defaultTaxRate}%)</span>
                  <span className="font-mono">
                    {formatCurrency(estimate.taxTotal, settings.currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-slate-100 text-sm">
                  <span>Grand Total</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">
                    {formatCurrency(estimate.totalAmount, settings.currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ACTION BUTTON */}
          {estimate.status !== 'Converted' ? (
            <div className="pt-2">
              <button
                onClick={handleConvert}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
              >
                <FileCheck className="w-4 h-4" />
                <span>Convert to Official Sales Invoice</span>
              </button>
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl text-center text-xs font-bold text-emerald-700 dark:text-emerald-400">
              ✓ Quote Has Been Converted to Invoice
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
