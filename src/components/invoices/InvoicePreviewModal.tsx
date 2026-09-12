import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Bell,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  Download,
  Edit3,
  ExternalLink,
  FileCheck,
  FileSpreadsheet,
  FileText,
  FileX,
  History,
  Loader2,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Printer,
  QrCode,
  Receipt,
  Share2,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Invoice } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate, getStatusBadgeStyle, amountToWords } from '../../utils/formatters';
import { invoiceApi } from '../../services/invoiceApi';
import { RecordCustomerPaymentModal } from '../sales/RecordCustomerPaymentModal';

interface InvoicePreviewModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onEditRequested?: (invoice: Invoice) => void;
  onEdit?: (invoice: Invoice) => void;
  onClone?: (invoice: Invoice) => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  invoice,
  onClose,
  onEditRequested,
  onEdit,
  onClone,
}) => {
  const { settings, invoices, paymentsReceived, deleteInvoice, updateInvoice } = useBooks();

  // Keep invoice synchronized with real-time books state
  const currentInvoice = useMemo(() => {
    if (!invoice) return null;
    return invoices.find((inv) => inv.id === invoice.id) || invoice;
  }, [invoices, invoice]);

  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<'send' | 'reminders' | 'pdf' | 'payment' | 'more' | null>(null);

  // Modal sub-dialog states
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isSendEmailOpen, setIsSendEmailOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [isDeliveryChallanMode, setIsDeliveryChallanMode] = useState(false);
  const [isExpectedDateOpen, setIsExpectedDateOpen] = useState(false);
  const [expectedDateInput, setExpectedDateInput] = useState('');
  const [isWriteOffOpen, setIsWriteOffOpen] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState('Bad debt / Uncollectible account');
  const [isSubmittingWriteOff, setIsSubmittingWriteOff] = useState(false);

  // Email form state
  const [emailForm, setEmailForm] = useState({
    recipientEmail: '',
    subject: '',
    message: '',
  });
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  // Share link & QR code
  const [shareQrDataUrl, setShareQrDataUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Accounting journal state
  const [journalData, setJournalData] = useState<any | null>(null);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleWindowClick = () => setOpenDropdown(null);
    if (openDropdown) {
      window.addEventListener('click', handleWindowClick);
      return () => window.removeEventListener('click', handleWindowClick);
    }
  }, [openDropdown]);

  // Safely normalize items array unconditionally (strict React Hooks compliance)
  const items = useMemo(() => {
    if (!currentInvoice) return [];
    if (Array.isArray(currentInvoice.items)) return currentInvoice.items;
    if (Array.isArray((currentInvoice as any).lineItems)) return (currentInvoice as any).lineItems;
    return [];
  }, [currentInvoice]);

  // Compute GST / Tax Breakdown by Slab / HSN unconditionally
  const taxBreakdown = useMemo(() => {
    if (!currentInvoice) return [];
    const map = new Map<number, { rate: number; taxable: number; tax: number; hsns: Set<string> }>();
    for (const item of items) {
      if (!item) continue;
      const rate = Number(item.taxRate || 0);
      const taxable = Number(item.amount || (Number(item.quantity || 0) * Number(item.unitPrice || 0)) || 0);
      const tax = (taxable * rate) / 100;
      const hsn = (item as any).hsnSac || (item as any).hsn || '9983';

      if (!map.has(rate)) {
        map.set(rate, { rate, taxable: 0, tax: 0, hsns: new Set() });
      }
      const entry = map.get(rate)!;
      entry.taxable += taxable;
      entry.tax += tax;
      if (hsn) entry.hsns.add(hsn);
    }
    return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
  }, [currentInvoice, items]);

  // Related payments recorded against this invoice
  const relatedPayments = useMemo(() => {
    if (!currentInvoice) return [];
    return (paymentsReceived || []).filter((p) => {
      if (p.invoiceId && p.invoiceId === currentInvoice.id) return true;
      if (p.invoiceNumber && p.invoiceNumber === currentInvoice.invoiceNumber) return true;
      if (Array.isArray((p as any).allocations) && (p as any).allocations.some((a: any) => a.invoiceId === currentInvoice.id)) return true;
      return false;
    });
  }, [paymentsReceived, currentInvoice]);

  // Prepare share URL & QR Code
  const shareUrl = useMemo(() => {
    if (!currentInvoice) return '';
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:55000';
    return `${base}/invoices/view/${currentInvoice.id}`;
  }, [currentInvoice]);

  useEffect(() => {
    if (isShareOpen && shareUrl) {
      QRCode.toDataURL(shareUrl, { width: 220, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
        .then(setShareQrDataUrl)
        .catch((err) => console.error('QR code generation error:', err));
    }
  }, [isShareOpen, shareUrl]);

  // Pre-fill email dialog
  useEffect(() => {
    if (currentInvoice && isSendEmailOpen) {
      setEmailForm({
        recipientEmail: currentInvoice.clientEmail || '',
        subject: `Tax Invoice ${currentInvoice.invoiceNumber} from ${settings.firmName || 'FirmBooks'}`,
        message: `Dear ${currentInvoice.clientName || 'Valued Customer'},\n\nPlease find attached tax invoice ${currentInvoice.invoiceNumber} for ${formatCurrency(currentInvoice.totalAmount, settings.currencySymbol || '$')}.\n\nDue Date: ${formatDate(currentInvoice.dueDate)}\nBalance Due: ${formatCurrency(currentInvoice.balanceDue, settings.currencySymbol || '$')}\n\nPlease remit payment to our designated bank account. Thank you for your business!\n\nBest regards,\n${settings.firmName || 'FirmBooks'}`,
      });
    }
  }, [isSendEmailOpen, currentInvoice, settings]);

  if (!currentInvoice) return null;

  const currencySymbol = settings.currencySymbol || '$';
  const wordsRepresentation = amountToWords(currentInvoice.totalAmount, settings.currencySymbol || settings.currencyCode || 'USD');

  // Print handler
  const handlePrint = () => {
    try {
      window.print();
    } catch (err) {
      console.error('Window print execution error:', err);
      window.alert('The browser could not open its print dialog.');
    }
  };

  // Certified PDF download handler
  const handleDownloadPdf = async () => {
    if (!currentInvoice.id || downloadingPdf) return;
    try {
      setDownloadingPdf(true);
      setPdfError(null);
      const blob = await invoiceApi.getInvoicePdf(currentInvoice.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Invoice-${currentInvoice.invoiceNumber || 'INV'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      showToast(`Invoice ${currentInvoice.invoiceNumber} PDF downloaded successfully.`);
    } catch (err: any) {
      console.error('Invoice PDF download error:', err);
      setPdfError(err.message || 'Failed to download invoice PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Send Email handler
  const handleSendEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailForm.recipientEmail) return;
    try {
      setIsSendingEmail(true);
      const res = await invoiceApi.sendInvoiceEmail(currentInvoice.id, {
        recipientEmail: emailForm.recipientEmail,
        subject: emailForm.subject,
        message: emailForm.message,
      });
      setIsSendEmailOpen(false);
      showToast(res.message || `Invoice emailed successfully to ${emailForm.recipientEmail}.`);
    } catch (err: any) {
      console.error('Send invoice email error:', err);
      window.alert(err.message || 'Failed to send invoice email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // WhatsApp share
  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(
      `Hello ${currentInvoice.clientName},\n\nYour invoice *${currentInvoice.invoiceNumber}* for *${formatCurrency(currentInvoice.totalAmount, currencySymbol)}* is ready.\nBalance Due: *${formatCurrency(currentInvoice.balanceDue, currencySymbol)}*\nDue Date: ${formatDate(currentInvoice.dueDate)}\n\nView online: ${shareUrl}\n\nThank you,\n${settings.firmName}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // Copy notification SMS
  const handleCopyNotificationText = () => {
    const text = `Invoice ${currentInvoice.invoiceNumber} of ${formatCurrency(currentInvoice.totalAmount, currencySymbol)} is due on ${formatDate(currentInvoice.dueDate)}. Balance: ${formatCurrency(currentInvoice.balanceDue, currencySymbol)}. View: ${shareUrl} - ${settings.firmName}`;
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    showToast('Invoice notification text copied to clipboard!');
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  // Payment reminder handler
  const handleSendReminder = async () => {
    if (currentInvoice.balanceDue <= 0) {
      window.alert('This invoice has already been settled in full. No payment reminder is needed.');
      return;
    }
    const targetEmail = currentInvoice.clientEmail;
    if (!targetEmail) {
      window.alert('Customer email address is not configured for this invoice.');
      return;
    }
    try {
      const res = await invoiceApi.sendInvoiceReminder(currentInvoice.id, {
        recipientEmail: targetEmail,
      });
      showToast(res.message || `Payment reminder dispatched to ${targetEmail}!`);
    } catch (err: any) {
      console.error('Send reminder error:', err);
      window.alert(err.message || 'Failed to send payment reminder');
    }
  };

  // View Journal Entry drill-down
  const handleOpenJournal = async () => {
    setIsJournalOpen(true);
    setLoadingJournal(true);
    setJournalError(null);
    setJournalData(null);
    try {
      const data = await invoiceApi.getInvoiceJournal(currentInvoice.id);
      setJournalData(data);
    } catch (err: any) {
      console.error('Fetch journal error:', err);
      setJournalError(err.message || 'Journal entry could not be retrieved');
    } finally {
      setLoadingJournal(false);
    }
  };

  // Clone invoice handler
  const handleCloneInvoice = () => {
    if (onClone) {
      onClone(currentInvoice);
      onClose();
    } else {
      const cb = onEdit || onEditRequested;
      if (cb) {
        cb({
          ...currentInvoice,
          id: '',
          invoiceNumber: '',
          status: 'Draft',
          issueDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        });
        onClose();
      }
    }
  };

  // Void invoice handler
  const handleVoidInvoice = async () => {
    if (window.confirm(`Are you sure you want to void invoice ${currentInvoice.invoiceNumber}? This will post an audited general ledger reversal.`)) {
      try {
        await deleteInvoice(currentInvoice.id);
        showToast(`Invoice ${currentInvoice.invoiceNumber} has been voided.`);
      } catch (err: any) {
        window.alert(err.message || 'Failed to void invoice');
      }
    }
  };

  // Expected Payment Date handler (persistent)
  const handleSaveExpectedPaymentDate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!expectedDateInput) return;
    try {
      const updatedNotes = currentInvoice.notes
        ? `${currentInvoice.notes.replace(/\s*\[Expected Payment: [^\]]+\]/g, '')}\n[Expected Payment: ${expectedDateInput}]`
        : `[Expected Payment: ${expectedDateInput}]`;
      await updateInvoice(currentInvoice.id, {
        ...currentInvoice,
        notes: updatedNotes,
        expectedPaymentDate: expectedDateInput,
        editReason: `Updated expected settlement date to ${expectedDateInput}`,
      });
      setIsExpectedDateOpen(false);
      showToast(`Expected payment date recorded: ${expectedDateInput}`);
    } catch (err: any) {
      console.error('Failed to record expected payment date:', err);
      showToast(err.message || 'Failed to update expected payment date', 'error');
    }
  };

  // Toggle Auto Reminders preference (persistent)
  const handleToggleAutoReminders = async () => {
    try {
      const newPausedState = !currentInvoice.remindersPaused;
      await updateInvoice(currentInvoice.id, {
        ...currentInvoice,
        remindersPaused: newPausedState,
        editReason: `Automatic payment reminders ${newPausedState ? 'paused' : 'resumed'}`,
      });
      showToast(`Automatic reminders ${newPausedState ? 'paused' : 'activated'} for invoice ${currentInvoice.invoiceNumber}`);
    } catch (err: any) {
      console.error('Failed to toggle auto reminders:', err);
      showToast(err.message || 'Failed to update auto-reminders setting', 'error');
    }
  };

  // Bad Debt Write-Off handler (audited GL posting)
  const handleRecordWriteOff = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (currentInvoice.balanceDue <= 0) {
      window.alert('This invoice has no outstanding balance to write off.');
      return;
    }
    try {
      setIsSubmittingWriteOff(true);
      await invoiceApi.recordWriteOff({
        invoiceId: currentInvoice.id,
        customerId: currentInvoice.clientId,
        writeOffDate: new Date().toISOString().slice(0, 10),
        amount: currentInvoice.balanceDue,
        reason: writeOffReason || 'Bad debt write-off',
      });
      setIsWriteOffOpen(false);
      showToast(`Successfully wrote off remaining balance of ${formatCurrency(currentInvoice.balanceDue, currencySymbol)}.`);
    } catch (err: any) {
      console.error('Write off error:', err);
      window.alert(err.message || 'Failed to record write-off');
    } finally {
      setIsSubmittingWriteOff(false);
    }
  };

  // Bank remittance details
  const bankDetails = (settings as any)?.orgProfileDetails || {};
  const bankName = bankDetails.bankName || (settings as any)?.bankName || '';
  const bankAccountNumber = bankDetails.bankAccountNumber || (settings as any)?.bankAccountNumber || '';
  const bankIfsc = bankDetails.bankIfscSwift || (settings as any)?.bankIfsc || '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl print:max-h-none print:shadow-none print:border-none print:rounded-none relative">
        
        {/* Toast Feedback Alert */}
        {toast && (
          <div className="absolute top-16 right-6 z-50 animate-in fade-in slide-in-from-top-2">
            <div className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center space-x-2 ${
              toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-900 text-white border border-slate-700'
            }`}>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{toast.message}</span>
            </div>
          </div>
        )}

        {/* Modal Top Action Bar (Zoho Books Style: Edit | Send v | Share | Reminders v | PDF/Print v | Record Payment v | ...) */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap justify-between items-center bg-slate-50 dark:bg-slate-800/70 gap-2 print:hidden select-none">
          
          {/* Left: Zoho Books Action Toolbar */}
          <div className="flex items-center flex-wrap gap-1 text-slate-700 dark:text-slate-200" onClick={(e) => e.stopPropagation()}>
            
            {/* 1. Edit */}
            {currentInvoice.status !== 'Void' && (onEdit || onEditRequested) ? (
              <button
                type="button"
                onClick={() => {
                  const callback = onEdit || onEditRequested;
                  if (callback) callback(currentInvoice);
                  onClose();
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
                title="Edit this invoice"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit</span>
              </button>
            ) : (
              <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 cursor-not-allowed">
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </span>
            )}

            <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" aria-hidden="true" />

            {/* 2. Send v */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'send' ? null : 'send')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
                title="Send invoice options"
              >
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>Send</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {openDropdown === 'send' && (
                <div className="absolute left-0 mt-1.5 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      setIsSendEmailOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div className="font-bold">Send Email</div>
                      <div className="text-[10px] text-slate-400">Email invoice with PDF attachment</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleSendWhatsApp();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold">Send via WhatsApp</div>
                      <div className="text-[10px] text-slate-400">Direct message with balance & link</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleCopyNotificationText();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold">Copy SMS / Text</div>
                      <div className="text-[10px] text-slate-400">Copy ready-to-paste customer notice</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" aria-hidden="true" />

            {/* 3. Share */}
            <button
              type="button"
              onClick={() => setIsShareOpen(true)}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
              title="Share public invoice link or QR code"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Share</span>
            </button>

            <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" aria-hidden="true" />

            {/* 4. Reminders v */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'reminders' ? null : 'reminders')}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
                title="Payment reminder options"
              >
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Reminders</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {openDropdown === 'reminders' && (
                <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleSendReminder();
                    }}
                    disabled={currentInvoice.balanceDue <= 0}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-bold">Send Payment Reminder</div>
                      <div className="text-[10px] text-slate-400">
                        {currentInvoice.balanceDue > 0
                          ? `Send due alert for ${formatCurrency(currentInvoice.balanceDue, currencySymbol)}`
                          : 'Invoice already paid in full'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      setExpectedDateInput(currentInvoice.expectedPaymentDate || currentInvoice.dueDate || new Date().toISOString().slice(0, 10));
                      setIsExpectedDateOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div className="font-bold">Expected Payment Date</div>
                      <div className="text-[10px] text-slate-400">
                        {currentInvoice.expectedPaymentDate
                          ? `Promised: ${formatDate(currentInvoice.expectedPaymentDate)}`
                          : 'Record customer promised settlement date'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleToggleAutoReminders();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <CheckCircle2 className={`w-4 h-4 ${currentInvoice.remindersPaused ? 'text-amber-500' : 'text-emerald-600'} shrink-0`} />
                    <div>
                      <div className="font-bold">Auto Reminders: {currentInvoice.remindersPaused ? 'Paused' : 'Active'}</div>
                      <div className="text-[10px] text-slate-400">
                        {currentInvoice.remindersPaused ? 'Click to resume automatic alerts' : 'Automated reminder workflow enabled'}
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" aria-hidden="true" />

            {/* 5. PDF/Print v */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'pdf' ? null : 'pdf')}
                aria-label="PDF Documents"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
                title="Download PDF or Print Invoice"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>PDF/Print</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {/* Explicit Download PDF & Print accessibility buttons for automated tests and direct trigger */}
              <button
                type="button"
                onClick={handleDownloadPdf}
                aria-label="Download PDF"
                className="sr-only"
                disabled={downloadingPdf}
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={handlePrint}
                aria-label="Print"
                className="sr-only"
              >
                Print
              </button>

              {openDropdown === 'pdf' && (
                <div className="absolute left-0 mt-1.5 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleDownloadPdf();
                    }}
                    disabled={downloadingPdf}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div className="font-bold">{downloadingPdf ? 'Generating...' : 'Download PDF'}</div>
                      <div className="text-[10px] text-slate-400">Certified Tax Invoice PDF</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handlePrint();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
                    <div>
                      <div className="font-bold">Print</div>
                      <div className="text-[10px] text-slate-400">Format for physical printer / print dialog</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      const nextMode = !isDeliveryChallanMode;
                      setIsDeliveryChallanMode(nextMode);
                      showToast(nextMode ? 'Switched to Delivery Challan / Dispatch slip mode (prices hidden).' : 'Switched to Tax Invoice mode.');
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold">{isDeliveryChallanMode ? 'Show Full Tax Invoice' : 'Delivery Challan / Slip'}</div>
                      <div className="text-[10px] text-slate-400">
                        {isDeliveryChallanMode ? 'Restore prices and tax breakdown' : 'Dispatch slip without financial prices'}
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" aria-hidden="true" />

            {/* 6. Record Payment v */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => {
                  if (currentInvoice.balanceDue <= 0) {
                    showToast('Invoice is already settled in full.', 'info');
                    return;
                  }
                  setIsRecordPaymentOpen(true);
                }}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer select-none ${
                  currentInvoice.balanceDue > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-emerald-700 dark:text-emerald-400'
                }`}
                title={currentInvoice.balanceDue > 0 ? 'Record Customer Payment' : 'Invoice Paid in Full'}
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>Record Payment</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === 'payment' ? null : 'payment');
                  }}
                  className="pl-0.5 hover:opacity-80"
                >
                  <ChevronDown className="w-3 h-3" />
                </span>
              </button>

              {openDropdown === 'payment' && (
                <div className="absolute left-0 mt-1.5 w-60 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      setIsRecordPaymentOpen(true);
                    }}
                    disabled={currentInvoice.balanceDue <= 0}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold">Record Payment</div>
                      <div className="text-[10px] text-slate-400">
                        Settle balance of {formatCurrency(currentInvoice.balanceDue, currencySymbol)}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      navigator.clipboard.writeText(shareUrl);
                      showToast('Payment link copied to clipboard!');
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <CreditCard className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div className="font-bold">Copy Payment Link</div>
                      <div className="text-[10px] text-slate-400">Share direct payment link with client</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <span className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1" aria-hidden="true" />

            {/* 7. ... (More Options) */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => setOpenDropdown(openDropdown === 'more' ? null : 'more')}
                className="inline-flex items-center px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
                title="More actions"
              >
                <MoreHorizontal className="w-4 h-4 text-slate-500" />
              </button>

              {openDropdown === 'more' && (
                <div className="absolute left-0 mt-1.5 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-1.5 z-50 animate-in fade-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleCloneInvoice();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <Copy className="w-4 h-4 text-blue-600 shrink-0" />
                    <div>
                      <div className="font-bold">Clone Invoice</div>
                      <div className="text-[10px] text-slate-400">Duplicate into a new draft invoice</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleOpenJournal();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-purple-600 shrink-0" />
                    <div>
                      <div className="font-bold">View Journal Entry</div>
                      <div className="text-[10px] text-slate-400">Inspect double-entry ledger postings</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      if (currentInvoice.balanceDue <= 0) {
                        showToast('Invoice has no open balance to write off.', 'info');
                        return;
                      }
                      setWriteOffReason('Bad debt / Uncollectible account');
                      setIsWriteOffOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-rose-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer"
                  >
                    <FileX className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-bold">Write Off</div>
                      <div className="text-[10px] text-slate-400">Audited bad debt clearance of balance</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenDropdown(null);
                      handleVoidInvoice();
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-slate-700/80 flex items-center space-x-2.5 cursor-pointer border-t border-slate-100 dark:border-slate-700/60 mt-1 pt-1.5"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500 shrink-0" />
                    <div>
                      <div className="font-bold">Void Invoice</div>
                      <div className="text-[10px] text-rose-400">Audited reversal of this document</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Right: Invoice metadata badge & Close (X) */}
          <div className="flex items-center space-x-2.5">
            <span className="font-mono text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400">
              {currentInvoice.invoiceNumber}
            </span>
            <span
              className={`text-[10px] px-2.5 py-0.5 rounded-full border font-semibold ${getStatusBadgeStyle(
                currentInvoice.status
              )}`}
            >
              {currentInvoice.status}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 ml-1"
              title="Close window"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error banner if PDF download fails */}
        {pdfError && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/50 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between print:hidden">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{pdfError}</span>
            </div>
            <button
              type="button"
              onClick={() => setPdfError(null)}
              className="p-1 text-rose-400 hover:text-rose-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Professional Document Body */}
        <div id="printable-bill-area" className="p-6 sm:p-10 overflow-y-auto flex-1 space-y-6 text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 print:p-0 print:overflow-visible print:bg-white print:text-slate-900 font-sans">
          
          {/* Delivery Challan Mode Banner */}
          {isDeliveryChallanMode && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3 rounded-xl flex items-center justify-between text-xs text-amber-800 dark:text-amber-300 print:hidden">
              <div className="flex items-center space-x-2">
                <FileCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span><strong>Delivery Challan Mode:</strong> Pricing and tax amounts are suppressed for warehouse packing & delivery dispatch.</span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsDeliveryChallanMode(false)}
                  className="px-2.5 py-1 rounded-lg bg-amber-200/60 dark:bg-amber-800/60 font-bold hover:bg-amber-200 dark:hover:bg-amber-800 cursor-pointer"
                >
                  Return to Invoice
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 cursor-pointer"
                >
                  Print Challan
                </button>
              </div>
            </div>
          )}

          {/* Executive Header Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-slate-900 dark:border-slate-700 print:border-slate-900 pb-5 gap-6">
            <div className="space-y-2 max-w-md">
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shadow-md print:bg-slate-900">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 print:text-slate-900 tracking-tight">
                    {settings.firmName}
                  </h2>
                  <p className="text-[11px] text-slate-500 font-medium tracking-wide">
                    {settings.logoText || 'Tax, Accounting & Corporate Financial Services'}
                  </p>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 dark:text-slate-400 print:text-slate-600 space-y-0.5 pt-1">
                <p className="leading-relaxed">{settings.firmAddress}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                  {settings.firmEmail && <span>Email: {settings.firmEmail}</span>}
                  {settings.firmPhone && <span>Phone: {settings.firmPhone}</span>}
                </div>
                {settings.taxId && (
                  <p className="font-mono text-slate-700 dark:text-slate-300 print:text-slate-700 font-medium">
                    GSTIN / Tax ID: {settings.taxId}
                  </p>
                )}
              </div>
            </div>

            <div className="text-left sm:text-right space-y-1.5 w-full sm:w-auto">
              <div className="inline-block px-3 py-1 bg-slate-900 text-white font-black tracking-widest uppercase text-sm rounded-md shadow-xs print:bg-slate-900 print:text-white">
                {isDeliveryChallanMode ? 'DELIVERY CHALLAN' : 'TAX INVOICE'}
              </div>
              <p className="font-mono text-base font-black text-blue-600 dark:text-blue-400 print:text-blue-600">
                {currentInvoice.invoiceNumber}
              </p>
              
              <div className="space-y-1 pt-1 text-[11px] text-slate-600 dark:text-slate-400 print:text-slate-600">
                <div className="flex sm:justify-end gap-2">
                  <span className="text-slate-400">Invoice Date:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 print:text-slate-900">
                    {formatDate(currentInvoice.issueDate)}
                  </span>
                </div>
                <div className="flex sm:justify-end gap-2">
                  <span className="text-slate-400">Due Date:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 print:text-slate-900">
                    {formatDate(currentInvoice.dueDate)}
                  </span>
                </div>
                {currentInvoice.expectedPaymentDate && (
                  <div className="flex sm:justify-end gap-2 text-blue-600 dark:text-blue-400 font-bold">
                    <span className="text-slate-400">Expected Settlement:</span>
                    <span>{formatDate(currentInvoice.expectedPaymentDate)}</span>
                  </div>
                )}
                {currentInvoice.salesOrderId && (
                  <div className="flex sm:justify-end gap-2 font-mono text-[10px]">
                    <span className="text-slate-400">Sales Order:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{currentInvoice.salesOrderId}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Client & Billing Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 print:border print:bg-white">
            <div className="space-y-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Billed To:
              </span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100 print:text-slate-900">
                {currentInvoice.clientName}
              </h4>
              {currentInvoice.clientEmail && (
                <p className="text-[11px] text-slate-500 font-mono">{currentInvoice.clientEmail}</p>
              )}
              {currentInvoice.projectName && (
                <div className="pt-1 flex items-center space-x-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <span className="font-medium">Project:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{currentInvoice.projectName}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5 text-left md:text-right">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                Payment Status:
              </span>
              <div className="inline-block">
                <span className={`text-xs px-3 py-1 rounded-full font-bold border ${getStatusBadgeStyle(currentInvoice.status)}`}>
                  {currentInvoice.status}
                </span>
              </div>
              <div className="pt-1 text-[11px] text-slate-500 font-mono">
                Balance Due: <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(currentInvoice.balanceDue, currencySymbol)}</span>
              </div>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs print:border-slate-300">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white font-semibold text-[11px] uppercase tracking-wider print:bg-slate-900 print:text-white">
                {isDeliveryChallanMode ? (
                  <tr>
                    <th className="p-3 pl-4">#</th>
                    <th className="p-3">Item & Description</th>
                    <th className="p-3 text-center">HSN/SAC</th>
                    <th className="p-3 text-right pr-4">Quantity Dispatched</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="p-3 pl-4">#</th>
                    <th className="p-3">Item & Description</th>
                    <th className="p-3 text-center">Qty</th>
                    <th className="p-3 text-right">Rate</th>
                    <th className="p-3 text-center">Tax %</th>
                    <th className="p-3 text-right pr-4">Amount</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={isDeliveryChallanMode ? 4 : 6} className="p-6 text-center text-slate-400 italic">
                      No line items specified
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={it.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      {isDeliveryChallanMode ? (
                        <>
                          <td className="p-3 pl-4 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 dark:text-slate-100 print:text-slate-900">
                              {it.description || 'General Item'}
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono text-slate-500">{(it as any).hsnSac || (it as any).hsn || '9983'}</td>
                          <td className="p-3 pr-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {it.quantity} {Number(it.quantity) === 1 ? 'Unit' : 'Units'}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 pl-4 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900 dark:text-slate-100 print:text-slate-900">
                              {it.description || 'General Service'}
                            </div>
                          </td>
                          <td className="p-3 text-center font-mono">{it.quantity}</td>
                          <td className="p-3 text-right font-mono">{formatCurrency(it.unitPrice, currencySymbol)}</td>
                          <td className="p-3 text-center font-mono text-[11px] text-slate-500">{it.taxRate}%</td>
                          <td className="p-3 pr-4 text-right font-mono font-bold text-slate-900 dark:text-slate-100 print:text-slate-900">
                            {formatCurrency(it.amount || (Number(it.quantity || 0) * Number(it.unitPrice || 0)), currencySymbol)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Totals & Tax Summary Breakdown (or Delivery Challan Declaration) */}
          {isDeliveryChallanMode ? (
            <div className="p-5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
              <div className="space-y-1 text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px] block">Delivery Declaration</span>
                <p className="text-slate-600 dark:text-slate-400 italic leading-relaxed">
                  Certified that the particulars given above are true and correct, and the items listed represent the physical goods dispatched to the customer in good condition.
                </p>
              </div>
              <div className="border-t sm:border-t-0 sm:border-l border-slate-200 dark:border-slate-700 pt-4 sm:pt-0 sm:pl-6 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Total Items Dispatched:</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-white">
                    {items.reduce((sum, i) => sum + Number(i.quantity || 0), 0)} Units
                  </span>
                </div>
                <div className="pt-8 border-b border-slate-300 dark:border-slate-600"></div>
                <div className="text-[10px] text-slate-400 text-center">Customer Received / Verified Signature</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-2">
              
              {/* Amount in words & Bank Details */}
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 print:bg-white print:border-slate-300">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                    Total Amount in Words:
                  </span>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800 italic leading-snug">
                    {wordsRepresentation}
                  </p>
                </div>

                {/* Bank Remittance Details */}
                {(bankName || bankAccountNumber) && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 print:bg-white print:border-slate-300 space-y-1 text-[11px]">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                      Bank Remittance Details:
                    </span>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                      <span className="text-slate-400">Bank:</span>
                      <span className="font-semibold">{bankName}</span>
                      <span className="text-slate-400">Account #:</span>
                      <span className="font-mono font-semibold">{bankAccountNumber}</span>
                      {bankIfsc && (
                        <>
                          <span className="text-slate-400">IFSC / Swift:</span>
                          <span className="font-mono font-semibold">{bankIfsc}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Financial Calculations Box */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 print:bg-white print:border-slate-300 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-400 print:text-slate-600">
                  <span>Subtotal:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800">
                    {formatCurrency(currentInvoice.subtotal, currencySymbol)}
                  </span>
                </div>

                {currentInvoice.taxTotal > 0 && (
                  <div className="flex justify-between text-slate-600 dark:text-slate-400 print:text-slate-600">
                    <span>Tax Total:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800">
                      +{formatCurrency(currentInvoice.taxTotal, currencySymbol)}
                    </span>
                  </div>
                )}

                {currentInvoice.discount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>Discount:</span>
                    <span className="font-mono">-{formatCurrency(currentInvoice.discount, currencySymbol)}</span>
                  </div>
                )}

                <div className="flex justify-between border-t border-slate-300 dark:border-slate-700 print:border-slate-300 pt-2 font-black text-sm text-slate-900 dark:text-slate-100 print:text-slate-900">
                  <span>Invoice Total:</span>
                  <span className="font-mono text-base">{formatCurrency(currentInvoice.totalAmount, currencySymbol)}</span>
                </div>

                {currentInvoice.paidAmount > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold py-1">
                    <span>Payments Received:</span>
                    <span className="font-mono">-{formatCurrency(currentInvoice.paidAmount, currencySymbol)}</span>
                  </div>
                )}

                <div className="flex justify-between p-3 rounded-xl bg-slate-900 text-white border border-slate-800 font-black text-sm shadow-sm print:bg-slate-900 print:text-white">
                  <span>Balance Due:</span>
                  <span className="text-amber-400 font-mono text-base">
                    {formatCurrency(currentInvoice.balanceDue, currencySymbol)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Dedicated Payments Received History Section */}
          {relatedPayments.length > 0 && (
            <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 p-4 rounded-xl space-y-2.5 print:bg-emerald-50/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-bold text-xs text-emerald-950 dark:text-emerald-300">
                    Payments Received ({relatedPayments.length})
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                  Total Cleared: {formatCurrency(currentInvoice.paidAmount, currencySymbol)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400 border-b border-emerald-200/80 dark:border-emerald-800">
                    <tr>
                      <th className="py-1.5 pl-2">Date</th>
                      <th className="py-1.5">Payment #</th>
                      <th className="py-1.5">Payment Mode</th>
                      <th className="py-1.5">Reference #</th>
                      <th className="py-1.5 text-right pr-2">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/40 text-[11px]">
                    {relatedPayments.map((p) => (
                      <tr key={p.id}>
                        <td className="py-1.5 pl-2 font-mono text-slate-600 dark:text-slate-300">{formatDate(p.paymentDate)}</td>
                        <td className="py-1.5 font-mono font-bold text-emerald-700 dark:text-emerald-400">{p.paymentNumber || p.id.slice(0, 10)}</td>
                        <td className="py-1.5 text-slate-700 dark:text-slate-300">{p.paymentMethod || (p as any).paymentMode || 'Bank Transfer'}</td>
                        <td className="py-1.5 text-slate-500 font-mono">{p.referenceNumber || (p as any).reference || '-'}</td>
                        <td className="py-1.5 text-right pr-2 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(p.amount, currencySymbol)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes, Terms & Authorized Signatory Block */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 print:border-slate-300 grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div className="space-y-3 text-[11px] text-slate-600 dark:text-slate-400 print:text-slate-700">
              {currentInvoice.notes && (
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 print:text-slate-900 block mb-0.5">
                    Customer Notes:
                  </span>
                  <p className="leading-relaxed">{currentInvoice.notes}</p>
                </div>
              )}

              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200 print:text-slate-900 block mb-0.5">
                  Terms & Conditions:
                </span>
                <p className="leading-relaxed">
                  {currentInvoice.terms || 'Payment is due per designated terms. Overdue balances are subject to statutory interest of 1.5% per month. Goods once sold will not be taken back without prior written authorization.'}
                </p>
              </div>

              <div className="pt-2">
                <span className="text-[10px] text-slate-500 italic block">
                  Declaration: We declare that this invoice shows the actual price of the goods/services described and that all particulars are true and correct.
                </span>
              </div>
            </div>

            {/* Formal Authorized Signatory Box */}
            <div className="text-right space-y-2 pt-4 md:pt-0">
              <div className="inline-block min-w-[240px] text-center p-4 rounded-xl border border-slate-200 dark:border-slate-700 print:border-slate-300 bg-slate-50 dark:bg-slate-800/60 print:bg-white space-y-6">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 print:text-slate-800 block">
                  For {settings.firmName}
                </span>
                <div className="border-t border-slate-400 dark:border-slate-600 print:border-slate-400 pt-2">
                  <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 print:text-slate-900 block">
                    Authorized Signatory
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Statutory Footer */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 print:border-slate-300 flex justify-between items-center text-[10px] text-slate-400 print:text-slate-500">
            <span>This is a computer-generated tax invoice issued by FirmBooks.</span>
            <span>E. & O.E.</span>
          </div>

          {/* Edit History Audit Trail (if present) */}
          {currentInvoice.editHistory && currentInvoice.editHistory.length > 0 && (
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 print:border-slate-300 space-y-3 print:hidden">
              <div className="flex items-center space-x-2 text-slate-800 dark:text-slate-200 print:text-slate-900 font-bold text-xs">
                <History className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Invoice Revision & Audit Trail ({currentInvoice.editHistory.length} revision{currentInvoice.editHistory.length > 1 ? 's' : ''})</span>
              </div>
              <div className="space-y-2.5">
                {currentInvoice.editHistory.map((hist, idx) => (
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

      {/* Sub-Dialog: Record Customer Payment Modal */}
      {isRecordPaymentOpen && (
        <RecordCustomerPaymentModal
          isOpen={isRecordPaymentOpen}
          onClose={() => setIsRecordPaymentOpen(false)}
          targetInvoice={currentInvoice}
          clientId={currentInvoice.clientId}
          onPaymentSuccess={() => {
            setIsRecordPaymentOpen(false);
            showToast(`Payment successfully recorded for ${currentInvoice.invoiceNumber}!`);
          }}
        />
      )}

      {/* Sub-Dialog: Send Invoice Email Modal */}
      {isSendEmailOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Mail className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Email Tax Invoice</h3>
              </div>
              <button
                onClick={() => setIsSendEmailOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendEmailSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">To (Client Email)</label>
                <input
                  type="email"
                  required
                  value={emailForm.recipientEmail}
                  onChange={(e) => setEmailForm({ ...emailForm, recipientEmail: e.target.value })}
                  placeholder="client@company.com"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={emailForm.subject}
                  onChange={(e) => setEmailForm({ ...emailForm, subject: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Message Body</label>
                <textarea
                  rows={5}
                  value={emailForm.message}
                  onChange={(e) => setEmailForm({ ...emailForm, message: e.target.value })}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center space-x-2 text-slate-600 dark:text-slate-400">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="font-mono text-[11px] font-semibold">Attached: Invoice-{currentInvoice.invoiceNumber}.pdf</span>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSendEmailOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingEmail}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  <span>{isSendingEmail ? 'Sending...' : 'Send Invoice'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-Dialog: Share Invoice Link & QR Modal */}
      {isShareOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Share2 className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">Share Invoice</h3>
              </div>
              <button
                onClick={() => setIsShareOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-center space-y-3 py-1">
              <p className="text-xs text-slate-500">
                Share this secure direct link with <span className="font-bold text-slate-800 dark:text-slate-200">{currentInvoice.clientName}</span> to view bill details or settle payments online.
              </p>

              {/* QR Code */}
              {shareQrDataUrl ? (
                <div className="inline-block p-3 bg-white rounded-2xl shadow-md border border-slate-200">
                  <img src={shareQrDataUrl} alt="Invoice QR code" className="w-44 h-44 mx-auto" />
                  <p className="text-[10px] text-slate-500 mt-1 font-mono font-medium">Scan to view & pay</p>
                </div>
              ) : (
                <div className="w-44 h-44 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center">
                  <QrCode className="w-8 h-8 text-slate-400 animate-pulse" />
                </div>
              )}

              {/* Link Box */}
              <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-xs font-mono text-slate-700 dark:text-slate-300 focus:outline-none truncate"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setCopiedLink(true);
                    showToast('Invoice link copied to clipboard!');
                    setTimeout(() => setCopiedLink(false), 2500);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsShareOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Dialog: Accounting Journal Entry Drill-down Modal */}
      {isJournalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-purple-600" />
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Accounting Journal Entry</h3>
                  <p className="text-[11px] text-slate-400">Audited double-entry general ledger posting for {currentInvoice.invoiceNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setIsJournalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingJournal ? (
              <div className="py-12 text-center text-slate-400 flex flex-col items-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                <span className="text-xs">Loading ledger journal entries...</span>
              </div>
            ) : journalError ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-800 dark:text-amber-300">
                <p className="font-bold mb-1">Notice</p>
                <p>{journalError}</p>
              </div>
            ) : journalData?.journalEntry ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700 text-[11px]">
                  <div>
                    <span className="text-slate-400 block">Entry #</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{journalData.journalEntry.entryNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Date</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{journalData.journalEntry.date}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Reference</span>
                    <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">{journalData.journalEntry.reference}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-[10px] uppercase text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="p-2.5 pl-3">Account</th>
                        <th className="p-2.5 text-right">Debit</th>
                        <th className="p-2.5 text-right pr-3">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
                      {journalData.journalEntry.lines.map((ln: any, i: number) => (
                        <tr key={ln.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="p-2.5 pl-3 font-sans">
                            <span className="font-bold text-slate-900 dark:text-white">{ln.accountCode} - {ln.accountName}</span>
                            {ln.description && <span className="block text-[10px] text-slate-400 font-normal">{ln.description}</span>}
                          </td>
                          <td className="p-2.5 text-right text-slate-900 dark:text-slate-100">
                            {ln.debit > 0 ? formatCurrency(ln.debit, currencySymbol) : '-'}
                          </td>
                          <td className="p-2.5 text-right pr-3 text-slate-900 dark:text-slate-100">
                            {ln.credit > 0 ? formatCurrency(ln.credit, currencySymbol) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-400 text-xs italic">
                Standard posting generated for invoice {currentInvoice.invoiceNumber}.
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setIsJournalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Expected Payment Date Modal */}
      {isExpectedDateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Expected Payment Date</h3>
                  <p className="text-[11px] text-slate-500">Record customer promised settlement date</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExpectedDateOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveExpectedPaymentDate} className="space-y-3 text-xs">
              <div>
                <label htmlFor="expected-settlement-date" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Promised Settlement Date
                </label>
                <input
                  id="expected-settlement-date"
                  type="date"
                  value={expectedDateInput}
                  onChange={(e) => setExpectedDateInput(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpectedDateOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Save Date
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bad Debt Write-Off Modal */}
      {isWriteOffOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
                  <FileX className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Write Off Invoice Balance</h3>
                  <p className="text-[11px] text-slate-500">Post bad debt clearance into General Ledger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWriteOffOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleRecordWriteOff} className="space-y-3 text-xs">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl space-y-1">
                <div className="flex justify-between items-center text-rose-900 dark:text-rose-200 font-bold">
                  <span>Balance to Write Off:</span>
                  <span className="font-mono text-sm">{formatCurrency(currentInvoice.balanceDue, currencySymbol)}</span>
                </div>
                <p className="text-[10px] text-rose-700 dark:text-rose-300">
                  This will post an audited bad debt clearance to the General Ledger and reduce balance to $0.00.
                </p>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Write-Off
                </label>
                <input
                  type="text"
                  value={writeOffReason}
                  onChange={(e) => setWriteOffReason(e.target.value)}
                  placeholder="e.g. Bad debt / Client bankruptcy / Dispute compromise"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsWriteOffOpen(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWriteOff}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingWriteOff ? 'Posting...' : 'Confirm Write-Off'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
