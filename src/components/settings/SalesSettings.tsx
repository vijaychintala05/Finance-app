import React, { useState } from 'react';
import { ShoppingCart, FileSpreadsheet, Truck, FileText, Repeat, ArrowDownLeft, FileCheck, CheckCircle } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

interface SalesSettingsProps {
  subTab:
    | 'sales-quotes'
    | 'sales-orders'
    | 'sales-delivery-challans'
    | 'sales-invoices'
    | 'sales-recurring-invoices'
    | 'sales-payments-received'
    | 'sales-credit-notes'
    | 'sales-delivery-notes'
    | 'sales-packing-slips';
}

export const SalesSettings: React.FC<SalesSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Sales module settings updated!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // State
  const [autoConvertQuote, setAutoConvertQuote] = useState(settings.quotesSettings?.autoConvertOnAccept ?? true);
  const [quoteExpiryDays, setQuoteExpiryDays] = useState(settings.quotesSettings?.expiryDays || 30);
  const [enableSO, setEnableSO] = useState(settings.salesOrdersSettings?.enableSO ?? true);
  const [invDueDays, setInvDueDays] = useState(settings.invoicesSettings?.defaultDueDays || 30);
  const [lateFeePercent, setLateFeePercent] = useState(settings.invoicesSettings?.lateFeePercent || 1.5);
  const [autoApplyOldest, setAutoApplyOldest] = useState(settings.paymentsReceivedSettings?.autoApplyOldest ?? true);

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Quotes */}
      {subTab === 'sales-quotes' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Quotes & Estimates Configuration</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={autoConvertQuote}
                onChange={(e) => setAutoConvertQuote(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Auto-Convert Quote to Invoice on Client Digital Acceptance</span>
                <span className="text-[11px] text-slate-500">Automatically generate pending draft invoice when client approves quote in portal</span>
              </div>
            </label>

            <div>
              <label className="block text-slate-600 font-bold mb-1">Quote Validity Period (Days)</label>
              <input
                type="number"
                value={quoteExpiryDays}
                onChange={(e) => setQuoteExpiryDays(Number(e.target.value))}
                className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    quotesSettings: { autoConvertOnAccept: autoConvertQuote, expiryDays: quoteExpiryDays, termsNotice: 'Valid for 30 days.' },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Quote Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sales Orders */}
      {subTab === 'sales-orders' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Sales Orders Preferences</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={enableSO}
                onChange={(e) => setEnableSO(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Require Sales Orders Prior to Invoice Issuance</span>
                <span className="text-[11px] text-slate-500">Enforce fulfillment & reserve inventory stock on SO approval</span>
              </div>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    salesOrdersSettings: { enableSO, reserveStock: true },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Sales Orders Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Challans / Notes / Packing Slips */}
      {(subTab === 'sales-delivery-challans' || subTab === 'sales-delivery-notes' || subTab === 'sales-packing-slips') && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Truck className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-800">Dispatch, Delivery Notes & Packing Slips</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Primary Fulfillment Warehouse Location</label>
              <input
                type="text"
                defaultValue="San Francisco HQ Warehouse"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-bold text-slate-800"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
              <span className="font-bold text-slate-700">Require Logistics Vehicle Number on Delivery Challan</span>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => triggerSave({ deliveryChallansSettings: { dispatchWarehouse: 'HQ', requireVehicleNo: true } })}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Delivery Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoices */}
      {subTab === 'sales-invoices' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileText className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Invoices Lifecycle & Late Fees</h3>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Default Due Days</label>
                <input
                  type="number"
                  value={invDueDays}
                  onChange={(e) => setInvDueDays(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Overdue Late Interest Rate (% per month)</label>
                <input
                  type="number"
                  step="0.1"
                  value={lateFeePercent}
                  onChange={(e) => setLateFeePercent(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-800"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    invoicesSettings: { defaultDueDays: invDueDays, lateFeePercent, autoAttachPdf: true },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Invoice Rules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recurring Invoices */}
      {subTab === 'sales-recurring-invoices' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Repeat className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Recurring Invoices Auto-Billing Schedule</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Auto-Generation Dispatch Time</label>
              <input
                type="text"
                defaultValue="08:00 AM PST"
                className="w-full md:w-48 bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 font-mono font-bold"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => triggerSave({ recurringInvoicesSettings: { scheduleTime: '08:00 AM PST', maxRetryCard: 3 } })}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payments Received */}
      {subTab === 'sales-payments-received' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-800">Payments Received Reconciliation Rules</h3>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={autoApplyOldest}
                onChange={(e) => setAutoApplyOldest(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Auto-Apply Lump Sum Customer Payments to Oldest Unpaid Invoices</span>
                <span className="text-[11px] text-slate-500">Automatically settle outstanding balances chronologically</span>
              </div>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => triggerSave({ paymentsReceivedSettings: { autoApplyOldest, matchTolerance: 0.05 } })}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Reconciliation Rules
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Notes */}
      {subTab === 'sales-credit-notes' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileCheck className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Credit Notes Application Rules</h3>
          </div>

          <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
            <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
            <div>
              <span className="font-bold text-slate-800 block">Auto-Apply Unused Credit Notes to Future Invoices</span>
              <span className="text-[11px] text-slate-500">Deduct pending client credits automatically on new invoice generation</span>
            </div>
          </label>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => triggerSave({ creditNotesSettings: { autoApplyFutureInvoices: true } })}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
            >
              Save Credit Note Rules
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
