import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  cleanInitialAccounts,
  initialAccounts,
  initialBills,
  initialClients,
  initialCreditNotes,
  initialDeliveryChallans,
  initialEstimates,
  initialExpenses,
  initialInvoices,
  initialJournalEntries,
  initialPaymentsMade,
  initialPaymentsReceived,
  initialProjects,
  initialPurchaseOrders,
  initialRecurringBills,
  initialRecurringExpenses,
  initialRecurringInvoices,
  initialSalesOrders,
  initialSalespersons,
  initialSettings,
  initialTimeEntries,
  initialVendorCredits,
  initialVendors,
} from '../services/seedData';

interface BooksContextType {
  organizations: OrganizationMeta[];
  currentOrg: OrganizationMeta;
  switchOrganization: (orgId: string) => void;
  createOrganization: (input: CreateOrganizationInput) => OrganizationMeta;
  deleteOrganization: (orgId: string) => boolean;
  exportOrganizationJSON: (orgId?: string) => void;
  importOrganizationJSON: (jsonString: string) => boolean;

  settings: FirmSettings;
  updateSettings: (newSettings: Partial<FirmSettings>) => void;

  accounts: Account[];
  addAccount: (account: Omit<Account, 'id'>) => Account;
  updateAccount: (id: string, updated: Partial<Account>) => void;

  clients: Client[];
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => Client;
  updateClient: (id: string, client: Partial<Client>) => void;
  deleteClient: (id: string) => void;

  salespersons: Salesperson[];
  addSalesperson: (salesperson: Omit<Salesperson, 'id' | 'createdAt'>) => Salesperson;
  updateSalesperson: (id: string, salesperson: Partial<Salesperson>) => void;
  deleteSalesperson: (id: string) => void;

  vendors: Vendor[];
  addVendor: (vendor: Omit<Vendor, 'id'>) => Vendor;
  updateVendor: (id: string, vendor: Partial<Vendor>) => void;
  deleteVendor: (id: string) => void;

  projects: Project[];
  addProject: (project: Omit<Project, 'id' | 'createdAt'>) => Project;
  updateProject: (id: string, project: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  timeEntries: TimeEntry[];
  addTimeEntry: (entry: Omit<TimeEntry, 'id'>) => void;
  updateTimeEntry: (id: string, entry: Partial<TimeEntry>) => void;
  deleteTimeEntry: (id: string) => void;

  invoices: Invoice[];
  addInvoice: (invoice: Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber'>) => Invoice;
  updateInvoice: (id: string, invoice: Partial<Invoice>) => void;
  recordPayment: (invoiceId: string, amount: number) => void;
  deleteInvoice: (id: string) => void;

  estimates: Estimate[];
  addEstimate: (estimate: Omit<Estimate, 'id' | 'createdAt' | 'estimateNumber'>) => void;
  convertEstimateToInvoice: (estimateId: string) => Invoice | null;

  expenses: Expense[];
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>) => void;
  deleteExpense: (id: string) => void;

  journalEntries: JournalEntry[];
  addJournalEntry: (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'entryNumber'>) => boolean;

  periodLocks: PeriodLock[];
  addPeriodLock: (lock: Omit<PeriodLock, 'id' | 'lockedAt' | 'status'>) => void;
  deletePeriodLock: (id: string) => void;

  // Documents
  salesOrders: SalesOrder[];
  addSalesOrder: (order: Omit<SalesOrder, 'id'>) => SalesOrder;
  updateSalesOrder: (id: string, updated: Partial<SalesOrder>) => void;
  deleteSalesOrder: (id: string) => void;
  convertSalesOrderToInvoice: (salesOrderId: string) => Invoice | null;

  deliveryChallans: DeliveryChallan[];
  addDeliveryChallan: (challan: Omit<DeliveryChallan, 'id'>) => DeliveryChallan;
  updateDeliveryChallan: (id: string, updated: Partial<DeliveryChallan>) => void;
  deleteDeliveryChallan: (id: string) => void;

  creditNotes: CreditNote[];
  addCreditNote: (note: Omit<CreditNote, 'id'>) => CreditNote;
  updateCreditNote: (id: string, updated: Partial<CreditNote>) => void;
  deleteCreditNote: (id: string) => void;

  paymentsReceived: PaymentReceipt[];
  addPaymentReceived: (payment: Omit<PaymentReceipt, 'id'>) => PaymentReceipt;
  deletePaymentReceived: (id: string) => void;

  recurringInvoices: RecurringInvoiceProfile[];
  addRecurringInvoice: (profile: Omit<RecurringInvoiceProfile, 'id'>) => RecurringInvoiceProfile;
  updateRecurringInvoice: (id: string, updated: Partial<RecurringInvoiceProfile>) => void;
  deleteRecurringInvoice: (id: string) => void;

  purchaseOrders: PurchaseOrder[];
  addPurchaseOrder: (order: Omit<PurchaseOrder, 'id'>) => PurchaseOrder;
  updatePurchaseOrder: (id: string, updated: Partial<PurchaseOrder>) => void;
  deletePurchaseOrder: (id: string) => void;

  bills: Bill[];
  addBill: (bill: Omit<Bill, 'id'>) => Bill;
  updateBill: (id: string, updated: Partial<Bill>) => void;
  deleteBill: (id: string) => void;

  recurringBills: RecurringBill[];
  addRecurringBill: (bill: Omit<RecurringBill, 'id'>) => RecurringBill;
  updateRecurringBill: (id: string, updated: Partial<RecurringBill>) => void;
  deleteRecurringBill: (id: string) => void;

  vendorCredits: VendorCredit[];
  addVendorCredit: (credit: Omit<VendorCredit, 'id'>) => VendorCredit;
  updateVendorCredit: (id: string, updated: Partial<VendorCredit>) => void;
  deleteVendorCredit: (id: string) => void;

  paymentsMade: PaymentMade[];
  addPaymentMade: (payment: Omit<PaymentMade, 'id'>) => PaymentMade;
  deletePaymentMade: (id: string) => void;

  recurringExpenses: RecurringExpense[];
  addRecurringExpense: (expense: Omit<RecurringExpense, 'id'>) => RecurringExpense;
  updateRecurringExpense: (id: string, updated: Partial<RecurringExpense>) => void;
  deleteRecurringExpense: (id: string) => void;

  toggleAccountLock: (
    accountId: string,
    lockDetails?: { lockedBy?: string; lockedReason?: string; lockedRegion?: string }
  ) => void;
  bulkUpdateAccounts: (accountIds: string[], updates: Partial<Account>) => void;
  bulkUpdateJournals: (journalIds: string[], updates: Partial<JournalEntry>) => void;

  getProjectSummary: (projectId: string) => ProjectFinancialSummary;
  convertUnbilledTimeToInvoice: (projectId: string, clientId: string) => Invoice | null;

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

const generateUuidV7 = (): string => {
  const now = Date.now().toString(16).padStart(12, '0');
  const rand = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${now.slice(0, 8)}-${now.slice(8, 12)}-7${rand.slice(0, 3)}-a${rand.slice(3, 6)}-${rand.slice(6, 18)}`;
};

const generatePublicOrgId = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const chunk = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ORG-${chunk(4)}-${chunk(4)}-${chunk(4)}`;
};

const getCurrencySymbol = (code: string): string => {
  switch (code?.toUpperCase()) {
    case 'INR': return '₹';
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'CAD': return 'C$';
    case 'AUD': return 'A$';
    case 'JPY': return '¥';
    case 'AED': return 'AED ';
    case 'SGD': return 'S$';
    case 'USD':
    default: return '$';
  }
};

const defaultOrgMeta: OrganizationMeta = {
  id: 'org-default-1001',
  uuid: '018fba0f-a012-7b89-8811-001122334455',
  publicOrgId: 'ORG-8D4K-TQ71-LM28',
  orgCode: 'ORG-10001',
  name: 'Apex Global Holdings',
  industry: 'Accounting & Financial Services',
  country: 'United States',
  baseCurrency: 'USD',
  currencySymbol: '$',
  createdDate: new Date().toISOString(),
  primaryContactName: 'Sarah Jenkins',
  primaryContactEmail: 's.jenkins@apexgrowth.com',
  ownerUserId: 'usr-identity-101',
  subscription: 'Enterprise',
  timezone: 'America/Los_Angeles (PST)',
  status: 'Active',
  isPrimary: true,
};

const createDefaultSettingsForOrg = (org: OrganizationMeta): FirmSettings => {
  const symbol = org.currencySymbol || getCurrencySymbol(org.baseCurrency || 'USD');
  return {
    ...initialSettings,
    firmName: org.name,
    firmEmail: org.primaryContactEmail || initialSettings.firmEmail,
    firmPhone: org.phone || initialSettings.firmPhone,
    firmAddress: `${org.address || ''} ${org.city || ''} ${org.state || ''} ${org.zipCode || ''}`.trim() || initialSettings.firmAddress,
    taxId: org.taxId || '',
    currencyCode: org.baseCurrency || 'USD',
    currencySymbol: symbol,
    logoText: org.name.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'ORG',
    orgProfileDetails: {
      ...initialSettings.orgProfileDetails!,
      organizationName: org.name,
      industry: org.industry || 'General Business',
      locationCountry: org.country || 'United States',
      baseCurrency: org.baseCurrency || 'USD',
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
      const fallbackSettings = orgMeta ? createDefaultSettingsForOrg(orgMeta) : initialSettings;
      return {
        settings: parsed.settings ? { ...fallbackSettings, ...parsed.settings } : fallbackSettings,
        accounts: Array.isArray(parsed.accounts) && parsed.accounts.length > 0 ? parsed.accounts : cleanInitialAccounts.map((a) => ({ ...a })),
        clients: Array.isArray(parsed.clients) ? parsed.clients : (isDefault ? initialClients : []),
        salespersons: Array.isArray(parsed.salespersons) ? parsed.salespersons : (isDefault ? initialSalespersons : []),
        vendors: Array.isArray(parsed.vendors) ? parsed.vendors : (isDefault ? initialVendors : []),
        projects: Array.isArray(parsed.projects) ? parsed.projects : (isDefault ? initialProjects : []),
        timeEntries: Array.isArray(parsed.timeEntries) ? parsed.timeEntries : (isDefault ? initialTimeEntries : []),
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : (isDefault ? initialInvoices : []),
        estimates: Array.isArray(parsed.estimates) ? parsed.estimates : (isDefault ? initialEstimates : []),
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : (isDefault ? initialExpenses : []),
        journalEntries: Array.isArray(parsed.journalEntries) ? parsed.journalEntries : (isDefault ? initialJournalEntries : []),
        periodLocks: Array.isArray(parsed.periodLocks) ? parsed.periodLocks : [],
        salesOrders: Array.isArray(parsed.salesOrders) ? parsed.salesOrders : (isDefault ? initialSalesOrders : []),
        deliveryChallans: Array.isArray(parsed.deliveryChallans) ? parsed.deliveryChallans : (isDefault ? initialDeliveryChallans : []),
        creditNotes: Array.isArray(parsed.creditNotes) ? parsed.creditNotes : (isDefault ? initialCreditNotes : []),
        paymentsReceived: Array.isArray(parsed.paymentsReceived) ? parsed.paymentsReceived : (isDefault ? initialPaymentsReceived : []),
        recurringInvoices: Array.isArray(parsed.recurringInvoices) ? parsed.recurringInvoices : (isDefault ? initialRecurringInvoices : []),
        purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : (isDefault ? initialPurchaseOrders : []),
        bills: Array.isArray(parsed.bills) ? parsed.bills : (isDefault ? initialBills : []),
        recurringBills: Array.isArray(parsed.recurringBills) ? parsed.recurringBills : (isDefault ? initialRecurringBills : []),
        vendorCredits: Array.isArray(parsed.vendorCredits) ? parsed.vendorCredits : (isDefault ? initialVendorCredits : []),
        paymentsMade: Array.isArray(parsed.paymentsMade) ? parsed.paymentsMade : (isDefault ? initialPaymentsMade : []),
        recurringExpenses: Array.isArray(parsed.recurringExpenses) ? parsed.recurringExpenses : (isDefault ? initialRecurringExpenses : []),
      };
    }
  } catch (e) {
    console.error('Failed loading workspace data for org:', orgId, e);
  }

  // Fallback defaults for a clean organization without stored data
  const fallbackSettings = orgMeta ? createDefaultSettingsForOrg(orgMeta) : initialSettings;
  return {
    settings: fallbackSettings,
    accounts: cleanInitialAccounts.map((a) => ({ ...a, balance: 0 })),
    clients: isDefault ? initialClients : [],
    salespersons: isDefault ? initialSalespersons : [],
    vendors: isDefault ? initialVendors : [],
    projects: isDefault ? initialProjects : [],
    timeEntries: isDefault ? initialTimeEntries : [],
    invoices: isDefault ? initialInvoices : [],
    estimates: isDefault ? initialEstimates : [],
    expenses: isDefault ? initialExpenses : [],
    journalEntries: isDefault ? initialJournalEntries : [],
    periodLocks: [],
    salesOrders: isDefault ? initialSalesOrders : [],
    deliveryChallans: isDefault ? initialDeliveryChallans : [],
    creditNotes: isDefault ? initialCreditNotes : [],
    paymentsReceived: isDefault ? initialPaymentsReceived : [],
    recurringInvoices: isDefault ? initialRecurringInvoices : [],
    purchaseOrders: isDefault ? initialPurchaseOrders : [],
    bills: isDefault ? initialBills : [],
    recurringBills: isDefault ? initialRecurringBills : [],
    vendorCredits: isDefault ? initialVendorCredits : [],
    paymentsMade: isDefault ? initialPaymentsMade : [],
    recurringExpenses: isDefault ? initialRecurringExpenses : [],
  };
};

export const BooksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Organizations List State
  const [organizations, setOrganizations] = useState<OrganizationMeta[]>(() => {
    try {
      const saved = localStorage.getItem(ORGS_LIST_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Failed to parse organizations list:', e);
    }
    return [defaultOrgMeta];
  });

  const [currentOrgId, setCurrentOrgId] = useState<string>(() => {
    try {
      const savedId = localStorage.getItem(ACTIVE_ORG_ID_KEY);
      if (savedId) return savedId;
    } catch (e) {}
    return defaultOrgMeta.id;
  });

  const currentOrg = organizations.find((o) => o.id === currentOrgId) || organizations[0] || defaultOrgMeta;

  // Global User Identity State ("A Person Exists Only Once")
  const [currentUser, setCurrentUser] = useState<UserIdentity>({
    userId: 'usr-identity-101',
    uuid: '018fba18-c290-7d12-9900-112233445566',
    email: 's.jenkins@apexgrowth.com',
    primaryEmail: 's.jenkins@apexgrowth.com',
    fullName: 'Sarah Jenkins',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    isEmailVerified: true,
    emailVerified: true,
    mfaEnabled: true,
    mfaType: 'Authenticator App',
    mfaMethods: ['Authenticator', 'Passkey'],
    mfaSecret: 'JBSWY3DPEHPK3PXP',
    recoveryCodes: ['REC-8F2K', 'REC-99A1', 'REC-44B2', 'REC-10C9', 'REC-77D4'],
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$simulated_hash_1',
    passwordHistory: ['$argon2id$v=19$m=65536,t=3,p=4$old_hash_0'],
    passwordLastChanged: new Date(Date.now() - 30 * 86400000).toISOString(),
    passwordHistoryHashes: [],
    argon2SimulatedHash: '$argon2id$v=19$m=65536,t=3,p=4$simulated_hash_1',
    trustedDevicesCount: 2,
    createdAt: new Date(Date.now() - 365 * 86400000).toISOString(),
    status: 'Active',
  });

  const updateUserIdentity = (updates: Partial<UserIdentity>) => {
    setCurrentUser((prev) => ({ ...prev, ...updates }));
  };

  // Organization Memberships State
  const [memberships, setMemberships] = useState<OrgMembership[]>([
    {
      id: 'mem-101',
      orgUuid: defaultOrgMeta.uuid,
      publicOrgId: defaultOrgMeta.publicOrgId,
      orgName: defaultOrgMeta.name,
      userId: 'usr-identity-101',
      userEmail: 's.jenkins@apexgrowth.com',
      userName: 'Sarah Jenkins',
      role: 'Owner',
      status: 'Active',
      joinedAt: new Date(Date.now() - 180 * 86400000).toISOString(),
    },
    {
      id: 'mem-102',
      orgUuid: defaultOrgMeta.uuid,
      publicOrgId: defaultOrgMeta.publicOrgId,
      orgName: defaultOrgMeta.name,
      userId: 'usr-identity-102',
      userEmail: 'alex.finance@apexgrowth.com',
      userName: 'Alex Rivers',
      role: 'Accountant',
      status: 'Active',
      joinedAt: new Date(Date.now() - 90 * 86400000).toISOString(),
    },
  ]);

  const orgMemberships = useMemo(() => {
    return memberships.filter((m) => m.orgUuid === currentOrg.uuid);
  }, [memberships, currentOrg.uuid]);

  const inviteMember = (input: { orgUuid: string; userEmail: string; userName: string; role: any }) => {
    const newMem: OrgMembership = {
      id: 'mem-' + Date.now(),
      orgUuid: input.orgUuid,
      publicOrgId: currentOrg.publicOrgId,
      orgName: currentOrg.name,
      userId: 'usr-invited-' + Date.now(),
      userEmail: input.userEmail,
      userName: input.userName,
      role: input.role,
      status: 'Pending',
      invitedAt: new Date().toISOString(),
    };
    setMemberships((prev) => [...prev, newMem]);
    addAuditLog({
      action: 'MEMBER_INVITED',
      targetResource: `User: ${input.userEmail}`,
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Info',
    });
  };

  const revokeMembership = (membershipId: string) => {
    setMemberships((prev) => prev.filter((m) => m.id !== membershipId));
    addAuditLog({
      action: 'MEMBER_REVOKED',
      targetResource: `Membership: ${membershipId}`,
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Warning',
    });
  };

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      userId: currentUser.userId,
      userName: currentUser.fullName,
      userEmail: currentUser.primaryEmail,
      orgUuid: defaultOrgMeta.uuid,
      publicOrgId: defaultOrgMeta.publicOrgId,
      orgName: defaultOrgMeta.name,
      action: 'ORG_ACCESSED',
      targetResource: 'Workspace Dashboard',
      ipAddress: '192.168.1.1',
      device: 'Chrome 124.0 / macOS Sonoma',
      severity: 'Info',
    },
  ]);

  const addAuditLog = (log: Omit<AuditLog, 'id' | 'timestamp' | 'orgUuid' | 'publicOrgId' | 'orgName' | 'userId' | 'userName' | 'userEmail'>) => {
    const newLog: AuditLog = {
      ...log,
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      userId: currentUser.userId,
      userName: currentUser.fullName,
      userEmail: currentUser.primaryEmail,
      orgUuid: currentOrg.uuid,
      publicOrgId: currentOrg.publicOrgId,
      orgName: currentOrg.name,
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // User Sessions State
  const [sessions, setSessions] = useState<UserSession[]>([
    {
      sessionId: 'sess-current-001',
      userId: currentUser.userId,
      device: 'MacBook Pro / Chrome 124.0',
      ipAddress: '192.168.1.1',
      location: 'San Francisco, CA, USA',
      lastActive: new Date().toISOString(),
      isCurrent: true,
      issuedAt: new Date(Date.now() - 3600000).toISOString(),
      expiresAt: new Date(Date.now() + 14 * 60 * 1000).toISOString(),
    },
    {
      sessionId: 'sess-mobile-002',
      userId: currentUser.userId,
      device: 'iPhone 15 Pro / Mobile Safari',
      ipAddress: '172.56.21.9',
      location: 'San Jose, CA, USA',
      lastActive: new Date(Date.now() - 86400000).toISOString(),
      isCurrent: false,
      issuedAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
  ]);

  const revokeSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
    addAuditLog({
      action: 'SESSION_REVOKED',
      targetResource: `Session ID: ${sessionId}`,
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Warning',
    });
  };

  const revokeAllOtherSessions = () => {
    setSessions((prev) => prev.filter((s) => s.isCurrent));
    addAuditLog({
      action: 'ALL_OTHER_SESSIONS_REVOKED',
      targetResource: 'Active User Sessions',
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Critical',
    });
  };

  const transferOwnership = (newOwnerEmail: string): boolean => {
    setOrganizations((prev) =>
      prev.map((o) => (o.id === currentOrg.id ? { ...o, primaryContactEmail: newOwnerEmail } : o))
    );
    addAuditLog({
      action: 'OWNERSHIP_TRANSFERRED',
      targetResource: `New Owner: ${newOwnerEmail}`,
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Critical',
    });
    return true;
  };

  const toggleOrgStatus = (status: 'Active' | 'Suspended') => {
    setOrganizations((prev) =>
      prev.map((o) => (o.id === currentOrg.id ? { ...o, status } : o))
    );
    addAuditLog({
      action: status === 'Suspended' ? 'ORG_SUSPENDED' : 'ORG_REACTIVATED',
      targetResource: `Org: ${currentOrg.publicOrgId}`,
      ipAddress: '192.168.1.1',
      device: 'Chrome / macOS',
      severity: 'Critical',
    });
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
  const [invoices, setInvoices] = useState<Invoice[]>(initialData.invoices);
  const [estimates, setEstimates] = useState<Estimate[]>(initialData.estimates);
  const [expenses, setExpenses] = useState<Expense[]>(initialData.expenses);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(initialData.journalEntries);
  const [periodLocks, setPeriodLocks] = useState<PeriodLock[]>(initialData.periodLocks);

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

  // Sync current active org state to localStorage ONLY if activeOrgIdRef matches currentOrgId
  useEffect(() => {
    if (activeOrgIdRef.current !== currentOrgId) {
      return;
    }
    try {
      const dataToSave = {
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
      };
      localStorage.setItem(ORG_DATA_PREFIX + currentOrgId, JSON.stringify(dataToSave));

      // Keep currentOrg name, symbol, and logoUrl synced in organizations list if changed in settings
      const currentLogo = settings.orgProfileDetails?.logoUrl || settings.branding?.logoUrl;
      setOrganizations((prev) =>
        prev.map((o) => {
          if (o.id === currentOrgId) {
            const updatedName = settings.firmName || o.name;
            if (o.name !== updatedName || o.logoUrl !== currentLogo) {
              return { ...o, name: updatedName, logoUrl: currentLogo };
            }
          }
          return o;
        })
      );
    } catch (e) {
      console.error('Failed saving workspace data:', e);
    }
  }, [
    currentOrgId,
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

  // Sync organizations list to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ORGS_LIST_KEY, JSON.stringify(organizations));
      localStorage.setItem(ACTIVE_ORG_ID_KEY, currentOrgId);
    } catch (e) {
      console.error('Failed saving orgs list:', e);
    }
  }, [organizations, currentOrgId]);

  // Switch Organization safely with full data isolation
  const switchOrganization = (targetOrgId: string) => {
    if (targetOrgId === currentOrgId && activeOrgIdRef.current === currentOrgId) return;

    // 1. Persist current active org's state before switching
    try {
      const currentDataToSave = {
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
      };
      localStorage.setItem(ORG_DATA_PREFIX + activeOrgIdRef.current, JSON.stringify(currentDataToSave));
    } catch (e) {
      console.error('Failed saving previous workspace before switch:', e);
    }

    // 2. Load target org's stored or default data
    const targetMeta = organizations.find((o) => o.id === targetOrgId) || defaultOrgMeta;
    const targetData = loadOrgData(targetOrgId, targetMeta);

    // 3. Mark activeOrgIdRef to targetOrgId BEFORE state updates
    activeOrgIdRef.current = targetOrgId;

    // 4. Batch state updates together
    setCurrentOrgId(targetOrgId);
    setSettings(targetData.settings);
    setAccounts(targetData.accounts);
    setClients(targetData.clients);
    setSalespersons(targetData.salespersons);
    setVendors(targetData.vendors);
    setProjects(targetData.projects);
    setTimeEntries(targetData.timeEntries);
    setInvoices(targetData.invoices);
    setEstimates(targetData.estimates);
    setExpenses(targetData.expenses);
    setJournalEntries(targetData.journalEntries);
    setPeriodLocks(targetData.periodLocks);
    setSalesOrders(targetData.salesOrders);
    setDeliveryChallans(targetData.deliveryChallans);
    setCreditNotes(targetData.creditNotes);
    setPaymentsReceived(targetData.paymentsReceived);
    setRecurringInvoices(targetData.recurringInvoices);
    setPurchaseOrders(targetData.purchaseOrders);
    setBills(targetData.bills);
    setRecurringBills(targetData.recurringBills);
    setVendorCredits(targetData.vendorCredits);
    setPaymentsMade(targetData.paymentsMade);
    setRecurringExpenses(targetData.recurringExpenses);
  };

  // Create Organization (Wizard Integration)
  const createOrganization = (input: CreateOrganizationInput): OrganizationMeta => {
    // Save current active org state first
    try {
      const currentDataToSave = {
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
      };
      localStorage.setItem(ORG_DATA_PREFIX + activeOrgIdRef.current, JSON.stringify(currentDataToSave));
    } catch (e) {}

    const newOrgId = 'org-' + Date.now();
    const newOrgUuid = generateUuidV7();
    const newPublicOrgId = generatePublicOrgId();
    
    // Ensure code uniqueness
    let newOrgCode = (input.orgCode || '').trim().toUpperCase();
    if (!newOrgCode) {
      newOrgCode = 'ORG-' + Math.floor(10000 + Math.random() * 90000);
    }
    while (organizations.some((o) => o.orgCode.toUpperCase() === newOrgCode)) {
      newOrgCode = 'ORG-' + Math.floor(10000 + Math.random() * 90000);
    }

    const symbol = input.currencySymbol || getCurrencySymbol(input.baseCurrency || 'USD');

    const newMeta: OrganizationMeta = {
      id: newOrgId,
      uuid: newOrgUuid,
      publicOrgId: newPublicOrgId,
      orgCode: newOrgCode,
      name: input.name,
      industry: input.industry || 'General Business',
      country: input.country || 'United States',
      baseCurrency: input.baseCurrency || 'USD',
      currencySymbol: symbol,
      createdDate: new Date().toISOString(),
      primaryContactName: input.primaryContactName || '',
      primaryContactEmail: input.primaryContactEmail || '',
      ownerUserId: currentUser.userId,
      subscription: 'Enterprise',
      timezone: input.timezone || 'America/Los_Angeles (PST)',
      status: 'Active',
      phone: input.phone || '',
      address: input.address || '',
      city: input.city || '',
      state: input.state || '',
      zipCode: input.zipCode || '',
      taxId: input.taxId || '',
    };

    const newSettings = createDefaultSettingsForOrg(newMeta);

    let newAccounts: Account[];
    let newClients: Client[] = [];
    let newSalespersons: Salesperson[] = [];
    let newVendors: Vendor[] = [];
    let newProjects: Project[] = [];
    let newTimeEntries: TimeEntry[] = [];
    let newInvoices: Invoice[] = [];
    let newEstimates: Estimate[] = [];
    let newExpenses: Expense[] = [];
    let newJournalEntries: JournalEntry[] = [];
    let newSalesOrders: SalesOrder[] = [];
    let newDeliveryChallans: DeliveryChallan[] = [];
    let newCreditNotes: CreditNote[] = [];
    let newPaymentsReceived: PaymentReceipt[] = [];
    let newRecurringInvoices: RecurringInvoiceProfile[] = [];
    let newPurchaseOrders: PurchaseOrder[] = [];
    let newBills: Bill[] = [];
    let newRecurringBills: RecurringBill[] = [];
    let newVendorCredits: VendorCredit[] = [];
    let newPaymentsMade: PaymentMade[] = [];
    let newRecurringExpenses: RecurringExpense[] = [];

    if (input.includeSampleData) {
      newAccounts = JSON.parse(JSON.stringify(initialAccounts));
      newClients = JSON.parse(JSON.stringify(initialClients));
      newSalespersons = JSON.parse(JSON.stringify(initialSalespersons));
      newVendors = JSON.parse(JSON.stringify(initialVendors));
      newProjects = JSON.parse(JSON.stringify(initialProjects));
      newTimeEntries = JSON.parse(JSON.stringify(initialTimeEntries));
      newInvoices = JSON.parse(JSON.stringify(initialInvoices));
      newEstimates = JSON.parse(JSON.stringify(initialEstimates));
      newExpenses = JSON.parse(JSON.stringify(initialExpenses));
      newJournalEntries = JSON.parse(JSON.stringify(initialJournalEntries));
      newSalesOrders = JSON.parse(JSON.stringify(initialSalesOrders));
      newDeliveryChallans = JSON.parse(JSON.stringify(initialDeliveryChallans));
      newCreditNotes = JSON.parse(JSON.stringify(initialCreditNotes));
      newPaymentsReceived = JSON.parse(JSON.stringify(initialPaymentsReceived));
      newRecurringInvoices = JSON.parse(JSON.stringify(initialRecurringInvoices));
      newPurchaseOrders = JSON.parse(JSON.stringify(initialPurchaseOrders));
      newBills = JSON.parse(JSON.stringify(initialBills));
      newRecurringBills = JSON.parse(JSON.stringify(initialRecurringBills));
      newVendorCredits = JSON.parse(JSON.stringify(initialVendorCredits));
      newPaymentsMade = JSON.parse(JSON.stringify(initialPaymentsMade));
      newRecurringExpenses = JSON.parse(JSON.stringify(initialRecurringExpenses));
    } else {
      newAccounts = cleanInitialAccounts.map((a) => ({ ...a, balance: 0 }));
    }

    const newOrgData = {
      settings: newSettings,
      accounts: newAccounts,
      clients: newClients,
      salespersons: newSalespersons,
      vendors: newVendors,
      projects: newProjects,
      timeEntries: newTimeEntries,
      invoices: newInvoices,
      estimates: newEstimates,
      expenses: newExpenses,
      journalEntries: newJournalEntries,
      periodLocks: [],
      salesOrders: newSalesOrders,
      deliveryChallans: newDeliveryChallans,
      creditNotes: newCreditNotes,
      paymentsReceived: newPaymentsReceived,
      recurringInvoices: newRecurringInvoices,
      purchaseOrders: newPurchaseOrders,
      bills: newBills,
      recurringBills: newRecurringBills,
      vendorCredits: newVendorCredits,
      paymentsMade: newPaymentsMade,
      recurringExpenses: newRecurringExpenses,
    };

    localStorage.setItem(ORG_DATA_PREFIX + newOrgId, JSON.stringify(newOrgData));

    const updatedOrgs = [...organizations, newMeta];
    setOrganizations(updatedOrgs);

    // Switch active organization to newly created org
    activeOrgIdRef.current = newOrgId;
    setCurrentOrgId(newOrgId);
    setSettings(newSettings);
    setAccounts(newAccounts);
    setClients(newClients);
    setSalespersons(newSalespersons);
    setVendors(newVendors);
    setProjects(newProjects);
    setTimeEntries(newTimeEntries);
    setInvoices(newInvoices);
    setEstimates(newEstimates);
    setExpenses(newExpenses);
    setJournalEntries(newJournalEntries);
    setPeriodLocks([]);
    setSalesOrders(newSalesOrders);
    setDeliveryChallans(newDeliveryChallans);
    setCreditNotes(newCreditNotes);
    setPaymentsReceived(newPaymentsReceived);
    setRecurringInvoices(newRecurringInvoices);
    setPurchaseOrders(newPurchaseOrders);
    setBills(newBills);
    setRecurringBills(newRecurringBills);
    setVendorCredits(newVendorCredits);
    setPaymentsMade(newPaymentsMade);
    setRecurringExpenses(newRecurringExpenses);

    return newMeta;
  };

  // Delete Organization
  const deleteOrganization = (orgId: string): boolean => {
    if (organizations.length <= 1) return false;

    const remaining = organizations.filter((o) => o.id !== orgId);
    setOrganizations(remaining);
    localStorage.removeItem(ORG_DATA_PREFIX + orgId);

    if (orgId === currentOrgId) {
      const nextOrg = remaining[0];
      const nextData = loadOrgData(nextOrg.id, nextOrg);
      activeOrgIdRef.current = nextOrg.id;
      setCurrentOrgId(nextOrg.id);
      setSettings(nextData.settings);
      setAccounts(nextData.accounts);
      setClients(nextData.clients);
      setSalespersons(nextData.salespersons);
      setVendors(nextData.vendors);
      setProjects(nextData.projects);
      setTimeEntries(nextData.timeEntries);
      setInvoices(nextData.invoices);
      setEstimates(nextData.estimates);
      setExpenses(nextData.expenses);
      setJournalEntries(nextData.journalEntries);
      setPeriodLocks(nextData.periodLocks);
      setSalesOrders(nextData.salesOrders);
      setDeliveryChallans(nextData.deliveryChallans);
      setCreditNotes(nextData.creditNotes);
      setPaymentsReceived(nextData.paymentsReceived);
      setRecurringInvoices(nextData.recurringInvoices);
      setPurchaseOrders(nextData.purchaseOrders);
      setBills(nextData.bills);
      setRecurringBills(nextData.recurringBills);
      setVendorCredits(nextData.vendorCredits);
      setPaymentsMade(nextData.paymentsMade);
      setRecurringExpenses(nextData.recurringExpenses);
    }
    return true;
  };

  // Export Whole Organization as JSON Package
  const exportOrganizationJSON = (targetOrgId?: string) => {
    const orgId = targetOrgId || currentOrgId;
    const targetOrgMeta = organizations.find((o) => o.id === orgId) || currentOrg;

    let targetData;
    if (orgId === currentOrgId) {
      targetData = {
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
      };
    } else {
      targetData = loadOrgData(orgId, targetOrgMeta);
    }

    const exportPayload = {
      exportVersion: '2.0',
      exportType: 'WholeOrganizationPackage',
      exportedAt: new Date().toISOString(),
      organization: targetOrgMeta,
      data: targetData,
    };

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = `${targetOrgMeta.orgCode}_${(targetOrgMeta.name || 'Organization').replace(/[^a-zA-Z0-9]/g, '_')}_Backup.json`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import Organization Package JSON
  const importOrganizationJSON = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      let importedMeta: OrganizationMeta;
      let importedData: any;

      if (parsed.exportType === 'WholeOrganizationPackage' && parsed.organization && parsed.data) {
        importedMeta = parsed.organization;
        importedData = parsed.data;
      } else {
        // Legacy backup file format fallback
        importedMeta = {
          id: 'org-imp-' + Date.now(),
          uuid: generateUuidV7(),
          publicOrgId: generatePublicOrgId(),
          orgCode: 'ORG-' + Math.floor(10000 + Math.random() * 90000),
          name: parsed.settings?.firmName || 'Imported Organization',
          industry: 'General Business',
          country: 'United States',
          baseCurrency: parsed.settings?.currencyCode || 'USD',
          currencySymbol: parsed.settings?.currencySymbol || '$',
          createdDate: new Date().toISOString(),
          ownerUserId: currentUser.userId,
          subscription: 'Enterprise',
          timezone: 'America/Los_Angeles (PST)',
          status: 'Active',
        };
        importedData = parsed;
      }

      // Ensure unique orgCode
      let code = importedMeta.orgCode || ('ORG-' + Math.floor(10000 + Math.random() * 90000));
      while (organizations.some((o) => o.orgCode.toUpperCase() === code.toUpperCase())) {
        code = 'ORG-' + Math.floor(10000 + Math.random() * 90000);
      }

      const newOrgId = 'org-' + Date.now();
      const finalMeta: OrganizationMeta = {
        ...importedMeta,
        id: newOrgId,
        orgCode: code,
      };

      // Save imported org data
      localStorage.setItem(ORG_DATA_PREFIX + newOrgId, JSON.stringify(importedData));

      // Save to organizations list
      const updatedOrgs = [...organizations, finalMeta];
      setOrganizations(updatedOrgs);

      // Switch to imported org
      const loaded = loadOrgData(newOrgId, finalMeta);
      activeOrgIdRef.current = newOrgId;
      setCurrentOrgId(newOrgId);
      setSettings(loaded.settings);
      setAccounts(loaded.accounts);
      setClients(loaded.clients);
      setSalespersons(loaded.salespersons);
      setVendors(loaded.vendors);
      setProjects(loaded.projects);
      setTimeEntries(loaded.timeEntries);
      setInvoices(loaded.invoices);
      setEstimates(loaded.estimates);
      setExpenses(loaded.expenses);
      setJournalEntries(loaded.journalEntries);
      setPeriodLocks(loaded.periodLocks);
      setSalesOrders(loaded.salesOrders);
      setDeliveryChallans(loaded.deliveryChallans);
      setCreditNotes(loaded.creditNotes);
      setPaymentsReceived(loaded.paymentsReceived);
      setRecurringInvoices(loaded.recurringInvoices);
      setPurchaseOrders(loaded.purchaseOrders);
      setBills(loaded.bills);
      setRecurringBills(loaded.recurringBills);
      setVendorCredits(loaded.vendorCredits);
      setPaymentsMade(loaded.paymentsMade);
      setRecurringExpenses(loaded.recurringExpenses);

      return true;
    } catch (e) {
      console.error('Import organization error:', e);
      return false;
    }
  };



  const updateSettings = (newSettings: Partial<FirmSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const addAccount = (accountData: Omit<Account, 'id'>): Account => {
    const newAcc: Account = {
      ...accountData,
      id: `acc-${Date.now()}`,
    };
    setAccounts((prev) => [...prev, newAcc]);
    return newAcc;
  };

  const updateAccount = (id: string, updated: Partial<Account>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updated } : a)));
  };

  const addClient = (clientData: Omit<Client, 'id' | 'createdAt'>) => {
    const newClient: Client = {
      ...clientData,
      id: `cli-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setClients((prev) => [...prev, newClient]);
    return newClient;
  };

  const updateClient = (id: string, clientData: Partial<Client>) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...clientData } : c)));
  };

  const deleteClient = (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  const addSalesperson = (spData: Omit<Salesperson, 'id' | 'createdAt'>) => {
    const newSp: Salesperson = {
      ...spData,
      id: `sp-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setSalespersons((prev) => [...prev, newSp]);
    return newSp;
  };

  const updateSalesperson = (id: string, spData: Partial<Salesperson>) => {
    setSalespersons((prev) => prev.map((s) => (s.id === id ? { ...s, ...spData } : s)));
  };

  const deleteSalesperson = (id: string) => {
    setSalespersons((prev) => prev.filter((s) => s.id !== id));
  };

  const addVendor = (vendorData: Omit<Vendor, 'id'>) => {
    const newVendor: Vendor = {
      ...vendorData,
      id: `ven-${Date.now()}`,
    };
    setVendors((prev) => [...prev, newVendor]);
    return newVendor;
  };

  const updateVendor = (id: string, vendorData: Partial<Vendor>) => {
    setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, ...vendorData } : v)));
  };

  const deleteVendor = (id: string) => {
    setVendors((prev) => prev.filter((v) => v.id !== id));
  };

  const addProject = (projectData: Omit<Project, 'id' | 'createdAt'>) => {
    const newPrj: Project = {
      ...projectData,
      id: `prj-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setProjects((prev) => [...prev, newPrj]);
    return newPrj;
  };

  const updateProject = (id: string, projectData: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...projectData } : p)));
  };

  const deleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const addTimeEntry = (entry: Omit<TimeEntry, 'id'>) => {
    const newEntry: TimeEntry = {
      ...entry,
      id: `time-${Date.now()}`,
    };
    setTimeEntries((prev) => [newEntry, ...prev]);
  };

  const updateTimeEntry = (id: string, entryData: Partial<TimeEntry>) => {
    setTimeEntries((prev) => prev.map((t) => (t.id === id ? { ...t, ...entryData } : t)));
  };

  const deleteTimeEntry = (id: string) => {
    setTimeEntries((prev) => prev.filter((t) => t.id !== id));
  };

  const addInvoice = (invoiceData: Omit<Invoice, 'id' | 'createdAt' | 'invoiceNumber'>): Invoice => {
    const count = invoices.length + 1;
    const invNum = `INV-2026-${String(count).padStart(3, '0')}`;
    const newInv: Invoice = {
      ...invoiceData,
      id: `inv-${Date.now()}`,
      invoiceNumber: invNum,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setInvoices((prev) => [newInv, ...prev]);
    return newInv;
  };

  const updateInvoice = (id: string, invoiceData: Partial<Invoice>) => {
    setInvoices((prev) => prev.map((inv) => (inv.id === id ? { ...inv, ...invoiceData } : inv)));
  };

  const recordPayment = (invoiceId: string, amount: number) => {
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        const newPaid = Math.min(inv.totalAmount, inv.paidAmount + amount);
        const newBalance = Math.max(0, inv.totalAmount - newPaid);
        const newStatus = newBalance === 0 ? 'Paid' : newPaid > 0 ? 'Partially Paid' : inv.status;

        // Also update Cash Bank account balance
        setAccounts((accs) =>
          accs.map((a) => (a.code === '1000' ? { ...a, balance: a.balance + amount } : a))
        );

        return {
          ...inv,
          paidAmount: newPaid,
          balanceDue: newBalance,
          status: newStatus,
        };
      })
    );
  };

  const deleteInvoice = (id: string) => {
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  const addEstimate = (estimateData: Omit<Estimate, 'id' | 'createdAt' | 'estimateNumber'>) => {
    const count = estimates.length + 1;
    const estNum = `EST-2026-${String(count).padStart(3, '0')}`;
    const newEst: Estimate = {
      ...estimateData,
      id: `est-${Date.now()}`,
      estimateNumber: estNum,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setEstimates((prev) => [newEst, ...prev]);
  };

  const convertEstimateToInvoice = (estimateId: string): Invoice | null => {
    const est = estimates.find((e) => e.id === estimateId);
    if (!est) return null;

    const newInv = addInvoice({
      clientId: est.clientId,
      clientName: est.clientName,
      clientEmail: '',
      projectId: est.projectId,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items: est.items,
      subtotal: est.subtotal,
      taxTotal: est.taxTotal,
      discount: 0,
      totalAmount: est.totalAmount,
      paidAmount: 0,
      balanceDue: est.totalAmount,
      status: 'Sent',
      notes: est.notes,
      terms: 'Converted from Estimate ' + est.estimateNumber,
    });

    setEstimates((prev) =>
      prev.map((e) => (e.id === estimateId ? { ...e, status: 'Converted' } : e))
    );

    return newInv;
  };

  const addExpense = (expenseData: Omit<Expense, 'id' | 'createdAt' | 'referenceNumber'>) => {
    const count = expenses.length + 1;
    const refNum = `EXP-2026-${String(count).padStart(3, '0')}`;
    const newExp: Expense = {
      ...expenseData,
      id: `exp-${Date.now()}`,
      referenceNumber: refNum,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setExpenses((prev) => [newExp, ...prev]);

    // Double Entry Accounting: Construct Journal Lines
    const journalLines: JournalLine[] = [];

    // 1. Debit Expense Account(s)
    if (expenseData.isItemized && expenseData.items && expenseData.items.length > 0) {
      expenseData.items.forEach((item, idx) => {
        const itemAcc = accounts.find((a) => a.id === item.accountId);
        journalLines.push({
          id: `line-${Date.now()}-${idx}`,
          accountId: item.accountId,
          accountCode: itemAcc?.code || '',
          accountName: itemAcc?.name || item.accountName || 'Expense Category',
          debit: item.amount,
          credit: 0,
          description: item.description || expenseData.description,
        });
      });
    } else {
      const expAcc = accounts.find((a) => a.id === expenseData.accountId);
      journalLines.push({
        id: `line-${Date.now()}-0`,
        accountId: expenseData.accountId,
        accountCode: expAcc?.code || '',
        accountName: expAcc?.name || expenseData.accountName || 'Expense Category',
        debit: expenseData.amount,
        credit: 0,
        description: expenseData.description,
      });
    }

    // 2. Credit Payment Account (Cash / Bank / Credit Card)
    const paidAcc = accounts.find((a) => a.id === expenseData.paidFromAccountId);
    journalLines.push({
      id: `line-${Date.now()}-paid`,
      accountId: expenseData.paidFromAccountId,
      accountCode: paidAcc?.code || '',
      accountName: paidAcc?.name || expenseData.paidFromAccountName || 'Payment Account',
      debit: 0,
      credit: expenseData.amount,
      description: `Paid via ${paidAcc?.name || 'Cash/Bank Account'} for ${expenseData.description || 'Expense'} (${refNum})`,
    });

    // 3. Post Journal Entry to General Ledger
    const jrnCount = journalEntries.length + 1;
    const jrnNum = `JRN-2026-${String(jrnCount).padStart(3, '0')}`;
    const newJrn: JournalEntry = {
      id: `jrn-${Date.now()}`,
      entryNumber: jrnNum,
      date: expenseData.date || new Date().toISOString().split('T')[0],
      reference: refNum,
      description: `Expense Payment: ${expenseData.description}${expenseData.vendorName ? ` (${expenseData.vendorName})` : ''}`,
      projectId: expenseData.projectId,
      lines: journalLines,
      status: 'Posted',
      createdAt: new Date().toISOString().split('T')[0],
    };

    setJournalEntries((prev) => [newJrn, ...prev]);

    // 4. Update Account Balances based on Double Entry rules
    setAccounts((accs) =>
      accs.map((acc) => {
        const accLines = journalLines.filter((l) => l.accountId === acc.id);
        if (accLines.length === 0) return acc;

        let delta = 0;
        accLines.forEach((l) => {
          if (acc.type === 'Asset' || acc.type === 'Expense') {
            delta += (l.debit - l.credit);
          } else {
            delta += (l.credit - l.debit);
          }
        });

        return { ...acc, balance: acc.balance + delta };
      })
    );
  };

  const deleteExpense = (id: string) => {
    const exp = expenses.find((e) => e.id === id);
    if (exp) {
      // Reverse account balance adjustments
      setAccounts((accs) =>
        accs.map((acc) => {
          if (acc.id === exp.paidFromAccountId) {
            // Revert credit: if Asset, balance increases back; if Liability, decreases back
            if (acc.type === 'Asset') {
              return { ...acc, balance: acc.balance + exp.amount };
            } else if (acc.type === 'Liability') {
              return { ...acc, balance: Math.max(0, acc.balance - exp.amount) };
            }
          }
          if (acc.id === exp.accountId) {
            return { ...acc, balance: Math.max(0, acc.balance - exp.amount) };
          }
          return acc;
        })
      );
      // Remove corresponding journal entry
      setJournalEntries((prev) => prev.filter((j) => j.reference !== exp.referenceNumber));
    }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const addJournalEntry = (
    entryData: Omit<JournalEntry, 'id' | 'createdAt' | 'entryNumber'>
  ): boolean => {
    const totalDebit = entryData.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = entryData.lines.reduce((sum, l) => sum + (l.credit || 0), 0);

    // Double-entry validation
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return false;
    }

    const count = journalEntries.length + 1;
    const jrnNum = `JRN-2026-${String(count).padStart(3, '0')}`;
    const newJrn: JournalEntry = {
      ...entryData,
      id: `jrn-${Date.now()}`,
      entryNumber: jrnNum,
      createdAt: new Date().toISOString().split('T')[0],
    };

    setJournalEntries((prev) => [newJrn, ...prev]);

    // Apply adjustments to account balances
    setAccounts((accs) =>
      accs.map((acc) => {
        const line = entryData.lines.find((l) => l.accountId === acc.id);
        if (!line) return acc;

        let delta = 0;
        if (acc.type === 'Asset' || acc.type === 'Expense') {
          delta = line.debit - line.credit;
        } else {
          delta = line.credit - line.debit;
        }
        return { ...acc, balance: acc.balance + delta };
      })
    );

    return true;
  };

  // Helper function: Project Financial Summary
  const getProjectSummary = (projectId: string): ProjectFinancialSummary => {
    const prjInvoices = invoices.filter((i) => i.projectId === projectId && i.status !== 'Void');
    const totalInvoiced = prjInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
    const totalCollected = prjInvoices.reduce((sum, i) => sum + i.paidAmount, 0);

    const prjExpenses = expenses.filter((e) => e.projectId === projectId);
    const directExpenses = prjExpenses.reduce((sum, e) => sum + e.amount, 0);

    const prjTimes = timeEntries.filter((t) => t.projectId === projectId);
    const totalLoggedHours = prjTimes.reduce((sum, t) => sum + t.hours, 0);

    const unbilledTimes = prjTimes.filter((t) => t.isBillable && !t.isBilled);
    const unbilledHoursAmount = unbilledTimes.reduce((sum, t) => sum + t.hours * t.hourlyRate, 0);

    const netProfit = totalInvoiced - directExpenses;
    const profitMarginPercent = totalInvoiced > 0 ? (netProfit / totalInvoiced) * 100 : 0;

    const prj = projects.find((p) => p.id === projectId);
    let budgetUsedPercent = 0;
    if (prj && prj.totalBudget > 0) {
      if (prj.budgetType === 'Fixed Cost' || prj.budgetType === 'Time & Materials') {
        budgetUsedPercent = (directExpenses / prj.totalBudget) * 100;
      } else {
        budgetUsedPercent = (totalLoggedHours / prj.totalBudget) * 100;
      }
    }

    return {
      projectId,
      totalInvoiced,
      totalCollected,
      directExpenses,
      unbilledHoursAmount,
      totalLoggedHours,
      netProfit,
      profitMarginPercent: Math.round(profitMarginPercent * 10) / 10,
      budgetUsedPercent: Math.round(budgetUsedPercent * 10) / 10,
    };
  };

  // Helper function: Convert all unbilled time for a project into a new invoice
  const convertUnbilledTimeToInvoice = (projectId: string, clientId: string): Invoice | null => {
    const unbilled = timeEntries.filter((t) => t.projectId === projectId && t.isBillable && !t.isBilled);
    if (unbilled.length === 0) return null;

    const prj = projects.find((p) => p.id === projectId);
    const cli = clients.find((c) => c.id === clientId);

    const items: InvoiceItem[] = unbilled.map((t) => ({
      id: `item-${Date.now()}-${t.id}`,
      description: `${t.taskName} (${t.staffName} - ${t.hours} hrs @ $${t.hourlyRate}/hr)`,
      accountId: 'acc-4000',
      quantity: t.hours,
      unitPrice: t.hourlyRate,
      taxRate: settings.defaultTaxRate,
      amount: t.hours * t.hourlyRate,
      timeEntryId: t.id,
    }));

    const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
    const taxTotal = Math.round(subtotal * (settings.defaultTaxRate / 100));
    const totalAmount = subtotal + taxTotal;

    const invoiceId = `inv-${Date.now()}`;
    const count = invoices.length + 1;
    const invNum = `INV-2026-${String(count).padStart(3, '0')}`;

    const newInvoice: Invoice = {
      id: invoiceId,
      invoiceNumber: invNum,
      clientId,
      clientName: cli?.name || 'Client',
      clientEmail: cli?.email || '',
      projectId,
      projectName: prj?.name || '',
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items,
      subtotal,
      taxTotal,
      discount: 0,
      totalAmount,
      paidAmount: 0,
      balanceDue: totalAmount,
      status: 'Sent',
      notes: 'Automated invoice generated from unbilled billable project time entries.',
      createdAt: new Date().toISOString().split('T')[0],
    };

    setInvoices((prev) => [newInvoice, ...prev]);

    // Mark time entries as billed
    const unbilledIds = new Set(unbilled.map((u) => u.id));
    setTimeEntries((prev) =>
      prev.map((t) => (unbilledIds.has(t.id) ? { ...t, isBilled: true, invoiceId } : t))
    );

    return newInvoice;
  };

  const addPeriodLock = (lockData: Omit<PeriodLock, 'id' | 'lockedAt' | 'status'>) => {
    const newLock: PeriodLock = {
      ...lockData,
      id: `lock-${Date.now()}`,
      lockedAt: new Date().toISOString(),
      status: 'Active',
    };
    setPeriodLocks((prev) => [newLock, ...prev]);
  };

  const deletePeriodLock = (id: string) => {
    setPeriodLocks((prev) => prev.filter((l) => l.id !== id));
  };

  const toggleAccountLock = (
    accountId: string,
    lockDetails?: { lockedBy?: string; lockedReason?: string; lockedRegion?: string }
  ) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id === accountId) {
          const isCurrentlyLocked = !!acc.isLocked;
          if (isCurrentlyLocked) {
            return {
              ...acc,
              isLocked: false,
              lockedBy: undefined,
              lockedAt: undefined,
              lockedReason: undefined,
              lockedRegion: undefined,
            };
          } else {
            return {
              ...acc,
              isLocked: true,
              lockedBy: lockDetails?.lockedBy || 'Financial Auditor / Controller',
              lockedAt: new Date().toISOString(),
              lockedReason: lockDetails?.lockedReason || 'Locked against posting',
              lockedRegion: lockDetails?.lockedRegion || 'Global / ALL',
            };
          }
        }
        return acc;
      })
    );
  };

  const bulkUpdateAccounts = (accountIds: string[], updates: Partial<Account>) => {
    setAccounts((prev) =>
      prev.map((acc) => (accountIds.includes(acc.id) ? { ...acc, ...updates } : acc))
    );
  };

  const bulkUpdateJournals = (journalIds: string[], updates: Partial<JournalEntry>) => {
    setJournalEntries((prev) =>
      prev.map((j) => (journalIds.includes(j.id) ? { ...j, ...updates } : j))
    );
  };

  // Document handlers
  const addSalesOrder = (orderData: Omit<SalesOrder, 'id'>): SalesOrder => {
    const newOrder: SalesOrder = {
      ...orderData,
      id: `so-${Date.now()}`,
    };
    setSalesOrders((prev) => [newOrder, ...prev]);
    return newOrder;
  };
  const updateSalesOrder = (id: string, updated: Partial<SalesOrder>) => {
    setSalesOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
  };
  const deleteSalesOrder = (id: string) => {
    setSalesOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const convertSalesOrderToInvoice = (salesOrderId: string): Invoice | null => {
    const so = salesOrders.find((s) => s.id === salesOrderId);
    if (!so) return null;

    const numAmt = so.totalAmount;
    const taxAmt = Math.round(numAmt * (settings.defaultTaxRate / 100));

    const newInv = addInvoice({
      clientId: so.clientId,
      clientName: so.clientName,
      clientEmail: '',
      projectId: so.projectId,
      salespersonName: so.salespersonName,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      items: [
        {
          id: `item-${Date.now()}`,
          description: so.itemsSummary || `Sales Order ${so.orderNumber}`,
          accountId: 'acc-4000',
          quantity: 1,
          unitPrice: numAmt,
          taxRate: settings.defaultTaxRate,
          amount: numAmt,
        },
      ],
      subtotal: numAmt,
      taxTotal: taxAmt,
      discount: 0,
      totalAmount: numAmt + taxAmt,
      paidAmount: 0,
      balanceDue: numAmt + taxAmt,
      status: 'Sent',
      notes: so.notes || '',
      terms: 'Converted from Sales Order ' + so.orderNumber,
    });

    setSalesOrders((prev) =>
      prev.map((s) => (s.id === salesOrderId ? { ...s, status: 'Invoiced' } : s))
    );

    return newInv;
  };

  const addDeliveryChallan = (challanData: Omit<DeliveryChallan, 'id'>): DeliveryChallan => {
    const newChallan: DeliveryChallan = {
      ...challanData,
      id: `dc-${Date.now()}`,
    };
    setDeliveryChallans((prev) => [newChallan, ...prev]);
    return newChallan;
  };
  const updateDeliveryChallan = (id: string, updated: Partial<DeliveryChallan>) => {
    setDeliveryChallans((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
  };
  const deleteDeliveryChallan = (id: string) => {
    setDeliveryChallans((prev) => prev.filter((c) => c.id !== id));
  };

  const addCreditNote = (noteData: Omit<CreditNote, 'id'>): CreditNote => {
    const newNote: CreditNote = {
      ...noteData,
      id: `cn-${Date.now()}`,
    };
    setCreditNotes((prev) => [newNote, ...prev]);
    return newNote;
  };
  const updateCreditNote = (id: string, updated: Partial<CreditNote>) => {
    setCreditNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updated } : n)));
  };
  const deleteCreditNote = (id: string) => {
    setCreditNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const addPaymentReceived = (paymentData: Omit<PaymentReceipt, 'id'>): PaymentReceipt => {
    const newPayment: PaymentReceipt = {
      ...paymentData,
      id: `pr-${Date.now()}`,
    };
    setPaymentsReceived((prev) => [newPayment, ...prev]);
    return newPayment;
  };
  const deletePaymentReceived = (id: string) => {
    setPaymentsReceived((prev) => prev.filter((p) => p.id !== id));
  };

  const addRecurringInvoice = (profileData: Omit<RecurringInvoiceProfile, 'id'>): RecurringInvoiceProfile => {
    const newProfile: RecurringInvoiceProfile = {
      ...profileData,
      id: `rec-inv-${Date.now()}`,
    };
    setRecurringInvoices((prev) => [newProfile, ...prev]);
    return newProfile;
  };
  const updateRecurringInvoice = (id: string, updated: Partial<RecurringInvoiceProfile>) => {
    setRecurringInvoices((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
  };
  const deleteRecurringInvoice = (id: string) => {
    setRecurringInvoices((prev) => prev.filter((p) => p.id !== id));
  };

  const addPurchaseOrder = (orderData: Omit<PurchaseOrder, 'id'>): PurchaseOrder => {
    const newOrder: PurchaseOrder = {
      ...orderData,
      id: `po-${Date.now()}`,
    };
    setPurchaseOrders((prev) => [newOrder, ...prev]);
    return newOrder;
  };
  const updatePurchaseOrder = (id: string, updated: Partial<PurchaseOrder>) => {
    setPurchaseOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
  };
  const deletePurchaseOrder = (id: string) => {
    setPurchaseOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const addBill = (billData: Omit<Bill, 'id'>): Bill => {
    const newBill: Bill = {
      ...billData,
      id: `bill-${Date.now()}`,
    };
    setBills((prev) => [newBill, ...prev]);
    return newBill;
  };
  const updateBill = (id: string, updated: Partial<Bill>) => {
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)));
  };
  const deleteBill = (id: string) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
  };

  const addRecurringBill = (billData: Omit<RecurringBill, 'id'>): RecurringBill => {
    const newBill: RecurringBill = {
      ...billData,
      id: `rec-bill-${Date.now()}`,
    };
    setRecurringBills((prev) => [newBill, ...prev]);
    return newBill;
  };
  const updateRecurringBill = (id: string, updated: Partial<RecurringBill>) => {
    setRecurringBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...updated } : b)));
  };
  const deleteRecurringBill = (id: string) => {
    setRecurringBills((prev) => prev.filter((b) => b.id !== id));
  };

  const addVendorCredit = (creditData: Omit<VendorCredit, 'id'>): VendorCredit => {
    const newCredit: VendorCredit = {
      ...creditData,
      id: `vc-${Date.now()}`,
    };
    setVendorCredits((prev) => [newCredit, ...prev]);
    return newCredit;
  };
  const updateVendorCredit = (id: string, updated: Partial<VendorCredit>) => {
    setVendorCredits((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
  };
  const deleteVendorCredit = (id: string) => {
    setVendorCredits((prev) => prev.filter((c) => c.id !== id));
  };

  const addPaymentMade = (paymentData: Omit<PaymentMade, 'id'>): PaymentMade => {
    const newPayment: PaymentMade = {
      ...paymentData,
      id: `pm-${Date.now()}`,
    };
    setPaymentsMade((prev) => [newPayment, ...prev]);
    return newPayment;
  };
  const deletePaymentMade = (id: string) => {
    setPaymentsMade((prev) => prev.filter((p) => p.id !== id));
  };

  const addRecurringExpense = (expenseData: Omit<RecurringExpense, 'id'>): RecurringExpense => {
    const newExpense: RecurringExpense = {
      ...expenseData,
      id: `rec-exp-${Date.now()}`,
    };
    setRecurringExpenses((prev) => [newExpense, ...prev]);
    return newExpense;
  };
  const updateRecurringExpense = (id: string, updated: Partial<RecurringExpense>) => {
    setRecurringExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
  };
  const deleteRecurringExpense = (id: string) => {
    setRecurringExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const clearAllData = () => {
    const cleanAccounts = cleanInitialAccounts.map((a) => ({ ...a, balance: 0 }));
    setAccounts(cleanAccounts);
    setClients([]);
    setSalespersons([]);
    setVendors([]);
    setProjects([]);
    setTimeEntries([]);
    setInvoices([]);
    setEstimates([]);
    setExpenses([]);
    setJournalEntries([]);
    setPeriodLocks([]);
    setSalesOrders([]);
    setDeliveryChallans([]);
    setCreditNotes([]);
    setPaymentsReceived([]);
    setRecurringInvoices([]);
    setPurchaseOrders([]);
    setBills([]);
    setRecurringBills([]);
    setVendorCredits([]);
    setPaymentsMade([]);
    setRecurringExpenses([]);

    const cleanData = {
      settings: initialSettings,
      accounts: cleanAccounts,
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
    localStorage.setItem(ORG_DATA_PREFIX + currentOrgId, JSON.stringify(cleanData));
  };

  const loadSampleData = () => {
    const freshAccounts = JSON.parse(JSON.stringify(initialAccounts));
    const freshClients = JSON.parse(JSON.stringify(initialClients));
    const freshSalespersons = JSON.parse(JSON.stringify(initialSalespersons));
    const freshVendors = JSON.parse(JSON.stringify(initialVendors));
    const freshProjects = JSON.parse(JSON.stringify(initialProjects));
    const freshTimeEntries = JSON.parse(JSON.stringify(initialTimeEntries));
    const freshInvoices = JSON.parse(JSON.stringify(initialInvoices));
    const freshEstimates = JSON.parse(JSON.stringify(initialEstimates));
    const freshExpenses = JSON.parse(JSON.stringify(initialExpenses));
    const freshJournalEntries = JSON.parse(JSON.stringify(initialJournalEntries));
    const freshSalesOrders = JSON.parse(JSON.stringify(initialSalesOrders));
    const freshDeliveryChallans = JSON.parse(JSON.stringify(initialDeliveryChallans));
    const freshCreditNotes = JSON.parse(JSON.stringify(initialCreditNotes));
    const freshPaymentsReceived = JSON.parse(JSON.stringify(initialPaymentsReceived));
    const freshRecurringInvoices = JSON.parse(JSON.stringify(initialRecurringInvoices));
    const freshPurchaseOrders = JSON.parse(JSON.stringify(initialPurchaseOrders));
    const freshBills = JSON.parse(JSON.stringify(initialBills));
    const freshRecurringBills = JSON.parse(JSON.stringify(initialRecurringBills));
    const freshVendorCredits = JSON.parse(JSON.stringify(initialVendorCredits));
    const freshPaymentsMade = JSON.parse(JSON.stringify(initialPaymentsMade));
    const freshRecurringExpenses = JSON.parse(JSON.stringify(initialRecurringExpenses));

    setSettings(initialSettings);
    setAccounts(freshAccounts);
    setClients(freshClients);
    setSalespersons(freshSalespersons);
    setVendors(freshVendors);
    setProjects(freshProjects);
    setTimeEntries(freshTimeEntries);
    setInvoices(freshInvoices);
    setEstimates(freshEstimates);
    setExpenses(freshExpenses);
    setJournalEntries(freshJournalEntries);
    setSalesOrders(freshSalesOrders);
    setDeliveryChallans(freshDeliveryChallans);
    setCreditNotes(freshCreditNotes);
    setPaymentsReceived(freshPaymentsReceived);
    setRecurringInvoices(freshRecurringInvoices);
    setPurchaseOrders(freshPurchaseOrders);
    setBills(freshBills);
    setRecurringBills(freshRecurringBills);
    setVendorCredits(freshVendorCredits);
    setPaymentsMade(freshPaymentsMade);
    setRecurringExpenses(freshRecurringExpenses);

    const dataToSave = {
      settings: initialSettings,
      accounts: freshAccounts,
      clients: freshClients,
      salespersons: freshSalespersons,
      vendors: freshVendors,
      projects: freshProjects,
      timeEntries: freshTimeEntries,
      invoices: freshInvoices,
      estimates: freshEstimates,
      expenses: freshExpenses,
      journalEntries: freshJournalEntries,
      salesOrders: freshSalesOrders,
      deliveryChallans: freshDeliveryChallans,
      creditNotes: freshCreditNotes,
      paymentsReceived: freshPaymentsReceived,
      recurringInvoices: freshRecurringInvoices,
      purchaseOrders: freshPurchaseOrders,
      bills: freshBills,
      recurringBills: freshRecurringBills,
      vendorCredits: freshVendorCredits,
      paymentsMade: freshPaymentsMade,
      recurringExpenses: freshRecurringExpenses,
    };
    localStorage.setItem(ORG_DATA_PREFIX + currentOrgId, JSON.stringify(dataToSave));
  };

  const resetToDemoData = () => {
    loadSampleData();
  };

  const exportDataJSON = () => {
    const data = {
      settings,
      accounts,
      clients,
      vendors,
      projects,
      timeEntries,
      invoices,
      estimates,
      expenses,
      journalEntries,
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
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `firmbooks_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importDataJSON = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed.settings) setSettings(parsed.settings);
      if (parsed.accounts) setAccounts(parsed.accounts);
      if (parsed.clients) setClients(parsed.clients);
      if (parsed.vendors) setVendors(parsed.vendors);
      if (parsed.projects) setProjects(parsed.projects);
      if (parsed.timeEntries) setTimeEntries(parsed.timeEntries);
      if (parsed.invoices) setInvoices(parsed.invoices);
      if (parsed.estimates) setEstimates(parsed.estimates);
      if (parsed.expenses) setExpenses(parsed.expenses);
      if (parsed.journalEntries) setJournalEntries(parsed.journalEntries);
      if (parsed.salesOrders) setSalesOrders(parsed.salesOrders);
      if (parsed.deliveryChallans) setDeliveryChallans(parsed.deliveryChallans);
      if (parsed.creditNotes) setCreditNotes(parsed.creditNotes);
      if (parsed.paymentsReceived) setPaymentsReceived(parsed.paymentsReceived);
      if (parsed.recurringInvoices) setRecurringInvoices(parsed.recurringInvoices);
      if (parsed.purchaseOrders) setPurchaseOrders(parsed.purchaseOrders);
      if (parsed.bills) setBills(parsed.bills);
      if (parsed.recurringBills) setRecurringBills(parsed.recurringBills);
      if (parsed.vendorCredits) setVendorCredits(parsed.vendorCredits);
      if (parsed.paymentsMade) setPaymentsMade(parsed.paymentsMade);
      if (parsed.recurringExpenses) setRecurringExpenses(parsed.recurringExpenses);
      return true;
    } catch (e) {
      console.error('Invalid JSON import:', e);
      return false;
    }
  };

  const contextValue = useMemo(
    () => ({
      organizations,
      currentOrg,
      switchOrganization,
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
      recordPayment,
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
