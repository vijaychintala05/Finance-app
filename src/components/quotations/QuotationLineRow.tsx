import React from 'react';
import { Trash2, Copy } from 'lucide-react';
import { BuilderLineItem } from '../../hooks/useQuotationBuilder';
import { formatCurrency } from '../../utils/formatters';

interface QuotationLineRowProps {
  index: number;
  item: BuilderLineItem;
  onUpdate: (updates: Partial<BuilderLineItem>) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  currencySymbol?: string;
  isGstInclusive?: boolean;
}

export const QuotationLineRow: React.FC<QuotationLineRowProps> = ({
  index,
  item,
  onUpdate,
  onRemove,
  onDuplicate,
  currencySymbol = '₹',
  isGstInclusive = false,
}) => {
  const qty = Math.max(0, Number(item.quantity) || 0);
  const rate = Math.max(0, Number(item.rate) || 0);
  const gross = qty * rate;

  let discAmt = Math.max(0, Number(item.discountAmount) || 0);
  if (discAmt === 0 && item.discountPercent && item.discountPercent > 0) {
    discAmt = Math.round(gross * (Number(item.discountPercent) / 100) * 100) / 100;
  }
  if (discAmt > gross) discAmt = gross;

  const netLine = gross - discAmt;

  return (
    <>
      {/* Desktop Table Row */}
      <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
        <td className="p-2.5 font-medium text-slate-400 text-[11px] align-top">{index + 1}</td>
        <td className="p-2.5 space-y-1.5 align-top min-w-[200px]">
          <input
            type="text"
            placeholder="Item / Service Title *"
            value={item.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            required
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={item.description || ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          {item.itemId && (
            <span className="inline-block text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono">
              Item Master #{item.itemId}
            </span>
          )}
        </td>
        <td className="p-2.5 align-top w-24">
          <input
            type="text"
            placeholder="HSN/SAC"
            value={item.hsnSac || ''}
            onChange={(e) => onUpdate({ hsnSac: e.target.value })}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </td>
        <td className="p-2.5 align-top w-20">
          <input
            type="number"
            min="0.01"
            step="any"
            value={item.quantity}
            onChange={(e) => onUpdate({ quantity: Number(e.target.value) })}
            required
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-right font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </td>
        <td className="p-2.5 align-top w-24">
          <select
            value={item.unit || 'Pcs'}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="Pcs">Pcs</option>
            <option value="Units">Units</option>
            <option value="Hours">Hours</option>
            <option value="Days">Days</option>
            <option value="Kg">Kg</option>
            <option value="Mtr">Mtr</option>
            <option value="Box">Box</option>
            <option value="Set">Set</option>
          </select>
        </td>
        <td className="p-2.5 align-top w-28">
          <input
            type="number"
            min="0"
            step="any"
            value={item.rate}
            onChange={(e) => onUpdate({ rate: Number(e.target.value) })}
            required
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-right font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </td>
        <td className="p-2.5 align-top w-24">
          <div className="flex items-center space-x-1">
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              placeholder="%"
              value={item.discountPercent || ''}
              onChange={(e) =>
                onUpdate({
                  discountPercent: Number(e.target.value),
                  discountAmount: 0,
                })
              }
              className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-1.5 py-1.5 text-xs text-right text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <span className="text-[11px] text-slate-400">%</span>
          </div>
        </td>
        <td className="p-2.5 align-top w-24">
          <select
            value={item.taxRate || 0}
            onChange={(e) => onUpdate({ taxRate: Number(e.target.value) })}
            className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value={0}>0%</option>
            <option value={5}>5%</option>
            <option value={12}>12%</option>
            <option value={18}>18%</option>
            <option value={28}>28%</option>
          </select>
        </td>
        <td className="p-2.5 align-top text-right font-bold text-xs text-slate-900 dark:text-slate-100 min-w-[100px]">
          {formatCurrency(netLine, currencySymbol)}
        </td>
        <td className="p-2.5 align-top text-center w-16">
          <div className="flex items-center justify-center space-x-1">
            {onDuplicate && (
              <button
                type="button"
                onClick={onDuplicate}
                title="Duplicate line"
                aria-label="Duplicate line"
                className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onRemove}
              title="Remove line"
              aria-label="Delete line"
              className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
    </>
  );
};
