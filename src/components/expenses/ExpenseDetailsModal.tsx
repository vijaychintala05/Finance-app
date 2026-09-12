import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  FolderKanban,
  ImagePlus,
  LoaderCircle,
  MoreVertical,
  Paperclip,
  Printer,
  Receipt,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Expense } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { apiClient } from '../../api/client';
import { compressReceiptImage, MAX_RECEIPT_IMAGES } from './receiptUpload';

interface ExpenseDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  expense: Expense | null;
  onEdit?: (expense: Expense) => void;
}

interface VoucherPreviewProps {
  expense: Expense;
  currencySymbol: string;
  journal?: { entryNumber: string; date: string; lines: Array<{ id: string; accountCode?: string; accountName: string; debit: number; credit: number }> };
  receiptUrls: Record<string, string>;
}

interface ExpenseEvidenceLink {
  id: string;
  command_id: string;
  command_type: string;
  command_status: string;
  source_type: string;
  source_id: string;
  relation_type: string;
  target_type: string;
  target_id: string;
  metadata?: { fileName?: string };
  created_at: string;
}

function evidenceDescription(link: ExpenseEvidenceLink): string {
  if (link.relation_type === 'POSTED_TO') return 'Posted as a balanced journal entry';
  if (link.relation_type === 'HAS_ATTACHMENT') return `Receipt attached${link.metadata?.fileName ? `: ${link.metadata.fileName}` : ''}`;
  if (link.relation_type === 'RESULTS_IN') return 'Command created this expense';
  return `${link.relation_type.replaceAll('_', ' ').toLowerCase()} ${link.target_type.replace(/([a-z])([A-Z])/g, '$1 $2')}`;
}

const VoucherPreview: React.FC<VoucherPreviewProps> = ({ expense, currencySymbol, journal, receiptUrls }) => {
  const lines = journal?.lines || [
    { id: 'expense-debit', accountCode: '', accountName: expense.accountName || 'Expense account', debit: expense.amount, credit: 0 },
    { id: 'expense-credit', accountCode: '', accountName: expense.paidFromAccountName || 'Paid-through account', debit: 0, credit: expense.amount },
  ];
  const totalDebit = lines.reduce((total, line) => total + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((total, line) => total + Number(line.credit || 0), 0);

  return (
    <div role="tabpanel" aria-label="Voucher view" className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b-4 border-blue-600 px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Expense payment voucher</p>
            <h4 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{expense.referenceNumber}</h4>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Posted on {formatDate(expense.date)}</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            {expense.status || 'POSTED'}
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-slate-200 sm:grid-cols-2 dark:bg-slate-700">
        <div className="bg-white p-5 dark:bg-slate-900">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Paid to</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{expense.vendorName || 'Direct expense / petty cash'}</p>
          {expense.invoiceNumber && <p className="mt-1 text-xs font-mono text-slate-500">Ref: {expense.invoiceNumber}</p>}
        </div>
        <div className="bg-white p-5 dark:bg-slate-900 sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total disbursed</p>
          <p className="mt-1 font-mono text-xl font-bold text-slate-950 dark:text-white">{formatCurrency(expense.amount, currencySymbol)}</p>
          <p className="mt-1 text-xs text-slate-500">From {expense.paidFromAccountName || 'paid-through account'}</p>
        </div>
      </div>

      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h5 className="text-sm font-bold text-slate-900 dark:text-white">Posting details</h5>
          {journal && <span className="text-xs font-medium text-slate-500">Posted journal</span>}
        </div>
        <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr><th className="px-3 py-2.5">Account</th><th className="px-3 py-2.5 text-right">Debit</th><th className="px-3 py-2.5 text-right">Credit</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lines.map((line) => <tr key={line.id}>
                <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-100">{line.accountCode ? `${line.accountCode} - ` : ''}{line.accountName}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-200">{line.debit ? formatCurrency(line.debit, currencySymbol) : '-'}</td>
                <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-200">{line.credit ? formatCurrency(line.credit, currencySymbol) : '-'}</td>
              </tr>)}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-bold dark:border-slate-700 dark:bg-slate-800">
              <tr><td className="px-3 py-3 text-slate-700 dark:text-slate-200">Balanced posting</td><td className="px-3 py-3 text-right font-mono">{formatCurrency(totalDebit, currencySymbol)}</td><td className="px-3 py-3 text-right font-mono">{formatCurrency(totalCredit, currencySymbol)}</td></tr>
            </tfoot>
          </table>
        </div>

        {expense.description && <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Memo</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{expense.description}</p></div>}
        {expense.receiptAttachments?.length ? <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Attached evidence</p><div className="mt-3 flex flex-wrap gap-2">{expense.receiptAttachments.map((attachment) => <a key={attachment.id} href={receiptUrls[attachment.id]} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">{receiptUrls[attachment.id] ? <img src={receiptUrls[attachment.id]} alt={attachment.fileName} className="h-full w-full object-cover" /> : <Paperclip className="m-5 h-5 w-5 text-slate-400" />}</a>)}</div></div> : null}
      </div>
    </div>
  );
};

export const ExpenseDetailsModal: React.FC<ExpenseDetailsModalProps> = ({
  isOpen,
  onClose,
  expense,
  onEdit,
}) => {
  const { settings, deleteExpense, convertExpenseToInvoice, attachExpenseReceipts, journalEntries = [] } = useBooks();
  const [currentExpense, setCurrentExpense] = useState<Expense | null>(expense);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [receiptUrls, setReceiptUrls] = useState<Record<string, string>>({});
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isConvertingToInvoice, setIsConvertingToInvoice] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'voucher' | 'activity'>('details');
  const [isAttachingReceipts, setIsAttachingReceipts] = useState(false);
  const [isReceiptDragActive, setIsReceiptDragActive] = useState(false);
  const [evidence, setEvidence] = useState<ExpenseEvidenceLink[]>([]);
  const [isEvidenceLoading, setIsEvidenceLoading] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const activeExpenseForReceipts = currentExpense || expense;

  useEffect(() => {
    setCurrentExpense(expense);
    setShowJournal(false);
    setViewMode('details');
  }, [expense]);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const loadReceipts = async () => {
      if (!isOpen || !activeExpenseForReceipts?.receiptAttachments?.length) {
        setReceiptUrls({});
        return;
      }
      const loaded = await Promise.all(activeExpenseForReceipts.receiptAttachments.map(async (attachment) => {
        const response = await apiClient.getBlob(`/finance/expenses/${activeExpenseForReceipts.id}/receipts/${attachment.id}`);
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
  }, [activeExpenseForReceipts?.id, activeExpenseForReceipts?.receiptAttachments, isOpen]);

  useEffect(() => {
    let active = true;
    const loadEvidence = async () => {
      if (!isOpen || !expense?.id) {
        setEvidence([]);
        return;
      }
      setIsEvidenceLoading(true);
      const response = await apiClient.get<{ data: ExpenseEvidenceLink[] }>(`/finance/expenses/${expense.id}/evidence`);
      if (active) {
        setEvidence(response.data?.data || []);
        setIsEvidenceLoading(false);
      }
    };
    void loadEvidence();
    return () => {
      active = false;
    };
  }, [expense?.id, isOpen]);

  if (!isOpen || !expense) return null;
  const activeExpense = currentExpense || expense;
  const postingJournal = activeExpense.journalEntryId
    ? journalEntries.find((journal) => journal.id === activeExpense.journalEntryId)
    : undefined;

  const handleConvertToInvoice = async () => {
    if (!activeExpense?.id) return;
    const confirmMsg = `Convert expense #${activeExpense.referenceNumber} (${formatCurrency(activeExpense.amount, settings.currencySymbol)}) into a customer invoice for ${activeExpense.clientName || 'the customer'}?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      setIsConvertingToInvoice(true);
      setShowMoreMenu(false);
      const res = await convertExpenseToInvoice(activeExpense.id);
      if (res?.invoice) {
        const isBilled = Boolean(res.expense?.isBilled);
        window.alert(isBilled
          ? `Successfully created Invoice #${res.invoice.invoiceNumber || res.invoice.id} for this expense!`
          : `Invoice #${res.invoice.invoiceNumber || res.invoice.id} was submitted for approval. This expense will be marked billed after the invoice is posted.`);
        setCurrentExpense((prev) => prev ? ({
          ...prev,
          isBilled,
          invoiceId: res.invoice.id,
          customerInvoiceNumber: res.invoice.invoiceNumber,
        }) : null);
      }
    } catch (err: any) {
      window.alert('Failed to convert expense to invoice: ' + (err.message || 'Unknown error'));
    } finally {
      setIsConvertingToInvoice(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!activeExpense?.id) return;
    try {
      setIsDownloadingPdf(true);
      setShowMoreMenu(false);
      const res = await apiClient.getBlob(`/finance/expenses/${activeExpense.id}/pdf`);
      if (res.data) {
        const blob = new Blob([res.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ExpenseVoucher-${activeExpense.referenceNumber || activeExpense.id}.pdf`;
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

  const handlePrintVoucher = async () => {
    if (!activeExpense?.id) return;
    const printWindow = window.open('', '_blank');
    try {
      setIsDownloadingPdf(true);
      setShowMoreMenu(false);
      const response = await apiClient.getBlob(`/finance/expenses/${activeExpense.id}/pdf`);
      if (!response.data) throw new Error(response.error || 'Voucher PDF could not be generated');
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      if (printWindow) {
        printWindow.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        URL.revokeObjectURL(url);
        throw new Error('Your browser blocked the print window. Allow pop-ups and try again.');
      }
    } catch (error: any) {
      printWindow?.close();
      window.alert('Failed to open print-ready voucher: ' + (error.message || 'Unknown error'));
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleReceiptSelection = async (files: FileList | null) => {
    if (!files?.length || !activeExpense?.id) return;
    const currentCount = activeExpense.receiptAttachments?.length || 0;
    const selected = Array.from(files);
    if (currentCount + selected.length > MAX_RECEIPT_IMAGES) {
      window.alert(`This expense can have up to ${MAX_RECEIPT_IMAGES} receipt images. ${MAX_RECEIPT_IMAGES - currentCount} slot(s) remain.`);
      return;
    }
    try {
      setIsAttachingReceipts(true);
      const attachments = await attachExpenseReceipts(activeExpense.id, await Promise.all(selected.map(compressReceiptImage)));
      setCurrentExpense((current) => current ? {
        ...current,
        receiptAttachments: [...(current.receiptAttachments || []), ...attachments],
        receiptFileName: current.receiptFileName || attachments[0]?.fileName,
      } : current);
    } catch (error: any) {
      window.alert('Receipt images could not be attached: ' + (error.message || 'Unknown error'));
    } finally {
      setIsAttachingReceipts(false);
      if (receiptInputRef.current) receiptInputRef.current.value = '';
    }
  };

  const handleReceiptDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsReceiptDragActive(false);
    void handleReceiptSelection(event.dataTransfer.files);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-lg max-w-5xl w-full overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 my-auto">
        {/* TOP BAR */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Expense details</h3>
              <p className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">{activeExpense.referenceNumber}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 relative">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => void handleReceiptSelection(event.target.files)}
            />
            {activeExpense.isBillable && !activeExpense.isBilled && activeExpense.status !== 'VOIDED' && (
              <button
                type="button"
                onClick={handleConvertToInvoice}
                disabled={isConvertingToInvoice}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                title="Convert this recoverable expense into a Customer Invoice"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isConvertingToInvoice ? 'Converting...' : 'Convert to Invoice'}</span>
              </button>
            )}

            {activeExpense.status !== 'VOIDED' && (activeExpense.receiptAttachments?.length || 0) < MAX_RECEIPT_IMAGES && (
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                disabled={isAttachingReceipts}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                title="Attach receipt images without changing this expense"
              >
                {isAttachingReceipts ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                <span>{isAttachingReceipts ? 'Adding...' : 'Add receipt'}</span>
              </button>
            )}

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
                {activeExpense.isBillable && !activeExpense.isBilled && activeExpense.status !== 'VOIDED' && (
                  <button
                    onClick={handleConvertToInvoice}
                    disabled={isConvertingToInvoice}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 flex items-center space-x-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>Convert to Invoice</span>
                  </button>
                )}

                <button
                  onClick={handleDownloadPdf}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Download className="w-4 h-4 text-slate-500" />
                  <span>Download Voucher PDF</span>
                </button>

                {activeExpense.status !== 'VOIDED' && !activeExpense.isBilled && (
                  <button
                    onClick={() => onEdit?.(activeExpense)}
                    className="w-full text-left px-4 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950 flex items-center space-x-2"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Edit & correct</span>
                  </button>
                )}

                <button
                  onClick={handlePrintVoucher}
                  className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center space-x-2"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  <span>Print voucher</span>
                </button>

                {activeExpense.status !== 'VOIDED' && (
                  <button
                    onClick={() => {
                      setShowMoreMenu(false);
                      if (confirm(`Void expense #${activeExpense.referenceNumber} by posting an audited reversal?`)) {
                        void deleteExpense(activeExpense.id).then(onClose).catch((error) => window.alert(error.message));
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

        <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-5 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div role="tablist" aria-label="Expense display mode" className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button type="button" role="tab" aria-selected={viewMode === 'details'} onClick={() => setViewMode('details')} className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === 'details' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}>Details</button>
            <button type="button" role="tab" aria-selected={viewMode === 'voucher'} onClick={() => setViewMode('voucher')} className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === 'voucher' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}>Voucher view</button>
            <button type="button" role="tab" aria-selected={viewMode === 'activity'} onClick={() => setViewMode('activity')} className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === 'activity' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700'}`}>Activity</button>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">Evidence can be added without correcting the posted record.</p>
        </div>

        {viewMode === 'voucher' && <div className="max-h-[80vh] overflow-y-auto bg-slate-50 p-5 dark:bg-slate-950"><VoucherPreview expense={activeExpense} currencySymbol={settings.currencySymbol} journal={postingJournal} receiptUrls={receiptUrls} /></div>}

        {viewMode === 'activity' && (
          <section role="tabpanel" aria-label="Expense activity" className="max-h-[80vh] overflow-y-auto p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-4 dark:border-slate-700">
              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Posting activity</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Transactional evidence for this expense.</p>
              </div>
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Transactionally current</span>
            </div>
            {isEvidenceLoading ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading evidence…</p>
            ) : evidence.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">This expense predates the evidence trail. Its accounting details remain available in the voucher view.</p>
            ) : (
              <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                {evidence.map((link) => (
                  <li key={link.id} className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{evidenceDescription(link)}</p>
                      <p className="mt-1 break-all text-xs font-mono text-slate-500 dark:text-slate-400">{link.command_type} · {link.command_id}</p>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(link.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {/* DETAILS BODY */}
        <div className={`p-5 space-y-5 max-h-[80vh] overflow-y-auto ${viewMode !== 'details' ? 'hidden' : ''}`}>
          {/* AMOUNT & RECEIPT SECTION */}
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800">
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Expense Amount
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-500 font-mono tracking-tight mt-0.5">
                {activeExpense.currency ? activeExpense.currency : ''}{' '}
                {formatCurrency(activeExpense.amount, settings.currencySymbol)}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
                on {formatDate(activeExpense.date)} • Ref #{activeExpense.referenceNumber}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${activeExpense.status === 'VOIDED' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                  {activeExpense.status === 'VOIDED' ? 'Voided' : 'Posted'}
                </span>
                {activeExpense.invoiceNumber && (
                  <span className="inline-flex max-w-full break-all rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-mono font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Vendor ref {activeExpense.invoiceNumber}
                  </span>
                )}
              </div>
              {activeExpense.status === 'VOIDED' && <p className="mt-2 text-xs font-bold uppercase text-slate-500">Voided by audited reversal</p>}
            </div>

            {/* Receipt Box */}
            <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-2 flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
              <Paperclip className="w-5 h-5 text-slate-400 mb-1" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-tight">
                {activeExpense.receiptFileName
                  ? 'Receipt Attached'
                  : 'No Receipt'}
              </span>
              {activeExpense.receiptAttachments?.length ? (
                <span className="text-[9px] text-emerald-600 font-bold mt-0.5">{activeExpense.receiptAttachments.length} image{activeExpense.receiptAttachments.length === 1 ? '' : 's'}</span>
              ) : activeExpense.receiptFileName && (
                <span className="text-[9px] text-emerald-600 font-bold mt-0.5">Uploaded</span>
              )}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
            <div className="space-y-5">
          {/* BILLABLE / NON-BILLABLE SECTION (ZOHO BOOKS RECOVERABLE WORKFLOW) */}
          <div className="rounded-lg border p-4 transition-all duration-200 bg-white dark:bg-slate-800/60 shadow-xs border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {activeExpense.isBillable ? (
                  activeExpense.isBilled ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Billed to Customer</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Billable (Unbilled)</span>
                    </span>
                  )
                ) : (
                  <span className="inline-block text-xs font-bold px-3 py-1.5 rounded-xl border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                    Non-Billable Internal Expense
                  </span>
                )}

                {activeExpense.isBillable && activeExpense.isBilled && (activeExpense.customerInvoiceNumber || activeExpense.invoiceId) && (
                  <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-2 py-1 rounded-lg">
                    Inv #{activeExpense.customerInvoiceNumber || activeExpense.invoiceId}
                  </span>
                )}
              </div>

              {activeExpense.isBillable && !activeExpense.isBilled && activeExpense.status !== 'VOIDED' && (
                <button
                  type="button"
                  id="btn-convert-expense-to-invoice"
                  onClick={handleConvertToInvoice}
                  disabled={isConvertingToInvoice}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isConvertingToInvoice ? 'Converting...' : 'Convert to Invoice'}</span>
                </button>
              )}
            </div>

            {activeExpense.isBillable && !activeExpense.isBilled && (
              <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                Paid upfront by the firm for{' '}
                <strong className="text-slate-800 dark:text-slate-200">{activeExpense.clientName || 'the customer'}</strong>. Click &ldquo;Convert to Invoice&rdquo; to recover these funds.
              </p>
            )}

            {activeExpense.isBillable && activeExpense.isBilled && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                ✓ This expense has been invoiced to the customer and locked against duplicate billing.
              </p>
            )}
          </div>

          {/* CATEGORY / ACCOUNT HIGHLIGHT PILL */}
          <div className="bg-sky-50/80 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900 rounded-lg p-3">
            <p className="text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 tracking-wider">
              Expense Account / Category
            </p>
            <p className="text-sm font-bold text-sky-900 dark:text-sky-200 mt-0.5">
              {activeExpense.accountName || 'Uncategorized Expense'}
            </p>

            {/* Itemized breakdown if present */}
            {activeExpense.isItemized && activeExpense.items && activeExpense.items.length > 0 && (
              <div className="mt-3 pt-2 border-t border-sky-200/60 dark:border-sky-800 space-y-1">
                <p className="text-[10px] font-bold text-sky-700 dark:text-sky-300 uppercase">
                  Item Breakdown ({activeExpense.items.length} items)
                </p>
                {activeExpense.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-3 text-xs text-sky-900 dark:text-sky-200 font-medium">
                    <span className="min-w-0 break-words">{it.description || it.accountName || `Item #${idx + 1}`}</span>
                    <span className="font-bold">{formatCurrency(it.amount, settings.currencySymbol)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <section className="rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Accounting impact</p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Posted as a balanced journal entry.</p>
              </div>
              {postingJournal && (
                <button
                  type="button"
                  onClick={() => setShowJournal((current) => !current)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{showJournal ? 'Hide journal' : 'Display journal'}</span>
                </button>
              )}
            </div>
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Debit</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{activeExpense.accountName || 'Expense category'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Credit</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">{activeExpense.paidFromAccountName || 'Paid-through account'}</p>
              </div>
            </div>
            {showJournal && postingJournal && (
              <div className="border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between px-4 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">Posted journal</span>
                  <span>{formatDate(postingJournal.date)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                      <tr><th className="px-4 py-2">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {postingJournal.lines.map((line) => (
                        <tr key={line.id}>
                          <td className="px-4 py-2 text-slate-700 dark:text-slate-200">{line.accountCode ? `${line.accountCode} - ` : ''}{line.accountName}</td>
                          <td className="px-4 py-2 text-right font-mono">{line.debit ? formatCurrency(line.debit, settings.currencySymbol) : '—'}</td>
                          <td className="px-4 py-2 text-right font-mono">{line.credit ? formatCurrency(line.credit, settings.currencySymbol) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
            </div>

          {/* METADATA FIELDS GRID */}
          <aside className="space-y-4 border-l-0 pt-1 lg:border-l lg:border-slate-100 lg:pl-5 lg:dark:border-slate-800">
            <section className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-700 dark:bg-slate-800/30">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Receipt images</p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Supporting evidence</p>
                </div>
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-xs dark:bg-slate-800 dark:text-slate-300">{activeExpense.receiptAttachments?.length || 0} / {MAX_RECEIPT_IMAGES}</span>
              </div>
              {activeExpense.receiptAttachments && activeExpense.receiptAttachments.length > 0 && (
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {activeExpense.receiptAttachments.map((attachment) => (
                    <a key={attachment.id} href={receiptUrls[attachment.id] || undefined} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                      {receiptUrls[attachment.id] ? <img src={receiptUrls[attachment.id]} alt={attachment.fileName} className="aspect-square w-full object-cover" /> : <div className="grid aspect-square place-items-center text-[10px] text-slate-400">Loading...</div>}
                      <span className="block truncate px-1.5 py-1 text-[9px] font-medium text-slate-600 dark:text-slate-300">{attachment.fileName}</span>
                    </a>
                  ))}
                </div>
              )}
              {activeExpense.status !== 'VOIDED' && (activeExpense.receiptAttachments?.length || 0) < MAX_RECEIPT_IMAGES && (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Drag and drop receipt images or choose images"
                  onClick={() => receiptInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      receiptInputRef.current?.click();
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsReceiptDragActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target) setIsReceiptDragActive(false);
                  }}
                  onDrop={handleReceiptDrop}
                  className={`flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                    isReceiptDragActive
                      ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950/40 dark:text-blue-200'
                      : 'border-blue-200 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-900 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700'
                  }`}
                >
                  {isAttachingReceipts ? <LoaderCircle className="h-7 w-7 animate-spin text-blue-600" /> : <ImagePlus className="h-7 w-7 text-blue-600 dark:text-blue-400" />}
                  <p className="mt-3 text-sm font-semibold">{isAttachingReceipts ? 'Adding receipt images...' : 'Drag and drop receipts here'}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">or tap to choose images</p>
                  <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">JPEG, PNG, or WebP. {MAX_RECEIPT_IMAGES - (activeExpense.receiptAttachments?.length || 0)} slot{MAX_RECEIPT_IMAGES - (activeExpense.receiptAttachments?.length || 0) === 1 ? '' : 's'} remaining.</p>
                </div>
              )}
            </section>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Payment & attribution</p>
            </div>
            {/* Paid Through */}
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Paid Through</p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <span>{activeExpense.paidFromAccountName || 'Undeposited Funds / Cash'}</span>
              </p>
            </div>

            {/* Vendor */}
            {activeExpense.vendorName && (
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Vendor</p>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>{activeExpense.vendorName}</span>
                </p>
                {activeExpense.invoiceNumber && <p className="mt-1 break-all text-xs font-mono text-slate-500 dark:text-slate-400">Invoice / receipt # {activeExpense.invoiceNumber}</p>}
              </div>
            )}

            {/* Customer / Project */}
            {(activeExpense.clientName || activeExpense.projectName) && (
              <div className="grid grid-cols-2 gap-4">
                {activeExpense.clientName && (
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Customer</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                      <User className="w-4 h-4 text-slate-400" />
                      <span>{activeExpense.clientName}</span>
                    </p>
                  </div>
                )}
                {activeExpense.projectName && (
                  <div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Project</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-slate-400" />
                      <span>{activeExpense.projectName}</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Description Notes */}
            {activeExpense.description && (
              <div>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">Notes / Memo</p>
                <div className="mt-1 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-100 dark:border-slate-700/60 flex items-start gap-2.5">
                  <FileText className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {activeExpense.description}
                  </p>
                </div>
              </div>
            )}
          </aside>
          </div>
        </div>
      </div>
    </div>
  );
};
