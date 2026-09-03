import { db } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import type { QueryClient } from '../accounting/postingEngine';
import { AccountingService } from '../../../src/services/accountingService';
import { SalesService } from '../../../src/services/salesService';
import { PeriodLock } from '../../../src/types';
import { newId } from '../utils/ids';
import { isIsoCalendarDate } from '../utils/date';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

function calculateTrustedInvoiceTotals(
  sourceItems: any[],
  overallDiscountInput: unknown,
  isGstInclusive: boolean,
  roundOffInput: unknown
): { items: any[]; subtotal: number; taxTotal: number; discount: number; roundOff: number; totalAmount: number } {
  if (!Array.isArray(sourceItems) || sourceItems.length === 0) throw new Error('Invoice requires at least one line item');
  if (sourceItems.length > 1000) throw new Error('Invoice cannot contain more than 1000 line items');

  let subtotal = 0;
  const netLines: number[] = [];
  const items = sourceItems.map((source, index) => {
    const quantity = Number(source.quantity ?? source.qty ?? 1);
    const unitPrice = Number(source.unitPrice ?? source.rate ?? source.unit_price ?? 0);
    const taxRate = Number(source.taxRate ?? source.tax_rate ?? 0);
    const discountPercent = Number(source.discountPercent || 0);
    if (!(source.description || source.name || source.itemName) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      throw new Error(`Invoice line ${index + 1} contains an invalid description, quantity, rate, discount, or tax rate`);
    }

    const gross = roundMoney(quantity * unitPrice);
    if (!Number.isSafeInteger(Math.round(gross * 100))) throw new Error(`Invoice line ${index + 1} exceeds the supported monetary range`);
    let discountAmount = Number(source.discountAmount || 0);
    if (!Number.isFinite(discountAmount) || discountAmount < 0 || Math.abs(discountAmount * 100 - Math.round(discountAmount * 100)) > 1e-7) {
      throw new Error(`Invoice line ${index + 1} discount must be a non-negative amount with no more than two decimals`);
    }
    if (discountAmount === 0 && discountPercent > 0) discountAmount = roundMoney(gross * discountPercent / 100);
    if (discountAmount > gross) throw new Error(`Invoice line ${index + 1} discount exceeds its gross amount`);
    const net = roundMoney(gross - discountAmount);
    netLines.push(net);
    subtotal = roundMoney(subtotal + net);
    return {
      ...source,
      description: source.description || source.name || source.itemName,
      quantity,
      unitPrice,
      rate: unitPrice,
      taxRate,
      discountPercent,
      discountAmount,
    };
  });

  const discount = Number(overallDiscountInput || 0);
  const roundOff = Number(roundOffInput || 0);
  if (!Number.isFinite(discount) || discount < 0 || Math.abs(discount * 100 - Math.round(discount * 100)) > 1e-7 || discount > subtotal) {
    throw new Error('Invoice discount must be a non-negative two-decimal amount no greater than subtotal');
  }
  if (!Number.isFinite(roundOff) || Math.abs(roundOff * 100 - Math.round(roundOff * 100)) > 1e-7 || Math.abs(roundOff) >= 1) {
    throw new Error('Invoice round-off must be a two-decimal amount between -0.99 and 0.99');
  }

  const allocations = new Array(items.length).fill(0);
  if (discount > 0 && subtotal > 0) {
    let allocated = 0;
    const remainders = netLines
      .map((net, index) => {
        const exact = net / subtotal * discount;
        const floor = Math.min(net, Math.floor(exact * 100) / 100);
        allocations[index] = floor;
        allocated = roundMoney(allocated + floor);
        return { index, remainder: exact - floor, capacity: roundMoney(net - floor) };
      })
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
    let cents = Math.round((discount - allocated) * 100);
    let cursor = 0;
    while (cents > 0 && remainders.length > 0) {
      const candidate = remainders[cursor % remainders.length];
      if (candidate.capacity >= 0.01) {
        allocations[candidate.index] = roundMoney(allocations[candidate.index] + 0.01);
        candidate.capacity = roundMoney(candidate.capacity - 0.01);
        cents -= 1;
      }
      cursor += 1;
      if (cursor > remainders.length * 100000) throw new Error('Invoice discount allocation could not be reconciled');
    }
  }

  let taxTotal = 0;
  items.forEach((item, index) => {
    const afterDocumentDiscount = roundMoney(netLines[index] - allocations[index]);
    const taxableAmount = isGstInclusive && item.taxRate > 0
      ? roundMoney(afterDocumentDiscount / (1 + item.taxRate / 100))
      : afterDocumentDiscount;
    const taxAmount = isGstInclusive
      ? roundMoney(afterDocumentDiscount - taxableAmount)
      : roundMoney(taxableAmount * item.taxRate / 100);
    taxTotal = roundMoney(taxTotal + taxAmount);
    item.allocatedOverallDiscount = allocations[index];
    item.taxableAmount = taxableAmount;
    item.taxAmount = taxAmount;
    item.amount = taxableAmount;
    item.totalAmount = isGstInclusive ? afterDocumentDiscount : roundMoney(taxableAmount + taxAmount);
    item.lineTotal = item.totalAmount;
  });

  const totalAmount = isGstInclusive
    ? roundMoney(subtotal - discount + roundOff)
    : roundMoney(subtotal - discount + taxTotal + roundOff);
  if (totalAmount <= 0) throw new Error('Invoice total must be positive');
  return { items, subtotal, taxTotal, discount, roundOff, totalAmount };
}

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
  roundOffAmount?: number;
  isGstInclusive?: boolean;
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
  isGstInclusive?: boolean;
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
  createdBy?: string;
  createdAt?: string;
}

export class SalesEngine {
  // Helper for checking Period Lock
  private static async checkPeriodLock(orgId: string, dateStr: string, transactionClient?: QueryClient): Promise<void> {
    const client = transactionClient || db;
    const lockRes = await client.query(
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
    lines: any[],
    transactionClient?: QueryClient
  ): Promise<string> {
    const queryClient: QueryClient = transactionClient || db;
    const accountIdentifiers = Array.from(new Set(
      lines.flatMap((line) => [line.accountId, line.accountCode].filter(Boolean))
    ));

    const accountsMap = new Map<string, { id: string; code: string; name: string }>();
    if (accountIdentifiers.length > 0) {
      const accRes = await queryClient.query(
        `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND (id = ANY($2::text[]) OR code = ANY($2::text[]))`,
        [orgId, accountIdentifiers]
      );
      for (const row of accRes.rows) {
        accountsMap.set(row.id, row);
        accountsMap.set(row.code, row);
      }
    }

    const resolvedLines: any[] = [];
    for (const line of lines) {
      const matched = (line.accountId && accountsMap.get(line.accountId)) || (line.accountCode && accountsMap.get(line.accountCode));
      const accId = matched ? matched.id : line.accountId;
      const accCode = matched ? matched.code : line.accountCode;
      const accName = matched ? matched.name : line.accountName;
      resolvedLines.push({ ...line, accountId: accId, accountCode: accCode, accountName: accName });
    }

    const postRes = await ServerPostingEngine.postEntry({
      organizationId: orgId,
      entryNumber,
      date,
      reference,
      description,
      lines: resolvedLines,
    }, transactionClient);

    return postRes.entryId;
  }

  // -------------------------------------------------------------
  // 1. CUSTOMER MASTER & SNAPSHOTTING
  // -------------------------------------------------------------
  public static async createCustomer(
    orgId: string,
    data: Partial<CustomerMaster>,
    transactionClient?: QueryClient
  ): Promise<CustomerMaster> {
    if (
      Number(data.openingBalance || 0) !== 0 || Number(data.receivablesBalance || 0) !== 0 ||
      Number(data.unusedCredits || 0) !== 0 || Number(data.advanceBalance || 0) !== 0
    ) throw new Error('Customer balances must be established through balanced financial transactions');
    const displayName = data.displayName || (data as any).name;
    if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 255) throw new Error('Customer display name is required and cannot exceed 255 characters');
    if (data.legalName !== undefined && (typeof data.legalName !== 'string' || data.legalName.length > 255)) throw new Error('Customer legal name cannot exceed 255 characters');
    if (data.customerType && !['Business', 'Individual'].includes(data.customerType)) throw new Error('Customer type is invalid');
    if (data.gstStatus && !['Registered', 'Unregistered', 'Composition', 'SEZ'].includes(data.gstStatus)) throw new Error('Customer GST status is invalid');
    if (data.email && (typeof data.email !== 'string' || data.email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) throw new Error('Customer email is invalid');
    if (data.phone && (typeof data.phone !== 'string' || data.phone.length > 50)) throw new Error('Customer phone is invalid');
    if (data.currency && (typeof data.currency !== 'string' || !/^[A-Za-z]{3}$/.test(data.currency))) throw new Error('Customer currency must be a three-letter code');
    const creditLimit = Number(data.creditLimit || 0);
    if (!Number.isFinite(creditLimit) || creditLimit < 0 || !Number.isSafeInteger(Math.round(creditLimit * 100)) || Math.abs(creditLimit * 100 - Math.round(creditLimit * 100)) > 1e-7) throw new Error('Customer credit limit must be a safe non-negative two-decimal amount');
    if (data.priceListId) throw new Error('Customer price-list references are not enabled until the price-list registry is certified');
    if (data.notes && (typeof data.notes !== 'string' || data.notes.length > 10000)) throw new Error('Customer notes cannot exceed 10000 characters');
    const encodedMetadata = JSON.stringify({ billingAddress: data.billingAddress, shippingAddresses: data.shippingAddresses, primaryContact: data.primaryContact, additionalContacts: data.additionalContacts, taxPreferences: data.taxPreferences, attachments: data.attachments });
    if (Buffer.byteLength(encodedMetadata, 'utf8') > 100_000) throw new Error('Customer metadata cannot exceed 100 KB');
    data = {
      ...data,
      displayName: displayName.trim(),
      legalName: data.legalName?.trim(),
      email: data.email?.trim().toLowerCase(),
      phone: data.phone?.trim(),
      currency: data.currency?.toUpperCase(),
      creditLimit,
    };
    // API callers never control internal or display identifiers.
    const id = newId('cust');
    const custId = newId('CUST');
    const now = new Date().toISOString();
    let resolvedCurrency = '';

    const persistCustomer = async (client: QueryClient) => {
    const organization = await client.query(
      `SELECT base_currency FROM organizations WHERE id = $1`,
      [orgId]
    );
    const baseCurrency = String(organization.rows[0]?.base_currency || '');
    if (!/^[A-Z]{3}$/.test(baseCurrency)) throw new Error('Organization base currency is not configured');
    resolvedCurrency = baseCurrency;
    if (data.currency && data.currency !== baseCurrency) {
      throw new Error('Foreign-currency customers require the audited exchange-rate workflow');
    }
    if (data.defaultSalesAccountId) {
      const salesAccount = await client.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND id = $2 AND status = 'Active' AND type = 'Income'`,
        [orgId, data.defaultSalesAccountId]
      );
      if (salesAccount.rows.length !== 1) throw new Error('Default sales account must be an active income account in this organization');
    }
    if (data.salespersonId) {
      const salesperson = await client.query(`SELECT id FROM salespersons WHERE organization_id = $1 AND id = $2`, [orgId, data.salespersonId]);
      if (salesperson.rows.length !== 1) throw new Error('Customer salesperson does not belong to this organization');
    }
    await client.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, customer_type, gst_status, gstin, pan, billing_address, shipping_addresses, place_of_supply, primary_contact, additional_contacts, email, phone, currency, payment_terms, credit_limit, price_list_id, tax_preferences, default_sales_account_id, salesperson_id, notes, attachments, active, opening_balance, receivables_balance, unused_credits, advance_balance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)`,
      [
        id,
        orgId,
        custId,
        data.displayName,
        data.legalName || data.displayName,
        data.customerType || 'Business',
        data.gstStatus || 'Unregistered',
        data.gstin || '',
        data.pan || '',
        JSON.stringify(data.billingAddress || {}),
        JSON.stringify(data.shippingAddresses || []),
        data.placeOfSupply || '',
        JSON.stringify(data.primaryContact || {}),
        JSON.stringify(data.additionalContacts || []),
        data.email || '',
        data.phone || '',
        baseCurrency,
        data.paymentTerms || 'Net 30',
        data.creditLimit || 0,
        null,
        JSON.stringify(data.taxPreferences || {}),
        data.defaultSalesAccountId || null,
        data.salespersonId || null,
        data.notes || '',
        JSON.stringify(data.attachments || []),
        data.active !== undefined ? data.active : true,
        0,
        0,
        0,
        0,
        now,
      ]
    );

    // Keep the compatibility clients projection in the same transaction.
      await client.query(
        `INSERT INTO clients (id, organization_id, name, company_name, email, phone, billing_address, tax_id, currency, payment_terms, receivables_balance, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET name = $3, email = $5`,
        [
          id,
          orgId,
          data.displayName,
          data.legalName || '',
          data.email || '',
          data.phone || '',
          typeof data.billingAddress === 'string' ? data.billingAddress : JSON.stringify(data.billingAddress || ''),
          data.gstin || '',
          baseCurrency,
          data.paymentTerms || 'Net 30',
          0,
          now,
        ]
      );
    };
    if (transactionClient) await persistCustomer(transactionClient);
    else await db.transaction(persistCustomer);

    return {
      id,
      organizationId: orgId,
      customerId: custId,
      displayName: data.displayName!,
      legalName: data.legalName,
      email: data.email,
      phone: data.phone,
      gstin: data.gstin,
      currency: resolvedCurrency,
      receivablesBalance: 0,
      openingBalance: 0,
    };
  }

  public static async getCustomerSummary(orgId: string, customerId: string): Promise<any> {
    const custRes = await db.query(`SELECT * FROM customers WHERE organization_id = $1 AND id = $2`, [orgId, customerId]);
    let c = custRes.rows[0];
    if (custRes.rows.length === 0) {
      const clientRes = await db.query(`SELECT * FROM clients WHERE organization_id = $1 AND id = $2`, [orgId, customerId]);
      if (clientRes.rows.length === 0) return null;
      const client = clientRes.rows[0];
      c = {
        id: client.id,
        display_name: client.name,
        legal_name: client.company_name,
        email: client.email,
        gstin: client.tax_id,
      };
    }

    // Authoritative calculation from DB documents
    const invRes = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total_sales,
              COALESCE(SUM(balance_due), 0) as outstanding,
              COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE AND balance_due > 0 THEN balance_due ELSE 0 END), 0) as overdue
       FROM invoices
       WHERE organization_id = $1
         AND (client_id = $2 OR customer_id = $2)
         AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [orgId, customerId]
    );

    const cnRes = await db.query(
      `SELECT COALESCE(SUM(remaining_credit), 0) as unused_credits
         FROM credit_notes
        WHERE organization_id = $1 AND client_id = $2
          AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'CLOSED', 'APPLIED')`,
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
      receivablesBalance: Number(invRes.rows[0].outstanding),
      unusedCredits: Number(cnRes.rows[0].unused_credits),
      advancePayments: Number(advRes.rows[0].advance_balance),
    };
  }

  // -------------------------------------------------------------
  // 2. ESTIMATES & REVISIONS
  // -------------------------------------------------------------
  public static async createEstimate(orgId: string, data: Partial<EstimateModel> & { publicToken?: string }): Promise<EstimateModel & { publicToken: string }> {
    const now = new Date().toISOString();
    const issueDate = data.issueDate || now.split('T')[0];
    const id = newId('est');
    const estNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'ESTIMATE', issueDate);
    const publicToken = newId('pub');

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
        issueDate,
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
        newId('rev'),
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
        newId('rev'),
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
  public static async createSalesOrder(
    orgId: string,
    data: Partial<SalesOrderModel>,
    transactionClient?: QueryClient,
    actorId: string = 'system'
  ): Promise<SalesOrderModel> {
    const id = newId('so');
    const orderDate = data.orderDate || new Date().toISOString().split('T')[0];
    if (!isIsoCalendarDate(orderDate)) throw new Error('Sales order date must be a real YYYY-MM-DD calendar date');
    if (data.expectedDelivery && (!isIsoCalendarDate(data.expectedDelivery) || data.expectedDelivery < orderDate)) {
      throw new Error('Expected delivery must be a valid date on or after the order date');
    }
    const requestedStatus = String(data.status || 'CONFIRMED').toUpperCase();
    if (!['DRAFT', 'CONFIRMED'].includes(requestedStatus)) throw new Error('A new sales order may only be DRAFT or CONFIRMED');
    if (data.notes && data.notes.length > 10000) throw new Error('Sales order notes cannot exceed 10000 characters');
    const soNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'SALES_ORDER', orderDate);
    const now = new Date().toISOString();

    const commercial = calculateTrustedInvoiceTotals(
      data.lineItems || [],
      data.discount || 0,
      Boolean(data.isGstInclusive),
      data.roundOffAmount || 0
    );
    const { items, subtotal, taxTotal, discount, roundOff, totalAmount } = commercial;
    if (!data.customerId) {
      throw new Error('A sales order requires a tenant customer and at least one positive-value line item');
    }

    let resolvedCustomerName = '';
    let resolvedCustomerSnapshot: any = null;
    const persistSalesOrder = async (client: QueryClient) => {
      let customer = await client.query(
        `SELECT id, display_name AS name, legal_name, email, phone, gstin, pan, billing_address, place_of_supply
           FROM customers WHERE organization_id = $1 AND id = $2`,
        [orgId, data.customerId]
      );
      if (customer.rows.length === 0) {
        customer = await client.query(
          `SELECT id, name, company_name AS legal_name, email, phone, tax_id AS gstin, billing_address
             FROM clients WHERE organization_id = $1 AND id = $2`,
          [orgId, data.customerId]
        );
      }
      if (customer.rows.length === 0) throw new Error('Sales order customer does not belong to this organization');
      resolvedCustomerName = customer.rows[0].name || 'Customer';
      resolvedCustomerSnapshot = {
        customerId: data.customerId,
        displayName: resolvedCustomerName,
        legalName: customer.rows[0].legal_name || resolvedCustomerName,
        email: customer.rows[0].email || '',
        phone: customer.rows[0].phone || '',
        gstin: customer.rows[0].gstin || '',
        pan: customer.rows[0].pan || '',
        billingAddress: customer.rows[0].billing_address || null,
        placeOfSupply: customer.rows[0].place_of_supply || null,
      };
      if (data.projectId) {
        const project = await client.query(`SELECT id FROM projects WHERE organization_id = $1 AND id = $2`, [orgId, data.projectId]);
        if (project.rows.length !== 1) throw new Error('Sales order project does not belong to this organization');
      }
      if (data.estimateId) {
        const estimate = await client.query(
          `SELECT id, COALESCE(customer_id, client_id) AS customer_id, status
             FROM estimates WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, data.estimateId]
        );
        if (estimate.rows.length !== 1) throw new Error('Sales order source quotation does not belong to this organization');
        if (estimate.rows[0].customer_id && estimate.rows[0].customer_id !== data.customerId) throw new Error('Sales order customer does not match its source quotation');
        if (!['DRAFT', 'SENT', 'ACCEPTED'].includes(String(estimate.rows[0].status).toUpperCase())) throw new Error('Source quotation is not convertible');
        const existingTarget = await client.query(
          `SELECT id FROM sales_orders WHERE organization_id = $1 AND estimate_id = $2
           UNION ALL SELECT id FROM invoices WHERE organization_id = $1 AND estimate_id = $2`,
          [orgId, data.estimateId]
        );
        if (existingTarget.rows.length > 0) throw new Error('Source quotation has already been converted');
      }
      for (const item of items) {
        const itemId = item.itemId || item.itemIdRef;
        if (itemId) {
          const master = await client.query(
            `SELECT id FROM items WHERE organization_id = $1 AND id = $2 AND is_active = TRUE`,
            [orgId, itemId]
          );
          if (master.rows.length !== 1) throw new Error(`Sales order item ${itemId} does not belong to this organization or is inactive`);
        }
      }
      await client.query(
        `INSERT INTO sales_orders (id, organization_id, sales_order_number, estimate_id, customer_id, customer_name, customer_snapshot, order_date, expected_delivery, subtotal, tax_total, discount, round_off_amount, is_gst_inclusive, total_amount, fulfilled_amount, invoiced_amount, status, line_items, project_id, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          id, orgId, soNumber, data.estimateId || null, data.customerId,
          resolvedCustomerName, JSON.stringify(resolvedCustomerSnapshot), orderDate,
          data.expectedDelivery || null, subtotal, taxTotal, discount, roundOff,
          Boolean(data.isGstInclusive), totalAmount, 0, 0, requestedStatus,
          JSON.stringify(items), data.projectId || null, data.notes || '', now,
        ]
      );

      // Conversion and target insertion are one transaction and one target.
      if (data.estimateId) {
        await client.query(`UPDATE estimates SET status = 'CONVERTED' WHERE organization_id = $1 AND id = $2`, [orgId, data.estimateId]);
      }

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'SALES_ORDER_CREATED', 'SalesOrder', $4, $5)`,
        [newId('aud'), orgId, actorId, id, JSON.stringify({ salesOrderNumber: soNumber, totalAmount, estimateId: data.estimateId || null })]
      );
    };
    if (transactionClient) await persistSalesOrder(transactionClient);
    else await db.transaction(persistSalesOrder);

    return {
      id,
      organizationId: orgId,
      salesOrderNumber: soNumber,
      estimateId: data.estimateId,
      customerId: data.customerId || '',
      customerName: resolvedCustomerName,
      customerSnapshot: resolvedCustomerSnapshot,
      orderDate,
      subtotal,
      taxTotal,
      discount,
      roundOffAmount: roundOff,
      isGstInclusive: Boolean(data.isGstInclusive),
      totalAmount,
      fulfilledAmount: 0,
      invoicedAmount: 0,
      status: requestedStatus as SalesOrderModel['status'],
      lineItems: items,
    };
  }

  // -------------------------------------------------------------
  // 4. INVOICE CREATION & POSTING
  // -------------------------------------------------------------
  public static async createAndPostInvoice(
    orgId: string,
    data: Partial<InvoiceModel>,
    transactionClient?: QueryClient
  ): Promise<InvoiceModel> {
    const id = data.id || newId('inv');
    const now = new Date().toISOString();
    const issueDate = data.issueDate || now.split('T')[0];
    let invNumber = data.invoiceNumber || '';
    const dueDate = data.dueDate || issueDate;
    if (!isIsoCalendarDate(issueDate) || !isIsoCalendarDate(dueDate) || dueDate < issueDate) {
      throw new Error('Invoice issue and due dates must be valid YYYY-MM-DD values with due date on or after issue date');
    }

    const isGstInclusive = Boolean(data.isGstInclusive);
    const commercial = calculateTrustedInvoiceTotals(
      data.lineItems || (data as any).items || [],
      data.discount || 0,
      isGstInclusive,
      data.roundOffAmount || 0
    );
    const items = commercial.items;
    const subtotal = commercial.subtotal;
    const taxTotal = commercial.taxTotal;
    const roundOff = commercial.roundOff;
    const finalTotal = commercial.totalAmount;
    const invoiceDiscount = commercial.discount;
    const isPosted = data.status !== 'DRAFT';

    let journalEntryId: string | undefined = undefined;
    let resolvedCustomerName = '';
    let resolvedCustomerEmail = '';
    let resolvedCustomerSnapshot: any = null;
    let currentStatus = isPosted ? 'POSTED' : 'DRAFT';

    const persistInvoice = async (client: QueryClient) => {
      await SalesEngine.checkPeriodLock(orgId, issueDate, client);
      invNumber = invNumber || await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', issueDate, undefined, client);
      const customerId = data.customerId || (data as any).clientId;
      if (!customerId) throw new Error('Invoice customer is required');
      let customer = await client.query(
        `SELECT id, display_name AS name, legal_name, email, phone, gstin, pan, billing_address, place_of_supply
           FROM customers WHERE organization_id = $1 AND id = $2`,
        [orgId, customerId]
      );
      if (customer.rows.length === 0) {
        customer = await client.query(
          `SELECT id, name, company_name AS legal_name, email, phone, tax_id AS gstin, billing_address
             FROM clients WHERE organization_id = $1 AND id = $2`,
          [orgId, customerId]
        );
      }
      if (customer.rows.length === 0) throw new Error('Invoice customer does not belong to this organization');
      resolvedCustomerName = customer.rows[0].name || data.customerName || 'Customer';
      resolvedCustomerEmail = customer.rows[0].email || data.customerEmail || '';
      resolvedCustomerSnapshot = {
        customerId,
        displayName: resolvedCustomerName,
        legalName: customer.rows[0].legal_name || resolvedCustomerName,
        email: resolvedCustomerEmail,
        phone: customer.rows[0].phone || '',
        gstin: customer.rows[0].gstin || '',
        pan: customer.rows[0].pan || '',
        billingAddress: customer.rows[0].billing_address || null,
        placeOfSupply: customer.rows[0].place_of_supply || null,
      };
      if (data.projectId) {
        const project = await client.query(`SELECT id FROM projects WHERE organization_id = $1 AND id = $2`, [orgId, data.projectId]);
        if (project.rows.length !== 1) throw new Error('Invoice project does not belong to this organization');
      }
      if (data.estimateId) {
        const estimate = await client.query(
          `SELECT id, COALESCE(customer_id, client_id) AS customer_id, customer_snapshot
             FROM estimates WHERE organization_id = $1 AND id = $2`,
          [orgId, data.estimateId]
        );
        if (estimate.rows.length !== 1) throw new Error('Invoice source quotation does not belong to this organization');
        if (estimate.rows[0].customer_id && estimate.rows[0].customer_id !== customerId) throw new Error('Invoice customer does not match its source quotation');
        resolvedCustomerSnapshot = typeof estimate.rows[0].customer_snapshot === 'string'
          ? JSON.parse(estimate.rows[0].customer_snapshot)
          : estimate.rows[0].customer_snapshot || resolvedCustomerSnapshot;
      }
      let sourceSalesOrder: any = null;
      if (data.salesOrderId) {
        const soRes = await client.query(
          `SELECT * FROM sales_orders WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, data.salesOrderId]
        );
        if (soRes.rows.length !== 1) throw new Error('Invoice sales order does not belong to this organization');
        sourceSalesOrder = soRes.rows[0];
        if (sourceSalesOrder.customer_id !== customerId) throw new Error('Invoice customer does not match its source sales order');
        const remaining = roundMoney(Number(sourceSalesOrder.total_amount || 0) - Number(sourceSalesOrder.invoiced_amount || 0));
        if (remaining <= 0 || finalTotal - remaining > 0.009) throw new Error('Invoice amount exceeds the uninvoiced sales order balance');
      }
      const defaultRevenueId = await OrganizationProvisioningService.resolveSystemAccountId(client, orgId, 'SALES_REVENUE', ['Income', 'Revenue']);

      // Validate and resolve every line before the first journal/document write.
      const validatedLines: Array<{
        item: any;
        quantity: number;
        unitPrice: number;
        taxRate: number;
        lineAmount: number;
        verifiedItemId: string | null;
        lineAccountId: string;
      }> = [];
      for (const item of items) {
        const quantity = Number(item.quantity ?? 1);
        const unitPrice = Number(item.unitPrice ?? item.rate ?? 0);
        const taxRate = Number(item.taxRate || 0);
        const lineAmount = Number(item.amount ?? quantity * unitPrice);
        if (!(item.description || item.name) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100 || !Number.isFinite(lineAmount) || lineAmount < 0) {
          throw new Error('Every invoice line requires a description, positive quantity, and valid non-negative amounts');
        }
        let verifiedItemId: string | null = null;
        const candidateId = item.itemId || item.itemIdRef;
        if (candidateId) {
          const master = await client.query(
            `SELECT id FROM items WHERE organization_id = $1 AND id = $2 AND is_active = TRUE`,
            [orgId, candidateId]
          );
          verifiedItemId = master.rows[0]?.id || null;
          if (item.itemId && !verifiedItemId) throw new Error(`Invoice item ${item.itemId} does not belong to this organization or is inactive`);
        }
        let lineAccountId = defaultRevenueId;
        if (item.accountId) {
          const lineAccount = await client.query(
            `SELECT id, code, type FROM accounts WHERE organization_id = $1 AND id = $2 AND status = 'Active'`,
            [orgId, item.accountId]
          );
          if (lineAccount.rows.length !== 1) throw new Error(`Invoice line account ${item.accountId} does not belong to this organization or is inactive`);
          if (lineAccount.rows[0].id !== defaultRevenueId || !['Income', 'Revenue'].includes(lineAccount.rows[0].type)) {
            throw new Error('Certified invoice posting currently requires the configured sales revenue account on every line');
          }
          lineAccountId = lineAccount.rows[0].id;
        }
        validatedLines.push({ item, quantity, unitPrice, taxRate, lineAmount, verifiedItemId, lineAccountId });
      }

      if ((data as any)?.approvedDraftId) {
        throw new Error('APPROVED_DRAFT_ID_FORBIDDEN: approvedDraftId is deprecated and forbidden. Use the dedicated postApprovedInvoice endpoint.');
      }

      const requiresApproval = await ApprovalWorkflowService.requiresApproval(orgId, 'INVOICE', finalTotal, client);
      currentStatus = isPosted ? 'POSTED' : 'DRAFT';
      if (requiresApproval) {
        currentStatus = 'SUBMITTED';
      }

      if (currentStatus === 'POSTED') {
        // Create GL Posting: Dr Accounts Receivable, Cr Sales Revenue, Cr Output Tax, Dr/Cr Round-Off
        const arAccountId = await OrganizationProvisioningService.resolveAccountId(client, orgId, '1100', ['Asset']);
        const salesAccountId = defaultRevenueId;
        const taxAccountId = taxTotal > 0
          ? await OrganizationProvisioningService.resolveAccountId(client, orgId, '2200', ['Liability'])
          : '';

        const isGstInclusive = Boolean(data.isGstInclusive);
        const preTaxRevenue = isGstInclusive
          ? Math.round((subtotal - invoiceDiscount - taxTotal) * 100) / 100
          : Math.round((subtotal - invoiceDiscount) * 100) / 100;

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
            credit: preTaxRevenue,
            description: `Invoice ${invNumber} Revenue`,
          },
        ];

        if (taxTotal > 0) {
          journalLines.push({
            accountId: taxAccountId,
            accountCode: '2200',
            accountName: 'GST Output Liability',
            debit: 0,
            credit: taxTotal,
            description: `Invoice ${invNumber} Tax`,
          });
        }

        if (roundOff !== 0) {
          if (roundOff > 0) {
            journalLines.push({
              accountId: await OrganizationProvisioningService.resolveAccountId(client, orgId, '4900', ['Income', 'Revenue']),
              accountCode: '4900',
              accountName: 'Round-Off Income',
              debit: 0,
              credit: roundOff,
              description: `Invoice ${invNumber} Rounding`,
            });
          } else {
            journalLines.push({
              accountId: await OrganizationProvisioningService.resolveAccountId(client, orgId, '5900', ['Expense']),
              accountCode: '5900',
              accountName: 'Round-Off Expense',
              debit: Math.abs(roundOff),
              credit: 0,
              description: `Invoice ${invNumber} Rounding`,
            });
          }
        }

        journalEntryId = await SalesEngine.persistJournalEntry(
          orgId,
          `JE-${invNumber}`,
          issueDate,
          invNumber,
          `Posted Invoice ${invNumber} for ${resolvedCustomerName}`,
          journalLines,
          client
        );
      }

      await client.query(
        `INSERT INTO invoices (id, organization_id, invoice_number, sales_order_id, estimate_id, client_id, customer_id, client_name, client_email, project_id, issue_date, due_date, subtotal, tax_total, discount, round_off_amount, total_amount, paid_amount, balance_due, status, notes, line_items, customer_snapshot, is_gst_inclusive, journal_entry_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          id,
          orgId,
          invNumber,
          data.salesOrderId || null,
          data.estimateId || null,
          data.customerId || (data as any).clientId || null,
          data.customerId || (data as any).clientId || null,
          resolvedCustomerName,
          resolvedCustomerEmail,
          data.projectId || null,
          data.issueDate || now.split('T')[0],
          dueDate,
          subtotal,
          taxTotal,
          invoiceDiscount,
          roundOff,
          finalTotal,
          0,
          finalTotal,
          currentStatus,
          data.notes || '',
          JSON.stringify(items),
          resolvedCustomerSnapshot ? JSON.stringify(resolvedCustomerSnapshot) : null,
          Boolean(data.isGstInclusive),
          journalEntryId || null,
          now,
        ]
      );

      // Save line items
      for (const { item, quantity, unitPrice, taxRate, lineAmount, verifiedItemId, lineAccountId } of validatedLines) {
        await client.query(
          `INSERT INTO invoice_items (id, organization_id, invoice_id, description, account_id, quantity, unit_price, tax_rate, amount, item_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            newId('item'),
            orgId,
            id,
            item.description || item.name || 'Item',
            lineAccountId,
            quantity,
            unitPrice,
            taxRate,
            lineAmount,
            verifiedItemId,
          ]
        );
      }

      if (currentStatus === 'SUBMITTED') {
        await ApprovalWorkflowService.submitForApproval(orgId, 'INVOICE', id, data.createdBy || 'system', finalTotal, client);
      } else if (currentStatus === 'POSTED') {
        // Update Sales Order partial invoicing if linked
        if (data.salesOrderId && sourceSalesOrder) {
          const so = sourceSalesOrder;
          const newInvoiced = Number(so.invoiced_amount || 0) + finalTotal;
          const soTotal = Number(so.total_amount || 0);
          const newSoStatus = newInvoiced >= soTotal ? 'INVOICED' : 'PARTIALLY_INVOICED';
          await client.query(
            `UPDATE sales_orders SET invoiced_amount = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
            [newInvoiced, newSoStatus, orgId, data.salesOrderId]
          );
        }

        if (customerId) {
          await client.query(
            `UPDATE customers SET receivables_balance = receivables_balance + $1 WHERE organization_id = $2 AND id = $3`,
            [finalTotal, orgId, customerId]
          );
        }
      }

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, $4, 'Invoice', $5, $6)`,
        [
          newId('aud'),
          orgId,
          data.createdBy || 'system',
          currentStatus === 'POSTED' ? 'INVOICE_POSTED' : (currentStatus === 'SUBMITTED' ? 'INVOICE_SUBMITTED' : 'INVOICE_DRAFT_CREATED'),
          id,
          JSON.stringify({ invoiceNumber: invNumber, totalAmount: finalTotal, journalEntryId: journalEntryId || null }),
        ]
      );
    };

    if (transactionClient) await persistInvoice(transactionClient);
    else await db.transaction(persistInvoice);

    return {
      id,
      organizationId: orgId,
      invoiceNumber: invNumber,
      salesOrderId: data.salesOrderId,
      estimateId: data.estimateId,
      customerId: data.customerId || (data as any).clientId || '',
      customerName: resolvedCustomerName,
      customerEmail: resolvedCustomerEmail,
      customerSnapshot: resolvedCustomerSnapshot,
      projectId: data.projectId || undefined,
      issueDate,
      dueDate,
      subtotal,
      taxTotal,
      discount: invoiceDiscount,
      roundOffAmount: roundOff,
      isGstInclusive: Boolean(data.isGstInclusive),
      totalAmount: finalTotal,
      paidAmount: 0,
      balanceDue: finalTotal,
      status: currentStatus as any,
      lineItems: items,
      notes: data.notes || '',
      journalEntryId,
    };
  }

  public static async updateInvoice(
    orgId: string,
    invoiceId: string,
    data: {
      customerId?: string;
      clientId?: string;
      customerName?: string;
      clientName?: string;
      customerEmail?: string;
      clientEmail?: string;
      projectId?: string;
      salespersonId?: string;
      issueDate?: string;
      dueDate?: string;
      lineItems?: any[];
      items?: any[];
      discount?: number;
      roundOffAmount?: number;
      isGstInclusive?: boolean;
      notes?: string;
      terms?: string;
      editReason?: string;
    },
    userId: string,
    transactionClient?: QueryClient
  ): Promise<InvoiceModel> {
    const execute = async (client: QueryClient) => {
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, invoiceId]
      );
      if (invRes.rows.length === 0) throw new Error('INVOICE_NOT_FOUND: Invoice does not exist');
      const inv = invRes.rows[0];

      if (['VOID', 'VOIDED'].includes(String(inv.status).toUpperCase())) {
        throw new Error('INVOICE_VOIDED: Voided invoices are immutable and cannot be edited');
      }

      const originalIssueDate = inv.issue_date instanceof Date ? inv.issue_date.toISOString().slice(0, 10) : String(inv.issue_date).slice(0, 10);
      const newIssueDate = data.issueDate ? String(data.issueDate).slice(0, 10) : originalIssueDate;
      const originalDueDate = inv.due_date instanceof Date ? inv.due_date.toISOString().slice(0, 10) : String(inv.due_date).slice(0, 10);
      const newDueDate = data.dueDate ? String(data.dueDate).slice(0, 10) : originalDueDate;

      if (!isIsoCalendarDate(newIssueDate) || !isIsoCalendarDate(newDueDate) || newDueDate < newIssueDate) {
        throw new Error('INVOICE_INVALID_DATES: Issue date and due date must be valid ISO calendar dates and due date cannot precede issue date');
      }

      await SalesEngine.checkPeriodLock(orgId, originalIssueDate, client);
      if (newIssueDate !== originalIssueDate) {
        await SalesEngine.checkPeriodLock(orgId, newIssueDate, client);
      }

      const customerId = data.customerId || data.clientId || inv.customer_id || inv.client_id;
      let resolvedCustomerName = inv.client_name;
      let resolvedCustomerEmail = inv.client_email || '';
      let resolvedCustomerSnapshot = inv.customer_snapshot;

      if (customerId && customerId !== (inv.customer_id || inv.client_id)) {
        let customer = await client.query(
          `SELECT id, display_name AS name, legal_name, email, phone, gstin, pan, billing_address, place_of_supply
             FROM customers WHERE organization_id = $1 AND id = $2`,
          [orgId, customerId]
        );
        if (customer.rows.length === 0) {
          customer = await client.query(
            `SELECT id, name, company_name AS legal_name, email, phone, tax_id AS gstin, billing_address
               FROM clients WHERE organization_id = $1 AND id = $2`,
            [orgId, customerId]
          );
        }
        if (customer.rows.length === 0) throw new Error('Invoice customer does not belong to this organization');
        resolvedCustomerName = customer.rows[0].name || data.customerName || data.clientName || 'Customer';
        resolvedCustomerEmail = customer.rows[0].email || data.customerEmail || data.clientEmail || '';
        resolvedCustomerSnapshot = {
          customerId,
          displayName: resolvedCustomerName,
          legalName: customer.rows[0].legal_name || resolvedCustomerName,
          email: resolvedCustomerEmail,
          phone: customer.rows[0].phone || '',
          gstin: customer.rows[0].gstin || '',
          pan: customer.rows[0].pan || '',
          billingAddress: customer.rows[0].billing_address || null,
          placeOfSupply: customer.rows[0].place_of_supply || null,
        };
      }

      const rawItems = data.lineItems || data.items || (typeof inv.line_items === 'string' ? JSON.parse(inv.line_items) : inv.line_items) || [];
      const discountInput = data.discount !== undefined ? data.discount : inv.discount;
      const isGstInclusive = data.isGstInclusive !== undefined ? Boolean(data.isGstInclusive) : Boolean(inv.is_gst_inclusive);
      const roundOffInput = data.roundOffAmount !== undefined ? data.roundOffAmount : inv.round_off_amount;

      const {
        items,
        subtotal,
        taxTotal,
        discount: invoiceDiscount,
        roundOff,
        totalAmount: finalTotal,
      } = calculateTrustedInvoiceTotals(rawItems, discountInput, isGstInclusive, roundOffInput);

      const paidAmount = Number(inv.paid_amount || 0);
      const amountCredited = Number(inv.amount_credited || 0);
      const amountWrittenOff = Number(inv.amount_written_off || 0);

      if (finalTotal < paidAmount) {
        throw new Error(`CANNOT_REDUCE_BELOW_PAID: Invoice total (${finalTotal}) cannot be reduced below the amount already paid (${paidAmount})`);
      }

      const newBalanceDue = roundMoney(Math.max(0, finalTotal - paidAmount - amountCredited - amountWrittenOff));

      let updatedStatus = inv.status;
      if (['POSTED', 'SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'].includes(String(inv.status).toUpperCase())) {
        if (newBalanceDue === 0 && paidAmount > 0) {
          updatedStatus = 'PAID';
        } else if (paidAmount > 0) {
          updatedStatus = 'PARTIALLY_PAID';
        } else if (newDueDate < new Date().toISOString().slice(0, 10)) {
          updatedStatus = 'OVERDUE';
        } else {
          updatedStatus = inv.status === 'DRAFT' ? 'POSTED' : inv.status;
        }
      }

      let currentJournalEntryId = inv.journal_entry_id;
      const isPostedState = ['POSTED', 'SENT', 'VIEWED', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'].includes(String(inv.status).toUpperCase());

      if (isPostedState && currentJournalEntryId) {
        const reverseReason = data.editReason || `Audited adjustment for invoice ${inv.invoice_number}`;
        try {
          await FinancialDestructiveActionsService.reversePostedJournal(
            client,
            orgId,
            currentJournalEntryId,
            userId,
            reverseReason,
            `Invoice ${inv.invoice_number}`
          );
        } catch (revErr: any) {
          console.warn('[Invoice Edit Reversal Warning]', revErr?.message || revErr);
        }

        const defaultRevenueId = await OrganizationProvisioningService.resolveSystemAccountId(client, orgId, 'SALES_REVENUE', ['Income', 'Revenue']);
        const arAccountId = await OrganizationProvisioningService.resolveAccountId(client, orgId, '1100', ['Asset']);
        const salesAccountId = defaultRevenueId;
        const taxAccountId = taxTotal > 0
          ? await OrganizationProvisioningService.resolveAccountId(client, orgId, '2200', ['Liability'])
          : '';

        const preTaxRevenue = isGstInclusive
          ? Math.round((subtotal - invoiceDiscount - taxTotal) * 100) / 100
          : Math.round((subtotal - invoiceDiscount) * 100) / 100;

        const journalLines: any[] = [
          {
            accountId: arAccountId,
            accountCode: '1100',
            accountName: 'Accounts Receivable',
            debit: finalTotal,
            credit: 0,
            description: `Invoice ${inv.invoice_number} Receivable (Revision)`,
          },
          {
            accountId: salesAccountId,
            accountCode: '4000',
            accountName: 'Sales Revenue',
            debit: 0,
            credit: preTaxRevenue,
            description: `Invoice ${inv.invoice_number} Revenue (Revision)`,
          },
        ];

        if (taxTotal > 0) {
          journalLines.push({
            accountId: taxAccountId,
            accountCode: '2200',
            accountName: 'GST Output Liability',
            debit: 0,
            credit: taxTotal,
            description: `Invoice ${inv.invoice_number} Tax (Revision)`,
          });
        }

        if (roundOff !== 0) {
          if (roundOff > 0) {
            journalLines.push({
              accountId: await OrganizationProvisioningService.resolveAccountId(client, orgId, '4900', ['Income', 'Revenue']),
              accountCode: '4900',
              accountName: 'Round-Off Income',
              debit: 0,
              credit: roundOff,
              description: `Invoice ${inv.invoice_number} Rounding (Revision)`,
            });
          } else {
            journalLines.push({
              accountId: await OrganizationProvisioningService.resolveAccountId(client, orgId, '5900', ['Expense']),
              accountCode: '5900',
              accountName: 'Round-Off Expense',
              debit: Math.abs(roundOff),
              credit: 0,
              description: `Invoice ${inv.invoice_number} Rounding (Revision)`,
            });
          }
        }

        currentJournalEntryId = await SalesEngine.persistJournalEntry(
          orgId,
          `JE-${inv.invoice_number}-REV-${Date.now().toString().slice(-4)}`,
          newIssueDate,
          inv.invoice_number,
          `Revised Invoice ${inv.invoice_number} for ${resolvedCustomerName}`,
          journalLines,
          client
        );

        const delta = roundMoney(finalTotal - Number(inv.total_amount));
        if (delta !== 0 && customerId) {
          await client.query(
            `UPDATE customers SET receivables_balance = receivables_balance + $1 WHERE organization_id = $2 AND id = $3`,
            [delta, orgId, customerId]
          );
        }
      }

      const existingHistory = (typeof inv.edit_history === 'string' ? JSON.parse(inv.edit_history) : inv.edit_history) || [];
      const historyEntry = {
        id: `edit-${Date.now()}`,
        editedAt: new Date().toISOString(),
        editedBy: userId,
        reason: (data.editReason || 'Invoice updated').trim(),
        previousTotal: Number(inv.total_amount),
        newTotal: finalTotal,
        changesSummary: `Updated invoice. Amount changed from ${inv.total_amount} to ${finalTotal}.`,
      };
      const updatedHistory = [...existingHistory, historyEntry];

      const newNotes = data.notes !== undefined ? data.notes : inv.notes;
      const newTerms = data.terms !== undefined ? data.terms : inv.terms;
      const newProjectId = data.projectId !== undefined ? data.projectId : inv.project_id;
      const newSalespersonId = data.salespersonId !== undefined ? data.salespersonId : inv.salesperson_id;

      await client.query(
        `UPDATE invoices
            SET customer_id = $1, client_id = $1, client_name = $2, client_email = $3,
                project_id = $4, salesperson_id = $5, issue_date = $6, due_date = $7,
                subtotal = $8, tax_total = $9, discount = $10, round_off_amount = $11,
                total_amount = $12, balance_due = $13, notes = $14, terms = $15,
                line_items = $16, customer_snapshot = $17, is_gst_inclusive = $18,
                journal_entry_id = $19, edit_history = $20, status = $21
          WHERE organization_id = $22 AND id = $23`,
        [
          customerId,
          resolvedCustomerName,
          resolvedCustomerEmail,
          newProjectId || null,
          newSalespersonId || null,
          newIssueDate,
          newDueDate,
          subtotal,
          taxTotal,
          invoiceDiscount,
          roundOff,
          finalTotal,
          newBalanceDue,
          newNotes || '',
          newTerms || '',
          JSON.stringify(items),
          typeof resolvedCustomerSnapshot === 'string' ? resolvedCustomerSnapshot : JSON.stringify(resolvedCustomerSnapshot || null),
          isGstInclusive,
          currentJournalEntryId,
          JSON.stringify(updatedHistory),
          updatedStatus,
          orgId,
          invoiceId,
        ]
      );

      await client.query(`DELETE FROM invoice_items WHERE organization_id = $1 AND invoice_id = $2`, [orgId, invoiceId]);
      for (const it of items) {
        const lineQty = Number(it.quantity ?? 1);
        const lineUnitPrice = Number(it.unitPrice ?? it.rate ?? 0);
        const lineTax = Number(it.taxRate ?? 0);
        const lineAmt = Number(it.amount ?? lineQty * lineUnitPrice);
        await client.query(
          `INSERT INTO invoice_items (id, organization_id, invoice_id, description, account_id, quantity, unit_price, tax_rate, amount, item_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            newId('ii'),
            orgId,
            invoiceId,
            it.description || it.name || 'Line Item',
            it.accountId || null,
            lineQty,
            lineUnitPrice,
            lineTax,
            lineAmt,
            it.itemId || null,
          ]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'INVOICE_UPDATED', 'Invoice', $4, $5, $6)`,
        [
          newId('aud'),
          orgId,
          userId,
          invoiceId,
          JSON.stringify({ totalAmount: inv.total_amount, status: inv.status, balanceDue: inv.balance_due }),
          JSON.stringify({ totalAmount: finalTotal, status: updatedStatus, balanceDue: newBalanceDue, editReason: data.editReason }),
        ]
      );

      return {
        id: invoiceId,
        organizationId: orgId,
        invoiceNumber: inv.invoice_number,
        customerId,
        customerName: resolvedCustomerName,
        customerEmail: resolvedCustomerEmail,
        customerSnapshot: resolvedCustomerSnapshot,
        projectId: newProjectId || undefined,
        salespersonId: newSalespersonId || undefined,
        issueDate: newIssueDate,
        dueDate: newDueDate,
        subtotal,
        taxTotal,
        discount: invoiceDiscount,
        roundOffAmount: roundOff,
        isGstInclusive,
        totalAmount: finalTotal,
        paidAmount,
        balanceDue: newBalanceDue,
        status: updatedStatus as any,
        lineItems: items,
        notes: newNotes || '',
        paymentTerms: newTerms || '',
        journalEntryId: currentJournalEntryId,
      };
    };

    if (transactionClient) return execute(transactionClient);
    return db.transaction(execute);
  }

  public static async postApprovedInvoice(
    orgId: string,
    userId: string,
    invoiceId: string,
    transactionClient?: QueryClient
  ): Promise<InvoiceModel> {
    const execute = async (client: QueryClient) => {
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, invoiceId]
      );
      if (invRes.rows.length === 0) throw new Error('INVOICE_NOT_FOUND: Invoice does not exist');
      const inv = invRes.rows[0];
      if (inv.status === 'POSTED' || inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') {
        throw new Error('INVOICE_ALREADY_POSTED: Invoice is already posted');
      }
      if (inv.status !== 'SUBMITTED') {
        throw new Error(`INVOICE_NOT_SUBMITTED: Invoice has status '${inv.status}', expected 'SUBMITTED'`);
      }

      // Atomically consume approval
      await ApprovalWorkflowService.consumeApproval(orgId, 'INVOICE', invoiceId, client);

      const issueDate = inv.issue_date instanceof Date ? inv.issue_date.toISOString().split('T')[0] : String(inv.issue_date).split('T')[0];
      await SalesEngine.checkPeriodLock(orgId, issueDate, client);

      const finalTotal = Number(inv.total_amount || 0);
      const subtotal = Number(inv.subtotal || 0);
      const taxTotal = Number(inv.tax_total || 0);
      const invoiceDiscount = Number(inv.discount || 0);
      const roundOff = Number(inv.round_off_amount || 0);
      const isGstInclusive = Boolean(inv.is_gst_inclusive);
      const customerId = inv.customer_id || inv.client_id;
      const resolvedCustomerName = inv.client_name || 'Customer';

      const arAccountId = await OrganizationProvisioningService.resolveSystemAccountId(client, orgId, 'AR_CONTROL', ['Asset']);
      const salesAccountId = await OrganizationProvisioningService.resolveSystemAccountId(client, orgId, 'SALES_REVENUE', ['Income', 'Revenue']);
      const taxAccountId = taxTotal > 0
        ? await OrganizationProvisioningService.resolveAccountId(client, orgId, '2200', ['Liability'])
        : '';

      const preTaxRevenue = isGstInclusive
        ? Math.round((subtotal - invoiceDiscount - taxTotal) * 100) / 100
        : Math.round((subtotal - invoiceDiscount) * 100) / 100;

      const journalLines: any[] = [
        {
          accountId: arAccountId,
          accountCode: '1100',
          accountName: 'Accounts Receivable',
          debit: finalTotal,
          credit: 0,
          description: `Invoice ${inv.invoice_number} Receivable`,
        },
        {
          accountId: salesAccountId,
          accountCode: '4000',
          accountName: 'Sales Revenue',
          debit: 0,
          credit: preTaxRevenue,
          description: `Invoice ${inv.invoice_number} Revenue`,
        },
      ];

      if (taxTotal > 0) {
        journalLines.push({
          accountId: taxAccountId,
          accountCode: '2200',
          accountName: 'GST Output Liability',
          debit: 0,
          credit: taxTotal,
          description: `Invoice ${inv.invoice_number} Tax`,
        });
      }

      if (roundOff !== 0) {
        if (roundOff > 0) {
          journalLines.push({
            accountId: await OrganizationProvisioningService.resolveAccountId(client, orgId, '4900', ['Income', 'Revenue']),
            accountCode: '4900',
            accountName: 'Round-Off Income',
            debit: 0,
            credit: roundOff,
            description: `Invoice ${inv.invoice_number} Rounding`,
          });
        } else {
          journalLines.push({
            accountId: await OrganizationProvisioningService.resolveAccountId(client, orgId, '5900', ['Expense']),
            accountCode: '5900',
            accountName: 'Round-Off Expense',
            debit: Math.abs(roundOff),
            credit: 0,
            description: `Invoice ${inv.invoice_number} Rounding`,
          });
        }
      }

      const journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        `JE-${inv.invoice_number}`,
        issueDate,
        inv.invoice_number,
        `Posted Invoice ${inv.invoice_number} for ${resolvedCustomerName}`,
        journalLines,
        client
      );

      await client.query(
        `UPDATE invoices SET status = 'POSTED', journal_entry_id = $1 WHERE organization_id = $2 AND id = $3`,
        [journalEntryId, orgId, invoiceId]
      );

      if (inv.sales_order_id) {
        const soRes = await client.query(
          `SELECT * FROM sales_orders WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, inv.sales_order_id]
        );
        if (soRes.rows.length === 1) {
          const so = soRes.rows[0];
          const newInvoiced = Number(so.invoiced_amount || 0) + finalTotal;
          const soTotal = Number(so.total_amount || 0);
          const newSoStatus = newInvoiced >= soTotal ? 'INVOICED' : 'PARTIALLY_INVOICED';
          await client.query(
            `UPDATE sales_orders SET invoiced_amount = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
            [newInvoiced, newSoStatus, orgId, inv.sales_order_id]
          );
        }
      }

      if (customerId) {
        await client.query(
          `UPDATE customers SET receivables_balance = receivables_balance + $1 WHERE organization_id = $2 AND id = $3`,
          [finalTotal, orgId, customerId]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'INVOICE_POSTED', 'Invoice', $4, $5)`,
        [newId('aud'), orgId, userId, invoiceId, JSON.stringify({ invoiceNumber: inv.invoice_number, totalAmount: finalTotal, journalEntryId })]
      );

      const itemsRes = await client.query(
        `SELECT * FROM invoice_items WHERE invoice_id = $1`,
        [invoiceId]
      );

      return {
        id: inv.id,
        organizationId: inv.organization_id,
        invoiceNumber: inv.invoice_number,
        salesOrderId: inv.sales_order_id,
        estimateId: inv.estimate_id,
        customerId: inv.customer_id || inv.client_id,
        customerName: inv.client_name,
        customerEmail: inv.client_email,
        projectId: inv.project_id,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        subtotal: Number(inv.subtotal),
        taxTotal: Number(inv.tax_total),
        discount: Number(inv.discount),
        roundOffAmount: Number(inv.round_off_amount || 0),
        isGstInclusive: Boolean(inv.is_gst_inclusive),
        totalAmount: Number(inv.total_amount),
        paidAmount: Number(inv.paid_amount || 0),
        balanceDue: Number(inv.balance_due || inv.total_amount),
        status: 'POSTED' as any,
        lineItems: itemsRes.rows,
        notes: inv.notes,
        journalEntryId,
      };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
  }

  // -------------------------------------------------------------
  // 5. PAYMENTS RECEIVED & MULTI-INVOICE ALLOCATION
  // -------------------------------------------------------------
  public static async recordPayment(
    orgId: string,
    payload: {
      customerId?: string;
      clientId?: string;
      customerName?: string;
      clientName?: string;
      paymentDate: string;
      amount: number;
      paymentMode?: string;
      depositToAccountId?: string;
      reference?: string;
      notes?: string;
      allocations?: { invoiceId: string; amount: number }[];
      _debugFailPoint?: 'after_journal' | 'after_payment' | 'after_first_allocation';
    },
    transactionClient?: QueryClient
  ): Promise<{ id: string; paymentId: string; paymentNumber: string; amount: number; unallocatedAmount: number; journalEntryId: string }> {
    const execute = async (client: QueryClient) => {
      await SalesEngine.checkPeriodLock(orgId, payload.paymentDate, client);

      let customerId = payload.customerId || payload.clientId || '';
      let customerName = payload.customerName || payload.clientName || '';
      const paymentMode = payload.paymentMode || 'Bank Transfer';
      const depositToAccountId = payload.depositToAccountId || '1010';

      if (!customerName && customerId) {
        const custRes = await client.query(
          `SELECT display_name AS name FROM customers WHERE organization_id = $1 AND id = $2
           UNION ALL SELECT name FROM clients WHERE organization_id = $1 AND id = $2 LIMIT 1`,
          [orgId, customerId]
        );
        if (custRes.rows.length > 0) {
          customerName = custRes.rows[0].name || 'Customer';
        }
      }
      if (!customerName) customerName = 'Customer';

      const paymentId = newId('pmt');
      const paymentNum = await DocumentNumberingEngine.getNextNumber(orgId, 'CUSTOMER_PAYMENT', payload.paymentDate, undefined, client);
      const now = new Date().toISOString();

      if ((payload as any)?.approvedDraftId) {
        throw new Error('APPROVED_DRAFT_ID_FORBIDDEN: approvedDraftId is deprecated and forbidden. Use the dedicated postApprovedPayment endpoint.');
      }

      const requiresPaymentApproval = await ApprovalWorkflowService.requiresApproval(orgId, 'CUSTOMER_PAYMENT', payload.amount, client);
      if (requiresPaymentApproval) {
        await client.query(
          `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, reference, notes, unallocated_amount, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SUBMITTED', NOW())`,
          [paymentId, orgId, paymentNum, customerId || null, customerName, payload.paymentDate, payload.amount, paymentMode, depositToAccountId, payload.reference || '', payload.notes || '', payload.amount]
        );
        for (const alloc of payload.allocations || []) {
          if (alloc.invoiceId && alloc.amount > 0) {
            await client.query(
              `INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount)
               VALUES ($1, $2, $3, $4, $5)`,
              [newId('alloc'), orgId, paymentId, alloc.invoiceId, alloc.amount]
            );
          }
        }
        await ApprovalWorkflowService.submitForApproval(orgId, 'CUSTOMER_PAYMENT', paymentId, (payload as any).actorId || (payload as any).createdBy || 'system', payload.amount, client);
        return {
          id: paymentId,
          paymentId,
          paymentNumber: paymentNum,
          amount: payload.amount,
          unallocatedAmount: payload.amount,
          journalEntryId: '',
        };
      }

      // 1. Group and aggregate allocation amounts by invoiceId
      const aggregatedAllocations = new Map<string, number>();
      for (const alloc of payload.allocations || []) {
        if (!alloc.invoiceId || !alloc.amount || alloc.amount <= 0) continue;
        const currentSum = aggregatedAllocations.get(alloc.invoiceId) || 0;
        aggregatedAllocations.set(alloc.invoiceId, Math.round((currentSum + Number(alloc.amount)) * 100) / 100);
      }

      const totalAllocated = Array.from(aggregatedAllocations.values()).reduce((sum, amt) => sum + amt, 0);
      if (totalAllocated > payload.amount + 0.009) {
        throw new Error(`Total allocated amount (${totalAllocated}) cannot exceed payment amount (${payload.amount}).`);
      }
      const unallocatedAmount = Math.max(0, Math.round((payload.amount - totalAllocated) * 100) / 100);

      // 2. Sort unique invoice IDs in deterministic ascending lexical order to prevent distributed deadlocks
      const sortedInvoiceIds = Array.from(aggregatedAllocations.keys()).sort();

      // 3. Lock & validate all allocated invoices in deterministic sorted order
      const lockedInvoices: Array<{ id: string; invoice: any; allocAmount: number; newPaid: number; newBal: number; newStatus: string }> = [];
      for (const invId of sortedInvoiceIds) {
        const allocAmount = aggregatedAllocations.get(invId)!;
        const invRes = await client.query(
          `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, invId]
        );
        if (invRes.rows.length === 0) {
          throw new Error(`Invoice ${invId} not found`);
        }
        const inv = invRes.rows[0];
        const invoiceCustomerId = inv.customer_id || inv.client_id;
        if (invoiceCustomerId && customerId && invoiceCustomerId !== customerId) {
          throw new Error(`CROSS_CUSTOMER_ALLOCATION: Invoice ${inv.invoice_number} does not belong to customer ${customerId}`);
        }
        if (!customerId && invoiceCustomerId) {
          customerId = invoiceCustomerId;
          customerName = inv.client_name || customerName;
        }

        const currentBal = Math.max(0, Math.round((Number(inv.total_amount || 0) - Number(inv.paid_amount || 0) - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
        if (allocAmount > currentBal + 0.009) {
          throw new Error(`Allocation amount (${allocAmount}) exceeds invoice ${inv.invoice_number} balance due (${currentBal})`);
        }
        const newPaid = Math.round((Number(inv.paid_amount || 0) + allocAmount) * 100) / 100;
        const newBal = Math.max(0, Math.round((Number(inv.total_amount || 0) - newPaid - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
        const newStatus = newBal === 0 ? 'PAID' : 'PARTIALLY_PAID';
        lockedInvoices.push({ id: invId, invoice: inv, allocAmount, newPaid, newBal, newStatus });
      }

      // GL Posting for Payment:
      // Dr Bank Account: payload.amount
      // Cr Accounts Receivable: totalAllocated
      // Cr Customer Advances Liability: unallocatedAmount (if any)
      const journalLines: any[] = [
        {
          accountId: depositToAccountId,
          accountCode: '1010',
          accountName: 'Bank / Cash Account',
          debit: payload.amount,
          credit: 0,
          description: `Payment ${paymentNum} received from ${customerName}`,
        },
      ];

      if (totalAllocated > 0) {
        journalLines.push({
          accountId: '1100',
          accountCode: '1100',
          accountName: 'Accounts Receivable',
          debit: 0,
          credit: totalAllocated,
          description: `Payment ${paymentNum} allocated to invoices`,
        });
      }

      if (unallocatedAmount > 0) {
        journalLines.push({
          accountId: '2100',
          accountCode: '2100',
          accountName: 'Customer Advances Liability',
          debit: 0,
          credit: unallocatedAmount,
          description: `Unallocated Customer Advance for ${customerName}`,
        });
      }

      const journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        `JE-${paymentNum}`,
        payload.paymentDate,
        paymentNum,
        `Payment Received ${paymentNum}`,
        journalLines,
        client
      );

      // Fault injection hook 1: forced failure after journal entry write
      if (payload._debugFailPoint === 'after_journal') {
        throw new Error('DEBUG_FAILURE: Forced failure after journal entry creation');
      }

      // Persist Payment
      await client.query(
        `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, reference, notes, unallocated_amount, status, journal_entry_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          paymentId,
          orgId,
          paymentNum,
          customerId,
          customerName,
          payload.paymentDate,
          payload.amount,
          paymentMode,
          depositToAccountId,
          payload.reference || '',
          payload.notes || '',
          unallocatedAmount,
          unallocatedAmount > 0 ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED',
          journalEntryId,
          now,
        ]
      );

      // Fault injection hook 2: forced failure after payment record write
      if (payload._debugFailPoint === 'after_payment') {
        throw new Error('DEBUG_FAILURE: Forced failure after payment write');
      }

      // Process each allocation in deterministic sorted order
      let allocationCounter = 0;
      for (const item of lockedInvoices) {
        const updateRes = await client.query(
          `UPDATE invoices
              SET paid_amount = $1, balance_due = $2, status = $3
            WHERE organization_id = $4 AND id = $5
              AND balance_due >= $6 - 0.009`,
          [item.newPaid, item.newBal, item.newStatus, orgId, item.id, item.allocAmount]
        );
        if (updateRes.rowCount === 0) {
          throw new Error(`Concurrent modification: Invoice balance for ${item.invoice.invoice_number || item.id} has changed.`);
        }

        await client.query(
          `INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [newId('alloc'), orgId, paymentId, item.id, item.allocAmount]
        );

        allocationCounter++;
        // Fault injection hook 3: forced failure after first allocation write
        if (allocationCounter === 1 && payload._debugFailPoint === 'after_first_allocation') {
          throw new Error('DEBUG_FAILURE: Forced failure after first allocation write');
        }
      }

      // Save Customer Advance record if unallocated
      if (unallocatedAmount > 0) {
        await client.query(
          `INSERT INTO customer_advances (id, organization_id, customer_id, payment_id, amount, unapplied_amount, received_date, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newId('adv'), orgId, customerId, paymentId, unallocatedAmount, unallocatedAmount, payload.paymentDate, 'UNAPPLIED', now]
        );
      }

      return { id: paymentId, paymentId, paymentNumber: paymentNum, amount: payload.amount, unallocatedAmount, journalEntryId };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
  }

  public static async postApprovedPayment(
    orgId: string,
    userId: string,
    paymentId: string,
    transactionClient?: QueryClient
  ): Promise<{ id: string; paymentId: string; paymentNumber: string; amount: number; unallocatedAmount: number; journalEntryId: string }> {
    const execute = async (client: QueryClient) => {
      const pmtRes = await client.query(
        `SELECT * FROM payments_received WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, paymentId]
      );
      if (pmtRes.rows.length === 0) throw new Error('PAYMENT_NOT_FOUND: Payment received does not exist');
      const pmt = pmtRes.rows[0];
      if (pmt.status === 'ALLOCATED' || pmt.status === 'PARTIALLY_ALLOCATED' || pmt.status === 'UNALLOCATED') {
        throw new Error('PAYMENT_ALREADY_POSTED: Payment is already posted');
      }
      if (pmt.status !== 'SUBMITTED') {
        throw new Error(`PAYMENT_NOT_SUBMITTED: Payment has status '${pmt.status}', expected 'SUBMITTED'`);
      }

      // Atomically consume approval
      await ApprovalWorkflowService.consumeApproval(orgId, 'CUSTOMER_PAYMENT', paymentId, client);

      const paymentDate = pmt.payment_date instanceof Date ? pmt.payment_date.toISOString().split('T')[0] : String(pmt.payment_date).split('T')[0];
      await SalesEngine.checkPeriodLock(orgId, paymentDate, client);

      const amount = Number(pmt.amount || 0);
      const customerId = pmt.client_id || pmt.customer_id;
      const customerName = pmt.client_name || 'Customer';
      const depositToAccountId = pmt.deposit_to_account_id || '1010';

      const allocRes = await client.query(
        `SELECT * FROM payment_received_allocations WHERE payment_id = $1`,
        [paymentId]
      );

      const aggregatedAllocations = new Map<string, number>();
      for (const r of allocRes.rows) {
        const currentSum = aggregatedAllocations.get(r.invoice_id) || 0;
        aggregatedAllocations.set(r.invoice_id, Math.round((currentSum + Number(r.amount)) * 100) / 100);
      }

      const totalAllocated = Array.from(aggregatedAllocations.values()).reduce((sum, amt) => sum + amt, 0);
      const unallocatedAmount = Math.max(0, Math.round((amount - totalAllocated) * 100) / 100);

      const sortedInvoiceIds = Array.from(aggregatedAllocations.keys()).sort();
      const lockedInvoices: Array<{ id: string; invoice: any; allocAmount: number; newPaid: number; newBal: number; newStatus: string }> = [];

      for (const invId of sortedInvoiceIds) {
        const allocAmount = aggregatedAllocations.get(invId)!;
        const invQuery = await client.query(
          `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, invId]
        );
        if (invQuery.rows.length === 0) throw new Error(`Invoice ${invId} not found`);
        const inv = invQuery.rows[0];
        const currentBal = Math.max(0, Math.round((Number(inv.total_amount || 0) - Number(inv.paid_amount || 0) - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
        if (allocAmount > currentBal + 0.009) {
          throw new Error(`Allocation amount (${allocAmount}) exceeds invoice ${inv.invoice_number} balance due (${currentBal})`);
        }
        const newPaid = Math.round((Number(inv.paid_amount || 0) + allocAmount) * 100) / 100;
        const newBal = Math.max(0, Math.round((Number(inv.total_amount || 0) - newPaid - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
        const newStatus = newBal === 0 ? 'PAID' : 'PARTIALLY_PAID';
        lockedInvoices.push({ id: invId, invoice: inv, allocAmount, newPaid, newBal, newStatus });
      }

      const journalLines: any[] = [
        {
          accountId: depositToAccountId,
          accountCode: '1010',
          accountName: 'Bank / Cash Account',
          debit: amount,
          credit: 0,
          description: `Payment ${pmt.payment_number} received from ${customerName}`,
        },
      ];

      if (totalAllocated > 0) {
        journalLines.push({
          accountId: '1100',
          accountCode: '1100',
          accountName: 'Accounts Receivable',
          debit: 0,
          credit: totalAllocated,
          description: `Payment ${pmt.payment_number} allocated to invoices`,
        });
      }

      if (unallocatedAmount > 0) {
        journalLines.push({
          accountId: '2100',
          accountCode: '2100',
          accountName: 'Customer Advances Liability',
          debit: 0,
          credit: unallocatedAmount,
          description: `Unallocated Customer Advance for ${customerName}`,
        });
      }

      const journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        `JE-${pmt.payment_number}`,
        paymentDate,
        pmt.payment_number,
        `Payment Received ${pmt.payment_number}`,
        journalLines,
        client
      );

      for (const item of lockedInvoices) {
        await client.query(
          `UPDATE invoices
              SET paid_amount = $1, balance_due = $2, status = $3
            WHERE organization_id = $4 AND id = $5
              AND balance_due >= $6 - 0.009`,
          [item.newPaid, item.newBal, item.newStatus, orgId, item.id, item.allocAmount]
        );
      }

      if (customerId) {
        await client.query(
          `UPDATE customers
              SET receivables_balance = CASE WHEN receivables_balance - $1 < 0 THEN 0 ELSE receivables_balance - $1 END,
                  advance_balance = advance_balance + $2
            WHERE organization_id = $3 AND id = $4`,
          [totalAllocated, unallocatedAmount, orgId, customerId]
        );
      }

      const finalStatus = unallocatedAmount > 0 ? (totalAllocated > 0 ? 'PARTIALLY_ALLOCATED' : 'UNALLOCATED') : 'ALLOCATED';

      await client.query(
        `UPDATE payments_received SET status = $1, unallocated_amount = $2, journal_entry_id = $3 WHERE organization_id = $4 AND id = $5`,
        [finalStatus, unallocatedAmount, journalEntryId, orgId, paymentId]
      );

      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'PAYMENT_RECEIVED_POSTED', 'PaymentReceived', $4, $5)`,
        [newId('aud'), orgId, userId, paymentId, JSON.stringify({ paymentNumber: pmt.payment_number, status: finalStatus, journalEntryId })]
      );

      return {
        id: paymentId,
        paymentId,
        paymentNumber: pmt.payment_number,
        amount,
        unallocatedAmount,
        journalEntryId,
      };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
  }

  // -------------------------------------------------------------
  // 6. CUSTOMER ADVANCES & APPLICATIONS
  // -------------------------------------------------------------
  public static async applyAdvanceToInvoice(
    orgId: string,
    advanceId: string,
    invoiceId: string,
    amount: number,
    appliedDate: string,
    transactionClient?: QueryClient
  ): Promise<{ appliedAmount: number; advanceRemainingBalance: number; invoiceRemainingBalance: number }> {
    const execute = async (client: QueryClient) => {
      await SalesEngine.checkPeriodLock(orgId, appliedDate, client);

      // Lock advance
      const advRes = await client.query(
        `SELECT * FROM customer_advances WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, advanceId]
      );
      if (advRes.rows.length === 0) {
        throw new Error(`Customer Advance ${advanceId} not found`);
      }
      const adv = advRes.rows[0];
      const availableAdv = Number(adv.unapplied_amount || 0);
      if (amount > availableAdv + 0.009) {
        throw new Error(`Applied amount (${amount}) exceeds available advance balance (${availableAdv})`);
      }

      // Lock invoice
      const invRes = await client.query(
        `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [orgId, invoiceId]
      );
      if (invRes.rows.length === 0) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }
      const inv = invRes.rows[0];
      const invoiceCustomerId = inv.customer_id || inv.client_id;
      if (invoiceCustomerId && adv.customer_id && invoiceCustomerId !== adv.customer_id) {
        throw new Error(`CROSS_CUSTOMER_ALLOCATION: Cannot apply advance from customer ${adv.customer_id} to invoice belonging to ${invoiceCustomerId}`);
      }

      const invBal = Math.max(0, Math.round((Number(inv.total_amount || 0) - Number(inv.paid_amount || 0) - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
      if (amount > invBal + 0.009) {
        throw new Error(`Applied advance (${amount}) exceeds invoice ${inv.invoice_number} balance due (${invBal})`);
      }

      const newAdvBal = Math.max(0, Math.round((availableAdv - amount) * 100) / 100);
      const newAdvStatus = newAdvBal === 0 ? 'APPLIED' : 'PARTIALLY_APPLIED';

      // Atomic advance drawdown
      const advUpdate = await client.query(
        `UPDATE customer_advances
            SET unapplied_amount = $1, status = $2
          WHERE organization_id = $3 AND id = $4
            AND unapplied_amount >= $5 - 0.009`,
        [newAdvBal, newAdvStatus, orgId, advanceId, amount]
      );
      if (advUpdate.rowCount === 0) {
        throw new Error('Concurrent modification: Advance balance has changed.');
      }

      const newInvPaid = Math.round((Number(inv.paid_amount || 0) + amount) * 100) / 100;
      const newInvBal = Math.max(0, Math.round((Number(inv.total_amount || 0) - newInvPaid - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
      const newInvStatus = newInvBal === 0 ? 'PAID' : 'PARTIALLY_PAID';

      // Atomic invoice update
      const invUpdate = await client.query(
        `UPDATE invoices
            SET paid_amount = $1, balance_due = $2, status = $3
          WHERE organization_id = $4 AND id = $5
            AND balance_due >= $6 - 0.009`,
        [newInvPaid, newInvBal, newInvStatus, orgId, invoiceId, amount]
      );
      if (invUpdate.rowCount === 0) {
        throw new Error('Concurrent modification: Invoice balance has changed.');
      }

      // Record GL Entry: Dr Customer Advances (2100), Cr Accounts Receivable (1100)
      const journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        `JE-ADVAPP-${newId('je')}`,
        appliedDate,
        inv.invoice_number,
        `Advance ${advanceId} applied to Invoice ${inv.invoice_number}`,
        [
          {
            accountId: '2100',
            accountCode: '2100',
            accountName: 'Customer Advances Liability',
            debit: amount,
            credit: 0,
            description: `Advance drawn down for Invoice ${inv.invoice_number}`,
          },
          {
            accountId: '1100',
            accountCode: '1100',
            accountName: 'Accounts Receivable',
            debit: 0,
            credit: amount,
            description: `Accounts Receivable settled via advance`,
          },
        ],
        client
      );

      await client.query(
        `INSERT INTO customer_advance_applications
          (id, organization_id, advance_id, invoice_id, amount_applied, applied_date, journal_entry_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newId('advapp'), orgId, advanceId, invoiceId, amount, appliedDate, journalEntryId]
      );

      return { appliedAmount: amount, advanceRemainingBalance: newAdvBal, invoiceRemainingBalance: newInvBal };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
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
    },
    transactionClient?: QueryClient
  ): Promise<{ creditNoteId: string; totalAmount: number }> {
    const execute = async (client: QueryClient) => {
      await SalesEngine.checkPeriodLock(orgId, payload.date, client);

      const totalAmount = Math.round((payload.taxableAmount + payload.taxAmount) * 100) / 100;

      // Lock and validate invoice if linked directly to an invoice
      if (payload.invoiceId) {
        const invRes = await client.query(
          `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
          [orgId, payload.invoiceId]
        );
        if (invRes.rows.length === 0) {
          throw new Error(`Invoice ${payload.invoiceId} not found`);
        }
        const inv = invRes.rows[0];
        const currentBal = Math.max(0, Math.round((Number(inv.total_amount) - Number(inv.paid_amount || 0) - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
        if (totalAmount > currentBal + 0.009) {
          throw new Error(`Credit Note amount (${totalAmount}) exceeds invoice ${inv.invoice_number} remaining balance (${currentBal})`);
        }
      }

      const id = newId('cn');
      const cnNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'CREDIT_NOTE', payload.date, undefined, client);
      const now = new Date().toISOString();

      // GL Posting for Credit Note:
      // Dr Sales / Revenue (taxableAmount)
      // Dr GST Output Liability Reversal (taxAmount)
      // Cr Accounts Receivable (totalAmount)
      const journalLines: any[] = [
        {
          accountId: '4000',
          accountCode: '4000',
          accountName: 'Sales Revenue Reversal',
          debit: payload.taxableAmount,
          credit: 0,
          description: `Credit Note ${cnNumber} Revenue Reversal`,
        },
      ];

      if (payload.taxAmount > 0) {
        journalLines.push({
          accountId: '2200',
          accountCode: '2200',
          accountName: 'GST Output Tax Reversal',
          debit: payload.taxAmount,
          credit: 0,
          description: `Credit Note ${cnNumber} Tax Reversal`,
        });
      }

      journalLines.push({
        accountId: '1100',
        accountCode: '1100',
        accountName: 'Accounts Receivable',
        debit: 0,
        credit: totalAmount,
        description: `Credit Note ${cnNumber} AR Reduction`,
      });

      const journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        `JE-${cnNumber}`,
        payload.date,
        cnNumber,
        `Credit Note ${cnNumber} Created`,
        journalLines,
        client
      );

      await client.query(
        `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason, journal_entry_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id, orgId, cnNumber, payload.customerId, payload.customerName, payload.date, totalAmount, totalAmount, 'Open', payload.reason || '', journalEntryId, now]
      );

      // If assigned directly against an invoice, auto-apply to invoice
      if (payload.invoiceId) {
        await SalesEngine.applyCreditNoteToInvoice(orgId, id, payload.invoiceId, totalAmount, payload.date, client);
      }

      return { creditNoteId: id, totalAmount };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
  }

  public static async applyCreditNoteToInvoice(
    orgId: string,
    creditNoteId: string,
    invoiceId: string,
    amountToApply: number,
    applyDate: string,
    transactionClient?: QueryClient
  ): Promise<{ appliedAmount: number; remainingCreditNoteBalance: number }> {
    const execute = async (client: QueryClient) => {
      await SalesEngine.checkPeriodLock(orgId, applyDate, client);

      const cnRes = await client.query(`SELECT * FROM credit_notes WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, creditNoteId]);
      if (cnRes.rows.length === 0) throw new Error('Credit Note not found');
      const cn = cnRes.rows[0];

      const availableCredit = Number(cn.remaining_credit);
      if (amountToApply > availableCredit) throw new Error(`Amount ${amountToApply} exceeds remaining credit ${availableCredit}`);

      const invRes = await client.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, invoiceId]);
      if (invRes.rows.length === 0) throw new Error('Invoice not found');
      const inv = invRes.rows[0];

      const cnCust = cn.customer_id || cn.client_id;
      const invCust = inv.customer_id || inv.client_id;
      if (cnCust && invCust && cnCust !== invCust) {
        throw new Error('CROSS_CUSTOMER_ALLOCATION: Cannot apply credit note across different customers');
      }

      const currentBal = Math.max(0, Math.round((Number(inv.total_amount) - Number(inv.paid_amount || 0) - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
      const actualApplied = Math.min(amountToApply, currentBal);

      // Application record
      await client.query(
        `INSERT INTO credit_note_applications (id, organization_id, credit_note_id, invoice_id, amount_applied, applied_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newId('cna'), orgId, creditNoteId, invoiceId, actualApplied, applyDate]
      );

      // Update Credit Note
      const newRemCredit = Math.round((availableCredit - actualApplied) * 100) / 100;
      await client.query(
        `UPDATE credit_notes SET remaining_credit = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
        [newRemCredit, newRemCredit === 0 ? 'Closed' : 'Open', orgId, creditNoteId]
      );

      // Update Invoice balance
      const currentCredited = Number(inv.amount_credited || 0);
      const newCredited = Math.round((currentCredited + actualApplied) * 100) / 100;
      const newBal = Math.max(0, Math.round((Number(inv.total_amount) - Number(inv.paid_amount || 0) - newCredited - Number(inv.amount_written_off || 0)) * 100) / 100);

      await client.query(
        `UPDATE invoices SET amount_credited = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
        [newCredited, newBal, newBal === 0 ? 'PAID' : 'PARTIALLY_PAID', orgId, invoiceId]
      );

      return { appliedAmount: actualApplied, remainingCreditNoteBalance: newRemCredit };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
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
    },
    transactionClient?: QueryClient
  ): Promise<{ refundId: string }> {
    const execute = async (client: QueryClient) => {
      await SalesEngine.checkPeriodLock(orgId, payload.refundDate, client);

      const refundId = newId('ref');
      const refundNum = await DocumentNumberingEngine.getNextNumber(orgId, 'CUSTOMER_REFUND', payload.refundDate, undefined, client);
      const now = new Date().toISOString();

      if (payload.creditNoteId) {
        const cnRes = await client.query(`SELECT * FROM credit_notes WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, payload.creditNoteId]);
        if (cnRes.rows.length === 0) throw new Error('Credit note not found for refund');
        const remCredit = Number(cnRes.rows[0].remaining_credit || 0);
        if (payload.amount > remCredit) {
          throw new Error(`Refund amount ${payload.amount} exceeds remaining credit note balance ${remCredit}`);
        }
        await client.query(
          `UPDATE credit_notes SET remaining_credit = remaining_credit - $1, status = CASE WHEN remaining_credit - $1 = 0 THEN 'Refunded' ELSE status END WHERE organization_id = $2 AND id = $3`,
          [payload.amount, orgId, payload.creditNoteId]
        );
      }

      // GL Entry: Dr Customer Credit / Liability, Cr Bank Account
      const journalLines = [
        {
          accountId: '2100',
          accountCode: '2100',
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

      const journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        `JE-${refundNum}`,
        payload.refundDate,
        refundNum,
        `Customer Refund ${refundNum}`,
        journalLines,
        client
      );

      await client.query(
        `INSERT INTO customer_refunds (id, organization_id, refund_number, customer_id, credit_note_id, refund_date, amount, refund_account_id, reference, notes, journal_entry_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [refundId, orgId, refundNum, payload.customerId, payload.creditNoteId || null, payload.refundDate, payload.amount, payload.refundAccountId, payload.reference || '', payload.notes || '', journalEntryId, now]
      );

      return { refundId };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
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
    },
    transactionClient?: QueryClient
  ): Promise<{ writeOffId: string }> {
    const execute = async (client: QueryClient) => {
      await SalesEngine.checkPeriodLock(orgId, payload.writeOffDate, client);

      const invRes = await client.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, payload.invoiceId]);
      if (invRes.rows.length === 0) throw new Error('Invoice not found');
      const inv = invRes.rows[0];

      const currentBal = Math.max(0, Math.round((Number(inv.total_amount) - Number(inv.paid_amount || 0) - Number(inv.amount_credited || 0) - Number(inv.amount_written_off || 0)) * 100) / 100);
      if (payload.amount > currentBal + 0.009) {
        throw new Error(`Write-off amount (${payload.amount}) exceeds invoice balance due (${currentBal})`);
      }

      const writeOffId = newId('wo');
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
          accountId: '1100',
          accountCode: '1100',
          accountName: 'Accounts Receivable',
          debit: 0,
          credit: payload.amount,
          description: `Write off invoice ${inv.invoice_number}`,
        },
      ];

      const journalEntryId = await SalesEngine.persistJournalEntry(
        orgId,
        newId('je'),
        payload.writeOffDate,
        inv.invoice_number,
        `Write off invoice ${inv.invoice_number}`,
        journalLines,
        client
      );

      // Update invoice record
      const newWrittenOff = Math.round((Number(inv.amount_written_off || 0) + payload.amount) * 100) / 100;
      const newBal = Math.max(0, Math.round((Number(inv.total_amount) - Number(inv.paid_amount || 0) - Number(inv.amount_credited || 0) - newWrittenOff) * 100) / 100);

      await client.query(
        `UPDATE invoices SET amount_written_off = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
        [newWrittenOff, newBal, newBal === 0 ? 'WRITTEN_OFF' : inv.status, orgId, payload.invoiceId]
      );

      await client.query(
        `INSERT INTO ar_write_offs (id, organization_id, invoice_id, customer_id, write_off_date, amount, write_off_account_id, reason, user_id, journal_entry_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [writeOffId, orgId, payload.invoiceId, payload.customerId, payload.writeOffDate, payload.amount, payload.writeOffAccountId, payload.reason, payload.userId || 'Admin', journalEntryId, now]
      );

      return { writeOffId };
    };

    if (transactionClient) return await execute(transactionClient);
    return await db.transaction(execute);
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
    // Preserve the legacy response shape while using the one authoritative,
    // exact-cent reconciliation implementation. Unapplied advances live in the
    // 2100 liability account and must not be netted against 1100 receivables.
    const trusted = await AccountingIntegrityService.verifyARIntegrity(orgId);
    const customerSubledgerTotal = Number(trusted.expectedAmount);
    const arControlGLBalance = Number(trusted.actualAmount);
    const difference = Number(trusted.difference);
    const compatibilityResult = {
      ...trusted,
      customerSubledgerTotal,
      arControlGLBalance,
      difference,
      isValid: trusted.isBalanced,
      isBalanced: trusted.isBalanced,
      details: trusted.details,
    };
    return compatibilityResult;
  }

  // -------------------------------------------------------------
  // 10. RECEIVABLE AGING ENGINE
  // -------------------------------------------------------------
  public static async getARAgingReport(orgId: string, asOfDate: string = new Date().toISOString().split('T')[0]): Promise<any[]> {
    const invRes = await db.query(
      `SELECT i.id, i.client_id, i.client_name, i.invoice_number, i.due_date, i.balance_due
       FROM invoices i
       WHERE i.organization_id = $1
         AND i.balance_due > 0
         AND UPPER(i.status) NOT IN ('VOID', 'VOIDED', 'DRAFT')
         AND i.issue_date <= $2`,
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
