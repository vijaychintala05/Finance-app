import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  FileText,
  Paperclip,
  Plus,
  Receipt,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Expense, ExpenseItem } from '../../types';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';
import { QuickAddAccountModal } from '../common/QuickAddAccountModal';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenseToEdit?: Expense | null;
  defaultProjectId?: string;
  defaultClientId?: string;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({
  isOpen,
  onClose,
  expenseToEdit,
  defaultProjectId,
  defaultClientId,
}) => {
  const {
    accounts,
    vendors,
    projects,
    clients,
    addExpense,
    addVendor,
    addClient,
    addAccount,
    settings,
  } = useBooks();

  const expenseAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.type === 'Expense' ||
          a.type === 'Cost of Goods Sold' ||
          a.type === 'Other Expense'
      ),
    [accounts]
  );
  const paymentAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          a.type === 'Asset' ||
          a.subType === 'Bank' ||
          a.subType === 'Cash' ||
          a.subType === 'Credit Cards' ||
          a.subType === 'Cash & Bank' ||
          a.subType === 'Current Liability'
      ),
    [accounts]
  );

  const bankAccounts = useMemo(
    () => paymentAccounts.filter((a) => a.subType === 'Bank'),
    [paymentAccounts]
  );
  const cashAccounts = useMemo(
    () => paymentAccounts.filter((a) => a.subType === 'Cash' || a.subType === 'Cash & Bank'),
    [paymentAccounts]
  );
  const creditCardAccounts = useMemo(
    () => paymentAccounts.filter((a) => a.subType === 'Credit Cards'),
    [paymentAccounts]
  );
  const otherPaymentAccounts = useMemo(
    () =>
      paymentAccounts.filter(
        (a) =>
          a.subType !== 'Bank' &&
          a.subType !== 'Cash' &&
          a.subType !== 'Cash & Bank' &&
          a.subType !== 'Credit Cards'
      ),
    [paymentAccounts]
  );

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState<string>('');
  const [paidFromAccountId, setPaidFromAccountId] = useState<string>('');
  const [isItemized, setIsItemized] = useState(false);
  const [items, setItems] = useState<ExpenseItem[]>([
    {
      id: '1',
      description: '',
      accountId: '',
      accountName: '',
      amount: 0,
    },
  ]);

  const [currency, setCurrency] = useState(settings.currencyCode || 'INR');
  const [amount, setAmount] = useState<string>('');
  const [taxAmount, setTaxAmount] = useState<string>('0');

  const [vendorId, setVendorId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [customerId, setCustomerId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [isBillable, setIsBillable] = useState(false);

  // Receipt Attachment State
  const [receiptFile, setReceiptFile] = useState<{ name: string; url: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline Quick Add Modals State
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorCompany, setNewVendorCompany] = useState('');

  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerCompany, setNewCustomerCompany] = useState('');

  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountCode, setNewAccountCode] = useState('');
  const [newAccountName, setNewAccountName] = useState('');

  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);
  const [showQuickAddAccountModal, setShowQuickAddAccountModal] = useState(false);
  const [quickAddCategory, setQuickAddCategory] = useState<'Bank' | 'Cash' | 'Credit Cards' | 'Expense'>('Bank');

  // Synchronize state when modal opens or editing expense changes
  useEffect(() => {
    if (isOpen) {
      if (expenseToEdit) {
        setDate(expenseToEdit.date || new Date().toISOString().split('T')[0]);
        setAccountId(expenseToEdit.accountId || '');
        setPaidFromAccountId(expenseToEdit.paidFromAccountId || '');
        setIsItemized(!!expenseToEdit.isItemized);
        if (expenseToEdit.items && expenseToEdit.items.length > 0) {
          setItems(expenseToEdit.items);
        } else {
          setItems([
            {
              id: '1',
              description: expenseToEdit.description || '',
              accountId: expenseToEdit.accountId || '',
              accountName: expenseToEdit.accountName || '',
              amount: expenseToEdit.amount || 0,
            },
          ]);
        }
        setCurrency(expenseToEdit.currency || settings.currencyCode || 'INR');
        setAmount(expenseToEdit.amount ? String(expenseToEdit.amount) : '');
        setTaxAmount(expenseToEdit.taxAmount ? String(expenseToEdit.taxAmount) : '0');
        setVendorId(expenseToEdit.vendorId || '');
        setInvoiceNumber(expenseToEdit.invoiceNumber || '');
        setNotes(expenseToEdit.notes || expenseToEdit.description || '');
        setCustomerId(expenseToEdit.clientId || '');
        setProjectId(expenseToEdit.projectId || '');
        setIsBillable(!!expenseToEdit.isBillable);
        if (expenseToEdit.receiptMockUrl || expenseToEdit.receiptFileName) {
          setReceiptFile({
            name: expenseToEdit.receiptFileName || 'receipt_attachment.png',
            url: expenseToEdit.receiptMockUrl || 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=300&auto=format&fit=crop',
          });
        } else {
          setReceiptFile(null);
        }
      } else {
        // Defaults for new expense
        setDate(new Date().toISOString().split('T')[0]);
        const defaultExpAcc = expenseAccounts[0]?.id || '';
        const defaultPayAcc = paymentAccounts[0]?.id || '';
        setAccountId(defaultExpAcc);
        setPaidFromAccountId(defaultPayAcc);
        setIsItemized(false);
        setItems([
          {
            id: '1',
            description: '',
            accountId: defaultExpAcc,
            accountName: expenseAccounts[0]?.name || '',
            amount: 0,
          },
        ]);
        setCurrency(settings.currencyCode || 'INR');
        setAmount('');
        setTaxAmount('0');
        setVendorId('');
        setInvoiceNumber('');
        setNotes('');
        const proj = projects.find((p) => p.id === defaultProjectId);
        const resolvedClientId = defaultClientId || proj?.clientId || '';
        setCustomerId(resolvedClientId);
        setProjectId(defaultProjectId || '');
        setIsBillable(!!defaultProjectId);
        setReceiptFile(null);
      }
    }
  }, [isOpen, expenseToEdit, defaultProjectId, defaultClientId]);

  // Handle Itemized line items recalculation
  useEffect(() => {
    if (isItemized) {
      const sum = items.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
      setAmount(String(sum));
    }
  }, [items, isItemized]);

  // Handle Customer change filtering projects
  const availableProjects = projects.filter(
    (p) => !customerId || p.clientId === customerId
  );

  if (!isOpen) return null;

  // Handle File Upload for Receipt
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setReceiptFile({
          name: file.name,
          url: event.target?.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Add line item for itemized expense
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        description: '',
        accountId: accountId || expenseAccounts[0]?.id || '',
        accountName: accounts.find((a) => a.id === accountId)?.name || '',
        amount: 0,
      },
    ]);
  };

  const handleUpdateItem = (id: string, field: keyof ExpenseItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          if (field === 'accountId') {
            const acc = accounts.find((a) => a.id === value);
            updated.accountName = acc?.name || '';
          }
          return updated;
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Quick Inline Creates
  const handleCreateVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendorName) return;
    addVendor({
      name: newVendorName,
      companyName: newVendorCompany || newVendorName,
      email: '',
      phone: '',
    });
    setNewVendorName('');
    setNewVendorCompany('');
    setShowAddVendor(false);
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName) return;
    addClient({
      name: newCustomerName,
      companyName: newCustomerCompany || newCustomerName,
      email: '',
      phone: '',
      billingAddress: '',
      currency: currency || 'INR',
      paymentTerms: 'Due on Receipt',
    });
    setNewCustomerName('');
    setNewCustomerCompany('');
    setShowAddCustomer(false);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName) return;
    const code = newAccountCode || `5${Math.floor(100 + Math.random() * 900)}`;
    addAccount({
      code,
      name: newAccountName,
      type: 'Expense',
      subType: 'Operating Expense',
      balance: 0,
    });
    setNewAccountCode('');
    setNewAccountName('');
    setShowAddAccount(false);
  };

  // Final Submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = Number(amount) || 0;
    if (finalAmount <= 0) {
      alert('Please enter a valid expense amount.');
      return;
    }
    if (!isItemized && !accountId) {
      alert('Please select an Expense Account.');
      return;
    }
    if (!paidFromAccountId) {
      alert('Please select a Paid Through account.');
      return;
    }

    const mainAcc = accounts.find((a) => a.id === accountId);
    const paidAcc = accounts.find((a) => a.id === paidFromAccountId);
    const ven = vendors.find((v) => v.id === vendorId);
    const prj = projects.find((p) => p.id === projectId);
    const cli = clients.find((c) => c.id === customerId) || (prj ? clients.find((c) => c.id === prj.clientId) : undefined);

    addExpense({
      vendorId: vendorId || undefined,
      vendorName: ven?.companyName || ven?.name || undefined,
      invoiceNumber: invoiceNumber || undefined,
      accountId: accountId || items[0]?.accountId || 'acc-5000',
      accountName: mainAcc?.name || items[0]?.accountName || 'Operating Expense',
      paidFromAccountId,
      paidFromAccountName: paidAcc?.name || 'Cash & Bank',
      projectId: projectId || undefined,
      projectName: prj?.name || undefined,
      clientId: cli?.id || undefined,
      clientName: cli?.companyName || cli?.name || undefined,
      date,
      currency,
      amount: finalAmount,
      taxAmount: Number(taxAmount) || 0,
      isItemized,
      items: isItemized ? items : undefined,
      isBillable,
      paymentStatus: 'Paid',
      description: notes || (isItemized ? 'Itemized Expense Record' : mainAcc?.name || 'Expense Record'),
      notes: notes || undefined,
      receiptFileName: receiptFile?.name || undefined,
      receiptMockUrl: receiptFile?.url || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-100 dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Bar matching Zoho / Mobile Record Expense layout */}
        <div className="bg-white dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 z-10 shadow-xs">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-extrabold text-slate-800 dark:text-white tracking-tight">
              {expenseToEdit ? 'Edit Expense' : 'Record Expense'}
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSubmit}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors cursor-pointer shadow-xs flex items-center gap-1"
            >
              <Check className="w-4 h-4" />
              <span>SAVE</span>
            </button>
          </div>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* TOP CARD: Date, Receipt Ticket Attachment, Accounts, Itemize Switch */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs relative space-y-4">
            {/* Ticket style Receipt Attachment badge on Top Right */}
            <div className="sm:absolute sm:top-4 sm:right-4 flex flex-col items-center justify-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*,.pdf"
                className="hidden"
              />
              {receiptFile ? (
                <div className="relative group w-28 h-24 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50/50 p-2 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] text-emerald-700 font-bold truncate max-w-[90px]">
                    {receiptFile.name}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-semibold mt-0.5">
                    Receipt Attached ✓
                  </span>
                  <button
                    type="button"
                    onClick={() => setReceiptFile(null)}
                    className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-md hover:bg-rose-600 cursor-pointer"
                    title="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-28 h-24 border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/80 hover:bg-blue-50/30 rounded-xl flex flex-col items-center justify-center p-2 text-slate-500 hover:text-blue-600 transition-all cursor-pointer group shadow-2xs relative overflow-hidden"
                >
                  <Paperclip className="w-5 h-5 text-slate-400 group-hover:text-blue-600 mb-1 transition-transform group-hover:scale-110" />
                  <span className="text-xs font-semibold leading-tight text-center">
                    Attach Receipt
                  </span>
                  {/* Serrated Ticket Bottom Effect */}
                  <div className="absolute bottom-0 inset-x-0 h-1 flex justify-between px-1">
                    <div className="w-1.5 h-1.5 bg-white rounded-full -mb-1"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full -mb-1"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full -mb-1"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full -mb-1"></div>
                    <div className="w-1.5 h-1.5 bg-white rounded-full -mb-1"></div>
                  </div>
                </button>
              )}
            </div>

            {/* Date Input */}
            <div className="sm:w-1/2 pr-0 sm:pr-4">
              <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-50 border-b-2 border-slate-200 focus:border-blue-600 text-slate-900 font-semibold px-2 py-1.5 text-sm focus:outline-none transition-colors"
              />
            </div>

            {/* Expense Account (Required red label) */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-rose-500 tracking-wide">
                  Expense Category (Debited) *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddCategory('Expense');
                    setShowQuickAddAccountModal(true);
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> New Expense Category
                </button>
              </div>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                disabled={isItemized}
                className="w-full bg-slate-50 border-b-2 border-slate-200 focus:border-blue-600 text-slate-800 font-medium px-2 py-2 text-sm focus:outline-none transition-colors disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">Select Expense Account</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.code}] {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Paid Through / Payment Account */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-rose-500 tracking-wide">
                  Paid From / Payment Account *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setQuickAddCategory('Bank');
                    setShowQuickAddAccountModal(true);
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> New Cash / Bank Account
                </button>
              </div>
              <select
                value={paidFromAccountId}
                onChange={(e) => setPaidFromAccountId(e.target.value)}
                required
                className="w-full bg-slate-50 border-b-2 border-slate-200 focus:border-blue-600 text-slate-800 font-semibold px-2 py-2 text-sm focus:outline-none transition-colors"
              >
                <option value="">Select Account Paid From (Bank / Cash / Credit Card)</option>
                {bankAccounts.length > 0 && (
                  <optgroup label="🏦 Bank Accounts">
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} [{a.code}] — Balance: {settings.currencySymbol}{a.balance.toLocaleString()}
                      </option>
                    ))}
                  </optgroup>
                )}
                {cashAccounts.length > 0 && (
                  <optgroup label="💵 Cash Accounts">
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} [{a.code}] — Balance: {settings.currencySymbol}{a.balance.toLocaleString()}
                      </option>
                    ))}
                  </optgroup>
                )}
                {creditCardAccounts.length > 0 && (
                  <optgroup label="💳 Credit Cards">
                    {creditCardAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} [{a.code}] — Owed: {settings.currencySymbol}{a.balance.toLocaleString()}
                      </option>
                    ))}
                  </optgroup>
                )}
                {otherPaymentAccounts.length > 0 && (
                  <optgroup label="📁 Other Payment Accounts">
                    {otherPaymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} [{a.code}] — Balance: {settings.currencySymbol}{a.balance.toLocaleString()}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {/* Itemize Toggle Switch */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-blue-700">Itemize</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isItemized}
                  onChange={(e) => setIsItemized(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* Itemized Line Items Breakdown section if Itemize is ON */}
            {isItemized && (
              <div className="mt-3 p-4 bg-slate-50 rounded-xl border border-blue-100 space-y-3 animate-fade-in">
                <div className="flex justify-between items-center text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <span>Line Items</span>
                  <span>Amount</span>
                </div>
                {items.map((item, index) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder={`Line ${index + 1} Description`}
                      value={item.description}
                      onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      value={item.accountId}
                      onChange={(e) => handleUpdateItem(item.id, 'accountId', e.target.value)}
                      className="w-36 bg-white border border-slate-200 rounded-lg p-2 text-xs"
                    >
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={item.amount || ''}
                      onChange={(e) =>
                        handleUpdateItem(item.id, 'amount', Number(e.target.value))
                      }
                      className="w-24 bg-white border border-slate-200 rounded-lg p-2 text-xs font-bold text-right"
                    />
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer pt-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Another Item
                </button>
              </div>
            )}
          </div>

          {/* SECOND CARD: Amount */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-2">
            <label className="block text-xs font-bold text-rose-500 tracking-wide">Amount *</label>
            <div className="flex items-center gap-3">
              {/* Currency Selector */}
              <select
                value={settings.onlyDefaultCurrency ? settings.currencyCode : currency}
                onChange={(e) => setCurrency(e.target.value)}
                disabled={settings.onlyDefaultCurrency}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {settings.onlyDefaultCurrency ? (
                  <option value={settings.currencyCode}>{settings.currencyCode} ({settings.currencySymbol})</option>
                ) : (
                  (settings.currencies && settings.currencies.length > 0
                    ? settings.currencies
                    : [
                        { code: 'INR', symbol: '₹' },
                        { code: 'USD', symbol: '$' },
                        { code: 'EUR', symbol: '€' },
                        { code: 'GBP', symbol: '£' },
                        { code: 'CAD', symbol: 'C$' },
                        { code: 'AUD', symbol: 'A$' },
                      ]
                  ).map((curr) => (
                    <option key={curr.code} value={curr.code}>
                      {curr.code} ({curr.symbol})
                    </option>
                  ))
                )}
              </select>

              {/* Amount Input */}
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isItemized}
                required
                className="flex-1 bg-slate-50 dark:bg-slate-800 border-b-2 border-slate-200 dark:border-slate-700 focus:border-blue-600 text-slate-900 dark:text-white font-extrabold text-2xl px-2 py-1 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {/* THIRD CARD: Vendor, Invoice#, Notes, Customer */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs space-y-4">
            {/* Vendor */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-blue-600 tracking-wide">Vendor</label>
                <button
                  type="button"
                  onClick={() => setShowAddVendor(true)}
                  className="text-slate-400 hover:text-blue-600 text-lg font-bold px-1 transition-colors cursor-pointer"
                  title="Add New Vendor"
                >
                  +
                </button>
              </div>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full bg-slate-50 border-b-2 border-slate-200 focus:border-blue-600 text-slate-800 font-medium px-2 py-2 text-sm focus:outline-none transition-colors"
              >
                <option value="">Start typing to select a Vendor</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.companyName || v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Invoice# */}
            <div>
              <label className="block text-xs font-bold text-blue-600 tracking-wide mb-1">
                Invoice#
              </label>
              <input
                type="text"
                placeholder="e.g. INV-9021 or Ref#"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full bg-slate-50 border-b-2 border-slate-200 focus:border-blue-600 text-slate-800 font-medium px-2 py-1.5 text-sm focus:outline-none transition-colors"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-blue-600 tracking-wide mb-1">
                Notes
              </label>
              <textarea
                rows={2}
                placeholder="Expense remarks or details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border-b-2 border-slate-200 focus:border-blue-600 text-slate-800 font-medium px-2 py-1.5 text-xs focus:outline-none transition-colors resize-none"
              />
            </div>

            {/* Customer */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold text-blue-600 tracking-wide">Customer</label>
                <button
                  type="button"
                  onClick={() => setShowAddCustomer(true)}
                  className="text-slate-400 hover:text-blue-600 text-lg font-bold px-1 transition-colors cursor-pointer"
                  title="Add New Customer"
                >
                  +
                </button>
              </div>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full bg-slate-50 border-b-2 border-slate-200 focus:border-blue-600 text-slate-800 font-medium px-2 py-2 text-sm focus:outline-none transition-colors"
              >
                <option value="">Start typing to select a Customer</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName || c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Project Tag & Billable Checkbox */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Tag Project (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsQuickProjectOpen(true)}
                    className="text-slate-400 hover:text-blue-600 text-lg font-bold px-1 transition-colors cursor-pointer"
                    title="Add New Project"
                  >
                    +
                  </button>
                </div>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-medium text-slate-800"
                >
                  <option value="">-- No Project --</option>
                  {availableProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      [{p.code}] {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 mt-auto">
                <input
                  type="checkbox"
                  id="modalIsBillable"
                  checked={isBillable}
                  onChange={(e) => setIsBillable(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <label
                  htmlFor="modalIsBillable"
                  className="text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Billable to Customer
                </label>
              </div>
            </div>
          </div>

          {/* Bottom Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-slate-300 text-slate-700 hover:bg-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>Save Expense</span>
            </button>
          </div>
        </form>
      </div>

      {/* QUICK MODAL 1: Add Vendor */}
      {showAddVendor && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-200 shadow-xl space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900">New Vendor</h3>
              <button onClick={() => setShowAddVendor(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateVendor} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Vendor / Contact Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Supplies"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp Inc."
                  value={newVendorCompany}
                  onChange={(e) => setNewVendorCompany(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold shadow-xs cursor-pointer"
              >
                Add Vendor
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QUICK MODAL 2: Add Customer */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-200 shadow-xl space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900">New Customer</h3>
              <button onClick={() => setShowAddCustomer(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Customer / Contact Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Company Name</label>
                <input
                  type="text"
                  placeholder="e.g. Global Tech LLC"
                  value={newCustomerCompany}
                  onChange={(e) => setNewCustomerCompany(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold shadow-xs cursor-pointer"
              >
                Add Customer
              </button>
            </form>
          </div>
        </div>
      )}

      {/* QUICK MODAL 3: Add Account */}
      {showAddAccount && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-200 shadow-xl space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900">New Expense Account</h3>
              <button onClick={() => setShowAddAccount(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Account Code</label>
                <input
                  type="text"
                  placeholder="e.g. 5120"
                  value={newAccountCode}
                  onChange={(e) => setNewAccountCode(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Account Name</label>
                <input
                  type="text"
                  placeholder="e.g. Software Subscriptions"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  required
                  className="w-full border border-slate-200 rounded-lg p-2"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold shadow-xs cursor-pointer"
              >
                Create Account
              </button>
            </form>
          </div>
        </div>
      )}

      <QuickAddProjectModal
        isOpen={isQuickProjectOpen}
        onClose={() => setIsQuickProjectOpen(false)}
        defaultClientId={customerId}
        onProjectCreated={(newPrj) => {
          setProjectId(newPrj.id);
          if (newPrj.clientId) {
            setCustomerId(newPrj.clientId);
          }
        }}
      />

      <QuickAddAccountModal
        isOpen={showQuickAddAccountModal}
        onClose={() => setShowQuickAddAccountModal(false)}
        defaultCategory={quickAddCategory}
        onAccountCreated={(newAcc) => {
          if (quickAddCategory === 'Expense') {
            setAccountId(newAcc.id);
          } else {
            setPaidFromAccountId(newAcc.id);
          }
        }}
      />
    </div>
  );
};
