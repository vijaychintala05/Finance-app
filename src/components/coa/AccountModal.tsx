import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, ShieldCheck, X } from 'lucide-react';
import { Account, AccountSubType, AccountType } from '../../types';
import { useBooks } from '../../context/BooksContext';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialParentId?: string;
  initialSubCategory?: string;
  accountToEdit?: Account | null;
}

export const ACCOUNT_TYPE_CATALOG: Array<{
  category: AccountType;
  subType: AccountSubType;
  description: string;
}> = [
  { category: 'Asset', subType: 'Bank', description: 'Bank account' },
  { category: 'Asset', subType: 'Cash', description: 'Cash on hand' },
  { category: 'Asset', subType: 'Digital Wallet', description: 'Digital wallet' },
  { category: 'Asset', subType: 'Undeposited Funds', description: 'Undeposited receipts' },
  { category: 'Asset', subType: 'Inventory', description: 'Inventory asset' },
  { category: 'Asset', subType: 'Fixed Assets', description: 'Fixed asset' },
  { category: 'Asset', subType: 'Other Current Assets', description: 'Other current asset' },
  { category: 'Asset', subType: 'Other Assets', description: 'Other asset' },
  { category: 'Liability', subType: 'Credit Cards', description: 'Credit card liability' },
  { category: 'Liability', subType: 'Payroll Liabilities', description: 'Payroll liability' },
  { category: 'Liability', subType: 'Loans', description: 'Loan payable' },
  { category: 'Liability', subType: 'Other Liabilities', description: 'Other liability' },
  { category: 'Equity', subType: 'Capital', description: 'Owner capital' },
  { category: 'Equity', subType: 'Retained Earnings', description: 'Retained earnings' },
  { category: 'Equity', subType: 'Drawings', description: 'Owner drawings' },
  { category: 'Equity', subType: 'Other Equity', description: 'Other equity' },
  { category: 'Income', subType: 'Sales', description: 'Sales income' },
  { category: 'Income', subType: 'Services', description: 'Service income' },
  { category: 'Income', subType: 'Other Operating Income', description: 'Other operating income' },
  { category: 'Cost of Goods Sold', subType: 'Materials', description: 'Direct materials' },
  { category: 'Cost of Goods Sold', subType: 'Direct Labor', description: 'Direct labor' },
  { category: 'Cost of Goods Sold', subType: 'Subcontractors', description: 'Direct subcontractors' },
  { category: 'Cost of Goods Sold', subType: 'Other Direct Costs', description: 'Other direct cost' },
  { category: 'Expense', subType: 'Payroll', description: 'Payroll expense' },
  { category: 'Expense', subType: 'Office & Administrative', description: 'Office and administration' },
  { category: 'Expense', subType: 'Sales & Marketing', description: 'Sales and marketing' },
  { category: 'Expense', subType: 'Travel & Vehicle', description: 'Travel and vehicle' },
  { category: 'Expense', subType: 'Utilities & Communication', description: 'Utilities and communication' },
  { category: 'Expense', subType: 'Professional Services', description: 'Professional services' },
  { category: 'Expense', subType: 'Software & Subscriptions', description: 'Software and subscriptions' },
  { category: 'Expense', subType: 'Repairs & Maintenance', description: 'Repairs and maintenance' },
  { category: 'Expense', subType: 'Financial Expenses', description: 'Financial expense' },
  { category: 'Expense', subType: 'Depreciation & Amortization', description: 'Depreciation and amortization' },
  { category: 'Expense', subType: 'Miscellaneous Expenses', description: 'Miscellaneous operating expense' },
  { category: 'Other Income', subType: 'Interest Income', description: 'Interest income' },
  { category: 'Other Income', subType: 'Asset Gains', description: 'Asset gain' },
  { category: 'Other Income', subType: 'Other Income', description: 'Other non-operating income' },
  { category: 'Other Expense', subType: 'Interest Expense', description: 'Interest expense' },
  { category: 'Other Expense', subType: 'Asset Losses', description: 'Asset loss' },
  { category: 'Other Expense', subType: 'Other Expenses', description: 'Other non-operating expense' },
];

const RESERVED_CODES = new Set(['1000', '1100', '1200', '2000', '2100', '2200', '3000', '4000', '4900', '5800', '5900', '6000']);

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  initialParentId,
  initialSubCategory,
  accountToEdit,
}) => {
  const { accounts, addAccount, updateAccount } = useBooks();
  const [catalogIndex, setCatalogIndex] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [parentAccountId, setParentAccountId] = useState('');
  const [reportingGroup, setReportingGroup] = useState('');
  const [allowDirectPosting, setAllowDirectPosting] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selected = useMemo(() => ACCOUNT_TYPE_CATALOG[catalogIndex] || ACCOUNT_TYPE_CATALOG[0], [catalogIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const existingIndex = accountToEdit
      ? ACCOUNT_TYPE_CATALOG.findIndex((entry) => entry.category === accountToEdit.type && entry.subType === accountToEdit.subType)
      : 0;
    setCatalogIndex(existingIndex >= 0 ? existingIndex : 0);
    setName(accountToEdit?.name || '');
    setCode(accountToEdit?.code || '');
    setDescription(accountToEdit?.description || '');
    setParentAccountId(accountToEdit?.parentAccountId || accountToEdit?.parentId || initialParentId || '');
    setReportingGroup(accountToEdit?.reportingGroup || initialSubCategory || '');
    setAllowDirectPosting(accountToEdit?.allowDirectPosting ?? true);
    setError('');
    setIsSubmitting(false);
  }, [isOpen, accountToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedCode = code.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(normalizedCode)) {
      setError('Account code must contain 1-32 letters, numbers, dots, underscores, or hyphens.');
      return;
    }
    if (RESERVED_CODES.has(normalizedCode)) {
      setError('That code is reserved for a provisioned system control account.');
      return;
    }
    if (name.trim().length < 2 || name.trim().length > 160) {
      setError('Account name must contain 2-160 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (accountToEdit) {
        await updateAccount(accountToEdit.id, {
          name: name.trim(),
          parentAccountId: parentAccountId || null,
          reportingGroup: reportingGroup.trim() || undefined,
          allowDirectPosting,
        });
      } else {
        await addAccount({
          code: normalizedCode,
          name: name.trim(),
          type: selected.category,
          subType: selected.subType,
          description: description.trim() || undefined,
          parentAccountId: parentAccountId || undefined,
          reportingGroup: reportingGroup.trim() || undefined,
          allowDirectPosting,
          balance: 0,
        });
      }
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Account could not be created.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!accountToEdit || !window.confirm(`Archive ${accountToEdit.name}? It can no longer receive new postings.`)) return;
    setError('');
    setIsSubmitting(true);
    try {
      await updateAccount(accountToEdit.id, { status: 'Archived' });
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Account could not be archived.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableParents = accounts.filter((account) =>
    account.id !== accountToEdit?.id && account.status === 'Active' && account.type === selected.category
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-200 p-5 dark:border-slate-800">
          <div><h3 className="text-base font-bold text-slate-900 dark:text-white">{accountToEdit ? 'Account details' : 'Create chart account'}</h3><p className="mt-1 text-xs text-slate-500">New accounts always start at zero; opening balances require a balanced journal.</p></div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>The server validates role/subtype compatibility, reserved codes, uniqueness, zero opening balance, tenant ownership, and writes an audit record atomically.</p></div>
          {accountToEdit && <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>Codes and classifications are preserved for historical reporting. This workflow records every permitted governance change in the audit trail.</p></div>}
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Account code</span><input required disabled={Boolean(accountToEdit)} maxLength={32} value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. 6150" className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-mono font-semibold disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Account name</span><input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2"><span>Account classification</span><select disabled={Boolean(accountToEdit)} value={catalogIndex} onChange={(event) => setCatalogIndex(Number(event.target.value))} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-medium disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white">{ACCOUNT_TYPE_CATALOG.map((entry, index) => <option key={`${entry.category}-${entry.subType}`} value={index}>{entry.category} — {entry.subType}</option>)}</select><span className="block font-normal text-slate-500">{selected.description}</span></label>
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2"><span>Parent account</span><select value={parentAccountId} onChange={(event) => setParentAccountId(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="">No parent account</option>{availableParents.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label>
            <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300"><span>Reporting group</span><input maxLength={100} value={reportingGroup} onChange={(event) => setReportingGroup(event.target.value)} placeholder="e.g. Operations" className="w-full rounded-xl border border-slate-300 bg-white p-2.5 font-semibold dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
            <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300"><input type="checkbox" checked={allowDirectPosting} onChange={(event) => setAllowDirectPosting(event.target.checked)} className="h-4 w-4 accent-blue-600" /><span>Allow direct journal posting</span></label>
            {!accountToEdit && <label className="space-y-1 text-xs font-bold text-slate-700 dark:text-slate-300 sm:col-span-2"><span>Description (optional)</span><textarea maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full resize-none rounded-xl border border-slate-300 bg-white p-3 font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>}
          </div>

          <div className="flex justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"><div>{accountToEdit && accountToEdit.status === 'Active' && <button type="button" onClick={handleArchive} disabled={isSubmitting} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Archive className="h-3.5 w-3.5" />Archive</button>}</div><div className="flex gap-2"><button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Close</button><button type="submit" disabled={isSubmitting} className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">{isSubmitting ? 'Saving…' : accountToEdit ? 'Save changes' : 'Create account'}</button></div></div>
        </form>
      </div>
    </div>
  );
};
