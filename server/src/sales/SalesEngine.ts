import { db } from '../database/db';
import { ItemMasterService } from '../services/ItemMasterService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { AccountingService } from '../../../src/services/accountingService';
import { SalesService } from '../../../src/services/salesService';
import { PeriodLock } from '../../../src/types';

export interface CustomerMaster {
  id: string;
  organizationId: string;
  customerId?: string;
  displayName: string;
  legalName?: string;
  customerType?: 'Business' | 'Individual';
  gstStatus?: 'Registered' | 'Unregistered' | 'Composition' | 'SEZ';
  gstin?: string;
  pan?: string;
  billingAddress?: any;
  shippingAddresses?: any[];
  placeOfSupply?: string;
  primaryContact?: any;
  additionalContacts?: any[];
  email?: string;
  phone?: string;
  currency?: string;
  paymentTerms?: string;
  creditLimit?: number;
  priceListId?: string;
  taxPreferences?: any;
  defaultSalesAccountId?: string;
  salespersonId?: string;
  notes?: string;
  attachments?: any[];
  active?: boolean;
  openingBalance?: number;
  receivablesBalance?: number;
  unusedCredits?: number;
  advanceBalance?: number;
  createdAt?: string;
}

export interface EstimateModel {
  id: string;
  organizationId: string;
  estimateNumber: string;
  revisionNumber: number;
  customerId: string;
  customerName: string;
  customerSnapshot?: any;
  issueDate: string;
  expiryDate: string;
  salespersonId?: string;
  projectId?: string;
  currency?: string;
  subtotal: number;
  taxTotal: number;
  discount: number;
  totalAmount: number;
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CONVERTED' | 'CANCELLED';
  lineItems: any[];
  terms?: string;
  notes?: string;
  attachments?: any[];
  customFields?: any;
  createdBy?: string;
  createdAt?: string;
}

export interface SalesOrderModel {
  id: string;
  organizationId: string;
  salesOrderNumber: string;
  estimateId?: string;
  customerId: string;
  customerName: string;
  customerSnapshot?: any;
  orderDate: string;
  expectedDelivery?: string;
  subtotal: number;
  taxTotal: number;
  discount: number;
  totalAmount: number;
  fulfilledAmount: number;
  invoicedAmount: number;
  status: 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'PARTIALLY_INVOICED' | 'INVOICED' | 'CANCELLED' | 'CLOSED';
  lineItems: any[];
  projectId?: string;
  notes?: string;
  attachments?: any[];
  customFields?: any;
  createdAt?: string;
}

export interface InvoiceModel {
  id: string;
  organizationId: string;
  invoiceNumber: string;
  salesOrderId?: string;
  estimateId?: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  customerSnapshot?: any;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  taxTotal: number;
  discount: number;
  roundOffAmount?: number;
  totalAmount: number;
  paidAmount: number;
  amountCredited?: number;
  amountWrittenOff?: number;
  balanceDue: number;
  status: 'DRAFT' | 'POSTED' | 'SENT' | 'VIEWED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOIDED' | 'WRITTEN_OFF';
  communicationStatus?: 'CREATED' | 'SENT' | 'DELIVERED' | 'VIEWED';
  placeOfSupply?: string;
  lineItems: any[];
  projectId?: string;
  salespersonId?: string;
  paymentTerms?: string;
  notes?: string;
  attachments?: any[];
  customFields?: any;
  journalEntryId?: string;
  createdAt?: string;
}

export class SalesEngine {
  // Helper for checking Period Lock
  private static async checkPeriodLock(orgId: string, dateStr: string): Promise<void> {
    const lockRes = await db.query(
      `SELECT lock_date FROM period_locks WHERE organization_id = $1 AND status = 'Active'`,
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

    if (AccountingService.isPeriodLocked(dateStr, locks)) {
      throw new Error(`Cannot complete operation: Date ${dateStr} falls within a locked accounting period.`);
    }
  }

  // Helper to persist journal entry & lines into DB and sync account balances
  private static async persistJournalEntry(
    orgId: string,
    entryNumber: string,
    date: string,
    reference: string,
    description: string,
    lines: any[]
  ): Promise<string> {
    const resolvedLines = await Promise.all(
      lines.map(async (line) => {
        let accId = line.accountId;
        let accCode = line.accountCode;
        let accName = line.accountName;
        const accRes = await db.query(
          `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND (id = $2 OR code = $3 OR code = $2)`,
          [orgId, accId, accCode || accId]
        );
        if (accRes.rows.length > 0) {
          accId = accRes.rows[0].id;
          accCode = accCode || accRes.rows[0].code;
          accName = accName || accRes.rows[0].name;
        }
        return {
          ...line,
          accountId: accId,
          accountCode: accCode,
          accountName: accName,
        };
      })
    );

    const postRes = ServerPostingEngine.postEntry({
      organizationId: orgId,
      entryNumber,
      date,
      reference,
      description,
      lines: resolvedLines,
    });

    if (!postRes.success) {
      throw new Error(`GL Posting Failed: ${postRes.error}`);
    }

    const entryId = postRes.entryId!;
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [entryId, orgId, entryNumber, date, reference, description, 'Posted', now]
    );

    for (const line of resolvedLines) {
      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, account_id, account_code, account_name, debit, credit, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [`line-${Date.now()}-${Math.random()}`, entryId, line.accountId, line.accountCode, line.accountName, line.debit || 0, line.credit || 0, line.description || description]
      );

      const change = (line.debit || 0) - (line.credit || 0);
      if (change !== 0) {
        await db.query(
          `UPDATE accounts SET balance = balance + $1 WHERE organization_id = $2 AND (id = $3 OR code = $4)`,
          [change, orgId, line.accountId, line.accountCode]
        );
        await db.query(
          `UPDATE bank_accounts SET current_balance = current_balance + $1 WHERE organization_id = $2 AND (ledger_account_id = $3 OR ledger_account_id IN (SELECT id FROM accounts WHERE organization_id = $2 AND code = $4))`,
          [change, orgId, line.accountId, line.accountCode]
        );
      }
    }

    return entryId;
  }

  // -------------------------------------------------------------
  // 1. CUSTOMER MASTER & SNAPSHOTTING
  // -------------------------------------------------------------
  public static async createCustomer(orgId: string, data: Partial<CustomerMaster>): Promise<CustomerMaster> {
    const id = data.id || `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const custId = data.customerId || `CUST-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, customer_type, gst_status, gstin, pan, billing_address, shipping_addresses, place_of_supply, primary_contact, additional_contacts, email, phone, currency, payment_terms, credit_limit, price_list_id, tax_preferences, default_sales_account_id, salesperson_id, notes, attachments, active, opening_balance, receivables_balance, unused_credits, advance_balance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)`,
      [
        id,
        orgId,
        custId,
        data.displayName || (data as any).name || 'Unnamed Customer',
        data.legalName || data.displayName || (data as any).name || '',
        data.customerType || 'Business',
        data.gstStatus || 'Unregistered',
        data.gstin || '',
        data.pan || '',
        JSON.stringify(data.billingAddress || {}),
        JSON.stringify(data.shippingAddresses || []),
        data.placeOfSupply || '27-Maharashtra',
        JSON.stringify(data.primaryContact || {}),
        JSON.stringify(data.additionalContacts || []),
        data.email || '',
        data.phone || '',
        data.currency || 'INR',
        data.paymentTerms || 'Net 30',
        data.creditLimit || 0,
        data.priceListId || null,
        JSON.stringify(data.taxPreferences || {}),
        data.defaultSalesAccountId || null,
        data.salespersonId || null,
        data.notes || '',
        JSON.stringify(data.attachments || []),
        data.active !== undefined ? data.active : true,
        data.openingBalance || 0,
        data.receivablesBalance || data.openingBalance || 0,
        data.unusedCredits || 0,
        data.advanceBalance || 0,
        now,
      ]
    );

    // Also sync to legacy `clients` table if needed
    try {
      await db.query(
        `INSERT INTO clients (id, organization_id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms, receivables_balance, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET name = $3, email = $5`,
        [
          id,
          orgId,
          data.displayName || 'Unnamed Customer',
          data.legalName || '',
          data.email || '',
          data.phone || '',
          typeof data.billingAddress === 'string' ? data.billingAddress : JSON.stringify(data.billingAddress || ''),
          data.gstin || '',
          data.currency || 'INR',
          data.paymentTerms || 'Net 30',
          data.receivablesBalance || data.openingBalance || 0,
          now,
        ]
      );
    } catch (e) {
      // ignore table sync duplicate error
    }

    return {
      id,
      organizationId: orgId,
      customerId: custId,
      displayName: data.displayName || 'Unnamed Customer',
      legalName: data.legalName,
      email: data.email,
      phone: data.phone,
      gstin: data.gstin,
      receivablesBalance: data.receivablesBalance || data.openingBalance || 0,
      openingBalance: data.openingBalance || 0,
    };
  }

  public static async getCustomerSummary(orgId: string, customerId: string): Promise<any> {
    const custRes = await db.query(`SELECT * FROM customers WHERE organization_id = $1 AND id = $2`, [orgId, customerId]);
    if (custRes.rows.length === 0) {
      const clientRes = await db.query(`SELECT * FROM clients WHERE organization_id = $1 AND id = $2`, [orgId, customerId]);
      if (clientRes.rows.length === 0) return null;
      const client = clientRes.rows[0];
      return {
        id: client.id,
        displayName: client.name,
        receivablesBalance: Number(client.receivables_balance || 0),
        totalSales: 0,
        overdue: 0,
        unusedCredits: 0,
        advancePayments: 0,
      };
    }

    const c = custRes.rows[0];

    // Authoritative calculation from DB documents
    const invRes = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_sales,
              COALESCE(SUM(balance_due), 0) as outstanding,
              COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND balance_due > 0 THEN balance_due ELSE 0 END), 0) as overdue
       FROM invoices WHERE organization_id = $1 AND (client_id = $2 OR customer_id = $2) AND status != 'VOIDED'`,
      [orgId, customerId]
    );

    const cnRes = await db.query(
      `SELECT COALESCE(SUM(remaining_credit), 0) as unused_credits FROM credit_notes WHERE organization_id = $1 AND (client_id = $2 OR customer_id = $2) AND status = 'Open'`,
      [orgId, customerId]
    );

    const advRes = await db.query(
      `SELECT COALESCE(SUM(unapplied_amount), 0) as advance_balance FROM customer_advances WHERE organization_id = $1 AND customer_id = $2 AND status = 'UNAPPLIED'`,
      [orgId, customerId]
    );

    return {
      id: c.id,
      displayName: c.display_name,
      legalName: c.legal_name,
      email: c.email,
      gstin: c.gstin,
      totalSales: Number(invRes.rows[0].total_sales),
      outstandingReceivable: Number(invRes.rows[0].outstanding),
      overdue: Number(invRes.rows[0].overdue),
      unusedCredits: Number(cnRes.rows[0].unused_credits),
      advancePayments: Number(advRes.rows[0].advance_balance),
    };
  }

  // -------------------------------------------------------------
  // 2. ESTIMATES & REVISIONS
  // -------------------------------------------------------------
  public static async createEstimate(orgId: string, data: Partial<EstimateModel> & { publicToken?: string }): Promise<EstimateModel & { publicToken: string }> {
    const id = data.id || `est-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const estNumber = data.estimateNumber || `EST-${Math.floor(10000 + Math.random() * 90000)}`;
    const publicToken = data.publicToken || `pub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();

    const { subtotal, taxTotal, totalAmount } = SalesService.calculateTotals(data.lineItems || [], data.discount || 0);

    const snapshot = { customerId: data.customerId, customerName: data.customerName };

    await db.query(
      `INSERT INTO estimates (id, organization_id, estimate_number, revision_number, client_id, client_name, issue_date, expiry_date, subtotal, tax_total, discount, total_amount, status, public_token, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        orgId,
        estNumber,
        0,
        data.customerId,
        data.customerName || 'Customer',
        data.issueDate || now.split('T')[0],
        data.expiryDate || now.split('T')[0],
        subtotal,
        taxTotal,
        data.discount || 0,
        totalAmount,
        data.status || 'DRAFT',
        publicToken,
        now,
      ]
    );

    // Save initial revision 0
    await db.query(
      `INSERT INTO estimate_revisions (id, organization_id, estimate_id, revision_number, change_summary, snapshot, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `rev-${Date.now()}`,
        orgId,
        id,
        0,
        'Initial Estimate Creation',
        JSON.stringify({ estimateNumber: estNumber, lineItems: data.lineItems, totalAmount }),
        data.createdBy || 'System',
        now,
      ]
    );

    return {
      id,
      organizationId: orgId,
      estimateNumber: estNumber,
      revisionNumber: 0,
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      issueDate: data.issueDate || now.split('T')[0],
      expiryDate: data.expiryDate || now.split('T')[0],
      subtotal,
      taxTotal,
      discount: data.discount || 0,
      totalAmount,
      status: (data.status as any) || 'DRAFT',
      lineItems: data.lineItems || [],
      publicToken,
    };
  }

  public static async reviseEstimate(
    orgId: string,
    estimateId: string,
    changeSummary: string,
    newData: Partial<EstimateModel>,
    user: string = 'Admin'
  ): Promise<EstimateModel> {
    const estRes = await db.query(`SELECT * FROM estimates WHERE organization_id = $1 AND id = $2`, [orgId, estimateId]);
    if (estRes.rows.length === 0) throw new Error('Estimate not found');
    const existing = estRes.rows[0];

    const nextRev = (existing.revision_number || 0) + 1;
    const now = new Date().toISOString();

    const { subtotal, taxTotal, totalAmount } = SalesService.calculateTotals(newData.lineItems || existing.line_items || [], newData.discount || existing.discount || 0);

    await db.query(
      `UPDATE estimates
       SET revision_number = $1, subtotal = $2, tax_total = $3, discount = $4, total_amount = $5, status = $6
       WHERE organization_id = $7 AND id = $8`,
      [nextRev, subtotal, taxTotal, newData.discount || 0, totalAmount, newData.status || existing.status, orgId, estimateId]
    );

    await db.query(
      `INSERT INTO estimate_revisions (id, organization_id, estimate_id, revision_number, change_summary, snapshot, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `rev-${Date.now()}`,
        orgId,
        estimateId,
        nextRev,
        changeSummary,
        JSON.stringify({ lineItems: newData.lineItems, totalAmount, changeSummary }),
        user,
        now,
      ]
    );

    return {
      ...existing,
      revisionNumber: nextRev,
      totalAmount,
      status: newData.status || existing.status,
    };
  }

  // -------------------------------------------------------------
  // 3. SALES ORDERS & PARTIAL INVOICING
  // -------------------------------------------------------------
  public static async createSalesOrder(orgId: string, data: Partial<SalesOrderModel>): Promise<SalesOrderModel> {
    const id = data.id || `so-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const soNumber = data.salesOrderNumber || `SO-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const { subtotal, taxTotal, totalAmount } = SalesService.calculateTotals(data.lineItems || [], data.discount || 0);

    await db.query(
      `INSERT INTO sales_orders (id, organization_id, sales_order_number, estimate_id, customer_id, customer_name, customer_snapshot, order_date, expected_delivery, subtotal, tax_total, discount, total_amount, fulfilled_amount, invoiced_amount, status, line_items, project_id, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
      [
        id,
        orgId,
        soNumber,
        data.estimateId || null,
        data.customerId,
        data.customerName || '',
        JSON.stringify(data.customerSnapshot || {}),
        data.orderDate || now.split('T')[0],
        data.expectedDelivery || null,
        subtotal,
        taxTotal,
        data.discount || 0,
        totalAmount,
        0,
        0,
        data.status || 'CONFIRMED',
        JSON.stringify(data.lineItems || []),
        data.projectId || null,
        data.notes || '',
        now,
      ]
    );

    // If converted from Estimate, update estimate status
    if (data.estimateId) {
      await db.query(`UPDATE estimates SET status = 'CONVERTED' WHERE organization_id = $1 AND id = $2`, [orgId, data.estimateId]);
    }

    return {
      id,
      organizationId: orgId,
      salesOrderNumber: soNumber,
      estimateId: data.estimateId,
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      orderDate: data.orderDate || now.split('T')[0],
      subtotal,
      taxTotal,
      discount: data.discount || 0,
      totalAmount,
      fulfilledAmount: 0,
      invoicedAmount: 0,
      status: (data.status as any) || 'CONFIRMED',
      lineItems: data.lineItems || [],
    };
  }

  // -------------------------------------------------------------
  // 4. INVOICE CREATION & POSTING
  // -------------------------------------------------------------
  public static async createAndPostInvoice(orgId: string, data: Partial<InvoiceModel>): Promise<InvoiceModel> {
    // 1. Period lock validation
    await SalesEngine.checkPeriodLock(orgId, data.issueDate || new Date().toISOString().split('T')[0]);

    const id = data.id || `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const invNumber = data.invoiceNumber || `INV-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const items = data.lineItems || (data as any).items || [];
    const calculated = SalesService.calculateTotals(items, data.discount || 0);
    const subtotal = data.subtotal !== undefined ? data.subtotal : calculated.subtotal;
    const taxTotal = data.taxTotal !== undefined ? data.taxTotal : calculated.taxTotal;
    const totalAmount = data.totalAmount !== undefined ? data.totalAmount : calculated.totalAmount;

    const roundOff = data.roundOffAmount || 0;
    const finalTotal = Math.round((totalAmount + roundOff) * 100) / 100;
    const isPosted = data.status !== 'DRAFT';

    let journalEntryId: string | undefined = undefined;

    if (isPosted) {
      // Create GL Posting: Dr Accounts Receivable, Cr Sales Revenue, Cr Output Tax, Dr/Cr Round-Off
      const arAccountId = 'acc-ar-control';
      const salesAccountId = 'acc-sales-rev';
      const taxAccountId = 'acc-gst-output';
      const roundOffAccountId = 'acc-roundoff';

      const journalLines: any[] = [
        {
          accountId: arAccountId,
          accountCode: '1100',
          accountName: 'Accounts Receivable',
          debit: finalTotal,
          credit: 0,
          description: `Invoice ${invNumber} Receivable`,
        },
        {
          accountId: salesAccountId,
          accountCode: '4000',
          accountName: 'Sales Revenue',
          debit: 0,
          credit: subtotal - (data.discount || 0),
          description: `Invoice ${invNumber} Revenue`,
        },
      ];

      if (taxTotal > 0) {
        journalLines.push({
          accountId: taxAccountId,
          accountCode: '2100',
          accountName: 'GST Output Liability',
          debit: 0,
          credit: taxTotal,
          description: `Invoice ${invNumber} Tax`,
        });
      }

      if (roundOff !== 0) {
        if (roundOff > 0) {
          journalLines.push({
            accountId: roundOffAccountId,
            accountCode: '5900',
            accountName: 'Round-Off Expense',
            debit: roundOff,
            credit: 0,
            description: `Invoice ${invNumber} Rounding`,
          });
        } else {
          journalLines.push({
            accountId: roundOffAccountId,
            accountCode: '4900',
            accountName: 'Round-Off Income',
            debit: 0,
            credit: Math.abs(roundOff),
            description: `Invoice ${invNumber} Rounding`,
          });
        }
      }

      journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        `JE-${invNumber}`,
        data.issueDate || now.split('T')[0],
        invNumber,
        `Posted Invoice ${invNumber} for ${data.customerName}`,
        journalLines
      );
    }

    const status = isPosted ? 'POSTED' : 'DRAFT';

    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, sales_order_id, estimate_id, client_id, client_name, client_email, project_id, issue_date, due_date, subtotal, tax_total, discount, total_amount, paid_amount, balance_due, status, notes, line_items, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        id,
        orgId,
        invNumber,
        data.salesOrderId || null,
        data.estimateId || null,
        data.customerId,
        data.customerName || '',
        data.customerEmail || '',
        data.projectId || null,
        data.issueDate || now.split('T')[0],
        data.dueDate || now.split('T')[0],
        subtotal,
        taxTotal,
        data.discount || 0,
        finalTotal,
        0,
        finalTotal,
        status,
        data.notes || '',
        JSON.stringify(items),
        now,
      ]
    );

    // Save line items
    for (const item of items) {
      let verifiedItemId: string | null = null;
      const candidateId = item.itemId || item.itemIdRef;
      if (candidateId) {
        try {
          const master = await ItemMasterService.getItem(orgId, candidateId);
          if (master && master.organizationId === orgId) {
            verifiedItemId = master.id;
          }
        } catch {
          verifiedItemId = null;
        }
      }

      await db.query(
        `INSERT INTO invoice_items (id, organization_id, invoice_id, description, account_id, quantity, unit_price, tax_rate, amount, item_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          `item-${Date.now()}-${Math.random()}`,
          orgId,
          id,
          item.description || item.name || 'Item',
          item.accountId || 'acc-sales-rev',
          item.quantity || 1,
          item.unitPrice || item.rate || 0,
          item.taxRate || 0,
          item.amount || (item.quantity || 1) * (item.unitPrice || item.rate || 0),
          verifiedItemId,
        ]
      );
    }

    // Update Sales Order partial invoicing if linked
    if (data.salesOrderId) {
      const soRes = await db.query(`SELECT * FROM sales_orders WHERE organization_id = $1 AND id = $2`, [orgId, data.salesOrderId]);
      if (soRes.rows.length > 0) {
        const so = soRes.rows[0];
        const newInvoiced = Number(so.invoiced_amount || 0) + finalTotal;
        const soTotal = Number(so.total_amount || 0);

        let newSoStatus = 'PARTIALLY_INVOICED';
        if (newInvoiced >= soTotal) {
          newSoStatus = 'INVOICED';
        }

        await db.query(
          `UPDATE sales_orders SET invoiced_amount = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
          [newInvoiced, newSoStatus, orgId, data.salesOrderId]
        );
      }
    }

    return {
      id,
      organizationId: orgId,
      invoiceNumber: invNumber,
      salesOrderId: data.salesOrderId,
      estimateId: data.estimateId,
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      issueDate: data.issueDate || now.split('T')[0],
      dueDate: data.dueDate || now.split('T')[0],
      subtotal,
      taxTotal,
      discount: data.discount || 0,
      roundOffAmount: roundOff,
      totalAmount: finalTotal,
      paidAmount: 0,
      balanceDue: finalTotal,
      status: status as any,
      lineItems: items,
      journalEntryId,
    };
  }

  // -------------------------------------------------------------
  // 5. PAYMENTS RECEIVED & MULTI-INVOICE ALLOCATION
  // -------------------------------------------------------------
  public static async recordPayment(
    orgId: string,
    payload: {
      customerId: string;
      customerName: string;
      paymentDate: string;
      amount: number;
      paymentMode: string;
      depositToAccountId: string;
      reference?: string;
      notes?: string;
      allocations: { invoiceId: string; amount: number }[];
    }
  ): Promise<{ paymentId: string; unallocatedAmount: number }> {
    await SalesEngine.checkPeriodLock(orgId, payload.paymentDate);

    const paymentId = `pmt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const paymentNum = `PAY-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const totalAllocated = payload.allocations.reduce((sum, a) => sum + a.amount, 0);
    const unallocatedAmount = Math.max(0, Math.round((payload.amount - totalAllocated) * 100) / 100);

    // GL Posting for Payment:
    // Dr Bank Account: payload.amount
    // Cr Accounts Receivable: totalAllocated
    // Cr Customer Advances Liability: unallocatedAmount (if any)
    const journalLines: any[] = [
      {
        accountId: payload.depositToAccountId,
        accountCode: '1010',
        accountName: 'Bank / Cash Account',
        debit: payload.amount,
        credit: 0,
        description: `Payment ${paymentNum} received from ${payload.customerName}`,
      },
    ];

    if (totalAllocated > 0) {
      journalLines.push({
        accountId: 'acc-ar-control',
        accountCode: '1100',
        accountName: 'Accounts Receivable',
        debit: 0,
        credit: totalAllocated,
        description: `Payment ${paymentNum} allocated to invoices`,
      });
    }

    if (unallocatedAmount > 0) {
      journalLines.push({
        accountId: 'acc-customer-advances',
        accountCode: '2200',
        accountName: 'Customer Advances Liability',
        debit: 0,
        credit: unallocatedAmount,
        description: `Unallocated Customer Advance for ${payload.customerName}`,
      });
    }

    await SalesEngine.persistJournalEntry(
      orgId,
      `JE-${paymentNum}`,
      payload.paymentDate,
      paymentNum,
      `Payment Received ${paymentNum}`,
      journalLines
    );

    // Persist Payment
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, reference, notes, unallocated_amount, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        paymentId,
        orgId,
        paymentNum,
        payload.customerId,
        payload.customerName,
        payload.paymentDate,
        payload.amount,
        payload.paymentMode,
        payload.depositToAccountId,
        payload.reference || '',
        payload.notes || '',
        unallocatedAmount,
        unallocatedAmount > 0 ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED',
        now,
      ]
    );

    // Process each allocation
    for (const alloc of payload.allocations) {
      if (alloc.amount <= 0) continue;

      await db.query(
        `INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [`alloc-${Date.now()}-${Math.random()}`, orgId, paymentId, alloc.invoiceId, alloc.amount]
      );

      // Update Invoice paid_amount and balance_due
      const invRes = await db.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, alloc.invoiceId]);
      if (invRes.rows.length > 0) {
        const inv = invRes.rows[0];
        const newPaid = Math.round((Number(inv.paid_amount || 0) + alloc.amount) * 100) / 100;
        const newBal = Math.max(0, Math.round((Number(inv.total_amount || 0) - newPaid - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);

        let newStatus = 'PARTIALLY_PAID';
        if (newBal === 0) newStatus = 'PAID';

        await db.query(
          `UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
          [newPaid, newBal, newStatus, orgId, alloc.invoiceId]
        );
      }
    }

    // Save Customer Advance record if unallocated
    if (unallocatedAmount > 0) {
      await db.query(
        `INSERT INTO customer_advances (id, organization_id, customer_id, payment_id, amount, unapplied_amount, received_date, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [`adv-${Date.now()}`, orgId, payload.customerId, paymentId, unallocatedAmount, unallocatedAmount, payload.paymentDate, 'UNAPPLIED', now]
      );
    }

    return { paymentId, unallocatedAmount };
  }

  // -------------------------------------------------------------
  // 6. CUSTOMER ADVANCES & APPLICATIONS
  // -------------------------------------------------------------
  public static async applyAdvanceToInvoice(
    orgId: string,
    advanceId: string,
    invoiceId: string,
    amountToApply: number,
    applyDate: string
  ): Promise<{ appliedAmount: number; invoiceRemainingBalance: number }> {
    await SalesEngine.checkPeriodLock(orgId, applyDate);

    const advRes = await db.query(`SELECT * FROM customer_advances WHERE organization_id = $1 AND id = $2`, [orgId, advanceId]);
    if (advRes.rows.length === 0) throw new Error('Customer Advance not found');
    const adv = advRes.rows[0];

    const availableAdv = Number(adv.unapplied_amount);
    if (amountToApply > availableAdv) throw new Error(`Cannot apply ${amountToApply}: exceeds available advance balance ${availableAdv}`);

    const invRes = await db.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, invoiceId]);
    if (invRes.rows.length === 0) throw new Error('Invoice not found');
    const inv = invRes.rows[0];

    if (adv.customer_id && inv.customer_id && adv.customer_id !== inv.customer_id) {
      throw new Error('CROSS_CUSTOMER_ALLOCATION: Cannot apply customer advance across different customers');
    }

    const currentBal = Number(inv.balance_due);
    const actualApplied = Math.min(amountToApply, currentBal);

    // GL Entry: Dr Customer Advances Liability, Cr Accounts Receivable
    const journalLines = [
      {
        accountId: 'acc-customer-advances',
        accountCode: '2200',
        accountName: 'Customer Advances Liability',
        debit: actualApplied,
        credit: 0,
        description: `Apply Advance to Invoice ${inv.invoice_number}`,
      },
      {
        accountId: 'acc-ar-control',
        accountCode: '1100',
        accountName: 'Accounts Receivable',
        debit: 0,
        credit: actualApplied,
        description: `Advance Applied to Invoice ${inv.invoice_number}`,
      },
    ];

    await SalesEngine.persistJournalEntry(
      orgId,
      `JE-ADV-${Date.now()}`,
      applyDate,
      inv.invoice_number,
      `Advance Applied to Invoice ${inv.invoice_number}`,
      journalLines
    );

    // Update advance record
    const newUnapplied = Math.round((availableAdv - actualApplied) * 100) / 100;
    await db.query(
      `UPDATE customer_advances SET unapplied_amount = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
      [newUnapplied, newUnapplied === 0 ? 'APPLIED' : 'PARTIALLY_APPLIED', orgId, advanceId]
    );

    // Update invoice balance
    const newPaid = Math.round((Number(inv.paid_amount) + actualApplied) * 100) / 100;
    const newBal = Math.max(0, Math.round((currentBal - actualApplied) * 100) / 100);
    const newStatus = newBal === 0 ? 'PAID' : 'PARTIALLY_PAID';

    await db.query(
      `UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
      [newPaid, newBal, newStatus, orgId, invoiceId]
    );

    return { appliedAmount: actualApplied, invoiceRemainingBalance: newBal };
  }

  // -------------------------------------------------------------
  // 7. CREDIT NOTES & APPLICATIONS
  // -------------------------------------------------------------
  public static async createCreditNote(
    orgId: string,
    payload: {
      customerId: string;
      customerName: string;
      invoiceId?: string;
      date: string;
      taxableAmount: number;
      taxAmount: number;
      reason?: string;
    }
  ): Promise<{ creditNoteId: string; totalAmount: number }> {
    await SalesEngine.checkPeriodLock(orgId, payload.date);

    const id = `cn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const cnNumber = `CN-${Math.floor(10000 + Math.random() * 90000)}`;
    const totalAmount = Math.round((payload.taxableAmount + payload.taxAmount) * 100) / 100;
    const now = new Date().toISOString();

    // GL Posting for Credit Note:
    // Dr Sales / Revenue (taxableAmount)
    // Dr GST Output Liability Reversal (taxAmount)
    // Cr Accounts Receivable (totalAmount)
    const journalLines: any[] = [
      {
        accountId: 'acc-sales-rev',
        accountCode: '4000',
        accountName: 'Sales Revenue Reversal',
        debit: payload.taxableAmount,
        credit: 0,
        description: `Credit Note ${cnNumber} Revenue Reversal`,
      },
    ];

    if (payload.taxAmount > 0) {
      journalLines.push({
        accountId: 'acc-gst-output',
        accountCode: '2100',
        accountName: 'GST Output Tax Reversal',
        debit: payload.taxAmount,
        credit: 0,
        description: `Credit Note ${cnNumber} Tax Reversal`,
      });
    }

    journalLines.push({
      accountId: 'acc-ar-control',
      accountCode: '1100',
      accountName: 'Accounts Receivable',
      debit: 0,
      credit: totalAmount,
      description: `Credit Note ${cnNumber} AR Reduction`,
    });

    await SalesEngine.persistJournalEntry(
      orgId,
      `JE-${cnNumber}`,
      payload.date,
      cnNumber,
      `Credit Note ${cnNumber} Created`,
      journalLines
    );

    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, orgId, cnNumber, payload.customerId, payload.customerName, payload.date, totalAmount, totalAmount, 'Open', payload.reason || '', now]
    );

    // If assigned directly against an invoice, auto-apply to invoice
    if (payload.invoiceId) {
      await SalesEngine.applyCreditNoteToInvoice(orgId, id, payload.invoiceId, totalAmount, payload.date);
    }

    return { creditNoteId: id, totalAmount };
  }

  public static async applyCreditNoteToInvoice(
    orgId: string,
    creditNoteId: string,
    invoiceId: string,
    amountToApply: number,
    applyDate: string
  ): Promise<{ appliedAmount: number; remainingCreditNoteBalance: number }> {
    await SalesEngine.checkPeriodLock(orgId, applyDate);

    const cnRes = await db.query(`SELECT * FROM credit_notes WHERE organization_id = $1 AND id = $2`, [orgId, creditNoteId]);
    if (cnRes.rows.length === 0) throw new Error('Credit Note not found');
    const cn = cnRes.rows[0];

    const availableCredit = Number(cn.remaining_credit);
    if (amountToApply > availableCredit) throw new Error(`Amount ${amountToApply} exceeds remaining credit ${availableCredit}`);

    const invRes = await db.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, invoiceId]);
    if (invRes.rows.length === 0) throw new Error('Invoice not found');
    const inv = invRes.rows[0];

    if (cn.customer_id && inv.customer_id && cn.customer_id !== inv.customer_id) {
      throw new Error('CROSS_CUSTOMER_ALLOCATION: Cannot apply credit note across different customers');
    }

    const actualApplied = Math.min(amountToApply, Number(inv.balance_due));

    // Application record
    await db.query(
      `INSERT INTO credit_note_applications (id, organization_id, credit_note_id, invoice_id, amount_applied, applied_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`cna-${Date.now()}`, orgId, creditNoteId, invoiceId, actualApplied, applyDate]
    );

    // Update Credit Note
    const newRemCredit = Math.round((availableCredit - actualApplied) * 100) / 100;
    await db.query(
      `UPDATE credit_notes SET remaining_credit = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
      [newRemCredit, newRemCredit === 0 ? 'Closed' : 'Open', orgId, creditNoteId]
    );

    // Update Invoice balance
    const currentCredited = Number(inv.amount_credited || 0);
    const newCredited = Math.round((currentCredited + actualApplied) * 100) / 100;
    const newBal = Math.max(0, Math.round((Number(inv.total_amount) - Number(inv.paid_amount) - newCredited - Number(inv.amount_written_off || 0)) * 100) / 100);

    await db.query(
      `UPDATE invoices SET amount_credited = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
      [newCredited, newBal, newBal === 0 ? 'PAID' : 'PARTIALLY_PAID', orgId, invoiceId]
    );

    return { appliedAmount: actualApplied, remainingCreditNoteBalance: newRemCredit };
  }

  // -------------------------------------------------------------
  // 8. REFUNDS & WRITE-OFFS
  // -------------------------------------------------------------
  public static async recordRefund(
    orgId: string,
    payload: {
      customerId: string;
      creditNoteId?: string;
      refundDate: string;
      amount: number;
      refundAccountId: string;
      reference?: string;
      notes?: string;
    }
  ): Promise<{ refundId: string }> {
    await SalesEngine.checkPeriodLock(orgId, payload.refundDate);

    const refundId = `ref-${Date.now()}`;
    const refundNum = `REF-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    // GL Entry: Dr Customer Credit / Liability, Cr Bank Account
    const journalLines = [
      {
        accountId: 'acc-customer-advances',
        accountCode: '2200',
        accountName: 'Customer Credit Liability',
        debit: payload.amount,
        credit: 0,
        description: `Customer Refund ${refundNum}`,
      },
      {
        accountId: payload.refundAccountId,
        accountCode: '1010',
        accountName: 'Bank Account',
        debit: 0,
        credit: payload.amount,
        description: `Customer Refund ${refundNum}`,
      },
    ];

    await SalesEngine.persistJournalEntry(
      orgId,
      `JE-${refundNum}`,
      payload.refundDate,
      refundNum,
      `Customer Refund ${refundNum}`,
      journalLines
    );

    if (payload.creditNoteId) {
      await db.query(
        `UPDATE credit_notes SET remaining_credit = remaining_credit - $1, status = CASE WHEN remaining_credit - $1 = 0 THEN 'Refunded' ELSE status END WHERE organization_id = $2 AND id = $3`,
        [payload.amount, orgId, payload.creditNoteId]
      );
    }

    await db.query(
      `INSERT INTO customer_refunds (id, organization_id, refund_number, customer_id, credit_note_id, refund_date, amount, refund_account_id, reference, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [refundId, orgId, refundNum, payload.customerId, payload.creditNoteId || null, payload.refundDate, payload.amount, payload.refundAccountId, payload.reference || '', payload.notes || '', now]
    );

    return { refundId };
  }

  public static async recordWriteOff(
    orgId: string,
    payload: {
      invoiceId: string;
      customerId: string;
      writeOffDate: string;
      amount: number;
      writeOffAccountId: string;
      reason: string;
      userId?: string;
    }
  ): Promise<{ writeOffId: string }> {
    await SalesEngine.checkPeriodLock(orgId, payload.writeOffDate);

    const invRes = await db.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2`, [orgId, payload.invoiceId]);
    if (invRes.rows.length === 0) throw new Error('Invoice not found');
    const inv = invRes.rows[0];

    const writeOffId = `wo-${Date.now()}`;
    const now = new Date().toISOString();

    // GL Posting: Dr Bad Debt / Write-Off Expense, Cr Accounts Receivable
    const journalLines = [
      {
        accountId: payload.writeOffAccountId,
        accountCode: '5800',
        accountName: 'Bad Debt Expense',
        debit: payload.amount,
        credit: 0,
        description: `Write off invoice ${inv.invoice_number}`,
      },
      {
        accountId: 'acc-ar-control',
        accountCode: '1100',
        accountName: 'Accounts Receivable',
        debit: 0,
        credit: payload.amount,
        description: `Write off invoice ${inv.invoice_number}`,
      },
    ];

    await SalesEngine.persistJournalEntry(
      orgId,
      `JE-WO-${Date.now()}`,
      payload.writeOffDate,
      inv.invoice_number,
      `Write off invoice ${inv.invoice_number}`,
      journalLines
    );

    // Update invoice record
    const newWrittenOff = Math.round((Number(inv.amount_written_off || 0) + payload.amount) * 100) / 100;
    const newBal = Math.max(0, Math.round((Number(inv.total_amount) - Number(inv.paid_amount) - Number(inv.amount_credited || 0) - newWrittenOff) * 100) / 100);

    await db.query(
      `UPDATE invoices SET amount_written_off = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
      [newWrittenOff, newBal, newBal === 0 ? 'WRITTEN_OFF' : inv.status, orgId, payload.invoiceId]
    );

    await db.query(
      `INSERT INTO ar_write_offs (id, organization_id, invoice_id, customer_id, write_off_date, amount, write_off_account_id, reason, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [writeOffId, orgId, payload.invoiceId, payload.customerId, payload.writeOffDate, payload.amount, payload.writeOffAccountId, payload.reason, payload.userId || 'Admin', now]
    );

    return { writeOffId };
  }

  // -------------------------------------------------------------
  // 9. AR SUBLEDGER & RECONCILIATION VERIFIER
  // -------------------------------------------------------------
  public static async verifyARIntegrity(orgId: string): Promise<{
    customerSubledgerTotal: number;
    arControlGLBalance: number;
    difference: number;
    isValid: boolean;
    isBalanced: boolean;
    details: any;
  }> {
    // 1. Calculate sum of open unpaid invoice balances
    const invRes = await db.query(
      `SELECT COALESCE(SUM(balance_due), 0) as open_invoices_balance
       FROM invoices
       WHERE organization_id = $1 AND status NOT IN ('VOID', 'DRAFT')`,
      [orgId]
    );
    const openInvoicesBal = Number(invRes.rows[0].open_invoices_balance || 0);

    // 2. Subtract unused credit note balances
    const cnRes = await db.query(
      `SELECT COALESCE(SUM(remaining_credit), 0) as open_credits
       FROM credit_notes
       WHERE organization_id = $1 AND status = 'Open'`,
      [orgId]
    );
    const openCredits = Number(cnRes.rows[0].open_credits || 0);

    // 3. Subtract unapplied customer advances
    const advRes = await db.query(
      `SELECT COALESCE(SUM(unapplied_amount), 0) as open_advances
       FROM customer_advances
       WHERE organization_id = $1 AND status = 'UNAPPLIED'`,
      [orgId]
    );
    const openAdvances = Number(advRes.rows[0].open_advances || 0);

    const customerSubledgerTotal = Math.round((openInvoicesBal - openCredits - openAdvances) * 100) / 100;

    // 4. Fetch GL Accounts Receivable Control Account balance from posted journal lines
    const jlRes = await db.query(
      `SELECT COALESCE(SUM(debit - credit), 0) as gl_bal
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1 AND (jl.account_id = 'acc-ar-control' OR jl.account_code = '1100' OR LOWER(jl.account_name) LIKE '%receivable%')`,
      [orgId]
    );

    let arControlGLBalance = Number(jlRes.rows[0].gl_bal || 0);
    if (arControlGLBalance === 0) {
      const accRes = await db.query(
        `SELECT balance FROM accounts WHERE organization_id = $1 AND (id = 'acc-ar-control' OR code = '1100' OR type = 'Accounts Receivable')`,
        [orgId]
      );
      if (accRes.rows.length > 0) {
        arControlGLBalance = Number(accRes.rows[0].balance || 0);
      }
    }

    const difference = Math.abs(Math.round((customerSubledgerTotal - arControlGLBalance) * 100) / 100);
    console.log('[verifyARIntegrity]', { openInvoicesBal, openCredits, openAdvances, customerSubledgerTotal, arControlGLBalance, difference });

    return {
      customerSubledgerTotal,
      arControlGLBalance,
      difference,
      isValid: difference < 0.01,
      isBalanced: difference < 0.01,
      details: {
        openInvoicesBal,
        openCredits,
        openAdvances,
      },
    };
  }

  // -------------------------------------------------------------
  // 10. RECEIVABLE AGING ENGINE
  // -------------------------------------------------------------
  public static async getARAgingReport(orgId: string, asOfDate: string = new Date().toISOString().split('T')[0]): Promise<any[]> {
    const invRes = await db.query(
      `SELECT i.id, i.client_id, i.client_name, i.invoice_number, i.due_date, i.balance_due
       FROM invoices i
       WHERE i.organization_id = $1 AND i.balance_due > 0 AND i.status != 'VOIDED' AND i.issue_date <= $2`,
      [orgId, asOfDate]
    );

    const agingMap: Record<string, { customerId: string; customerName: string; current: number; b1_30: number; b31_60: number; b61_90: number; b90_plus: number; total: number }> = {};

    const asOf = new Date(asOfDate).getTime();

    for (const inv of invRes.rows) {
      const custId = inv.client_id || 'unknown';
      if (!agingMap[custId]) {
        agingMap[custId] = {
          customerId: custId,
          customerName: inv.client_name,
          current: 0,
          b1_30: 0,
          b31_60: 0,
          b61_90: 0,
          b90_plus: 0,
          total: 0,
        };
      }

      const dueDate = new Date(inv.due_date).getTime();
      const diffDays = Math.floor((asOf - dueDate) / (1000 * 60 * 60 * 24));
      const bal = Number(inv.balance_due);

      if (diffDays <= 0) {
        agingMap[custId].current += bal;
      } else if (diffDays <= 30) {
        agingMap[custId].b1_30 += bal;
      } else if (diffDays <= 60) {
        agingMap[custId].b31_60 += bal;
      } else if (diffDays <= 90) {
        agingMap[custId].b61_90 += bal;
      } else {
        agingMap[custId].b90_plus += bal;
      }

      agingMap[custId].total += bal;
    }

    return Object.values(agingMap);
  }
}
