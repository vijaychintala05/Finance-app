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
import { OperationNoticeBanner } from '../common/OperationNoticeBanner';
import { committedButStaleNotice, mutationExceptionNotice, type OperationNotice } from '../../utils/operationNotice';
import type { CommittedOperationResult } from '../../context/BooksContext';

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
  const [notice, setNotice] = useState<OperationNotice | null>(null);
  const [createNotice, setCreateNotice] = useState<OperationNotice | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PurchaseOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');

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
  const [vendorId, setVendorId] = useState(vendors[0]?.id || '');
  const [amount, setAmount] = useState('7500');
  const [notes, setNotes] = useState('');

  React.useEffect(() => {
    if (!vendors.some((vendor) => vendor.id === vendorId)) {
      setVendorId(vendors[0]?.id || '');
    }
  }, [vendorId, vendors]);

  const filtered = purchaseOrders.filter(
    (po) =>
      po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      po.vendorName.toLowerCase().includes(search.toLowerCase()) ||
      po.notes.toLowerCase().includes(search.toLowerCase())
  );

  const handleCloseCreateModal = () => {
    setIsModalOpen(false);
    setCreateNotice(null);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const handleCloseDetailModal = () => {
    setViewingPO(null);
    if (onSelectedEntityClosed) onSelectedEntityClosed();
  };

  const committedNotice = <T,>(
    result: CommittedOperationResult<T>,
    title: string,
    message: string
  ): OperationNotice => result.refreshFailed
    ? committedButStaleNotice(`${title}; refreshed state unavailable`, message, result.requestId)
    : { tone: 'success', title, message, requestId: result.requestId };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (vendors.length === 0) {
      setCreateNotice({
        tone: 'error',
        title: 'Vendor required',
        message: 'Create a vendor before issuing a purchase order.',
        recovery: 'Add the supplier in Vendors, then return to this purchase order.',
      });
      return;
    }
    const matchedVendor = vendors.find((vendor) => vendor.id === vendorId);
    if (!matchedVendor) {
      setCreateNotice({ tone: 'error', title: 'Select a valid vendor', message: 'The selected vendor is no longer available.' });
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setCreateNotice({ tone: 'error', title: 'Enter a valid order amount', message: 'The purchase order amount must be greater than zero.' });
      return;
    }

    try {
      setBusyAction('create');
      setCreateNotice(null);
      const result = await addPurchaseOrder({
        poNumber: `PO-2026-00${purchaseOrders.length + 1}`,
        vendorId: matchedVendor.id,
        vendorName: matchedVendor.name,
        orderDate: new Date().toISOString().split('T')[0],
        expectedDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        totalAmount: numericAmount,
        status: 'Issued',
        notes: notes || 'Official purchase order',
      });
      setNotice(committedNotice(
        result,
        'Purchase order issued',
        result.refreshFailed
          ? `Purchase order ${result.data.poNumber} was committed, but the refreshed list could not be loaded.`
          : `Purchase order ${result.data.poNumber} was issued to ${matchedVendor.name}.`
      ));
      setIsModalOpen(false);
      setNotes('');
      if (onSelectedEntityClosed) onSelectedEntityClosed();
    } catch (error) {
      setCreateNotice(mutationExceptionNotice(error, {
        action: 'Purchase order creation',
        failureTitle: 'Purchase order was not issued',
        uncertainTitle: 'Purchase order outcome could not be confirmed',
      }));
    } finally {
      setBusyAction(null);
    }
  };

  const handleConvertToBill = async (purchaseOrder: PurchaseOrder) => {
    if (busyAction) return;
    try {
      setNotice(null);
      setBusyAction(`convert-${purchaseOrder.id}`);
      const result = await convertPurchaseOrderToBill(purchaseOrder.id);
      setNotice(committedNotice(
        result,
        'Bill created from purchase order',
        result.refreshFailed
          ? `Bill ${result.data.billNumber} was committed from ${purchaseOrder.poNumber}, but refreshed documents could not be loaded.`
          : `Bill ${result.data.billNumber} was created from ${purchaseOrder.poNumber}.`
      ));
      if (viewingPO?.id === purchaseOrder.id) handleCloseDetailModal();
    } catch (error) {
      setNotice(mutationExceptionNotice(error, {
        action: 'Purchase order conversion',
        failureTitle: 'Bill was not created',
        uncertainTitle: 'Bill conversion outcome could not be confirmed',
      }));
    } finally {
      setBusyAction(null);
    }
  };

  const handleReceive = async (purchaseOrder: PurchaseOrder) => {
    if (busyAction) return;
    try {
      setNotice(null);
      setBusyAction(`receive-${purchaseOrder.id}`);
      const result = await receivePurchaseOrder(purchaseOrder.id);
      setNotice(committedNotice(
        result,
        'Goods receipt recorded',
        result.refreshFailed
          ? `Receipt for ${purchaseOrder.poNumber} was committed, but the refreshed order could not be loaded.`
          : `Goods received against ${purchaseOrder.poNumber} were recorded.`
      ));
      handleCloseDetailModal();
    } catch (error) {
      setNotice(mutationExceptionNotice(error, {
        action: 'Goods receipt',
        failureTitle: 'Goods receipt was not recorded',
        uncertainTitle: 'Goods receipt outcome could not be confirmed',
      }));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelPurchaseOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cancelTarget || busyAction || cancelReason.trim().length < 3) return;
    try {
      setNotice(null);
      setBusyAction(`cancel-${cancelTarget.id}`);
      const result = await deletePurchaseOrder(cancelTarget.id, cancelReason.trim());
      setNotice(committedNotice(
        result,
        'Purchase order cancelled',
        result.refreshFailed
          ? `${cancelTarget.poNumber} was cancelled, but the refreshed order could not be loaded.`
          : `${cancelTarget.poNumber} was cancelled with an audited reason.`
      ));
      setCancelTarget(null);
      setCancelReason('');
      handleCloseDetailModal();
    } catch (error) {
      setNotice(mutationExceptionNotice(error, {
        action: 'Purchase order cancellation',
        failureTitle: 'Purchase order was not cancelled',
        uncertainTitle: 'Cancellation outcome could not be confirmed',
      }));
    } finally {
      setBusyAction(null);
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

      {notice && !viewingPO && !cancelTarget && <OperationNoticeBanner notice={notice} />}

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
          <table className="mobile-record-table w-full text-left text-xs">
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
                        onClick={() => void handleConvertToBill(po)}
                        disabled={Boolean(busyAction)}
                        className="text-xs font-bold text-sky-600 hover:underline cursor-pointer"
                      >
                        {busyAction === `convert-${po.id}` ? 'Converting...' : 'Convert to Bill'}
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
          <div role="dialog" aria-modal="true" aria-labelledby="purchase-order-detail-title" className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-sky-600" />
                <h3 id="purchase-order-detail-title" className="text-base font-bold text-slate-900 dark:text-white">
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

            {notice && !cancelTarget && <OperationNoticeBanner notice={notice} />}

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
                    onClick={() => {
                      setNotice(null);
                      setCancelTarget(viewingPO);
                      setCancelReason('');
                    }}
                    disabled={Boolean(busyAction)}
                    className="px-3 py-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    Cancel PO
                  </button>
                )}
                {viewingPO.status !== 'Received' && viewingPO.status !== 'Cancelled' && (
                  <button
                    onClick={() => void handleReceive(viewingPO)}
                    disabled={Boolean(busyAction)}
                    className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    {busyAction === `receive-${viewingPO.id}` ? 'Recording...' : 'Mark Received'}
                  </button>
                )}
                {viewingPO.status !== 'Billed' && viewingPO.status !== 'Cancelled' && (
                  <button
                    onClick={() => void handleConvertToBill(viewingPO)}
                    disabled={Boolean(busyAction)}
                    className="px-3 py-1.5 bg-sky-600 text-white hover:bg-sky-700 rounded-lg text-xs font-bold cursor-pointer"
                  >
                    {busyAction === `convert-${viewingPO.id}` ? 'Converting...' : 'Convert to Bill'}
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
          <div role="dialog" aria-modal="true" aria-labelledby="create-purchase-order-title" className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-slate-200 dark:border-slate-800">
            <h3 id="create-purchase-order-title" className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-sky-600" />
              <span>Create Purchase Order</span>
            </h3>

            {createNotice && <OperationNoticeBanner notice={createNotice} />}

            <form onSubmit={handleCreatePO} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Vendor / Supplier</label>
                {vendors.length === 0 ? (
                  <p className="text-xs text-rose-500 font-medium p-2 bg-rose-50 dark:bg-rose-950/30 rounded-lg">
                    No vendors found. Please add a vendor in Contacts before creating a purchase order.
                  </p>
                ) : (
                  <select
                    aria-label="Vendor / Supplier"
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-2 text-xs font-medium"
                    required
                  >
                    <option value="">Select a vendor...</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Order Amount ({settings.currencySymbol})</label>
                <input
                  aria-label={`Order Amount (${settings.currencySymbol})`}
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
                  disabled={busyAction === 'create'}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer transition-colors"
                >
                  {busyAction === 'create' ? 'Issuing...' : 'Issue Purchase Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-purchase-order-title"
            onSubmit={handleCancelPurchaseOrder}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 id="cancel-purchase-order-title" className="text-sm font-bold text-slate-900 dark:text-white">Cancel purchase order {cancelTarget.poNumber}?</h3>
                <p className="mt-1 text-[11px] text-slate-500">The order remains in history as Cancelled. Existing receipts or bills are never deleted.</p>
              </div>
              <button type="button" aria-label="Close cancellation confirmation" disabled={busyAction === `cancel-${cancelTarget.id}`} onClick={() => setCancelTarget(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>
            {notice?.tone !== 'success' && notice && <OperationNoticeBanner notice={notice} />}
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Reason for cancellation
              <textarea
                required
                minLength={3}
                rows={3}
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Explain why this order is being cancelled"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busyAction === `cancel-${cancelTarget.id}`} onClick={() => setCancelTarget(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Keep purchase order</button>
              <button type="submit" disabled={Boolean(busyAction) || cancelReason.trim().length < 3} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                {busyAction === `cancel-${cancelTarget.id}` ? 'Cancelling...' : 'Cancel purchase order'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
