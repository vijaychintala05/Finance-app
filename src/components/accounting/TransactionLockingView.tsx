import React, { useState } from 'react';
import { AlertTriangle, Calendar, Lock, Plus, ShieldCheck, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatDate } from '../../utils/formatters';

export const TransactionLockingView: React.FC = () => {
  const { periodLocks, addPeriodLock } = useBooks();
  const [isOpen, setIsOpen] = useState(false);
  const [lockDate, setLockDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openModal = () => {
    setLockDate(new Date().toISOString().slice(0, 10));
    setReason('');
    setError('');
    setIsSubmitting(false);
    setIsOpen(true);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 500) {
      setError('Enter a specific lock reason between 5 and 500 characters.');
      return;
    }
    if (lockDate > new Date().toISOString().slice(0, 10)) {
      setError('A period lock cannot use a future date.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addPeriodLock({
        lockDate,
        region: 'Global',
        lockedBy: '',
        reason: normalizedReason,
      });
      setIsOpen(false);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Period lock could not be enforced.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white"><Lock className="h-5 w-5 text-amber-600" />Accounting period locks</h2>
          <p className="mt-1 text-xs text-slate-500">Prevents every certified posting workflow from writing on or before the lock date.</p>
        </div>
        <button onClick={openModal} className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"><Plus className="h-4 w-4" />Enforce period lock</button>
      </div>

      <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Locks are stored server-side with the authenticated user identity and an audit record in one transaction. Browser account-lock simulations have been removed.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/80"><tr><th className="p-3 pl-4">Locked through</th><th className="p-3">Scope</th><th className="p-3">Reason</th><th className="p-3">Server actor</th><th className="p-3 pr-4">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {periodLocks.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center text-sm text-slate-500">No active accounting period locks.</td></tr>
            ) : periodLocks.map((lock) => (
              <tr key={lock.id}>
                <td className="p-3 pl-4 font-mono font-bold text-amber-700">{formatDate(lock.lockDate)}</td>
                <td className="p-3 text-slate-600 dark:text-slate-300">{lock.region || 'Global'}</td>
                <td className="max-w-md p-3 text-slate-700 dark:text-slate-200">{lock.reason}</td>
                <td className="p-3 font-mono text-slate-500">{lock.lockedBy || 'Server identity'}</td>
                <td className="p-3 pr-4"><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-bold text-amber-800">{lock.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => !isSubmitting && setIsOpen(false)}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><Calendar className="h-5 w-5 text-amber-600" />Enforce global period lock</h3><p className="mt-1 text-xs text-slate-500">This operation is additive and cannot be undone from the browser.</p></div><button type="button" onClick={() => setIsOpen(false)} disabled={isSubmitting} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
            <form onSubmit={handleCreate} className="space-y-4 p-5">
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>All posting dates on or before the selected date will be rejected. Reopening requires a separately authorized and audited server workflow.</p></div>
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Lock transactions on or before</span><input required type="date" max={new Date().toISOString().slice(0, 10)} value={lockDate} onChange={(event) => setLockDate(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Specific reason</span><textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Approved close, tax filing, or audit sign-off reference" className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><button type="button" onClick={() => setIsOpen(false)} disabled={isSubmitting} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancel</button><button type="submit" disabled={isSubmitting} className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">{isSubmitting ? 'Enforcing…' : 'Enforce lock'}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
