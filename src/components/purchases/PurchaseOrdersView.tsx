import React, { useState } from 'react';
import {
  CheckCircle2,
  Eye,
  FileCheck,
  Plus,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { PurchaseOrder } from '../../types';

interface PurchaseOrdersViewProps {
  autoOpenCreateModal?: boolean;
  onModalClosed?: () => void;
  selectedEntityId?: string;
  onSelectedEntityClosed?: () => void;
}

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({
  autoOpenCreateModal,
  onModalClosed,
  selectedEntityId,
  onSelectedEntityClosed,
}) => {
  const {
    purchaseOrders,
    addPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    convertPurchaseOrderToBill,
    receivePurchaseOrder,
    vendors,
    settings,
  } = useBooks();

  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewingPO, setViewingPO] = useState<PurchaseOrder | null>(null);

  React.useEffect(() => {
    if (autoOpenCreateModal) {
      setIsModalOpen(true);
      if (onModalClosed) onModalClosed();
    }
  }, [autoOpenCreateModal]);

  React.useEffect(() => {
    if (selectedEntityId) {
      const found = purchaseOrders.find(
        (po) => po.id === selectedEntityId || po.poNumber === selectedEntityId
      );
      if (found) {
        setViewingPO(found);
      }
    }
  }, [selectedEntityId, purchaseOrders]);

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

  const handleCloseCreateModal = () => {
    setIsModalOpen(false);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const handleCloseDetailModal = () => {
    setViewingPO(null);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vendors.length === 0) {
      alert('Create a vendor before issuing a purchase order');
      return;
    }
    const matchedVendor = vendors.find((v) => v.name === vendorName);
    const targetVendor = vendorName || vendors[0]?.name;
    if (!targetVendor) {
      alert('Please select a valid vendor');
      return;
    }

    try {
      const created = await addPurchaseOrder({
        poNumber: `PO-2026-00${purchaseOrders.length + 1}`,
        vendorId: matchedVendor?.id || vendors[0]?.id,
        vendorName: targetVendor,
        orderDate: new Date().toISOString().split('T')[0],
        expectedDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        totalAmount: Number(amount) || 0,
        status: 'Issued',
        notes: notes || 'Official purchase order',
      });
      if (!created) return;

      setIsModalOpen(false);
      setNotes('');
      if (onSelectedEntityClosed) onSelectedEntityClosed();
    } catch (err: any) {
      alert(err.message || 'Failed to create purchase order');
    }
  };

  const getStatusBadge = (status: PurchaseOrder['status']) => {
    switch (status) {
      case 'Draft':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Issued':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Approved':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Partially Received':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'Received':
        return 'bg-teal-100 text-teal-800 border-teal-200';
      case 'Pending Receipt':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Partially Billed':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Billed':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Cancelled':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
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
          disabled={vendors.length === 0}
          title={vendors.length === 0 ? "Create a vendor before issuing a purchase order" : "Create Purchase Order"}
          className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-2xs transition-colors ${
            vendors.length === 0
              ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
          }`}
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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((po) => (
                <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td
                    onClick={() => setViewingPO(po)}
                    className="p-3 pl-4 font-mono font-bold text-sky-600 cursor-pointer hover:underline"
                  >
                    {po.poNumber}
                  </td>
                  <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{po.vendorName}</td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">{formatDate(po.orderDate)}</td>
                  <td className="p-3 text-slate-500 dark:text-slate-400">{formatDate(po.expectedDate)}</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(po.totalAmount, settings.currencySymbol)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getStatusBadge(po.status)}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="p-3 text-right pr-4 space-x-2">
                    <button
                      onClick={() => setViewingPO(po)}
                      className="text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 inline mr-1" />
                      View
                    </button>
                    {po.status !== 'Billed' && po.status !== 'Cancelled' && (
                      <button
                        onClick={async () => {
                          try {
                            const bill = await convertPurchaseOrderToBill(po.id);
                            if (bill) alert(`Created Bill ${bill.billNumber} from PO ${po.poNumber}`);
                          } catch (err: any) {
                            alert(err.message || 'Conversion to bill failed');
                          }
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

      {/* PO Detail View Modal */}
      {viewingPO && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Purchase Order: <span className="font-mono">{viewingPO.poNumber}</span>
                </h3>
              </div>
              <button
                onClick={handleCloseDetailModal}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Vendor Name</span>
                <p className="font-bold text-slate-800 dark:text-slate-200">{viewingPO.vendorName}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Total Amount</span>
                <p className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {formatCurrency(viewingPO.totalAmount, settings.currencySymbol)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Order Date</span>
                <p className="font-medium text-slate-700 dark:text-slate-300">{formatDate(viewingPO.orderDate)}</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
                <span className="text-slate-400 font-bold uppercase text-[10px]">Expected Delivery</span>
                <p className="font-medium text-slate-700 dark:text-slate-300">{formatDate(viewingPO.expectedDate)}</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-1">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Procurement Notes & Specifications</span>
              <p className="text-xs text-slate-700 dark:text-slate-300">{viewingPO.notes || 'No additional notes specified.'}</p>
            </div>

            <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {viewingPO.status !== 'Cancelled' && viewingPO.status !== 'Billed' && (
                  <button
                    onClick={async () => {
                      try {
                        await deletePurchaseOrder(viewingPO.id);
                        handleCloseDetailModal();
                      } catch (err: any) {
                        alert(err.message || 'Cancellation failed');
                      }
                    }}
                    className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Cancel PO
                  </button>
                )}
                {viewingPO.status !== 'Received' && viewingPO.status !== 'Cancelled' && (
                  <button
                    onClick={async () => {
                      try {
                        await receivePurchaseOrder(viewingPO.id);
                        alert(`PO ${viewingPO.poNumber} goods received`);
                        handleCloseDetailModal();
                      } catch (err: any) {
                        alert(err.message || 'Receipt recording failed');
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Mark Received
                  </button>
                )}
                {viewingPO.status !== 'Billed' && viewingPO.status !== 'Cancelled' && (
                  <button
                    onClick={async () => {
                      try {
                        const bill = await convertPurchaseOrderToBill(viewingPO.id);
                        if (bill) alert(`Created Bill ${bill.billNumber} from PO ${viewingPO.poNumber}`);
                        handleCloseDetailModal();
                      } catch (err: any) {
                        alert(err.message || 'Conversion failed');
                      }
                    }}
                    className="px-3 py-1.5 bg-sky-600 text-white hover:bg-sky-700 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Convert to Bill
                  </button>
                )}
              </div>
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

      {/* PO Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-sky-600" />
              <span>Create Purchase Order</span>
            </h3>

            <form onSubmit={handleCreatePO} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor / Supplier</label>
                {vendors.length === 0 ? (
                  <p className="text-xs text-rose-500 font-medium p-2 bg-rose-50 dark:bg-rose-950/30 rounded-lg">
                    No vendors found. Please add a vendor in Contacts before creating a purchase order.
                  </p>
                ) : (
                  <select
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-2 text-xs font-medium"
                    required
                  >
                    <option value="">Select a vendor...</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
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
                  onClick={handleCloseCreateModal}
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
