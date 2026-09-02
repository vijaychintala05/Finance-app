import React, { useMemo, useState } from 'react';
import { Download, Plus, Send, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';
import { createBrowserId } from '../../utils/browserIds';

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
const newRow = (): BulkRow => ({
  id: createBrowserId('bulk'),
  date: today(),
  reference: '',
  narration: '',
  debitAccountId: '',
  creditAccountId: '',
  amount: '',
});

export const BulkUpdatesView: React.FC = () => {
  const { accounts = [] } = useBooks();
  const [rows, setRows] = useState<BulkRow[]>([newRow(), newRow(), newRow()]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const activeAccounts = useMemo(
    () => (accounts || []).filter((account) => account.status === 'Active' && !account.isLocked),
    [accounts]
  );

  const validRows = rows.filter(
    (row) =>
      row.date &&
      row.debitAccountId &&
      row.creditAccountId &&
      Number(row.amount) > 0 &&
      row.debitAccountId !== row.creditAccountId
  );

  const total = validRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  const update = (id: string, patch: Partial<BulkRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const downloadTemplate = () => {
    const csv =
      'date,reference,narration,debit_account,credit_account,amount\n2026-08-25,ADJ-001,Monthly adjustment,Office Supplies,Bank,1500.00\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bulk-journal-template.csv';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const submit = async () => {
    if (validRows.length !== rows.length) {
      setMessageType('error');
      setMessage('Complete every row with a date, two different accounts, and a positive amount.');
      return;
    }

    setBusy(true);
    setMessage('');
    setMessageType('');

    try {
      const response = await apiClient.post<{ count: number; created?: any[] }>('/finance/journals/bulk', {
        entries: rows.map((row) => ({
          date: row.date,
          reference: row.reference || undefined,
          narration: row.narration || 'Bulk journal entry',
          lines: [
            { accountId: row.debitAccountId, debit: Number(row.amount), credit: 0, description: row.narration },
            { accountId: row.creditAccountId, debit: 0, credit: Number(row.amount), description: row.narration },
          ],
        })),
      });

      setBusy(false);

      if (response.error) {
        setMessageType('error');
        setMessage(response.error);
        return;
      }

      setMessageType('success');
      setMessage(`${response.data?.count || rows.length} journal entries posted atomically.`);
      setRows([newRow(), newRow(), newRow()]);
    } catch (err: any) {
      setBusy(false);
      setMessageType('error');
      setMessage(err?.message || 'An unexpected error occurred while posting the batch.');
    }
  };

  return (
    <section className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Bulk Journal Entry</h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Enter simple two-account adjustments quickly. The entire batch posts together atomically.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors shadow-xs cursor-pointer"
        >
          <Download className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span>CSV Template</span>
        </button>
      </header>

      {/* Summary Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 px-4 py-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
          </span>
          <span className="font-mono text-slate-600 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px]">
            Total: {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            ({validRows.length} of {rows.length} valid)
          </span>
        </div>
        <span className="text-slate-500 dark:text-slate-400 text-[11px]">
          Posted journals remain immutable; use reversals for adjustments.
        </span>
      </div>

      {/* Feedback Banner */}
      {message && (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-medium transition-all ${
            messageType === 'success'
              ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50/80 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300'
          }`}
        >
          {messageType === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          )}
          <span>{message}</span>
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <table className="min-w-[960px] w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
              <th className="px-3 py-3 w-36">Date</th>
              <th className="px-3 py-3 w-32">Reference</th>
              <th className="px-3 py-3 w-48">Narration</th>
              <th className="px-3 py-3">Debit Account</th>
              <th className="px-3 py-3">Credit Account</th>
              <th className="px-3 py-3 text-right w-32">Amount</th>
              <th className="w-12 px-2 py-3 text-center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row, index) => {
              const isDebitSameAsCredit =
                row.debitAccountId && row.creditAccountId && row.debitAccountId === row.creditAccountId;
              return (
                <tr
                  key={row.id}
                  className="bg-white hover:bg-slate-50/50 dark:bg-slate-900 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-2">
                    <input
                      aria-label={`Journal date ${index + 1}`}
                      type="date"
                      value={row.date}
                      onChange={(event) => update(row.id, { date: event.target.value })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      aria-label={`Reference ${index + 1}`}
                      value={row.reference}
                      onChange={(event) => update(row.id, { reference: event.target.value })}
                      placeholder="Optional"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      aria-label={`Narration ${index + 1}`}
                      value={row.narration}
                      onChange={(event) => update(row.id, { narration: event.target.value })}
                      placeholder="e.g. Monthly adjustment"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      aria-label={`Debit account ${index + 1}`}
                      value={row.debitAccountId}
                      onChange={(event) => update(row.id, { debitAccountId: event.target.value })}
                      className={`w-full rounded-lg border bg-slate-50/60 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-1 ${
                        isDebitSameAsCredit
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                          : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                    >
                      <option value="">Select Debit Account</option>
                      {activeAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <select
                      aria-label={`Credit account ${index + 1}`}
                      value={row.creditAccountId}
                      onChange={(event) => update(row.id, { creditAccountId: event.target.value })}
                      className={`w-full rounded-lg border bg-slate-50/60 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-1 ${
                        isDebitSameAsCredit
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                          : 'border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                    >
                      <option value="">Select Credit Account</option>
                      {activeAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <input
                      aria-label={`Amount ${index + 1}`}
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(event) => update(row.id, { amount: event.target.value })}
                      placeholder="0.00"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800 px-2 py-1.5 text-right font-mono text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      title="Remove entry"
                      disabled={rows.length === 1}
                      onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
                      className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Controls */}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setRows((current) => [...current, newRow()])}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <span>Add Row</span>
        </button>

        <button
          type="button"
          disabled={busy || rows.length === 0}
          onClick={() => void submit()}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {busy ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Posting Batch...</span>
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              <span>Post {rows.length} {rows.length === 1 ? 'Entry' : 'Entries'}</span>
            </>
          )}
        </button>
      </footer>
    </section>
  );
};
