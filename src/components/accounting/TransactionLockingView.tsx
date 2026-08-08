import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Globe,
  Lock,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  Unlock,
  UserCheck,
  X,
} from 'lucide-react';
import { Account, PeriodLock } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

export const TransactionLockingView: React.FC = () => {
  const { settings, accounts, periodLocks, addPeriodLock, deletePeriodLock, toggleAccountLock } = useBooks();

  const [activeTab, setActiveTab] = useState<'period' | 'account'>('period');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Modal states for New Period Lock
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [lockDate, setLockDate] = useState('2025-12-31');
  const [periodRegion, setPeriodRegion] = useState('North America / Global');
  const [lockedPersonName, setLockedPersonName] = useState('Sarah Jenkins');
  const [lockedPersonRole, setLockedPersonRole] = useState('Chief Financial Controller');
  const [lockedPersonEmail, setLockedPersonEmail] = useState('s.jenkins@apexgrowth.com');
  const [periodReason, setPeriodReason] = useState('Year-End Statutory Financial Audit & Tax Signoff');

  // Modal states for Account Locking
  const [lockingAccount, setLockingAccount] = useState<Account | null>(null);
  const [accRegion, setAccRegion] = useState('Global / ALL');
  const [accPersonName, setAccPersonName] = useState('Mark Vance');
  const [accPersonRole, setAccPersonRole] = useState('Senior Financial Controller');
  const [accPersonEmail, setAccPersonEmail] = useState('m.vance@apexgrowth.com');
  const [accReason, setAccReason] = useState('Restricted Account - Frozen for Audit Verification');

  const lockedAccounts = accounts.filter((a) => a.isLocked);

  // Handle submit for Period Lock
  const handleCreatePeriodLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockDate || !periodReason.trim()) return;

    addPeriodLock({
      lockDate,
      region: periodRegion,
      lockedBy: `${lockedPersonName.trim()} (${lockedPersonRole.trim()})`,
      lockedByEmail: lockedPersonEmail.trim(),
      reason: periodReason.trim(),
      affectedAccountsCount: accounts.length,
    });

    setIsPeriodModalOpen(false);
    setPeriodReason('');
  };

  // Handle open Account Lock modal
  const handleOpenAccountLockModal = (acc: Account) => {
    if (acc.isLocked) {
      // Direct unlock
      if (window.confirm(`Are you sure you want to unlock account ${acc.code} - ${acc.name}?`)) {
        toggleAccountLock(acc.id);
      }
    } else {
      setLockingAccount(acc);
    }
  };

  // Submit Account Lock modal
  const handleConfirmAccountLock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lockingAccount) return;

    toggleAccountLock(lockingAccount.id, {
      lockedBy: `${accPersonName.trim()} (${accPersonRole.trim()})`,
      lockedReason: accReason.trim(),
      lockedRegion: accRegion,
    });

    setLockingAccount(null);
  };

  // Filtered accounts for Account Locking section
  const filteredAccounts = accounts.filter((acc) => {
    if (typeFilter !== 'ALL' && acc.type !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        acc.name.toLowerCase().includes(q) ||
        acc.code.toLowerCase().includes(q) ||
        (acc.lockedBy && acc.lockedBy.toLowerCase().includes(q)) ||
        (acc.lockedReason && acc.lockedReason.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-black tracking-tight text-white">Transaction & Ledger Locking</h2>
                <span className="bg-amber-500/10 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-500/20 uppercase tracking-wide">
                  Audit Governance
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Freeze accounting periods, assign lock regions, record auditor/controller signoffs, and lock individual accounts to prevent unapproved entries.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {activeTab === 'period' ? (
              <button
                onClick={() => setIsPeriodModalOpen(true)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-2 shadow-xs transition-all cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>+ Lock Financial Period & Region</span>
              </button>
            ) : (
              <div className="text-right">
                <div className="text-xs font-bold text-amber-400">{lockedAccounts.length} Accounts Locked</div>
                <div className="text-[10px] text-slate-400">Preventing unauthorized postings</div>
              </div>
            )}
          </div>
        </div>

        {/* Top Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block mb-1">
              Active Period Locks
            </span>
            <div className="text-lg font-extrabold text-white flex items-center space-x-1.5">
              <span>{periodLocks.length}</span>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                Enforced
              </span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block mb-1">
              Locked Accounts
            </span>
            <div className="text-lg font-extrabold text-amber-400 flex items-center space-x-1.5">
              <span>{lockedAccounts.length}</span>
              <span className="text-[10px] text-slate-400 font-normal">/ {accounts.length} Total</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block mb-1">
              Active Lock Regions
            </span>
            <div className="text-sm font-bold text-slate-200 truncate flex items-center space-x-1">
              <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span>US, APAC, EMEA</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block mb-1">
              Audit Controller
            </span>
            <div className="text-xs font-bold text-slate-200 truncate flex items-center space-x-1">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Sarah Jenkins (CFO)</span>
            </div>
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('period')}
          className={`px-4 py-2 rounded-xl font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'period'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Period & Regional Locks ({periodLocks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('account')}
          className={`px-4 py-2 rounded-xl font-extrabold flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'account'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Account-Level Locking ({lockedAccounts.length} Locked)</span>
        </button>
      </div>

      {/* Tab 1: Period & Regional Locks */}
      {activeTab === 'period' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Enforced Period Lock Rules</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                All transactions posted on or before the lock date in the specified region are frozen.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {periodLocks.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <Shield className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="font-bold">No Active Period Locks</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Click "+ Lock Financial Period & Region" to enforce closed accounting periods.
                </p>
              </div>
            ) : (
              periodLocks.map((lock) => (
                <div key={lock.id} className="p-5 hover:bg-slate-50/80 transition-colors">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2.5">
                        <span className="bg-rose-100 text-rose-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-rose-200 flex items-center space-x-1">
                          <Lock className="w-3 h-3" />
                          <span>Locked Until: {formatDate(lock.lockDate)}</span>
                        </span>

                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-blue-200 flex items-center space-x-1">
                          <Globe className="w-3 h-3" />
                          <span>Region: {lock.region}</span>
                        </span>

                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                          {lock.status}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-extrabold text-slate-900 text-sm">{lock.reason}</h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 mt-1">
                          <span className="flex items-center space-x-1 font-medium text-slate-700">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span>Locked By: <strong>{lock.lockedBy}</strong></span>
                          </span>
                          {lock.lockedByEmail && (
                            <span className="text-slate-400">({lock.lockedByEmail})</span>
                          )}
                          <span className="text-slate-400">• Locked on {formatDate(lock.lockedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to lift/delete this period lock rule?')) {
                          deletePeriodLock(lock.id);
                        }
                      }}
                      className="text-rose-600 hover:text-rose-800 hover:bg-rose-50 p-2 rounded-xl border border-slate-200 hover:border-rose-200 transition-colors flex items-center space-x-1 font-bold text-xs cursor-pointer self-start md:self-center"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Remove Lock</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Account-Level Locking */}
      {activeTab === 'account' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4">
          {/* Controls Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search account code, name, auditor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center space-x-2 text-xs w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {['ALL', 'Asset', 'Liability', 'Equity', 'Income', 'Expense'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer shrink-0 ${
                    typeFilter === t
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Accounts Table */}
          <div className="overflow-x-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3">Account Code & Name</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Current Balance</th>
                  <th className="p-3">Lock Status & Region</th>
                  <th className="p-3">Auditor / Controller Details</th>
                  <th className="p-3 text-right">Lock Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredAccounts.map((acc) => (
                  <tr
                    key={acc.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      acc.isLocked ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">
                          {acc.code}
                        </span>
                        <span className="font-bold text-slate-900">{acc.name}</span>
                      </div>
                      {acc.description && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{acc.description}</div>
                      )}
                    </td>

                    <td className="p-3 text-slate-600 font-semibold">{acc.type} ({acc.subType})</td>

                    <td className="p-3 font-bold text-slate-900">
                      {formatCurrency(acc.balance, settings.currencySymbol)}
                    </td>

                    <td className="p-3">
                      {acc.isLocked ? (
                        <div className="space-y-1">
                          <span className="bg-amber-100 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-amber-300 inline-flex items-center space-x-1">
                            <Lock className="w-3 h-3 text-amber-700" />
                            <span>LOCKED (Not usable)</span>
                          </span>
                          <div className="text-[10px] font-bold text-slate-600 flex items-center space-x-1">
                            <Globe className="w-3 h-3 text-slate-400" />
                            <span>Region: {acc.lockedRegion || 'Global / ALL'}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200 inline-flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Active / Usable</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      {acc.isLocked ? (
                        <div>
                          <div className="font-bold text-slate-900 text-[11px]">{acc.lockedBy}</div>
                          <div className="text-[10px] text-slate-500 italic">"{acc.lockedReason}"</div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleOpenAccountLockModal(acc)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer inline-flex items-center space-x-1.5 ${
                          acc.isLocked
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-2xs'
                            : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        }`}
                      >
                        {acc.isLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Unlock Account</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Lock Account</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Create Period Lock */}
      {isPeriodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Lock Accounting Period & Region
                  </h3>
                  <p className="text-[11px] text-slate-400">Freeze ledger entries prior to lock date</p>
                </div>
              </div>
              <button
                onClick={() => setIsPeriodModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePeriodLock} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Lock Transactions On or Before Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={lockDate}
                  onChange={(e) => setLockDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold px-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Region for Locking <span className="text-rose-500">*</span>
                </label>
                <select
                  value={periodRegion}
                  onChange={(e) => setPeriodRegion(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold px-3 py-2 rounded-xl text-xs focus:outline-none"
                >
                  <option value="North America / Global">North America / Global</option>
                  <option value="APAC / India">APAC / India</option>
                  <option value="EMEA / Europe">EMEA / Europe</option>
                  <option value="LATAM / South America">LATAM / South America</option>
                  <option value="Global / ALL">Global / ALL Regions</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Locked By (Person Name) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={lockedPersonName}
                    onChange={(e) => setLockedPersonName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold px-3 py-2 rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Designation / Role</label>
                  <input
                    type="text"
                    value={lockedPersonRole}
                    onChange={(e) => setLockedPersonRole(e.target.value)}
                    placeholder="e.g. Chief Financial Officer"
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold px-3 py-2 rounded-xl text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Controller Email</label>
                <input
                  type="email"
                  value={lockedPersonEmail}
                  onChange={(e) => setLockedPersonEmail(e.target.value)}
                  placeholder="e.g. s.jenkins@apexgrowth.com"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-medium px-3 py-2 rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Reason for Period Lock <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={periodReason}
                  onChange={(e) => setPeriodReason(e.target.value)}
                  placeholder="e.g. FY2025 Year-End Statutory Tax Filing Signed Off"
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-medium p-3 rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPeriodModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-5 py-2 rounded-xl shadow-xs cursor-pointer flex items-center space-x-1"
                >
                  <Lock className="w-4 h-4" />
                  <span>Enforce Period Lock</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Account Locking Modal */}
      {lockingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm tracking-tight text-white">
                    Lock Account #{lockingAccount.code}
                  </h3>
                  <p className="text-[11px] text-slate-400">{lockingAccount.name} ({lockingAccount.type})</p>
                </div>
              </div>
              <button
                onClick={() => setLockingAccount(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAccountLock} className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  Locking this account will prevent any new manual journal lines, expense entries, or payment postings from referencing it until unlocked.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Region for Locking <span className="text-rose-500">*</span>
                </label>
                <select
                  value={accRegion}
                  onChange={(e) => setAccRegion(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-bold px-3 py-2 rounded-xl text-xs focus:outline-none"
                >
                  <option value="Global / ALL">Global / ALL Regions</option>
                  <option value="North America">North America</option>
                  <option value="APAC / India">APAC / India</option>
                  <option value="EMEA / Europe">EMEA / Europe</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    Auditor / Controller Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={accPersonName}
                    onChange={(e) => setAccPersonName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold px-3 py-2 rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Designation / Role</label>
                  <input
                    type="text"
                    value={accPersonRole}
                    onChange={(e) => setAccPersonRole(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-semibold px-3 py-2 rounded-xl text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Email</label>
                <input
                  type="email"
                  value={accPersonEmail}
                  onChange={(e) => setAccPersonEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-medium px-3 py-2 rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Lock Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={accReason}
                  onChange={(e) => setAccReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 font-medium p-3 rounded-xl text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setLockingAccount(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-500 text-white font-extrabold px-5 py-2 rounded-xl shadow-xs cursor-pointer flex items-center space-x-1"
                >
                  <Lock className="w-4 h-4" />
                  <span>Lock Account Now</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
