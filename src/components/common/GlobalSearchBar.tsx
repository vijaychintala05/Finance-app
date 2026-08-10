import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, FileText, User, ShoppingBag, CreditCard, ArrowRight, X, Layers, BookOpen } from 'lucide-react';
import { ApiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';

export interface SearchResultItem {
  id: string;
  category: 'Invoice' | 'Quotation' | 'Sales Order' | 'Customer' | 'Vendor' | 'Vendor Bill' | 'Purchase Order' | 'Payment Received' | 'Payment Made' | 'Bank Transaction' | 'Account';
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
  date?: string;
  tabTarget: string;
}

interface GlobalSearchBarProps {
  onNavigate?: (tab: string, options?: { entityId?: string }) => void;
}

export const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    invoices,
    estimates,
    salesOrders,
    clients,
    vendors,
    bills,
    purchaseOrders,
    paymentsReceived,
    paymentsMade,
    bankTransactions,
    accounts,
    currentOrg,
  } = useBooks();

  const apiClient = useMemo(() => new ApiClient(), []);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const q = query.trim().toLowerCase();
      const numQ = Number(query.replace(/[^0-9.]/g, '')) || -999999;

      try {
        // Try backend search first
        const res = await apiClient.get<{ results: any[] }>(`/search?q=${encodeURIComponent(query)}`);
        if (res.data?.results && res.data.results.length > 0) {
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
          setLoading(false);
          return;
        }
      } catch {
        // Fallback to local memory search
      }

      // Local In-Memory Search
      const localResults: SearchResultItem[] = [];

      // 1. Invoices
      invoices.forEach((inv) => {
        if (
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.clientName.toLowerCase().includes(q) ||
          inv.total === numQ
        ) {
          localResults.push({
            id: inv.id,
            category: 'Invoice',
            title: inv.invoiceNumber,
            subtitle: `${inv.clientName} • ₹${inv.total.toLocaleString('en-IN')}`,
            status: inv.status,
            amount: inv.total,
            date: inv.date,
            tabTarget: 'invoices',
          });
        }
      });

      // 2. Estimates / Quotes
      estimates.forEach((est) => {
        if (
          est.estimateNumber.toLowerCase().includes(q) ||
          est.clientName.toLowerCase().includes(q) ||
          est.amount === numQ
        ) {
          localResults.push({
            id: est.id,
            category: 'Quotation',
            title: est.estimateNumber,
            subtitle: `${est.clientName} • ₹${est.amount.toLocaleString('en-IN')}`,
            status: est.status,
            amount: est.amount,
            date: est.date,
            tabTarget: 'estimates',
          });
        }
      });

      // 3. Sales Orders
      salesOrders.forEach((so) => {
        if (
          so.orderNumber.toLowerCase().includes(q) ||
          so.clientName.toLowerCase().includes(q) ||
          so.total === numQ
        ) {
          localResults.push({
            id: so.id,
            category: 'Sales Order',
            title: so.orderNumber,
            subtitle: `${so.clientName} • ₹${so.total.toLocaleString('en-IN')}`,
            status: so.status,
            amount: so.total,
            date: so.date,
            tabTarget: 'sales_orders',
          });
        }
      });

      // 4. Clients / Customers
      clients.forEach((c) => {
        if (
          c.name.toLowerCase().includes(q) ||
          c.companyName.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
        ) {
          localResults.push({
            id: c.id,
            category: 'Customer',
            title: c.name,
            subtitle: `${c.companyName || c.email || 'Customer'}`,
            tabTarget: 'clients',
          });
        }
      });

      // 5. Vendors
      vendors.forEach((v) => {
        if (
          v.name.toLowerCase().includes(q) ||
          v.companyName.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q)
        ) {
          localResults.push({
            id: v.id,
            category: 'Vendor',
            title: v.name,
            subtitle: `${v.companyName || v.email || 'Vendor'}`,
            tabTarget: 'vendors',
          });
        }
      });

      // 6. Bills
      bills.forEach((b) => {
        if (
          b.billNumber.toLowerCase().includes(q) ||
          b.vendorName.toLowerCase().includes(q) ||
          b.total === numQ
        ) {
          localResults.push({
            id: b.id,
            category: 'Vendor Bill',
            title: b.billNumber,
            subtitle: `${b.vendorName} • ₹${b.total.toLocaleString('en-IN')}`,
            status: b.status,
            amount: b.total,
            date: b.billDate,
            tabTarget: 'bills',
          });
        }
      });

      // 7. Purchase Orders
      purchaseOrders.forEach((po) => {
        if (
          po.poNumber.toLowerCase().includes(q) ||
          po.vendorName.toLowerCase().includes(q) ||
          po.total === numQ
        ) {
          localResults.push({
            id: po.id,
            category: 'Purchase Order',
            title: po.poNumber,
            subtitle: `${po.vendorName} • ₹${po.total.toLocaleString('en-IN')}`,
            status: po.status,
            amount: po.total,
            date: po.date,
            tabTarget: 'purchase_orders',
          });
        }
      });

      // 8. Payments Received
      paymentsReceived.forEach((p) => {
        if (
          p.paymentNumber.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          p.referenceNumber.toLowerCase().includes(q) ||
          p.amount === numQ
        ) {
          localResults.push({
            id: p.id,
            category: 'Payment Received',
            title: p.paymentNumber,
            subtitle: `${p.clientName} • ₹${p.amount.toLocaleString('en-IN')}`,
            amount: p.amount,
            date: p.date,
            tabTarget: 'payments_received',
          });
        }
      });

      // 9. Accounts (COA)
      accounts.forEach((acc) => {
        if (
          acc.code.toLowerCase().includes(q) ||
          acc.name.toLowerCase().includes(q) ||
          acc.category.toLowerCase().includes(q)
        ) {
          localResults.push({
            id: acc.id,
            category: 'Account',
            title: `${acc.code} - ${acc.name}`,
            subtitle: `${acc.category} • Balance: ₹${acc.balance.toLocaleString('en-IN')}`,
            amount: acc.balance,
            tabTarget: 'coa',
          });
        }
      });

      setResults(localResults.slice(0, 30));
      setSelectedIndex(0);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    query,
    apiClient,
    invoices,
    estimates,
    salesOrders,
    clients,
    vendors,
    bills,
    purchaseOrders,
    paymentsReceived,
    accounts,
  ]);

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
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="px-2 py-1 text-xs font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                ESC
              </button>
            </div>

            {/* Results Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {loading && (
                <div className="p-8 text-center text-xs font-medium text-slate-400">
                  <div className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2 align-middle"></div>
                  Searching {currentOrg.name} database...
                </div>
              )}

              {!loading && query && results.length === 0 && (
                <div className="p-8 text-center text-xs text-slate-500">
                  No matching records found for "<span className="font-semibold text-slate-800 dark:text-slate-200">{query}</span>" in this workspace.
                </div>
              )}

              {!loading && !query && (
                <div className="p-8 text-center space-y-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Search Organization Workspace
                  </div>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    Type an invoice #, customer name, bill amount, GSTIN, or account code to search instantly.
                  </p>
                </div>
              )}

              {!loading && results.length > 0 && (
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
              <span>Organization: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{currentOrg.name}</strong></span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

