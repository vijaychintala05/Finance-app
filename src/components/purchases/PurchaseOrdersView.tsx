import React, { useState } from 'react';
import {
  CheckCircle2,
  FileCheck,
  Plus,
  Search,
  ShoppingBag,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PurchaseOrder } from '../../types';

export const PurchaseOrdersView: React.FC = () => {
  const { purchaseOrders, addPurchaseOrder, updatePurchaseOrder, vendors, settings } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state
  const [vendorName, setVendorName] = useState(vendors[0]?.name || 'AWS Cloud Services');
  const [amount, setAmount] = useState('7500');
  const [notes, setNotes] = useState('');

  const filtered = purchaseOrders.filter(
    (po) =>
      po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      po.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      po.notes.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    const targetVendor = vendorName || vendors[0]?.name || 'Unassigned Vendor';

    addPurchaseOrder({
      poNumber: `PO-2026-00${purchaseOrders.length + 1}`,
      vendorName: targetVendor,
      orderDate: new Date().toISOString().split('T')[0],
      expectedDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      totalAmount: Number(amount) || 0,
      status: 'Issued',
      notes: notes || 'Official purchase order',
    });

    setIsModalOpen(false);
    setNotes('');
  };

  const getStatusBadge = (status: PurchaseOrder['status']) => {
    switch (status) {
      case 'Issued':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Pending Receipt':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Billed':
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
            <FileCheck className="w-6 h-6 text-sky-600" />
            <span>Purchase Orders (POs)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Issue official purchase orders to vendors, track procurement delivery schedules & convert POs to bills
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Purchase Order</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs flex items-center">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search PO #, vendor, description..."
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
                <th className="p-3 pl-4">PO #</th>
                <th className="p-3">Vendor</th>
                <th className="p-3">Order Date</th>
                <th className="p-3">Expected Date</th>
                <th className="p-3 text-right">PO Amount</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 pl-4 font-mono font-bold text-sky-600">{po.poNumber}</td>
                  <td className="p-3 font-bold text-slate-800">{po.vendorName}</td>
                  <td className="p-3 text-slate-500">{formatDate(po.orderDate)}</td>
                  <td className="p-3 text-slate-500">{formatDate(po.expectedDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(po.totalAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadge(po.status)}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4">
                    {po.status !== 'Billed' && (
                      <button
                        onClick={() => {
                          updatePurchaseOrder(po.id, { status: 'Billed' });
                        }}
                        className="text-xs font-bold text-sky-600 hover:underline cursor-pointer"
                      >
                        Convert to Bill
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
              <FileCheck className="w-5 h-5 text-sky-600" />
              <span>Create Purchase Order</span>
            </h3>

            <form onSubmit={handleCreatePO} className="space-y-3">
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
                <label className="block text-xs font-bold text-slate-700 mb-1">Items / Procurement Notes</label>
                <textarea
                  rows={3}
                  placeholder="Line items, product specs, shipping instructions..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-xs font-medium"
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
                  Issue Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
