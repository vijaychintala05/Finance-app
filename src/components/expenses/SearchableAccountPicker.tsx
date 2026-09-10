import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Account } from '../../types';

export interface SearchableAccountPickerProps {
  accounts: Account[];
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (accountId: string) => void;
  size?: 'default' | 'compact';
  ariaLabel?: string;
  disabled?: boolean;
}

interface ScoredAccount {
  account: Account;
  score: number;
}

/**
 * Highlights matches of query within text
 */
const HighlightMatch: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query) return <>{text}</>;
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;

  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) return <>{text}</>;

  const before = text.slice(0, index);
  const match = text.slice(index, index + trimmed.length);
  const after = text.slice(index + trimmed.length);

  return (
    <>
      {before}
      <mark className="rounded-xs bg-amber-200/80 px-0.5 font-semibold text-amber-950 dark:bg-amber-500/30 dark:text-amber-200">
        {match}
      </mark>
      {after}
    </>
  );
};

export const SearchableAccountPicker: React.FC<SearchableAccountPickerProps> = ({
  accounts,
  id,
  label,
  placeholder,
  value,
  onChange,
  size = 'default',
  ariaLabel,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedAccount = accounts.find((account) => account.id === value);

  // Smart filtering: search strictly on account name and code (excluding generic type/subType)
  // and rank by relevance.
  const matchingAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;

    const scored: ScoredAccount[] = [];

    for (const account of accounts) {
      const code = (account.code || '').toLowerCase();
      const name = (account.name || '').toLowerCase();

      let score = 0;

      if (code === q) {
        score = 100;
      } else if (name === q) {
        score = 90;
      } else if (name.startsWith(q)) {
        score = 80;
      } else if (code.startsWith(q)) {
        score = 70;
      } else {
        // Check if any word starts with query
        const words = name.split(/\s+/);
        if (words.some((word) => word.startsWith(q))) {
          score = 60;
        } else if (name.includes(q)) {
          score = 50;
        } else if (code.includes(q)) {
          score = 40;
        }
      }

      if (score > 0) {
        scored.push({ account, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score || a.account.name.localeCompare(b.account.name))
      .map((item) => item.account);
  }, [accounts, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const chooseAccount = (accountId: string) => {
    onChange(accountId);
    close();
  };

  const selectedLabel = selectedAccount
    ? `${selectedAccount.code} - ${selectedAccount.name}`
    : placeholder;

  const isCompact = size === 'compact';

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel || `${label}: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        onClick={() => !disabled && setIsOpen((open) => !open)}
        className={`flex w-full items-center justify-between gap-2 rounded-md border text-left font-normal outline-hidden transition ${
          isCompact ? 'h-9 px-2.5 text-xs' : 'h-11 px-3 text-sm'
        } ${
          disabled
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-600'
            : 'border-slate-300 bg-white text-slate-900 hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* Search symbol on the category trigger */}
          <Search
            data-testid={`${id}-search-icon`}
            className={`shrink-0 text-slate-400 dark:text-slate-500 ${
              isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'
            }`}
          />
          <span
            className={`truncate ${
              selectedAccount ? 'font-medium' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {selectedLabel}
          </span>
        </div>
        <ChevronDown
          className={`shrink-0 text-slate-400 transition-transform ${
            isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'
          } ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 z-50 mt-1.5 w-full min-w-[260px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
            isCompact ? 'max-w-md' : ''
          }`}
        >
          {/* Dropdown search bar with clear symbol */}
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') close();
                }}
                placeholder="Search category by name or code..."
                className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs text-slate-900 outline-hidden placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-950"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between px-0.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span>{matchingAccounts.length} categories found</span>
              <span>Search by name or code</span>
            </div>
          </div>

          {/* Options list */}
          <div
            id={`${id}-options`}
            role="listbox"
            aria-label={`${label} options`}
            className="max-h-60 overflow-y-auto p-1 text-xs"
          >
            {matchingAccounts.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                <Search className="mx-auto mb-1.5 h-5 w-5 text-slate-300 dark:text-slate-600" />
                No expense categories match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              matchingAccounts.map((account) => {
                const isSelected = account.id === value;
                return (
                  <button
                    key={account.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-label={`${account.code} - ${account.name} (${account.type}, ${account.subType})`}
                    onClick={() => chooseAccount(account.id)}
                    className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                        : 'text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      <Check className={`h-2.5 w-2.5 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900 dark:text-white">
                        <HighlightMatch text={account.code} query={query} />
                        {' - '}
                        <HighlightMatch text={account.name} query={query} />
                      </span>
                      <span className="block truncate text-[10px] text-slate-400 dark:text-slate-500">
                        {account.type}
                        {account.subType ? ` / ${account.subType}` : ''}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
