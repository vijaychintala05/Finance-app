import React, { useState, useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  CreditCard,
  DollarSign,
  FileSpreadsheet,
  FileText,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  TrendingDown,
  User,
  Wallet,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { CreditNote } from '../../types';
import { CreditNoteDetailsModal } from './CreditNoteDetailsModal';
import { ApplyCreditNoteModal } from './ApplyCreditNoteModal';
import { RecordRefundModal } from './RecordRefundModal';

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
  const { creditNotes, addCreditNote, invoices, clients, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingNote, setViewingNote] = useState<CreditNote | null>(null);
  const [applyNote, setApplyNote] = useState<CreditNote | null>(null);
  const [refundNote, setRefundNote] = useState<CreditNote | null>(null);

  // Form State for Creation
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reasonCategory, setReasonCategory] = useState('Sales Return');
  const [customReason, setCustomReason] = useState('');
  const [issueDate, setIssueDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsCreateModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = creditNotes.find(
        (cn) => cn.id === selectedEntityId || cn.cnNumber === selectedEntityId
      );
      if (found) {
        setViewingNote(found);
      }
    }
  }, [selectedEntityId, creditNotes]);

  // Client invoices for linking
  const clientInvoices = useMemo(() => {
    if (!selectedClientId) return [];
    return invoices.filter((inv) => inv.clientId === selectedClientId);
  }, [selectedClientId, invoices]);

  // Handle client selection
  const handleClientChange = (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedInvoiceId('');
    setAmount('');
  };

  // Handle invoice selection
  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    const foundInv = invoices.find((i) => i.id === invId);
    if (foundInv && foundInv.balanceDue) {
      setAmount(foundInv.balanceDue.toString());
    } else if (foundInv) {
      setAmount(foundInv.total.toString());
    }
  };

  // KPI calculations
  const kpis = useMemo(() => {
    let totalIssued = 0;
    let unusedCredit = 0;
    let openCount = 0;
    let closedCount = 0;

    for (const cn of creditNotes) {
      const tot = Number(cn.totalAmount) || 0;
      const rem = Number(cn.remainingAmount ?? cn.totalAmount) || 0;
      totalIssued += tot;
      unusedCredit += rem;
      if (cn.status === 'Open' && rem > 0) {
        openCount++;
      } else {
        closedCount++;
      }
    }

    const appliedOrRefunded = Math.max(0, totalIssued - unusedCredit);

    return {
      totalIssued,
      unusedCredit,
      appliedOrRefunded,
      openCount,
      closedCount,
      totalCount: creditNotes.length,
    };
  }, [creditNotes]);

  // Filtered List
  const filtered = useMemo(() => {
    return creditNotes.filter(
      (cn) =>
        cn.cnNumber.toLowerCase().includes(search.toLowerCase()) ||
        cn.clientName.toLowerCase().includes(search.toLowerCase()) ||
        (cn.originalInvoiceNumber &&
          cn.originalInvoiceNumber.toLowerCase().includes(search.toLowerCase())) ||
        (cn.reason && cn.reason.toLowerCase().includes(search.toLowerCase()))
    );
  }, [creditNotes, search]);

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const targetClient = clients.find((c) => c.id === selectedClientId);
    if (!targetClient) {
      setFormError('Please select a valid customer.');
      return;
    }

    const totalAmt = parseFloat(amount);
    if (isNaN(totalAmt) || totalAmt <= 0) {
      setFormError('Please enter a positive credit amount.');
      return;
    }

    const targetInv = invoices.find((i) => i.id === selectedInvoiceId);

    const finalReason = customReason.trim()
      ? `${reasonCategory}: ${customReason.trim()}`
      : reasonCategory;

    setIsSubmitting(true);
    try {
      await addCreditNote({
        cnNumber: `CN-${new Date().getFullYear()}-${String(creditNotes.length + 1).padStart(4, '0')}`,
        clientName: targetClient.name,
        originalInvoiceNumber: targetInv?.invoiceNumber || 'N/A',
        issueDate,
        totalAmount: totalAmt,
        remainingAmount: totalAmt,
        status: 'Open',
        reason: finalReason,
      });

      setIsCreateModalOpen(false);
      setSelectedClientId('');
      setSelectedInvoiceId('');
      setAmount('');
      setCustomReason('');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create credit note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <DollarSign className="w-6 h-6 text-rose-600" />
            <span>Credit Notes & Adjustments</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Issue customer credit memos, allocate to outstanding invoices, or process direct refunds
          </p>
        </div>

        <button
          onClick={() => {
            setSelectedClientId(clients[0]?.id || '');
            setIsCreateModalOpen(true);
          }}
          className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Credit Note</span>
        </button>
      </div>

      {/* KPI Metric Summary Cards (Zoho Books Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Credits Issued</span>
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
              {formatCurrency(kpis.totalIssued, settings.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              {kpis.totalCount} notes
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/50 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Available / Unused</span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
              {formatCurrency(kpis.unusedCredit, settings.currencySymbol)}
            </span>
            <span className="text-[11px] text-rose-500/80 font-medium">
              {kpis.openCount} open
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Applied to Invoices</span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black font-mono text-blue-600 dark:text-blue-400">
              {formatCurrency(kpis.appliedOrRefunded, settings.currencySymbol)}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">settled</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Settled / Closed</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-400">
              {kpis.closedCount}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">completed</span>
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-4">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search credit note #, customer, reference invoice, reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="mobile-record-table w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Credit Note #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Ref Invoice #</th>
                <th className="p-3">Issue Date</th>
                <th className="p-3 text-right">Credit Amount</th>
                <th className="p-3 text-right">Unused Balance</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No credit notes found.
                  </td>
                </tr>
              ) : (
                filtered.map((cn) => {
                  const remaining = cn.remainingAmount ?? cn.totalAmount;
                  const canApplyOrRefund =
                    cn.status === 'Open' &&
                    remaining > 0 &&
                    (cn.status as any) !== 'Void' &&
                    (cn.status as any) !== 'Reversed';

                  return (
                    <tr
                      key={cn.id}
                      onClick={() => setViewingNote(cn)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    >
                      <td className="p-3 pl-4 font-mono font-bold text-rose-600 dark:text-rose-400">
                        {cn.cnNumber}
                      </td>
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                        {cn.clientName}
                      </td>
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                        {cn.originalInvoiceNumber || '—'}
                      </td>
                      <td className="p-3 text-slate-500 dark:text-slate-400">
                        {formatDate(cn.issueDate)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(cn.totalAmount, settings.currencySymbol)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrency(remaining, settings.currencySymbol)}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            cn.status === 'Open'
                              ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {cn.status}
                        </span>
                      </td>
                      <td
                        className="p-3 text-right pr-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canApplyOrRefund ? (
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => setApplyNote(cn)}
                              title="Apply credits to open customer invoices"
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center space-x-1"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span>Apply</span>
                            </button>
                            <button
                              onClick={() => setRefundNote(cn)}
                              title="Refund unused credit to bank/cash"
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 text-[11px] font-bold transition-colors cursor-pointer flex items-center space-x-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Refund</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Fully Settled
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE CREDIT NOTE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    New Credit Note
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Create an authoritative customer credit memo
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-2 rounded-full hover:bg-slate-200/60 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Customer Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Customer *
                </label>
                <select
                  required
                  value={selectedClientId}
                  onChange={(e) => handleClientChange(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">Select Customer</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Reference Invoice */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reference Invoice (Optional)
                </label>
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => handleInvoiceChange(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="">None (Standalone Credit Note)</option>
                  {clientInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} · {formatCurrency(inv.total, settings.currencySymbol)} (Due: {formatCurrency(inv.balanceDue, settings.currencySymbol)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Credit Amount *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono text-xs">
                      {settings.currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-8 pr-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Issue Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Statutory Reason (Zoho Books Style) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Reason for Issuing Credit Note *
                </label>
                <select
                  value={reasonCategory}
                  onChange={(e) => setReasonCategory(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                >
                  <option value="Sales Return">01 - Sales Return (Goods returned)</option>
                  <option value="Post Sale Discount">02 - Post Sale Discount (Price concession)</option>
                  <option value="Deficiency in Services">03 - Deficiency in Services</option>
                  <option value="Correction in Invoice">04 - Correction in Invoice</option>
                  <option value="Change in Place of Supply">05 - Change in Place of Supply</option>
                  <option value="Other / Customer Allowance">06 - Other / Customer Allowance</option>
                </select>
              </div>

              {/* Additional notes / particulars */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Additional Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Return of damaged units per RMA #412"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Action buttons */}
              <div className="pt-2 flex justify-end items-center space-x-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center space-x-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span>Create Credit Note</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      <CreditNoteDetailsModal
        isOpen={!!viewingNote}
        onClose={() => {
          setViewingNote(null);
          if (onSelectedEntityClosed) onSelectedEntityClosed();
        }}
        note={viewingNote}
      />

      {/* APPLY TO INVOICES MODAL */}
      <ApplyCreditNoteModal
        isOpen={!!applyNote}
        onClose={() => setApplyNote(null)}
        creditNote={applyNote}
        onSuccess={() => setApplyNote(null)}
      />

      {/* RECORD REFUND MODAL */}
      <RecordRefundModal
        isOpen={!!refundNote}
        onClose={() => setRefundNote(null)}
        creditNote={refundNote}
        onSuccess={() => setRefundNote(null)}
      />
    </div>
  );
};
