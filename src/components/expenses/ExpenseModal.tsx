import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, ImagePlus, Layers, Plus, Receipt, RefreshCw, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Account, Expense } from '../../types';
import { AccountModal } from '../coa/AccountModal';
import { QuickAddAccountModal } from '../common/QuickAddAccountModal';
import { ProjectBillingDialog } from './ProjectBillingDialog';
import { compressReceiptImage, MAX_RECEIPT_IMAGES } from './receiptUpload';

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

function toDateInputValue(value?: string): string {
  const match = value?.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : today();
}

function formatDisplayDate(dStr: string): string {
  if (!dStr) return '';
  const parts = dStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dStr;
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}

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

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  expenseToEdit,
  defaultProjectId,
  defaultClientId,
}) => {
  const { accounts = [], refreshAccounts, vendors = [], projects = [], clients = [], addVendor, addExpense, correctExpense, settings } = useBooks();

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
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [isBillable, setIsBillable] = useState(false);
  const [markupPercentage, setMarkupPercentage] = useState(
    expenseToEdit?.markupPercentage !== undefined
      ? expenseToEdit.markupPercentage
      : (settings?.expensesSettings?.defaultMarkupPercentage || 0)
  );
  const [isProjectBillingDialogOpen, setIsProjectBillingDialogOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [isReceiptDragActive, setIsReceiptDragActive] = useState(false);
  const [isRefreshingAccounts, setIsRefreshingAccounts] = useState(false);
  const [isAddExpenseModalOpen, setIsAddExpenseModalOpen] = useState(false);
  const [isAddPaymentModalOpen, setIsAddPaymentModalOpen] = useState(false);
  const [isAddVendorModalOpen, setIsAddVendorModalOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorPhone, setNewVendorPhone] = useState('');
  const [newVendorTaxId, setNewVendorTaxId] = useState('');
  const [newVendorPaymentTerms, setNewVendorPaymentTerms] = useState('Net 30');
  const [newVendorBillingAddress, setNewVendorBillingAddress] = useState('');
  const [newVendorCompanyName, setNewVendorCompanyName] = useState('');
  const [newVendorLegalName, setNewVendorLegalName] = useState('');
  const [newVendorType, setNewVendorType] = useState<'Business' | 'Individual'>('Business');
  const [newVendorSalutation, setNewVendorSalutation] = useState('');
  const [newVendorFirstName, setNewVendorFirstName] = useState('');
  const [newVendorLastName, setNewVendorLastName] = useState('');
  const [newVendorGstStatus, setNewVendorGstStatus] = useState<'Registered' | 'Unregistered' | 'Composition' | 'SEZ'>('Unregistered');
  const [newVendorPan, setNewVendorPan] = useState('');
  const [newVendorPlaceOfSupply, setNewVendorPlaceOfSupply] = useState('');
  const [newVendorMobile, setNewVendorMobile] = useState('');
  const [newVendorWebsite, setNewVendorWebsite] = useState('');
  const [newVendorShippingAddress, setNewVendorShippingAddress] = useState('');
  const [newVendorDefaultExpenseAccountId, setNewVendorDefaultExpenseAccountId] = useState('');
  const [newVendorNotes, setNewVendorNotes] = useState('');
  const [newVendorBankName, setNewVendorBankName] = useState('');
  const [newVendorBankAccountName, setNewVendorBankAccountName] = useState('');
  const [newVendorBankAccountNumber, setNewVendorBankAccountNumber] = useState('');
  const [newVendorBankIfsc, setNewVendorBankIfsc] = useState('');
  const [newVendorBankSwift, setNewVendorBankSwift] = useState('');
  const [newVendorBankBranch, setNewVendorBankBranch] = useState('');
  const [newVendorBankAccountType, setNewVendorBankAccountType] = useState('');
  const [newVendorExtraContact, setNewVendorExtraContact] = useState({ name: '', designation: '', email: '', phone: '', mobile: '' });
  const [newVendorCustomFieldKey, setNewVendorCustomFieldKey] = useState('');
  const [newVendorCustomFieldValue, setNewVendorCustomFieldValue] = useState('');
  const [newVendorError, setNewVendorError] = useState('');
  const [isCreatingVendor, setIsCreatingVendor] = useState(false);
  const [isItemized, setIsItemized] = useState(false);
  const [items, setItems] = useState<ItemizedLine[]>([
    { id: 'item-1', accountId: '', description: '', amount: '' },
  ]);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const isMobile = useIsMobile();
  const [activePicker, setActivePicker] = useState<'expenseAccount' | 'paymentAccount' | 'vendor' | 'customer' | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const selectedExpenseAccount = useMemo(
    () => expenseAccounts.find((a) => a.id === expenseAccountId),
    [expenseAccounts, expenseAccountId]
  );
  const selectedPaymentAccount = useMemo(
    () => paymentAccounts.find((a) => a.id === paidFromAccountId),
    [paymentAccounts, paidFromAccountId]
  );
  const selectedVendor = useMemo(
    () => vendors.find((v) => v.id === vendorId),
    [vendors, vendorId]
  );

  const handleVendorChange = (nextVendorId: string) => {
    setVendorId(nextVendorId);
    const vendor = vendors.find((entry) => entry.id === nextVendorId);
    if (vendor?.defaultExpenseAccountId && expenseAccounts.some((account) => account.id === vendor.defaultExpenseAccountId)) {
      setExpenseAccountId(vendor.defaultExpenseAccountId);
    }
  };
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId]
  );

  const handleProjectChange = (newProjectId: string) => {
    setProjectId(newProjectId);
    if (newProjectId) {
      const selectedProj = projects.find((p) => p.id === newProjectId);
      if (selectedProj?.clientId) {
        setClientId(selectedProj.clientId);
      }
    }
  };

  const handleClientChange = (newClientId: string) => {
    setClientId(newClientId);
    if (projectId) {
      const selectedProj = projects.find((p) => p.id === projectId);
      if (selectedProj?.clientId && selectedProj.clientId !== newClientId) {
        setProjectId('');
      }
    }
    if (!newClientId) {
      setIsBillable(false);
      setProjectId('');
      setMarkupPercentage(0);
      setIsProjectBillingDialogOpen(false);
    } else {
      // Procedure: Once a client is selected/added, immediately open the Project & Billable dialog!
      setIsProjectBillingDialogOpen(true);
    }
  };

  const handleApplyProjectBilling = (newProjectId: string, newBillable: boolean, newMarkup: number) => {
    setProjectId(newProjectId);
    setIsBillable(newBillable);
    setMarkupPercentage(newMarkup);
    setIsProjectBillingDialogOpen(false);
  };

  const resetNewVendorDraft = () => {
    setNewVendorError('');
    setNewVendorName('');
    setNewVendorEmail('');
    setNewVendorPhone('');
    setNewVendorTaxId('');
    setNewVendorPaymentTerms('Net 30');
    setNewVendorBillingAddress('');
    setNewVendorCompanyName('');
    setNewVendorLegalName('');
    setNewVendorType('Business');
    setNewVendorSalutation('');
    setNewVendorFirstName('');
    setNewVendorLastName('');
    setNewVendorGstStatus('Unregistered');
    setNewVendorPan('');
    setNewVendorPlaceOfSupply('');
    setNewVendorMobile('');
    setNewVendorWebsite('');
    setNewVendorShippingAddress('');
    setNewVendorDefaultExpenseAccountId('');
    setNewVendorNotes('');
    setNewVendorBankName('');
    setNewVendorBankAccountName('');
    setNewVendorBankAccountNumber('');
    setNewVendorBankIfsc('');
    setNewVendorBankSwift('');
    setNewVendorBankBranch('');
    setNewVendorBankAccountType('');
    setNewVendorExtraContact({ name: '', designation: '', email: '', phone: '', mobile: '' });
    setNewVendorCustomFieldKey('');
    setNewVendorCustomFieldValue('');
  };

  const handleCreateVendor = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newVendorName.trim();
    if (!name) {
      setNewVendorError('Vendor name is required.');
      return;
    }

    setIsCreatingVendor(true);
    setNewVendorError('');
    try {
      const contactName = [newVendorFirstName.trim(), newVendorLastName.trim()].filter(Boolean).join(' ');
      const vendor = await addVendor({
        name,
        companyName: newVendorCompanyName.trim() || name,
        legalName: newVendorLegalName.trim() || newVendorCompanyName.trim() || name,
        vendorType: newVendorType,
        gstStatus: newVendorGstStatus,
        contactPerson: contactName,
        primaryContact: {
          salutation: newVendorSalutation, firstName: newVendorFirstName.trim(), lastName: newVendorLastName.trim(),
          name: contactName, email: newVendorEmail.trim(),
          phone: newVendorPhone.trim(), mobile: newVendorMobile.trim(), isPrimary: true,
        },
        email: newVendorEmail.trim(),
        phone: newVendorPhone.trim(),
        mobile: newVendorMobile.trim(),
        website: newVendorWebsite.trim(),
        taxId: newVendorTaxId.trim(),
        gstin: newVendorTaxId.trim().toUpperCase(),
        pan: newVendorPan.trim().toUpperCase(),
        placeOfSupply: newVendorPlaceOfSupply.trim(),
        billingAddress: newVendorBillingAddress.trim(),
        shippingAddress: newVendorShippingAddress.trim(),
        paymentTerms: newVendorPaymentTerms,
        defaultExpenseAccountId: newVendorDefaultExpenseAccountId || undefined,
        notes: newVendorNotes.trim(),
        additionalContacts: Object.values(newVendorExtraContact).some((field) => typeof field === 'string' && field.trim().length > 0) ? [newVendorExtraContact] : [],
        customFields: newVendorCustomFieldKey.trim() ? { [newVendorCustomFieldKey.trim()]: newVendorCustomFieldValue } : {},
        bankDetails: newVendorBankAccountNumber.trim() ? {
          bankName: newVendorBankName.trim(), accountName: newVendorBankAccountName.trim(),
          accountNumber: newVendorBankAccountNumber.trim(), ifsc: newVendorBankIfsc.trim().toUpperCase(),
          swiftCode: newVendorBankSwift.trim().toUpperCase(), branch: newVendorBankBranch.trim(), accountType: newVendorBankAccountType.trim(),
        } : undefined,
        status: 'Active',
      });
      handleVendorChange(vendor.id);
      resetNewVendorDraft();
      setIsAddVendorModalOpen(false);
    } catch (creationError) {
      setNewVendorError(creationError instanceof Error ? creationError.message : 'Vendor could not be created.');
    } finally {
      setIsCreatingVendor(false);
    }
  };

  const availableProjects = useMemo(() => {
    return (projects || []).filter(
      (p) => p.status !== 'Cancelled' && (!clientId || !p.clientId || p.clientId === clientId)
    );
  }, [projects, clientId]);

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

  // Initialize before the form becomes interactive. With useEffect, a fast
  // customer selection could race the initial reset and make the required
  // Project & Billing dialog disappear.
  useLayoutEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    if (!prevIsOpenRef.current) {
      // Modal just opened: initialize fields and fetch latest accounts in real-time
      setDate(toDateInputValue(expenseToEdit?.date));
      setExpenseAccountId(expenseToEdit?.accountId || expenseAccounts[0]?.id || '');
      setPaidFromAccountId(expenseToEdit?.paidFromAccountId || paymentAccounts[0]?.id || '');
      setVendorId(expenseToEdit?.vendorId || '');
      setVendorInvoiceNumber(expenseToEdit?.invoiceNumber || '');
      setAmount(expenseToEdit ? String(expenseToEdit.amount) : '');
      setDescription(expenseToEdit?.description || '');
      setProjectId(expenseToEdit?.projectId || defaultProjectId || '');
      setClientId(expenseToEdit?.clientId || defaultClientId || '');
      setIsBillable(Boolean(expenseToEdit?.isBillable));
      setMarkupPercentage(
        expenseToEdit?.markupPercentage !== undefined
          ? expenseToEdit.markupPercentage
          : (settings?.expensesSettings?.defaultMarkupPercentage || 0)
      );
      setIsProjectBillingDialogOpen(false);
      setCorrectionReason('');
      setError('');
      setIsSubmitting(false);
      setReceiptFiles([]);
      setIsItemized(Boolean(expenseToEdit?.isItemized));
      setItems(expenseToEdit?.isItemized && expenseToEdit.items?.length
        ? expenseToEdit.items.map((item, index) => ({ id: item.id || `item-${index + 1}`, accountId: item.accountId, description: item.description || '', amount: String(item.amount) }))
        : [{ id: 'item-1', accountId: expenseToEdit?.accountId || expenseAccounts[0]?.id || '', description: '', amount: '' }]);
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
  }, [isOpen, expenseAccounts, paymentAccounts, expenseToEdit, defaultProjectId, defaultClientId, refreshAccounts]);

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
  const currentCostBasis = isItemized ? calculatedItemizedTotal : (Number(amount) || 0);
  const calculatedSellingPrice = isBillable
    ? Math.round(currentCostBasis * (1 + markupPercentage / 100) * 100) / 100
    : 0;

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
    const resolvedClientId = clientId || projects.find((project) => project.id === projectId)?.clientId || defaultClientId;

    if (isBillable && !resolvedClientId) {
      setError('Please select a customer to mark this expense as billable.');
      return;
    }

    setIsSubmitting(true);
    try {
      const receiptImages = await Promise.all(receiptFiles.map(compressReceiptImage));
      const expenseInput = {
        vendorId: vendor?.id,
        vendorName: vendor?.companyName || vendor?.name,
        invoiceNumber: vendorInvoiceNumber.trim() || undefined,
        accountId: expenseAccount.id,
        accountName: expenseAccount.name,
        paidFromAccountId: paymentAccount.id,
        paidFromAccountName: paymentAccount.name,
        date,
        currency: settings.currencyCode,
        amount: parsedAmount,
        taxRate: expenseToEdit?.taxRate,
        taxAmount: expenseToEdit?.taxAmount || 0,
        taxAccountId: expenseToEdit?.taxAccountId,
        isTaxInclusive: expenseToEdit?.isTaxInclusive,
        isRcm: expenseToEdit?.isRcm,
        rcmTaxAccountId: expenseToEdit?.rcmTaxAccountId,
        tdsRate: expenseToEdit?.tdsRate,
        tdsAmount: expenseToEdit?.tdsAmount,
        tdsSection: expenseToEdit?.tdsSection,
        tdsAccountId: expenseToEdit?.tdsAccountId,
        projectId: projectId || undefined,
        clientId: resolvedClientId || undefined,
        isBillable: Boolean(isBillable && resolvedClientId),
        markupPercentage: Boolean(isBillable && resolvedClientId) ? markupPercentage : 0,
        sellingPrice: Boolean(isBillable && resolvedClientId) ? calculatedSellingPrice : 0,
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
      };
      if (expenseToEdit) {
        if (correctionReason.trim().length < 3) {
          setError('Provide a correction reason of at least 3 characters.');
          return;
        }
        await correctExpense(expenseToEdit.id, expenseInput, correctionReason.trim());
      } else {
        await addExpense(expenseInput);
      }
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
      {isMobile ? (
        /* MOBILE VIEW (LIGHT MODE) - MATCHING IOS INSET GROUPED SCREENSHOTS */
        <div className="fixed inset-0 z-50 flex flex-col bg-[#f2f2f7] dark:bg-black overflow-hidden animate-in fade-in duration-150" data-testid="mobile-expense-modal">
          {/* 1. Header Bar */}
          <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-md px-4 py-2.5 sm:py-3 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-full bg-slate-200/80 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {expenseToEdit ? 'Edit Expense' : 'Add Expense'}
            </h2>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={postingUnavailable || isSubmitting}
              className="px-5 py-1.5 rounded-full bg-blue-500 hover:bg-blue-600 text-white font-bold text-xs shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </header>

          {/* Form Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 pb-24">
            {error && (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/40 p-3 text-xs font-semibold text-rose-800 dark:text-rose-200">
                {error}
              </div>
            )}

            {postingUnavailable && (
              <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-200">
                Posting is unavailable until active expense and payment accounts exist in your Chart of Accounts.
              </div>
            )}

            {expenseToEdit && (
              <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/5 shadow-2xs p-3.5 space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Correction Reason <span className="text-rose-500">*</span>
                </span>
                <textarea
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="Explain why this expense needs correction..."
                  rows={2}
                  className="w-full rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-2.5 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-500 resize-none"
                />
              </div>
            )}

            {/* CARD 1: Date, Itemize Expense, Expense Account, Paid Through */}
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/5 shadow-2xs divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
              {/* Row 1: Date */}
              <div
                onClick={() => {
                  try {
                    dateInputRef.current?.showPicker();
                  } catch {
                    dateInputRef.current?.focus();
                  }
                }}
                className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
              >
                <span className="text-sm font-medium text-rose-500 dark:text-rose-400">Date</span>
                <div className="flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                  <span>{formatDisplayDate(date)}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  ref={dateInputRef}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="sr-only"
                  aria-label="Posting date"
                />
              </div>

              {/* Row 2: Itemize Expense Switch */}
              <div className="flex items-center justify-between p-3.5">
                <span className="text-sm font-medium text-slate-800 dark:text-white">Itemize Expense</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isItemized}
                  onClick={() => {
                    const next = !isItemized;
                    setIsItemized(next);
                    if (next && items.length === 1 && !items[0].amount && amount) {
                      setItems([{ id: 'item-1', accountId: expenseAccountId || expenseAccounts[0]?.id || '', description: description || '', amount }]);
                    }
                  }}
                  className={`w-12 h-7 rounded-full p-0.5 transition-colors cursor-pointer relative ${
                    isItemized ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300 dark:bg-zinc-700'
                  }`}
                  aria-label="Itemize Expense"
                >
                  <div
                    className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${
                      isItemized ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Row 3: Expense Account (when not itemized) */}
              {!isItemized && (
                <div
                  onClick={() => {
                    setPickerSearch('');
                    setActivePicker('expenseAccount');
                  }}
                  className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
                >
                  <span className="text-sm font-medium text-rose-500 dark:text-rose-400">Expense Account</span>
                  <div className="flex items-center gap-1 text-sm">
                    {selectedExpenseAccount ? (
                      <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                        {selectedExpenseAccount.name}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-normal">Tap to Select</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                </div>
              )}

              {/* Row 4: Paid Through */}
              <div
                onClick={() => {
                  setPickerSearch('');
                  setActivePicker('paymentAccount');
                }}
                className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
              >
                <span className="text-sm font-medium text-rose-500 dark:text-rose-400">Paid Through</span>
                <div className="flex items-center gap-1 text-sm">
                  {selectedPaymentAccount ? (
                    <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                      {selectedPaymentAccount.name}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">Tap to Select</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              </div>
            </div>

            {/* ITEMIZE SPLIT EXPENSES LIST (WHEN TOGGLED ON) */}
            {isItemized && (
              <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/5 shadow-2xs p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Split Line Items</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Line</span>
                  </button>
                </div>

                <div className="space-y-2.5 divide-y divide-slate-100 dark:divide-white/5">
                  {items.map((it, idx) => (
                    <div key={it.id} className="pt-2 first:pt-0 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Line {idx + 1} Category</span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <select
                        value={it.accountId}
                        onChange={(e) => handleUpdateItem(idx, 'accountId', e.target.value)}
                        className="w-full text-xs font-semibold p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-800 dark:text-white outline-none"
                      >
                        <option value="">Select category</option>
                        {expenseAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Description"
                          value={it.description}
                          onChange={(e) => handleUpdateItem(idx, 'description', e.target.value)}
                          className="text-xs p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white outline-none"
                        />
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          placeholder="0.00"
                          value={it.amount}
                          onChange={(e) => handleUpdateItem(idx, 'amount', e.target.value)}
                          className="text-xs font-financial text-right p-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                  <span>Total Split Amount</span>
                  <span className="font-financial text-blue-600 dark:text-blue-400">
                    {settings.currencySymbol} {calculatedItemizedTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* CARD 2: Amount, Currency, Vendor */}
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/5 shadow-2xs divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
              {/* Row 1: Amount */}
              <div className="flex items-center justify-between p-3.5">
                <span className="text-sm font-medium text-rose-500 dark:text-rose-400">Amount</span>
                <div className="flex items-center justify-end">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={isItemized}
                    className="text-right font-financial text-sm font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none bg-transparent w-36 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Row 2: Currency */}
              <div className="flex items-center justify-between p-3.5">
                <span className="text-sm font-medium text-slate-800 dark:text-white">Currency</span>
                <div className="flex items-center gap-1 text-sm font-semibold text-blue-600 dark:text-blue-400">
                  <span>{settings.currencyCode || 'INR'}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>

              {/* Row 3: Vendor */}
              <div
                onClick={() => {
                  setPickerSearch('');
                  setActivePicker('vendor');
                }}
                className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
              >
                <span className="text-sm font-medium text-slate-800 dark:text-white">Vendor</span>
                <div className="flex items-center gap-1 text-sm">
                  {selectedVendor ? (
                    <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                      {selectedVendor.companyName || selectedVendor.name}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">Tap to Select</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              </div>
            </div>

            {/* CARD 3: Reference#, Notes */}
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/5 shadow-2xs divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
              {/* Row 1: Reference# */}
              <div className="flex items-center justify-between p-3.5">
                <span className="text-sm font-medium text-slate-800 dark:text-white">Reference#</span>
                <div className="flex items-center justify-end">
                  <input
                    type="text"
                    value={vendorInvoiceNumber}
                    onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                    placeholder="Tap to Enter"
                    className="text-right text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none bg-transparent w-40"
                  />
                </div>
              </div>

              {/* Row 2: Notes */}
              <div className="p-3.5 space-y-2">
                <span className="text-sm font-medium text-slate-800 dark:text-white block">Notes</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes about this expense..."
                  rows={3}
                  className="w-full rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 p-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            </div>

            {/* CARD 4: Customer */}
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/5 shadow-2xs divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
              <div
                onClick={() => {
                  setPickerSearch('');
                  setActivePicker('customer');
                }}
                className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
              >
                <span className="text-sm font-medium text-slate-800 dark:text-white">Customer</span>
                <div className="flex items-center gap-1 text-sm">
                  {selectedClient ? (
                    <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">
                      {selectedClient.companyName || selectedClient.name}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-normal">Tap to Select</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              </div>

              {/* Customer summary and settings */}
              {clientId && (
                <>
                  <div
                    onClick={() => setIsProjectBillingDialogOpen(true)}
                    className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-white">Project</span>
                    <div className="flex items-center gap-1 text-sm">
                      <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                        {projects.find((p) => p.id === projectId)?.name || 'No project'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5">
                    <div
                      className="space-y-0.5 cursor-pointer flex-1"
                      onClick={() => setIsProjectBillingDialogOpen(true)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-800 dark:text-white block">Billable to Customer</span>
                        {isBillable && (
                          <span className="text-[10px] uppercase font-black tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 rounded-full">
                            +{markupPercentage}%
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 block">
                        {isBillable
                          ? `Track as unbilled (${settings.currencySymbol} ${calculatedSellingPrice.toFixed(2)})`
                          : 'Track as unbilled for customer invoice'}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isBillable}
                      aria-label="Billable to Customer"
                      onClick={() => {
                        const next = !isBillable;
                        setIsBillable(next);
                        if (next) {
                          setIsProjectBillingDialogOpen(true);
                        }
                      }}
                      className={`w-12 h-7 rounded-full p-0.5 transition-colors cursor-pointer relative ${
                        isBillable ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300 dark:bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full bg-white shadow-md transform transition-transform ${
                          isBillable ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* CARD 5: Attachments */}
            <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-slate-200/80 dark:border-white/5 shadow-2xs divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
              <div
                onClick={() => receiptInputRef.current?.click()}
                className="flex items-center justify-between p-3.5 cursor-pointer hover:bg-slate-50/80 active:bg-slate-100 dark:hover:bg-zinc-800/50 transition-colors select-none"
              >
                <span className="text-sm font-medium text-slate-800 dark:text-white">Attachments</span>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                  {filePreviews.length > 0 && (
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full">
                      {filePreviews.length} {filePreviews.length === 1 ? 'file' : 'files'}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
                <input
                  ref={receiptInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    appendReceiptFiles(Array.from(e.target.files || []));
                    if (receiptInputRef.current) receiptInputRef.current.value = '';
                  }}
                />
              </div>

              {/* Receipt Image Previews */}
              {filePreviews.length > 0 && (
                <div className="p-3.5 flex flex-wrap gap-2.5">
                  {filePreviews.map(({ file, url }, index) => (
                    <div key={index} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-700">
                      <img src={url} alt={file.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReceiptFiles((curr) => curr.filter((_, i) => i !== index));
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center text-xs hover:bg-rose-600 transition-colors cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM SHEET PICKER FOR MOBILE */}
          {activePicker && (
            <div className="fixed inset-0 z-[70] flex flex-col justify-end">
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
                onClick={() => setActivePicker(null)}
              />
              <div className="relative z-10 max-h-[82vh] w-full rounded-t-3xl bg-white dark:bg-zinc-900 shadow-2xl flex flex-col overflow-hidden pb-6 animate-in slide-in-from-bottom duration-250">
                {/* Drag Handle & Header */}
                <div className="pt-3 pb-2.5 px-5 border-b border-slate-100 dark:border-zinc-800">
                  <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-zinc-700 mx-auto mb-3" />
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {activePicker === 'expenseAccount' && 'Select Expense Account'}
                      {activePicker === 'paymentAccount' && 'Select Paid Through'}
                      {activePicker === 'vendor' && 'Select Vendor'}
                      {activePicker === 'customer' && 'Select Customer'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActivePicker(null)}
                      className="w-7 h-7 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="mt-3 relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={pickerSearch}
                      onChange={(e) => setPickerSearch(e.target.value)}
                      placeholder="Search options..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-800 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none"
                    />
                  </div>
                </div>

                {/* Items List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-slate-100 dark:divide-zinc-800/80">
                  {/* Expense Account Options */}
                  {activePicker === 'expenseAccount' && (
                    <>
                      <div className="pb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePicker(null);
                            setIsAddExpenseModalOpen(true);
                          }}
                          className="w-full py-2.5 px-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>New Account</span>
                        </button>
                      </div>
                      {expenseAccounts
                        .filter((a) => !pickerSearch || `${a.code} ${a.name}`.toLowerCase().includes(pickerSearch.toLowerCase()))
                        .map((account) => {
                          const isSelected = account.id === expenseAccountId;
                          return (
                            <div
                              key={account.id}
                              onClick={() => {
                                setExpenseAccountId(account.id);
                                setActivePicker(null);
                              }}
                              className={`pt-1.5 p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100 font-bold' : 'hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div>
                                <span className="text-sm block">{account.code} - {account.name}</span>
                                <span className="text-[11px] text-slate-400 font-normal">{account.type} / {account.subType}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </div>
                          );
                        })}
                    </>
                  )}

                  {/* Payment Account Options */}
                  {activePicker === 'paymentAccount' && (
                    <>
                      <div className="pb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActivePicker(null);
                            setIsAddPaymentModalOpen(true);
                          }}
                          className="w-full py-2.5 px-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>New Bank / Card</span>
                        </button>
                      </div>
                      {paymentAccounts
                        .filter((a) => !pickerSearch || `${a.code} ${a.name}`.toLowerCase().includes(pickerSearch.toLowerCase()))
                        .map((account) => {
                          const isSelected = account.id === paidFromAccountId;
                          return (
                            <div
                              key={account.id}
                              onClick={() => {
                                setPaidFromAccountId(account.id);
                                setActivePicker(null);
                              }}
                              className={`pt-1.5 p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100 font-bold' : 'hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div>
                                <span className="text-sm block">{account.code} - {account.name}</span>
                                <span className="text-[11px] text-slate-400 font-normal">{account.subType || account.type}</span>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </div>
                          );
                        })}
                    </>
                  )}

                  {/* Vendor Options */}
                  {activePicker === 'vendor' && (
                    <>
                      <div className="pb-2">
                        <button
                          type="button"
                          onClick={() => {
                            resetNewVendorDraft();
                            setActivePicker(null);
                            setIsAddVendorModalOpen(true);
                          }}
                          className="w-full py-2.5 px-3 rounded-xl border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Add New Vendor</span>
                        </button>
                      </div>
                      <div
                        onClick={() => {
                          setVendorId('');
                          setActivePicker(null);
                        }}
                        className={`pt-1.5 p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                          !vendorId ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 font-bold' : 'hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-500'
                        }`}
                      >
                        <span className="text-sm">No vendor selected</span>
                        {!vendorId && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      {vendors
                        .filter((v) => !pickerSearch || (v.companyName || v.name).toLowerCase().includes(pickerSearch.toLowerCase()))
                        .map((vendor) => {
                          const isSelected = vendor.id === vendorId;
                          return (
                            <div
                              key={vendor.id}
                              onClick={() => {
                                handleVendorChange(vendor.id);
                                setActivePicker(null);
                              }}
                              className={`pt-1.5 p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100 font-bold' : 'hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <span className="text-sm">{vendor.companyName || vendor.name}</span>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </div>
                          );
                        })}
                    </>
                  )}

                  {/* Customer Options */}
                  {activePicker === 'customer' && (
                    <>
                      <div
                        onClick={() => {
                          handleClientChange('');
                          setActivePicker(null);
                        }}
                        className={`pt-1.5 p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                          !clientId ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 font-bold' : 'hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-500'
                        }`}
                      >
                        <span className="text-sm">No customer selected</span>
                        {!clientId && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </div>
                      {clients
                        .filter((c) => !pickerSearch || (c.companyName || c.name).toLowerCase().includes(pickerSearch.toLowerCase()))
                        .map((client) => {
                          const isSelected = client.id === clientId;
                          return (
                            <div
                              key={client.id}
                              onClick={() => {
                                handleClientChange(client.id);
                                setActivePicker(null);
                              }}
                              className={`pt-1.5 p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                                isSelected ? 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100 font-bold' : 'hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <span className="text-sm">{client.companyName || client.name}</span>
                              {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                            </div>
                          );
                        })}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* DESKTOP VIEW - 100% UNCHANGED */
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
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{expenseToEdit ? 'Edit & correct expense' : 'Record Expense'}</h2>
                  <p className="mt-0.5 text-xs text-slate-500">{expenseToEdit ? 'The original journal will be reversed and a corrected expense will be posted.' : 'Record a paid business expense and attach its receipt.'}</p>
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
                    Saving this correction will preserve the original expense, post its audited reversal, and create a new corrected expense.
                  </p>
                </div>
              )}

              {expenseToEdit && (
                <label className="mb-5 block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <span>Correction reason <span className="text-rose-600">*</span></span>
                  <textarea
                    value={correctionReason}
                    onChange={(event) => setCorrectionReason(event.target.value)}
                    maxLength={1000}
                    rows={2}
                    required
                    placeholder="Explain why the recorded expense needs correction"
                    className="w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </label>
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
                <div className="order-none min-w-0 space-y-4">
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
                                    <SearchableAccountPicker
                                      id={`expense-item-${it.id}-account-select`}
                                      label={`Expense category, line ${idx + 1}`}
                                      placeholder="Select category"
                                      accounts={expenseAccounts}
                                      value={it.accountId}
                                      onChange={(accountId) => handleUpdateItem(idx, 'accountId', accountId)}
                                    />
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
                        <span>Vendor invoice / receipt #</span>
                        <input
                          value={vendorInvoiceNumber}
                          onChange={(event) => setVendorInvoiceNumber(event.target.value)}
                          maxLength={128}
                          placeholder="Optional reference number"
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        />
                      </label>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label htmlFor="expense-vendor-select" className="text-sm font-semibold text-slate-700 dark:text-slate-200">Vendor</label>
                          <button
                            type="button"
                            onClick={() => {
                              resetNewVendorDraft();
                              setIsAddVendorModalOpen(true);
                            }}
                            className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            <span>Add vendor</span>
                          </button>
                        </div>
                        <select
                          id="expense-vendor-select"
                          value={vendorId}
                          onChange={(event) => handleVendorChange(event.target.value)}
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">No vendor selected</option>
                          {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.companyName || vendor.name}</option>)}
                        </select>
                      </div>

                      <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        <span>Customer</span>
                        <select
                          id="expense-customer-select"
                          aria-label="Customer"
                          value={clientId}
                          onChange={(event) => handleClientChange(event.target.value)}
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">No customer selected</option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.companyName || client.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
                        <span>Project</span>
                        <select
                          id="expense-project-select"
                          aria-label="Project"
                          value={projectId}
                          onChange={(event) => handleProjectChange(event.target.value)}
                          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">No project selected</option>
                          {availableProjects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.code} — {project.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      {/* Zoho Books Billable to Customer Switch & Markup Settings */}
                      <div className="sm:col-span-2 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-2">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            id="expense-is-billable"
                            aria-label="Billable to customer"
                            checked={isBillable}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setIsBillable(checked);
                              if (checked && clientId) {
                                setIsProjectBillingDialogOpen(true);
                              }
                            }}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-700"
                          />
                          <div className="space-y-0.5 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <span>Billable to Customer</span>
                                {isBillable && (
                                  <span className="text-[10px] uppercase font-black tracking-wider bg-amber-200/70 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 px-1.5 py-0.2 rounded">
                                    Recoverable Cost
                                  </span>
                                )}
                              </span>
                              {clientId && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setIsProjectBillingDialogOpen(true);
                                  }}
                                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                  Configure Project & Markup
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">
                              Paid upfront by your firm. Check this to track this expense as unbilled and convert it to a customer invoice later.
                            </p>
                            {isBillable && !clientId && !projectId && (
                              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1">
                                * Please select a customer above to bill this expense to.
                              </p>
                            )}
                            {isBillable && clientId && (
                              <div className="pt-1.5 flex items-center gap-2 text-xs">
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  Markup: <span className="text-blue-600 dark:text-blue-400 font-bold">+{markupPercentage}%</span>
                                </span>
                                <span className="text-slate-400">•</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  Customer Price: <span className="text-blue-600 dark:text-blue-400 font-bold font-financial">{settings.currencySymbol} {calculatedSellingPrice.toFixed(2)}</span>
                                </span>
                              </div>
                            )}
                          </div>
                        </label>
                      </div>

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

                <section className="order-none min-w-0 border border-slate-200 p-4 dark:border-slate-700 sm:p-5">
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
                  disabled={postingUnavailable || isSubmitting}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (expenseToEdit ? 'Correcting…' : 'Recording…') : (expenseToEdit ? 'Save correction' : 'Record expense')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
      )}

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

      {isAddVendorModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="Add vendor">
          <form onSubmit={handleCreateVendor} className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Add vendor</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Create a vendor and use it for this expense.</p>
              </div>
              <button type="button" onClick={() => setIsAddVendorModalOpen(false)} disabled={isCreatingVendor} aria-label="Close add vendor" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-5 block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>Vendor name <span className="text-rose-600">*</span></span>
              <input
                autoFocus
                value={newVendorName}
                onChange={(event) => setNewVendorName(event.target.value)}
                placeholder="e.g. Acme Supplies"
                maxLength={255}
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Company name</span>
                <input aria-label="Vendor company name" value={newVendorCompanyName} onChange={(event) => setNewVendorCompanyName(event.target.value)} maxLength={255} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Legal name</span>
                <input aria-label="Vendor legal name" value={newVendorLegalName} onChange={(event) => setNewVendorLegalName(event.target.value)} maxLength={255} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Vendor type</span>
                <select aria-label="Vendor type" value={newVendorType} onChange={(event) => setNewVendorType(event.target.value as 'Business' | 'Individual')} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option>Business</option><option>Individual</option></select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>GST registration</span>
                <select aria-label="Vendor GST registration" value={newVendorGstStatus} onChange={(event) => setNewVendorGstStatus(event.target.value as typeof newVendorGstStatus)} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option>Unregistered</option><option>Registered</option><option>Composition</option><option>SEZ</option></select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Salutation</span>
                <select aria-label="Vendor contact salutation" value={newVendorSalutation} onChange={(event) => setNewVendorSalutation(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="">Select</option><option>Mr.</option><option>Ms.</option><option>Mrs.</option><option>Dr.</option></select>
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Contact first name</span><input aria-label="Vendor contact first name" value={newVendorFirstName} onChange={(event) => setNewVendorFirstName(event.target.value)} maxLength={120} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Contact last name</span><input aria-label="Vendor contact last name" value={newVendorLastName} onChange={(event) => setNewVendorLastName(event.target.value)} maxLength={120} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>PAN</span><input aria-label="Vendor PAN" value={newVendorPan} onChange={(event) => setNewVendorPan(event.target.value.toUpperCase())} maxLength={20} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-mono font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Place of supply</span><input aria-label="Vendor place of supply" value={newVendorPlaceOfSupply} onChange={(event) => setNewVendorPlaceOfSupply(event.target.value)} maxLength={100} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>GSTIN / Tax ID</span>
                <input
                  value={newVendorTaxId}
                  onChange={(event) => setNewVendorTaxId(event.target.value)}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  maxLength={50}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-mono font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Email</span>
                <input
                  type="email"
                  value={newVendorEmail}
                  onChange={(event) => setNewVendorEmail(event.target.value)}
                  placeholder="accounts@vendor.com"
                  maxLength={255}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <span>Phone</span>
                <input
                  type="tel"
                  value={newVendorPhone}
                  onChange={(event) => setNewVendorPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                  maxLength={50}
                  className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Mobile</span><input aria-label="Vendor mobile" type="tel" value={newVendorMobile} onChange={(event) => setNewVendorMobile(event.target.value)} maxLength={50} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Website</span><input aria-label="Vendor website" type="url" value={newVendorWebsite} onChange={(event) => setNewVendorWebsite(event.target.value)} maxLength={255} placeholder="https://" className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
            </div>
            <label className="mt-3 block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>Payment terms</span>
              <select
                value={newVendorPaymentTerms}
                onChange={(event) => setNewVendorPaymentTerms(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Due on Receipt">Due on Receipt</option>
                <option value="Net 15">Net 15 Days</option>
                <option value="Net 30">Net 30 Days</option>
                <option value="Net 45">Net 45 Days</option>
                <option value="Net 60">Net 60 Days</option>
              </select>
            </label>
            <label className="mt-3 block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>Shipping address</span>
              <textarea aria-label="Vendor shipping address" value={newVendorShippingAddress} onChange={(event) => setNewVendorShippingAddress(event.target.value)} rows={2} maxLength={10000} className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
            </label>
            <label className="mt-3 block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <span>Billing address</span>
              <textarea
                value={newVendorBillingAddress}
                onChange={(event) => setNewVendorBillingAddress(event.target.value)}
                placeholder="Street, city, state and postal code"
                rows={2}
                maxLength={10000}
                className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 outline-hidden focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </label>
            <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Purchasing defaults and extra contact</h4>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Default expense account</span><select aria-label="Vendor default expense account" value={newVendorDefaultExpenseAccountId} onChange={(event) => setNewVendorDefaultExpenseAccountId(event.target.value)} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white"><option value="">Choose when recording each expense</option>{expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}</select></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Additional contact name</span><input aria-label="Vendor additional contact name" value={newVendorExtraContact.name} onChange={(event) => setNewVendorExtraContact((current) => ({ ...current, name: event.target.value }))} maxLength={255} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Additional contact role</span><input aria-label="Vendor additional contact role" value={newVendorExtraContact.designation} onChange={(event) => setNewVendorExtraContact((current) => ({ ...current, designation: event.target.value }))} maxLength={120} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Additional contact email</span><input aria-label="Vendor additional contact email" type="email" value={newVendorExtraContact.email} onChange={(event) => setNewVendorExtraContact((current) => ({ ...current, email: event.target.value }))} maxLength={255} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Additional contact work phone</span><input aria-label="Vendor additional contact phone" type="tel" value={newVendorExtraContact.phone} onChange={(event) => setNewVendorExtraContact((current) => ({ ...current, phone: event.target.value }))} maxLength={50} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Additional contact mobile</span><input aria-label="Vendor additional contact mobile" type="tel" value={newVendorExtraContact.mobile} onChange={(event) => setNewVendorExtraContact((current) => ({ ...current, mobile: event.target.value }))} maxLength={50} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              </div>
            </div>
            <details className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <summary className="cursor-pointer text-sm font-bold text-slate-900 dark:text-white">Bank details and organization-specific field</summary>
              <p className="mt-2 text-xs text-slate-500">Bank account numbers are encrypted before storage and never returned in full.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Bank name</span><input aria-label="Vendor bank name" value={newVendorBankName} onChange={(event) => setNewVendorBankName(event.target.value)} maxLength={120} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Account name</span><input aria-label="Vendor bank account name" value={newVendorBankAccountName} onChange={(event) => setNewVendorBankAccountName(event.target.value)} maxLength={120} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Account number</span><input aria-label="Vendor bank account number" type="password" autoComplete="new-password" value={newVendorBankAccountNumber} onChange={(event) => setNewVendorBankAccountNumber(event.target.value)} maxLength={34} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>IFSC</span><input aria-label="Vendor bank IFSC" value={newVendorBankIfsc} onChange={(event) => setNewVendorBankIfsc(event.target.value.toUpperCase())} maxLength={20} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>SWIFT</span><input aria-label="Vendor bank SWIFT" value={newVendorBankSwift} onChange={(event) => setNewVendorBankSwift(event.target.value.toUpperCase())} maxLength={11} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Branch</span><input aria-label="Vendor bank branch" value={newVendorBankBranch} onChange={(event) => setNewVendorBankBranch(event.target.value)} maxLength={120} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Account type</span><input aria-label="Vendor bank account type" value={newVendorBankAccountType} onChange={(event) => setNewVendorBankAccountType(event.target.value)} maxLength={40} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Custom field name</span><input aria-label="Vendor custom field name" value={newVendorCustomFieldKey} onChange={(event) => setNewVendorCustomFieldKey(event.target.value)} maxLength={80} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
                <label className="space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Custom field value</span><input aria-label="Vendor custom field value" value={newVendorCustomFieldValue} onChange={(event) => setNewVendorCustomFieldValue(event.target.value)} maxLength={500} className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
              </div>
            </details>
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"><strong>Currency:</strong> {settings.currencyCode}. Opening balances are established through an opening bill or verified migration so Accounts Payable and the ledger remain aligned.</div>
            <label className="mt-3 block space-y-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200"><span>Notes</span><textarea aria-label="Vendor notes" value={newVendorNotes} onChange={(event) => setNewVendorNotes(event.target.value)} rows={3} maxLength={20000} className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-800 dark:text-white" /></label>
            {newVendorError && <p role="alert" className="mt-3 text-xs font-medium text-rose-600 dark:text-rose-400">{newVendorError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsAddVendorModalOpen(false)} disabled={isCreatingVendor} className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer">Cancel</button>
              <button type="submit" disabled={isCreatingVendor} className="rounded-md bg-blue-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 cursor-pointer">{isCreatingVendor ? 'Creating…' : 'Create vendor'}</button>
            </div>
          </form>
        </div>
      )}
      {isProjectBillingDialogOpen && (
        <ProjectBillingDialog
          isOpen={isProjectBillingDialogOpen}
          onClose={() => setIsProjectBillingDialogOpen(false)}
          onApply={handleApplyProjectBilling}
          client={selectedClient}
          projects={availableProjects}
          initialProjectId={projectId}
          initialIsBillable={isBillable}
          initialMarkupPercentage={markupPercentage}
          costBasis={currentCostBasis}
          currencyCode={settings.currencyCode}
          currencySymbol={settings.currencySymbol}
          isMobile={isMobile}
        />
      )}
    </>
  );
};
