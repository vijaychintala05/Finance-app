import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileCheck,
  Plus,
  Search,
  Truck,
  XCircle,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { Invoice, SalesOrder } from '../../types';
import { SalesOrderDetailsModal } from './SalesOrderDetailsModal';
import { InvoicePreviewModal } from '../invoices/InvoicePreviewModal';

interface SalesOrdersViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const SalesOrdersView: React.FC<SalesOrdersViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const { salesOrders, addSalesOrder, convertSalesOrderToInvoice, clients, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<SalesOrder | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal, onModalClosed]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = salesOrders.find((so) => so.id === selectedEntityId || so.orderNumber === selectedEntityId);
      if (found) {
        setViewingOrder(found);
      }
    }
  }, [selectedEntityId, salesOrders]);

  // Form state
  const [clientName, setClientName] = useState(clients[0]?.name || '');
  const [amount, setAmount] = useState('12000');
  const [notes, setNotes] = useState('');

  const filteredOrders = salesOrders.filter((so) => {
    const matchesSearch =
      so.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      so.clientName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'All' || so.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const targetClient = clientName || clients[0]?.name || 'Unassigned Customer';

    addSalesOrder({
      orderNumber: `SO-2026-0${salesOrders.length + 1}`,
      clientName: targetClient,
      orderDate: new Date().toISOString().split('T')[0],
      expectedDeliveryDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      totalAmount: Number(amount) || 0,
      status: 'Confirmed',
      notes: notes || 'Confirmed sales order',
    });

    setIsModalOpen(false);
    setNotes('');
  };

  const getStatusBadge = (status: SalesOrder['status']) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'In Production':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Shipped':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Invoiced':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Cancelled':
        return 'bg-rose-100 text-rose-800 border-rose-200';
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center space-x-2">
            <FileCheck className="w-6 h-6 text-indigo-600" />
            <span>Sales Orders</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Track confirmed client commitments, fulfillment status, and order conversion pipeline
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Sales Order</span>
        </button>
      </div>

      {/* Filter & Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search order # or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white pl-9 pr-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
          />
        </div>

        <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto text-xs">
          {['All', 'Confirmed', 'In Production', 'Shipped', 'Invoiced', 'Cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                statusFilter === st
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Sales Orders Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3 pl-4">Order #</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Order Date</th>
                <th className="p-3">Expected Delivery</th>
                <th className="p-3 text-right">Order Amount</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No sales orders match your criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((so) => (
                  <tr
                    key={so.id}
                    onClick={() => setViewingOrder(so)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="p-3 pl-4 font-mono font-bold text-indigo-600">{so.orderNumber}</td>
                    <td className="p-3 font-bold text-slate-800">{so.clientName}</td>
                    <td className="p-3 text-slate-500">{formatDate(so.orderDate)}</td>
                    <td className="p-3 text-slate-500">{formatDate(so.expectedDeliveryDate)}</td>
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(so.totalAmount, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadge(so.status)}`}>
                        {so.status}
                      </span>
                    </td>
                    <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          const createdInv = convertSalesOrderToInvoice(so.id);
                          if (createdInv) setPreviewInvoice(createdInv);
                        }}
                        disabled={so.status === 'Invoiced'}
                        className="text-xs font-bold text-indigo-600 hover:underline disabled:opacity-40 disabled:no-underline cursor-pointer"
                      >
                        {so.status === 'Invoiced' ? '✓ Invoiced' : 'Convert to Invoice'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-600" />
              <span>Create New Sales Order</span>
            </h3>

            <form onSubmit={handleCreateOrder} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Customer / Client</label>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Order Amount ({settings.currencySymbol})</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Order Notes / Scope</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
                  placeholder="Order instructions, deliverables, delivery expectations..."
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
                  Save Sales Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sales Order Details Modal */}
      <SalesOrderDetailsModal
        isOpen={!!viewingOrder}
        onClose={() => {
          setViewingOrder(null);
          if (onSelectedEntityClosed) onSelectedEntityClosed();
        }}
        order={viewingOrder}
      />

      {/* Converted Invoice Preview Modal */}
      <InvoicePreviewModal
        invoice={previewInvoice}
        onClose={() => setPreviewInvoice(null)}
      />
    </div>
  );
};
