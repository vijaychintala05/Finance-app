import { db } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { AccountingService } from '../../../src/services/accountingService';
import { PeriodLock } from '../../../src/types';

export interface VendorMaster {
  id: string;
  organizationId: string;
  vendorId?: string;
  name: string;
  legalName?: string;
  companyName?: string;
  vendorType?: 'Business' | 'Individual';
  gstStatus?: 'Registered' | 'Unregistered' | 'Composition' | 'SEZ';
  gstin?: string;
  pan?: string;
  billingAddress?: any;
  shippingAddress?: any;
  placeOfSupply?: string;
  primaryContact?: any;
  email?: string;
  phone?: string;
  currency?: string;
  paymentTerms?: string;
  defaultExpenseAccountId?: string;
  payablesBalance?: number;
  unusedCredits?: number;
  advanceBalance?: number;
  active?: boolean;
  openingBalance?: number;
  createdAt?: string;
}

export interface PurchaseOrderModel {
  id: string;
  organizationId: string;
  purchaseOrderNumber: string;
  vendorId: string;
  vendorName: string;
  vendorSnapshot?: any;
  orderDate: string;
  expectedDelivery?: string;
  subtotal: number;
  taxTotal: number;
  discount: number;
  totalAmount: number;
  billedAmount: number;
  status: 'DRAFT' | 'APPROVED' | 'PARTIALLY_BILLED' | 'BILLED' | 'CANCELLED';
  lineItems: any[];
  notes?: string;
  createdAt?: string;
}

export interface GoodsServiceReceiptModel {
  id: string;
  organizationId: string;
  receiptNumber: string;
  purchaseOrderId?: string;
  vendorId: string;
  vendorName: string;
  receiptDate: string;
  status: 'RECEIVED' | 'INSPECTED' | 'ACCEPTED' | 'REJECTED';
  lineItems: any[];
  notes?: string;
  createdAt?: string;
}

export interface BillModel {
  id: string;
  organizationId: string;
  billNumber: string;
  vendorInvoiceNumber: string;
  purchaseOrderId?: string;
  vendorId: string;
  vendorName: string;
  vendorEmail?: string;
  billDate: string;
  dueDate: string;
  subtotal: number;
  taxTotal: number;
  discount: number;
  roundOffAmount?: number;
  totalAmount: number;
  amountPaid: number;
  amountDebited?: number;
  amountWrittenOff?: number;
  balanceDue: number;
  status: 'DRAFT' | 'POSTED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOIDED' | 'WRITTEN_OFF';
  lineItems: any[];
  notes?: string;
  journalEntryId?: string;
  createdAt?: string;
}

export interface VendorPaymentModel {
  id: string;
  organizationId: string;
  paymentNumber: string;
  vendorId: string;
  vendorName: string;
  paymentDate: string;
  amount: number;
  paymentMode: string;
  paidFromAccountId: string;
  reference?: string;
  notes?: string;
  unallocatedAmount?: number;
  status?: string;
  allocations?: { billId: string; amount: number }[];
  journalEntryId?: string;
  createdAt?: string;
}

export interface DebitNoteModel {
  id: string;
  organizationId: string;
  debitNoteNumber: string;
  vendorId: string;
  vendorName: string;
  billId?: string;
  date: string;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
  remainingCredit: number;
  status: 'OPEN' | 'PARTIALLY_APPLIED' | 'CLOSED' | 'VOID';
  reason?: string;
  journalEntryId?: string;
  createdAt?: string;
}

export class PurchasesEngine {
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
  // 1. VENDOR MASTER
  // -------------------------------------------------------------
  public static async createVendor(orgId: string, data: Partial<VendorMaster>): Promise<VendorMaster> {
    const id = data.id || `vdr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const vdrId = data.vendorId || `VDR-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO vendors (id, organization_id, vendor_id, name, legal_name, company_name, vendor_type, gst_status, gstin, pan, billing_address, shipping_address, place_of_supply, primary_contact, email, phone, currency, payment_terms, default_expense_account_id, payables_balance, unused_credits, advance_balance, active, opening_balance, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
      [
        id,
        orgId,
        vdrId,
        data.name || 'Unnamed Vendor',
        data.legalName || data.name || '',
        data.companyName || '',
        data.vendorType || 'Business',
        data.gstStatus || 'Unregistered',
        data.gstin || '',
        data.pan || '',
        JSON.stringify(data.billingAddress || {}),
        JSON.stringify(data.shippingAddress || {}),
        data.placeOfSupply || '27-Maharashtra',
        JSON.stringify(data.primaryContact || {}),
        data.email || '',
        data.phone || '',
        data.currency || 'INR',
        data.paymentTerms || 'Net 30',
        data.defaultExpenseAccountId || null,
        data.payablesBalance || data.openingBalance || 0,
        data.unusedCredits || 0,
        data.advanceBalance || 0,
        data.active !== undefined ? data.active : true,
        data.openingBalance || 0,
        now,
      ]
    );

    return {
      id,
      organizationId: orgId,
      vendorId: vdrId,
      name: data.name || 'Unnamed Vendor',
      legalName: data.legalName || data.name || '',
      companyName: data.companyName || '',
      vendorType: data.vendorType || 'Business',
      gstStatus: data.gstStatus || 'Unregistered',
      gstin: data.gstin || '',
      pan: data.pan || '',
      billingAddress: data.billingAddress || {},
      shippingAddress: data.shippingAddress || {},
      placeOfSupply: data.placeOfSupply || '27-Maharashtra',
      primaryContact: data.primaryContact || {},
      email: data.email || '',
      phone: data.phone || '',
      currency: data.currency || 'INR',
      paymentTerms: data.paymentTerms || 'Net 30',
      defaultExpenseAccountId: data.defaultExpenseAccountId,
      payablesBalance: data.payablesBalance || data.openingBalance || 0,
      unusedCredits: data.unusedCredits || 0,
      advanceBalance: data.advanceBalance || 0,
      active: true,
      openingBalance: data.openingBalance || 0,
      createdAt: now,
    };
  }

  public static async getVendor(orgId: string, id: string): Promise<VendorMaster | null> {
    const res = await db.query(
      `SELECT * FROM vendors WHERE organization_id = $1 AND id = $2`,
      [orgId, id]
    );
    if (res.rows.length === 0) return null;

    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      vendorId: r.vendor_id,
      name: r.name,
      legalName: r.legal_name,
      companyName: r.company_name,
      vendorType: r.vendor_type,
      gstStatus: r.gst_status,
      gstin: r.gstin,
      pan: r.pan,
      billingAddress: typeof r.billing_address === 'string' ? JSON.parse(r.billing_address || '{}') : r.billing_address,
      shippingAddress: typeof r.shipping_address === 'string' ? JSON.parse(r.shipping_address || '{}') : r.shipping_address,
      placeOfSupply: r.place_of_supply,
      primaryContact: typeof r.primary_contact === 'string' ? JSON.parse(r.primary_contact || '{}') : r.primary_contact,
      email: r.email,
      phone: r.phone,
      currency: r.currency,
      paymentTerms: r.payment_terms,
      defaultExpenseAccountId: r.default_expense_account_id,
      payablesBalance: Number(r.payables_balance || 0),
      unusedCredits: Number(r.unused_credits || 0),
      advanceBalance: Number(r.advance_balance || 0),
      active: r.active,
      openingBalance: Number(r.opening_balance || 0),
      createdAt: r.created_at,
    };
  }

  public static async listVendors(orgId: string): Promise<VendorMaster[]> {
    const res = await db.query(
      `SELECT * FROM vendors WHERE organization_id = $1 ORDER BY name ASC`,
      [orgId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      vendorId: r.vendor_id,
      name: r.name,
      legalName: r.legal_name,
      companyName: r.company_name,
      vendorType: r.vendor_type,
      gstStatus: r.gst_status,
      gstin: r.gstin,
      pan: r.pan,
      billingAddress: typeof r.billing_address === 'string' ? JSON.parse(r.billing_address || '{}') : r.billing_address,
      shippingAddress: typeof r.shipping_address === 'string' ? JSON.parse(r.shipping_address || '{}') : r.shipping_address,
      placeOfSupply: r.place_of_supply,
      primaryContact: typeof r.primary_contact === 'string' ? JSON.parse(r.primary_contact || '{}') : r.primary_contact,
      email: r.email,
      phone: r.phone,
      currency: r.currency,
      paymentTerms: r.payment_terms,
      defaultExpenseAccountId: r.default_expense_account_id,
      payablesBalance: Number(r.payables_balance || 0),
      unusedCredits: Number(r.unused_credits || 0),
      advanceBalance: Number(r.advance_balance || 0),
      active: r.active,
      openingBalance: Number(r.opening_balance || 0),
      createdAt: r.created_at,
    }));
  }

  // -------------------------------------------------------------
  // 2. PURCHASE ORDERS (PO)
  // -------------------------------------------------------------
  public static async createPurchaseOrder(orgId: string, data: Partial<PurchaseOrderModel>): Promise<PurchaseOrderModel> {
    const id = data.id || `po-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const poNum = data.purchaseOrderNumber || `PO-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const subtotal = data.subtotal || 0;
    const taxTotal = data.taxTotal || 0;
    const discount = data.discount || 0;
    const totalAmount = data.totalAmount || Math.round((subtotal + taxTotal - discount) * 100) / 100;

    await db.query(
      `INSERT INTO purchase_orders (id, organization_id, purchase_order_number, vendor_id, vendor_name, vendor_snapshot, order_date, expected_delivery, subtotal, tax_total, discount, total_amount, billed_amount, status, line_items, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        orgId,
        poNum,
        data.vendorId,
        data.vendorName || 'Vendor',
        JSON.stringify(data.vendorSnapshot || {}),
        data.orderDate || new Date().toISOString().split('T')[0],
        data.expectedDelivery || null,
        subtotal,
        taxTotal,
        discount,
        totalAmount,
        data.billedAmount || 0,
        data.status || 'DRAFT',
        JSON.stringify(data.lineItems || []),
        data.notes || '',
        now,
      ]
    );

    return {
      id,
      organizationId: orgId,
      purchaseOrderNumber: poNum,
      vendorId: data.vendorId!,
      vendorName: data.vendorName || 'Vendor',
      vendorSnapshot: data.vendorSnapshot,
      orderDate: data.orderDate || new Date().toISOString().split('T')[0],
      expectedDelivery: data.expectedDelivery,
      subtotal,
      taxTotal,
      discount,
      totalAmount,
      billedAmount: data.billedAmount || 0,
      status: data.status || 'DRAFT',
      lineItems: data.lineItems || [],
      notes: data.notes || '',
      createdAt: now,
    };
  }

  public static async approvePurchaseOrder(orgId: string, id: string): Promise<PurchaseOrderModel> {
    await db.query(
      `UPDATE purchase_orders SET status = 'APPROVED' WHERE organization_id = $1 AND id = $2`,
      [orgId, id]
    );
    const po = await this.getPurchaseOrder(orgId, id);
    if (!po) throw new Error('Purchase Order not found');
    return po;
  }

  public static async getPurchaseOrder(orgId: string, id: string): Promise<PurchaseOrderModel | null> {
    const res = await db.query(
      `SELECT * FROM purchase_orders WHERE organization_id = $1 AND id = $2`,
      [orgId, id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      purchaseOrderNumber: r.purchase_order_number,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      vendorSnapshot: typeof r.vendor_snapshot === 'string' ? JSON.parse(r.vendor_snapshot || '{}') : r.vendor_snapshot,
      orderDate: r.order_date,
      expectedDelivery: r.expected_delivery,
      subtotal: Number(r.subtotal || 0),
      taxTotal: Number(r.tax_total || 0),
      discount: Number(r.discount || 0),
      totalAmount: Number(r.total_amount || 0),
      billedAmount: Number(r.billed_amount || 0),
      status: r.status,
      lineItems: typeof r.line_items === 'string' ? JSON.parse(r.line_items || '[]') : r.line_items,
      notes: r.notes,
      createdAt: r.created_at,
    };
  }

  // -------------------------------------------------------------
  // 3. GOODS / SERVICE RECEIPTS (GRN / SRN)
  // -------------------------------------------------------------
  public static async createReceipt(orgId: string, data: Partial<GoodsServiceReceiptModel>): Promise<GoodsServiceReceiptModel> {
    const id = data.id || `rcpt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const rcptNum = data.receiptNumber || `GRN-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO goods_service_receipts (id, organization_id, receipt_number, purchase_order_id, vendor_id, vendor_name, receipt_date, status, line_items, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        id,
        orgId,
        rcptNum,
        data.purchaseOrderId || null,
        data.vendorId,
        data.vendorName || 'Vendor',
        data.receiptDate || new Date().toISOString().split('T')[0],
        data.status || 'RECEIVED',
        JSON.stringify(data.lineItems || []),
        data.notes || '',
        now,
      ]
    );

    return {
      id,
      organizationId: orgId,
      receiptNumber: rcptNum,
      purchaseOrderId: data.purchaseOrderId,
      vendorId: data.vendorId!,
      vendorName: data.vendorName || 'Vendor',
      receiptDate: data.receiptDate || new Date().toISOString().split('T')[0],
      status: data.status || 'RECEIVED',
      lineItems: data.lineItems || [],
      notes: data.notes || '',
      createdAt: now,
    };
  }

  // -------------------------------------------------------------
  // 4. VENDOR BILLS (POSTING & AP BALANCES)
  // -------------------------------------------------------------
  public static async createAndPostBill(orgId: string, data: Partial<BillModel>): Promise<BillModel> {
    const billDate = data.billDate || new Date().toISOString().split('T')[0];
    await this.checkPeriodLock(orgId, billDate);

    // Duplicate Vendor Invoice Number Guard
    if (data.vendorInvoiceNumber && data.vendorId) {
      const dupCheck = await db.query(
        `SELECT id FROM bills WHERE organization_id = $1 AND vendor_id = $2 AND vendor_invoice_number = $3 AND status != 'VOIDED'`,
        [orgId, data.vendorId, data.vendorInvoiceNumber]
      );
      if (dupCheck.rows.length > 0) {
        throw new Error(`Duplicate Vendor Invoice Number '${data.vendorInvoiceNumber}' already exists for this vendor.`);
      }
    }

    const id = data.id || `bill-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const billNum = data.billNumber || `BILL-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const subtotal = data.subtotal || 0;
    const taxTotal = data.taxTotal || 0;
    const discount = data.discount || 0;
    const roundOff = data.roundOffAmount || 0;
    const totalAmount = data.totalAmount || Math.round((subtotal + taxTotal - discount + roundOff) * 100) / 100;
    const amountPaid = data.amountPaid || 0;
    const balanceDue = Math.round((totalAmount - amountPaid) * 100) / 100;

    let status: BillModel['status'] = data.status || 'POSTED';
    if (status === 'POSTED') {
      if (balanceDue === 0) status = 'PAID';
      else if (amountPaid > 0) status = 'PARTIALLY_PAID';
      else status = 'POSTED';
    }

    // Double-Entry GL Posting for Vendor Bill
    // Debit: Expense / Inventory Account
    // Debit: GST Input Tax Credit (acc-gst-input / 2110)
    // Credit: Accounts Payable (acc-ap-control / 2000)
    let journalEntryId: string | undefined;

    if (status !== 'DRAFT') {
      const glLines: any[] = [];

      const itemsList = data.lineItems || (data as any).items || [];
      // Line items or aggregate expense debit
      if (itemsList.length > 0) {
        for (const item of itemsList) {
          glLines.push({
            accountId: item.accountId || 'acc-expense',
            accountCode: item.accountCode || '5000',
            accountName: item.accountName || 'Operating Expense',
            debit: item.amount || (item.quantity * item.unitPrice),
            credit: 0,
            description: item.description || `Bill ${billNum} Line Item`,
          });
        }
      } else {
        glLines.push({
          accountId: 'acc-expense',
          accountCode: '5000',
          accountName: 'Operating Expense',
          debit: subtotal - discount,
          credit: 0,
          description: `Bill ${billNum} Expense`,
        });
      }

      // Tax Input Credit
      if (taxTotal > 0) {
        glLines.push({
          accountId: 'acc-gst-input',
          accountCode: '2110',
          accountName: 'GST Input Tax Credit',
          debit: taxTotal,
          credit: 0,
          description: `GST Input Tax Credit for ${billNum}`,
        });
      }

      // AP Control Account Credit
      glLines.push({
        accountId: 'acc-ap-control',
        accountCode: '2000',
        accountName: 'Accounts Payable',
        debit: 0,
        credit: totalAmount,
        description: `Vendor Bill ${billNum} Payable to ${data.vendorName}`,
      });

      journalEntryId = await this.persistJournalEntry(
        orgId,
        `JE-BILL-${billNum}`,
        billDate,
        data.vendorInvoiceNumber || billNum,
        `Vendor Bill ${billNum} posted for ${data.vendorName}`,
        glLines
      );
    }

    // Persist into `bills` table
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_invoice_number, purchase_order_id, vendor_id, vendor_name, vendor_email, bill_date, due_date, subtotal, tax_total, discount, round_off_amount, total_amount, amount_paid, amount_debited, amount_written_off, balance_due, status, notes, line_items, journal_entry_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
      [
        id,
        orgId,
        billNum,
        data.vendorInvoiceNumber || billNum,
        data.purchaseOrderId || null,
        data.vendorId,
        data.vendorName || 'Vendor',
        data.vendorEmail || '',
        billDate,
        data.dueDate || billDate,
        subtotal,
        taxTotal,
        discount,
        roundOff,
        totalAmount,
        amountPaid,
        0,
        0,
        balanceDue,
        status,
        data.notes || '',
        JSON.stringify(data.lineItems || []),
        journalEntryId || null,
        now,
      ]
    );

    // Update PO billed amount if linked
    if (data.purchaseOrderId) {
      await db.query(
        `UPDATE purchase_orders SET billed_amount = billed_amount + $1, status = CASE WHEN billed_amount + $1 >= total_amount THEN 'BILLED' ELSE 'PARTIALLY_BILLED' END WHERE organization_id = $2 AND id = $3`,
        [totalAmount, orgId, data.purchaseOrderId]
      );
    }

    // Update Vendor Payables Balance
    await db.query(
      `UPDATE vendors SET payables_balance = payables_balance + $1 WHERE organization_id = $2 AND id = $3`,
      [balanceDue, orgId, data.vendorId]
    );

    // Audit Log
    await db.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, timestamp, after_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        `audit-${Date.now()}`,
        orgId,
        'SYSTEM',
        'CREATE_BILL',
        'BILL',
        id,
        now,
        JSON.stringify({ billNumber: billNum, totalAmount, balanceDue }),
      ]
    );

    return {
      id,
      organizationId: orgId,
      billNumber: billNum,
      vendorInvoiceNumber: data.vendorInvoiceNumber || billNum,
      purchaseOrderId: data.purchaseOrderId,
      vendorId: data.vendorId!,
      vendorName: data.vendorName || 'Vendor',
      vendorEmail: data.vendorEmail,
      billDate,
      dueDate: data.dueDate || billDate,
      subtotal,
      taxTotal,
      discount,
      roundOffAmount: roundOff,
      totalAmount,
      amountPaid,
      amountDebited: 0,
      amountWrittenOff: 0,
      balanceDue,
      status,
      lineItems: data.lineItems || [],
      notes: data.notes || '',
      journalEntryId,
      createdAt: now,
    };
  }

  public static async getBill(orgId: string, id: string): Promise<BillModel | null> {
    const res = await db.query(
      `SELECT * FROM bills WHERE organization_id = $1 AND id = $2`,
      [orgId, id]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      billNumber: r.bill_number,
      vendorInvoiceNumber: r.vendor_invoice_number || r.bill_number,
      purchaseOrderId: r.purchase_order_id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      vendorEmail: r.vendor_email,
      billDate: r.bill_date,
      dueDate: r.due_date,
      subtotal: Number(r.subtotal || 0),
      taxTotal: Number(r.tax_total || 0),
      discount: Number(r.discount || 0),
      roundOffAmount: Number(r.round_off_amount || 0),
      totalAmount: Number(r.total_amount || 0),
      amountPaid: Number(r.amount_paid || 0),
      amountDebited: Number(r.amount_debited || 0),
      amountWrittenOff: Number(r.amount_written_off || 0),
      balanceDue: Number(r.balance_due || 0),
      status: r.status,
      lineItems: typeof r.line_items === 'string' ? JSON.parse(r.line_items || '[]') : r.line_items,
      notes: r.notes,
      journalEntryId: r.journal_entry_id,
      createdAt: r.created_at,
    };
  }

  // -------------------------------------------------------------
  // 5. VENDOR PAYMENTS & ALLOCATION
  // -------------------------------------------------------------
  public static async recordVendorPayment(
    orgId: string,
    data: Partial<VendorPaymentModel>
  ): Promise<VendorPaymentModel> {
    const paymentDate = data.paymentDate || new Date().toISOString().split('T')[0];
    await this.checkPeriodLock(orgId, paymentDate);

    const amount = data.amount || 0;
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const allocations = data.allocations || [];
    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);

    if (totalAllocated > amount) {
      throw new Error(`Total allocated amount (${totalAllocated}) cannot exceed payment amount (${amount}).`);
    }

    // Validate allocations against bill balances
    for (const alloc of allocations) {
      const bill = await this.getBill(orgId, alloc.billId);
      if (!bill) throw new Error(`Bill ${alloc.billId} not found.`);
      if (alloc.amount > bill.balanceDue + 0.01) {
        throw new Error(`Allocation amount (${alloc.amount}) exceeds Bill balance due (${bill.balanceDue}).`);
      }
    }

    const id = data.id || `pmt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const pmtNum = data.paymentNumber || `VP-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();
    const unallocatedAmount = Math.round((amount - totalAllocated) * 100) / 100;

    // GL Posting for Vendor Payment
    // Debit: Accounts Payable (acc-ap-control / 2000)
    // Credit: Bank / Cash Account (paidFromAccountId / 1010)
    const journalEntryId = await this.persistJournalEntry(
      orgId,
      `JE-PMT-${pmtNum}`,
      paymentDate,
      data.reference || pmtNum,
      `Vendor Payment ${pmtNum} to ${data.vendorName}`,
      [
        {
          accountId: 'acc-ap-control',
          accountCode: '2000',
          accountName: 'Accounts Payable',
          debit: amount,
          credit: 0,
          description: `AP Settlement for ${data.vendorName}`,
        },
        {
          accountId: data.paidFromAccountId || 'acc-bank-1',
          accountCode: '1010',
          accountName: 'Bank Account',
          debit: 0,
          credit: amount,
          description: `Outflow via ${data.paymentMode || 'Bank Transfer'}`,
        },
      ]
    );

    // Persist Payment
    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, reference, notes, unallocated_amount, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        orgId,
        pmtNum,
        data.vendorId,
        data.vendorName || 'Vendor',
        paymentDate,
        amount,
        data.paymentMode || 'Bank Transfer',
        data.paidFromAccountId || 'acc-bank-1',
        data.reference || '',
        data.notes || '',
        unallocatedAmount,
        unallocatedAmount > 0 ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED',
        now,
      ]
    );

    // Apply allocations
    for (const alloc of allocations) {
      await db.query(
        `INSERT INTO payment_made_allocations (id, organization_id, payment_id, bill_id, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [`alloc-${Date.now()}-${Math.random()}`, orgId, id, alloc.billId, alloc.amount]
      );

      // Update Bill
      const billRes = await db.query(
        `SELECT total_amount, amount_paid, amount_debited, amount_written_off FROM bills WHERE organization_id = $1 AND id = $2`,
        [orgId, alloc.billId]
      );
      if (billRes.rows.length > 0) {
        const b = billRes.rows[0];
        const newPaid = Number(b.amount_paid) + alloc.amount;
        const total = Number(b.total_amount);
        const debited = Number(b.amount_debited || 0);
        const writtenOff = Number(b.amount_written_off || 0);
        const newBal = Math.max(0, Math.round((total - newPaid - debited - writtenOff) * 100) / 100);

        let newStatus = 'PARTIALLY_PAID';
        if (newBal === 0) newStatus = 'PAID';

        await db.query(
          `UPDATE bills SET amount_paid = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
          [newPaid, newBal, newStatus, orgId, alloc.billId]
        );
      }
    }

    // Update Vendor Payables Balance
    await db.query(
      `UPDATE vendors SET payables_balance = CASE WHEN payables_balance - $1 < 0 THEN 0 ELSE payables_balance - $1 END WHERE organization_id = $2 AND id = $3`,
      [totalAllocated, orgId, data.vendorId]
    );

    return {
      id,
      organizationId: orgId,
      paymentNumber: pmtNum,
      vendorId: data.vendorId!,
      vendorName: data.vendorName || 'Vendor',
      paymentDate,
      amount,
      paymentMode: data.paymentMode || 'Bank Transfer',
      paidFromAccountId: data.paidFromAccountId || 'acc-bank-1',
      reference: data.reference,
      notes: data.notes,
      unallocatedAmount,
      status: unallocatedAmount > 0 ? 'PARTIALLY_ALLOCATED' : 'ALLOCATED',
      allocations,
      journalEntryId,
      createdAt: now,
    };
  }

  // -------------------------------------------------------------
  // 6. VENDOR ADVANCES & ADVANCE APPLICATION
  // -------------------------------------------------------------
  public static async recordVendorAdvance(
    orgId: string,
    data: { vendorId: string; vendorName?: string; amount: number; paidDate: string; paidFromAccountId: string; reference?: string; notes?: string }
  ): Promise<any> {
    await this.checkPeriodLock(orgId, data.paidDate);

    if (data.amount <= 0) throw new Error('Advance amount must be greater than zero.');

    const advId = `vadv-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    // GL Posting for Vendor Advance
    // Debit: Vendor Advances Asset (acc-vendor-advances / 1200)
    // Credit: Bank / Cash Account (paidFromAccountId)
    const journalEntryId = await this.persistJournalEntry(
      orgId,
      `JE-VADV-${advId}`,
      data.paidDate,
      data.reference || advId,
      `Vendor Advance paid to ${data.vendorName || data.vendorId}`,
      [
        {
          accountId: 'acc-vendor-advances',
          accountCode: '1200',
          accountName: 'Vendor Advances Asset',
          debit: data.amount,
          credit: 0,
          description: `Prepayment / Advance to vendor`,
        },
        {
          accountId: data.paidFromAccountId,
          accountCode: '1010',
          accountName: 'Bank Account',
          debit: 0,
          credit: data.amount,
          description: `Bank outflow for Vendor Advance`,
        },
      ]
    );

    await db.query(
      `INSERT INTO vendor_advances (id, organization_id, vendor_id, amount, unapplied_amount, paid_date, status, journal_entry_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [advId, orgId, data.vendorId, data.amount, data.amount, data.paidDate, 'UNAPPLIED', journalEntryId, now]
    );

    await db.query(
      `UPDATE vendors SET advance_balance = advance_balance + $1 WHERE organization_id = $2 AND id = $3`,
      [data.amount, orgId, data.vendorId]
    );

    return { id: advId, organizationId: orgId, vendorId: data.vendorId, amount: data.amount, unappliedAmount: data.amount, paidDate: data.paidDate, journalEntryId };
  }

  public static async applyVendorAdvance(
    orgId: string,
    data: { vendorId: string; advanceId: string; billId: string; amount: number; appliedDate: string }
  ): Promise<any> {
    await this.checkPeriodLock(orgId, data.appliedDate);

    // Fetch advance
    const advRes = await db.query(
      `SELECT * FROM vendor_advances WHERE organization_id = $1 AND id = $2 AND vendor_id = $3`,
      [orgId, data.advanceId, data.vendorId]
    );
    if (advRes.rows.length === 0) throw new Error('Vendor advance not found.');
    const adv = advRes.rows[0];
    const unapplied = Number(adv.unapplied_amount);

    if (data.amount > unapplied) {
      throw new Error(`Applied amount (${data.amount}) cannot exceed unapplied advance balance (${unapplied}).`);
    }

    // Fetch bill
    const bill = await this.getBill(orgId, data.billId);
    if (!bill) throw new Error('Bill not found.');
    if (data.amount > bill.balanceDue + 0.01) {
      throw new Error(`Applied advance (${data.amount}) cannot exceed Bill balance due (${bill.balanceDue}).`);
    }

    // GL Posting for Advance Application
    // Debit: Accounts Payable (acc-ap-control / 2000)
    // Credit: Vendor Advances Asset (acc-vendor-advances / 1200)
    const journalEntryId = await this.persistJournalEntry(
      orgId,
      `JE-ADV-APP-${Date.now()}`,
      data.appliedDate,
      bill.billNumber,
      `Vendor advance applied to Bill ${bill.billNumber}`,
      [
        {
          accountId: 'acc-ap-control',
          accountCode: '2000',
          accountName: 'Accounts Payable',
          debit: data.amount,
          credit: 0,
          description: `AP Settlement via Vendor Advance`,
        },
        {
          accountId: 'acc-vendor-advances',
          accountCode: '1200',
          accountName: 'Vendor Advances Asset',
          debit: 0,
          credit: data.amount,
          description: `Vendor advance drawn down for Bill ${bill.billNumber}`,
        },
      ]
    );

    // Update Advance
    const newUnapplied = Math.round((unapplied - data.amount) * 100) / 100;
    const newAdvStatus = newUnapplied === 0 ? 'APPLIED' : 'PARTIALLY_APPLIED';
    await db.query(
      `UPDATE vendor_advances SET unapplied_amount = $1, status = $2 WHERE organization_id = $3 AND id = $4`,
      [newUnapplied, newAdvStatus, orgId, data.advanceId]
    );

    // Update Bill
    const newPaid = Math.round((bill.amountPaid + data.amount) * 100) / 100;
    const newBal = Math.max(0, Math.round((bill.totalAmount - newPaid - (bill.amountDebited || 0) - (bill.amountWrittenOff || 0)) * 100) / 100);
    const newBillStatus = newBal === 0 ? 'PAID' : 'PARTIALLY_PAID';

    await db.query(
      `UPDATE bills SET amount_paid = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
      [newPaid, newBal, newBillStatus, orgId, data.billId]
    );

    // Update Vendor Balances
    await db.query(
      `UPDATE vendors SET advance_balance = CASE WHEN advance_balance - $1 < 0 THEN 0 ELSE advance_balance - $1 END, payables_balance = CASE WHEN payables_balance - $1 < 0 THEN 0 ELSE payables_balance - $1 END WHERE organization_id = $2 AND id = $3`,
      [data.amount, orgId, data.vendorId]
    );

    return { success: true, advanceId: data.advanceId, billId: data.billId, amountApplied: data.amount, remainingAdvance: newUnapplied, newBillBalance: newBal, journalEntryId };
  }

  // -------------------------------------------------------------
  // 7. DEBIT NOTES / VENDOR CREDITS
  // -------------------------------------------------------------
  public static async createDebitNote(orgId: string, data: Partial<DebitNoteModel>): Promise<DebitNoteModel> {
    const date = data.date || new Date().toISOString().split('T')[0];
    await this.checkPeriodLock(orgId, date);

    const id = data.id || `dn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const dnNum = data.debitNoteNumber || `DN-${Math.floor(10000 + Math.random() * 90000)}`;
    const now = new Date().toISOString();

    const taxableAmount = data.taxableAmount || 0;
    const taxAmount = data.taxAmount || 0;
    const totalAmount = data.totalAmount || Math.round((taxableAmount + taxAmount) * 100) / 100;

    // GL Posting for Debit Note
    // Debit: Accounts Payable (acc-ap-control / 2000)
    // Credit: Purchase Return / Operating Expense (5000)
    // Credit: GST Input Tax Credit Reversal (2110) if tax exists
    const glLines: any[] = [
      {
        accountId: 'acc-ap-control',
        accountCode: '2000',
        accountName: 'Accounts Payable',
        debit: totalAmount,
        credit: 0,
        description: `Debit Note ${dnNum} issued to ${data.vendorName}`,
      },
      {
        accountId: 'acc-expense',
        accountCode: '5000',
        accountName: 'Operating Expense / Purchase Return',
        debit: 0,
        credit: taxableAmount,
        description: `Purchase return adjustment`,
      },
    ];

    if (taxAmount > 0) {
      glLines.push({
        accountId: 'acc-gst-input',
        accountCode: '2110',
        accountName: 'GST Input Tax Credit',
        debit: 0,
        credit: taxAmount,
        description: `GST Input Tax Credit reversal for ${dnNum}`,
      });
    }

    const journalEntryId = await this.persistJournalEntry(
      orgId,
      `JE-DN-${dnNum}`,
      date,
      dnNum,
      `Debit Note ${dnNum} issued to ${data.vendorName}`,
      glLines
    );

    let remainingCredit = totalAmount;
    let billId = data.billId;

    // If linked directly to a bill, apply immediately
    if (billId) {
      const bill = await this.getBill(orgId, billId);
      if (bill && bill.balanceDue > 0) {
        const applied = Math.min(bill.balanceDue, totalAmount);
        remainingCredit = Math.round((totalAmount - applied) * 100) / 100;

        const newDebited = Math.round(((bill.amountDebited || 0) + applied) * 100) / 100;
        const newBal = Math.max(0, Math.round((bill.totalAmount - bill.amountPaid - newDebited - (bill.amountWrittenOff || 0)) * 100) / 100);
        const newBillStatus = newBal === 0 ? 'PAID' : 'PARTIALLY_PAID';

        await db.query(
          `UPDATE bills SET amount_debited = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
          [newDebited, newBal, newBillStatus, orgId, billId]
        );

        await db.query(
          `INSERT INTO debit_note_applications (id, organization_id, debit_note_id, bill_id, amount_applied, applied_date, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [`dnapp-${Date.now()}`, orgId, id, billId, applied, date, now]
        );

        // Reduce payables balance
        await db.query(
          `UPDATE vendors SET payables_balance = CASE WHEN payables_balance - $1 < 0 THEN 0 ELSE payables_balance - $1 END WHERE organization_id = $2 AND id = $3`,
          [applied, orgId, data.vendorId]
        );
      }
    }

    const status = remainingCredit === 0 ? 'CLOSED' : remainingCredit < totalAmount ? 'PARTIALLY_APPLIED' : 'OPEN';

    await db.query(
      `INSERT INTO vendor_credits (id, organization_id, credit_number, debit_note_number, vendor_id, vendor_name, bill_id, date, taxable_amount, tax_amount, total_amount, remaining_credit, status, reason, journal_entry_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        id,
        orgId,
        dnNum,
        dnNum,
        data.vendorId,
        data.vendorName || 'Vendor',
        billId || null,
        date,
        taxableAmount,
        taxAmount,
        totalAmount,
        remainingCredit,
        status,
        data.reason || '',
        journalEntryId,
        now,
      ]
    );

    if (remainingCredit > 0) {
      await db.query(
        `UPDATE vendors SET unused_credits = unused_credits + $1 WHERE organization_id = $2 AND id = $3`,
        [remainingCredit, orgId, data.vendorId]
      );
    }

    return {
      id,
      organizationId: orgId,
      debitNoteNumber: dnNum,
      vendorId: data.vendorId!,
      vendorName: data.vendorName || 'Vendor',
      billId,
      date,
      taxableAmount,
      taxAmount,
      totalAmount,
      remainingCredit,
      status,
      reason: data.reason || '',
      journalEntryId,
      createdAt: now,
    };
  }

  // -------------------------------------------------------------
  // 8. AP WRITE-OFF / DISCOUNT ADJUSTMENT
  // -------------------------------------------------------------
  public static async recordAPWriteOff(
    orgId: string,
    data: { billId: string; vendorId: string; writeOffDate: string; amount: number; writeOffAccountId: string; reason?: string; userId?: string }
  ): Promise<any> {
    await this.checkPeriodLock(orgId, data.writeOffDate);

    const bill = await this.getBill(orgId, data.billId);
    if (!bill) throw new Error('Bill not found.');
    if (data.amount > bill.balanceDue + 0.01) {
      throw new Error(`Write-off amount (${data.amount}) exceeds Bill balance due (${bill.balanceDue}).`);
    }

    // GL Posting for AP Write-off / Purchase Discount
    // Debit: Accounts Payable (acc-ap-control / 2000)
    // Credit: Purchase Discount / Recovery Account (writeOffAccountId)
    const journalEntryId = await this.persistJournalEntry(
      orgId,
      `JE-AP-WO-${Date.now()}`,
      data.writeOffDate,
      bill.billNumber,
      `AP Write-off / Purchase Discount for Bill ${bill.billNumber}`,
      [
        {
          accountId: 'acc-ap-control',
          accountCode: '2000',
          accountName: 'Accounts Payable',
          debit: data.amount,
          credit: 0,
          description: `AP Write-off / Discount clearance`,
        },
        {
          accountId: data.writeOffAccountId || 'acc-purchase-discount',
          accountCode: '5100',
          accountName: 'Purchase Discount / Recovery',
          debit: 0,
          credit: data.amount,
          description: `Write-off reason: ${data.reason || 'Discount / Variance'}`,
        },
      ]
    );

    const newWrittenOff = Math.round(((bill.amountWrittenOff || 0) + data.amount) * 100) / 100;
    const newBal = Math.max(0, Math.round((bill.totalAmount - bill.amountPaid - (bill.amountDebited || 0) - newWrittenOff) * 100) / 100);
    const newStatus = newBal === 0 ? 'WRITTEN_OFF' : bill.status;

    await db.query(
      `UPDATE bills SET amount_written_off = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
      [newWrittenOff, newBal, newStatus, orgId, data.billId]
    );

    await db.query(
      `INSERT INTO ap_write_offs (id, organization_id, bill_id, vendor_id, write_off_date, amount, write_off_account_id, reason, user_id, journal_entry_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        `apwo-${Date.now()}`,
        orgId,
        data.billId,
        data.vendorId,
        data.writeOffDate,
        data.amount,
        data.writeOffAccountId,
        data.reason || '',
        data.userId || 'SYSTEM',
        journalEntryId,
        new Date().toISOString(),
      ]
    );

    await db.query(
      `UPDATE vendors SET payables_balance = CASE WHEN payables_balance - $1 < 0 THEN 0 ELSE payables_balance - $1 END WHERE organization_id = $2 AND id = $3`,
      [data.amount, orgId, data.vendorId]
    );

    return { success: true, billId: data.billId, writeOffAmount: data.amount, newBalanceDue: newBal, journalEntryId };
  }

  // -------------------------------------------------------------
  // 9. VENDOR STATEMENT OF ACCOUNT
  // -------------------------------------------------------------
  public static async getVendorStatement(orgId: string, vendorId: string, startDate?: string, endDate?: string): Promise<any> {
    const vendor = await this.getVendor(orgId, vendorId);
    if (!vendor) throw new Error('Vendor not found.');

    const billsRes = await db.query(
      `SELECT * FROM bills WHERE organization_id = $1 AND vendor_id = $2 AND status != 'DRAFT' AND status != 'VOIDED'`,
      [orgId, vendorId]
    );

    const pmtsRes = await db.query(
      `SELECT * FROM payments_made WHERE organization_id = $1 AND vendor_id = $2`,
      [orgId, vendorId]
    );

    const dnRes = await db.query(
      `SELECT * FROM vendor_credits WHERE organization_id = $1 AND vendor_id = $2 AND status != 'VOID'`,
      [orgId, vendorId]
    );

    const timeline: any[] = [];

    billsRes.rows.forEach((b) => {
      timeline.push({
        id: b.id,
        date: b.bill_date,
        type: 'Bill',
        refNumber: b.vendor_invoice_number || b.bill_number,
        description: `Vendor Bill - ${b.status}`,
        debit: Number(b.total_amount), // Increase in AP
        credit: 0,
      });
    });

    pmtsRes.rows.forEach((p) => {
      timeline.push({
        id: p.id,
        date: p.payment_date,
        type: 'Vendor Payment',
        refNumber: p.payment_number,
        description: `Payment via ${p.payment_mode || 'Bank'}`,
        debit: 0,
        credit: Number(p.amount), // Decrease in AP
      });
    });

    dnRes.rows.forEach((dn) => {
      timeline.push({
        id: dn.id,
        date: dn.date,
        type: 'Debit Note',
        refNumber: dn.debit_note_number || dn.credit_number,
        description: `Debit Note - ${dn.reason || 'Adjustment'}`,
        debit: 0,
        credit: Number(dn.total_amount), // Decrease in AP
      });
    });

    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = vendor.openingBalance || 0;
    const ledger = timeline.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, balance: Math.round(runningBalance * 100) / 100 };
    });

    const totalDebits = timeline.reduce((s, t) => s + t.debit, 0);
    const totalCredits = timeline.reduce((s, t) => s + t.credit, 0);
    const netBalanceDue = Math.round((totalDebits - totalCredits) * 100) / 100;

    return {
      vendor,
      ledger,
      totalDebits,
      totalCredits,
      netBalanceDue,
    };
  }

  // -------------------------------------------------------------
  // 10. ACCOUNTS PAYABLE (AP) AGING REPORT
  // -------------------------------------------------------------
  public static async getAPAgingReport(orgId: string, asOfDateStr?: string): Promise<any> {
    const asOfDate = asOfDateStr ? new Date(asOfDateStr) : new Date();

    const res = await db.query(
      `SELECT * FROM bills WHERE organization_id = $1 AND balance_due > 0 AND status != 'DRAFT' AND status != 'VOIDED'`,
      [orgId]
    );

    const agingBuckets: Record<string, { vendorName: string; current: number; days31_60: number; days61_90: number; days91Plus: number; total: number }> = {};

    res.rows.forEach((r) => {
      const vId = r.vendor_id;
      const vName = r.vendor_name || 'Vendor';
      const bal = Number(r.balance_due);
      const dueDate = new Date(r.due_date || r.bill_date);

      const diffDays = Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 3600 * 24));

      if (!agingBuckets[vId]) {
        agingBuckets[vId] = {
          vendorName: vName,
          current: 0,
          days31_60: 0,
          days61_90: 0,
          days91Plus: 0,
          total: 0,
        };
      }

      const b = agingBuckets[vId];
      b.total = Math.round((b.total + bal) * 100) / 100;

      if (diffDays <= 30) {
        b.current = Math.round((b.current + bal) * 100) / 100;
      } else if (diffDays <= 60) {
        b.days31_60 = Math.round((b.days31_60 + bal) * 100) / 100;
      } else if (diffDays <= 90) {
        b.days61_90 = Math.round((b.days61_90 + bal) * 100) / 100;
      } else {
        b.days91Plus = Math.round((b.days91Plus + bal) * 100) / 100;
      }
    });

    const vendorSummary = Object.values(agingBuckets);
    const totals = vendorSummary.reduce(
      (acc, v) => ({
        current: acc.current + v.current,
        days31_60: acc.days31_60 + v.days31_60,
        days61_90: acc.days61_90 + v.days61_90,
        days91Plus: acc.days91Plus + v.days91Plus,
        total: acc.total + v.total,
      }),
      { current: 0, days31_60: 0, days61_90: 0, days91Plus: 0, total: 0 }
    );

    return {
      asOfDate: asOfDate.toISOString().split('T')[0],
      vendors: vendorSummary,
      totals,
    };
  }
}
