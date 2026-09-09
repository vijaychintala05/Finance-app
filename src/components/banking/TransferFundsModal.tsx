import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Undo2, X } from 'lucide-react';
import { BankAccount } from '../../types/banking';
import { BankingService } from '../../services/bankingService';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bankAccounts: BankAccount[];
  defaultFromBankAccountId?: string;
  onChanged?: () => void;
}

export const TransferFundsModal: React.FC<Props> = ({ isOpen, onClose, bankAccounts, defaultFromBankAccountId, onChanged }) => {
  const eligible = useMemo(() => bankAccounts.filter((account) => account.isActive && account.status === 'Active'), [bankAccounts]);
  const [fromBankAccountId, setFromBankAccountId] = useState('');
  const [toBankAccountId, setToBankAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [transfers, setTransfers] = useState<Array<any>>([]);
  const [reversalReason, setReversalReason] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadTransfers = React.useCallback(async () => {
    try { setTransfers(await BankingService.getTransfers()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Transfers could not be loaded.'); }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setFromBankAccountId(eligible.some((item) => item.id === defaultFromBankAccountId) ? defaultFromBankAccountId || '' : eligible[0]?.id || '');
    setToBankAccountId(eligible.find((item) => item.id !== defaultFromBankAccountId)?.id || '');
    setAmount(''); setReference(''); setDescription(''); setError(''); setBusy(false);
    void loadTransfers();
  }, [isOpen, eligible, defaultFromBankAccountId, loadTransfers]);

  if (!isOpen) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    const parsedAmount = Number(amount);
    if (!fromBankAccountId || !toBankAccountId || fromBankAccountId === toBankAccountId) return setError('Select two different active bank accounts.');
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 1e-7) return setError('Enter a positive amount with no more than two decimal places.');
    setBusy(true);
    try {
      await BankingService.createTransfer({ fromBankAccountId, toBankAccountId, amount: parsedAmount, transferDate, reference: reference.trim() || undefined, description: description.trim() || undefined });
      await loadTransfers(); onChanged?.(); setAmount(''); setReference(''); setDescription('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The transfer was not created.'); }
    finally { setBusy(false); }
  };
  const reverse = async (transferId: string) => {
    const reason = reversalReason[transferId]?.trim() || '';
    if (reason.length < 3) return setError('Enter a reversal reason with at least 3 characters.');
    setBusy(true); setError('');
    try { await BankingService.reverseTransfer(transferId, reason); await loadTransfers(); onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The transfer was not reversed.'); }
    finally { setBusy(false); }
  };
  const accountName = (id: string) => eligible.find((item) => item.id === id)?.accountName || id;

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"><div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
    <div className="flex items-center justify-between border-b p-5"><div className="flex gap-2"><ArrowLeftRight className="h-5 w-5 text-blue-600"/><div><h3 className="text-sm font-bold">Transfer funds</h3><p className="text-[11px] text-slate-500">Posts a source document and a balanced bank-to-bank journal.</p></div></div><button onClick={onClose} aria-label="Close transfer funds"><X className="h-4 w-4"/></button></div>
    <div className="space-y-5 p-6">{error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">From<select value={fromBankAccountId} onChange={(event) => setFromBankAccountId(event.target.value)} className="mt-1 w-full rounded-xl border p-2"><option value="">Select source</option>{eligible.map((item) => <option key={item.id} value={item.id}>{item.accountName}</option>)}</select></label><label className="text-xs font-bold">To<select value={toBankAccountId} onChange={(event) => setToBankAccountId(event.target.value)} className="mt-1 w-full rounded-xl border p-2"><option value="">Select destination</option>{eligible.filter((item) => item.id !== fromBankAccountId).map((item) => <option key={item.id} value={item.id}>{item.accountName}</option>)}</select></label><label className="text-xs font-bold">Amount<input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-xl border p-2"/></label><label className="text-xs font-bold">Transfer date<input required type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} className="mt-1 w-full rounded-xl border p-2"/></label><label className="text-xs font-bold">Reference<input value={reference} maxLength={255} onChange={(event) => setReference(event.target.value)} className="mt-1 w-full rounded-xl border p-2"/></label><label className="text-xs font-bold">Description<input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-xl border p-2"/></label><div className="sm:col-span-2 flex justify-end"><button disabled={busy || eligible.length < 2} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Posting…' : 'Post transfer'}</button></div></form>
      <section className="border-t pt-4"><h4 className="text-xs font-extrabold">Recent transfers</h4><div className="mt-2 max-h-64 space-y-2 overflow-y-auto">{transfers.length === 0 ? <p className="text-xs text-slate-500">No bank transfers recorded.</p> : transfers.map((transfer) => <div key={transfer.id} className="rounded-xl border p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{transfer.transfer_number}</span><span className={String(transfer.status).toUpperCase() === 'POSTED' ? 'text-emerald-700' : 'text-slate-500'}>{transfer.status}</span></div><p className="mt-1 text-slate-600">{transfer.transfer_date} · {accountName(transfer.from_bank_account_id)} → {accountName(transfer.to_bank_account_id)} · {Number(transfer.amount).toFixed(2)}</p>{String(transfer.status).toUpperCase() === 'POSTED' && <div className="mt-2 flex gap-2"><input value={reversalReason[transfer.id] || ''} onChange={(event) => setReversalReason((current) => ({ ...current, [transfer.id]: event.target.value }))} placeholder="Reversal reason" minLength={3} className="min-w-0 flex-1 rounded-lg border px-2 py-1"/><button type="button" onClick={() => reverse(transfer.id)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 font-bold text-rose-700 disabled:opacity-50"><Undo2 className="h-3.5 w-3.5"/>Reverse</button></div>}</div>)}</div></section>
    </div>
  </div></div>;
};
