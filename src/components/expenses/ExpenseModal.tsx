import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ImagePlus, Layers, Plus, Receipt, RefreshCw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Account, Expense, ExpenseReceiptUpload } from '../../types';
import { AccountModal } from '../coa/AccountModal';
import { QuickAddAccountModal } from '../common/QuickAddAccountModal';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenseToEdit?: Expense | null;
  defaultProjectId?: string;
  defaultClientId?: string;
}

interface ItemizedLine {
  id: string;
  accountId: string;
  description: string;
  amount: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const MAX_RECEIPT_IMAGES = 3;
const MAX_RECEIPT_BYTES = 900 * 1024;

interface SearchableAccountPickerProps {
  accounts: Account[];
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (accountId: string) => void;
}

const SearchableAccountPicker: React.FC<SearchableAccountPickerProps> = ({
  accounts,
  id,
  label,
  placeholder,
  value,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const selectedAccount = accounts.find((account) => account.id === value);
  const matchingAccounts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return accounts;
    return accounts.filter((account) =>
      [account.code, account.name, account.type, account.subType]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(normalizedQuery))
    );
  }, [accounts, query]);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [isOpen]);

  const close = () => setIsOpen(false);
  const chooseAccount = (accountId: string) => {
    onChange(accountId);
    close();
  };
  const selectedLabel = selectedAccount
    ? `${selectedAccount.code} - ${selectedAccount.name}`
    : placeholder;

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        aria-label={`${label}: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-options`}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 text-left font-normal text-slate-900 outline-hidden transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-blue-950"
      >
        <span className={`min-w-0 truncate text-sm ${selectedAccount ? '' : 'text-slate-400 dark:text-slate-500'}`}>
          {selectedLabel}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-30" onMouseDown={close} />
          <div className="absolute z-40 mt-1.5 w-full overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-2.5 dark:border-slate-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') close();
                  }}
                  placeholder="Search expense accounts"
                  className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-hidden placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-900 dark:focus:ring-blue-950"
                />
              </div>
              <p className="mt-2 px-0.5 text-xs text-slate-500 dark:text-slate-400">
                Search by account name, code, type, or sub-type.
              </p>
            </div>
            <div id={`${id}-options`} role="listbox" aria-label={`${label} options`} className="max-h-72 overflow-y-auto p-1.5">
              {matchingAccounts.length === 0 ? (
                <p className="px-3 py-7 text-center text-sm text-slate-500 dark:text-slate-400">No expense accounts match that search.</p>
              ) : (
                matchingAccounts.map((account) => {
                  const isSelected = account.id === value;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-label={`${account.code} - ${account.name} (${account.type}, ${account.subType})`}
                      onClick={() => chooseAccount(account.id)}
                      className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                          : 'text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                        <Check className={`h-3 w-3 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{account.code} - {account.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{account.type} / {account.subType}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

async function compressReceiptImage(file: File): Promise<ExpenseReceiptUpload> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error(`${file.name} is not a supported image. Use JPEG, PNG, or WebP.`);
  }
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      element.src = imageUrl;
    });
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, 1600 / Math.max(1, longestSide));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image compression is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let quality = 0.88;
    let blob: Blob | null = null;
    while (quality >= 0.45) {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= MAX_RECEIPT_BYTES) break;
      quality -= 0.1;
      await new Promise((r) => setTimeout(r, 0));
    }
    if (!blob || blob.size > MAX_RECEIPT_BYTES) throw new Error(`${file.name} is too detailed to compress under 900 KB.`);
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1] || '');
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob!);
    });
    return { name: file.name.replace(/\.[^.]+$/, '') + '.jpg', mimeType: 'image/jpeg', dataBase64 };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  expenseToEdit,
  defaultProjectId,
  defaultClientId,
}) => {
  const { accounts = [], refreshAccounts, vendors, projects, addExpense, settings } = useBooks();

  // Support Expense, Cost of Goods Sold, and Other Expense accounts from Chart of Accounts
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

  // Support Bank, Cash, Digital Wallet, Payment Clearing, and Credit Card accounts
  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          (account.status || 'Active') === 'Active' &&
          account.allowDirectPosting !== false &&
          ((account.type === 'Asset' &&
            (account.code === '1000' ||
              ['Bank', 'Cash', 'Cash & Bank', 'Digital Wallet', 'Undeposited Funds', 'Payment Clearing'].includes(
                account.subType
              ))) ||
            (account.type === 'Liability' && ['Credit Cards', 'Credit Card', 'Loan/Credit'].includes(account.subType)))
      ),
    [accounts]
  );

  const [date, setDate] = useState(today());
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [paidFromAccountId, setPaidFromAccountId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [isReceiptDragActive, setIsReceiptDragActive] = useState(false);
  const [isRefreshingAccounts, setIsRefreshingAccounts] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  const [isItemized, setIsItemized] = useState(false);
  const [items, setItems] = useState<ItemizedLine[]>([
    { id: 'item-1', accountId: '', description: '', amount: '' },
  ]);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previews = receiptFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setFilePreviews(previews);

    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [receiptFiles]);

  const handleRefreshAccounts = async () => {
    if (!refreshAccounts) return;
    setIsRefreshingAccounts(true);
    try {
      await refreshAccounts();
    } catch (err) {
      console.error('Failed to fetch realtime accounts:', err);
    } finally {
      setIsRefreshingAccounts(false);
    }
  };

  const prevIsOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    if (!prevIsOpenRef.current) {
      // Modal just opened: initialize fields and fetch latest accounts in real-time
      setDate(today());
      setExpenseAccountId(expenseAccounts[0]?.id || '');
      setPaidFromAccountId(paymentAccounts[0]?.id || '');
      setVendorId('');
      setAmount('');
      setDescription('');
      setProjectId(defaultProjectId || '');
      setError('');
      setIsSubmitting(false);
      setReceiptFiles([]);
      setIsItemized(false);
      setItems([{ id: 'item-1', accountId: expenseAccounts[0]?.id || '', description: '', amount: '' }]);
      if (refreshAccounts) {
        refreshAccounts().catch((err) => console.error('Realtime accounts fetch error:', err));
      }
    } else {
      // Modal already open, accounts array refreshed in real-time: preserve user selections
      setExpenseAccountId((prev) =>
        expenseAccounts.some((a) => a.id === prev) ? prev : prev || expenseAccounts[0]?.id || ''
      );
      setPaidFromAccountId((prev) =>
        paymentAccounts.some((a) => a.id === prev) ? prev : prev || paymentAccounts[0]?.id || ''
      );
    }
    prevIsOpenRef.current = true;
  }, [isOpen, expenseAccounts, paymentAccounts, defaultProjectId, refreshAccounts]);

  if (!isOpen) return null;

  const postingUnavailable = expenseAccounts.length === 0 || paymentAccounts.length === 0;

  const handleAddItem = () => {
    setItems((curr) => [
      ...curr,
      { id: 'item-' + Date.now() + '-' + (curr.length + 1), accountId: expenseAccounts[0]?.id || '', description: '', amount: '' },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((curr) => curr.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = (index: number, field: keyof ItemizedLine, value: string) => {
    setItems((curr) => curr.map((it, idx) => (idx === index ? { ...it, [field]: value } : it)));
  };

  const calculatedItemizedTotal = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  const appendReceiptFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;
    const next = [...receiptFiles, ...incoming].slice(0, MAX_RECEIPT_IMAGES);
    if (incoming.length + receiptFiles.length > MAX_RECEIPT_IMAGES) {
      setError('Attach up to three receipt images.');
    } else {
      setError('');
    }
    setReceiptFiles(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (expenseToEdit) {
      setError('Posted expenses cannot be edited. Use an audited reversing entry and post a correction.');
      return;
    }

    const parsedAmount = isItemized ? calculatedItemizedTotal : Number(amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Enter a valid posting date.');
      return;
    }
    if (!isItemized) {
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.round(parsedAmount * 100) !== parsedAmount * 100) {
        setError('Amount must be positive and contain no more than two decimal places.');
        return;
      }
    } else {
      if (items.length === 0) {
        setError('Add at least one itemized line.');
        return;
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const itAmt = Number(it.amount);
        if (!it.accountId) {
          setError('Select an expense category account for line ' + (i + 1) + '.');
          return;
        }
        if (!Number.isFinite(itAmt) || itAmt <= 0 || Math.round(itAmt * 100) !== itAmt * 100) {
          setError('Line ' + (i + 1) + ' amount must be positive with at most two decimal places.');
          return;
        }
      }
      if (calculatedItemizedTotal <= 0) {
        setError('Total itemized amount must be greater than zero.');
        return;
      }
    }
    const targetAccountId = isItemized ? items[0].accountId : expenseAccountId;
    const expenseAccount = expenseAccounts.find((account) => account.id === targetAccountId);
    const paymentAccount = paymentAccounts.find((account) => account.id === paidFromAccountId);
    if (!expenseAccount || !paymentAccount) {
      setError('Select an active expense account and an active bank, cash, wallet, or credit card account.');
      return;
    }

    const vendor = vendors.find((candidate) => candidate.id === vendorId);
    setIsSubmitting(true);
    try {
      const receiptImages = await Promise.all(receiptFiles.map(compressReceiptImage));
      await addExpense({
        vendorId: vendor?.id,
        vendorName: vendor?.companyName || vendor?.name,
        accountId: expenseAccount.id,
        accountName: expenseAccount.name,
        paidFromAccountId: paymentAccount.id,
        paidFromAccountName: paymentAccount.name,
        date,
        currency: settings.currencyCode,
        amount: parsedAmount,
        taxAmount: 0,
        projectId: projectId || undefined,
        clientId: projects.find((project) => project.id === projectId)?.clientId || defaultClientId,
        isBillable: false,
        receiptImages,
        paymentStatus: 'Paid',
        isItemized,
        items: isItemized
          ? items.map((it) => ({
              accountId: it.accountId,
              accountName: expenseAccounts.find((a) => a.id === it.accountId)?.name || '',
              description: it.description,
              amount: Number(it.amount),
            }))
          : undefined,
        description: description.trim() || `Expense paid${vendor ? ` to ${vendor.companyName || vendor.name}` : ''}`,
      });
      onClose();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Expense could not be posted. No financial data was changed.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
        <div
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7 dark:border-slate-700">
            <div className="flex gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                <Receipt className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Record Expense</h2>
                <p className="mt-0.5 text-xs text-slate-500">Record a paid business expense and attach its receipt.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer" aria-label="Close record expense">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
              {expenseToEdit && (
                <div className="mb-5 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Posted expense editing is unavailable. Financial corrections require an audited reversal.
                  </p>
                </div>
              )}

              {error && (
                <div role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  {error}
                </div>
              )}

              {postingUnavailable && (
                <div role="alert" className="mb-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  Posting is unavailable until this organization has an active expense account and an active bank, cash, or wallet account.
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
                <div className="order-last min-w-0 space-y-4 lg:order-none">
                  <section className="border border-slate-200 p-5 dark:border-slate-700 sm:p-6">
                    <div className="mb-5 flex items-start gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><Receipt className="h-4 w-4" /></span>
                      <div><h3 className="text-base font-bold text-slate-900 dark:text-white">Expense details</h3><p className="mt-0.5 text-xs text-slate-500">Add the payment and accounting information.</p></div>
                    </div>

                    {/* Zoho Books Style Mode Switcher */}
                    <div className="mb-5 flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                      <button
                        type="button"
                        onClick={() => setIsItemized(false)}
                        className={'flex-1 rounded-md py-2 text-xs font-bold transition-all ' + (!isItemized ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}
                      >
                        Single Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsItemized(true);
                          if (items.length === 1 && !items[0].amount && amount) {
                            setItems([{ id: 'item-1', accountId: expenseAccountId || expenseAccounts[0]?.id || '', description: description || '', amount }]);
                          }
                        }}
                        className={'flex-1 rounded-md py-2 text-xs font-bold transition-all ' + (isItemized ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-blue-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white')}
                      >
                        Itemized Expense (Split)
                      </button>
                    </div>

                    {!isItemized ? (
                    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                      <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span>Posting date <span className="text-rose-600">*</span></span>
                        <input
                          type="date"
                          required
                          value={date}
                          onChange={(event) => setDate(event.target.value)}
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label htmlFor="expense-account-select" className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Expense account <span className="text-rose-600">*</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleRefreshAccounts}
                              disabled={isRefreshingAccounts}
                              title="Fetch latest accounts from Chart of Accounts"
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer"
                            >
                              <RefreshCw className={`h-3 w-3 ${isRefreshingAccounts ? 'animate-spin text-blue-600' : ''}`} />
                              <span>{isRefreshingAccounts ? 'Refreshing...' : 'Refresh'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddExpenseModalOpen(true)}
                              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>New account</span>
                            </button>
                          </div>
                        </div>
                        <SearchableAccountPicker
                          id="expense-account-select"
                          label="Expense account"
                          placeholder={`Select expense account (${expenseAccounts.length} available)`}
                          accounts={expenseAccounts}
                          value={expenseAccountId}
                          onChange={setExpenseAccountId}
                        />
                      </div>

                      <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span>Amount <span className="text-rose-600">*</span></span>
                        <div className="flex h-11 overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 dark:border-slate-700 dark:bg-slate-800">
                          <span className="flex items-center border-r border-slate-200 px-3 text-sm font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">{settings.currencyCode}</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            inputMode="decimal"
                            required={!isItemized}
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="0.00"
                            className="min-w-0 flex-1 bg-transparent px-3 font-normal text-slate-900 outline-hidden dark:text-white"
                          />
                        </div>
                      </label>
                    </div>
                    ) : (
                      <div className="space-y-4">
                        <label className="block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                          <span>Posting date <span className="text-rose-600">*</span></span>
                          <input
                            type="date"
                            required
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </label>

                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-800/80 dark:text-slate-400">
                              <tr>
                                <th className="p-2.5 pl-3">Expense Category</th>
                                <th className="p-2.5">Description</th>
                                <th className="p-2.5 w-32">Amount</th>
                                <th className="p-2.5 w-10 text-center"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {items.map((it, idx) => (
                                <tr key={it.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                                  <td className="p-2 pl-3">
                                    <select
                                      value={it.accountId}
                                      onChange={(e) => handleUpdateItem(idx, 'accountId', e.target.value)}
                                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                    >
                                      <option value="">Select Category</option>
                                      {expenseAccounts.map((acc) => (
                                        <option key={acc.id} value={acc.id}>
                                          {acc.code} - {acc.name}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      placeholder="Memo/Description"
                                      value={it.description}
                                      onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="number"
                                      min="0.01"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={it.amount}
                                      onChange={(e) => handleUpdateItem(idx, 'amount', e.target.value)}
                                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-right font-mono text-xs text-slate-900 outline-hidden focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                                    />
                                  </td>
                                  <td className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveItem(idx)}
                                      disabled={items.length <= 1}
                                      className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-950/50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={handleAddItem}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Add another line</span>
                          </button>
                          <div className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                            Total: <span className="font-mono text-blue-600 dark:text-blue-400">{settings.currencySymbol} {calculatedItemizedTotal.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="border border-slate-200 p-5 dark:border-slate-700 sm:p-6">
                    <div className="mb-5 flex items-start gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><ShieldCheck className="h-4 w-4" /></span>
                      <div><h3 className="text-base font-bold text-slate-900 dark:text-white">Payment and vendor</h3><p className="mt-0.5 text-xs text-slate-500">Choose how this expense was paid.</p></div>
                    </div>
                    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label htmlFor="payment-account-select" className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            Paid through <span className="text-rose-600">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsAddPaymentModalOpen(true)}
                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            <span>New bank/card</span>
                          </button>
                        </div>
                        <select
                          id="payment-account-select"
                          required
                          value={paidFromAccountId}
                          onChange={(event) => setPaidFromAccountId(event.target.value)}
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">Select payment account ({paymentAccounts.length} available)</option>
                          {paymentAccounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} — {account.name} ({account.subType})
                            </option>
                          ))}
                        </select>
                      </div>

                      <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span>Vendor</span>
                        <select
                          value={vendorId}
                          onChange={(event) => setVendorId(event.target.value)}
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">No vendor selected</option>
                          {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName || vendor.name}</option>)}
                        </select>
                      </label>

                      <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                        <span>Project</span>
                        <select
                          value={projectId}
                          onChange={(event) => setProjectId(event.target.value)}
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">No project selected</option>
                          {projects.filter((project) => project.status !== 'Cancelled').map((project) => <option key={project.id} value={project.id}>{project.code} — {project.name}</option>)}
                        </select>
                      </label>

                      <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                        <div className="flex items-center justify-between"><span>Notes</span><span className="text-xs font-normal text-slate-400">{description.length}/500</span></div>
                        <textarea
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          rows={4}
                          maxLength={500}
                          placeholder="Add a note about this expense"
                          className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>
                    </div>
                  </section>
                </div>

                <section className="order-first min-w-0 border border-slate-200 p-4 dark:border-slate-700 sm:p-5 lg:order-none">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Receipt images (optional)</h3>
                  <p className="mt-1 text-xs text-slate-500">Attach up to three JPG, PNG, or WebP receipt images.</p>
                  <div
                    className={`mt-4 flex min-h-72 flex-col items-center justify-center border-2 border-dashed px-5 py-8 text-center transition-colors ${isReceiptDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-blue-200 bg-slate-50/50 dark:border-blue-900 dark:bg-slate-800/30'}`}
                    onDragEnter={(event) => { event.preventDefault(); setIsReceiptDragActive(true); }}
                    onDragOver={(event) => { event.preventDefault(); setIsReceiptDragActive(true); }}
                    onDragLeave={() => setIsReceiptDragActive(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setIsReceiptDragActive(false);
                      appendReceiptFiles(Array.from(event.dataTransfer.files || []));
                    }}
                  >
                    <input
                      ref={receiptInputRef}
                      type="file"
                      multiple
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        appendReceiptFiles(Array.from(event.target.files || []));
                        if (receiptInputRef.current) receiptInputRef.current.value = '';
                      }}
                    />
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      <ImagePlus className="h-6 w-6" />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Drop receipt images here</p>
                    <p className="mt-1 text-xs text-slate-500">JPEG, PNG, or WebP up to 900 KB compressed.</p>
                    <button
                      type="button"
                      onClick={() => receiptInputRef.current?.click()}
                      className="mt-4 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      Add images
                    </button>
                  </div>

                  {filePreviews.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">Attached receipts ({filePreviews.length}/3)</h4>
                      <ul className="space-y-2">
                        {filePreviews.map(({ file, url }, index) => (
                          <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-md border border-slate-200 p-2 text-xs dark:border-slate-700">
                            <div className="flex min-w-0 items-center gap-2">
                              <img src={url} alt={file.name} className="h-10 w-10 shrink-0 rounded object-cover border border-slate-200 dark:border-slate-700" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900 dark:text-white">{file.name}</p>
                                <p className="text-[11px] text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReceiptFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800 cursor-pointer"
                              aria-label={`Remove ${file.name}`}
                              title="Remove receipt"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> The expense and balanced journal entry are posted together.</p>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={postingUnavailable || Boolean(expenseToEdit) || isSubmitting}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Recording…' : 'Record expense'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {isAddExpenseModalOpen && (
        <AccountModal
          isOpen={isAddExpenseModalOpen}
          onClose={() => setIsAddExpenseModalOpen(false)}
        />
      )}

      {isAddPaymentModalOpen && (
        <QuickAddAccountModal
          isOpen={isAddPaymentModalOpen}
          onClose={() => setIsAddPaymentModalOpen(false)}
          defaultCategory="Bank"
        />
      )}
    </>
  );
};
