import React, { useMemo, useState } from 'react';

interface Props {
  accounts: Array<{ id?: string; name: string; balance: number }>;
  total: number;
  asOfDate: string;
  money: (amount: number) => string;
  unmatchedCount: number | null;
  onAccounts: () => void;
  onReconcile: () => void;
}

export function CashBalanceWidget({ accounts, total, asOfDate, money, unmatchedCount, onAccounts, onReconcile }: Props) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => accounts.filter(a => a.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name)), [accounts, search]);
  const rows = showAll || search ? filtered : filtered.slice(0, 5);
  const negativeCount = accounts.filter(a => a.balance < 0).length;
  const button = 'min-h-11 rounded-md px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 dark:text-blue-300 dark:hover:bg-slate-800';
  return <section aria-label="Cash and bank balances" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-900 dark:text-white">Cash &amp; bank balances</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">Posted ledger balances · As of {asOfDate}</p></div>
      <button className={button} onClick={onAccounts}>View bank accounts →</button>
    </div>
    <p className="mt-4 break-words font-financial text-3xl font-bold text-slate-900 dark:text-white">{money(total)}</p>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Book balance, not bank-confirmed available funds.</p>
    <div className="my-4 flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 py-2 dark:border-slate-700">
      <p className="text-sm text-slate-700 dark:text-slate-200">{negativeCount > 0 ? `${negativeCount} account${negativeCount === 1 ? '' : 's'} with a negative balance` : `${accounts.length} accounts with posted activity`}</p>
      {unmatchedCount !== null && <button className={button} onClick={onReconcile}>{unmatchedCount > 0 ? `Review ${unmatchedCount} unmatched statement items →` : 'Review reconciliation →'}</button>}
    </div>
    {accounts.length > 5 && <label className="mb-3 block text-sm font-medium text-slate-700 dark:text-slate-200">Find an account
      <input value={search} onChange={event => setSearch(event.target.value)} type="search" className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-transparent px-3 dark:border-slate-600" />
    </label>}
    {accounts.length === 0 ? <p className="py-4 text-slate-600 dark:text-slate-300">No posted cash or bank balances for this date.</p> : <>
      <div className="flex justify-between gap-4 pb-2 text-sm text-slate-600 dark:text-slate-300"><span>Account · lowest balance first</span><span>Book balance</span></div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((account, index) => <li key={account.id || `${account.name}-${index}`} className="flex items-start justify-between gap-4 py-3">
        <span className="min-w-0 break-words text-slate-900 dark:text-slate-100">{account.name}{account.balance < 0 && <span className="block text-sm text-red-700 dark:text-red-300">Negative balance</span>}</span>
        <span className="shrink-0 font-financial tabular-nums text-slate-900 dark:text-slate-100">{money(account.balance)}</span>
      </li>)}</ul>
      {filtered.length === 0 && <p role="status" className="py-4 text-slate-600 dark:text-slate-300">No accounts match your search.</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 dark:text-slate-300"><span>Showing {rows.length} of {filtered.length} accounts{search ? ' matching your search; total above includes all accounts' : ''}</span>
        {!search && accounts.length > 5 && <button className={button} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer accounts' : `Show all ${accounts.length} accounts`}</button>}
      </div>
    </>}
  </section>;
}
