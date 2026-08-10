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
  JournalEntry,
  OrganizationMeta,
  PaymentMade,
  PaymentReceipt,
  PeriodLock,
  Project,
  PurchaseOrder,
  RecurringBill,
  RecurringExpense,
  RecurringInvoiceProfile,
  SalesOrder,
  Salesperson,
  TimeEntry,
  Vendor,
  VendorCredit,
} from '../../types';
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
} from '../../services/seedData';

export const ORGS_LIST_KEY = 'firmbooks_orgs_list_v2';
export const ACTIVE_ORG_ID_KEY = 'firmbooks_active_org_id_v2';
export const ORG_DATA_PREFIX = 'firmbooks_org_data_';
export const LEGACY_STORAGE_KEY = 'firmbooks_clean_v1';

export const generateUuidV7 = (): string => {
  const now = Date.now().toString(16).padStart(12, '0');
  const rand = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${now.slice(0, 8)}-${now.slice(8, 12)}-7${rand.slice(0, 3)}-a${rand.slice(3, 6)}-${rand.slice(6, 18)}`;
};

export const generatePublicOrgId = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const chunk = (len: number) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `ORG-${chunk(4)}-${chunk(4)}-${chunk(4)}`;
};

export const getCurrencySymbol = (code: string): string => {
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

export const defaultOrgMeta: OrganizationMeta = {
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

export const createDefaultSettingsForOrg = (org: OrganizationMeta): FirmSettings => {
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

export const loadOrgData = (orgId: string, orgMeta?: OrganizationMeta) => {
  const isDefault = orgId === defaultOrgMeta.id;
  try {
    const storageKey = ORG_DATA_PREFIX + orgId;
    let raw = localStorage.getItem(storageKey);

    // Migration fallback from legacy key for default org
    if (!raw && isDefault) {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacyRaw) {
        raw = legacyRaw;
        localStorage.setItem(storageKey, legacyRaw);
      }
    }

    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        settings: parsed.settings || (orgMeta ? createDefaultSettingsForOrg(orgMeta) : initialSettings),
        accounts: parsed.accounts || cleanInitialAccounts,
        clients: parsed.clients || [],
        salespersons: parsed.salespersons || [],
        vendors: parsed.vendors || [],
        projects: parsed.projects || [],
        timeEntries: parsed.timeEntries || [],
        invoices: parsed.invoices || [],
        estimates: parsed.estimates || [],
        expenses: parsed.expenses || [],
        journalEntries: parsed.journalEntries || [],
        periodLocks: parsed.periodLocks || [],
        salesOrders: parsed.salesOrders || [],
        deliveryChallans: parsed.deliveryChallans || [],
        creditNotes: parsed.creditNotes || [],
        paymentsReceived: parsed.paymentsReceived || [],
        recurringInvoices: parsed.recurringInvoices || [],
        purchaseOrders: parsed.purchaseOrders || [],
        bills: parsed.bills || [],
        recurringBills: parsed.recurringBills || [],
        vendorCredits: parsed.vendorCredits || [],
        paymentsMade: parsed.paymentsMade || [],
        recurringExpenses: parsed.recurringExpenses || [],
      };
    }
  } catch (e) {
    console.error(`Failed to load data for org ${orgId}:`, e);
  }

  // Seed default for default org, or pristine empty for new orgs
  if (isDefault) {
    return {
      settings: initialSettings,
      accounts: initialAccounts,
      clients: initialClients,
      salespersons: initialSalespersons,
      vendors: initialVendors,
      projects: initialProjects,
      timeEntries: initialTimeEntries,
      invoices: initialInvoices,
      estimates: initialEstimates,
      expenses: initialExpenses,
      journalEntries: initialJournalEntries,
      periodLocks: [],
      salesOrders: initialSalesOrders,
      deliveryChallans: initialDeliveryChallans,
      creditNotes: initialCreditNotes,
      paymentsReceived: initialPaymentsReceived,
      recurringInvoices: initialRecurringInvoices,
      purchaseOrders: initialPurchaseOrders,
      bills: initialBills,
      recurringBills: initialRecurringBills,
      vendorCredits: initialVendorCredits,
      paymentsMade: initialPaymentsMade,
      recurringExpenses: initialRecurringExpenses,
    };
  }

  const fallbackOrg = orgMeta || defaultOrgMeta;
  return {
    settings: createDefaultSettingsForOrg(fallbackOrg),
    accounts: cleanInitialAccounts,
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

export const saveOrgData = (orgId: string, data: any) => {
  try {
    localStorage.setItem(ORG_DATA_PREFIX + orgId, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to persist data for org ${orgId}:`, e);
  }
};
