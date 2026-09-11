import React from 'react';
import { AlertTriangle, BadgeIndianRupee, BriefcaseBusiness, ReceiptText, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface Props {
  data: any;
  currencySymbol: string;
}

const Money: React.FC<{ value: number; currencySymbol: string; className?: string }> = ({ value, currencySymbol, className = '' }) => (
  <span className={`font-mono ${className}`}>{formatCurrency(Number(value || 0), currencySymbol)}</span>
);

const Metric: React.FC<{ label: string; value: React.ReactNode; detail: string; icon: React.ReactNode }> = ({ label, value, detail, icon }) => (
  <section className="min-w-0 border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</span>
      <span className="shrink-0 text-blue-600 dark:text-blue-400">{icon}</span>
    </div>
    <strong className="mt-2 block truncate text-base font-black text-slate-950 dark:text-white">{value}</strong>
    <p className="mt-1 truncate text-[11px] text-slate-500">{detail}</p>
  </section>
);

const AccountRows: React.FC<{ title: string; rows: any[]; currencySymbol: string }> = ({ title, rows, currencySymbol }) => (
  <section className="min-w-0 border-t border-slate-200 pt-3 dark:border-slate-800">
    <h5 className="text-[10px] font-black uppercase tracking-wide text-slate-500">{title}</h5>
    {rows.length === 0 ? <p className="pt-2 text-xs text-slate-400">No posted activity in this period.</p> : (
      <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row) => <div key={row.accountId} className="flex min-w-0 items-center justify-between gap-3 py-2 text-xs">
          <span className="min-w-0 truncate"><span className="mr-1.5 font-mono text-slate-400">{row.accountCode}</span>{row.accountName}</span>
          <Money value={row.amount} currencySymbol={currencySymbol} className="shrink-0 font-bold" />
        </div>)}
      </div>
    )}
  </section>
);

export const ProjectProfitabilityReportRenderer: React.FC<Props> = ({ data, currencySymbol }) => {
  const totals = data.totals || {};
  const projects = data.projects || [];
  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{data.operationalWipDisclosure || 'Unbilled time is operational work-in-progress and is not a posted accounting WIP asset.'}</p>
    </div>

    <div className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2 xl:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
      <Metric label="Posted Revenue" value={<Money value={totals.revenue} currencySymbol={currencySymbol} />} detail="Income lines tagged to projects" icon={<TrendingUp className="h-4 w-4" />} />
      <Metric label="Direct Cost" value={<Money value={totals.directCosts} currencySymbol={currencySymbol} />} detail="Posted expense and COGS lines" icon={<ReceiptText className="h-4 w-4" />} />
      <Metric label="Gross Profit" value={<Money value={totals.grossProfit} currencySymbol={currencySymbol} />} detail={`${Number(totals.grossMarginPercent || 0).toFixed(1)}% portfolio margin`} icon={<BadgeIndianRupee className="h-4 w-4" />} />
      <Metric label="Cash Collected" value={<Money value={totals.collectedCash} currencySymbol={currencySymbol} />} detail="Allocated customer receipts" icon={<BriefcaseBusiness className="h-4 w-4" />} />
    </div>

    <div className="overflow-x-auto border border-slate-200 dark:border-slate-800">
      <table className="min-w-[940px] w-full text-left text-xs">
        <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <tr><th className="p-3">Project</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Direct cost</th><th className="p-3 text-right">Gross profit</th><th className="p-3 text-right">Margin</th><th className="p-3 text-right">Receivable</th><th className="p-3 text-right">Operational WIP</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {projects.length === 0 ? <tr><td colSpan={7} className="p-8 text-center text-slate-400">No projects match this report filter.</td></tr> : projects.map((project: any) => <tr key={project.projectId} className="align-top">
            <td className="p-3"><div className="font-bold text-slate-900 dark:text-white">{project.projectName}</div><div className="mt-0.5 text-[11px] text-slate-500"><span className="font-mono">{project.projectCode}</span> · {project.clientName}</div></td>
            <td className="p-3 text-right"><Money value={project.revenue} currencySymbol={currencySymbol} /></td>
            <td className="p-3 text-right"><Money value={project.directCosts} currencySymbol={currencySymbol} /></td>
            <td className={`p-3 text-right font-bold ${project.grossProfit >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}><Money value={project.grossProfit} currencySymbol={currencySymbol} /></td>
            <td className="p-3 text-right">{Number(project.grossMarginPercent || 0).toFixed(1)}%</td>
            <td className="p-3 text-right"><Money value={project.outstandingReceivables} currencySymbol={currencySymbol} /><div className="mt-0.5 text-[10px] text-rose-600">Overdue <Money value={project.overdueReceivables} currencySymbol={currencySymbol} /></div></td>
            <td className="p-3 text-right"><Money value={project.operationalWip?.unbilledBillableValue} currencySymbol={currencySymbol} /><div className="mt-0.5 text-[10px] text-slate-500">{Number(project.operationalWip?.unbilledBillableHours || 0).toFixed(2)} unbilled hrs</div></td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <div className="space-y-3">
      {projects.map((project: any) => <details key={project.projectId} className="group border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm font-bold text-slate-900 dark:text-white">
          <span className="min-w-0 truncate">{project.projectCode} · {project.projectName}</span>
          <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">View breakdown</span>
        </summary>
        <div className="grid gap-5 border-t border-slate-200 p-4 md:grid-cols-2 dark:border-slate-800">
          <div className="space-y-4">
            <AccountRows title="Posted revenue by account" rows={project.revenueByAccount || []} currencySymbol={currencySymbol} />
            <AccountRows title="Posted direct costs by account" rows={project.directCostsByAccount || []} currencySymbol={currencySymbol} />
            <section className="border-t border-slate-200 pt-3 dark:border-slate-800"><h5 className="text-[10px] font-black uppercase tracking-wide text-slate-500">Budget versus actual</h5><div className="mt-2 flex items-center justify-between gap-3 text-xs"><span>{project.budget?.type || 'Project'} budget ({project.budget?.unit === 'HOURS' ? 'hours' : 'cost'})</span><span className="font-mono font-bold">{project.budget?.unit === 'HOURS' ? Number(project.budget?.actual || 0).toFixed(2) : formatCurrency(Number(project.budget?.actual || 0), currencySymbol)} / {project.budget?.unit === 'HOURS' ? Number(project.budget?.amount || 0).toFixed(2) : formatCurrency(Number(project.budget?.amount || 0), currencySymbol)}</span></div><div className="mt-2 h-1.5 overflow-hidden bg-slate-100 dark:bg-slate-800"><div className="h-full bg-blue-600" style={{ width: `${Math.min(100, Number(project.budget?.usedPercent || 0))}%` }} /></div><p className="mt-1 text-[11px] text-slate-500">{Number(project.budget?.usedPercent || 0).toFixed(1)}% used</p></section>
          </div>
          <div className="space-y-4">
            <section className="border-t border-slate-200 pt-3 dark:border-slate-800"><h5 className="text-[10px] font-black uppercase tracking-wide text-slate-500">Expense vouchers by vendor</h5>{(project.expensesByVendor || []).length === 0 ? <p className="pt-2 text-xs text-slate-400">No posted expense vouchers in this period.</p> : <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">{project.expensesByVendor.map((row: any) => <div key={row.vendorName} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="min-w-0 truncate">{row.vendorName}</span><Money value={row.amount} currencySymbol={currencySymbol} className="shrink-0 font-bold" /></div>)}</div>}</section>
            <section className="border-t border-slate-200 pt-3 dark:border-slate-800"><h5 className="text-[10px] font-black uppercase tracking-wide text-slate-500">Invoice and collection follow-up</h5>{(project.invoices || []).length === 0 ? <p className="pt-2 text-xs text-slate-400">No posted invoices as of this report date.</p> : <div className="mt-2 max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">{project.invoices.map((invoice: any) => <div key={invoice.invoiceId} className="flex items-center justify-between gap-3 py-2 text-xs"><span className="min-w-0"><span className="block font-mono">{invoice.invoiceNumber}</span><span className="block text-[10px] text-slate-500">Due {formatDate(invoice.dueDate)} · {invoice.status}</span></span><span className="shrink-0 text-right"><Money value={invoice.balanceDue} currencySymbol={currencySymbol} className="font-bold" />{invoice.isOverdue && <span className="block text-[10px] font-bold text-rose-600">Overdue</span>}</span></div>)}</div>}</section>
            <section className="border-t border-slate-200 pt-3 dark:border-slate-800"><h5 className="text-[10px] font-black uppercase tracking-wide text-slate-500">Collected in period</h5>{(project.collections || []).length === 0 ? <p className="pt-2 text-xs text-slate-400">No allocated receipts in this period.</p> : <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">{project.collections.map((collection: any) => <div key={collection.paymentId} className="flex items-center justify-between gap-3 py-2 text-xs"><span><span className="font-mono">{collection.paymentNumber}</span><span className="ml-2 text-slate-500">{formatDate(collection.paymentDate)}</span></span><Money value={collection.amount} currencySymbol={currencySymbol} className="shrink-0 font-bold" /></div>)}</div>}</section>
          </div>
        </div>
      </details>)}
    </div>
  </div>;
};
