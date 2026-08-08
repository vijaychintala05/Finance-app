import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Filter,
  History,
  Landmark,
  Layers,
  Plus,
  Receipt,
  Search,
  SlidersHorizontal,
  Sparkles,
  User,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Account, JournalEntry } from '../../types';
import { QuickAddAccountModal, QuickAccountCategory } from '../common/QuickAddAccountModal';
import { BankTransactionDetailsModal, BankTransactionItem } from './BankTransactionDetailsModal';
import { RecordBankTransactionModal } from './RecordBankTransactionModal';

export const BankingView: React.FC = () => {
  const { accounts, journalEntries, expenses, updateAccount, settings } = useBooks();

  // Screen 2 visibility toggle ("More Details" button)
  const [showMoreDetails, setShowMoreDetails] = useState<boolean>(true);

  // Left 1/4th category slidable buttons: 'ALL' | 'BANKS' | 'PETTY_CASH' | 'DIGITAL_WALLETS' | 'CREDIT_CARDS' | 'LOAN_ACCOUNTS'
  const [activeCategoryTab, setActiveCategoryTab] = useState<
    'ALL' | 'BANKS' | 'PETTY_CASH' | 'DIGITAL_WALLETS' | 'CREDIT_CARDS' | 'LOAN_ACCOUNTS'
  >('ALL');

  // Left 1/4th status toggle: 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Search filter for left accounts list
  const [accountSearch, setAccountSearch] = useState<string>('');

  // Currently selected account ID for 3/4th split
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Filter for right 3/4th transactions list: 'ALL' | 'IN' | 'OUT'
  const [txFilter, setTxFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [txSearch, setTxSearch] = useState<string>('');

  // Selected Transaction for Details Modal / Split
  const [selectedTx, setSelectedTx] = useState<BankTransactionItem | null>(null);

  // Quick Add Account Modal state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [quickAddCat, setQuickAddCat] = useState<QuickAccountCategory>('Bank');

  // Record Transaction Modal state
  const [isRecordTxOpen, setIsRecordTxOpen] = useState<boolean>(false);
  const [recordTxDefaultType, setRecordTxDefaultType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');

  // Categorized account collections
  const bankAccountsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Bank' ||
        (a.type === 'Asset' && a.name.toLowerCase().includes('bank'))
    );
  }, [accounts]);

  const pettyCashList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Cash' ||
        a.subType === 'Cash & Bank' ||
        a.subType === 'Undeposited Funds' ||
        (a.type === 'Asset' &&
          (a.name.toLowerCase().includes('cash') || a.name.toLowerCase().includes('vault')))
    );
  }, [accounts]);

  const digitalWalletsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Digital Wallet' ||
        a.name.toLowerCase().includes('paypal') ||
        a.name.toLowerCase().includes('stripe') ||
        a.name.toLowerCase().includes('wallet') ||
        a.name.toLowerCase().includes('wise') ||
        a.name.toLowerCase().includes('paytm') ||
        a.name.toLowerCase().includes('venmo')
    );
  }, [accounts]);

  const creditCardsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Credit Cards' ||
        (a.type === 'Liability' && a.name.toLowerCase().includes('credit'))
    );
  }, [accounts]);

  const loanAccountsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Loans' ||
        a.subType === 'Loan/Credit' ||
        (a.type === 'Liability' &&
          (a.name.toLowerCase().includes('loan') ||
            a.name.toLowerCase().includes('overdraft') ||
            a.name.toLowerCase().includes('mortgage')))
    );
  }, [accounts]);

  const allTreasuryAccountsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Bank' ||
        a.subType === 'Cash' ||
        a.subType === 'Cash & Bank' ||
        a.subType === 'Digital Wallet' ||
        a.subType === 'Credit Cards' ||
        a.subType === 'Loans' ||
        a.subType === 'Loan/Credit' ||
        a.subType === 'Undeposited Funds' ||
        a.type === 'Asset' ||
        a.type === 'Liability'
    );
  }, [accounts]);

  const creditCardLoansList = useMemo(() => {
    return [...creditCardsList, ...loanAccountsList];
  }, [creditCardsList, loanAccountsList]);

  // Dashboard Summary Metrics
  const totalCashInBank = useMemo(
    () => bankAccountsList.reduce((sum, a) => sum + Math.max(0, a.balance), 0),
    [bankAccountsList]
  );

  const totalPettyCash = useMemo(
    () => pettyCashList.reduce((sum, a) => sum + Math.max(0, a.balance), 0),
    [pettyCashList]
  );

  const totalCreditCardLoans = useMemo(
    () => creditCardLoansList.reduce((sum, a) => sum + Math.max(0, a.balance), 0),
    [creditCardLoansList]
  );

  // Category List based on dropdown/horizontal slidable buttons
  const currentCategoryAccounts = useMemo(() => {
    let list: Account[] = [];
    if (activeCategoryTab === 'ALL') list = allTreasuryAccountsList;
    else if (activeCategoryTab === 'BANKS') list = bankAccountsList;
    else if (activeCategoryTab === 'PETTY_CASH') list = pettyCashList;
    else if (activeCategoryTab === 'DIGITAL_WALLETS') list = digitalWalletsList;
    else if (activeCategoryTab === 'CREDIT_CARDS') list = creditCardsList;
    else if (activeCategoryTab === 'LOAN_ACCOUNTS') list = loanAccountsList;

    return list.filter((acc) => {
      // Status filter
      const accStatus = acc.status || 'Active';
      if (statusFilter === 'ACTIVE' && accStatus !== 'Active') return false;
      if (statusFilter === 'INACTIVE' && accStatus !== 'Inactive') return false;

      // Search query filter
      if (accountSearch.trim()) {
        const q = accountSearch.toLowerCase();
        return (
          acc.name.toLowerCase().includes(q) ||
          acc.code.toLowerCase().includes(q) ||
          (acc.description && acc.description.toLowerCase().includes(q))
        );
      }

      return true;
    });
  }, [
    activeCategoryTab,
    allTreasuryAccountsList,
    bankAccountsList,
    pettyCashList,
    digitalWalletsList,
    creditCardsList,
    loanAccountsList,
    statusFilter,
    accountSearch,
  ]);

  // Active selected account for 3/4th split
  const activeAccount = useMemo(() => {
    if (selectedAccountId) {
      const found = accounts.find((a) => a.id === selectedAccountId);
      if (found) return found;
    }
    // Default to first item in current category, or first account
    return currentCategoryAccounts[0] || bankAccountsList[0] || accounts[0] || null;
  }, [selectedAccountId, accounts, currentCategoryAccounts, bankAccountsList]);

  // Transactions list for the active account
  const accountTransactions = useMemo(() => {
    if (!activeAccount) return [];

    const list: BankTransactionItem[] = [];

    // 1. From Journal Entries
    journalEntries.forEach((jrn) => {
      jrn.lines.forEach((line) => {
        if (line.accountId === activeAccount.id) {
          if (line.debit > 0) {
            list.push({
              id: `jrn-${jrn.id}-${line.id}`,
              date: jrn.date,
              ref: jrn.entryNumber || jrn.reference || 'JRN',
              description: line.description || jrn.description || 'Journal Deposit',
              type: 'DEBIT', // Money In (+)
              amount: line.debit,
              source: 'JOURNAL',
              status: 'Posted',
              accountId: activeAccount.id,
              accountName: activeAccount.name,
              accountCode: activeAccount.code,
              accountSubType: activeAccount.subType,
            });
          }
          if (line.credit > 0) {
            list.push({
              id: `jrn-${jrn.id}-${line.id}`,
              date: jrn.date,
              ref: jrn.entryNumber || jrn.reference || 'JRN',
              description: line.description || jrn.description || 'Journal Payment',
              type: 'CREDIT', // Money Out (-)
              amount: line.credit,
              source: 'JOURNAL',
              status: 'Posted',
              accountId: activeAccount.id,
              accountName: activeAccount.name,
              accountCode: activeAccount.code,
              accountSubType: activeAccount.subType,
            });
          }
        }
      });
    });

    // 2. From Expenses (paid from this account)
    expenses.forEach((exp) => {
      if (exp.paidFromAccountId === activeAccount.id) {
        const existsInJournals = list.some((l) => l.ref === exp.referenceNumber);
        if (!existsInJournals) {
          list.push({
            id: `exp-${exp.id}`,
            date: exp.date,
            ref: exp.referenceNumber || `EXP-${exp.id.slice(0, 4)}`,
            description: exp.description || 'Expense Payment',
            partyName: exp.vendorName || exp.clientName,
            type: 'CREDIT', // Money Out (-)
            amount: exp.amount,
            category: exp.accountName,
            source: 'EXPENSE',
            status: 'Cleared',
            accountId: activeAccount.id,
            accountName: activeAccount.name,
            accountCode: activeAccount.code,
            accountSubType: activeAccount.subType,
          });
        }
      }
    });

    // Filter by Tx Filter (ALL, IN, OUT) and Tx Search
    return list
      .filter((tx) => {
        if (txFilter === 'IN' && tx.type !== 'DEBIT') return false;
        if (txFilter === 'OUT' && tx.type !== 'CREDIT') return false;

        if (txSearch.trim()) {
          const q = txSearch.toLowerCase();
          return (
            tx.ref.toLowerCase().includes(q) ||
            tx.description.toLowerCase().includes(q) ||
            (tx.partyName && tx.partyName.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [activeAccount, journalEntries, expenses, txFilter, txSearch]);

  // Toggle active / inactive for active account
  const handleToggleAccountStatus = () => {
    if (!activeAccount) return;
    const newStatus = activeAccount.status === 'Inactive' ? 'Active' : 'Inactive';
    updateAccount(activeAccount.id, { status: newStatus });
  };

  const handleOpenAddAccount = (category: QuickAccountCategory) => {
    setQuickAddCat(category);
    setIsQuickAddOpen(true);
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. TOP DASHBOARD KPI CARDS SECTION */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-5">
        {/* Title & Top Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-2xs">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                Banking & Cash Management
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                Live treasury balances across bank accounts, petty cash drawers, and corporate credit cards.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleOpenAddAccount('Bank')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Account</span>
            </button>
          </div>
        </div>

        {/* 3 TOP KPI SUMMARY CARDS (Top Left / Top Grid) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Cash in Bank */}
          <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/40 dark:from-blue-950/40 dark:to-slate-900 border border-blue-100 dark:border-blue-900/60 p-4 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-blue-700 dark:text-blue-400">
              <span className="text-[11px] font-extrabold uppercase tracking-wider">
                Total Cash in Bank
              </span>
              <Landmark className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight mt-1">
              {settings.currencySymbol}
              {totalCashInBank.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {bankAccountsList.length} active bank {bankAccountsList.length === 1 ? 'account' : 'accounts'}
            </p>
          </div>

          {/* Card 2: Total Petty Cash */}
          <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/40 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-100 dark:border-emerald-900/60 p-4 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
              <span className="text-[11px] font-extrabold uppercase tracking-wider">
                Total Petty Cash
              </span>
              <Wallet className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight mt-1">
              {settings.currencySymbol}
              {totalPettyCash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {pettyCashList.length} physical cash & wallet {pettyCashList.length === 1 ? 'vault' : 'vaults'}
            </p>
          </div>

          {/* Card 3: Credit Card / Loans */}
          <div className="bg-gradient-to-br from-purple-50/80 to-pink-50/40 dark:from-purple-950/40 dark:to-slate-900 border border-purple-100 dark:border-purple-900/60 p-4 rounded-2xl space-y-1">
            <div className="flex items-center justify-between text-purple-700 dark:text-purple-400">
              <span className="text-[11px] font-extrabold uppercase tracking-wider">
                Credit Card / Loans
              </span>
              <CreditCard className="w-4 h-4" />
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight mt-1">
              {settings.currencySymbol}
              {totalCreditCardLoans.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {creditCardLoansList.length} credit card & loan {creditCardLoansList.length === 1 ? 'account' : 'accounts'}
            </p>
          </div>
        </div>

        {/* TWO BUTTONS BELOW DASHBOARD */}
        <div className="flex items-center space-x-3 pt-2">
          {/* Button 1: More Details (Toggle Screen 2) */}
          <button
            onClick={() => setShowMoreDetails(!showMoreDetails)}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center space-x-2 border cursor-pointer transition-all ${
              showMoreDetails
                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>{showMoreDetails ? 'Hide Details' : 'More Details'}</span>
          </button>

          {/* Button 2: Quick Record Transaction */}
          <button
            onClick={() => {
              setRecordTxDefaultType('DEBIT');
              setIsRecordTxOpen(true);
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl flex items-center space-x-2 cursor-pointer transition-colors shadow-2xs"
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Quick Record Money In / Out</span>
          </button>
        </div>
      </div>

      {/* 2. SCREEN 2: SPLIT VIEW (1/4th Left + 3/4th Right) */}
      {showMoreDetails && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          {/* LEFT 1/4th SPLIT PANEL */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
              {/* FULL HORIZONTAL CATEGORY SELECTOR WITH DROPDOWN & SLIDABLE PILLS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider">
                    Account Categories
                  </span>
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                    {currentCategoryAccounts.length} listed
                  </span>
                </div>

                {/* Dropdown Selector */}
                <select
                  value={activeCategoryTab}
                  onChange={(e) => setActiveCategoryTab(e.target.value as any)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-800 font-semibold rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="ALL">All Accounts ({allTreasuryAccountsList.length})</option>
                  <option value="BANKS">Banks ({bankAccountsList.length})</option>
                  <option value="PETTY_CASH">Petty Cash & Vaults ({pettyCashList.length})</option>
                  <option value="DIGITAL_WALLETS">Digital Wallets ({digitalWalletsList.length})</option>
                  <option value="CREDIT_CARDS">Credit Cards ({creditCardsList.length})</option>
                  <option value="LOAN_ACCOUNTS">Loan & Overdraft Accounts ({loanAccountsList.length})</option>
                </select>

                {/* Horizontal Slidable Category Pills */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                  <button
                    onClick={() => setActiveCategoryTab('ALL')}
                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      activeCategoryTab === 'ALL'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    All ({allTreasuryAccountsList.length})
                  </button>

                  <button
                    onClick={() => setActiveCategoryTab('BANKS')}
                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      activeCategoryTab === 'BANKS'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Banks ({bankAccountsList.length})
                  </button>

                  <button
                    onClick={() => setActiveCategoryTab('PETTY_CASH')}
                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      activeCategoryTab === 'PETTY_CASH'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Cash ({pettyCashList.length})
                  </button>

                  <button
                    onClick={() => setActiveCategoryTab('DIGITAL_WALLETS')}
                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      activeCategoryTab === 'DIGITAL_WALLETS'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Wallets ({digitalWalletsList.length})
                  </button>

                  <button
                    onClick={() => setActiveCategoryTab('CREDIT_CARDS')}
                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      activeCategoryTab === 'CREDIT_CARDS'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Cards ({creditCardsList.length})
                  </button>

                  <button
                    onClick={() => setActiveCategoryTab('LOAN_ACCOUNTS')}
                    className={`px-3.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                      activeCategoryTab === 'LOAN_ACCOUNTS'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                    }`}
                  >
                    Loans ({loanAccountsList.length})
                  </button>
                </div>
              </div>

              {/* SEARCH INPUT */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search category accounts..."
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold pl-8 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* STATUS TOGGLE SLIDER (ALL / ACTIVE / INACTIVE) */}
              <div>
                <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block mb-1">
                  Filter Status
                </span>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-[11px] font-bold">
                  <button
                    onClick={() => setStatusFilter('ALL')}
                    className={`py-1.5 rounded-xl transition-all cursor-pointer ${
                      statusFilter === 'ALL'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setStatusFilter('ACTIVE')}
                    className={`py-1.5 rounded-xl transition-all cursor-pointer ${
                      statusFilter === 'ACTIVE'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStatusFilter('INACTIVE')}
                    className={`py-1.5 rounded-xl transition-all cursor-pointer ${
                      statusFilter === 'INACTIVE'
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    Inactive
                  </button>
                </div>
              </div>

              {/* CATEGORY ACCOUNTS LIST */}
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {currentCategoryAccounts.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <Building2 className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">No matching accounts found</p>
                    <button
                      onClick={() =>
                        handleOpenAddAccount(
                          activeCategoryTab === 'BANKS'
                            ? 'Bank'
                            : activeCategoryTab === 'PETTY_CASH'
                            ? 'Cash'
                            : 'Credit Card'
                        )
                      }
                      className="mt-2 text-[11px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      + Add New Account
                    </button>
                  </div>
                ) : (
                  currentCategoryAccounts.map((acc) => {
                    const isSelected = activeAccount?.id === acc.id;
                    const status = acc.status || 'Active';

                    return (
                      <div
                        key={acc.id}
                        onClick={() => setSelectedAccountId(acc.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                          isSelected
                            ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-600 dark:border-blue-500 ring-2 ring-blue-500/20 shadow-2xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200/90 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-750'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2.5 truncate">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                acc.subType === 'Bank'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                  : acc.subType === 'Cash' || acc.subType === 'Cash & Bank'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                                  : acc.subType === 'Digital Wallet'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                                  : acc.subType === 'Credit Cards'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                              }`}
                            >
                              {acc.subType === 'Bank' && <Landmark className="w-4 h-4" />}
                              {(acc.subType === 'Cash' || acc.subType === 'Cash & Bank') && (
                                <Wallet className="w-4 h-4" />
                              )}
                              {acc.subType === 'Digital Wallet' && <Receipt className="w-4 h-4" />}
                              {acc.subType === 'Credit Cards' && <CreditCard className="w-4 h-4" />}
                              {acc.subType !== 'Bank' &&
                                acc.subType !== 'Cash' &&
                                acc.subType !== 'Cash & Bank' &&
                                acc.subType !== 'Digital Wallet' &&
                                acc.subType !== 'Credit Cards' && <Building2 className="w-4 h-4" />}
                            </div>

                            <div className="truncate">
                              <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 block truncate">
                                {acc.name}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                #{acc.code}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono block">
                              {settings.currencySymbol}
                              {acc.balance.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold border ${
                                status === 'Active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                              }`}
                            >
                              {status}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT 3/4th SPLIT PANEL */}
          <div className="lg:col-span-9 space-y-5">
            {activeAccount ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
                {/* BANK'S DASHBOARD HEADER */}
                <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 border border-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/30 flex items-center justify-center font-bold text-xl">
                      {activeAccount.subType === 'Bank' && <Landmark className="w-6 h-6" />}
                      {(activeAccount.subType === 'Cash' ||
                        activeAccount.subType === 'Cash & Bank') && <Wallet className="w-6 h-6" />}
                      {activeAccount.subType === 'Credit Cards' && <CreditCard className="w-6 h-6" />}
                      {activeAccount.subType !== 'Bank' &&
                        activeAccount.subType !== 'Cash' &&
                        activeAccount.subType !== 'Credit Cards' && <Building2 className="w-6 h-6" />}
                    </div>

                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">{activeAccount.name}</h2>
                        <span className="text-[10px] font-mono bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 font-bold">
                          #{activeAccount.code}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold ${
                            (activeAccount.status || 'Active') === 'Active'
                              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                              : 'bg-rose-100 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30'
                          }`}
                        >
                          {activeAccount.status || 'Active'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                        Category: {activeAccount.subType} • {activeAccount.type}
                      </p>
                    </div>
                  </div>

                  {/* Right Dashboard Balance & Quick Action Controls */}
                  <div className="flex flex-col sm:items-end space-y-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Account Balance
                      </span>
                      <span className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tight">
                        {settings.currencySymbol}
                        {activeAccount.balance.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        onClick={() => {
                          setRecordTxDefaultType('DEBIT');
                          setIsRecordTxOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>Money In</span>
                      </button>

                      <button
                        onClick={() => {
                          setRecordTxDefaultType('CREDIT');
                          setIsRecordTxOpen(true);
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl flex items-center space-x-1 cursor-pointer transition-colors shadow-2xs"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Money Out</span>
                      </button>

                      <button
                        onClick={handleToggleAccountStatus}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl cursor-pointer transition-colors border border-slate-700"
                      >
                        Set {(activeAccount.status || 'Active') === 'Active' ? 'Inactive' : 'Active'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* RECORDED TRANSACTIONS HEADER & FILTERS */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <History className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                      Recorded Transactions ({accountTransactions.length})
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Tx Search */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search transactions..."
                        value={txSearch}
                        onChange={(e) => setTxSearch(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold pl-8 pr-2.5 py-1.5 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Tx Filter Tabs: ALL / IN / OUT */}
                    <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-0.5 rounded-xl text-xs font-bold">
                      <button
                        onClick={() => setTxFilter('ALL')}
                        className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          txFilter === 'ALL'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 shadow-2xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setTxFilter('IN')}
                        className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          txFilter === 'IN'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Money In (+)
                      </button>
                      <button
                        onClick={() => setTxFilter('OUT')}
                        className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                          txFilter === 'OUT'
                            ? 'bg-rose-600 text-white'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        Money Out (-)
                      </button>
                    </div>
                  </div>
                </div>

                {/* TRANSACTIONS TABLE */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/70 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-extrabold uppercase text-[10px] tracking-wider border-b border-slate-200/80 dark:border-slate-800">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Reference</th>
                        <th className="py-3 px-4">Description / Particulars</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4 text-center">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {accountTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                            <p className="font-bold text-slate-600 dark:text-slate-400">
                              No recorded transactions for {activeAccount.name}
                            </p>
                            <p className="text-[11px] text-slate-400 mt-1">
                              Click "Money In" or "Money Out" to log your first transaction.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        accountTransactions.map((tx) => {
                          const isMoneyIn = tx.type === 'DEBIT';

                          return (
                            <tr
                              key={tx.id}
                              onClick={() => setSelectedTx(tx)}
                              className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                            >
                              <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                {tx.date}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                {tx.ref}
                              </td>
                              <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100 max-w-xs truncate">
                                <div>{tx.description}</div>
                                {tx.partyName && (
                                  <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                    <User className="w-3 h-3 text-slate-400" />
                                    <span>{tx.partyName}</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                                    isMoneyIn
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
                                      : 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'
                                  }`}
                                >
                                  {isMoneyIn ? 'Money In (+)' : 'Money Out (-)'}
                                </span>
                              </td>
                              <td
                                className={`py-3 px-4 text-right font-black font-mono text-sm whitespace-nowrap ${
                                  isMoneyIn
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-rose-600 dark:text-rose-400'
                                }`}
                              >
                                {isMoneyIn ? '+' : '-'}
                                {settings.currencySymbol}
                                {tx.amount.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-3 px-4 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTx(tx);
                                  }}
                                  className="text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 font-bold flex items-center justify-center mx-auto hover:bg-slate-100 dark:hover:bg-slate-800 p-1.5 rounded-lg transition-colors cursor-pointer"
                                >
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400">
                <Landmark className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="font-bold text-slate-700 dark:text-slate-300">
                  Select an account to view details and transactions
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TRANSACTION DETAILS MODAL / SPLIT */}
      <BankTransactionDetailsModal
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        settings={settings}
      />

      {/* RECORD BANK TRANSACTION MODAL */}
      <RecordBankTransactionModal
        isOpen={isRecordTxOpen}
        onClose={() => setIsRecordTxOpen(false)}
        defaultAccountId={activeAccount?.id}
        defaultType={recordTxDefaultType}
      />

      {/* QUICK ADD ACCOUNT MODAL */}
      <QuickAddAccountModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        defaultCategory={quickAddCat}
        onAccountCreated={(newAcc) => {
          setSelectedAccountId(newAcc.id);
        }}
      />
    </div>
  );
};
