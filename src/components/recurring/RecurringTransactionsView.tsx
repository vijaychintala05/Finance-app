import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Pause, Play, Plus, RefreshCw, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

type Kind = 'INVOICE' | 'BILL' | 'EXPENSE';
type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

interface RecurringRow {
  id: string;
  name: string;
  kind: Kind;
  frequency: Frequency;
  next_run_date: string;
  status: 'ACTIVE' | 'PAUSED';
  template: Record<string, any> | string;
}

const labels: Record<Kind, { title: string; party: string; singular: string }> = {
  INVOICE: { title: 'Recurring Invoices', party: 'Customer', singular: 'invoice' },
  BILL: { title: 'Recurring Bills', party: 'Vendor', singular: 'bill' },
  EXPENSE: { title: 'Recurring Expenses', party: 'Vendor', singular: 'expense' },
};

export const RecurringTransactionsView: React.FC<{ kind: Kind }> = ({ kind }) => {
  const { clients, vendors, accounts, refreshAccounts, settings } = useBooks();
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [partyId, setPartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('MONTHLY');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paidFromAccountId, setPaidFromAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const parties = kind === 'INVOICE' ? clients : vendors;
  const expenseAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(account.type) &&
          (account.status || 'Active') === 'Active' &&
          account.allowDirectPosting !== false
      ),
    [accounts]
  );
  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          (account.status || 'Active') === 'Active' &&
          account.allowDirectPosting !== false &&
          ((account.type === 'Asset' &&
            ['Bank', 'Cash', 'Cash & Bank', 'Digital Wallet', 'Undeposited Funds', 'Payment Clearing'].includes(
              account.subType
            )) ||
            (account.type === 'Liability' && ['Credit Cards', 'Credit Card', 'Loan/Credit'].includes(account.subType)))
      ),
    [accounts]
  );

  const load = async () => {
    setLoading(true);
    const response = await apiClient.get<RecurringRow[]>('/recurring/profiles');
    if (response.error) setError(response.error);
    else {
      setRows((response.data || []).filter((row) => row.kind === kind));
      setError('');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (refreshAccounts) {
      refreshAccounts().catch((err) => console.error('Error fetching accounts in recurring view:', err));
    }
    void load();
  }, [kind, refreshAccounts]);
  useEffect(() => {
    setPartyId(parties[0]?.id || '');
    setExpenseAccountId(expenseAccounts[0]?.id || '');
    setPaidFromAccountId(paymentAccounts[0]?.id || '');
  }, [kind, parties, expenseAccounts, paymentAccounts]);

  const templateAmount = (row: RecurringRow) => {
    const template = typeof row.template === 'string' ? JSON.parse(row.template) : row.template;
    if (row.kind === 'EXPENSE') return Number(template.amount || 0);
    return Number(template.lineItems?.[0]?.amount || template.lineItems?.[0]?.unitPrice || 0);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    const party = parties.find((item) => item.id === partyId);
    if (!name.trim() || !party || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
    setSubmitting(true);
    setError('');
    const lineItem = { description: description.trim() || name.trim(), quantity: 1, unitPrice: numericAmount, taxRate: 0, amount: numericAmount };
    const template = kind === 'INVOICE'
      ? { customerId: party.id, customerName: party.name, lineItems: [lineItem] }
      : kind === 'BILL'
        ? { vendorId: party.id, vendorName: party.name, lineItems: [lineItem] }
        : {
            vendorName: party.name,
            expenseAccountId,
            paidFromAccountId,
            amount: numericAmount,
            description: description.trim() || name.trim(),
          };
    const response = await apiClient.post<RecurringRow>('/recurring/profiles', {
      name: name.trim(), kind, frequency, intervalCount: 1, startDate,
      timezone: 'UTC', catchUpPolicy: 'ALL', maxCatchUp: 12, autoPost: true, template,
    });
    setSubmitting(false);
    if (response.error) { setError(response.error); return; }
    setOpen(false);
    setName('');
    setAmount('');
    setDescription('');
    await load();
  };

  const changeStatus = async (row: RecurringRow) => {
    const action = row.status === 'ACTIVE' ? 'pause' : 'resume';
    const response = await apiClient.post<RecurringRow>(`/recurring/profiles/${row.id}/${action}`);
    if (response.error) setError(response.error);
    else await load();
  };

  const meta = labels[kind];
  const expenseAccountsMissing = kind === 'EXPENSE' && (!expenseAccountId || !paidFromAccountId);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{meta.title}</h2>
          <p className="mt-1 text-xs text-slate-500">Durable schedules and generated document history</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} title="Refresh" className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Schedule
          </button>
        </div>
      </header>

      {error && <div className="flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{error}</div>}

      <div className="overflow-x-auto border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[700px] text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
            <tr><th className="p-3">Schedule</th><th className="p-3">Frequency</th><th className="p-3">Next run</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row) => <tr key={row.id}>
              <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">{row.name}</td>
              <td className="p-3 text-slate-600 dark:text-slate-300">{row.frequency}</td>
              <td className="p-3 font-financial text-slate-600 dark:text-slate-300">{formatDate(row.next_run_date)}</td>
              <td className="p-3 text-right font-financial font-semibold">{formatCurrency(templateAmount(row), settings.currencySymbol)}</td>
              <td className="p-3"><span className={row.status === 'ACTIVE' ? 'text-emerald-700' : 'text-amber-700'}>{row.status}</span></td>
              <td className="p-3 text-right"><button type="button" title={row.status === 'ACTIVE' ? 'Pause' : 'Resume'} onClick={() => void changeStatus(row)} className="inline-grid h-8 w-8 place-items-center rounded-md text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">{row.status === 'ACTIVE' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button></td>
            </tr>)}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500">No schedules found</td></tr>}
            {loading && <tr><td colSpan={6} className="p-10 text-center text-sm text-slate-500">Loading schedules</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4">
        <form onSubmit={create} className="w-full max-w-lg space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between"><h3 className="text-base font-semibold">New recurring {meta.singular}</h3><button type="button" title="Close" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button></div>
          <label className="block text-xs font-semibold">Schedule name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
          <label className="block text-xs font-semibold">{meta.party}<select value={partyId} onChange={(event) => setPartyId(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-950">{parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold">Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value as Frequency)} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-950"><option>WEEKLY</option><option>MONTHLY</option><option>QUARTERLY</option><option>YEARLY</option></select></label><label className="block text-xs font-semibold">Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label></div>
          <label className="block text-xs font-semibold">Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm font-financial dark:border-slate-700 dark:bg-slate-950" /></label>
          {kind === 'EXPENSE' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold">Expense account<select value={expenseAccountId} onChange={(event) => setExpenseAccountId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-950">{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="block text-xs font-semibold">Paid from<select value={paidFromAccountId} onChange={(event) => setPaidFromAccountId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-950">{paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>}
          <label className="block text-xs font-semibold">Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-md border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-950" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-700">Cancel</button><button disabled={submitting || expenseAccountsMissing || !partyId} className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{submitting ? 'Creating' : 'Create Schedule'}</button></div>
        </form>
      </div>}
    </div>
  );
};
