import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, FileText, User, ShoppingBag, CreditCard, ArrowRight, X, Layers, BookOpen, AlertCircle } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';

export interface SearchResultItem {
  id: string;
  category:
    | 'Invoice'
    | 'Quotation'
    | 'Sales Order'
    | 'Customer'
    | 'Vendor'
    | 'Vendor Bill'
    | 'Purchase Order'
    | 'Payment Received'
    | 'Payment Made'
    | 'Bank Transaction'
    | 'Account';
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
  date?: string;
  tabTarget: string;
}

interface GlobalSearchBarProps {
  onNavigate?: (tab: string, options?: { entityId?: string; autoCreate?: boolean }) => void;
  isMobileTrigger?: boolean;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ onNavigate, isMobileTrigger }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { currentOrg } = useBooks();

  const apiClient = useMemo(() => new ApiClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestSeqRef = useRef(0);

  // Keyboard shortcut: Cmd/Ctrl + K and Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
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

  // Debounced search with stale request protection
  useEffect(() => {
    const trimmed = query.trim().slice(0, 100);
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      setError(null);
      return;
    }

    const currentSeq = ++requestSeqRef.current;
    setError(null);
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ results: any[] }>(`/search?q=${encodeURIComponent(trimmed)}`);
        // If a newer request occurred, discard
        if (currentSeq !== requestSeqRef.current) return;

        if (res.data?.results && Array.isArray(res.data.results)) {
          const mapped: SearchResultItem[] = res.data.results.map((r: any) => {
            let tabTarget = 'dashboard';
            if (r.category === 'Invoice') tabTarget = 'invoices';
            else if (r.category === 'Quotation') tabTarget = 'estimates';
            else if (r.category === 'Sales Order') tabTarget = 'sales_orders';
            else if (r.category === 'Customer') tabTarget = 'clients';
            else if (r.category === 'Vendor') tabTarget = 'vendors';
            else if (r.category === 'Vendor Bill') tabTarget = 'bills';
            else if (r.category === 'Purchase Order') tabTarget = 'purchase_orders';
            else if (r.category === 'Payment Received') tabTarget = 'payments_received';
            else if (r.category === 'Payment Made') tabTarget = 'payments_made';
            else if (r.category === 'Bank Transaction') tabTarget = 'banking';
            else if (r.category === 'Account') tabTarget = 'coa';
            else if (r.category === 'Credit Note') tabTarget = 'credit_notes';
            else if (r.category === 'Vendor Credit') tabTarget = 'vendor_credits';

            return {
              id: r.id,
              category: r.category,
              title: r.title,
              subtitle: r.subtitle,
              status: r.status,
              amount: r.amount,
              date: r.date,
              tabTarget,
            };
          });
          setResults(mapped);
          setError(null);
          setLoading(false);
          setSelectedIndex(0);
        } else if (res.error) {
          setResults([]);
          setError('Failed to load search results.');
          setLoading(false);
        } else {
          setResults([]);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        // If a newer request occurred, discard
        if (currentSeq !== requestSeqRef.current) return;
        setResults([]);
        setError('Failed to load search results.');
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, apiClient]);

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: { [key: string]: SearchResultItem[] } = {};
    results.forEach((item) => {
      const cat = item.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [results]);

  const handleSelect = (item: SearchResultItem) => {
    setIsOpen(false);
    setQuery('');
    if (onNavigate) {
      onNavigate(item.tabTarget, { entityId: item.id });
    }
  };

  const handleKeyDownInList = (e: React.KeyboardEvent) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Invoice':
      case 'Quotation':
        return <FileText className="w-4 h-4 text-blue-500" />;
      case 'Customer':
      case 'Vendor':
        return <User className="w-4 h-4 text-purple-500" />;
      case 'Vendor Bill':
      case 'Purchase Order':
        return <ShoppingBag className="w-4 h-4 text-amber-500" />;
      case 'Payment Received':
      case 'Payment Made':
        return <CreditCard className="w-4 h-4 text-emerald-500" />;
      case 'Account':
        return <Layers className="w-4 h-4 text-indigo-500" />;
      default:
        return <BookOpen className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <>
      {/* Search Input Trigger in Header */}
      {isMobileTrigger ? (
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-slate-700 shadow-2xs"
          title="Search (⌘K)"
          aria-label="Search Records"
        >
          <Search className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      ) : (
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            readOnly
            onClick={() => setIsOpen(true)}
            placeholder="Search invoices, customers, bills, accounts... (⌘K)"
            className="w-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-2xl pl-9 pr-14 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 cursor-pointer hover:bg-slate-200/70 transition-colors"
          />
          <kbd className="absolute right-3 top-2 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-400 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-2xs pointer-events-none">
            ⌘K
          </kbd>
        </div>
      )}

      {/* Global Search Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh]">
            {/* Search Top Input */}
            <div className="flex items-center px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
              <Search className="w-5 h-5 text-blue-600 mr-3 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDownInList}
                placeholder="Search across all invoices, quotes, bills, customers, accounts..."
                className="w-full text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder-slate-400 bg-transparent focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer"
              >
                ESC
              </button>
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {loading && (
                <div className="p-8 text-center text-xs font-medium text-slate-400">
                  <div className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2 align-middle"></div>
                  Searching {currentOrg?.name || 'workspace'} database...
                </div>
              )}

              {error && !loading && (
                <div className="p-8 text-center text-xs text-rose-500 font-medium space-y-2">
                  <AlertCircle className="w-6 h-6 mx-auto text-rose-500" />
                  <p>{error}</p>
                </div>
              )}

              {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500">
                  No matching records found for "<span className="font-semibold text-slate-800 dark:text-slate-200">{query}</span>" in this workspace.
                </div>
              )}

              {!loading && !error && query.trim().length < 2 && (
                <div className="p-8 text-center space-y-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Search Organization Workspace
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Type an invoice #, customer name, bill amount, GSTIN, or account code to search instantly.
                  </p>
                </div>
              )}

              {!loading && !error && results.length > 0 && (
                <div className="space-y-4">
                  {(Object.entries(groupedResults) as [string, SearchResultItem[]][]).map(([category, items]) => (
                    <div key={category} className="space-y-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {category} ({items.length})
                      </div>
                      {items.map((item) => {
                        const globalIdx = results.findIndex((r) => r.id === item.id && r.category === item.category);
                        const isSelected = globalIdx === selectedIndex;

                        return (
                          <div
                            key={`${item.category}-${item.id}`}
                            onClick={() => handleSelect(item)}
                            onMouseEnter={() => setSelectedIndex(globalIdx)}
                            className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-800'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-800 dark:text-slate-200 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
                                {getCategoryIcon(item.category)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {item.title}
                                  </span>
                                  {item.status && (
                                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded">
                                      {item.status}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                  {item.subtitle}
                                </p>
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Keyboard Guide */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="px-1 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-[10px]">↑</kbd>{' '}
                  <kbd className="px-1 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-[10px]">↓</kbd> Navigate
                </span>
                <span>
                  <kbd className="px-1 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-[10px]">↵</kbd> Select
                </span>
              </div>
              <span>Organization: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{currentOrg?.name || 'Workspace'}</strong></span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
