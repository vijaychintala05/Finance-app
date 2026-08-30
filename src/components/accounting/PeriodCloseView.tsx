import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, ClipboardCheck, History, LockKeyhole, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { apiClient } from '../../api/client';

interface CloseCheck { code: string; title: string; severity: 'BLOCKING' | 'WARNING' | 'INFO'; passed: boolean; message: string; }
interface ReviewTask { code: string; title: string; completed: boolean; }
interface CloseWorkspace {
  periodKey: string; periodStart: string; periodEnd: string; status: 'OPEN' | 'IN_REVIEW' | 'READY_TO_CLOSE' | 'CLOSED' | 'REOPENED';
  checks: CloseCheck[]; canClose: boolean; blockingFailuresCount: number; warningsCount: number;
  review: { status: 'DRAFT' | 'IN_REVIEW' | 'READY_TO_CLOSE'; tasks: ReviewTask[]; note: string; updatedAt?: string } | null;
  events: Array<{ id: string; eventType: string; eventAt: string; reason: string; actorId: string }>;
}

function range(periodKey: string) {
  const [year, month] = periodKey.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { periodStart: `${periodKey}-01`, periodEnd: `${periodKey}-${String(end).padStart(2, '0')}` };
}

const statusStyle: Record<CloseWorkspace['status'], string> = {
  OPEN: 'bg-slate-100 text-slate-700', IN_REVIEW: 'bg-amber-100 text-amber-800', READY_TO_CLOSE: 'bg-emerald-100 text-emerald-800', CLOSED: 'bg-blue-100 text-blue-800', REOPENED: 'bg-rose-100 text-rose-800',
};

export const PeriodCloseView: React.FC = () => {
  const [periodKey, setPeriodKey] = useState(new Date().toISOString().slice(0, 7));
  const [workspace, setWorkspace] = useState<CloseWorkspace | null>(null);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('Reopening period to post an approved correction');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dates = useMemo(() => range(periodKey), [periodKey]);

  const refresh = async () => {
    setBusy(true);
    const response = await apiClient.get<CloseWorkspace>(`/finance/period-close/workspace?periodKey=${periodKey}&periodStart=${dates.periodStart}&periodEnd=${dates.periodEnd}`);
    setBusy(false);
    if (response.error || !response.data) { setError(response.error || 'Month-end workspace is unavailable'); return; }
    setWorkspace(response.data); setTasks(response.data.review?.tasks || []); setNote(response.data.review?.note || ''); setError('');
  };
  useEffect(() => { void refresh(); }, [periodKey]);

  const saveReview = async () => {
    setBusy(true);
    const response = await apiClient.put<CloseWorkspace>('/finance/period-close/review', { periodKey, ...dates, tasks, note });
    setBusy(false);
    if (response.error || !response.data) { setError(response.error || 'Review could not be saved'); return; }
    setWorkspace(response.data); setTasks(response.data.review?.tasks || []); setNote(response.data.review?.note || ''); setError('');
  };
  const close = async () => {
    setBusy(true); const response = await apiClient.post('/finance/period-close/close', { periodKey, ...dates }); setBusy(false);
    if (response.error) { setError(response.error); return; } await refresh();
  };
  const reopen = async () => {
    setBusy(true); const response = await apiClient.post('/finance/period-close/reopen', { periodKey, reason }); setBusy(false);
    if (response.error) { setError(response.error); return; } await refresh();
  };

  const reviewReady = workspace?.review?.status === 'READY_TO_CLOSE';
  const canClose = Boolean(workspace?.canClose && (!workspace.review || reviewReady));
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Month-End Close</h2><p className="mt-1 text-sm text-slate-500">Review financial integrity, record close evidence, then lock the period.</p></div><div className="flex items-end gap-2"><label className="text-xs font-bold text-slate-700 dark:text-slate-300">Accounting period<input type="month" value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} className="mt-1 block rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label><button type="button" onClick={() => void refresh()} disabled={busy} title="Refresh close workspace" className="rounded-md border border-slate-300 p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} /></button></div></header>
    {error && <div role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800">{error}</div>}
    {workspace && <><section className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800"><div className="bg-white p-4 dark:bg-slate-900"><div className="text-xs font-medium text-slate-500">Workflow state</div><span className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-bold ${statusStyle[workspace.status]}`}>{workspace.status.replaceAll('_', ' ')}</span></div><div className="bg-white p-4 dark:bg-slate-900"><div className="text-xs font-medium text-slate-500">Integrity blockers</div><div className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-white">{workspace.blockingFailuresCount}</div></div><div className="bg-white p-4 dark:bg-slate-900"><div className="text-xs font-medium text-slate-500">Review tasks</div><div className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-white">{tasks.filter((task) => task.completed).length}/{tasks.length || 4}</div></div><div className="bg-white p-4 dark:bg-slate-900"><div className="text-xs font-medium text-slate-500">Warnings</div><div className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-white">{workspace.warningsCount}</div></div></section>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]"><section className="border border-slate-200 dark:border-slate-800"><div className="border-b border-slate-200 p-4 dark:border-slate-800"><h3 className="font-semibold text-slate-900 dark:text-white">System Checks</h3></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{workspace.checks.map((check) => <div key={check.code} className="flex gap-3 p-4">{check.passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <CircleAlert className={`mt-0.5 h-5 w-5 shrink-0 ${check.severity === 'BLOCKING' ? 'text-rose-600' : 'text-amber-600'}`} />}<div><div className="flex items-center gap-2"><h4 className="text-sm font-semibold text-slate-900 dark:text-white">{check.title}</h4><span className="text-[10px] font-bold text-slate-400">{check.severity}</span></div><p className="mt-1 text-xs text-slate-500">{check.message}</p></div></div>)}</div></section>
      <section className="border border-slate-200 dark:border-slate-800"><div className="flex items-center gap-2 border-b border-slate-200 p-4 dark:border-slate-800"><ClipboardCheck className="h-4 w-4 text-blue-600" /><h3 className="font-semibold text-slate-900 dark:text-white">Reviewer Checklist</h3></div><div className="space-y-3 p-4">{tasks.length === 0 ? <p className="text-sm text-slate-500">Start the review to save accountable checklist evidence for this period.</p> : tasks.map((task) => <label key={task.code} className="flex cursor-pointer items-start gap-3 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={task.completed} disabled={workspace.status === 'CLOSED'} onChange={(event) => setTasks((current) => current.map((item) => item.code === task.code ? { ...item, completed: event.target.checked } : item))} className="mt-0.5 h-4 w-4 accent-blue-600" /><span>{task.title}</span></label>)}<textarea value={note} disabled={workspace.status === 'CLOSED'} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="Close review notes and exceptions" className="w-full resize-none rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900" />{workspace.status !== 'CLOSED' && <button type="button" onClick={() => void saveReview()} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Save className="h-4 w-4" />Save review</button>}</div></section></div>
      <section className="flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-5 dark:border-slate-800"><div className="max-w-xl text-xs text-slate-500">{workspace.review && !reviewReady && 'Finish every reviewer task and resolve blocking checks before close. '}{workspace.review && reviewReady && 'Reviewer checklist is ready. '}{!workspace.review && 'A checklist is optional for legacy periods, but recommended for accountable month-end close.'}</div>{workspace.status === 'CLOSED' ? <div className="flex items-end gap-2"><label className="min-w-64 text-xs font-bold text-slate-700 dark:text-slate-300">Reopen reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label><button type="button" disabled={busy || reason.trim().length < 5} onClick={() => void reopen()} className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Reopen</button></div> : <button type="button" disabled={busy || !canClose} onClick={() => void close()} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"><LockKeyhole className="h-4 w-4" />Close period</button>}</section>
      {workspace.events.length > 0 && <section className="border-t border-slate-200 pt-5 dark:border-slate-800"><div className="mb-3 flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><h3 className="text-sm font-semibold text-slate-900 dark:text-white">Close History</h3></div><div className="space-y-2">{workspace.events.map((event) => <div key={event.id} className="flex flex-wrap justify-between gap-2 border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"><span className="font-bold text-slate-700 dark:text-slate-300">{event.eventType}</span><span className="text-slate-500">{event.reason}</span><time className="text-slate-400">{new Date(event.eventAt).toLocaleString()}</time></div>)}</div></section>}
    </>}
  </main>;
};
