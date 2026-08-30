import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, FileCheck2, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency } from '../../utils/formatters';

interface GSTSummary {
  periodKey: string;
  outward: { documentCount: number; taxableValue: number; taxAmount: number; missingGstinCount: number };
  inward: { documentCount: number; taxableValue: number; taxAmount: number; missingGstinCount: number };
  netTaxPosition: number;
  integrity: { isBalanced: boolean; difference: number };
  readiness: Array<{ code: string; passed: boolean; message: string }>;
}

export const GSTComplianceView: React.FC = () => {
  const { settings } = useBooks();
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<GSTSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => { setLoading(true); const response = await apiClient.get<{ summary: GSTSummary }>(`/finance/gst/return-summary?period=${encodeURIComponent(period)}`); setLoading(false); if (response.error || !response.data?.summary) { setError(response.error || 'GST evidence is unavailable'); setSummary(null); } else { setError(''); setSummary(response.data.summary); } };
  useEffect(() => { void load(); }, [period]);
  const money = (amount: number) => formatCurrency(amount, settings.currencySymbol);
  return <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6"><header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">India GST - Andhra Pradesh</p><h1 className="mt-1 text-xl font-bold">GST return evidence</h1><p className="mt-1 text-xs text-slate-500">Posted document evidence and control-account reconciliation. Filing is not enabled.</p></div><div className="flex gap-2"><label className="text-xs font-semibold">Return period<input aria-label="GST return period" type="month" value={period} onChange={event => setPeriod(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white p-2 text-sm dark:border-slate-700 dark:bg-slate-900" /></label><button title="Refresh GST evidence" onClick={() => void load()} disabled={loading} className="rounded-md border border-slate-300 p-2 disabled:opacity-50 dark:border-slate-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></header>{error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}{summary && <><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><div className="rounded-lg border p-4"><p className="text-xs text-slate-500">Output GST</p><strong className="mt-1 block font-financial text-xl">{money(summary.outward.taxAmount)}</strong><p className="mt-1 text-xs text-slate-500">{summary.outward.documentCount} posted outward documents</p></div><div className="rounded-lg border p-4"><p className="text-xs text-slate-500">Input GST</p><strong className="mt-1 block font-financial text-xl">{money(summary.inward.taxAmount)}</strong><p className="mt-1 text-xs text-slate-500">{summary.inward.documentCount} posted inward documents</p></div><div className="rounded-lg border p-4"><p className="text-xs text-slate-500">Net tax position</p><strong className="mt-1 block font-financial text-xl">{money(summary.netTaxPosition)}</strong><p className="mt-1 text-xs text-slate-500">Output less input tax</p></div><div className="rounded-lg border p-4"><p className="text-xs text-slate-500">GST control check</p><strong className="mt-1 block text-xl">{summary.integrity.isBalanced ? 'Balanced' : 'Mismatch'}</strong><p className="mt-1 text-xs text-slate-500">Difference: {money(summary.integrity.difference)}</p></div></section><section className="rounded-lg border"><div className="border-b p-4"><h2 className="text-sm font-bold">Preparation checks</h2></div><div className="divide-y">{summary.readiness.map(check => <div key={check.code} className="flex gap-3 p-4">{check.passed ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <CircleAlert className="h-5 w-5 shrink-0 text-amber-600" />}<p className="text-sm">{check.message}</p></div>)}</div></section><div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900"><ShieldCheck className="h-5 w-5 shrink-0" /><p>Use this workspace to resolve evidence gaps before preparing GSTR-1 or GSTR-3B. IRN, e-way bill, portal submission, and tax payment require separately configured, authenticated integrations.</p></div></>}</div>;
};
