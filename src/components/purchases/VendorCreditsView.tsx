import React, { useState } from 'react';
import {
  DollarSign,
  Eye,
  Plus,
  Receipt,
  Search,
  X,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { VendorCredit } from '../../types';

interface VendorCreditsViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const VendorCreditsView: React.FC<VendorCreditsViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { vendorCredits, addVendorCredit, updateVendorCredit, vendors, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingCredit, setViewingCredit] = useState<VendorCredit | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = vendorCredits.find(
        (c) => c.id === selectedEntityId || c.creditNoteNumber === selectedEntityId
      );
      if (found) {
        setViewingCredit(found);
      }
    }
  }, [selectedEntityId, vendorCredits]);

  // Form state
  const [vendorName, setVendorName] = useState(vendors[0]?.name || 'AWS Cloud Services');
  const [billNum, setBillNum] = useState('BILL-2026-001');
  const [amount, setAmount] = useState('750');
  const [notes, setNotes] = useState('');

  const filtered = vendorCredits.filter(
    (c) =>
      c.creditNoteNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      c.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.notes.toLowerCase().includes(search.toLowerCase())
  );

  const handleCloseCreateModal = () => {
    setIsModalOpen(false);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const handleCloseDetailModal = () => {
    setViewingCredit(null);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const handleCreateCredit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetVendor = vendorName || vendors[0]?.name || 'Unassigned Vendor';

    const creditAmt = Number(amount) || 0;
    addVendorCredit({
      creditNoteNumber: `VCR-2026-00${vendorCredits.length + 1}`,
      vendorName: targetVendor,
      billNumber: billNum || 'N/A',
      issueDate: new Date().toISOString().split('T')[0],
      creditAmount: creditAmt,
      remainingAmount: creditAmt,
      status: 'Open',
      notes: notes || 'Vendor debit note credit',
    });

    setIsModalOpen(false);
    setNotes('');
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const getStatusBadge = (status: VendorCredit['status']) => {
    switch (status) {
      case 'Open':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Partially Applied':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Fully Applied':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      case 'Refunded':
        return 'bg-purple-100 text-purple-800 border-purple-200';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <DollarSign className="w-6 h-6 text-rose-600" />
            <span>Vendor Credits & Debit Memos</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage vendor credit memos, price adjustment claims, return refunds, and offset credits against future bills
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Vendor Credit</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search credit #, vendor, bill #, notes..."
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
                <th className="p-3 pl-4">Credit Note #</th>
                <th className="p-3">Vendor Name</th>
                <th className="p-3">Ref Bill #</th>
                <th className="p-3">Issue Date</th>
                <th className="p-3 text-right">Credit Amount</th>
                <th className="p-3 text-right">Available Balance</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td
                    onClick={() => setViewingCredit(c)}
                    className="p-3 pl-4 font-mono font-bold text-rose-600 cursor-pointer hover:underline"
                  >
                    {c.creditNoteNumber}
                  </td>
                  <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{c.vendorName}</td>
                  <td className="p-3 font-mono font-bold text-amber-600 dark:text-amber-400">{c.billNumber}</td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">{formatDate(c.issueDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(c.creditAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(c.remainingAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4 space-x-2">
                    <button
                      onClick={() => setViewingCredit(c)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      View
                    </button>
                    {c.remainingAmount > 0 && (
                      <button
                        onClick={() => {
                          updateVendorCredit(c.id, { remainingAmount: 0, status: 'Fully Applied' });
                        }}
                        className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Apply to Bill
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Credit Detail Modal */}
      {viewingCredit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Vendor Credit: <span className="font-mono">{viewingCredit.creditNoteNumber}</span>
                </h3>
              </div>
              <button
                onClick={handleCloseDetailModal}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Vendor Name</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{viewingCredit.vendorName}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Credit Amount</span>
                <p className="font-mono font-bold text-rose-600 dark:text-rose-400">
                  {formatCurrency(viewingCredit.creditAmount, settings.currencySymbol)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Issue Date</span>
                <p className="font-medium text-slate-700 dark:text-slate-300">{formatDate(viewingCredit.issueDate)}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Available Balance</span>
                <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(viewingCredit.remainingAmount, settings.currencySymbol)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Reference Bill</span>
                <p className="font-mono text-slate-700 dark:text-slate-300">{viewingCredit.billNumber}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Status</span>
                <p className="font-bold text-slate-700 dark:text-slate-300">{viewingCredit.status}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Reason & Notes</span>
              <p className="text-xs text-slate-700 dark:text-slate-300">{viewingCredit.notes || 'No notes.'}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleCloseDetailModal}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-rose-600" />
              <span>Issue Vendor Credit Memo</span>
            </h3>

            <form onSubmit={handleCreateCredit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vendor / Supplier</label>
                <select
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ref Bill #</label>
                <input
                  type="text"
                  placeholder="e.g. BILL-2026-001"
                  value={billNum}
                  onChange={(e) => setBillNum(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Credit Amount ({settings.currencySymbol})</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason / Return Notes</label>
                <textarea
                  rows={2}
                  placeholder="Reason for vendor credit memo or price reduction..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer transition-colors"
                >
                  Save Credit Memo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
