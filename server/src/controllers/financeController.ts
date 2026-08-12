import { Response } from 'express';
import { db } from '../database/db';
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
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';

export class FinanceController {
  // --- AUDIT LOG UTILITY ---
  private static async logAudit(
    orgId: string,
    userId: string,
    action: string,
    entityType: string,
    entityId: string,
    afterState: any = null
  ) {
    try {
      await db.query(
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

  public static async createAccount(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { code, name, type, subType } = req.body;
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
      Asset: new Set(['Bank', 'Cash', 'Digital Wallet', 'Undeposited Funds', 'Accounts Receivable', 'Inventory', 'Fixed Assets', 'Other Current Assets', 'Other Assets', 'Cash & Bank', 'Current Asset', 'Fixed Asset']),
      Liability: new Set(['Accounts Payable', 'Credit Cards', 'Taxes Payable', 'Payroll Liabilities', 'Loans', 'Loan/Credit', 'Other Liabilities', 'Current Liability', 'Long Term Liability']),
      Equity: new Set(['Capital', 'Retained Earnings', 'Drawings', 'Other Equity', 'Equity']),
      Income: new Set(['Sales', 'Services', 'Other Operating Income', 'Operating Revenue', 'Other Revenue', 'Interest Income', 'Asset Gains', 'Other Income']),
      'Other Income': new Set(['Interest Income', 'Asset Gains', 'Other Income']),
      'Cost of Goods Sold': new Set(['Materials', 'Direct Labor', 'Subcontractors', 'Other Direct Costs', 'Direct Expense / Cost of Goods']),
      Expense: new Set(['Payroll', 'Office & Administrative', 'Sales & Marketing', 'Travel & Vehicle', 'Utilities & Communication', 'Professional Services', 'Software & Subscriptions', 'Repairs & Maintenance', 'Financial Expenses', 'Depreciation & Amortization', 'Miscellaneous Expenses', 'Operating Expense', 'Tax Expense', 'Interest Expense', 'Asset Losses', 'Other Expenses']),
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
    const reservedCodes = new Set(['1000', '1100', '1200', '2000', '2100', '2200', '3000', '4000', '4900', '5800', '5900', '6000']);
    if (reservedCodes.has(normalizedCode)) {
      res.status(409).json({ error: 'This account code is reserved for a provisioned system control account' });
      return;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(normalizedCode) || name.trim().length > 160 || normalizedSubType.length > 80) {
      res.status(400).json({ error: 'Account code or name is invalid or exceeds the allowed length' });
      return;
    }

    const accId = newId('acc');
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account, status)
         VALUES ($1, $2, $3, $4, $5, $6, 0, FALSE, 'Active')`,
        [accId, orgId, normalizedCode, name.trim(), normalizedType, normalizedSubType]
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'ACCOUNT_CREATED', 'Account', $4, $5)`,
        [newId('aud'), orgId, req.auth!.userId, accId, JSON.stringify({ code: normalizedCode, name: name.trim(), type: normalizedType, subType: normalizedSubType })]
      );
    });
    res.status(201).json({ id: accId, code: normalizedCode, name: name.trim(), type: normalizedType, subType: normalizedSubType, balance: 0, status: 'Active' });
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

    if (!clientId || !/^\d{4}-\d{2}-\d{2}$/.test(String(issueDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || '')) || dueDate < issueDate || !Array.isArray(items) || items.length === 0) {
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
      });
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(paymentDate || '')) || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !Number.isSafeInteger(Math.round(parsedAmount * 100)) || Math.abs(parsedAmount * 100 - Math.round(parsedAmount * 100)) > 1e-7) {
      res.status(400).json({ error: 'paymentDate and a positive amount with no more than two decimals are required' });
      return;
    }

    const paymentId = newId('pay');
    let finalPaymentNumber = '';
    try {
      const result = await db.transaction(async (client) => {
        finalPaymentNumber = finalPaymentNumber || await DocumentNumberingEngine.getNextNumber(orgId, 'CUSTOMER_PAYMENT', paymentDate, undefined, client);
        let finalClientId = clientId || customerId;
        let finalClientName = clientName || customerName;
        let allocatedAmount = 0;
        let invoiceState: { id: string; paidAmount: number; balanceDue: number; status: string } | null = null;

        if (invoiceId) {
          const invRes = await client.query(
            'SELECT * FROM invoices WHERE id = $1 AND organization_id = $2 FOR UPDATE',
            [invoiceId, orgId]
          );
          if (invRes.rows.length !== 1) throw new Error('Invoice was not found in this organization');
          const invoice = invRes.rows[0];
          const invoiceClientId = invoice.client_id || invoice.customer_id;
          if (finalClientId && finalClientId !== invoiceClientId) throw new Error('Payment customer does not match the selected invoice');
          if (['DRAFT', 'VOID', 'VOIDED'].includes(String(invoice.status).toUpperCase())) throw new Error('Payments cannot be applied to a draft or voided invoice');
          if (Number(invoice.balance_due || 0) <= 0) throw new Error('Selected invoice has no outstanding balance');
          const invoiceDate = new Date(invoice.issue_date).toISOString().split('T')[0];
          if (paymentDate < invoiceDate) throw new Error('Payment date cannot precede the selected invoice issue date');
          finalClientId = invoiceClientId;
          finalClientName = finalClientName || invoice.client_name;
          allocatedAmount = Math.min(parsedAmount, Number(invoice.balance_due || 0));
          const newPaid = Math.round((Number(invoice.paid_amount || 0) + allocatedAmount) * 100) / 100;
          const computed = SalesService.computeInvoiceStatusAndBalance(Number(invoice.total_amount), newPaid);
          await client.query(
            `UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3
              WHERE id = $4 AND organization_id = $5`,
            [newPaid, computed.balanceDue, computed.status, invoiceId, orgId]
          );
          invoiceState = { id: invoiceId, paidAmount: newPaid, balanceDue: computed.balanceDue, status: computed.status };
        }
        if (!finalClientId || !finalClientName) throw new Error('A valid customer is required');
        const customer = await client.query(
          `SELECT id FROM clients WHERE organization_id = $1 AND id = $2
           UNION ALL SELECT id FROM customers WHERE organization_id = $1 AND id = $2 LIMIT 1`,
          [orgId, finalClientId]
        );
        if (customer.rows.length === 0) throw new Error('Payment customer does not belong to this organization');

        const unallocatedAmount = Math.round((parsedAmount - allocatedAmount) * 100) / 100;
        const resolvedDepositAccountId = depositToAccountId || depositAccountId || await OrganizationProvisioningService.resolveAccountId(client, orgId, '1000', ['Asset']);
        const depositAccount = await client.query(
          `SELECT id, code, sub_type FROM accounts
            WHERE organization_id = $1 AND id = $2 AND type = 'Asset'
              AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
          [orgId, resolvedDepositAccountId]
        );
        const deposit = depositAccount.rows[0];
        const depositSubType = String(deposit?.sub_type || '').toLowerCase();
        if (
          depositAccount.rows.length !== 1 ||
          !['bank', 'cash', 'cash & bank', 'digital wallet', 'undeposited funds'].includes(depositSubType)
        ) throw new Error('Payment deposit account must be an active bank, cash, wallet, or undeposited-funds account in this organization');
        await client.query(
          `INSERT INTO payments_received
            (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, reference, notes, unallocated_amount, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [paymentId, orgId, finalPaymentNumber, finalClientId, finalClientName, paymentDate, parsedAmount, paymentMode || 'Bank Wire', resolvedDepositAccountId, reference || referenceNumber || '', notes || '', unallocatedAmount, unallocatedAmount > 0 ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED']
        );

        if (invoiceId && allocatedAmount > 0) {
          await client.query(
            'INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount) VALUES ($1, $2, $3, $4, $5)',
            [newId('alloc'), orgId, paymentId, invoiceId, allocatedAmount]
          );
        }

        const receivableId = allocatedAmount > 0 ? await OrganizationProvisioningService.resolveAccountId(client, orgId, '1100', ['Asset']) : '';
        const advanceId = unallocatedAmount > 0 ? await OrganizationProvisioningService.resolveAccountId(client, orgId, '2100', ['Liability']) : '';
        const posting = await ServerPostingEngine.postEntry({
          organizationId: orgId,
          entryNumber: `JRN-PAY-${paymentId}`,
          date: paymentDate,
          reference: finalPaymentNumber,
          description: `Payment received from ${finalClientName}`,
          lines: [
            { accountId: resolvedDepositAccountId, debit: parsedAmount, credit: 0 },
            ...(allocatedAmount > 0 ? [{ accountId: receivableId, debit: 0, credit: allocatedAmount }] : []),
            ...(unallocatedAmount > 0 ? [{ accountId: advanceId, debit: 0, credit: unallocatedAmount }] : []),
          ],
        }, client);
        await client.query(
          `UPDATE payments_received SET journal_entry_id = $1 WHERE id = $2 AND organization_id = $3`,
          [posting.entryId, paymentId, orgId]
        );
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'PAYMENT_RECORDED', 'PaymentReceived', $4, $5)`,
          [newId('aud'), orgId, req.auth!.userId, paymentId, JSON.stringify({ amount: parsedAmount, allocatedAmount, unallocatedAmount, journalEntryId: posting.entryId })]
        );
        return { ...posting, allocatedAmount, unallocatedAmount, invoice: invoiceState };
      });

      res.status(201).json({ id: paymentId, paymentNumber: finalPaymentNumber, amount: parsedAmount, status: 'Recorded', ...result });
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Payment could not be posted' });
    }
  }

  // --- EXPENSES ---
  public static async getExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM expenses WHERE organization_id = $1 ORDER BY date DESC', [orgId]);
    res.json(result.rows.map((expense) => ({
      id: expense.id, organizationId: expense.organization_id, referenceNumber: expense.expense_number,
      vendorName: expense.vendor_name || undefined, accountId: expense.expense_account_id,
      accountName: '', paidFromAccountId: expense.paid_from_account_id, date: expense.date,
      amount: Number(expense.amount), taxAmount: Number(expense.tax_amount || 0), isBillable: false,
      paymentStatus: 'Paid', description: expense.description || '', createdAt: expense.created_at,
    })));
  }

  public static async createExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { expenseAccountId, paidFromAccountId, vendorName, date, amount, description } = req.body;
    const parsedAmount = Number(amount);
    if (!date || !expenseAccountId || !paidFromAccountId || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.round(parsedAmount * 100) / 100 !== parsedAmount) {
      res.status(400).json({ error: 'date, expenseAccountId, paidFromAccountId, and a positive amount are required' });
      return;
    }

    const expId = newId('exp');
    let finalExpenseNumber = '';
    try {
      const result = await db.transaction(async (client) => {
        finalExpenseNumber = finalExpenseNumber || await DocumentNumberingEngine.getNextNumber(orgId, 'EXPENSE', date, undefined, client);
        const accountCheck = await client.query(
          `SELECT id, type, code, sub_type FROM accounts
            WHERE organization_id = $1 AND id IN ($2, $3) AND status = 'Active' AND COALESCE(is_locked, FALSE) = FALSE`,
          [orgId, expenseAccountId, paidFromAccountId]
        );
        if (new Set(accountCheck.rows.map((row) => row.id)).size !== 2) {
          throw new Error('Both expense and payment accounts must be active, unlocked accounts in this organization');
        }
        const expenseAccount = accountCheck.rows.find((account) => account.id === expenseAccountId);
        const paymentAccount = accountCheck.rows.find((account) => account.id === paidFromAccountId);
        const paymentSubType = String(paymentAccount?.sub_type || '').toLowerCase();
        if (
          !expenseAccount ||
          expenseAccount.type !== 'Expense' ||
          !paymentAccount || paymentAccount.type !== 'Asset' ||
          !['bank', 'cash', 'cash & bank', 'digital wallet'].includes(paymentSubType)
        ) {
          throw new Error('Expense debit account must be an expense account and payment account must be an active bank, cash, or wallet account');
        }
        await client.query(
          `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, vendor_name, date, amount, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [expId, orgId, finalExpenseNumber, expenseAccountId, paidFromAccountId, vendorName || '', date, parsedAmount, description || '']
        );

        const posting = await ServerPostingEngine.postEntry({
          organizationId: orgId,
          entryNumber: `JRN-EXP-${expId}`,
          date,
          reference: finalExpenseNumber,
          description: `Expense paid to ${vendorName || 'Vendor'}`,
          lines: [
            { accountId: expenseAccountId, debit: parsedAmount, credit: 0 },
            { accountId: paidFromAccountId, debit: 0, credit: parsedAmount },
          ],
        }, client);

        await client.query(
          `UPDATE expenses SET journal_entry_id = $1 WHERE id = $2 AND organization_id = $3`,
          [posting.entryId, expId, orgId]
        );

        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'EXPENSE_CREATED', 'Expense', $4, $5)`,
          [newId('aud'), orgId, req.auth!.userId, expId, JSON.stringify({ amount: parsedAmount, vendorName, journalEntryId: posting.entryId })]
        );
        return posting;
      });
      res.status(201).json({ id: expId, expenseNumber: finalExpenseNumber, amount: parsedAmount, journalEntryId: result.entryId });
    } catch (error: any) {
      res.status(422).json({ error: error.message || 'Expense could not be posted' });
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
    if (!vendorId || !/^\d{4}-\d{2}-\d{2}$/.test(String(billDate || '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate || '')) || dueDate < billDate || amounts.some((value) => !Number.isFinite(value) || value < 0 || Math.round(value * 100) / 100 !== value) || parsedTotal <= 0 || Math.abs(parsedSubtotal + parsedTax - parsedTotal) > 0.009) {
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(lockDate || '')) || lockDate > today || normalizedReason.length < 5 || normalizedReason.length > 500) {
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
    const result = await SalesEngine.applyAdvanceToInvoice(orgId, advanceId, invoiceId, amountToApply, applyDate || new Date().toISOString().split('T')[0]);
    await FinanceController.logAudit(orgId, req.auth!.userId, 'CUSTOMER_ADVANCE_APPLIED', 'CustomerAdvance', advanceId, result);
    res.json(result);
  }

  public static async getCreditNotes(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM credit_notes WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createCreditNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await SalesEngine.createCreditNote(orgId, req.body);
    await FinanceController.logAudit(orgId, req.auth!.userId, 'CREDIT_NOTE_CREATED', 'CreditNote', result.creditNoteId, result);
    res.status(201).json(result);
  }

  public static async applyCreditNote(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { creditNoteId, invoiceId, amountToApply, applyDate } = req.body;
    const result = await SalesEngine.applyCreditNoteToInvoice(orgId, creditNoteId, invoiceId, amountToApply, applyDate || new Date().toISOString().split('T')[0]);
    await FinanceController.logAudit(orgId, req.auth!.userId, 'CREDIT_NOTE_APPLIED', 'CreditNote', creditNoteId, result);
    res.json(result);
  }

  public static async recordRefund(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await SalesEngine.recordRefund(orgId, req.body);
    await FinanceController.logAudit(orgId, req.auth!.userId, 'CUSTOMER_REFUND_RECORDED', 'CustomerRefund', result.refundId, result);
    res.status(201).json(result);
  }

  public static async recordWriteOff(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await SalesEngine.recordWriteOff(orgId, { ...req.body, userId: req.auth!.userId });
    await FinanceController.logAudit(orgId, req.auth!.userId, 'AR_WRITE_OFF_RECORDED', 'WriteOff', result.writeOffId, result);
    res.status(201).json(result);
  }

  // --- REPORTS & INTEGRITY ---
  public static async getAccountantOverview(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const overview = await AccountantOverviewService.getOverview(orgId);
    res.json(overview);
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
    await FinanceController.logAudit(orgId, userId, 'FIXED_ASSET_CREATED', 'FixedAsset', asset.id, asset);
    res.status(201).json(asset);
  }

  public static async depreciateFixedAsset(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const assetId = req.params.id;
    const periodKey = req.body.periodKey || new Date().toISOString().slice(0, 7);
    try {
      const result = await FixedAssetService.postMonthlyDepreciation(orgId, userId, assetId, periodKey);
      await FinanceController.logAudit(orgId, userId, 'DEPRECIATION_POSTED', 'FixedAsset', assetId, result);
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
      await FinanceController.logAudit(orgId, userId, 'FIXED_ASSET_DISPOSED', 'FixedAsset', assetId, result);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
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
      await FinanceController.logAudit(orgId, userId, 'PERIOD_CLOSED', 'PeriodClose', periodKey, result);
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
      await FinanceController.logAudit(orgId, userId, 'PERIOD_REOPENED', 'PeriodClose', periodKey, { reason });
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
}
