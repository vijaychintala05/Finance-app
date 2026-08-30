import React, { useMemo, useState } from 'react';
import { Download, Plus, Send, Trash2 } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';

interface BulkRow {
  id: string;
  date: string;
  reference: string;
  narration: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const newRow = (): BulkRow => ({ id: crypto.randomUUID(), date: today(), reference: '', narration: '', debitAccountId: '', creditAccountId: '', amount: '' });

export const BulkUpdatesView: React.FC = () => {
  const { accounts } = useBooks();
  const [rows, setRows] = useState<BulkRow[]>([newRow(), newRow(), newRow()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const activeAccounts = useMemo(() => accounts.filter((account) => account.status === 'Active' && !account.isLocked), [accounts]);
  const validRows = rows.filter((row) => row.date && row.debitAccountId && row.creditAccountId && Number(row.amount) > 0 && row.debitAccountId !== row.creditAccountId);
  const total = validRows.reduce((sum, row) => sum + Number(row.amount), 0);

  const update = (id: string, patch: Partial<BulkRow>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const downloadTemplate = () => {
    const csv = 'date,reference,narration,debit_account,credit_account,amount\n2026-08-25,ADJ-001,Monthly adjustment,Office Supplies,Bank,1500.00\n';
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); anchor.download = 'bulk-journal-template.csv'; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  const submit = async () => {
    if (validRows.length !== rows.length) { setMessage('Complete every row with a date, two different accounts, and a positive amount.'); return; }
    setBusy(true); setMessage('');
    const response = await apiClient.post<{ count: number }>('/finance/journals/bulk', {
      entries: rows.map((row) => ({ date: row.date, reference: row.reference || undefined, narration: row.narration || 'Bulk journal entry', lines: [
        { accountId: row.debitAccountId, debit: Number(row.amount), credit: 0, description: row.narration },
        { accountId: row.creditAccountId, debit: 0, credit: Number(row.amount), description: row.narration },
      ] })),
    });
    setBusy(false);
    if (response.error) { setMessage(response.error); return; }
    setMessage(`${response.data?.count || rows.length} journal entries posted atomically.`); setRows([newRow(), newRow(), newRow()]);
  };

  return <section className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
      <div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Bulk Journal Entry</h2><p className="mt-1 text-sm text-slate-500">Enter simple two-account adjustments quickly. The entire batch posts together or not at all.</p></div>
      <button type="button" onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><Download className="h-4 w-4" />CSV template</button>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-xs dark:bg-slate-900"><div className="flex gap-5"><span className="font-semibold text-slate-700 dark:text-slate-300">{rows.length} entries</span><span className="font-mono text-slate-500">Total {total.toFixed(2)}</span></div><span className="text-slate-500">Posted journals remain immutable; use a reversal for corrections.</span></div>
    {message && <div role="status" className={`border p-3 text-sm font-medium ${message.includes('posted') ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{message}</div>}
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800"><table className="min-w-[1040px] w-full text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Narration</th><th className="px-3 py-3">Debit account</th><th className="px-3 py-3">Credit account</th><th className="px-3 py-3 text-right">Amount</th><th className="w-12 px-2 py-3" /></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((row) => <tr key={row.id} className="bg-white dark:bg-slate-950"><td className="p-2"><input aria-label="Journal date" type="date" value={row.date} onChange={(event) => update(row.id, { date: event.target.value })} className="w-32 border-0 bg-transparent p-1.5 text-xs outline-none ring-1 ring-transparent focus:ring-blue-500 dark:text-white" /></td><td className="p-2"><input aria-label="Reference" value={row.reference} onChange={(event) => update(row.id, { reference: event.target.value })} placeholder="Optional" className="w-28 border-0 bg-transparent p-1.5 outline-none ring-1 ring-transparent focus:ring-blue-500 dark:text-white" /></td><td className="p-2"><input aria-label="Narration" value={row.narration} onChange={(event) => update(row.id, { narration: event.target.value })} placeholder="What changed?" className="w-52 border-0 bg-transparent p-1.5 outline-none ring-1 ring-transparent focus:ring-blue-500 dark:text-white" /></td><td className="p-2"><select aria-label="Debit account" value={row.debitAccountId} onChange={(event) => update(row.id, { debitAccountId: event.target.value })} className="w-48 border-0 bg-transparent p-1.5 outline-none ring-1 ring-transparent focus:ring-blue-500 dark:text-white"><option value="">Select account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></td><td className="p-2"><select aria-label="Credit account" value={row.creditAccountId} onChange={(event) => update(row.id, { creditAccountId: event.target.value })} className="w-48 border-0 bg-transparent p-1.5 outline-none ring-1 ring-transparent focus:ring-blue-500 dark:text-white"><option value="">Select account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></td><td className="p-2"><input aria-label="Amount" inputMode="decimal" value={row.amount} onChange={(event) => update(row.id, { amount: event.target.value })} placeholder="0.00" className="w-24 border-0 bg-transparent p-1.5 text-right font-mono outline-none ring-1 ring-transparent focus:ring-blue-500 dark:text-white" /></td><td className="p-2 text-center"><button type="button" title="Remove entry" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800"><button type="button" onClick={() => setRows((current) => [...current, newRow()])} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"><Plus className="h-4 w-4" />Add entry</button><button type="button" disabled={busy || rows.length === 0} onClick={() => void submit()} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" />{busy ? 'Posting batch...' : `Post ${rows.length} entries`}</button></footer>
  </section>;
};
