import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Plus, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { apiClient } from '../../api/client';

type Side = 'receivable' | 'payable';
type Row = Record<string, any>;

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: unknown) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));

const resources = {
  receivable: [
    { key: 'credits', label: 'Credit notes', endpoint: '/finance/credit-notes', operation: 'credit' },
    { key: 'advances', label: 'Advances', endpoint: '/finance/customer-advances', operation: 'apply-advance' },
    { key: 'applications', label: 'Advance applications', endpoint: '/finance/customer-advance-applications', operation: 'apply-advance' },
    { key: 'refunds', label: 'Refunds', endpoint: '/finance/refunds', operation: 'refund' },
    { key: 'writeoffs', label: 'Write-offs', endpoint: '/finance/write-offs', operation: 'writeoff' },
  ],
  payable: [
    { key: 'payments', label: 'Payments', endpoint: '/finance/vendor-payments', operation: 'payment' },
    { key: 'advances', label: 'Advances', endpoint: '/finance/vendor-advances', operation: 'advance' },
    { key: 'applications', label: 'Advance applications', endpoint: '/finance/vendor-advance-applications', operation: 'apply-advance' },
    { key: 'credits', label: 'Vendor credits', endpoint: '/finance/debit-notes', operation: 'credit' },
    { key: 'writeoffs', label: 'Write-offs', endpoint: '/finance/ap-write-offs', operation: 'writeoff' },
  ],
} as const;

export const SettlementWorkspace: React.FC<{ side: Side; initialResource?: string; autoOpenCreateModal?: boolean; onModalClosed?: () => void }> = ({ side, initialResource, autoOpenCreateModal, onModalClosed }) => {
  const definitions = resources[side];
  const [active, setActive] = useState(initialResource || definitions[0].key);
  const [rows, setRows] = useState<Row[]>([]);
  const [parties, setParties] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [advances, setAdvances] = useState<Row[]>([]);
  const [credits, setCredits] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [operation, setOperation] = useState(definitions[0].operation as string);
  const [form, setForm] = useState<Record<string, string>>({ date: today(), amount: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const definition = definitions.find((item) => item.key === active) || definitions[0];
  const load = useCallback(async () => {
    setError('');
    const partyEndpoint = side === 'receivable' ? '/finance/customers' : '/finance/vendors';
    const documentEndpoint = side === 'receivable' ? '/finance/invoices' : '/finance/bills';
    const advanceEndpoint = side === 'receivable' ? '/finance/customer-advances' : '/finance/vendor-advances';
    const creditEndpoint = side === 'receivable' ? '/finance/credit-notes' : '/finance/debit-notes';
    const [rowResult, partyResult, documentResult, accountResult, advanceResult, creditResult] = await Promise.all([
      apiClient.get<Row[]>(definition.endpoint), apiClient.get<Row[]>(partyEndpoint), apiClient.get<Row[]>(documentEndpoint),
      apiClient.get<Row[]>('/finance/accounts'), apiClient.get<Row[]>(advanceEndpoint), apiClient.get<Row[]>(creditEndpoint),
    ]);
    const failure = [rowResult, partyResult, documentResult, accountResult, advanceResult, creditResult].find((result) => result.error);
    if (failure?.error) { setError(failure.error); return; }
    setRows(rowResult.data || []); setParties(partyResult.data || []); setDocuments(documentResult.data || []);
    setAccounts(accountResult.data || []); setAdvances(advanceResult.data || []); setCredits(creditResult.data || []);
  }, [definition.endpoint, side]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setOperation(definition.operation); }, [definition.operation]);
  useEffect(() => { if (initialResource) setActive(initialResource); }, [initialResource]);

  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const partyId = form.partyId || '';
  const partyDocuments = documents.filter((document) => String(document.customer_id || document.client_id || document.vendor_id || '') === partyId);
  const partyAdvances = advances.filter((advance) => String(advance.customer_id || advance.vendor_id || '') === partyId && Number(advance.unapplied_amount) > 0 && String(advance.status).toUpperCase() !== 'REVERSED');
  const partyCredits = credits.filter((credit) => String(credit.customer_id || credit.client_id || credit.vendor_id || '') === partyId && Number(credit.remaining_credit) > 0 && String(credit.status).toUpperCase() !== 'REVERSED');
  const cashAccounts = accounts.filter((account) => account.type === 'Asset' && !account.is_locked && String(account.status).toLowerCase() !== 'inactive');
  const adjustmentAccounts = accounts.filter((account) => side === 'receivable' ? account.type === 'Expense' : ['Income', 'Expense'].includes(account.type));

  const openCreate = () => {
    setForm({ date: today(), amount: '', reason: '', partyId: String(parties[0]?.id || '') });
    setOperation(definition.operation); setError(''); setModal(true);
  };

  useEffect(() => {
    if (!autoOpenCreateModal) return;
    openCreate();
    onModalClosed?.();
  }, [autoOpenCreateModal]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    const party = parties.find((item) => String(item.id) === form.partyId);
    const document = documents.find((item) => String(item.id) === form.documentId);
    const amount = Number(form.amount);
    let endpoint = '';
    let payload: Row = {};
    if (side === 'receivable') {
      if (operation === 'credit') { endpoint = '/finance/credit-notes'; payload = { customerId: party?.id, customerName: party?.display_name || party?.name, invoiceId: form.documentId || undefined, date: form.date, taxableAmount: amount, taxAmount: 0, reason: form.reason }; }
      if (operation === 'apply-advance') { endpoint = '/finance/customer-advances/apply'; payload = { advanceId: form.advanceId, invoiceId: form.documentId, amountToApply: amount, applyDate: form.date }; }
      if (operation === 'refund') { endpoint = '/finance/refunds'; payload = { customerId: party?.id, creditNoteId: form.creditId, refundDate: form.date, amount, refundAccountId: form.accountId, reference: form.reference, notes: form.reason }; }
      if (operation === 'writeoff') { endpoint = '/finance/write-offs'; payload = { invoiceId: form.documentId, customerId: party?.id, writeOffDate: form.date, amount, writeOffAccountId: form.accountId, reason: form.reason }; }
    } else {
      if (operation === 'payment') { endpoint = '/finance/vendor-payments'; payload = { vendorId: party?.id, vendorName: party?.name, paymentDate: form.date, amount, paymentMode: form.method || 'Bank Transfer', paidFromAccountId: form.accountId, reference: form.reference, allocations: form.documentId ? [{ billId: form.documentId, amount }] : [] }; }
      if (operation === 'advance') { endpoint = '/finance/vendor-advances'; payload = { vendorId: party?.id, vendorName: party?.name, paidDate: form.date, amount, paidFromAccountId: form.accountId, paymentMode: form.method || 'Bank Transfer', reference: form.reference }; }
      if (operation === 'apply-advance') { endpoint = '/finance/vendor-advances/apply'; payload = { vendorId: party?.id, advanceId: form.advanceId, billId: form.documentId, amount, appliedDate: form.date }; }
      if (operation === 'credit') { endpoint = '/finance/debit-notes'; payload = { vendorId: party?.id, vendorName: party?.name, billId: form.documentId || undefined, date: form.date, taxableAmount: amount, taxAmount: 0, reason: form.reason }; }
      if (operation === 'writeoff') { endpoint = '/finance/ap-write-offs'; payload = { billId: form.documentId, vendorId: party?.id, writeOffDate: form.date, amount, writeOffAccountId: form.accountId, reason: form.reason }; }
    }
    if (!endpoint || !Number.isFinite(amount) || amount <= 0) { setBusy(false); setError('Enter a valid positive amount.'); return; }
    const response = await apiClient.post(endpoint, payload);
    setBusy(false);
    if (response.error) { setError(response.error); return; }
    setModal(false); await load();
  };

  const reverse = async (row: Row) => {
    const reason = window.prompt('Enter a reversal reason for the audit trail:')?.trim();
    if (!reason) return;
    const routes: Record<string, string> = side === 'receivable'
      ? { credits: `/finance/credit-notes/${row.id}/reverse`, applications: `/finance/customer-advance-applications/${row.id}/reverse`, refunds: `/finance/refunds/${row.id}/reverse`, writeoffs: `/finance/write-offs/${row.id}/reverse` }
      : { payments: `/finance/vendor-payments/${row.id}/reverse`, advances: `/finance/vendor-advances/${row.id}/reverse`, applications: `/finance/vendor-advance-applications/${row.id}/reverse`, credits: `/finance/debit-notes/${row.id}/reverse`, writeoffs: `/finance/ap-write-offs/${row.id}/reverse` };
    if (!routes[active]) return;
    setBusy(true); const response = await apiClient.post(routes[active], { reason }); setBusy(false);
    if (response.error) { setError(response.error); return; }
    await load();
  };

  const label = side === 'receivable' ? 'Receivables corrections' : 'Payables settlement';
  const icon = side === 'receivable' ? <ArrowDownToLine className="h-6 w-6 text-teal-700" /> : <ArrowUpFromLine className="h-6 w-6 text-emerald-700" />;
  const rowNumber = (row: Row) => row.credit_note_number || row.credit_number || row.payment_number || row.refund_number || row.id;
  const rowParty = (row: Row) => row.client_name || row.vendor_name || parties.find((party) => party.id === (row.customer_id || row.vendor_id))?.display_name || '—';
  const rowDate = (row: Row) => row.date || row.payment_date || row.received_date || row.paid_date || row.refund_date || row.write_off_date || row.applied_date || row.created_at;
  const rowAmount = (row: Row) => row.amount || row.total_amount || row.amount_applied;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800"><div><h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">{icon}{label}</h2><p className="mt-1 text-xs text-slate-500">Posted documents, allocations, balances, journals, and reversals commit together.</p></div><div className="flex gap-2"><button title="Refresh" onClick={() => void load()} className="rounded-lg border border-slate-300 p-2 text-slate-600 dark:border-slate-700"><RefreshCw className="h-4 w-4" /></button><button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />New transaction</button></div></div>
      {error && <div role="alert" className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">{definitions.map((item) => <button key={item.key} onClick={() => setActive(item.key)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold ${active === item.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</div>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${definition.label.toLowerCase()}`} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-900" /></div>
      <div className="overflow-x-auto border-y border-slate-200 dark:border-slate-800"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Reference</th><th className="p-3">Party</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{filtered.length === 0 ? <tr><td colSpan={6} className="p-10 text-center text-slate-500">No authoritative {definition.label.toLowerCase()} records.</td></tr> : filtered.map((row) => <tr key={row.id}><td className="p-3 font-mono font-bold text-blue-700">{rowNumber(row)}</td><td className="p-3 font-semibold">{rowParty(row)}</td><td className="p-3 text-slate-500">{rowDate(row) ? new Date(rowDate(row)).toLocaleDateString() : '—'}</td><td className="p-3 font-bold text-slate-600">{row.status || 'POSTED'}</td><td className="p-3 text-right font-mono font-bold">{money(rowAmount(row))}</td><td className="p-3 text-right">{String(row.status || 'POSTED').toUpperCase() !== 'REVERSED' && !(side === 'receivable' && active === 'advances') ? <button onClick={() => void reverse(row)} disabled={busy} title="Reverse transaction" className="rounded p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" /></button> : null}</td></tr>)}</tbody></table></div>

      {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => !busy && setModal(false)}><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex justify-between"><div><h3 className="text-base font-bold text-slate-900 dark:text-white">New {label.toLowerCase()} transaction</h3><p className="mt-1 text-xs text-slate-500">The server assigns document and journal numbers.</p></div><button title="Close" onClick={() => setModal(false)}><X className="h-4 w-4" /></button></div><form onSubmit={submit} className="space-y-3">
        <label className="block space-y-1 text-xs font-bold"><span>Transaction type</span><select value={operation} onChange={(event) => setOperation(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800">{(side === 'receivable' ? [['credit','Credit note'],['apply-advance','Apply customer advance'],['refund','Customer refund'],['writeoff','Receivable write-off']] : [['payment','Vendor payment'],['advance','Vendor advance'],['apply-advance','Apply vendor advance'],['credit','Vendor credit'],['writeoff','Payable write-off']]).map(([value,text]) => <option key={value} value={value}>{text}</option>)}</select></label>
        <label className="block space-y-1 text-xs font-bold"><span>{side === 'receivable' ? 'Customer' : 'Vendor'}</span><select required value={form.partyId || ''} onChange={(event) => setForm({ ...form, partyId: event.target.value, documentId: '', advanceId: '', creditId: '' })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"><option value="">Select</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.display_name || party.name}</option>)}</select></label>
        {['payment','credit','apply-advance','writeoff'].includes(operation) && <label className="block space-y-1 text-xs font-bold"><span>{side === 'receivable' ? 'Invoice' : 'Bill'}{operation === 'credit' || (operation === 'payment' && side === 'payable') ? ' (optional)' : ''}</span><select required={!['credit'].includes(operation) && !(operation === 'payment' && side === 'payable')} value={form.documentId || ''} onChange={(event) => setForm({ ...form, documentId: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"><option value="">Unallocated</option>{partyDocuments.filter((document) => Number(document.balance_due ?? document.total_amount) > 0).map((document) => <option key={document.id} value={document.id}>{document.invoice_number || document.bill_number} · {money(document.balance_due ?? document.total_amount)}</option>)}</select></label>}
        {operation === 'apply-advance' && <label className="block space-y-1 text-xs font-bold"><span>Available advance</span><select required value={form.advanceId || ''} onChange={(event) => setForm({ ...form, advanceId: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"><option value="">Select advance</option>{partyAdvances.map((advance) => <option key={advance.id} value={advance.id}>{advance.id} · {money(advance.unapplied_amount)}</option>)}</select></label>}
        {operation === 'refund' && <label className="block space-y-1 text-xs font-bold"><span>Credit note</span><select required value={form.creditId || ''} onChange={(event) => setForm({ ...form, creditId: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"><option value="">Select credit</option>{partyCredits.map((credit) => <option key={credit.id} value={credit.id}>{credit.credit_note_number} · {money(credit.remaining_credit)}</option>)}</select></label>}
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-bold"><span>Date</span><input required type="date" value={form.date || today()} onChange={(event) => setForm({ ...form, date: event.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 dark:border-slate-700 dark:bg-slate-800" /></label><label className="space-y-1 text-xs font-bold"><span>Amount</span><input required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="w-full rounded-lg border border-slate-300 p-2.5 font-mono dark:border-slate-700 dark:bg-slate-800" /></label></div>
        {(['payment','advance','refund','writeoff'].includes(operation)) && <label className="block space-y-1 text-xs font-bold"><span>{operation === 'writeoff' ? 'Adjustment account' : operation === 'refund' ? 'Refund account' : 'Bank account'}</span><select required value={form.accountId || ''} onChange={(event) => setForm({ ...form, accountId: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800"><option value="">Select account</option>{(operation === 'writeoff' ? adjustmentAccounts : cashAccounts).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></label>}
        <label className="block space-y-1 text-xs font-bold"><span>Reason or reference</span><textarea required={['credit','writeoff'].includes(operation)} value={form.reason || ''} onChange={(event) => setForm({ ...form, reason: event.target.value, reference: event.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 p-2.5 dark:border-slate-700 dark:bg-slate-800" /></label>
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold">Cancel</button><button disabled={busy} type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Posting...' : 'Post transaction'}</button></div>
      </form></div></div>}
    </div>
  );
};
