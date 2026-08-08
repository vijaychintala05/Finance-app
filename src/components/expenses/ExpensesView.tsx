import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Edit2,
  FileText,
  Paperclip,
  Plus,
  Receipt,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { Expense } from '../../types';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ExpenseModal } from './ExpenseModal';
import { ExpenseDetailsModal } from './ExpenseDetailsModal';

interface ExpensesViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  onExit?: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  autoOpenCreateModal = false,
  onModalClosed,
  onExit,
}) => {
  const { expenses, settings, deleteExpense } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(autoOpenCreateModal);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);

  useEffect(() => {
    if (autoOpenCreateModal) {
      setSelectedExpense(null);
      setIsModalOpen(true);
    }
  }, [autoOpenCreateModal]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedExpense(null);
    onModalClosed?.();
    if (autoOpenCreateModal && onExit) {
      onExit();
    }
  };

  const handleOpenNew = () => {
    setSelectedExpense(null);
    setIsModalOpen(true);
  };

  const handleEdit = (exp: Expense) => {
    setSelectedExpense(exp);
    setIsModalOpen(true);
  };

  const filteredExpenses = expenses.filter(
    (e) =>
      e.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.accountName.toLowerCase().includes(search.toLowerCase()) ||
      (e.vendorName && e.vendorName.toLowerCase().includes(search.toLowerCase())) ||
      (e.projectName && e.projectName.toLowerCase().includes(search.toLowerCase())) ||
      (e.clientName && e.clientName.toLowerCase().includes(search.toLowerCase())) ||
      (e.invoiceNumber && e.invoiceNumber.toLowerCase().includes(search.toLowerCase()))
  );

  const totalExpenseSum = filteredExpenses.reduce((acc, e) => acc + (e.amount || 0), 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center space-x-2">
            <Receipt className="w-6 h-6 text-blue-600" />
            <span>Record Expenses & Vendor Bills</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Log vendor payments, attach receipts, manage itemized breakdowns & customer billable costs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onExit && (
            <button
              onClick={onExit}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
          )}

          <button
            onClick={handleOpenNew}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>Record Expense</span>
          </button>
        </div>
      </div>

      {/* KPI Cards & Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Recorded</p>
            <p className="text-lg font-black text-slate-900 mt-0.5">
              {formatCurrency(totalExpenseSum, settings.currencySymbol)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            {filteredExpenses.length}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Receipts Attached</p>
            <p className="text-lg font-black text-emerald-600 mt-0.5">
              {filteredExpenses.filter((e) => e.receiptFileName || e.receiptMockUrl).length} Receipts
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Paperclip className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer Billable</p>
            <p className="text-lg font-black text-amber-600 mt-0.5">
              {filteredExpenses.filter((e) => e.isBillable).length} Billable
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search ref #, vendor, category, customer, invoice #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>
      </div>

      {/* Mobile Expenses Cards Feed (lg:hidden) */}
      <div className="block lg:hidden space-y-3">
        {/* Quick Camera/Scan Receipt Action */}
        <div
          onClick={handleOpenNew}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-3.5 text-white shadow-xs cursor-pointer active:scale-98 transition-transform flex items-center justify-between"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black">
              📸
            </div>
            <div>
              <h4 className="text-xs font-bold">Quick Scan & Upload Receipt</h4>
              <p className="text-[10px] text-blue-100">Attach photo or PDF bill to log expense instantly</p>
            </div>
          </div>
          <Plus className="w-5 h-5 text-white" />
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-slate-400 space-y-2">
            <Receipt className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">No expenses recorded matching filter</p>
          </div>
        ) : (
          filteredExpenses.map((exp) => (
            <div
              key={exp.id}
              onClick={() => setViewingExpense(exp)}
              className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3 active:bg-slate-50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
                    {exp.accountName ? exp.accountName.charAt(0).toUpperCase() : 'E'}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">{exp.accountName}</h4>
                    <p className="text-[10px] text-slate-500 font-mono">Ref: #{exp.referenceNumber}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-extrabold text-rose-600 text-sm font-mono block">
                    {formatCurrency(exp.amount, settings.currencySymbol)}
                  </span>
                  <span className="text-[10px] text-slate-400">{formatDate(exp.date)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                <span className="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-md">
                  Vendor: {exp.vendorName || 'General'}
                </span>
                {exp.isBillable && (
                  <span className="bg-amber-50 text-amber-700 font-bold px-2 py-0.5 rounded-md border border-amber-200">
                    Billable
                  </span>
                )}
                {exp.receiptFileName && (
                  <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Receipt Attached
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop High-Density Expenses Table (hidden lg:block) */}
      <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-3 pl-4">Ref # & Date</th>
                <th className="p-3">Expense Category</th>
                <th className="p-3">Vendor / Invoice#</th>
                <th className="p-3">Customer / Project</th>
                <th className="p-3">Receipt</th>
                <th className="p-3">Amount</th>
                <th className="p-3 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-xs">No expenses recorded matching criteria</p>
                    <button
                      onClick={handleOpenNew}
                      className="mt-3 text-xs text-blue-600 font-bold underline hover:text-blue-700 cursor-pointer"
                    >
                      Click here to record a new expense
                    </button>
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => setViewingExpense(exp)}
                  >
                    <td className="p-3 pl-4">
                      <div className="font-mono font-bold text-blue-600 text-xs">
                        {exp.referenceNumber}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {formatDate(exp.date)}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="font-bold text-slate-800 text-xs">{exp.accountName}</div>
                      <div className="text-[10px] text-slate-500">
                        Paid via: {exp.paidFromAccountName || 'Cash / Bank'}
                      </div>
                      {exp.isItemized && (
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 bg-purple-50 text-purple-700 text-[9px] font-bold rounded border border-purple-200">
                          Itemized ({exp.items?.length || 1} items)
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="font-semibold text-slate-700 text-xs flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span>{exp.vendorName || 'General Vendor'}</span>
                      </div>
                      {exp.invoiceNumber && (
                        <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                          Inv#: {exp.invoiceNumber}
                        </div>
                      )}
                    </td>

                    <td className="p-3">
                      {exp.clientName ? (
                        <div className="text-xs font-semibold text-slate-800">{exp.clientName}</div>
                      ) : (
                        <div className="text-[11px] text-slate-400">Internal Firm</div>
                      )}
                      {exp.projectName && (
                        <span className="inline-block mt-0.5 bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold border border-blue-200">
                          {exp.projectName}
                        </span>
                      )}
                      {exp.isBillable && (
                        <span className="inline-block ml-1 mt-0.5 bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-bold border border-amber-200">
                          Billable
                        </span>
                      )}
                    </td>

                    <td className="p-3">
                      {exp.receiptFileName || exp.receiptMockUrl ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-bold border border-emerald-200">
                          <Paperclip className="w-3 h-3" /> Receipt
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="p-3">
                      <div className="font-extrabold text-rose-600 text-sm">
                        {exp.currency ? exp.currency : ''} {formatCurrency(exp.amount, settings.currencySymbol)}
                      </div>
                    </td>

                    <td className="p-3 pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(exp)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
                          title="Edit Record Expense"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete expense record ${exp.referenceNumber}?`)) {
                              deleteExpense(exp.id);
                            }
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ExpenseModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        expenseToEdit={selectedExpense}
      />

      <ExpenseDetailsModal
        isOpen={!!viewingExpense}
        onClose={() => setViewingExpense(null)}
        expense={viewingExpense}
        onEdit={(exp) => handleEdit(exp)}
      />
    </div>
  );
};
