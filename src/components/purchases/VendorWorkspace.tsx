import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  Edit2,
  FileCheck,
  FileSpreadsheet,
  FileText,
  History,
  Layers,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Repeat,
  RotateCcw,
  Send,
  Tag,
  Trash2,
  Upload,
  User,
  Wallet,
  BookOpen,
} from 'lucide-react';
import { Vendor, Bill, PurchaseOrder, PaymentMade, Expense, JournalEntry } from '../../types';
import { useBooks } from '../../context/BooksContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { RecordVendorPaymentModal } from './RecordVendorPaymentModal';
import { apiClient } from '../../api/client';

interface VendorWorkspaceProps {
  vendor: Vendor;
  onBack: () => void;
  onEdit: (vendor: Vendor) => void;
  onNavigateToBill?: (billId: string) => void;
  onNavigateToPurchaseOrder?: (purchaseOrderId: string) => void;
  onVendorStatusChanged?: () => void;
}

interface VendorStatementData {
  vendorId: string;
  vendorName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalBills: number;
  totalPayments: number;
  totalDebits: number;
  closingBalance: number;
  transactions: Array<{
    date: string;
    type: string;
    reference: string;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
}

export type WorkspaceTab = 'overview' | 'comments' | 'transactions' | 'statements' | 'details' | 'activity' | 'purchase_orders' | 'bills' | 'payments' | 'credits' | 'statement' | 'mails';
export type TransactionSubTab = 'bills' | 'bill_payments' | 'expenses' | 'recurring_bills' | 'purchase_orders' | 'vendor_credits' | 'journals';
type StatementPeriod = 'mtd' | 'last_month' | 'qtd' | 'ytd' | 'all';
type VendorAuditEvent = { id: string; action: string; timestamp: string; userId: string; changedFields: string[] };
type VendorAttachment = { id: string; fileName: string; mimeType: string; byteSize: number; sha256Hash: string; uploadedBy: string; createdAt: string };
type VendorCommentRecord = { id: string; body: string; userId: string; authorName: string; createdAt: string };
type VendorMailRecord = { id: string; vendorId: string; toEmail: string; subject: string; body: string; userId: string; authorName: string; status: string; createdAt: string };
type RecurringBillProfile = {
  id: string;
  name: string;
  kind: 'BILL';
  frequency: string;
  next_run_date: string;
  status: 'ACTIVE' | 'PAUSED';
  template: Record<string, any> | string;
};
type VendorCreditRecord = {
  id: string;
  vendor_id?: string;
  vendor_name?: string;
  credit_number?: string;
  date?: string;
  bill_id?: string;
  total_amount?: number;
  remaining_credit?: number;
  status?: string;
};

export const VendorWorkspace: React.FC<VendorWorkspaceProps> = ({
  vendor,
  onBack,
  onEdit,
  onNavigateToBill,
  onNavigateToPurchaseOrder,
  onVendorStatusChanged,
}) => {
  const {
    bills,
    purchaseOrders,
    paymentsMade,
    expenses,
    journalEntries,
    settings,
    accounts,
    archiveVendor,
    restoreVendor,
  } = useBooks();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [transactionSubTab, setTransactionSubTab] = useState<TransactionSubTab>('bills');
  const [statementSubView, setStatementSubView] = useState<'statement' | 'mails'>('statement');
  const [statementPeriod, setStatementPeriod] = useState<StatementPeriod>('ytd');

  // Map legacy / sub tab IDs to main 4 tabs
  const resolvedMainTab: 'overview' | 'comments' | 'transactions' | 'statements' = useMemo(() => {
    if (activeTab === 'comments') return 'comments';
    if (activeTab === 'transactions' || activeTab === 'bills' || activeTab === 'payments' || activeTab === 'purchase_orders' || activeTab === 'credits') {
      return 'transactions';
    }
    if (activeTab === 'statements' || activeTab === 'statement' || activeTab === 'mails') {
      return 'statements';
    }
    return 'overview';
  }, [activeTab]);
  const [serverStatement, setServerStatement] = useState<VendorStatementData | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementFetchKey, setStatementFetchKey] = useState<number>(0);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<Bill | null>(null);
  const [vendorAuditEvents, setVendorAuditEvents] = useState<VendorAuditEvent[]>([]);
  const [vendorAttachments, setVendorAttachments] = useState<VendorAttachment[]>([]);
  const [vendorAttachmentsLoading, setVendorAttachmentsLoading] = useState(false);
  const [pendingAttachmentArchive, setPendingAttachmentArchive] = useState<VendorAttachment | null>(null);
  const [isArchivingAttachment, setIsArchivingAttachment] = useState(false);
  const [recordActionSuccess, setRecordActionSuccess] = useState('');
  const [vendorComments, setVendorComments] = useState<VendorCommentRecord[]>([]);
  const [vendorMails, setVendorMails] = useState<VendorMailRecord[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [mailDraft, setMailDraft] = useState({
    toEmail: vendor.email || '',
    subject: '',
    body: '',
  });
  const [recordActionError, setRecordActionError] = useState('');
  const [mailSuccessMessage, setMailSuccessMessage] = useState('');
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [transactionSearch, setTransactionSearch] = useState('');
  const [recurringBillProfiles, setRecurringBillProfiles] = useState<RecurringBillProfile[]>([]);
  const [recurringBillsLoading, setRecurringBillsLoading] = useState(false);
  const [recurringBillsError, setRecurringBillsError] = useState('');
  const [vendorCreditRecords, setVendorCreditRecords] = useState<VendorCreditRecord[]>([]);
  const [vendorCreditsLoading, setVendorCreditsLoading] = useState(false);
  const [vendorCreditsError, setVendorCreditsError] = useState('');

  const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const comma = dataUrl.indexOf(',');
      if (comma < 0) reject(new Error('Selected document could not be read'));
      else resolve(dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Selected document could not be read'));
    reader.readAsDataURL(file);
  });

  const money = (value: number) => formatCurrency(value, settings.currencySymbol);

  useEffect(() => {
    let current = true;
    setVendorAttachmentsLoading(true);
    apiClient.get<VendorAttachment[]>(`/finance/vendors/${vendor.id}/attachments`)
      .then((response) => {
        if (!current) return;
        if (Array.isArray(response.data)) setVendorAttachments(response.data);
        else setRecordActionError(response.error || 'Vendor documents could not be loaded.');
      })
      .catch((error) => {
        if (current) setRecordActionError(error instanceof Error ? error.message : 'Vendor documents could not be loaded.');
      })
      .finally(() => { if (current) setVendorAttachmentsLoading(false); });
    return () => { current = false; };
  }, [vendor.id]);
  // Load comments only when comments tab is active
  useEffect(() => {
    if (resolvedMainTab !== 'comments') return;
    let current = true;
    apiClient.get<VendorCommentRecord[]>(`/finance/vendors/${vendor.id}/comments`)
      .then((response) => {
        if (current && Array.isArray(response.data)) setVendorComments(response.data);
      })
      .catch(() => {});
    return () => { current = false; };
  }, [vendor.id, resolvedMainTab]);

  // Load mails only when mails sub-view is active
  useEffect(() => {
    if (resolvedMainTab !== 'statements' || statementSubView !== 'mails') return;
    let current = true;
    apiClient.get<VendorMailRecord[]>(`/finance/vendors/${vendor.id}/mails`)
      .then((response) => {
        if (current && Array.isArray(response.data)) setVendorMails(response.data);
      })
      .catch(() => {});
    return () => { current = false; };
  }, [vendor.id, resolvedMainTab, statementSubView]);

  // Update mail recipient when vendor email changes
  useEffect(() => {
    setMailDraft((prev) => ({ ...prev, toEmail: vendor.email || '' }));
  }, [vendor.email]);

  useEffect(() => {
    if (resolvedMainTab !== 'transactions' || transactionSubTab !== 'recurring_bills') return;
    let current = true;
    setRecurringBillsLoading(true);
    apiClient.get<RecurringBillProfile[]>('/recurring/profiles').then((response) => {
      if (!current) return;
      setRecurringBillsLoading(false);
      if (response.error) {
        setRecurringBillsError(response.error);
        return;
      }
      setRecurringBillProfiles((response.data || []).filter((profile) => profile.kind === 'BILL'));
      setRecurringBillsError('');
    });
    return () => { current = false; };
  }, [resolvedMainTab, transactionSubTab]);

  useEffect(() => {
    if (resolvedMainTab !== 'transactions' || transactionSubTab !== 'vendor_credits') return;
    let current = true;
    setVendorCreditsLoading(true);
    apiClient.get<VendorCreditRecord[]>('/finance/debit-notes').then((response) => {
      if (!current) return;
      setVendorCreditsLoading(false);
      if (response.error) {
        setVendorCreditsError(response.error);
        return;
      }
      setVendorCreditRecords(response.data || []);
      setVendorCreditsError('');
    });
    return () => { current = false; };
  }, [resolvedMainTab, transactionSubTab]);

  // Filtered vendor records
  const vendorBills = useMemo(
    () => bills.filter((b) => (b.vendorId === vendor.id || b.vendorName === vendor.name) && b.status !== 'Void'),
    [bills, vendor]
  );

  const vendorPOs = useMemo(
    () => purchaseOrders.filter((po) => po.vendorId === vendor.id || po.vendorName === vendor.name),
    [purchaseOrders, vendor]
  );

  const vendorPayments = useMemo(
    () => paymentsMade.filter((p) => p.vendorId === vendor.id || p.vendorName === vendor.name),
    [paymentsMade, vendor]
  );

  const vendorCreditNotes = useMemo(
    () => vendorCreditRecords
      .filter((credit) => credit.vendor_id === vendor.id || credit.vendor_name === vendor.name)
      .map((credit) => ({
        id: credit.id,
        creditNoteNumber: credit.credit_number || credit.id,
        issueDate: credit.date || '',
        billNumber: credit.bill_id || '',
        creditAmount: Number(credit.total_amount || 0),
        remainingAmount: Number(credit.remaining_credit || 0),
        status: credit.status || 'Open',
      })),
    [vendorCreditRecords, vendor]
  );

  const vendorExpenses = useMemo(
    () => (expenses || []).filter((e) => {
      if (e.vendorId && e.vendorId === vendor.id) return true;
      if (e.vendorName && e.vendorName.toLowerCase() === vendor.name.toLowerCase()) return true;
      if ((e as any).vendor && (e as any).vendor.toLowerCase() === vendor.name.toLowerCase()) return true;
      return false;
    }),
    [expenses, vendor]
  );

  const vendorRecurringBills = useMemo(
    () => recurringBillProfiles.flatMap((profile) => {
      let template: Record<string, any>;
      try {
        template = typeof profile.template === 'string' ? JSON.parse(profile.template) : profile.template;
      } catch {
        return [];
      }
      const vendorName = String(template.vendorName || '');
      if (template.vendorId !== vendor.id
        && vendorName.toLowerCase() !== vendor.name.toLowerCase()
        && (!vendor.companyName || vendorName.toLowerCase() !== vendor.companyName.toLowerCase())) return [];
      const lines = Array.isArray(template.lineItems) ? template.lineItems : [];
      const amount = lines.length > 0
        ? lines.reduce((total, line) => total + (Number(line?.amount ?? (Number(line?.quantity ?? 1) * Number(line?.unitPrice ?? line?.rate ?? 0))) || 0), 0)
        : Number(template.amount ?? 0);
      return [{
        id: profile.id,
        profileName: profile.name,
        vendorName,
        frequency: profile.frequency,
        nextBillDate: profile.next_run_date,
        amount,
        status: profile.status === 'ACTIVE' ? 'Active' as const : 'Paused' as const,
      }];
    }),
    [recurringBillProfiles, vendor]
  );

  const vendorJournals = useMemo(() => {
    const vName = (vendor.name || '').toLowerCase();
    const vCompany = (vendor.companyName || '').toLowerCase();
    return (journalEntries || []).filter((j) => {
      const desc = (j.description || '').toLowerCase();
      const ref = (j.reference || '').toLowerCase();
      if (vName && (desc.includes(vName) || ref.includes(vName))) return true;
      if (vCompany && (desc.includes(vCompany) || ref.includes(vCompany))) return true;
      return (j.lines || []).some((l) => {
        const lineDesc = (l.description || '').toLowerCase();
        return (vName && lineDesc.includes(vName)) || (vCompany && lineDesc.includes(vCompany));
      });
    });
  }, [journalEntries, vendor]);

  const totalTransactionsCount =
    vendorBills.length +
    vendorPayments.length +
    vendorExpenses.length +
    vendorRecurringBills.length +
    vendorPOs.length +
    vendorCreditNotes.length +
    vendorJournals.length;

  // Unified Audit Trail / Activity log
  const activityEvents = useMemo(() => {
    const events: Array<{ id: string; type: 'PO' | 'BILL' | 'PAYMENT' | 'CREDIT' | 'MASTER'; title: string; subtitle: string; amount?: number; date: string }> = [];

    vendorBills.forEach((b) => {
      events.push({
        id: `bill-${b.id}`,
        type: 'BILL',
        title: `Bill #${b.billNumber} Recorded`,
        subtitle: `Status: ${b.status} · Due: ${formatDate(b.dueDate)}`,
        amount: b.totalAmount,
        date: b.billDate,
      });
    });

    vendorPOs.forEach((po) => {
      events.push({
        id: `po-${po.id}`,
        type: 'PO',
        title: `Purchase Order #${po.poNumber} Issued`,
        subtitle: `Status: ${po.status} · Delivery: ${formatDate(po.expectedDate)}`,
        amount: po.totalAmount,
        date: po.orderDate,
      });
    });

    vendorPayments.forEach((p) => {
      events.push({
        id: `pay-${p.id}`,
        type: 'PAYMENT',
        title: `Payment #${p.paymentNumber} Disbursed`,
        subtitle: `Method: ${p.paymentMethod || 'Bank'} · Bill: ${p.billNumber}`,
        amount: p.amount,
        date: p.paymentDate,
      });
    });

    vendorCreditNotes.forEach((c) => {
      events.push({
        id: `cr-${c.id}`,
        type: 'CREDIT',
        title: `Vendor Credit #${c.creditNoteNumber} Issued`,
        subtitle: `Status: ${c.status} · Bill: ${c.billNumber}`,
        amount: c.creditAmount,
        date: c.issueDate,
      });
    });

    vendorAuditEvents.forEach((ae) => {
      events.push({
        id: `audit-${ae.id}`,
        type: 'MASTER',
        title: `Vendor Profile ${ae.action.replaceAll('_', ' ')}`,
        subtitle: ae.changedFields?.length ? `Fields updated: ${ae.changedFields.join(', ')}` : 'Vendor profile modified',
        date: ae.timestamp,
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [vendorPOs, vendorBills, vendorPayments, vendorCreditNotes, vendorAuditEvents]);

  // Statement Date Range Calculation
  const statementDateRange = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayStr = now.toISOString().slice(0, 10);

    if (statementPeriod === 'mtd') {
      const fromDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
      return { fromDate, toDate: todayStr, label: 'Month to Date' };
    }
    if (statementPeriod === 'last_month') {
      const fromDate = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
      const toDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
      return { fromDate, toDate, label: 'Last Month' };
    }
    if (statementPeriod === 'qtd') {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const configuredFiscalStart = monthNames.indexOf(settings.fiscalYearStart || 'April');
      const fiscalStart = configuredFiscalStart >= 0 ? configuredFiscalStart : 3;
      const monthsIntoFiscalYear = (month - fiscalStart + 12) % 12;
      const quarterStartMonth = (fiscalStart + Math.floor(monthsIntoFiscalYear / 3) * 3) % 12;
      const quarterStartYear = quarterStartMonth > month ? year - 1 : year;
      const fromDate = new Date(Date.UTC(quarterStartYear, quarterStartMonth, 1)).toISOString().slice(0, 10);
      return { fromDate, toDate: todayStr, label: 'Quarter to Date' };
    }
    if (statementPeriod === 'ytd') {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const configuredFiscalStart = monthNames.indexOf(settings.fiscalYearStart || 'April');
      const fiscalStart = configuredFiscalStart >= 0 ? configuredFiscalStart : 3;
      const fiscalYear = month >= fiscalStart ? year : year - 1;
      const fromDate = new Date(Date.UTC(fiscalYear, fiscalStart, 1)).toISOString().slice(0, 10);
      return { fromDate, toDate: todayStr, label: 'Year to Date' };
    }
    return { fromDate: '1970-01-01', toDate: todayStr, label: 'All Time' };
  }, [statementPeriod, settings.fiscalYearStart]);

  // Fetch Authoritative Server Statement
  const isStatementsActive = activeTab === 'statements' || activeTab === 'statement' || activeTab === 'mails';
  useEffect(() => {
    if (!isStatementsActive) return;
    let active = true;
    setServerStatement(null);
    setIsLoadingStatement(true);
    setStatementError(null);

    const { fromDate, toDate } = statementDateRange;
    apiClient
      .get<VendorStatementData>(`/finance/reports/vendor-statement/${vendor.id}?fromDate=${fromDate}&toDate=${toDate}`)
      .then((res) => {
        if (!active) return;
        if (res.data) {
          setServerStatement(res.data);
        } else if (res.error) {
          setStatementError(res.error);
        }
      })
      .catch((err) => {
        if (!active) return;
        setStatementError(err.message || 'Failed to load vendor statement from server');
      })
      .finally(() => {
        if (active) setIsLoadingStatement(false);
      });

    return () => {
      active = false;
    };
  }, [isStatementsActive, vendor.id, statementDateRange, statementFetchKey]);

  // Authoritative Ledger
  const statementLedger = useMemo(() => {
    const { fromDate, toDate } = statementDateRange;
    const isMatching =
      serverStatement &&
      serverStatement.vendorId === vendor.id &&
      serverStatement.fromDate === fromDate &&
      serverStatement.toDate === toDate;

    if (isMatching) {
      return {
        openingBalance: serverStatement.openingBalance,
        rows: serverStatement.transactions.map((t, idx) => ({
          id: `srv-${idx}-${t.reference}`,
          date: t.date,
          title: `${t.type} #${t.reference}`,
          reference: t.reference,
          debit: t.debit,
          credit: t.credit,
          runningBalance: t.runningBalance,
        })),
        totalPeriodBills: serverStatement.totalBills,
        totalPeriodPayments: serverStatement.totalPayments,
        closingBalance: serverStatement.closingBalance,
        isAuthoritative: true,
      };
    }

    return {
      openingBalance: 0,
      rows: [],
      totalPeriodBills: 0,
      totalPeriodPayments: 0,
      closingBalance: 0,
      isAuthoritative: false,
    };
  }, [serverStatement, vendor.id, statementDateRange]);

  const handlePrintStatement = () => {
    window.print();
  };

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!commentDraft.trim() || isSavingComment) return;
    setRecordActionError('');
    setIsSavingComment(true);
    try {
      const response = await apiClient.post<VendorCommentRecord>(`/finance/vendors/${vendor.id}/comments`, { body: commentDraft });
      if (!response.data?.id) throw new Error(response.error || 'Comment could not be added');
      setVendorComments((current) => [response.data!, ...current]);
      setCommentDraft('');
    } catch (error) {
      setRecordActionError(error instanceof Error ? error.message : 'Comment could not be added');
    } finally {
      setIsSavingComment(false);
    }
  };

  const handleSendMail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!mailDraft.toEmail || !mailDraft.subject.trim() || !mailDraft.body.trim() || isSendingMail) return;
    setRecordActionError('');
    setMailSuccessMessage('');
    setIsSendingMail(true);
    try {
      const response = await apiClient.post<VendorMailRecord>(`/finance/vendors/${vendor.id}/mails`, {
        toEmail: mailDraft.toEmail.trim(),
        subject: mailDraft.subject.trim(),
        body: mailDraft.body.trim(),
      });
      if (!response.data?.id) throw new Error(response.error || 'Email could not be recorded/sent');
      setVendorMails((current) => [response.data!, ...current]);
      setMailSuccessMessage(`Email sent successfully to ${mailDraft.toEmail}`);
      setMailDraft({ toEmail: vendor.email || '', subject: '', body: '' });
      setTimeout(() => setMailSuccessMessage(''), 5000);
    } catch (error) {
      setRecordActionError(error instanceof Error ? error.message : 'Email could not be sent');
    } finally {
      setIsSendingMail(false);
    }
  };

  const handlePrepareStatementMail = () => {
    const subject = `Account Statement - ${vendor.name} (${statementDateRange.label})`;
    const body = `Dear ${vendor.primaryContact?.name || vendor.contactPerson || vendor.name},\n\nPlease find attached the statement of your account with us for the period ${statementDateRange.label} (${statementDateRange.fromDate === '1970-01-01' ? 'All Time' : `${formatDate(statementDateRange.fromDate)} to ${formatDate(statementDateRange.toDate)}`}).\n\nOpening Balance: ${money(statementLedger.openingBalance)}\nTotal Billed: ${money(statementLedger.totalPeriodBills)}\nTotal Paid: ${money(statementLedger.totalPeriodPayments)}\nClosing Balance Owed: ${money(statementLedger.closingBalance)}\n\nPlease contact us if you have any questions.\n\nBest regards,\n${settings.firmName || 'Finance Team'}`;
    setMailDraft({
      toEmail: vendor.email || '',
      subject,
      body,
    });
    setActiveTab('statements');
    setStatementSubView('mails');
  };

  const handleUploadAttachments = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (files.length > 5 || files.some((file) => file.size <= 0 || file.size > 2 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 2 * 1024 * 1024) {
      setRecordActionError('Choose up to five PDF or image files with a combined size under 2 MB.');
      return;
    }
    setRecordActionError('');
    setIsUploadingAttachments(true);
    try {
      const payload = await Promise.all(files.map(async (file) => ({
        name: file.name, mimeType: file.type, dataBase64: await readFileAsBase64(file),
      })));
      const response = await apiClient.post<{ attachments: VendorAttachment[] }>(`/finance/vendors/${vendor.id}/attachments`, { files: payload });
      if (!Array.isArray(response.data?.attachments)) throw new Error(response.error || 'Documents could not be uploaded');
      setVendorAttachments((current) => [...response.data!.attachments, ...current]);
    } catch (error) {
      setRecordActionError(error instanceof Error ? error.message : 'Documents could not be uploaded');
    } finally {
      setIsUploadingAttachments(false);
    }
  };

  const handleDownloadAttachment = async (attachment: VendorAttachment) => {
    const response = await apiClient.getBlob(`/finance/vendors/${vendor.id}/attachments/${attachment.id}`);
    if (!response.data) {
      setRecordActionError(response.error || 'Document could not be downloaded');
      return;
    }
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleArchiveAttachment = async () => {
    if (!pendingAttachmentArchive || isArchivingAttachment) return;
    setIsArchivingAttachment(true);
    setRecordActionError('');
    setRecordActionSuccess('');
    try {
      const attachment = pendingAttachmentArchive;
      const response = await apiClient.delete<{ id: string; archived: boolean }>(`/finance/vendors/${vendor.id}/attachments/${attachment.id}`);
      if (response.error || !response.data?.archived) throw new Error(response.error || 'Document could not be removed');
      setVendorAttachments((current) => current.filter((item) => item.id !== attachment.id));
      setRecordActionSuccess(`${attachment.fileName} was removed from this vendor. Request ID: ${response.requestId || 'not provided'}`);
      setPendingAttachmentArchive(null);
    } catch (error) {
      setRecordActionError(error instanceof Error ? error.message : 'Document could not be removed.');
    } finally {
      setIsArchivingAttachment(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in text-slate-900 dark:text-slate-100">
      {/* 1. Header & Navigation Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/90 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Back to Vendors Directory"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold font-mono tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded">
                Vendor 360 Workspace
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${vendor.active === false ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'}`}>
                {vendor.active === false ? 'Inactive' : 'Active'}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-0.5 flex items-center gap-2">
              <Building2 className="h-6 w-6 text-purple-600" />
              <span>{vendor.name}</span>
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {vendor.phone && <a href={`tel:${vendor.phone}`} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"><Phone className="h-4 w-4" /><span className="hidden sm:inline">Call</span></a>}
          {vendor.email && <a href={`mailto:${vendor.email}`} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"><Mail className="h-4 w-4" /><span className="hidden sm:inline">Email</span></a>}
          {(vendor.mobile || vendor.phone) && <a href={`sms:${encodeURIComponent(vendor.mobile || vendor.phone || '')}`} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"><MessageSquare className="h-4 w-4" /><span className="hidden sm:inline">Message</span></a>}
          <button
            onClick={() => {
              setSelectedBillForPayment(null);
              setIsPaymentModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-purple-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-500 transition-colors cursor-pointer"
          >
            <CreditCard className="h-4 w-4" />
            <span>Record Payment</span>
          </button>

          <button
            onClick={() => onEdit(vendor)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Edit Profile</span>
          </button>

          <div className="relative">
            <button type="button" aria-label="More vendor actions" aria-expanded={isMoreMenuOpen} onClick={() => setIsMoreMenuOpen((open) => !open)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <MoreVertical className="h-4 w-4" /><span className="hidden sm:inline">More</span>
            </button>
            {isMoreMenuOpen && (
              <div role="menu" className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <button role="menuitem" onClick={() => { setActiveTab('overview'); setIsMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Building2 className="h-4 w-4 text-purple-600" />
                  <span>Vendor Overview</span>
                </button>
                <button role="menuitem" onClick={() => { setActiveTab('comments'); setIsMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  <MessageSquare className="h-4 w-4 text-purple-600" />
                  <span>Comments ({vendorComments.length})</span>
                </button>
                <button role="menuitem" onClick={() => { setActiveTab('transactions'); setIsMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Layers className="h-4 w-4 text-purple-600" />
                  <span>Transactions ({totalTransactionsCount})</span>
                </button>
                <button role="menuitem" onClick={() => { setActiveTab('statements'); setStatementSubView('statement'); setIsMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                  <span>Statement of Account</span>
                </button>
                <button role="menuitem" onClick={() => { setActiveTab('statements'); setStatementSubView('mails'); setIsMoreMenuOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                  <Mail className="h-4 w-4 text-purple-600" />
                  <span>Mails & History ({vendorMails.length})</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={async () => {
              try {
                if (vendor.active === false) await restoreVendor(vendor.id);
                else await archiveVendor(vendor.id);
                onVendorStatusChanged?.();
              } catch (error) {
                setRecordActionError(error instanceof Error ? error.message : 'Vendor status could not be changed');
              }
            }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            title={vendor.active === false ? 'Restore vendor' : 'Archive vendor'}
          >
            {vendor.active === false ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            <span className="hidden sm:inline">{vendor.active === false ? 'Restore' : 'Archive'}</span>
          </button>
        </div>
      </div>

      {/* 2. TAB NAVIGATION - EXACTLY FOUR TABS */}
      <div className="border-b border-slate-200/90 dark:border-slate-800">
        <nav className="flex space-x-2 overflow-x-auto pb-2" aria-label="Vendor Workspace Tabs">
          {[
            {
              id: 'overview' as const,
              label: 'Overview',
              icon: Building2,
              ariaLabel: 'Overview / Details & Profile',
            },
            {
              id: 'comments' as const,
              label: 'Comments',
              icon: MessageSquare,
              count: vendorComments.length,
              ariaLabel: 'Comments',
            },
            {
              id: 'transactions' as const,
              label: 'Transactions',
              icon: Layers,
              count: totalTransactionsCount,
              ariaLabel: 'Transactions',
            },
            {
              id: 'statements' as const,
              label: 'Mails and Statements',
              icon: Mail,
              ariaLabel: 'Mails and Statements / Statement of Account',
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = resolvedMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === 'statements' && (activeTab === 'statement' || activeTab === 'statements')) {
                    // keep subview
                  }
                }}
                aria-label={tab.ariaLabel}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-purple-600 text-white shadow-2xs dark:bg-purple-600'
                    : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      isSelected
                        ? 'bg-purple-800 text-purple-100'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Global alert error if any */}
      {recordActionSuccess && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">{recordActionSuccess}</div>
      )}
      {recordActionError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{recordActionError}</span>
          </div>
          <button onClick={() => setRecordActionError('')} className="text-rose-500 hover:text-rose-800 text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* 3. TAB PANELS */}

      {/* TAB 1: OVERVIEW */}
      {resolvedMainTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Contact Details Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <User className="h-4 w-4 text-purple-600" />
                <span>Contact & Identity Information</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Company Name</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{vendor.companyName || vendor.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Contact Person</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{[vendor.primaryContact?.salutation, vendor.primaryContact?.name || vendor.contactPerson].filter(Boolean).join(' ') || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Email</span>
                  {vendor.email ? <a href={`mailto:${vendor.email}`} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">{vendor.email}</a> : <span className="font-semibold text-slate-800 dark:text-slate-200">—</span>}
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Phone</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.phone || '—'}{vendor.mobile ? ` · ${vendor.mobile}` : ''}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Address / Location</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-right max-w-[200px] truncate">
                    {typeof vendor.billingAddress === 'string' ? vendor.billingAddress : vendor.billingAddress && typeof vendor.billingAddress === 'object' ? [vendor.billingAddress.attention, vendor.billingAddress.street, vendor.billingAddress.street2, vendor.billingAddress.city, vendor.billingAddress.state, vendor.billingAddress.postalCode, vendor.billingAddress.country].filter(Boolean).join(', ') : vendor.address || '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-50 py-1 dark:border-slate-800/50">
                  <span className="shrink-0 text-slate-400">Shipping Address</span>
                  <span className="max-w-[60%] text-right font-semibold text-slate-800 dark:text-slate-200">{typeof vendor.shippingAddress === 'string' ? vendor.shippingAddress || '—' : vendor.shippingAddress && typeof vendor.shippingAddress === 'object' ? [vendor.shippingAddress.attention, vendor.shippingAddress.street, vendor.shippingAddress.street2, vendor.shippingAddress.city, vendor.shippingAddress.state, vendor.shippingAddress.postalCode, vendor.shippingAddress.country].filter(Boolean).join(', ') || '—' : '—'}</span>
                </div>
                <div className="flex justify-between gap-3 border-b border-slate-50 py-1 dark:border-slate-800/50"><span className="text-slate-400">Legal Name</span><span className="text-right font-semibold text-slate-800 dark:text-slate-200">{vendor.legalName || '—'}</span></div>
                <div className="flex justify-between gap-3 border-b border-slate-50 py-1 dark:border-slate-800/50"><span className="text-slate-400">Website</span>{vendor.website ? <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noreferrer" className="truncate font-semibold text-blue-600 hover:underline dark:text-blue-400">{vendor.website}</a> : <span>—</span>}</div>
              </div>
            </div>

            {/* Tax & Commercial Terms Card */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <BadgeDollarSign className="h-4 w-4 text-purple-600" />
                <span>Commercial & Tax Settings</span>
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Tax ID / GSTIN / VAT</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{vendor.gstin || vendor.taxId || '—'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Default Payment Terms</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.paymentTerms || 'Net 30'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50"><span className="text-slate-400">PAN</span><span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{vendor.pan || '—'}</span></div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50"><span className="text-slate-400">GST Registration</span><span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.gstStatus || 'Unregistered'}</span></div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50"><span className="text-slate-400">Place of Supply</span><span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.placeOfSupply || '—'}</span></div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50"><span className="text-slate-400">Currency</span><span className="font-semibold text-slate-800 dark:text-slate-200">{vendor.currency || settings.currencyCode}</span></div>
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50"><span className="text-slate-400">Default Expense Account</span><span className="text-right font-semibold text-slate-800 dark:text-slate-200">{accounts.find((account) => account.id === vendor.defaultExpenseAccountId)?.name || '—'}</span></div>
                <div className="flex justify-between gap-3 border-b border-slate-50 py-1 dark:border-slate-800/50"><span className="text-slate-400">Supplier Bank Account</span><span className="text-right font-semibold text-slate-800 dark:text-slate-200">{vendor.bankDetails?.maskedAccountNumber ? `${vendor.bankDetails.bankName || 'Bank'} · ${vendor.bankDetails.maskedAccountNumber}` : 'Not saved'}</span></div>
                {vendor.bankDetails?.ifsc && <div className="flex justify-between gap-3 border-b border-slate-50 py-1 dark:border-slate-800/50"><span className="text-slate-400">IFSC</span><span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{vendor.bankDetails.ifsc}</span></div>}
                <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/50">
                  <span className="text-slate-400">Account Status</span>
                  <span className={`font-extrabold ${vendor.active === false ? 'text-slate-500' : 'text-emerald-600 dark:text-emerald-400'}`}>{vendor.active === false ? 'Inactive' : 'Active'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Notes, Contacts & Custom Fields */}
          {(vendor.additionalContacts?.length || vendor.notes || Object.keys(vendor.customFields || {}).length > 0) ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Additional Contacts, Custom Fields & Notes</h3>
              {vendor.additionalContacts?.map((contact, index) => (
                <div key={`${contact.email || contact.name}-${index}`} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-xs dark:border-slate-800">
                  <span className="font-semibold">{contact.name || 'Contact'}{contact.designation ? ` · ${contact.designation}` : ''}</span>
                  <span className="text-slate-500">{[contact.email, contact.phone, contact.mobile].filter(Boolean).join(' · ') || '—'}</span>
                </div>
              ))}
              {Object.entries(vendor.customFields || {}).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3 border-b border-slate-100 pb-2 text-xs dark:border-slate-800">
                  <span className="text-slate-500">{key}</span>
                  <span className="text-right font-semibold text-slate-800 dark:text-slate-200">{value == null ? '—' : String(value)}</span>
                </div>
              ))}
              {vendor.notes && <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{vendor.notes}</p>}
            </div>
          ) : null}

          {/* Vendor Attachments & Documents */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <Paperclip className="h-4 w-4 text-purple-600" />
                  <span>Vendor Documents & Contracts</span>
                </h3>
                <p className="mt-1 text-xs text-slate-500">PDF and image files; max 2 MB per file.</p>
              </div>
              <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 transition-colors ${isUploadingAttachments ? 'pointer-events-none opacity-60' : ''}`}>
                <Upload className="h-3.5 w-3.5" />
                <span>{isUploadingAttachments ? 'Uploading…' : 'Upload Documents'}</span>
                <input className="sr-only" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple disabled={isUploadingAttachments} onChange={handleUploadAttachments} />
              </label>
            </div>
            {vendorAttachmentsLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading vendor documents…</div>
            ) : vendorAttachments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                <Paperclip className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600 mb-1" />
                No documents uploaded for this vendor yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {vendorAttachments.map((attachment) => (
                  <div key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-xs">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="rounded-lg bg-purple-50 p-1.5 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900 dark:text-white">{attachment.fileName}</p>
                        <p className="text-[11px] text-slate-500">{(attachment.byteSize / 1024).toFixed(0)} KB · {formatDate(attachment.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => void handleDownloadAttachment(attachment)} aria-label={`Download ${attachment.fileName}`} className="rounded-lg p-1.5 text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => { setRecordActionError(''); setPendingAttachmentArchive(attachment); }} aria-label={`Remove ${attachment.fileName}`} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Unified Activity Audit Trail */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="h-4 w-4 text-purple-600" />
                <span>Unified Procurement Audit Trail</span>
              </h3>
              <span className="text-xs text-slate-400">{activityEvents.length} total events</span>
            </div>

            {activityEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No activity recorded for this vendor yet.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {activityEvents.slice(0, 15).map((event) => (
                  <div key={event.id} className="flex items-start gap-3 text-xs">
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        event.type === 'BILL'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                          : event.type === 'PO'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                          : event.type === 'PAYMENT'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400'
                      }`}
                    >
                      {event.type === 'BILL' && <FileText className="h-3.5 w-3.5" />}
                      {event.type === 'PO' && <FileCheck className="h-3.5 w-3.5" />}
                      {event.type === 'PAYMENT' && <CreditCard className="h-3.5 w-3.5" />}
                      {event.type === 'CREDIT' && <Tag className="h-3.5 w-3.5" />}
                      {event.type === 'MASTER' && <Building2 className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{event.title}</span>
                        {event.amount !== undefined && <span className="font-financial font-extrabold text-slate-900 dark:text-white">{money(event.amount)}</span>}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                        <span>{event.subtitle}</span>
                        <span>{formatDate(event.date)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMMENTS */}
      {resolvedMainTab === 'comments' && (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <MessageSquare className="h-4 w-4 text-purple-600" />
                <span>Vendor comments</span>
              </h3>
              <p className="mt-1 text-xs text-slate-500">Internal notes for your team; vendors cannot see these comments.</p>
            </div>
            <span className="text-xs text-slate-500">{vendorComments.length} comments</span>
          </div>

          <form onSubmit={handleAddComment} className="space-y-2">
            <textarea
              aria-label="Write a vendor comment"
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Write an internal comment…"
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">{commentDraft.length}/4,000</span>
              <button
                type="submit"
                disabled={!commentDraft.trim() || isSavingComment}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isSavingComment ? 'Saving…' : 'Add comment'}</span>
              </button>
            </div>
          </form>

          <div className="mt-5 space-y-3">
            {vendorComments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No comments yet.</p>
            ) : (
              vendorComments.map((comment) => (
                <article key={comment.id} className="rounded-xl border border-slate-100 bg-slate-50/40 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{comment.authorName}</span>
                    <time className="text-[11px] text-slate-400">{formatDate(comment.createdAt)}</time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300">{comment.body}</p>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {/* TAB 3: TRANSACTIONS (Bills, Bill Payments, Expenses, Recurring Bills, Purchase Orders, Vendor Credits, Journals) */}
      {resolvedMainTab === 'transactions' && (
        <div className="space-y-4">
          {/* Sub-tabs / Pills for the 7 requested transaction types */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200/90 pb-3 dark:border-slate-800">
            {[
              { id: 'bills' as const, label: 'Bills', count: vendorBills.length, icon: FileText },
              { id: 'bill_payments' as const, label: 'Bill Payments', count: vendorPayments.length, icon: CreditCard },
              { id: 'expenses' as const, label: 'Expenses', count: vendorExpenses.length, icon: Receipt },
              { id: 'recurring_bills' as const, label: 'Recurring Bills', count: vendorRecurringBills.length, icon: Repeat },
              { id: 'purchase_orders' as const, label: 'Purchase Orders', count: vendorPOs.length, icon: FileCheck },
              { id: 'vendor_credits' as const, label: 'Vendor Credits', count: vendorCreditNotes.length, icon: Tag },
              { id: 'journals' as const, label: 'Journals', count: vendorJournals.length, icon: BookOpen },
            ].map((sub) => {
              const SubIcon = sub.icon;
              const isSubActive = transactionSubTab === sub.id;
              return (
                <button
                  key={sub.id}
                  onClick={() => setTransactionSubTab(sub.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                    isSubActive
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  <SubIcon className="h-3.5 w-3.5" />
                  <span>{sub.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      isSubActive ? 'bg-purple-800 text-purple-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {sub.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Search */}
          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder={`Search ${transactionSubTab.replace('_', ' ')}...`}
              value={transactionSearch}
              onChange={(e) => setTransactionSearch(e.target.value)}
              className="max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            {transactionSubTab === 'bills' && (
              <button
                onClick={() => {
                  setSelectedBillForPayment(null);
                  setIsPaymentModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-purple-700 dark:bg-purple-600 cursor-pointer"
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Pay Outstanding</span>
              </button>
            )}
          </div>

          {/* Sub-view 1: Bills */}
          {transactionSubTab === 'bills' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Bill Number</th>
                      <th className="p-3">Bill Date</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3 text-right">Bill Total</th>
                      <th className="p-3 text-right">Balance Due</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right pr-4">Quick Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {vendorBills
                      .filter((b) => !transactionSearch || b.billNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || b.status.toLowerCase().includes(transactionSearch.toLowerCase()))
                      .length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No bills recorded for this vendor.
                        </td>
                      </tr>
                    ) : (
                      vendorBills
                        .filter((b) => !transactionSearch || b.billNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || b.status.toLowerCase().includes(transactionSearch.toLowerCase()))
                        .map((b) => {
                          const bal =
                            b.balanceDue !== undefined
                              ? b.balanceDue
                              : Math.max(0, Number(b.totalAmount || 0) - Number(b.amountPaid || 0));

                          return (
                            <tr key={b.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                              <td className="p-3 pl-4 font-bold text-purple-600 dark:text-purple-400 font-mono">
                                <button
                                  type="button"
                                  onClick={() => onNavigateToBill?.(b.id)}
                                  className="hover:underline font-bold text-left cursor-pointer"
                                >
                                  {b.billNumber}
                                </button>
                              </td>
                              <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(b.billDate)}</td>
                              <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(b.dueDate)}</td>
                              <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                                {money(b.totalAmount)}
                              </td>
                              <td className="p-3 text-right font-financial font-black text-rose-600 dark:text-rose-400">
                                {money(bal)}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold border ${
                                    bal === 0
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                                      : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                >
                                  {b.status}
                                </span>
                              </td>
                              <td className="p-3 text-right pr-4">
                                {bal > 0 && (
                                  <button
                                    onClick={() => {
                                      setSelectedBillForPayment(b);
                                      setIsPaymentModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 cursor-pointer"
                                  >
                                    <CreditCard className="h-3 w-3" />
                                    <span>Pay Bill</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view 2: Bill Payments */}
          {transactionSubTab === 'bill_payments' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Payment #</th>
                      <th className="p-3">Payment Date</th>
                      <th className="p-3">Payment Mode</th>
                      <th className="p-3">Target Bill / Ref</th>
                      <th className="p-3 text-right pr-4">Amount Disbursed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {vendorPayments
                      .filter((p) => !transactionSearch || p.paymentNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (p.referenceNumber || '').toLowerCase().includes(transactionSearch.toLowerCase()) || (p.billNumber || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                      .length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          No payment disbursements recorded for this vendor.
                        </td>
                      </tr>
                    ) : (
                      vendorPayments
                        .filter((p) => !transactionSearch || p.paymentNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (p.referenceNumber || '').toLowerCase().includes(transactionSearch.toLowerCase()) || (p.billNumber || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                        .map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="p-3 pl-4 font-bold text-emerald-600 dark:text-emerald-400 font-mono">{p.paymentNumber}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(p.paymentDate)}</td>
                            <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{p.paymentMethod || 'Bank Wire'}</td>
                            <td className="p-3 text-slate-500 dark:text-slate-400">
                              {p.billNumber} {p.referenceNumber ? `(${p.referenceNumber})` : ''}
                            </td>
                            <td className="p-3 text-right pr-4 font-financial font-black text-emerald-600 dark:text-emerald-400">
                              {money(p.amount)}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view 3: Expenses */}
          {transactionSubTab === 'expenses' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Expense # / Ref</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Category Account</th>
                      <th className="p-3">Paid From</th>
                      <th className="p-3 text-right">Tax</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3 text-center pr-4">Payment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {vendorExpenses
                      .filter((e) => !transactionSearch || e.referenceNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (e.description || '').toLowerCase().includes(transactionSearch.toLowerCase()) || (e.accountName || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                      .length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          No direct expenses tagged to this vendor.
                        </td>
                      </tr>
                    ) : (
                      vendorExpenses
                        .filter((e) => !transactionSearch || e.referenceNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (e.description || '').toLowerCase().includes(transactionSearch.toLowerCase()) || (e.accountName || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                        .map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="p-3 pl-4 font-mono font-bold text-purple-600 dark:text-purple-400">{e.referenceNumber}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(e.date)}</td>
                            <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{e.accountName || 'Expense'}</td>
                            <td className="p-3 text-slate-500 dark:text-slate-400">{e.paidFromAccountName || 'Bank/Cash'}</td>
                            <td className="p-3 text-right text-slate-500 dark:text-slate-400">{money(e.taxAmount || 0)}</td>
                            <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">{money(e.amount)}</td>
                            <td className="p-3 text-center pr-4">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${e.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300'}`}>
                                {e.paymentStatus || 'Paid'}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view 4: Recurring Bills */}
          {transactionSubTab === 'recurring_bills' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Profile Name</th>
                      <th className="p-3">Frequency</th>
                      <th className="p-3">Next Bill Date</th>
                      <th className="p-3 text-right">Recurring Amount</th>
                      <th className="p-3 text-center pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {recurringBillsLoading ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">Loading recurring bill schedules…</td></tr>
                    ) : recurringBillsError ? (
                      <tr><td colSpan={5} className="p-6 text-center"><div role="alert" className="text-rose-700">Recurring schedules could not be loaded: {recurringBillsError}</div></td></tr>
                    ) : vendorRecurringBills
                      .filter((rb) => !transactionSearch || rb.profileName.toLowerCase().includes(transactionSearch.toLowerCase()) || rb.frequency.toLowerCase().includes(transactionSearch.toLowerCase()))
                      .length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400">
                          No recurring bill schedules configured for this vendor.
                        </td>
                      </tr>
                    ) : (
                      vendorRecurringBills
                        .filter((rb) => !transactionSearch || rb.profileName.toLowerCase().includes(transactionSearch.toLowerCase()) || rb.frequency.toLowerCase().includes(transactionSearch.toLowerCase()))
                        .map((rb) => (
                          <tr key={rb.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="p-3 pl-4 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Repeat className="h-3.5 w-3.5 text-purple-600" />
                              <span>{rb.profileName}</span>
                            </td>
                            <td className="p-3 font-semibold text-slate-600 dark:text-slate-300">{rb.frequency}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(rb.nextBillDate)}</td>
                            <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">{money(rb.amount)}</td>
                            <td className="p-3 text-center pr-4">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${rb.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                {rb.status}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view 5: Purchase Orders */}
          {transactionSubTab === 'purchase_orders' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">PO Number</th>
                      <th className="p-3">Order Date</th>
                      <th className="p-3">Expected Date</th>
                      <th className="p-3 text-right">Total Amount</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {vendorPOs
                      .filter((po) => !transactionSearch || po.poNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || po.status.toLowerCase().includes(transactionSearch.toLowerCase()))
                      .length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No purchase orders recorded for this vendor.
                        </td>
                      </tr>
                    ) : (
                      vendorPOs
                        .filter((po) => !transactionSearch || po.poNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || po.status.toLowerCase().includes(transactionSearch.toLowerCase()))
                        .map((po) => (
                          <tr key={po.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="p-3 pl-4 font-bold text-blue-600 dark:text-blue-400 font-mono">{po.poNumber}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(po.orderDate)}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(po.expectedDate)}</td>
                            <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                              {money(po.totalAmount)}
                            </td>
                            <td className="p-3 text-center">
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                                {po.status}
                              </span>
                            </td>
                            <td className="p-3 text-right pr-4">
                              {onNavigateToPurchaseOrder && (
                                <button
                                  type="button"
                                  aria-label={`Open purchase order ${po.poNumber}`}
                                  onClick={() => onNavigateToPurchaseOrder(po.id)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 cursor-pointer"
                                >
                                  <FileCheck className="h-3 w-3" />
                                  <span>Open order</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view 6: Vendor Credits */}
          {transactionSubTab === 'vendor_credits' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Credit #</th>
                      <th className="p-3">Issue Date</th>
                      <th className="p-3">Linked Bill</th>
                      <th className="p-3 text-right">Total Credit</th>
                      <th className="p-3 text-right">Remaining Credit</th>
                      <th className="p-3 text-center pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {vendorCreditsLoading ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-500">Loading vendor credits…</td></tr>
                    ) : vendorCreditsError ? (
                      <tr><td colSpan={6} className="p-6 text-center"><div role="alert" className="text-rose-700">Vendor credits could not be loaded: {vendorCreditsError}</div></td></tr>
                    ) : vendorCreditNotes
                      .filter((c) => !transactionSearch || c.creditNoteNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (c.billNumber || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                      .length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No vendor credits available.
                        </td>
                      </tr>
                    ) : (
                      vendorCreditNotes
                        .filter((c) => !transactionSearch || c.creditNoteNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (c.billNumber || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                        .map((c) => (
                          <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="p-3 pl-4 font-bold text-purple-600 dark:text-purple-400 font-mono">{c.creditNoteNumber}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(c.issueDate)}</td>
                            <td className="p-3 text-slate-500 dark:text-slate-400">{c.billNumber || '—'}</td>
                            <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">{money(c.creditAmount)}</td>
                            <td className="p-3 text-right font-financial font-black text-purple-600 dark:text-purple-400">
                              {money(c.remainingAmount !== undefined ? c.remainingAmount : c.creditAmount)}
                            </td>
                            <td className="p-3 text-center pr-4">
                              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 border border-purple-200 dark:bg-purple-950 dark:text-purple-300">
                                {c.status}
                              </span>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sub-view 7: Journals */}
          {transactionSubTab === 'journals' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3 pl-4">Entry #</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Reference / Description</th>
                      <th className="p-3">Accounts Involved</th>
                      <th className="p-3 text-right">Debits / Credits</th>
                      <th className="p-3 text-center pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {vendorJournals
                      .filter((j) => !transactionSearch || j.entryNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (j.description || '').toLowerCase().includes(transactionSearch.toLowerCase()) || (j.reference || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                      .length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No manual journal entries associated with this vendor.
                        </td>
                      </tr>
                    ) : (
                      vendorJournals
                        .filter((j) => !transactionSearch || j.entryNumber.toLowerCase().includes(transactionSearch.toLowerCase()) || (j.description || '').toLowerCase().includes(transactionSearch.toLowerCase()) || (j.reference || '').toLowerCase().includes(transactionSearch.toLowerCase()))
                        .map((j) => {
                          const totalDebit = (j.lines || []).reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
                          return (
                            <tr key={j.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                              <td className="p-3 pl-4 font-mono font-bold text-purple-600 dark:text-purple-400">{j.entryNumber}</td>
                              <td className="p-3 text-slate-600 dark:text-slate-300">{formatDate(j.date)}</td>
                              <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                                <div>{j.description || 'General Journal'}</div>
                                {j.reference && <div className="text-[11px] text-slate-400 font-mono">Ref: {j.reference}</div>}
                              </td>
                              <td className="p-3 text-slate-500 dark:text-slate-400">
                                {(j.lines || []).map((l) => l.accountName).filter(Boolean).slice(0, 2).join(' / ')}
                                {(j.lines || []).length > 2 ? ' …' : ''}
                              </td>
                              <td className="p-3 text-right font-financial font-bold text-slate-900 dark:text-white">
                                {money(totalDebit)}
                              </td>
                              <td className="p-3 text-center pr-4">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${j.status === 'Posted' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                                  {j.status || 'Posted'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: MAILS AND STATEMENTS */}
      {resolvedMainTab === 'statements' && (
        <div className="space-y-6">
          {/* Sub-view switcher: Statement of Account vs Mails */}
          <div className="flex items-center justify-between border-b border-slate-200/90 pb-3 dark:border-slate-800">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-bold dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setStatementSubView('statement')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                  statementSubView === 'statement'
                    ? 'bg-white text-purple-700 shadow-2xs dark:bg-slate-800 dark:text-purple-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Statement of Account</span>
              </button>
              <button
                type="button"
                onClick={() => setStatementSubView('mails')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                  statementSubView === 'mails'
                    ? 'bg-white text-purple-700 shadow-2xs dark:bg-slate-800 dark:text-purple-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <Mail className="h-4 w-4" />
                <span>Mails & Communication</span>
                <span className="rounded-full bg-purple-100 px-1.5 py-0.2 text-[10px] font-extrabold text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                  {vendorMails.length}
                </span>
              </button>
            </div>

            {statementSubView === 'statement' && (
              <button
                onClick={handlePrepareStatementMail}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-purple-700 hover:bg-purple-50 dark:border-slate-700 dark:bg-slate-800 dark:text-purple-300 transition-colors cursor-pointer"
              >
                <Mail className="h-4 w-4" />
                <span>Mail Statement</span>
              </button>
            )}
          </div>

          {/* Sub-view: Statement */}
          {statementSubView === 'statement' && (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                    <span>Vendor Statement of Account</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Official general ledger running statement for {vendor.name} ({statementDateRange.label}: {statementDateRange.fromDate === '1970-01-01' ? 'All Time' : `${formatDate(statementDateRange.fromDate)} – ${formatDate(statementDateRange.toDate)}`})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold dark:border-slate-700 dark:bg-slate-800">
                    {(['mtd', 'last_month', 'qtd', 'ytd', 'all'] as StatementPeriod[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setStatementPeriod(p)}
                        className={`rounded-md px-2.5 py-1 uppercase tracking-wider transition-all cursor-pointer ${
                          statementPeriod === p
                            ? 'bg-white text-purple-700 shadow-xs dark:bg-slate-900 dark:text-purple-400'
                            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                        }`}
                      >
                        {p.replace('_', ' ')}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handlePrintStatement}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print Statement</span>
                  </button>
                </div>
              </div>

              {/* Loading State */}
              {isLoadingStatement && (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500" data-testid="statement-loading">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600 dark:text-purple-400" />
                  <p className="mt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Fetching authoritative statement from server...
                  </p>
                </div>
              )}

              {/* Error State */}
              {!isLoadingStatement && statementError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20" data-testid="statement-error">
                  <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
                  <p className="mt-2 text-sm font-bold text-rose-800 dark:text-rose-300">Unable to load statement</p>
                  <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{statementError}</p>
                  <button
                    onClick={() => setStatementFetchKey((k) => k + 1)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry</span>
                  </button>
                </div>
              )}

              {/* Authoritative Server Statement Presentation */}
              {!isLoadingStatement && !statementError && statementLedger.isAuthoritative && (
                <>
                  {/* Statement Period Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Opening Balance</p>
                      <p className={`mt-0.5 text-sm font-black font-financial ${statementLedger.openingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                        {money(statementLedger.openingBalance)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Billed (Debits)</p>
                      <p className="mt-0.5 text-sm font-black font-financial text-slate-900 dark:text-white">
                        {money(statementLedger.totalPeriodBills)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid / Credited</p>
                      <p className="mt-0.5 text-sm font-black font-financial text-emerald-600 dark:text-emerald-400">
                        {money(statementLedger.totalPeriodPayments)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-purple-200/80 bg-purple-50/30 p-3 dark:border-purple-900/50 dark:bg-purple-950/20">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Balance Owed</p>
                      <p className={`mt-0.5 text-sm font-black font-financial ${statementLedger.closingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
                        {money(statementLedger.closingBalance)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800 uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="p-3 pl-4">Date</th>
                          <th className="p-3">Description</th>
                          <th className="p-3 text-right">Debit (+)</th>
                          <th className="p-3 text-right">Credit (-)</th>
                          <th className="p-3 text-right pr-4">Balance Owed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {/* Opening Balance Row */}
                        <tr className="bg-slate-50/30 font-semibold dark:bg-slate-800/20">
                          <td className="p-3 pl-4 text-slate-400">{formatDate(statementDateRange.fromDate)}</td>
                          <td className="p-3 font-bold text-slate-700 dark:text-slate-300">*** OPENING BALANCE ***</td>
                          <td className="p-3 text-right font-financial text-slate-400">—</td>
                          <td className="p-3 text-right font-financial text-slate-400">—</td>
                          <td className="p-3 text-right pr-4 font-financial font-extrabold text-slate-900 dark:text-white">
                            {money(statementLedger.openingBalance)}
                          </td>
                        </tr>

                        {statementLedger.rows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400">
                              No financial transactions recorded in the selected period.
                            </td>
                          </tr>
                        ) : (
                          statementLedger.rows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                              <td className="p-3 pl-4 text-slate-600 dark:text-slate-400">{formatDate(row.date)}</td>
                              <td className="p-3 font-medium text-slate-900 dark:text-white">
                                <span className="font-bold text-purple-600 dark:text-purple-400">{row.title}</span>
                              </td>
                              <td className="p-3 text-right font-financial font-bold text-rose-600 dark:text-rose-400">
                                {row.debit > 0 ? money(row.debit) : '—'}
                              </td>
                              <td className="p-3 text-right font-financial font-bold text-emerald-600 dark:text-emerald-400">
                                {row.credit > 0 ? money(row.credit) : '—'}
                              </td>
                              <td className="p-3 text-right pr-4 font-financial font-black text-slate-900 dark:text-white">
                                {money(row.runningBalance)}
                              </td>
                            </tr>
                          ))
                        )}

                        {/* Closing Balance Row */}
                        <tr className="bg-purple-50/30 font-bold border-t-2 border-slate-200 dark:border-slate-700 dark:bg-purple-950/20">
                          <td className="p-3 pl-4 text-slate-500">{formatDate(statementDateRange.toDate)}</td>
                          <td className="p-3 font-black text-purple-900 dark:text-purple-200">*** CLOSING BALANCE OWED ***</td>
                          <td className="p-3 text-right font-financial font-extrabold text-rose-600 dark:text-rose-400">
                            {money(statementLedger.totalPeriodBills)}
                          </td>
                          <td className="p-3 text-right font-financial font-extrabold text-emerald-600 dark:text-emerald-400">
                            {money(statementLedger.totalPeriodPayments)}
                          </td>
                          <td className="p-3 text-right pr-4 font-financial font-black text-base text-purple-700 dark:text-purple-300">
                            {money(statementLedger.closingBalance)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Sub-view: Mails */}
          {statementSubView === 'mails' && (
            <div className="space-y-6">
              {mailSuccessMessage && (
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{mailSuccessMessage}</span>
                </div>
              )}

              {/* Compose Email Card */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <Mail className="h-4 w-4 text-purple-600" />
                  <span>Send Mail to Vendor</span>
                </h3>

                <form onSubmit={handleSendMail} className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">To Email Address *</label>
                    <input
                      type="email"
                      required
                      placeholder="vendor@company.com"
                      value={mailDraft.toEmail}
                      onChange={(e) => setMailDraft((prev) => ({ ...prev, toEmail: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Subject *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Account Statement / PO Inquiry"
                      value={mailDraft.subject}
                      onChange={(e) => setMailDraft((prev) => ({ ...prev, subject: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">Message Body *</label>
                    <textarea
                      required
                      rows={4}
                      placeholder="Type your message to the vendor…"
                      value={mailDraft.body}
                      onChange={(e) => setMailDraft((prev) => ({ ...prev, body: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isSendingMail || !mailDraft.toEmail || !mailDraft.subject.trim() || !mailDraft.body.trim()}
                      className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-purple-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{isSendingMail ? 'Sending…' : 'Send Email'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Mails History */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <History className="h-4 w-4 text-purple-600" />
                    <span>Sent Mails & Communication History</span>
                  </h3>
                  <span className="text-xs text-slate-500">{vendorMails.length} mails recorded</span>
                </div>

                {vendorMails.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    <Mail className="mx-auto h-6 w-6 text-slate-300 dark:text-slate-600 mb-1" />
                    No emails logged for this vendor yet.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {vendorMails.map((mail) => (
                      <article key={mail.id} className="py-3 text-xs space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">{mail.subject}</span>
                          <span className="text-[11px] text-slate-400">{formatDate(mail.createdAt)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          <span>To: <strong className="text-slate-700 dark:text-slate-300">{mail.toEmail}</strong></span>
                          <span>· Sent by: {mail.authorName}</span>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.2 text-[10px] font-extrabold text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                            {mail.status || 'Sent'}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                          {mail.body}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {pendingAttachmentArchive && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <section role="alertdialog" aria-modal="true" aria-labelledby="archive-vendor-attachment-title" aria-describedby="archive-vendor-attachment-description" className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 id="archive-vendor-attachment-title" className="text-sm font-bold text-slate-900 dark:text-white">Remove vendor document?</h2>
              <p id="archive-vendor-attachment-description" className="mt-2 text-xs text-slate-600 dark:text-slate-300">{pendingAttachmentArchive.fileName} will be archived from this vendor record. Its audit history is retained.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" autoFocus disabled={isArchivingAttachment} onClick={() => setPendingAttachmentArchive(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-50 dark:border-slate-700">Keep document</button>
              <button type="button" disabled={isArchivingAttachment} onClick={() => void handleArchiveAttachment()} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{isArchivingAttachment ? 'Removing…' : 'Remove document'}</button>
            </div>
          </section>
        </div>
      )}
      {isPaymentModalOpen && (
        <RecordVendorPaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setSelectedBillForPayment(null);
          }}
          vendor={vendor}
          initialBillId={selectedBillForPayment?.id}
        />
      )}
    </div>
  );
};
