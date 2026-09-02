import React, { useState } from 'react';
import {
  CreditCard,
  FileText,
  Plus,
  Receipt,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Bill } from '../../types';
import { BillDetailsModal } from './BillDetailsModal';
import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';
import { AccountModal } from '../coa/AccountModal';

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
  const { bills, addBill, vendors, accounts, refreshAccounts, settings } = useBooks();
  const expenseAccounts = React.useMemo(
    () =>
      accounts.filter(
        (account) =>
          ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(account.type) &&
          (account.status || 'Active') === 'Active' &&
          account.allowDirectPosting !== false
      ),
    [accounts]
  );

  const [search, setSearch] = useState('');
  const deferredSearch = React.useDeferredValue(search);
  const filtered = React.useMemo(() => {
    const q = deferredSearch.toLowerCase().trim();
    if (!q) return bills;
    return bills.filter(
      (b) =>
        (b.billNumber && b.billNumber.toLowerCase().includes(q)) ||
        (b.vendorName && b.vendorName.toLowerCase().includes(q)) ||
        (b.notes && b.notes.toLowerCase().includes(q))
    );
  }, [bills, deferredSearch]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingBill, setViewingBill] = useState<Bill | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<Bill | null>(null);

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
  const [isRefreshingAccounts, setIsRefreshingAccounts] = useState(false);
  const [isAddAccountModalOpen, setIsAddAccountModalOpen] = useState(false);

  const handleRefreshAccounts = async () => {
    if (!refreshAccounts) return;
    setIsRefreshingAccounts(true);
    try {
      await refreshAccounts();
    } catch (err) {
      console.error('Failed to refresh accounts in BillsView:', err);
    } finally {
      setIsRefreshingAccounts(false);
    }
  };

  React.useEffect(() => {
    if (isModalOpen && refreshAccounts) {
      refreshAccounts().catch((err) => console.error('Realtime accounts fetch error in BillsView:', err));
    }
  }, [isModalOpen, refreshAccounts]);

  React.useEffect(() => {
    if (!vendorId && vendors[0]) setVendorId(vendors[0].id);
  }, [vendorId, vendors]);

  React.useEffect(() => {
    if (!expenseAccountId && expenseAccounts[0]) {
      setExpenseAccountId(expenseAccounts[0].id);
    } else if (expenseAccountId && !expenseAccounts.some((a) => a.id === expenseAccountId)) {
      setExpenseAccountId(expenseAccounts[0]?.id || '');
    }
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
        return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300';
      case 'Partially Paid':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300';
      case 'Paid':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300';
      case 'Overdue':
        return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <FileText className="w-6 h-6 text-amber-600" />
            <span>Vendor Bills (Accounts Payable)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((b) => {
                const bal =
                  b.balanceDue !== undefined
                    ? b.balanceDue
                    : Math.max(0, b.totalAmount - (b.amountPaid || 0));

                return (
                  <tr
                    key={b.id}
                    onClick={() => setViewingBill(b)}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-3 pl-4 font-mono font-bold text-amber-600">{b.billNumber}</td>
                    <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{b.vendorName}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400">{formatDate(b.billDate)}</td>
                    <td className="p-3 text-slate-500 dark:text-slate-400">{formatDate(b.dueDate)}</td>
                    <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                      {formatCurrency(b.totalAmount, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-right font-financial font-bold text-rose-600 dark:text-rose-400">
                      {formatCurrency(bal, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadge(b.status)}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      {bal > 0 && (
                        <button
                          onClick={() => {
                            setSelectedBillForPayment(b);
                            setIsPaymentModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 cursor-pointer"
                        >
                          <CreditCard className="h-3 w-3" />
                          <span>Pay</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bill Details Modal */}
      <BillDetailsModal
        isOpen={!!viewingBill}
        bill={viewingBill}
        onClose={() => {
          setViewingBill(null);
          if (onSelectedEntityClosed) onSelectedEntityClosed();
        }}
        onRecordPayment={(bill) => {
          setSelectedBillForPayment(bill);
          setIsPaymentModalOpen(true);
        }}
      />

      {/* Record Vendor Payment Modal */}
      {isPaymentModalOpen && (
        <RecordVendorPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedBillForPayment(null);
          }}
          initialBill={selectedBillForPayment}
        />
      )}

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              <span>Record Vendor Bill</span>
            </h3>

            {formError && (
              <div className="bg-rose-50 text-rose-700 border border-rose-200 rounded-lg p-2.5 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateBill} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor</label>
                <select
                  value={vendorId}
                  onChange={(e) => setVendorId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  required
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.companyName || v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Expense Account <span className="text-rose-600">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRefreshAccounts}
                      disabled={isRefreshingAccounts}
                      title="Fetch latest accounts"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 cursor-pointer"
                    >
                      <RefreshCw className={`h-2.5 w-2.5 ${isRefreshingAccounts ? 'animate-spin text-blue-600' : ''}`} />
                      <span>{isRefreshingAccounts ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddAccountModalOpen(true)}
                      className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer"
                    >
                      <Plus className="h-2.5 w-2.5" />
                      <span>New account</span>
                    </button>
                  </div>
                </div>
                <select
                  value={expenseAccountId}
                  onChange={(e) => setExpenseAccountId(e.target.value)}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                  required
                >
                  <option value="">Select expense account ({expenseAccounts.length} available)</option>
                  {expenseAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name} ({account.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Bill Date</label>
                  <input
                    type="date"
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Total Bill Amount ({settings.currencySymbol})
                </label>
                <input
                  type="number"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-bold font-financial dark:bg-slate-800 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Line Item / Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Item details, description, internal PO reference..."
                  rows={2}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs font-medium dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Posting...' : 'Record Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddAccountModalOpen && (
        <AccountModal
          isOpen={isAddAccountModalOpen}
          onClose={() => setIsAddAccountModalOpen(false)}
        />
      )}
    </div>
  );
};
