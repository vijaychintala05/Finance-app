import { Response } from 'express';
import { createHash } from 'node:crypto';
import { RbacService } from '../auth/RbacService';
import { db, type DbQueryClient } from '../database/db';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import { StaticMetadataCache } from '../cache/StaticMetadataCache';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { AccountingService } from '../../../src/services/accountingService';
import { SalesService } from '../../../src/services/salesService';
import { PurchasesService } from '../../../src/services/purchasesService';
import { SalesEngine } from '../sales/SalesEngine';
import { QuotationEngine } from '../sales/QuotationEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { LedgerQueryService } from '../services/LedgerQueryService';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { CashFlowStatementService } from '../services/CashFlowStatementService';
import { CustomerStatementService } from '../services/CustomerStatementService';
import { VendorStatementService } from '../services/VendorStatementService';
import { ARAgingReportService } from '../services/ARAgingReportService';
import { APAgingReportService } from '../services/APAgingReportService';
import { ManualJournalService } from '../services/ManualJournalService';
import { RecurringJournalService } from '../services/RecurringJournalService';
import { BudgetService } from '../services/BudgetService';
import { CashFlowForecastService } from '../services/CashFlowForecastService';
import { ProjectReportingService } from '../services/ProjectReportingService';
import { FixedAssetService } from '../services/FixedAssetService';
import { PeriodCloseService } from '../services/PeriodCloseService';
import { SavedReportService } from '../services/SavedReportService';
import { AccountantOverviewService } from '../services/AccountantOverviewService';
import { PeriodLock } from '../../../src/types';
import { newId } from '../utils/ids';
import { OrganizationProvisioningService, SYSTEM_ACCOUNT_ROLE_TYPES, type SystemAccountRole } from '../services/OrganizationProvisioningService';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { isIsoCalendarDate } from '../utils/date';
import { ExpensePostingService } from '../services/ExpensePostingService';
import { FinancialCommandService } from '../accounting/FinancialCommandService';
import { toFinancialCommandError } from '../accounting/FinancialCommandError';
import { ExpenseReceiptService } from '../services/ExpenseReceiptService';
import { ExpensePdfService } from '../services/ExpensePdfService';
import { DocumentPdfService } from '../services/DocumentPdfService';
import { DocumentPdfArtifactService } from '../services/DocumentPdfArtifactService';
import { DocumentTemplateService } from '../services/DocumentTemplateService';
import { GSTComplianceService } from '../services/GSTComplianceService';
import { DrillDownService } from '../services/DrillDownService';
import { ReportExportService } from '../services/ReportExportService';
import { ReportWorkspaceService, type WorkspaceReportFilter } from '../services/ReportWorkspaceService';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { TreasuryTransactionService } from '../services/TreasuryTransactionService';
import { EmployeeReimbursementService } from '../services/EmployeeReimbursementService';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { VendorRecordsService } from '../purchases/VendorRecordsService';
import { MfaService } from '../auth/MfaService';
import { AccountUsageImpactService } from '../accounting/AccountUsageImpactService';

function parseVendorJson(value: unknown, fallback: unknown): unknown {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function vendorResponse(row: any): Record<string, unknown> {
  const primaryContact = (parseVendorJson(row.primary_contact, {}) || {}) as Record<string, unknown>;
  let bankDetails: Record<string, string> | null = null;
  if (row.bank_details_encrypted) {
    try { bankDetails = JSON.parse(MfaService.decryptSecret(row.bank_details_encrypted)); } catch { bankDetails = null; }
  }
  const accountNumber = typeof bankDetails?.accountNumber === 'string' ? bankDetails.accountNumber.replace(/\s/g, '') : '';
  return {
    id: row.id,
    organizationId: row.organization_id,
    vendorId: row.vendor_id || '',
    name: row.name,
    legalName: row.legal_name || '',
    companyName: row.company_name || '',
    vendorType: row.vendor_type || 'Business',
    gstStatus: row.gst_status || 'Unregistered',
    gstin: row.gstin || '',
    pan: row.pan || '',
    placeOfSupply: row.place_of_supply || '',
    primaryContact,
    additionalContacts: parseVendorJson(row.additional_contacts, []) || [],
    contactPerson: typeof primaryContact.name === 'string' ? primaryContact.name : '',
    email: row.email || '',
    phone: row.phone || '',
    mobile: row.mobile || '',
    website: row.website || '',
    taxId: row.tax_id || row.gstin || '',
    billingAddress: parseVendorJson(row.billing_address, ''),
    shippingAddress: parseVendorJson(row.shipping_address, ''),
    paymentTerms: row.payment_terms || 'Net 30',
    currency: row.currency || '',
    defaultExpenseAccountId: row.default_expense_account_id || '',
    bankDetails: bankDetails ? {
      bankName: bankDetails.bankName || '', accountName: bankDetails.accountName || '',
      maskedAccountNumber: accountNumber ? `•••• ${accountNumber.slice(-4)}` : '',
      accountNumberLast4: accountNumber.slice(-4), ifsc: bankDetails.ifsc || '',
      swiftCode: bankDetails.swiftCode || '', branch: bankDetails.branch || '', accountType: bankDetails.accountType || '',
    } : undefined,
    customFields: parseVendorJson(row.custom_fields, {}) || {},
    notes: row.notes || '',
    payablesBalance: Number(row.calculated_payables ?? row.payables_balance ?? 0),
    unusedCredits: Number(row.calculated_credits ?? row.unused_credits ?? 0),
    advanceBalance: Number(row.calculated_advances ?? row.advance_balance ?? 0),
    active: row.active !== false,
    status: row.active === false ? 'Inactive' : 'Active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validVendorEmail(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (typeof value === 'string' && value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function boundedText(value: unknown, max: number): value is string {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= max);
}

function validVendorAddress(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.length <= 10000;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = new Set(['attention', 'street', 'street2', 'city', 'state', 'postalCode', 'country', 'phone']);
  return Object.entries(value).length <= allowed.size && Object.entries(value).every(([key, field]) =>
    allowed.has(key) && (field === undefined || field === null || (typeof field === 'string' && field.length <= 500))
  );
}

function validVendorCustomFields(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).length <= 50 && Object.entries(value).every(([key, field]) =>
    key.trim().length > 0 && key.length <= 80 &&
    (field === null || typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') &&
    (typeof field !== 'string' || field.length <= 500) && (typeof field !== 'number' || Number.isFinite(field))
  );
}

function validVendorContact(value: unknown, allowEmpty = false): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const contact = value as Record<string, unknown>;
  const limits: Record<string, number> = {
    salutation: 32, firstName: 120, lastName: 120, name: 255, email: 255,
    phoneCode: 8, phone: 50, mobileCode: 8, mobile: 50, designation: 120,
  };
  const validPhoneCode = (code: unknown) => code === undefined || code === null || code === '' || (typeof code === 'string' && /^\+\d{1,4}$/.test(code));
  return Object.keys(contact).every((key) => key in limits || key === 'isPrimary') &&
    (contact.isPrimary === undefined || typeof contact.isPrimary === 'boolean') &&
    Object.entries(limits).every(([key, max]) => boundedText(contact[key], max)) &&
    validPhoneCode(contact.phoneCode) && validPhoneCode(contact.mobileCode) &&
    validVendorEmail(contact.email) &&
    (allowEmpty || Boolean(String(contact.name || '').trim() || String(contact.firstName || '').trim()));
}

function normalizeVendorBankDetails(value: unknown): Record<string, string> | null {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Vendor bank details are invalid');
  const input = value as Record<string, unknown>;
  const fields: Array<[string, number]> = [
    ['bankName', 120], ['accountName', 120], ['accountNumber', 34], ['ifsc', 20], ['swiftCode', 11], ['branch', 120], ['accountType', 40],
  ];
  if (fields.some(([key, max]) => !boundedText(input[key], max))) throw new Error('Vendor bank details are invalid');
  const details = Object.fromEntries(fields.map(([key]) => [key, String(input[key] || '').trim()]).filter(([, text]) => text));
  if (!Object.keys(details).length) return null;
  if (!details.accountNumber || !/^[A-Za-z0-9 -]{4,34}$/.test(details.accountNumber)) {
    throw new Error('Enter a valid bank account number to save supplier bank details');
  }
  return details;
}

async function withCalculatedVendorBalances(
  organizationId: string,
  vendors: Array<Record<string, any>>,
  queryClient: DbQueryClient = db,
): Promise<Array<Record<string, any>>> {
  if (vendors.length === 0) return vendors;
  const [bills, credits, advances] = await Promise.all([
    queryClient.query(
      `SELECT vendor_id, COALESCE(SUM(balance_due), 0) AS total
         FROM bills
        WHERE organization_id = $1 AND vendor_id IS NOT NULL
          AND upper(COALESCE(status, '')) NOT IN ('DRAFT', 'SUBMITTED', 'VOIDED', 'CANCELLED', 'REVERSED')
        GROUP BY vendor_id`,
      [organizationId],
    ),
    queryClient.query(
      `SELECT vendor_id, COALESCE(SUM(remaining_credit), 0) AS total
         FROM vendor_credits
        WHERE organization_id = $1 AND vendor_id IS NOT NULL
          AND upper(COALESCE(status, '')) NOT IN ('VOIDED', 'REVERSED')
        GROUP BY vendor_id`,
      [organizationId],
    ),
    queryClient.query(
      `SELECT vendor_id, COALESCE(SUM(unapplied_amount), 0) AS total
         FROM vendor_advances
        WHERE organization_id = $1 AND vendor_id IS NOT NULL
          AND upper(COALESCE(status, '')) NOT IN ('VOIDED', 'REVERSED')
        GROUP BY vendor_id`,
      [organizationId],
    ),
  ]);
  const totalsByVendor = (rows: Array<Record<string, any>>) => new Map(rows.map((row) => [row.vendor_id, Number(row.total || 0)]));
  const payableTotals = totalsByVendor(bills.rows);
  const creditTotals = totalsByVendor(credits.rows);
  const advanceTotals = totalsByVendor(advances.rows);
  return vendors.map((vendor) => ({
    ...vendor,
    calculated_payables: payableTotals.get(vendor.id) ?? 0,
    calculated_credits: creditTotals.get(vendor.id) ?? 0,
    calculated_advances: advanceTotals.get(vendor.id) ?? 0,
  }));
}

export class FinanceController {
  private static employeeClaimErrorStatus(message: string): number {
    if (message.startsWith('CLAIM_NOT_FOUND') || message.startsWith('PAYMENT_NOT_FOUND')) return 404;
    if (
      message.startsWith('CLAIM_NOT_PAYABLE') ||
      message.startsWith('CLAIM_HAS_SETTLED_PAYMENTS') ||
      message.startsWith('PAYMENT_AMOUNT_EXCEEDS_REMAINING')
    ) return 400;
    return 422;
  }

  // --- AUDIT LOG UTILITY ---
  public static async logAudit(
    orgId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterState: any = null,
    queryClient: DbQueryClient = db,
    strict: boolean = false
  ): Promise<void> {
    if (strict || queryClient !== db) {
      await queryClient.query(
        'INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [newId('aud'), orgId, userId, action, entityType, entityId, JSON.stringify(afterState)]
      );
      return;
    }
    try {
      await queryClient.query(
        'INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [newId('aud'), orgId, userId, action, entityType, entityId, JSON.stringify(afterState)]
      );
    } catch (e) {
      console.error('Failed to log audit event:', e);
    }
  }

  // --- PERIOD LOCK UTILITY ---
  private static async checkPeriodLock(orgId: string, dateStr: string): Promise<boolean> {
    const lockRes = await db.query(
      "SELECT lock_date FROM period_locks WHERE organization_id = $1 AND status = 'Active'",
      [orgId]
    );

    const locks: PeriodLock[] = lockRes.rows.map((r) => ({
      id: 'l1',
      lockDate: r.lock_date,
      region: 'Global',
      lockedBy: 'Admin',
      lockedAt: '2026-01-01',
      reason: 'Accounting Period Lock',
      status: 'Active' as const,
    }));

    return AccountingService.isPeriodLocked(dateStr, locks);
  }

  // --- ACCOUNTS ---
  public static async getAccounts(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    // Posted journal lines are authoritative. The accounts.balance column is a
    // compatibility cache and can be stale after a legacy import or older release.
    const accounts = await db.transaction(async (client) => {
      const result = await client.query('SELECT * FROM accounts WHERE organization_id = $1 ORDER BY code ASC', [orgId]);
      if (result.rows.length === 0) return [];
      const ledgerBalances = await LedgerQueryService.getAccountBalances(
        orgId,
        { accountIds: result.rows.map((account: any) => account.id) },
        client
      );
      const balanceByAccountId = new Map(ledgerBalances.map((balance) => [balance.id, balance.netBalance]));
      return result.rows.map((account: any) => ({
        ...account,
        balance: Number(balanceByAccountId.get(account.id) ?? 0),
      }));
    }, { organizationId: orgId });
    res.json(accounts);
  }

  public static async getAccountUsageImpact(req: AuthenticatedRequest, res: Response): Promise<void> {
    const accountId = String(req.params.id || '').trim();
    if (!accountId) {
      res.status(400).json({ error: 'An account id is required' });
      return;
    }
    try {
      const impact = await AccountUsageImpactService.get(db, req.auth!.organizationId, accountId);
      if (!impact) {
        res.status(404).json({ error: 'Account does not exist in this organization' });
        return;
      }
      res.json(impact);
    } catch (_error) {
      // Never return partial counts as an authoritative green light.
      res.status(503).json({ error: 'Account reference coverage could not be verified. Archive or deletion safety is unknown.' });
    }
  }

  public static async getAccountingDefaults(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query(
      `SELECT d.system_role, a.*
         FROM accounting_defaults d
         JOIN accounts a ON a.organization_id = d.organization_id AND a.id = d.account_id
        WHERE d.organization_id = $1
        ORDER BY d.system_role ASC`,
      [req.auth!.organizationId]
    );
    res.json(result.rows);
  }

  public static async updateAccountingDefault(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const systemRole = String(req.params.systemRole || '') as SystemAccountRole;
    const accountId = typeof req.body.accountId === 'string' ? req.body.accountId.trim() : '';
    const expectedTypes = SYSTEM_ACCOUNT_ROLE_TYPES[systemRole];
    if (!expectedTypes || !accountId) {
      res.status(400).json({ error: 'A supported system role and accountId are required' });
      return;
    }

    try {
      const mapping = await db.transaction(async (client) => {
        const accountResult = await client.query(
          `SELECT id, code, name, type, sub_type, status, allow_direct_posting
             FROM accounts WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, accountId]
        );
        const account = accountResult.rows[0];
        if (!account) throw new Error('ACCOUNT_NOT_FOUND: Account does not belong to this organization');
        if (account.status !== 'Active') throw new Error('ACCOUNT_INACTIVE: Only active accounts can be defaults');
        if (!account.allow_direct_posting) throw new Error('ACCOUNT_GROUP: A group account cannot be a posting default');
        if (!expectedTypes.includes(account.type)) throw new Error(`ACCOUNT_TYPE: ${systemRole} requires ${expectedTypes.join(' or ')} account type`);

        const previous = await client.query(
          `SELECT account_id FROM accounting_defaults WHERE organization_id = $1 AND system_role = $2 FOR UPDATE`,
          [orgId, systemRole]
        );
        await client.query(
          `INSERT INTO accounting_defaults (organization_id, system_role, account_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, system_role) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = CURRENT_TIMESTAMP`,
          [orgId, systemRole, accountId]
        );
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
           VALUES ($1, $2, $3, 'ACCOUNTING_DEFAULT_UPDATED', 'AccountingDefault', $4, $5, $6)`,
          [newId('aud'), orgId, req.auth!.userId, systemRole,
            JSON.stringify({ systemRole, accountId: previous.rows[0]?.account_id || null }),
            JSON.stringify({ systemRole, accountId, accountCode: account.code, accountName: account.name })]
        );
        return { systemRole, accountId: account.id, accountCode: account.code, accountName: account.name, accountType: account.type, accountSubType: account.sub_type };
      });
      res.json(mapping);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Accounting default could not be updated';
      const statusCode = message.startsWith('ACCOUNT_NOT_FOUND') ? 404 : message.startsWith('ACCOUNT_USAGE_INCOMPLETE') ? 503 : 400;
      res.status(statusCode).json({ error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async createAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { code, name, type, subType, description } = req.body;
    if (typeof code !== 'string' || typeof name !== 'string' || typeof type !== 'string' || !code.trim() || !name.trim() || !type.trim()) {
      res.status(400).json({ error: 'code, name, and type are required' });
      return;
    }
    if (Number(req.body.balance || 0) !== 0) {
      res.status(400).json({ error: 'Opening balances must be entered through a balanced journal entry' });
      return;
    }
    const normalizedType = type.trim();
    const normalizedSubType = typeof subType === 'string' ? subType.trim() : '';
    const allowedSubTypes: Record<string, Set<string>> = {
      Asset: new Set(['Bank', 'Cash', 'Digital Wallet', 'Undeposited Funds', 'Payment Clearing', 'Accounts Receivable', 'Inventory', 'Fixed Assets', 'Accumulated Depreciation', 'Other Current Asset', 'Other Current Assets', 'Other Asset', 'Other Assets', 'Deferred Tax Asset', 'Cash & Bank', 'Current Asset', 'Fixed Asset']),
      Liability: new Set(['Accounts Payable', 'Credit Cards', 'Taxes Payable', 'Payroll Liabilities', 'Loans', 'Loan/Credit', 'Other Liability', 'Other Liabilities', 'Other Current Liability', 'Current Liability', 'Long Term Liability', 'Deferred Tax Liability']),
      Equity: new Set(['Capital', 'Retained Earnings', 'Drawings', 'Opening Balance Equity', 'Other Equity', 'Equity']),
      Income: new Set(['Sales', 'Services', 'Other Operating Income', 'Operating Revenue', 'Other Revenue', 'Interest Income', 'Asset Gains', 'Sales Returns', 'Other Income']),
      'Other Income': new Set(['Interest Income', 'Asset Gains', 'Other Income']),
      'Cost of Goods Sold': new Set(['Materials', 'Direct Labor', 'Subcontractors', 'Freight', 'Site Expenses', 'Other Direct Costs', 'Direct Expense / Cost of Goods']),
      Expense: new Set(['Payroll', 'Office & Administrative', 'Sales & Marketing', 'Travel & Vehicle', 'Utilities & Communication', 'Professional Services', 'Software & Subscriptions', 'Repairs & Maintenance', 'Financial Expenses', 'Depreciation & Amortization', 'Miscellaneous Expenses', 'Operating Expense', 'Direct Expense / Cost of Goods', 'Tax Expense', 'Interest Expense', 'Asset Losses', 'Other Expenses']),
      'Other Expense': new Set(['Interest Expense', 'Asset Losses', 'Other Expenses']),
    };
    if (!allowedSubTypes[normalizedType]) {
      res.status(400).json({ error: 'Account type is not supported by the chart of accounts' });
      return;
    }
    if (!allowedSubTypes[normalizedType].has(normalizedSubType)) {
      res.status(400).json({ error: 'Account subtype is not valid for the selected account type' });
      return;
    }
    const normalizedCode = code.trim();
    const reservedCodes = new Set(['1000', '1100', '1150', '1200', '1400', '1600', '2000', '2100', '2200', '2250', '3000', '3400', '3500', '4000', '4900', '5000', '5800', '5900', '6000']);
    if (reservedCodes.has(normalizedCode)) {
      res.status(409).json({ error: 'This account code is reserved for a provisioned system control account' });
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(normalizedCode) || name.trim().length > 160 || normalizedSubType.length > 80) {
      res.status(400).json({ error: 'Account code or name is invalid or exceeds the allowed length' });
      return;
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
      res.status(400).json({ error: 'Account description cannot exceed 500 characters' });
      return;
    }

    const parentAccountId = typeof req.body.parentAccountId === 'string' && req.body.parentAccountId.trim()
      ? req.body.parentAccountId.trim()
      : null;
    const reportingGroup = typeof req.body.reportingGroup === 'string' && req.body.reportingGroup.trim()
      ? req.body.reportingGroup.trim()
      : null;
    if (reportingGroup && reportingGroup.length > 100) {
      res.status(400).json({ error: 'Reporting group cannot exceed 100 characters' });
      return;
    }
    if (req.body.allowDirectPosting !== undefined && typeof req.body.allowDirectPosting !== 'boolean') {
      res.status(400).json({ error: 'allowDirectPosting must be true or false' });
      return;
    }
    const defaultNormalBalance = ['Asset', 'Expense', 'Cost of Goods Sold', 'Other Expense'].includes(normalizedType) ? 'Debit' : 'Credit';
    const normalBalance = req.body.normalBalance === undefined ? defaultNormalBalance : req.body.normalBalance;
    if (normalBalance !== 'Debit' && normalBalance !== 'Credit') {
      res.status(400).json({ error: 'normalBalance must be Debit or Credit' });
      return;
    }
    const allowDirectPosting = req.body.allowDirectPosting ?? true;
    const accId = newId('acc');
    try {
      await db.transaction(async (client) => {
        if (parentAccountId) {
        const parent = await client.query(
          `SELECT id, type, status, is_system_account, is_locked FROM accounts WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, parentAccountId]
        );
        if (parent.rows.length !== 1) throw new Error('ACCOUNT_PARENT_INVALID: Parent account does not belong to this organization');
        if (parent.rows[0].status !== 'Active') throw new Error('ACCOUNT_PARENT_INACTIVE: An archived account cannot be a parent');
        if (parent.rows[0].is_system_account || parent.rows[0].is_locked) throw new Error('ACCOUNT_PARENT_PROTECTED: A system or locked account cannot be a parent');
          if (parent.rows[0].type !== normalizedType) throw new Error('ACCOUNT_PARENT_TYPE_MISMATCH: Parent and child must share an account type');
          await client.query(
            `UPDATE accounts SET allow_direct_posting = FALSE WHERE organization_id = $1 AND id = $2`,
            [orgId, parentAccountId]
          );
        }
      await client.query(
        `INSERT INTO accounts (id, organization_id, code, name, description, type, sub_type, balance, is_system_account, status, parent_account_id, reporting_group, normal_balance, normal_balance_is_explicit, allow_direct_posting)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, FALSE, 'Active', $8, $9, $10, TRUE, $11)`,
         [accId, orgId, normalizedCode, name.trim(), description?.trim() || null, normalizedType, normalizedSubType, parentAccountId, reportingGroup, normalBalance, allowDirectPosting]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'ACCOUNT_CREATED', 'Account', $4, $5)`,
         [newId('aud'), orgId, req.auth!.userId, accId, JSON.stringify({ code: normalizedCode, name: name.trim(), description: description?.trim() || null, type: normalizedType, subType: normalizedSubType, parentAccountId, reportingGroup, normalBalance, allowDirectPosting })]
      );
      }, { organizationId: orgId });
      res.status(201).json({ id: accId, code: normalizedCode, name: name.trim(), description: description?.trim() || null, type: normalizedType, subType: normalizedSubType, balance: 0, status: 'Active', parentAccountId, reportingGroup, normalBalance, allowDirectPosting });
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message || '').includes('uk_org_account_code')) {
        try {
          const conflictRes = await db.query(
            `SELECT name, type, status FROM accounts WHERE organization_id = $1 AND code = $2`,
            [orgId, normalizedCode]
          );
          const conflict = conflictRes.rows[0];
          if (conflict && conflict.status === 'Archived') {
            res.status(409).json({
              error: `Account code "${normalizedCode}" already belongs to an Archived account ("${conflict.name}"). Switch to Archived accounts in Chart of Accounts to restore it, or choose a different code.`,
            });
            return;
          }
          if (conflict) {
            res.status(409).json({
              error: `Account code "${normalizedCode}" is already in use by "${conflict.name}" (${conflict.type}). Please choose a different code.`,
            });
            return;
          }
        } catch {
          // fallback to generic message
        }
        res.status(409).json({
          error: `An account with code "${normalizedCode}" already exists in your organization. Please choose a different code.`,
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Account could not be created';
      const statusCode = message.startsWith('ACCOUNT_PARENT_') ? 400 : 409;
      res.status(statusCode).json({ error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async updateAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const accountId = req.params.id;
    const { name, description, parentAccountId, reportingGroup, allowDirectPosting, status } = req.body;
    if (name !== undefined && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160)) {
      res.status(400).json({ error: 'Account name must contain 2-160 characters' });
      return;
    }
    if (reportingGroup !== undefined && reportingGroup !== null && (typeof reportingGroup !== 'string' || reportingGroup.trim().length > 100)) {
      res.status(400).json({ error: 'Reporting group cannot exceed 100 characters' });
      return;
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 500)) {
      res.status(400).json({ error: 'Account description cannot exceed 500 characters' });
      return;
    }
    if (parentAccountId !== undefined && parentAccountId !== null && typeof parentAccountId !== 'string') {
      res.status(400).json({ error: 'parentAccountId must be an account id or null' });
      return;
    }
    if (allowDirectPosting !== undefined && typeof allowDirectPosting !== 'boolean') {
      res.status(400).json({ error: 'allowDirectPosting must be true or false' });
      return;
    }
    if (status !== undefined && status !== 'Active' && status !== 'Archived') {
      res.status(400).json({ error: 'status must be Active or Archived' });
      return;
    }

    try {
      const updated = await db.transaction(async (client) => {
        const existingResult = await client.query(
          `SELECT * FROM accounts WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, accountId]
        );
        if (existingResult.rows.length !== 1) throw new Error('ACCOUNT_NOT_FOUND: Account does not exist');
        const existing = existingResult.rows[0];
        if (existing.is_system_account || existing.is_locked) throw new Error('ACCOUNT_PROTECTED: System and locked accounts cannot be changed here');

        const nextParentId = parentAccountId === undefined
          ? existing.parent_account_id
          : (typeof parentAccountId === 'string' && parentAccountId.trim() ? parentAccountId.trim() : null);
        if (nextParentId === accountId) throw new Error('ACCOUNT_PARENT_CYCLE: An account cannot be its own parent');
        if (nextParentId) {
          const parents = await client.query(
            `SELECT id, parent_account_id, type, status FROM accounts WHERE organization_id = $1 FOR UPDATE`, [orgId]
          );
          const byId = new Map(parents.rows.map((row: any) => [row.id, row]));
          const parent = byId.get(nextParentId);
          if (!parent) throw new Error('ACCOUNT_PARENT_INVALID: Parent account does not belong to this organization');
          if (parent.status !== 'Active') throw new Error('ACCOUNT_PARENT_INACTIVE: An archived account cannot be a parent');
          if (parent.type !== existing.type) throw new Error('ACCOUNT_PARENT_TYPE_MISMATCH: Parent and child must share an account type');
          const seen = new Set<string>();
          let cursor: any = parent;
          while (cursor) {
            if (cursor.id === accountId) throw new Error('ACCOUNT_PARENT_CYCLE: Parent assignment would create a cycle');
            if (seen.has(cursor.id)) throw new Error('ACCOUNT_PARENT_CYCLE: Existing account hierarchy is cyclic');
            seen.add(cursor.id);
            cursor = cursor.parent_account_id ? byId.get(cursor.parent_account_id) : null;
          }
        }

        const nextStatus = status ?? existing.status;
        if (nextStatus === 'Archived') {
          let usageImpact;
          try {
            usageImpact = await AccountUsageImpactService.get(client, orgId, accountId);
          } catch {
            throw new Error('ACCOUNT_USAGE_INCOMPLETE: Account references could not be safely inventoried');
          }
          if (!usageImpact || !usageImpact.inventoryComplete) {
            throw new Error('ACCOUNT_USAGE_INCOMPLETE: Account references could not be safely inventoried');
          }
          if (usageImpact.balance !== 0) throw new Error('ACCOUNT_ARCHIVE_BALANCE: A non-zero ledger balance account cannot be archived');
          if (usageImpact.archiveBlockers.some((blocker) => /child accounts/i.test(blocker))) {
            throw new Error('ACCOUNT_ARCHIVE_CHILDREN: Reassign or archive active child accounts first');
          }
          if (usageImpact.archiveBlockers.some((blocker) => /defaults/i.test(blocker))) {
            throw new Error('ACCOUNT_ARCHIVE_DEFAULT: Reassign accounting, customer, vendor, and item defaults before archiving this account');
          }
        }

        const activeChildren = await client.query(
          `SELECT id FROM accounts WHERE organization_id = $1 AND parent_account_id = $2 AND status = 'Active' LIMIT 1`,
          [orgId, accountId]
        );
        if (allowDirectPosting === true && activeChildren.rows.length > 0) {
          throw new Error('ACCOUNT_PARENT_POSTING: Accounts with active children cannot accept direct postings');
        }

        const after = {
          name: name === undefined ? existing.name : name.trim(),
          description: description === undefined ? existing.description : (description.trim() || null),
          parentAccountId: nextParentId,
          reportingGroup: reportingGroup === undefined ? existing.reporting_group : (reportingGroup?.trim() || null),
          allowDirectPosting: allowDirectPosting ?? existing.allow_direct_posting,
          status: nextStatus,
        };
        const result = await client.query(
          `UPDATE accounts SET name = $1, description = $2, parent_account_id = $3, reporting_group = $4, allow_direct_posting = $5, status = $6,
             archived_at = CASE WHEN $6 = 'Archived' THEN CURRENT_TIMESTAMP ELSE NULL END,
             archived_by = CASE WHEN $6 = 'Archived' THEN $7 ELSE NULL END
           WHERE organization_id = $8 AND id = $9 RETURNING *`,
          [after.name, after.description, after.parentAccountId, after.reportingGroup, after.allowDirectPosting, after.status, req.auth!.userId, orgId, accountId]
        );
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
           VALUES ($1, $2, $3, $4, 'Account', $5, $6, $7)`,
          [newId('aud'), orgId, req.auth!.userId, nextStatus === 'Archived' ? 'ACCOUNT_ARCHIVED' : 'ACCOUNT_UPDATED', accountId,
            JSON.stringify({ name: existing.name, description: existing.description, parentAccountId: existing.parent_account_id, reportingGroup: existing.reporting_group, allowDirectPosting: existing.allow_direct_posting, status: existing.status }), JSON.stringify(after)]
        );
        return result.rows[0];
      });
      res.json(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Account could not be updated';
      const statusCode = message.startsWith('ACCOUNT_NOT_FOUND') ? 404 : 400;
      res.status(statusCode).json({ error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async deleteAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const accountId = String(req.params.id || '').trim();
    if (!accountId) {
      res.status(400).json({ error: 'An account id is required' });
      return;
    }

    try {
      const deleted = await db.transaction(async (client) => {
        const accountResult = await client.query(
          `SELECT * FROM accounts WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, accountId]
        );
        const account = accountResult.rows[0];
        if (!account) throw new Error('ACCOUNT_NOT_FOUND: Account does not exist');
        if (account.is_system_account || account.is_locked) {
          throw new Error('ACCOUNT_DELETE_PROTECTED: System and locked accounts cannot be deleted');
        }
        let usageImpact;
        try {
          usageImpact = await AccountUsageImpactService.get(client, orgId, accountId);
        } catch {
          throw new Error('ACCOUNT_USAGE_INCOMPLETE: Account references could not be safely inventoried');
        }
        if (!usageImpact || !usageImpact.inventoryComplete) {
          throw new Error('ACCOUNT_USAGE_INCOMPLETE: Account references could not be safely inventoried');
        }
        // If linked to a bank account profile, verify that it has no statement imports or transactions
        // before cleaning up the bank profile cleanly.
        const bankProfileCheck = await client.query(
          `SELECT id FROM bank_accounts WHERE organization_id = $1 AND ledger_account_id = $2 FOR UPDATE`,
          [orgId, accountId]
        );
        if (bankProfileCheck.rows.length > 0) {
          const bankAccId = bankProfileCheck.rows[0].id;
          const hasStatements = await client.query(
            `SELECT 1 FROM bank_statement_imports WHERE organization_id = $1 AND bank_account_id = $2 LIMIT 1`,
            [orgId, bankAccId]
          );
          if (hasStatements.rows.length > 0) {
            throw new Error('ACCOUNT_DELETE_IN_USE: This account is used by a bank account with statement import history. Remove that reference or archive the account instead.');
          }
          const hasTransactions = await client.query(
            `SELECT 1 FROM bank_statement_transactions WHERE organization_id = $1 AND bank_account_id = $2 LIMIT 1`,
            [orgId, bankAccId]
          );
          if (hasTransactions.rows.length > 0) {
            throw new Error('ACCOUNT_DELETE_IN_USE: This account is used by a bank account with statement transactions. Remove that reference or archive the account instead.');
          }
          await client.query(`DELETE FROM bank_accounts WHERE organization_id = $1 AND id = $2`, [orgId, bankAccId]);
        }

        try {
          usageImpact = await AccountUsageImpactService.get(client, orgId, accountId);
        } catch {
          throw new Error('ACCOUNT_USAGE_INCOMPLETE: Account references could not be safely inventoried');
        }
        if (!usageImpact || !usageImpact.inventoryComplete) {
          throw new Error('ACCOUNT_USAGE_INCOMPLETE: Account references could not be safely inventoried');
        }

        // The same reviewed dependency registry powers the impact preview and deletion guard.
        const referenced = usageImpact.references.find((reference) => reference.count > 0);
        if (referenced) {
          throw new Error(`ACCOUNT_DELETE_IN_USE: This account is used by ${referenced.label}. Remove that reference or archive the account instead.`);
        }
        if (usageImpact.balance !== 0) {
          throw new Error('ACCOUNT_DELETE_BALANCE: An account with a non-zero ledger balance cannot be deleted');
        }

        const result = await client.query(
          `DELETE FROM accounts WHERE organization_id = $1 AND id = $2 RETURNING id, code, name, type, sub_type`,
          [orgId, accountId]
        );
        if (result.rows.length !== 1) throw new Error('ACCOUNT_NOT_FOUND: Account does not exist');
        const removed = result.rows[0];
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state)
           VALUES ($1, $2, $3, 'ACCOUNT_DELETED', 'Account', $4, $5)`,
          [newId('aud'), orgId, req.auth!.userId, accountId, JSON.stringify({
            id: removed.id,
            code: removed.code,
            name: removed.name,
            type: removed.type,
            subType: removed.sub_type,
          })]
        );
        return removed;
      }, { organizationId: orgId });
      res.json({ deleted: true, id: deleted.id, code: deleted.code, name: deleted.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Account could not be deleted';
      const statusCode = message.startsWith('ACCOUNT_NOT_FOUND')
        ? 404
        : message.startsWith('ACCOUNT_USAGE_INCOMPLETE')
          ? 503
          : message.startsWith('ACCOUNT_DELETE_IN_USE') || message.startsWith('ACCOUNT_DELETE_BALANCE')
            ? 409
          : 400;
      res.status(statusCode).json({ error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  // --- CLIENTS ---
  private static nextSalespersonUpdatedAt(current: Date | string): string {
    return new Date(Math.max(Date.now(), new Date(current).getTime() + 1)).toISOString();
  }

  private static salespersonInput(body: any, partial = false): Record<string, any> | string {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Salesperson data must be a JSON object';
    const input: Record<string, any> = {};
    for (const field of ['code', 'name', 'email', 'phone', 'commissionRate', 'region', 'notes']) {
      if (body[field] !== undefined) input[field] = body[field];
    }
    if (!partial || input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 255) return 'Salesperson name is required and must be 255 characters or fewer';
      input.name = input.name.trim();
    }
    if (!partial || input.code !== undefined) {
      if (typeof input.code !== 'string' || !input.code.trim() || input.code.trim().length > 64) return 'Salesperson code is required and must be 64 characters or fewer';
      input.code = input.code.trim();
    }
    if (input.email !== undefined) {
      if (typeof input.email !== 'string' || input.email.length > 255 || (input.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))) return 'Salesperson email is invalid';
      input.email = input.email.trim().toLowerCase();
    }
    if (input.phone !== undefined && (typeof input.phone !== 'string' || input.phone.length > 50)) return 'Salesperson phone must be 50 characters or fewer';
    if (input.region !== undefined && (typeof input.region !== 'string' || input.region.length > 255)) return 'Salesperson region must be 255 characters or fewer';
    if (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 10000)) return 'Salesperson notes must be 10,000 characters or fewer';
    if (input.commissionRate !== undefined || !partial) {
      const rate = input.commissionRate;
      if (!(typeof rate === 'number' || typeof rate === 'string') || !/^\d{1,3}(\.\d{1,2})?$/.test(String(rate)) || !Number.isFinite(Number(rate)) || Number(rate) < 0 || Number(rate) > 100) return 'Commission rate must be from 0 to 100 with at most two decimal places';
      input.commissionRate = Number(rate);
    }
    return input;
  }

  public static async getSalespersons(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM salespersons WHERE organization_id = $1 ORDER BY name ASC, id ASC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  public static async createSalesperson(req: AuthenticatedRequest, res: Response): Promise<void> {
    const input = FinanceController.salespersonInput(req.body);
    if (typeof input === 'string') { res.status(400).json({ error: input }); return; }
    const id = newId('sp');
    try {
      const row = await db.transaction(async (client) => {
        const duplicate = await client.query('SELECT id FROM salespersons WHERE organization_id = $1 AND LOWER(code) = LOWER($2) LIMIT 1', [req.auth!.organizationId, input.code]);
        if (duplicate.rows.length) throw Object.assign(new Error('SALESPERSON_CODE_DUPLICATE'), { code: '23505' });
        const inserted = await client.query(
          'INSERT INTO salespersons (id, organization_id, code, name, email, phone, commission_rate, region, notes, status, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP) RETURNING *',
          [id, req.auth!.organizationId, input.code, input.name, input.email || '', input.phone || '', input.commissionRate, input.region || '', input.notes || '', 'ACTIVE']
        );
        await FinanceController.logAudit(req.auth!.organizationId, req.auth!.userId, 'SALESPERSON_CREATED', 'Salesperson', id, inserted.rows[0], client, true);
        return inserted.rows[0];
      });
      res.status(201).json(row);
    } catch (error: any) {
      if (error?.code === '23505') { res.status(409).json({ error: 'That salesperson code is already in use in this organization' }); return; }
      throw error;
    }
  }

  public static async updateSalesperson(req: AuthenticatedRequest, res: Response): Promise<void> {
    const input = FinanceController.salespersonInput(req.body, true);
    if (typeof input === 'string') { res.status(400).json({ error: input }); return; }
    if (Object.keys(input).length === 0 || typeof req.body.updatedAt !== 'string') { res.status(400).json({ error: 'At least one editable field and the last-read updatedAt value are required' }); return; }
    const updatedAtMs = typeof req.body.updatedAt === 'string' ? Date.parse(req.body.updatedAt) : Number.NaN;
    if (!Number.isFinite(updatedAtMs)) { res.status(400).json({ error: 'A valid last-read updatedAt timestamp is required' }); return; }
    try {
      const outcome = await db.transaction(async (client) => {
        const selected = await client.query('SELECT * FROM salespersons WHERE organization_id = $1 AND id = $2 FOR UPDATE', [req.auth!.organizationId, req.params.id]);
        if (selected.rows.length !== 1) throw Object.assign(new Error('SALESPERSON_NOT_FOUND'), { statusCode: 404 });
        const before = selected.rows[0];
        if (new Date(before.updated_at).getTime() !== updatedAtMs) throw Object.assign(new Error('SALESPERSON_STALE'), { statusCode: 409 });
        if (input.code !== undefined) {
          const duplicate = await client.query('SELECT id FROM salespersons WHERE organization_id = $1 AND LOWER(code) = LOWER($2) AND id <> $3 LIMIT 1', [req.auth!.organizationId, input.code, req.params.id]);
          if (duplicate.rows.length) throw Object.assign(new Error('SALESPERSON_CODE_DUPLICATE'), { code: '23505' });
        }
        const columns: Record<string, string> = { code: 'code', name: 'name', email: 'email', phone: 'phone', commissionRate: 'commission_rate', region: 'region', notes: 'notes' };
        const changes = Object.entries(input).filter(([key, value]) => {
          const old = before[columns[key]];
          return key === 'commissionRate' ? Number(old) !== value : String(old ?? '') !== String(value ?? '');
        });
        if (!changes.length) return { row: before, changed: false };
        const assignments = changes.map(([key], index) => columns[key] + ' = $' + (index + 1));
        const values = changes.map(([, value]) => value); values.push(FinanceController.nextSalespersonUpdatedAt(before.updated_at), req.auth!.organizationId, req.params.id);
        const updated = await client.query('UPDATE salespersons SET ' + assignments.join(', ') + ', updated_at = $' + (values.length - 2) + ' WHERE organization_id = $' + (values.length - 1) + ' AND id = $' + values.length + ' RETURNING *', values);
        await FinanceController.logAudit(req.auth!.organizationId, req.auth!.userId, 'SALESPERSON_UPDATED', 'Salesperson', req.params.id, { before, after: updated.rows[0] }, client, true);
        return { row: updated.rows[0], changed: true };
      }); res.json({ ...outcome.row, changed: outcome.changed });
    } catch (error: any) {
      if (error?.code === '23505') { res.status(409).json({ error: 'That salesperson code is already in use in this organization' }); return; }
      if (error?.statusCode) { res.status(error.statusCode).json({ error: error.message === 'SALESPERSON_STALE' ? 'This salesperson changed since you opened it. Refresh and try again.' : 'Salesperson was not found' }); return; } throw error;
    }
  }
  private static async setSalespersonStatus(req: AuthenticatedRequest, res: Response, status: 'ACTIVE' | 'INACTIVE'): Promise<void> {
    try { const result = await db.transaction(async (client) => {
      const selected = await client.query('SELECT * FROM salespersons WHERE organization_id = $1 AND id = $2 FOR UPDATE', [req.auth!.organizationId, req.params.id]);
      if (!selected.rows.length) throw Object.assign(new Error('SALESPERSON_NOT_FOUND'), { statusCode: 404 });
      const before = selected.rows[0], changed = before.status !== status;
      if (changed && status === 'INACTIVE') { const refs = await client.query('SELECT id FROM customers WHERE organization_id = $1 AND salesperson_id = $2 AND active IS NOT FALSE LIMIT 1', [req.auth!.organizationId, req.params.id]); if (refs.rows.length) throw Object.assign(new Error('SALESPERSON_ASSIGNED'), { statusCode: 409 }); }
      let updatedAt = before.updated_at;
      if (changed) { const timestamp = FinanceController.nextSalespersonUpdatedAt(before.updated_at); const updated = await client.query('UPDATE salespersons SET status = $1, updated_at = $2 WHERE organization_id = $3 AND id = $4 RETURNING updated_at', [status, timestamp, req.auth!.organizationId, req.params.id]); updatedAt = updated.rows[0].updated_at; await FinanceController.logAudit(req.auth!.organizationId, req.auth!.userId, status === 'ACTIVE' ? 'SALESPERSON_RESTORED' : 'SALESPERSON_ARCHIVED', 'Salesperson', req.params.id, { beforeStatus: before.status, afterStatus: status }, client, true); }
      return { id: before.id, active: status === 'ACTIVE', changed, updated_at: updatedAt };
    }); res.json(result); } catch (error: any) { if (error?.statusCode) { res.status(error.statusCode).json({ error: error.message === 'SALESPERSON_ASSIGNED' ? 'Reassign active customers before deactivating this salesperson' : 'Salesperson was not found' }); return; } throw error; }
  }
  public static async archiveSalesperson(req: AuthenticatedRequest, res: Response): Promise<void> { await FinanceController.setSalespersonStatus(req, res, 'INACTIVE'); }
  public static async restoreSalesperson(req: AuthenticatedRequest, res: Response): Promise<void> { await FinanceController.setSalespersonStatus(req, res, 'ACTIVE'); }
  public static async getClients(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query(
      `SELECT cl.* FROM clients cl
        LEFT JOIN customers cu ON cu.organization_id = cl.organization_id AND cu.id = cl.id
       WHERE cl.organization_id = $1 AND (cu.id IS NULL OR cu.active IS NOT FALSE)
       ORDER BY cl.name ASC`,
      [orgId]
    );
    res.json(result.rows);
  }

  public static async createClient(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { name, companyName, email, phone, billingAddress, taxId, currency, paymentTerms, notes } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) {
      res.status(400).json({ error: 'Client name is required' });
      return;
    }
    if (
      Number(req.body.openingBalance || 0) !== 0 ||
      Number(req.body.receivablesBalance || 0) !== 0 ||
      Number(req.body.unusedCredits || 0) !== 0 ||
      Number(req.body.advanceBalance || 0) !== 0
    ) {
      res.status(400).json({ error: 'Client balances must be established through balanced financial transactions' });
      return;
    }
    if (
      (companyName !== undefined && (typeof companyName !== 'string' || companyName.length > 255)) ||
      (email !== undefined && email !== '' && (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (phone !== undefined && (typeof phone !== 'string' || phone.length > 50)) ||
      (billingAddress !== undefined && (typeof billingAddress !== 'string' || billingAddress.length > 10000)) ||
      (taxId !== undefined && (typeof taxId !== 'string' || taxId.length > 50)) ||
      (currency !== undefined && (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency))) ||
      (paymentTerms !== undefined && (typeof paymentTerms !== 'string' || paymentTerms.length > 50)) ||
      (notes !== undefined && (typeof notes !== 'string' || notes.length > 10000))
    ) {
      res.status(400).json({ error: 'Client metadata is invalid or exceeds the allowed length' });
      return;
    }
    const organization = await db.query('SELECT base_currency FROM organizations WHERE id = $1', [orgId]);
    if (organization.rows.length !== 1 || !/^[A-Z]{3}$/.test(String(organization.rows[0].base_currency || ''))) {
      res.status(409).json({ error: 'Organization base currency is not configured' });
      return;
    }
    const organizationCurrency = String(organization.rows[0].base_currency);
    if (currency && currency.toUpperCase() !== organizationCurrency) {
      res.status(400).json({ error: 'Foreign-currency clients require the audited exchange-rate workflow' });
      return;
    }
    const clientCurrency = organizationCurrency;
    const cliId = newId('cli');
    const record = { id: cliId, name: name.trim(), companyName: companyName?.trim() || name.trim(), email: email?.trim().toLowerCase() || '', phone: phone?.trim() || '', billingAddress: billingAddress?.trim() || '', taxId: taxId?.trim() || '', currency: clientCurrency, paymentTerms: paymentTerms?.trim() || 'Net 30', notes: notes?.trim() || '' };
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO clients (id, organization_id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [record.id, orgId, record.name, record.companyName, record.email, record.phone, record.billingAddress, record.taxId, record.currency, record.paymentTerms, record.notes]
      );
      await client.query(
        `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, phone, billing_address, gstin, currency, payment_terms, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO NOTHING`,
        [record.id, orgId, record.id, record.name, record.companyName, record.email, record.phone, JSON.stringify(record.billingAddress), record.taxId, record.currency, record.paymentTerms, record.notes]
      );
      await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, 'CLIENT_CREATED', 'Client', $4, $5)`, [newId('aud'), orgId, req.auth!.userId, cliId, JSON.stringify(record)]);
    });
    res.status(201).json({ ...record, createdAt: new Date().toISOString() });
  }

  // --- VENDORS ---
  public static async getVendors(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const status = String(req.query.status || 'all').toLowerCase();
    if (!['all', 'active', 'inactive'].includes(status)) {
      res.status(400).json({ error: 'Vendor status filter is invalid' });
      return;
    }
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 200) : '';
    const paginated = req.query.paginate === 'true';
    const limit = Number(req.query.limit ?? 25);
    const offset = Number(req.query.offset ?? 0);
    if (paginated && (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000000)) {
      res.status(400).json({ error: 'Vendor pagination values are invalid' });
      return;
    }
    const filterSql = `v.organization_id = $1
      AND ($2 = 'all' OR ($2 = 'active' AND (v.active = TRUE OR v.active IS NULL)) OR ($2 = 'inactive' AND v.active = FALSE))
      AND ($3 = '' OR v.name ILIKE '%' || $3 || '%' OR COALESCE(v.company_name, '') ILIKE '%' || $3 || '%'
        OR COALESCE(v.email, '') ILIKE '%' || $3 || '%' OR COALESCE(v.phone, '') ILIKE '%' || $3 || '%'
        OR COALESCE(v.mobile, '') ILIKE '%' || $3 || '%' OR COALESCE(v.website, '') ILIKE '%' || $3 || '%'
        OR COALESCE(v.gstin, '') ILIKE '%' || $3 || '%' OR COALESCE(v.pan, '') ILIKE '%' || $3 || '%'
        OR COALESCE(v.vendor_id, '') ILIKE '%' || $3 || '%'
        OR COALESCE(v.primary_contact->>'name', '') ILIKE '%' || $3 || '%'
        OR COALESCE(v.additional_contacts::text, '') ILIKE '%' || $3 || '%')`;
    const params: unknown[] = [orgId, status, search];
    const pageSql = paginated ? ' LIMIT $4 OFFSET $5' : '';
    if (paginated) params.push(limit, offset);
    const result = await db.query(
      `SELECT v.* FROM vendors v WHERE ${filterSql}
       ORDER BY lower(v.name), v.id${pageSql}`,
      params
    );
    const items = (await withCalculatedVendorBalances(orgId, result.rows)).map(vendorResponse);
    if (!paginated) { res.json(items); return; }
    const count = await db.query(`SELECT COUNT(*)::int AS total FROM vendors v WHERE ${filterSql}`, [orgId, status, search]);
    res.json({ items, total: Number(count.rows[0]?.total || 0), limit, offset });
  }

  public static async getVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query(
      'SELECT v.* FROM vendors v WHERE v.organization_id = $1 AND v.id = $2',
      [orgId, req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Vendor not found' });
      return;
    }
    const [vendor] = await withCalculatedVendorBalances(orgId, result.rows);
    res.json(vendorResponse(vendor));
  }

  public static async getVendorActivity(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query(
      `SELECT id, action, timestamp, user_id, after_state
         FROM audit_logs
        WHERE organization_id = $1 AND entity_type = 'Vendor' AND entity_id = $2
        ORDER BY timestamp DESC, id DESC LIMIT 100`,
      [req.auth!.organizationId, req.params.id]
    );
    res.json(result.rows.map((row: any) => {
      const state = parseVendorJson(row.after_state, {}) as Record<string, unknown>;
      return {
        id: row.id,
        action: row.action,
        timestamp: row.timestamp,
        userId: row.user_id,
        changedFields: Array.isArray(state.changedFields) ? state.changedFields : [],
      };
    }));
  }

  public static async getVendorAttachments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    const vendor = await db.query('SELECT id FROM vendors WHERE organization_id = $1 AND id = $2', [organizationId, req.params.id]);
    if (!vendor.rows.length) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(await VendorRecordsService.listAttachments(db, organizationId, req.params.id));
  }

  public static async createVendorAttachments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    try {
      const attachments = await db.transaction(async (client) => {
        const added = await VendorRecordsService.addAttachments(client, organizationId, req.params.id, req.auth!.userId, req.body?.files);
        await FinanceController.logAudit(organizationId, req.auth!.userId, 'VENDOR_ATTACHMENTS_ADDED', 'Vendor', req.params.id,
          { attachmentIds: added.map((attachment) => attachment.id), count: added.length }, client, true);
        return added;
      });
      res.status(201).json({ attachments });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vendor documents could not be saved';
      const status = message.startsWith('VENDOR_NOT_FOUND') ? 404 : message.startsWith('VENDOR_ATTACHMENT_LIMIT') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  }

  public static async downloadVendorAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const attachment = await VendorRecordsService.getAttachment(db, req.auth!.organizationId, req.params.id, req.params.attachmentId);
    if (!attachment) { res.status(404).json({ error: 'Vendor document not found' }); return; }
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`);
    res.setHeader('Content-Length', attachment.content.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(attachment.content);
  }

  public static async archiveVendorAttachment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    const changed = await db.transaction(async (client) => {
      const archived = await VendorRecordsService.archiveAttachment(client, organizationId, req.params.id, req.params.attachmentId, req.auth!.userId);
      if (archived) await FinanceController.logAudit(organizationId, req.auth!.userId, 'VENDOR_ATTACHMENT_ARCHIVED', 'Vendor', req.params.id,
        { attachmentId: req.params.attachmentId }, client, true);
      return archived;
    });
    if (!changed) { res.status(404).json({ error: 'Vendor document not found' }); return; }
    res.json({ id: req.params.attachmentId, archived: true });
  }

  public static async getVendorMails(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    const vendor = await db.query('SELECT id FROM vendors WHERE organization_id = $1 AND id = $2', [organizationId, req.params.id]);
    if (!vendor.rows.length) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(await VendorRecordsService.listMails(db, organizationId, req.params.id));
  }

  public static async sendVendorMail(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    try {
      const mail = await db.transaction(async (client) => {
        const added = await VendorRecordsService.sendMail(client, organizationId, req.params.id, req.auth!.userId, req.body || {});
        await FinanceController.logAudit(organizationId, req.auth!.userId, 'VENDOR_MAIL_SENT', 'Vendor', req.params.id,
          { mailId: added.id, toEmail: added.toEmail, subject: added.subject }, client, true);
        return added;
      });
      res.status(201).json(mail);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vendor email could not be recorded';
      res.status(message.startsWith('VENDOR_NOT_FOUND') ? 404 : 400).json({ error: message });
    }
  }

  public static async getVendorComments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    const vendor = await db.query('SELECT id FROM vendors WHERE organization_id = $1 AND id = $2', [organizationId, req.params.id]);
    if (!vendor.rows.length) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(await VendorRecordsService.listComments(db, organizationId, req.params.id));
  }

  public static async createVendorComment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    try {
      const comment = await db.transaction(async (client) => {
        const added = await VendorRecordsService.addComment(client, organizationId, req.params.id, req.auth!.userId, req.body?.body);
        await FinanceController.logAudit(organizationId, req.auth!.userId, 'VENDOR_COMMENT_ADDED', 'Vendor', req.params.id,
          { commentId: added.id }, client, true);
        return added;
      });
      res.status(201).json(comment);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Vendor comment could not be saved';
      res.status(message.startsWith('VENDOR_NOT_FOUND') ? 404 : 400).json({ error: message });
    }
  }

  public static async createVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const body = req.body || {};
    const { name, companyName, legalName, vendorType, gstStatus, gstin, pan, placeOfSupply,
      contactPerson, primaryContact, additionalContacts, email, phone, mobile, website,
      billingAddress, shippingAddress, taxId, currency, paymentTerms, defaultExpenseAccountId, bankDetails, customFields, notes } = body;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 255) {
      res.status(400).json({ error: 'Vendor name is required' });
      return;
    }
    if (
      Number(req.body.openingBalance || 0) !== 0 ||
      Number(req.body.payablesBalance || 0) !== 0 ||
      Number(req.body.unusedCredits || 0) !== 0 ||
      Number(req.body.advanceBalance || 0) !== 0
    ) {
      res.status(400).json({ error: 'Vendor balances must be established through balanced financial transactions' });
      return;
    }
    if (!boundedText(companyName, 255) || !boundedText(legalName, 255) || !boundedText(contactPerson, 255) ||
      !boundedText(phone, 50) || !boundedText(mobile, 50) || !boundedText(website, 255) ||
      !boundedText(placeOfSupply, 100) || !boundedText(taxId, 50) || !boundedText(gstin, 50) ||
      !boundedText(pan, 20) || !boundedText(paymentTerms, 50) || !boundedText(notes, 20000) ||
      !validVendorEmail(email) ||
      !['Business', 'Individual'].includes(vendorType || 'Business') ||
      !['Registered', 'Unregistered', 'Composition', 'SEZ'].includes(gstStatus || 'Unregistered') ||
      !validVendorAddress(billingAddress) || !validVendorAddress(shippingAddress) ||
      (additionalContacts !== undefined && (!Array.isArray(additionalContacts) || additionalContacts.length > 20)) ||
      (primaryContact !== undefined && (!primaryContact || typeof primaryContact !== 'object' || Array.isArray(primaryContact))) ||
      !validVendorCustomFields(customFields) ||
      (currency !== undefined && (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)))
    ) {
      res.status(400).json({ error: 'Vendor metadata is invalid or exceeds the allowed length' });
      return;
    }
    if (primaryContact && !validVendorContact(primaryContact, true)) {
      res.status(400).json({ error: 'Primary contact details are invalid' });
      return;
    }
    const gstinValue = String(gstin || taxId || '').trim().toUpperCase();
    const panValue = String(pan || '').trim().toUpperCase();
    if ((gstinValue && !/^[0-9A-Z]{15}$/.test(gstinValue)) || (panValue && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panValue)) ||
      ((gstStatus || 'Unregistered') === 'Registered' && !gstinValue)) {
      res.status(400).json({ error: 'GSTIN or PAN format is invalid' });
      return;
    }
    if (Array.isArray(additionalContacts) && additionalContacts.some((item: any) => !validVendorContact(item))) {
      res.status(400).json({ error: 'Vendor contact details are invalid' });
      return;
    }
    let normalizedBankDetails: Record<string, string> | null;
    try {
      normalizedBankDetails = normalizeVendorBankDetails(bankDetails);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Vendor bank details are invalid' });
      return;
    }
    const organization = await db.query('SELECT base_currency FROM organizations WHERE id = $1', [orgId]);
    const organizationCurrency = String(organization.rows[0]?.base_currency || '');
    if (!/^[A-Z]{3}$/.test(organizationCurrency)) {
      res.status(409).json({ error: 'Organization base currency is not configured' });
      return;
    }
    if (currency && currency.toUpperCase() !== organizationCurrency) {
      res.status(400).json({ error: 'Foreign-currency vendors require the audited exchange-rate workflow' });
      return;
    }
    if (defaultExpenseAccountId) {
      const account = await db.query("SELECT id FROM accounts WHERE organization_id = $1 AND id = $2 AND status = $3 AND type IN ('Expense', 'Other Expense')", [orgId, defaultExpenseAccountId, 'Active']);
      if (!account.rows.length) { res.status(400).json({ error: 'Default expense account does not belong to this organization or is inactive' }); return; }
    }
    const venId = newId('ven');
    const normalizedPrimaryContact = { ...(primaryContact || {}), ...(contactPerson ? { name: String(contactPerson).trim() } : {}) };
    const record = {
      id: venId, organizationId: orgId, vendorId: newId('VDR'), name: name.trim(),
      legalName: String(legalName || companyName || name).trim(), companyName: String(companyName || name).trim(),
      vendorType: vendorType || 'Business', gstStatus: gstStatus || 'Unregistered', gstin: gstinValue,
      pan: panValue, placeOfSupply: String(placeOfSupply || '').trim(), primaryContact: normalizedPrimaryContact,
      additionalContacts: additionalContacts || [], contactPerson: normalizedPrimaryContact.name || '',
      email: String(email || '').trim().toLowerCase(), phone: String(phone || '').trim(), mobile: String(mobile || '').trim(),
      website: String(website || '').trim(), billingAddress: billingAddress || '', shippingAddress: shippingAddress || '',
      taxId: gstinValue, currency: organizationCurrency, paymentTerms: String(paymentTerms || 'Net 30').trim(),
      defaultExpenseAccountId: defaultExpenseAccountId || '', customFields: customFields || {}, notes: String(notes || '').trim(),
      bankDetailsEncrypted: normalizedBankDetails ? MfaService.encryptSecret(JSON.stringify(normalizedBankDetails)) : null,
      active: true, payablesBalance: 0, unusedCredits: 0, advanceBalance: 0,
    };
    const created = await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO vendors (id, organization_id, vendor_id, name, legal_name, company_name, vendor_type, gst_status, gstin, pan, place_of_supply, primary_contact, additional_contacts, email, phone, mobile, website, billing_address, shipping_address, tax_id, currency, payment_terms, default_expense_account_id, bank_details_encrypted, custom_fields, notes, active, payables_balance, unused_credits, advance_balance, opening_balance)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,TRUE,0,0,0,0)
         RETURNING *`,
        [record.id, orgId, record.vendorId, record.name, record.legalName, record.companyName, record.vendorType,
          record.gstStatus, record.gstin, record.pan, record.placeOfSupply, JSON.stringify(record.primaryContact),
          JSON.stringify(record.additionalContacts), record.email, record.phone, record.mobile, record.website,
          typeof record.billingAddress === 'string' ? record.billingAddress : JSON.stringify(record.billingAddress),
          JSON.stringify(record.shippingAddress),
          record.taxId, record.currency, record.paymentTerms, record.defaultExpenseAccountId || null, record.bankDetailsEncrypted,
          JSON.stringify(record.customFields), record.notes]
      );
      await FinanceController.logAudit(orgId, req.auth!.userId, 'VENDOR_CREATED', 'Vendor', venId,
        { changedFields: Object.keys(record).filter((field) => !['id', 'organizationId', 'payablesBalance', 'unusedCredits', 'advanceBalance', 'bankDetailsEncrypted'].includes(field)) }, client, true);
      const row = await client.query('SELECT * FROM vendors WHERE organization_id = $1 AND id = $2', [orgId, venId]);
      return vendorResponse(row.rows[0]);
    });
    res.status(201).json(created);
  }

  public static async updateVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'taxId') && !Object.prototype.hasOwnProperty.call(body, 'gstin')) body.gstin = body.taxId;
    const protectedFields = ['openingBalance', 'payablesBalance', 'unusedCredits', 'advanceBalance'];
    if (protectedFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
      res.status(400).json({ error: 'Vendor balances are derived from financial transactions and cannot be edited' });
      return;
    }
    let updated: Record<string, unknown> | null;
    try {
      updated = await db.transaction(async (client) => {
      const result = await client.query('SELECT * FROM vendors WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, req.params.id]);
      const current = result.rows[0];
      if (!current) return null;
      const fields: Array<[string, string, (value: any) => any]> = [
        ['name', 'name', (v) => String(v || '').trim()], ['legalName', 'legal_name', (v) => String(v || '').trim()],
        ['companyName', 'company_name', (v) => String(v || '').trim()], ['vendorType', 'vendor_type', (v) => v],
        ['gstStatus', 'gst_status', (v) => v], ['gstin', 'gstin', (v) => String(v || '').trim().toUpperCase()],
        ['pan', 'pan', (v) => String(v || '').trim().toUpperCase()], ['placeOfSupply', 'place_of_supply', (v) => String(v || '').trim()],
        ['email', 'email', (v) => String(v || '').trim().toLowerCase()], ['phone', 'phone', (v) => String(v || '').trim()],
        ['mobile', 'mobile', (v) => String(v || '').trim()], ['website', 'website', (v) => String(v || '').trim()],
        ['paymentTerms', 'payment_terms', (v) => String(v || '').trim()], ['notes', 'notes', (v) => String(v || '').trim()],
        ['defaultExpenseAccountId', 'default_expense_account_id', (v) => v || null],
        ['bankDetails', 'bank_details_encrypted', (v) => {
          const details = normalizeVendorBankDetails(v);
          return details ? MfaService.encryptSecret(JSON.stringify(details)) : null;
        }],
        ['billingAddress', 'billing_address', (v) => typeof v === 'string' ? v : JSON.stringify(v || {})],
        ['shippingAddress', 'shipping_address', (v) => JSON.stringify(v || {})],
        ['primaryContact', 'primary_contact', (v) => JSON.stringify(v || {})],
        ['additionalContacts', 'additional_contacts', (v) => JSON.stringify(v || [])],
        ['customFields', 'custom_fields', (v) => JSON.stringify(v || {})],
      ];
      for (const [input, column] of fields) {
        if (!Object.prototype.hasOwnProperty.call(body, input)) continue;
        const value = body[input];
        const limits: Record<string, number> = { name: 255, legalName: 255, companyName: 255, email: 255, phone: 50, mobile: 50, website: 255, gstin: 50, pan: 20, placeOfSupply: 100, paymentTerms: 50, notes: 20000 };
        if (limits[input] !== undefined && !boundedText(value, limits[input])) throw new Error(`Invalid ${input}`);
        if (input === 'name' && (!value || !String(value).trim())) throw new Error('Vendor name is required');
        if (input === 'email' && !validVendorEmail(value)) throw new Error('Vendor email is invalid');
        if (input === 'vendorType' && !['Business', 'Individual'].includes(value)) throw new Error('Vendor type is invalid');
        if (input === 'gstStatus' && !['Registered', 'Unregistered', 'Composition', 'SEZ'].includes(value)) throw new Error('GST status is invalid');
        if (input === 'gstin' && value && !/^[0-9A-Z]{15}$/.test(String(value).trim().toUpperCase())) throw new Error('GSTIN format is invalid');
        if (input === 'pan' && value && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(value).trim().toUpperCase())) throw new Error('PAN format is invalid');
        if (['billingAddress', 'shippingAddress'].includes(input) && !validVendorAddress(value)) throw new Error(`${input} is invalid`);
        if (input === 'additionalContacts' && (!Array.isArray(value) || value.length > 20 || value.some((contact: any) => !validVendorContact(contact)))) throw new Error('Vendor contacts are invalid');
        if (input === 'primaryContact' && !validVendorContact(value, true)) throw new Error('Primary contact is invalid');
        if (input === 'customFields' && !validVendorCustomFields(value)) throw new Error('Vendor custom fields are invalid');
        if (input === 'bankDetails') normalizeVendorBankDetails(value);
        if (input === 'defaultExpenseAccountId' && value) {
          const account = await client.query("SELECT id FROM accounts WHERE organization_id = $1 AND id = $2 AND status = $3 AND type IN ('Expense', 'Other Expense')", [orgId, value, 'Active']);
          if (!account.rows.length) throw new Error('Default expense account does not belong to this organization or is inactive');
        }
      }
      const effectiveGstin = String(body.gstin ?? current.gstin ?? '').trim();
      const effectiveGstStatus = body.gstStatus ?? current.gst_status ?? 'Unregistered';
      if (effectiveGstStatus === 'Registered' && !effectiveGstin) throw new Error('GSTIN is required for a registered vendor');
      const columns = fields.filter(([input]) => Object.prototype.hasOwnProperty.call(body, input));
      if (!columns.length) return vendorResponse(current);
      const values = columns.map(([input, , normalize]) => normalize(body[input]));
      const assignments = columns.map(([, column], index) => `${column} = $${index + 1}`);
      const changedFields = columns.map(([input]) => input);
      values.push(orgId, req.params.id);
      const saved = await client.query(
        `UPDATE vendors SET ${assignments.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $${values.length - 1} AND id = $${values.length} RETURNING *`, values
      );
      await FinanceController.logAudit(orgId, req.auth!.userId, 'VENDOR_UPDATED', 'Vendor', req.params.id, { changedFields }, client, true);
      return vendorResponse(saved.rows[0]);
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Vendor could not be updated' });
      return;
    }
    if (!updated) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json(updated);
  }

  public static async archiveVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
    await FinanceController.setVendorActive(req, res, false);
  }

  public static async restoreVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
    await FinanceController.setVendorActive(req, res, true);
  }

  private static async setVendorActive(req: AuthenticatedRequest, res: Response, active: boolean): Promise<void> {
    const orgId = req.auth!.organizationId;
    const changed = await db.transaction(async (client) => {
      const result = await client.query('UPDATE vendors SET active = $1, updated_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3 AND (active <> $1 OR active IS NULL) RETURNING id', [active, orgId, req.params.id]);
      if (result.rows.length) {
        await FinanceController.logAudit(orgId, req.auth!.userId, active ? 'VENDOR_RESTORED' : 'VENDOR_ARCHIVED', 'Vendor', req.params.id, { active }, client, true);
        return true;
      }
      const exists = await client.query('SELECT active FROM vendors WHERE organization_id = $1 AND id = $2', [orgId, req.params.id]);
      if (!exists.rows.length) return null;
      return false;
    });
    if (changed === null) { res.status(404).json({ error: 'Vendor not found' }); return; }
    res.json({ id: req.params.id, active });
  }

  // --- PROJECTS ---
  public static async getProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows.map((row) => ({ ...row, start_date: FinanceController.projectDateValue(row.start_date) || null })));
  }

  public static async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { code, name, clientId, customerId, clientName, description, budgetType, totalBudget, hourlyRate, manager, startDate } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ error: 'Project code is required' });
      return;
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }
    if (code.trim().length > 64 || name.trim().length > 255 || (clientName !== undefined && (typeof clientName !== 'string' || clientName.length > 255)) || (description !== undefined && (typeof description !== 'string' || description.length > 10000)) || (manager !== undefined && (typeof manager !== 'string' || manager.length > 255))) {
      res.status(400).json({ error: 'Project metadata exceeds the allowed length' });
      return;
    }
    if (budgetType !== undefined && !['Fixed Cost', 'Time & Materials', 'Task Hours'].includes(budgetType)) {
      res.status(400).json({ error: 'Project budget type is invalid' });
      return;
    }

    const targetCustId = customerId || clientId;
    let resolvedClientName = clientName || '';

    if (targetCustId !== undefined && targetCustId !== '' && typeof targetCustId !== 'string') {
      res.status(400).json({ error: 'Project customer ID must be text' });
      return;
    }

    if (targetCustId && typeof targetCustId === 'string' && targetCustId.trim()) {
      const custRes = await db.query(
        `SELECT id, display_name, legal_name, active FROM customers WHERE organization_id = $1 AND id = $2`,
        [orgId, targetCustId.trim()]
      );
      if (custRes.rows.length > 0 && custRes.rows[0].active === false) {
        res.status(400).json({ error: 'Archived customers cannot be assigned to new projects' });
        return;
      }
      if (custRes.rows.length === 0) {
        const legacyClient = await db.query(
          `SELECT id, name AS display_name, company_name AS legal_name FROM clients WHERE organization_id = $1 AND id = $2`,
          [orgId, targetCustId.trim()]
        );
        if (legacyClient.rows.length > 0) {
          resolvedClientName = legacyClient.rows[0].display_name || legacyClient.rows[0].legal_name || resolvedClientName;
        } else {
        const otherOrgRes = await db.query(`SELECT organization_id FROM customers WHERE id = $1 UNION ALL SELECT organization_id FROM clients WHERE id = $1 LIMIT 1`, [targetCustId.trim()]);
        if (otherOrgRes.rows.length > 0) {
          res.status(400).json({ error: `Customer ${targetCustId} does not belong to organization ${orgId}` });
          return;
        }
        res.status(400).json({ error: `Customer ${targetCustId} not found` });
        return;
        }
      } else {
        resolvedClientName = custRes.rows[0].display_name || custRes.rows[0].legal_name || resolvedClientName;
      }
    }
    if (startDate !== undefined && startDate !== '' && !isIsoCalendarDate(startDate)) { res.status(400).json({ error: 'Project start date must be a real YYYY-MM-DD date' }); return; }

    const parsedBudget = Number(totalBudget || 0);
    const parsedHourlyRate = Number(hourlyRate || 0);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0 || !Number.isSafeInteger(Math.round(parsedBudget * 100)) || Math.abs(parsedBudget * 100 - Math.round(parsedBudget * 100)) > 1e-7 || !Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0 || !Number.isSafeInteger(Math.round(parsedHourlyRate * 100)) || Math.abs(parsedHourlyRate * 100 - Math.round(parsedHourlyRate * 100)) > 1e-7) {
      res.status(400).json({ error: 'Project budget and hourly rate must be safe non-negative two-decimal amounts' });
      return;
    }
    const prjId = newId('prj');
    const record = { id: prjId, code: code.trim(), name: name.trim(), clientId: targetCustId || '', clientName: resolvedClientName, description: description || '', status: 'Active', budgetType: budgetType || 'Fixed Cost', totalBudget: parsedBudget, hourlyRate: parsedHourlyRate, manager: manager || '', startDate: startDate || '', createdAt: new Date().toISOString() };
    try {
      await db.transaction(async (client) => {
        if (targetCustId) {
          const customer = await FinanceController.ensureCanonicalProjectCustomer(client, orgId, targetCustId.trim(), req.auth!.userId);
          if (customer.active === false) throw new Error('Project customer must be an active customer in this organization');
          record.clientName = customer.display_name || customer.legal_name || record.clientName;
        }
        await client.query(
          `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, description, status, budget_type, total_budget, hourly_rate, manager, start_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [record.id, orgId, record.code, record.name, record.clientId || null, record.clientName, record.description, record.status, record.budgetType, record.totalBudget, record.hourlyRate, record.manager, record.startDate || null]
        );
        await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, 'PROJECT_CREATED', 'Project', $4, $5)`, [newId('aud'), orgId, req.auth!.userId, prjId, JSON.stringify(record)]);
      });
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message).includes('duplicate key')) {
        res.status(409).json({ error: 'Project code already exists in this organization' });
        return;
      }
      if (String(error?.message).includes('active customer')) {
        res.status(400).json({ error: String(error.message) });
        return;
      }
      throw error;
    }
    res.status(201).json(record);
  }

  private static async ensureCanonicalProjectCustomer(client: any, orgId: string, customerId: string, userId: string): Promise<any> {
    let customer = await client.query(
      'SELECT id, display_name, legal_name, active FROM customers WHERE organization_id = $1 AND id = $2 FOR UPDATE',
      [orgId, customerId]
    );
    if (customer.rows.length === 1) return customer.rows[0];
    const legacy = await client.query(
      'SELECT id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms, notes FROM clients WHERE organization_id = $1 AND id = $2 FOR UPDATE',
      [orgId, customerId]
    );
    if (legacy.rows.length !== 1) throw new Error('PROJECT_CUSTOMER_INVALID');
    const row = legacy.rows[0];
    const promotion = await client.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, phone, billing_address, gstin, currency, payment_terms, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [row.id, orgId, row.id, row.name, row.company_name || row.name, row.email, row.phone, JSON.stringify(row.billing_address || ''), row.tax_id, (row.currency || 'USD').slice(0, 3), row.payment_terms || 'Net 30', row.notes]
    );
    customer = await client.query(
      'SELECT id, display_name, legal_name, active FROM customers WHERE organization_id = $1 AND id = $2 FOR UPDATE',
      [orgId, customerId]
    );
    if (customer.rows.length !== 1) throw new Error('PROJECT_CUSTOMER_INVALID');
    if (promotion.rows.length === 1) {
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'CUSTOMER_CANONICALIZED_FROM_CLIENT', 'Customer', $4, $5, $6)`,
        [newId('aud'), orgId, userId, customerId, JSON.stringify(row), JSON.stringify(customer.rows[0])]
      );
    }
    return customer.rows[0];
  }

  private static async projectHasLinks(client: any, orgId: string, projectId: string): Promise<boolean> {
    const linked = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM estimates WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM sales_orders WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM invoices WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM expenses WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM time_entries WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM journal_lines WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM employee_claim_items WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM budget_lines WHERE organization_id = $1 AND project_id = $2
         UNION ALL SELECT 1 FROM fixed_assets WHERE organization_id = $1 AND project_id = $2
       ) AS has_links`, [orgId, projectId]);
    return Boolean(linked.rows[0]?.has_links);
  }

  private static projectApiRecord(row: any): any {
    return {
      id: row.id, organizationId: row.organization_id, code: row.code, name: row.name,
      customerId: row.client_id || '', clientId: row.client_id || '', clientName: row.client_name || '',
      description: row.description || '', status: row.status, budgetType: row.budget_type,
      totalBudget: Number(row.total_budget || 0), hourlyRate: Number(row.hourly_rate || 0),
      manager: row.manager || '', startDate: FinanceController.projectDateValue(row.start_date),
      archivedAt: row.archived_at || null,
    };
  }

  private static projectDateValue(value: unknown): string {
    if (!value) return '';
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
  }

  public static async updateProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const body = req.body || {};
    const allowed = new Set(['code', 'name', 'customerId', 'clientId', 'description', 'status', 'budgetType', 'totalBudget', 'hourlyRate', 'manager', 'startDate']);
    const unknown = Object.keys(body).filter((key) => !allowed.has(key));
    if (unknown.length) { res.status(400).json({ error: `Unsupported project fields: ${unknown.join(', ')}` }); return; }
    if (body.code !== undefined && (typeof body.code !== 'string' || !body.code.trim() || body.code.trim().length > 64)) { res.status(400).json({ error: 'Project code must be 1-64 characters' }); return; }
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 255)) { res.status(400).json({ error: 'Project name must be 1-255 characters' }); return; }
    if (body.description !== undefined && (typeof body.description !== 'string' || body.description.length > 10000)) { res.status(400).json({ error: 'Project description is too long' }); return; }
    if (body.manager !== undefined && (typeof body.manager !== 'string' || body.manager.length > 255)) { res.status(400).json({ error: 'Project manager is invalid' }); return; }
    if (body.status !== undefined && !['Active', 'On Hold', 'Completed', 'Cancelled'].includes(body.status)) { res.status(400).json({ error: 'Project status is invalid' }); return; }
    if (body.budgetType !== undefined && !['Fixed Cost', 'Time & Materials', 'Task Hours'].includes(body.budgetType)) { res.status(400).json({ error: 'Project budget type is invalid' }); return; }
    for (const key of ['totalBudget', 'hourlyRate']) {
      if (body[key] !== undefined) {
        const amount = Number(body[key]);
        if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) { res.status(400).json({ error: `${key} must be a safe non-negative two-decimal amount` }); return; }
      }
    }
    if (body.startDate !== undefined && body.startDate !== null && body.startDate !== '' && !isIsoCalendarDate(body.startDate)) { res.status(400).json({ error: 'Project start date must be a real YYYY-MM-DD date' }); return; }
    const requestedCustomerId = body.customerId !== undefined ? body.customerId : body.clientId;
    if (requestedCustomerId !== undefined && requestedCustomerId !== null && requestedCustomerId !== '' && (typeof requestedCustomerId !== 'string' || requestedCustomerId.length > 64)) { res.status(400).json({ error: 'Project customer ID is invalid' }); return; }
    try {
      const result = await db.transaction(async (client) => {
        const snapshot = await client.query('SELECT client_id FROM projects WHERE organization_id = $1 AND id = $2', [orgId, req.params.id]);
        if (snapshot.rows.length !== 1) throw new Error('PROJECT_NOT_FOUND');
        const snapshotCustomerId = snapshot.rows[0].client_id || null;
        const targetCustomerId = requestedCustomerId === undefined ? snapshotCustomerId : (requestedCustomerId || null);
        let reassignedCustomer: any = null;
        if (requestedCustomerId !== undefined && targetCustomerId && targetCustomerId !== snapshotCustomerId) {
          reassignedCustomer = await FinanceController.ensureCanonicalProjectCustomer(client, orgId, targetCustomerId, req.auth!.userId);
          if (reassignedCustomer.active === false) throw new Error('PROJECT_CUSTOMER_ARCHIVED');
        }
        const selected = await client.query('SELECT * FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, req.params.id]);
        if (selected.rows.length !== 1) throw new Error('PROJECT_NOT_FOUND');
        const current = selected.rows[0];
        if (requestedCustomerId !== undefined && (current.client_id || null) !== snapshotCustomerId && targetCustomerId !== (current.client_id || null)) throw new Error('PROJECT_CUSTOMER_CHANGED');
        if (current.archived_at) throw new Error('PROJECT_ARCHIVED');
        const hasLinks = await FinanceController.projectHasLinks(client, orgId, current.id);
        const nextCustomerId = requestedCustomerId === undefined ? current.client_id : (requestedCustomerId || null);
        const nextCode = body.code === undefined ? current.code : body.code.trim();
        if (hasLinks && (nextCustomerId || null) !== (current.client_id || null)) throw new Error('PROJECT_LINKED_FIELDS_FROZEN');
        if (hasLinks && nextCode !== current.code) throw new Error('PROJECT_LINKED_FIELDS_FROZEN');
        let nextClientName = current.client_name || '';
        if (requestedCustomerId !== undefined && nextCustomerId && nextCustomerId !== current.client_id) {
          if (!reassignedCustomer) throw new Error('PROJECT_CUSTOMER_INVALID');
          nextClientName = reassignedCustomer.display_name || reassignedCustomer.legal_name || nextClientName || '';
        } else if (requestedCustomerId !== undefined && !nextCustomerId) nextClientName = '';
        const after = {
          ...current, code: nextCode, name: body.name === undefined ? current.name : body.name.trim(), client_id: nextCustomerId,
          client_name: nextClientName || '', description: body.description === undefined ? current.description : body.description,
          status: body.status === undefined ? current.status : body.status,
          budget_type: body.budgetType === undefined ? current.budget_type : body.budgetType,
          total_budget: body.totalBudget === undefined ? current.total_budget : Number(body.totalBudget),
          hourly_rate: body.hourlyRate === undefined ? current.hourly_rate : Number(body.hourlyRate),
          manager: body.manager === undefined ? current.manager : body.manager,
          start_date: body.startDate === undefined ? current.start_date : (body.startDate || null),
        };
        const changed = ['code', 'name', 'client_id', 'client_name', 'description', 'status', 'budget_type', 'total_budget', 'hourly_rate', 'manager']
          .some((key) => String(current[key] ?? '') !== String(after[key] ?? ''))
          || FinanceController.projectDateValue(current.start_date) !== FinanceController.projectDateValue(after.start_date);
        if (!changed) return { row: current, changed: false };
        const updated = await client.query(
          `UPDATE projects SET code=$1, name=$2, client_id=$3, client_name=$4, description=$5, status=$6, budget_type=$7,
             total_budget=$8, hourly_rate=$9, manager=$10, start_date=$11 WHERE organization_id=$12 AND id=$13 RETURNING *`,
          [after.code, after.name, after.client_id, after.client_name, after.description, after.status, after.budget_type, after.total_budget, after.hourly_rate, after.manager, after.start_date, orgId, current.id]
        );
        await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state) VALUES ($1,$2,$3,'PROJECT_UPDATED','Project',$4,$5,$6)`, [newId('aud'), orgId, req.auth!.userId, current.id, JSON.stringify(current), JSON.stringify(updated.rows[0])]);
        return { row: updated.rows[0], changed: true };
      });
      res.json({ ...FinanceController.projectApiRecord(result.row), changed: result.changed });
    } catch (error: any) {
      const message = String(error?.message || 'Project could not be updated');
      if (message === 'PROJECT_NOT_FOUND') { res.status(404).json({ error: 'Project not found' }); return; }
      if (message === 'PROJECT_ARCHIVED') { res.status(409).json({ error: 'Archived projects cannot be edited' }); return; }
      if (message === 'PROJECT_CUSTOMER_CHANGED') { res.status(409).json({ error: 'Project customer changed concurrently; retry the update' }); return; }
      if (message === 'PROJECT_LINKED_FIELDS_FROZEN') { res.status(409).json({ error: 'Project code and customer are frozen after the project has linked records' }); return; }
      if (message.startsWith('PROJECT_CUSTOMER')) { res.status(400).json({ error: 'Project customer must be an active customer in this organization' }); return; }
      if (error?.code === '23505') { res.status(409).json({ error: 'Project code already exists in this organization' }); return; }
      throw error;
    }
  }

  public static async archiveProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const selected = await client.query('SELECT * FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, req.params.id]);
      if (selected.rows.length !== 1) return null;
      const current = selected.rows[0];
      if (current.archived_at) return { row: current, changed: false };
      const updated = await client.query('UPDATE projects SET archived_at = CURRENT_TIMESTAMP, archived_by = $1 WHERE organization_id = $2 AND id = $3 AND archived_at IS NULL RETURNING *', [req.auth!.userId, orgId, current.id]);
      if (updated.rows.length !== 1) return { row: current, changed: false };
      await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state) VALUES ($1,$2,$3,'PROJECT_ARCHIVED','Project',$4,$5,$6)`, [newId('aud'), orgId, req.auth!.userId, current.id, JSON.stringify(current), JSON.stringify(updated.rows[0])]);
      return { row: updated.rows[0], changed: true };
    });
    if (!result) { res.status(404).json({ error: 'Project not found' }); return; }
    res.json({ id: result.row.id, archived: Boolean(result.row.archived_at), changed: result.changed, archivedAt: result.row.archived_at || null });
  }

  public static async getTimeEntries(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query(
      `SELECT * FROM time_entries WHERE organization_id = $1 ORDER BY date DESC, created_at DESC`,
      [orgId]
    );
    res.json(result.rows.map((row) => ({
      id: row.id, organizationId: row.organization_id, projectId: row.project_id,
      projectName: row.project_name, clientName: row.client_name || '', staffName: row.staff_name,
      taskName: row.task_name, date: row.date, hours: Number(row.hours), hourlyRate: Number(row.hourly_rate),
      isBillable: Boolean(row.is_billable), isBilled: Boolean(row.is_billed),
      invoiceId: row.invoice_id || undefined, description: row.description || '',
    })));
  }

  private static validateTimeEntryInput(input: any): string | null {
    const hours = Number(input.hours);
    const hourlyRate = Number(input.hourlyRate);
    if (!input.projectId || !isIsoCalendarDate(input.date) || !String(input.staffName || '').trim() || !String(input.taskName || '').trim()) {
      return 'Project, date, staff name, and task name are required';
    }
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.abs(hours * 100 - Math.round(hours * 100)) > 1e-7) {
      return 'Hours must be greater than zero, no more than 24, and contain at most two decimals';
    }
    if (!Number.isFinite(hourlyRate) || hourlyRate < 0 || !Number.isSafeInteger(Math.round(hourlyRate * 100)) || Math.abs(hourlyRate * 100 - Math.round(hourlyRate * 100)) > 1e-7) {
      return 'Hourly rate must be a safe non-negative amount with at most two decimals';
    }
    if (String(input.staffName).trim().length > 255 || String(input.taskName).trim().length > 255 || String(input.description || '').length > 10000) {
      return 'Time-entry text exceeds the allowed length';
    }
    return null;
  }

  public static async createTimeEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const validationError = FinanceController.validateTimeEntryInput(req.body);
    if (validationError) { res.status(400).json({ error: validationError }); return; }
    const { projectId, staffName, taskName, date, description } = req.body;
    const hours = Number(req.body.hours);
    const hourlyRate = Number(req.body.hourlyRate);
    const isBillable = req.body.isBillable !== false;
    const id = newId('time');
    try {
      const record = await db.transaction(async (client) => {
        const projectResult = await client.query(
          `SELECT id, name, client_name, archived_at FROM projects WHERE organization_id = $1 AND id = $2 AND status <> 'Cancelled' FOR UPDATE`,
          [orgId, projectId]
        );
        if (projectResult.rows.length !== 1) throw new Error('Project does not belong to this organization or is cancelled');
        const project = projectResult.rows[0];
        if (project.archived_at) throw new Error('Archived projects cannot receive new time entries');
        await client.query(
          `INSERT INTO time_entries (id, organization_id, project_id, project_name, client_name, staff_name, task_name, date, hours, hourly_rate, is_billable, is_billed, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, FALSE, $12)`,
          [id, orgId, projectId, project.name, project.client_name || '', String(staffName).trim(), String(taskName).trim(), date, hours, hourlyRate, isBillable, description || '']
        );
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'TIME_ENTRY_CREATED', 'TimeEntry', $4, $5)`,
          [newId('aud'), orgId, req.auth!.userId, id, JSON.stringify({ projectId, date, hours, hourlyRate, isBillable })]
        );
        return { id, projectId, projectName: project.name, clientName: project.client_name || '', staffName: String(staffName).trim(), taskName: String(taskName).trim(), date, hours, hourlyRate, isBillable, isBilled: false, description: description || '' };
      });
      res.status(201).json(record);
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Time entry could not be saved' });
    }
  }

  public static async updateTimeEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const updated = await db.transaction(async (client) => {
        const existingResult = await client.query(`SELECT * FROM time_entries WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, req.params.id]);
        if (existingResult.rows.length !== 1) throw new Error('Time entry was not found in this organization');
        const existing = existingResult.rows[0];
        if (existing.is_billed) throw new Error('Billed time is immutable; correct it through the invoice adjustment workflow');
        const merged = {
          projectId: req.body.projectId ?? existing.project_id, staffName: req.body.staffName ?? existing.staff_name,
          taskName: req.body.taskName ?? existing.task_name, date: req.body.date ?? existing.date,
          hours: req.body.hours ?? existing.hours, hourlyRate: req.body.hourlyRate ?? existing.hourly_rate,
          isBillable: req.body.isBillable ?? existing.is_billable, description: req.body.description ?? existing.description,
        };
        const validationError = FinanceController.validateTimeEntryInput(merged);
        if (validationError) throw new Error(validationError);
        const projectResult = await client.query(`SELECT id, name, client_name, archived_at FROM projects WHERE organization_id = $1 AND id = $2 AND status <> 'Cancelled' FOR UPDATE`, [orgId, merged.projectId]);
        if (projectResult.rows.length !== 1) throw new Error('Project does not belong to this organization or is cancelled');
        const project = projectResult.rows[0];
        const financialChanged = String(merged.projectId) !== String(existing.project_id) ||
          String(merged.date).slice(0, 10) !== String(existing.date).slice(0, 10) ||
          Number(merged.hours) !== Number(existing.hours) || Number(merged.hourlyRate) !== Number(existing.hourly_rate) ||
          Boolean(merged.isBillable) !== Boolean(existing.is_billable);
        if (project.archived_at && financialChanged) throw new Error('Archived project time cannot be reassigned or financially changed');
        await client.query(
          `UPDATE time_entries SET project_id = $1, project_name = $2, client_name = $3, staff_name = $4, task_name = $5, date = $6, hours = $7, hourly_rate = $8, is_billable = $9, description = $10
           WHERE organization_id = $11 AND id = $12`,
          [merged.projectId, project.name, project.client_name || '', String(merged.staffName).trim(), String(merged.taskName).trim(), merged.date, Number(merged.hours), Number(merged.hourlyRate), Boolean(merged.isBillable), merged.description || '', orgId, req.params.id]
        );
        await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state) VALUES ($1, $2, $3, 'TIME_ENTRY_UPDATED', 'TimeEntry', $4, $5, $6)`, [newId('aud'), orgId, req.auth!.userId, req.params.id, JSON.stringify(existing), JSON.stringify(merged)]);
        return { id: req.params.id, ...merged, projectName: project.name, clientName: project.client_name || '', hours: Number(merged.hours), hourlyRate: Number(merged.hourlyRate), isBilled: false };
      });
      res.json(updated);
    } catch (error: any) { res.status(422).json({ error: error.message || 'Time entry could not be updated' }); }
  }

  public static async deleteTimeEntry(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      await db.transaction(async (client) => {
        const existing = await client.query(`SELECT * FROM time_entries WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, req.params.id]);
        if (existing.rows.length !== 1) throw new Error('Time entry was not found in this organization');
        if (existing.rows[0].is_billed) throw new Error('Billed time cannot be deleted');
        await client.query(`DELETE FROM time_entries WHERE organization_id = $1 AND id = $2`, [orgId, req.params.id]);
        await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state) VALUES ($1, $2, $3, 'TIME_ENTRY_DELETED', 'TimeEntry', $4, $5)`, [newId('aud'), orgId, req.auth!.userId, req.params.id, JSON.stringify(existing.rows[0])]);
      });
      res.status(204).end();
    } catch (error: any) { res.status(422).json({ error: error.message || 'Time entry could not be deleted' }); }
  }

  public static async getProjectSummaries(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const [projects, invoices, expenses, timeEntries] = await Promise.all([
      db.query(`SELECT id, budget_type, total_budget FROM projects WHERE organization_id = $1`, [orgId]),
      db.query(`SELECT project_id, total_amount, paid_amount FROM invoices WHERE organization_id = $1 AND project_id IS NOT NULL AND status NOT IN ('VOID', 'VOIDED')`, [orgId]),
      db.query(`SELECT project_id, amount FROM expenses WHERE organization_id = $1 AND project_id IS NOT NULL AND status <> 'VOIDED'`, [orgId]),
      db.query(`SELECT project_id, hours, hourly_rate, is_billable, is_billed FROM time_entries WHERE organization_id = $1`, [orgId]),
    ]);
    const summaries = projects.rows.map((project) => {
      const projectInvoices = invoices.rows.filter((row) => row.project_id === project.id);
      const projectExpenses = expenses.rows.filter((row) => row.project_id === project.id);
      const projectTime = timeEntries.rows.filter((row) => row.project_id === project.id);
      const totalInvoiced = projectInvoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
      const totalCollected = projectInvoices.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
      const directExpenses = projectExpenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const totalLoggedHours = projectTime.reduce((sum, row) => sum + Number(row.hours || 0), 0);
      const unbilledHoursAmount = projectTime
        .filter((row) => row.is_billable && !row.is_billed)
        .reduce((sum, row) => sum + Number(row.hours || 0) * Number(row.hourly_rate || 0), 0);
      const netProfit = totalInvoiced - directExpenses;
      const budget = Number(project.total_budget || 0);
      const budgetBasis = project.budget_type === 'Task Hours' ? totalLoggedHours : directExpenses;
      return {
        projectId: project.id,
        totalInvoiced: Math.round(totalInvoiced * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        directExpenses: Math.round(directExpenses * 100) / 100,
        unbilledHoursAmount: Math.round(unbilledHoursAmount * 100) / 100,
        totalLoggedHours: Math.round(totalLoggedHours * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        profitMarginPercent: totalInvoiced > 0 ? Math.round((netProfit / totalInvoiced) * 1000) / 10 : 0,
        budgetUsedPercent: budget > 0 ? Math.round((budgetBasis / budget) * 1000) / 10 : 0,
      };
    });
    res.json(summaries);
  }

  public static async getProjectProfitabilityReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const report = await ProjectReportingService.getProfitabilityReport(req.auth!.organizationId, {
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        projectId: req.query.projectId as string | undefined,
      });
      res.json(report);
    } catch (error: any) {
      const message = error?.message || 'Project profitability report could not be generated';
      res.status(message.includes('was not found') ? 404 : 400).json({ error: message });
    }
  }

  public static async invoiceUnbilledTime(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const issueDate = req.body.issueDate || new Date().toISOString().split('T')[0];
    const dueDate = req.body.dueDate || issueDate;
    if (!isIsoCalendarDate(issueDate) || !isIsoCalendarDate(dueDate) || dueDate < issueDate) {
      res.status(400).json({ error: 'Valid issue and due dates are required' }); return;
    }
    try {
      const result = await db.transaction(async (client) => {
        const identity = await client.query('SELECT client_id FROM projects WHERE organization_id = $1 AND id = $2', [orgId, req.params.id]);
        const invoiceNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', issueDate, undefined, client);
        if (identity.rows.length !== 1) throw new Error('Project was not found in this organization');
        if (!identity.rows[0].client_id) throw new Error('Project must have a verified customer before time can be invoiced');
        await client.query('SELECT id FROM customers WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, identity.rows[0].client_id]);
        const projectResult = await client.query(`SELECT * FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, req.params.id]);
        if (projectResult.rows.length !== 1) throw new Error('Project was not found in this organization');
        const project = projectResult.rows[0];
        if (!project.client_id) throw new Error('Project must have a verified customer before time can be invoiced');
        if (project.client_id !== identity.rows[0].client_id) throw new Error('Project customer changed while time was being invoiced; retry the operation');
        const entriesResult = await client.query(
          `SELECT * FROM time_entries WHERE organization_id = $1 AND project_id = $2 AND is_billable = TRUE AND is_billed = FALSE ORDER BY date, created_at FOR UPDATE`,
          [orgId, req.params.id]
        );
        if (entriesResult.rows.length === 0) throw new Error('No unbilled billable time exists for this project');
        const invoice = await SalesEngine.createAndPostInvoice(orgId, {
          customerId: project.client_id,
          customerName: project.client_name,
          invoiceNumber,
          projectId: project.id,
          issueDate,
          dueDate,
          lineItems: entriesResult.rows.map((entry) => ({
            description: `${entry.task_name} — ${entry.staff_name} (${entry.date})`,
            quantity: Number(entry.hours), unitPrice: Number(entry.hourly_rate), taxRate: 0,
          })),
          notes: `Billable time for project ${project.code} — ${project.name}`,
          status: 'POSTED', createdBy: req.auth!.userId,
        }, client, undefined, { allowArchivedProjectId: project.archived_at ? project.id : undefined, allowArchivedCustomerId: project.client_id });
        for (const entry of entriesResult.rows) {
          await client.query(`UPDATE time_entries SET is_billed = TRUE, invoice_id = $1 WHERE organization_id = $2 AND id = $3 AND is_billed = FALSE`, [invoice.id, orgId, entry.id]);
        }
        await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, 'PROJECT_TIME_INVOICED', 'Project', $4, $5)`, [newId('aud'), orgId, req.auth!.userId, project.id, JSON.stringify({ invoiceId: invoice.id, timeEntryIds: entriesResult.rows.map((entry) => entry.id), totalAmount: invoice.totalAmount })]);
        return invoice;
      });
      res.status(201).json(result);
    } catch (error: any) {
      const message = error.message || 'Project time could not be invoiced';
      res.status(message.includes('No unbilled') ? 409 : 422).json({ error: message });
    }
  }

  // --- INVOICES ---
  public static async getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    let queryText = 'SELECT * FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC';
    const params: any[] = [orgId];
    if (limit && Number.isFinite(limit) && limit > 0) {
      queryText += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }
    const result = await db.query(queryText, params);
    if (result.rows.length === 0) {
      res.json([]);
      return;
    }

    const invoiceIds = result.rows.map((r) => r.id);
    const itemResult = await db.query(
      `SELECT id, invoice_id, description, account_id, quantity, unit_price, tax_rate, amount
         FROM invoice_items WHERE organization_id = $1 AND invoice_id = ANY($2::text[]) ORDER BY id`,
      [orgId, invoiceIds]
    );
    const itemsByInvoiceId = new Map<string, any[]>();
    for (const item of itemResult.rows) {
      const list = itemsByInvoiceId.get(item.invoice_id) || [];
      list.push({
        id: item.id,
        description: item.description,
        accountId: item.account_id,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price),
        taxRate: Number(item.tax_rate),
        amount: Number(item.amount),
      });
      itemsByInvoiceId.set(item.invoice_id, list);
    }

    const invoices = result.rows.map((invoice) => ({
      id: invoice.id,
      organizationId: invoice.organization_id,
      invoiceNumber: invoice.invoice_number,
      clientId: invoice.client_id || invoice.customer_id || '',
      clientName: invoice.client_name,
      clientEmail: invoice.client_email || '',
      projectId: invoice.project_id || undefined,
      salesOrderId: invoice.sales_order_id || undefined,
      estimateId: invoice.estimate_id || undefined,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      items: itemsByInvoiceId.get(invoice.id) || [],
      subtotal: Number(invoice.subtotal),
      taxTotal: Number(invoice.tax_total),
      discount: Number(invoice.discount),
      totalAmount: Number(invoice.total_amount),
      paidAmount: Number(invoice.paid_amount),
      balanceDue: Number(invoice.balance_due),
      status: invoice.status,
      journalEntryId: invoice.journal_entry_id || undefined,
      reversalJournalId: invoice.reversal_journal_id || undefined,
      notes: invoice.notes || '',
      createdAt: invoice.created_at,
      editVersion: String(invoice.edit_version ?? 1),
    }));
    res.json(invoices);
  }

  public static async getInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { id } = req.params;
      const result = await db.query('SELECT * FROM invoices WHERE organization_id = $1 AND id = $2', [orgId, id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: `Invoice ${id} not found` });
        return;
      }
      const inv = result.rows[0];
      const customerSnapshot = typeof inv.customer_snapshot === 'string'
        ? JSON.parse(inv.customer_snapshot)
        : inv.customer_snapshot || null;

      const itemResult = await db.query(
        `SELECT id, invoice_id, description, account_id, quantity, unit_price, tax_rate, amount
           FROM invoice_items WHERE organization_id = $1 AND invoice_id = $2 ORDER BY id`,
        [orgId, id]
      );
      const lineItems = itemResult.rows.length > 0
        ? itemResult.rows.map((item) => ({
            id: item.id,
            description: item.description,
            accountId: item.account_id,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unit_price),
            taxRate: Number(item.tax_rate),
            amount: Number(item.amount),
          }))
        : typeof inv.line_items === 'string'
          ? JSON.parse(inv.line_items)
          : inv.line_items || [];

      res.json({
        invoice: {
          id: inv.id,
          organizationId: inv.organization_id,
          invoiceNumber: inv.invoice_number,
          salesOrderId: inv.sales_order_id,
          estimateId: inv.estimate_id,
          customerId: inv.customer_id || inv.client_id || '',
          customerName: inv.client_name || '',
          customerEmail: inv.client_email || '',
          customerSnapshot,
          projectId: inv.project_id || undefined,
          issueDate: inv.issue_date,
          dueDate: inv.due_date,
          subtotal: Number(inv.subtotal || 0),
          taxTotal: Number(inv.tax_total || 0),
          discount: Number(inv.discount || 0),
          roundOffAmount: Number(inv.round_off_amount || 0),
          isGstInclusive: Boolean(inv.is_gst_inclusive),
          totalAmount: Number(inv.total_amount || 0),
          paidAmount: Number(inv.paid_amount || 0),
          balanceDue: Number(inv.balance_due || 0),
          status: inv.status,
          journalEntryId: inv.journal_entry_id || undefined,
          reversalJournalId: inv.reversal_journal_id || undefined,
          editVersion: String(inv.edit_version ?? 1),
          lineItems,
          notes: inv.notes || '',
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get invoice' });
    }
  }

  public static async getInvoicePdf(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { id } = req.params;
      const source = await db.query('SELECT id FROM invoices WHERE organization_id = $1 AND id = $2', [orgId, id]);
      if (!source.rows.length) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      const artifact = await DocumentPdfArtifactService.findLatestIssuedArtifact(db, {
        organizationId: orgId,
        category: 'invoices',
        documentId: id,
      });
      if (!artifact || artifact.artifactState !== 'ISSUED' || !artifact.pdfBytes) {
        const result = await DocumentPdfService.generatePdf(db, orgId, 'invoices', id, undefined, {
          preview: false,
          persistSnapshot: false,
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(result.pdf.length));
        res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
        res.setHeader('X-Document-Pdf-Template', result.templateId);
        res.send(result.pdf);
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(artifact.pdfBytes.length));
      res.setHeader('Content-Disposition', 'inline; filename="' + (artifact.filename || 'invoice.pdf').replaceAll('"', '') + '"');
      res.setHeader('X-Document-Pdf-Artifact', artifact.id);
      res.setHeader('X-Document-Pdf-Issuance', String(artifact.issuanceNumber));
      res.setHeader('X-Document-Pdf-SHA256', artifact.pdfSha256 || '');
      res.send(artifact.pdfBytes);
    } catch (err: any) {
      console.error('GET_ISSUED_INVOICE_PDF_ERROR:', err);
      res.status(500).json({ error: err.message || 'Failed to retrieve issued invoice PDF' });
    }
  }

  /**
   * Canonical PDF endpoint for every document family.  The category and
   * template are allow-listed by DocumentPdfService; all source data remains
   * scoped to the authenticated organization in the query itself.
   */
  public static async getDocumentPdf(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: `Unsupported document PDF category: ${category}` });
        return;
      }
      if (req.query.preview !== 'true') {
        const artifact = await DocumentPdfArtifactService.findLatestIssuedArtifact(db, {
          organizationId: req.auth!.organizationId,
          category,
          documentId: req.params.id,
        });
        if (artifact) {
          if (req.query.templateId) {
            res.status(409).json({ error: 'An issued PDF cannot be rendered with a different template; use preview to inspect changes' });
            return;
          }
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Length', String(artifact.pdfBytes!.length));
          res.setHeader('Content-Disposition', 'inline; filename="' + (artifact.filename || 'document.pdf').replaceAll('"', '') + '"');
          res.setHeader('X-Document-Pdf-Artifact', artifact.id);
          res.setHeader('X-Document-Pdf-Issuance', String(artifact.issuanceNumber));
          res.setHeader('X-Document-Pdf-SHA256', artifact.pdfSha256 || '');
          res.send(artifact.pdfBytes);
          return;
        }
      }
      const result = await DocumentPdfService.generatePdf(
        db,
        req.auth!.organizationId,
        category,
        req.params.id,
        typeof req.query.templateId === 'string' ? req.query.templateId : undefined,
        {
          fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
          toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
          preview: req.query.preview === 'true',
        }
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(result.pdf.length));
      res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
      res.setHeader('X-Document-Pdf-Template', result.templateId);
      res.send(result.pdf);
    } catch (err: any) {
      const message = err?.message || 'Failed to generate document PDF';
      const status = /not found/i.test(message) ? 404 : /Unsupported/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  }

  public static async issueDocumentPdf(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: 'Unsupported document PDF category' });
        return;
      }
      const idempotencyKey = req.header('idempotency-key') || '';
      const artifact = await DocumentPdfService.issuePdf(
        req.auth!.organizationId,
        category,
        req.params.id,
        req.auth!.userId,
        idempotencyKey,
        typeof req.body?.templateId === 'string' ? req.body.templateId : undefined,
        {
          fromDate: typeof req.body?.fromDate === 'string' ? req.body.fromDate : undefined,
          toDate: typeof req.body?.toDate === 'string' ? req.body.toDate : undefined,
          reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
        },
      );
      if (!artifact.pdfBytes || artifact.artifactState !== 'ISSUED') {
        res.status(500).json({ error: 'Issued PDF artifact is unavailable' });
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(artifact.pdfBytes.length));
      res.setHeader('Content-Disposition', 'inline; filename="' + (artifact.filename || 'document.pdf').replaceAll('"', '') + '"');
      res.setHeader('X-Document-Pdf-Artifact', artifact.id);
      res.setHeader('X-Document-Pdf-Issuance', String(artifact.issuanceNumber));
      res.setHeader('X-Document-Pdf-SHA256', artifact.pdfSha256 || '');
      res.send(artifact.pdfBytes);
    } catch (err: any) {
      const message = err?.message || 'Failed to issue document PDF';
      const status = /conflict|already belongs|identity already exists|already used with different/i.test(message) ? 409
        : /not found/i.test(message) ? 404
          : /required|finalized|exceeds|unsupported|amounts? (are|must|is)|supported range/i.test(message) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  }

  public static async getIssuedDocumentPdf(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: 'Unsupported document PDF category' });
        return;
      }
      const artifact = await DocumentPdfArtifactService.findArtifactById(
        db,
        req.auth!.organizationId,
        req.params.artifactId,
      );
      if (!artifact || artifact.category !== category) {
        res.status(404).json({ error: 'Issued PDF artifact not found' });
        return;
      }
      if (artifact.artifactState !== 'ISSUED' || !artifact.pdfBytes) {
        res.status(410).json({ error: 'This historical snapshot contains metadata only; its original PDF bytes are unavailable' });
        return;
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(artifact.pdfBytes.length));
      res.setHeader('Content-Disposition', 'inline; filename="' + (artifact.filename || 'document.pdf').replaceAll('"', '') + '"');
      res.setHeader('X-Document-Pdf-Issuance', String(artifact.issuanceNumber));
      res.setHeader('X-Document-Pdf-SHA256', artifact.pdfSha256 || '');
      res.send(artifact.pdfBytes);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to retrieve issued document PDF' });
    }
  }

  public static async getRecentPdfDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: `Unsupported document PDF category: ${category}` });
        return;
      }
      const documents = await DocumentPdfService.listRecentDocuments(db, req.auth!.organizationId, category);
      res.json({ category, templateIds: DocumentPdfService.getTemplateIds(category), documents });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list recent documents' });
    }
  }

  public static async getDocumentTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: `Unsupported document PDF category: ${category}` });
        return;
      }
      const templates = await DocumentTemplateService.list(db, req.auth!.organizationId, category);
      const defaultTemplate = await DocumentTemplateService.resolve(db, req.auth!.organizationId, category);
      res.json({
        category, templates, templateIds: DocumentPdfService.getTemplateIds(category),
        defaultTemplateId: defaultTemplate?.id || null,
        defaultModelId: defaultTemplate?.modelId || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to list document templates' });
    }
  }

  public static async updateDocumentTemplateConfiguration(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: `Unsupported document PDF category: ${category}` });
        return;
      }
      const configuration = req.body?.configuration;
      if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
        res.status(400).json({ error: 'Template configuration must be an object' });
        return;
      }
      const template = await DocumentTemplateService.updateConfiguration(
        db, req.auth!.organizationId, category, String(req.params.templateId || ''), configuration, req.auth!.userId,
      );
      res.json({ category, template });
    } catch (err: any) {
      const message = err?.message || 'Failed to update document template configuration';
      const status = /not found/i.test(message) ? 404 : /not available/i.test(message) ? 503 : 400;
      res.status(status).json({ error: message });
    }
  }

  public static async setDocumentTemplateDefault(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: `Unsupported document PDF category: ${category}` });
        return;
      }
      const template = await DocumentTemplateService.setOrganizationDefault(
        db,
        req.auth!.organizationId,
        category,
        String(req.params.templateId || ''),
        req.auth!.userId
      );
      StaticMetadataCache.invalidate(req.auth!.organizationId, 'current_org_profile');
      res.json({ category, template });
    } catch (err: any) {
      const message = err?.message || 'Failed to set document template default';
      res.status(/not found/i.test(message) ? 404 : 400).json({ error: message });
    }
  }

  public static async restoreDocumentTemplateDefault(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: `Unsupported document PDF category: ${category}` });
        return;
      }
      const template = await DocumentTemplateService.restoreBuiltInDefault(
        db,
        req.auth!.organizationId,
        category,
        req.auth!.userId
      );
      StaticMetadataCache.invalidate(req.auth!.organizationId, 'current_org_profile');
      res.json({ category, template });
    } catch (err: any) {
      const message = err?.message || 'Failed to restore document template default';
      res.status(400).json({ error: message });
    }
  }

  public static async getSamplePreviewPdf(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const category = String(req.params.category || '');
      if (!DocumentPdfService.isSupportedCategory(category)) {
        res.status(400).json({ error: `Unsupported document PDF category: ${category}` });
        return;
      }
      const requestedTemplateId = typeof req.query.templateId === 'string' ? req.query.templateId : undefined;
      const customConfig: Record<string, any> = {};
      if (typeof req.query.paperSize === 'string') customConfig.paperSize = req.query.paperSize;
      if (typeof req.query.orientation === 'string') customConfig.orientation = req.query.orientation;
      if (typeof req.query.fontFamily === 'string') customConfig.fontFamily = req.query.fontFamily;
      if (typeof req.query.primaryColor === 'string') {
        if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(req.query.primaryColor)) {
          res.status(400).json({ error: 'Invalid primary brand color hex format' });
          return;
        }
        customConfig.primaryColor = req.query.primaryColor;
      }
      if (typeof req.query.accentColor === 'string') {
        if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(req.query.accentColor)) {
          res.status(400).json({ error: 'Invalid accent brand color hex format' });
          return;
        }
        customConfig.accentColor = req.query.accentColor;
      }
      if (typeof req.query.templateTitle === 'string') customConfig.templateTitle = req.query.templateTitle;

      const result = await DocumentPdfService.generateSamplePreviewPdf(
        db,
        req.auth!.organizationId,
        category,
        requestedTemplateId,
        customConfig
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(result.pdf.length));
      res.setHeader('Content-Disposition', `inline; filename="${result.filename}"`);
      res.setHeader('X-Document-Pdf-Template', result.templateId);
      res.setHeader('X-Document-Pdf-Sample-Preview', 'true');
      res.send(result.pdf);
    } catch (err: any) {
      const message = err?.message || 'Failed to generate sample PDF preview';
      res.status(400).json({ error: message });
    }
  }

  public static async sendInvoiceEmail(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { id } = req.params;
      const { recipientEmail, subject, message } = req.body || {};
      const queued = await db.transaction(async (client) => {
        const initial = await client.query('SELECT status, sales_order_id FROM invoices WHERE organization_id = $1 AND id = $2', [orgId, id]);
        if (!initial.rows.length) throw new Error('INVOICE_NOT_FOUND: Invoice does not exist');
        let status = String(initial.rows[0].status || '').toUpperCase();
        if (['VOID', 'VOIDED'].includes(status)) throw new Error('INVOICE_VOIDED: Cannot send a voided invoice');
        if (status === 'SUBMITTED') throw new Error('INVOICE_APPROVAL_PENDING: Invoice is awaiting approval and cannot be sent until approved and posted');
        if (status === 'DRAFT') {
          const canCreate = await RbacService.hasPermissionAsync(orgId, req.auth!.role, 'invoices.create', true);
          const canPost = await RbacService.hasPermissionAsync(orgId, req.auth!.role, 'accounting.post', true);
          if (!canCreate && !canPost) throw new Error('INVOICE_POST_PERMISSION_REQUIRED: Posting a draft invoice requires invoice-create or accounting-post permission');
          // postInvoice owns the canonical sales-order-before-invoice lock order.
          await SalesEngine.postInvoice(orgId, req.auth!.userId, id, client);
        }
        const locked = await client.query('SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, id]);
        if (!locked.rows.length) throw new Error('INVOICE_NOT_FOUND: Invoice does not exist');
        const invoice = locked.rows[0];
        status = String(invoice.status || '').toUpperCase();
        if (!['POSTED', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'].includes(status)) throw new Error('INVOICE_INVALID_STATUS: Invoice is not in a sendable state');
        const targetEmail = String(recipientEmail || invoice.client_email || '').trim().toLowerCase();
        if (!targetEmail) throw new Error('RECIPIENT_REQUIRED: Recipient email address is required');
        let artifact = await DocumentPdfArtifactService.findLatestIssuedArtifact(client, {
          organizationId: orgId,
          category: 'invoices',
          documentId: id,
        });
        if (!artifact || !artifact.sourceRevisionRef || String(artifact.sourceRevisionRef) !== String(invoice.edit_version ?? '')) {
          artifact = await DocumentPdfService.issuePdf(
            orgId,
            'invoices',
            id,
            req.auth!.userId,
            newId('pdf-email'),
            undefined,
            { reason: 'Invoice email attachment' },
            client,
          );
        }
        if (artifact.artifactState !== 'ISSUED' || !artifact.pdfBytes || !artifact.pdfSha256) {
          throw new Error('ISSUED_PDF_UNAVAILABLE: Invoice email requires a retained PDF artifact');
        }
        const outboxId = await EmailOutboxService.enqueueEmail(targetEmail, 'INVOICE_SEND', {
          invoiceNumber: invoice.invoice_number,
          customerName: invoice.client_name,
          subject: String(subject || `Invoice ${invoice.invoice_number}`).replace(/[\r\n\x00-\x1f\x7f]/g, ' ').slice(0, 250),
          customMessage: String(message || '').slice(0, 5000),
        }, orgId, {
          invoiceId: id,
          invoiceEmailKind: 'SEND',
          attachment: { filename: artifact.filename || 'invoice.pdf', contentType: 'application/pdf', content: artifact.pdfBytes },
        }, client);
        await FinanceController.logAudit(orgId, req.auth!.userId, 'INVOICE_EMAIL_QUEUED', 'Invoice', id, {
          outboxId,
          recipientEmail: targetEmail,
          artifactId: artifact.id,
          attachmentSha256: artifact.pdfSha256,
        }, client, true);
        return { outboxId, invoiceNumber: invoice.invoice_number, recipientEmail: targetEmail };
      }, { organizationId: orgId });
      res.status(202).json({ state: 'QUEUED', outboxId: queued.outboxId, invoiceNumber: queued.invoiceNumber, recipientEmail: queued.recipientEmail, message: 'Invoice email queued with its PDF attachment. Mail-server acceptance will appear in delivery history.' });
    } catch (err: any) {
      console.error('SEND_INVOICE_EMAIL_ERROR:', err);
      const message = err?.message || 'Failed to queue invoice email';
      const status = message.startsWith('INVOICE_NOT_FOUND') ? 404 : message.startsWith('INVOICE_APPROVAL_PENDING') ? 422 : message.startsWith('INVOICE_VOIDED') || message.startsWith('INVOICE_INVALID_STATUS') || message.startsWith('RECIPIENT_REQUIRED') ? 400 : message.startsWith('INVOICE_POST_PERMISSION_REQUIRED') ? 403 : message.startsWith('ISSUED_PDF_UNAVAILABLE') ? 409 : 500;
      res.status(status).json({ error: message.replace(/^[A-Z_]+:\s*/, '') });
    }
  }

  public static async sendInvoiceReminder(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { id } = req.params;
      const { recipientEmail } = req.body || {};
      const queued = await db.transaction(async (client) => {
        const locked = await client.query('SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, id]);
        if (!locked.rows.length) throw new Error('INVOICE_NOT_FOUND: Invoice does not exist');
        const invoice = locked.rows[0];
        const status = String(invoice.status || '').toUpperCase();
        if (!['POSTED', 'PARTIALLY_PAID'].includes(status)) throw new Error('INVOICE_INVALID_STATUS: Reminders require a posted invoice with an outstanding balance');
        const amountDue = Number(invoice.balance_due || 0);
        if (!Number.isFinite(amountDue) || amountDue <= 0) throw new Error('INVOICE_SETTLED: Invoice has no outstanding balance');
        const targetEmail = String(recipientEmail || invoice.client_email || '').trim().toLowerCase();
        if (!targetEmail) throw new Error('RECIPIENT_REQUIRED: Recipient email address is required for payment reminder');
        const outboxId = await EmailOutboxService.enqueueEmail(targetEmail, 'INVOICE_REMINDER', {
          invoiceNumber: invoice.invoice_number, customerName: invoice.client_name, amountDue,
          dueDate: invoice.due_date, currency: invoice.currency || '₹',
        }, orgId, { invoiceId: id, invoiceEmailKind: 'REMINDER' });
        await FinanceController.logAudit(orgId, req.auth!.userId, 'INVOICE_REMINDER_QUEUED', 'Invoice', id, { outboxId, recipientEmail: targetEmail }, client, true);
        return { outboxId, invoiceNumber: invoice.invoice_number, recipientEmail: targetEmail };
      }, { organizationId: orgId });
      res.status(202).json({ state: 'QUEUED', outboxId: queued.outboxId, invoiceNumber: queued.invoiceNumber, recipientEmail: queued.recipientEmail, message: 'Payment reminder queued. Mail-server acceptance will appear in delivery history.' });
    } catch (err: any) {
      const message = err?.message || 'Failed to queue invoice reminder';
      const status = message.startsWith('INVOICE_NOT_FOUND') ? 404 : message.startsWith('RECIPIENT_REQUIRED') || message.startsWith('INVOICE_SETTLED') || message.startsWith('INVOICE_INVALID_STATUS') ? 400 : 500;
      res.status(status).json({ error: message.replace(/^[A-Z_]+:\s*/, '') });
    }
  }

  public static async getInvoiceEmailDeliveries(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const invoiceId = String(req.params.id);
      const invoice = await db.query('SELECT id FROM invoices WHERE organization_id = $1 AND id = $2', [orgId, invoiceId]);
      if (!invoice.rows.length) { res.status(404).json({ error: 'Invoice not found' }); return; }
      const deliveries = await db.query(
        `SELECT id, invoice_email_kind, recipient_email, delivery_status, retry_count, sent_at, created_at
         FROM outbox_emails WHERE organization_id = $1 AND invoice_id = $2
         ORDER BY created_at DESC LIMIT 100`, [orgId, invoiceId]);
      res.json({ deliveries: deliveries.rows.map((row: any) => ({ id: row.id, kind: row.invoice_email_kind, recipientEmail: row.recipient_email, status: row.delivery_status, retryCount: Number(row.retry_count || 0), acceptedAt: row.sent_at, createdAt: row.created_at })) });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load invoice delivery history' });
    }
  }

  public static async getInvoiceJournal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { id } = req.params;
      const invoiceResult = await db.query('SELECT * FROM invoices WHERE organization_id = $1 AND id = $2', [orgId, id]);
      const invoice = invoiceResult.rows[0];
      if (!invoice) {
        res.status(404).json({ error: `Invoice ${id} not found` });
        return;
      }

      const hasExplicitJournalId = Object.prototype.hasOwnProperty.call(req.query, 'journalEntryId');
      let journalEntryId = invoice.journal_entry_id;
      if (hasExplicitJournalId) {
        const requestedJournalId = typeof req.query.journalEntryId === 'string' ? req.query.journalEntryId.trim() : '';
        if (!requestedJournalId) {
          res.status(404).json({ error: 'Original invoice posting journal not found' });
          return;
        }
        const evidenceResult = await db.query(
          `SELECT command.id AS command_id, command.command_type, command.status AS command_status, command.result,
                  journal.id AS journal_id, journal.status AS journal_status
             FROM financial_evidence_links link
             JOIN financial_commands command
               ON command.organization_id = link.organization_id AND command.id = link.command_id
             JOIN journal_entries journal
               ON journal.organization_id = link.organization_id AND journal.id = link.target_id
            WHERE link.organization_id = $1 AND link.source_type = 'Invoice' AND link.source_id = $2
              AND link.relation_type = 'POSTED_TO' AND link.target_type = 'JournalEntry' AND link.target_id = $3
              AND command.command_type = 'invoice.post'`,
          [orgId, invoice.id, requestedJournalId],
        );
        const evidence = evidenceResult.rows[0];
        let commandResult: Record<string, any> | null = null;
        try {
          const parsed = typeof evidence?.result === 'string' ? JSON.parse(evidence.result) : evidence?.result;
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) commandResult = parsed;
        } catch {
          commandResult = null;
        }
        const validEvidence = evidence
          && String(evidence.command_status).toUpperCase() === 'COMPLETED'
          && String(evidence.journal_status).toUpperCase() === 'POSTED'
          && evidence.journal_id === requestedJournalId
          && commandResult?.id === invoice.id
          && commandResult?.invoiceNumber === invoice.invoice_number
          && commandResult?.journalEntryId === requestedJournalId;
        if (!validEvidence) {
          res.status(404).json({ error: 'Original invoice posting journal not found' });
          return;
        }
        journalEntryId = requestedJournalId;
      } else if (!journalEntryId && invoice.invoice_number) {
        const journalResult = await db.query(
          'SELECT id FROM journal_entries WHERE organization_id = $1 AND reference = $2 LIMIT 1',
          [orgId, invoice.invoice_number],
        );
        if (journalResult.rows.length > 0) journalEntryId = journalResult.rows[0].id;
      }

      if (!journalEntryId) {
        res.status(404).json({ error: `No accounting journal entry found for invoice ${invoice.invoice_number}` });
        return;
      }

      const drillDown = await DrillDownService.getDrillDown(orgId, journalEntryId);
      if (hasExplicitJournalId) {
        if (drillDown.journalEntry.id !== journalEntryId) {
          res.status(404).json({ error: 'Original invoice posting journal not found' });
          return;
        }
        res.json({
          ...drillDown,
          sourceDocument: {
            type: 'INVOICE',
            id: invoice.id,
            documentNumber: invoice.invoice_number,
            date: String(invoice.issue_date || '').slice(0, 10),
            partyId: invoice.customer_id || invoice.client_id,
            partyName: invoice.client_name || 'Customer',
            amount: Number(invoice.total_amount),
            status: invoice.status,
            details: { balanceDue: Number(invoice.balance_due), paidAmount: Number(invoice.paid_amount) },
          },
        });
      } else {
        res.json(drillDown);
      }
    } catch (err: any) {
      console.error('GET_INVOICE_JOURNAL_ERROR:', err);
      res.status(500).json({ error: err.message || 'Failed to get invoice journal entry' });
    }
  }
  public static async createInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { clientId, clientName, clientEmail, projectId, salespersonId, issueDate, dueDate, items, discount, notes, expenseIds } = req.body;

    if (!clientId || !isIsoCalendarDate(issueDate) || !isIsoCalendarDate(dueDate) || dueDate < issueDate || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'A tenant client, valid issue/due dates, and at least one line item are required' });
      return;
    }
    try {
      const command = await FinancialCommandService.execute({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        commandType: 'invoice.post',
        payload: req.body,
        idempotencyKey: req.header('idempotency-key') || undefined,
        execute: async (client) => {
          const invoice = await SalesEngine.createAndPostInvoice(orgId, {
            customerId: clientId,
            customerName: clientName,
            customerEmail: clientEmail,
            projectId,
            salespersonId,
            issueDate,
            dueDate,
            discount: Number(discount || 0),
            lineItems: items,
            notes,
            status: 'POSTED',
            createdBy: req.auth!.userId,
            approvedDraftId: req.body.approvedDraftId,
          } as any, req.auth!.userId, client);

          if (Array.isArray(expenseIds) && expenseIds.length > 0) {
            const placeholders = expenseIds.map((_, i) => `$${i + 3}`).join(', ');
            const updateRes = await client.query(
              `UPDATE expenses
                  SET invoice_id = $1, is_billed = TRUE
                WHERE organization_id = $2
                  AND id IN (${placeholders})
                  AND is_billable = TRUE
                  AND is_billed = FALSE
                RETURNING id`,
              [invoice.id, orgId, ...expenseIds]
            );
            if (updateRes.rows.length !== expenseIds.length) {
              throw new Error('EXPENSE_ALREADY_BILLED: One or more selected expenses are already billed or invalid');
            }
          }

          return invoice;
        },
        events: (result) => [{
          eventType: 'invoice.posted',
          aggregateType: 'Invoice',
          aggregateId: result.id,
          payload: { invoiceId: result.id, invoiceNumber: result.invoiceNumber, journalEntryId: result.journalEntryId },
        }],
        evidenceLinks: (result) => result.journalEntryId ? [{
          sourceType: 'Invoice',
          sourceId: result.id,
          relationType: 'POSTED_TO',
          targetType: 'JournalEntry',
          targetId: result.journalEntryId,
        }] : [],
      });
      const invoice = command.result;
      res.status(201).json({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.customerName,
        totalAmount: invoice.totalAmount,
        balanceDue: invoice.balanceDue,
        status: invoice.status,
        journalEntryId: invoice.journalEntryId,
        commandId: command.commandId,
        editVersion: String(invoice.editVersion ?? 1),
      });
    } catch (error: any) {
      const message = error?.message || 'Invoice could not be posted';
      if (error?.code === '23505' || message.includes('already exists') || message.includes('duplicate key')) {
        res.status(409).json({ error: 'Invoice number or source document has already been used' });
        return;
      }
      const commandError = toFinancialCommandError(error);
      res.status(commandError.status).json(commandError.body);
    }
  }

  public static async updateInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const invoiceId = req.params.id;
    const { clientId, clientName, clientEmail, projectId, salespersonId, issueDate, dueDate, items, discount, notes, terms, editReason } = req.body;

    if (!invoiceId) {
      res.status(400).json({ error: 'Invoice ID is required' });
      return;
    }

    const expectedVersion = req.body?.expectedVersion;
    if (expectedVersion === undefined || expectedVersion === null || expectedVersion === '') {
      res.status(428).json({ code: 'INVOICE_EDIT_PRECONDITION_REQUIRED', error: 'Reload this invoice before editing so the current version can be verified.' });
      return;
    }
    if (typeof expectedVersion !== 'string' || !/^[1-9][0-9]{0,18}$/.test(expectedVersion)
      || BigInt(expectedVersion) > 9223372036854775807n) {
      res.status(400).json({ code: 'INVALID_INVOICE_EDIT_VERSION', error: 'Invoice edit version must be a valid positive version token.' });
      return;
    }

    try {
      const invoice = await SalesEngine.updateInvoice(
        orgId,
        invoiceId,
        {
          customerId: clientId,
          clientName,
          clientEmail,
          projectId,
          salespersonId,
          issueDate,
          dueDate,
          lineItems: items,
          discount: discount !== undefined ? Number(discount) : undefined,
          notes,
          terms,
          editReason,
        },
        req.auth!.userId,
        expectedVersion
      );

      res.status(200).json({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: invoice.customerId,
        clientName: invoice.customerName,
        clientEmail: invoice.customerEmail,
        projectId: invoice.projectId,
        salespersonId: invoice.salespersonId,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotal: invoice.subtotal,
        taxTotal: invoice.taxTotal,
        discount: invoice.discount,
        roundOffAmount: invoice.roundOffAmount,
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        balanceDue: invoice.balanceDue,
        status: invoice.status,
        lineItems: invoice.lineItems,
        items: invoice.lineItems,
        notes: invoice.notes,
        terms: invoice.paymentTerms,
        journalEntryId: invoice.journalEntryId,
        editVersion: invoice.editVersion,
      });
    } catch (error: any) {
      if (error?.code === 'INVOICE_EDIT_CONFLICT') {
        res.status(409).json({ code: 'INVOICE_EDIT_CONFLICT', error: error.message, currentState: error.currentState });
        return;
      }
      const message = error?.message || 'Invoice could not be updated';
      if (message.includes('INVOICE_EDIT_PRECONDITION_REQUIRED')) {
        res.status(428).json({ code: 'INVOICE_EDIT_PRECONDITION_REQUIRED', error: message });
        return;
      }
      if (message.includes('INVOICE_NOT_FOUND')) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }
      if (message.includes('CANNOT_REDUCE_BELOW_PAID')) {
        res.status(422).json({ error: message.replace(/^CANNOT_REDUCE_BELOW_PAID:\s*/, '') });
        return;
      }
      if (message.includes('INVOICE_VOIDED')) {
        res.status(422).json({ error: 'Voided invoices cannot be edited' });
        return;
      }
      res.status(422).json({ error: message });
    }
  }

  // --- PAYMENTS RECEIVED ---
  public static async getPaymentsReceived(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query(
      `SELECT pr.id AS payment_id, pr.payment_number, pr.client_id, pr.client_name, pr.payment_date,
              pr.payment_mode, pr.deposit_to_account_id, pr.reference, pr.notes, pr.amount, pr.unallocated_amount, pr.unallocated_amount_before_reversal, pr.status,
              pr.reversal_journal_id,
              allocation.invoice_id, allocation.amount AS allocation_amount,
              invoice.invoice_number
         FROM payments_received pr
         LEFT JOIN payment_received_allocations allocation
           ON allocation.payment_id = pr.id AND allocation.organization_id = pr.organization_id
         LEFT JOIN invoices invoice
           ON invoice.id = allocation.invoice_id AND invoice.organization_id = pr.organization_id
        WHERE pr.organization_id = $1
        ORDER BY pr.payment_date DESC, pr.id DESC, invoice.invoice_number ASC, allocation.invoice_id ASC`,
      [orgId]
    );
    const payments = new Map<string, any>();
    for (const row of result.rows) {
      const existing = payments.get(row.payment_id) || {
        id: row.payment_id,
        paymentNumber: row.payment_number,
        clientId: row.client_id,
        clientName: row.client_name,
        invoiceId: row.invoice_id,
        invoiceNumbers: new Set<string>(),
        allocations: [],
        paymentDate: row.payment_date,
        paymentMethod: row.payment_mode,
        depositToAccountId: row.deposit_to_account_id,
        referenceNumber: row.reference || '',
        notes: row.notes || '',
        amount: Number(row.amount),
        unallocatedAmount: Number(row.unallocated_amount || 0),
        unallocatedAmountBeforeReversal: row.unallocated_amount_before_reversal == null ? null : Number(row.unallocated_amount_before_reversal),
        status: row.status,
        reversalJournalId: row.reversal_journal_id || undefined,
      };
      if (row.invoice_id) {
        if (row.invoice_number) existing.invoiceNumbers.add(row.invoice_number);
        existing.allocations.push({ invoiceId: row.invoice_id, invoiceNumber: row.invoice_number || '', amount: Number(row.allocation_amount || 0) });
      }
      payments.set(row.payment_id, existing);
    }
    res.json(Array.from(payments.values()).map((payment) => ({
      ...payment,
      invoiceNumber: Array.from(payment.invoiceNumbers).join(', '),
      invoiceNumbers: undefined,
    })));
  }

  public static async recordPaymentReceived(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { clientId, customerId, clientName, customerName, paymentDate, paymentMode, depositToAccountId, depositAccountId, invoiceId, reference, referenceNumber, notes } = req.body;
    const parsedAmount = Number(req.body.amount);
    if (!isIsoCalendarDate(paymentDate) || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !Number.isSafeInteger(Math.round(parsedAmount * 100)) || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 1e-7) {
      res.status(400).json({ error: 'paymentDate and a positive amount with no more than two decimals are required' });
      return;
    }

    try {
      const finalCustomerId = customerId || clientId;
      const finalCustomerName = customerName || clientName;
      const resolvedDepositAccountId = depositToAccountId || depositAccountId;

      const command = await FinancialCommandService.execute({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        commandType: 'customer-payment.record',
        payload: req.body,
        idempotencyKey: req.header('idempotency-key') || undefined,
        execute: async (client) => {
        const payment = await SalesEngine.recordPayment(orgId, {
          customerId: finalCustomerId,
          clientId: finalCustomerId,
          customerName: finalCustomerName,
          clientName: finalCustomerName,
          paymentDate,
          paymentMode: paymentMode || 'Bank Wire',
          depositToAccountId: resolvedDepositAccountId,
          reference: reference || referenceNumber || '',
          notes: notes || '',
          amount: parsedAmount,
          allocations: invoiceId ? [{ invoiceId, amount: parsedAmount }] : undefined,
          actorId: req.auth!.userId,
        } as any, req.auth!.userId, client);

        await FinanceController.logAudit(orgId, req.auth!.userId, 'PAYMENT_RECORDED', 'PaymentReceived', payment.id, payment, client);
        return payment;
        },
        events: (result) => [{
          eventType: 'customer-payment.recorded',
          aggregateType: 'PaymentReceived',
          aggregateId: result.id,
          payload: { paymentId: result.id, paymentNumber: result.paymentNumber, journalEntryId: result.journalEntryId },
        }],
        evidenceLinks: (result) => [{
          sourceType: 'PaymentReceived',
          sourceId: result.id,
          relationType: 'POSTED_TO',
          targetType: 'JournalEntry',
          targetId: result.journalEntryId,
        }],
      });
      const result = command.result;

      res.status(201).json({ id: result.id, paymentNumber: result.paymentNumber, amount: parsedAmount, status: 'Recorded', ...result, commandId: command.commandId });
    } catch (error: any) {
      const commandError = toFinancialCommandError(error);
      res.status(commandError.status).json(commandError.body);
    }
  }

  // --- EXPENSES ---
  public static async getExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId.trim() : undefined;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : undefined;
    const isBillable = req.query.isBillable !== undefined ? req.query.isBillable === 'true' : undefined;
    const isBilled = req.query.isBilled !== undefined ? req.query.isBilled === 'true' : undefined;

    let queryText = `
      SELECT e.*,
             ea.name AS expense_account_name,
             pa.name AS paid_from_account_name,
             COALESCE(cu.display_name, cu.legal_name, cl.name, p.client_name) AS client_name,
             p.name AS project_name,
             inv.invoice_number AS customer_invoice_number
        FROM expenses e
        LEFT JOIN accounts ea ON ea.id = e.expense_account_id AND ea.organization_id = e.organization_id
        LEFT JOIN accounts pa ON pa.id = e.paid_from_account_id AND pa.organization_id = e.organization_id
        LEFT JOIN projects p ON p.id = e.project_id AND p.organization_id = e.organization_id
        LEFT JOIN customers cu ON cu.id = e.client_id AND cu.organization_id = e.organization_id
        LEFT JOIN clients cl ON cl.id = e.client_id AND cl.organization_id = e.organization_id
        LEFT JOIN invoices inv ON inv.id = e.invoice_id AND inv.organization_id = e.organization_id
       WHERE e.organization_id = $1
    `;
    const params: any[] = [orgId];

    if (clientId) {
      params.push(clientId);
      queryText += ` AND e.client_id = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      queryText += ` AND e.project_id = $${params.length}`;
    }
    if (isBillable !== undefined) {
      params.push(isBillable);
      queryText += ` AND e.is_billable = $${params.length}`;
    }
    if (isBilled !== undefined) {
      params.push(isBilled);
      queryText += ` AND e.is_billed = $${params.length}`;
    }

    queryText += ` ORDER BY e.date DESC, e.created_at DESC, e.id DESC`;

    if (limit && Number.isFinite(limit) && limit > 0) {
      queryText += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }
    const result = await db.query(queryText, params);
    const attachmentsByExpense = await ExpenseReceiptService.listForExpenses(db, orgId);
    res.json(result.rows.map((expense) => ({
      id: expense.id, organizationId: expense.organization_id, referenceNumber: expense.expense_number,
      vendorId: expense.vendor_id || undefined,
      vendorName: expense.vendor_name || undefined, accountId: expense.expense_account_id,
      invoiceNumber: expense.vendor_invoice_number || undefined,
      accountName: Boolean(expense.is_itemized) ? 'Itemized' : (expense.expense_account_name || ''),
      paidFromAccountId: expense.paid_from_account_id,
      paidFromAccountName: expense.paid_from_account_name || '',
      date: expense.date,
      amount: Number(expense.amount),
      taxRate: expense.tax_rate !== null && expense.tax_rate !== undefined ? Number(expense.tax_rate) : undefined,
      taxAmount: Number(expense.tax_amount || 0),
      taxAccountId: expense.tax_account_id || undefined,
      isTaxInclusive: Boolean(expense.is_tax_inclusive),
      isRcm: Boolean(expense.is_rcm),
      rcmTaxAccountId: expense.rcm_tax_account_id || undefined,
      tdsRate: expense.tds_rate !== null && expense.tds_rate !== undefined ? Number(expense.tds_rate) : undefined,
      tdsAmount: Number(expense.tds_amount || 0),
      tdsSection: expense.tds_section || undefined,
      tdsAccountId: expense.tds_account_id || undefined,
      projectId: expense.project_id || undefined,
      projectName: expense.project_name || undefined,
      clientId: expense.client_id || undefined,
      clientName: expense.client_name || undefined,
      isBillable: Boolean(expense.is_billable),
      markupPercentage: expense.markup_percentage !== null && expense.markup_percentage !== undefined ? Number(expense.markup_percentage) : 0,
      sellingPrice: expense.selling_price !== null && expense.selling_price !== undefined ? Number(expense.selling_price) : undefined,
      isBilled: Boolean(expense.is_billed),
      invoiceId: expense.invoice_id || undefined,
      customerInvoiceNumber: expense.customer_invoice_number || undefined,
      journalEntryId: expense.journal_entry_id || undefined,
      paymentStatus: 'Paid', status: expense.status || 'POSTED', description: expense.description || '', createdAt: expense.created_at,
      receiptAttachments: attachmentsByExpense.get(expense.id) || [],
      receiptFileName: attachmentsByExpense.get(expense.id)?.[0]?.fileName,
      isItemized: Boolean(expense.is_itemized),
      items: typeof expense.items === 'string' ? JSON.parse(expense.items) : (expense.items || []),
    })));
  }

  public static async createExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const command = await FinancialCommandService.execute({
        organizationId: req.auth!.organizationId,
        actorUserId: req.auth!.userId,
        commandType: 'expense.post',
        payload: req.body,
        idempotencyKey: req.header('idempotency-key') || undefined,
        execute: (client) => ExpensePostingService.createAndPost(
          req.auth!.organizationId,
          req.auth!.userId,
          req.body,
          client
        ),
          events: (result) => [{
          eventType: 'expense.posted',
          aggregateType: 'Expense',
          aggregateId: result.id,
          payload: {
            expenseId: result.id,
            expenseNumber: result.expenseNumber,
              journalEntryId: result.journalEntryId,
            },
          }],
          evidenceLinks: (result) => [
            {
              sourceType: 'Expense',
              sourceId: result.id,
              relationType: 'POSTED_TO',
              targetType: 'JournalEntry',
              targetId: result.journalEntryId,
            },
            ...result.receiptAttachments.map((attachment) => ({
              sourceType: 'Expense',
              sourceId: result.id,
              relationType: 'HAS_ATTACHMENT',
              targetType: 'ExpenseReceipt',
              targetId: attachment.id,
              metadata: {
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                byteSize: attachment.byteSize,
              },
            })),
          ],
        });
      res.status(201).json({ ...command.result, commandId: command.commandId });
      } catch (error: any) {
        const commandError = toFinancialCommandError(error);
        res.status(commandError.status).json(commandError.body);
      }
  }

  public static async getExpensePdf(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const artifact = await DocumentPdfArtifactService.findLatestIssuedArtifact(db, {
        organizationId: req.auth!.organizationId,
        category: 'expenses',
        documentId: req.params.id,
      });
      if (artifact) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', String(artifact.pdfBytes!.length));
        res.setHeader('Content-Disposition', 'inline; filename="' + (artifact.filename || 'expense.pdf').replaceAll('"', '') + '"');
        res.setHeader('X-Document-Pdf-Artifact', artifact.id);
        res.setHeader('X-Document-Pdf-Issuance', String(artifact.issuanceNumber));
        res.setHeader('X-Document-Pdf-SHA256', artifact.pdfSha256 || '');
        res.send(artifact.pdfBytes);
        return;
      }
      const pdfBuffer = await ExpensePdfService.generateExpensePdf(
        db,
        req.auth!.organizationId,
        req.params.id
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdfBuffer.length));
      res.setHeader('Content-Disposition', `inline; filename="ExpenseVoucher-${req.params.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (err: any) {
      console.error('GENERATE_EXPENSE_PDF_ERROR:', err);
      if (err.message && err.message.includes('not found')) {
        res.status(404).json({ error: err.message });
      } else {
        res.status(500).json({ error: err.message || 'Failed to generate expense voucher PDF' });
      }
    }
  }

  public static async getExpenseEvidence(req: AuthenticatedRequest, res: Response): Promise<void> {
    const expenseId = req.params.id;
    const organizationId = req.auth!.organizationId;
    const expense = await db.query(
      'SELECT id FROM expenses WHERE organization_id = $1 AND id = $2',
      [organizationId, expenseId]
    );
    if (expense.rows.length === 0) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }

    const result = await db.query(
      `SELECT
         link.id,
         link.command_id,
         command.command_type,
         command.status AS command_status,
         link.source_type,
         link.source_id,
         link.relation_type,
         link.target_type,
         link.target_id,
         link.metadata,
         link.created_at
       FROM financial_evidence_links link
       JOIN financial_commands command
         ON command.organization_id = link.organization_id AND command.id = link.command_id
      WHERE link.organization_id = $1
        AND ((link.source_type = 'Expense' AND link.source_id = $2)
          OR (link.target_type = 'Expense' AND link.target_id = $2))
      ORDER BY link.created_at ASC, link.id ASC`,
      [organizationId, expenseId]
    );
    res.json({ data: result.rows, freshness: 'transactional' });
  }

  public static async getExpenseReceipt(req: AuthenticatedRequest, res: Response): Promise<void> {
    const receipt = await ExpenseReceiptService.getContent(db, req.auth!.organizationId, req.params.id, req.params.receiptId);
    if (!receipt) {
      res.status(404).json({ error: 'Receipt image not found' });
      return;
    }
    res.setHeader('Content-Type', receipt.mimeType);
    res.setHeader('Content-Length', String(receipt.content.length));
    res.setHeader('Content-Disposition', `inline; filename="${receipt.fileName.replaceAll('"', '')}"`);
    res.send(receipt.content);
  }

  public static async attachExpenseReceipts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const organizationId = req.auth!.organizationId;
      const attachments = await db.transaction(async (client) => {
        const created = await ExpenseReceiptService.appendToExpense(
          client,
          organizationId,
          req.params.id,
          req.body?.receiptImages
        );
        await FinanceController.logAudit(
          organizationId,
          req.auth!.userId,
          'EXPENSE_RECEIPTS_ATTACHED',
          'Expense',
          req.params.id,
          { attachmentIds: created.map((attachment) => attachment.id), attachmentCount: created.length },
          client,
          true
        );
        return created;
      }, { organizationId });
      res.status(201).json({ attachments });
    } catch (error: any) {
      const message = error.message || 'Receipt images could not be attached';
      const status = message.startsWith('EXPENSE_NOT_FOUND') ? 404 : 400;
      res.status(status).json({ error: message });
    }
  }

  public static async voidExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await FinancialDestructiveActionsService.voidExpense(
        req.auth!.organizationId,
        req.params.id,
        req.auth!.userId,
        req.body?.reason
      );
      res.json(result);
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Expense could not be voided' });
    }
  }

  // --- BILLS ---
  public static async getBills(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    let queryText = 'SELECT * FROM bills WHERE organization_id = $1 ORDER BY bill_date DESC';
    const params: any[] = [orgId];
    if (limit && Number.isFinite(limit) && limit > 0) {
      queryText += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }
    const result = await db.query(queryText, params);
    res.json(result.rows.map((bill) => ({
      id: bill.id, billNumber: bill.bill_number, vendorId: bill.vendor_id || undefined, vendorName: bill.vendor_name,
      purchaseOrderId: bill.purchase_order_id || undefined,
      billDate: bill.bill_date, dueDate: bill.due_date, totalAmount: Number(bill.total_amount),
      amountPaid: Number(bill.amount_paid), balanceDue: Number(bill.balance_due ?? (Number(bill.total_amount) - Number(bill.amount_paid))),
      status: bill.status, notes: bill.notes || '',
    })));
  }

  public static async createBill(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { vendorId, vendorName, billDate, dueDate, totalAmount, notes } = req.body;

    let parsedTotal = Number(totalAmount);
    let parsedTax = Number(req.body.taxTotal || 0);
    let parsedSubtotal = req.body.subtotal !== undefined ? Number(req.body.subtotal) : Math.round((parsedTotal - parsedTax) * 100) / 100;
    const sourceLines = Array.isArray(req.body.lineItems) ? req.body.lineItems : [];
    const normalizedLines: any[] = [];
    if (sourceLines.length > 1000) {
      res.status(400).json({ error: 'Bill cannot contain more than 1000 line items' });
      return;
    }
    if (sourceLines.length > 0) {
      parsedSubtotal = 0;
      parsedTax = 0;
      for (let index = 0; index < sourceLines.length; index += 1) {
        const line = sourceLines[index];
        const quantity = Number(line.quantity ?? 1);
        const unitPrice = Number(line.unitPrice ?? line.rate ?? 0);
        const taxRate = Number(line.taxRate || 0);
        if (!(line.description || line.name) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
          res.status(400).json({ error: `Bill line ${index + 1} contains an invalid description, quantity, rate, or tax rate` });
          return;
        }
        const amount = Math.round(quantity * unitPrice * 100) / 100;
        const taxAmount = Math.round(amount * taxRate) / 100;
        parsedSubtotal = Math.round((parsedSubtotal + amount) * 100) / 100;
        parsedTax = Math.round((parsedTax + taxAmount) * 100) / 100;
        normalizedLines.push({ ...line, description: line.description || line.name, quantity, unitPrice, taxRate, amount, taxAmount, totalAmount: Math.round((amount + taxAmount) * 100) / 100 });
      }
      parsedTotal = Math.round((parsedSubtotal + parsedTax) * 100) / 100;
    }
    const expenseAccountId = req.body.expenseAccountId;
    const payableAccountId = req.body.payableAccountId;
    const amounts = [parsedSubtotal, parsedTax, parsedTotal];
    if (req.body.approvedDraftId) {
      res.status(400).json({ error: 'APPROVED_DRAFT_ID_FORBIDDEN: approvedDraftId is deprecated and forbidden. Use postApprovedBill.' });
      return;
    }
    if (!vendorId || !isIsoCalendarDate(billDate) || !isIsoCalendarDate(dueDate) || dueDate < billDate || amounts.some((value) => !Number.isFinite(value) || value < 0 || Math.round(value * 100) / 100 !== value) || parsedTotal <= 0 || Math.abs(parsedSubtotal + parsedTax - parsedTotal) > 0.009) {
      res.status(400).json({ error: 'A tenant vendor, valid dates, and reconciling non-negative subtotal, tax, and total amounts are required' });
      return;
    }

    const billId = newId('bill');
    let finalBillNumber = '';
    try {
      const command = await FinancialCommandService.execute({
        organizationId: orgId,
        actorUserId: req.auth!.userId,
        commandType: 'bill.post',
        payload: req.body,
        idempotencyKey: req.header('idempotency-key') || undefined,
        execute: async (client) => {
        finalBillNumber = finalBillNumber || await DocumentNumberingEngine.getNextNumber(orgId, 'VENDOR_BILL', billDate, undefined, client);
        const vendor = await client.query(`SELECT id, name, company_name FROM vendors WHERE organization_id = $1 AND id = $2`, [orgId, vendorId]);
        if (vendor.rows.length !== 1) throw new Error('Bill vendor does not belong to this organization');
        const resolvedVendorName = vendor.rows[0].name || vendor.rows[0].company_name || vendorName || 'Vendor';
        const finalExpenseAccountId = expenseAccountId || await OrganizationProvisioningService.resolveAccountId(client, orgId, '6000', ['Expense', 'Cost of Goods Sold']);
        const finalPayableAccountId = payableAccountId || await OrganizationProvisioningService.resolveAccountId(client, orgId, '2000', ['Liability']);
        const inputTaxAccountId = parsedTax > 0 ? await OrganizationProvisioningService.resolveAccountId(client, orgId, '1200', ['Asset']) : '';
        const postingAccounts = await client.query(
          `SELECT id, type, code, sub_type FROM accounts WHERE organization_id = $1 AND id IN ($2, $3) AND status = 'Active'`,
          [orgId, finalExpenseAccountId, finalPayableAccountId]
        );
        const debitAccount = postingAccounts.rows.find((account) => account.id === finalExpenseAccountId);
        const payableAccount = postingAccounts.rows.find((account) => account.id === finalPayableAccountId);
        const isExpenseDebit = Boolean(debitAccount && ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(debitAccount.type));
        if (
          !isExpenseDebit ||
          !payableAccount || payableAccount.type !== 'Liability' ||
          !['accounts payable', 'payable'].includes(String(payableAccount.sub_type || '').toLowerCase()) ||
          normalizedLines.some((line) => line.accountId && line.accountId !== finalExpenseAccountId)
        ) {
          throw new Error('Bill debit lines must use an expense or cost of goods sold account and the credit account must be accounts payable');
        }
        const requiresApproval = await ApprovalWorkflowService.requiresApproval(orgId, 'VENDOR_BILL', parsedTotal);
        const initialStatus = requiresApproval ? 'SUBMITTED' : 'Unpaid';

        await client.query(
          `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, amount_paid, balance_due, status, notes, line_items)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, $11, $12, $13)`,
          [billId, orgId, finalBillNumber, vendorId, resolvedVendorName, billDate, dueDate, parsedSubtotal, parsedTax, parsedTotal, initialStatus, notes || '', JSON.stringify(normalizedLines)]
        );

        let postingEntryId: string | undefined;

        if (requiresApproval) {
          await ApprovalWorkflowService.submitForApproval(orgId, 'VENDOR_BILL', billId, req.auth!.userId, parsedTotal, client);
        } else {
          const posting = await ServerPostingEngine.postEntry({
            organizationId: orgId,
            entryNumber: `JRN-BILL-${billId}`,
            date: billDate,
            reference: finalBillNumber,
            description: `Bill ${finalBillNumber} received from ${resolvedVendorName}`,
            lines: [
              ...(parsedSubtotal > 0 ? [{ accountId: finalExpenseAccountId, debit: parsedSubtotal, credit: 0 }] : []),
              ...(parsedTax > 0 ? [{ accountId: inputTaxAccountId, debit: parsedTax, credit: 0 }] : []),
              { accountId: finalPayableAccountId, debit: 0, credit: parsedTotal },
            ],
          }, client);
          postingEntryId = posting.entryId;

          await client.query(
            `UPDATE bills SET journal_entry_id = $1 WHERE id = $2 AND organization_id = $3`,
            [posting.entryId, billId, orgId]
          );
          const vendorBalance = await client.query(
            `UPDATE vendors SET payables_balance = payables_balance + $1
              WHERE organization_id = $2 AND id = $3`,
            [parsedTotal, orgId, vendorId]
          );
          if (vendorBalance.rowCount !== 1) throw new Error('Bill vendor balance could not be updated');
        }

        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'BILL_CREATED', 'Bill', $4, $5)`,
          [newId('aud'), orgId, req.auth!.userId, billId, JSON.stringify({ billNumber: finalBillNumber, totalAmount: parsedTotal, journalEntryId: postingEntryId, status: initialStatus })]
        );
        return { id: billId, billNumber: finalBillNumber, entryId: postingEntryId, status: initialStatus };
        },
        events: (result) => [{
          eventType: 'bill.posted',
          aggregateType: 'Bill',
          aggregateId: result.id,
          payload: { billId: result.id, billNumber: result.billNumber, journalEntryId: result.entryId, status: result.status },
        }],
        evidenceLinks: (result) => result.entryId ? [{
          sourceType: 'Bill',
          sourceId: result.id,
          relationType: 'POSTED_TO',
          targetType: 'JournalEntry',
          targetId: result.entryId,
        }] : [],
      });
      const result = command.result;
      res.status(201).json({ id: result.id, billNumber: result.billNumber, totalAmount: parsedTotal, status: result.status, journalEntryId: result.entryId, commandId: command.commandId });
    } catch (error: any) {
      const commandError = toFinancialCommandError(error);
      res.status(commandError.status).json(commandError.body);
    }
  }

  public static async voidBill(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await FinancialDestructiveActionsService.voidBill(
        req.auth!.organizationId,
        req.params.id,
        req.auth!.userId,
        req.body?.reason
      );
      res.json(result);
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Bill could not be voided' });
    }
  }

  // --- JOURNALS ---
  public static async getJournals(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const limit = req.query.limit ? Number(req.query.limit) : null;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    let queryText = 'SELECT * FROM journal_entries WHERE organization_id = $1 ORDER BY date DESC';
    const params: any[] = [orgId];
    if (limit && Number.isFinite(limit) && limit > 0) {
      queryText += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
    }
    const result = await db.query(queryText, params);
    if (result.rows.length === 0) {
      res.json([]);
      return;
    }

    const entryIds = result.rows.map((r) => r.id);
    const linesResult = await db.query(
      `SELECT jl.* FROM journal_lines jl
        WHERE jl.organization_id = $1 AND jl.journal_entry_id = ANY($2::text[])
        ORDER BY jl.id`,
      [orgId, entryIds]
    );

    const linesByEntryId = new Map<string, any[]>();
    for (const line of linesResult.rows) {
      const list = linesByEntryId.get(line.journal_entry_id) || [];
      list.push({
        ...line,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      });
      linesByEntryId.set(line.journal_entry_id, list);
    }

    const journals = result.rows.map((entry) => ({
      ...entry,
      lines: linesByEntryId.get(entry.id) || [],
    }));
    res.json(journals);
  }



  // --- PERIOD LOCKS ---
  public static async getPeriodLocks(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM period_locks WHERE organization_id = $1 ORDER BY lock_date DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createPeriodLock(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { lockDate, region, reason } = req.body;
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    const today = new Date().toISOString().slice(0, 10);
    if (!isIsoCalendarDate(lockDate) || lockDate > today || normalizedReason.length < 5 || normalizedReason.length > 500) {
      res.status(400).json({ error: 'A valid non-future lockDate and a specific reason of 5-500 characters are required' });
      return;
    }

    const lockId = newId('lock');
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO period_locks (id, organization_id, lock_date, region, locked_by, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [lockId, orgId, lockDate, region || 'Global', req.auth!.userId, normalizedReason, 'Active']
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'PERIOD_LOCKED', 'PeriodLock', $4, $5)`,
        [newId('aud'), orgId, req.auth!.userId, lockId, JSON.stringify({ lockDate, region: region || 'Global', reason: normalizedReason })]
      );
    });
    res.status(201).json({ id: lockId, lockDate, region: region || 'Global', reason: normalizedReason, lockedBy: req.auth!.userId, lockedAt: new Date().toISOString(), status: 'Active' });
  }

  // --- AUDIT LOGS ---
  public static async getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const entityId = req.query.entityId ? String(req.query.entityId).trim() : null;
    const entityType = req.query.entityType ? String(req.query.entityType).trim() : null;

    if (!entityId) {
      const result = await db.query(
        `SELECT al.*, u.full_name as user_name, u.email as user_email
           FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
          WHERE al.organization_id = $1
       ORDER BY al.timestamp DESC
          LIMIT 100`,
        [orgId]
      );
      res.json(result.rows);
      return;
    }

    try {
      const auditRes = await db.query(
        `SELECT al.*, u.full_name as user_name, u.email as user_email
           FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
          WHERE al.organization_id = $1
            AND (
              al.entity_id = $2
              OR (
                al.entity_type IN ('Expense', 'expense') AND al.entity_id IN (
                  SELECT id FROM expenses WHERE organization_id = $1 AND (id = $2 OR reversal_journal_id = $2)
                )
              )
            )
       ORDER BY al.timestamp DESC`,
        [orgId, entityId]
      );

      const events: any[] = [];
      for (const row of auditRes.rows) {
        const before = typeof row.before_state === 'string' ? JSON.parse(row.before_state) : row.before_state || null;
        const after = typeof row.after_state === 'string' ? JSON.parse(row.after_state) : row.after_state || null;
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || null;

        const reason = after?.reason || after?.editReason || after?.reversalReason || after?.correctionReason ||
          before?.reason || meta?.reason || meta?.reversalReason || meta?.changeSummary || undefined;

        let summary = '';
        if (after?.totalAmount !== undefined && before?.totalAmount !== undefined && after.totalAmount !== before.totalAmount) {
          summary = `Amount adjusted from ${before.totalAmount} to ${after.totalAmount}`;
        } else if (after?.amount !== undefined && before?.amount !== undefined && Number(after.amount) !== Number(before.amount)) {
          summary = `Amount adjusted from ${before.amount} to ${after.amount}`;
        } else if (after?.status && before?.status && after.status !== before.status) {
          summary = `Status transitioned from ${before.status} to ${after.status}`;
        } else if (row.action.includes('CORRECTED') || row.action.includes('UPDATED')) {
          summary = reason ? `Updated: ${reason}` : 'Expense updated with balanced GL entry';
        } else if (row.action.includes('REVERSED')) {
          summary = reason ? `Reversed: ${reason}` : 'Transaction reversed with balanced reversing entry';
        } else if (row.action.includes('CREATED') || row.action.includes('POSTED')) {
          summary = after?.totalAmount || after?.amount ? `Created for amount ${after.totalAmount || after.amount}` : 'Initial creation posted';
        } else if (reason) {
          summary = reason;
        }

        const actionLabels: Record<string, string> = {
          EXPENSE_CREATED: 'Expense Created',
          EXPENSE_UPDATED: 'Expense Updated',
          EXPENSE_CORRECTED: 'Expense Corrected / Edited',
          EXPENSE_VOIDED: 'Expense Voided',
          PROJECT_TIME_INVOICED: 'Billed to Customer Invoice',
          MANUAL_JOURNAL_CREATED: 'Journal Entry Created',
          MANUAL_JOURNAL_POSTED: 'Journal Entry Posted',
          MANUAL_JOURNAL_SUBMITTED: 'Journal Entry Submitted for Approval',
          MANUAL_JOURNAL_UPDATED: 'Journal Entry Draft Updated',
          MANUAL_JOURNAL_REVERSED: 'Journal Entry Reversed',
          INVOICE_CREATED: 'Invoice Created',
          INVOICE_POSTED: 'Invoice Posted',
          INVOICE_UPDATED: 'Invoice Revised / Edited',
          INVOICE_VOIDED: 'Invoice Voided',
          PAYMENT_RECORDED: 'Payment Applied',
          BILL_CREATED: 'Bill Created',
          BILL_VOIDED: 'Bill Voided',
          VENDOR_PAYMENT_RECORDED: 'Vendor Payment Made',
          QUOTATION_CREATED: 'Quotation Created',
          QUOTATION_REVISED: 'Quotation Revised',
        };

        const actionLabel = actionLabels[row.action] || row.action.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

        events.push({
          id: row.id,
          action: row.action,
          actionLabel,
          entityType: row.entity_type,
          entityId: row.entity_id,
          timestamp: row.timestamp,
          userId: row.user_id,
          userName: row.user_name || 'Staff User',
          userEmail: row.user_email || '',
          reason,
          summary,
          details: after || before || meta || {},
          beforeState: before,
          afterState: after,
        });
      }

      // If Quotation/Estimate: merge quotation_revisions
      const normType = (entityType || '').toLowerCase();
      if (['quotation', 'estimate'].includes(normType) || events.some((e) => ['Quotation', 'Estimate'].includes(e.entityType))) {
        try {
          const revRes = await db.query(
            `SELECT qr.*, u.full_name as user_name, u.email as user_email
               FROM quotation_revisions qr
          LEFT JOIN users u ON u.id = qr.created_by
              WHERE qr.organization_id = $1 AND qr.quotation_id = $2
           ORDER BY qr.created_at DESC`,
            [orgId, entityId]
          );

          for (const rev of revRes.rows) {
            const isCreation = Number(rev.revision_number) === 0;
            const revId = `rev-${rev.id}`;
            if (!events.some((e) => e.details?.revisionNumber === rev.revision_number)) {
              events.push({
                id: revId,
                action: isCreation ? 'QUOTATION_CREATED' : 'QUOTATION_REVISED',
                actionLabel: isCreation ? 'Quotation Created' : `Revision #${rev.revision_number}`,
                entityType: 'Quotation',
                entityId: rev.quotation_id,
                timestamp: rev.created_at,
                userId: rev.created_by,
                userName: rev.user_name || rev.created_by || 'Staff User',
                userEmail: rev.user_email || '',
                reason: rev.change_summary || undefined,
                summary: rev.change_summary || (isCreation ? `Quotation created with initial total ${rev.total_amount}` : `Quotation revised to ${rev.total_amount}`),
                details: {
                  revisionNumber: rev.revision_number,
                  totalAmount: Number(rev.total_amount || 0),
                  status: rev.status,
                },
              });
            }
          }
        } catch {
          // quotation_revisions may not be available or empty
        }
      }

      // Check if a baseline CREATED event exists
      const hasCreation = events.some((e) => e.action.includes('CREATED') || e.action.includes('POSTED') || (e.actionLabel && e.actionLabel.includes('Created')));
      if (!hasCreation) {
        if (normType === 'expense') {
          const expRes = await db.query('SELECT id, expense_number, amount, date, description, created_at, status FROM expenses WHERE organization_id = $1 AND id = $2', [orgId, entityId]);
          if (expRes.rows.length > 0) {
            const exp = expRes.rows[0];
            events.push({
              id: `init-${exp.id}`,
              action: 'EXPENSE_CREATED',
              actionLabel: 'Expense Created',
              entityType: 'Expense',
              entityId: exp.id,
              timestamp: exp.created_at || exp.date,
              userName: 'System',
              userEmail: '',
              summary: `Expense #${exp.expense_number || ''} created for ${exp.amount}`,
              details: { amount: exp.amount, status: exp.status, date: exp.date },
            });
          }
        } else if (normType === 'estimate' || normType === 'quotation') {
          const estRes = await db.query('SELECT id, estimate_number, total_amount, issue_date, status, created_at FROM estimates WHERE organization_id = $1 AND id = $2', [orgId, entityId]);
          if (estRes.rows.length > 0) {
            const est = estRes.rows[0];
            events.push({
              id: `init-${est.id}`,
              action: 'QUOTATION_CREATED',
              actionLabel: 'Quotation Created',
              entityType: 'Quotation',
              entityId: est.id,
              timestamp: est.created_at || est.issue_date,
              userName: 'System',
              userEmail: '',
              summary: `Quotation #${est.estimate_number || ''} created for ${est.total_amount}`,
              details: { totalAmount: est.total_amount, status: est.status, issueDate: est.issue_date },
            });
          }
        } else if (normType === 'journal' || normType === 'journalentry') {
          const jrnRes = await db.query('SELECT id, entry_number, reference, description, date, status, created_at FROM journal_entries WHERE organization_id = $1 AND id = $2', [orgId, entityId]);
          if (jrnRes.rows.length > 0) {
            const jrn = jrnRes.rows[0];
            events.push({
              id: `init-${jrn.id}`,
              action: 'MANUAL_JOURNAL_CREATED',
              actionLabel: 'Journal Entry Posted',
              entityType: 'JournalEntry',
              entityId: jrn.id,
              timestamp: jrn.created_at || jrn.date,
              userName: 'System',
              userEmail: '',
              summary: `Journal #${jrn.entry_number || ''} posted (${jrn.reference || jrn.description || ''})`,
              details: { entryNumber: jrn.entry_number, status: jrn.status, date: jrn.date },
            });
          }
        } else if (normType === 'invoice') {
          const invRes = await db.query('SELECT id, invoice_number, total_amount, issue_date, status, created_at FROM invoices WHERE organization_id = $1 AND id = $2', [orgId, entityId]);
          if (invRes.rows.length > 0) {
            const inv = invRes.rows[0];
            events.push({
              id: `init-${inv.id}`,
              action: 'INVOICE_CREATED',
              actionLabel: 'Invoice Created',
              entityType: 'Invoice',
              entityId: inv.id,
              timestamp: inv.created_at || inv.issue_date,
              userName: 'System',
              userEmail: '',
              summary: `Invoice #${inv.invoice_number || ''} created for ${inv.total_amount}`,
              details: { totalAmount: inv.total_amount, status: inv.status, issueDate: inv.issue_date },
            });
          }
        } else if (normType === 'bill') {
          const billRes = await db.query('SELECT id, bill_number, total_amount, bill_date, status, created_at FROM bills WHERE organization_id = $1 AND id = $2', [orgId, entityId]);
          if (billRes.rows.length > 0) {
            const bill = billRes.rows[0];
            events.push({
              id: `init-${bill.id}`,
              action: 'BILL_CREATED',
              actionLabel: 'Bill Created',
              entityType: 'Bill',
              entityId: bill.id,
              timestamp: bill.created_at || bill.bill_date,
              userName: 'System',
              userEmail: '',
              summary: `Bill #${bill.bill_number || ''} created for ${bill.total_amount}`,
              details: { totalAmount: bill.total_amount, status: bill.status, billDate: bill.bill_date },
            });
          }
        }
      }

      // Sort chronological descending (most recent first)
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load transaction history' });
    }
  }

  public static async getFinancialCommand(req: AuthenticatedRequest, res: Response): Promise<void> {
    const organizationId = req.auth!.organizationId;
    const command = await db.query(
      `SELECT id, command_type, schema_version, status, result, result_version, error_code, created_at, completed_at
         FROM financial_commands
        WHERE organization_id = $1 AND id = $2`,
      [organizationId, req.params.id]
    );
    if (command.rows.length === 0) {
      res.status(404).json({ error: 'Financial command not found' });
      return;
    }
    const events = await db.query(
      `SELECT event_type, aggregate_type, aggregate_id, status, created_at, completed_at
         FROM financial_outbox_events
        WHERE organization_id = $1 AND command_id = $2
        ORDER BY created_at ASC`,
      [organizationId, req.params.id]
    );
    res.json({ data: { ...command.rows[0], events: events.rows }, freshness: 'transactional' });
  }

  // --- PHASE 4: CUSTOMERS & VENDORS ---
  public static async getCustomers(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const search = req.query.search as string;
    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${search.trim()}%`;
      const result = await db.query(
        `SELECT * FROM customers 
         WHERE organization_id = $1 
           AND (active IS NOT FALSE)
           AND (display_name ILIKE $2 OR legal_name ILIKE $2 OR customer_id ILIKE $2 OR gstin ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
         ORDER BY display_name ASC LIMIT 50`,
        [orgId, q]
      );
      res.json(result.rows);
      return;
    }
    const result = await db.query(
      `SELECT * FROM customers 
       WHERE organization_id = $1 
         AND (active IS NOT FALSE)
       ORDER BY display_name ASC LIMIT 50`,
      [orgId]
    );
    res.json(result.rows);
  }

  private static async syncCustomerClientProjection(
    client: any,
    organizationId: string,
    customer: any,
    explicitFields: Set<string> = new Set()
  ): Promise<{ changed: boolean; before: any | null; after: any; customer: any; canonicalRepaired: boolean; promotedFields: string[] }> {
    const conflictingProjection = await client.query('SELECT * FROM clients WHERE id = $1 FOR UPDATE', [customer.id]);
    if (conflictingProjection.rows.length > 0 && conflictingProjection.rows[0].organization_id !== organizationId) {
      throw new Error('CUSTOMER_PROJECTION_INCONSISTENT: Customer compatibility record belongs to another organization');
    }
    const existingProjection = conflictingProjection.rows[0];
    const isMissingMetadata = (value: unknown): boolean => value == null || value === '' ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0);
    const promotedFields: string[] = [];
    const repairs: string[] = [];
    const repairValues: unknown[] = [];
    if (existingProjection && !explicitFields.has('billingAddress') && isMissingMetadata(customer.billing_address) && !isMissingMetadata(existingProjection.billing_address)) {
      repairs.push(`billing_address = $${repairs.length + 1}`);
      repairValues.push(JSON.stringify(existingProjection.billing_address));
      promotedFields.push('billingAddress');
    }
    if (existingProjection && !explicitFields.has('gstin') && isMissingMetadata(customer.gstin) && !isMissingMetadata(existingProjection.tax_id)) {
      repairs.push(`gstin = $${repairs.length + 1}`);
      repairValues.push(existingProjection.tax_id);
      promotedFields.push('gstin');
    }
    let canonicalRepaired = false;
    if (repairs.length > 0) {
      repairValues.push(organizationId, customer.id);
      const repaired = await client.query(
        `UPDATE customers SET ${repairs.join(', ')} WHERE organization_id = $${repairValues.length - 1} AND id = $${repairValues.length} RETURNING *`,
        repairValues
      );
      customer = repaired.rows[0];
      canonicalRepaired = true;
    }
    const chooseValue = (field: string, canonical: unknown, compatibility: unknown, fallback: unknown) =>
      explicitFields.has(field) || !isMissingMetadata(canonical) ? (canonical ?? fallback) : (compatibility ?? fallback);
    const selectedAddress = chooseValue('billingAddress', customer.billing_address, existingProjection?.billing_address, '');
    const customerBillingAddress = isMissingMetadata(selectedAddress)
      ? ''
      : typeof selectedAddress === 'string' ? selectedAddress : JSON.stringify(selectedAddress);
    const projection = {
      name: customer.display_name,
      company_name: chooseValue('legalName', customer.legal_name, existingProjection?.company_name, ''),
      email: chooseValue('email', customer.email, existingProjection?.email, ''),
      phone: chooseValue('phone', customer.phone, existingProjection?.phone, ''),
      billing_address: customerBillingAddress,
      tax_id: chooseValue('gstin', customer.gstin, existingProjection?.tax_id, ''),
      currency: customer.currency,
      payment_terms: chooseValue('paymentTerms', customer.payment_terms, existingProjection?.payment_terms, 'Net 30'),
      notes: chooseValue('notes', customer.notes, existingProjection?.notes, ''),
    };
    await client.query(
      `INSERT INTO clients (id, organization_id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms, notes, receivables_balance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET
         organization_id = EXCLUDED.organization_id,
         name = EXCLUDED.name,
         company_name = EXCLUDED.company_name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         billing_address = EXCLUDED.billing_address,
         tax_id = EXCLUDED.tax_id,
         currency = EXCLUDED.currency,
         payment_terms = EXCLUDED.payment_terms,
         notes = EXCLUDED.notes
       WHERE clients.organization_id = EXCLUDED.organization_id`,
      [
        customer.id, organizationId, projection.name, projection.company_name, projection.email, projection.phone,
        projection.billing_address, projection.tax_id, projection.currency, projection.payment_terms, projection.notes,
        customer.receivables_balance || 0, customer.created_at,
      ]
    );
    const afterResult = await client.query('SELECT * FROM clients WHERE organization_id = $1 AND id = $2', [organizationId, customer.id]);
    const after = afterResult.rows[0];
    const changed = !existingProjection || [
      'name', 'company_name', 'email', 'phone', 'billing_address', 'tax_id', 'currency', 'payment_terms', 'notes',
    ].some((field) => (existingProjection?.[field] ?? '') !== (after?.[field] ?? ''));
    return { changed, before: existingProjection || null, after, customer, canonicalRepaired, promotedFields };
  }

  private static async auditCustomerProjectionRepair(
    client: any,
    organizationId: string,
    userId: string,
    customerId: string,
    projectionRepair: { changed: boolean; before: any | null; after: any }
  ): Promise<void> {
    if (!projectionRepair.changed) return;
    await client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
       VALUES ($1, $2, $3, 'CUSTOMER_PROJECTION_REPAIRED', 'Customer', $4, $5, $6)`,
      [newId('aud'), organizationId, userId, customerId,
        projectionRepair.before ? JSON.stringify(projectionRepair.before) : null, JSON.stringify(projectionRepair.after)]
    );
  }

  public static async updateCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : null;
    const allowed = new Set([
      'displayName', 'name', 'legalName', 'companyName', 'customerType', 'gstStatus', 'gstin', 'taxId', 'pan', 'billingAddress',
      'shippingAddresses', 'placeOfSupply', 'primaryContact', 'additionalContacts', 'email', 'phone',
      'paymentTerms', 'creditLimit', 'priceListId', 'taxPreferences', 'defaultSalesAccountId', 'salespersonId', 'notes', 'attachments',
    ]);
    if (!body || Object.keys(body).some((key) => !allowed.has(key))) {
      res.status(400).json({ error: 'Customer updates may contain only editable customer metadata' });
      return;
    }
    const metadata = { ...body };
    if (metadata.displayName === undefined && typeof metadata.name === 'string') metadata.displayName = metadata.name;
    if (metadata.legalName === undefined && metadata.companyName !== undefined) metadata.legalName = metadata.companyName;
    if (metadata.gstin === undefined && metadata.taxId !== undefined) metadata.gstin = metadata.taxId;
    delete metadata.name;
    delete metadata.companyName;
    delete metadata.taxId;
    const boundedString = (key: string, max: number, required = false) => {
      const value = metadata[key];
      return value === undefined || (typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim())));
    };
    if (
      (metadata.displayName !== undefined && !boundedString('displayName', 255, true)) ||
      !boundedString('legalName', 255) || !boundedString('gstin', 50) || !boundedString('pan', 50) ||
      !boundedString('placeOfSupply', 100) || !boundedString('email', 255) || !boundedString('phone', 50) ||
      !boundedString('paymentTerms', 50) || !boundedString('notes', 10000) ||
      (metadata.customerType !== undefined && !['Business', 'Individual'].includes(metadata.customerType)) ||
      (metadata.gstStatus !== undefined && !['Registered', 'Unregistered', 'Composition', 'SEZ'].includes(metadata.gstStatus)) ||
      (metadata.email !== undefined && metadata.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metadata.email)) ||
      (metadata.creditLimit !== undefined && (!Number.isFinite(Number(metadata.creditLimit)) || Number(metadata.creditLimit) < 0 || !Number.isSafeInteger(Math.round(Number(metadata.creditLimit) * 100)) || Math.abs(Number(metadata.creditLimit) * 100 - Math.round(Number(metadata.creditLimit) * 100)) > 1e-7)) ||
      metadata.priceListId !== undefined ||
      (metadata.defaultSalesAccountId !== undefined && metadata.defaultSalesAccountId !== null && typeof metadata.defaultSalesAccountId !== 'string') ||
      (metadata.salespersonId !== undefined && metadata.salespersonId !== null && typeof metadata.salespersonId !== 'string')
    ) {
      res.status(400).json({ error: 'Customer metadata is invalid or exceeds the allowed length' });
      return;
    }
    if (metadata.email) metadata.email = metadata.email.trim().toLowerCase();
    if (metadata.displayName !== undefined) metadata.displayName = metadata.displayName.trim();
    if (metadata.legalName !== undefined) metadata.legalName = metadata.legalName.trim();
    if (metadata.phone !== undefined) metadata.phone = metadata.phone.trim();
    if (metadata.paymentTerms !== undefined) metadata.paymentTerms = metadata.paymentTerms.trim();
    if (metadata.notes !== undefined) metadata.notes = metadata.notes.trim();
    const encodedMetadata = JSON.stringify({
      billingAddress: metadata.billingAddress, shippingAddresses: metadata.shippingAddresses, primaryContact: metadata.primaryContact,
      additionalContacts: metadata.additionalContacts, taxPreferences: metadata.taxPreferences, attachments: metadata.attachments,
    });
    if (Buffer.byteLength(encodedMetadata, 'utf8') > 100_000) {
      res.status(400).json({ error: 'Customer metadata cannot exceed 100 KB' });
      return;
    }

    const columnMap: Record<string, string> = {
      displayName: 'display_name', legalName: 'legal_name', customerType: 'customer_type', gstStatus: 'gst_status',
      gstin: 'gstin', pan: 'pan', billingAddress: 'billing_address', shippingAddresses: 'shipping_addresses',
      placeOfSupply: 'place_of_supply', primaryContact: 'primary_contact', additionalContacts: 'additional_contacts',
      email: 'email', phone: 'phone', paymentTerms: 'payment_terms', creditLimit: 'credit_limit',
      taxPreferences: 'tax_preferences', defaultSalesAccountId: 'default_sales_account_id', salespersonId: 'salesperson_id',
      notes: 'notes', attachments: 'attachments',
    };
    try {
      const result = await db.transaction(async (client) => {
        const currentResult = await client.query('SELECT * FROM customers WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, req.params.id]);
        if (currentResult.rows.length !== 1) {
          const legacy = await client.query('SELECT id FROM clients WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, req.params.id]);
          if (legacy.rows.length) throw new Error('CUSTOMER_PROJECTION_INCONSISTENT: Customer metadata cannot be changed until its canonical record is restored');
          throw new Error('CUSTOMER_NOT_FOUND: Customer not found');
        }
        const before = currentResult.rows[0];
        if (before.active === false) throw new Error('CUSTOMER_ARCHIVED: Archived customers cannot be edited');
        const accountId = metadata.defaultSalesAccountId;
        if (accountId) {
          const account = await client.query("SELECT id FROM accounts WHERE organization_id = $1 AND id = $2 AND status = 'Active' AND type = 'Income'", [orgId, accountId]);
          if (account.rows.length !== 1) throw new Error('DEFAULT_SALES_ACCOUNT_INVALID: Default sales account must be an active income account in this organization');
        }
        if (metadata.salespersonId) {
          const salesperson = await client.query('SELECT id, status FROM salespersons WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, metadata.salespersonId]);
          if (salesperson.rows.length !== 1) throw new Error('SALESPERSON_INVALID: Customer salesperson does not belong to this organization');
          if (String(salesperson.rows[0].status || 'ACTIVE').toUpperCase() !== 'ACTIVE') throw new Error('SALESPERSON_INACTIVE: Inactive salespersons cannot be assigned to customers');
        }
        const entries = Object.entries(metadata).filter(([key]) => columnMap[key]);
        let changed = entries.some(([key, value]) => {
          const column = columnMap[key];
          const existing = before[column];
          if (['billingAddress', 'shippingAddresses', 'primaryContact', 'additionalContacts', 'taxPreferences', 'attachments'].includes(key)) {
            return JSON.stringify(existing ?? (key === 'shippingAddresses' || key === 'additionalContacts' || key === 'attachments' ? [] : {})) !== JSON.stringify(value ?? (key === 'shippingAddresses' || key === 'additionalContacts' || key === 'attachments' ? [] : {}));
          }
          if (key === 'creditLimit') return Number(existing || 0) !== Number(value);
          return (existing ?? '') !== (value ?? '');
        });
        let customer = before;
        if (changed) {
          const params: unknown[] = [];
          const assignments = entries.map(([key, rawValue]) => {
            const value = ['billingAddress', 'shippingAddresses', 'primaryContact', 'additionalContacts', 'taxPreferences', 'attachments'].includes(key)
              ? JSON.stringify(rawValue ?? (key === 'shippingAddresses' || key === 'additionalContacts' || key === 'attachments' ? [] : {}))
              : rawValue;
            params.push(value);
            return `${columnMap[key]} = $${params.length}`;
          });
          params.push(orgId, req.params.id);
          const updated = await client.query(`UPDATE customers SET ${assignments.join(', ')} WHERE organization_id = $${params.length - 1} AND id = $${params.length} RETURNING *`, params);
          customer = updated.rows[0];
        }
        const projectionRepair = await FinanceController.syncCustomerClientProjection(
          client, orgId, customer, new Set(entries.map(([key]) => key))
        );
        customer = projectionRepair.customer;
        const canonicalEdited = changed;
        changed = changed || projectionRepair.canonicalRepaired;
        if (changed) {
          await client.query(
            `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
             VALUES ($1, $2, $3, $4, 'Customer', $5, $6, $7)`,
            [newId('aud'), orgId, req.auth!.userId, canonicalEdited ? 'CUSTOMER_UPDATED' : 'CUSTOMER_MASTER_RECONCILED', req.params.id,
              JSON.stringify(before), JSON.stringify({ ...customer, promotedFields: projectionRepair.promotedFields })]
          );
        } else {
          await FinanceController.auditCustomerProjectionRepair(client, orgId, req.auth!.userId, req.params.id, projectionRepair);
        }
        return { customer, changed, projectionRepaired: projectionRepair.changed };
      }, { organizationId: orgId });
      res.json({ ...result.customer, id: req.params.id, changed: result.changed, projectionRepaired: result.projectionRepaired });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Customer could not be updated';
      const status = message.startsWith('CUSTOMER_NOT_FOUND') ? 404 : message.startsWith('CUSTOMER_ARCHIVED') || message.startsWith('CUSTOMER_PROJECTION_INCONSISTENT') ? 409 : 400;
      res.status(status).json({ error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async archiveCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const result = await db.transaction(async (client) => {
        const currentResult = await client.query('SELECT * FROM customers WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, req.params.id]);
        if (currentResult.rows.length !== 1) {
          const legacy = await client.query('SELECT id FROM clients WHERE organization_id = $1 AND id = $2 FOR UPDATE', [orgId, req.params.id]);
          if (legacy.rows.length) throw new Error('CUSTOMER_PROJECTION_INCONSISTENT: Customer cannot be archived until its canonical record is restored');
          throw new Error('CUSTOMER_NOT_FOUND: Customer not found');
        }
        const before = currentResult.rows[0];
        if (before.active === false) return { customer: before, changed: false, projectionRepaired: false };
        let customer = (await client.query('UPDATE customers SET active = FALSE WHERE organization_id = $1 AND id = $2 RETURNING *', [orgId, req.params.id])).rows[0];
        const projectionRepair = await FinanceController.syncCustomerClientProjection(client, orgId, customer);
        customer = projectionRepair.customer;
        if (before.active !== false) {
          await client.query(
            `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
             VALUES ($1, $2, $3, 'CUSTOMER_ARCHIVED', 'Customer', $4, $5, $6)`,
            [newId('aud'), orgId, req.auth!.userId, req.params.id, JSON.stringify(before), JSON.stringify({ ...customer, promotedFields: projectionRepair.promotedFields })]
          );
        } else {
          await FinanceController.auditCustomerProjectionRepair(client, orgId, req.auth!.userId, req.params.id, projectionRepair);
        }
        return { customer, changed: true, projectionRepaired: projectionRepair.changed };
      }, { organizationId: orgId });
      res.json({ id: req.params.id, archived: true, changed: result.changed, active: false, projectionRepaired: result.projectionRepaired });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Customer could not be archived';
      const status = message.startsWith('CUSTOMER_NOT_FOUND') ? 404 : message.startsWith('CUSTOMER_PROJECTION_INCONSISTENT') ? 409 : 400;
      res.status(status).json({ error: message.replace(/^[A-Z_]+: /, '') });
    }
  }

  public static async createCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const customer = await db.transaction(async (client) => {
      const created = await SalesEngine.createCustomer(orgId, req.body, client);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'CUSTOMER_CREATED', 'Customer', $4, $5)`,
        [newId('aud'), orgId, req.auth!.userId, created.id, JSON.stringify(created)]
      );
      return created;
    });
    res.status(201).json(customer);
  }

  public static async getCustomerSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const summary = await SalesEngine.getCustomerSummary(orgId, req.params.id);
    if (!summary) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }
    res.json(summary);
  }

  // --- ESTIMATES ---
  public static async getEstimates(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM estimates WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createEstimate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const estimate = await QuotationEngine.createQuotation(orgId, req.body, req.auth!.userId);
    res.status(201).json(estimate);
  }

  public static async reviseEstimate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { changeSummary, notes, ...newData } = req.body;
    const summary = changeSummary || notes || 'Revised Estimate';
    const estimate = await QuotationEngine.reviseQuotation(orgId, req.params.id, { notes, ...newData }, summary, req.auth!.userId);
    res.json(estimate);
  }

  // --- SALES ORDERS ---
  public static async getSalesOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const filter = {
      customerId: req.query.customerId as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    };
    const orders = await SalesEngine.listSalesOrders(orgId, filter);
    res.json(orders);
  }

  public static async getSalesOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const so = await SalesEngine.getSalesOrder(orgId, req.params.id);
    if (!so) {
      res.status(404).json({ error: `Sales order ${req.params.id} not found` });
      return;
    }
    res.json(so);
  }

  public static async createSalesOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const so = await SalesEngine.createSalesOrder(orgId, req.body, undefined, req.auth!.userId);
      res.status(201).json(so);
    } catch (error: any) {
      res.status(422).json({ error: error?.message || 'Sales order could not be created' });
    }
  }

  public static async updateSalesOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const updated = await SalesEngine.updateSalesOrder(orgId, req.params.id, req.body, req.auth!.userId);
      res.json(updated);
    } catch (error: any) {
      const message = error?.message || 'Sales order could not be updated';
      res.status(message.includes('not found') ? 404 : 422).json({ error: message });
    }
  }

  public static async convertSalesOrderToInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const invoice = await SalesEngine.convertSalesOrderToInvoice(
        orgId,
        req.params.id,
        req.auth!.userId,
        req.body?.partialAmount,
        req.body?.lineItems
      );
      res.status(201).json(invoice);
    } catch (error: any) {
      const message = error?.message || 'Sales order conversion failed';
      if (/not found/i.test(message)) { res.status(404).json({ error: message }); return; }
      if (/already fully invoiced|cannot be converted|exceeds the uninvoiced|invoice amount must be greater than zero|invoice requires at least one line|invalid description|invalid amount|fractional cents|partial conversion of a GST-bearing sales order|caller-supplied line items cannot override|selected sales order invoice lines do not match|sales order counters are inconsistent|invoice customer does not match/i.test(message)) {
        res.status(/cannot be converted|already fully invoiced|exceeds the uninvoiced|counters are inconsistent/i.test(message) ? 409 : 422).json({ error: message });
        return;
      }
      console.error('Sales order invoice conversion failed:', error);
      res.status(500).json({ error: 'Sales order conversion could not be confirmed; verify status before retrying' });
    }
  }

  public static async fulfillSalesOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const result = await SalesEngine.fulfillSalesOrder(
        orgId,
        req.params.id,
        req.auth!.userId,
        req.body
      );
      res.status(201).json(result);
    } catch (error: any) {
      const message = error?.message || 'Sales order fulfillment failed';
      if (/not found/i.test(message)) { res.status(404).json({ error: message }); return; }
      if (/already fully fulfilled|cannot fulfill|cannot be fulfilled|exceeds the remaining|must be positive|fractional cents|inconsistent/i.test(message)) {
        res.status(409).json({ error: message });
        return;
      }
      console.error('Sales order fulfillment failed:', error);
      res.status(500).json({ error: 'Sales order fulfillment could not be confirmed; verify status before retrying' });
    }
  }

  public static async cancelSalesOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 3 || reason.length > 1000) {
      res.status(400).json({ error: 'A cancellation reason between 3 and 1000 characters is required' });
      return;
    }
    try {
      const cancelled = await SalesEngine.cancelSalesOrder(orgId, req.params.id, req.auth!.userId, reason);
      res.json(cancelled);
    } catch (error: any) {
      const message = error?.message || 'Sales order cancellation failed';
      if (/not found/i.test(message)) { res.status(404).json({ error: message }); return; }
      if (/cannot cancel|cancelled sales order|cancellation reason|must be a valid amount/i.test(message)) {
        res.status(/cancellation reason/i.test(message) ? 400 : 409).json({ error: message });
        return;
      }
      console.error('Sales order cancellation failed:', error);
      res.status(500).json({ error: 'Sales order cancellation could not be confirmed; verify status before retrying' });
    }
  }

  // --- DELIVERY CHALLANS ---
  public static async getDeliveryChallans(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM delivery_challans WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createDeliveryChallan(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const now = new Date().toISOString();
    const deliveryDate = req.body.deliveryDate || now.split('T')[0];
    const customerId = req.body.customerId;

    if (!customerId || typeof customerId !== 'string') {
      res.status(400).json({ error: 'A valid customerId is required' });
      return;
    }

    try {
      if (req.body.salesOrderId) {
        const order = await SalesEngine.getSalesOrder(orgId, String(req.body.salesOrderId));
        if (!order) throw new Error('SALES_ORDER_NOT_FOUND: Sales order does not belong to this organization');
        if (order.customerId !== customerId) throw new Error('SALES_ORDER_CUSTOMER_MISMATCH: Delivery challan customer must match the sales order');
        const requestedStatus = String(req.body.status || 'ISSUED').trim().toUpperCase();
        if (requestedStatus !== 'ISSUED') throw new Error('LINKED_CHALLAN_STATUS_INVALID: A sales-order delivery challan must be issued');
        const fulfillment = await SalesEngine.fulfillSalesOrder(orgId, order.id, req.auth!.userId, {
          deliveryDate,
          reason: req.body.reason || 'Supply on Approval',
          notes: req.body.notes || '',
          transportDetails: req.body.transportDetails || {},
          lineItems: req.body.lineItems || [],
          fulfilledAmount: req.body.fulfilledAmount ?? req.body.totalAmount,
        });
        res.status(201).json({
          ...req.body,
          id: fulfillment.challanId,
          challanNumber: fulfillment.challanNumber,
          customerId: order.customerId,
          customerName: order.customerName,
          salesOrderId: order.id,
          status: 'ISSUED',
          fulfilledAmount: fulfillment.fulfilledAmount,
          salesOrder: fulfillment.salesOrder,
        });
        return;
      }
      const result = await db.transaction(async (client) => {
        const custRes = await client.query(
          `SELECT id, display_name AS name FROM customers WHERE organization_id = $1 AND id = $2
           UNION ALL SELECT id, name FROM clients WHERE organization_id = $1 AND id = $2 LIMIT 1`,
          [orgId, customerId]
        );
        if (custRes.rows.length === 0) {
          throw new Error('CUSTOMER_NOT_FOUND: Customer does not belong to this organization');
        }
        const resolvedCustomerName = custRes.rows[0].name || req.body.customerName || 'Customer';
        const standaloneStatus = String(req.body.status || 'DRAFT').trim().toUpperCase();
        if (!['DRAFT', 'ISSUED', 'DELIVERED', 'IN_TRANSIT'].includes(standaloneStatus)) throw new Error('CHALLAN_STATUS_INVALID: Standalone challan status is invalid');

        const id = newId('dc');
        const challanNum = await DocumentNumberingEngine.getNextNumber(orgId, 'DELIVERY_CHALLAN', deliveryDate, undefined, client);

        await client.query(
          `INSERT INTO delivery_challans (id, organization_id, challan_number, customer_id, customer_name, sales_order_id, delivery_date, status, reason, line_items, transport_details, notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            id,
            orgId,
            challanNum,
            customerId,
            resolvedCustomerName,
            req.body.salesOrderId || null,
            deliveryDate,
            standaloneStatus,
            req.body.reason || 'Supply on Approval',
            JSON.stringify(req.body.lineItems || []),
            JSON.stringify(req.body.transportDetails || {}),
            req.body.notes || '',
            now,
          ]
        );

        await FinanceController.logAudit(orgId, req.auth!.userId, 'DELIVERY_CHALLAN_CREATED', 'DeliveryChallan', id, req.body, client);
        return { id, challanNumber: challanNum, customerName: resolvedCustomerName };
      });

      res.status(201).json({ ...req.body, ...result });
    } catch (error: any) {
      const message = error?.message || 'Delivery challan could not be created';
      if (message.startsWith('CUSTOMER_NOT_FOUND') || message.startsWith('SALES_ORDER_NOT_FOUND') || message.startsWith('SALES_ORDER_CUSTOMER_MISMATCH') || message.startsWith('LINKED_CHALLAN_STATUS_INVALID') || message.startsWith('CHALLAN_STATUS_INVALID')) {
        res.status(400).json({ error: message.replace(/^[A-Z_]+: /, '') });
        return;
      }
      if (/cannot be fulfilled|cannot fulfill a cancelled|exceeds the remaining|must be positive|no fractional cents|status .*cancelled|inconsistent/i.test(message)) {
        res.status(409).json({ error: message });
        return;
      }
      console.error('Delivery challan creation failed:', error);
      res.status(500).json({ error: 'Delivery challan could not be created; verify status before retrying' });
    }
  }

  // --- PURCHASE ORDERS ---
  public static async getPurchaseOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const filter = {
      vendorId: req.query.vendorId as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    };
    const orders = await PurchasesEngine.listPurchaseOrders(orgId, filter);
    res.json(orders);
  }

  public static async getPurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const po = await PurchasesEngine.getPurchaseOrder(orgId, req.params.id);
    if (!po) {
      res.status(404).json({ error: `Purchase order ${req.params.id} not found` });
      return;
    }
    res.json(po);
  }

  public static async createPurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const po = await PurchasesEngine.createPurchaseOrder(orgId, req.body);
      res.status(201).json(po);
    } catch (error: any) {
      res.status(422).json({ error: error?.message || 'Purchase order could not be created' });
    }
  }

  public static async updatePurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const updated = await PurchasesEngine.updatePurchaseOrder(orgId, req.params.id, req.body, req.auth!.userId);
      res.json(updated);
    } catch (error: any) {
      const message = error?.message || 'Purchase order could not be updated';
      res.status(message.includes('not found') ? 404 : 422).json({ error: message });
    }
  }

  public static async approvePurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const approvalRequestId = req.body?.approvalRequestId || (req.query?.approvalRequestId as string) || req.params?.approvalRequestId;
      const approved = await PurchasesEngine.approvePurchaseOrder(
        orgId,
        req.params.id,
        req.auth!.userId,
        req.auth!.role,
        approvalRequestId
      );
      res.json(approved);
    } catch (error: any) {
      const message = error?.message || 'Purchase order could not be approved';
      const status = message.includes('MISSING_APPROVAL_REQUEST_ID') ? 400 : 422;
      res.status(status).json({ error: message });
    }
  }

  public static async convertPurchaseOrderToBill(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const bill = await PurchasesEngine.convertPurchaseOrderToBill(
        orgId,
        req.params.id,
        req.auth!.userId,
        req.body?.partialAmount
      );
      res.status(201).json(bill);
    } catch (error: any) {
      const message = error?.message || 'Purchase order conversion to bill failed';
      res.status(message.includes('not found') ? 404 : message.includes('already fully billed') || message.includes('cannot be converted') ? 409 : 422).json({ error: message });
    }
  }

  public static async receivePurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const receipt = await PurchasesEngine.receivePurchaseOrder(
        orgId,
        req.params.id,
        req.auth!.userId,
        req.body
      );
      res.status(201).json(receipt);
    } catch (error: any) {
      const message = error?.message || 'Purchase order receipt failed';
      res.status(message.includes('not found') ? 404 : 422).json({ error: message });
    }
  }

  public static async cancelPurchaseOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const reason = req.body?.reason || 'Cancelled by user';
      const cancelled = await PurchasesEngine.cancelPurchaseOrder(orgId, req.params.id, req.auth!.userId, reason);
      res.json(cancelled);
    } catch (error: any) {
      const message = error?.message || 'Purchase order cancellation failed';
      res.status(message.includes('not found') ? 404 : message.includes('Cannot cancel') ? 409 : 422).json({ error: message });
    }
  }

  // --- GOODS RECEIPTS ---
  public static async getGoodsReceipts(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const receipts = await PurchasesEngine.listGoodsReceipts(orgId, req.query.purchaseOrderId as string | undefined);
    res.json(receipts);
  }

  public static async createGoodsReceipt(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    try {
      const receipt = await PurchasesEngine.createReceipt(orgId, req.body);
      res.status(201).json(receipt);
    } catch (error: any) {
      res.status(422).json({ error: error?.message || 'Goods receipt could not be created' });
    }
  }

  // --- ADVANCES, CREDIT NOTES, REFUNDS & WRITE-OFFS ---
  public static async applyCustomerAdvance(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { advanceId, invoiceId, amountToApply, applyDate } = req.body;
    const result = await db.transaction(async (client) => {
      const application = await SalesEngine.applyAdvanceToInvoice(orgId, advanceId, invoiceId, amountToApply, applyDate || new Date().toISOString().split('T')[0], client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'CUSTOMER_ADVANCE_APPLIED', 'CustomerAdvance', advanceId, application, client);
      return application;
    });
    res.json(result);
  }

  public static async getCustomerAdvances(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM customer_advances WHERE organization_id = $1 ORDER BY received_date DESC, created_at DESC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  public static async recordCustomerAdvance(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const advance = await SalesEngine.recordCustomerAdvance(orgId, req.body, req.auth!.userId, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'CUSTOMER_ADVANCE_RECORDED', 'CustomerAdvance', advance.id, advance, client);
      return advance;
    });
    res.status(201).json(result);
  }

  public static async getCustomerAdvanceApplications(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM customer_advance_applications WHERE organization_id = $1 ORDER BY created_at DESC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  public static async getCreditNotes(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM credit_notes WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows);
  }

  public static async getCreditNoteApplications(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const creditNoteId = req.query.creditNoteId as string | undefined;
    let query = `
      SELECT cna.*, i.invoice_number
      FROM credit_note_applications cna
      LEFT JOIN invoices i ON i.id = cna.invoice_id AND i.organization_id = cna.organization_id
      WHERE cna.organization_id = $1
    `;
    const params: any[] = [orgId];
    if (creditNoteId) {
      query += ` AND cna.credit_note_id = $2`;
      params.push(creditNoteId);
    }
    query += ` ORDER BY cna.applied_date DESC, cna.created_at DESC`;
    const result = await db.query(query, params);
    res.json(result.rows);
  }

  public static async createCreditNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const note = await SalesEngine.createCreditNote(orgId, req.body, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'CREDIT_NOTE_CREATED', 'CreditNote', note.creditNoteId, note, client);
      return note;
    });
    res.status(201).json(result);
  }

  public static async applyCreditNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { creditNoteId, invoiceId, amountToApply, applyDate } = req.body;
    const result = await db.transaction(async (client) => {
      const application = await SalesEngine.applyCreditNoteToInvoice(orgId, creditNoteId, invoiceId, amountToApply, applyDate || new Date().toISOString().split('T')[0], client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'CREDIT_NOTE_APPLIED', 'CreditNote', creditNoteId, application, client);
      return application;
    });
    res.json(result);
  }

  public static async recordRefund(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const refund = await SalesEngine.recordRefund(orgId, req.body, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'CUSTOMER_REFUND_RECORDED', 'CustomerRefund', refund.refundId, refund, client);
      return refund;
    });
    res.status(201).json(result);
  }

  public static async recordWriteOff(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const writeOff = await SalesEngine.recordWriteOff(orgId, { ...req.body, userId: req.auth!.userId }, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'AR_WRITE_OFF_RECORDED', 'WriteOff', writeOff.writeOffId, writeOff, client);
      return writeOff;
    });
    res.status(201).json(result);
  }

  public static async getCustomerRefunds(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM customer_refunds WHERE organization_id = $1 ORDER BY refund_date DESC, created_at DESC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  public static async getReceivableWriteOffs(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM ar_write_offs WHERE organization_id = $1 ORDER BY write_off_date DESC, created_at DESC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  // --- VENDOR PAYMENTS, ADVANCES, CREDITS & WRITE-OFFS ---
  public static async getVendorPayments(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query(
      `SELECT * FROM payments_made
        WHERE organization_id = $1
        ORDER BY payment_date DESC, created_at DESC`,
      [req.auth!.organizationId]
    );
    res.json(result.rows);
  }

  public static async recordVendorPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const payment = await PurchasesEngine.recordVendorPayment(orgId, { ...req.body, createdBy: req.auth!.userId }, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'VENDOR_PAYMENT_RECORDED', 'VendorPayment', payment.id, payment, client);
      return payment;
    });
    res.status(201).json(result);
  }

  public static async reverseVendorPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseVendorPayment(
      req.auth!.organizationId,
      req.params.id,
      req.auth!.userId,
      req.body?.reason
    );
    res.json(result);
  }

  public static async getVendorAdvances(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query(
      `SELECT * FROM vendor_advances
        WHERE organization_id = $1
        ORDER BY paid_date DESC, created_at DESC`,
      [req.auth!.organizationId]
    );
    res.json(result.rows);
  }

  public static async getVendorAdvanceApplications(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM vendor_advance_applications WHERE organization_id = $1 ORDER BY created_at DESC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  public static async recordVendorAdvance(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const advance = await PurchasesEngine.recordVendorAdvance(orgId, req.body, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'VENDOR_ADVANCE_RECORDED', 'VendorAdvance', advance.id, advance, client);
      return advance;
    });
    res.status(201).json(result);
  }

  public static async applyVendorAdvance(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const application = await PurchasesEngine.applyVendorAdvance(orgId, req.body, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'VENDOR_ADVANCE_APPLIED', 'VendorAdvance', req.body.advanceId, application, client);
      return application;
    });
    res.json(result);
  }

  public static async getDebitNotes(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query(
      `SELECT * FROM vendor_credits
        WHERE organization_id = $1
        ORDER BY date DESC, created_at DESC`,
      [req.auth!.organizationId]
    );
    res.json(result.rows);
  }

  public static async createDebitNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const note = await PurchasesEngine.createDebitNote(orgId, req.body, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'DEBIT_NOTE_CREATED', 'DebitNote', note.id, note, client);
      return note;
    });
    res.status(201).json(result);
  }

  public static async recordAPWriteOff(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const writeOff = await PurchasesEngine.recordAPWriteOff(orgId, { ...req.body, userId: req.auth!.userId }, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'AP_WRITE_OFF_RECORDED', 'APWriteOff', writeOff.writeOffId, writeOff, client);
      return writeOff;
    });
    res.status(201).json(result);
  }

  public static async getPayableWriteOffs(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM ap_write_offs WHERE organization_id = $1 ORDER BY write_off_date DESC, created_at DESC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  public static async reversePaymentReceived(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reversePaymentReceived(
      req.auth!.organizationId,
      req.params.id,
      req.auth!.userId,
      req.body?.reason
    );
    res.json(result);
  }

  public static async reverseCreditNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseCreditNote(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reverseCustomerRefund(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseCustomerRefund(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async recordVendorRefund(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.transaction(async (client) => {
      const refund = await PurchasesEngine.recordVendorRefund(orgId, req.body, client);
      await FinanceController.logAudit(orgId, req.auth!.userId, 'VENDOR_REFUND_RECORDED', 'VendorRefund', refund.refundId, refund, client);
      return refund;
    });
    res.status(201).json(result);
  }

  public static async getVendorRefunds(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await PurchasesEngine.getVendorRefunds(req.auth!.organizationId);
    res.json(result);
  }

  public static async reverseVendorRefund(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseVendorRefund(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reverseReceivableWriteOff(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseReceivableWriteOff(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reversePayableWriteOff(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reversePayableWriteOff(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reverseVendorCredit(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseVendorCredit(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reverseVendorAdvance(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseVendorAdvance(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async getTreasuryTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
    res.json(await TreasuryTransactionService.list(req.auth!.organizationId));
  }

  public static async createTreasuryTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await TreasuryTransactionService.create(req.auth!.organizationId, req.auth!.userId, req.body);
    res.status(201).json(result);
  }

  public static async reverseTreasuryTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await TreasuryTransactionService.reverse(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reverseCustomerAdvance(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseCustomerAdvance(
      req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reverseCustomerAdvanceApplication(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseAdvanceApplication(
      'customer', req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  public static async reverseVendorAdvanceApplication(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FinancialDestructiveActionsService.reverseAdvanceApplication(
      'vendor', req.auth!.organizationId, req.params.id, req.auth!.userId, req.body?.reason
    );
    res.json(result);
  }

  // --- REPORTS & INTEGRITY ---
  public static async getAccountantOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const overview = await AccountantOverviewService.getOverview(orgId);
    res.json(overview);
  }

  public static async getGSTReturnSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const summary = await GSTComplianceService.getReturnSummary(
        req.auth!.organizationId,
        req.query.period as string | undefined,
      );
      res.json({ summary });
    } catch (err: any) {
      const message = err?.message || 'Failed to prepare GST return evidence';
      res.status(message.includes('GST_PERIOD_INVALID') ? 400 : 500).json({ error: message });
    }
  }

  public static async getGeneralLedgerReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const report = await LedgerQueryService.getGeneralLedgerReport(orgId, {
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      accountId: req.query.accountId as string,
      customerId: req.query.customerId as string,
      vendorId: req.query.vendorId as string,
      projectId: req.query.projectId as string,
      businessLine: req.query.businessLine as string,
      locationId: req.query.locationId as string,
      costCenterId: req.query.costCenterId as string,
      search: req.query.search as string,
    });
    res.json(report);
  }

  public static async getWorkspaceReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const reportType = req.params.reportType;
    if (!ReportWorkspaceService.isSupported(reportType)) {
      res.status(404).json({ error: 'This report is not available' });
      return;
    }
    const filter: WorkspaceReportFilter = {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      asOfDate: req.query.asOfDate as string | undefined,
      projectId: req.query.projectId as string | undefined,
      customerId: req.query.customerId as string | undefined,
      vendorId: req.query.vendorId as string | undefined,
      accountId: req.query.accountId as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    };
    try {
      res.json(await ReportWorkspaceService.run(req.auth!.organizationId, reportType, filter));
    } catch (error: any) {
      const message = error?.message || 'Unable to generate report';
      res.status(message.startsWith('REPORT_DATE_INVALID') ? 400 : 500).json({ error: message.replace(/^REPORT_[A-Z_]+:\s*/, '') });
    }
  }

  public static async exportWorkspaceReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const reportType = req.params.reportType;
    const requestedFormat = String(req.query.format || 'csv').toLowerCase();
    if (!ReportWorkspaceService.isSupported(reportType)) {
      res.status(404).json({ error: 'This report is not available' });
      return;
    }
    if (!['csv', 'xlsx', 'pdf'].includes(requestedFormat)) {
      res.status(400).json({ error: 'Export format must be csv, xlsx, or pdf' });
      return;
    }
    const filter: WorkspaceReportFilter = {
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      asOfDate: req.query.asOfDate as string | undefined,
      projectId: req.query.projectId as string | undefined,
      customerId: req.query.customerId as string | undefined,
      vendorId: req.query.vendorId as string | undefined,
      accountId: req.query.accountId as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    };
    try {
      const report = await ReportWorkspaceService.run(req.auth!.organizationId, reportType, filter);
      const dateLabel = report.period.asOfDate
        ? `As of ${report.period.asOfDate}`
        : `${report.period.fromDate || ''} through ${report.period.toDate || ''}`;
      const metadata = await ReportExportService.getExportMetadata(
        req.auth!.organizationId,
        req.auth!.userId,
        report.title,
        dateLabel,
        filter,
      );
      const selectedColumns = String(req.query.columns || '').split(',').filter(Boolean).slice(0, 50);
      const format = requestedFormat as 'csv' | 'xlsx' | 'pdf';
      const buffer = await ReportExportService.exportWorkspaceReport(report, metadata, format, selectedColumns.length ? selectedColumns : undefined);
      const mime = format === 'pdf' ? 'application/pdf' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8';
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_${new Date().toISOString().slice(0, 10)}.${format}"`);
      res.send(buffer);
    } catch (error: any) {
      const message = error?.message || 'Unable to export report';
      res.status(message.startsWith('REPORT_DATE_INVALID') ? 400 : 500).json({ error: message.replace(/^REPORT_[A-Z_]+:\s*/, '') });
    }
  }

  public static async getAccountTransactions(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const accountId = req.params.id;
    const report = await LedgerQueryService.getGeneralLedgerReport(orgId, {
      accountId,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      projectId: req.query.projectId as string,
      search: req.query.search as string,
    });
    res.json(report);
  }

  public static async getTrialBalance(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const report = await TrialBalanceReportService.getTrialBalance(orgId, {
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      projectId: req.query.projectId as string,
    });
    res.json(report);
  }

  public static async getProfitLoss(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const report = await ProfitAndLossReportService.getProfitAndLoss(orgId, {
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      projectId: req.query.projectId as string,
      businessLine: req.query.businessLine as string,
    });
    res.json(report);
  }

  public static async getBalanceSheet(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const report = await BalanceSheetReportService.getBalanceSheet(orgId, {
      toDate: (req.query.asOfDate as string) || (req.query.toDate as string),
    });
    res.json(report);
  }

  public static async getCashFlow(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const report = await CashFlowStatementService.getCashFlowStatement(orgId, {
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
    });
    res.json(report);
  }

  public static async getCustomerStatement(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const customerId = req.params.customerId;
    const fromDate = (req.query.fromDate as string) || '2026-04-01';
    const toDate = (req.query.toDate as string) || new Date().toISOString().split('T')[0];
    const statement = await CustomerStatementService.getCustomerStatement(orgId, customerId, fromDate, toDate);
    res.json(statement);
  }

  public static async getVendorStatement(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const vendorId = req.params.vendorId;
    const fromDate = (req.query.fromDate as string) || '2026-04-01';
    const toDate = (req.query.toDate as string) || new Date().toISOString().split('T')[0];
    const statement = await VendorStatementService.getVendorStatement(orgId, vendorId, fromDate, toDate);
    res.json(statement);
  }

  public static async getComparativeProfitLoss(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const currentFromDate = (req.query.currentFromDate as string) || (req.query.fromDate as string);
    const currentToDate = (req.query.currentToDate as string) || (req.query.toDate as string);
    const priorFromDate = req.query.priorFromDate as string;
    const priorToDate = req.query.priorToDate as string;
    if (!currentFromDate || !currentToDate || !priorFromDate || !priorToDate) {
      res.status(400).json({ error: 'currentFromDate, currentToDate, priorFromDate, and priorToDate are required' });
      return;
    }
    const report = await ProfitAndLossReportService.getComparativeProfitAndLoss(orgId, {
      currentFromDate,
      currentToDate,
      priorFromDate,
      priorToDate,
      projectId: req.query.projectId as string,
    });
    res.json(report);
  }

  public static async getComparativeBalanceSheet(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const currentAsOfDate = (req.query.currentAsOfDate as string) || (req.query.asOfDate as string) || (req.query.toDate as string);
    const priorAsOfDate = req.query.priorAsOfDate as string;
    if (!currentAsOfDate || !priorAsOfDate) {
      res.status(400).json({ error: 'currentAsOfDate and priorAsOfDate are required' });
      return;
    }
    const report = await BalanceSheetReportService.getComparativeBalanceSheet(orgId, {
      currentAsOfDate,
      priorAsOfDate,
    });
    res.json(report);
  }

  public static async getDrillDown(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const journalEntryId = req.params.journalEntryId;
    try {
      const drillDown = await DrillDownService.getDrillDown(orgId, journalEntryId);
      res.json(drillDown);
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  public static async exportReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const reportType = req.params.reportType;
    try {
      let rows: any[] = [];
      const filename = `${reportType}_${new Date().toISOString().slice(0, 10)}.csv`;

      if (reportType === 'general-ledger') {
        const gl = await LedgerQueryService.getGeneralLedgerReport(orgId, {
          fromDate: req.query.fromDate as string,
          toDate: req.query.toDate as string,
          projectId: req.query.projectId as string,
          customerId: req.query.customerId as string,
          vendorId: req.query.vendorId as string,
          search: req.query.search as string,
        });
        rows = gl.accounts.flatMap((acc: any) =>
          acc.transactions.map((t: any) => ({
            accountCode: acc.code,
            accountName: acc.name,
            date: t.entryDate,
            entryNumber: t.entryNumber,
            reference: t.reference || '',
            narration: t.narration || '',
            debit: t.debit,
            credit: t.credit,
          }))
        );
      } else if (reportType === 'ar-aging') {
        const ar = await ARAgingReportService.getARAgingReport(orgId, (req.query.asOfDate as string) || (req.query.toDate as string));
        rows = ar.rows;
      } else if (reportType === 'ap-aging') {
        const ap = await APAgingReportService.getAPAgingReport(orgId, (req.query.asOfDate as string) || (req.query.toDate as string));
        rows = ap.rows;
      } else if (reportType === 'trial-balance') {
        const tb = await TrialBalanceReportService.getTrialBalance(orgId, {
          fromDate: req.query.fromDate as string,
          toDate: req.query.toDate as string,
        });
        rows = tb.rows;
      } else if (reportType === 'customer-statement' && req.query.customerId) {
        const cs = await CustomerStatementService.getCustomerStatement(
          orgId,
          req.query.customerId as string,
          (req.query.fromDate as string) || '2026-04-01',
          (req.query.toDate as string) || new Date().toISOString().split('T')[0]
        );
        rows = cs.transactions;
      } else if (reportType === 'vendor-statement' && req.query.vendorId) {
        const vs = await VendorStatementService.getVendorStatement(
          orgId,
          req.query.vendorId as string,
          (req.query.fromDate as string) || '2026-04-01',
          (req.query.toDate as string) || new Date().toISOString().split('T')[0]
        );
        rows = vs.transactions;
      } else {
        res.status(400).json({ error: `Unsupported or invalid export report type: ${reportType}` });
        return;
      }

      const csv = ReportExportService.convertToCSV(rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- MANUAL & RECURRING JOURNALS ---
  public static async createJournal(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    try {
      const result = await ManualJournalService.createJournal(orgId, userId, req.body);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async reverseJournal(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const journalId = req.params.id;
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (reason.length < 5 || reason.length > 1000) {
      res.status(400).json({ error: 'A specific reversal reason between 5 and 1000 characters is required' });
      return;
    }
    try {
      const result = await ManualJournalService.reverseJournal(orgId, userId, journalId, reason);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async getRecurringJournals(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const profiles = await RecurringJournalService.getProfiles(orgId);
    res.json(profiles);
  }

  public static async createRecurringJournal(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const profile = await RecurringJournalService.createProfile(orgId, userId, req.body);
    res.status(201).json(profile);
  }

  public static async generateDueRecurringJournals(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const generated = await RecurringJournalService.generateDueJournals(orgId, userId);
    res.json({ count: generated.length, generated });
  }

  // --- BUDGETING & CASH FORECASTING ---
  public static async getBudgets(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const budgets = await BudgetService.getBudgets(orgId);
    res.json(budgets);
  }

  public static async createBudget(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const budget = await BudgetService.createBudget(orgId, userId, req.body);
    res.status(201).json(budget);
  }

  public static async getBudgetVsActual(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const budgetId = req.query.budgetId as string;
    if (!budgetId) {
      res.status(400).json({ error: 'BUDGET_ID_REQUIRED: budgetId query parameter is required' });
      return;
    }
    const report = await BudgetService.getBudgetVsActualReport(
      orgId,
      budgetId,
      req.query.fromDate as string,
      req.query.toDate as string
    );
    res.json(report);
  }

  public static async getCashFlowForecast(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const horizonDays = parseInt((req.query.horizonDays as string) || '90');
    const forecast = await CashFlowForecastService.getForecast(orgId, horizonDays);
    res.json(forecast);
  }

  // --- FIXED ASSETS ---
  public static async getFixedAssets(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const assets = await FixedAssetService.getAssets(orgId);
    res.json(assets);
  }

  public static async createFixedAsset(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const asset = await FixedAssetService.createAsset(orgId, userId, req.body);
    res.status(201).json(asset);
  }

  public static async depreciateFixedAsset(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const assetId = req.params.id;
    const periodKey = req.body.periodKey || new Date().toISOString().slice(0, 7);
    try {
      const result = await FixedAssetService.postMonthlyDepreciation(orgId, userId, assetId, periodKey);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async disposeFixedAsset(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const assetId = req.params.id;
    const { disposalDate, saleProceeds, proceedsBankAccountId, gainLossAccountId } = req.body;
    try {
      const result = await FixedAssetService.disposeAsset(
        orgId,
        userId,
        assetId,
        disposalDate || new Date().toISOString().split('T')[0],
        Number(saleProceeds || 0),
        proceedsBankAccountId,
        gainLossAccountId
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async createBulkJournals(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ManualJournalService.createBulkJournals(req.auth!.organizationId, req.auth!.userId, req.body?.entries);
      res.status(201).json({ created: result, count: result.length });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async reverseFixedAssetDepreciation(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FixedAssetService.reverseDepreciation(
      req.auth!.organizationId,
      req.auth!.userId,
      req.params.id,
      req.body?.periodKey,
      req.body?.reason,
      req.body?.reversalDate
    );
    res.json(result);
  }

  public static async reverseFixedAssetDisposal(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await FixedAssetService.reverseDisposal(
      req.auth!.organizationId,
      req.auth!.userId,
      req.params.id,
      req.body?.reason,
      req.body?.reversalDate
    );
    res.json(result);
  }

  // --- PERIOD CLOSE WORKSPACE ---
  public static async validatePeriodClose(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const periodKey = (req.query.periodKey as string) || new Date().toISOString().slice(0, 7);
    const periodStart = (req.query.periodStart as string) || `${periodKey}-01`;
    const periodEnd = (req.query.periodEnd as string) || `${periodKey}-31`;
    const status = await PeriodCloseService.validatePeriodClose(orgId, periodKey, periodStart, periodEnd);
    res.json(status);
  }

  public static async getPeriodCloseWorkspace(req: AuthenticatedRequest, res: Response): Promise<void> {
    const periodKey = (req.query.periodKey as string) || new Date().toISOString().slice(0, 7);
    const periodStart = (req.query.periodStart as string) || `${periodKey}-01`;
    const periodEnd = (req.query.periodEnd as string) || `${periodKey}-31`;
    try {
      res.json(await PeriodCloseService.getWorkspace(req.auth!.organizationId, periodKey, periodStart, periodEnd));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async savePeriodCloseReview(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { periodKey, periodStart, periodEnd, tasks, note } = req.body;
    try {
      res.json(await PeriodCloseService.saveReview(req.auth!.organizationId, req.auth!.userId, periodKey, periodStart, periodEnd, tasks, note));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async closePeriod(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const { periodKey, periodStart, periodEnd } = req.body;
    try {
      const result = await PeriodCloseService.closePeriod(
        orgId,
        userId,
        periodKey || new Date().toISOString().slice(0, 7),
        periodStart,
        periodEnd
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async reopenPeriod(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const { periodKey, reason } = req.body;
    try {
      const result = await PeriodCloseService.reopenPeriod(orgId, userId, periodKey, reason);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  // --- SAVED REPORTS ---
  public static async getSavedReports(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const reports = await SavedReportService.getSavedReports(orgId, userId);
    res.json(reports);
  }

  public static async createSavedReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const report = await SavedReportService.saveReport(orgId, userId, req.body);
    res.status(201).json(report);
  }

  public static async toggleFavoriteReport(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const isFavorite = await SavedReportService.toggleFavorite(orgId, req.auth!.userId, req.params.id);
    res.json({ isFavorite });
  }

  public static async getAPAging(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
    const report = await APAgingReportService.getAPAgingReport(orgId, asOfDate);
    res.json(report);
  }

  public static async getARAging(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split('T')[0];
    const report = await ARAgingReportService.getARAgingReport(orgId, asOfDate);
    res.json(report);
  }

  public static async getARIntegrity(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const report = await SalesEngine.verifyARIntegrity(orgId);
    res.json(report);
  }

  public static async getOrganizationIntegrity(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const report = await AccountingIntegrityService.verifyOrganizationIntegrity(orgId);
    res.json(report);
  }

  // --- POST APPROVED FINANCIAL DRAFTS ---

  public static async postApprovedInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const invoiceId = req.params.id;
    const postedInvoice = await db.transaction(async (txClient) => {
      const result = await SalesEngine.postApprovedInvoice(orgId, userId, invoiceId, txClient);
      await FinanceController.logAudit(orgId, userId, 'INVOICE_POSTED_AFTER_APPROVAL', 'Invoice', invoiceId, result, txClient, true);
      return result;
    });
    res.status(200).json(postedInvoice);
  }

  public static async postApprovedPaymentReceived(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const paymentId = req.params.id;
    const postedPayment = await db.transaction(async (txClient) => {
      const result = await SalesEngine.postApprovedPayment(orgId, userId, paymentId, txClient);
      await FinanceController.logAudit(orgId, userId, 'PAYMENT_RECEIVED_POSTED_AFTER_APPROVAL', 'PaymentReceived', paymentId, result, txClient, true);
      return result;
    });
    res.status(200).json(postedPayment);
  }

  public static async postApprovedBill(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const billId = req.params.id;
    const postedBill = await db.transaction(async (txClient) => {
      const result = await PurchasesEngine.postApprovedBill(orgId, userId, billId, txClient);
      await FinanceController.logAudit(orgId, userId, 'BILL_POSTED_AFTER_APPROVAL', 'VendorBill', billId, result, txClient, true);
      return result;
    });
    res.status(200).json(postedBill);
  }

  public static async postApprovedVendorPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const paymentId = req.params.id;
    const postedPayment = await db.transaction(async (txClient) => {
      const result = await PurchasesEngine.postApprovedVendorPayment(orgId, userId, paymentId, txClient);
      await FinanceController.logAudit(orgId, userId, 'VENDOR_PAYMENT_POSTED_AFTER_APPROVAL', 'VendorPayment', paymentId, result, txClient, true);
      return result;
    });
    res.status(200).json(postedPayment);
  }

  public static async postApprovedJournal(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const journalId = req.params.id;
    const postedJournal = await db.transaction(async (txClient) => {
      const result = await ManualJournalService.postApprovedJournal(orgId, userId, journalId, txClient);
      await FinanceController.logAudit(orgId, userId, 'JOURNAL_POSTED_AFTER_APPROVAL', 'ManualJournal', journalId, result, txClient, true);
      return result;
    });
    res.status(200).json(postedJournal);
  }

  public static async updateBill(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId || req.auth?.organizationId!;
      const bill = await PurchasesEngine.updateBill(orgId, req.params.id, req.body, req.auth?.userId);
      res.json({ bill });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Bill could not be updated' });
    }
  }

  public static async updateVendorPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId || req.auth?.organizationId!;
      const payment = await PurchasesEngine.updateVendorPayment(orgId, req.params.id, req.body);
      res.json({ payment });
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Vendor payment could not be updated' });
    }
  }

  public static async updateExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId || req.auth?.organizationId!;
      const userId = req.auth?.userId!;
      const expenseId = req.params.id;
      const body = req.body || {};

      const reason = String(body.reason || body.editReason || 'Expense updated').trim();
      const updated = await ExpensePostingService.updateExpense(orgId, expenseId, body, userId, reason);
      res.json({ success: true, expense: updated });
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Expense could not be updated' });
    }
  }

  public static async correctExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { reason, ...replacementInput } = req.body || {};
      const result = await ExpensePostingService.correctAndPost(
        req.auth!.organizationId,
        req.auth!.userId,
        req.params.id,
        replacementInput,
        reason
      );
      res.status(201).json(result);
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Expense could not be corrected' });
    }
  }

  public static async convertExpenseToInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const expenseId = req.params.id;
    const issueDate = req.body.issueDate || new Date().toISOString().split('T')[0];
    const dueDate = req.body.dueDate || issueDate;

    if (!isIsoCalendarDate(issueDate) || !isIsoCalendarDate(dueDate) || dueDate < issueDate) {
      res.status(400).json({ error: 'Valid issue and due dates are required' });
      return;
    }

    try {
      const result = await db.transaction(async (client) => {
        const expResult = await client.query(
          `SELECT * FROM expenses
            WHERE organization_id = $1 AND id = $2
              FOR UPDATE`,
          [orgId, expenseId]
        );
        if (expResult.rows.length !== 1) {
          throw new Error('Expense was not found in this organization');
        }
        const exp = expResult.rows[0];

        let accountName = '';
        if (exp.expense_account_id) {
          const accRes = await client.query(
            `SELECT name FROM accounts WHERE organization_id = $1 AND id = $2`,
            [orgId, exp.expense_account_id]
          );
          accountName = accRes.rows[0]?.name || '';
        }

        if (!exp.is_billable) {
          throw new Error('Expense is not marked as billable to customer');
        }
        if (exp.is_billed) {
          throw new Error(`Expense has already been billed to invoice ${exp.invoice_id}`);
        }
        // invoice_id reserves a recoverable expense while its invoice is in
        // approval.  It prevents a retry/double-click from producing another
        // submitted invoice, while is_billed remains the authoritative signal
        // that revenue has actually been posted.
        if (exp.invoice_id) {
          const linkedInvoice = await client.query(
            `SELECT status FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
            [orgId, exp.invoice_id]
          );
          const linkedStatus = String(linkedInvoice.rows[0]?.status || '').toUpperCase();
          if (['SUBMITTED', 'APPROVED', 'DRAFT'].includes(linkedStatus)) {
            throw new Error(`Expense is already awaiting invoice approval (${exp.invoice_id})`);
          }
          if (['POSTED', 'PAID', 'PARTIALLY_PAID'].includes(linkedStatus)) {
            throw new Error(`Expense has already been billed to invoice ${exp.invoice_id}`);
          }
          // A rejected, voided, or missing linked invoice no longer reserves
          // the expense; allow an explicitly requested replacement invoice.
          await client.query(
            `UPDATE expenses SET invoice_id = NULL, is_billed = FALSE
              WHERE organization_id = $1 AND id = $2 AND is_billed = FALSE`,
            [orgId, expenseId]
          );
        }
        if (exp.status === 'VOID' || exp.status === 'VOIDED') {
          throw new Error('Voided expenses cannot be billed to customer');
        }

        let customerId = exp.client_id;
        let customerName = '';

        if (exp.project_id) {
          const projResult = await client.query(
            `SELECT client_id, client_name, code, name FROM projects WHERE organization_id = $1 AND id = $2`,
            [orgId, exp.project_id]
          );
          if (projResult.rows.length === 1) {
            customerId = customerId || projResult.rows[0].client_id;
            customerName = projResult.rows[0].client_name || '';
          }
        }

        if (!customerId) {
          throw new Error('Expense must be assigned to a customer before it can be invoiced');
        }

        // Ensure customer exists in customers table to satisfy fk_invoices_customer_org
        const custCheck = await client.query(
          `SELECT id, display_name, legal_name FROM customers WHERE organization_id = $1 AND id = $2`,
          [orgId, customerId]
        );
        if (custCheck.rows.length === 0) {
          const clientRow = await client.query(
            `SELECT id, name, company_name, email, phone, currency, payment_terms, notes FROM clients WHERE organization_id = $1 AND id = $2`,
            [orgId, customerId]
          );
          if (clientRow.rows.length > 0) {
            const cl = clientRow.rows[0];
            await client.query(
              `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, phone, currency, payment_terms, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
               ON CONFLICT (id) DO NOTHING`,
              [cl.id, orgId, cl.id, cl.name, cl.company_name || cl.name, cl.email, cl.phone, (cl.currency || exp.currency || 'USD').slice(0, 3), cl.payment_terms || 'Net 30', cl.notes]
            );
            if (!customerName) {
              customerName = cl.name || cl.company_name || 'Customer';
            }
          } else {
            // Self-heal: ensure customer record exists for foreign key constraint
            await client.query(
              `INSERT INTO customers (id, organization_id, customer_id, display_name, currency)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (id) DO NOTHING`,
              [customerId, orgId, customerId, customerName || 'Customer', (exp.currency || 'USD').slice(0, 3)]
            );
          }
        } else if (!customerName) {
          customerName = custCheck.rows[0].display_name || custCheck.rows[0].legal_name || 'Customer';
        }

        let lineItems: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number }> = [];
        const markupPct = exp.markup_percentage !== null && exp.markup_percentage !== undefined ? Number(exp.markup_percentage) : 0;
        const markupMultiplier = 1 + markupPct / 100;
        const sellingPrice = exp.selling_price !== null && exp.selling_price !== undefined && Number(exp.selling_price) > 0
          ? Number(exp.selling_price)
          : Math.round(Number(exp.amount) * markupMultiplier * 100) / 100;

        if (exp.is_itemized && exp.items) {
          const parsedItems = typeof exp.items === 'string' ? JSON.parse(exp.items) : exp.items;
          if (Array.isArray(parsedItems) && parsedItems.length > 0) {
            lineItems = parsedItems.map((item: any) => ({
              description: item.description || `Reimbursable expense line (${exp.expense_number})`,
              quantity: 1,
              unitPrice: Math.round(Number(item.amount) * markupMultiplier * 100) / 100,
              taxRate: 0,
            }));
          }
        }

        if (lineItems.length === 0) {
          const vendorInfo = exp.vendor_name ? ` (Vendor: ${exp.vendor_name})` : '';
          const descInfo = exp.description ? ` - ${exp.description}` : '';
          const categoryInfo = accountName || 'Reimbursable Expense';
          lineItems = [{
            description: `Billable Expense [${exp.expense_number}]: ${categoryInfo}${descInfo}${vendorInfo}`,
            quantity: 1,
            unitPrice: sellingPrice,
            taxRate: 0,
          }];
        }

        const invoice = await SalesEngine.createAndPostInvoice(orgId, {
          customerId,
          customerName,
          projectId: exp.project_id || undefined,
          issueDate,
          dueDate,
          lineItems,
          notes: `Reimbursable billable expense ${exp.expense_number} incurred on ${exp.date}`,
          status: 'POSTED',
          createdBy: req.auth!.userId,
        }, client);

        const invoiceIsPosted = String(invoice.status).toUpperCase() === 'POSTED';
        await client.query(
          `UPDATE expenses SET is_billed = $1, invoice_id = $2 WHERE organization_id = $3 AND id = $4 AND is_billed = FALSE`,
          [invoiceIsPosted, invoice.id, orgId, expenseId]
        );

        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'EXPENSE_INVOICED', 'Expense', $4, $5)`,
          [
            newId('aud'),
            orgId,
            req.auth!.userId,
            expenseId,
            JSON.stringify({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, amount: exp.amount }),
          ]
        );

        return {
          invoice,
          expense: {
            id: exp.id,
            isBillable: true,
            isBilled: invoiceIsPosted,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
          },
        };
      });

      res.status(201).json(result);
    } catch (error: any) {
      const message = error.message || 'Billable expense could not be converted to invoice';
      const statusCode = message.includes('already been billed') || message.includes('awaiting invoice approval') ? 409
        : message.includes('not found') ? 404
        : 422;
      res.status(statusCode).json({ error: message });
    }
  }

  public static async updateCustomerPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId || req.auth?.organizationId!;
      const userId = req.auth?.userId!;
      const result = await SalesEngine.updateOrCorrectCustomerPayment(orgId, userId, req.params.id, req.body);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Customer payment could not be updated' });
    }
  }

  // --- EMPLOYEE CLAIMS & REIMBURSEMENTS ---

  public static async createEmployeeClaim(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const result = await EmployeeReimbursementService.createClaim(orgId, userId, req.body);
      res.status(201).json(result);
    } catch (error: any) {
      const message = error.message || 'Employee claim could not be created';
      res.status(FinanceController.employeeClaimErrorStatus(message)).json({ error: message });
    }
  }

  public static async listEmployeeClaims(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const claims = await EmployeeReimbursementService.listClaims(orgId, req.query as any);
      res.json({ items: claims });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Employee claims could not be retrieved' });
    }
  }

  public static async getEmployeeClaim(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const claim = await EmployeeReimbursementService.getClaim(orgId, req.params.id);
      if (!claim) {
        res.status(404).json({ error: 'Employee claim not found' });
        return;
      }
      res.json(claim);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Employee claim could not be retrieved' });
    }
  }

  public static async submitEmployeeClaim(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const result = await EmployeeReimbursementService.submitClaim(orgId, userId, req.params.id);
      res.json(result);
    } catch (error: any) {
      const message = error.message || 'Employee claim could not be submitted';
      res.status(FinanceController.employeeClaimErrorStatus(message)).json({ error: message });
    }
  }

  public static async approveEmployeeClaim(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const result = await EmployeeReimbursementService.approveClaim(orgId, userId, req.params.id);
      res.json(result);
    } catch (error: any) {
      const message = error.message || 'Employee claim could not be approved';
      res.status(FinanceController.employeeClaimErrorStatus(message)).json({ error: message });
    }
  }

  public static async rejectEmployeeClaim(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const { reason } = req.body || {};
      const result = await EmployeeReimbursementService.rejectClaim(orgId, userId, req.params.id, reason);
      res.json(result);
    } catch (error: any) {
      const message = error.message || 'Employee claim could not be rejected';
      res.status(FinanceController.employeeClaimErrorStatus(message)).json({ error: message });
    }
  }

  public static async recordEmployeeReimbursementPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const result = await EmployeeReimbursementService.recordPayment(orgId, userId, {
        claimId: req.params.id,
        ...req.body,
      });
      res.status(201).json(result);
    } catch (error: any) {
      const message = error.message || 'Reimbursement payment could not be recorded';
      res.status(FinanceController.employeeClaimErrorStatus(message)).json({ error: message });
    }
  }

  public static async voidEmployeeClaim(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const { reason } = req.body || {};
      const result = await EmployeeReimbursementService.voidClaim(orgId, userId, req.params.id, reason);
      res.json(result);
    } catch (error: any) {
      const message = error.message || 'Employee claim could not be voided';
      res.status(FinanceController.employeeClaimErrorStatus(message)).json({ error: message });
    }
  }

  public static async voidEmployeeReimbursementPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const { reason } = req.body || {};
      const result = await EmployeeReimbursementService.voidPayment(orgId, userId, req.params.id, reason);
      res.json(result);
    } catch (error: any) {
      const message = error.message || 'Reimbursement payment could not be voided';
      res.status(FinanceController.employeeClaimErrorStatus(message)).json({ error: message });
    }
  }
}
