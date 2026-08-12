import React, { useState } from 'react';
import {
  DollarSign,
  FileSpreadsheet,
  Plus,
  Search,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { CreditNote } from '../../types';
import { CreditNoteDetailsModal } from './CreditNoteDetailsModal';

interface CreditNotesViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const CreditNotesView: React.FC<CreditNotesViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { creditNotes, addCreditNote, updateCreditNote, invoices, clients, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingNote, setViewingNote] = useState<CreditNote | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = creditNotes.find((cn) => cn.id === selectedEntityId || cn.cnNumber === selectedEntityId);
      if (found) {
        setViewingNote(found);
      }
    }
  }, [selectedEntityId, creditNotes]);

  // Modal form
  const [clientName, setClientName] = useState(clients[0]?.name || '');
  const [invoiceNum, setInvoiceNum] = useState(invoices[0]?.invoiceNumber || 'INV-2026-001');
  const [amount, setAmount] = useState('850');
  const [reason, setReason] = useState('');

  const filtered = creditNotes.filter(
    (cn) =>
      cn.cnNumber.toLowerCase().includes(search.toLowerCase()) ||
      cn.clientName.toLowerCase().includes(search.toLowerCase()) ||
      cn.originalInvoiceNumber.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    const targetClient = clientName || clients[0]?.name || 'Unassigned Customer';

    const created = addCreditNote({
      cnNumber: `CN-2026-00${creditNotes.length + 1}`,
      clientName: targetClient,
      originalInvoiceNumber: invoiceNum || 'N/A',
      issueDate: new Date().toISOString().split('T')[0],
      totalAmount: Number(amount) || 0,
      remainingAmount: Number(amount) || 0,
      status: 'Open',
      reason: reason || 'Customer credit allowance',
    });
    if (!created) return;

    setIsModalOpen(false);
    setReason('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <DollarSign className="w-6 h-6 text-rose-600" />
            <span>Credit Notes & Memos</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Issue customer credit memos, manage invoice write-offs, and apply credits to future bills
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Credit Note</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search credit note #, client, invoice #..."
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
                <th className="p-3">Customer</th>
                <th className="p-3">Ref Invoice #</th>
                <th className="p-3">Issue Date</th>
                <th className="p-3 text-right">Credit Amount</th>
                <th className="p-3 text-right">Unused Credit</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((cn) => (
                <tr
                  key={cn.id}
                  onClick={() => setViewingNote(cn)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="p-3 pl-4 font-mono font-bold text-rose-600">{cn.cnNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{cn.clientName}</td>
                  <td className="p-3 font-mono text-slate-600">{cn.originalInvoiceNumber}</td>
                  <td className="p-3 text-slate-500">{formatDate(cn.issueDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(cn.totalAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-rose-600">
                    {formatCurrency(cn.remainingAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        cn.status === 'Open'
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {cn.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                    {cn.status === 'Open' && (
                      <button
                        onClick={() => {
                          updateCreditNote(cn.id, { remainingAmount: 0, status: 'Closed' });
                        }}
                        className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                      >
                        Apply / Refund
                      </button>
                    )}
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
              <DollarSign className="w-5 h-5 text-rose-600" />
              <span>Create New Credit Note</span>
            </h3>

            <form onSubmit={handleCreateNote} className="space-y-3">
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Original Invoice #</label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-001"
                  value={invoiceNum}
                  onChange={(e) => setInvoiceNum(e.target.value)}
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Reason for Credit</label>
                <textarea
                  rows={3}
                  placeholder="Reason for discount, SLA credit, or returned items..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  required
                />
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
                  Issue Credit Note
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CreditNoteDetailsModal
        isOpen={!!viewingNote}
        onClose={() => {
          setViewingNote(null);
          if (onSelectedEntityClosed) onSelectedEntityClosed();
        }}
        note={viewingNote}
      />
    </div>
  );
};
