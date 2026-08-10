import React, { useState, useEffect } from 'react';
import { Search, X, Package, Check, Loader2 } from 'lucide-react';
import { quotationApi } from '../../services/quotationApi';
import { formatCurrency } from '../../utils/formatters';

interface ItemPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: {
    id: string;
    name: string;
    description?: string;
    hsnSac?: string;
    unit?: string;
    salesRate?: number;
    gstRate?: number;
  }) => void;
  currencySymbol?: string;
}

export const ItemPicker: React.FC<ItemPickerProps> = ({
  isOpen,
  onClose,
  onSelectItem,
  currencySymbol = '₹',
}) => {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    const currentReq = Date.now();

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      quotationApi
        .listItems(search)
        .then((data) => {
          if (isMounted) {
            setItems(data.filter((i) => i.isActive !== false));
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isMounted) {
            setError(err.message || 'Failed to load items');
            setLoading(false);
          }
        });
    }, search ? 150 : 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center space-x-2">
            <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              Select Item from Master Registry
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by item name, SKU, HSN/SAC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2.5 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {loading ? (
            <div className="py-12 text-center text-slate-400 flex flex-col items-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-xs">Loading Item Master items...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-400">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No saved items found matching "{search}".
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectItem(item);
                    onClose();
                  }}
                  className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl transition-colors cursor-pointer flex items-center justify-between group"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {item.name}
                      </span>
                      {item.sku && (
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono">
                          {item.sku}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-1">{item.description}</p>
                    )}
                    <div className="flex items-center space-x-3 text-[10px] text-slate-400">
                      {item.hsnSac && <span>HSN/SAC: {item.hsnSac}</span>}
                      <span>Unit: {item.unit || 'Pcs'}</span>
                      <span>GST: {item.gstRate || 0}%</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {formatCurrency(item.salesRate || 0, currencySymbol)}
                    </div>
                    <button
                      type="button"
                      className="mt-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 ml-auto"
                    >
                      <span>Select</span>
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
