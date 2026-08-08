import React, { useState } from 'react';
import { Receipt, ShoppingBag, FileText, ArrowUpRight, ShieldAlert, CheckCircle } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

interface PurchasesSettingsProps {
  subTab: 'purchases-expenses' | 'purchases-purchase-orders' | 'purchases-bills' | 'purchases-payments-made' | 'purchases-vendor-credits';
}

export const PurchasesSettings: React.FC<PurchasesSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Purchases module settings saved!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // State
  const [expThreshold, setExpThreshold] = useState(settings.expensesSettings?.approvalThreshold || 1000);
  const [expReceipt, setExpReceipt] = useState(settings.expensesSettings?.requireReceipt ?? true);
  const [poThreshold, setPoThreshold] = useState(settings.purchaseOrdersSettings?.requirePOAbove || 500);
  const [billDueDays, setBillDueDays] = useState(settings.billsSettings?.defaultDueDays || 30);
  const [detectDupBill, setDetectDupBill] = useState(settings.billsSettings?.detectDuplicateBill ?? true);

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Expenses */}
      {subTab === 'purchases-expenses' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Receipt className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Expenses & Receipt Controls</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">CFO Manager Approval Threshold ($)</label>
              <input
                type="number"
                value={expThreshold}
                onChange={(e) => setExpThreshold(Number(e.target.value))}
                className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={expReceipt}
                onChange={(e) => setExpReceipt(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="font-bold text-slate-700">Require Receipt Attachment for Expenses over $50</span>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    expensesSettings: { approvalThreshold: expThreshold, requireReceipt: expReceipt },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Expense Controls
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Purchase Orders */}
      {subTab === 'purchases-purchase-orders' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShoppingBag className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Purchase Orders (PO) Thresholds</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Require Mandatory PO for Purchases Above ($)</label>
              <input
                type="number"
                value={poThreshold}
                onChange={(e) => setPoThreshold(Number(e.target.value))}
                className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    purchaseOrdersSettings: { requirePOAbove: poThreshold, autoCloseMatched: true },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save PO Policy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bills */}
      {subTab === 'purchases-bills' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">Accounts Payable Bills & Duplicate Warnings</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Default Vendor Bill Payment Terms (Days)</label>
              <input
                type="number"
                value={billDueDays}
                onChange={(e) => setBillDueDays(Number(e.target.value))}
                className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-2">
              <input
                type="checkbox"
                checked={detectDupBill}
                onChange={(e) => setDetectDupBill(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="font-bold text-slate-700">Detect & Warn on Duplicate Vendor Bill Numbers</span>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    billsSettings: { defaultDueDays: billDueDays, detectDuplicateBill: detectDupBill },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Bills Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payments Made */}
      {subTab === 'purchases-payments-made' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ArrowUpRight className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Vendor Disbursements & Payment Advice</h3>
          </div>

          <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
            <div>
              <span className="font-bold text-slate-800 block">Auto-Send Digital Payment Advice PDF to Vendor</span>
              <span className="text-[11px] text-slate-500">Email remittance voucher immediately when payout is released</span>
            </div>
          </label>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => triggerSave({ paymentsMadeSettings: { batchThreshold: 10000, sendPaymentAdvice: true } })}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
            >
              Save Payment Advice Policy
            </button>
          </div>
        </div>
      )}

      {/* Vendor Credits */}
      {subTab === 'purchases-vendor-credits' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
            <h3 className="text-sm font-bold text-slate-800">Vendor Credit Memorandum Rules</h3>
          </div>

          <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
            <div>
              <span className="font-bold text-slate-800 block">Auto-Apply Vendor Credits to Subsequent Vendor Bills</span>
              <span className="text-[11px] text-slate-500">Offset upcoming payables against approved vendor refund credits</span>
            </div>
          </label>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => triggerSave({ vendorCreditsSettings: { autoApplyFutureBills: true } })}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
            >
              Save Vendor Credit Rules
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
