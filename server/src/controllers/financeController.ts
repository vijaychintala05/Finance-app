import { Response } from 'express';
import { db, type DbQueryClient } from '../database/db';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
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
import { ExpenseReceiptService } from '../services/ExpenseReceiptService';
import { GSTComplianceService } from '../services/GSTComplianceService';

export class FinanceController {
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
    const result = await db.query('SELECT * FROM accounts WHERE organization_id = $1 ORDER BY code ASC', [orgId]);
    res.json(result.rows);
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
      const statusCode = message.startsWith('ACCOUNT_NOT_FOUND') ? 404 : 400;
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
          `SELECT id, type, status FROM accounts WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, parentAccountId]
        );
        if (parent.rows.length !== 1) throw new Error('ACCOUNT_PARENT_INVALID: Parent account does not belong to this organization');
        if (parent.rows[0].status !== 'Active') throw new Error('ACCOUNT_PARENT_INACTIVE: An archived account cannot be a parent');
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
      });
      res.status(201).json({ id: accId, code: normalizedCode, name: name.trim(), description: description?.trim() || null, type: normalizedType, subType: normalizedSubType, balance: 0, status: 'Active', parentAccountId, reportingGroup, normalBalance, allowDirectPosting });
    } catch (error) {
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
          if (Number(existing.balance || 0) !== 0) throw new Error('ACCOUNT_ARCHIVE_BALANCE: A non-zero balance account cannot be archived');
          const children = await client.query(`SELECT id FROM accounts WHERE organization_id = $1 AND parent_account_id = $2 AND status = 'Active' LIMIT 1 FOR UPDATE`, [orgId, accountId]);
          if (children.rows.length > 0) throw new Error('ACCOUNT_ARCHIVE_CHILDREN: Reassign or archive active child accounts first');
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

  // --- CLIENTS ---
  public static async getClients(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM clients WHERE organization_id = $1 ORDER BY name ASC', [orgId]);
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
      await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, 'CLIENT_CREATED', 'Client', $4, $5)`, [newId('aud'), orgId, req.auth!.userId, cliId, JSON.stringify(record)]);
    });
    res.status(201).json({ ...record, createdAt: new Date().toISOString() });
  }

  // --- VENDORS ---
  public static async getVendors(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM vendors WHERE organization_id = $1 ORDER BY name ASC', [orgId]);
    res.json(result.rows);
  }

  public static async createVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { name, companyName, email, phone, billingAddress, taxId, currency, paymentTerms } = req.body;
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
    if (
      (companyName !== undefined && (typeof companyName !== 'string' || companyName.length > 255)) ||
      (email !== undefined && email !== '' && (typeof email !== 'string' || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (phone !== undefined && (typeof phone !== 'string' || phone.length > 50)) ||
      (billingAddress !== undefined && (typeof billingAddress !== 'string' || billingAddress.length > 10000)) ||
      (taxId !== undefined && (typeof taxId !== 'string' || taxId.length > 50)) ||
      (currency !== undefined && (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency))) ||
      (paymentTerms !== undefined && (typeof paymentTerms !== 'string' || paymentTerms.length > 50))
    ) {
      res.status(400).json({ error: 'Vendor metadata is invalid or exceeds the allowed length' });
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
    const venId = newId('ven');
    const record = { id: venId, name: name.trim(), companyName: companyName?.trim() || name.trim(), email: email?.trim().toLowerCase() || '', phone: phone?.trim() || '', billingAddress: billingAddress?.trim() || '', taxId: taxId?.trim() || '', currency: organizationCurrency, paymentTerms: paymentTerms?.trim() || 'Net 30' };
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO vendors (id, organization_id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [record.id, orgId, record.name, record.companyName, record.email, record.phone, record.billingAddress, record.taxId, record.currency, record.paymentTerms]
      );
      await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, 'VENDOR_CREATED', 'Vendor', $4, $5)`, [newId('aud'), orgId, req.auth!.userId, venId, JSON.stringify(record)]);
    });
    res.status(201).json(record);
  }

  // --- PROJECTS ---
  public static async getProjects(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM projects WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createProject(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { code, name, clientId, customerId, clientName, description, budgetType, totalBudget, hourlyRate, manager } = req.body;

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
        `SELECT id, display_name, legal_name FROM customers WHERE organization_id = $1 AND id = $2
         UNION ALL
         SELECT id, name AS display_name, company_name AS legal_name FROM clients WHERE organization_id = $1 AND id = $2
         LIMIT 1`,
        [orgId, targetCustId.trim()]
      );
      if (custRes.rows.length === 0) {
        const otherOrgRes = await db.query(`SELECT organization_id FROM customers WHERE id = $1 UNION ALL SELECT organization_id FROM clients WHERE id = $1 LIMIT 1`, [targetCustId.trim()]);
        if (otherOrgRes.rows.length > 0) {
          res.status(400).json({ error: `Customer ${targetCustId} does not belong to organization ${orgId}` });
          return;
        }
        res.status(400).json({ error: `Customer ${targetCustId} not found` });
        return;
      }
      resolvedClientName = custRes.rows[0].display_name || custRes.rows[0].legal_name || resolvedClientName;
    }

    const parsedBudget = Number(totalBudget || 0);
    const parsedHourlyRate = Number(hourlyRate || 0);
    if (!Number.isFinite(parsedBudget) || parsedBudget < 0 || !Number.isSafeInteger(Math.round(parsedBudget * 100)) || Math.abs(parsedBudget * 100 - Math.round(parsedBudget * 100)) > 1e-7 || !Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0 || !Number.isSafeInteger(Math.round(parsedHourlyRate * 100)) || Math.abs(parsedHourlyRate * 100 - Math.round(parsedHourlyRate * 100)) > 1e-7) {
      res.status(400).json({ error: 'Project budget and hourly rate must be safe non-negative two-decimal amounts' });
      return;
    }
    const prjId = newId('prj');
    const record = { id: prjId, code: code.trim(), name: name.trim(), clientId: targetCustId || '', clientName: resolvedClientName, description: description || '', status: 'Active', budgetType: budgetType || 'Fixed Cost', totalBudget: parsedBudget, hourlyRate: parsedHourlyRate, manager: manager || '', createdAt: new Date().toISOString() };
    try {
      await db.transaction(async (client) => {
        await client.query(
          `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, description, status, budget_type, total_budget, hourly_rate, manager)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [record.id, orgId, record.code, record.name, record.clientId || null, record.clientName, record.description, record.status, record.budgetType, record.totalBudget, record.hourlyRate, record.manager]
        );
        await client.query(`INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state) VALUES ($1, $2, $3, 'PROJECT_CREATED', 'Project', $4, $5)`, [newId('aud'), orgId, req.auth!.userId, prjId, JSON.stringify(record)]);
      });
    } catch (error: any) {
      if (error?.code === '23505' || String(error?.message).includes('duplicate key')) {
        res.status(409).json({ error: 'Project code already exists in this organization' });
        return;
      }
      throw error;
    }
    res.status(201).json(record);
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
          `SELECT id, name, client_name FROM projects WHERE organization_id = $1 AND id = $2 AND status <> 'Cancelled'`,
          [orgId, projectId]
        );
        if (projectResult.rows.length !== 1) throw new Error('Project does not belong to this organization or is cancelled');
        const project = projectResult.rows[0];
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
        const projectResult = await client.query(`SELECT id, name, client_name FROM projects WHERE organization_id = $1 AND id = $2 AND status <> 'Cancelled'`, [orgId, merged.projectId]);
        if (projectResult.rows.length !== 1) throw new Error('Project does not belong to this organization or is cancelled');
        const project = projectResult.rows[0];
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

  public static async invoiceUnbilledTime(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const issueDate = req.body.issueDate || new Date().toISOString().split('T')[0];
    const dueDate = req.body.dueDate || issueDate;
    if (!isIsoCalendarDate(issueDate) || !isIsoCalendarDate(dueDate) || dueDate < issueDate) {
      res.status(400).json({ error: 'Valid issue and due dates are required' }); return;
    }
    try {
      const result = await db.transaction(async (client) => {
        const projectResult = await client.query(`SELECT * FROM projects WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, req.params.id]);
        if (projectResult.rows.length !== 1) throw new Error('Project was not found in this organization');
        const project = projectResult.rows[0];
        if (!project.client_id) throw new Error('Project must have a verified customer before time can be invoiced');
        const entriesResult = await client.query(
          `SELECT * FROM time_entries WHERE organization_id = $1 AND project_id = $2 AND is_billable = TRUE AND is_billed = FALSE ORDER BY date, created_at FOR UPDATE`,
          [orgId, req.params.id]
        );
        if (entriesResult.rows.length === 0) throw new Error('No unbilled billable time exists for this project');
        const invoice = await SalesEngine.createAndPostInvoice(orgId, {
          customerId: project.client_id,
          customerName: project.client_name,
          projectId: project.id,
          issueDate,
          dueDate,
          lineItems: entriesResult.rows.map((entry) => ({
            description: `${entry.task_name} — ${entry.staff_name} (${entry.date})`,
            quantity: Number(entry.hours), unitPrice: Number(entry.hourly_rate), taxRate: 0,
          })),
          notes: `Billable time for project ${project.code} — ${project.name}`,
          status: 'POSTED', createdBy: req.auth!.userId,
        }, client);
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
    const result = await db.query('SELECT * FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    const invoices = await Promise.all(result.rows.map(async (invoice) => {
      const itemResult = await db.query(
        `SELECT id, description, account_id, quantity, unit_price, tax_rate, amount
           FROM invoice_items WHERE invoice_id = $1 AND organization_id = $2 ORDER BY id`,
        [invoice.id, orgId]
      );
      return {
        id: invoice.id,
        organizationId: invoice.organization_id,
        invoiceNumber: invoice.invoice_number,
        clientId: invoice.client_id || invoice.customer_id || '',
        clientName: invoice.client_name,
        clientEmail: invoice.client_email || '',
        projectId: invoice.project_id || undefined,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        items: itemResult.rows.map((item) => ({
          id: item.id, description: item.description, accountId: item.account_id,
          quantity: Number(item.quantity), unitPrice: Number(item.unit_price),
          taxRate: Number(item.tax_rate), amount: Number(item.amount),
        })),
        subtotal: Number(invoice.subtotal), taxTotal: Number(invoice.tax_total),
        discount: Number(invoice.discount), totalAmount: Number(invoice.total_amount),
        paidAmount: Number(invoice.paid_amount), balanceDue: Number(invoice.balance_due),
        status: invoice.status, notes: invoice.notes || '', createdAt: invoice.created_at,
      };
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
      const lineItems = typeof inv.line_items === 'string'
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
          lineItems,
          notes: inv.notes || '',
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to get invoice' });
    }
  }

  public static async createInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { clientId, clientName, clientEmail, projectId, issueDate, dueDate, items, discount, notes } = req.body;

    if (!clientId || !isIsoCalendarDate(issueDate) || !isIsoCalendarDate(dueDate) || dueDate < issueDate || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'A tenant client, valid issue/due dates, and at least one line item are required' });
      return;
    }
    try {
      const invoice = await SalesEngine.createAndPostInvoice(orgId, {
        customerId: clientId,
        customerName: clientName,
        customerEmail: clientEmail,
        projectId,
        issueDate,
        dueDate,
        discount: Number(discount || 0),
        lineItems: items,
        notes,
        status: 'POSTED',
        createdBy: req.auth!.userId,
        approvedDraftId: req.body.approvedDraftId,
      } as any);
      res.status(201).json({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientName: invoice.customerName,
        totalAmount: invoice.totalAmount,
        balanceDue: invoice.balanceDue,
        status: invoice.status,
        journalEntryId: invoice.journalEntryId,
      });
    } catch (error: any) {
      const message = error?.message || 'Invoice could not be posted';
      if (error?.code === '23505' || message.includes('already exists') || message.includes('duplicate key')) {
        res.status(409).json({ error: 'Invoice number or source document has already been used' });
        return;
      }
      res.status(422).json({ error: message });
    }
  }

  // --- PAYMENTS RECEIVED ---
  public static async getPaymentsReceived(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query(
      `SELECT pr.id AS payment_id, pr.payment_number, pr.client_name, pr.payment_date,
              pr.payment_mode, pr.reference, pr.amount, pr.unallocated_amount, pr.status,
              invoice.invoice_number
         FROM payments_received pr
         LEFT JOIN payment_received_allocations allocation
           ON allocation.payment_id = pr.id AND allocation.organization_id = pr.organization_id
         LEFT JOIN invoices invoice
           ON invoice.id = allocation.invoice_id AND invoice.organization_id = pr.organization_id
        WHERE pr.organization_id = $1
        ORDER BY pr.payment_date DESC`,
      [orgId]
    );
    const payments = new Map<string, any>();
    for (const row of result.rows) {
      const existing = payments.get(row.payment_id) || {
        id: row.payment_id,
        paymentNumber: row.payment_number,
        clientName: row.client_name,
        invoiceNumbers: new Set<string>(),
        paymentDate: row.payment_date,
        paymentMethod: row.payment_mode,
        referenceNumber: row.reference || '',
        amount: Number(row.amount),
        unallocatedAmount: Number(row.unallocated_amount || 0),
        status: row.status,
      };
      if (row.invoice_number) existing.invoiceNumbers.add(row.invoice_number);
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

      const result = await SalesEngine.recordPayment(orgId, {
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
      } as any);

      await FinanceController.logAudit(orgId, req.auth!.userId, 'PAYMENT_RECORDED', 'PaymentReceived', result.id, result);

      res.status(201).json({ id: result.id, paymentNumber: result.paymentNumber, amount: parsedAmount, status: 'Recorded', ...result });
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Payment could not be posted' });
    }
  }

  // --- EXPENSES ---
  public static async getExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM expenses WHERE organization_id = $1 ORDER BY date DESC', [orgId]);
    const attachmentsByExpense = await ExpenseReceiptService.listForExpenses(db, orgId);
    res.json(result.rows.map((expense) => ({
      id: expense.id, organizationId: expense.organization_id, referenceNumber: expense.expense_number,
      vendorName: expense.vendor_name || undefined, accountId: expense.expense_account_id,
      accountName: '', paidFromAccountId: expense.paid_from_account_id, date: expense.date,
      amount: Number(expense.amount), taxAmount: Number(expense.tax_amount || 0),
      projectId: expense.project_id || undefined, clientId: expense.client_id || undefined,
      isBillable: Boolean(expense.is_billable), paymentStatus: 'Paid', status: expense.status || 'POSTED', description: expense.description || '', createdAt: expense.created_at,
      receiptAttachments: attachmentsByExpense.get(expense.id) || [],
      receiptFileName: attachmentsByExpense.get(expense.id)?.[0]?.fileName,
    })));
  }

  public static async createExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const result = await ExpensePostingService.createAndPost(
        req.auth!.organizationId,
        req.auth!.userId,
        req.body
      );
      res.status(201).json(result);
    } catch (error: any) {
      const message = error.message || 'Expense could not be posted';
      res.status(message.startsWith('EXPENSE_INPUT_INVALID:') || message.startsWith('EXPENSE_RECEIPT_INVALID:') ? 400 : 422).json({ error: message });
    }
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
    const result = await db.query('SELECT * FROM bills WHERE organization_id = $1 ORDER BY bill_date DESC', [orgId]);
    res.json(result.rows.map((bill) => ({
      id: bill.id, billNumber: bill.bill_number, vendorName: bill.vendor_name,
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
      const result = await db.transaction(async (client) => {
        finalBillNumber = finalBillNumber || await DocumentNumberingEngine.getNextNumber(orgId, 'VENDOR_BILL', billDate, undefined, client);
        const vendor = await client.query(`SELECT id, name, company_name FROM vendors WHERE organization_id = $1 AND id = $2`, [orgId, vendorId]);
        if (vendor.rows.length !== 1) throw new Error('Bill vendor does not belong to this organization');
        const resolvedVendorName = vendor.rows[0].name || vendor.rows[0].company_name || vendorName || 'Vendor';
        const finalExpenseAccountId = expenseAccountId || await OrganizationProvisioningService.resolveAccountId(client, orgId, '6000', ['Expense']);
        const finalPayableAccountId = payableAccountId || await OrganizationProvisioningService.resolveAccountId(client, orgId, '2000', ['Liability']);
        const inputTaxAccountId = parsedTax > 0 ? await OrganizationProvisioningService.resolveAccountId(client, orgId, '1200', ['Asset']) : '';
        const postingAccounts = await client.query(
          `SELECT id, type, code, sub_type FROM accounts WHERE organization_id = $1 AND id IN ($2, $3) AND status = 'Active'`,
          [orgId, finalExpenseAccountId, finalPayableAccountId]
        );
        const debitAccount = postingAccounts.rows.find((account) => account.id === finalExpenseAccountId);
        const payableAccount = postingAccounts.rows.find((account) => account.id === finalPayableAccountId);
        if (
          !debitAccount || debitAccount.type !== 'Expense' ||
          !payableAccount || payableAccount.type !== 'Liability' ||
          !['accounts payable', 'payable'].includes(String(payableAccount.sub_type || '').toLowerCase()) ||
          normalizedLines.some((line) => line.accountId && line.accountId !== finalExpenseAccountId)
        ) {
          throw new Error('Bill debit lines must use one expense account and the credit account must be accounts payable');
        }
        await client.query(
          `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, amount_paid, balance_due, status, notes, line_items)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, 'Unpaid', $11, $12)`,
          [billId, orgId, finalBillNumber, vendorId, resolvedVendorName, billDate, dueDate, parsedSubtotal, parsedTax, parsedTotal, notes || '', JSON.stringify(normalizedLines)]
        );

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

        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'BILL_CREATED', 'Bill', $4, $5)`,
          [newId('aud'), orgId, req.auth!.userId, billId, JSON.stringify({ billNumber: finalBillNumber, totalAmount: parsedTotal, journalEntryId: posting.entryId })]
        );
        return posting;
      });
      res.status(201).json({ id: billId, billNumber: finalBillNumber, totalAmount: parsedTotal, status: 'Unpaid', journalEntryId: result.entryId });
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Bill could not be posted' });
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
    const result = await db.query('SELECT * FROM journal_entries WHERE organization_id = $1 ORDER BY date DESC', [orgId]);
    const journals = await Promise.all(result.rows.map(async (entry) => {
      const lines = await db.query(
        `SELECT jl.* FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.journal_entry_id = $1 AND je.organization_id = $2
         ORDER BY jl.id`,
        [entry.id, orgId]
      );
      return { ...entry, lines: lines.rows };
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
    const result = await db.query('SELECT * FROM audit_logs WHERE organization_id = $1 ORDER BY timestamp DESC LIMIT 100', [orgId]);
    res.json(result.rows);
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
    const result = await db.query('SELECT * FROM sales_orders WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createSalesOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const so = await SalesEngine.createSalesOrder(orgId, req.body, undefined, req.auth!.userId);
    res.status(201).json(so);
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
    const id = newId('dc');
    const challanNum = await DocumentNumberingEngine.getNextNumber(orgId, 'DELIVERY_CHALLAN', deliveryDate);

    await db.query(
      `INSERT INTO delivery_challans (id, organization_id, challan_number, customer_id, customer_name, sales_order_id, delivery_date, status, reason, line_items, transport_details, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        orgId,
        challanNum,
        req.body.customerId,
        req.body.customerName || 'Customer',
        req.body.salesOrderId || null,
        deliveryDate,
        req.body.status || 'DRAFT',
        req.body.reason || 'Supply on Approval',
        JSON.stringify(req.body.lineItems || []),
        JSON.stringify(req.body.transportDetails || {}),
        req.body.notes || '',
        now,
      ]
    );

    await FinanceController.logAudit(orgId, req.auth!.userId, 'DELIVERY_CHALLAN_CREATED', 'DeliveryChallan', id, req.body);
    res.status(201).json({ id, challanNumber: challanNum, ...req.body });
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

  public static async getCustomerAdvanceApplications(req: AuthenticatedRequest, res: Response): Promise<void> {
    const result = await db.query('SELECT * FROM customer_advance_applications WHERE organization_id = $1 ORDER BY created_at DESC', [req.auth!.organizationId]);
    res.json(result.rows);
  }

  public static async getCreditNotes(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM credit_notes WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
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
}
