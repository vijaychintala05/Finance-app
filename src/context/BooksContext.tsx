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
  RecurringBill,
  RecurringExpense,
  RecurringInvoiceProfile,
  SalesOrder,
  Salesperson,
  TimeEntry,
  Vendor,
  VendorCredit,
  UserIdentity,
  Membership as OrgMembership,
  AuditLog,
  UserSession,
  RolePermissionDefinition,
  OrgInvitation,
} from '../types';
import { apiClient } from '../api/client';
import { createSafeDefaultSettings } from '../config/defaultSettings';

const SAFE_INITIAL_SETTINGS: FirmSettings = createSafeDefaultSettings();

const camelizeRecord = (value: any): any => {
  if (Array.isArray(value)) return value.map(camelizeRecord);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
    camelizeRecord(child),
  ]));
};

const normalizeInvoiceForUi = (record: any): Invoice => {
  const rawStatus = String(record.status || '').trim().toUpperCase().replaceAll(' ', '_');
  const hasBalance = Number(record.balanceDue || 0) > 0;
  const isOverdue = hasBalance && /^\d{4}-\d{2}-\d{2}$/.test(String(record.dueDate || '')) && record.dueDate < new Date().toISOString().split('T')[0];
  let status: Invoice['status'];
  if (['VOID', 'VOIDED'].includes(rawStatus)) status = 'Void';
  else if (rawStatus === 'PAID' || !hasBalance) status = 'Paid';
  else if (isOverdue) status = 'Overdue';
  else if (rawStatus === 'PARTIALLY_PAID' || Number(record.paidAmount || 0) > 0) status = 'Partially Paid';
  else if (rawStatus === 'DRAFT') status = 'Draft';
  else status = 'Sent';
  return { ...record, status } as Invoice;
};

const normalizeBillForUi = (record: any): Bill => {
  const balanceDue = Math.max(0, Number(record.balanceDue ?? (Number(record.totalAmount || 0) - Number(record.amountPaid || 0))));
  const isOverdue = balanceDue > 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(record.dueDate || '')) && record.dueDate < new Date().toISOString().split('T')[0];
  const status: Bill['status'] = balanceDue === 0
    ? 'Paid'
    : isOverdue
    ? 'Overdue'
    : Number(record.amountPaid || 0) > 0
    ? 'Partially Paid'
    : 'Unpaid';
  return { ...record, balanceDue, status } as Bill;
};

interface BooksContextType {
  organizations: OrganizationMeta[];
  currentOrg: OrganizationMeta;
  refreshOrganizations: () => Promise<void>;
  switchOrganization: (orgId: string) => void;
  createOrganization: (input: CreateOrganizationInput) => Promise<OrganizationMeta>;
  deleteOrganization: (orgId: string) => boolean;
  exportOrganizationJSON: (orgId?: string) => void;
  importOrganizationJSON: (jsonString: string) => boolean;

  settings: FirmSettings;
  updateSettings: (newSettings: Partial<FirmSettings>) => void;

  accounts: Account[];
  addAccount: (account: Omit<Account, 'id'>) => Promise<Account>;
  updateAccount: (id: string, updated: Partial<Account>) => Promise<Account>;

  clients: Client[];
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => Promise<Client>;
  updateClient: (id: string, client: Partial<Client>) => void;
  deleteClient: (id: string) => void;

  salespersons: Salesperson[];
  addSalesperson: (salesperson: Omit<Salesperson, 'id' | 'createdAt'>) => Salesperson | null;
  updateSalesperson: (id: string, salesperson: Partial<Salesperson>) => void;
  deleteSalesperson: (id: string) => void;

  vendors: Vendor[];
  addVendor: (vendor: Omit<Vendor, 'id'>) => Promise<Vendor>;
  updateVendor: (id: string, vendor: Partial<Vendor>) => void;
  deleteVendor: (id: string) => void;

  projects: Project[];
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Promise<Project>;
  updateProject: (id: string, project: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  timeEntries: TimeEntry[];
  addTimeEntry: (entry: Omit<TimeEntry, 'id'>) => Promise<boolean>;
  updateTimeEntry: (id: string, entry: Partial<TimeEntry>) => Promise<boolean>;
  deleteTimeEntry: (id: string) => Promise<void>;

  invoices: Invoice[];
  addInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber'>) => Promise<Invoice>;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => void;
  deleteInvoice: (id: string) => Promise<void>;

  estimates: Estimate[];
  addEstimate: (estimate: Omit<Estimate, 'id' | 'createdAt' | 'estimateNumber'>) => void;
  convertEstimateToInvoice: (estimateId: string) => Promise<Invoice | null>;

  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;

  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'entryNumber'>) => Promise<boolean>;

  periodLocks: PeriodLock[];
  addPeriodLock: (lock: Omit<PeriodLock, 'id' | 'lockedAt' | 'status'>) => Promise<void>;
  deletePeriodLock: (id: string) => void;

  // Documents
  salesOrders: SalesOrder[];
  addSalesOrder: (order: Omit<SalesOrder, 'id'>) => SalesOrder | null;
  updateSalesOrder: (id: string, updated: Partial<SalesOrder>) => void;
  deleteSalesOrder: (id: string) => void;
  convertSalesOrderToInvoice: (salesOrderId: string) => Promise<Invoice | null>;

  deliveryChallans: DeliveryChallan[];
  addDeliveryChallan: (challan: Omit<DeliveryChallan, 'id'>) => DeliveryChallan | null;
  updateDeliveryChallan: (id: string, updated: Partial<DeliveryChallan>) => void;
  deleteDeliveryChallan: (id: string) => void;

  creditNotes: CreditNote[];
  addCreditNote: (note: Omit<CreditNote, 'id'>) => CreditNote | null;
  updateCreditNote: (id: string, updated: Partial<CreditNote>) => void;
  deleteCreditNote: (id: string) => void;

  paymentsReceived: PaymentReceipt[];
  addPaymentReceived: (payment: Omit<PaymentReceipt, 'id'> & { invoiceId?: string; clientId?: string; depositToAccountId?: string }) => Promise<PaymentReceipt>;
  deletePaymentReceived: (id: string) => Promise<void>;

  recurringInvoices: RecurringInvoiceProfile[];
  addRecurringInvoice: (profile: Omit<RecurringInvoiceProfile, 'id'>) => RecurringInvoiceProfile | null;
  updateRecurringInvoice: (id: string, updated: Partial<RecurringInvoiceProfile>) => void;
  deleteRecurringInvoice: (id: string) => void;

  purchaseOrders: PurchaseOrder[];
  addPurchaseOrder: (order: Omit<PurchaseOrder, 'id'>) => PurchaseOrder | null;
  updatePurchaseOrder: (id: string, updated: Partial<PurchaseOrder>) => void;
  deletePurchaseOrder: (id: string) => void;

  bills: Bill[];
  addBill: (bill: Omit<Bill, 'id'> & { vendorId?: string; expenseAccountId?: string; payableAccountId?: string }) => Promise<Bill>;
  updateBill: (id: string, updated: Partial<Bill>) => void;
  deleteBill: (id: string) => Promise<void>;

  recurringBills: RecurringBill[];
  addRecurringBill: (bill: Omit<RecurringBill, 'id'>) => RecurringBill | null;
  updateRecurringBill: (id: string, updated: Partial<RecurringBill>) => void;
  deleteRecurringBill: (id: string) => void;

  vendorCredits: VendorCredit[];
  addVendorCredit: (credit: Omit<VendorCredit, 'id'>) => VendorCredit | null;
  updateVendorCredit: (id: string, updated: Partial<VendorCredit>) => void;
  deleteVendorCredit: (id: string) => void;

  paymentsMade: PaymentMade[];
  addPaymentMade: (payment: Omit<PaymentMade, 'id'> & { vendorId?: string; billId?: string; paidFromAccountId?: string; allocations?: Array<{ billId: string; amount: number }> }) => Promise<PaymentMade>;
  deletePaymentMade: (id: string) => Promise<void>;
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

  recurringExpenses: RecurringExpense[];
  addRecurringExpense: (expense: Omit<RecurringExpense, 'id'>) => RecurringExpense | null;
  updateRecurringExpense: (id: string, updated: Partial<RecurringExpense>) => void;
  deleteRecurringExpense: (id: string) => void;

  toggleAccountLock: (
    accountId: string,
    lockDetails?: { lockedBy?: string; lockedReason?: string; lockedRegion?: string }
  ) => void;
  bulkUpdateAccounts: (accountIds: string[], updates: Partial<Account>) => void;
  bulkUpdateJournals: (journalIds: string[], updates: Partial<JournalEntry>) => void;

  getProjectSummary: (projectId: string) => ProjectFinancialSummary;
  convertUnbilledTimeToInvoice: (projectId: string, clientId: string) => Promise<Invoice | null>;

  clearAllData: () => void;
  loadSampleData: () => void;
  resetToDemoData: () => void;
  exportDataJSON: () => void;
  importDataJSON: (jsonString: string) => boolean;

  // Identity & Governance Architecture
  currentUser: UserIdentity;
  updateUserIdentity: (updates: Partial<UserIdentity>) => void;
  updateCurrentUser: (updates: Partial<UserIdentity>) => void;
  memberships: OrgMembership[];
  orgMemberships: OrgMembership[];
  inviteMember: (input: { orgUuid: string; userEmail: string; userName: string; role: any }) => void;
  revokeMembership: (membershipId: string) => void;
  auditLogs: AuditLog[];
  addAuditLog: (log: Omit<AuditLog, 'id' | 'timestamp' | 'orgUuid' | 'publicOrgId' | 'orgName' | 'userId' | 'userName' | 'userEmail'>) => void;
  sessions: UserSession[];
  revokeSession: (sessionId: string) => void;
  revokeAllOtherSessions: () => void;
  transferOwnership: (newOwnerEmail: string) => boolean;
  toggleOrgStatus: (status: 'Active' | 'Suspended') => void;
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
        recurringInvoices: [],
        purchaseOrders: [],
        bills: [],
        recurringBills: [],
        vendorCredits: [],
        paymentsMade: [],
        recurringExpenses: [],
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
    recurringInvoices: [],
    purchaseOrders: [],
    bills: [],
    recurringBills: [],
    vendorCredits: [],
    paymentsMade: [],
    recurringExpenses: [],
  };
};

export const BooksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Organizations List State
  const [organizations, setOrganizations] = useState<OrganizationMeta[]>([defaultOrgMeta]);

  const [currentOrgId, setCurrentOrgId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem('active_organization_id') || localStorage.getItem(ACTIVE_ORG_ID_KEY);
      if (savedId) return savedId;
    } catch (e) {}
    return '';
  });

  const currentOrg = organizations.find((o) => o.id === currentOrgId) || organizations[0] || defaultOrgMeta;

  const refreshOrganizations = useCallback(async () => {
    if (!localStorage.getItem('firmbooks_authenticated')) return;
    await apiClient.get<any[]>('/organizations').then((response) => {
      if (response.error) throw new Error(response.error);
      if (!Array.isArray(response.data) || response.data.length === 0) return;
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
      setCurrentOrgId(activeId => serverOrganizations.some(org => org.id === activeId) ? activeId : serverOrganizations[0].id);
    });
  }, []);

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
    if (!localStorage.getItem('firmbooks_authenticated')) return;
    apiClient.get<{ user: { id: string; email: string; fullName: string } }>('/auth/me').then((response) => {
      if (!response.data?.user) return;
      const user = response.data.user;
      setCurrentUser((current) => ({ ...current, userId: user.id, uuid: user.id, email: user.email, fullName: user.fullName }));
    });
  }, []);

  const updateUserIdentity = (updates: Partial<UserIdentity>) => {
    window.alert('Identity changes require a verified server workflow and are not enabled yet.');
  };

  // Organization Memberships State
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);

  const orgMemberships = useMemo(() => {
    return memberships.filter((m) => m.orgUuid === currentOrg.uuid);
  }, [memberships, currentOrg.uuid]);

  const inviteMember = (input: { orgUuid: string; userEmail: string; userName: string; role: any }) => {
    window.alert('Member invitations require email verification and a server-backed invitation workflow.');
  };

  const revokeMembership = (membershipId: string) => {
    window.alert('Membership revocation requires an audited server workflow.');
  };

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const addAuditLog = (log: Omit<AuditLog, 'id' | 'timestamp' | 'orgUuid' | 'publicOrgId' | 'orgName' | 'userId' | 'userName' | 'userEmail'>) => {
    console.warn('Client-generated audit events are ignored; audit records are server authoritative.');
  };

  // User Sessions State
  const [sessions, setSessions] = useState<UserSession[]>([]);

  const revokeSession = (sessionId: string) => {
    window.alert('Individual session management is not enabled yet.');
  };

  const revokeAllOtherSessions = () => {
    window.alert('Session listing and targeted revocation are not enabled yet. Changing your password revokes every token.');
  };

  const transferOwnership = (newOwnerEmail: string): boolean => {
    window.alert('Ownership transfer requires verified acceptance and an audited server workflow.');
    return false;
  };

  const toggleOrgStatus = (status: 'Active' | 'Suspended') => {
    window.alert('Organization status changes require an audited server governance workflow.');
  };

  // Active Org Tracker Ref to prevent cross-organization state saving during switches
  const activeOrgIdRef = useRef<string>(currentOrgId);

  // Initialize workspace data directly for currentOrgId so initial state is immediately matched
  const [initialData] = useState(() => loadOrgData(currentOrgId, currentOrg));

  // Active Workspace Data State
  const [settings, setSettings] = useState<FirmSettings>(initialData.settings);
  const [accounts, setAccounts] = useState<Account[]>(initialData.accounts);
  const [clients, setClients] = useState<Client[]>(initialData.clients);
  const [salespersons, setSalespersons] = useState<Salesperson[]>(initialData.salespersons);
  const [vendors, setVendors] = useState<Vendor[]>(initialData.vendors);
  const [projects, setProjects] = useState<Project[]>(initialData.projects);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>(initialData.timeEntries);
  const [projectSummaries, setProjectSummaries] = useState<ProjectFinancialSummary[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>(initialData.invoices);
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
  const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoiceProfile[]>(initialData.recurringInvoices);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(initialData.purchaseOrders);
  const [bills, setBills] = useState<Bill[]>(initialData.bills);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>(initialData.recurringBills);
  const [vendorCredits, setVendorCredits] = useState<VendorCredit[]>(initialData.vendorCredits);
  const [paymentsMade, setPaymentsMade] = useState<PaymentMade[]>(initialData.paymentsMade);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>(initialData.recurringExpenses);

  const refreshAuthoritativeData = useCallback(async (): Promise<void> => {
      if (!currentOrgId || !localStorage.getItem('firmbooks_authenticated')) return;
      const requestedOrgId = currentOrgId;
      localStorage.setItem('active_organization_id', requestedOrgId);
      const endpoints = [
        'accounts', 'clients', 'vendors', 'projects', 'invoices', 'estimates',
        'expenses', 'journals', 'period-locks', 'sales-orders', 'delivery-challans', 'time-entries', 'project-summaries',
        'payments-received', 'credit-notes', 'bills', 'vendor-payments', 'audit',
      ] as const;
      const responses = await Promise.all(endpoints.map((endpoint) => apiClient.get<any[]>(`/finance/${endpoint}`)));
      const failure = responses.find((response) => response.error && response.status !== 403);
      if (failure) throw new Error(failure.error || 'Authoritative financial data is unavailable');
      if (activeOrgIdRef.current !== requestedOrgId) return;
      const data = Object.fromEntries(endpoints.map((endpoint, index) => [
        endpoint,
        camelizeRecord(responses[index].data || []),
      ]));
      setAccounts(data.accounts);
      setClients(data.clients);
      setVendors(data.vendors);
      setProjects(data.projects);
      setTimeEntries(data['time-entries']);
      setProjectSummaries(data['project-summaries']);
      setInvoices((data.invoices || []).map(normalizeInvoiceForUi));
      setEstimates(data.estimates);
      setExpenses(data.expenses);
      setJournalEntries(data.journals);
      setPeriodLocks(data['period-locks']);
      setSalesOrders(data['sales-orders']);
      setDeliveryChallans(data['delivery-challans']);
      setPaymentsReceived(data['payments-received']);
      setCreditNotes(data['credit-notes']);
      setBills((data.bills || []).map(normalizeBillForUi));
      setPaymentsMade(data['vendor-payments'] || []);
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
  }, [currentOrg.name, currentOrg.publicOrgId, currentOrgId]);

  const refreshAfterCommittedWrite = useCallback(async (): Promise<void> => {
    try {
      await refreshAuthoritativeData();
    } catch (error) {
      console.error('A committed transaction could not be reloaded for verification:', error);
      setAccounts([]); setClients([]); setVendors([]); setProjects([]); setInvoices([]);
      setEstimates([]); setExpenses([]); setJournalEntries([]); setPeriodLocks([]);
      setTimeEntries([]); setProjectSummaries([]);
      setSalesOrders([]); setDeliveryChallans([]); setPaymentsReceived([]); setCreditNotes([]); setBills([]);
      setAuditLogs([]);
      window.alert('The server committed this transaction, but the verification refresh failed. Do not submit it again; reload the page before continuing.');
    }
  }, [refreshAuthoritativeData]);

  // PostgreSQL is the sole authority for accounting data. Browser storage is
  // intentionally limited to non-financial preferences and never used as a ledger fallback.
  useEffect(() => {
    let cancelled = false;
    refreshAuthoritativeData().catch((error) => {
      if (!cancelled) {
        console.error('Financial data unavailable; no local fallback was used:', error);
        setAccounts([]); setClients([]); setVendors([]); setProjects([]); setInvoices([]);
        setEstimates([]); setExpenses([]); setJournalEntries([]); setPeriodLocks([]);
        setTimeEntries([]); setProjectSummaries([]);
        setSalesOrders([]); setDeliveryChallans([]); setPaymentsReceived([]); setCreditNotes([]); setBills([]);
        setAuditLogs([]);
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
  const switchOrganization = (targetOrgId: string) => {
    if (targetOrgId === currentOrgId && activeOrgIdRef.current === currentOrgId) return;
    const targetMeta = organizations.find((o) => o.id === targetOrgId);
    if (!targetMeta?.id) {
      window.alert('That organization is not available in your verified memberships.');
      return;
    }

    // Financial records are cleared and reloaded from the authoritative API.
    const targetData = loadOrgData(targetOrgId, targetMeta);

    // 3. Mark activeOrgIdRef to targetOrgId BEFORE state updates
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
    setRecurringInvoices(targetData.recurringInvoices);
    setPurchaseOrders(targetData.purchaseOrders);
    setBills([]);
    setRecurringBills(targetData.recurringBills);
    setVendorCredits(targetData.vendorCredits);
    setPaymentsMade(targetData.paymentsMade);
    setRecurringExpenses(targetData.recurringExpenses);
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
    if (keys.length === 1 && keys[0] === 'userPreferences') {
      setSettings((prev) => ({
        ...prev,
        userPreferences: { ...prev.userPreferences, ...newSettings.userPreferences },
      }));
      return;
    }
    window.alert('Business and compliance settings require an audited server workflow and are currently read-only.');
  };

  const addAccount = async (accountData: Omit<Account, 'id'>): Promise<Account> => {
    const response = await apiClient.post<Account>('/finance/accounts', accountData);
    if (!response.data) throw new Error(response.error || 'Account could not be created');
    const newAcc: Account = { ...accountData, ...response.data };
    await refreshAfterCommittedWrite();
    return newAcc;
  };

  const updateAccount = async (id: string, updated: Partial<Account>): Promise<Account> => {
    const response = await apiClient.patch<Account>(`/finance/accounts/${id}`, updated);
    if (!response.data) throw new Error(response.error || 'Account could not be updated');
    await refreshAfterCommittedWrite();
    return camelizeRecord(response.data) as Account;
  };

  const addClient = async (clientData: Omit<Client, 'id' | 'createdAt'>): Promise<Client> => {
    const response = await apiClient.post<Partial<Client>>('/finance/clients', clientData);
    if (!response.data?.id) throw new Error(response.error || 'Client could not be created');
    const newClient: Client = { ...clientData, ...response.data, id: response.data.id, createdAt: response.data.createdAt || new Date().toISOString() } as Client;
    await refreshAfterCommittedWrite();
    return newClient;
  };

  const updateClient = (id: string, clientData: Partial<Client>) => {
    window.alert('Client edits require an audited server workflow and are not enabled yet.');
  };

  const deleteClient = (id: string) => {
    window.alert('Clients with financial history cannot be deleted. Archival is not enabled yet.');
  };

  const addSalesperson = (spData: Omit<Salesperson, 'id' | 'createdAt'>) => {
    window.alert('Salesperson management requires a server-backed workflow and is not enabled yet.');
    return null;
  };

  const updateSalesperson = (id: string, spData: Partial<Salesperson>) => {
    window.alert('Salesperson management requires a server-backed workflow and is not enabled yet.');
  };

  const deleteSalesperson = (id: string) => {
    window.alert('Salesperson management requires a server-backed workflow and is not enabled yet.');
  };

  const addVendor = async (vendorData: Omit<Vendor, 'id'>): Promise<Vendor> => {
    const response = await apiClient.post<Partial<Vendor>>('/finance/vendors', vendorData);
    if (!response.data?.id) throw new Error(response.error || 'Vendor could not be created');
    const newVendor: Vendor = { ...vendorData, ...response.data, id: response.data.id } as Vendor;
    await refreshAfterCommittedWrite();
    return newVendor;
  };

  const updateVendor = (id: string, vendorData: Partial<Vendor>) => {
    window.alert('Vendor edits require an audited server workflow and are not enabled yet.');
  };

  const deleteVendor = (id: string) => {
    window.alert('Vendors with financial history cannot be deleted. Archival is not enabled yet.');
  };

  const addProject = async (projectData: Omit<Project, 'id' | 'createdAt'>): Promise<Project> => {
    const response = await apiClient.post<Partial<Project>>('/finance/projects', projectData);
    if (!response.data?.id) throw new Error(response.error || 'Project could not be created');
    const newPrj: Project = { ...projectData, ...response.data, id: response.data.id, createdAt: response.data.createdAt || new Date().toISOString() } as Project;
    await refreshAfterCommittedWrite();
    return newPrj;
  };

  const updateProject = (id: string, projectData: Partial<Project>) => {
    window.alert('Project edits require an audited server workflow and are not enabled yet.');
  };

  const deleteProject = (id: string) => {
    window.alert('Projects with financial history cannot be deleted. Archival is not enabled yet.');
  };

  const addTimeEntry = async (entry: Omit<TimeEntry, 'id'>): Promise<boolean> => {
    const response = await apiClient.post<TimeEntry>('/finance/time-entries', entry);
    if (!response.data) throw new Error(response.error || 'Time entry could not be saved');
    await refreshAfterCommittedWrite();
    return true;
  };

  const updateTimeEntry = async (id: string, entryData: Partial<TimeEntry>): Promise<boolean> => {
    const response = await apiClient.put<TimeEntry>(`/finance/time-entries/${id}`, entryData);
    if (!response.data) throw new Error(response.error || 'Time entry could not be updated');
    await refreshAfterCommittedWrite();
    return true;
  };

  const deleteTimeEntry = async (id: string): Promise<void> => {
    const response = await apiClient.delete(`/finance/time-entries/${id}`);
    if (response.error) throw new Error(response.error);
    await refreshAfterCommittedWrite();
  };

  const addInvoice = async (invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber'>): Promise<Invoice> => {
    const response = await apiClient.post<any>('/finance/invoices', {
      clientId: invoiceData.clientId,
      clientName: invoiceData.clientName,
      clientEmail: invoiceData.clientEmail,
      projectId: invoiceData.projectId,
      issueDate: invoiceData.issueDate,
      dueDate: invoiceData.dueDate,
      items: invoiceData.items,
      discount: invoiceData.discount,
      notes: invoiceData.notes,
    });
    if (!response.data) throw new Error(response.error || 'Invoice could not be posted');
    const newInv = normalizeInvoiceForUi({
      ...invoiceData,
      id: response.data.id,
      invoiceNumber: response.data.invoiceNumber,
      totalAmount: Number(response.data.totalAmount),
      balanceDue: Number(response.data.balanceDue),
      paidAmount: 0,
      status: response.data.status || 'Sent',
      createdAt: new Date().toISOString().split('T')[0],
    });
    await refreshAfterCommittedWrite();
    return newInv;
  };

  const updateInvoice = (id: string, invoiceData: Partial<Invoice>) => {
    window.alert('Posted invoices are immutable. Use an audited adjustment, void, or credit-note workflow.');
  };

  const deleteInvoice = async (id: string): Promise<void> => {
    const reason = window.prompt('Reason for voiding this invoice (required for the audit trail):')?.trim();
    if (!reason) return;
    const response = await apiClient.post('/security/void-invoice', { invoiceId: id, reason });
    if (!response.data) throw new Error(response.error || 'Invoice could not be voided');
    await refreshAfterCommittedWrite();
  };

  const addEstimate = (estimateData: Omit<Estimate, 'id' | 'createdAt' | 'estimateNumber'>) => {
    window.alert('Use the server-backed quotation workspace to create estimates.');
  };

  const convertEstimateToInvoice = async (estimateId: string): Promise<Invoice | null> => {
    window.alert('Quotation conversion is available only through the atomic server conversion workflow.');
    return null;
  };

  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>): Promise<void> => {
    if (expenseData.isItemized || expenseData.items?.length) {
      throw new Error('Itemized expenses are not enabled until every line can be persisted and posted atomically.');
    }
    if (Number(expenseData.taxAmount || 0) !== 0) {
      throw new Error('Expense tax posting is not enabled. Record a bill with verified tax lines instead.');
    }
    if (expenseData.invoiceNumber) {
      throw new Error('Vendor references are not enabled until their server workflow is certified.');
    }
    if (expenseData.currency && expenseData.currency !== settings.currencyCode) {
      throw new Error('Foreign-currency expenses require a server-verified exchange-rate workflow.');
    }
    const response = await apiClient.post<any>('/finance/expenses', {
      expenseAccountId: expenseData.accountId,
      paidFromAccountId: expenseData.paidFromAccountId,
      vendorName: expenseData.vendorName,
      date: expenseData.date,
      amount: expenseData.amount,
      description: expenseData.description,
      projectId: expenseData.projectId,
      clientId: expenseData.clientId,
      isBillable: expenseData.isBillable,
      receiptImages: expenseData.receiptImages,
    });
    if (!response.data) throw new Error(response.error || 'Expense could not be posted');
    await refreshAfterCommittedWrite();
  };

  const deleteExpense = async (id: string): Promise<void> => {
    const reason = window.prompt('Reason for voiding this expense (required for the audit trail):')?.trim();
    if (!reason) return;
    const response = await apiClient.post(`/finance/expenses/${id}/void`, { reason });
    if (!response.data) throw new Error(response.error || 'Expense could not be voided');
    await refreshAfterCommittedWrite();
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
  const convertUnbilledTimeToInvoice = async (projectId: string, clientId: string): Promise<Invoice | null> => {
    const today = new Date().toISOString().split('T')[0];
    const response = await apiClient.post<any>(`/finance/projects/${projectId}/invoice-unbilled-time`, { issueDate: today, dueDate: today });
    if (!response.data) throw new Error(response.error || 'Unbilled time could not be invoiced');
    await refreshAfterCommittedWrite();
    return normalizeInvoiceForUi({ ...response.data, clientId, paidAmount: 0, balanceDue: response.data.totalAmount });
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
  const addSalesOrder = (orderData: Omit<SalesOrder, 'id'>): SalesOrder | null => {
    window.alert('Sales order creation is paused until its server transaction is certified.');
    return null;
  };
  const updateSalesOrder = (id: string, updated: Partial<SalesOrder>) => {
    window.alert('Sales order editing is paused until its audited server workflow is certified.');
  };
  const deleteSalesOrder = (id: string) => {
    window.alert('Sales orders cannot be deleted locally.');
  };

  const convertSalesOrderToInvoice = async (salesOrderId: string): Promise<Invoice | null> => {
    window.alert('Sales-order conversion requires one atomic server transaction and is not enabled yet.');
    return null;
  };

  const addDeliveryChallan = (challanData: Omit<DeliveryChallan, 'id'>): DeliveryChallan | null => {
    window.alert('Delivery challan creation is paused until its server transaction is certified.');
    return null;
  };
  const updateDeliveryChallan = (id: string, updated: Partial<DeliveryChallan>) => {
    window.alert('Delivery challan editing requires an audited server workflow.');
  };
  const deleteDeliveryChallan = (id: string) => {
    window.alert('Delivery challans cannot be deleted locally.');
  };

  const addCreditNote = (noteData: Omit<CreditNote, 'id'>): CreditNote | null => {
    window.alert('Credit notes are paused until their atomic posting and application workflow is certified.');
    return null;
  };
  const updateCreditNote = (id: string, updated: Partial<CreditNote>) => {
    window.alert('Posted credit notes require an audited server workflow.');
  };
  const deleteCreditNote = (id: string) => {
    window.alert('Posted credit notes are immutable and require an audited reversal.');
  };

  const addPaymentReceived = async (paymentData: Omit<PaymentReceipt, 'id'> & { invoiceId?: string; clientId?: string; depositToAccountId?: string }): Promise<PaymentReceipt> => {
    const response = await apiClient.post<any>('/finance/payments-received', {
      paymentNumber: paymentData.paymentNumber,
      clientId: paymentData.clientId,
      clientName: paymentData.clientName,
      paymentDate: paymentData.paymentDate,
      amount: paymentData.amount,
      paymentMode: paymentData.paymentMethod,
      depositToAccountId: paymentData.depositToAccountId,
      invoiceId: paymentData.invoiceId,
      reference: paymentData.referenceNumber,
    });
    if (!response.data) throw new Error(response.error || 'Payment could not be posted');
    const newPayment: PaymentReceipt = {
      ...paymentData,
      id: response.data.id,
      paymentNumber: response.data.paymentNumber || paymentData.paymentNumber,
    };
    await refreshAfterCommittedWrite();
    return newPayment;
  };
  const deletePaymentReceived = async (id: string): Promise<void> => {
    const reason = window.prompt('Reason for reversing this payment (required for the audit trail):')?.trim();
    if (!reason) return;
    const response = await apiClient.post('/security/reverse-payment', { paymentId: id, reason });
    if (!response.data) throw new Error(response.error || 'Payment could not be reversed');
    await refreshAfterCommittedWrite();
  };

  const addRecurringInvoice = (profileData: Omit<RecurringInvoiceProfile, 'id'>): RecurringInvoiceProfile | null => {
    window.alert('Recurring invoices require a server scheduler and are not enabled yet.');
    return null;
  };
  const updateRecurringInvoice = (id: string, updated: Partial<RecurringInvoiceProfile>) => {
    window.alert('Recurring invoices require a server scheduler and are not enabled yet.');
  };
  const deleteRecurringInvoice = (id: string) => {
    window.alert('Recurring invoices require a server scheduler and are not enabled yet.');
  };

  const addPurchaseOrder = (orderData: Omit<PurchaseOrder, 'id'>): PurchaseOrder | null => {
    window.alert('Purchase order creation is paused until its server transaction is certified.');
    return null;
  };
  const updatePurchaseOrder = (id: string, updated: Partial<PurchaseOrder>) => {
    window.alert('Purchase order editing requires an audited server workflow.');
  };
  const deletePurchaseOrder = (id: string) => {
    window.alert('Purchase orders cannot be deleted locally.');
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
    await refreshAfterCommittedWrite();
    return newBill;
  };
  const updateBill = (id: string, updated: Partial<Bill>) => {
    window.alert('Posted bills require an audited adjustment or reversal workflow.');
  };
  const deleteBill = async (id: string): Promise<void> => {
    const reason = window.prompt('Reason for voiding this bill (required for the audit trail):')?.trim();
    if (!reason) return;
    const response = await apiClient.post(`/finance/bills/${id}/void`, { reason });
    if (!response.data) throw new Error(response.error || 'Bill could not be voided');
    await refreshAfterCommittedWrite();
  };

  const addRecurringBill = (billData: Omit<RecurringBill, 'id'>): RecurringBill | null => {
    window.alert('Recurring bills require a server scheduler and are not enabled yet.');
    return null;
  };
  const updateRecurringBill = (id: string, updated: Partial<RecurringBill>) => {
    window.alert('Recurring bills require a server scheduler and are not enabled yet.');
  };
  const deleteRecurringBill = (id: string) => {
    window.alert('Recurring bills require a server scheduler and are not enabled yet.');
  };

  const addVendorCredit = (creditData: Omit<VendorCredit, 'id'>): VendorCredit | null => {
    window.alert('Vendor credits are paused until their atomic posting workflow is certified.');
    return null;
  };
  const updateVendorCredit = (id: string, updated: Partial<VendorCredit>) => {
    window.alert('Vendor credits require an audited server workflow.');
  };
  const deleteVendorCredit = (id: string) => {
    window.alert('Posted vendor credits are immutable and require an audited reversal.');
  };

  const addPaymentMade = async (
    paymentData: Omit<PaymentMade, 'id'> & {
      vendorId?: string;
      billId?: string;
      paidFromAccountId?: string;
      allocations?: Array<{ billId: string; amount: number }>;
    }
  ): Promise<PaymentMade> => {
    const targetVendor = vendors.find((v) => v.id === paymentData.vendorId || v.name === paymentData.vendorName);
    const vendorId = targetVendor?.id || paymentData.vendorId;

    if (!paymentData.paidFromAccountId) {
      throw new Error('Disbursement bank or cash account (paidFromAccountId) is required.');
    }

    const payload = {
      vendorId,
      vendorName: targetVendor?.name || paymentData.vendorName,
      amount: Number(paymentData.amount),
      paidFromAccountId: paymentData.paidFromAccountId,
      paymentDate: paymentData.paymentDate || new Date().toISOString().slice(0, 10),
      paymentMode: paymentData.paymentMethod || 'Bank Wire / NEFT / RTGS',
      reference: paymentData.referenceNumber,
      allocations: paymentData.allocations || (paymentData.billId ? [{ billId: paymentData.billId, amount: Number(paymentData.amount) }] : []),
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

    await refreshAfterCommittedWrite();
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
    await refreshAfterCommittedWrite();
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
    await refreshAfterCommittedWrite();
    return response.data;
  };

  const deletePaymentMade = async (id: string): Promise<void> => {
    const reason = window.prompt('Reason for reversing this payment (required for the audit trail):')?.trim();
    if (!reason) return;
    const response = await apiClient.post<any>(`/finance/vendor-payments/${id}/reverse`, { reason });
    if (response.error || !response.data) {
      throw new Error(response.error || 'Vendor payment could not be reversed.');
    }
    await refreshAfterCommittedWrite();
  };

  const addRecurringExpense = (expenseData: Omit<RecurringExpense, 'id'>): RecurringExpense | null => {
    window.alert('Recurring expenses require a server scheduler and are not enabled yet.');
    return null;
  };
  const updateRecurringExpense = (id: string, updated: Partial<RecurringExpense>) => {
    window.alert('Recurring expenses require a server scheduler and are not enabled yet.');
  };
  const deleteRecurringExpense = (id: string) => {
    window.alert('Recurring expenses require a server scheduler and are not enabled yet.');
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
      createOrganization,
      deleteOrganization,
      exportOrganizationJSON,
      importOrganizationJSON,
      settings,
      updateSettings,
      accounts,
      addAccount,
      updateAccount,
      clients,
      addClient,
      updateClient,
      deleteClient,
      salespersons,
      addSalesperson,
      updateSalesperson,
      deleteSalesperson,
      vendors,
      addVendor,
      updateVendor,
      deleteVendor,
      projects,
      addProject,
      updateProject,
      deleteProject,
      timeEntries,
      addTimeEntry,
      updateTimeEntry,
      deleteTimeEntry,
      invoices,
      addInvoice,
      updateInvoice,
      deleteInvoice,
      estimates,
      addEstimate,
      convertEstimateToInvoice,
      expenses,
      addExpense,
      deleteExpense,
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
      deliveryChallans,
      addDeliveryChallan,
      updateDeliveryChallan,
      deleteDeliveryChallan,
      creditNotes,
      addCreditNote,
      updateCreditNote,
      deleteCreditNote,
      paymentsReceived,
      addPaymentReceived,
      deletePaymentReceived,
      recurringInvoices,
      addRecurringInvoice,
      updateRecurringInvoice,
      deleteRecurringInvoice,
      purchaseOrders,
      addPurchaseOrder,
      updatePurchaseOrder,
      deletePurchaseOrder,
      bills,
      addBill,
      updateBill,
      deleteBill,
      recurringBills,
      addRecurringBill,
      updateRecurringBill,
      deleteRecurringBill,
      vendorCredits,
      addVendorCredit,
      updateVendorCredit,
      deleteVendorCredit,
      paymentsMade,
      addPaymentMade,
      deletePaymentMade,
      addVendorAdvance,
      applyVendorAdvance,
      recurringExpenses,
      addRecurringExpense,
      updateRecurringExpense,
      deleteRecurringExpense,
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
      updateUserIdentity,
      updateCurrentUser: updateUserIdentity,
      memberships,
      orgMemberships,
      inviteMember,
      revokeMembership,
      auditLogs,
      addAuditLog,
      sessions,
      revokeSession,
      revokeAllOtherSessions,
      transferOwnership,
      toggleOrgStatus,
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
      invoices,
      estimates,
      expenses,
      journalEntries,
      periodLocks,
      salesOrders,
      deliveryChallans,
      creditNotes,
      paymentsReceived,
      recurringInvoices,
      purchaseOrders,
      bills,
      recurringBills,
      vendorCredits,
      paymentsMade,
      recurringExpenses,
      currentUser,
      memberships,
      orgMemberships,
      auditLogs,
      sessions,
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
