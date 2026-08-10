import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  Edit3,
  Eye,
  FileText,
  History,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Invoice } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';
import { InvoiceEditorModal } from './InvoiceEditorModal';
import { InvoicePreviewModal } from './InvoicePreviewModal';

interface InvoicesViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  autoOpenCreateModal = false,
  onModalClosed,
}) => {
  const { invoices, settings, deleteInvoice } = useBooks();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const [isEditorOpen, setIsEditorOpen] = useState(autoOpenCreateModal);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    if (autoOpenCreateModal) {
      setIsEditorOpen(true);
    }
  }, [autoOpenCreateModal]);

  const filteredInvoices = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.clientName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.projectName && inv.projectName.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus = statusFilter === 'All' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <span>Sales Invoices</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Create tax invoices, issue payment reminders, track Accounts Receivable, and manage client balances
          </p>
        </div>

        <button
          onClick={() => {
            setEditingInvoice(null);
            setIsEditorOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 shadow-2xs transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Invoice</span>
        </button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">Total Outstanding AR</p>
          <p className="text-xl font-black font-mono text-amber-600 dark:text-amber-400 mt-1">
            {formatCurrency(
              invoices.reduce((s, i) => s + (i.status !== 'Void' ? i.balanceDue : 0), 0),
              settings.currencySymbol
            )}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Uncollected invoice balance</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">Overdue Balance</p>
          <p className="text-xl font-black font-mono text-rose-600 dark:text-rose-400 mt-1">
            {formatCurrency(
              invoices
                .filter((i) => i.status === 'Overdue' || (i.dueDate < new Date().toISOString().split('T')[0] && i.balanceDue > 0))
                .reduce((s, i) => s + i.balanceDue, 0),
              settings.currencySymbol
            )}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Past due payment date</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Draft Invoices</p>
          <p className="text-xl font-black font-mono text-slate-800 dark:text-slate-100 mt-1">
            {invoices.filter((i) => i.status === 'Draft').length}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Pending dispatch to clients</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">Total Invoiced (YTD)</p>
          <p className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 mt-1">
            {formatCurrency(
              invoices.reduce((s, i) => s + (i.status !== 'Void' ? i.totalAmount : 0), 0),
              settings.currencySymbol
            )}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">Total billing generated</p>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice #, client, project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto text-xs no-scrollbar">
          {['All', 'Sent', 'Paid', 'Partially Paid', 'Overdue', 'Draft'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors shrink-0 cursor-pointer ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Card Feed View (lg:hidden) */}
      <div className="block lg:hidden space-y-3">
        {filteredInvoices.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-400 space-y-2">
            <FileText className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">No invoices match your search</p>
          </div>
        ) : (
          filteredInvoices.map((inv) => (
            <div
              key={inv.id}
              onClick={() => setPreviewInvoice(inv)}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-2xs space-y-3 active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/80 border border-blue-100 dark:border-blue-900 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
                    {inv.clientName ? inv.clientName.charAt(0).toUpperCase() : 'I'}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{inv.clientName}</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">#{inv.invoiceNumber}</p>
                  </div>
                </div>

                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${getStatusBadgeStyle(inv.status)}`}>
                  {inv.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-medium block">Total Amount</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white">{formatCurrency(inv.totalAmount, settings.currencySymbol)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-medium block">Balance Due</span>
                  <span className="font-bold font-mono text-amber-600 dark:text-amber-400">{formatCurrency(inv.balanceDue, settings.currencySymbol)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                <span>Issued: {formatDate(inv.issueDate)}</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingInvoice(inv);
                    }}
                    className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewInvoice(inv);
                    }}
                    className="p-1.5 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 rounded-lg cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop High-Density Invoices Table (hidden lg:block) */}
      <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3 pl-4">Invoice #</th>
                <th className="p-3">Client</th>
                <th className="p-3">Project</th>
                <th className="p-3">Issue / Due Date</th>
                <th className="p-3">Total Amount</th>
                <th className="p-3">Balance Due</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => setPreviewInvoice(inv)}
                  className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                  title="Click to view full invoice bill statement"
                >
                  <td className="p-3 pl-4 font-mono font-bold text-blue-600 dark:text-blue-400 flex items-center space-x-1.5">
                    <span className="group-hover:underline">{inv.invoiceNumber}</span>
                    {inv.editHistory && inv.editHistory.length > 0 && (
                      <span
                        className="inline-flex items-center space-x-0.5 text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded border border-amber-300 dark:border-amber-700"
                        title={`${inv.editHistory.length} edit revision(s) logged`}
                      >
                        <History className="w-2.5 h-2.5" />
                        <span>Rev {inv.editHistory.length}</span>
                      </span>
                    )}
                  </td>

                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                    {inv.clientName}
                  </td>

                  <td className="p-3 text-slate-500">{inv.projectName || '-'}</td>

                  <td className="p-3 text-slate-500 space-y-0.5">
                    <div>{formatDate(inv.issueDate)}</div>
                    <div className="text-[10px] text-slate-400">Due: {formatDate(inv.dueDate)}</div>
                  </td>

                  <td className="p-3 font-bold font-mono text-slate-900 dark:text-slate-100">
                    {formatCurrency(inv.totalAmount, settings.currencySymbol)}
                  </td>

                  <td className="p-3 font-bold font-mono text-amber-600 dark:text-amber-400">
                    {formatCurrency(inv.balanceDue, settings.currencySymbol)}
                  </td>

                  <td className="p-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${getStatusBadgeStyle(
                        inv.status
                      )}`}
                    >
                      {inv.status}
                    </span>
                  </td>

                  <td className="p-3 pr-4 text-right space-x-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewInvoice(inv);
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                      title="View / Print Invoice"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingInvoice(inv);
                      }}
                      className="p-1.5 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/50 rounded-lg cursor-pointer"
                      title="Edit Invoice Details & Record Edit Reason"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete invoice ${inv.invoiceNumber}?`)) {
                          deleteInvoice(inv.id);
                        }
                      }}
                      className="p-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
                      title="Delete Invoice"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <InvoiceEditorModal
        isOpen={isEditorOpen || !!editingInvoice}
        editingInvoice={editingInvoice}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingInvoice(null);
          if (onModalClosed) onModalClosed();
        }}
        onInvoiceCreated={(createdInvoice) => setPreviewInvoice(createdInvoice)}
        onInvoiceUpdated={(updatedInvoice) => setPreviewInvoice(updatedInvoice)}
      />
      <InvoicePreviewModal
        invoice={previewInvoice}
        onClose={() => setPreviewInvoice(null)}
        onEditRequested={(invToEdit) => setEditingInvoice(invToEdit)}
      />
    </div>
  );
};
