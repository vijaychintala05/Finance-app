import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Calculator,
  Edit3,
  Layers,
  Lock,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';
import { JournalEntriesView } from '../journals/JournalEntriesView';
import { BulkUpdatesView } from './BulkUpdatesView';
import { ChartOfAccountsView } from '../coa/ChartOfAccountsView';
import { TransactionLockingView } from './TransactionLockingView';

export type AccountingSubTab = 'journals' | 'bulk_updates' | 'coa' | 'transaction_locking';

interface AccountingViewProps {
  initialSubTab?: AccountingSubTab;
  onSubTabChange?: (subTab: AccountingSubTab) => void;
  autoOpenJournalModal?: boolean;
  onJournalModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const AccountingView: React.FC<AccountingViewProps> = ({
  initialSubTab = 'journals',
  onSubTabChange,
  autoOpenJournalModal,
  onJournalModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const [subTab, setSubTab] = useState<AccountingSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const handleSubTabClick = (tab: AccountingSubTab) => {
    setSubTab(tab);
    if (onSubTabChange) {
      onSubTabChange(tab);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Navigation Tabs Header for Accounting */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2 sm:p-2.5 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto pb-1 sm:pb-0 w-full md:w-auto scrollbar-none">
          <button
            onClick={() => handleSubTabClick('journals')}
            className={`min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap active:scale-98 ${
              subTab === 'journals'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Manual Journals</span>
          </button>

          <button
            onClick={() => handleSubTabClick('bulk_updates')}
            className={`min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap active:scale-98 ${
              subTab === 'bulk_updates'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Edit3 className="w-4 h-4 shrink-0" />
            <span>Bulk Journal Entry</span>
          </button>

          <button
            onClick={() => handleSubTabClick('coa')}
            className={`min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap active:scale-98 ${
              subTab === 'coa'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>Chart of Accounts</span>
          </button>

          <button
            onClick={() => handleSubTabClick('transaction_locking')}
            className={`min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs flex items-center space-x-2 transition-all cursor-pointer whitespace-nowrap active:scale-98 ${
              subTab === 'transaction_locking'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Lock className="w-4 h-4 shrink-0" />
            <span>Transaction Locking</span>
          </button>
        </div>

        <div className="hidden lg:flex items-center space-x-2 text-slate-400 dark:text-slate-500 text-xs font-semibold pr-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          <span>Accounting Module</span>
        </div>
      </div>

      {/* Sub-View Content */}
      <div className="focus:outline-none">
        {subTab === 'journals' && (
          <JournalEntriesView
            autoOpenCreateModal={autoOpenJournalModal}
            onModalClosed={onJournalModalClosed}
          />
        )}
        {subTab === 'bulk_updates' && <BulkUpdatesView />}
        {subTab === 'coa' && (
          <ChartOfAccountsView
            selectedEntityId={selectedEntityId}
            onSelectedEntityClosed={onSelectedEntityClosed}
          />
        )}
        {subTab === 'transaction_locking' && <TransactionLockingView />}
      </div>
    </div>
  );
};
