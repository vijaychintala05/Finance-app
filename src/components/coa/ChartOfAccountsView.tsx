import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FolderTree,
  Layers,
  List,
  Lock,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Landmark,
} from 'lucide-react';
import { Account } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency } from '../../utils/formatters';
import { AccountModal } from './AccountModal';
import { AccountLedgerModal } from './AccountLedgerModal';
import { AccountingDefaultsPanel } from './AccountingDefaultsPanel';
import { QuickAddAccountModal } from '../common/QuickAddAccountModal';

export interface CategoryTreeSection {
  label: string;
  badgeColor: string;
  subTypes: string[];
}

export const CATEGORY_TREE_SPECIFICATION: CategoryTreeSection[] = [
  {
    label: 'Assets',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    subTypes: [
      'Bank',
      'Cash',
      'Digital Wallet',
      'Undeposited Funds',
      'Payment Clearing',
      'Accounts Receivable',
      'Inventory',
      'Fixed Assets',
      'Accumulated Depreciation',
      'Other Current Asset',
      'Other Current Assets',
      'Other Asset',
      'Other Assets',
      'Deferred Tax Asset',
    ],
  },
  {
    label: 'Liabilities',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    subTypes: [
      'Accounts Payable',
      'Credit Cards',
      'Taxes Payable',
      'Payroll Liabilities',
      'Loans',
      'Other Current Liability',
      'Other Liability',
      'Other Liabilities',
      'Long Term Liability',
      'Deferred Tax Liability',
    ],
  },
  {
    label: 'Equity',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    subTypes: ['Capital', 'Retained Earnings', 'Drawings', 'Opening Balance Equity', 'Other Equity'],
  },
  {
    label: 'Income',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    subTypes: ['Sales', 'Services', 'Operating Revenue', 'Other Operating Income', 'Other Revenue', 'Interest Income', 'Asset Gains', 'Other Income'],
  },
  {
    label: 'Expenses',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
    subTypes: [
      'Payroll',
      'Office & Administrative',
      'Sales & Marketing',
      'Travel & Vehicle',
      'Utilities & Communication',
      'Professional Services',
      'Software & Subscriptions',
      'Repairs & Maintenance',
      'Financial Expenses',
      'Depreciation & Amortization',
      'Miscellaneous Expenses',
      'Interest Expense',
      'Asset Losses',
      'Other Expenses',
    ],
  },
];

export interface ChartOfAccountsViewProps {
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const ChartOfAccountsView: React.FC<ChartOfAccountsViewProps> = ({
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { accounts, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('All');
  const [selectedSubCategoryFilter, setSelectedSubCategoryFilter] = useState<string>('All');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'Active' | 'Archived' | 'All'>('Active');
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('table');
  const [showPostingDefaults, setShowPostingDefaults] = useState(false);

  // Collapse / Expand state for tree sections
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Assets: true,
    Liabilities: true,
    Equity: true,
    Income: true,
    Expenses: true,
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLedgerAccount, setSelectedLedgerAccount] = useState<Account | null>(null);

  const [modalParentId, setModalParentId] = useState<string>('');
  const [modalSubCat, setModalSubCat] = useState<string>('');
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [isQuickAccountModalOpen, setIsQuickAccountModalOpen] = useState(false);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = accounts.find((a) => a.id === selectedEntityId || a.code === selectedEntityId);
      if (found) {
        setSelectedLedgerAccount(found);
      }
    }
  }, [selectedEntityId, accounts]);

  // Extract unique custom sub-categories (e.g. "Ply", "Laminates")
  const subCategoriesList = Array.from(
    new Set(accounts.map((a) => a.subCategory).filter(Boolean) as string[])
  );

  const handleToggleExpand = (label: string) => {
    setExpandedCategories((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    CATEGORY_TREE_SPECIFICATION.forEach((cat) => (next[cat.label] = true));
    setExpandedCategories(next);
  };

  const handleCollapseAll = () => {
    const next: Record<string, boolean> = {};
    CATEGORY_TREE_SPECIFICATION.forEach((cat) => (next[cat.label] = false));
    setExpandedCategories(next);
  };

  const handleOpenAddSubAccount = (parentAcc: Account) => {
    setAccountToEdit(null);
    setModalParentId(parentAcc.id);
    setModalSubCat(parentAcc.subCategory || parentAcc.name);
    setIsModalOpen(true);
  };

  const handleOpenNewModal = () => {
    setAccountToEdit(null);
    setModalParentId('');
    setModalSubCat('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (acc: Account) => {
    setAccountToEdit(acc);
    setModalParentId('');
    setModalSubCat('');
    setIsModalOpen(true);
  };

  // Helper function to map account to category label
  const getCategoryLabelForAccount = (acc: Account): string => {
    if (acc.type === 'Asset') return 'Assets';
    if (acc.type === 'Liability') return 'Liabilities';
    if (acc.type === 'Equity') return 'Equity';
    if (acc.type === 'Income' || acc.type === 'Revenue' || acc.type === 'Other Income') return 'Income';
    if (acc.type === 'Cost of Goods Sold') return 'Expenses';
    if (acc.type === 'Expense') {
      if (
        acc.subType === 'Materials' ||
        acc.subType === 'Direct Labor' ||
        acc.subType === 'Subcontractors' ||
        acc.subType === 'Other Direct Costs' ||
        acc.subType.includes('Direct Expense')
      ) {
        return 'Expenses';
      }
      return 'Expenses';
    }
    if (acc.type === 'Other Expense') return 'Expenses';
    return 'Expenses';
  };

  // Filter accounts
  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.name.toLowerCase().includes(search.toLowerCase()) ||
      acc.code.includes(search) ||
      acc.subType.toLowerCase().includes(search.toLowerCase()) ||
      (acc.subCategory && acc.subCategory.toLowerCase().includes(search.toLowerCase()));

    const categoryLabel = getCategoryLabelForAccount(acc);
    const matchesType =
      selectedTypeFilter === 'All' ||
      acc.type === selectedTypeFilter ||
      categoryLabel === selectedTypeFilter;

    const matchesSubCat =
      selectedSubCategoryFilter === 'All' || acc.subCategory === selectedSubCategoryFilter;
    const matchesStatus = selectedStatusFilter === 'All' || (acc.status || 'Active') === selectedStatusFilter;

    return matchesSearch && matchesType && matchesSubCat && matchesStatus;
  });
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
  const activeChildCountByParentId = accounts.reduce((counts, account) => {
    if (account.parentAccountId && account.status === 'Active') {
      counts.set(account.parentAccountId, (counts.get(account.parentAccountId) || 0) + 1);
    }
    return counts;
  }, new Map<string, number>());
  const formatSystemRole = (systemRole: string) => systemRole.toLowerCase().split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');

  const activeCount = accounts.filter((a) => (a.status || 'Active') === 'Active').length;
  const archivedCount = accounts.filter((a) => a.status === 'Archived').length;
  const archivedMatchesCount = accounts.filter(
    (a) =>
      a.status === 'Archived' &&
      (search ? a.name.toLowerCase().includes(search.toLowerCase()) || a.code.includes(search) : false)
  ).length;

  return (
    <div className="max-w-none space-y-0 bg-white dark:bg-slate-900">
      <div className="flex min-h-14 flex-col justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:px-6 dark:border-slate-800">
        <div className="flex min-w-0 items-center justify-between sm:justify-start gap-2 sm:gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 shrink-0">Chart of Accounts</h2>
            <label className="sr-only" htmlFor="account-status-filter">Account status</label>
            <select
              id="account-status-filter"
              value={selectedStatusFilter}
              onChange={(event) => setSelectedStatusFilter(event.target.value as 'Active' | 'Archived' | 'All')}
              className="min-w-0 truncate border-0 bg-transparent py-1 text-xs sm:text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 dark:text-slate-200 cursor-pointer"
            >
              <option value="Active">Active ({activeCount})</option>
              <option value="Archived">Archived ({archivedCount})</option>
              <option value="All">All ({accounts.length})</option>
            </select>
          </div>
          <span className="hidden text-xs font-medium text-slate-400 sm:inline">{filteredAccounts.length} shown</span>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
            <button
              onClick={() => setViewMode('tree')}
              className={`rounded-md p-1.5 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
                viewMode === 'tree' ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800'
              }`}
              title="Hierarchy view"
              aria-label="Hierarchy view"
            >
              <FolderTree className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-md p-1.5 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${
                viewMode === 'table' ? 'bg-white text-blue-700 shadow-2xs dark:bg-slate-800' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800'
              }`}
              title="List view"
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsQuickAccountModalOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
              title="Add cash or bank account"
              aria-label="Add cash or bank account"
            >
              <Landmark className="w-4 h-4" />
            </button>

            <button
              onClick={handleOpenNewModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs min-h-[36px]"
            >
              <Plus className="w-4 h-4" />
              <span>New</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:px-6 dark:border-slate-800">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="account-type-filter">Account category</label>
          <select
            id="account-type-filter"
            value={selectedTypeFilter}
            onChange={(event) => setSelectedTypeFilter(event.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 flex-1 sm:flex-initial"
          >
            <option value="All">All categories</option>
            {CATEGORY_TREE_SPECIFICATION.map((spec) => <option key={spec.label} value={spec.label}>{spec.label}</option>)}
          </select>
          {subCategoriesList.length > 0 && (
            <>
              <label className="sr-only" htmlFor="account-group-filter">Account group</label>
              <select
                id="account-group-filter"
                value={selectedSubCategoryFilter}
                onChange={(event) => setSelectedSubCategoryFilter(event.target.value)}
                className="h-9 max-w-full sm:max-w-44 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 flex-1 sm:flex-initial"
              >
                <option value="All">All groups</option>
                {subCategoriesList.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowPostingDefaults((value) => !value)}
            className={`rounded-lg p-2 transition-colors cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center ${showPostingDefaults ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-800 dark:border-slate-700 dark:hover:bg-slate-800'}`}
            title="Posting defaults"
            aria-label="Show posting defaults"
            aria-pressed={showPostingDefaults}
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
      </div>

      {archivedMatchesCount > 0 && selectedStatusFilter === 'Active' && (
        <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200 sm:px-6">
          <span>
            Found <strong>{archivedMatchesCount}</strong> archived account(s) matching &ldquo;{search}&rdquo; (hidden under Active view).
          </span>
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('Archived')}
            className="font-bold underline hover:text-amber-800 dark:hover:text-amber-100 cursor-pointer ml-3 shrink-0"
          >
            View archived accounts
          </button>
        </div>
      )}

      {showPostingDefaults && <div className="border-b border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800"><AccountingDefaultsPanel accounts={accounts} /></div>}

      {viewMode === 'tree' && <div className="flex items-center justify-end gap-2 border-b border-slate-200 px-4 py-2 text-xs font-semibold dark:border-slate-800 sm:px-6"><button onClick={handleExpandAll} className="text-blue-600 hover:underline cursor-pointer">Expand all</button><span className="text-slate-300">/</span><button onClick={handleCollapseAll} className="text-slate-600 hover:underline cursor-pointer">Collapse all</button></div>}

      {/* Main Content Area */}
      {viewMode === 'tree' ? (
        /* TREE HIERARCHY VIEW */
        <div className="space-y-6">
          {CATEGORY_TREE_SPECIFICATION.filter(
            (catSpec) =>
              selectedTypeFilter === 'All' ||
              selectedTypeFilter === catSpec.label
          ).map((catSpec) => {
            const isExpanded = expandedCategories[catSpec.label] ?? true;

            // Find all accounts belonging to this main category
            const categoryAccounts = filteredAccounts.filter(
              (acc) => getCategoryLabelForAccount(acc) === catSpec.label
            );

            const totalBalance = categoryAccounts.reduce((sum, a) => sum + a.balance, 0);

            return (
              <div
                key={catSpec.label}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
              >
                {/* Category Card Header */}
                <div
                  onClick={() => handleToggleExpand(catSpec.label)}
                  className="p-3 sm:p-4 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4 cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <button className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                      )}
                    </button>

                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-black text-slate-900 dark:text-white">{catSpec.label}</h3>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${catSpec.badgeColor}`}
                      >
                        {categoryAccounts.length} accounts
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pl-8 sm:pl-0">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      TOTAL BALANCE
                    </span>
                    <span className="text-sm font-black font-mono text-slate-900 dark:text-slate-100">
                      {formatCurrency(totalBalance, settings.currencySymbol)}
                    </span>
                  </div>
                </div>

                {/* Sub-Types Branch Tree */}
                {isExpanded && (
                  <div className="p-4 space-y-5 bg-white">
                    {catSpec.subTypes.map((subType, index) => {
                      const isLastSubType = index === catSpec.subTypes.length - 1;

                      // Accounts under this subType
                      const subTypeAccounts = categoryAccounts.filter((a) => {
                        if (a.subType === subType) return true;
                        // Map legacy subtypes fallback
                        if (
                          subType === 'Bank' &&
                          (a.subType === 'Cash & Bank' || a.subType === 'Bank')
                        )
                          return true;
                        if (
                          subType === 'Cash' &&
                          (a.subType === 'Cash & Bank' || a.subType === 'Cash')
                        )
                          return true;
                        if (
                          subType === 'Materials' &&
                          a.subType.includes('Direct Expense')
                        )
                          return true;
                        return false;
                      });

                      const subTypeBalance = subTypeAccounts.reduce(
                        (sum, a) => sum + a.balance,
                        0
                      );

                      return (
                        <div key={subType} className="pl-1.5 sm:pl-2 border-l-2 border-slate-100 ml-1.5 sm:ml-3">
                          {/* Sub-type Tree Branch Header */}
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono text-sm">
                                {isLastSubType ? '└──' : '├──'}
                              </span>
                              <span className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                                {subType}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                {subTypeAccounts.length}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                                {formatCurrency(subTypeBalance, settings.currencySymbol)}
                              </span>
                            </div>
                          </div>

                          {/* Account Items under Sub-type */}
                          {subTypeAccounts.length === 0 ? (
                            <div className="ml-3 sm:ml-6 py-1 text-[11px] text-slate-400 italic flex items-center justify-between">
                              <span>No accounts created in {subType} yet.</span>
                              <button
                                onClick={handleOpenNewModal}
                                className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                              >
                                + Add {subType} Account
                              </button>
                            </div>
                          ) : (
                            <div className="ml-2 sm:ml-6 space-y-2 sm:space-y-1.5">
                              {subTypeAccounts.map((acc) => {
                                const parentName = acc.parentAccountId ? accountNameById.get(acc.parentAccountId) : undefined;
                                return (
                                  <div
                                    key={acc.id}
                                    onClick={() => setSelectedLedgerAccount(acc)}
                                    className="p-3 sm:p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-blue-300 bg-white dark:bg-slate-800/60 hover:bg-blue-50/40 dark:hover:bg-slate-800 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 cursor-pointer group shadow-2xs"
                                  >
                                    <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                                      <span className="font-mono text-xs font-black text-blue-600 dark:text-blue-400 group-hover:underline shrink-0 pt-0.5 sm:pt-0">
                                        {acc.code}
                                      </span>

                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                                            {acc.name}
                                          </span>

                                          {acc.subCategory && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">
                                              <Layers className="w-2.5 h-2.5 text-amber-600" />
                                              <span>{acc.subCategory}</span>
                                            </span>
                                          )}

                                          {parentName && (
                                            <span className="text-[10px] font-semibold text-slate-500">under {parentName}</span>
                                          )}

                                          {acc.isSystemAccount && (
                                            <span className="text-[10px] font-extrabold bg-violet-50 text-violet-800 border border-violet-200 px-1.5 py-0.2 rounded" title={acc.systemRole ? `System role: ${formatSystemRole(acc.systemRole)}` : 'Provisioned system account'}>
                                              {acc.systemRole ? formatSystemRole(acc.systemRole) : 'System'}
                                            </span>
                                          )}

                                          {(activeChildCountByParentId.get(acc.id) || 0) > 0 && (
                                            <span className="text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.2 rounded">Group account</span>
                                          )}

                                          {acc.allowDirectPosting === false && (
                                            <span className="text-[10px] font-extrabold bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.2 rounded">No direct posting</span>
                                          )}

                                          {acc.normalBalance && (
                                            <span className="text-[10px] font-extrabold bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.2 rounded">{acc.normalBalance === 'Debit' ? 'Dr' : 'Cr'}</span>
                                          )}

                                          {acc.status === 'Archived' && (
                                            <span className="text-[10px] font-extrabold bg-slate-200 text-slate-700 border border-slate-300 px-1.5 py-0.2 rounded">Archived</span>
                                          )}

                                          {acc.isLocked && (
                                            <span
                                              className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.2 rounded"
                                              title={`Locked by ${acc.lockedBy || 'Auditor'}`}
                                            >
                                              <Lock className="w-2.5 h-2.5 text-rose-600" />
                                              <span>Locked</span>
                                            </span>
                                          )}
                                        </div>

                                        {acc.description && (
                                          <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                            {acc.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                                      <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-slate-100">
                                        {formatCurrency(
                                          acc.balance,
                                          settings.currencySymbol
                                        )}
                                      </span>

                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEditModal(acc);
                                          }}
                                          className="text-[11px] sm:text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-amber-50 hover:text-amber-800 px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer min-h-[30px]"
                                          title={`Edit ${acc.name}`}
                                          aria-label={`Edit ${acc.name}`}
                                        >
                                          <Pencil className="w-3 h-3 text-amber-600" />
                                          <span>Edit</span>
                                        </button>

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedLedgerAccount(acc);
                                          }}
                                          className="text-[11px] sm:text-[10px] font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-blue-50 hover:text-blue-700 px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors inline-flex items-center gap-1 cursor-pointer min-h-[30px]"
                                          aria-label={`View ledger for ${acc.name}`}
                                        >
                                          <Eye className="w-3 h-3 text-blue-600" />
                                          <span>Ledger</span>
                                        </button>

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenAddSubAccount(acc);
                                          }}
                                          className="text-[11px] sm:text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-2.5 sm:px-2 py-1.5 sm:py-1 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors inline-flex items-center gap-1 cursor-pointer min-h-[30px]"
                                          title={`Add sub-item under ${acc.name}`}
                                          aria-label={`Add sub-item under ${acc.name}`}
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span className="hidden sm:inline">Add Sub-Item</span>
                                          <span className="sm:hidden">Sub</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* FLAT TABLE VIEW */
        <div className="overflow-hidden">
          {/* Mobile Accounts Cards Feed (block lg:hidden) */}
          <div className="block lg:hidden p-3 sm:p-4 space-y-3">
            {filteredAccounts.length === 0 ? (
              <div className="py-12 text-center text-xs sm:text-sm text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800">
                No accounts match these filters.
              </div>
            ) : (
              filteredAccounts.map((acc) => {
                const parentName = acc.parentAccountId ? accountNameById.get(acc.parentAccountId) : undefined;
                return (
                  <div
                    key={acc.id}
                    onClick={() => setSelectedLedgerAccount(acc)}
                    className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-3.5 sm:p-4 shadow-2xs space-y-3 active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black text-blue-600 dark:text-blue-400">
                            {acc.code}
                          </span>
                          {acc.isSystemAccount && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                              <Lock className="h-3 w-3" /> System
                            </span>
                          )}
                          {acc.status === 'Archived' && (
                            <span className="rounded border border-slate-300 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                              Archived
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">
                          {acc.name}
                        </h4>
                        {acc.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                            {acc.description}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono text-sm font-black text-slate-900 dark:text-white block">
                          {formatCurrency(acc.balance, settings.currencySymbol)}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400">
                          {acc.normalBalance === 'Credit' ? 'Cr' : 'Dr'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold px-2 py-0.5 rounded-md">
                        {acc.subType}
                      </span>
                      <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900">
                        {acc.type}
                      </span>
                      {parentName && (
                        <span className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-300 font-medium px-2 py-0.5 rounded-md">
                          under {parentName}
                        </span>
                      )}
                      {acc.subCategory && (
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md font-bold">
                          {acc.subCategory}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(acc);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-700/60 hover:bg-amber-50 hover:text-amber-800 rounded-lg border border-slate-200 dark:border-slate-600 transition-colors inline-flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                        title={`Edit ${acc.name}`}
                        aria-label={`Edit ${acc.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5 text-amber-600" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedLedgerAccount(acc);
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer min-h-[36px]"
                        aria-label={`View ledger for ${acc.name}`}
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        <span>View Ledger</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop High-Density Table (hidden lg:block) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800">
                <tr>
                  <th className="w-[35%] px-6 py-3">Account name</th>
                  <th className="w-[14%] px-3 py-3">Account code</th>
                  <th className="w-[20%] px-3 py-3">Account type</th>
                  <th className="w-[20%] px-3 py-3">Parent account</th>
                  <th className="w-[11%] px-3 py-3 text-right">Balance</th>
                  <th className="w-12 px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    onClick={() => setSelectedLedgerAccount(acc)}
                    className="group h-14 cursor-pointer transition-colors hover:bg-blue-50/50 dark:hover:bg-slate-800/70"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {acc.isSystemAccount && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" title={acc.systemRole ? `System role: ${formatSystemRole(acc.systemRole)}` : 'System account'} />}
                        <span className="font-semibold text-blue-600 group-hover:underline">{acc.name}</span>
                        {acc.status === 'Archived' && <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">Archived</span>}
                      </div>
                      {acc.description && <p className="mt-0.5 max-w-md truncate text-[10px] text-slate-400">{acc.description}</p>}
                    </td>
                    <td className="px-3 py-3 font-mono font-medium text-slate-600 dark:text-slate-300">
                      {acc.code}
                    </td>
                    <td className="px-3 py-3 text-slate-800 dark:text-slate-200">
                      <div>{acc.subType}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{acc.type} · {acc.normalBalance === 'Credit' ? 'Cr' : 'Dr'}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                      {acc.parentAccountId && accountNameById.get(acc.parentAccountId) ? accountNameById.get(acc.parentAccountId) : <span className="text-slate-300">-</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-100">
                      {formatCurrency(acc.balance, settings.currencySymbol)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(event) => { event.stopPropagation(); handleOpenEditModal(acc); }}
                        className="rounded p-1.5 text-slate-500 opacity-80 lg:opacity-0 transition-all hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100 focus:opacity-100 dark:hover:bg-slate-800 cursor-pointer"
                        title={`Edit ${acc.name}`}
                        aria-label={`Edit ${acc.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredAccounts.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">No accounts match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Account Modal */}
      <AccountModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setAccountToEdit(null);
        }}
        initialParentId={modalParentId}
        initialSubCategory={modalSubCat}
        accountToEdit={accountToEdit}
      />

      {/* General Ledger Modal */}
      <AccountLedgerModal
        account={selectedLedgerAccount}
        isOpen={!!selectedLedgerAccount}
        onClose={() => {
          setSelectedLedgerAccount(null);
          if (onSelectedEntityClosed) onSelectedEntityClosed();
        }}
        onAddSubAccount={handleOpenAddSubAccount}
        onEditAccount={handleOpenEditModal}
      />

      <QuickAddAccountModal
        isOpen={isQuickAccountModalOpen}
        onClose={() => setIsQuickAccountModalOpen(false)}
        defaultCategory="Bank"
      />
    </div>
  );
};
