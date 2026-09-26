import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  FileCheck,
  MoreVertical,
  Printer,
  Truck,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { SalesOrder } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { OperationNoticeBanner } from '../common/OperationNoticeBanner';
import { committedButStaleNotice, mutationExceptionNotice, type OperationNotice } from '../../utils/operationNotice';

interface SalesOrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: SalesOrder | null;
  onStatusChange?: (orderId: string, status: SalesOrder['status']) => void;
}

export const SalesOrderDetailsModal: React.FC<SalesOrderDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  onStatusChange,
}) => {
  const { settings, currentOrg, switchOrganization, updateSalesOrder, deleteSalesOrder, convertSalesOrderToInvoice } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelOrganization, setCancelOrganization] = useState<{ id: string; name: string } | null>(null);
  const [cancelNotice, setCancelNotice] = useState<OperationNotice | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [uncertainCancellation, setUncertainCancellation] = useState<{ orderId: string; reason: string; organizationId: string; organizationName: string } | null>(null);
  const [committedCancellationOrderId, setCommittedCancellationOrderId] = useState<string | null>(null);
  const cancelInFlight = useRef(false);

  if (!isOpen || !order) return null;
  const cancellationCommitted = committedCancellationOrderId === order.id;
  const displayedStatus: SalesOrder['status'] = cancellationCommitted ? 'Cancelled' : order.status;

  const handleUpdateStatus = (newStatus: SalesOrder['status']) => {
    if (cancellationCommitted || order.status === 'Cancelled') return;
    if (newStatus === 'Cancelled') {
      handleDelete();
      return;
    }
    if (newStatus === 'Invoiced' && convertSalesOrderToInvoice && order.status !== 'Invoiced') {
      convertSalesOrderToInvoice(order.id);
    } else if (onStatusChange) {
      onStatusChange(order.id, newStatus);
    } else {
      updateSalesOrder(order.id, { status: newStatus });
    }
  };

  const handleDelete = () => {
    if (cancellationCommitted || order.status === 'Cancelled') return;
    setCancelReason('');
    setCancelOrganization({ id: currentOrg.id, name: currentOrg.name });
    setUncertainCancellation(null);
    setCancelNotice(null);
    setShowCancelDialog(true);
  };

  const handleCancelOrder = async (event: React.FormEvent, retry = false) => {
    event.preventDefault();
    if (cancelInFlight.current) return;
    const request = retry ? uncertainCancellation : null;
    const organizationId = request?.organizationId || cancelOrganization?.id;
    const organizationName = request?.organizationName || cancelOrganization?.name;
    const reason = request?.reason || cancelReason.trim();
    const orderId = request?.orderId || order.id;
    if (!organizationId || !organizationName || !reason || reason.trim().length < 3) return;
    if (currentOrg.id !== organizationId) { setCancelNotice({ tone: 'warning', title: 'Switch back to the original organization', message: `This cancellation belongs to ${organizationName}. Switch organizations before submitting or retrying it.` }); return; }
    cancelInFlight.current = true; setCancelBusy(true); setCancelNotice(null);
    try {
      const result = await deleteSalesOrder(orderId, reason, organizationId);
      setCommittedCancellationOrderId(order.id);
      setCancelNotice(result.refreshFailed ? committedButStaleNotice('Sales order cancellation committed; refreshed state unavailable', `${order.orderNumber} was cancelled, but its refreshed status could not be loaded. Do not submit the cancellation again.`, result.requestId) : { tone: 'success', title: 'Sales order cancelled', message: `${order.orderNumber} was cancelled with an audited reason.`, requestId: result.requestId });
      setShowCancelDialog(false); setCancelReason(''); setUncertainCancellation(null);
    } catch (error) {
      const notice=mutationExceptionNotice(error,{action:'Sales order cancellation',failureTitle:'Sales order was not cancelled',uncertainTitle:'Cancellation outcome could not be confirmed'});
      setCancelNotice(notice);
      if (notice.tone==='warning') setUncertainCancellation({orderId,reason,organizationId,organizationName}); else setUncertainCancellation(null);
    } finally { cancelInFlight.current=false; setCancelBusy(false); }
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              disabled={cancelBusy || uncertainCancellation !== null}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Sales Order Details
            </h3>
          </div>

          <div className="flex items-center space-x-1 relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              aria-label="Sales order actions"
              className="p-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-12 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-20">
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    window.print();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print Order</span>
                </button>

                <button
                  disabled={cancellationCommitted || order.status === 'Cancelled'}
                  onClick={() => {
                    setShowMoreMenu(false);
                    handleDelete();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel Order</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {cancelNotice && !showCancelDialog && <OperationNoticeBanner notice={cancelNotice} />}
          {/* ORDER AMOUNT & BADGE */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Total Order Value
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono tracking-tight mt-0.5">
                {formatCurrency(order.totalAmount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                Order Date: {formatDate(order.orderDate)} • Ref #{order.orderNumber}
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${getStatusBadge(
                displayedStatus
              )}`}
            >
              {displayedStatus}
            </span>
          </div>

          {/* DELIVERY & CUSTOMER BOX */}
          <div className="bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold uppercase text-[10px] tracking-wider">
                Customer Name
              </span>
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-500" />
                <span>{order.clientName}</span>
              </span>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-indigo-100/80 dark:border-indigo-900/80">
              <span className="text-indigo-600 dark:text-indigo-400 font-extrabold uppercase text-[10px] tracking-wider">
                Expected Delivery Date
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                {formatDate(order.expectedDeliveryDate)}
              </span>
            </div>
          </div>

          {/* NOTES / PARTICULAR DETAILS */}
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Order Particulars & Notes</p>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-0.5 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
              {order.notes || 'Confirmed customer purchase order details.'}
            </p>
          </div>

          {/* STATUS UPDATE CONTROLS */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Update Order Fulfillment Pipeline
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                disabled={cancellationCommitted || order.status === 'Cancelled'}
                onClick={() => handleUpdateStatus('In Production')}
                className={`p-2.5 rounded-xl font-bold border cursor-pointer transition-colors ${
                  order.status === 'In Production'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                In Production
              </button>
              <button
                disabled
                title="Record shipment by creating a delivery challan"
                onClick={() => handleUpdateStatus('Shipped')}
                className={`p-2.5 rounded-xl font-bold border cursor-pointer transition-colors ${
                  order.status === 'Shipped'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
                }`}
              >
                Shipped
              </button>
              <button
                disabled={cancellationCommitted || order.status === 'Cancelled'}
                onClick={() => handleUpdateStatus('Invoiced')}
                className={`p-2.5 rounded-xl font-bold border cursor-pointer transition-colors ${
                  order.status === 'Invoiced'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                Mark Invoiced
              </button>
              <button
                disabled={cancellationCommitted || order.status === 'Cancelled'}
                onClick={() => handleUpdateStatus('Cancelled')}
                className={`p-2.5 rounded-xl font-bold border cursor-pointer transition-colors ${
                  order.status === 'Cancelled'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                }`}
              >
                Cancelled
              </button>
            </div>
            <p className="text-[11px] text-slate-500">Record shipment by creating a delivery challan; this status cannot be set manually.</p>
          </div>
        </div>
      {showCancelDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <form role="dialog" aria-modal="true" aria-labelledby="cancel-sales-order-title" onSubmit={(event) => void handleCancelOrder(event, uncertainCancellation !== null)} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 id="cancel-sales-order-title" className="text-sm font-bold text-slate-900 dark:text-white">Cancel sales order {order.orderNumber}?</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">The order remains in history. Orders with active invoices or deliveries must be resolved first.</p>
            </div>
            {cancelNotice && <OperationNoticeBanner notice={cancelNotice} />}
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Reason for cancellation<textarea required minLength={3} rows={3} value={uncertainCancellation?.reason || cancelReason} disabled={cancelBusy || uncertainCancellation !== null} maxLength={1000} onChange={(event) => setCancelReason(event.target.value)} placeholder="Explain why this sales order is being cancelled" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-rose-500 focus:bg-white focus:outline-none disabled:opacity-70 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" /></label>
            {cancelOrganization && currentOrg.id !== cancelOrganization.id && (
              <div role="status" className="space-y-2 text-xs text-amber-800">
                <p className="font-semibold">Switch back to {cancelOrganization.name} to submit or retry this cancellation.</p>
                <button type="button" onClick={() => switchOrganization(cancelOrganization.id)} className="rounded-lg border border-amber-300 px-3 py-1.5 font-semibold hover:bg-amber-50">Switch back to {cancelOrganization.name}</button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={cancelBusy || uncertainCancellation !== null} onClick={() => setShowCancelDialog(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Keep sales order</button>
              <button type="submit" disabled={cancelBusy || currentOrg.id !== (uncertainCancellation?.organizationId || cancelOrganization?.id) || (uncertainCancellation ? false : cancelReason.trim().length < 3)} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{cancelBusy ? 'Cancelling...' : uncertainCancellation ? 'Retry same cancellation' : 'Cancel sales order'}</button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  );
};
