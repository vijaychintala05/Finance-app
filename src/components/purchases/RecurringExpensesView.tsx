import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { RecurringExpense } from '../../types';

export const RecurringExpensesView: React.FC = () => {
  const { recurringExpenses, addRecurringExpense, updateRecurringExpense, vendors, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [profileName, setProfileName] = useState('');
  const [vendorName, setVendorName] = useState(vendors[0]?.name || 'AWS Cloud Services');
  const [category, setCategory] = useState('Software & Subscriptions');
  const [frequency, setFrequency] = useState<'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly'>('Monthly');
  const [amount, setAmount] = useState('850');

  const filtered = recurringExpenses.filter(
    (s) =>
      s.profileName.toLowerCase().includes(search.toLowerCase()) ||
      s.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName) return;
    const targetVendor = vendorName || vendors[0]?.name || 'Unassigned Vendor';

    addRecurringExpense({
      profileName,
      vendorName: targetVendor,
      category,
      frequency,
      amount: Number(amount) || 0,
      nextRunDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: 'Active',
    });

    setIsModalOpen(false);
    setProfileName('');
  };

  const toggleStatus = (id: string) => {
    const target = recurringExpenses.find((s) => s.id === id);
    if (target) {
      updateRecurringExpense(id, { status: target.status === 'Active' ? 'Paused' : 'Active' });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <RotateCcw className="w-6 h-6 text-purple-600" />
            <span>Recurring Expenses</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Automate routine operational expenses, server hosting bills, SaaS subscriptions & software fees
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Recurring Expense</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search recurring expense, vendor, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Schedule Profile</th>
                <th className="p-3">Vendor / Supplier</th>
                <th className="p-3">Category</th>
                <th className="p-3">Frequency</th>
                <th className="p-3">Next Execution Date</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 pl-4 font-bold text-slate-800">{s.profileName}</td>
                  <td className="p-3 text-slate-700 font-medium">{s.vendorName}</td>
                  <td className="p-3 text-slate-500">{s.category}</td>
                  <td className="p-3">
                    <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-bold">
                      {s.frequency}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-slate-600">{formatDate(s.nextRunDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(s.amount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        s.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4">
                    <button
                      onClick={() => toggleStatus(s.id)}
                      className="text-xs font-bold text-purple-600 hover:underline cursor-pointer"
                    >
                      {s.status === 'Active' ? 'Pause' : 'Resume'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-purple-600" />
              <span>Create Recurring Expense Schedule</span>
            </h3>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Profile Name</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly Server Subscription"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vendor / Payee</label>
                <input
                  type="text"
                  placeholder="e.g. AWS Cloud Services"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expense Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  <option value="Hosting & Server Infrastructure">Hosting & Infrastructure</option>
                  <option value="Software & Subscriptions">Software & Subscriptions</option>
                  <option value="Utilities & Internet">Utilities & Internet</option>
                  <option value="Office Rent & Maintenance">Office Rent & Maintenance</option>
                  <option value="Legal & Professional Fees">Legal & Professional Fees</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as any)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  >
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Yearly">Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Amount ({settings.currencySymbol})</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer transition-colors"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
