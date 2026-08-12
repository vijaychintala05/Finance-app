import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, FileBarChart2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { DashboardQuickActions } from './widgets/DashboardQuickActions';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { ExpenseModal } from '../expenses/ExpenseModal';
import { ClientModal } from '../clients/ClientModal';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab, options?: { autoCreate?: boolean }) => void;
  onOpenQuickCreate?: () => void;
  onSelectProject?: (projectId: string) => void;
}

interface DashboardSummary {
  receivables: number;
  payables: number;
  bankBalance: number;
  salesThisMonth: number;
  outstandingInvoicesCount: number;
  overdueInvoicesCount: number;
  upcomingBillsCount: number;
  bankReconciliationAttentionCount: number;
  quotationsAwaitingResponseCount: number;
  recentTransactions: Array<{ type: string; documentNumber: string; partyName: string; amount: number; status: string; date: string }>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { settings } = useBooks();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [isInvoiceEditorOpen, setIsInvoiceEditorOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient.get<{ summary: DashboardSummary }>('/dashboard-summary')
      .then((response) => {
        if (cancelled) return;
        if (response.error || !response.data?.summary) throw new Error(response.error || 'Dashboard returned no data');
        setSummary(response.data.summary);
      })
      .catch((dashboardError) => {
        if (!cancelled) {
          setSummary(null);
          setError(dashboardError instanceof Error ? dashboardError.message : 'Dashboard unavailable');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const cards = summary ? [
    { label: 'Receivables', value: summary.receivables, detail: `${summary.outstandingInvoicesCount} open · ${summary.overdueInvoicesCount} overdue`, tab: 'invoices' as NavigationTab },
    { label: 'Payables', value: summary.payables, detail: `${summary.upcomingBillsCount} open vendor bills`, tab: 'bills' as NavigationTab },
    { label: 'Cash and bank', value: summary.bankBalance, detail: 'Posted bank/cash journal balance', tab: 'banking' as NavigationTab },
    { label: 'Revenue this month', value: summary.salesThisMonth, detail: 'Posted income journal lines', tab: 'reports' as NavigationTab },
  ] : [];

  return (
    <div className="mx-auto min-h-full max-w-[1400px] space-y-5 bg-slate-50 p-3 font-sans text-slate-900 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black"><ShieldCheck className="h-6 w-6 text-emerald-600" />Authoritative financial snapshot</h1>
          <p className="mt-1 text-xs text-slate-500">Tenant-scoped PostgreSQL totals; posted journals are the source for cash and revenue.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => onNavigate('reports')} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold dark:border-slate-800 dark:bg-slate-900"><FileBarChart2 className="h-4 w-4" />Verified reports</button>
          <button onClick={() => setReloadToken((value) => value + 1)} disabled={loading} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-20 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900"><Loader2 className="h-5 w-5 animate-spin" />Reading authoritative totals…</div>}
      {!loading && error && <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}. Financial cards are hidden because stale or browser-derived values are not allowed.</span></div>}

      {!loading && summary && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => <button key={card.label} onClick={() => onNavigate(card.tab)} className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-2xs transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400"><span>{card.label}</span><ArrowUpRight className="h-4 w-4 group-hover:text-blue-600" /></div><div className="mt-3 font-mono text-2xl font-black">{formatCurrency(card.value, settings.currencySymbol)}</div><p className="mt-1 text-[11px] text-slate-500">{card.detail}</p></button>)}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800"><div><h2 className="font-bold">Recent financial documents</h2><p className="text-xs text-slate-500">Latest persisted invoices and bills</p></div><button onClick={() => onNavigate('reports')} className="cursor-pointer text-xs font-bold text-blue-600 hover:underline">Open ledger reports</button></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800/60"><tr><th className="p-3">Date</th><th className="p-3">Type / number</th><th className="p-3">Party</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{summary.recentTransactions.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400">No financial documents recorded.</td></tr> : summary.recentTransactions.map((row) => <tr key={`${row.type}-${row.documentNumber}`}><td className="p-3">{formatDate(row.date)}</td><td className="p-3 font-mono font-bold">{row.type} · {row.documentNumber}</td><td className="p-3">{row.partyName}</td><td className="p-3 text-right font-mono font-bold">{formatCurrency(row.amount, settings.currencySymbol)}</td><td className="p-3 text-right"><span className={`rounded-lg border px-2 py-1 text-[10px] font-bold uppercase ${getStatusBadgeStyle(row.status)}`}>{row.status}</span></td></tr>)}</tbody></table></div>
          </div>
          <DashboardQuickActions onOpenInvoiceEditor={() => setIsInvoiceEditorOpen(true)} onOpenExpenseModal={() => setIsExpenseModalOpen(true)} onOpenClientModal={() => setIsClientModalOpen(true)} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">Bank items requiring reconciliation: <strong>{summary.bankReconciliationAttentionCount}</strong> · Quotations awaiting response: <strong>{summary.quotationsAwaitingResponseCount}</strong>. Forecasts, tax estimates, project margins, and synthetic cash-flow charts remain disabled.</div>
      </>}

      {isInvoiceEditorOpen && <InvoiceEditorModal isOpen onClose={() => setIsInvoiceEditorOpen(false)} />}
      {isExpenseModalOpen && <ExpenseModal isOpen onClose={() => setIsExpenseModalOpen(false)} />}
      {isClientModalOpen && <ClientModal isOpen onClose={() => setIsClientModalOpen(false)} />}
    </div>
  );
};
