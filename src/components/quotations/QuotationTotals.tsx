import React from 'react';
import { formatCurrency } from '../../utils/formatters';

interface Totals {
  subtotal: number;
  lineDiscounts: number;
  subtotalAfterLineDiscounts: number;
  overallDiscount: number;
  taxableTotal: number;
  taxTotal: number;
  grandTotal: number;
}

interface QuotationTotalsProps {
  totals: Totals;
  overallDiscount: number;
  setOverallDiscount: (v: number) => void;
  currencySymbol?: string;
  isGstInclusive?: boolean;
}

export const QuotationTotals: React.FC<QuotationTotalsProps> = ({
  totals,
  overallDiscount,
  setOverallDiscount,
  currencySymbol = '₹',
  isGstInclusive = false,
}) => {
  return (
    <div className="bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 text-xs max-w-xs ml-auto">
      <h5 className="font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 pb-2">
        Quotation Summary
      </h5>

      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
        <span>Gross Subtotal:</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {formatCurrency(totals.subtotal, currencySymbol)}
        </span>
      </div>

      {totals.lineDiscounts > 0 && (
        <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
          <span>Line Discounts:</span>
          <span className="font-semibold">
            -{formatCurrency(totals.lineDiscounts, currencySymbol)}
          </span>
        </div>
      )}

      {/* Document-level Overall Discount Input */}
      <div className="space-y-1 pt-1 border-t border-slate-200/60 dark:border-slate-800">
        <div className="flex justify-between items-center">
          <label className="text-slate-600 dark:text-slate-400 font-medium">
            Overall Discount ({currencySymbol}):
          </label>
          <input
            type="number"
            min="0"
            step="any"
            value={overallDiscount || ''}
            onChange={(e) => {
              const val = Math.max(0, Number(e.target.value) || 0);
              setOverallDiscount(val);
            }}
            placeholder="0"
            className="w-28 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-right font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>
        {overallDiscount > totals.subtotalAfterLineDiscounts && (
          <p className="text-[10px] text-rose-500 font-semibold text-right">
            Exceeds subtotal ({formatCurrency(totals.subtotalAfterLineDiscounts, currencySymbol)})
          </p>
        )}
      </div>

      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400 border-t border-slate-200/60 dark:border-slate-800 pt-2">
        <span>Taxable Amount:</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {formatCurrency(totals.taxableTotal, currencySymbol)}
        </span>
      </div>

      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
        <span>Estimated GST / Tax:</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">
          {formatCurrency(totals.taxTotal, currencySymbol)}
        </span>
      </div>

      {isGstInclusive && (
        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium text-right italic">
          Prices include GST. Tax is extracted.
        </div>
      )}

      <div className="flex justify-between items-center pt-3 border-t-2 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-extrabold text-sm">
        <span>Grand Total:</span>
        <span className="text-blue-600 dark:text-blue-400">
          {formatCurrency(totals.grandTotal, currencySymbol)}
        </span>
      </div>
    </div>
  );
};
