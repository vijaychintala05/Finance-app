import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Account,
  Bill,
  Client,
  CreateOrganizationInput,
  CreditNote,
  DeliveryChallan,
  Estimate,
  Expense,
  ExpenseReceiptAttachment,
  ExpenseReceiptUpload,
  FirmSettings,
  Invoice,
  InvoiceItem,
  JournalEntry,
  JournalLine,
  OrganizationMeta,
  PaymentMade,
  PaymentReceipt,
  PeriodLock,
  Project,
  ProjectFinancialSummary,
  PurchaseOrder,
  SalesOrder,
  Salesperson,
  TimeEntry,
  Vendor,
  UserIdentity,
  AuditLog,
  RolePermissionDefinition,
  OrgInvitation,
} from '../types';
import { ApiRequestError, apiClient, type InvoiceCreateOperationStatus } from '../api/client';
import { createSafeDefaultSettings } from '../config/defaultSettings';
import { useOptionalAuth } from './AuthContext';
import { BankingService } from '../services/bankingService';
import { isUncertainMutationOutcome, mutationExceptionNotice, type OperationNotice } from '../utils/operationNotice';
import { OperationNoticeBanner } from '../components/common/OperationNoticeBanner';

const SAFE_INITIAL_SETTINGS: FirmSettings = createSafeDefaultSettings();

const camelizeRecord = (value: any): any => {
  if (Array.isArray(value)) return value.map(camelizeRecord);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    camelizeRecord(child),
  ]));
};

// A disabled optional workflow must not make core accounting data appear empty.
// These endpoints deliberately return 503 until their server-side controls are enabled.
const OPTIONAL_UNAVAILABLE_READ_ENDPOINTS = new Set(['vendor-payments']);

// Keep startup from exhausting a small self-hosted PostgreSQL pool while the
// provider reloads its authoritative tenant state.
const INITIAL_READ_CONCURRENCY = 4;

const fetchFinancialReadBatch = async (
  endpoints: readonly string[],
  organizationId?: string,
  isCurrent?: () => boolean,
) => {
  const responses = new Array<Awaited<ReturnType<typeof apiClient.get<any[]>>>>(endpoints.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= endpoints.length) return;
      if (isCurrent && !isCurrent()) throw new Error('The active organization changed before financial reads completed');
      responses[index] = await apiClient.get<any[]>(`/finance/${endpoints[index]}`, organizationId);
    }
  };
  await Promise.all(Array.from({ length: Math.min(INITIAL_READ_CONCURRENCY, endpoints.length) }, worker));
  return responses;
};

const isExpectedOptionalReadFailure = (endpoint: string, status: number): boolean => (
  status === 503 && OPTIONAL_UNAVAILABLE_READ_ENDPOINTS.has(endpoint)
);

const normalizeAccountForUi = (record: any): Account => ({
  ...record,
  balance: Number(record?.balance || 0),
});

const normalizeJournalForUi = (record: any): JournalEntry => ({
  ...record,
  lines: (record?.lines || []).map((line: any) => ({
    ...line,
    debit: Number(line?.debit || 0),
    credit: Number(line?.credit || 0),
  })),
});

const normalizeExpenseForUi = (record: any): Expense => ({
  ...record,
  amount: Number(record?.amount || 0),
  taxAmount: Number(record?.taxAmount || 0),
  tdsAmount: Number(record?.tdsAmount || 0),
});
const normalizeDeliveryChallanForUi = (record: any): DeliveryChallan => {
  const rawStatus = String(record?.status || 'DRAFT').trim().toUpperCase().replaceAll(' ', '_');
  const status: DeliveryChallan['status'] = rawStatus === 'DELIVERED' ? 'Delivered'
    : rawStatus === 'IN_TRANSIT' ? 'In Transit'
    : rawStatus === 'ISSUED' ? 'Issued'
    : 'Draft';
  return {
    ...record,
    challanNumber: record?.challanNumber || record?.challanId || '',
    clientName: record?.customerName || record?.clientName || '',
    dispatchDate: record?.deliveryDate || record?.dispatchDate || '',
    deliveryAddress: record?.deliveryAddress || record?.notes || '',
    itemsSummary: record?.itemsSummary || record?.reason || '',
    status,
  };
};

const upsertAccount = (accounts: Account[], account: Account): Account[] => {
  const normalized = normalizeAccountForUi(account);
  return [...accounts.filter((existing) => existing.id !== normalized.id), normalized]
    .sort((left, right) => left.code.localeCompare(right.code) || left.name.localeCompare(right.name));
};

const normalizeInvoiceForUi = (record: any): Invoice => {
  const rawStatus = String(record?.status || '').trim().toUpperCase().replaceAll(' ', '_');
  const subtotal = Number(record?.subtotal || 0);
  const taxTotal = Number(record?.taxTotal || 0);
  const discount = Number(record?.discount || 0);
  const totalAmount = Number(record?.totalAmount ?? (subtotal + taxTotal - discount));
  const paidAmount = Number(record?.paidAmount || 0);
  const balanceDue = Number(record?.balanceDue ?? Math.max(0, totalAmount - paidAmount));
  const hasBalance = balanceDue > 0;
  const isOverdue = hasBalance && /^\d{4}-\d{2}-\d{2}$/.test(String(record?.dueDate || '')) && record.dueDate < new Date().toISOString().split('T')[0];
  let status: Invoice['status'];
  if (['VOID', 'VOIDED'].includes(rawStatus)) status = 'Void';
  else if (rawStatus === 'SUBMITTED') status = 'Submitted';
  else if (rawStatus === 'PAID' || !hasBalance) status = 'Paid';
  else if (isOverdue) status = 'Overdue';
  else if (rawStatus === 'PARTIALLY_PAID' || paidAmount > 0) status = 'Partially Paid';
  else if (rawStatus === 'DRAFT') status = 'Draft';
  else status = 'Sent';

  const items = Array.isArray(record?.items)
    ? record.items
    : Array.isArray(record?.lineItems)
    ? record.lineItems
    : [];

  return {
    ...record,
    subtotal,
    taxTotal,
    discount,
    totalAmount,
    paidAmount,
    balanceDue,
    items,
    status,
  } as Invoice;
};

const normalizeBillForUi = (record: any): Bill => {
  const isVoided = String(record.status || '').trim().toUpperCase() === 'VOIDED';
  const balanceDue = isVoided
    ? 0
    : Math.max(0, Number(record.balanceDue ?? (Number(record.totalAmount || 0) - Number(record.amountPaid || 0))));
  const isOverdue = !isVoided && balanceDue > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(record.dueDate || '')) && record.dueDate < new Date().toISOString().split('T')[0];
  const status: Bill['status'] = isVoided
    ? 'VOIDED'
    : balanceDue === 0
    ? 'Paid'
    : isOverdue
    ? 'Overdue'
    : Number(record.amountPaid || 0) > 0
    ? 'Partially Paid'
    : 'Unpaid';
  return { ...record, balanceDue, status } as Bill;
};

const normalizeSalesOrderForUi = (record: any): SalesOrder => {
  const rawStatus = String(record.status || '').trim().toUpperCase().replaceAll(' ', '_');
  let status: SalesOrder['status'];
  if (['CANCELLED', 'VOID'].includes(rawStatus)) status = 'Cancelled';
  else if (['FULFILLED', 'DELIVERED'].includes(rawStatus)) status = 'Fulfilled';
  else if (['PARTIALLY_FULFILLED'].includes(rawStatus)) status = 'Partially Fulfilled';
  else if (['INVOICED', 'CLOSED'].includes(rawStatus)) status = 'Invoiced';
  else if (['PARTIALLY_INVOICED'].includes(rawStatus)) status = 'Partially Invoiced';
  else if (['SHIPPED'].includes(rawStatus)) status = 'Shipped';
  else if (['IN_PRODUCTION'].includes(rawStatus)) status = 'In Production';
  else if (['DRAFT'].includes(rawStatus)) status = 'Draft';
  else status = 'Confirmed';

  return {
    id: record.id,
    orderNumber: record.orderNumber || record.salesOrderNumber || '',
    clientId: record.clientId || record.customerId,
    clientName: record.clientName || record.customerName || '',
    estimateId: record.estimateId,
    orderDate: record.orderDate || '',
    expectedDeliveryDate: record.expectedDeliveryDate || record.expectedDelivery || '',
    totalAmount: Number(record.totalAmount || 0),
    invoicedAmount: Number(record.invoicedAmount || 0),
    fulfilledAmount: Number(record.fulfilledAmount || 0),
    status,
    notes: record.notes || '',
  };
};

const normalizePurchaseOrderForUi = (record: any): PurchaseOrder => {
  const rawStatus = String(record.status || '').trim().toUpperCase().replaceAll(' ', '_');
  let status: PurchaseOrder['status'];
  if (['CANCELLED', 'VOID'].includes(rawStatus)) status = 'Cancelled';
  else if (['BILLED'].includes(rawStatus)) status = 'Billed';
  else if (['PARTIALLY_BILLED'].includes(rawStatus)) status = 'Partially Billed';
  else if (['RECEIVED'].includes(rawStatus)) status = 'Received';
  else if (['PARTIALLY_RECEIVED'].includes(rawStatus)) status = 'Partially Received';
  else if (['APPROVED'].includes(rawStatus)) status = 'Approved';
  else if (['DRAFT'].includes(rawStatus)) status = 'Draft';
  else if (['PENDING_RECEIPT'].includes(rawStatus)) status = 'Pending Receipt';
  else status = 'Issued';

  return {
    id: record.id,
    poNumber: record.poNumber || record.purchaseOrderNumber || '',
    vendorId: record.vendorId,
    vendorName: record.vendorName || '',
    orderDate: record.orderDate || '',
    expectedDate: record.expectedDate || record.expectedDelivery || '',
    totalAmount: Number(record.totalAmount || 0),
    billedAmount: Number(record.billedAmount || 0),
    receivedAmount: Number(record.receivedAmount || 0),
    status,
    notes: record.notes || '',
  };
};

export interface TimeOperationGuard {
  key: string;
  organizationId: string;
  userId?: string;
  projectId: string;
  notice: OperationNotice;
  targetTimeEntryIds?: string[];
  status: 'pending' | 'uncertain' | 'resolved';
}

interface BooksContextType {
  organizations: OrganizationMeta[];
  currentOrg: OrganizationMeta;
  refreshOrganizations: () => Promise<void>;
  refreshTimeOperationStatus: () => Promise<boolean>;
  switchOrganization: (orgId: string) => boolean;
  createOrganization: (input: CreateOrganizationInput) => Promise<OrganizationMeta>;
  deleteOrganization: (orgId: string) => boolean;
  exportOrganizationJSON: (orgId?: string) => void;
  importOrganizationJSON: (jsonString: string) => boolean;

  settings: FirmSettings;
  updateSettings: (newSettings: Partial<FirmSettings>) => void;

  accounts: Account[];
  accountActionUserId: string;
  addAccount: (account: Omit<Account, 'id'>) => Promise<CommittedOperationResult<Account> & { organizationChanged?: boolean }>;
  accountActionGuards: AccountActionGuard[];
  verifyAccountActionStatus: (accountId: string, organizationId?: string) => Promise<'verified' | 'pending' | 'unknown'>;
  updateAccount: (id: string, updated: Partial<Account>, idempotencyKey?: string) => Promise<CommittedOperationResult<Account> & { organizationChanged?: boolean }>;
  deleteAccount: (id: string, idempotencyKey?: string) => Promise<CommittedOperationResult<{ deleted: true; id: string }> & { organizationChanged?: boolean }>;
  deleteBankAccount: (id: string) => Promise<void>;

  clients: Client[];
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => Promise<CommittedOperationResult<Client>>;
  updateClient: (id: string, client: Partial<Client>) => Promise<CommittedOperationResult<Client>>;
  archiveClient: (id: string) => Promise<CommittedOperationResult<{ id: string; changed: boolean; active: boolean }>>;

  salespersons: Salesperson[];
  addSalesperson: (salesperson: Omit<Salesperson, 'id' | 'createdAt'>) => Salesperson | null;
  updateSalesperson: (id: string, salesperson: Partial<Salesperson>) => void;
  deleteSalesperson: (id: string) => Promise<void>;
  restoreSalesperson: (id: string) => Promise<void>;

  vendors: Vendor[];
  addVendor: (vendor: Omit<Vendor, 'id'>) => Promise<Vendor>;
  updateVendor: (id: string, vendor: Partial<Vendor>) => Promise<Vendor>;
  archiveVendor: (id: string) => Promise<void>;
  restoreVendor: (id: string) => Promise<void>;
  deleteVendor: (id: string) => Promise<void>;

  projects: Project[];
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Promise<CommittedOperationResult<Project>>;
  updateProject: (id: string, project: Partial<Project>) => Promise<CommittedOperationResult<Project & { changed?: boolean }>>;
  archiveProject: (id: string) => Promise<CommittedOperationResult<{ id: string; archived: boolean; changed: boolean; archivedAt: string | null }>>;

  timeEntries: TimeEntry[];
  addTimeEntry: (entry: Omit<TimeEntry, 'id'>, organizationId?: string, idempotencyKey?: string) => Promise<CommittedOperationResult<TimeEntry>>;
  getTimeEntryCreateOperationStatus: (idempotencyKey: string, organizationId: string) => Promise<Awaited<ReturnType<typeof apiClient.getTimeEntryCreateOperationStatus>> | null>;
  updateTimeEntry: (id: string, entry: Partial<TimeEntry>) => Promise<boolean>;
  deleteTimeEntry: (id: string) => Promise<CommittedOperationResult<void>>;
  timeOperationGuards: TimeOperationGuard[];
  beginTimeOperation: (key: string, projectId: string) => void;
  completeTimeOperation: (key: string) => void;
  holdTimeOperationGuard: (key: string, projectId: string, notice: OperationNotice) => void;

  invoices: Invoice[];
  invoiceVoidGuards: InvoiceVoidGuard[];
  invoiceCreateGuard: InvoiceCreateGuard | null;
  verifyInvoiceCreateOperationStatus: () => Promise<InvoiceCreateOperationStatus | null>;
  dismissInvoiceCreateGuard: () => void;
  verifyInvoiceVoidStatus: (id: string, expected?: { requestId?: string; reversalJournalId?: string; idempotencyKey?: string }) => Promise<{ status: 'void' | 'active' | 'pending' | 'conflict' | 'rejected'; requestId?: string; error?: string; errorCode?: string; refreshFailed?: boolean }>;
  addInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber'> & { expenseIds?: string[] }) => Promise<CommittedOperationResult<Invoice>>;
  updateInvoice: (id: string, invoice: Partial<Invoice>, expectedVersion: string) => Promise<Invoice>;
  deleteInvoice: (id: string, reason: string, idempotencyKey?: string) => Promise<{ requestId?: string; reversalJournalId?: string; refreshFailed?: boolean; verificationStatus?: 'void' | 'conflict' | 'unverified' }>;

  estimates: Estimate[];
  addEstimate: (estimate: Omit<Estimate, 'id' | 'createdAt' | 'estimateNumber'>) => void;
  convertEstimateToInvoice: (estimateId: string) => Promise<Invoice | null>;

  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>) => Promise<void>;
  updateExpense: (id: string, expense: Partial<Expense> & { accountId?: string; paidFromAccountId?: string; invoiceNumber?: string; receiptImages?: any }, reason?: string) => Promise<void>;
  correctExpense: (id: string, expense: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>, reason: string) => Promise<void>;
  deleteExpense: (id: string, reason: string) => Promise<CommittedOperationResult<Expense>>;
  convertExpenseToInvoice: (expenseId: string, issueDate?: string, dueDate?: string) => Promise<CommittedOperationResult<any>>;
  attachExpenseReceipts: (expenseId: string, receiptImages: ExpenseReceiptUpload[]) => Promise<CommittedOperationResult<ExpenseReceiptAttachment[]>>;

  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'entryNumber'>) => Promise<boolean>;

  periodLocks: PeriodLock[];
  addPeriodLock: (lock: Omit<PeriodLock, 'id' | 'lockedAt' | 'status'>) => Promise<void>;
  deletePeriodLock: (id: string) => void;

  // Documents
  salesOrders: SalesOrder[];
  addSalesOrder: (order: Omit<SalesOrder, 'id'>, organizationId?: string) => Promise<CommittedOperationResult<SalesOrder>>;
  updateSalesOrder: (id: string, updated: Partial<SalesOrder>) => Promise<void>;
  deleteSalesOrder: (id: string, reason: string, organizationId?: string) => Promise<CommittedOperationResult<SalesOrder>>;
  convertSalesOrderToInvoice: (salesOrderId: string, partialAmount?: number) => Promise<Invoice | null>;
  fulfillSalesOrder: (salesOrderId: string, details?: any) => Promise<any>;

  deliveryChallans: DeliveryChallan[];
  addDeliveryChallan: (challan: Omit<DeliveryChallan, 'id'> & { salesOrderId?: string; customerId?: string }) => Promise<DeliveryChallan | null>;

  creditNotes: CreditNote[];
  addCreditNote: (note: Omit<CreditNote, 'id'>) => CreditNote | null | Promise<CreditNote | null>;
  updateCreditNote: (id: string, updated: Partial<CreditNote>) => void;
  deleteCreditNote: (id: string, reason: string) => Promise<{ data: { id: string }; journalEntryId: string; requestId?: string; refreshFailed: boolean }>;
  applyCreditNoteToInvoice: (creditNoteId: string, invoiceId: string, amountToApply: number, applyDate?: string) => Promise<any>;
  recordCustomerRefund: (payload: { customerId: string; creditNoteId?: string; paymentId?: string; advanceId?: string; refundDate: string; amount: number; refundAccountId?: string; reference?: string; notes?: string }) => Promise<any>;

  paymentsReceived: PaymentReceipt[];
  addPaymentReceived: (payment: Omit<PaymentReceipt, 'id'> & { invoiceId?: string; clientId?: string; depositToAccountId?: string }) => Promise<PaymentReceipt>;
  updatePaymentReceived: (id: string, payment: Partial<PaymentReceipt> & { invoiceId?: string; clientId?: string; depositToAccountId?: string; reason?: string }) => Promise<PaymentReceipt>;
  paymentReversalGuards: PaymentReversalGuard[];
  verifyPaymentReversalStatus: (id: string, expected?: { requestId?: string; reversalJournalId?: string }) => Promise<{ status: 'reversed' | 'active' | 'pending' | 'conflict'; requestId?: string }>;
  deletePaymentReceived: (id: string, reason: string) => Promise<{ requestId?: string; reversalJournalId?: string; refreshFailed: boolean }>

  purchaseOrders: PurchaseOrder[];
  addPurchaseOrder: (order: Omit<PurchaseOrder, 'id'>) => Promise<CommittedOperationResult<PurchaseOrder>>;
  updatePurchaseOrder: (id: string, updated: Partial<PurchaseOrder>) => Promise<CommittedOperationResult<PurchaseOrder>>;
  deletePurchaseOrder: (id: string, reason: string) => Promise<CommittedOperationResult<PurchaseOrder>>;
  convertPurchaseOrderToBill: (purchaseOrderId: string, partialAmount?: number) => Promise<CommittedOperationResult<Bill>>;
  receivePurchaseOrder: (purchaseOrderId: string, receiptData?: any) => Promise<CommittedOperationResult<any>>;

  bills: Bill[];
  addBill: (bill: Omit<Bill, 'id'> & { vendorId?: string; expenseAccountId?: string; payableAccountId?: string }) => Promise<Bill>;
  updateBill: (id: string, updated: Partial<Bill>) => void;
  deleteBill: (id: string, reason: string) => Promise<{ requestId?: string; refreshFailed?: boolean }>;

  paymentsMade: PaymentMade[];
  addPaymentMade: (payment: Omit<PaymentMade, 'id'> & { vendorId?: string; billId?: string; paidFromAccountId?: string; allocations?: Array<{ billId: string; amount: number }> }) => Promise<PaymentMade>;
  addVendorAdvance: (advance: {
    vendorId: string;
    vendorName?: string;
    amount: number;
    paidFromAccountId: string;
    paidDate?: string;
    paymentMode?: string;
    reference?: string;
    notes?: string;
  }) => Promise<any>;
  applyVendorAdvance: (application: {
    advanceId: string;
    vendorId: string;
    billId: string;
    amount: number;
    appliedDate?: string;
  }) => Promise<any>;

  toggleAccountLock: (
    accountId: string,
    lockDetails?: { lockedBy?: string; lockedReason?: string; lockedRegion?: string }
  ) => void;
  bulkUpdateAccounts: (accountIds: string[], updates: Partial<Account>) => void;
  bulkUpdateJournals: (journalIds: string[], updates: Partial<JournalEntry>) => void;

  getProjectSummary: (projectId: string) => ProjectFinancialSummary;
  convertUnbilledTimeToInvoice: (projectId: string, clientId: string) => Promise<CommittedOperationResult<Invoice>>;

  clearAllData: () => void;
  loadSampleData: () => void;
  resetToDemoData: () => void;
  exportDataJSON: () => void;
  importDataJSON: (jsonString: string) => boolean;

  // Identity & Governance Architecture
  currentUser: UserIdentity;
  auditLogs: AuditLog[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'timestamp' | 'orgUuid' | 'publicOrgId' | 'orgName' | 'userId' | 'userName' | 'userEmail'>) => void;
}

export interface InvoiceVoidGuard {
  invoiceId: string;
  organizationId: string;
  userId: string;
  status: 'pending' | 'needs-verification' | 'conflict' | 'verified';
  committed: boolean;
  idempotencyKey: string;
  reason: string;
  notice: OperationNotice;
  requestId?: string;
  reversalJournalId?: string;
}

export interface InvoiceCreateGuard { organizationId: string; userId: string; idempotencyKey: string; requestHash: string; payload: Record<string, unknown>; status: 'pending' | 'needs-verification' | 'committed' | 'rejected' | 'conflict'; notice: OperationNotice; requestId?: string; invoiceId?: string; invoiceNumber?: string; invoiceStatus?: string; journalEntryId?: string; }
const INVOICE_CREATE_GUARDS_KEY = 'firmbooks_invoice_create_guards_v1';
const INVOICE_CREATE_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const INVOICE_VOID_GUARDS_KEY = 'firmbooks_invoice_void_guards_v1';
const INVOICE_VOID_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

function readInvoiceCreateGuards(): InvoiceCreateGuard[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(INVOICE_CREATE_GUARDS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((g): g is InvoiceCreateGuard => g && typeof g.organizationId === 'string' && typeof g.userId === 'string' && typeof g.idempotencyKey === 'string' && INVOICE_VOID_KEY_PATTERN.test(g.idempotencyKey) && typeof g.requestHash === 'string' && INVOICE_CREATE_HASH_PATTERN.test(g.requestHash) && g.payload && typeof g.payload === 'object' && !Array.isArray(g.payload) && ['pending','needs-verification','committed','rejected','conflict'].includes(g.status) && g.notice && typeof g.notice.message === 'string').map(g => ['pending','needs-verification'].includes(g.status) ? {...g,status:'needs-verification',notice:{tone:'warning',title:'Invoice creation needs verification',message:'A saved request is awaiting server verification. Check its status before creating another invoice.',requestId:g.requestId}} : g);
  } catch { return []; }
}
function writeInvoiceCreateGuards(guards: InvoiceCreateGuard[]): boolean { try { sessionStorage.setItem(INVOICE_CREATE_GUARDS_KEY, JSON.stringify(guards)); return true; } catch { return false; } }
function readInvoiceVoidGuards(): InvoiceVoidGuard[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(INVOICE_VOID_GUARDS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((guard): guard is InvoiceVoidGuard =>
      guard && typeof guard.invoiceId === 'string' && typeof guard.organizationId === 'string' &&
      typeof guard.userId === 'string' && typeof guard.reason === 'string' && guard.reason.trim().length >= 3 &&
      typeof guard.idempotencyKey === 'string' && INVOICE_VOID_KEY_PATTERN.test(guard.idempotencyKey) &&
      ['pending', 'needs-verification', 'conflict', 'verified'].includes(guard.status) &&
      typeof guard.committed === 'boolean' && guard.notice && typeof guard.notice.message === 'string'
    ).map((guard) => guard.status === 'verified' ? {
      ...guard,
      status: 'needs-verification',
      notice: { tone: 'warning', title: 'Invoice void needs verification', message: 'A saved browser receipt is not proof of the current invoice state. Verify the server operation before continuing.', requestId: guard.requestId },
    } : guard);
  } catch {
    return [];
  }
}

function writeInvoiceVoidGuards(guards: InvoiceVoidGuard[]): boolean {
  try {
    sessionStorage.setItem(INVOICE_VOID_GUARDS_KEY, JSON.stringify(guards));
    return true;
  } catch {
    return false;
  }
}
export interface PaymentReversalGuard {
  paymentId: string;
  organizationId: string;
  userId?: string;
  status: 'pending' | 'needs-verification' | 'conflict' | 'verified';
  committed: boolean;
  notice: OperationNotice;
  requestId?: string;
  reversalJournalId?: string;
}

const TIME_OPERATION_GUARDS_KEY = 'firmbooks_time_operation_guards_v1';
const PAYMENT_REVERSAL_GUARDS_KEY = 'firmbooks_payment_reversal_guards_v1';

function readSessionGuardList<T>(key: string, isGuard: (value: any) => boolean): T[] {
  try {
    const records = JSON.parse(sessionStorage.getItem(key) || '[]');
    return Array.isArray(records) ? records.filter(isGuard) : [];
  } catch {
    return [];
  }
}

function writeSessionGuardList<T>(key: string, guards: T[]): void {
  try { sessionStorage.setItem(key, JSON.stringify(guards)); } catch { /* Keep unresolved guards in memory if storage is unavailable. */ }
}

function isTimeOperationGuard(value: any): value is TimeOperationGuard {
  return value && typeof value.key === 'string' && typeof value.organizationId === 'string' &&
    typeof value.projectId === 'string' && ['pending', 'uncertain', 'resolved'].includes(value.status) &&
    value.notice && typeof value.notice.message === 'string';
}

function isPaymentReversalGuard(value: any): value is PaymentReversalGuard {
  return value && typeof value.paymentId === 'string' && typeof value.organizationId === 'string' &&
    ['pending', 'needs-verification', 'conflict', 'verified'].includes(value.status) &&
    typeof value.committed === 'boolean' && value.notice && typeof value.notice.message === 'string';
}

export interface CommittedOperationResult<T> {
  data: T;
  requestId?: string;
  refreshFailed: boolean;
}

export type AccountAction = 'archive' | 'restore' | 'delete' | 'update';

export interface AccountActionGuard {
  organizationId: string;
  accountId: string;
  userId: string;
  action: AccountAction;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  requestId?: string;
}

const ACCOUNT_ACTION_GUARDS_KEY = 'firmbooks_account_action_guards_v1';

function readAccountActionGuards(): AccountActionGuard[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(ACCOUNT_ACTION_GUARDS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((guard): guard is AccountActionGuard =>
      guard && typeof guard.organizationId === 'string' &&
      typeof guard.accountId === 'string' &&
      ['archive', 'restore', 'delete', 'update'].includes(guard.action) &&
      typeof guard.idempotencyKey === 'string' &&
      guard.payload && typeof guard.payload === 'object'
    ).map((guard) => ({ ...guard, userId: typeof guard.userId === 'string' ? guard.userId : '' }));
  } catch {
    return [];
  }
}

const BooksContext = createContext<BooksContextType | undefined>(undefined);

const ORGS_LIST_KEY = 'firmbooks_orgs_list_v2';
const ACTIVE_ORG_ID_KEY = 'firmbooks_active_org_id_v2';
const ORG_DATA_PREFIX = 'firmbooks_org_data_';
const LEGACY_STORAGE_KEY = 'firmbooks_clean_v1';

const getCurrencySymbol = (code: string): string => {
  switch (code?.toUpperCase()) {
    case 'INR': return '₹';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'CAD': return 'C$';
    case 'AUD': return 'A$';
    case 'AED': return 'AED ';
    case 'SGD': return 'S$';
    case 'USD': return '$';
    default: return code ? `${code.toUpperCase()} ` : '';
  }
};

const defaultOrgMeta: OrganizationMeta = {
  id: '',
  uuid: '',
  publicOrgId: '',
  orgCode: '',
  name: 'Loading organization…',
  industry: '',
  country: '',
  baseCurrency: '',
  currencySymbol: '',
  createdDate: '',
  primaryContactName: '',
  primaryContactEmail: '',
  ownerUserId: '',
  subscription: 'Starter',
  timezone: 'UTC',
  status: 'Suspended',
  isPrimary: false,
};

const createDefaultSettingsForOrg = (org: OrganizationMeta): FirmSettings => {
  const symbol = org.currencySymbol || getCurrencySymbol(org.baseCurrency);
  return {
    ...SAFE_INITIAL_SETTINGS,
    firmName: org.name,
    firmEmail: org.primaryContactEmail || '',
    firmPhone: org.phone || '',
    firmAddress: `${org.address || ''} ${org.city || ''} ${org.state || ''} ${org.zipCode || ''}`.trim(),
    taxId: org.taxId || '',
    currencyCode: org.baseCurrency || '',
    currencySymbol: symbol,
    logoText: org.name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'ORG',
    orgProfileDetails: {
      ...SAFE_INITIAL_SETTINGS.orgProfileDetails!,
      organizationName: org.name,
      industry: org.industry || '',
      locationCountry: org.country || '',
      baseCurrency: org.baseCurrency || '',
      primaryContactName: org.primaryContactName || '',
      primaryContactEmail: org.primaryContactEmail || '',
      companyId: org.orgCode,
    },
  };
};

const loadOrgData = (orgId: string, orgMeta?: OrganizationMeta) => {
  const isDefault = orgId === defaultOrgMeta.id;
  try {
    const storageKey = ORG_DATA_PREFIX + orgId;
    let raw = localStorage.getItem(storageKey);

    // Migration fallback from legacy key for default org
    if (!raw && isDefault) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      const fallbackSettings = orgMeta ? createDefaultSettingsForOrg(orgMeta) : SAFE_INITIAL_SETTINGS;
      return {
        // Only presentation preferences may come from the browser. Organization
        // identity, compliance settings, and every financial record remain
        // server-authoritative.
        settings: {
          ...fallbackSettings,
          userPreferences: {
            ...fallbackSettings.userPreferences,
            ...(parsed.settings?.userPreferences || {}),
          },
        },
        accounts: [],
        clients: [],
        salespersons: [],
        vendors: [],
        projects: [],
        timeEntries: [],
        invoices: [],
        estimates: [],
        expenses: [],
        journalEntries: [],
        periodLocks: [],
        salesOrders: [],
        deliveryChallans: [],
        creditNotes: [],
        paymentsReceived: [],
        purchaseOrders: [],
        bills: [],
        paymentsMade: [],
      };
    }
  } catch (e) {
    console.error('Failed loading workspace data for org:', orgId, e);
  }

  // Fallback defaults for a clean organization without stored data
  const fallbackSettings = orgMeta ? createDefaultSettingsForOrg(orgMeta) : SAFE_INITIAL_SETTINGS;
  return {
    settings: fallbackSettings,
    accounts: [],
    clients: [],
    salespersons: [],
    vendors: [],
    projects: [],
    timeEntries: [],
    invoices: [],
    estimates: [],
    expenses: [],
    journalEntries: [],
    periodLocks: [],
    salesOrders: [],
    deliveryChallans: [],
    creditNotes: [],
    paymentsReceived: [],
    purchaseOrders: [],
    bills: [],
    paymentsMade: [],
  };
};

export const BooksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authContext = useOptionalAuth();
  const [organizationsVerified, setOrganizationsVerified] = useState(authContext === null);
  const organizationGenerationRef = useRef(0);
  const accountReadTicketRef = useRef(0);
  const wasTransitioningRef = useRef(Boolean(authContext?.sessionTransitioning));
  if (authContext?.sessionTransitioning && !wasTransitioningRef.current) {
    organizationGenerationRef.current += 1;
    accountReadTicketRef.current += 1;
  }
  wasTransitioningRef.current = Boolean(authContext?.sessionTransitioning);
  const liveAuthIdentityRef = useRef({ userId: authContext?.user?.id || '', sessionRevision: authContext?.sessionRevision ?? -1, available: authContext !== null, transitioning: Boolean(authContext?.sessionTransitioning) });
  liveAuthIdentityRef.current = { userId: authContext?.user?.id || '', sessionRevision: authContext?.sessionRevision ?? -1, available: authContext !== null, transitioning: Boolean(authContext?.sessionTransitioning) };
  const accountSessionBindingRef = useRef<{ userId: string; sessionRevision: number; authToken: string | null }>({ userId: '', sessionRevision: -1, authToken: null });
  if (authContext) {
    const currentBinding = accountSessionBindingRef.current;
    if (currentBinding.userId !== authContext.user?.id || currentBinding.sessionRevision !== authContext.sessionRevision) {
      accountSessionBindingRef.current = authContext.user?.id && localStorage.getItem('firmbooks_authenticated') === 'true'
        ? { userId: authContext.user.id, sessionRevision: authContext.sessionRevision, authToken: localStorage.getItem('auth_token') }
        : { userId: '', sessionRevision: authContext.sessionRevision, authToken: null };
    }
  }
  const trustedAccountActionUserId = (): string => {
    if (localStorage.getItem('firmbooks_authenticated') !== 'true') return '';
    const binding = accountSessionBindingRef.current;
    if (!binding.userId || binding.authToken !== localStorage.getItem('auth_token')) return '';
    const liveIdentity = liveAuthIdentityRef.current;
    if (liveIdentity.transitioning) return '';
    if (liveIdentity.available && (liveIdentity.userId !== binding.userId || liveIdentity.sessionRevision !== binding.sessionRevision)) return '';
    if (!liveIdentity.available && currentUserIdRef.current !== binding.userId) return '';
    return binding.userId;
  };
  const isTrustedAccountActionSession = (userId: string, authToken: string | null, sessionRevision: number): boolean =>
    Boolean(userId) && trustedAccountActionUserId() === userId &&
    localStorage.getItem('auth_token') === authToken &&
    !liveAuthIdentityRef.current.transitioning &&
    (!liveAuthIdentityRef.current.available || liveAuthIdentityRef.current.sessionRevision === sessionRevision);

  // Organizations List State
  const [organizations, setOrganizations] = useState<OrganizationMeta[]>([defaultOrgMeta]);

  const [currentOrgId, setCurrentOrgId] = useState<string>(() => {
    if (authContext) return '';
    try {
      const savedId = localStorage.getItem('active_organization_id') || localStorage.getItem(ACTIVE_ORG_ID_KEY);
      if (savedId) return savedId;
    } catch (e) {}
    return '';
  });

  const currentOrg = organizations.find((o) => o.id === currentOrgId) || organizations[0] || defaultOrgMeta;

  const refreshOrganizations = useCallback(async () => {
    if (!localStorage.getItem('firmbooks_authenticated')) return;
    const requestedUserId = authContext?.user?.id || '';
    const requestedToken = localStorage.getItem('auth_token');
    if (authContext) setOrganizationsVerified(false);
    await apiClient.get<any[]>('/organizations').then((response) => {
      if (
        (authContext && (liveAuthIdentityRef.current.userId !== requestedUserId || localStorage.getItem('auth_token') !== requestedToken)) ||
        (authContext && liveAuthIdentityRef.current.transitioning) ||
        localStorage.getItem('firmbooks_authenticated') !== 'true'
      ) return;
      if (response.error) throw new Error(response.error);
      if (!Array.isArray(response.data) || response.data.length === 0) {
        if (authContext) {
          organizationGenerationRef.current += 1;
          activeOrgIdRef.current = '';
          setOrganizations([]);
          setCurrentOrgId('');
          setOrganizationsVerified(true);
        }
        return;
      }
      const serverOrganizations = response.data.map((org) => ({
        id: org.id,
        uuid: org.uuid || org.id,
        publicOrgId: org.public_org_id || org.publicOrgId || org.id,
        orgCode: org.org_code || org.orgCode || '',
        name: org.name,
        industry: org.industry || '',
        country: org.country || '',
        baseCurrency: org.base_currency || org.baseCurrency || '',
        currencySymbol: org.currency_symbol || org.currencySymbol || '',
        createdDate: org.created_at || new Date().toISOString(),
        ownerUserId: org.owner_user_id || '',
        subscription: org.subscription,
        timezone: org.timezone || 'UTC',
        status: org.status || 'Active',
      })) as OrganizationMeta[];
      setOrganizations(serverOrganizations);
      if (!authContext) {
        const fallbackOrgId = serverOrganizations[0].id;
        if (!serverOrganizations.some((org) => org.id === activeOrgIdRef.current)) {
          organizationGenerationRef.current += 1;
          activeOrgIdRef.current = fallbackOrgId;
          localStorage.setItem('active_organization_id', fallbackOrgId);
        }
        setCurrentOrgId(activeId => serverOrganizations.some(org => org.id === activeId) ? activeId : fallbackOrgId);
        return;
      }
      const storedOrgId = localStorage.getItem('active_organization_id') || localStorage.getItem(ACTIVE_ORG_ID_KEY);
      const selectedOrgId = serverOrganizations.some((org) => org.id === storedOrgId) ? storedOrgId! : serverOrganizations[0].id;
      if (activeOrgIdRef.current !== selectedOrgId) {
        organizationGenerationRef.current += 1;
        activeOrgIdRef.current = selectedOrgId;
      }
      localStorage.setItem('active_organization_id', selectedOrgId);
      localStorage.setItem(ACTIVE_ORG_ID_KEY, selectedOrgId);
      setCurrentOrgId(selectedOrgId);
      setOrganizationsVerified(true);
    });
  }, [authContext?.user?.id]);

  useEffect(() => {
    void refreshOrganizations().catch(error => console.error('Organization list could not be refreshed:', error));
  }, [refreshOrganizations]);

  // Global User Identity State ("A Person Exists Only Once")
  const [currentUser, setCurrentUser] = useState<UserIdentity>({
    userId: '',
    uuid: '',
    email: '',
    fullName: '',
    isEmailVerified: false,
    mfaEnabled: false,
    createdAt: '',
    status: 'Active',
  });

  useEffect(() => {
    if (authContext) {
      const user = authContext.user;
      setCurrentUser((current) => user
        ? { ...current, userId: user.id, uuid: user.id, email: user.email, fullName: user.fullName }
        : { ...current, userId: '', uuid: '', email: '', fullName: '' });
      return;
    }
    const authToken = localStorage.getItem('auth_token');
    if (localStorage.getItem('firmbooks_authenticated') !== 'true') return;
    let active = true;
    apiClient.get<{ user: { id: string; email: string; fullName: string } }>('/auth/me').then((response) => {
      if (!active || !response.data?.user || localStorage.getItem('firmbooks_authenticated') !== 'true' || localStorage.getItem('auth_token') !== authToken) return;
      const user = response.data.user;
      accountSessionBindingRef.current = { userId: user.id, sessionRevision: 0, authToken };
      setCurrentUser((current) => ({ ...current, userId: user.id, uuid: user.id, email: user.email, fullName: user.fullName }));
    });
    return () => { active = false; };
  }, [authContext?.user?.id, authContext?.user?.email, authContext?.user?.fullName, authContext?.sessionRevision, Boolean(authContext)]);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const addAuditLog = (log: Omit<AuditLog, 'id' | 'timestamp' | 'orgUuid' | 'publicOrgId' | 'orgName' | 'userId' | 'userName' | 'userEmail'>) => {
    console.warn('Client-generated audit events are ignored; audit records are server authoritative.');
  };

  // Active Org Tracker Ref to prevent cross-organization state saving during switches
  const activeOrgIdRef = useRef<string>(currentOrgId);
  const currentUserIdRef = useRef(currentUser.userId);
  currentUserIdRef.current = currentUser.userId;

  useEffect(() => () => {
    organizationGenerationRef.current += 1;
    accountReadTicketRef.current += 1;
  }, []);

  const beginAccountRead = () => {
    accountReadTicketRef.current += 1;
    return accountReadTicketRef.current;
  };
  const isCurrentAccountRead = (ticket: number, organizationId: string, generation: number, userId: string, authToken: string | null) =>
    accountReadTicketRef.current === ticket &&
    activeOrgIdRef.current === organizationId &&
    organizationGenerationRef.current === generation &&
    localStorage.getItem('firmbooks_authenticated') === 'true' &&
    localStorage.getItem('auth_token') === authToken &&
    (!userId || currentUserIdRef.current === userId);

  const persistAccountActionGuards = useCallback((next: AccountActionGuard[]): boolean => {
    try {
      sessionStorage.setItem(ACCOUNT_ACTION_GUARDS_KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    allAccountActionGuardsRef.current = next;
    setAllAccountActionGuards(next);
    return true;
  }, []);

  const holdAccountActionGuard = useCallback((
    organizationId: string,
    accountId: string,
    action: AccountAction,
    payload: Record<string, unknown>,
    requestedKey?: string
  ): AccountActionGuard => {
    const trustedUserId = trustedAccountActionUserId();
    if (!currentUser.userId || trustedUserId !== currentUser.userId) {
      throw new ApiRequestError({ data: null, error: 'Wait for your verified sign-in session to load before changing accounts.', status: 409, errorCode: 'OPERATION_NOT_DISPATCHED' }, 'Account action was not sent');
    }
    const normalizedPayload = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const existing = allAccountActionGuardsRef.current.find((guard) =>
      guard.organizationId === organizationId && guard.accountId === accountId
    );
    if (existing) {
      if (!existing.userId || existing.userId !== trustedUserId) {
        throw new ApiRequestError({
          data: null, error: 'Another user has an unresolved action on this account. The initiating user must verify or replay it.',
          status: 409, errorCode: 'COMMAND_IN_PROGRESS', requestId: existing.requestId,
        }, 'Account action is unresolved');
      }
      if (
        existing.action !== action ||
        existing.idempotencyKey !== requestedKey ||
        JSON.stringify(existing.payload) !== JSON.stringify(normalizedPayload)
      ) {
        throw new ApiRequestError({
          data: null, error: 'An earlier account action is unresolved. Verify or replay that exact action first.',
          status: 409, errorCode: 'COMMAND_IN_PROGRESS', requestId: existing.requestId,
        }, 'Account action is unresolved');
      }
      return existing;
    }

    const idempotencyKey = requestedKey || apiClient.createIdempotencyKey();
    const guard: AccountActionGuard = { organizationId, accountId, userId: trustedUserId, action, idempotencyKey, payload: normalizedPayload };
    if (!persistAccountActionGuards([...allAccountActionGuardsRef.current, guard])) {
      throw new ApiRequestError({
        data: null, error: 'The recovery guard could not be saved, so the account action was not sent.',
        status: 400, errorCode: 'OPERATION_NOT_DISPATCHED',
      }, 'Account action was not sent');
    }
    return guard;
  }, [currentUser.userId, persistAccountActionGuards]);

  const clearAccountActionGuard = useCallback((organizationId: string, accountId: string, userId: string): boolean => {
    if (!userId || trustedAccountActionUserId() !== userId) return false;
    const next = allAccountActionGuardsRef.current.filter((guard) =>
      guard.organizationId !== organizationId || guard.accountId !== accountId || guard.userId !== userId
    );
    if (next.length === allAccountActionGuardsRef.current.length) return true;
    return persistAccountActionGuards(next);
  }, [persistAccountActionGuards]);

  const verifyAccountActionStatus = useCallback(async (
    accountId: string,
    organizationId: string = currentOrgId
  ): Promise<'verified' | 'pending' | 'unknown'> => {
    const accountGuards = allAccountActionGuardsRef.current.filter((entry) =>
      entry.organizationId === organizationId && entry.accountId === accountId
    );
    if (accountGuards.length === 0) return 'verified';
    const requestedUserId = trustedAccountActionUserId();
    const guard = accountGuards.find((entry) => entry.userId && entry.userId === requestedUserId);
    if (!guard || !organizationId || !localStorage.getItem('firmbooks_authenticated')) return 'unknown';

    const startedInActiveOrg = activeOrgIdRef.current === organizationId;
    if (!startedInActiveOrg) return 'unknown';
    const requestedGeneration = organizationGenerationRef.current;
    const requestedAuthToken = localStorage.getItem('auth_token');
    const requestedSessionRevision = liveAuthIdentityRef.current.available ? liveAuthIdentityRef.current.sessionRevision : 0;
    const accountReadTicket = beginAccountRead();
    const isCurrentRequest = () =>
      startedInActiveOrg &&
      isCurrentAccountRead(accountReadTicket, organizationId, requestedGeneration, requestedUserId, requestedAuthToken) &&
      isTrustedAccountActionSession(requestedUserId, requestedAuthToken, requestedSessionRevision);

    const response = await apiClient.get<any[]>('/finance/accounts', organizationId);
    if (response.error || !Array.isArray(response.data) || !isCurrentRequest()) return 'unknown';
    if (response.data.some((row: any) => {
      const rowOrganizationId = row.organizationId || row.organization_id;
      return rowOrganizationId && rowOrganizationId !== organizationId;
    })) return 'unknown';

    const refreshedAccounts = (camelizeRecord(response.data) as any[]).map(normalizeAccountForUi);
    const account = refreshedAccounts.find((entry) => entry.id === guard.accountId);
    const matches = guard.action === 'delete'
      ? !account
      : Boolean(account && (guard.action === 'archive'
        ? account.status === 'Archived'
        : guard.action === 'restore'
          ? account.status === 'Active'
          : Object.entries(guard.payload).every(([field, value]) => {
              const expectedValue = field === 'name' && typeof value === 'string'
                ? value.trim()
                : (field === 'description' || field === 'reportingGroup') && typeof value === 'string'
                  ? value.trim() || null
                  : field === 'parentAccountId' && typeof value === 'string'
                    ? value.trim() || null
                    : value ?? null;
              return JSON.stringify((account as any)[field] ?? null) === JSON.stringify(expectedValue);
            })));

    if (isCurrentRequest()) setAccounts((current) => isCurrentRequest() ? refreshedAccounts : current);
    if (!matches) return 'pending';
    if (!clearAccountActionGuard(guard.organizationId, guard.accountId, guard.userId)) return 'pending';
    return 'verified';
  }, [clearAccountActionGuard, currentOrgId]);

  // Initialize workspace data directly for currentOrgId so initial state is immediately matched
  const [initialData] = useState(() => loadOrgData(currentOrgId, currentOrg));

  // Active Workspace Data State
  const [settings, setSettings] = useState<FirmSettings>(initialData.settings);
  const [operationNotice, setOperationNotice] = useState<OperationNotice | null>(null);
  const announceUnavailableOperation = useCallback((title: string, message: string) => {
    setOperationNotice({ tone: 'warning', title, message, recovery: 'Use the supported server-backed workflow for this operation.' });
  }, []);
  const [accounts, setAccounts] = useState<Account[]>(initialData.accounts);
  const [allAccountActionGuards, setAllAccountActionGuards] = useState<AccountActionGuard[]>(readAccountActionGuards);
  const allAccountActionGuardsRef = useRef(allAccountActionGuards);
  allAccountActionGuardsRef.current = allAccountActionGuards;
  const [clients, setClients] = useState<Client[]>(initialData.clients);
  const [salespersons, setSalespersons] = useState<Salesperson[]>(initialData.salespersons);
  const [vendors, setVendors] = useState<Vendor[]>(initialData.vendors);
  const [projects, setProjects] = useState<Project[]>(initialData.projects);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(initialData.timeEntries);
  const [allTimeOperationGuards, setAllTimeOperationGuards] = useState<TimeOperationGuard[]>(() => readSessionGuardList(TIME_OPERATION_GUARDS_KEY, isTimeOperationGuard));
  const [projectSummaries, setProjectSummaries] = useState<ProjectFinancialSummary[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>(initialData.invoices);
  const [allInvoiceVoidGuards, setAllInvoiceVoidGuards] = useState<InvoiceVoidGuard[]>(() => readInvoiceVoidGuards());
  const allInvoiceVoidGuardsRef = useRef(allInvoiceVoidGuards);
  const [allInvoiceCreateGuards, setAllInvoiceCreateGuards] = useState<InvoiceCreateGuard[]>(() => readInvoiceCreateGuards());
  const allInvoiceCreateGuardsRef = useRef(allInvoiceCreateGuards);
  allInvoiceCreateGuardsRef.current = allInvoiceCreateGuards;
  const invoiceCreateReservationsRef = useRef(new Set<string>());
  allInvoiceVoidGuardsRef.current = allInvoiceVoidGuards;
  const invoiceVerificationEpochRef = useRef(new Map<string, number>());
  const getInvoiceVerificationEpoch = (organizationId: string) => invoiceVerificationEpochRef.current.get(organizationId) || 0;
  const advanceInvoiceVerificationEpoch = (organizationId: string) => {
    invoiceVerificationEpochRef.current.set(organizationId, getInvoiceVerificationEpoch(organizationId) + 1);
  };
  const [allPaymentReversalGuards, setAllPaymentReversalGuards] = useState<PaymentReversalGuard[]>(() => readSessionGuardList(PAYMENT_REVERSAL_GUARDS_KEY, isPaymentReversalGuard));
  const [estimates, setEstimates] = useState<Estimate[]>(initialData.estimates);
  const [expenses, setExpenses] = useState<Expense[]>(initialData.expenses);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(initialData.journalEntries);
  const [periodLocks, setPeriodLocks] = useState<PeriodLock[]>(initialData.periodLocks);

  // Tenant identity and base currency arrive from the server after the provider
  // mounts. Replace the empty presentation shell when that authoritative
  // organization record resolves, while preserving user-only preferences.
  useEffect(() => {
    if (!currentOrgId || currentOrg.id !== currentOrgId) return;
    setSettings((existing) => ({
      ...createDefaultSettingsForOrg(currentOrg),
      userPreferences: existing.userPreferences,
    }));
  }, [currentOrg, currentOrgId]);

  // Document states
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(initialData.salesOrders);
  const [deliveryChallans, setDeliveryChallans] = useState<DeliveryChallan[]>(initialData.deliveryChallans);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>(initialData.creditNotes);
  const [paymentsReceived, setPaymentsReceived] = useState<PaymentReceipt[]>(initialData.paymentsReceived);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialData.purchaseOrders);
  const [bills, setBills] = useState<Bill[]>(initialData.bills);
  const [paymentsMade, setPaymentsMade] = useState<PaymentMade[]>(initialData.paymentsMade);

  useEffect(() => writeSessionGuardList(TIME_OPERATION_GUARDS_KEY, allTimeOperationGuards), [allTimeOperationGuards]);
  useEffect(() => writeSessionGuardList(PAYMENT_REVERSAL_GUARDS_KEY, allPaymentReversalGuards), [allPaymentReversalGuards]);

  const reconcileUncertainTimeOperationGuards = useCallback((requestedOrgId: string, refreshedTimeEntries: TimeEntry[]): void => {
    setAllTimeOperationGuards((previous) => previous.flatMap((guard) => {
      if (guard.organizationId !== requestedOrgId || guard.status !== 'uncertain') return [guard];
      const [kind, recordId] = guard.key.split(':', 2);
      if (kind === 'delete') {
        return refreshedTimeEntries.some((entry) => entry.id === recordId) ? [guard] : [];
      }
      if (kind === 'invoice') {
        const targetIds = guard.targetTimeEntryIds || [];
        const targetEntries = targetIds.map((id) => refreshedTimeEntries.find((entry) => entry.id === id));
        const targetInvoiceIds = new Set(targetEntries.map((entry) => entry?.invoiceId).filter((id): id is string => Boolean(id)));
        if (
          targetIds.length > 0
          && targetEntries.every((entry) => Boolean(entry?.isBilled && entry.invoiceId))
          && targetInvoiceIds.size === 1
        ) {
          const invoiceId = [...targetInvoiceIds][0];
          return [{
            ...guard,
            status: 'resolved',
            notice: {
              tone: 'success',
              title: 'Invoice posting confirmed',
              message: 'The selected project time is billed to invoice ' + invoiceId + '.',
            },
          }];
        }
        return [guard];
      }
      return [guard];
    }));
  }, []);

  const refreshAuthoritativeData = useCallback(async (): Promise<boolean> => {
      if (authContext && !organizationsVerified) return false;
      if (!currentOrgId || !localStorage.getItem('firmbooks_authenticated')) return false;
      const requestedOrgId = currentOrgId;
    const requestedUserId = authContext?.user?.id || currentUser.userId;
    const requestedAuthToken = localStorage.getItem('auth_token');
      const requestedGeneration = organizationGenerationRef.current;
      const accountReadTicket = beginAccountRead();
      const invoiceVerificationEpoch = getInvoiceVerificationEpoch(requestedOrgId);
      const isCurrentRequest = () => activeOrgIdRef.current === requestedOrgId && organizationGenerationRef.current === requestedGeneration && (
        !authContext || (
          !liveAuthIdentityRef.current.transitioning &&
          liveAuthIdentityRef.current.userId === requestedUserId &&
          localStorage.getItem('auth_token') === requestedAuthToken
        )
      );
      const isCurrentAccountBatch = () => isCurrentAccountRead(accountReadTicket, requestedOrgId, requestedGeneration, requestedUserId, requestedAuthToken);
      if (!isCurrentRequest()) return false;
      const endpoints = [
        'accounts', 'clients', 'salespersons', 'vendors', 'projects', 'invoices', 'estimates',
        'expenses', 'journals', 'period-locks', 'sales-orders', 'delivery-challans', 'purchase-orders', 'time-entries', 'project-summaries',
        'payments-received', 'credit-notes', 'bills', 'vendor-payments', 'audit',
      ] as const;
      const responses = await fetchFinancialReadBatch(endpoints, requestedOrgId, isCurrentRequest);
      const failure = responses.find((response, index) => (
        response.error
        && response.status !== 403
        && !isExpectedOptionalReadFailure(endpoints[index], response.status)
      ));
      if (failure) throw new Error(failure.error || 'Authoritative financial data is unavailable');
      if (!isCurrentRequest()) return false;
      const data = Object.fromEntries(endpoints.map((endpoint, index) => [
        endpoint,
        responses[index].error ? [] : camelizeRecord(responses[index].data || []),
      ]));
      if (isCurrentAccountBatch()) {
        const refreshedAccounts = (data.accounts || []).map(normalizeAccountForUi);
        setAccounts((current) => isCurrentAccountBatch() ? refreshedAccounts : current);
      }
      setClients(data.clients);
      setSalespersons((data.salespersons || []).map((sp: any) => ({ ...sp, status: String(sp.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive', commissionRate: Number(sp.commissionRate || 0) })));
      setVendors(data.vendors);
      setProjects(data.projects);
      setTimeEntries(data['time-entries']);
      const timeEntriesIndex = endpoints.indexOf('time-entries');
      if (!responses[timeEntriesIndex].error && Array.isArray(responses[timeEntriesIndex].data)) {
        reconcileUncertainTimeOperationGuards(requestedOrgId, data['time-entries'] as TimeEntry[]);
      }
      setProjectSummaries(data['project-summaries']);
      if (getInvoiceVerificationEpoch(requestedOrgId) === invoiceVerificationEpoch) {
        setInvoices((data.invoices || []).map(normalizeInvoiceForUi));
      }
      setEstimates(data.estimates);
      setExpenses((data.expenses || []).map(normalizeExpenseForUi));
      setJournalEntries((data.journals || []).map(normalizeJournalForUi));
      setPeriodLocks(data['period-locks']);
      setSalesOrders((data['sales-orders'] || []).map(normalizeSalesOrderForUi));
      setDeliveryChallans((data['delivery-challans'] || []).map(normalizeDeliveryChallanForUi));
      setPurchaseOrders((data['purchase-orders'] || []).map(normalizePurchaseOrderForUi));
      setPaymentsReceived(data['payments-received']);
      setCreditNotes(data['credit-notes']);
      setBills((data.bills || []).map(normalizeBillForUi));
      setPaymentsMade(data['vendor-payments'] || []);
      void apiClient.get<any>('/organizations/current', requestedOrgId).then((orgRes) => {
        if (!isCurrentRequest()) return;
        const prof = orgRes.data?.profile;
        if (prof?.branding || prof?.logoUrl || prof?.documentTemplates) {
          let b = prof.branding;
          if (typeof b === 'string') {
            try { b = JSON.parse(b); } catch { b = {}; }
          }
          let dt = prof.documentTemplates;
          if (typeof dt === 'string') {
            try { dt = JSON.parse(dt); } catch { dt = {}; }
          }
          setSettings((prev) => ({
            ...prev,
            branding: {
              ...(prev.branding || {}),
              ...(b || {}),
              logoUrl: prof.logoUrl || prev.branding?.logoUrl,
            },
            documentTemplates: {
              ...(prev.documentTemplates || {}),
              ...(dt || {}),
            },
          }));
        }
      }).catch(() => {});
      setAuditLogs((data.audit || []).map((row: any) => {
        const metadata = typeof row.metadata === 'string'
          ? (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })()
          : row.metadata || {};
        const severity = ['Info', 'Warning', 'Critical'].includes(metadata.severity)
          ? metadata.severity
          : 'Info';
        return {
          id: row.id,
          timestamp: row.timestamp,
          userId: row.userId || '',
          userName: row.userId || 'System',
          userEmail: '',
          orgUuid: requestedOrgId,
          publicOrgId: currentOrg.publicOrgId || requestedOrgId,
          orgName: currentOrg.name,
          action: row.action,
          targetResource: `${row.entityType || 'Record'}:${row.entityId || row.id}`,
          ipAddress: metadata.ipAddress || 'Not captured',
          device: metadata.userAgent || 'Not captured',
          severity,
        } as AuditLog;
      }));
      return true;
  }, [Boolean(authContext), authContext?.user?.id || currentUser.userId, organizationsVerified, currentOrg.name, currentOrg.publicOrgId, currentOrgId, reconcileUncertainTimeOperationGuards]);

  const beginTimeOperation = useCallback((key: string, projectId: string): void => {
    if (!currentOrgId) return;
    setAllTimeOperationGuards((previous) => [
      ...previous.filter((guard) => guard.organizationId !== currentOrgId || guard.key !== key),
      {
        key,
        projectId,
        organizationId: currentOrgId,
        userId: currentUser.userId || undefined,
        status: 'pending',
        targetTimeEntryIds: key.startsWith('invoice:')
          ? timeEntries.filter((entry) => entry.projectId === projectId && entry.isBillable && !entry.isBilled).map((entry) => entry.id)
          : undefined,
        notice: { tone: 'warning', title: 'Time operation in progress', message: 'Wait for the server to confirm the outcome.' },
      },
    ]);
  }, [currentOrgId, timeEntries]);

  const completeTimeOperation = useCallback((key: string): void => {
    if (!currentOrgId) return;
    setAllTimeOperationGuards((previous) => previous.filter((guard) => guard.organizationId !== currentOrgId || guard.key !== key));
  }, [currentOrgId]);
  const holdTimeOperationGuard = useCallback((key: string, projectId: string, notice: OperationNotice): void => {
    if (!currentOrgId) return;
    setAllTimeOperationGuards((previous) => {
      const pending = previous.find((guard) => guard.organizationId === currentOrgId && guard.key === key);
      const targetTimeEntryIds = pending?.targetTimeEntryIds ?? (key.startsWith('invoice:')
        ? timeEntries.filter((entry) => entry.projectId === projectId && entry.isBillable && !entry.isBilled).map((entry) => entry.id)
        : undefined);
      return [
        ...previous.filter((guard) => guard.organizationId !== currentOrgId || guard.key !== key),
        { key, projectId, organizationId: currentOrgId, userId: pending?.userId || currentUser.userId || undefined, targetTimeEntryIds, notice, status: 'uncertain' },
      ];
    });
  }, [currentOrgId, currentUser.userId, timeEntries]);
  const refreshDomainData = useCallback(async (endpoints: readonly string[]): Promise<void> => {
    if (!currentOrgId || !localStorage.getItem('firmbooks_authenticated')) {
      throw new Error('The active organization is no longer available for verification');
    }
    const requestedOrgId = currentOrgId;
    const requestedUserId = currentUser.userId;
    const requestedAuthToken = localStorage.getItem('auth_token');
    const requestedGeneration = organizationGenerationRef.current;
    const accountReadTicket = endpoints.includes('accounts') ? beginAccountRead() : undefined;
    const invoiceVerificationEpoch = endpoints.includes('invoices') ? getInvoiceVerificationEpoch(requestedOrgId) : undefined;
    const responses = await Promise.all(endpoints.map((ep) => apiClient.get<any[]>(`/finance/${ep}`, requestedOrgId)));
    if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
      throw new Error('The active organization changed before verification completed');
    }
    const failedIndex = responses.findIndex((response) => response.error || !Array.isArray(response.data));
    if (failedIndex !== -1) {
      throw new ApiRequestError(responses[failedIndex], `Could not reload ${endpoints[failedIndex]} after a committed change`);
    }

    endpoints.forEach((ep, idx) => {
      const res = responses[idx];
      const data = camelizeRecord(res.data);
      switch (ep) {
        case 'accounts':
          if (accountReadTicket !== undefined && isCurrentAccountRead(accountReadTicket, requestedOrgId, requestedGeneration, requestedUserId, requestedAuthToken)) {
            const refreshedAccounts = ((data || []) as any[]).map(normalizeAccountForUi);
            setAccounts((current) => isCurrentAccountRead(accountReadTicket, requestedOrgId, requestedGeneration, requestedUserId, requestedAuthToken) ? refreshedAccounts : current);
          }
          break;
        case 'expenses': setExpenses(((data || []) as any[]).map(normalizeExpenseForUi)); break;
        case 'bills': setBills((data || []).map(normalizeBillForUi)); break;
        case 'invoices':
          if (invoiceVerificationEpoch === getInvoiceVerificationEpoch(requestedOrgId)) setInvoices((data || []).map(normalizeInvoiceForUi));
          break;
        case 'journals': setJournalEntries(((data || []) as any[]).map(normalizeJournalForUi)); break;
        case 'payments-received': setPaymentsReceived(data as PaymentReceipt[]); break;
        case 'vendor-payments': setPaymentsMade(data as PaymentMade[]); break;
        case 'clients': setClients(data as Client[]); break;
        case 'salespersons': setSalespersons((data || []).map((sp: any) => ({ ...sp, status: String(sp.status || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive', commissionRate: Number(sp.commissionRate || 0) }))); break;
        case 'vendors': setVendors(data as Vendor[]); break;
        case 'projects': setProjects(data as Project[]); break;
        case 'time-entries': setTimeEntries(data as TimeEntry[]); break;
        case 'project-summaries': setProjectSummaries(data as ProjectFinancialSummary[]); break;
        case 'period-locks': setPeriodLocks(data as PeriodLock[]); break;
        case 'sales-orders': setSalesOrders((data || []).map(normalizeSalesOrderForUi)); break;
        case 'delivery-challans': setDeliveryChallans((data as any[]).map(normalizeDeliveryChallanForUi)); break;
        case 'purchase-orders': setPurchaseOrders((data || []).map(normalizePurchaseOrderForUi)); break;
        case 'credit-notes': setCreditNotes(data as CreditNote[]); break;
      }
    });
    const timeEntriesIndex = endpoints.indexOf('time-entries');
    if (timeEntriesIndex !== -1 && !responses[timeEntriesIndex].error && Array.isArray(responses[timeEntriesIndex].data)) {
      const refreshedTimeEntries = camelizeRecord(responses[timeEntriesIndex].data) as TimeEntry[];
      reconcileUncertainTimeOperationGuards(requestedOrgId, refreshedTimeEntries);
    }

  }, [currentOrgId, reconcileUncertainTimeOperationGuards]);

  const refreshTimeOperationStatus = useCallback(async (): Promise<boolean> => {
    try {
      await refreshDomainData(['time-entries']);
      await Promise.all([
        refreshDomainData(['project-summaries']).catch(() => undefined),
        refreshDomainData(['invoices']).catch(() => undefined),
      ]);
      return true;
    } catch (error) {
      console.error('Time-operation status could not be verified:', error);
      return false;
    }
  }, [refreshDomainData]);

  const refreshAfterCommittedWrite = useCallback(async (domains?: readonly string[]): Promise<boolean> => {
    try {
      if (domains && domains.length > 0) await refreshDomainData(domains);
      else await refreshAuthoritativeData();
      return true;
    } catch (error) {
      console.error('A committed transaction could not be reloaded for verification:', error);
      setOperationNotice({ tone: 'warning', title: 'Transaction committed, but displayed data may be stale', message: 'The server confirmed the transaction, but the verification refresh failed. Do not submit it again.', recovery: 'Reload the page and verify the authoritative record before taking another action.' });
      return false;
    }
  }, [refreshDomainData, refreshAuthoritativeData]);

  const refreshCommittedWriteWithStatus = useCallback(async (domains?: readonly string[]): Promise<boolean> => {
    if (!currentOrgId || !localStorage.getItem('firmbooks_authenticated') || activeOrgIdRef.current !== currentOrgId) return false;
    try {
      if (domains && domains.length > 0) {
        await refreshDomainData(domains);
      } else {
        return await refreshAuthoritativeData();
      }
      return true;
    } catch (error) {
      console.error('A committed transaction could not be reloaded for verification:', error);
      return false;
    }
  }, [refreshDomainData, refreshAuthoritativeData]);

  const persistInvoiceCreateGuards = useCallback((next: InvoiceCreateGuard[]): boolean => {
    if (!writeInvoiceCreateGuards(next)) return false;
    allInvoiceCreateGuardsRef.current = next;
    setAllInvoiceCreateGuards(next);
    return true;
  }, []);
  const updateInvoiceCreateGuard = useCallback((key: string, update: Partial<InvoiceCreateGuard>): void => {
    persistInvoiceCreateGuards(allInvoiceCreateGuardsRef.current.map(g => g.idempotencyKey === key ? { ...g, ...update } : g));
  }, [persistInvoiceCreateGuards]);
  const dismissInvoiceCreateGuard = useCallback((): void => {
    const guard = allInvoiceCreateGuardsRef.current.find(g => g.organizationId === currentOrgId && g.userId === currentUser.userId);
    if (!guard || !['committed', 'rejected'].includes(guard.status)) return;
    persistInvoiceCreateGuards(allInvoiceCreateGuardsRef.current.filter(g => g.idempotencyKey !== guard.idempotencyKey));
  }, [currentOrgId, currentUser.userId, persistInvoiceCreateGuards]);
  const verifyInvoiceCreateOperationStatus = useCallback(async (): Promise<InvoiceCreateOperationStatus | null> => {
    const guard = allInvoiceCreateGuardsRef.current.find(g => g.organizationId === currentOrgId && g.userId === currentUser.userId);
    if (!guard) return null;
    const requestedOrgId = guard.organizationId;
    const requestedGeneration = organizationGenerationRef.current;
    const response = await apiClient.getInvoiceCreateOperationStatus(guard.idempotencyKey, guard.requestHash, requestedOrgId);
    if (response.error || !response.data) throw new ApiRequestError(response, 'Invoice creation status could not be checked');
    const status = response.data;
    if (status.state === 'UNKNOWN' || status.state === 'PROCESSING') {
      updateInvoiceCreateGuard(guard.idempotencyKey, { status: 'needs-verification', requestId: response.requestId, notice: { tone: 'warning', title: status.state === 'PROCESSING' ? 'Invoice is still processing' : 'Invoice status is not confirmed', message: status.state === 'PROCESSING' ? 'The server is still processing this exact request. Check again before creating another invoice.' : 'The server could not confirm this request. Keep this invoice on hold and check again later.', requestId: response.requestId } });
    } else if (status.state === 'REJECTED') {
      updateInvoiceCreateGuard(guard.idempotencyKey, { status: 'rejected', requestId: response.requestId, notice: { tone: 'warning', title: 'Invoice was not created', message: status.error, requestId: response.requestId } });
    } else if (status.state === 'CONFLICT') {
      updateInvoiceCreateGuard(guard.idempotencyKey, { status: 'conflict', requestId: response.requestId, notice: { tone: 'critical', title: 'Invoice status needs support', message: status.error, requestId: response.requestId } });
    } else if (status.state === 'COMPLETED') {
      const approvalPending = status.invoiceStatus.toUpperCase() === 'SUBMITTED';
      updateInvoiceCreateGuard(guard.idempotencyKey, { status: 'committed', invoiceId: status.invoiceId, invoiceNumber: status.invoiceNumber, invoiceStatus: status.invoiceStatus, journalEntryId: status.journalEntryId, requestId: response.requestId, notice: { tone: approvalPending ? 'warning' : 'success', title: approvalPending ? 'Invoice ' + status.invoiceNumber + ' submitted for approval' : 'Invoice ' + status.invoiceNumber + ' was created', message: approvalPending ? 'The server saved this invoice for approval. It is not posted to the ledger yet; do not submit it again.' : 'The server confirmed the invoice and its financial command. Do not submit this invoice again.', requestId: response.requestId } });
      if (activeOrgIdRef.current === requestedOrgId && organizationGenerationRef.current === requestedGeneration) {
        const refreshed = await refreshCommittedWriteWithStatus(['invoices']);
        if (!refreshed) updateInvoiceCreateGuard(guard.idempotencyKey, { notice: { tone: 'warning', title: approvalPending ? 'Invoice ' + status.invoiceNumber + ' submitted for approval' : 'Invoice ' + status.invoiceNumber + ' was created', message: approvalPending ? 'The invoice is awaiting approval and the list refresh failed. Do not submit it again; reload to update the invoice list.' : 'The server confirmed this invoice, but the list refresh failed. Do not submit it again; reload to update the invoice list.', requestId: response.requestId } });
      }
    }
    return status;
  }, [currentOrgId, currentUser.userId, refreshCommittedWriteWithStatus, updateInvoiceCreateGuard]);

  const clearInvoiceVoidGuard = useCallback((organizationId: string, invoiceId: string): void => {
    const next = allInvoiceVoidGuardsRef.current.filter((guard) => guard.organizationId !== organizationId || guard.invoiceId !== invoiceId);
    allInvoiceVoidGuardsRef.current = next;
    writeInvoiceVoidGuards(next);
    setAllInvoiceVoidGuards(next);
  }, []);

  const verifyInvoiceVoidStatus = useCallback(async (
    invoiceId: string,
    expected?: { requestId?: string; reversalJournalId?: string; idempotencyKey?: string }
  ): Promise<{ status: 'void' | 'active' | 'pending' | 'conflict' | 'rejected'; requestId?: string; error?: string; errorCode?: string; refreshFailed?: boolean }> => {
    if (!currentOrgId || !invoiceId) throw new Error('An active organization and invoice are required to verify this void.');
    const requestedOrgId = currentOrgId;
    const requestedUserId = currentUser.userId;
    const requestedAuthToken = localStorage.getItem('auth_token');
    const requestedGeneration = organizationGenerationRef.current;
    let guard = allInvoiceVoidGuardsRef.current.find((candidate) => candidate.organizationId === requestedOrgId && candidate.invoiceId === invoiceId);
    if (!guard && expected?.idempotencyKey && currentUser.userId) {
      guard = {
        invoiceId, organizationId: requestedOrgId, userId: currentUser.userId,
        status: 'needs-verification', committed: Boolean(expected.reversalJournalId),
        idempotencyKey: expected.idempotencyKey, reason: '',
        requestId: expected.requestId, reversalJournalId: expected.reversalJournalId,
        notice: { tone: 'warning', title: 'Invoice void verification in progress', message: 'Check the original void operation receipt before taking another financial action.', requestId: expected.requestId },
      };
    }

    const holdGuard = (next: InvoiceVoidGuard) => {
      const guards = [
        ...allInvoiceVoidGuardsRef.current.filter((candidate) => candidate.organizationId !== requestedOrgId || candidate.invoiceId !== invoiceId),
        next,
      ];
      allInvoiceVoidGuardsRef.current = guards;
      writeInvoiceVoidGuards(guards);
      setAllInvoiceVoidGuards(guards);
      guard = next;
    };

    if (guard?.idempotencyKey) {
      const operationResponse = await apiClient.getInvoiceVoidOperationStatus(invoiceId, guard.idempotencyKey, requestedOrgId, guard.reason);
      if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
        throw new Error('The active organization changed before invoice operation status completed.');
      }
      if (operationResponse.error || !operationResponse.data) {
        throw new ApiRequestError(operationResponse, 'Invoice void operation status could not be verified');
      }
      const operation = operationResponse.data;
      if (operation.state === 'UNKNOWN' || operation.state === 'PROCESSING') {
        holdGuard({
          ...guard,
          status: 'needs-verification',
          notice: { tone: 'warning', title: 'Invoice void is still unresolved', message: 'The server has no completed receipt yet. Keep financial actions paused; you can retry only the exact saved request.', requestId: guard.requestId },
        });
        return { status: 'pending', requestId: guard.requestId };
      }
      if (operation.state === 'REJECTED') {
        advanceInvoiceVerificationEpoch(requestedOrgId);
        const rejectedResponse = await apiClient.get<any>('/finance/invoices/' + invoiceId, requestedOrgId);
        if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
          throw new Error('The active organization changed before rejected invoice status completed.');
        }
        if (rejectedResponse.error || !rejectedResponse.data?.invoice) {
          const notice: OperationNotice = {
            tone: 'warning', title: 'Void request was rejected; invoice refresh is pending',
            message: 'The saved request is a terminal rejection, but the current invoice state could not be refreshed. Keep financial actions paused and retry the status check.',
            requestId: guard.requestId,
          };
          holdGuard({ ...guard, status: 'needs-verification', committed: false, notice });
          return { status: 'pending', requestId: guard.requestId, error: operation.error, errorCode: operation.code };
        }
        const rejectedInvoice = rejectedResponse.data.invoice;
        if (rejectedInvoice.id !== invoiceId || (rejectedInvoice.organizationId && rejectedInvoice.organizationId !== requestedOrgId)) {
          holdGuard({
            ...guard, status: 'conflict',
            notice: { tone: 'error', title: 'Rejected void needs review', message: 'The rejected operation could not be matched to the authoritative invoice. Financial actions remain paused.', requestId: guard.requestId },
          });
          return { status: 'conflict', requestId: guard.requestId, error: 'The refreshed invoice did not match this request.' };
        }
        const normalizedRejectedInvoice = normalizeInvoiceForUi(rejectedInvoice);
        setInvoices((previous) => previous.some((candidate) => candidate.id === invoiceId)
          ? previous.map((candidate) => candidate.id === invoiceId ? normalizedRejectedInvoice : candidate)
          : [normalizedRejectedInvoice, ...previous]);
        clearInvoiceVoidGuard(requestedOrgId, invoiceId);
        const invoiceIsVoid = ['VOID', 'VOIDED'].includes(String(rejectedInvoice.status || '').trim().toUpperCase());
        return {
          status: invoiceIsVoid ? 'conflict' : 'rejected',
          requestId: rejectedResponse.requestId || guard.requestId,
          error: invoiceIsVoid
            ? 'This exact void request was rejected, but the authoritative invoice is already void. Its current server state has been refreshed.'
            : operation.error,
          errorCode: operation.code,
        };
      }
      if (operation.state === 'CONFLICT') {
        holdGuard({
          ...guard,
          status: 'conflict',
          committed: true,
          reversalJournalId: operation.reversalJournalId || guard.reversalJournalId,
          requestId: operation.requestId || guard.requestId,
          notice: { tone: 'error', title: 'Invoice void needs review', message: operation.error + ' Financial actions remain paused.', requestId: operation.requestId || guard.requestId },
        });
        return { status: 'conflict', requestId: operation.requestId || guard.requestId, error: operation.error };
      }
      if (operation.state !== 'COMPLETED') return { status: 'pending', requestId: guard.requestId };
      if (operation.invoiceId !== invoiceId || !operation.reversalJournalId) {
        holdGuard({
          ...guard,
          status: 'conflict',
          committed: true,
          notice: { tone: 'error', title: 'Invoice void needs review', message: 'The operation receipt did not match this invoice. Financial actions remain paused.', requestId: operation.requestId || guard.requestId },
        });
        return { status: 'conflict', requestId: operation.requestId || guard.requestId };
      }
      guard = {
        ...guard,
        committed: true,
        reversalJournalId: operation.reversalJournalId,
        requestId: operation.requestId || guard.requestId,
      };
      advanceInvoiceVerificationEpoch(requestedOrgId);

      const response = await apiClient.get<any>('/finance/invoices/' + invoiceId, requestedOrgId);
      if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
        throw new Error('The active organization changed before invoice verification completed.');
      }
      if (response.error || !response.data?.invoice) {
        holdGuard({
          ...guard,
          status: 'verified',
          notice: { tone: 'warning', title: 'Invoice void verified; invoice refresh incomplete', message: 'The server verified the void receipt, reversal journal, and audit event, but the invoice detail did not refresh. Financial actions remain paused until the invoice is reloaded.', requestId: guard.requestId },
        });
        return { status: 'void', requestId: guard.requestId, refreshFailed: true };
      }
      const row = response.data.invoice;
      if (row.id !== invoiceId || (row.organizationId && row.organizationId !== requestedOrgId)) {
        throw new Error('The server returned a different invoice or organization during verification.');
      }
      const rowJournalId = typeof row.reversalJournalId === 'string' ? row.reversalJournalId.trim() : '';
      const rowIsVoid = ['VOID', 'VOIDED'].includes(String(row.status || '').trim().toUpperCase());
      if (!rowIsVoid || rowJournalId !== operation.reversalJournalId) {
        holdGuard({
          ...guard,
          status: 'conflict',
          committed: true,
          notice: { tone: 'error', title: 'Invoice void needs review', message: 'The authoritative invoice read conflicts with the verified void operation receipt. Financial actions remain paused; review the invoice, reversal journal, and audit history.', requestId: guard.requestId },
        });
        return { status: 'conflict', requestId: guard.requestId };
      }
      const existing = invoices.find((candidate) => candidate.id === invoiceId);
      const refreshedInvoice = normalizeInvoiceForUi({
        ...(existing || {}),
        ...row,
        clientId: row.clientId || row.customerId || existing?.clientId,
        clientName: row.clientName || row.customerName || existing?.clientName,
        clientEmail: row.clientEmail || row.customerEmail || existing?.clientEmail,
        items: Array.isArray(row.items) ? row.items : Array.isArray(row.lineItems) ? row.lineItems : existing?.items || [],
        reversalJournalId: row.reversalJournalId,
      });
      setInvoices((previous) => previous.some((candidate) => candidate.id === invoiceId)
        ? previous.map((candidate) => candidate.id === invoiceId ? refreshedInvoice : candidate)
        : [refreshedInvoice, ...previous]);
      holdGuard({
        ...guard,
        status: 'verified',
        committed: true,
        reversalJournalId: operation.reversalJournalId,
        requestId: operation.requestId || guard.requestId || response.requestId,
        notice: { tone: 'success', title: 'Invoice void verified', message: 'The server confirms the invoice is Void with posted reversal journal ' + operation.reversalJournalId + ' and its audit event. The verified void remains locked against stale reads.', requestId: operation.requestId || guard.requestId || response.requestId },
      });
      return { status: 'void', requestId: operation.requestId || guard.requestId || response.requestId };
    }

    const response = await apiClient.get<any>('/finance/invoices/' + invoiceId, requestedOrgId);
    if (response.error || !response.data?.invoice) throw new ApiRequestError(response, 'Invoice status could not be verified');
    if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
      throw new Error('The active organization changed before invoice verification completed.');
    }
    const row = response.data.invoice;
    if (row.id !== invoiceId || (row.organizationId && row.organizationId !== requestedOrgId)) {
      throw new Error('The server returned a different invoice or organization during verification.');
    }
    const isVoid = ['VOID', 'VOIDED'].includes(String(row.status || '').trim().toUpperCase());
    const actualJournalId = typeof row.reversalJournalId === 'string' ? row.reversalJournalId.trim() : '';
    if (isVoid) return { status: 'conflict', requestId: response.requestId };
    clearInvoiceVoidGuard(requestedOrgId, invoiceId);
    return { status: 'active', requestId: response.requestId };
  }, [clearInvoiceVoidGuard, currentOrgId, currentUser.userId, invoices]);
  const refreshAccountsAfterCommittedWrite = useCallback(async (expectedAccountId?: string, requestContext?: { organizationId: string; generation: number; userId: string; authToken: string | null }): Promise<boolean> => {
    const requestedOrgId = requestContext?.organizationId || currentOrgId;
    if (!requestedOrgId || !localStorage.getItem('firmbooks_authenticated')) return false;
    const requestedUserId = requestContext?.userId ?? currentUser.userId;
    const requestedAuthToken = requestContext?.authToken ?? localStorage.getItem('auth_token');
    const requestedGeneration = requestContext?.generation ?? organizationGenerationRef.current;
    const accountReadTicket = beginAccountRead();
    const isCurrentRequest = () =>
      currentOrgId === requestedOrgId && isCurrentAccountRead(accountReadTicket, requestedOrgId, requestedGeneration, requestedUserId, requestedAuthToken);
    if (!isCurrentRequest()) return false;
    const response = await apiClient.get<any[]>('/finance/accounts', requestedOrgId);
    if (response.error) throw new ApiRequestError(response, 'Account list could not be refreshed');
    if (!Array.isArray(response.data)) throw new Error('The account list response was invalid');
    if (response.data.some((row: any) => {
      const rowOrganizationId = row.organizationId || row.organization_id;
      return rowOrganizationId && rowOrganizationId !== requestedOrgId;
    })) throw new Error('The account list contained a record from another organization');
    const refreshedAccounts = (camelizeRecord(response.data) as any[]).map(normalizeAccountForUi);
    if (expectedAccountId && !refreshedAccounts.some((account) => account.id === expectedAccountId)) {
      throw new Error('The server did not return the account that was just saved');
    }
    if (!isCurrentRequest()) return false;
    setAccounts((current) => isCurrentRequest() ? refreshedAccounts : current);
    return isCurrentRequest();
  }, [currentOrgId, currentUser.userId]);

  const refreshAccounts = useCallback(async (): Promise<void> => {
    await refreshAccountsAfterCommittedWrite();
  }, [refreshAccountsAfterCommittedWrite]);

  // PostgreSQL is the sole authority for accounting data. Browser storage is
  // intentionally limited to non-financial preferences and never used as a ledger fallback.
  useEffect(() => {
    let cancelled = false;
    refreshAuthoritativeData().catch((error) => {
      if (!cancelled) {
        console.error('Financial data unavailable; no local fallback was used:', error);
      }
    });
    return () => { cancelled = true; };
  }, [refreshAuthoritativeData]);

  // Sync current active org state to localStorage ONLY if activeOrgIdRef matches currentOrgId
  useEffect(() => {
    if (activeOrgIdRef.current !== currentOrgId) {
      return;
    }
    try {
      const dataToSave = { settings: { userPreferences: settings.userPreferences } };
      localStorage.setItem(ORG_DATA_PREFIX + currentOrgId, JSON.stringify(dataToSave));
    } catch (e) {
      console.error('Failed saving workspace data:', e);
    }
  }, [
    currentOrgId,
    settings,
  ]);

  // Sync dark/light theme setting to HTML document root
  useEffect(() => {
    const theme = settings.userPreferences?.theme || 'Light';
    const root = document.documentElement;

    if (theme === 'Dark') {
      root.classList.add('dark');
    } else if (theme === 'Light') {
      root.classList.remove('dark');
    } else if (theme === 'System') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [settings.userPreferences?.theme]);

  // Store only the selected organization as a UI preference. Membership and
  // organization metadata are always reloaded and verified by the server.
  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_ORG_ID_KEY, currentOrgId);
      localStorage.setItem('active_organization_id', currentOrgId);
    } catch (e) {
      console.error('Failed saving orgs list:', e);
    }
  }, [organizations, currentOrgId]);

  // Switch Organization safely with full data isolation
  const switchOrganization = (targetOrgId: string): boolean => {
    if (targetOrgId === currentOrgId && activeOrgIdRef.current === currentOrgId) return true;
    const targetMeta = organizations.find((o) => o.id === targetOrgId);
    if (!targetMeta?.id) return false;

    // Financial records are cleared and reloaded from the authoritative API.
    const targetData = loadOrgData(targetOrgId, targetMeta);

    // 3. Mark activeOrgIdRef to targetOrgId BEFORE state updates
    organizationGenerationRef.current += 1;
    activeOrgIdRef.current = targetOrgId;
    localStorage.setItem('active_organization_id', targetOrgId);

    // 4. Batch state updates together
    setCurrentOrgId(targetOrgId);
    setSettings(targetData.settings);
    setAccounts([]);
    setClients([]);
    setSalespersons(targetData.salespersons);
    setVendors([]);
    setProjects([]);
    setTimeEntries([]);
    setProjectSummaries([]);
    setInvoices([]);
    setEstimates([]);
    setExpenses([]);
    setJournalEntries([]);
    setPeriodLocks([]);
    setSalesOrders([]);
    setDeliveryChallans([]);
    setCreditNotes([]);
    setPaymentsReceived([]);
    setPurchaseOrders(targetData.purchaseOrders);
    setBills([]);
    setPaymentsMade(targetData.paymentsMade);
    return true;
  };

  // Create Organization (Wizard Integration)
  const createOrganization = async (input: CreateOrganizationInput): Promise<OrganizationMeta> => {
    const response = await apiClient.post<any>('/organizations', {
      name: input.name,
      industry: input.industry,
      country: input.country,
      baseCurrency: input.baseCurrency,
      currencySymbol: input.currencySymbol,
    });
    if (!response.data) throw new Error(response.error || 'Organization could not be created');
    const serverMeta: OrganizationMeta = {
      id: response.data.id,
      uuid: response.data.uuid,
      publicOrgId: response.data.publicOrgId,
      orgCode: response.data.orgCode,
      name: response.data.name,
      industry: response.data.industry,
      country: response.data.country,
      baseCurrency: response.data.baseCurrency,
      currencySymbol: response.data.currencySymbol,
      createdDate: response.data.createdAt || new Date().toISOString(),
      primaryContactName: '',
      primaryContactEmail: '',
      ownerUserId: response.data.ownerUserId,
      subscription: response.data.subscription,
      timezone: response.data.timezone || 'UTC',
      status: response.data.status,
    };
    setOrganizations((previous) => [...previous, serverMeta]);
    organizationGenerationRef.current += 1;
    activeOrgIdRef.current = serverMeta.id;
    localStorage.setItem('active_organization_id', serverMeta.id);
    setCurrentOrgId(serverMeta.id);
    return serverMeta;
  };

  // Delete Organization
  const deleteOrganization = (orgId: string): boolean => {
    // Tenant deletion requires a server-side retention workflow and cannot be a
    // browser operation. A dedicated archived/deletion-request API will own it.
    return false;
  };

  // Export Whole Organization as JSON Package
  const exportOrganizationJSON = (targetOrgId?: string) => {
    window.alert('A browser snapshot is not a valid financial backup. Use a verified server export when that workflow is enabled.');
  };

  // Import Organization Package JSON
  const importOrganizationJSON = (jsonString: string): boolean => {
    window.alert('Organization imports require a validated server migration job and are not enabled.');
    return false;
  };



  const updateSettings = (newSettings: Partial<FirmSettings>) => {
    const keys = Object.keys(newSettings);
    if (newSettings.branding || newSettings.userPreferences || newSettings.documentTemplates) {
      setSettings((prev) => ({
        ...prev,
        ...(newSettings.userPreferences ? { userPreferences: { ...prev.userPreferences, ...newSettings.userPreferences } } : {}),
        ...(newSettings.branding ? { branding: { ...(prev.branding || {}), ...newSettings.branding } } : {}),
        ...(newSettings.documentTemplates ? { documentTemplates: { ...(prev.documentTemplates || {}), ...newSettings.documentTemplates } } : {}),
      }));
      if (keys.every((k) => k === 'userPreferences' || k === 'branding' || k === 'documentTemplates')) {
        return;
      }
    }
    window.alert('Business and compliance settings require an audited server workflow and are currently read-only.');
  };

  const addAccount = async (accountData: Omit<Account, 'id'>): Promise<CommittedOperationResult<Account> & { organizationChanged?: boolean }> => {
    const requestedOrgId = currentOrgId;
    const requestedUserId = currentUser.userId;
    const requestedAuthToken = localStorage.getItem('auth_token');
    const requestedGeneration = organizationGenerationRef.current;
    if (!requestedOrgId || !localStorage.getItem('firmbooks_authenticated')) {
      throw new ApiRequestError({ data: null, error: 'An authenticated organization is required.', status: 400 }, 'Account could not be created');
    }
    const requestContext = { organizationId: requestedOrgId, generation: requestedGeneration, userId: requestedUserId, authToken: requestedAuthToken };
    const isCurrentRequest = () => currentOrgId === requestedOrgId && activeOrgIdRef.current === requestedOrgId && organizationGenerationRef.current === requestedGeneration && currentUser.userId === requestedUserId && localStorage.getItem('auth_token') === requestedAuthToken && localStorage.getItem('firmbooks_authenticated') === 'true';
    const response = await apiClient.post<Account>('/finance/accounts', accountData, requestedOrgId);
    if (response.error || !response.data || typeof response.data !== 'object') {
      throw new ApiRequestError(response, 'Account could not be created');
    }
    const newAcc = camelizeRecord({ ...accountData, ...response.data }) as Account;
    if (typeof newAcc.id !== 'string' || !newAcc.id.trim()) {
      throw new ApiRequestError({ ...response, error: 'The server confirmed the request but did not return an account ID.' }, 'Account save requires verification');
    }
    const responseOrgId = (response.data as any).organizationId || (response.data as any).organization_id;
    if (responseOrgId && responseOrgId !== requestedOrgId) {
      throw new ApiRequestError({ ...response, error: 'The server returned an account from a different organization.' }, 'Account save requires verification');
    }
    if (!isCurrentRequest()) {
      return { data: newAcc, requestId: response.requestId, refreshFailed: true, organizationChanged: currentOrgId !== requestedOrgId || activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration };
    }
    // Invalidate account reads that started before this committed write.
    beginAccountRead();
    setAccounts((current) => isCurrentRequest() ? upsertAccount(current, newAcc) : current);
    let refreshed = false;
    try {
      refreshed = await refreshAccountsAfterCommittedWrite(newAcc.id, requestContext);
    } catch (error) {
      console.error('A committed account could not be reloaded for verification:', error);
    }
    const organizationChanged = currentOrgId !== requestedOrgId || activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration;
    return { data: newAcc, requestId: response.requestId, refreshFailed: !refreshed, organizationChanged };
  };

  const updateAccount = async (
    id: string,
    updated: Partial<Account>,
    idempotencyKey?: string
  ): Promise<CommittedOperationResult<Account> & { organizationChanged?: boolean }> => {
    const requestedOrgId = currentOrgId;
    const requestedUserId = currentUser.userId;
    const requestedAuthToken = localStorage.getItem('auth_token');
    const requestedSessionRevision = liveAuthIdentityRef.current.available ? liveAuthIdentityRef.current.sessionRevision : 0;
    const requestedGeneration = organizationGenerationRef.current;
    if (!requestedOrgId || !localStorage.getItem('firmbooks_authenticated')) {
      throw new ApiRequestError({ data: null, error: 'An authenticated organization is required.', status: 400 }, 'Account could not be updated');
    }
    const action: AccountAction = updated.status === 'Archived' ? 'archive' : updated.status === 'Active' ? 'restore' : 'update';
    const guard = holdAccountActionGuard(requestedOrgId, id, action, updated as Record<string, unknown>, idempotencyKey);
    const response = await apiClient.patch<Account>(`/finance/accounts/${id}`, updated, requestedOrgId, guard.idempotencyKey);
    const processing = response.status === 409 && (
      response.errorCode === 'COMMAND_IN_PROGRESS' ||
      String(response.error || '').toLowerCase().includes('already being processed')
    );
    if (response.error) {
      if (response.status < 500 && !processing && isTrustedAccountActionSession(requestedUserId, requestedAuthToken, requestedSessionRevision)) clearAccountActionGuard(requestedOrgId, id, requestedUserId);
      throw new ApiRequestError(response, 'Account could not be updated');
    }

    const updatedAccount = response.data && typeof response.data === 'object'
      ? camelizeRecord(response.data) as Account
      : null;
    const receiptOrganizationId = (updatedAccount as any)?.organizationId || (updatedAccount as any)?.organization_id;
    if (!updatedAccount || updatedAccount.id !== id || (receiptOrganizationId && receiptOrganizationId !== requestedOrgId) || (updated.status && updatedAccount.status !== updated.status)) {
      throw new ApiRequestError({
        ...response,
        data: null,
        status: 500,
        errorCode: 'MALFORMED_SUCCESS_RECEIPT',
        error: 'The server returned an incomplete account update receipt.',
      }, 'Account update outcome could not be confirmed');
    }

    if (!isTrustedAccountActionSession(requestedUserId, requestedAuthToken, requestedSessionRevision)) {
      return { data: updatedAccount, requestId: response.requestId, refreshFailed: true, organizationChanged: false };
    }
    const latestGuard = allAccountActionGuardsRef.current.map((item) =>
      item.organizationId === requestedOrgId && item.accountId === id && item.userId === requestedUserId
        ? { ...item, requestId: response.requestId }
        : item
    );
    persistAccountActionGuards(latestGuard);
    const verification = await verifyAccountActionStatus(id, requestedOrgId);
    const organizationChanged =
      activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration;
    return {
      data: updatedAccount,
      requestId: response.requestId,
      refreshFailed: verification !== 'verified' || organizationChanged,
      organizationChanged,
    };
  };

  const deleteAccount = async (
    id: string,
    idempotencyKey?: string
  ): Promise<CommittedOperationResult<{ deleted: true; id: string }> & { organizationChanged?: boolean }> => {
    const requestedOrgId = currentOrgId;
    const requestedUserId = currentUser.userId;
    const requestedAuthToken = localStorage.getItem('auth_token');
    const requestedSessionRevision = liveAuthIdentityRef.current.available ? liveAuthIdentityRef.current.sessionRevision : 0;
    const requestedGeneration = organizationGenerationRef.current;
    if (!requestedOrgId || !localStorage.getItem('firmbooks_authenticated')) {
      throw new ApiRequestError({ data: null, error: 'An authenticated organization is required.', status: 400 }, 'Account could not be deleted');
    }
    const guard = holdAccountActionGuard(requestedOrgId, id, 'delete', {}, idempotencyKey);
    const response = await apiClient.delete<{ deleted: boolean; id: string }>(
      `/finance/accounts/${id}`, requestedOrgId, guard.idempotencyKey
    );
    const processing = response.status === 409 && (
      response.errorCode === 'COMMAND_IN_PROGRESS' ||
      String(response.error || '').toLowerCase().includes('already being processed')
    );
    if (response.error) {
      if (response.status < 500 && !processing && isTrustedAccountActionSession(requestedUserId, requestedAuthToken, requestedSessionRevision)) clearAccountActionGuard(requestedOrgId, id, requestedUserId);
      throw new ApiRequestError(response, 'Account could not be deleted');
    }
    const receiptOrganizationId = (response.data as any)?.organizationId || (response.data as any)?.organization_id;
    if (!response.data || response.data.deleted !== true || response.data.id !== id || (receiptOrganizationId && receiptOrganizationId !== requestedOrgId)) {
      throw new ApiRequestError({
        ...response,
        data: null,
        status: 500,
        errorCode: 'MALFORMED_SUCCESS_RECEIPT',
        error: 'The server returned an incomplete account deletion receipt.',
      }, 'Account deletion outcome could not be confirmed');
    }

    if (!isTrustedAccountActionSession(requestedUserId, requestedAuthToken, requestedSessionRevision)) {
      return { data: { deleted: true, id }, requestId: response.requestId, refreshFailed: true, organizationChanged: false };
    }
    const latestGuard = allAccountActionGuardsRef.current.map((item) =>
      item.organizationId === requestedOrgId && item.accountId === id && item.userId === requestedUserId
        ? { ...item, requestId: response.requestId }
        : item
    );
    persistAccountActionGuards(latestGuard);
    const verification = await verifyAccountActionStatus(id, requestedOrgId);
    const organizationChanged =
      activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration;
    return {
      data: { deleted: true, id },
      requestId: response.requestId,
      refreshFailed: verification !== 'verified' || organizationChanged,
      organizationChanged,
    };
  };

  const deleteBankAccount = async (id: string): Promise<void> => {
    const result = await BankingService.deleteAccount(id);
    if (result.ledgerAccountId) {
      setAccounts((current) => current.filter((account) => account.id !== result.ledgerAccountId && account.id !== id));
    } else {
      setAccounts((current) => current.filter((account) => account.id !== id));
    }
    await refreshAccounts();
  };

  const addClient = async (clientData: Omit<Client, 'id' | 'createdAt'>): Promise<CommittedOperationResult<Client>> => {
    const response = await apiClient.post<Partial<Client>>('/finance/clients', clientData);
    if (!response.data?.id) throw new ApiRequestError(response, 'Client could not be created');
    const newClient: Client = { ...clientData, ...response.data, id: response.data.id, createdAt: response.data.createdAt || new Date().toISOString() } as Client;
    const refreshed = await refreshCommittedWriteWithStatus(['clients']);
    return { data: newClient, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const updateClient = async (id: string, clientData: Partial<Client>): Promise<CommittedOperationResult<Client>> => {
    const { companyName, taxId, createdAt, currency, ...editable } = clientData;
    const response = await apiClient.patch<{ id: string; changed: boolean }>(`/finance/customers/${id}`, {
      ...editable,
      ...(companyName !== undefined ? { legalName: companyName } : {}),
      ...(taxId !== undefined ? { gstin: taxId } : {}),
    });
    if (!response.data) throw new ApiRequestError(response, 'Customer could not be updated');
    const original = clients.find((client) => client.id === id);
    const updated = { ...original, ...clientData, id } as Client;
    const refreshed = await refreshCommittedWriteWithStatus(['clients']);
    return { data: updated, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const archiveClient = async (id: string): Promise<CommittedOperationResult<{ id: string; changed: boolean; active: boolean }>> => {
    const response = await apiClient.post<{ id: string; changed: boolean; active: boolean }>(`/finance/customers/${id}/archive`, {});
    if (!response.data) throw new ApiRequestError(response, 'Customer could not be archived');
    const refreshed = await refreshCommittedWriteWithStatus(['clients']);
    return { data: response.data, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const addSalesperson = async (spData: Omit<Salesperson, 'id' | 'createdAt'>): Promise<Salesperson> => {
    const response = await apiClient.post<Partial<Salesperson>>('/finance/salespersons', spData);
    if (!response.data?.id) throw new ApiRequestError(response, 'Salesperson could not be created');
    const created = { ...camelizeRecord(response.data), id: response.data.id } as Salesperson;
    await refreshAfterCommittedWrite(['salespersons']); return created;
  };

  const updateSalesperson = async (id: string, spData: Partial<Salesperson>): Promise<Salesperson> => {
    const current = salespersons.find((sp) => sp.id === id);
    if (!current?.updatedAt) throw new Error('Salesperson details are stale. Refresh the directory and try again.');
    const response = await apiClient.patch<Partial<Salesperson>>('/finance/salespersons/' + id, { ...spData, updatedAt: current.updatedAt });
    if (!response.data?.id) throw new ApiRequestError(response, 'Salesperson could not be updated');
    const updated = { ...camelizeRecord(response.data), id } as Salesperson;
    await refreshAfterCommittedWrite(['salespersons']); return updated;
  };

  const deleteSalesperson = async (id: string): Promise<void> => {
    const response = await apiClient.post<{ id: string; active: boolean; changed: boolean }>('/finance/salespersons/' + id + '/archive', {});
    if (!response.data?.id) throw new ApiRequestError(response, 'Salesperson could not be deactivated');
    await refreshAfterCommittedWrite(['salespersons']);
  };

  const restoreSalesperson = async (id: string): Promise<void> => {
    const response = await apiClient.post<{ id: string; active: boolean; changed: boolean }>('/finance/salespersons/' + id + '/restore', {});
    if (!response.data?.id) throw new ApiRequestError(response, 'Salesperson could not be restored');
    await refreshAfterCommittedWrite(['salespersons']);
  };

  const addVendor = async (vendorData: Omit<Vendor, 'id'>): Promise<Vendor> => {
    const response = await apiClient.post<Partial<Vendor>>('/finance/vendors', vendorData);
    if (!response.data?.id) throw new Error(response.error || 'Vendor could not be created');
    const newVendor: Vendor = { ...vendorData, ...response.data, id: response.data.id } as Vendor;
    await refreshAfterCommittedWrite(['vendors']);
    return newVendor;
  };

  const updateVendor = async (id: string, vendorData: Partial<Vendor>): Promise<Vendor> => {
    const response = await apiClient.put<Partial<Vendor>>(`/finance/vendors/${id}`, vendorData);
    if (!response.data?.id) throw new Error(response.error || 'Vendor could not be updated');
    const updatedVendor = { ...response.data, id } as Vendor;
    await refreshAfterCommittedWrite(['vendors']);
    return updatedVendor;
  };

  const archiveVendor = async (id: string): Promise<void> => {
    const response = await apiClient.post<{ id: string; active: boolean }>(`/finance/vendors/${id}/archive`, {});
    if (response.error || response.data?.active !== false) throw new Error(response.error || 'Vendor could not be archived');
    await refreshAfterCommittedWrite(['vendors']);
  };

  const restoreVendor = async (id: string): Promise<void> => {
    const response = await apiClient.post<{ id: string; active: boolean }>(`/finance/vendors/${id}/restore`, {});
    if (response.error || response.data?.active !== true) throw new Error(response.error || 'Vendor could not be restored');
    await refreshAfterCommittedWrite(['vendors']);
  };

  const deleteVendor = async (id: string): Promise<void> => {
    await archiveVendor(id);
  };

  const addProject = async (projectData: Omit<Project, 'id' | 'createdAt'>): Promise<CommittedOperationResult<Project>> => {
    const response = await apiClient.post<Partial<Project>>('/finance/projects', projectData);
    if (!response.data?.id) throw new ApiRequestError(response, 'Project could not be created');
    const newPrj: Project = { ...projectData, ...response.data, id: response.data.id, createdAt: response.data.createdAt || new Date().toISOString() } as Project;
    const refreshed = await refreshCommittedWriteWithStatus(['projects']);
    return { data: newPrj, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const updateProject = async (id: string, projectData: Partial<Project>): Promise<CommittedOperationResult<Project & { changed?: boolean }>> => {
    const { clientId, ...fields } = projectData;
    const response = await apiClient.patch<Partial<Project> & { changed: boolean }>(`/finance/projects/${id}`, {
      ...fields,
      ...(clientId !== undefined ? { customerId: clientId || null } : {}),
    });
    if (!response.data?.id) throw new ApiRequestError(response, 'Project could not be updated');
    const original = projects.find((project) => project.id === id);
    const { customerId, changed, ...serverFields } = response.data as Partial<Project> & { customerId?: string | null; changed: boolean };
    const refreshed = await refreshCommittedWriteWithStatus(['projects']);
    return {
      data: {
        ...original,
        ...projectData,
        ...serverFields,
        ...(customerId !== undefined ? { clientId: customerId || undefined } : {}),
        id,
        changed,
      } as Project & { changed?: boolean },
      requestId: response.requestId,
      refreshFailed: !refreshed,
    };
  };

  const archiveProject = async (id: string): Promise<CommittedOperationResult<{ id: string; archived: boolean; changed: boolean; archivedAt: string | null }>> => {
    const response = await apiClient.post<{ id: string; archived: boolean; changed: boolean; archivedAt: string | null }>(`/finance/projects/${id}/archive`, {});
    if (!response.data) throw new ApiRequestError(response, 'Project could not be archived');
    const refreshed = await refreshCommittedWriteWithStatus(['projects']);
    return { data: response.data, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const getTimeEntryCreateOperationStatus = useCallback(async (idempotencyKey: string, organizationId: string): Promise<Awaited<ReturnType<typeof apiClient.getTimeEntryCreateOperationStatus>> | null> => {
    const requestedGeneration = organizationGenerationRef.current;
    if (activeOrgIdRef.current !== organizationId) return null;
    const response = await apiClient.getTimeEntryCreateOperationStatus(idempotencyKey, organizationId);
    if (activeOrgIdRef.current !== organizationId || organizationGenerationRef.current !== requestedGeneration) return null;
    return response;
  }, []);

  const addTimeEntry = async (entry: Omit<TimeEntry, 'id'>, organizationId?: string, idempotencyKey?: string): Promise<CommittedOperationResult<TimeEntry>> => {
    const requestedOrgId = organizationId || currentOrgId;
    const requestedGeneration = organizationGenerationRef.current;
    if (!requestedOrgId) throw new Error('An organization is required to save time.');
    const response = await apiClient.post<TimeEntry>('/finance/time-entries', entry, requestedOrgId, idempotencyKey);
    if (!response.data) throw new ApiRequestError(response, 'Time entry could not be saved');
    if (!response.data.id) {
      throw new ApiRequestError({
        ...response,
        error: 'The server accepted the time entry but returned no entry ID. Verify Time Logs before retrying.',
        retryable: true,
        recovery: 'Open Time Logs and verify whether the entry was created before taking another action.',
      }, 'Time entry save outcome needs verification');
    }
    if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
      return { data: response.data, requestId: response.requestId, refreshFailed: true };
    }
    let refreshed = false;
    try {
      const read = await apiClient.get<any[]>('/finance/time-entries', requestedOrgId);
      if (read.error || !Array.isArray(read.data)) throw new ApiRequestError(read, 'Could not reload time entries after save');
      if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
        return { data: response.data, requestId: response.requestId, refreshFailed: true };
      }
      const rows = camelizeRecord(read.data) as TimeEntry[];
      setTimeEntries(rows);
      reconcileUncertainTimeOperationGuards(requestedOrgId, rows);
      refreshed = true;
    } catch (error) {
      console.error('Committed time entry could not be verified for its organization:', error);
    }
    return { data: response.data, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const updateTimeEntry = async (id: string, entryData: Partial<TimeEntry>): Promise<boolean> => {
    const response = await apiClient.put<TimeEntry>(`/finance/time-entries/${id}`, entryData);
    if (!response.data) throw new Error(response.error || 'Time entry could not be updated');
    await refreshAfterCommittedWrite();
    return true;
  };

  const deleteTimeEntry = async (id: string): Promise<CommittedOperationResult<void>> => {
    const response = await apiClient.delete(`/finance/time-entries/${id}`);
    if (response.error || response.status < 200 || response.status >= 300) {
      throw new ApiRequestError(response, 'Time entry could not be deleted');
    }
    const refreshed = await refreshCommittedWriteWithStatus(['time-entries']);
    void refreshDomainData(['project-summaries']).catch((error) => console.error('Project summary could not be refreshed after deleting time:', error));
    return { data: undefined, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const addInvoice = async (invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber'> & { expenseIds?: string[] }): Promise<CommittedOperationResult<Invoice>> => {
    if (!currentOrgId || activeOrgIdRef.current !== currentOrgId) throw new Error('An active organization is required to create an invoice');
    if (!currentUser.userId) throw new Error('Your user identity is still loading. Wait before creating an invoice.');
    const requestedOrgId = currentOrgId;
    const requestedUserId = currentUser.userId;
    const requestedAuthToken = localStorage.getItem('auth_token');
    const reservationKey = requestedOrgId + ':' + requestedUserId;
    if (allInvoiceCreateGuardsRef.current.some(g => g.organizationId === requestedOrgId && g.userId === requestedUserId) || invoiceCreateReservationsRef.current.has(reservationKey)) throw new Error('Verify or dismiss the saved invoice creation receipt before creating another invoice');
    invoiceCreateReservationsRef.current.add(reservationKey);
    const requestedGeneration = organizationGenerationRef.current;
    const payload = { clientId: invoiceData.clientId, clientName: invoiceData.clientName, clientEmail: invoiceData.clientEmail, projectId: invoiceData.projectId, salespersonId: invoiceData.salespersonId, issueDate: invoiceData.issueDate, dueDate: invoiceData.dueDate, items: invoiceData.items, discount: invoiceData.discount, notes: invoiceData.notes, expenseIds: invoiceData.expenseIds };
    let idempotencyKey: string;
    let requestHash: string;
    try {
      idempotencyKey = apiClient.createIdempotencyKey();
      requestHash = await apiClient.createOperationRequestHash('POST', '/finance/invoices', payload);
      const guard: InvoiceCreateGuard = { organizationId: requestedOrgId, userId: requestedUserId, idempotencyKey, requestHash, payload, status: 'pending', notice: { tone: 'warning', title: 'Invoice creation is being verified', message: 'If the connection is interrupted, check this exact request before trying again.' } };
      if (allInvoiceCreateGuardsRef.current.some(g => g.organizationId === requestedOrgId && g.userId === requestedUserId)) throw new Error('Another invoice create operation was reserved before this request could be sent');
      const nextGuards = [...allInvoiceCreateGuardsRef.current, guard];
      if (!persistInvoiceCreateGuards(nextGuards)) throw new Error('Invoice request could not be saved safely in this browser, so it was not sent');
      const identityStillMatches = currentUserIdRef.current === requestedUserId && activeOrgIdRef.current === requestedOrgId && organizationGenerationRef.current === requestedGeneration && localStorage.getItem('active_organization_id') === requestedOrgId && localStorage.getItem('auth_token') === requestedAuthToken;
      if (!identityStillMatches) {
        persistInvoiceCreateGuards(allInvoiceCreateGuardsRef.current.filter(g => g.idempotencyKey !== idempotencyKey));
        throw new Error('Your organization or signed-in identity changed before invoice creation was sent. The unsent request was discarded; review the active account and submit again.');
      }
    } catch (error) {
      invoiceCreateReservationsRef.current.delete(reservationKey);
      throw error;
    }
    invoiceCreateReservationsRef.current.delete(reservationKey);
    const response = await apiClient.post<any>('/finance/invoices', payload, requestedOrgId, idempotencyKey);
    if (response.error || !response.data) {
      updateInvoiceCreateGuard(idempotencyKey, { status: 'needs-verification', requestId: response.requestId, notice: { tone: 'warning', title: 'Invoice creation outcome is uncertain', message: response.error || 'The server did not confirm whether the invoice was created. Check its status before continuing.', requestId: response.requestId } });
      throw new ApiRequestError(response, 'Invoice creation outcome is uncertain');
    }
    if (response.status !== 201 || typeof response.data.id !== 'string' || !response.data.id.trim() || typeof response.data.invoiceNumber !== 'string' || !response.data.invoiceNumber.trim() || typeof response.data.commandId !== 'string' || !response.data.commandId.trim() || !((String(response.data.status).toUpperCase() === 'POSTED' && typeof response.data.journalEntryId === 'string' && response.data.journalEntryId.trim()) || (String(response.data.status).toUpperCase() === 'SUBMITTED' && !response.data.journalEntryId))) {
      updateInvoiceCreateGuard(idempotencyKey, { status: 'needs-verification', requestId: response.requestId, notice: { tone: 'warning', title: 'Invoice receipt needs verification', message: 'The server response was incomplete. Check the saved request status before creating another invoice.', requestId: response.requestId } });
      throw new ApiRequestError({ ...response, data: null, error: 'The invoice response did not include a verifiable financial receipt' }, 'Invoice response could not be verified');
    }
    const submittedForApproval = String(response.data.status).toUpperCase() === 'SUBMITTED';
    const newInv = normalizeInvoiceForUi({ ...invoiceData, id: response.data.id, invoiceNumber: response.data.invoiceNumber, totalAmount: Number(response.data.totalAmount), balanceDue: Number(response.data.balanceDue), paidAmount: 0, status: response.data.status, journalEntryId: response.data.journalEntryId, editVersion: response.data.editVersion, createdAt: new Date().toISOString().split('T')[0] });
    updateInvoiceCreateGuard(idempotencyKey, { status: 'committed', invoiceId: newInv.id, invoiceNumber: newInv.invoiceNumber, invoiceStatus: submittedForApproval ? 'SUBMITTED' : 'POSTED', journalEntryId: submittedForApproval ? undefined : response.data.journalEntryId, requestId: response.requestId, notice: { tone: submittedForApproval ? 'warning' : 'success', title: submittedForApproval ? 'Invoice ' + newInv.invoiceNumber + ' submitted for approval' : 'Invoice ' + newInv.invoiceNumber + ' was created', message: submittedForApproval ? 'The server saved this invoice for approval. It is not posted to the ledger yet; do not submit it again.' : 'The server confirmed the posted financial command. Do not submit this invoice again.', requestId: response.requestId } });
    let refreshed = false;
    if (activeOrgIdRef.current === requestedOrgId && organizationGenerationRef.current === requestedGeneration) refreshed = await refreshCommittedWriteWithStatus(['invoices']);
    if (!refreshed) updateInvoiceCreateGuard(idempotencyKey, { notice: { tone: 'warning', title: submittedForApproval ? 'Invoice ' + newInv.invoiceNumber + ' submitted for approval' : 'Invoice ' + newInv.invoiceNumber + ' was created', message: submittedForApproval ? 'The invoice is awaiting approval and the list refresh failed. Do not submit it again; reload to update the invoice list.' : 'The server confirmed the invoice, but the invoice list could not be refreshed. Do not submit it again; reload to update the invoice list.', requestId: response.requestId } });
    return { data: newInv, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const assertInvoiceVoidMutationAllowed = (invoiceId: string): void => {
    if (currentOrgId && allInvoiceVoidGuardsRef.current.some((guard) => guard.organizationId === currentOrgId && guard.invoiceId === invoiceId)) {
      throw new Error('Invoice financial actions are paused until the audited void status and reversal journal are verified.');
    }
  };

  const updateInvoice = async (id: string, invoiceData: Partial<Invoice>, expectedVersion: string): Promise<Invoice> => {
    assertInvoiceVoidMutationAllowed(id);
    const response = await apiClient.put<any>(`/finance/invoices/${id}`, {
      clientId: invoiceData.clientId,
      clientName: invoiceData.clientName,
      clientEmail: invoiceData.clientEmail,
      projectId: invoiceData.projectId,
      salespersonId: invoiceData.salespersonId,
      issueDate: invoiceData.issueDate,
      dueDate: invoiceData.dueDate,
      items: invoiceData.items,
      discount: invoiceData.discount,
      notes: invoiceData.notes,
      terms: invoiceData.terms,
      editReason: (invoiceData as any)?.editReason,
      expectedVersion,
    });
    if (!response.data) throw new ApiRequestError(response, 'Invoice could not be updated');
    const updated = normalizeInvoiceForUi({
      ...invoiceData,
      ...response.data,
      id: response.data.id,
      invoiceNumber: response.data.invoiceNumber,
      totalAmount: Number(response.data.totalAmount),
      balanceDue: Number(response.data.balanceDue),
      status: response.data.status,
    });
    await refreshAfterCommittedWrite();
    return updated;
  };

  const deleteInvoice = async (id: string, reason: string, requestedIdempotencyKey?: string): Promise<{ requestId?: string; reversalJournalId?: string; refreshFailed?: boolean; verificationStatus?: 'void' | 'conflict' | 'unverified' }> => {
    const auditReason = reason.trim();
    if (auditReason.length < 3) throw new Error('A meaningful void reason is required for the audit trail.');
    if (!currentOrgId) throw new Error('An active organization is required to void an invoice.');
    if (!currentUser.userId) throw new Error('The signed-in user could not be verified.');
    const organizationId = currentOrgId;
    const organizationGeneration = organizationGenerationRef.current;
    const existingGuard = allInvoiceVoidGuardsRef.current.find((guard) => guard.organizationId === organizationId && guard.invoiceId === id);
    const isExactRetry = Boolean(existingGuard && requestedIdempotencyKey === existingGuard.idempotencyKey &&
      existingGuard.userId === currentUser.userId && !existingGuard.committed && existingGuard.reason === auditReason &&
      ['pending', 'needs-verification'].includes(existingGuard.status));
    if (existingGuard && !isExactRetry) assertInvoiceVoidMutationAllowed(id);
    if (!existingGuard) assertInvoiceVoidMutationAllowed(id);
    if (requestedIdempotencyKey && !isExactRetry) throw new Error('The saved invoice void request cannot be changed or replayed with a different payload.');
    const idempotencyKey = isExactRetry ? existingGuard!.idempotencyKey : apiClient.createIdempotencyKey();
    const holdGuard = (guard: InvoiceVoidGuard): boolean => {
      const guards = [
        ...allInvoiceVoidGuardsRef.current.filter((candidate) => candidate.organizationId !== organizationId || candidate.invoiceId !== id),
        guard,
      ];
      allInvoiceVoidGuardsRef.current = guards;
      const persisted = writeInvoiceVoidGuards(guards);
      setAllInvoiceVoidGuards(guards);
      return persisted;
    };
    const pendingGuard: InvoiceVoidGuard = {
      organizationId, invoiceId: id, userId: currentUser.userId, status: 'pending', committed: false,
      idempotencyKey, reason: auditReason,
      notice: { tone: 'warning', title: 'Invoice void in progress', message: 'Wait for the server to confirm the audited reversal.' },
    };
    if (!holdGuard(pendingGuard)) {
      clearInvoiceVoidGuard(organizationId, id);
      throw new Error('This browser could not save the invoice void recovery record, so the invoice was not voided.');
    }
    try {
      const response = await apiClient.post<any>('/security/void-invoice', { invoiceId: id, reason: auditReason }, organizationId, idempotencyKey);
      if (response.error || !response.data) throw new ApiRequestError(response, 'Invoice could not be voided');
      const result = response.data.result || response.data;
      if (result.success !== true || result.invoiceId !== id || typeof result.journalEntryId !== 'string' || !result.journalEntryId.trim()) {
        throw new Error('The server response did not confirm the invoice and reversal journal. Verify status before retrying.');
      }
      const reversalJournalId = result.journalEntryId.trim();
      holdGuard({
        ...pendingGuard, status: 'needs-verification', committed: true, requestId: response.data.requestId || response.requestId, reversalJournalId,
        notice: { tone: 'warning', title: 'Invoice void confirmed; verification in progress', message: 'The server confirmed the reversal. Keep this invoice paused until its receipt, journal, and audit evidence are verified.', requestId: response.data.requestId || response.requestId },
      });
      if (activeOrgIdRef.current !== organizationId || organizationGenerationRef.current !== organizationGeneration) {
        holdGuard({
          ...pendingGuard, status: 'needs-verification', committed: true, requestId: response.data.requestId || response.requestId, reversalJournalId,
          notice: { tone: 'warning', title: 'Invoice voided; organization changed before refresh', message: 'The server confirmed the invoice reversal while another organization became active. Return to the original organization and verify this invoice before continuing.', requestId: response.data.requestId || response.requestId },
        });
        return { requestId: response.data.requestId || response.requestId, reversalJournalId, refreshFailed: true };
      }
      setInvoices((previous) => previous.map((candidate) => candidate.id === id
        ? normalizeInvoiceForUi({ ...candidate, status: 'VOIDED', balanceDue: 0, reversalJournalId })
        : candidate));
      const refreshed = await refreshCommittedWriteWithStatus();
      if (activeOrgIdRef.current !== organizationId || organizationGenerationRef.current !== organizationGeneration) {
        holdGuard({
          ...pendingGuard, status: 'needs-verification', committed: true, requestId: response.data.requestId || response.requestId, reversalJournalId,
          notice: { tone: 'warning', title: 'Invoice voided; organization changed during refresh', message: 'The reversal is committed. Return to the original organization and verify this invoice before continuing.', requestId: response.data.requestId || response.requestId },
        });
        return { requestId: response.data.requestId || response.requestId, reversalJournalId, refreshFailed: true };
      }
      try {
        const verification = await verifyInvoiceVoidStatus(id, { requestId: response.data.requestId || response.requestId, reversalJournalId, idempotencyKey });
        if (verification.status === 'void') {
          return { requestId: verification.requestId || response.requestId, reversalJournalId, refreshFailed: !refreshed || verification.refreshFailed, verificationStatus: 'void' };
        }
        return { requestId: verification.requestId || response.requestId, reversalJournalId, refreshFailed: true, verificationStatus: verification.status === 'conflict' ? 'conflict' : 'unverified' };
      } catch (verificationError) {
        if (activeOrgIdRef.current !== organizationId || organizationGenerationRef.current !== organizationGeneration) {
          holdGuard({
            ...pendingGuard, status: 'needs-verification', committed: true, requestId: response.data.requestId || response.requestId, reversalJournalId,
            notice: { tone: 'warning', title: 'Invoice voided; organization changed during verification', message: 'The reversal is committed. Return to the original organization and verify this invoice before continuing.', requestId: response.data.requestId || response.requestId },
          });
          return { requestId: response.data.requestId || response.requestId, reversalJournalId, refreshFailed: true, verificationStatus: 'unverified' };
        }
        holdGuard({
          ...pendingGuard, status: 'needs-verification', committed: true, requestId: response.data.requestId || response.requestId, reversalJournalId,
          notice: { tone: 'warning', title: 'Invoice voided; operation evidence unavailable', message: 'The server returned reversal journal ' + reversalJournalId + ', but its operation, journal, and audit evidence could not be verified. Financial actions remain paused.', recovery: 'Retry status verification before taking further action.', requestId: response.data.requestId || response.requestId },
        });
        return { requestId: response.data.requestId || response.requestId, reversalJournalId, refreshFailed: true, verificationStatus: 'unverified' };
      }
    } catch (error) {
      const uncertain = error instanceof ApiRequestError ? isUncertainMutationOutcome(error.response) : true;
      if (uncertain) {
        const notice = mutationExceptionNotice(error, {
          action: 'Invoice void', failureTitle: 'Invoice was not voided',
          uncertainTitle: 'Invoice void outcome could not be confirmed',
          uncertainRecovery: 'Verify the saved operation status, then replay only this exact request key and reason if the server has not completed it.',
        });
        holdGuard({
          ...pendingGuard, status: 'needs-verification', committed: false, requestId: notice.requestId, notice,
        });
      } else {
        clearInvoiceVoidGuard(organizationId, id);
      }
      throw error;
    }
  };
  const addEstimate = (estimateData: Omit<Estimate, 'id' | 'createdAt' | 'estimateNumber'>) => {
    window.alert('Use the server-backed quotation workspace to create estimates.');
  };

  const convertEstimateToInvoice = async (estimateId: string): Promise<Invoice | null> => {
    window.alert('Quotation conversion is available only through the atomic server conversion workflow.');
    return null;
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>): Promise<void> => {

    if (expenseData.currency && expenseData.currency !== settings.currencyCode) {
      throw new Error('Foreign-currency expenses require a server-verified exchange-rate workflow.');
    }
    const response = await apiClient.post<any>('/finance/expenses', {
      expenseAccountId: expenseData.accountId,
      paidFromAccountId: expenseData.paidFromAccountId,
      vendorId: expenseData.vendorId,
      vendorName: expenseData.vendorName,
      vendorInvoiceNumber: expenseData.invoiceNumber,
      date: expenseData.date,
      amount: expenseData.amount,
      taxRate: expenseData.taxRate,
      taxAmount: expenseData.taxAmount,
      taxAccountId: expenseData.taxAccountId,
      isTaxInclusive: expenseData.isTaxInclusive,
      isRcm: expenseData.isRcm,
      rcmTaxAccountId: expenseData.rcmTaxAccountId,
      tdsRate: expenseData.tdsRate,
      tdsAmount: expenseData.tdsAmount,
      tdsSection: expenseData.tdsSection,
      tdsAccountId: expenseData.tdsAccountId,
      description: expenseData.description,
      projectId: expenseData.projectId,
      clientId: expenseData.clientId,
      isBillable: expenseData.isBillable,
      markupPercentage: expenseData.markupPercentage,
      sellingPrice: expenseData.sellingPrice,
      isItemized: expenseData.isItemized,
      items: expenseData.items,
      receiptImages: expenseData.receiptImages,
    });
    if (!response.data) {
      throw new Error([response.error || 'Expense could not be posted', response.recovery].filter(Boolean).join(' '));
    }
    await refreshAfterCommittedWrite();
  };

  const deleteExpense = async (id: string, reason: string): Promise<CommittedOperationResult<Expense>> => {
    const auditReason = reason.trim();
    if (auditReason.length < 3) throw new Error('A meaningful void reason is required for the audit trail.');
    const response = await apiClient.post<any>(`/finance/expenses/${id}/void`, { reason: auditReason });
    if (!response.data) throw new ApiRequestError(response, 'Expense could not be voided');
    const refreshed = await refreshCommittedWriteWithStatus();
    return { data: response.data as Expense, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const updateExpense = async (
    id: string,
    expenseData: Partial<Expense> & { accountId?: string; paidFromAccountId?: string; invoiceNumber?: string; receiptImages?: any },
    reason?: string
  ): Promise<void> => {
    if (expenseData.currency && expenseData.currency !== settings.currencyCode) {
      throw new Error('Foreign-currency expenses require a server-verified exchange-rate workflow.');
    }
    const editReason = reason?.trim() || 'Expense updated';
    const response = await apiClient.put<any>(`/finance/expenses/${id}`, {
      reason: editReason,
      editReason,
      expenseAccountId: expenseData.accountId,
      paidFromAccountId: expenseData.paidFromAccountId,
      vendorId: expenseData.vendorId,
      vendorName: expenseData.vendorName,
      vendorInvoiceNumber: expenseData.invoiceNumber,
      date: expenseData.date,
      amount: expenseData.amount,
      taxRate: expenseData.taxRate,
      taxAmount: expenseData.taxAmount,
      taxAccountId: expenseData.taxAccountId,
      isTaxInclusive: expenseData.isTaxInclusive,
      isRcm: expenseData.isRcm,
      rcmTaxAccountId: expenseData.rcmTaxAccountId,
      tdsRate: expenseData.tdsRate,
      tdsAmount: expenseData.tdsAmount,
      tdsSection: expenseData.tdsSection,
      tdsAccountId: expenseData.tdsAccountId,
      description: expenseData.description,
      projectId: expenseData.projectId,
      clientId: expenseData.clientId,
      isBillable: expenseData.isBillable,
      markupPercentage: expenseData.markupPercentage,
      sellingPrice: expenseData.sellingPrice,
      isItemized: expenseData.isItemized,
      items: expenseData.items,
      receiptImages: expenseData.receiptImages,
    });
    if (!response.data) {
      throw new Error([response.error || 'Expense could not be updated', response.recovery].filter(Boolean).join(' '));
    }
    await refreshAfterCommittedWrite();
  };

  const correctExpense = async (
    id: string,
    expenseData: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>,
    reason: string
  ): Promise<void> => {
    await updateExpense(id, expenseData, reason);
  };

  const convertExpenseToInvoice = async (expenseId: string, issueDate?: string, dueDate?: string): Promise<CommittedOperationResult<any>> => {
    const response = await apiClient.post<any>(`/finance/expenses/${expenseId}/convert-to-invoice`, {
      issueDate,
      dueDate,
    });
    if (!response.data) throw new ApiRequestError(response, 'Failed to convert expense to invoice');
    const refreshed = await refreshCommittedWriteWithStatus();
    return { data: response.data, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const attachExpenseReceipts = async (expenseId: string, receiptImages: ExpenseReceiptUpload[]): Promise<CommittedOperationResult<ExpenseReceiptAttachment[]>> => {
    const response = await apiClient.post<{ attachments: ExpenseReceiptAttachment[] }>(`/finance/expenses/${expenseId}/receipts`, { receiptImages });
    if (!response.data) throw new ApiRequestError(response, 'Receipt images could not be attached');
    const refreshed = await refreshCommittedWriteWithStatus();
    return { data: response.data.attachments, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const addJournalEntry = (
    entryData: Omit<JournalEntry, 'id' | 'createdAt' | 'entryNumber'>
  ): Promise<boolean> => {
    return (async () => {
    const totalDebit = entryData.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = entryData.lines.reduce((sum, l) => sum + (l.credit || 0), 0);

    // Double-entry validation
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return false;
    }

    const response = await apiClient.post<any>('/finance/journals', {
      date: entryData.date,
      reference: entryData.reference,
      narration: entryData.description,
      lines: entryData.lines,
      status: entryData.status,
    });
    if (!response.data) throw new Error(response.error || 'Journal could not be posted');
    await refreshAfterCommittedWrite();
    return true;
    })();
  };

  // Helper function: Project Financial Summary
  const getProjectSummary = (projectId: string): ProjectFinancialSummary => {
    return projectSummaries.find((summary) => summary.projectId === projectId) || {
      projectId, totalInvoiced: 0, totalCollected: 0, directExpenses: 0,
      unbilledHoursAmount: 0, totalLoggedHours: 0, netProfit: 0,
      profitMarginPercent: 0, budgetUsedPercent: 0,
    };
  };

  // Helper function: Convert all unbilled time for a project into a new invoice
  const convertUnbilledTimeToInvoice = async (projectId: string, clientId: string): Promise<CommittedOperationResult<Invoice>> => {
    const mutationOrgId = currentOrgId;
    const today = new Date().toISOString().split('T')[0];
    const response = await apiClient.post<any>(`/finance/projects/${projectId}/invoice-unbilled-time`, { issueDate: today, dueDate: today });
    if (!response.data?.id || !response.data?.invoiceNumber) {
      throw new ApiRequestError(response, 'Unbilled time could not be invoiced');
    }
    const refreshed = await refreshCommittedWriteWithStatus(['time-entries']);
    const invoice = normalizeInvoiceForUi({ ...response.data, clientId, paidAmount: 0, balanceDue: response.data.totalAmount });
    if (mutationOrgId && activeOrgIdRef.current === mutationOrgId) {
      setInvoices((previous) => [invoice, ...previous.filter((existing) => existing.id !== invoice.id)]);
    }
    void refreshDomainData(['project-summaries']).catch((error) => console.error('Project summary could not be refreshed after invoicing time:', error));
    return {
      data: invoice,
      requestId: response.requestId,
      refreshFailed: !refreshed,
    };
  };

  const addPeriodLock = async (lockData: Omit<PeriodLock, 'id' | 'lockedAt' | 'status'>): Promise<void> => {
    const response = await apiClient.post<PeriodLock>('/finance/period-locks', lockData);
    if (!response.data) throw new Error(response.error || 'Period lock could not be saved');
    await refreshAfterCommittedWrite();
  };

  const deletePeriodLock = (id: string) => {
    window.alert('Period locks cannot be removed locally. Use the audited period-reopen workflow.');
  };

  const toggleAccountLock = (
    accountId: string,
    lockDetails?: { lockedBy?: string; lockedReason?: string; lockedRegion?: string }
  ) => {
    window.alert('Account lock changes require an audited server workflow and are not enabled yet.');
  };

  const bulkUpdateAccounts = (accountIds: string[], updates: Partial<Account>) => {
    window.alert('Bulk account changes require an audited server workflow and are not enabled yet.');
  };

  const bulkUpdateJournals = (journalIds: string[], updates: Partial<JournalEntry>) => {
    window.alert('Posted journal entries are immutable. Use an audited reversal.');
  };

  // Document handlers
  const addSalesOrder = async (orderData: Omit<SalesOrder, 'id'>, organizationId?: string): Promise<CommittedOperationResult<SalesOrder>> => {
    const matchedClient = clients.find((c) => c.name === orderData.clientName || c.id === orderData.clientId);
    const customerId = orderData.clientId || matchedClient?.id || clients[0]?.id;
    const response = await apiClient.post<any>('/finance/sales-orders', {
      customerId,
      orderDate: orderData.orderDate || new Date().toISOString().split('T')[0],
      expectedDelivery: orderData.expectedDeliveryDate,
      totalAmount: orderData.totalAmount,
      status: orderData.status === 'Confirmed' ? 'CONFIRMED' : 'DRAFT',
      notes: orderData.notes,
      lineItems: [
        {
          description: orderData.notes || 'Sales Order Items',
          quantity: 1,
          unitPrice: orderData.totalAmount,
          taxRate: 0,
          amount: orderData.totalAmount,
        },
      ],
    }, organizationId);
    if (!response.data) throw new ApiRequestError(response, 'Sales order could not be created');
    const refreshed = await refreshCommittedWriteWithStatus(['sales-orders', 'customers', 'clients']);
    return { data: normalizeSalesOrderForUi(response.data), requestId: response.requestId, refreshFailed: !refreshed };
  };

  const updateSalesOrder = async (id: string, updated: Partial<SalesOrder>): Promise<void> => {
    const response = await apiClient.put(`/finance/sales-orders/${id}`, updated);
    if (!response.data) throw new Error(response.error || 'Sales order could not be updated');
    await refreshAfterCommittedWrite(['sales-orders']);
  };

  const deleteSalesOrder = async (id: string, reason: string, organizationId?: string): Promise<CommittedOperationResult<SalesOrder>> => {
    const auditReason = reason.trim();
    if (auditReason.length < 3) throw new Error('A meaningful cancellation reason is required for the audit trail.');
    const response = await apiClient.post<any>(`/finance/sales-orders/${id}/cancel`, { reason: auditReason }, organizationId);
    if (!response.data) throw new ApiRequestError(response, 'Sales order could not be cancelled');
    const refreshed = await refreshCommittedWriteWithStatus(['sales-orders']);
    return { data: normalizeSalesOrderForUi(response.data), requestId: response.requestId, refreshFailed: !refreshed };
  };

  const convertSalesOrderToInvoice = async (salesOrderId: string, partialAmount?: number): Promise<Invoice | null> => {
    const response = await apiClient.post<any>(`/finance/sales-orders/${salesOrderId}/convert-inv`, {
      partialAmount,
    });
    if (!response.data) throw new Error(response.error || 'Sales order could not be converted to invoice');
    await refreshAfterCommittedWrite(['sales-orders', 'invoices', 'accounts', 'clients', 'journals']);
    return normalizeInvoiceForUi(response.data);
  };

  const fulfillSalesOrder = async (salesOrderId: string, details?: any): Promise<any> => {
    const response = await apiClient.post<any>(`/finance/sales-orders/${salesOrderId}/fulfill`, details || {});
    if (!response.data) throw new Error(response.error || 'Sales order fulfillment failed');
    await refreshAfterCommittedWrite(['sales-orders', 'delivery-challans']);
    return response.data;
  };

  const addDeliveryChallan = async (challanData: Omit<DeliveryChallan, 'id'> & { salesOrderId?: string; customerId?: string }): Promise<DeliveryChallan | null> => {
    const matchedClient = clients.find((c) => c.name === challanData.clientName || c.id === challanData.customerId);
    const customerId = challanData.customerId || matchedClient?.id || clients[0]?.id;
    const response = await apiClient.post<any>('/finance/delivery-challans', {
      customerId,
      salesOrderId: challanData.salesOrderId,
      deliveryDate: challanData.dispatchDate || new Date().toISOString().split('T')[0],
      status: challanData.status === 'Delivered' ? 'DELIVERED' : 'DRAFT',
      reason: challanData.itemsSummary || 'Supply on Approval',
      notes: challanData.deliveryAddress || '',
    });
    if (!response.data) throw new Error(response.error || 'Delivery challan could not be created');
    await refreshAfterCommittedWrite(['delivery-challans', 'sales-orders']);
    return {
      id: response.data.id,
      challanNumber: response.data.challanNumber || challanData.challanNumber,
      clientName: response.data.customerName || challanData.clientName,
      dispatchDate: challanData.dispatchDate,
      deliveryAddress: challanData.deliveryAddress,
      itemsSummary: challanData.itemsSummary,
      status: normalizeDeliveryChallanForUi(response.data).status,
    };
  };



  const addCreditNote = async (noteData: Omit<CreditNote, 'id'>): Promise<CreditNote | null> => {
    const matchedClient = clients.find((c) => c.name === noteData.clientName);
    const matchedInvoice = invoices.find((inv) => inv.invoiceNumber === noteData.originalInvoiceNumber);
    const response = await apiClient.post<any>('/finance/credit-notes', {
      invoiceId: matchedInvoice?.id,
      customerId: matchedInvoice?.clientId || matchedClient?.id,
      amount: noteData.totalAmount,
      reason: noteData.reason || 'Sales return / adjustment',
    });
    if (!response.data) throw new Error(response.error || 'Credit note could not be created');
    await refreshAfterCommittedWrite(['credit-notes', 'invoices', 'accounts', 'journals']);
    return {
      id: response.data.id,
      cnNumber: response.data.creditNoteNumber || noteData.cnNumber,
      clientName: noteData.clientName,
      originalInvoiceNumber: noteData.originalInvoiceNumber,
      issueDate: noteData.issueDate || new Date().toISOString().split('T')[0],
      totalAmount: noteData.totalAmount,
      remainingAmount: noteData.remainingAmount ?? noteData.totalAmount,
      status: 'Open',
      reason: noteData.reason,
    };
  };

  const updateCreditNote = (id: string, updated: Partial<CreditNote>) => {
    window.alert('Posted credit notes require an audited server workflow.');
  };

  const deleteCreditNote = async (id: string): Promise<void> => {
    const reason = window.prompt('Reason for reversing this credit note (required for audit trail):')?.trim();
    if (!reason) return;
    const response = await apiClient.post(`/finance/credit-notes/${id}/reverse`, { reason });
    if (!response.data) throw new Error(response.error || 'Credit note could not be reversed');
    await refreshAfterCommittedWrite(['credit-notes', 'invoices', 'accounts', 'journals']);
  };

  const applyCreditNoteToInvoice = async (
    creditNoteId: string,
    invoiceId: string,
    amountToApply: number,
    applyDate?: string
  ): Promise<any> => {
    const response = await apiClient.post<any>('/finance/credit-notes/apply', {
      creditNoteId,
      invoiceId,
      amountToApply,
      applyDate: applyDate || new Date().toISOString().split('T')[0],
    });
    if (response.error || !response.data) {
      throw new Error(response.error || 'Failed to apply credit note to invoice');
    }
    await refreshAfterCommittedWrite(['credit-notes', 'invoices', 'accounts', 'journals']);
    return response.data;
  };

  const recordCustomerRefund = async (payload: {
    customerId: string;
    creditNoteId?: string;
    paymentId?: string;
    advanceId?: string;
    refundDate: string;
    amount: number;
    refundAccountId?: string;
    reference?: string;
    notes?: string;
  }): Promise<any> => {
    const response = await apiClient.post<any>('/finance/refunds', payload);
    if (response.error || !response.data) {
      throw new Error(response.error || 'Failed to record refund');
    }
    await refreshAfterCommittedWrite(['credit-notes', 'invoices', 'accounts', 'journals']);
    return response.data;
  };

  const addPaymentReceived = async (paymentData: Omit<PaymentReceipt, 'id'> & { invoiceId?: string; clientId?: string; depositToAccountId?: string; paymentMode?: string; reference?: string; notes?: string }): Promise<PaymentReceipt> => {
    if (paymentData.invoiceId) assertInvoiceVoidMutationAllowed(paymentData.invoiceId);
    const response = await apiClient.post<any>('/finance/payments-received', {
      paymentNumber: paymentData.paymentNumber,
      clientId: paymentData.clientId,
      clientName: paymentData.clientName,
      paymentDate: paymentData.paymentDate,
      amount: paymentData.amount,
      paymentMode: (paymentData as any).paymentMode || paymentData.paymentMethod || 'Bank Transfer',
      depositToAccountId: paymentData.depositToAccountId,
      invoiceId: paymentData.invoiceId,
      reference: (paymentData as any).reference || paymentData.referenceNumber || '',
      notes: (paymentData as any).notes || '',
    });
    if (!response.data) throw new Error(response.error || 'Payment could not be posted');
    const newPayment: PaymentReceipt = {
      ...paymentData,
      id: response.data.id,
      paymentNumber: response.data.paymentNumber || paymentData.paymentNumber,
    };
    await refreshAfterCommittedWrite(['payments-received', 'invoices', 'accounts', 'clients', 'journals']);
    return newPayment;
  };
  const updatePaymentReceived = async (
    id: string,
    paymentData: Partial<PaymentReceipt> & {
      invoiceId?: string;
      clientId?: string;
      depositToAccountId?: string;
      paymentMode?: string;
      reference?: string;
      notes?: string;
      reason?: string;
    }
  ): Promise<PaymentReceipt> => {
    const response = await apiClient.put<any>(`/finance/payments-received/${id}`, {
      clientId: paymentData.clientId,
      clientName: paymentData.clientName,
      paymentDate: paymentData.paymentDate,
      amount: paymentData.amount,
      paymentMode: (paymentData as any).paymentMode || paymentData.paymentMethod,
      depositToAccountId: paymentData.depositToAccountId,
      invoiceId: paymentData.invoiceId,
      reference: (paymentData as any).reference !== undefined ? (paymentData as any).reference : paymentData.referenceNumber,
      notes: paymentData.notes,
      reason: paymentData.reason || 'Payment corrected',
    });
    if (!response.data) throw new Error(response.error || 'Payment could not be updated');
    const updatedPayment: PaymentReceipt = response.data.payment || response.data;
    await refreshAfterCommittedWrite(['payments-received', 'invoices', 'accounts', 'clients', 'journals']);
    return updatedPayment;
  };

  const holdPaymentReversalGuard = useCallback((guard: PaymentReversalGuard): void => {
    const scopedGuard = { ...guard, userId: guard.userId || currentUser.userId || undefined };
    setAllPaymentReversalGuards((previous) => [
      ...previous.filter((candidate) => candidate.organizationId !== scopedGuard.organizationId || candidate.paymentId !== scopedGuard.paymentId),
      scopedGuard,
    ]);
  }, [currentUser.userId]);

  const verifyPaymentReversalStatus = useCallback(async (paymentId: string, expected?: { requestId?: string; reversalJournalId?: string }): Promise<{ status: 'reversed' | 'active' | 'pending' | 'conflict'; requestId?: string }> => {
    if (!currentOrgId || !paymentId) throw new Error('An active organization and payment are required to verify this reversal.');
    const requestedOrgId = currentOrgId;
    const requestedGeneration = organizationGenerationRef.current;
    const response = await apiClient.get<any[]>('/finance/payments-received', requestedOrgId);
    if (response.error || !Array.isArray(response.data)) throw new ApiRequestError(response, 'Payment reversal status could not be verified');
    if (activeOrgIdRef.current !== requestedOrgId || organizationGenerationRef.current !== requestedGeneration) {
      throw new Error('The active organization changed before payment verification completed.');
    }
    const row = response.data.find((payment) => payment.id === paymentId);
    if (!row) throw new Error('The payment was not present in the authoritative organization payment list.');
    const storedGuard = allPaymentReversalGuards.find(
      (guard) => guard.organizationId === requestedOrgId && guard.paymentId === paymentId,
    );
    const expectedConflictsWithStoredGuard = Boolean(
      expected?.reversalJournalId
      && storedGuard?.reversalJournalId
      && expected.reversalJournalId !== storedGuard.reversalJournalId,
    );
    const existingGuard = expectedConflictsWithStoredGuard
      ? storedGuard
      : expected
        ? {
            ...(storedGuard || {}),
            paymentId,
            organizationId: requestedOrgId,
            status: 'needs-verification' as const,
            committed: true,
            requestId: expected.requestId,
            reversalJournalId: expected.reversalJournalId,
          }
        : storedGuard;
    const normalizedPayment = { ...row, amount: Number(row.amount || 0) } as PaymentReceipt;
    setPaymentsReceived((previous) => previous.map((payment) => payment.id === paymentId ? normalizedPayment : payment));
    const isReversed = String(row.status || '').toUpperCase() === 'REVERSED';
    if (isReversed && row.reversalJournalId && (!existingGuard?.reversalJournalId || row.reversalJournalId === existingGuard.reversalJournalId)) {
      const notice = { tone: 'success' as const, title: 'Payment reversal verified', message: 'The server confirms this payment is reversed with journal ' + row.reversalJournalId + '.', requestId: existingGuard?.requestId || response.requestId };
      holdPaymentReversalGuard({ paymentId, organizationId: requestedOrgId, status: 'verified', committed: true, requestId: existingGuard?.requestId || response.requestId, reversalJournalId: row.reversalJournalId, notice });
      return { status: 'reversed', requestId: response.requestId };
    }
    if (isReversed) {
      holdPaymentReversalGuard({ paymentId, organizationId: requestedOrgId, status: 'conflict', committed: true, requestId: existingGuard?.requestId || response.requestId, reversalJournalId: existingGuard?.reversalJournalId, notice: { tone: 'error', title: 'Payment reversal needs review', message: 'The payment is marked reversed, but its linked reversal journal could not be verified. Financial actions remain paused.', requestId: existingGuard?.requestId || response.requestId } });
      return { status: 'conflict', requestId: response.requestId };
    }
    if (existingGuard?.committed) {
      holdPaymentReversalGuard({ ...existingGuard, status: 'conflict', notice: { tone: 'error', title: 'Payment reversal needs review', message: 'The reversal request was confirmed, but the authoritative payment still appears active. Financial actions remain paused; inspect the payment and journal history before proceeding.', requestId: existingGuard.requestId } });
      return { status: 'conflict', requestId: response.requestId };
    }
    if (existingGuard) {
      holdPaymentReversalGuard({ ...existingGuard, status: 'needs-verification', notice: { tone: 'warning', title: 'Payment reversal is still unresolved', message: 'The authoritative list still shows an active payment. The earlier request may still be processing; do not submit another reversal. Verify again before continuing.', requestId: existingGuard.requestId } });
      return { status: 'pending', requestId: response.requestId };
    }
    return { status: 'active', requestId: response.requestId };
  }, [allPaymentReversalGuards, currentOrgId, holdPaymentReversalGuard]);

  const deletePaymentReceived = async (id: string, reason: string): Promise<{ requestId?: string; reversalJournalId?: string; refreshFailed: boolean }> => {
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 1000) throw new Error('A payment reversal reason containing 3-1000 characters is required.');
    if (!currentOrgId) throw new Error('An active organization is required to reverse a payment.');
    const organizationId = currentOrgId;
    const organizationGeneration = organizationGenerationRef.current;
    const holdGuard = (guard: PaymentReversalGuard) => setAllPaymentReversalGuards((previous) => [
      ...previous.filter((candidate) => candidate.organizationId !== organizationId || candidate.paymentId !== id),
      { ...guard, userId: guard.userId || currentUser.userId || undefined },
    ]);
    holdGuard({ paymentId: id, organizationId, userId: currentUser.userId || undefined, status: 'pending', committed: false, notice: { tone: 'warning', title: 'Payment reversal in progress', message: 'Wait for the server to confirm the audited reversal.' } });
    try {
      const response = await apiClient.post<any>(`/finance/payments-received/${id}/reverse`, { reason: normalizedReason });
      if (response.error || !response.data) throw new ApiRequestError(response, 'Payment could not be reversed');
      if (response.data.success !== true || response.data.paymentId !== id || !response.data.journalEntryId) {
        throw new Error('The server response did not confirm this payment and its reversal journal. Verify status before retrying.');
      }
      const reversalJournalId = String(response.data.journalEntryId);
      holdGuard({ paymentId: id, organizationId, status: 'needs-verification', committed: true, requestId: response.requestId, reversalJournalId, notice: { tone: 'warning', title: 'Payment reversal confirmed; verification in progress', message: 'The server confirmed the reversal. Keep this payment paused until its refreshed state is available.', requestId: response.requestId } });
      if (activeOrgIdRef.current !== organizationId || organizationGenerationRef.current !== organizationGeneration) {
        holdGuard({ paymentId: id, organizationId, status: 'needs-verification', committed: true, requestId: response.requestId, reversalJournalId, notice: { tone: 'warning', title: 'Payment reversed; organization changed', message: 'Return to the original organization and verify this payment before continuing.', requestId: response.requestId } });
        return { requestId: response.requestId, reversalJournalId, refreshFailed: true };
      }
      setPaymentsReceived((previous) => previous.map((payment) => payment.id === id ? { ...payment, status: 'REVERSED', reversalJournalId } : payment));
      const refreshed = await refreshCommittedWriteWithStatus(['payments-received', 'invoices', 'accounts', 'clients', 'journals']);
      if (activeOrgIdRef.current !== organizationId || organizationGenerationRef.current !== organizationGeneration) {
        holdGuard({ paymentId: id, organizationId, status: 'needs-verification', committed: true, requestId: response.requestId, reversalJournalId, notice: { tone: 'warning', title: 'Payment reversed; organization changed during refresh', message: 'The reversal is committed. Return to the original organization and verify this payment before continuing.', requestId: response.requestId } });
        return { requestId: response.requestId, reversalJournalId, refreshFailed: true };
      }
      let verificationConflict = false;
      if (refreshed) {
        try {
          const verification = await verifyPaymentReversalStatus(id, { requestId: response.requestId, reversalJournalId });
          if (verification.status === 'reversed') {
            holdGuard({ paymentId: id, organizationId, status: 'verified', committed: true, requestId: response.requestId, reversalJournalId, notice: { tone: 'success', title: 'Payment reversal completed', message: 'Payment ' + id + ' remains in history with reversal journal ' + reversalJournalId + '.', requestId: response.requestId } });
            return { requestId: response.requestId, reversalJournalId, refreshFailed: false };
          }
          verificationConflict = verification.status === 'conflict';
        } catch (verificationError) {
          console.error('Committed payment reversal could not be verified:', verificationError);
        }
      }
      if (!verificationConflict) holdGuard({ paymentId: id, organizationId, status: 'needs-verification', committed: true, requestId: response.requestId, reversalJournalId, notice: { tone: 'warning', title: 'Payment reversed; authoritative verification is pending', message: 'The server committed the reversal to journal ' + reversalJournalId + ', but the payment list has not yet confirmed that journal. Financial actions remain paused.', recovery: 'Verify the authoritative payment status before continuing.', requestId: response.requestId } });
      return { requestId: response.requestId, reversalJournalId, refreshFailed: true };
    } catch (error) {
      const uncertain = error instanceof ApiRequestError ? isUncertainMutationOutcome(error.response) : true;
      if (uncertain) {
        const notice = mutationExceptionNotice(error, { action: 'Payment reversal', failureTitle: 'Payment was not reversed', uncertainTitle: 'Payment reversal outcome could not be confirmed', uncertainRecovery: 'Verify the authoritative payment status before retrying; its reversal may already have posted.' });
        holdGuard({ paymentId: id, organizationId, status: 'needs-verification', committed: false, requestId: notice.requestId, notice });
      } else {
        setAllPaymentReversalGuards((previous) => previous.filter((guard) => guard.organizationId !== organizationId || guard.paymentId !== id));
      }
      throw error;
    }
  };

  const addPurchaseOrder = async (orderData: Omit<PurchaseOrder, 'id'>): Promise<CommittedOperationResult<PurchaseOrder>> => {
    const matchedVendor = vendors.find((v) => v.name === orderData.vendorName || v.id === orderData.vendorId);
    const vendorId = orderData.vendorId || matchedVendor?.id || vendors[0]?.id;
    const response = await apiClient.post<any>('/finance/purchase-orders', {
      vendorId,
      vendorName: orderData.vendorName,
      orderDate: orderData.orderDate || new Date().toISOString().split('T')[0],
      expectedDelivery: orderData.expectedDate,
      totalAmount: orderData.totalAmount,
      status: orderData.status === 'Issued' ? 'ISSUED' : 'DRAFT',
      notes: orderData.notes,
      lineItems: [
        {
          description: orderData.notes || 'Purchase Order Items',
          quantity: 1,
          unitPrice: orderData.totalAmount,
          taxRate: 0,
          amount: orderData.totalAmount,
        },
      ],
    });
    if (!response.data) throw new ApiRequestError(response, 'Purchase order could not be created');
    const refreshed = await refreshCommittedWriteWithStatus(['purchase-orders', 'vendors']);
    return { data: normalizePurchaseOrderForUi(response.data), requestId: response.requestId, refreshFailed: !refreshed };
  };

  const updatePurchaseOrder = async (id: string, updated: Partial<PurchaseOrder>): Promise<CommittedOperationResult<PurchaseOrder>> => {
    const response = await apiClient.put<any>(`/finance/purchase-orders/${id}`, updated);
    if (!response.data) throw new ApiRequestError(response, 'Purchase order could not be updated');
    const refreshed = await refreshCommittedWriteWithStatus(['purchase-orders']);
    return { data: normalizePurchaseOrderForUi(response.data), requestId: response.requestId, refreshFailed: !refreshed };
  };

  const deletePurchaseOrder = async (id: string, reason: string): Promise<CommittedOperationResult<PurchaseOrder>> => {
    const auditReason = reason.trim();
    if (auditReason.length < 3) throw new Error('A meaningful cancellation reason is required for the audit trail.');
    const response = await apiClient.post<any>(`/finance/purchase-orders/${id}/cancel`, { reason: auditReason });
    if (!response.data) throw new ApiRequestError(response, 'Purchase order could not be cancelled');
    const refreshed = await refreshCommittedWriteWithStatus(['purchase-orders']);
    return { data: normalizePurchaseOrderForUi(response.data), requestId: response.requestId, refreshFailed: !refreshed };
  };

  const convertPurchaseOrderToBill = async (purchaseOrderId: string, partialAmount?: number): Promise<CommittedOperationResult<Bill>> => {
    const response = await apiClient.post<any>(`/finance/purchase-orders/${purchaseOrderId}/convert-bill`, {
      partialAmount,
    });
    if (!response.data) throw new ApiRequestError(response, 'Purchase order conversion to bill failed');
    const refreshed = await refreshCommittedWriteWithStatus(['purchase-orders', 'bills', 'accounts', 'vendors', 'journals']);
    return { data: normalizeBillForUi(response.data), requestId: response.requestId, refreshFailed: !refreshed };
  };

  const receivePurchaseOrder = async (purchaseOrderId: string, receiptData?: any): Promise<CommittedOperationResult<any>> => {
    const response = await apiClient.post<any>(`/finance/purchase-orders/${purchaseOrderId}/receive`, receiptData || {});
    if (!response.data) throw new ApiRequestError(response, 'Purchase order receipt failed');
    const refreshed = await refreshCommittedWriteWithStatus(['purchase-orders']);
    return { data: response.data, requestId: response.requestId, refreshFailed: !refreshed };
  };

  const addBill = async (billData: Omit<Bill, 'id'> & { vendorId?: string; expenseAccountId?: string; payableAccountId?: string }): Promise<Bill> => {
    const response = await apiClient.post<any>('/finance/bills', billData);
    if (!response.data) throw new Error(response.error || 'Bill could not be posted');
    const newBill: Bill = {
      ...billData,
      id: response.data.id,
      billNumber: response.data.billNumber || billData.billNumber,
      totalAmount: Number(response.data.totalAmount),
    };
    void refreshAfterCommittedWrite(['bills', 'accounts', 'vendor-payments', 'vendors', 'journals']);
    return newBill;
  };
  const updateBill = (id: string, updated: Partial<Bill>) => {
    window.alert('Posted bills require an audited adjustment or reversal workflow.');
  };
  const deleteBill = async (id: string, reason: string): Promise<{ requestId?: string; refreshFailed?: boolean }> => {
    const auditReason = reason.trim();
    if (auditReason.length < 3) throw new Error('A meaningful void reason is required for the audit trail.');
    const response = await apiClient.post(`/finance/bills/${id}/void`, { reason: auditReason });
    if (!response.data) throw new ApiRequestError(response, 'Bill could not be voided');
    const refreshed = await refreshCommittedWriteWithStatus(['bills', 'accounts', 'vendor-payments', 'vendors', 'journals']);
    return { requestId: response.requestId, refreshFailed: !refreshed };
  };

  const addPaymentMade = async (
    paymentData: Omit<PaymentMade, 'id'> & {
      vendorId?: string;
      billId?: string;
      paidFromAccountId?: string;
      allocations?: Array<{ billId: string; amount: number }>;
    }
  ): Promise<PaymentMade> => {
    const cleanVendorName = (paymentData.vendorName || '').trim().toLowerCase();
    const targetVendor = vendors.find(
      (v) =>
        v.id === paymentData.vendorId ||
        (cleanVendorName &&
          ((v.name && v.name.trim().toLowerCase() === cleanVendorName) ||
           (v.companyName && v.companyName.trim().toLowerCase() === cleanVendorName)))
    );
    const vendorId = targetVendor?.id || paymentData.vendorId;

    if (!paymentData.paidFromAccountId) {
      throw new Error('Disbursement bank or cash account (paidFromAccountId) is required.');
    }

    const allocations =
      paymentData.allocations && paymentData.allocations.length > 0
        ? paymentData.allocations
        : paymentData.billId
        ? [{ billId: paymentData.billId, amount: Number(paymentData.amount) }]
        : [];

    const payload = {
      vendorId,
      vendorName: targetVendor?.name || paymentData.vendorName,
      amount: Number(paymentData.amount),
      paidFromAccountId: paymentData.paidFromAccountId,
      paymentDate: paymentData.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMode: paymentData.paymentMethod || 'Bank Wire / NEFT / RTGS',
      reference: paymentData.referenceNumber,
      allocations,
    };

    const response = await apiClient.post<any>('/finance/vendor-payments', payload);
    if (response.error || !response.data) {
      throw new Error(response.error || 'Vendor payment could not be recorded.');
    }

    const newPayment: PaymentMade = {
      id: response.data.id,
      paymentNumber: response.data.paymentNumber || paymentData.paymentNumber,
      vendorName: targetVendor?.name || paymentData.vendorName,
      billNumber: paymentData.billNumber || 'DIRECT-PAYMENT',
      paymentDate: response.data.paymentDate || paymentData.paymentDate,
      paymentMethod: response.data.paymentMode || paymentData.paymentMethod,
      referenceNumber: response.data.reference || paymentData.referenceNumber,
      amount: Number(response.data.amount || paymentData.amount),
    };

    await refreshAfterCommittedWrite(['vendor-payments', 'bills', 'accounts', 'vendors', 'journals']);
    return newPayment;
  };

  const addVendorAdvance = async (advanceData: {
    vendorId: string;
    vendorName?: string;
    amount: number;
    paidFromAccountId: string;
    paidDate?: string;
    paymentMode?: string;
    reference?: string;
    notes?: string;
  }): Promise<any> => {
    if (!advanceData.paidFromAccountId) {
      throw new Error('Disbursement bank or cash account (paidFromAccountId) is required.');
    }
    const response = await apiClient.post<any>('/finance/vendor-advances', {
      vendorId: advanceData.vendorId,
      vendorName: advanceData.vendorName,
      amount: Number(advanceData.amount),
      paidFromAccountId: advanceData.paidFromAccountId,
      paidDate: advanceData.paidDate || new Date().toISOString().slice(0, 10),
      paymentMode: advanceData.paymentMode || 'Bank Wire / NEFT / RTGS',
      reference: advanceData.reference,
      notes: advanceData.notes,
    });
    if (response.error || !response.data) {
      throw new Error(response.error || 'Vendor advance could not be recorded.');
    }
    await refreshAfterCommittedWrite(['vendor-payments', 'bills', 'accounts', 'vendors', 'journals']);
    return response.data;
  };

  const applyVendorAdvance = async (applicationData: {
    advanceId: string;
    vendorId: string;
    billId: string;
    amount: number;
    appliedDate?: string;
  }): Promise<any> => {
    const response = await apiClient.post<any>('/finance/vendor-advances/apply', applicationData);
    if (response.error || !response.data) {
      throw new Error(response.error || 'Vendor advance could not be applied to bill.');
    }
    await refreshAfterCommittedWrite(['vendor-payments', 'bills', 'accounts', 'vendors', 'journals']);
    return response.data;
  };

  const clearAllData = () => {
    window.alert('Financial data cannot be cleared from the browser. Use retention-governed server workflows.');
  };

  const loadSampleData = () => {
    window.alert('Sample financial records are disabled in authenticated workspaces.');
  };

  const resetToDemoData = () => {
    loadSampleData();
  };

  const exportDataJSON = () => {
    window.alert('A browser snapshot is not a valid financial backup. Use a verified server export when that workflow is enabled.');
  };

  const importDataJSON = (jsonString: string): boolean => {
    window.alert('Raw JSON restore is disabled. Use a validated, reconciling server restore workflow.');
    return false;
  };

  const contextValue = useMemo(
    () => ({
      organizations,
      currentOrg,
      switchOrganization,
      refreshOrganizations,
      refreshTimeOperationStatus,
      createOrganization,
      deleteOrganization,
      exportOrganizationJSON,
      importOrganizationJSON,
      settings,
      updateSettings,
      accounts,
      refreshAccounts,
      addAccount,
      accountActionUserId: trustedAccountActionUserId(),
      accountActionGuards: allAccountActionGuards.filter((guard) => guard.organizationId === currentOrgId),
      verifyAccountActionStatus,
      updateAccount,
      deleteAccount,
      deleteBankAccount,
      clients,
      addClient,
      updateClient,
      archiveClient,
      salespersons,
      addSalesperson,
      updateSalesperson,
      deleteSalesperson,
      restoreSalesperson,
      vendors,
      addVendor,
      updateVendor,
      archiveVendor,
      restoreVendor,
      deleteVendor,
      projects,
      addProject,
      updateProject,
      archiveProject,
      timeEntries,
      addTimeEntry,
      getTimeEntryCreateOperationStatus,
      updateTimeEntry,
      deleteTimeEntry,
      timeOperationGuards: allTimeOperationGuards.filter((guard) => guard.organizationId === currentOrgId),
      beginTimeOperation,
      completeTimeOperation,
      holdTimeOperationGuard,
      invoices,
      invoiceVoidGuards: allInvoiceVoidGuards.filter((guard) => guard.organizationId === currentOrgId),
      invoiceCreateGuard: allInvoiceCreateGuards.find((guard) => guard.organizationId === currentOrgId && guard.userId === currentUser.userId) || null,
      verifyInvoiceCreateOperationStatus,
      dismissInvoiceCreateGuard,
      paymentReversalGuards: allPaymentReversalGuards.filter((guard) => guard.organizationId === currentOrgId),
      verifyPaymentReversalStatus,
      verifyInvoiceVoidStatus,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      estimates,
      addEstimate,
      convertEstimateToInvoice,
      expenses,
      addExpense,
      updateExpense,
      correctExpense,
      deleteExpense,
      convertExpenseToInvoice,
      attachExpenseReceipts,
      journalEntries,
      addJournalEntry,
      periodLocks,
      addPeriodLock,
      deletePeriodLock,
      salesOrders,
      addSalesOrder,
      updateSalesOrder,
      deleteSalesOrder,
      convertSalesOrderToInvoice,
      fulfillSalesOrder,
      deliveryChallans,
      addDeliveryChallan,
      creditNotes,
      addCreditNote,
      updateCreditNote,
      deleteCreditNote,
      applyCreditNoteToInvoice,
      recordCustomerRefund,
      paymentsReceived,
      addPaymentReceived,
      updatePaymentReceived,
      deletePaymentReceived,
      purchaseOrders,
      addPurchaseOrder,
      updatePurchaseOrder,
      deletePurchaseOrder,
      convertPurchaseOrderToBill,
      receivePurchaseOrder,
      bills,
      addBill,
      updateBill,
      deleteBill,
      paymentsMade,
      addPaymentMade,
      addVendorAdvance,
      applyVendorAdvance,
      toggleAccountLock,
      bulkUpdateAccounts,
      bulkUpdateJournals,
      getProjectSummary,
      convertUnbilledTimeToInvoice,
      clearAllData,
      loadSampleData,
      resetToDemoData,
      exportDataJSON,
      importDataJSON,
      currentUser,
      auditLogs,
      addAuditLog,
    }),
    [
      organizations,
      currentOrg,
      settings,
      accounts,
      clients,
      salespersons,
      vendors,
      projects,
      timeEntries,
      allTimeOperationGuards,
      allAccountActionGuards,
      currentOrgId,
      beginTimeOperation,
      completeTimeOperation,
      holdTimeOperationGuard,
      refreshTimeOperationStatus,
      invoices,
      allInvoiceVoidGuards,
      allInvoiceCreateGuards,
      verifyInvoiceCreateOperationStatus,
      dismissInvoiceCreateGuard,
      verifyInvoiceVoidStatus,
      estimates,
      expenses,
      journalEntries,
      periodLocks,
      salesOrders,
      deliveryChallans,
      creditNotes,
      paymentsReceived,
      allPaymentReversalGuards,
      verifyPaymentReversalStatus,
      purchaseOrders,
      bills,
      paymentsMade,
      currentUser,
      auditLogs,
    ]
  );

  return (
    <BooksContext.Provider value={contextValue}>
      {children}
    </BooksContext.Provider>
  );
};

export const useBooks = () => {
  const context = useContext(BooksContext);
  if (!context) {
    throw new Error('useBooks must be used within a BooksProvider');
  }
  return context;
};
