import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, FileBarChart2, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { NavigationTab } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { apiClient } from '../../api/client';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { DashboardQuickActions } from './widgets/DashboardQuickActions';
import { InvoiceEditorModal } from '../invoices/InvoiceEditorModal';
import { ExpenseModal } from '../expenses/ExpenseModal';
import { ClientModal } from '../clients/ClientModal';
import { MetricCardSkeleton, TableSkeleton } from '../common/TableSkeleton';
import { EmptyStateCard } from '../common/EmptyStateCard';

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
    <div className="mx-auto min-h-full max-w-[1400px] space-y-6 bg-slate-50 p-3 font-sans text-slate-900 sm:p-6 lg:p-8 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight"><ShieldCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />Authoritative financial snapshot</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tenant-scoped PostgreSQL totals; posted journals are the source for cash and revenue.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => onNavigate('reports')} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold shadow-2xs hover:bg-slate-50 active:scale-98 transition-all dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-850"><FileBarChart2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />Verified reports</button>
          <button onClick={() => setReloadToken((value) => value + 1)} disabled={loading} className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold shadow-2xs hover:bg-slate-50 active:scale-98 transition-all disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-850"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />Refresh</button>
        </div>
      </div>

      {loading && (
        <div className="space-y-6">
          <MetricCardSkeleton count={4} />
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TableSkeleton rows={5} columns={5} />
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xs animate-pulse h-64" />
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-5 text-sm text-rose-800 shadow-xs dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div>
            <h4 className="font-bold text-rose-900 dark:text-rose-100">Live Totals Unavailable</h4>
            <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-300">{error}. Financial cards are hidden because stale or browser-derived values are strictly prohibited.</p>
          </div>
        </div>
      )}

      {!loading && summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <button
                key={card.label}
                onClick={() => onNavigate(card.tab)}
                className="group cursor-pointer rounded-2xl border border-slate-200/90 bg-white p-5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-400/50 hover:shadow-md active:scale-99 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-600/50"
              >
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  <span>{card.label}</span>
                  <ArrowUpRight className="h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                </div>
                <div className="mt-3 font-financial text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                  {formatCurrency(card.value, settings.currencySymbol)}
                </div>
                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{card.detail}</p>
              </button>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800/80">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-slate-100">Recent financial documents</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Latest persisted invoices and bills</p>
                </div>
                <button
                  onClick={() => onNavigate('reports')}
                  className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Open ledger reports
                </button>
              </div>

              <div className="overflow-x-auto">
                {summary.recentTransactions.length === 0 ? (
                  <div className="p-6">
                    <EmptyStateCard
                      icon={FileText}
                      title="No Financial Documents Recorded"
                      description="Create your first client invoice or record a vendor bill to populate your authoritative ledger history."
                      actionLabel="Create Invoice"
                      onAction={() => setIsInvoiceEditorOpen(true)}
                    />
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                      <tr>
                        <th className="p-3.5">Date</th>
                        <th className="p-3.5">Type / number</th>
                        <th className="p-3.5">Party</th>
                        <th className="p-3.5 text-right">Amount</th>
                        <th className="p-3.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {summary.recentTransactions.map((row) => (
                        <tr
                          key={`${row.type}-${row.documentNumber}`}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="p-3.5 text-slate-600 dark:text-slate-300 font-financial">{formatDate(row.date)}</td>
                          <td className="p-3.5 font-financial font-bold text-slate-900 dark:text-white">
                            {row.type} · {row.documentNumber}
                          </td>
                          <td className="p-3.5 text-slate-700 dark:text-slate-200">{row.partyName}</td>
                          <td className="p-3.5 text-right font-financial font-bold text-slate-900 dark:text-white">
                            {formatCurrency(row.amount, settings.currencySymbol)}
                          </td>
                          <td className="p-3.5 text-right">
                            <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${getStatusBadgeStyle(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <DashboardQuickActions
              onOpenInvoiceEditor={() => setIsInvoiceEditorOpen(true)}
              onOpenExpenseModal={() => setIsExpenseModalOpen(true)}
              onOpenClientModal={() => setIsClientModalOpen(true)}
            />
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/80 p-3.5 text-xs text-slate-500 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
            Bank items requiring reconciliation: <strong className="text-slate-800 dark:text-slate-200">{summary.bankReconciliationAttentionCount}</strong> · Quotations awaiting response: <strong className="text-slate-800 dark:text-slate-200">{summary.quotationsAwaitingResponseCount}</strong>. Forecasts, tax estimates, project margins, and synthetic cash-flow charts remain disabled.
          </div>
        </>
      )}

      {isInvoiceEditorOpen && <InvoiceEditorModal isOpen onClose={() => setIsInvoiceEditorOpen(false)} />}
      {isExpenseModalOpen && <ExpenseModal isOpen onClose={() => setIsExpenseModalOpen(false)} />}
      {isClientModalOpen && <ClientModal isOpen onClose={() => setIsClientModalOpen(false)} />}
    </div>
  );
};
