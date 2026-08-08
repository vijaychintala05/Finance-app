import React, { useState } from 'react';
import {
  Building2,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  Edit3,
  History,
  Mail,
  Printer,
  QrCode,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Invoice } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle } from '../../utils/formatters';

interface InvoicePreviewModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onEditRequested?: (invoice: Invoice) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice,
  onClose,
  onEditRequested,
}) => {
  const { settings, recordPayment } = useBooks();

  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [copiedBankInfo, setCopiedBankInfo] = useState(false);
  const [emailNotification, setEmailNotification] = useState<string | null>(null);

  if (!invoice) return null;

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(paymentAmount);
    if (amt <= 0) return;

    recordPayment(invoice.id, amt);
    setPaymentAmount('');
    setShowPaymentForm(false);
  };

  const handleCopyBankDetails = () => {
    const bankDetails = `Bank: Chase Commercial Banking\nAccount Name: ${settings.firmName}\nAccount No: 1000-8849-2026-X\nRouting/IFSC: CHASUS33\nSWIFT: CHASUS33XXX\nInvoice Ref: ${invoice.invoiceNumber}`;
    navigator.clipboard?.writeText(bankDetails);
    setCopiedBankInfo(true);
    setTimeout(() => setCopiedBankInfo(false), 2500);
  };

  const handleSendEmailBill = () => {
    setEmailNotification(`Bill statement successfully sent to ${invoice.clientEmail || 'client'}`);
    setTimeout(() => setEmailNotification(null), 3000);
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch (err) {
      console.error('Window print execution error:', err);
      handleDownloadBillHTML();
    }
  };

  const handleDownloadBillHTML = () => {
    const printableArea = document.getElementById('printable-bill-area');
    if (!printableArea) return;

    const htmlDocument = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoiceNumber} - ${invoice.clientName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #ffffff !important; color: #000000 !important; padding: 20px; }
    @media print {
      .no-print { display: none !important; }
    }
  </style>
</head>
<body class="bg-white text-slate-900 p-8">
  <div class="max-w-4xl mx-auto border border-slate-200 p-8 rounded-2xl shadow-sm">
    ${printableArea.innerHTML}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 500);
    };
  </script>
</body>
</html>`;

    const blob = new Blob([htmlDocument], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Invoice_${invoice.invoiceNumber}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl print:max-h-none print:shadow-none print:border-none print:rounded-none">
        
        {/* Modal Top Action Bar (Hidden when printing) */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center bg-slate-50 dark:bg-slate-800/60 gap-3 print:hidden">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400">
              {invoice.invoiceNumber}
            </span>
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded-full border font-semibold ${getStatusBadgeStyle(
                invoice.status
              )}`}
            >
              {invoice.status}
            </span>
            {emailNotification && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center space-x-1 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{emailNotification}</span>
              </span>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {invoice.balanceDue > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPaymentAmount(String(invoice.balanceDue));
                  setShowPaymentForm(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 cursor-pointer shadow-xs select-none"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Record Payment</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onClose();
                if (onEditRequested) onEditRequested(invoice);
              }}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 shadow-xs cursor-pointer select-none"
              title="Edit invoice details and record revision reason"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Invoice</span>
            </button>

            <button
              type="button"
              onClick={handleSendEmailBill}
              className="px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 rounded-lg text-xs font-medium flex items-center space-x-1 border border-slate-200 dark:border-slate-700 cursor-pointer select-none"
              title="Email bill statement to client"
            >
              <Send className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Email Bill</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer select-none"
              title="Print invoice or save as PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadBillHTML}
              className="px-3 py-1.5 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 rounded-lg text-xs font-medium flex items-center space-x-1 border border-slate-200 dark:border-slate-700 cursor-pointer select-none"
              title="Download standalone HTML invoice file"
            >
              <Download className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">Download Bill</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800"
              title="Close window"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Record Payment Banner if active */}
        {showPaymentForm && (
          <form
            onSubmit={handleRecordPayment}
            className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs print:hidden"
          >
            <div>
              <span className="font-bold text-emerald-800 dark:text-emerald-300 block">
                Record Client Payment
              </span>
              <p className="text-slate-600 dark:text-slate-400">
                Direct entry towards remaining balance of {formatCurrency(invoice.balanceDue, settings.currencySymbol)}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400 font-bold">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-6 pr-2 py-1.5 text-xs font-bold w-32"
                />
              </div>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 px-3 rounded-lg text-xs cursor-pointer shadow-sm"
              >
                Confirm Payment
              </button>
              <button
                type="button"
                onClick={() => setShowPaymentForm(false)}
                className="text-slate-500 hover:underline"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Printable Bill Document Body */}
        <div id="printable-bill-area" className="p-6 sm:p-10 overflow-y-auto flex-1 space-y-8 text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 print:p-0 print:overflow-visible">
          
          {/* Header & Logo */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b border-slate-200 dark:border-slate-800 pb-6 gap-6">
            <div className="space-y-1.5 max-w-md">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-bold text-white shadow-md">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                    {settings.firmName}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {settings.logoText || 'Tax, Accounting & Business Services'}
                  </p>
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {settings.firmAddress}
              </p>
              <p className="text-slate-500 font-mono text-[11px]">
                Email: {settings.firmEmail} • Phone: {settings.firmPhone}
              </p>
              <p className="text-slate-500 font-medium">
                Tax ID / GSTIN / TIN: <span className="font-mono text-slate-700 dark:text-slate-300">{settings.taxId}</span>
              </p>
            </div>

            <div className="sm:text-right space-y-2">
              <div className="inline-block bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  TAX INVOICE & BILL
                </h1>
              </div>

              <div className="font-mono text-base font-bold text-blue-600 dark:text-blue-400">
                {invoice.invoiceNumber}
              </div>

              <div className="text-slate-600 dark:text-slate-400 space-y-1 text-xs">
                <div className="flex justify-start sm:justify-end space-x-2">
                  <span className="text-slate-400 font-medium">Issue Date:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{formatDate(invoice.issueDate)}</span>
                </div>
                <div className="flex justify-start sm:justify-end space-x-2">
                  <span className="text-slate-400 font-medium">Due Date:</span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">{formatDate(invoice.dueDate)}</span>
                </div>
                <div className="flex justify-start sm:justify-end space-x-2">
                  <span className="text-slate-400 font-medium">Ref / PO #:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">PO-{invoice.id.slice(-6).toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Billed From / Billed To Dual Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-extrabold tracking-wider block mb-1">
                BILLED BY (ISSUER)
              </span>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                {settings.firmName}
              </h3>
              <p className="text-slate-500">{settings.firmAddress}</p>
              <p className="text-slate-500">{settings.firmEmail}</p>
              <p className="text-slate-500">Tax Reg: {settings.taxId}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1">
              <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-extrabold tracking-wider block mb-1">
                BILLED TO (CLIENT)
              </span>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                {invoice.clientName}
              </h3>
              <p className="text-slate-500">{invoice.clientEmail || 'billing@client.com'}</p>
              {invoice.projectName && (
                <p className="text-slate-600 dark:text-slate-400 font-medium">
                  Project: <span className="font-semibold text-slate-800 dark:text-slate-200">{invoice.projectName}</span>
                </p>
              )}
              <p className="text-slate-500">Currency: {settings.currencyCode} ({settings.currencySymbol})</p>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="p-3 pl-4">#</th>
                  <th className="p-3">Item Description</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Unit Price</th>
                  <th className="p-3 text-right">Tax Rate</th>
                  <th className="p-3 text-right pr-4">Line Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                {invoice.items.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="p-3 pl-4 font-mono text-slate-400">{idx + 1}</td>
                    <td className="p-3 font-medium text-slate-900 dark:text-slate-100">
                      {item.description}
                    </td>
                    <td className="p-3 text-center font-semibold text-slate-700 dark:text-slate-300">
                      {item.quantity}
                    </td>
                    <td className="p-3 text-right text-slate-700 dark:text-slate-300 font-mono">
                      {formatCurrency(item.unitPrice, settings.currencySymbol)}
                    </td>
                    <td className="p-3 text-right text-slate-500 font-mono">
                      {item.taxRate}%
                    </td>
                    <td className="p-3 text-right pr-4 font-bold font-mono text-slate-900 dark:text-slate-100">
                      {formatCurrency(item.amount, settings.currencySymbol)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Totals & Remittance Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            
            {/* Bank Payment Remittance Instructions */}
            <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-xs text-blue-900 dark:text-blue-300 flex items-center space-x-1.5">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                  <span>Direct Remittance & Payment Methods</span>
                </span>
                <button
                  onClick={handleCopyBankDetails}
                  className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline flex items-center space-x-1 cursor-pointer print:hidden"
                >
                  {copiedBankInfo ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Bank Details</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300 font-mono bg-white dark:bg-slate-900 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Bank Name:</span>
                  <span className="font-bold">Chase Commercial Banking</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">A/C Holder:</span>
                  <span>{settings.firmName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Account No:</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">1000-8849-2026-X</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Routing / IFSC:</span>
                  <span>CHASUS33</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">SWIFT Code:</span>
                  <span>CHASUS33XXX</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-[10px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Please include invoice reference <strong>{invoice.invoiceNumber}</strong> with wire/ACH payment.</span>
              </div>
            </div>

            {/* Calculations Breakdown Box */}
            <div className="space-y-2 text-xs border-t md:border-t-0 pt-3 md:pt-0">
              <div className="flex justify-between text-slate-600 dark:text-slate-400 py-1">
                <span>Subtotal Amount:</span>
                <span className="font-semibold font-mono">{formatCurrency(invoice.subtotal, settings.currencySymbol)}</span>
              </div>

              <div className="flex justify-between text-slate-600 dark:text-slate-400 py-1">
                <span>Tax Breakdown ({settings.defaultTaxRate}%):</span>
                <span className="font-semibold font-mono">{formatCurrency(invoice.taxTotal, settings.currencySymbol)}</span>
              </div>

              {invoice.discount > 0 && (
                <div className="flex justify-between text-rose-500 py-1">
                  <span>Discount Applied:</span>
                  <span className="font-semibold font-mono">-{formatCurrency(invoice.discount, settings.currencySymbol)}</span>
                </div>
              )}

              <div className="flex justify-between border-t border-slate-200 dark:border-slate-800 pt-2 font-bold text-sm text-slate-900 dark:text-slate-100">
                <span>Grand Total Amount:</span>
                <span className="font-mono">{formatCurrency(invoice.totalAmount, settings.currencySymbol)}</span>
              </div>

              <div className="flex justify-between text-emerald-600 font-semibold py-1">
                <span>Total Payments Received:</span>
                <span className="font-mono">-{formatCurrency(invoice.paidAmount, settings.currencySymbol)}</span>
              </div>

              <div className="flex justify-between p-3 rounded-xl bg-blue-50 dark:bg-slate-800 text-blue-900 dark:text-white border border-blue-200 dark:border-slate-700 font-bold text-sm shadow-2xs">
                <span>Balance Due:</span>
                <span className="text-blue-700 dark:text-amber-400 font-mono text-base">
                  {formatCurrency(invoice.balanceDue, settings.currencySymbol)}
                </span>
              </div>
            </div>

          </div>

          {/* Notes, Terms & Digital Signature Block */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div className="space-y-3 text-[11px] text-slate-600 dark:text-slate-400">
              {invoice.notes && (
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">
                    Notes to Customer:
                  </span>
                  <p>{invoice.notes}</p>
                </div>
              )}
              {invoice.terms && (
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">
                    Terms & Conditions:
                  </span>
                  <p>{invoice.terms}</p>
                </div>
              )}
            </div>

            {/* Authorized Signature & Seal */}
            <div className="text-right space-y-2 pt-4 md:pt-0">
              <div className="inline-block text-center space-y-1">
                <div className="w-36 h-12 border-b-2 border-slate-300 dark:border-slate-700 mx-auto flex items-end justify-center pb-1">
                  <span className="font-serif italic text-slate-500 font-bold text-xs select-none">
                    {settings.firmName}
                  </span>
                </div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block tracking-wider">
                  AUTHORIZED SIGNATORY & STAMP
                </span>
                <span className="text-[9px] text-slate-400 block">
                  Accounts Receivable & Compliance Division
                </span>
              </div>
            </div>
          </div>

          {/* Edit History Audit Log */}
          {invoice.editHistory && invoice.editHistory.length > 0 && (
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3 print:break-inside-avoid">
              <div className="flex items-center space-x-2 text-slate-800 dark:text-slate-200 font-bold text-xs">
                <History className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Invoice Revision & Edit History Log ({invoice.editHistory.length} revision{invoice.editHistory.length > 1 ? 's' : ''})</span>
              </div>
              <div className="space-y-2.5">
                {invoice.editHistory.map((hist, idx) => (
                  <div
                    key={hist.id || idx}
                    className="bg-amber-50/60 dark:bg-slate-800/80 border border-amber-200/80 dark:border-slate-700 p-3 rounded-xl text-xs space-y-1 shadow-2xs"
                  >
                    <div className="flex flex-wrap justify-between items-center text-slate-500 dark:text-slate-400 text-[11px] gap-1">
                      <span className="font-semibold text-amber-900 dark:text-amber-300 flex items-center space-x-1">
                        <span>Revision #{idx + 1}</span>
                        {hist.editedBy && <span>• {hist.editedBy}</span>}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{hist.editedAt}</span>
                    </div>
                    <div className="text-slate-800 dark:text-slate-200">
                      <span className="font-bold text-slate-600 dark:text-slate-400">Reason for edit: </span>
                      <span className="italic font-medium text-slate-900 dark:text-slate-100">"{hist.reason}"</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                      <span>Total Changed:</span>
                      <span className="font-mono line-through text-slate-400">{formatCurrency(hist.previousTotal, settings.currencySymbol)}</span>
                      <span>&rarr;</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(hist.newTotal, settings.currencySymbol)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
