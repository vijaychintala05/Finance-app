import crypto from 'crypto';

export type ApprovalEntityType =
  | 'PURCHASE_ORDER'
  | 'VENDOR_BILL'
  | 'PAYMENT'
  | 'CUSTOMER_PAYMENT'
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'MANUAL_JOURNAL'
  | 'PERIOD_REOPENING'
  | 'EXPENSE';

export type ApprovalStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONSUMED';

export interface ApprovalEntityDefinition {
  entityType: ApprovalEntityType;
  displayName: string;
  defaultApproverRole: string;
  defaultThreshold: number;
  defaultRuleId: string;
  allowSelfApproval: boolean;
  isRequiredByDefault: boolean;
  computeCanonicalPayload: (data: any) => Record<string, any>;
  allowedTransitions: Record<ApprovalStatus, ApprovalStatus[]>;
}

const COMMON_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['REJECTED', 'CONSUMED'], // 'REJECTED' occurs on post-approval invalidation
  REJECTED: ['SUBMITTED'], // Resubmission allowed
  CONSUMED: [],
};

export const APPROVAL_ENTITIES: Record<ApprovalEntityType, ApprovalEntityDefinition> = {
  PURCHASE_ORDER: {
    entityType: 'PURCHASE_ORDER',
    displayName: 'Purchase Order',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 50000,
    defaultRuleId: 'rule-po',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'PURCHASE_ORDER',
      amount: Math.round(Number(data.amount ?? data.totalAmount ?? data.total_amount ?? 0) * 100) / 100,
      partyId: data.vendorId || data.vendor_id || '',
      date: String(data.orderDate || data.date || data.order_date || '').slice(0, 10),
      dueDate: String(data.expectedDeliveryDate || data.dueDate || '').slice(0, 10),
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  VENDOR_BILL: {
    entityType: 'VENDOR_BILL',
    displayName: 'Vendor Bill',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 100000,
    defaultRuleId: 'rule-bill',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'VENDOR_BILL',
      amount: Math.round(Number(data.amount ?? data.totalAmount ?? data.total_amount ?? 0) * 100) / 100,
      partyId: data.vendorId || data.vendor_id || '',
      date: String(data.billDate || data.date || data.bill_date || '').slice(0, 10),
      dueDate: String(data.dueDate || data.due_date || '').slice(0, 10),
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  PAYMENT: {
    entityType: 'PAYMENT',
    displayName: 'Vendor Payment',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 50000,
    defaultRuleId: 'rule-pay',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'PAYMENT',
      amount: Math.round(Number(data.amount ?? 0) * 100) / 100,
      partyId: data.vendorId || data.vendor_id || '',
      date: String(data.paymentDate || data.date || data.payment_date || '').slice(0, 10),
      dueDate: '',
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  CUSTOMER_PAYMENT: {
    entityType: 'CUSTOMER_PAYMENT',
    displayName: 'Customer Payment Receipt',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 50000,
    defaultRuleId: 'rule-cust-pay',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'CUSTOMER_PAYMENT',
      amount: Math.round(Number(data.amount ?? 0) * 100) / 100,
      partyId: data.customerId || data.clientId || data.customer_id || data.client_id || '',
      date: String(data.paymentDate || data.date || data.payment_date || '').slice(0, 10),
      dueDate: '',
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  INVOICE: {
    entityType: 'INVOICE',
    displayName: 'Sales Invoice',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 100000,
    defaultRuleId: 'rule-inv',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'INVOICE',
      amount: Math.round(Number(data.amount ?? data.totalAmount ?? data.total_amount ?? 0) * 100) / 100,
      partyId: data.customerId || data.clientId || data.customer_id || data.client_id || '',
      date: String(data.issueDate || data.date || data.issue_date || '').slice(0, 10),
      dueDate: String(data.dueDate || data.due_date || '').slice(0, 10),
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  CREDIT_NOTE: {
    entityType: 'CREDIT_NOTE',
    displayName: 'Credit Note',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 25000,
    defaultRuleId: 'rule-cn',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'CREDIT_NOTE',
      amount: Math.round(Number(data.amount ?? data.totalAmount ?? data.total_amount ?? 0) * 100) / 100,
      partyId: data.customerId || data.clientId || data.customer_id || data.client_id || '',
      date: String(data.issueDate || data.date || data.issue_date || '').slice(0, 10),
      dueDate: '',
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  MANUAL_JOURNAL: {
    entityType: 'MANUAL_JOURNAL',
    displayName: 'Manual Journal Entry',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 100000,
    defaultRuleId: 'rule-mj',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'MANUAL_JOURNAL',
      amount: Math.round(Number(data.totalDebit ?? data.totalAmount ?? data.amount ?? 0) * 100) / 100,
      partyId: '',
      date: String(data.entryDate || data.date || data.entry_date || '').slice(0, 10),
      dueDate: '',
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  PERIOD_REOPENING: {
    entityType: 'PERIOD_REOPENING',
    displayName: 'Period Reopening',
    defaultApproverRole: 'Owner',
    defaultThreshold: 0,
    defaultRuleId: 'rule-pr',
    allowSelfApproval: false,
    isRequiredByDefault: true,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'PERIOD_REOPENING',
      amount: 0,
      partyId: data.periodId || data.period_id || '',
      date: String(data.date || '').slice(0, 10),
      dueDate: '',
      currency: 'USD',
      lines: [],
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
  EXPENSE: {
    entityType: 'EXPENSE',
    displayName: 'Expense',
    defaultApproverRole: 'Finance Manager',
    defaultThreshold: 10000,
    defaultRuleId: 'rule-exp',
    allowSelfApproval: false,
    isRequiredByDefault: false,
    computeCanonicalPayload: (data: any) => ({
      entityType: 'EXPENSE',
      amount: Math.round(Number(data.amount ?? data.totalAmount ?? data.total_amount ?? 0) * 100) / 100,
      partyId: data.vendorId || data.vendor_id || '',
      date: String(data.expenseDate || data.date || data.expense_date || '').slice(0, 10),
      dueDate: '',
      currency: String(data.currency || 'USD').toUpperCase(),
      lines: extractLines(data),
    }),
    allowedTransitions: COMMON_TRANSITIONS,
  },
};

function extractLines(data: any): Array<{ id: string; desc: string; amt: number; acc: string }> {
  const rawLines = Array.isArray(data?.lineItems || data?.items || data?.lines)
    ? data.lineItems || data.items || data.lines
    : [];

  return rawLines.map((l: any) => ({
    id: String(l.id || ''),
    desc: String(l.description || l.narration || ''),
    amt: Math.round(Number(l.amount ?? l.debit ?? l.credit ?? (Number(l.quantity || 1) * Number(l.unitPrice || 0))) * 100) / 100,
    acc: String(l.accountId || l.account_id || ''),
  }));
}

export function isApprovalEntityType(value: any): value is ApprovalEntityType {
  return typeof value === 'string' && value in APPROVAL_ENTITIES;
}

export function computeCanonicalHash(entityType: ApprovalEntityType, data: any): string {
  if (!data) return '';
  const def = APPROVAL_ENTITIES[entityType];
  const canonical = def ? def.computeCanonicalPayload(data) : { entityType, data };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function isValidApprovalTransition(
  currentStatus: ApprovalStatus,
  targetStatus: ApprovalStatus,
  entityType?: ApprovalEntityType
): boolean {
  const transitions = entityType && APPROVAL_ENTITIES[entityType]
    ? APPROVAL_ENTITIES[entityType].allowedTransitions
    : COMMON_TRANSITIONS;

  const allowed = transitions[currentStatus] || [];
  return allowed.includes(targetStatus);
}
