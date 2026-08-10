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
        [`aud-${Date.now()}`, orgId, userId, action, entityType, entityId, JSON.stringify(afterState)]
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
    const { code, name, type, subType, description, balance } = req.body;

    const accId = `acc-${Date.now()}`;
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [accId, orgId, code, name, type, subType || type, balance || 0, false, 'Active']
    );

    await FinanceController.logAudit(orgId, req.auth!.userId, 'ACCOUNT_CREATED', 'Account', accId, { code, name });
    res.status(201).json({ id: accId, code, name, type, subType, balance: balance || 0 });
  }

  // --- CLIENTS ---
  public static async getClients(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM clients WHERE organization_id = $1 ORDER BY name ASC', [orgId]);
    res.json(result.rows);
  }

  public static async createClient(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { name, companyName, email, phone, billingAddress, taxId, currency, paymentTerms } = req.body;

    const cliId = `cli-${Date.now()}`;
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [cliId, orgId, name, companyName || name, email || '', phone || '', billingAddress || '', taxId || '', currency || 'USD', paymentTerms || 'Net 30']
    );

    await FinanceController.logAudit(orgId, req.auth!.userId, 'CLIENT_CREATED', 'Client', cliId, { name, email });
    res.status(201).json({ id: cliId, name, email, companyName });
  }

  // --- VENDORS ---
  public static async getVendors(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM vendors WHERE organization_id = $1 ORDER BY name ASC', [orgId]);
    res.json(result.rows);
  }

  public static async createVendor(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { name, companyName, email, phone, billingAddress } = req.body;

    const venId = `ven-${Date.now()}`;
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, email, phone, billing_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [venId, orgId, name, companyName || name, email || '', phone || '', billingAddress || '']
    );

    await FinanceController.logAudit(orgId, req.auth!.userId, 'VENDOR_CREATED', 'Vendor', venId, { name });
    res.status(201).json({ id: venId, name, email });
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

    const targetCustId = customerId || clientId;
    let resolvedClientName = clientName || '';

    if (targetCustId && typeof targetCustId === 'string' && targetCustId.trim()) {
      const custRes = await db.query(
        `SELECT id, display_name, legal_name FROM customers WHERE organization_id = $1 AND id = $2`,
        [orgId, targetCustId.trim()]
      );
      if (custRes.rows.length === 0) {
        const otherOrgRes = await db.query(`SELECT organization_id FROM customers WHERE id = $1`, [targetCustId.trim()]);
        if (otherOrgRes.rows.length > 0) {
          res.status(400).json({ error: `Customer ${targetCustId} does not belong to organization ${orgId}` });
          return;
        }
        res.status(400).json({ error: `Customer ${targetCustId} not found` });
        return;
      }
      resolvedClientName = custRes.rows[0].display_name || custRes.rows[0].legal_name || resolvedClientName;
    }

    const prjId = `prj-${Date.now()}`;
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, description, status, budget_type, total_budget, hourly_rate, manager)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        prjId,
        orgId,
        code.trim(),
        name.trim(),
        targetCustId || null,
        resolvedClientName,
        description || '',
        'Active',
        budgetType || 'Fixed Cost',
        totalBudget || 0,
        hourlyRate || 0,
        manager || '',
      ]
    );

    await FinanceController.logAudit(orgId, req.auth!.userId, 'PROJECT_CREATED', 'Project', prjId, { name: name.trim(), totalBudget });
    res.status(201).json({ id: prjId, code: code.trim(), name: name.trim(), totalBudget });
  }

  // --- INVOICES ---
  public static async getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM invoices WHERE organization_id = $1 ORDER BY created_at DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { invoiceNumber, clientId, clientName, clientEmail, projectId, issueDate, dueDate, items, discount, notes } = req.body;

    // 1. Period Lock Server Enforcement
    const isLocked = await FinanceController.checkPeriodLock(orgId, issueDate);
    if (isLocked) {
      res.status(422).json({ error: `Period is locked for date ${issueDate}. Cannot create invoice.` });
      return;
    }

    // 2. Compute Totals using domain SalesService
    const calculated = SalesService.calculateTotals(items || [], discount || 0);

    const invId = `inv-${Date.now()}`;

    // 3. Database Transaction
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, client_email, project_id, issue_date, due_date, subtotal, tax_total, discount, total_amount, paid_amount, balance_due, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          invId,
          orgId,
          invoiceNumber || `INV-${Date.now()}`,
          clientId || null,
          clientName,
          clientEmail || '',
          projectId || null,
          issueDate,
          dueDate,
          calculated.subtotal,
          calculated.taxTotal,
          discount || 0,
          calculated.totalAmount,
          0,
          calculated.totalAmount,
          'Sent',
          notes || '',
        ]
      );

      // Save Line Items
      if (items && items.length > 0) {
        for (const item of items) {
          await client.query(
            `INSERT INTO invoice_items (id, organization_id, invoice_id, description, account_id, quantity, unit_price, tax_rate, amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              orgId,
              invId,
              item.description,
              item.accountId || 'acc-4100',
              item.quantity,
              item.unitPrice,
              item.taxRate || 0,
              item.quantity * item.unitPrice,
            ]
          );
        }
      }

      // 4. Automatic Double-Entry Journal Posting Engine Integration
      ServerPostingEngine.postEntry({
        organizationId: orgId,
        entryNumber: `JRN-INV-${invId}`,
        date: issueDate,
        reference: invoiceNumber,
        description: `Invoice ${invoiceNumber} issued to ${clientName}`,
        lines: [
          { accountId: 'acc-1100', accountCode: '1100', accountName: 'Accounts Receivable', debit: calculated.totalAmount, credit: 0 },
          { accountId: 'acc-4000', accountCode: '4000', accountName: 'Sales & Services Revenue', debit: 0, credit: calculated.subtotal },
          ...(calculated.taxTotal > 0 ? [{ accountId: 'acc-2200', accountCode: '2200', accountName: 'Sales Tax Payable', debit: 0, credit: calculated.taxTotal }] : []),
        ],
      });
    });

    await FinanceController.logAudit(orgId, req.auth!.userId, 'INVOICE_CREATED', 'Invoice', invId, { invoiceNumber, totalAmount: calculated.totalAmount });

    res.status(201).json({
      id: invId,
      invoiceNumber,
      clientName,
      totalAmount: calculated.totalAmount,
      balanceDue: calculated.totalAmount,
      status: 'Sent',
    });
  }

  // --- PAYMENTS RECEIVED ---
  public static async getPaymentsReceived(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM payments_received WHERE organization_id = $1 ORDER BY payment_date DESC', [orgId]);
    res.json(result.rows);
  }

  public static async recordPaymentReceived(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    let { paymentNumber, clientId, customerId, clientName, customerName, paymentDate, amount, paymentMode, depositToAccountId, depositAccountId, invoiceId, reference, referenceNumber, notes } = req.body;

    // Normalize field names
    let finalClientId = clientId || customerId;
    let finalClientName = clientName || customerName;
    let finalDepositAccountId = depositToAccountId || depositAccountId || 'acc-1000';
    let finalRef = reference || referenceNumber || '';

    // Period Lock Check
    const isLocked = await FinanceController.checkPeriodLock(orgId, paymentDate);
    if (isLocked) {
      res.status(422).json({ error: `Period is locked for date ${paymentDate}. Cannot record payment.` });
      return;
    }

    if (invoiceId && (!finalClientId || !finalClientName)) {
      const invCheck = await db.query('SELECT * FROM invoices WHERE id = $1 AND organization_id = $2', [invoiceId, orgId]);
      if (invCheck.rows.length > 0) {
        finalClientId = finalClientId || invCheck.rows[0].client_id || invCheck.rows[0].customer_id || 'cust-generic';
        finalClientName = finalClientName || invCheck.rows[0].client_name || invCheck.rows[0].customer_name || 'Valued Customer';
      }
    }

    if (!finalClientId) finalClientId = 'cust-generic';
    if (!finalClientName) finalClientName = 'Valued Customer';

    const paymentId = `pay-${Date.now()}`;

    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, reference, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          paymentId,
          orgId,
          paymentNumber || `REC-${Date.now()}`,
          finalClientId,
          finalClientName,
          paymentDate,
          amount,
          paymentMode || 'Bank Wire',
          finalDepositAccountId,
          finalRef,
          notes || '',
        ]
      );

      // Allocation against Invoice if invoiceId provided
      if (invoiceId) {
        const invRes = await client.query('SELECT * FROM invoices WHERE id = $1 AND organization_id = $2', [invoiceId, orgId]);
        if (invRes.rows.length > 0) {
          const inv = invRes.rows[0];
          const newPaid = Number(inv.paid_amount || 0) + Number(amount);
          const computed = SalesService.computeInvoiceStatusAndBalance(Number(inv.total_amount), newPaid);

          const newStatus = computed.balanceDue === 0 ? 'PAID' : (computed.balanceDue < Number(inv.total_amount) ? 'PARTIALLY_PAID' : inv.status);

          await client.query(
            'UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3 WHERE id = $4',
            [newPaid, computed.balanceDue, newStatus, invoiceId]
          );

          await client.query(
            'INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount) VALUES ($1, $2, $3, $4, $5)',
            [`alloc-${Date.now()}`, orgId, paymentId, invoiceId, amount]
          );
        }
      }

      // Post Journal
      const jeId = `JRN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const now = new Date().toISOString();
      const pmtNum = paymentNumber || `REC-${Date.now()}`;
      await client.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'Posted', $7)`,
        [jeId, orgId, `JRN-PAY-${paymentId}`, paymentDate, pmtNum, `Payment received from ${finalClientName}`, now]
      );

      const depAccId = finalDepositAccountId || 'acc-1000';
      await client.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
        [`line-${Date.now()}-1`, jeId, depAccId, '1000', 'Bank / Cash', Number(amount), `Payment received from ${finalClientName}`]
      );

      await client.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7)`,
        [`line-${Date.now()}-2`, jeId, 'acc-ar-control', '1100', 'Accounts Receivable', Number(amount), `Payment received from ${finalClientName}`]
      );
    });

    await FinanceController.logAudit(orgId, req.auth!.userId, 'PAYMENT_RECORDED', 'PaymentReceived', paymentId, { amount, clientName });

    res.status(201).json({ id: paymentId, paymentNumber, amount, status: 'Recorded' });
  }

  // --- EXPENSES ---
  public static async getExpenses(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM expenses WHERE organization_id = $1 ORDER BY date DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { expenseNumber, expenseAccountId, paidFromAccountId, vendorName, date, amount, description } = req.body;

    const expId = `exp-${Date.now()}`;
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, vendor_name, date, amount, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        expId,
        orgId,
        expenseNumber || `EXP-${Date.now()}`,
        expenseAccountId || 'acc-6000',
        paidFromAccountId || 'acc-1000',
        vendorName || '',
        date,
        amount,
        description || '',
      ]
    );

    // Post Journal
    ServerPostingEngine.postEntry({
      organizationId: orgId,
      entryNumber: `JRN-EXP-${expId}`,
      date,
      reference: expenseNumber,
      description: `Expense paid to ${vendorName || 'Vendor'}`,
      lines: [
        { accountId: expenseAccountId || 'acc-6000', accountCode: '6000', accountName: 'Operating Expense', debit: amount, credit: 0 },
        { accountId: paidFromAccountId || 'acc-1000', accountCode: '1000', accountName: 'Operating Bank Account', debit: 0, credit: amount },
      ],
    });

    await FinanceController.logAudit(orgId, req.auth!.userId, 'EXPENSE_CREATED', 'Expense', expId, { amount, vendorName });
    res.status(201).json({ id: expId, expenseNumber, amount });
  }

  // --- BILLS ---
  public static async getBills(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM bills WHERE organization_id = $1 ORDER BY bill_date DESC', [orgId]);
    res.json(result.rows);
  }

  public static async createBill(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { billNumber, vendorId, vendorName, billDate, dueDate, totalAmount, notes } = req.body;

    const billId = `bill-${Date.now()}`;
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, total_amount, amount_paid, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [billId, orgId, billNumber || `BILL-${Date.now()}`, vendorId || null, vendorName, billDate, dueDate, totalAmount, 0, 'Unpaid', notes || '']
    );

    ServerPostingEngine.postEntry({
      organizationId: orgId,
      entryNumber: `JRN-BILL-${billId}`,
      date: billDate,
      reference: billNumber,
      description: `Bill ${billNumber} received from ${vendorName}`,
      lines: [
        { accountId: 'acc-6000', accountCode: '6000', accountName: 'Operating Expense', debit: totalAmount, credit: 0 },
        { accountId: 'acc-2000', accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: totalAmount },
      ],
    });

    await FinanceController.logAudit(orgId, req.auth!.userId, 'BILL_CREATED', 'Bill', billId, { billNumber, totalAmount });
    res.status(201).json({ id: billId, billNumber, totalAmount, status: 'Unpaid' });
  }

  // --- JOURNALS ---
  public static async getJournals(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM journal_entries WHERE organization_id = $1 ORDER BY date DESC', [orgId]);
    res.json(result.rows);
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

    const lockId = `lock-${Date.now()}`;
    await db.query(
      `INSERT INTO period_locks (id, organization_id, lock_date, region, locked_by, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [lockId, orgId, lockDate, region || 'Global', req.auth!.userId, reason || 'Accounting Period Lock', 'Active']
    );

    await FinanceController.logAudit(orgId, req.auth!.userId, 'PERIOD_LOCKED', 'PeriodLock', lockId, { lockDate, reason });
    res.status(201).json({ id: lockId, lockDate, status: 'Active' });
  }

  // --- AUDIT LOGS ---
  public static async getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const result = await db.query('SELECT * FROM audit_logs WHERE organization_id = $1 ORDER BY timestamp DESC LIMIT 100', [orgId]);
    res.json(result.rows);
  }

  // --- LOCALSTORAGE MIGRATION ---
  public static async importLocalStorageData(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { accounts, clients, vendors, projects, invoices, expenses, journals } = req.body;

    let importedCounts = {
      accounts: 0,
      clients: 0,
      vendors: 0,
      projects: 0,
      invoices: 0,
      expenses: 0,
      journals: 0,
    };

    await db.transaction(async (client) => {
      // Import Accounts
      if (Array.isArray(accounts)) {
        for (const a of accounts) {
          const check = await client.query('SELECT id FROM accounts WHERE id = $1 AND organization_id = $2', [a.id, orgId]);
          if (check.rows.length === 0) {
            await client.query(
              `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [a.id, orgId, a.code || '0000', a.name, a.type, a.subType || a.type, a.balance || 0, 'Active']
            );
            importedCounts.accounts++;
          }
        }
      }

      // Import Clients
      if (Array.isArray(clients)) {
        for (const c of clients) {
          const check = await client.query('SELECT id FROM clients WHERE id = $1 AND organization_id = $2', [c.id, orgId]);
          if (check.rows.length === 0) {
            await client.query(
              `INSERT INTO clients (id, organization_id, name, company_name, email, phone, billing_address, tax_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [c.id, orgId, c.name, c.companyName || c.name, c.email || '', c.phone || '', c.billingAddress || '', c.taxId || '']
            );
            importedCounts.clients++;
          }
        }
      }

      // Import Invoices
      if (Array.isArray(invoices)) {
        for (const inv of invoices) {
          const check = await client.query('SELECT id FROM invoices WHERE id = $1 AND organization_id = $2', [inv.id, orgId]);
          if (check.rows.length === 0) {
            await client.query(
              `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, client_email, issue_date, due_date, subtotal, tax_total, discount, total_amount, paid_amount, balance_due, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
              [
                inv.id,
                orgId,
                inv.invoiceNumber,
                inv.clientId || null,
                inv.clientName,
                inv.clientEmail || '',
                inv.issueDate,
                inv.dueDate,
                inv.subtotal,
                inv.taxTotal,
                inv.discount || 0,
                inv.totalAmount,
                inv.paidAmount || 0,
                inv.balanceDue || inv.totalAmount,
                inv.status || 'Sent',
              ]
            );
            importedCounts.invoices++;
          }
        }
      }
    });

    await FinanceController.logAudit(orgId, req.auth!.userId, 'LOCALSTORAGE_MIGRATED', 'Migration', `mig-${Date.now()}`, importedCounts);

    res.json({
      message: 'LocalStorage data imported into PostgreSQL successfully',
      importedCounts,
    });
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
           AND (display_name ILIKE $2 OR legal_name ILIKE $2 OR customer_code ILIKE $2 OR gstin ILIKE $2 OR tax_id ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
         ORDER BY display_name ASC LIMIT 50`,
        [orgId, q]
      );
      res.json(result.rows);
      return;
    }
    const result = await db.query('SELECT * FROM customers WHERE organization_id = $1 ORDER BY display_name ASC', [orgId]);
    res.json(result.rows);
  }

  public static async createCustomer(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const customer = await SalesEngine.createCustomer(orgId, req.body);
    await FinanceController.logAudit(orgId, req.auth!.userId, 'CUSTOMER_CREATED', 'Customer', customer.id, customer);
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
    await FinanceController.logAudit(orgId, req.auth!.userId, 'ESTIMATE_CREATED', 'Estimate', estimate.id, estimate);
    res.status(201).json(estimate);
  }

  public static async reviseEstimate(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const { changeSummary, notes, ...newData } = req.body;
    const summary = changeSummary || notes || 'Revised Estimate';
    const estimate = await QuotationEngine.reviseQuotation(orgId, req.params.id, { notes, ...newData }, summary, req.auth!.userId);
    await FinanceController.logAudit(orgId, req.auth!.userId, 'ESTIMATE_REVISED', 'Estimate', estimate.id, estimate);
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
    const so = await SalesEngine.createSalesOrder(orgId, req.body);
    await FinanceController.logAudit(orgId, req.auth!.userId, 'SALES_ORDER_CREATED', 'SalesOrder', so.id, so);
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
    const id = `dc-${Date.now()}`;
    const challanNum = req.body.challanNumber || `DC-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

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
        req.body.deliveryDate || now.split('T')[0],
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
      await FinanceController.logAudit(orgId, userId, 'MANUAL_JOURNAL_CREATED', 'JournalEntry', result.id, result);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async reverseJournal(req: AuthenticatedRequest, res: Response): Promise<void> {
    const orgId = req.auth!.organizationId;
    const userId = req.auth!.userId;
    const journalId = req.params.id;
    const reason = req.body.reason || 'Manual journal reversal';
    try {
      const result = await ManualJournalService.reverseJournal(orgId, userId, journalId, reason);
      await FinanceController.logAudit(orgId, userId, 'MANUAL_JOURNAL_REVERSED', 'JournalEntry', journalId, result);
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
    await FinanceController.logAudit(orgId, userId, 'RECURRING_JOURNAL_CREATED', 'RecurringProfile', profile.id, profile);
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
    await FinanceController.logAudit(orgId, userId, 'BUDGET_CREATED', 'Budget', budget.id, budget);
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
    const isFavorite = await SavedReportService.toggleFavorite(orgId, req.params.id);
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
