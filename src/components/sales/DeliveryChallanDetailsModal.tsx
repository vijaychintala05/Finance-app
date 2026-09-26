import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  MoreVertical,
  Printer,
  User,
} from 'lucide-react';
import { DeliveryChallan } from '../../types';
import { formatDate } from '../../utils/formatters';

interface DeliveryChallanDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  challan: DeliveryChallan | null;
}

export const DeliveryChallanDetailsModal: React.FC<DeliveryChallanDetailsModalProps> = ({
  isOpen,
  onClose,
  challan,
}) => {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  if (!isOpen || !challan) return null;

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
              Delivery Challan Slip
            </h3>
          </div>

          <div className="flex items-center space-x-1 relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-label="More challan actions"
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
                  <span>Print Challan Slip</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* HEADINGS */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Dispatch Reference</p>
              <h2 className="text-xl font-mono font-black text-sky-600 dark:text-sky-400 tracking-tight mt-0.5">
                {challan.challanNumber}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Dispatched On: {formatDate(challan.dispatchDate)}
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                challan.status === 'Delivered'
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
              }`}
            >
              {challan.status}
            </span>
          </div>

          {/* CUSTOMER & DESTINATION */}
          <div className="bg-sky-50/70 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-sky-600 dark:text-sky-400 font-extrabold uppercase text-[10px] tracking-wider">
                Recipient / Customer
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-sky-500" />
                <span>{challan.clientName}</span>
              </span>
            </div>

            <div className="flex justify-between items-start text-xs pt-2 border-t border-sky-100/80 dark:border-sky-900/80">
              <span className="text-sky-600 dark:text-sky-400 font-extrabold uppercase text-[10px] tracking-wider flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Delivery Address
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200 text-right max-w-[200px]">
                {challan.deliveryAddress}
              </span>
            </div>
          </div>

          {/* DISPATCHED GOODS SUMMARY */}
          <div>
            <p className="text-xs text-slate-400 font-medium">Dispatch / Supply Reason</p>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              {challan.itemsSummary}
            </p>
          </div>

          {/* Challan status changes are available only through audited fulfillment workflows. */}
          {challan.status !== 'Delivered' && (
            <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
              Delivery status is updated through the audited sales-order fulfillment workflow.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};