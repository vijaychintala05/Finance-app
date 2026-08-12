import React from 'react';
import { Building2, CreditCard, Landmark, Search, Wallet } from 'lucide-react';
import { Account } from '../../types';
import { formatCurrency } from '../../utils/formatters';
import { QuickAccountCategory } from '../common/QuickAddAccountModal';

interface BankAccountsListSidebarProps {
  activeCategoryTab: 'ALL' | 'BANKS' | 'PETTY_CASH' | 'DIGITAL_WALLETS' | 'CREDIT_CARDS' | 'LOAN_ACCOUNTS';
  setActiveCategoryTab: (tab: 'ALL' | 'BANKS' | 'PETTY_CASH' | 'DIGITAL_WALLETS' | 'CREDIT_CARDS' | 'LOAN_ACCOUNTS') => void;
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE';
  setStatusFilter: (status: 'ALL' | 'ACTIVE' | 'INACTIVE') => void;
  accountSearch: string;
  setAccountSearch: (search: string) => void;
  currentCategoryAccounts: Account[];
  allTreasuryAccountsList: Account[];
  bankAccountsList: Account[];
  pettyCashList: Account[];
  digitalWalletsList: Account[];
  creditCardsList: Account[];
  loanAccountsList: Account[];
  activeAccount: Account | null;
  setSelectedAccountId: (id: string) => void;
  currencySymbol: string;
  onOpenAddAccount: (cat: QuickAccountCategory) => void;
}

export const BankAccountsListSidebar: React.FC<BankAccountsListSidebarProps> = ({
  activeCategoryTab,
  setActiveCategoryTab,
  statusFilter,
  setStatusFilter,
  accountSearch,
  setAccountSearch,
  currentCategoryAccounts,
  allTreasuryAccountsList,
  bankAccountsList,
  pettyCashList,
  digitalWalletsList,
  creditCardsList,
  loanAccountsList,
  activeAccount,
  setSelectedAccountId,
  currencySymbol,
  onOpenAddAccount,
}) => {
  return (
    <div className="lg:col-span-3 space-y-4">
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-4">
        {/* Category Header */}
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
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 text-slate-800 font-semibold rounded-xl px-4 py-2 text-xs focus:outline-hidden focus:border-blue-500 cursor-pointer"
          >
            <option value="ALL">All Accounts ({allTreasuryAccountsList.length})</option>
            <option value="BANKS">Banks ({bankAccountsList.length})</option>
            <option value="PETTY_CASH">Petty Cash & Vaults ({pettyCashList.length})</option>
            <option value="DIGITAL_WALLETS">Digital Wallets ({digitalWalletsList.length})</option>
            <option value="CREDIT_CARDS">Credit Cards ({creditCardsList.length})</option>
            <option value="LOAN_ACCOUNTS">Loan & Overdraft Accounts ({loanAccountsList.length})</option>
          </select>

          {/* Horizontal Category Pills */}
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
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search category accounts..."
            value={accountSearch}
            onChange={(e) => setAccountSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-semibold pl-8 pr-3 py-2 rounded-xl text-xs focus:outline-hidden focus:border-blue-500"
          />
        </div>

        {/* Status Toggle */}
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

        {/* Account Cards List */}
        <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
          {currentCategoryAccounts.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <Building2 className="w-7 h-7 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">No matching accounts found</p>
              <button
                onClick={() => onOpenAddAccount('Bank')}
                className="mt-2 text-[11px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                + Add New Account
              </button>
            </div>
          ) : (
            currentCategoryAccounts.map((acc) => {
              const isSelected = activeAccount?.id === acc.id;

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
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                        }`}
                      >
                        {acc.subType === 'Bank' ? <Landmark className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
                      </div>
                      <div className="truncate">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{acc.name}</h3>
                        <span className="text-[10px] text-slate-400 font-mono">#{acc.code}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-black font-mono text-slate-900 dark:text-white">
                        {formatCurrency(acc.balance, currencySymbol)}
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
  );
};
