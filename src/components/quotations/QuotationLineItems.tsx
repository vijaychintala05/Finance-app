import React from 'react';
import { Plus, Package, Trash2, Copy } from 'lucide-react';
import { BuilderLineItem } from '../../hooks/useQuotationBuilder';
import { QuotationLineRow } from './QuotationLineRow';
import { formatCurrency } from '../../utils/formatters';

interface QuotationLineItemsProps {
  items: BuilderLineItem[];
  onUpdateLine: (id: string, updates: Partial<BuilderLineItem>) => void;
  onRemoveLine: (id: string) => void;
  onDuplicateLine?: (id: string) => void;
  onAddCustomLine: () => void;
  onOpenItemPicker: () => void;
  currencySymbol?: string;
  isGstInclusive?: boolean;
}

export const QuotationLineItems: React.FC<QuotationLineItemsProps> = ({
  items,
  onUpdateLine,
  onRemoveLine,
  onDuplicateLine,
  onAddCustomLine,
  onOpenItemPicker,
  currencySymbol = '₹',
  isGstInclusive = false,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs uppercase tracking-wider">
          Quotation Line Items ({items.length})
        </h4>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onOpenItemPicker}
            className="bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer"
          >
            <Package className="w-3.5 h-3.5" />
            <span>+ Add Saved Item</span>
          </button>

          <button
            type="button"
            onClick={onAddCustomLine}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Custom Line</span>
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500">
          <p className="text-xs font-medium">No quotation items added yet.</p>
          <p className="text-[11px] text-slate-400 mt-1">Click "+ Add Saved Item" or "+ Custom Line" to begin adding lines.</p>
        </div>
      )}

      {/* Desktop View: Fast Editable Table */}
      {items.length > 0 && (
        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-2.5 pl-3 w-8">#</th>
                <th className="p-2.5">Item / Description</th>
                <th className="p-2.5 w-24">HSN/SAC</th>
                <th className="p-2.5 w-20 text-right">Qty</th>
                <th className="p-2.5 w-24">Unit</th>
                <th className="p-2.5 w-28 text-right">Rate</th>
                <th className="p-2.5 w-24 text-right">Disc %</th>
                <th className="p-2.5 w-24">GST</th>
                <th className="p-2.5 text-right min-w-[100px]">Amount</th>
                <th className="p-2.5 text-center w-16"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <QuotationLineRow
                  key={item.id}
                  index={idx}
                  item={item}
                  onUpdate={(updates) => onUpdateLine(item.id, updates)}
                  onRemove={() => onRemoveLine(item.id)}
                  onDuplicate={onDuplicateLine ? () => onDuplicateLine(item.id) : undefined}
                  currencySymbol={currencySymbol}
                  isGstInclusive={isGstInclusive}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Card List View */}
      {items.length > 0 && (
        <div className="sm:hidden space-y-3">
          {items.map((item, idx) => {
            const qty = Math.max(0, Number(item.quantity) || 0);
            const rate = Math.max(0, Number(item.rate) || 0);
            const gross = qty * rate;
            let discAmt = Math.max(0, Number(item.discountAmount) || 0);
            if (discAmt === 0 && item.discountPercent && item.discountPercent > 0) {
              discAmt = Math.round(gross * (Number(item.discountPercent) / 100) * 100) / 100;
            }
            const netLine = gross - discAmt;

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs"
              >
                <div className="flex justify-between items-start">
                  <span className="font-bold text-xs text-blue-600 dark:text-blue-400">
                    Line {idx + 1}
                  </span>
                  <div className="flex items-center space-x-1">
                    {onDuplicateLine && (
                      <button
                        type="button"
                        onClick={() => onDuplicateLine(item.id)}
                        title="Duplicate line"
                        aria-label="Duplicate line"
                        className="text-slate-400 hover:text-blue-600 p-1 cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveLine(item.id)}
                      aria-label="Delete line"
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

              <input
                type="text"
                placeholder="Item Name *"
                value={item.name}
                onChange={(e) => onUpdateLine(item.id, { name: e.target.value })}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-semibold"
              />

              <input
                type="text"
                placeholder="Description"
                value={item.description || ''}
                onChange={(e) => onUpdateLine(item.id, { description: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs"
              />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[10px] text-slate-500">Qty</label>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => onUpdateLine(item.id, { quantity: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Unit</label>
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => onUpdateLine(item.id, { unit: e.target.value })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">Rate</label>
                  <input
                    type="number"
                    value={item.rate}
                    onChange={(e) => onUpdateLine(item.id, { rate: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-500">GST %</label>
                  <select
                    value={item.taxRate || 0}
                    onChange={(e) => onUpdateLine(item.id, { taxRate: Number(e.target.value) })}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5"
                  >
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500">Line Amount:</span>
                <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                  {formatCurrency(netLine, currencySymbol)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
};
