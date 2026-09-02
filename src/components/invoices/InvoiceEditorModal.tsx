import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, FileText, History, Plus, Trash2, X } from 'lucide-react';
import { Invoice, InvoiceEditHistory, InvoiceItem, Estimate } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency } from '../../utils/formatters';
import { QuickAddClientModal } from '../common/QuickAddClientModal';
import { QuickAddProjectModal } from '../common/QuickAddProjectModal';

interface InvoiceEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingInvoice?: Invoice | null;
  onInvoiceCreated?: (invoice: Invoice) => void;
  onInvoiceUpdated?: (invoice: Invoice) => void;
  defaultProjectId?: string;
  defaultClientId?: string;
  initialClientId?: string;
  initialEstimate?: Estimate | null;
}

export const InvoiceEditorModal: React.FC<InvoiceEditorModalProps> = ({
  isOpen,
  onClose,
  editingInvoice,
  onInvoiceCreated,
  onInvoiceUpdated,
  defaultProjectId,
  defaultClientId,
  initialClientId,
  initialEstimate,
}) => {
  const { clients, projects, accounts, refreshAccounts, settings, salespersons, addInvoice, updateInvoice } = useBooks();

  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false);
  const [isQuickProjectOpen, setIsQuickProjectOpen] = useState(false);

  const [clientId, setClientId] = useState(clients[0]?.id || '');
  const [projectId, setProjectId] = useState<string>('');
  const [salespersonId, setSalespersonId] = useState<string>('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [discount, setDiscount] = useState('0');
  const [notes, setNotes] = useState('Thank you for your business.');
  const [terms, setTerms] = useState('Net 30. Please remit payment via bank transfer.');
  const [editReason, setEditReason] = useState('');
  const [formError, setFormError] = useState('');
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const revenueAccounts = useMemo(
    () =>
      accounts.filter(
        (a) =>
          ['Revenue', 'Other Income'].includes(a.type) &&
          (a.status || 'Active') === 'Active' &&
          a.allowDirectPosting !== false
      ),
    [accounts]
  );

  useEffect(() => {
    if (isOpen && refreshAccounts) {
      refreshAccounts().catch((err) => console.error('Error fetching accounts for invoice:', err));
    }
  }, [isOpen, refreshAccounts]);

  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: `item-${Date.now()}-1`,
      description: '',
      accountId: revenueAccounts[0]?.id || '',
      quantity: 1,
      unitPrice: 0,
      taxRate: settings.defaultTaxRate,
      amount: 0,
    },
  ]);

  const isDirty = useMemo(() => {
    if (!isOpen) return false;
    if (editingInvoice) {
      if (editReason.trim() !== '') return true;
      if (clientId !== (editingInvoice.clientId || '')) return true;
      if (projectId !== (editingInvoice.projectId || '')) return true;
      if (salespersonId !== (editingInvoice.salespersonId || '')) return true;
      if (issueDate !== (editingInvoice.issueDate || '')) return true;
      if (dueDate !== (editingInvoice.dueDate || '')) return true;
      if (discount !== String(editingInvoice.discount || 0)) return true;
      if (notes !== (editingInvoice.notes || '')) return true;
      if (terms !== (editingInvoice.terms || '')) return true;
      return false;
    } else {
      if (items.some((it) => it.description.trim() || Number(it.unitPrice) > 0)) return true;
      if (notes !== 'Thank you for your business.') return true;
      if (terms !== 'Net 30. Please remit payment via bank transfer.') return true;
      if (discount !== '0') return true;
      if (salespersonId !== '') return true;
      return false;
    }
  }, [isOpen, editingInvoice, editReason, clientId, projectId, salespersonId, issueDate, dueDate, discount, notes, terms, items]);

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  useEffect(() => {
    setShowDiscardConfirm(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (editingInvoice) {
      setClientId(editingInvoice.clientId || clients[0]?.id || '');
      setProjectId(editingInvoice.projectId || '');
      setSalespersonId(editingInvoice.salespersonId || '');
      setIssueDate(editingInvoice.issueDate || new Date().toISOString().split('T')[0]);
      setDueDate(editingInvoice.dueDate || new Date().toISOString().split('T')[0]);
      setDiscount(String(editingInvoice.discount || 0));
      setNotes(editingInvoice.notes || '');
      setTerms(editingInvoice.terms || '');
      setItems(
        editingInvoice.items && editingInvoice.items.length > 0
          ? editingInvoice.items
          : [
              {
                id: `item-${Date.now()}-1`,
                description: 'Service',
                accountId: revenueAccounts[0]?.id || '',
                quantity: 1,
                unitPrice: 0,
                taxRate: settings.defaultTaxRate,
                amount: 0,
              },
            ]
      );
      setEditReason('');
    } else if (initialEstimate) {
      setClientId(initialEstimate.clientId || clients[0]?.id || '');
      setProjectId(initialEstimate.projectId || '');
      setSalespersonId(initialEstimate.salespersonId || '');
      setIssueDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setDiscount('0');
      setNotes(initialEstimate.notes || `Converted from Quote #${initialEstimate.estimateNumber}`);
      setTerms('Net 30. Please remit payment via bank transfer.');
      setItems(
        initialEstimate.items && initialEstimate.items.length > 0
          ? initialEstimate.items.map((it, idx) => ({ ...it, id: `item-${Date.now()}-${idx + 1}` }))
          : [
              {
                id: `item-${Date.now()}-1`,
                description: 'Service',
                accountId: revenueAccounts[0]?.id || '',
                quantity: 1,
                unitPrice: 0,
                taxRate: settings.defaultTaxRate,
                amount: 0,
              },
            ]
      );
      setEditReason('');
    } else {
      const targetProj = projects.find((p) => p.id === defaultProjectId);
      const resolvedClientId = initialClientId || defaultClientId || targetProj?.clientId || clients[0]?.id || '';
      setClientId(resolvedClientId);
      setProjectId(defaultProjectId || '');
      setSalespersonId('');
      setIssueDate(new Date().toISOString().split('T')[0]);
      setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setDiscount('0');
      setNotes('Thank you for your business.');
      setTerms('Net 30. Please remit payment via bank transfer.');
      setItems([
        {
          id: `item-${Date.now()}-1`,
          description: targetProj
            ? `Professional Services - ${targetProj.name} (${targetProj.code})`
            : '',
          accountId: revenueAccounts[0]?.id || '',
          quantity: 1,
          unitPrice: 0,
          taxRate: settings.defaultTaxRate,
          amount: 0,
        },
      ]);
      setEditReason('');
    }
  }, [editingInvoice, isOpen, defaultProjectId, defaultClientId, initialClientId, initialEstimate]);

  if (!isOpen) return null;

  const handleItemChange = (
    index: number,
    field: keyof InvoiceItem,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updated.amount = Number(updated.quantity) * Number(updated.unitPrice);
        }
        return updated;
      })
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${prev.length + 1}`,
        description: '',
        accountId: revenueAccounts[0]?.id || '',
        quantity: 1,
        unitPrice: 0,
        taxRate: settings.defaultTaxRate,
        amount: 0,
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  const taxTotal = items.reduce(
    (sum, item) => sum + Math.round((item.amount || 0) * ((item.taxRate || 0) / 100)),
    0
  );
  const totalAmount = Math.max(0, subtotal + taxTotal - Number(discount));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    const selectedClient = clients.find((c) => c.id === clientId);
    const selectedProject = projects.find((p) => p.id === projectId);
    const selectedSalesperson = salespersons.find((s) => s.id === salespersonId);

    const clientDisplayName = selectedClient?.companyName
      ? `${selectedClient.companyName} (${selectedClient.name})`
      : selectedClient?.name || 'Client';

    if (editingInvoice) {
      setFormError('Posted invoices are immutable. Use a credit note or void-and-reissue workflow.');
      return;
      if (!editReason.trim()) {
        setFormError('Please provide a reason for editing this invoice to maintain the audit log.');
        return;
      }
      setFormError('');

      const historyLog: InvoiceEditHistory = {
        id: `edit-${Date.now()}`,
        editedAt: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        editedBy: 'Accounting Admin',
        reason: editReason.trim(),
        previousTotal: editingInvoice.totalAmount,
        newTotal: totalAmount,
        changesSummary: `Invoice updated. Amount changed from ${formatCurrency(
          editingInvoice.totalAmount,
          settings.currencySymbol
        )} to ${formatCurrency(totalAmount, settings.currencySymbol)}.`,
      };

      const newBalanceDue = Math.max(0, totalAmount - editingInvoice.paidAmount);
      const updatedStatus =
        newBalanceDue === 0
          ? 'Paid'
          : editingInvoice.paidAmount > 0
          ? 'Partially Paid'
          : editingInvoice.status;

      const updatedInvoice: Invoice = {
        ...editingInvoice,
        clientId,
        clientName: clientDisplayName,
        clientEmail: selectedClient?.email || editingInvoice.clientEmail,
        projectId: projectId || undefined,
        projectName: selectedProject?.name || undefined,
        salespersonId: salespersonId || undefined,
        salespersonName: selectedSalesperson?.name || undefined,
        issueDate,
        dueDate,
        items,
        subtotal,
        taxTotal,
        discount: Number(discount) || 0,
        totalAmount,
        balanceDue: newBalanceDue,
        status: updatedStatus,
        notes,
        terms,
        editHistory: [...(editingInvoice.editHistory || []), historyLog],
      };

      updateInvoice(editingInvoice.id, updatedInvoice);

      onClose();
      if (onInvoiceUpdated) {
        onInvoiceUpdated(updatedInvoice);
      }
    } else {
      try {
      const newInvoice = await addInvoice({
        clientId,
        clientName: clientDisplayName,
        clientEmail: selectedClient?.email || '',
        projectId: projectId || undefined,
        projectName: selectedProject?.name || undefined,
        salespersonId: salespersonId || undefined,
        salespersonName: selectedSalesperson?.name || undefined,
        issueDate,
        dueDate,
        items,
        subtotal,
        taxTotal,
        discount: Number(discount) || 0,
        totalAmount,
        paidAmount: 0,
        balanceDue: totalAmount,
        status: 'Sent',
        notes,
        terms,
      });

      onClose();
      if (onInvoiceCreated) {
        onInvoiceCreated(newInvoice);
      }
      } catch (error: any) {
        setFormError(error.message || 'Invoice could not be posted');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
              {editingInvoice ? `Edit Invoice (${editingInvoice.invoiceNumber})` : 'Create New Sales Invoice'}
            </h3>
            {editingInvoice && (
              <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                Revision Mode
              </span>
            )}
          </div>
          <button onClick={handleRequestClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-5 text-xs">
          {formError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-semibold flex items-center justify-between">
              <span>{formError}</span>
              <button type="button" onClick={() => setFormError('')} className="p-1 hover:bg-rose-100 rounded">
                ✕
              </button>
            </div>
          )}
          {/* Reason for edit block if editing */}
          {editingInvoice && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
              <label className="block font-bold text-amber-800 dark:text-amber-300 text-xs flex items-center space-x-1.5">
                <History className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Reason for Edit * (Required for History Audit Log)</span>
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="e.g. Revised line item units per client request, updated billable consulting rate, or added negotiated discount."
                required
                rows={2}
                className="w-full bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/60 rounded-lg p-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Previous Total: <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">{formatCurrency(editingInvoice.totalAmount, settings.currencySymbol)}</span>. This edit reason and change history will be saved in the invoice audit trail.
              </p>
            </div>
          )}

          {/* Header Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-slate-600 dark:text-slate-300 font-medium">
                  Select Client *
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickClientOpen(true)}
                  className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Client</span>
                </button>
              </div>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName} ({c.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-slate-600 dark:text-slate-300 font-medium">
                  Sales Person (Optional)
                </label>
              </div>
              <select
                value={salespersonId}
                onChange={(e) => setSalespersonId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                <option value="">-- Select Sales Person --</option>
                {salespersons.map((sp) => (
                  <option key={sp.id} value={sp.id}>
                    {sp.name} ({sp.commissionRate}% comm.)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-slate-600 dark:text-slate-300 font-medium">
                  Link Project (Optional)
                </label>
                <button
                  type="button"
                  onClick={() => setIsQuickProjectOpen(true)}
                  className="text-blue-600 dark:text-blue-400 font-bold hover:underline text-[11px] flex items-center space-x-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New Project</span>
                </button>
              </div>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              >
                <option value="">-- No Project Link --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Invoice Issue Date
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                Payment Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-slate-800 dark:text-slate-200 font-bold">
                Invoice Line Items
              </label>
              <button
                type="button"
                onClick={addItem}
                className="text-blue-600 dark:text-blue-400 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-500 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Description</th>
                    <th className="p-2.5 w-32">Account</th>
                    <th className="p-2.5 w-20">Qty</th>
                    <th className="p-2.5 w-24">Price ({settings.currencySymbol})</th>
                    <th className="p-2.5 w-20">Tax %</th>
                    <th className="p-2.5 w-24">Amount</th>
                    <th className="p-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((item, idx) => (
                    <tr key={item.id}>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                          placeholder="Item or service detail"
                          required
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs text-slate-800 dark:text-slate-200"
                        />
                      </td>

                      <td className="p-2">
                        <select
                          value={item.accountId}
                          onChange={(e) => handleItemChange(idx, 'accountId', e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-[11px] text-slate-800 dark:text-slate-200"
                        >
                          {revenueAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code ? `${a.code} — ${a.name}` : a.name}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          step="0.1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                          required
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs text-slate-800 dark:text-slate-200"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                          required
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs text-slate-800 dark:text-slate-200"
                        />
                      </td>

                      <td className="p-2">
                        <input
                          type="number"
                          value={item.taxRate}
                          onChange={(e) => handleItemChange(idx, 'taxRate', Number(e.target.value))}
                          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-1.5 text-xs text-slate-800 dark:text-slate-200"
                        />
                      </td>

                      <td className="p-2 font-bold font-mono text-slate-900 dark:text-slate-100">
                        {formatCurrency(item.amount, settings.currencySymbol)}
                      </td>

                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
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

          {/* Totals Summary */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="space-y-3 w-full sm:w-1/2">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>

            <div className="w-full sm:w-64 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Subtotal:</span>
                <span className="font-semibold font-mono">{formatCurrency(subtotal, settings.currencySymbol)}</span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Tax Total:</span>
                <span className="font-semibold font-mono">{formatCurrency(taxTotal, settings.currencySymbol)}</span>
              </div>

              <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                <span>Discount ({settings.currencySymbol}):</span>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-1 text-right font-semibold font-mono"
                />
              </div>

              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                <span>Total Amount:</span>
                <span className="text-blue-600 dark:text-blue-400 font-mono">{formatCurrency(totalAmount, settings.currencySymbol)}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-2">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-sm cursor-pointer flex items-center space-x-1.5"
            >
              {editingInvoice ? (
                <>
                  <Edit3 className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Create Invoice</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {showDiscardConfirm && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 max-w-sm w-full shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Unsaved Changes</h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              You have unsaved changes on this invoice. Are you sure you want to discard them?
            </p>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickAddClientModal
        isOpen={isQuickClientOpen}
        onClose={() => setIsQuickClientOpen(false)}
        currencyCode={settings.currencyCode}
        onClientCreated={(newCli) => {
          setClientId(newCli.id);
        }}
      />

      <QuickAddProjectModal
        isOpen={isQuickProjectOpen}
        onClose={() => setIsQuickProjectOpen(false)}
        currencyCode={settings.currencyCode}
        defaultClientId={clientId}
        onProjectCreated={(newPrj) => {
          setProjectId(newPrj.id);
          if (newPrj.clientId) {
            setClientId(newPrj.clientId);
          }
        }}
      />
    </div>
  );
};
