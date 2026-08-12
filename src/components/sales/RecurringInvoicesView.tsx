import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Play,
  Plus,
  RotateCcw,
  Search,
  StopCircle,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { RecurringInvoiceProfile } from '../../types';
import { RecurringInvoiceDetailsModal } from './RecurringInvoiceDetailsModal';

export const RecurringInvoicesView: React.FC = () => {
  const { recurringInvoices, addRecurringInvoice, updateRecurringInvoice, clients, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingProfile, setViewingProfile] = useState<RecurringInvoiceProfile | null>(null);

  // Modal form state
  const [profileName, setProfileName] = useState('');
  const [clientName, setClientName] = useState(clients[0]?.name || '');
  const [frequency, setFrequency] = useState<'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly'>('Monthly');
  const [amount, setAmount] = useState('3500');

  const filtered = recurringInvoices.filter(
    (p) =>
      p.profileName.toLowerCase().includes(search.toLowerCase()) ||
      p.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName) return;
    const targetClient = clientName || clients[0]?.name || 'Unassigned Customer';

    const created = addRecurringInvoice({
      profileName,
      clientName: targetClient,
      frequency,
      amount: Number(amount) || 0,
      nextRunDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: 'Active',
      autoSend: true,
    });
    if (!created) return;

    setIsModalOpen(false);
    setProfileName('');
  };

  const toggleStatus = (id: string) => {
    const target = recurringInvoices.find((p) => p.id === id);
    if (target) {
      updateRecurringInvoice(id, { status: target.status === 'Active' ? 'Paused' : 'Active' });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <RotateCcw className="w-6 h-6 text-purple-600" />
            <span>Recurring Invoices & Subscriptions</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Automate recurring client billing, retainer invoicing schedules, and subscription renewals
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Recurring Profile</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search recurring schedule or client..."
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
                <th className="p-3 pl-4">Profile Name</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Frequency</th>
                <th className="p-3">Next Invoice Date</th>
                <th className="p-3 text-right">Invoice Amount</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setViewingProfile(p)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="p-3 pl-4 font-bold text-slate-800">{p.profileName}</td>
                  <td className="p-3 font-semibold text-slate-700">{p.clientName}</td>
                  <td className="p-3 font-medium text-slate-600">
                    <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                      {p.frequency}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-slate-600">{formatDate(p.nextRunDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(p.amount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        p.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleStatus(p.id)}
                      className="text-xs font-bold text-purple-600 hover:underline cursor-pointer"
                    >
                      {p.status === 'Active' ? 'Pause Schedule' : 'Resume Schedule'}
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
              <span>New Recurring Profile</span>
            </h3>

            <form onSubmit={handleCreateRecurring} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Profile Name / Description</label>
                <input
                  type="text"
                  placeholder="e.g., Monthly Software Retainer"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer</label>
                <select
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Billing Frequency</label>
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
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <RecurringInvoiceDetailsModal
        isOpen={!!viewingProfile}
        onClose={() => setViewingProfile(null)}
        profile={viewingProfile}
        onToggleStatus={(id) => toggleStatus(id)}
      />
    </div>
  );
};
