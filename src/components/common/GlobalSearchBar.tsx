import React, { useState, useEffect } from 'react';
import { Search, FileText, User, ShoppingBag, CreditCard, ArrowRight, X } from 'lucide-react';
import { ApiClient } from '../../api/client';

interface SearchResultItem {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
  date?: string;
  linkRoute: string;
}

interface GlobalSearchBarProps {
  onNavigate?: (route: string) => void;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  const apiClient = new ApiClient();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await apiClient.get<{ results: SearchResultItem[] }>(`/search?q=${encodeURIComponent(query)}`);
      setLoading(false);
      if (res.data?.results) {
        setResults(res.data.results);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
      >
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <span className="hidden sm:inline">Search invoices, customers, bills...</span>
        <span className="inline sm:hidden">Search...</span>
        <kbd className="hidden md:inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-500 bg-white border border-slate-200 rounded shadow-xs">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center px-4 py-3 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 mr-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search quotations, invoices, customers, bills, bank transactions..."
            className="w-full text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {loading && (
            <div className="p-8 text-center text-xs text-slate-400">
              Searching database...
            </div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching records found for "{query}".
            </div>
          )}

          {!loading && !query && (
            <div className="p-6 text-center text-xs text-slate-400">
              Type a name, invoice number, amount, or GSTIN to search across all firm records.
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-1">
              {results.map((item) => (
                <div
                  key={`${item.category}-${item.id}`}
                  onClick={() => {
                    setIsOpen(false);
                    if (onNavigate) onNavigate(item.linkRoute);
                  }}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 cursor-pointer group transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-600 group-hover:bg-slate-200 group-hover:text-slate-900">
                      {item.category === 'Invoice' || item.category === 'Quotation' ? (
                        <FileText className="w-4 h-4" />
                      ) : item.category === 'Customer' || item.category === 'Vendor' ? (
                        <User className="w-4 h-4" />
                      ) : item.category === 'Vendor Bill' || item.category === 'Purchase Order' ? (
                        <ShoppingBag className="w-4 h-4" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900">{item.title}</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded">
                          {item.category}
                        </span>
                        {item.status && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 rounded">
                            {item.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{item.subtitle}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition-colors" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            Press <kbd className="px-1 font-mono text-[10px] bg-white border rounded">ESC</kbd> to close
          </span>
          <span>Press ↑ ↓ to navigate</span>
        </div>
      </div>
    </div>
  );
};
