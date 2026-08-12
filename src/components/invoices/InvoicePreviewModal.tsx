import React from 'react';
import {
  Building2,
  CreditCard,
  History,
  Printer,
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
}) => {
  const { settings } = useBooks();

  if (!invoice) return null;

  const handlePrint = () => {
    try {
      window.print();
    } catch (err) {
      console.error('Window print execution error:', err);
      window.alert('The browser could not open its print dialog.');
    }
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
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer select-none"
              title="Print this browser preview"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print browser copy</span>
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
                  INVOICE PREVIEW
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
                <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Browser-rendered copy; no PO reference or digital signature is inferred.</div>
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
              {invoice.clientEmail && <p className="text-slate-500">{invoice.clientEmail}</p>}
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
              </div>

              <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30 leading-relaxed">
                No verified remittance instructions are configured. Bank details are intentionally omitted from this invoice until an audited organization payment-profile workflow is available.
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
                <span>Tax total:</span>
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

            {/* Signature status */}
            <div className="text-right space-y-2 pt-4 md:pt-0">
              <div className="inline-block max-w-xs rounded-lg border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-700 dark:bg-slate-800">
                <span className="text-[10px] font-bold uppercase text-slate-500 block tracking-wider">Signature status</span>
                <span className="text-[10px] text-slate-500 block mt-1">No verified digital signature or organization seal is recorded for this browser preview.</span>
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
