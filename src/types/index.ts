/**
 * FirmBooks - Core Data Models & TypeScript Definitions
 */

export * from './banking';

export type NavigationTab =
  | 'dashboard'
  | 'banking'
  | 'bank_reconciliation'
  | 'projects'
  | 'clients'
  | 'salespersons'
  | 'invoices'
  | 'estimates'
  | 'expenses'
  | 'accounting'
  | 'journals'
  | 'bulk_updates'
  | 'coa'
  | 'transaction_locking'
  | 'fixed_assets'
  | 'period_close'
  | 'gst_compliance'
  | 'team_access'
  | 'recovery_center'
  | 'reports'
  | 'settings'
  // Sales specific sub-tabs
  | 'sales_overview'
  | 'sales_orders'
  | 'recurring_invoices'
  | 'delivery_challans'
  | 'payments_received'
  | 'credit_notes'
  // Purchases specific sub-tabs
  | 'purchases_overview'
  | 'vendors'
  | 'recurring_expenses'
  | 'purchase_orders'
  | 'bills'
  | 'recurring_bills'
  | 'payments_made'
  | 'vendor_credits'
  // Section overview tabs
  | 'projects_overview'
  | 'banking_overview'
  | 'accounting_overview'
  | 'reports_overview'
  | 'settings_overview';

export type AccountType =
  | 'Asset'
  | 'Liability'
  | 'Equity'
  | 'Income'
  | 'Revenue'
  | 'Cost of Goods Sold'
  | 'Expense'
  | 'Other Income'
  | 'Other Expense';

export type AccountSubType =
  // Assets
  | 'Bank'
  | 'Cash'
  | 'Digital Wallet'
  | 'Undeposited Funds'
  | 'Accounts Receivable'
  | 'Inventory'
  | 'Fixed Assets'
  | 'Other Current Assets'
  | 'Other Assets'
  | 'Cash & Bank'
  | 'Current Asset'
  | 'Fixed Asset'
  // Liabilities
  | 'Accounts Payable'
  | 'Credit Cards'
  | 'Taxes Payable'
  | 'Payroll Liabilities'
  | 'Loans'
  | 'Loan/Credit'
  | 'Other Liabilities'
  | 'Current Liability'
  | 'Long Term Liability'
  // Equity
  | 'Capital'
  | 'Retained Earnings'
  | 'Drawings'
  | 'Other Equity'
  | 'Equity'
  // Income / Revenue
  | 'Sales'
  | 'Services'
  | 'Other Operating Income'
  | 'Operating Revenue'
  | 'Other Revenue'
  // Cost of Goods Sold
  | 'Materials'
  | 'Direct Labor'
  | 'Subcontractors'
  | 'Other Direct Costs'
  | 'Direct Expense / Cost of Goods'
  // Expenses
  | 'Payroll'
  | 'Office & Administrative'
  | 'Sales & Marketing'
  | 'Travel & Vehicle'
  | 'Utilities & Communication'
  | 'Professional Services'
  | 'Software & Subscriptions'
  | 'Repairs & Maintenance'
  | 'Financial Expenses'
  | 'Depreciation & Amortization'
  | 'Miscellaneous Expenses'
  | 'Operating Expense'
  | 'Tax Expense'
  // Other Income
  | 'Interest Income'
  | 'Asset Gains'
  | 'Other Income'
  // Other Expenses
  | 'Interest Expense'
  | 'Asset Losses'
  | 'Other Expenses';

export interface Account {
  id: string;
  organizationId?: string;
  code: string;
  name: string;
  type: AccountType;
  subType: AccountSubType;
  description?: string;
  balance: number; // Positive balance
  isSystemAccount?: boolean;
  parentId?: string;
  parentAccountId?: string | null;
  parentName?: string;
  subCategory?: string; // Sub-category group (e.g. "Ply", "Laminates", "Hardware")
  isParent?: boolean; // True if account acts as a parent category header
  isLocked?: boolean;
  lockedBy?: string;
  lockedAt?: string;
  lockedReason?: string;
  lockedRegion?: string;
  reportingGroup?: string;
  normalBalance?: 'Debit' | 'Credit';
  allowDirectPosting?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  status?: 'Active' | 'Inactive' | 'Archived';
  bankName?: string;
  accountNumber?: string;
}

export interface PeriodLock {
  id: string;
  organizationId?: string;
  lockDate: string; // YYYY-MM-DD
  region: string; // e.g. "North America / Global", "APAC / India", "EMEA"
  lockedBy: string; // Name & Role
  lockedByEmail?: string;
  lockedAt: string; // ISO string
  reason: string;
  status: 'Active' | 'Archived';
  affectedAccountsCount?: number;
}

export interface Salesperson {
  id: string;
  organizationId?: string;
  name: string;
  code: string;
  email: string;
  phone: string;
  commissionRate: number; // e.g. 5 for 5%
  status: 'Active' | 'Inactive';
  region?: string;
  notes?: string;
  createdAt: string;
}

export interface Client {
  id: string;
  organizationId?: string;
  name: string;
  companyName: string;
  email: string;
  phone: string;
  billingAddress: string;
  taxId?: string;
  currency: string;
  paymentTerms: string; // e.g., "Net 30", "Due on Receipt"
  notes?: string;
  createdAt: string;
}

export interface Vendor {
  id: string;
  organizationId?: string;
  name: string;
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  taxId?: string;
  category?: string;
  paymentTerms?: string;
  address?: string;
  payablesBalance?: number;
  status?: string;
}

export type ProjectStatus = 'Active' | 'On Hold' | 'Completed' | 'Cancelled';
export type ProjectBudgetType = 'Fixed Cost' | 'Time & Materials' | 'Task Hours';

export interface Project {
  id: string;
  organizationId?: string;
  code: string; // e.g. PRJ-101
  name: string;
  clientId: string;
  clientName: string;
  description: string;
  status: ProjectStatus;
  budgetType: ProjectBudgetType;
  totalBudget: number; // Financial or Hours budget
  hourlyRate: number; // Default billing rate
  startDate: string;
  endDate?: string;
  manager: string;
  createdAt: string;
}

export interface TimeEntry {
  id: string;
  organizationId?: string;
  projectId: string;
  projectName: string;
  clientName: string;
  staffName: string;
  taskName: string;
  date: string;
  hours: number;
  hourlyRate: number;
  isBillable: boolean;
  isBilled: boolean;
  invoiceId?: string;
  description: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  accountId: string;
  quantity: number;
  unitPrice: number;
  taxRate: number; // percentage e.g. 10
  amount: number;
  timeEntryId?: string; // Optional linked billable time
}

export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Void';

export interface InvoiceEditHistory {
  id: string;
  editedAt: string;
  editedBy?: string;
  reason: string;
  previousTotal: number;
  newTotal: number;
  changesSummary?: string;
}

export interface Invoice {
  id: string;
  organizationId?: string;
  invoiceNumber: string; // e.g. INV-2026-001
  clientId: string;
  clientName: string;
  clientEmail: string;
  salespersonId?: string;
  salespersonName?: string;
  projectId?: string;
  projectName?: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxTotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  status: InvoiceStatus;
  notes?: string;
  terms?: string;
  createdAt: string;
  editHistory?: InvoiceEditHistory[];
}

export type EstimateStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined' | 'Converted';

export interface Estimate {
  id: string;
  organizationId?: string;
  estimateNumber: string; // e.g. EST-2026-001
  clientId: string;
  clientName: string;
  salespersonId?: string;
  salespersonName?: string;
  projectId?: string;
  issueDate: string;
  expiryDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  status: EstimateStatus;
  notes?: string;
  createdAt: string;
}

export interface ExpenseItem {
  id: string;
  description: string;
  accountId: string;
  accountName: string;
  amount: number;
}

export interface Expense {
  id: string;
  organizationId?: string;
  referenceNumber: string; // e.g. EXP-2026-042
  invoiceNumber?: string; // Vendor Invoice #
  vendorId?: string;
  vendorName?: string;
  accountId: string; // Expense Category Account
  accountName: string;
  paidFromAccountId: string; // e.g. Cash / Bank Account
  paidFromAccountName?: string;
  projectId?: string; // Tagged Project for project bookkeeping
  projectName?: string;
  clientId?: string;
  clientName?: string;
  date: string;
  currency?: string;
  amount: number;
  taxAmount: number;
  isItemized?: boolean;
  items?: ExpenseItem[];
  isBillable: boolean;
  isBilled?: boolean;
  paymentStatus: 'Paid' | 'Unpaid';
  status?: 'POSTED' | 'VOIDED';
  description: string;
  notes?: string;
  receiptFileName?: string;
  createdAt: string;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface JournalEntry {
  id: string;
  organizationId?: string;
  entryNumber: string; // e.g. JRN-2026-001
  date: string;
  reference: string;
  description: string;
  projectId?: string;
  lines: JournalLine[];
  status: 'Posted' | 'Draft';
  createdAt: string;
}

export interface LocationSetting {
  id: string;
  name: string;
  code: string;
  address: string;
  isDefault: boolean;
}

export interface UserSetting {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'Active' | 'Inactive';
  lastActive: string;
}

export interface RoleSetting {
  id: string;
  name: string;
  description: string;
  permissionsCount: number;
}

export interface TaxRateSetting {
  id: string;
  name: string;
  rate: number;
  code: string;
  isCompound: boolean;
}

export interface CurrencySetting {
  code: string;
  symbol: string;
  name: string;
  rate: number;
  autoUpdate: boolean;
  isDefault?: boolean;
}

export interface PaymentTermSetting {
  id: string;
  name: string;
  days: number;
  isDefault: boolean;
}

export interface ReminderSetting {
  id: string;
  name: string;
  daysBeforeOrAfter: number;
  type: 'before' | 'after';
  enabled: boolean;
  subject: string;
}

export interface WorkflowRuleSetting {
  id: string;
  name: string;
  module: string;
  trigger: string;
  action: string;
  status: 'Active' | 'Inactive';
  description?: string;
  field?: string;
  operator?: string;
  value?: string;
  recipient?: string;
  lastTestedAt?: string;
  testStatus?: 'Passed' | 'Failed' | 'Untested';
  testLog?: string;
}

export interface WorkflowLogSetting {
  id: string;
  ruleName: string;
  triggerTime: string;
  status: 'Success' | 'Failed';
  details: string;
  module?: string;
  payloadSample?: string;
  durationMs?: number;
}

export interface ReportingTagSetting {
  id: string;
  category: string;
  name: string;
}

export interface WebTabSetting {
  id: string;
  title: string;
  url: string;
}

export interface OrgAdditionalField {
  id: string;
  label: string;
  value: string;
}

export interface OrgProfileDetails {
  logoUrl?: string;
  logoFileName?: string;
  organizationName: string;
  industry: string;
  locationCountry: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  faxNumber: string;
  websiteUrl: string;
  hasDifferentPaymentStubAddress: boolean;
  paymentStubAddress?: {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };
  primaryContactName: string;
  primaryContactEmail: string;
  emailsSentThrough: string;
  baseCurrency: string;
  fiscalYear: string;
  reportBasis: 'Accrual' | 'Cash';
  organizationLanguage: string;
  communicationLanguages: string[];
  timeZone: string;
  dateFormat: string;
  companyId: string;
  addressFormat: string;
  additionalFields: OrgAdditionalField[];
}

export interface FirmSettings {
  firmName: string;
  firmEmail: string;
  firmPhone: string;
  firmAddress: string;
  taxId: string;
  currencySymbol: string;
  currencyCode: string; // e.g. USD, EUR, INR, GBP
  onlyDefaultCurrency?: boolean;
  defaultTaxRate: number;
  fiscalYearStart: string; // e.g. "January"
  logoText: string;

  orgProfileDetails?: OrgProfileDetails;

  // Extended settings
  branding?: {
    primaryColor: string;
    watermarkText: string;
    headerLayout: string;
    logoUrl?: string;
  };
  customDomain?: {
    domainName: string;
    sslActive: boolean;
    cnameVerified: boolean;
  };
  locations?: LocationSetting[];
  aiIntegration?: {
    enabled: boolean;
    smartOcr: boolean;
    autoCategorize: boolean;
    apiKey: string;
  };
  subscription?: {
    plan: string;
    billingCycle: string;
    invoicesUsed: number;
    invoicesLimit: number;
    usersUsed: number;
    usersLimit: number;
  };
  users?: UserSetting[];
  roles?: RoleSetting[];
  userPreferences?: {
    theme: 'Light' | 'Dark' | 'System';
    language: string;
    dateFormat: string;
    timezone: string;
    currencyFormat: string;
  };
  taxRates?: TaxRateSetting[];
  directTaxes?: {
    tdsEnabled: boolean;
    panNumber: string;
    tanNumber: string;
    defaultTdsRate: number;
  };
  msme?: {
    isRegistered: boolean;
    udyamNumber: string;
    category: 'Micro' | 'Small' | 'Medium';
    alert45Days: boolean;
  };
  generalConfig?: {
    defaultBankAccountId: string;
    baseCurrency: string;
    rounding: string;
  };
  currencies?: CurrencySetting[];
  paymentTerms?: PaymentTermSetting[];
  openingBalancesLocked?: boolean;
  reminders?: ReminderSetting[];
  customerPortal?: {
    enabled: boolean;
    allowPayOnline: boolean;
    allowAcceptEstimate: boolean;
    domain: string;
  };
  vendorPortal?: {
    enabled: boolean;
    allowUploadBills: boolean;
    allowAcceptPO: boolean;
  };
  numberSeries?: {
    invoicePrefix: string;
    invoiceNext: number;
    billPrefix: string;
    billNext: number;
    estimatePrefix: string;
    estimateNext: number;
    creditNotePrefix: string;
    creditNoteNext: number;
  };
  pdfTemplate?: {
    style: 'Modern' | 'Classic' | 'Minimalist' | 'Elegance' | 'Bold';
    primaryColor: string;
    secondaryColor?: string;
    fontFamily?: 'sans' | 'serif' | 'mono';
    fontSize?: 'Small' | 'Medium' | 'Large';
    paperSize?: 'A4' | 'Letter' | 'Legal';
    headerTitle?: string;
    logoPosition?: 'left' | 'center' | 'right';
    footerTerms: string;
    showLogo: boolean;
    showTaxId?: boolean;
    showTaxBreakdown?: boolean;
    showPaymentDetails?: boolean;
    showQrCode?: boolean;
    showSignatureBlock?: boolean;
  };
  emailNotifications?: {
    invoiceSentSubject: string;
    invoiceSentBody: string;
    paymentReceiptSubject: string;
    paymentReceiptBody: string;
  };
  smsNotifications?: {
    enabled: boolean;
    gatewayKey: string;
    senderId: string;
    autoSmsOnPayment: boolean;
  };
  reportingTags?: ReportingTagSetting[];
  webTabs?: WebTabSetting[];
  digitalSignature?: {
    enabled: boolean;
    signerName: string;
    designation: string;
    signatureText: string;
  };
  workflowRules?: WorkflowRuleSetting[];
  workflowLogs?: WorkflowLogSetting[];
  customersVendorsSettings?: {
    defaultPaymentTerms: string;
    creditLimitWarning: number;
    duplicateCheck: boolean;
  };
  itemsSettings?: {
    enableSku: boolean;
    valuationMethod: 'FIFO' | 'Weighted Average';
    lowStockAlert: number;
  };
  accountantSettings?: {
    lockBooksDate: string;
    strictCoaMode: boolean;
  };
  projectsSettings?: {
    roundingMinutes: number;
    defaultHourlyRate: number;
  };
  timesheetSettings?: {
    requireApproval: boolean;
    maxDailyHours: number;
  };
  paymentGateways?: {
    stripeKey: string;
    stripeEnabled: boolean;
    paypalEmail: string;
    paypalEnabled: boolean;
    razorpayKey: string;
    razorpayEnabled: boolean;
  };
  vendorPayouts?: {
    achEnabled: boolean;
    wiseEnabled: boolean;
    autoBatchPayout: boolean;
  };
  quotesSettings?: {
    autoConvertOnAccept: boolean;
    expiryDays: number;
    termsNotice: string;
  };
  salesOrdersSettings?: {
    enableSO: boolean;
    reserveStock: boolean;
  };
  deliveryChallansSettings?: {
    dispatchWarehouse: string;
    requireVehicleNo: boolean;
  };
  invoicesSettings?: {
    defaultDueDays: number;
    lateFeePercent: number;
    autoAttachPdf: boolean;
  };
  recurringInvoicesSettings?: {
    scheduleTime: string;
    maxRetryCard: number;
  };
  paymentsReceivedSettings?: {
    autoApplyOldest: boolean;
    matchTolerance: number;
  };
  creditNotesSettings?: {
    autoApplyFutureInvoices: boolean;
  };
  expensesSettings?: {
    approvalThreshold: number;
    requireReceipt: boolean;
  };
  purchaseOrdersSettings?: {
    requirePOAbove: number;
    autoCloseMatched: boolean;
  };
  billsSettings?: {
    defaultDueDays: number;
    detectDuplicateBill: boolean;
  };
  paymentsMadeSettings?: {
    batchThreshold: number;
    sendPaymentAdvice: boolean;
  };
  vendorCreditsSettings?: {
    autoApplyFutureBills: boolean;
  };
}

export interface ProjectFinancialSummary {
  projectId: string;
  totalInvoiced: number;
  totalCollected: number;
  directExpenses: number;
  unbilledHoursAmount: number;
  totalLoggedHours: number;
  netProfit: number;
  profitMarginPercent: number;
  budgetUsedPercent: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  clientName: string;
  orderDate: string;
  expectedDeliveryDate: string;
  totalAmount: number;
  status: 'Confirmed' | 'In Production' | 'Shipped' | 'Invoiced' | 'Cancelled';
  notes: string;
}

export interface DeliveryChallan {
  id: string;
  challanNumber: string;
  clientName: string;
  dispatchDate: string;
  deliveryAddress: string;
  itemsSummary: string;
  status: 'Delivered' | 'In Transit' | 'Draft';
}

export interface CreditNote {
  id: string;
  cnNumber: string;
  clientName: string;
  originalInvoiceNumber: string;
  issueDate: string;
  totalAmount: number;
  remainingAmount: number;
  status: 'Open' | 'Closed' | 'Refunded';
  reason: string;
}

export interface PaymentReceipt {
  id: string;
  paymentNumber: string;
  clientName: string;
  invoiceNumber: string;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string;
  amount: number;
  status?: 'ALLOCATED' | 'PARTIALLY_ALLOCATED' | 'REVERSED';
}

export interface RecurringInvoiceProfile {
  id: string;
  profileName: string;
  clientName: string;
  frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  amount: number;
  nextRunDate: string;
  status: 'Active' | 'Paused' | 'Completed';
  autoSend: boolean;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorName: string;
  orderDate: string;
  expectedDate: string;
  totalAmount: number;
  status: 'Issued' | 'Pending Receipt' | 'Billed' | 'Cancelled';
  notes: string;
}

export interface Bill {
  id: string;
  billNumber: string;
  vendorName: string;
  billDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue?: number;
  status: 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue' | 'VOIDED';
  notes: string;
}

export interface RecurringBill {
  id: string;
  profileName: string;
  vendorName: string;
  frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  amount: number;
  nextBillDate: string;
  status: 'Active' | 'Paused';
}

export interface VendorCredit {
  id: string;
  creditNoteNumber: string;
  vendorName: string;
  billNumber: string;
  issueDate: string;
  creditAmount: number;
  remainingAmount: number;
  status: 'Open' | 'Partially Applied' | 'Fully Applied' | 'Refunded';
  notes: string;
}

export interface PaymentMade {
  id: string;
  paymentNumber: string;
  vendorName: string;
  billNumber: string;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string;
  amount: number;
}

export interface RecurringExpense {
  id: string;
  profileName: string;
  vendorName: string;
  category: string;
  frequency: 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  amount: number;
  nextRunDate: string;
  status: 'Active' | 'Paused';
}

export interface UserIdentity {
  userId: string; // e.g. "USR-8F2KJ91M"
  uuid: string; // e.g. "018fba18-c290-7d12-9900-112233445566"
  email: string; // Unique across platform
  fullName: string;
  avatarUrl?: string;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  mfaType?: 'Authenticator App' | 'Email OTP' | 'Passkey';
  createdAt: string;
  status: 'Active' | 'Locked' | 'Suspended';
}

export interface UserSession {
  id: string;
  userId: string;
  device: string;
  browser: string;
  ipAddress: string;
  location: string;
  lastActive: string;
  createdAt: string;
  isCurrentSession: boolean;
  expiresAt: string;
}

export interface Membership {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  orgUuid: string;
  publicOrgId: string;
  orgName?: string;
  role: 'Owner' | 'Admin' | 'Manager' | 'Accountant' | 'Sales' | 'Viewer' | string;
  status: 'Active' | 'Pending' | 'Suspended';
  joinedDate?: string;
  joinedAt?: string;
  lastActive?: string;
  invitedByEmail?: string;
  invitedAt?: string;
}

export type PermissionKey =
  | 'invoice.create'
  | 'invoice.edit'
  | 'invoice.delete'
  | 'bank.reconcile'
  | 'project.manage'
  | 'settings.manage'
  | 'reports.view'
  | 'org.manage'
  | 'members.manage'
  | 'audit.view'
  | 'payroll.manage'
  | 'accounting.post'
  | 'expenses.approve';

export interface RolePermissionDefinition {
  id: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
  isCustom?: boolean;
  permissionsCount?: number;
}

export interface OrgInvitation {
  id: string;
  orgUuid: string;
  publicOrgId: string;
  orgName: string;
  email: string;
  role: string;
  token: string;
  invitedByUserId: string;
  invitedByEmail: string;
  invitedAt: string;
  expiresAt: string;
  status: 'Pending' | 'Accepted' | 'Declined' | 'Expired';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string;
  orgUuid: string;
  publicOrgId: string;
  orgName: string;
  action: string;
  targetResource: string;
  ipAddress: string;
  device: string;
  severity: 'Info' | 'Warning' | 'Critical';
}

export interface OrganizationMeta {
  id: string; // Internal Storage ID
  uuid: string; // Internal UUIDv7 e.g. "018fba0f-a012-7b89-8811-001122334455"
  publicOrgId: string; // Public Organization ID e.g. "ORG-8D4K-TQ71-LM28"
  orgCode: string; // Legacy org code string
  name: string;
  ownerUserId: string; // Reference to UserIdentity.userId
  subscription?: 'Enterprise' | 'Growth' | 'Starter';
  timezone: string;
  status: 'Active' | 'Suspended';
  industry?: string;
  country?: string;
  baseCurrency: string;
  currencySymbol: string;
  createdDate: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  taxId?: string;
  isPrimary?: boolean;
  logoUrl?: string;
  enforceMfaForOwner?: boolean;
}

export interface CreateOrganizationInput {
  name: string;
  orgCode?: string;
  industry?: string;
  country?: string;
  timezone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  website?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  baseCurrency?: string;
  currencySymbol?: string;
  fiscalYearStart?: string;
  reportBasis?: 'Accrual' | 'Cash';
  taxId?: string;
  includeSampleData?: boolean;
}

export type SearchCategory =
  | 'Invoice'
  | 'Quotation'
  | 'Sales Order'
  | 'Customer'
  | 'Vendor'
  | 'Vendor Bill'
  | 'Purchase Order'
  | 'Payment Received'
  | 'Payment Made'
  | 'Bank Transaction'
  | 'Account'
  | 'Credit Note'
  | 'Vendor Credit';

export interface SearchResultItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
  date?: string;
  linkRoute: string;
}
