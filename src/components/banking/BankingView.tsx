import React, { useMemo, useState } from 'react';
import { useBooks } from '../../context/BooksContext';
import { Account, JournalEntry } from '../../types';
import { QuickAddAccountModal, QuickAccountCategory } from '../common/QuickAddAccountModal';
import { BankTransactionDetailsModal, BankTransactionItem } from './BankTransactionDetailsModal';
import { RecordBankTransactionModal } from './RecordBankTransactionModal';
import { ReconcileBankModal } from './ReconcileBankModal';
import { ImportStatementModal } from './ImportStatementModal';
import { BankAccountsSummaryCards } from './BankAccountsSummaryCards';
import { BankAccountsListSidebar } from './BankAccountsListSidebar';
import { BankTransactionsFeed } from './BankTransactionsFeed';

interface BankingViewProps {
  autoOpenReconcile?: boolean;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const BankingView: React.FC<BankingViewProps> = ({
  autoOpenReconcile,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { accounts, journalEntries, expenses, settings } = useBooks();

  // Screen 2 visibility toggle ("More Details" button)
  const [showMoreDetails, setShowMoreDetails] = useState<boolean>(true);

  // Category filter tabs: 'ALL' | 'BANKS' | 'PETTY_CASH' | 'DIGITAL_WALLETS' | 'CREDIT_CARDS' | 'LOAN_ACCOUNTS'
  const [activeCategoryTab, setActiveCategoryTab] = useState<
    'ALL' | 'BANKS' | 'PETTY_CASH' | 'DIGITAL_WALLETS' | 'CREDIT_CARDS' | 'LOAN_ACCOUNTS'
  >('ALL');

  // Status toggle: 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Search filter for left accounts list
  const [accountSearch, setAccountSearch] = useState<string>('');

  // Currently selected account ID
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Filter for right transactions list: 'ALL' | 'IN' | 'OUT'
  const [txFilter, setTxFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [txSearch, setTxSearch] = useState<string>('');

  // Selected Transaction for Details Modal / Split
  const [selectedTx, setSelectedTx] = useState<BankTransactionItem | null>(null);

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState<boolean>(false);
  const [quickAddCat, setQuickAddCat] = useState<QuickAccountCategory>('Bank');
  const [isRecordTxOpen, setIsRecordTxOpen] = useState<boolean>(false);
  const [recordTxDefaultType, setRecordTxDefaultType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [isReconcileOpen, setIsReconcileOpen] = useState<boolean>(false);
  const [isImportStatementOpen, setIsImportStatementOpen] = useState<boolean>(false);

  React.useEffect(() => {
    if (autoOpenReconcile) {
      setIsReconcileOpen(true);
    }
  }, [autoOpenReconcile]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const foundAccount = accounts.find((a) => a.id === selectedEntityId || a.code === selectedEntityId);
      if (foundAccount) {
        setSelectedAccountId(foundAccount.id);
      }
    }
  }, [selectedEntityId, accounts]);

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
        (a.type === 'Asset' &&
          (a.name.toLowerCase().includes('stripe') ||
            a.name.toLowerCase().includes('paypal') ||
            a.name.toLowerCase().includes('razorpay') ||
            a.name.toLowerCase().includes('wallet')))
    );
  }, [accounts]);

  const creditCardsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Credit Card' ||
        a.subType === 'Credit Cards' ||
        (a.type === 'Liability' &&
          (a.name.toLowerCase().includes('credit card') || a.name.toLowerCase().includes('amex')))
    );
  }, [accounts]);

  const loanAccountsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Loan' ||
        a.subType === 'Overdraft' ||
        (a.type === 'Liability' &&
          (a.name.toLowerCase().includes('loan') ||
            a.name.toLowerCase().includes('credit line') ||
            a.name.toLowerCase().includes('overdraft')))
    );
  }, [accounts]);

  const creditCardLoansList = useMemo(() => {
    return [...creditCardsList, ...loanAccountsList];
  }, [creditCardsList, loanAccountsList]);

  const allTreasuryAccountsList = useMemo(() => {
    return accounts.filter(
      (a) =>
        a.subType === 'Bank' ||
        a.subType === 'Cash' ||
        a.subType === 'Cash & Bank' ||
        a.subType === 'Digital Wallet' ||
        a.subType === 'Credit Card' ||
        a.subType === 'Credit Cards' ||
        a.subType === 'Loan' ||
        a.subType === 'Overdraft' ||
        a.subType === 'Undeposited Funds' ||
        (a.type === 'Asset' && (a.name.toLowerCase().includes('bank') || a.name.toLowerCase().includes('cash'))) ||
        (a.type === 'Liability' && (a.name.toLowerCase().includes('card') || a.name.toLowerCase().includes('loan')))
    );
  }, [accounts]);

  // Aggregate Treasury Totals
  const totalCashInBank = useMemo(() => {
    return bankAccountsList.reduce((sum, a) => sum + (a.balance || 0), 0);
  }, [bankAccountsList]);

  const totalPettyCash = useMemo(() => {
    return pettyCashList.reduce((sum, a) => sum + (a.balance || 0), 0);
  }, [pettyCashList]);

  const totalCreditCardLoans = useMemo(() => {
    return creditCardLoansList.reduce((sum, a) => sum + Math.abs(a.balance || 0), 0);
  }, [creditCardLoansList]);

  // Filtered accounts list for the currently selected category tab
  const currentCategoryAccounts = useMemo(() => {
    let list: Account[] = [];
    switch (activeCategoryTab) {
      case 'BANKS':
        list = bankAccountsList;
        break;
      case 'PETTY_CASH':
        list = pettyCashList;
        break;
      case 'DIGITAL_WALLETS':
        list = digitalWalletsList;
        break;
      case 'CREDIT_CARDS':
        list = creditCardsList;
        break;
      case 'LOAN_ACCOUNTS':
        list = loanAccountsList;
        break;
      case 'ALL':
      default:
        list = allTreasuryAccountsList;
        break;
    }

    if (statusFilter !== 'ALL') {
      list = list.filter((a) => (a.status || 'Active') === statusFilter);
    }

    if (accountSearch.trim()) {
      const q = accountSearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.code.toLowerCase().includes(q) ||
          (a.subType && a.subType.toLowerCase().includes(q))
      );
    }

    return list;
  }, [
    activeCategoryTab,
    statusFilter,
    accountSearch,
    bankAccountsList,
    pettyCashList,
    digitalWalletsList,
    creditCardsList,
    loanAccountsList,
    allTreasuryAccountsList,
  ]);

  // Active account selected for details
  const activeAccount = useMemo(() => {
    if (selectedAccountId) {
      const found = accounts.find((a) => a.id === selectedAccountId);
      if (found) return found;
    }
    return currentCategoryAccounts[0] || accounts[0] || null;
  }, [selectedAccountId, accounts, currentCategoryAccounts]);

  // Bank transactions feed for active account
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
              type: 'DEBIT',
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
              type: 'CREDIT',
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

    // 2. From Expenses
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
            type: 'CREDIT',
            amount: exp.amount,
            category: exp.accountName,
            source: 'EXPENSE',
            status: 'Posted',
            accountId: activeAccount.id,
            accountName: activeAccount.name,
            accountCode: activeAccount.code,
            accountSubType: activeAccount.subType,
          });
        }
      }
    });

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

  const handleOpenAddAccount = (category: QuickAccountCategory) => {
    setQuickAddCat(category);
    setIsQuickAddOpen(true);
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* 1. TOP DASHBOARD KPI CARDS SECTION */}
      <BankAccountsSummaryCards
        totalCashInBank={totalCashInBank}
        totalPettyCash={totalPettyCash}
        totalCreditCardLoans={totalCreditCardLoans}
        bankAccountsList={bankAccountsList}
        pettyCashList={pettyCashList}
        creditCardLoansList={creditCardLoansList}
        currencySymbol={settings.currencySymbol}
        showMoreDetails={showMoreDetails}
        setShowMoreDetails={setShowMoreDetails}
        onOpenReconcile={() => setIsReconcileOpen(true)}
        onOpenImportStatement={() => setIsImportStatementOpen(true)}
        onOpenAddAccount={handleOpenAddAccount}
      />

      {/* 2. SPLIT VIEW */}
      {showMoreDetails && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
          <BankAccountsListSidebar
            activeCategoryTab={activeCategoryTab}
            setActiveCategoryTab={setActiveCategoryTab}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            accountSearch={accountSearch}
            setAccountSearch={setAccountSearch}
            currentCategoryAccounts={currentCategoryAccounts}
            allTreasuryAccountsList={allTreasuryAccountsList}
            bankAccountsList={bankAccountsList}
            pettyCashList={pettyCashList}
            digitalWalletsList={digitalWalletsList}
            creditCardsList={creditCardsList}
            loanAccountsList={loanAccountsList}
            activeAccount={activeAccount}
            setSelectedAccountId={setSelectedAccountId}
            currencySymbol={settings.currencySymbol}
            onOpenAddAccount={handleOpenAddAccount}
          />

          <BankTransactionsFeed
            activeAccount={activeAccount}
            accountTransactions={accountTransactions}
            txSearch={txSearch}
            setTxSearch={setTxSearch}
            txFilter={txFilter}
            setTxFilter={setTxFilter}
            currencySymbol={settings.currencySymbol}
            onOpenReconcile={() => setIsReconcileOpen(true)}
            onOpenImportStatement={() => setIsImportStatementOpen(true)}
            onOpenRecordTx={() => {
              setRecordTxDefaultType('DEBIT');
              setIsRecordTxOpen(true);
            }}
            onSelectTx={setSelectedTx}
          />
        </div>
      )}

      {/* Modals */}
      {isQuickAddOpen && (
        <QuickAddAccountModal
          isOpen={isQuickAddOpen}
          initialCategory={quickAddCat}
          onClose={() => setIsQuickAddOpen(false)}
        />
      )}

      {isRecordTxOpen && activeAccount && (
        <RecordBankTransactionModal
          isOpen={isRecordTxOpen}
          accountId={activeAccount.id}
          accountName={activeAccount.name}
          defaultType={recordTxDefaultType}
          onClose={() => setIsRecordTxOpen(false)}
        />
      )}

      {isReconcileOpen && (
        <ReconcileBankModal
          isOpen={isReconcileOpen}
          account={activeAccount}
          settings={settings}
          onClose={() => setIsReconcileOpen(false)}
        />
      )}

      {isImportStatementOpen && (
        <ImportStatementModal
          isOpen={isImportStatementOpen}
          account={activeAccount}
          settings={settings}
          onClose={() => setIsImportStatementOpen(false)}
        />
      )}

      {selectedTx && (
        <BankTransactionDetailsModal
          isOpen={!!selectedTx}
          transaction={selectedTx}
          onClose={() => {
            setSelectedTx(null);
            if (onSelectedEntityClosed) onSelectedEntityClosed();
          }}
        />
      )}
    </div>
  );
};
