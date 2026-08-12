import React, { useState } from 'react';
import {
  FileText,
  Plus,
  Receipt,
  Search,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Bill } from '../../types';
import { BillDetailsModal } from './BillDetailsModal';

interface BillsViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const BillsView: React.FC<BillsViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { bills, addBill, vendors, accounts, settings } = useBooks();
  const expenseAccounts = React.useMemo(
    () => accounts.filter((account) => account.type === 'Expense' && account.status !== 'Inactive'),
    [accounts]
  );

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal, onModalClosed]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = bills.find((b) => b.id === selectedEntityId || b.billNumber === selectedEntityId);
      if (found) {
        setViewingBill(found);
      }
    }
  }, [selectedEntityId, bills]);

  // Form
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [expenseAccountId, setExpenseAccountId] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (!vendorId && vendors[0]) setVendorId(vendors[0].id);
  }, [vendorId, vendors]);

  React.useEffect(() => {
    if (!expenseAccountId && expenseAccounts[0]) setExpenseAccountId(expenseAccounts[0].id);
  }, [expenseAccountId, expenseAccounts]);

  const openCreateModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setVendorId(vendors[0]?.id || '');
    setExpenseAccountId(expenseAccounts[0]?.id || '');
    setBillDate(today);
    setDueDate(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setAmount('');
    setNotes('');
    setFormError('');
    setIsSubmitting(false);
    setIsModalOpen(true);
  };

  const filtered = bills.filter(
    (b) =>
      b.billNumber.toLowerCase().includes(search.toLowerCase()) ||
      b.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      b.notes.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetVendor = vendors.find((vendor) => vendor.id === vendorId);
    const expenseAccount = expenseAccounts.find((account) => account.id === expenseAccountId);
    const parsedAmount = Number(amount);
    setFormError('');
    if (!targetVendor || !expenseAccount) {
      setFormError('Select a persisted vendor and an active expense account.');
      return;
    }
    if (dueDate < billDate) {
      setFormError('Due date cannot precede the bill date.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 1e-7) {
      setFormError('Amount must be positive and contain no more than two decimal places.');
      return;
    }

    setIsSubmitting(true);
    try {
    await addBill({
      billNumber: '',
      vendorName: targetVendor.companyName || targetVendor.name,
      billDate,
      dueDate,
      totalAmount: parsedAmount,
      amountPaid: 0,
      status: 'Unpaid',
      notes: notes.trim(),
      vendorId: targetVendor.id,
      expenseAccountId: expenseAccount.id,
    });

    setIsModalOpen(false);
    setAmount('');
    setNotes('');
    } catch (error: any) {
      setFormError(error.message || 'Bill could not be posted. No financial data was changed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: Bill['status']) => {
    switch (status) {
      case 'Unpaid':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Partially Paid':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Paid':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Overdue':
        return 'bg-rose-100 text-rose-800 border-rose-200';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <FileText className="w-6 h-6 text-amber-600" />
            <span>Vendor Bills (Accounts Payable)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track received vendor invoices, due dates, outstanding liabilities, and bill payment statuses
          </p>
        </div>

        <button
          onClick={openCreateModal}
          disabled={vendors.length === 0 || expenseAccounts.length === 0}
          title={vendors.length === 0 || expenseAccounts.length === 0 ? 'Create a vendor and expense account before recording a bill' : 'Record a vendor bill'}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Bill</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search bill #, vendor, notes..."
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
                <th className="p-3 pl-4">Bill #</th>
                <th className="p-3">Vendor Name</th>
                <th className="p-3">Bill Date</th>
                <th className="p-3">Due Date</th>
                <th className="p-3 text-right">Bill Amount</th>
                <th className="p-3 text-right">Balance Due</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setViewingBill(b)}
                  className="hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <td className="p-3 pl-4 font-mono font-bold text-amber-600">{b.billNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{b.vendorName}</td>
                  <td className="p-3 text-slate-500">{formatDate(b.billDate)}</td>
                  <td className="p-3 text-slate-500">{formatDate(b.dueDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(b.totalAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-amber-600">
                    {formatCurrency(b.totalAmount - b.amountPaid, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadge(b.status)}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                    {b.status !== 'Paid' && (
                      <button
                        disabled
                        title="Vendor payment posting is not enabled yet"
                        className="text-xs font-bold text-slate-400 cursor-not-allowed"
                      >
                        Payment workflow pending
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
              <FileText className="w-5 h-5 text-amber-600" />
              <span>Record Vendor Bill</span>
            </h3>

            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              The bill, accounts-payable journal, balance, document number, and audit record commit atomically.
            </p>

            {formError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{formError}</p>}

            <form onSubmit={handleCreateBill} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Vendor / Supplier</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Expense Account</label>
                <select required value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium">
                  {expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
                </select>
              </div>

              <p className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-500 dark:bg-slate-800">The internal bill number is allocated by the server when this posting commits.</p>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Bill Date</label><input required type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium" /></div>
                <div><label className="block text-xs font-bold text-slate-700 mb-1">Due Date</label><input required type="date" min={billDate} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium" /></div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Total Amount ({settings.currencySymbol})</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bill Notes / Particulars</label>
                <textarea
                  rows={2}
                  placeholder="Details regarding received inventory or service billed..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer transition-colors"
                >
                  {isSubmitting ? 'Posting…' : 'Post Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Bill Details Modal */}
      <BillDetailsModal
        isOpen={!!viewingBill}
        onClose={() => {
          setViewingBill(null);
          if (onSelectedEntityClosed) onSelectedEntityClosed();
        }}
        bill={viewingBill}
      />
    </div>
  );
};
