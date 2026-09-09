import React, { useEffect, useMemo, useState } from 'react';
import { FilePlus2, ShieldCheck, Undo2, X } from 'lucide-react';
import { Account, FirmSettings } from '../../types';
import { BankAccount, BankStatementTransaction } from '../../types/banking';
import { BankingService } from '../../services/bankingService';
import { formatCurrency } from '../../utils/formatters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  account: Account | null;
  bankAccount: BankAccount | null;
  accounts: Account[];
  settings: FirmSettings;
  onReconcileComplete?: () => void;
  onStatementMutation?: () => void;
}

/** Statement-created journals remain linked to their statement line and can only be undone by a reversal. */
export const ReconcileBankModal: React.FC<Props> = ({
  isOpen, onClose, account, bankAccount, accounts, settings, onReconcileComplete, onStatementMutation,
}) => {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState('');
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statementTransactions, setStatementTransactions] = useState<BankStatementTransaction[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [statementDescription, setStatementDescription] = useState('');
  const [reversalReason, setReversalReason] = useState('');

  const counterAccounts = useMemo(
    () => accounts.filter((candidate) => candidate.id !== account?.id && candidate.status !== 'Inactive' && !candidate.isLocked),
    [accounts, account?.id]
  );

  const loadStatements = React.useCallback(async () => {
    if (!bankAccount) return;
    try {
      const rows = await BankingService.getTransactions({ bankAccountId: bankAccount.id, limit: 100 });
      setStatementTransactions(rows);
      const current = rows.find((row) => row.id === selectedStatementId);
      if (!current || current.reconciliationStatus === 'UNMATCHED') {
        setSelectedStatementId(rows.find((row) => row.reconciliationStatus === 'UNMATCHED')?.id || '');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Statement transactions could not be loaded.');
    }
  }, [bankAccount, selectedStatementId]);

  useEffect(() => {
    if (!isOpen) return;
    setError(''); setSummary(null); setStatementDescription(''); setReversalReason('');
    setTargetAccountId((current) => counterAccounts.some((item) => item.id === current) ? current : counterAccounts[0]?.id || '');
    void loadStatements();
  }, [isOpen, loadStatements, counterAccounts]);

  if (!isOpen || !account) return null;
  const selectedStatement = statementTransactions.find((row) => row.id === selectedStatementId);

  const review = async () => {
    setError('');
    if (!bankAccount) return setError('Create or link the bank account profile first.');
    const parsed = Number(balance);
    if (!Number.isFinite(parsed)) return setError('Enter the statement closing balance.');
    setBusy(true);
    try { setSummary(await BankingService.getReconciliationSummary(bankAccount.id, date, parsed, account.balance)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not verify reconciliation.'); }
    finally { setBusy(false); }
  };
  const complete = async () => {
    if (!summary || summary.status !== 'BALANCED' || !bankAccount) return;
    setBusy(true);
    try { await BankingService.completeReconciliationSession(bankAccount.id, date, Number(balance), account.balance); onReconcileComplete?.(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Reconciliation was not completed.'); }
    finally { setBusy(false); }
  };
  const createFromStatement = async () => {
    if (!selectedStatement || !targetAccountId) return setError('Select an unmatched statement line and an accounting counter-account.');
    if (selectedStatement.reconciliationStatus !== 'UNMATCHED') return setError('Only an unmatched statement line can create a new accounting transaction.');
    setBusy(true); setError('');
    try { await BankingService.createTransactionFromStatement(selectedStatement.id, targetAccountId, statementDescription.trim() || undefined); await loadStatements(); onStatementMutation?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The accounting transaction was not created.'); }
    finally { setBusy(false); }
  };
  const reverseCreatedStatementTransaction = async () => {
    if (!selectedStatement) return setError('Select the statement line created from accounting.');
    if (reversalReason.trim().length < 3) return setError('Enter a reversal reason with at least 3 characters.');
    setBusy(true); setError('');
    try { await BankingService.reverseTransactionCreatedFromStatement(selectedStatement.id, reversalReason.trim()); await loadStatements(); onStatementMutation?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The created accounting transaction was not reversed.'); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4"><div className="my-auto w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
    <div className="flex justify-between border-b p-5"><div className="flex gap-2"><ShieldCheck className="h-5 w-5 text-blue-600"/><div><h3 className="text-sm font-bold">Bank Reconciliation</h3><p className="text-[11px] text-slate-500">{account.code} · {account.name}</p></div></div><button onClick={onClose} aria-label="Close reconciliation"><X className="h-4 w-4"/></button></div>
    <div className="space-y-5 p-6">{error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
      <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Statement end date<input type="date" value={date} onChange={(e)=>{setDate(e.target.value);setSummary(null);}} className="mt-1 w-full rounded-xl border p-2"/></label><label className="text-xs font-bold">Closing balance<input type="number" step="0.01" value={balance} onChange={(e)=>{setBalance(e.target.value);setSummary(null);}} className="mt-1 w-full rounded-xl border p-2"/></label></div>
      <div className="rounded-xl bg-slate-50 p-4 text-xs"><div className="flex justify-between"><span>Authoritative GL balance</span><strong>{formatCurrency(account.balance, settings.currencySymbol)}</strong></div>{summary && <><div className="mt-2 flex justify-between"><span>Verified difference</span><strong className={summary.status === 'BALANCED' ? 'text-emerald-600' : 'text-rose-600'}>{formatCurrency(summary.difference, settings.currencySymbol)}</strong></div><p className="mt-2 font-bold">{summary.status === 'BALANCED' ? 'Balanced — ready to complete' : 'Resolve the difference before completion'}</p></>}</div>
      <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div><h4 className="text-xs font-extrabold">Statement-line accounting</h4><p className="mt-1 text-[11px] text-slate-500">Create a balanced journal only from the selected unmatched bank statement line. Reversing it also restores that line to unmatched.</p></div>
        <label className="block text-xs font-bold">Statement line<select value={selectedStatementId} onChange={(event)=>setSelectedStatementId(event.target.value)} className="mt-1 w-full rounded-xl border p-2"><option value="">Select statement line</option>{statementTransactions.map((row)=><option key={row.id} value={row.id}>{row.transactionDate} · {row.direction} · {formatCurrency(row.amount, settings.currencySymbol)} · {row.reconciliationStatus} · {row.narration.slice(0, 55)}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Counter-account<select value={targetAccountId} onChange={(event)=>setTargetAccountId(event.target.value)} disabled={selectedStatement?.reconciliationStatus !== 'UNMATCHED'} className="mt-1 w-full rounded-xl border p-2 disabled:opacity-60"><option value="">Select account</option>{counterAccounts.map((item)=><option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></label><label className="text-xs font-bold">Description override<input value={statementDescription} onChange={(event)=>setStatementDescription(event.target.value)} disabled={selectedStatement?.reconciliationStatus !== 'UNMATCHED'} maxLength={500} className="mt-1 w-full rounded-xl border p-2 disabled:opacity-60"/></label></div>
        {selectedStatement?.reconciliationStatus === 'UNMATCHED' ? <button type="button" onClick={createFromStatement} disabled={busy || !targetAccountId} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><FilePlus2 className="h-4 w-4"/>Create and match journal</button> : <div className="space-y-2"><label className="block text-xs font-bold">Reversal reason<input value={reversalReason} onChange={(event)=>setReversalReason(event.target.value)} minLength={3} maxLength={1000} placeholder="Why this statement-created entry must be reversed" className="mt-1 w-full rounded-xl border p-2"/></label><button type="button" onClick={reverseCreatedStatementTransaction} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50"><Undo2 className="h-4 w-4"/>Reverse created journal</button></div>}
      </section>
      <div className="flex justify-end gap-2"><button onClick={review} disabled={busy} className="rounded-xl border px-4 py-2 text-xs font-bold">Verify</button><button onClick={complete} disabled={busy || summary?.status !== 'BALANCED'} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Complete reconciliation</button></div>
    </div>
  </div></div>;
};
