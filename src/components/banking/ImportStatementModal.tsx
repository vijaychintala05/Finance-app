import React, { useState } from 'react';
import { FileSpreadsheet, ShieldCheck, X } from 'lucide-react';
import { Account } from '../../types';
import { BankAccount, BankStatementSourceFormat } from '../../types/banking';
import { BankingService } from '../../services/bankingService';

interface ImportStatementModalProps {
  isOpen: boolean; onClose: () => void; account: Account | null; bankAccount: BankAccount | null; onImported?: () => void;
}

export const ImportStatementModal: React.FC<ImportStatementModalProps> = ({ isOpen, onClose, account, bankAccount, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!isOpen || !account) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!bankAccount) { setError('Create or link the bank account profile before importing a statement.'); return; }
    if (!file) { setError('Choose a supported statement file.'); return; }
    const extension = file.name.split('.').pop()?.toUpperCase();
    const format = extension === 'XML' ? 'CAMT053' : extension as BankStatementSourceFormat;
    if (!['CSV', 'OFX', 'MT940', 'CAMT053'].includes(format)) { setError('Supported formats are CSV, OFX, MT940, and CAMT.053 XML.'); return; }
    setBusy(true);
    try {
      const content = await file.text();
      await BankingService.importStatement(bankAccount.id, file.name, content, format);
      onImported?.(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Statement import failed without changing the ledger.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800"><div className="flex gap-2"><FileSpreadsheet className="h-5 w-5 text-blue-600"/><div><h3 className="text-sm font-bold">Import Bank Statement</h3><p className="text-[11px] text-slate-500">{account.code} · {account.name}</p></div></div><button onClick={onClose} aria-label="Close"><X className="h-4 w-4"/></button></div>
      <form onSubmit={submit} className="space-y-4 p-6">
        <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><ShieldCheck className="h-4 w-4 shrink-0"/><p>Imports are tenant-scoped, fingerprint-deduplicated, audited, and never post to the general ledger.</p></div>
        {error && <div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
        <input type="file" required accept=".csv,.ofx,.mt940,.sta,.xml" onChange={(event) => setFile(event.target.files?.[0] || null)} className="w-full rounded-xl border border-slate-300 p-3 text-xs"/>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold">Cancel</button><button disabled={busy || !bankAccount} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Importing…' : 'Import statement'}</button></div>
      </form>
    </div>
  </div>;
};
