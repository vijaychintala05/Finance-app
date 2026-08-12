import { db } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import type { QueryClient } from '../accounting/postingEngine';
import { AccountingService } from '../../../src/services/accountingService';
import { SalesService } from '../../../src/services/salesService';
import { PeriodLock } from '../../../src/types';
import { newId } from '../utils/ids';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';

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
    lines: any[],
    transactionClient?: QueryClient
  ): Promise<string> {
    const queryClient: QueryClient = transactionClient || db;
    const resolvedLines: any[] = [];
    for (const line of lines) {
      let accId = line.accountId;
      let accCode = line.accountCode;
      let accName = line.accountName;
      const accRes = await queryClient.query(
        `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND (id = $2 OR code = $3 OR code = $2)`,
        [orgId, accId, accCode || accId]
      );
      if (accRes.rows.length > 0) {
        accId = accRes.rows[0].id;
        accCode = accRes.rows[0].code;
        accName = accRes.rows[0].name;
      }
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) throw new Error('Sales order date must use YYYY-MM-DD format');
    if (data.expectedDelivery && (!/^\d{4}-\d{2}-\d{2}$/.test(data.expectedDelivery) || data.expectedDelivery < orderDate)) {
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
    // 1. Period lock validation
    await SalesEngine.checkPeriodLock(orgId, data.issueDate || new Date().toISOString().split('T')[0]);

    const id = data.id || newId('inv');
    const now = new Date().toISOString();
    const issueDate = data.issueDate || now.split('T')[0];
    let invNumber = data.invoiceNumber || '';
    const dueDate = data.dueDate || issueDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < issueDate) {
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
    const status = isPosted ? 'POSTED' : 'DRAFT';

    const persistInvoice = async (client: QueryClient) => {
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
      const defaultRevenue = await client.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND code = '4000' AND type IN ('Income', 'Revenue') AND status = 'Active'`,
        [orgId]
      );
      if (defaultRevenue.rows.length !== 1) throw new Error('Required sales revenue account 4000 is missing');

      // Validate and resolve every line before the first journal/document write.
      // This protects real PostgreSQL transactions and also keeps alternative
      // test adapters from ever observing a partially-created invoice.
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
        let lineAccountId = defaultRevenue.rows[0].id;
        if (item.accountId) {
          const lineAccount = await client.query(
            `SELECT id, code, type FROM accounts WHERE organization_id = $1 AND id = $2 AND status = 'Active'`,
            [orgId, item.accountId]
          );
          if (lineAccount.rows.length !== 1) throw new Error(`Invoice line account ${item.accountId} does not belong to this organization or is inactive`);
          if (lineAccount.rows[0].id !== defaultRevenue.rows[0].id || !['Income', 'Revenue'].includes(lineAccount.rows[0].type)) {
            throw new Error('Certified invoice posting currently requires the tenant default sales revenue account 4000 on every line');
          }
          lineAccountId = lineAccount.rows[0].id;
        }
        validatedLines.push({ item, quantity, unitPrice, taxRate, lineAmount, verifiedItemId, lineAccountId });
      }
      if (isPosted) {
      // Create GL Posting: Dr Accounts Receivable, Cr Sales Revenue, Cr Output Tax, Dr/Cr Round-Off
      const arAccountId = await OrganizationProvisioningService.resolveAccountId(client, orgId, '1100', ['Asset']);
      const salesAccountId = defaultRevenue.rows[0].id;
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
        status,
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

    // Update Sales Order partial invoicing if linked
    if (data.salesOrderId) {
      if (sourceSalesOrder) {
        const so = sourceSalesOrder;
        const newInvoiced = Number(so.invoiced_amount || 0) + finalTotal;
        const soTotal = Number(so.total_amount || 0);

        let newSoStatus = 'PARTIALLY_INVOICED';
        if (newInvoiced >= soTotal) {
          newSoStatus = 'INVOICED';
        }

        await client.query(
          `UPDATE sales_orders SET invoiced_amount = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
          [newInvoiced, newSoStatus, orgId, data.salesOrderId]
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
          isPosted ? 'INVOICE_POSTED' : 'INVOICE_DRAFT_CREATED',
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
      status: status as any,
      lineItems: items,
      notes: data.notes || '',
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

    const paymentId = newId('pmt');
    const paymentNum = await DocumentNumberingEngine.getNextNumber(orgId, 'CUSTOMER_PAYMENT', payload.paymentDate);
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
        [newId('alloc'), orgId, paymentId, alloc.invoiceId, alloc.amount]
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
        [newId('adv'), orgId, payload.customerId, paymentId, unallocatedAmount, unallocatedAmount, payload.paymentDate, 'UNAPPLIED', now]
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
        accountId: '2100',
        accountCode: '2100',
        accountName: 'Customer Advances Liability',
        debit: actualApplied,
        credit: 0,
        description: `Apply Advance to Invoice ${inv.invoice_number}`,
      },
      {
        accountId: '1100',
        accountCode: '1100',
        accountName: 'Accounts Receivable',
        debit: 0,
        credit: actualApplied,
        description: `Advance Applied to Invoice ${inv.invoice_number}`,
      },
    ];

    await SalesEngine.persistJournalEntry(
      orgId,
      newId('je'),
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

    const id = newId('cn');
    const cnNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'CREDIT_NOTE', payload.date);
    const totalAmount = Math.round((payload.taxableAmount + payload.taxAmount) * 100) / 100;
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
      [newId('cna'), orgId, creditNoteId, invoiceId, actualApplied, applyDate]
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

    const refundId = newId('ref');
    const refundNum = await DocumentNumberingEngine.getNextNumber(orgId, 'CUSTOMER_REFUND', payload.refundDate);
    const now = new Date().toISOString();

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

    await SalesEngine.persistJournalEntry(
      orgId,
      newId('je'),
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
       WHERE je.organization_id = $1 AND jl.account_code = '1100'`,
      [orgId]
    );

    let arControlGLBalance = Number(jlRes.rows[0].gl_bal || 0);
    if (arControlGLBalance === 0) {
      const accRes = await db.query(
        `SELECT balance FROM accounts WHERE organization_id = $1 AND code = '1100'`,
        [orgId]
      );
      if (accRes.rows.length > 0) {
        arControlGLBalance = Number(accRes.rows[0].balance || 0);
      }
    }

    const difference = Math.abs(Math.round((customerSubledgerTotal - arControlGLBalance) * 100) / 100);
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
