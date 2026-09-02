import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, Info, RefreshCw, Trash2, X } from 'lucide-react';
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
  normalBalance: 'Debit' | 'Credit';
}> = [
  { category: 'Asset', subType: 'Bank', description: 'Bank account', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Cash', description: 'Cash on hand', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Digital Wallet', description: 'Digital wallet', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Undeposited Funds', description: 'Undeposited receipts or payment clearing', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Payment Clearing', description: 'Payment gateway clearing account', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Inventory', description: 'Inventory asset', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Fixed Assets', description: 'Capitalized fixed asset', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Accumulated Depreciation', description: 'Contra asset that reduces a fixed asset', normalBalance: 'Credit' },
  { category: 'Asset', subType: 'Other Current Asset', description: 'GST input, TDS receivable, or an advance', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Other Asset', description: 'Long-term deposit or other non-current asset', normalBalance: 'Debit' },
  { category: 'Asset', subType: 'Deferred Tax Asset', description: 'Deferred tax asset', normalBalance: 'Debit' },
  { category: 'Liability', subType: 'Credit Cards', description: 'Business credit card liability', normalBalance: 'Credit' },
  { category: 'Liability', subType: 'Taxes Payable', description: 'GST or statutory tax payable', normalBalance: 'Credit' },
  { category: 'Liability', subType: 'Payroll Liabilities', description: 'Salary or payroll payable', normalBalance: 'Credit' },
  { category: 'Liability', subType: 'Other Current Liability', description: 'Customer advance, TDS payable, or other current liability', normalBalance: 'Credit' },
  { category: 'Liability', subType: 'Long Term Liability', description: 'Long-term loan or borrowing', normalBalance: 'Credit' },
  { category: 'Liability', subType: 'Other Liability', description: 'Other liability', normalBalance: 'Credit' },
  { category: 'Liability', subType: 'Deferred Tax Liability', description: 'Deferred tax liability', normalBalance: 'Credit' },
  { category: 'Equity', subType: 'Capital', description: 'Owner capital', normalBalance: 'Credit' },
  { category: 'Equity', subType: 'Retained Earnings', description: 'Accumulated earnings', normalBalance: 'Credit' },
  { category: 'Equity', subType: 'Drawings', description: 'Owner drawings, a contra-equity account', normalBalance: 'Debit' },
  { category: 'Equity', subType: 'Opening Balance Equity', description: 'Opening balance clearing account', normalBalance: 'Credit' },
  { category: 'Equity', subType: 'Other Equity', description: 'Other equity', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Sales', description: 'Sales income', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Services', description: 'Service income', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Operating Revenue', description: 'Operating revenue', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Other Operating Income', description: 'Other operating income', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Other Revenue', description: 'Other revenue', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Interest Income', description: 'Interest income', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Asset Gains', description: 'Asset gain', normalBalance: 'Credit' },
  { category: 'Income', subType: 'Other Income', description: 'Other non-operating income', normalBalance: 'Credit' },
  { category: 'Cost of Goods Sold', subType: 'Materials', description: 'Direct materials', normalBalance: 'Debit' },
  { category: 'Cost of Goods Sold', subType: 'Direct Labor', description: 'Direct labor', normalBalance: 'Debit' },
  { category: 'Cost of Goods Sold', subType: 'Subcontractors', description: 'Direct subcontractors', normalBalance: 'Debit' },
  { category: 'Cost of Goods Sold', subType: 'Freight', description: 'Project freight or transport', normalBalance: 'Debit' },
  { category: 'Cost of Goods Sold', subType: 'Site Expenses', description: 'Direct project or site expense', normalBalance: 'Debit' },
  { category: 'Cost of Goods Sold', subType: 'Other Direct Costs', description: 'Other direct project cost', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Payroll', description: 'Payroll expense', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Office & Administrative', description: 'Office and administration', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Sales & Marketing', description: 'Sales and marketing', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Travel & Vehicle', description: 'Travel and vehicle', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Utilities & Communication', description: 'Utilities and communication', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Professional Services', description: 'Professional services', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Software & Subscriptions', description: 'Software and subscriptions', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Repairs & Maintenance', description: 'Repairs and maintenance', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Financial Expenses', description: 'Financial expense', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Depreciation & Amortization', description: 'Depreciation and amortization', normalBalance: 'Debit' },
  { category: 'Expense', subType: 'Miscellaneous Expenses', description: 'Miscellaneous operating expense', normalBalance: 'Debit' },
  { category: 'Other Expense', subType: 'Interest Expense', description: 'Interest expense', normalBalance: 'Debit' },
  { category: 'Other Expense', subType: 'Asset Losses', description: 'Asset loss', normalBalance: 'Debit' },
  { category: 'Other Expense', subType: 'Other Expenses', description: 'Other non-operating expense', normalBalance: 'Debit' },
];

export const RESERVED_CODES = new Set([
  '1000', '1100', '1150', '1200', '1400', '1600',
  '2000', '2100', '2200', '2250',
  '3000', '3400', '3500',
  '4000', '4900',
  '5000', '5800', '5900',
  '6000',
]);

const ACCOUNT_CATEGORIES: AccountType[] = [
  'Asset',
  'Liability',
  'Equity',
  'Income',
  'Other Income',
  'Cost of Goods Sold',
  'Expense',
  'Other Expense',
];

export const getNextAvailableAccountCode = (category: AccountType, existingAccounts: Account[]): string => {
  const existingCodes = new Set(existingAccounts.map((a) => (a.code || '').trim()));
  let base = 6000;
  if (category === 'Asset') base = 1000;
  else if (category === 'Liability') base = 2000;
  else if (category === 'Equity') base = 3000;
  else if (category === 'Income' || category === 'Other Income') base = 4000;
  else if (category === 'Cost of Goods Sold') base = 5000;
  else if (category === 'Expense' || category === 'Other Expense') base = 6000;

  for (let c = base + 10; c < base + 990; c += 10) {
    const codeStr = String(c);
    if (!existingCodes.has(codeStr) && !RESERVED_CODES.has(codeStr)) {
      return codeStr;
    }
  }
  return String(base + 1);
};

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  initialParentId,
  initialSubCategory,
  accountToEdit,
}) => {
  const { accounts = [], addAccount, updateAccount, deleteAccount } = useBooks();
  const [catalogIndex, setCatalogIndex] = useState(0);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [parentAccountId, setParentAccountId] = useState('');
  const [reportingGroup, setReportingGroup] = useState('');
  const [allowDirectPosting, setAllowDirectPosting] = useState(true);
  const [normalBalance, setNormalBalance] = useState<'Debit' | 'Credit'>('Debit');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selected = useMemo(() => ACCOUNT_TYPE_CATALOG[catalogIndex] || ACCOUNT_TYPE_CATALOG[0], [catalogIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const existingIndex = accountToEdit
      ? ACCOUNT_TYPE_CATALOG.findIndex((entry) => entry.category === accountToEdit.type && entry.subType === accountToEdit.subType)
      : 0;
    const activeIndex = existingIndex >= 0 ? existingIndex : 0;
    setCatalogIndex(activeIndex);
    setName(accountToEdit?.name || '');
    setDescription(accountToEdit?.description || '');
    setParentAccountId(accountToEdit?.parentAccountId || accountToEdit?.parentId || initialParentId || '');
    setReportingGroup(accountToEdit?.reportingGroup || initialSubCategory || '');
    setAllowDirectPosting(accountToEdit?.allowDirectPosting ?? true);
    setNormalBalance(accountToEdit?.normalBalance || ACCOUNT_TYPE_CATALOG[activeIndex]?.normalBalance || 'Debit');
    setError('');
    setIsSubmitting(false);

    if (accountToEdit) {
      setCode(accountToEdit.code || '');
    } else {
      setCode(getNextAvailableAccountCode(ACCOUNT_TYPE_CATALOG[activeIndex].category, accounts));
    }
  }, [isOpen, accountToEdit]);

  // Check code conflict dynamically
  const codeConflict = useMemo(() => {
    const trimmed = code.trim();
    if (!trimmed || Boolean(accountToEdit)) return null;
    if (RESERVED_CODES.has(trimmed)) {
      return { isReserved: true, message: `Code ${trimmed} is reserved for a core system account.` };
    }
    const match = accounts.find((a) => a.code.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      return {
        account: match,
        isArchived: match.status === 'Archived',
        message:
          match.status === 'Archived'
            ? `Code ${trimmed} belongs to archived account "${match.name}". Restore it from Archived view or choose another code.`
            : `Code ${trimmed} is already in use by "${match.name}" (${match.type}).`,
      };
    }
    return null;
  }, [code, accounts, accountToEdit]);

  if (!isOpen) return null;

  const handleTypeChange = (newIndex: number) => {
    setCatalogIndex(newIndex);
    setNormalBalance(ACCOUNT_TYPE_CATALOG[newIndex].normalBalance);
    if (!accountToEdit) {
      setCode(getNextAvailableAccountCode(ACCOUNT_TYPE_CATALOG[newIndex].category, accounts));
    }
  };

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

    // Pre-flight check for duplicate code
    if (!accountToEdit) {
      const existingMatch = accounts.find(
        (a) => a.code.toLowerCase() === normalizedCode.toLowerCase()
      );
      if (existingMatch) {
        if (existingMatch.status === 'Archived') {
          setError(
            `Account code "${normalizedCode}" already belongs to an archived account ("${existingMatch.name}"). Switch the filter in Chart of Accounts to "Archived" to restore it, or pick a different code.`
          );
        } else {
          setError(
            `Account code "${normalizedCode}" is already in use by "${existingMatch.name}" (${existingMatch.type}). Please choose a different code.`
          );
        }
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (accountToEdit) {
        await updateAccount(accountToEdit.id, {
          name: name.trim(),
          description: description.trim(),
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
          normalBalance,
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

  const handleRestore = async () => {
    if (!accountToEdit || !window.confirm(`Restore ${accountToEdit.name} to Active status?`)) return;
    setError('');
    setIsSubmitting(true);
    try {
      await updateAccount(accountToEdit.id, { status: 'Active' });
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Account could not be restored.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!accountToEdit) return;
    const confirmed = window.confirm(
      `Delete ${accountToEdit.name}? This is permanent and only succeeds when the account has no entries or references.`
    );
    if (!confirmed) return;
    setError('');
    setIsSubmitting(true);
    try {
      await deleteAccount(accountToEdit.id);
      onClose();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Account could not be deleted.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableParents = accounts.filter((account) =>
    account.id !== accountToEdit?.id && account.status === 'Active' && account.type === selected.category
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onClick={onClose}>
      <div className="max-h-[calc(100vh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[calc(100vh-3rem)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            {accountToEdit ? `Account details: ${accountToEdit.name}` : 'Create account'}
          </h3>
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Close account form" className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-500 disabled:opacity-50 dark:hover:bg-slate-800 cursor-pointer"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            {accountToEdit && (
              <div className={`mb-5 flex gap-2 border-l-2 px-3 py-2.5 text-xs ${accountToEdit.status === 'Archived' ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200' : 'border-blue-400 bg-blue-50 text-blue-900 dark:bg-blue-950/30 dark:text-blue-200'}`}>
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {accountToEdit.status === 'Archived'
                    ? 'This account is currently Archived. It cannot receive direct postings until restored.'
                    : 'Account code and classification are retained to protect historical reporting.'}
                </p>
              </div>
            )}
            {error && <div role="alert" className="mb-5 border-l-2 border-rose-500 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{error}</div>}

            <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="space-y-5">
                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Account type <span className="text-rose-600">*</span>
                  <select disabled={Boolean(accountToEdit)} value={catalogIndex} onChange={(event) => handleTypeChange(Number(event.target.value))} className="mt-1.5 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950 cursor-pointer">
                    {ACCOUNT_CATEGORIES.map((category) => (
                      <optgroup key={category} label={category}>
                        {ACCOUNT_TYPE_CATALOG.filter((entry) => entry.category === category).map((entry) => {
                          const index = ACCOUNT_TYPE_CATALOG.indexOf(entry);
                          return <option key={entry.subType} value={index}>{entry.subType}</option>;
                        })}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Account name <span className="text-rose-600">*</span>
                  <input required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Plywood" className="mt-1.5 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950" />
                </label>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="account-code-input" className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                      Account code <span className="text-rose-600">*</span>
                    </label>
                    {!accountToEdit && (
                      <button
                        type="button"
                        onClick={() => setCode(getNextAvailableAccountCode(selected.category, accounts))}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                      >
                        Auto-suggest next code
                      </button>
                    )}
                  </div>
                  <input
                    id="account-code-input"
                    required
                    disabled={Boolean(accountToEdit)}
                    maxLength={32}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    placeholder="e.g. 5110"
                    className={`mt-1.5 block h-10 w-full rounded-md border px-3 font-mono text-sm font-medium outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 dark:bg-slate-800 dark:text-white ${
                      codeConflict
                        ? 'border-rose-400 text-rose-900 focus:border-rose-600 focus:ring-rose-100 dark:border-rose-800 dark:text-rose-200'
                        : 'border-slate-300 text-slate-900 focus:border-blue-600 focus:ring-blue-100 dark:border-slate-700'
                    }`}
                  />
                  {codeConflict ? (
                    <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
                      ⚠ {codeConflict.message}
                    </p>
                  ) : code.trim() && !accountToEdit ? (
                    <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Code available
                    </p>
                  ) : null}
                </div>

                <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">
                  Description <span className="font-normal text-slate-400">(optional)</span>
                  <textarea maxLength={500} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add a short note for your team" className="mt-1.5 block w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950" />
                  <span className="mt-1 block text-right text-xs font-normal text-slate-400">{description.length}/500</span>
                </label>

                <details className="border-t border-slate-200 pt-4 dark:border-slate-800">
                  <summary className="cursor-pointer text-sm font-medium text-slate-600 marker:text-slate-400 dark:text-slate-300">Additional account settings</summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-800 dark:text-slate-200 sm:col-span-2">Parent account<select value={parentAccountId} onChange={(event) => setParentAccountId(event.target.value)} className="mt-1.5 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950"><option value="">No parent account</option>{availableParents.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}</select></label>
                    <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">Reporting group<input maxLength={100} value={reportingGroup} onChange={(event) => setReportingGroup(event.target.value)} placeholder="e.g. Operations" className="mt-1.5 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950" /></label>
                    <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">Normal balance<select disabled={Boolean(accountToEdit)} value={normalBalance} onChange={(event) => setNormalBalance(event.target.value as 'Debit' | 'Credit')} className="mt-1.5 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950"><option value="Debit">Debit</option><option value="Credit">Credit</option></select></label>
                    <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 sm:col-span-2"><input type="checkbox" checked={allowDirectPosting} onChange={(event) => setAllowDirectPosting(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />Allow direct journal posting</label>
                  </div>
                </details>
              </div>

              <aside className="h-fit border-l-2 border-slate-800 bg-slate-800 px-4 py-3.5 text-sm text-white dark:border-slate-600 dark:bg-slate-800 rounded-r-lg">
                <div className="flex items-center gap-2 font-semibold"><Info className="h-4 w-4" />{selected.category}</div>
                <p className="mt-2 text-sm leading-5 text-slate-100">{selected.description}</p>
                <dl className="mt-4 space-y-2 border-t border-slate-600 pt-3 text-xs text-slate-200"><div className="flex justify-between gap-3"><dt>Normal balance</dt><dd className="font-medium text-white">{normalBalance}</dd></div><div className="flex justify-between gap-3"><dt>Opening balance</dt><dd className="font-medium text-white">Journal entry only</dd></div></dl>
              </aside>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-6">
            <div className="flex items-center gap-2">
              {accountToEdit && !accountToEdit.isSystemAccount && !accountToEdit.isLocked && (
                <button type="button" onClick={handleDelete} disabled={isSubmitting} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30 cursor-pointer">
                  <Trash2 className="h-4 w-4" />Delete
                </button>
              )}
              {accountToEdit && accountToEdit.status === 'Active' && (
                <button type="button" onClick={handleArchive} disabled={isSubmitting} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30 cursor-pointer">
                  <Archive className="h-4 w-4" />Archive
                </button>
              )}
              {accountToEdit && accountToEdit.status === 'Archived' && (
                <button type="button" onClick={handleRestore} disabled={isSubmitting} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40 cursor-pointer">
                  <RefreshCw className="h-4 w-4" />Restore to Active
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={isSubmitting} className="h-9 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isSubmitting || Boolean(codeConflict)} className="h-9 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer">
                {isSubmitting ? 'Saving...' : accountToEdit ? 'Save changes' : 'Save account'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
