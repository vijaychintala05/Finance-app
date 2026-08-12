import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ShieldCheck, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

interface RecordBankTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAccountId?: string;
  defaultType?: 'DEBIT' | 'CREDIT';
}

const CONTROL_CODES = new Set(['1100', '1200', '1400', '2000', '2100', '2200']);
const CONTROL_SUBTYPES = new Set(['Accounts Receivable', 'Accounts Payable', 'Taxes Payable']);

export const RecordBankTransactionModal: React.FC<RecordBankTransactionModalProps> = ({
  isOpen,
  onClose,
  defaultAccountId,
  defaultType = 'DEBIT',
}) => {
  const { accounts, addJournalEntry, settings } = useBooks();
  const treasuryAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.type === 'Asset' &&
          account.status !== 'Inactive' &&
          !account.isLocked &&
          (account.code === '1000' ||
            ['Bank', 'Cash', 'Cash & Bank', 'Digital Wallet'].includes(account.subType))
      ),
    [accounts]
  );
  const counterAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.status !== 'Inactive' &&
          !account.isLocked &&
          !CONTROL_CODES.has(account.code) &&
          !CONTROL_SUBTYPES.has(account.subType)
      ),
    [accounts]
  );

  const [direction, setDirection] = useState<'DEBIT' | 'CREDIT'>(defaultType);
  const [treasuryAccountId, setTreasuryAccountId] = useState('');
  const [counterAccountId, setCounterAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const selectedTreasury = treasuryAccounts.some((account) => account.id === defaultAccountId)
      ? defaultAccountId || ''
      : treasuryAccounts[0]?.id || '';
    setDirection(defaultType);
    setTreasuryAccountId(selectedTreasury);
    setCounterAccountId(counterAccounts.find((account) => account.id !== selectedTreasury)?.id || '');
    setAmount('');
    setDate(new Date().toISOString().slice(0, 10));
    setReference('');
    setDescription('');
    setError('');
    setIsSubmitting(false);
  }, [isOpen, defaultAccountId, defaultType, treasuryAccounts, counterAccounts]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const parsedAmount = Number(amount);
    const treasuryAccount = treasuryAccounts.find((account) => account.id === treasuryAccountId);
    const counterAccount = counterAccounts.find((account) => account.id === counterAccountId);

    if (!treasuryAccount || !counterAccount || treasuryAccount.id === counterAccount.id) {
      setError('Select two different active, unlocked accounts.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 1e-7) {
      setError('Amount must be positive and contain no more than two decimal places.');
      return;
    }
    if (!reference.trim() || reference.trim().length > 255) {
      setError('Enter a bank or source reference of no more than 255 characters.');
      return;
    }
    if (description.trim().length < 3 || description.trim().length > 500) {
      setError('Enter a business-purpose description between 3 and 500 characters.');
      return;
    }

    const treasuryLine = {
      accountId: treasuryAccount.id,
      accountCode: treasuryAccount.code,
      accountName: treasuryAccount.name,
      debit: direction === 'DEBIT' ? parsedAmount : 0,
      credit: direction === 'CREDIT' ? parsedAmount : 0,
      description: description.trim(),
    };
    const counterLine = {
      accountId: counterAccount.id,
      accountCode: counterAccount.code,
      accountName: counterAccount.name,
      debit: direction === 'CREDIT' ? parsedAmount : 0,
      credit: direction === 'DEBIT' ? parsedAmount : 0,
      description: description.trim(),
    };

    setIsSubmitting(true);
    try {
      const posted = await addJournalEntry({
        date,
        reference: reference.trim(),
        description: description.trim(),
        lines: [treasuryLine, counterLine],
        status: 'Posted',
      });
      if (!posted) throw new Error('The journal was not balanced and was not posted.');
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Bank transaction could not be posted. No financial data was changed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const unavailable = treasuryAccounts.length === 0 || counterAccounts.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-xs" onClick={onClose}>
      <div className="my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Post bank journal</h3>
            <p className="mt-1 text-xs text-slate-500">Both ledger accounts must be selected explicitly.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>The server verifies tenancy, period locks, control-account restrictions, cent precision, and balanced debits and credits before committing.</p>
          </div>

          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}
          {unavailable && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">An eligible treasury and counter-account are required before posting.</div>}

          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            <button type="button" onClick={() => setDirection('DEBIT')} className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${direction === 'DEBIT' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}>
              <ArrowDownLeft className="h-4 w-4" /> Money in
            </button>
            <button type="button" onClick={() => setDirection('CREDIT')} className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold ${direction === 'CREDIT' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}>
              <ArrowUpRight className="h-4 w-4" /> Money out
            </button>
          </div>

          <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Bank, cash, or wallet account</span>
            <select required value={treasuryAccountId} onChange={(event) => setTreasuryAccountId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">Select treasury account</option>
              {treasuryAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name} ({settings.currencySymbol}{account.balance.toFixed(2)})</option>)}
            </select>
          </label>

          <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Counter-account</span>
            <select required value={counterAccountId} onChange={(event) => setCounterAccountId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              <option value="">Select counter-account</option>
              {counterAccounts.filter((account) => account.id !== treasuryAccountId).map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
            </select>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Amount ({settings.currencyCode})</span>
              <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Posting date</span>
              <input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-semibold text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
          </div>

          <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Bank/source reference</span>
            <input required maxLength={255} value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Statement or transfer reference" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono font-semibold text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </label>

          <label className="block space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Business purpose</span>
            <textarea required minLength={3} maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-medium text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={unavailable || isSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? 'Posting…' : 'Post balanced journal'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
