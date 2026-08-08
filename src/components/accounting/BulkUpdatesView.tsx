import React, { useState } from 'react';
import {
  CheckSquare,
  CheckCircle2,
  Edit3,
  Layers,
  Lock,
  RefreshCw,
  Search,
  Shield,
  Square,
  Tag,
  Unlock,
  AlertCircle,
} from 'lucide-react';
import { Account, JournalEntry } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

export const BulkUpdatesView: React.FC = () => {
  const { settings, accounts, journalEntries, bulkUpdateAccounts, bulkUpdateJournals } = useBooks();

  const [activeTab, setActiveTab] = useState<'accounts' | 'journals'>('accounts');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedJournalIds, setSelectedJournalIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [subCategoryTag, setSubCategoryTag] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // Filtered accounts
  const filteredAccounts = accounts.filter(
    (a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filtered journals
  const filteredJournals = journalEntries.filter(
    (j) =>
      j.entryNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Toggle select account
  const handleToggleSelectAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccountIds.length === filteredAccounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(filteredAccounts.map((a) => a.id));
    }
  };

  // Toggle select journal
  const handleToggleSelectJournal = (id: string) => {
    setSelectedJournalIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllJournals = () => {
    if (selectedJournalIds.length === filteredJournals.length) {
      setSelectedJournalIds([]);
    } else {
      setSelectedJournalIds(filteredJournals.map((j) => j.id));
    }
  };

  // Bulk Account Actions
  const handleBulkLockAccounts = () => {
    if (selectedAccountIds.length === 0) return;
    bulkUpdateAccounts(selectedAccountIds, {
      isLocked: true,
      lockedBy: 'Batch Compliance Auditor',
      lockedAt: new Date().toISOString(),
      lockedReason: 'Bulk Lock applied via Accounting Tools',
      lockedRegion: 'Global / ALL',
    });
    showToast(`Locked ${selectedAccountIds.length} accounts successfully.`);
    setSelectedAccountIds([]);
  };

  const handleBulkUnlockAccounts = () => {
    if (selectedAccountIds.length === 0) return;
    bulkUpdateAccounts(selectedAccountIds, {
      isLocked: false,
      lockedBy: undefined,
      lockedAt: undefined,
      lockedReason: undefined,
      lockedRegion: undefined,
    });
    showToast(`Unlocked ${selectedAccountIds.length} accounts successfully.`);
    setSelectedAccountIds([]);
  };

  const handleApplySubCategoryTag = () => {
    if (selectedAccountIds.length === 0 || !subCategoryTag.trim()) return;
    bulkUpdateAccounts(selectedAccountIds, {
      subCategory: subCategoryTag.trim(),
    });
    showToast(`Updated sub-category tag for ${selectedAccountIds.length} accounts.`);
    setSubCategoryTag('');
    setSelectedAccountIds([]);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center space-x-2 text-xs animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span className="font-bold">{notification}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold shrink-0 mt-0.5">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black tracking-tight text-white">Bulk Accounting & Ledger Operations</h2>
                <span className="bg-blue-500/10 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-500/20 uppercase tracking-wide">
                  Batch Utility
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Mass update Chart of Accounts, bulk lock or unlock accounts, apply group tags, and reclassify journal ledger entries simultaneously.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 rounded-xl font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'accounts'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Chart of Accounts Bulk Tool ({accounts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('journals')}
          className={`px-4 py-2 rounded-xl font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'journals'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Edit3 className="w-4 h-4" />
          <span>Journal Entries Bulk Tool ({journalEntries.length})</span>
        </button>
      </div>

      {/* Accounts Bulk View */}
      {activeTab === 'accounts' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-4">
          {/* Action Toolbar */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-slate-700">
                Selected: <span className="text-blue-600 font-extrabold">{selectedAccountIds.length}</span> accounts
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                disabled={selectedAccountIds.length === 0}
                onClick={handleBulkLockAccounts}
                className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Bulk Lock ({selectedAccountIds.length})</span>
              </button>

              <button
                disabled={selectedAccountIds.length === 0}
                onClick={handleBulkUnlockAccounts}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Bulk Unlock ({selectedAccountIds.length})</span>
              </button>

              <div className="flex items-center space-x-1 pl-2 border-l border-slate-300">
                <input
                  type="text"
                  placeholder="Set Sub-Category Tag..."
                  value={subCategoryTag}
                  onChange={(e) => setSubCategoryTag(e.target.value)}
                  className="bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-medium focus:outline-none w-40"
                />
                <button
                  disabled={selectedAccountIds.length === 0 || !subCategoryTag.trim()}
                  onClick={handleApplySubCategoryTag}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1 shadow-2xs transition-all cursor-pointer"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Apply Tag</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by account code, name, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <button onClick={handleSelectAllAccounts} className="cursor-pointer">
                      {selectedAccountIds.length > 0 &&
                      selectedAccountIds.length === filteredAccounts.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="p-3">Code & Name</th>
                  <th className="p-3">Type / SubType</th>
                  <th className="p-3">Sub-Category Group</th>
                  <th className="p-3">Balance</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredAccounts.map((acc) => {
                  const isSelected = selectedAccountIds.includes(acc.id);
                  return (
                    <tr
                      key={acc.id}
                      onClick={() => handleToggleSelectAccount(acc.id)}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <td className="p-3 text-center">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600 inline" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 inline" />
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-800">
                            {acc.code}
                          </span>
                          <span className="font-bold text-slate-900">{acc.name}</span>
                        </div>
                      </td>

                      <td className="p-3 text-slate-600 font-semibold">
                        {acc.type} ({acc.subType})
                      </td>

                      <td className="p-3">
                        {acc.subCategory ? (
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200">
                            {acc.subCategory}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>

                      <td className="p-3 font-bold text-slate-900">{formatCurrency(acc.balance, settings.currencySymbol)}</td>

                      <td className="p-3">
                        {acc.isLocked ? (
                          <span className="bg-amber-100 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-amber-300 inline-flex items-center space-x-1">
                            <Lock className="w-3 h-3 text-amber-700" />
                            <span>Locked</span>
                          </span>
                        ) : (
                          <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Journal Entries Bulk View */}
      {activeTab === 'journals' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
            <span className="font-bold text-slate-700">
              Selected: <span className="text-blue-600 font-extrabold">{selectedJournalIds.length}</span> journals
            </span>

            <button
              disabled={selectedJournalIds.length === 0}
              onClick={() => {
                showToast(`Flagged ${selectedJournalIds.length} journals as Verified.`);
                setSelectedJournalIds([]);
              }}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Bulk Mark as Verified & Audited</span>
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <button onClick={handleSelectAllJournals} className="cursor-pointer">
                      {selectedJournalIds.length > 0 &&
                      selectedJournalIds.length === filteredJournals.length ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="p-3">Entry #</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Description / Reference</th>
                  <th className="p-3 text-right">Debit / Credit Sum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredJournals.map((j) => {
                  const isSelected = selectedJournalIds.includes(j.id);
                  const total = j.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
                  return (
                    <tr
                      key={j.id}
                      onClick={() => handleToggleSelectJournal(j.id)}
                      className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <td className="p-3 text-center">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-blue-600 inline" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 inline" />
                        )}
                      </td>

                      <td className="p-3 font-mono font-bold text-blue-600">{j.entryNumber}</td>
                      <td className="p-3 text-slate-600">{formatDate(j.date)}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">{j.description}</div>
                        <div className="text-[10px] text-slate-400">Ref: {j.reference}</div>
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        {formatCurrency(total, settings.currencySymbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
