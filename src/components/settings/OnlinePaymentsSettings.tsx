import React, { useState } from 'react';
import { CreditCard, Send, CheckCircle } from 'lucide-react';
import { useBooks } from '../../context/BooksContext';

interface OnlinePaymentsSettingsProps {
  subTab: 'customer-payments' | 'vendor-payments';
}

export const OnlinePaymentsSettings: React.FC<OnlinePaymentsSettingsProps> = ({ subTab }) => {
  const { settings, updateSettings } = useBooks();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSave = (newValues: Partial<typeof settings>) => {
    updateSettings(newValues);
    setSuccessMsg('Payment Gateway settings saved!');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // State for Customer Payments
  const [stripeEnabled, setStripeEnabled] = useState(settings.paymentGateways?.stripeEnabled ?? true);
  const [stripeKey, setStripeKey] = useState(settings.paymentGateways?.stripeKey || 'pk_live_51M...');
  const [paypalEnabled, setPaypalEnabled] = useState(settings.paymentGateways?.paypalEnabled ?? true);
  const [paypalEmail, setPaypalEmail] = useState(settings.paymentGateways?.paypalEmail || 'payments@apexgrowth.com');

  // State for Vendor Payments
  const [achEnabled, setAchEnabled] = useState(settings.vendorPayouts?.achEnabled ?? true);
  const [wiseEnabled, setWiseEnabled] = useState(settings.vendorPayouts?.wiseEnabled ?? true);

  return (
    <div className="space-y-6 text-xs text-slate-700">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 p-3 rounded-xl font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Customer Payments */}
      {subTab === 'customer-payments' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Customer Online Merchant Gateways</h3>
          </div>

          <div className="space-y-4">
            {/* Stripe */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={stripeEnabled}
                  onChange={(e) => setStripeEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="font-bold text-slate-800 text-sm">Stripe Payments (Credit Cards & Apple Pay)</span>
              </label>
              <div>
                <label className="block text-slate-600 font-bold mb-1">Stripe Publishable Key</label>
                <input
                  type="text"
                  value={stripeKey}
                  onChange={(e) => setStripeKey(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded p-2 font-mono text-xs"
                />
              </div>
            </div>

            {/* PayPal */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paypalEnabled}
                  onChange={(e) => setPaypalEnabled(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="font-bold text-slate-800 text-sm">PayPal Checkout Integration</span>
              </label>
              <div>
                <label className="block text-slate-600 font-bold mb-1">PayPal Business Email Account</label>
                <input
                  type="email"
                  value={paypalEmail}
                  onChange={(e) => setPaypalEmail(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded p-2 text-xs"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    paymentGateways: { stripeEnabled, stripeKey, paypalEnabled, paypalEmail, razorpayKey: 'rzp_live', razorpayEnabled: false },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Merchant Gateways
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vendor Payments */}
      {subTab === 'vendor-payments' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Send className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Vendor Outbound Payout Channels</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={achEnabled}
                onChange={(e) => setAchEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Direct ACH Direct Deposit Payouts</span>
                <span className="text-[11px] text-slate-500">Enable direct bank transfer processing for approved vendor bills</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                checked={wiseEnabled}
                onChange={(e) => setWiseEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div>
                <span className="font-bold text-slate-800 block">Wise Global Cross-Border Payments</span>
                <span className="text-[11px] text-slate-500">Process international vendor disbursements with real-time FX rates</span>
              </div>
            </label>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() =>
                  triggerSave({
                    vendorPayouts: { achEnabled, wiseEnabled, autoBatchPayout: false },
                  })
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg cursor-pointer"
              >
                Save Payout Channels
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
