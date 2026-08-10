import React, { useState } from 'react';
import {
  BookOpen,
  Building2,
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
import { Account, AccountSubType, AccountType } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency } from '../../utils/formatters';
import { AccountModal } from './AccountModal';
import { AccountLedgerModal } from './AccountLedgerModal';
import { QuickAddAccountModal } from '../common/QuickAddAccountModal';

export interface CategoryTreeSection {
  type: AccountType;
  label: string;
  badgeColor: string;
  subTypes: string[];
}

export const CATEGORY_TREE_SPECIFICATION: CategoryTreeSection[] = [
  {
    type: 'Asset',
    label: 'Assets',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    subTypes: [
      'Bank',
      'Cash',
      'Accounts Receivable',
      'Inventory',
      'Fixed Assets',
      'Other Current Assets',
      'Other Assets',
    ],
  },
  {
    type: 'Liability',
    label: 'Liabilities',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    subTypes: [
      'Accounts Payable',
      'Credit Cards',
      'Taxes Payable',
      'Payroll Liabilities',
      'Loans',
      'Other Liabilities',
    ],
  },
  {
    type: 'Equity',
    label: 'Equity',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    subTypes: ['Capital', 'Retained Earnings', 'Drawings', 'Other Equity'],
  },
  {
    type: 'Income',
    label: 'Income',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    subTypes: ['Sales', 'Services', 'Other Operating Income'],
  },
  {
    type: 'Cost of Goods Sold',
    label: 'Cost of Goods Sold',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-200',
    subTypes: ['Materials', 'Direct Labor', 'Subcontractors', 'Other Direct Costs'],
  },
  {
    type: 'Expense',
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
    ],
  },
  {
    type: 'Other Income',
    label: 'Other Income',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
    subTypes: ['Interest Income', 'Asset Gains', 'Other Income'],
  },
  {
    type: 'Other Expense',
    label: 'Other Expenses',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    subTypes: ['Interest Expense', 'Asset Losses', 'Other Expenses'],
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
  const [viewMode, setViewMode] = useState<'tree' | 'table'>('tree');

  // Collapse / Expand state for tree sections
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    Assets: true,
    Liabilities: true,
    Equity: true,
    Income: true,
    'Cost of Goods Sold': true,
    Expenses: true,
    'Other Income': true,
    'Other Expenses': true,
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
    if (acc.type === 'Income' || acc.type === 'Revenue') return 'Income';
    if (acc.type === 'Cost of Goods Sold') return 'Cost of Goods Sold';
    if (acc.type === 'Expense') {
      if (
        acc.subType === 'Materials' ||
        acc.subType === 'Direct Labor' ||
        acc.subType === 'Subcontractors' ||
        acc.subType === 'Other Direct Costs' ||
        acc.subType.includes('Direct Expense')
      ) {
        return 'Cost of Goods Sold';
      }
      return 'Expenses';
    }
    if (acc.type === 'Other Income') return 'Other Income';
    if (acc.type === 'Other Expense') return 'Other Expenses';
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

    return matchesSearch && matchesType && matchesSubCat;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            <span>Chart of Accounts (COA) Hierarchy</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Complete structured ledger with Assets, Liabilities, Equity, Income, COGS, Expenses, Other Income & Expenses
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
            <button
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'tree' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Tree Hierarchy</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'table' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Flat Table</span>
            </button>
          </div>

          <button
            onClick={() => setIsQuickAccountModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Landmark className="w-4 h-4" />
            <span>Add Cash / Bank Account</span>
          </button>

          <button
            onClick={handleOpenNewModal}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Account</span>
          </button>
        </div>
      </div>

      {/* Sub-Category Quick Filter Pills */}
      {subCategoriesList.length > 0 && (
        <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-xs font-extrabold text-blue-900 mr-2">
            <FolderTree className="w-4 h-4 text-blue-600" />
            <span>Custom Groupings:</span>
          </div>
          <button
            onClick={() => setSelectedSubCategoryFilter('All')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
              selectedSubCategoryFilter === 'All'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-100'
            }`}
          >
            All Groups
          </button>
          {subCategoriesList.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedSubCategoryFilter(cat)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                selectedSubCategoryFilter === cat
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-blue-200 text-slate-700 hover:bg-blue-100'
              }`}
            >
              <Layers className="w-3 h-3 text-blue-500" />
              <span>{cat}</span>
              <span className="text-[10px] opacity-75">
                ({accounts.filter((a) => a.subCategory === cat).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search and Category Quick Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-center gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search code, account name, Ply, 18mm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto text-xs pb-1 md:pb-0">
          <button
            onClick={() => setSelectedTypeFilter('All')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap ${
              selectedTypeFilter === 'All'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All (8 Categories)
          </button>
          {CATEGORY_TREE_SPECIFICATION.map((spec) => (
            <button
              key={spec.label}
              onClick={() => setSelectedTypeFilter(spec.label)}
              className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer whitespace-nowrap ${
                selectedTypeFilter === spec.label
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {spec.label}
            </button>
          ))}
        </div>

        {viewMode === 'tree' && (
          <div className="flex items-center gap-2 text-xs font-bold">
            <button
              onClick={handleExpandAll}
              className="text-blue-600 hover:underline cursor-pointer"
            >
              Expand All
            </button>
            <span className="text-slate-300">•</span>
            <button
              onClick={handleCollapseAll}
              className="text-slate-500 hover:underline cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {viewMode === 'tree' ? (
        /* TREE HIERARCHY VIEW */
        <div className="space-y-6">
          {CATEGORY_TREE_SPECIFICATION.filter(
            (catSpec) =>
              selectedTypeFilter === 'All' ||
              selectedTypeFilter === catSpec.label ||
              selectedTypeFilter === catSpec.type
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
                  className="p-4 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <button className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                      )}
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-slate-900 dark:text-white">{catSpec.label}</h3>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${catSpec.badgeColor}`}
                        >
                          {categoryAccounts.length} accounts
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        TOTAL {catSpec.label.toUpperCase()} BALANCE
                      </span>
                      <span className="text-sm font-black font-mono text-slate-900">
                        {formatCurrency(totalBalance, settings.currencySymbol)}
                      </span>
                    </div>
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
                        <div key={subType} className="pl-2 border-l-2 border-slate-100 ml-3">
                          {/* Sub-type Tree Branch Header */}
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 font-mono text-sm">
                                {isLastSubType ? '└──' : '├──'}
                              </span>
                              <span className="font-extrabold text-xs text-slate-800">
                                {subType}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                {subTypeAccounts.length}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono font-bold text-slate-700">
                                {formatCurrency(subTypeBalance, settings.currencySymbol)}
                              </span>
                            </div>
                          </div>

                          {/* Account Items under Sub-type */}
                          {subTypeAccounts.length === 0 ? (
                            <div className="ml-6 py-1 text-[11px] text-slate-400 italic flex items-center justify-between">
                              <span>No accounts created in {subType} yet.</span>
                              <button
                                onClick={handleOpenNewModal}
                                className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer"
                              >
                                + Add {subType} Account
                              </button>
                            </div>
                          ) : (
                            <div className="ml-6 space-y-1.5">
                              {subTypeAccounts.map((acc) => {
                                const isChild = !!acc.parentId;
                                return (
                                  <div
                                    key={acc.id}
                                    onClick={() => setSelectedLedgerAccount(acc)}
                                    className="p-2.5 rounded-xl border border-slate-100 hover:border-blue-300 bg-slate-50/50 hover:bg-blue-50/40 transition-all flex items-center justify-between cursor-pointer group"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-xs font-black text-blue-600 group-hover:underline">
                                        {acc.code}
                                      </span>

                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-xs text-slate-900">
                                            {acc.name}
                                          </span>

                                          {acc.subCategory && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">
                                              <Layers className="w-2.5 h-2.5 text-amber-600" />
                                              <span>{acc.subCategory}</span>
                                            </span>
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
                                          <p className="text-[10px] text-slate-400 line-clamp-1">
                                            {acc.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <span className="font-mono text-xs font-extrabold text-slate-900">
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
                                          className="text-[10px] font-bold text-slate-700 bg-white hover:bg-amber-50 hover:text-amber-800 px-2 py-1 rounded-lg border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                          title={`Edit ${acc.name}`}
                                        >
                                          <Pencil className="w-3 h-3 text-amber-600" />
                                          <span>Edit</span>
                                        </button>

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedLedgerAccount(acc);
                                          }}
                                          className="text-[10px] font-bold text-slate-700 bg-white hover:bg-blue-50 hover:text-blue-700 px-2 py-1 rounded-lg border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                        >
                                          <Eye className="w-3 h-3 text-blue-600" />
                                          <span>Ledger</span>
                                        </button>

                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenAddSubAccount(acc);
                                          }}
                                          className="text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg border border-blue-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                          title={`Add sub-item under ${acc.name}`}
                                        >
                                          <Plus className="w-3 h-3" />
                                          <span>Add Sub-Item</span>
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
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <span>Click any account row to open its General Ledger and recorded entries.</span>
            </span>
            <span className="font-bold text-slate-700">
              {filteredAccounts.length} Accounts Listed
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3 pl-4">Code</th>
                  <th className="p-3">Account Name</th>
                  <th className="p-3">Classification</th>
                  <th className="p-3">Sub-Type</th>
                  <th className="p-3">Group</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    onClick={() => setSelectedLedgerAccount(acc)}
                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                  >
                    <td className="p-3 pl-4 font-mono font-bold text-blue-600 group-hover:underline">
                      {acc.code}
                    </td>
                    <td className="p-3 font-semibold text-slate-900 flex items-center gap-2">
                      <span>{acc.name}</span>
                      {acc.isLocked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.2 rounded shrink-0">
                          <Lock className="w-2.5 h-2.5 text-rose-600" />
                          <span>Locked</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-slate-100 text-slate-700 border-slate-200">
                        {acc.type}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{acc.subType}</td>
                    <td className="p-3">
                      {acc.subCategory ? (
                        <span className="inline-flex items-center gap-1 font-bold text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-md">
                          <Layers className="w-3 h-3 text-amber-600" />
                          <span>{acc.subCategory}</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(acc.balance, settings.currencySymbol)}
                    </td>
                    <td className="p-3 pr-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditModal(acc);
                          }}
                          className="text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-amber-50 hover:text-amber-800 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3 text-amber-600" />
                          <span>Edit</span>
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLedgerAccount(acc);
                          }}
                          className="text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-blue-600" />
                          <span>Ledger</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
