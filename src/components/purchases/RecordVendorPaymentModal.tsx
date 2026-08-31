import React, { useState, useMemo } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  FileText,
  Landmark,
  Receipt,
  Tag,
  Wallet,
  X,
} from 'lucide-react';
import { Bill, Vendor } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';

interface RecordVendorPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor?: Vendor | null;
  initialBill?: Bill | null;
}

export const RecordVendorPaymentModal: React.FC<RecordVendorPaymentModalProps> = ({
  isOpen,
  onClose,
  vendor,
  initialBill,
}) => {
  const { bills, vendors, accounts, paymentsMade, addPaymentMade, settings } = useBooks();

  const [selectedVendorId, setSelectedVendorId] = useState<string>(
    vendor?.id || (initialBill ? vendors.find((v) => v.name === initialBill.vendorName)?.id || '' : vendors[0]?.id || '')
  );

  const activeVendor = useMemo(
    () => vendors.find((v) => v.id === selectedVendorId) || vendors[0] || null,
    [vendors, selectedVendorId]
  );

  // Open bills for the active vendor
  const vendorOpenBills = useMemo(() => {
    if (!activeVendor) return [];
    return bills.filter(
      (b) =>
        (b.vendorName === activeVendor.name || b.vendorName === activeVendor.companyName) &&
        b.status !== 'Paid' &&
        b.status !== 'VOIDED'
    );
  }, [bills, activeVendor]);

  const [isAdvance, setIsAdvance] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string>(initialBill?.id || vendorOpenBills[0]?.id || '');
  const targetBill = useMemo(
    () => vendorOpenBills.find((b) => b.id === selectedBillId) || null,
    [vendorOpenBills, selectedBillId]
  );

  const targetBillBalance = targetBill
    ? targetBill.balanceDue !== undefined
      ? targetBill.balanceDue
      : Math.max(0, targetBill.totalAmount - (targetBill.amountPaid || 0))
    : 0;

  // Liquid disbursement accounts (Bank & Cash)
  const disbursementAccounts = useMemo(() => {
    return accounts.filter((a) => {
      const subType = String(a.subType || '').toLowerCase();
      return (
        a.type === 'Asset' &&
        a.status !== 'Inactive' &&
        (a.code.startsWith('10') || ['bank', 'cash', 'cash & bank', 'digital wallet'].includes(subType))
      );
    });
  }, [accounts]);

  const [paidFromAccountId, setPaidFromAccountId] = useState<string>(disbursementAccounts[0]?.id || '');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank Wire / NEFT / RTGS');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [amount, setAmount] = useState<string>(
    initialBill ? String(targetBillBalance || initialBill.totalAmount) : targetBill ? String(targetBillBalance) : '5000'
  );
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Synchronize initial bill selection when modal opens
  React.useEffect(() => {
    if (initialBill) {
      const v = vendors.find((vend) => vend.name === initialBill.vendorName);
      if (v) setSelectedVendorId(v.id);
      setSelectedBillId(initialBill.id);
      setIsAdvance(false);
      const bal =
        initialBill.balanceDue !== undefined
          ? initialBill.balanceDue
          : Math.max(0, initialBill.totalAmount - (initialBill.amountPaid || 0));
      setAmount(String(bal > 0 ? bal : initialBill.totalAmount));
    }
  }, [initialBill, vendors]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Please enter a valid disbursement amount greater than 0.');
      return;
    }

    if (!activeVendor) {
      setError('Please select a valid vendor.');
      return;
    }

    if (!isAdvance && !targetBill && vendorOpenBills.length > 0) {
      setError('Please select an open bill or toggle to Vendor Advance.');
      return;
    }

    const nextNumber = `PAY-2026-${String(paymentsMade.length + 1).padStart(3, '0')}`;

    addPaymentMade({
      paymentNumber: nextNumber,
      vendorName: activeVendor.name,
      billNumber: isAdvance ? 'VENDOR-ADVANCE' : targetBill ? targetBill.billNumber : 'DIRECT-PAYMENT',
      paymentDate,
      paymentMethod,
      referenceNumber: referenceNumber || `REF-${Date.now().toString().slice(-6)}`,
      amount: parsedAmount,
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAdvance ? 'Record Vendor Advance / Prepayment' : 'Record Vendor Payment'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Post double-entry cash disbursement against accounts payable
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Vendor Selection & Advance Toggle */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Vendor / Supplier</label>
              <button
                type="button"
                onClick={() => setIsAdvance(!isAdvance)}
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                  isAdvance
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {isAdvance ? '★ Advance Prepayment Mode' : 'Switch to Vendor Advance'}
              </button>
            </div>

            <select
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.taxId ? `(${v.taxId})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Target Bill Selection (if not advance) */}
          {!isAdvance && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Target Open Bill</label>
              {vendorOpenBills.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
                  No open bills found for this vendor. This payment will be recorded as a direct vendor settlement or advance.
                </div>
              ) : (
                <select
                  value={selectedBillId}
                  onChange={(e) => {
                    setSelectedBillId(e.target.value);
                    const b = vendorOpenBills.find((bill) => bill.id === e.target.value);
                    if (b) {
                      const bal =
                        b.balanceDue !== undefined
                          ? b.balanceDue
                          : Math.max(0, b.totalAmount - (b.amountPaid || 0));
                      setAmount(String(bal > 0 ? bal : b.totalAmount));
                    }
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {vendorOpenBills.map((b) => {
                    const bal =
                      b.balanceDue !== undefined
                        ? b.balanceDue
                        : Math.max(0, b.totalAmount - (b.amountPaid || 0));
                    return (
                      <option key={b.id} value={b.id}>
                        {b.billNumber} — Total {formatCurrency(b.totalAmount, settings.currencySymbol)} (Due: {formatCurrency(bal, settings.currencySymbol)})
                      </option>
                    );
                  })}
                </select>
              )}
            </div>
          )}

          {/* Disbursement Bank / Cash Account */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Paid From (Bank / Cash Account)
            </label>
            <select
              value={paidFromAccountId}
              onChange={(e) => setPaidFromAccountId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {disbursementAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} — {acc.name} ({formatCurrency(acc.balance || 0, settings.currencySymbol)})
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Date Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Disbursement Amount ({settings.currencySymbol})
              </label>
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-bold text-slate-900 font-financial dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Date</label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>
          </div>

          {/* Payment Method & Reference Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Payment Mode</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="Bank Wire / NEFT / RTGS">Bank Wire / NEFT / RTGS</option>
                <option value="Cheque / Draft">Cheque / Demand Draft</option>
                <option value="Corporate Credit Card">Corporate Credit Card</option>
                <option value="UPI / Digital Payment">UPI / Digital Payment</option>
                <option value="Petty Cash">Petty Cash</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Transaction / UTR Reference
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. UTR-99882200"
                className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500 transition-colors cursor-pointer"
            >
              {isAdvance ? 'Post Vendor Advance' : 'Post Payment Remittance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
