import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Eye, FileText, Plus, RefreshCw, RotateCcw, Search, X } from 'lucide-react';
import { apiClient } from '../../api/client';
import type { FinanceCapabilityKey } from '../../capabilities/financeCapabilityRegistry';
import { useFinanceCapabilities } from '../../capabilities/useFinanceCapabilities';
import { OperationNoticeBanner } from '../common/OperationNoticeBanner';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { committedButStaleNotice, mutationFailureNotice, type OperationNotice } from '../../utils/operationNotice';

type Side = 'receivable' | 'payable';
type Row = Record<string, any>;
type Definition = { key: string; label: string; endpoint: string; operation: string; capability?: FinanceCapabilityKey };

interface Props {
  side: Side;
  initialResource?: string;
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const definitions: Record<Side, Definition[]> = {
  receivable: [
    { key: 'credits', label: 'Credit notes', endpoint: '/finance/credit-notes', operation: 'credit' },
    { key: 'advances', label: 'Advances', endpoint: '/finance/customer-advances', operation: 'apply-advance' },
    { key: 'applications', label: 'Advance applications', endpoint: '/finance/customer-advance-applications', operation: 'apply-advance' },
    { key: 'refunds', label: 'Refunds', endpoint: '/finance/refunds', operation: 'refund' },
    { key: 'writeoffs', label: 'Write-offs', endpoint: '/finance/write-offs', operation: 'writeoff', capability: 'receivable-write-offs' },
  ],
  payable: [
    { key: 'payments', label: 'Payments', endpoint: '/finance/vendor-payments', operation: 'payment' },
    { key: 'advances', label: 'Advances', endpoint: '/finance/vendor-advances', operation: 'advance' },
    { key: 'applications', label: 'Advance applications', endpoint: '/finance/vendor-advance-applications', operation: 'apply-advance' },
    { key: 'credits', label: 'Vendor credits', endpoint: '/finance/debit-notes', operation: 'credit' },
    { key: 'refunds', label: 'Vendor refunds', endpoint: '/finance/vendor-refunds', operation: 'refund' },
    { key: 'writeoffs', label: 'Write-offs', endpoint: '/finance/ap-write-offs', operation: 'writeoff', capability: 'payable-write-offs' },
  ],
};
const operationLabels: Record<Side, Record<string, string>> = {
  receivable: { credit: 'Credit note', 'apply-advance': 'Apply customer advance', refund: 'Customer refund', writeoff: 'Receivable write-off' },
  payable: { payment: 'Vendor payment', advance: 'Vendor advance', 'apply-advance': 'Apply vendor advance', credit: 'Vendor credit', refund: 'Vendor refund', writeoff: 'Payable write-off' },
};
const id = (row: Row) => String(row.id || row.refund_id || row.write_off_id || '');
const number = (row: Row) => row.credit_note_number || row.credit_number || row.payment_number || row.refund_number || row.write_off_number || row.id;
const date = (row: Row) => row.date || row.payment_date || row.received_date || row.paid_date || row.refund_date || row.write_off_date || row.applied_date || row.created_at;
const amount = (row: Row) => Number(row.amount ?? row.total_amount ?? row.amount_applied ?? row.taxable_amount ?? 0);
const status = (row: Row) => String(row.status || 'POSTED').toUpperCase();

export const SettlementWorkspace: React.FC<Props> = ({ side, initialResource, autoOpenCreateModal, onModalClosed, selectedEntityId, onSelectedEntityClosed }) => {
  const { settings } = useBooks();
  const capabilityState = useFinanceCapabilities();
  const all = definitions[side];
  const visible = useMemo(() => all.filter((item) => !item.capability || capabilityState.isEnabled(item.capability)), [all, capabilityState.capabilities]);
  const initial = all.find((item) => item.key === initialResource) || all[0];
  const [active, setActive] = useState(initial.key);
  const [rows, setRows] = useState<Row[]>([]);
  const [parties, setParties] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [advances, setAdvances] = useState<Row[]>([]);
  const [credits, setCredits] = useState<Row[]>([]);
  const [expenses, setExpenses] = useState<Row[]>([]);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [operation, setOperation] = useState(initial.operation);
  const [form, setForm] = useState<Record<string, string>>({ date: today(), amount: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [reverseTarget, setReverseTarget] = useState<Row | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const definition = visible.find((item) => item.key === active) || visible[0] || initial;
  const money = useCallback((value: unknown) => formatCurrency(Number(value || 0), settings.currencySymbol), [settings.currencySymbol]);

  useEffect(() => {
    if (!capabilityState.loading && !visible.some((item) => item.key === active)) setActive(visible[0]?.key || all[0].key);
  }, [active, all, capabilityState.loading, visible]);

  const load = useCallback(async (key = active): Promise<boolean> => {
    const target = all.find((item) => item.key === key) || all[0];
    setLoading(true); setError('');
    const partyEndpoint = side === 'receivable' ? '/finance/customers' : '/finance/vendors';
    const documentEndpoint = side === 'receivable' ? '/finance/invoices' : '/finance/bills';
    const advanceEndpoint = side === 'receivable' ? '/finance/customer-advances' : '/finance/vendor-advances';
    const creditEndpoint = side === 'receivable' ? '/finance/credit-notes' : '/finance/debit-notes';
    const results = await Promise.all([
      apiClient.get<Row[]>(target.endpoint), apiClient.get<Row[]>(partyEndpoint), apiClient.get<Row[]>(documentEndpoint),
      apiClient.get<Row[]>('/finance/accounts'), apiClient.get<Row[]>(advanceEndpoint), apiClient.get<Row[]>(creditEndpoint),
      side === 'payable' ? apiClient.get<Row[]>('/finance/expenses') : Promise.resolve({ data: [], error: null, status: 200 }),
    ]);
    setLoading(false);
    const failure = results.find((result) => result.error);
    if (failure?.error) { setError(failure.error); return false; }
    setRows(results[0].data || []); setParties(results[1].data || []); setDocuments(results[2].data || []);
    setAccounts(results[3].data || []); setAdvances(results[4].data || []); setCredits(results[5].data || []); setExpenses(results[6].data || []);
    return true;
  }, [active, all, side]);

  useEffect(() => { void load(active); }, [active, load]);
  useEffect(() => { setOperation(definition.operation); }, [definition.operation]);
  useEffect(() => { if (initialResource && visible.some((item) => item.key === initialResource)) setActive(initialResource); }, [initialResource, visible]);
  useEffect(() => { if (selectedEntityId) { const found = rows.find((row) => id(row) === selectedEntityId || String(number(row)) === selectedEntityId); if (found) setSelected(found); } }, [rows, selectedEntityId]);

  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const partyId = form.partyId || '';
  const partyDocuments = documents.filter((row) => String(row.customer_id || row.customerId || row.client_id || row.clientId || row.vendor_id || row.vendorId || '') === partyId);
  const partyAdvances = advances.filter((row) => String(row.customer_id || row.customerId || row.vendor_id || row.vendorId || '') === partyId && Number(row.unapplied_amount ?? row.unappliedAmount ?? row.unallocated_amount ?? 0) > 0 && status(row) !== 'REVERSED');
  const partyCredits = credits.filter((row) => String(row.customer_id || row.customerId || row.vendor_id || row.vendorId || '') === partyId && Number(row.remaining_credit ?? row.remainingCredit ?? row.available_credit ?? 0) > 0 && status(row) !== 'REVERSED');
  const party = parties.find((row) => String(row.id) === partyId);
  const partyExpenses = expenses.filter((row) => (String(row.vendor_id || row.vendorId || '') === partyId || String(row.vendor_name || row.vendorName || '').toLowerCase() === String(party?.name || '').toLowerCase()) && !['VOID', 'VOIDED'].includes(status(row)));
  const cashAccounts = accounts.filter((row) => row.type === 'Asset' && !row.is_locked && String(row.status).toLowerCase() !== 'inactive');
  const adjustmentAccounts = accounts.filter((row) => side === 'receivable' ? row.type === 'Expense' : ['Income', 'Expense'].includes(row.type));
  const operations = Object.entries(operationLabels[side]).filter(([value]) => value !== 'writeoff' || visible.some((item) => item.operation === 'writeoff'));
  const partyName = (row: Row) => row.client_name || row.customer_name || row.vendor_name || parties.find((item) => String(item.id) === String(row.customer_id || row.vendor_id))?.display_name || parties.find((item) => String(item.id) === String(row.customer_id || row.vendor_id))?.name || '—';

  const openCreate = () => { setForm({ date: today(), amount: '', reason: '', partyId: String(parties[0]?.id || '') }); setOperation(definition.operation); setError(''); setNotice(null); setModal(true); };
  useEffect(() => { if (autoOpenCreateModal) { openCreate(); onModalClosed?.(); } }, [autoOpenCreateModal]);
  const destination = (value: string) => all.find((item) => item.operation === value && (value !== 'apply-advance' || item.key === 'applications'))?.key || active;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const chosenParty = parties.find((item) => String(item.id) === form.partyId);
    const value = Number(form.amount);
    let endpoint = ''; let payload: Row = {};
    if (side === 'receivable') {
      if (operation === 'credit') { endpoint = '/finance/credit-notes'; payload = { customerId: chosenParty?.id, customerName: chosenParty?.display_name || chosenParty?.name, invoiceId: form.documentId || undefined, date: form.date, taxableAmount: value, taxAmount: 0, reason: form.reason }; }
      if (operation === 'apply-advance') { endpoint = '/finance/customer-advances/apply'; payload = { advanceId: form.advanceId, invoiceId: form.documentId, amountToApply: value, applyDate: form.date }; }
      if (operation === 'refund') { endpoint = '/finance/refunds'; payload = { customerId: chosenParty?.id, creditNoteId: form.creditId, refundDate: form.date, amount: value, refundAccountId: form.accountId, reference: form.reference, notes: form.reason }; }
      if (operation === 'writeoff') { endpoint = '/finance/write-offs'; payload = { invoiceId: form.documentId, customerId: chosenParty?.id, writeOffDate: form.date, amount: value, writeOffAccountId: form.accountId, reason: form.reason }; }
    } else {
      if (operation === 'payment') { endpoint = '/finance/vendor-payments'; payload = { vendorId: chosenParty?.id, vendorName: chosenParty?.name, paymentDate: form.date, amount: value, paymentMode: 'Bank Transfer', paidFromAccountId: form.accountId, reference: form.reference, allocations: form.documentId ? [{ billId: form.documentId, amount: value }] : [] }; }
      if (operation === 'advance') { endpoint = '/finance/vendor-advances'; payload = { vendorId: chosenParty?.id, vendorName: chosenParty?.name, paidDate: form.date, amount: value, paidFromAccountId: form.accountId, paymentMode: 'Bank Transfer', reference: form.reference }; }
      if (operation === 'apply-advance') { endpoint = '/finance/vendor-advances/apply'; payload = { vendorId: chosenParty?.id, advanceId: form.advanceId, billId: form.documentId, amount: value, appliedDate: form.date }; }
      if (operation === 'credit') { endpoint = '/finance/debit-notes'; payload = { vendorId: chosenParty?.id, vendorName: chosenParty?.name, billId: form.documentId || undefined, date: form.date, taxableAmount: value, taxAmount: 0, reason: form.reason }; }
      if (operation === 'refund') { const [sourceType, sourceId] = String(form.refundSource || '').split(':'); endpoint = '/finance/vendor-refunds'; payload = { vendorId: chosenParty?.id, refundDate: form.date, amount: value, depositToAccountId: form.accountId, debitNoteId: sourceType === 'credit' ? sourceId : undefined, advanceId: sourceType === 'advance' ? sourceId : undefined, expenseId: sourceType === 'expense' ? sourceId : undefined, reference: form.reference, notes: form.reason }; }
      if (operation === 'writeoff') { endpoint = '/finance/ap-write-offs'; payload = { billId: form.documentId, vendorId: chosenParty?.id, writeOffDate: form.date, amount: value, writeOffAccountId: form.accountId, reason: form.reason }; }
    }
    if (!endpoint || !chosenParty || !Number.isFinite(value) || value <= 0) { setError('Select a party and enter a valid positive amount.'); return; }
    if (operation === 'refund' && side === 'payable' && !form.refundSource) { setError('Select the debit note, advance, or direct expense that created this refund.'); return; }
    setBusy(true); setError(''); setNotice(null);
    const response = await apiClient.post(endpoint, payload); setBusy(false);
    if (response.error) { setNotice(mutationFailureNotice(response, { action: 'Posting', failureTitle: 'Transaction was not posted', uncertainTitle: 'Posting outcome could not be confirmed', uncertainRecovery: 'Refresh the authoritative register before retrying; the transaction may already have committed.' })); return; }
    const target = destination(operation); setModal(false); setActive(target);
    const refreshed = await load(target); const operationLabel = operationLabels[side][operation] || 'Transaction';
    setNotice(refreshed ? { tone: 'success', title: `${operationLabel} posted`, message: 'The source record, balances, and journal committed together.', requestId: response.requestId } : committedButStaleNotice(`${operationLabel} posted, but the register is stale`, 'The source record, balances, and journal committed together.', response.requestId));
  };

  const reverseRoute = (row: Row) => ({
    receivable: { credits: `/finance/credit-notes/${id(row)}/reverse`, applications: `/finance/customer-advance-applications/${id(row)}/reverse`, refunds: `/finance/refunds/${id(row)}/reverse`, writeoffs: `/finance/write-offs/${id(row)}/reverse` },
    payable: { payments: `/finance/vendor-payments/${id(row)}/reverse`, advances: `/finance/vendor-advances/${id(row)}/reverse`, applications: `/finance/vendor-advance-applications/${id(row)}/reverse`, credits: `/finance/debit-notes/${id(row)}/reverse`, refunds: `/finance/vendor-refunds/${id(row)}/reverse`, writeoffs: `/finance/ap-write-offs/${id(row)}/reverse` },
  } as Record<Side, Record<string, string>>)[side][active];

  const confirmReverse = async (event: React.FormEvent) => {
    event.preventDefault(); if (!reverseTarget || reverseReason.trim().length < 3) return;
    const reference = number(reverseTarget); setBusy(true); setNotice(null);
    const response = await apiClient.post(reverseRoute(reverseTarget), { reason: reverseReason.trim() }); setBusy(false);
    if (response.error) { setNotice(mutationFailureNotice(response, { action: 'Reversal', failureTitle: 'Transaction was not reversed', uncertainTitle: 'Reversal outcome could not be confirmed', uncertainRecovery: 'Refresh the authoritative register before retrying; the reversal journal may already exist.' })); return; }
    setReverseTarget(null); setReverseReason(''); const refreshed = await load(active);
    setNotice(refreshed ? { tone: 'success', title: 'Reversal posted', message: `${reference} remains in history with its linked reversal journal.`, requestId: response.requestId } : committedButStaleNotice('Reversal posted, but the register is stale', `${reference} remains in history with its linked reversal journal.`, response.requestId));
  };

  const total = filtered.reduce((sum, row) => status(row) === 'REVERSED' ? sum : sum + amount(row), 0);
  const label = side === 'receivable' ? 'Receivables corrections' : 'Payables settlement';
  const icon = side === 'receivable' ? <ArrowDownToLine className="h-6 w-6 text-teal-700" /> : <ArrowUpFromLine className="h-6 w-6 text-emerald-700" />;
  const setSourceAmount = (kind: string, source?: Row) => kind === 'credit' ? Number(source?.remaining_credit ?? source?.remainingCredit ?? 0) : kind === 'advance' ? Number(source?.unapplied_amount ?? source?.unappliedAmount ?? 0) : Number(source?.amount ?? 0);

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center dark:border-slate-800"><div><h2 className="flex items-center gap-2 text-xl font-bold">{icon}{label}</h2><p className="mt-1 text-xs text-slate-500">Posted documents, allocations, balances, journals, and reversals commit together.</p></div><div className="flex gap-2"><button type="button" aria-label={`Refresh ${definition.label}`} onClick={() => void load(active)} className="rounded-lg border border-slate-300 p-2"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button type="button" onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4" />New transaction</button></div></div>
    {notice && <OperationNoticeBanner notice={notice} />}
    {error && <div role="alert" className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-4"><div className="text-[10px] font-bold uppercase text-slate-500">Current register</div><div className="mt-1 text-lg font-bold">{definition.label}</div></div><div className="rounded-xl border p-4"><div className="text-[10px] font-bold uppercase text-slate-500">Active value</div><div className="mt-1 font-mono text-lg font-bold">{money(total)}</div></div><div className="rounded-xl border p-4"><div className="text-[10px] font-bold uppercase text-slate-500">Audit state</div><div className="mt-1 text-sm font-semibold">{filtered.length} records · {filtered.filter((row) => status(row) === 'REVERSED').length} reversed</div></div></div>
    <div className="flex gap-1 overflow-x-auto border-b">{visible.map((item) => <button type="button" key={item.key} onClick={() => setActive(item.key)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-xs font-bold ${active === item.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500'}`}>{item.label}</button>)}</div>
    <div className="relative max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input aria-label={`Search ${definition.label}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${definition.label.toLowerCase()}`} className="w-full rounded-lg border py-2 pl-9 pr-3 text-xs" /></div>
    <div className="overflow-x-auto border-y"><table className="mobile-record-table w-full min-w-[720px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th className="p-3">Reference</th><th className="p-3">Party</th><th className="p-3">Date</th><th className="p-3">Status</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y">{loading ? <tr><td colSpan={6} className="p-10 text-center">Loading authoritative records…</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="p-10 text-center">No authoritative {definition.label.toLowerCase()} records.</td></tr> : filtered.map((row) => <tr key={id(row)}><td data-label="Reference" className="p-3"><button type="button" onClick={() => setSelected(row)} className="font-mono font-bold text-blue-700 hover:underline">{number(row)}</button></td><td data-label="Party" className="p-3 font-semibold">{partyName(row)}</td><td data-label="Date" className="p-3">{date(row) ? formatDate(date(row)) : '—'}</td><td data-label="Status" className="p-3 font-bold">{status(row)}</td><td data-label="Amount" className="p-3 text-right font-mono font-bold">{money(amount(row))}</td><td data-label="Actions" className="p-3 text-right"><button type="button" aria-label={`View ${number(row)}`} onClick={() => setSelected(row)} className="p-1.5"><Eye className="h-4 w-4" /></button>{status(row) !== 'REVERSED' && reverseRoute(row) && <button type="button" aria-label={`Reverse ${number(row)}`} onClick={() => { setReverseTarget(row); setReverseReason(''); setNotice(null); }} className="p-1.5 text-rose-700"><RotateCcw className="h-4 w-4" /></button>}</td></tr>)}</tbody></table></div>

    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4"><div role="dialog" aria-modal="true" aria-labelledby="settlement-detail-title" className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"><div className="flex justify-between"><div><p className="text-[10px] font-bold uppercase text-blue-700">Authoritative record</p><h3 id="settlement-detail-title" className="mt-1 font-bold">{number(selected)}</h3></div><button type="button" aria-label="Close transaction details" onClick={() => { setSelected(null); onSelectedEntityClosed?.(); }}><X className="h-4 w-4" /></button></div><dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-3"><dt>Party</dt><dd className="font-semibold">{partyName(selected)}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt>Amount</dt><dd className="font-mono font-semibold">{money(amount(selected))}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt>Date</dt><dd>{date(selected) ? formatDate(date(selected)) : '—'}</dd></div><div className="rounded-lg bg-slate-50 p-3"><dt>Status</dt><dd className="font-semibold">{status(selected)}</dd></div></dl><div className="mt-3 rounded-lg border p-3 text-xs"><div className="flex gap-2 font-bold"><FileText className="h-4 w-4" />Posting evidence</div><div className="mt-2 space-y-1 font-mono text-[11px]"><p>Record ID: {id(selected)}</p><p>Journal: {selected.journal_entry_id || selected.journalEntryId || 'Not exposed'}</p><p>Reversal journal: {selected.reversal_journal_id || selected.reversalJournalId || 'None'}</p><p>Source: {selected.bill_id || selected.invoice_id || selected.debit_note_id || selected.advance_id || selected.expense_id || 'Unallocated'}</p></div></div></div></div>}
    {reverseTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><form onSubmit={confirmReverse} role="dialog" aria-modal="true" aria-labelledby="settlement-reverse-title" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"><h3 id="settlement-reverse-title" className="font-bold">Reverse {number(reverseTarget)}?</h3><p className="mt-2 text-xs text-slate-500">The original remains immutable. A linked reversal journal restores balances and preserves the audit trail.</p><div className="mt-4 rounded-lg bg-rose-50 p-3 text-xs">Affected value: <b>{money(amount(reverseTarget))}</b>. Reconciled or period-locked records will be rejected.</div><label className="mt-4 block text-xs font-bold">Reversal reason<textarea required minLength={3} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border p-2.5" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" disabled={busy} onClick={() => setReverseTarget(null)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button><button type="submit" disabled={busy || reverseReason.trim().length < 3} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Reversing…' : 'Post reversal'}</button></div></form></div>}
    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4"><div role="dialog" aria-modal="true" aria-labelledby="settlement-create-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"><div className="mb-4 flex justify-between"><div><h3 id="settlement-create-title" className="font-bold">New {label.toLowerCase()} transaction</h3><p className="text-xs text-slate-500">The server assigns record and journal numbers.</p></div><button type="button" aria-label="Close transaction form" onClick={() => setModal(false)}><X className="h-4 w-4" /></button></div><form onSubmit={submit} className="space-y-3">
      <label className="block text-xs font-bold">Transaction type<select aria-label="Transaction type" value={operation} onChange={(event) => { setOperation(event.target.value); setForm({ date: form.date || today(), partyId: form.partyId || '', amount: '', reason: '' }); }} className="mt-1 w-full rounded-lg border p-2.5">{operations.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label className="block text-xs font-bold">{side === 'receivable' ? 'Customer' : 'Vendor'}<select aria-label={side === 'receivable' ? 'Customer' : 'Vendor'} required value={form.partyId || ''} onChange={(event) => setForm({ ...form, partyId: event.target.value, documentId: '', advanceId: '', creditId: '', refundSource: '' })} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Select</option>{parties.map((item) => <option key={item.id} value={item.id}>{item.display_name || item.name}</option>)}</select></label>
      {['payment', 'credit', 'apply-advance', 'writeoff'].includes(operation) && <label className="block text-xs font-bold">{side === 'receivable' ? 'Invoice' : 'Bill'}{operation === 'credit' || operation === 'payment' ? ' (optional)' : ''}<select required={operation !== 'credit' && operation !== 'payment'} value={form.documentId || ''} onChange={(event) => { const documentId = event.target.value; const record = partyDocuments.find((item) => String(item.id) === documentId); const balance = Number(record?.balance_due ?? record?.balanceDue ?? record?.total_amount ?? record?.totalAmount ?? 0); setForm({ ...form, documentId, amount: balance > 0 ? String(balance) : form.amount }); }} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Unallocated</option>{partyDocuments.filter((item) => Number(item.balance_due ?? item.balanceDue ?? item.total_amount ?? item.totalAmount ?? 0) > 0).map((item) => <option key={item.id} value={item.id}>{item.invoice_number || item.invoiceNumber || item.bill_number || item.billNumber || item.id} · {money(item.balance_due ?? item.balanceDue ?? item.total_amount ?? item.totalAmount)}</option>)}</select></label>}
      {operation === 'apply-advance' && <label className="block text-xs font-bold">Available advance<select required value={form.advanceId || ''} onChange={(event) => { const record = partyAdvances.find((item) => String(item.id) === event.target.value); setForm({ ...form, advanceId: event.target.value, amount: String(record?.unapplied_amount ?? record?.unappliedAmount ?? form.amount) }); }} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Select advance</option>{partyAdvances.map((item) => <option key={item.id} value={item.id}>{item.advance_number || item.id} · {money(item.unapplied_amount ?? item.unappliedAmount)}</option>)}</select></label>}
      {operation === 'refund' && side === 'receivable' && <label className="block text-xs font-bold">Credit note<select required value={form.creditId || ''} onChange={(event) => setForm({ ...form, creditId: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Select credit</option>{partyCredits.map((item) => <option key={item.id} value={item.id}>{item.credit_note_number || item.credit_number} · {money(item.remaining_credit ?? item.remainingCredit)}</option>)}</select></label>}
      {operation === 'refund' && side === 'payable' && <label className="block text-xs font-bold">Refund source<select required value={form.refundSource || ''} onChange={(event) => { const [kind, sourceId] = event.target.value.split(':'); const source = kind === 'credit' ? partyCredits.find((item) => String(item.id) === sourceId) : kind === 'advance' ? partyAdvances.find((item) => String(item.id) === sourceId) : partyExpenses.find((item) => String(item.id) === sourceId); setForm({ ...form, refundSource: event.target.value, amount: String(setSourceAmount(kind, source) || form.amount) }); }} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Select debit note, advance, or expense</option>{partyCredits.map((item) => <option key={item.id} value={`credit:${item.id}`}>Credit · {item.credit_number || item.id} · {money(item.remaining_credit)}</option>)}{partyAdvances.map((item) => <option key={item.id} value={`advance:${item.id}`}>Advance · {item.advance_number || item.id} · {money(item.unapplied_amount)}</option>)}{partyExpenses.map((item) => <option key={item.id} value={`expense:${item.id}`}>Expense · {item.reference_number || item.id} · {money(item.amount)}</option>)}</select></label>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Date<input aria-label="Date" required type="date" value={form.date || today()} onChange={(event) => setForm({ ...form, date: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label><label className="text-xs font-bold">Amount<input aria-label="Amount" required type="number" min="0.01" step="0.01" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5" /></label></div>
      {['payment', 'advance', 'refund', 'writeoff'].includes(operation) && <label className="block text-xs font-bold">{operation === 'writeoff' ? 'Adjustment account' : operation === 'refund' && side === 'payable' ? 'Deposit account' : operation === 'refund' ? 'Refund account' : 'Bank account'}<select required value={form.accountId || ''} onChange={(event) => setForm({ ...form, accountId: event.target.value })} className="mt-1 w-full rounded-lg border p-2.5"><option value="">Select account</option>{(operation === 'writeoff' ? adjustmentAccounts : cashAccounts).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>}
      <label className="block text-xs font-bold">Reason or reference<textarea aria-label="Reason or reference" required={['credit', 'writeoff'].includes(operation)} value={form.reason || ''} onChange={(event) => setForm({ ...form, reason: event.target.value, reference: event.target.value })} rows={2} className="mt-1 w-full rounded-lg border p-2.5" /></label>
      <div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button><button disabled={busy} type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Posting…' : 'Post transaction'}</button></div>
    </form></div></div>}
  </div>;
};
