import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { CertifiedReportId } from '../../services/authoritativeReportService';

interface Props {
  reportId: CertifiedReportId;
  data: any;
  currencySymbol: string;
}

const IntegrityBanner: React.FC<{ passed: boolean; passedText: string; failedText: string }> = ({ passed, passedText, failedText }) => (
  <div className={`mb-5 flex items-start gap-2 rounded-xl border p-3 text-xs font-bold ${passed ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'}`}>
    {passed ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
    <span>{passed ? passedText : failedText}</span>
  </div>
);

const AmountRows: React.FC<{ rows: any[]; currencySymbol: string }> = ({ rows, currencySymbol }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
    <table className="w-full text-left text-xs">
      <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        <tr><th className="p-3">Account</th><th className="p-3 text-right">Amount</th></tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.length === 0 ? <tr><td colSpan={2} className="p-6 text-center text-slate-400">No posted activity for this period.</td></tr> : rows.map((row) => (
          <tr key={row.accountId}><td className="p-3"><span className="mr-2 font-mono text-slate-500">{row.accountCode}</span>{row.accountName}</td><td className="p-3 text-right font-mono font-bold">{formatCurrency(Number(row.amount || row.balance || 0), currencySymbol)}</td></tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const AuthoritativeReportRenderer: React.FC<Props> = ({ reportId, data, currencySymbol }) => {
  if (reportId === 'pnl_standard') {
    return <div className="mx-auto max-w-4xl space-y-6">
      <section className="space-y-2"><h4 className="text-xs font-black uppercase tracking-wider">Income</h4><AmountRows rows={data.incomeAccounts || []} currencySymbol={currencySymbol} /><div className="text-right text-sm font-black">Total income: {formatCurrency(Number(data.totalIncome || 0), currencySymbol)}</div></section>
      <section className="space-y-2"><h4 className="text-xs font-black uppercase tracking-wider">Expenses</h4><AmountRows rows={data.expenseAccounts || []} currencySymbol={currencySymbol} /><div className="text-right text-sm font-black">Total expenses: {formatCurrency(Number(data.totalExpense || 0), currencySymbol)}</div></section>
      <div className="flex justify-between rounded-xl border border-blue-200 bg-blue-50 p-4 text-base font-black text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"><span>Net profit / (loss)</span><span className="font-mono">{formatCurrency(Number(data.netProfit || 0), currencySymbol)}</span></div>
    </div>;
  }

  if (reportId === 'balance_sheet_standard') {
    return <div className="mx-auto max-w-4xl space-y-6">
      <IntegrityBanner passed={data.isBalanced === true} passedText="Assets equal liabilities plus equity to the cent." failedText={`Balance sheet is out of balance by ${formatCurrency(Number(data.difference || 0), currencySymbol)}. Investigate before relying on it.`} />
      <section className="space-y-2"><h4 className="text-xs font-black uppercase tracking-wider">Assets</h4><AmountRows rows={data.assets?.accounts || []} currencySymbol={currencySymbol} /><div className="text-right text-sm font-black">Total assets: {formatCurrency(Number(data.totalAssets || 0), currencySymbol)}</div></section>
      <section className="space-y-2"><h4 className="text-xs font-black uppercase tracking-wider">Liabilities</h4><AmountRows rows={data.liabilities?.accounts || []} currencySymbol={currencySymbol} /></section>
      <section className="space-y-2"><h4 className="text-xs font-black uppercase tracking-wider">Equity</h4><AmountRows rows={data.equity?.accounts || []} currencySymbol={currencySymbol} /><div className="text-right text-xs">Current earnings: <strong>{formatCurrency(Number(data.currentYearEarnings || 0), currencySymbol)}</strong></div><div className="text-right text-sm font-black">Liabilities + equity: {formatCurrency(Number(data.totalLiabilitiesAndEquity || 0), currencySymbol)}</div></section>
    </div>;
  }

  if (reportId === 'trial_balance') {
    return <div className="mx-auto max-w-5xl space-y-4">
      <IntegrityBanner passed={data.isBalanced === true} passedText="Total debits equal total credits to the cent." failedText={`Trial balance difference is ${formatCurrency(Number(data.difference || 0), currencySymbol)}. Do not close or report this period.`} />
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-[10px] font-bold uppercase dark:bg-slate-800"><tr><th className="p-3">Code</th><th className="p-3">Account</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{(data.rows || []).map((row: any) => <tr key={row.accountId}><td className="p-3 font-mono">{row.accountCode}</td><td className="p-3">{row.accountName}</td><td className="p-3 text-right font-mono">{row.debit ? formatCurrency(Number(row.debit), currencySymbol) : '—'}</td><td className="p-3 text-right font-mono">{row.credit ? formatCurrency(Number(row.credit), currencySymbol) : '—'}</td></tr>)}</tbody><tfoot className="bg-slate-100 font-black dark:bg-slate-800"><tr><td colSpan={2} className="p-3 text-right">Totals</td><td className="p-3 text-right font-mono">{formatCurrency(Number(data.totalDebits || 0), currencySymbol)}</td><td className="p-3 text-right font-mono">{formatCurrency(Number(data.totalCredits || 0), currencySymbol)}</td></tr></tfoot></table></div>
    </div>;
  }

  if (reportId === 'general_ledger') {
    return <div className="space-y-5">{(data.accounts || []).length === 0 ? <p className="py-12 text-center text-sm text-slate-400">No posted journal activity for this period.</p> : (data.accounts || []).map((account: any) => <section key={account.accountId} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"><div className="flex justify-between bg-slate-100 p-3 text-xs font-black dark:bg-slate-800"><span>{account.accountCode} · {account.accountName}</span><span className="font-mono">Net {formatCurrency(Number(account.netBalance || 0), currencySymbol)}</span></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[10px] uppercase text-slate-500"><tr><th className="p-3">Date</th><th className="p-3">Entry / reference</th><th className="p-3">Narration</th><th className="p-3 text-right">Debit</th><th className="p-3 text-right">Credit</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{(account.transactions || []).map((row: any) => <tr key={`${row.journalEntryId}-${row.debit}-${row.credit}`}><td className="p-3">{formatDate(row.entryDate)}</td><td className="p-3 font-mono">{row.entryNumber}{row.reference ? ` · ${row.reference}` : ''}</td><td className="p-3">{row.narration || '—'}</td><td className="p-3 text-right font-mono">{row.debit ? formatCurrency(Number(row.debit), currencySymbol) : '—'}</td><td className="p-3 text-right font-mono">{row.credit ? formatCurrency(Number(row.credit), currencySymbol) : '—'}</td></tr>)}</tbody></table></div></section>)}</div>;
  }

  const receivable = reportId === 'aged_receivables';
  return <div className="mx-auto max-w-5xl space-y-4">
    <IntegrityBanner passed={data.isReconciled === true} passedText={`${receivable ? 'Receivables' : 'Payables'} subledger equals its control account to the cent.`} failedText={`${receivable ? 'Receivables' : 'Payables'} differs from its control account by ${formatCurrency(Number(data.difference || 0), currencySymbol)}. Investigate before relying on it.`} />
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3 text-xs"><span className="block text-slate-500">Open subledger</span><strong className="font-mono text-base">{formatCurrency(Number(data.totalSubledgerAmount || 0), currencySymbol)}</strong></div><div className="rounded-xl border p-3 text-xs"><span className="block text-slate-500">GL control</span><strong className="font-mono text-base">{formatCurrency(Number(data.totalGLControlAmount || 0), currencySymbol)}</strong></div><div className="rounded-xl border p-3 text-xs"><span className="block text-slate-500">Difference</span><strong className="font-mono text-base">{formatCurrency(Number(data.difference || 0), currencySymbol)}</strong></div></div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-slate-100 text-[10px] font-bold uppercase dark:bg-slate-800"><tr><th className="p-3">{receivable ? 'Customer' : 'Vendor'}</th><th className="p-3">Document</th><th className="p-3">Due date</th><th className="p-3 text-right">Balance due</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{(data.rows || []).length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-slate-400">No open balances as of this date.</td></tr> : (data.rows || []).map((row: any) => <tr key={row.id}><td className="p-3">{row.name}</td><td className="p-3 font-mono">{row.invoice_number || row.bill_number}</td><td className="p-3">{formatDate(row.due_date)}</td><td className="p-3 text-right font-mono font-bold">{formatCurrency(Number(row.balance_due || 0), currencySymbol)}</td></tr>)}</tbody></table></div>
  </div>;
};
