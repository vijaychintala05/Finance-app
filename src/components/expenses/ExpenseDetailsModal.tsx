import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CreditCard,
  Download,
  FileText,
  FolderKanban,
  MoreVertical,
  Paperclip,
  Printer,
  Receipt,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Expense } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { apiClient } from '../../api/client';

interface ExpenseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
}

export const ExpenseDetailsModal: React.FC<ExpenseDetailsModalProps> = ({
  isOpen,
  onClose,
  expense,
}) => {
  const { settings, deleteExpense } = useBooks();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const loadReceipts = async () => {
      if (!isOpen || !expense?.receiptAttachments?.length) {
        setReceiptUrls({});
        return;
      }
      const loaded = await Promise.all(expense.receiptAttachments.map(async (attachment) => {
        const response = await apiClient.getBlob(`/finance/expenses/${expense.id}/receipts/${attachment.id}`);
        if (!response.data) return null;
        const url = URL.createObjectURL(response.data);
        urls.push(url);
        return [attachment.id, url] as const;
      }));
      if (active) setReceiptUrls(Object.fromEntries(loaded.filter((item): item is readonly [string, string] => Boolean(item))));
    };
    void loadReceipts();
    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [expense?.id, expense?.receiptAttachments, isOpen]);

  if (!isOpen || !expense) return null;

  const handleDownloadPdf = async () => {
    if (!expense?.id) return;
    try {
      setIsDownloadingPdf(true);
      setShowMoreMenu(false);
      const res = await apiClient.getBlob(`/finance/expenses/${expense.id}/pdf`);
      if (res.data) {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ExpenseVoucher-${expense.referenceNumber || expense.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      window.alert('Failed to download expense voucher PDF: ' + (err.message || 'Unknown error'));
    } finally {
      setIsDownloadingPdf(false);
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
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Expense details
            </h3>
          </div>

          <div className="flex items-center space-x-2 relative">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
              title="Download Certified Expense Voucher PDF"
            >
              <Download className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              <span>{isDownloadingPdf ? 'Generating...' : 'Download PDF'}</span>
            </button>

            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-12 w-48 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-20">
                <button
                  onClick={handleDownloadPdf}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Download Voucher PDF</span>
                </button>

                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    window.print();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print Details</span>
                </button>

                {expense.status !== 'VOIDED' && (
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      if (confirm(`Void expense #${expense.referenceNumber} by posting an audited reversal?`)) {
                        void deleteExpense(expense.id).then(onClose).catch((error) => window.alert(error.message));
                      }
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center space-x-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Void Expense</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* DETAILS BODY */}
        <div className="p-5 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* AMOUNT & RECEIPT SECTION */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Expense Amount
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-500 font-mono tracking-tight mt-0.5">
                {expense.currency ? expense.currency : ''}{' '}
                {formatCurrency(expense.amount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                on {formatDate(expense.date)} ? Ref #{expense.referenceNumber}
              </p>
              {expense.status === 'VOIDED' && <p className="mt-2 text-xs font-bold uppercase text-slate-500">Voided by audited reversal</p>}
            </div>

            {/* Receipt Box */}
            <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-2 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
              <Paperclip className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-tight">
                {expense.receiptFileName
                  ? 'Receipt Attached'
                  : 'No Receipt'}
              </span>
              {expense.receiptAttachments?.length ? (
                <span className="text-[9px] text-emerald-600 font-bold mt-0.5">{expense.receiptAttachments.length} image{expense.receiptAttachments.length === 1 ? '' : 's'}</span>
              ) : expense.receiptFileName && (
                <span className="text-[9px] text-emerald-600 font-bold mt-0.5">Uploaded</span>
              )}
            </div>
          </div>

          {expense.receiptAttachments && expense.receiptAttachments.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Receipt images</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {expense.receiptAttachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={receiptUrls[attachment.id] || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  >
                    {receiptUrls[attachment.id] ? (
                      <img src={receiptUrls[attachment.id]} alt={attachment.fileName} className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="grid aspect-square place-items-center text-xs text-slate-400">Loading receipt?</div>
                    )}
                    <span className="block truncate px-2 py-1.5 text-[10px] font-medium text-slate-600 dark:text-slate-300">{attachment.fileName}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* BILLABLE / NON-BILLABLE TAG */}
          <div>
            <span
              className={`inline-block text-xs font-bold px-3 py-1 rounded-lg border ${
                expense.isBillable
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {expense.isBillable ? 'Billable Customer Cost' : 'Non-Billable'}
            </span>
          </div>

          {/* CATEGORY / ACCOUNT HIGHLIGHT PILL */}
          <div className="bg-sky-50/80 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-xl p-3">
            <p className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 tracking-wider">
              Expense Account / Category
            </p>
            <p className="text-sm font-bold text-sky-900 dark:text-sky-200 mt-0.5">
              {expense.accountName || 'Uncategorized Expense'}
            </p>

            {/* Itemized breakdown if present */}
            {expense.isItemized && expense.items && expense.items.length > 0 && (
              <div className="mt-3 pt-2 border-t border-sky-200/60 dark:border-sky-800 space-y-1">
                <p className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase">
                  Item Breakdown ({expense.items.length} items)
                </p>
                {expense.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-sky-900 dark:text-sky-200 font-medium">
                    <span>{it.description || `Item #${idx + 1}`} ({it.quantity} x {formatCurrency(it.unitPrice, settings.currencySymbol)})</span>
                    <span className="font-bold">{formatCurrency(it.amount, settings.currencySymbol)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* METADATA FIELDS GRID */}
          <div className="space-y-4 pt-1">
            {/* Paid Through */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Paid Through</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <span>{expense.paidFromAccountName || 'Undeposited Funds / Cash'}</span>
              </p>
            </div>

            {/* Vendor */}
            {expense.vendorName && (
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Vendor</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>{expense.vendorName}</span>
                </p>
              </div>
            )}

            {/* Customer / Project */}
            {(expense.clientName || expense.projectName) && (
              <div className="grid grid-cols-2 gap-4">
                {expense.clientName && (
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Customer</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span>{expense.clientName}</span>
                    </p>
                  </div>
                )}
                {expense.projectName && (
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Project</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-slate-400" />
                      <span>{expense.projectName}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Description Notes */}
            {expense.description && (
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Notes / Memo</p>
                <div className="mt-1 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/60 flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {expense.description}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
