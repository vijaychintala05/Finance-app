import crypto from 'crypto';
import { db } from '../database/db';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { ItemMasterService } from '../services/ItemMasterService';
import { SalesEngine, EstimateModel, SalesOrderModel, InvoiceModel } from './SalesEngine';

export interface QuotationLineItem {
  id?: string;
  itemId?: string;
  itemName?: string;
  name?: string;
  description?: string;
  hsnSac?: string;
  quantity: number;
  unit?: string;
  rate: number;
  discountPercent?: number;
  discountAmount?: number;
  allocatedOverallDiscount?: number;
  taxableAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  lineTotal?: number;
  totalAmount?: number;
}

export interface DetailedQuotationModel extends EstimateModel {
  terms?: string;
  notes?: string;
  publicToken?: string;
  items?: QuotationLineItem[];
  overallDiscount?: number;
  roundOffAmount?: number;
  isGstInclusive?: boolean;
  templateId?: string;
  validityDays?: number;
  customerResponseNotes?: string;
}

export interface QuotationTemplateModel {
  id: string;
  organizationId: string;
  name: string;
  templateType: 'Classic' | 'Modern' | 'Minimalist' | 'Compact';
  primaryColor: string;
  fontFamily: string;
  showLogo: boolean;
  logoUrl?: string;
  companyInfo?: any;
  showTaxBreakdown: boolean;
  showSignature: boolean;
  termsAndConditions?: string;
  bankDetails?: string;
  footerNote?: string;
  isDefault: boolean;
}

export class QuotationEngine {
  private static roundMoney(val: number): number {
    return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Validate quotation line items authoritatively
   */
  public static validateQuotationLines(items: QuotationLineItem[]) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('Quotation must contain at least one line item');
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const name = item.name || item.itemName;
      if (!name || typeof name !== 'string' || !name.trim()) {
        throw new Error(`Line ${i + 1}: Line item name or title is required`);
      }

      const unit = item.unit;
      if (unit !== undefined && (typeof unit !== 'string' || !unit.trim())) {
        throw new Error(`Line ${i + 1}: Unit cannot be empty`);
      }

      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Line ${i + 1}: Quantity must be greater than 0`);
      }

      const rate = Number(item.rate);
      if (isNaN(rate) || rate < 0) {
        throw new Error(`Line ${i + 1}: Rate must be a non-negative number`);
      }

      const discPct = Number(item.discountPercent || 0);
      if (isNaN(discPct) || discPct < 0 || discPct > 100) {
        throw new Error(`Line ${i + 1}: Discount percentage must be between 0 and 100`);
      }

      const gross = qty * rate;
      const discAmt = Number(item.discountAmount || 0);
      if (isNaN(discAmt) || discAmt < 0) {
        throw new Error(`Line ${i + 1}: Discount amount cannot be negative`);
      }
      if (discAmt > gross) {
        throw new Error(`Line ${i + 1}: Discount amount cannot exceed line gross value`);
      }

      const taxRate = Number(item.taxRate || 0);
      if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
        throw new Error(`Line ${i + 1}: Tax rate must be between 0 and 100`);
      }
    }
  }

  /**
   * Validate cross-organization item references and active status
   */
  public static async validateItemReferences(orgId: string, items: QuotationLineItem[], isNewQuotation: boolean = true) {
    for (const item of items) {
      if (item.itemId) {
        let masterItem;
        try {
          masterItem = await ItemMasterService.getItem(orgId, item.itemId);
        } catch {
          throw new Error(`Item ${item.itemId} does not belong to organization ${orgId}`);
        }

        if (masterItem.organizationId !== orgId) {
          throw new Error(`Item ${item.itemId} does not belong to organization ${orgId}`);
        }

        if (isNewQuotation && !masterItem.isActive) {
          throw new Error(`Item ${item.itemId} ("${masterItem.name}") is inactive and cannot be selected for new quotations`);
        }
      }
    }
  }

  /**
   * Calculate totals with support for line discount, proportional overall discount allocation, GST inclusive/exclusive, and rounding
   */
  public static calculateQuotationTotals(
    items: QuotationLineItem[],
    overallDiscount: number = 0,
    isGstInclusive: boolean = false,
    roundOff: number = 0
  ) {
    this.validateQuotationLines(items);

    const ovDisc = this.roundMoney(overallDiscount);
    if (ovDisc < 0) {
      throw new Error('Overall discount cannot be negative');
    }

    // Step 1: Pre-calculate line gross and line discounts
    const linePreTotals: Array<{
      qty: number;
      rate: number;
      gross: number;
      lineDiscAmt: number;
      lineTaxablePreDocDisc: number;
      taxRate: number;
    }> = [];

    let subtotalPreDocDisc = 0;
    let lineDiscountsTotal = 0;

    for (const item of items) {
      if (!item.id) item.id = `qitem-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      if (!item.itemName && item.name) item.itemName = item.name;
      if (!item.name && item.itemName) item.name = item.itemName;
      if (!item.unit) item.unit = 'Pcs';

      const qty = this.roundMoney(item.quantity);
      const rate = this.roundMoney(item.rate);
      const gross = this.roundMoney(qty * rate);

      const discPct = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
      let discAmt = 0;
      if (item.discountAmount !== undefined && Number(item.discountAmount) > 0) {
        discAmt = this.roundMoney(item.discountAmount);
      } else if (discPct > 0) {
        discAmt = this.roundMoney(gross * (discPct / 100));
      }
      discAmt = Math.min(discAmt, gross);

      const lineTaxablePreDocDisc = this.roundMoney(gross - discAmt);
      const taxRate = Math.max(0, Number(item.taxRate) || 0);

      subtotalPreDocDisc += lineTaxablePreDocDisc;
      lineDiscountsTotal += discAmt;

      linePreTotals.push({
        qty,
        rate,
        gross,
        lineDiscAmt: discAmt,
        lineTaxablePreDocDisc,
        taxRate,
      });
    }

    subtotalPreDocDisc = this.roundMoney(subtotalPreDocDisc);
    lineDiscountsTotal = this.roundMoney(lineDiscountsTotal);

    if (ovDisc > subtotalPreDocDisc) {
      throw new Error(`Overall discount (${ovDisc}) cannot exceed quotation subtotal (${subtotalPreDocDisc})`);
    }

    // Step 2: Allocate overall discount proportionally across lines
    let allocatedSum = 0;
    let taxTotal = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const pre = linePreTotals[i];

      let lineAllocatedDocDisc = 0;
      if (subtotalPreDocDisc > 0 && ovDisc > 0) {
        if (i === items.length - 1) {
          lineAllocatedDocDisc = this.roundMoney(ovDisc - allocatedSum);
        } else {
          lineAllocatedDocDisc = this.roundMoney((pre.lineTaxablePreDocDisc / subtotalPreDocDisc) * ovDisc);
          allocatedSum += lineAllocatedDocDisc;
        }
      }

      const netLineTaxable = this.roundMoney(pre.lineTaxablePreDocDisc - lineAllocatedDocDisc);

      item.quantity = pre.qty;
      item.rate = pre.rate;
      item.discountAmount = pre.lineDiscAmt;
      item.discountPercent = pre.gross > 0 ? this.roundMoney((pre.lineDiscAmt / pre.gross) * 100) : 0;
      item.allocatedOverallDiscount = lineAllocatedDocDisc;
      item.taxRate = pre.taxRate;

      if (isGstInclusive) {
        const baseAmount = netLineTaxable / (1 + pre.taxRate / 100);
        const itemTax = netLineTaxable - baseAmount;
        const roundBase = this.roundMoney(baseAmount);
        const roundTax = this.roundMoney(itemTax);
        taxTotal += roundTax;
        item.taxableAmount = roundBase;
        item.taxAmount = roundTax;
        item.totalAmount = this.roundMoney(netLineTaxable);
        item.lineTotal = item.totalAmount;
      } else {
        const itemTax = netLineTaxable * (pre.taxRate / 100);
        const roundTax = this.roundMoney(itemTax);
        const roundTotal = this.roundMoney(netLineTaxable + roundTax);
        taxTotal += roundTax;
        item.taxableAmount = netLineTaxable;
        item.taxAmount = roundTax;
        item.totalAmount = roundTotal;
        item.lineTotal = roundTotal;
      }
    }

    taxTotal = this.roundMoney(taxTotal);
    const roundOffAmount = this.roundMoney(roundOff);
    const taxableTotal = isGstInclusive
      ? this.roundMoney(items.reduce((sum, it) => sum + (it.taxableAmount || 0), 0))
      : this.roundMoney(subtotalPreDocDisc - ovDisc);
    const finalTotal = isGstInclusive
      ? this.roundMoney(items.reduce((sum, it) => sum + (it.totalAmount || 0), 0) + roundOffAmount)
      : this.roundMoney(taxableTotal + taxTotal + roundOffAmount);

    return {
      subtotal: subtotalPreDocDisc,
      lineDiscountsTotal,
      overallDiscount: ovDisc,
      taxableTotal,
      taxTotal,
      roundOffAmount,
      totalAmount: finalTotal,
    };
  }

  /**
   * Create a new detailed Quotation
   */
  public static async createQuotation(
    orgId: string,
    data: Partial<DetailedQuotationModel>,
    createdBy: string = 'User'
  ): Promise<DetailedQuotationModel> {
    const items: QuotationLineItem[] = data.items || data.lineItems || [];
    this.validateQuotationLines(items);
    await this.validateItemReferences(orgId, items, true);

    const id = data.id || `est-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const issueDate = data.issueDate || now.split('T')[0];

    const estNumber = data.estimateNumber || (await DocumentNumberingEngine.getNextNumber(orgId, 'QUOTATION', issueDate));
    const publicToken = data.publicToken || crypto.randomBytes(24).toString('hex');

    const totals = this.calculateQuotationTotals(
      items,
      data.overallDiscount || data.discount || 0,
      data.isGstInclusive || false,
      data.roundOffAmount || 0
    );

    const expiryDate = data.expiryDate || new Date(new Date(issueDate).getTime() + (data.validityDays || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await db.query(
      `INSERT INTO estimates (
        id, organization_id, estimate_number, revision_number, client_id, customer_id, client_name,
        issue_date, expiry_date, subtotal, tax_total, discount, overall_discount, total_amount,
        round_off_amount, is_gst_inclusive, status, terms, notes, public_token, items, line_items,
        template_id, validity_days, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
      [
        id,
        orgId,
        estNumber,
        0,
        data.customerId || (data as any).clientId || null,
        data.customerId || (data as any).clientId || null,
        data.customerName || (data as any).clientName || 'Valued Customer',
        issueDate,
        expiryDate,
        totals.subtotal,
        totals.taxTotal,
        totals.overallDiscount,
        totals.overallDiscount,
        totals.totalAmount,
        totals.roundOffAmount,
        Boolean(data.isGstInclusive),
        data.status || 'DRAFT',
        data.terms || 'Standard payment terms apply.',
        data.notes || '',
        publicToken,
        JSON.stringify(items),
        JSON.stringify(items),
        data.templateId || null,
        data.validityDays || 30,
        now,
      ]
    );

    // Initial Revision 0 snapshot
    await db.query(
      `INSERT INTO quotation_revisions (id, organization_id, quotation_id, revision_number, revision_data, total_amount, status, change_summary, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `qrev-${Date.now()}-0`,
        orgId,
        id,
        0,
        JSON.stringify({ estimateNumber: estNumber, items, totals, terms: data.terms, notes: data.notes }),
        totals.totalAmount,
        data.status || 'DRAFT',
        'Initial Quotation Created',
        createdBy,
        now,
      ]
    );

    return {
      id,
      organizationId: orgId,
      estimateNumber: estNumber,
      revisionNumber: 0,
      customerId: data.customerId || '',
      customerName: data.customerName || (data as any).clientName || 'Valued Customer',
      issueDate,
      expiryDate,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      discount: totals.overallDiscount,
      overallDiscount: totals.overallDiscount,
      totalAmount: totals.totalAmount,
      roundOffAmount: totals.roundOffAmount,
      isGstInclusive: Boolean(data.isGstInclusive),
      status: (data.status as any) || 'DRAFT',
      lineItems: items,
      items,
      terms: data.terms,
      notes: data.notes,
      publicToken,
      validityDays: data.validityDays || 30,
      createdAt: now,
    };
  }

  /**
   * Save a new revision of a quotation
   */
  public static async reviseQuotation(
    orgId: string,
    quotationId: string,
    newData: Partial<DetailedQuotationModel>,
    changeSummary: string = 'Updated quotation terms and items',
    createdBy: string = 'User'
  ): Promise<DetailedQuotationModel> {
    const existingRes = await db.query(`SELECT * FROM estimates WHERE organization_id = $1 AND id = $2`, [orgId, quotationId]);
    if (existingRes.rows.length === 0) throw new Error(`Quotation ${quotationId} not found`);
    const q = existingRes.rows[0];

    const nextRev = (q.revision_number || 0) + 1;
    const now = new Date().toISOString();

    const rawStored = q.items || q.line_items;
    let storedItems: QuotationLineItem[] = [];
    if (typeof rawStored === 'string') {
      try { storedItems = JSON.parse(rawStored); } catch { storedItems = []; }
    } else if (Array.isArray(rawStored)) {
      storedItems = rawStored;
    }

    const items: QuotationLineItem[] = newData.items || newData.lineItems || storedItems;
    this.validateQuotationLines(items);
    await this.validateItemReferences(orgId, items, false);

    const totals = this.calculateQuotationTotals(
      items,
      newData.overallDiscount !== undefined ? newData.overallDiscount : (q.overall_discount || q.discount || 0),
      newData.isGstInclusive !== undefined ? newData.isGstInclusive : Boolean(q.is_gst_inclusive),
      newData.roundOffAmount !== undefined ? newData.roundOffAmount : Number(q.round_off_amount || 0)
    );

    await db.query(
      `UPDATE estimates
       SET revision_number = $1, subtotal = $2, tax_total = $3, discount = $4, overall_discount = $5,
           total_amount = $6, round_off_amount = $7, is_gst_inclusive = $8, items = $9, line_items = $9,
           terms = COALESCE($10, terms), notes = COALESCE($11, notes), status = COALESCE($12, status)
       WHERE organization_id = $13 AND id = $14`,
      [
        nextRev,
        totals.subtotal,
        totals.taxTotal,
        totals.overallDiscount,
        totals.overallDiscount,
        totals.totalAmount,
        totals.roundOffAmount,
        newData.isGstInclusive !== undefined ? newData.isGstInclusive : Boolean(q.is_gst_inclusive),
        JSON.stringify(items),
        newData.terms,
        newData.notes,
        newData.status || 'SENT',
        orgId,
        quotationId,
      ]
    );

    await db.query(
      `INSERT INTO quotation_revisions (id, organization_id, quotation_id, revision_number, revision_data, total_amount, status, change_summary, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `qrev-${Date.now()}-${nextRev}`,
        orgId,
        quotationId,
        nextRev,
        JSON.stringify({ estimateNumber: q.estimate_number, items, totals, changeSummary }),
        totals.totalAmount,
        newData.status || 'SENT',
        changeSummary,
        createdBy,
        now,
      ]
    );

    return this.getQuotation(orgId, quotationId);
  }

  /**
   * Fetch quotation details
   */
  public static async getQuotation(orgId: string, quotationId: string): Promise<DetailedQuotationModel> {
    const res = await db.query(`SELECT * FROM estimates WHERE organization_id = $1 AND id = $2`, [orgId, quotationId]);
    if (res.rows.length === 0) throw new Error(`Quotation ${quotationId} not found`);
    const q = res.rows[0];

    const rawItems = q.items || q.line_items;
    let items = [];
    if (typeof rawItems === 'string') {
      try { items = JSON.parse(rawItems); } catch { items = []; }
    } else if (Array.isArray(rawItems)) {
      items = rawItems;
    }

    return {
      id: q.id,
      organizationId: q.organization_id,
      estimateNumber: q.estimate_number,
      revisionNumber: q.revision_number || 0,
      customerId: q.customer_id || q.client_id,
      customerName: q.client_name,
      issueDate: q.issue_date,
      expiryDate: q.expiry_date,
      subtotal: Number(q.subtotal || 0),
      taxTotal: Number(q.tax_total || 0),
      discount: Number(q.discount || 0),
      overallDiscount: Number(q.overall_discount || q.discount || 0),
      totalAmount: Number(q.total_amount || 0),
      roundOffAmount: Number(q.round_off_amount || 0),
      isGstInclusive: Boolean(q.is_gst_inclusive),
      status: q.status,
      lineItems: items,
      items,
      terms: q.terms,
      notes: q.notes,
      publicToken: q.public_token,
      validityDays: q.validity_days || 30,
      customerResponseNotes: q.customer_response_notes,
      createdAt: q.created_at,
    };
  }

  /**
   * Get public quotation by token (for customer approval portal)
   */
  public static async getPublicQuotationByToken(token: string): Promise<DetailedQuotationModel> {
    const res = await db.query(`SELECT * FROM estimates WHERE public_token = $1`, [token]);
    if (res.rows.length === 0) throw new Error(`Invalid or expired quotation token`);
    const q = res.rows[0];

    if (q.status === 'SENT') {
      await db.query(`UPDATE estimates SET status = 'VIEWED' WHERE id = $1`, [q.id]);
      q.status = 'VIEWED';
    }

    const rawItems = q.items || q.line_items;
    let items = [];
    if (typeof rawItems === 'string') {
      try { items = JSON.parse(rawItems); } catch { items = []; }
    } else if (Array.isArray(rawItems)) {
      items = rawItems;
    }

    return {
      id: q.id,
      organizationId: q.organization_id,
      estimateNumber: q.estimate_number,
      revisionNumber: q.revision_number || 0,
      customerId: q.customer_id || q.client_id,
      customerName: q.client_name,
      issueDate: q.issue_date,
      expiryDate: q.expiry_date,
      subtotal: Number(q.subtotal || 0),
      taxTotal: Number(q.tax_total || 0),
      discount: Number(q.discount || 0),
      overallDiscount: Number(q.overall_discount || 0),
      totalAmount: Number(q.total_amount || 0),
      roundOffAmount: Number(q.round_off_amount || 0),
      isGstInclusive: Boolean(q.is_gst_inclusive),
      status: q.status,
      lineItems: items,
      items,
      terms: q.terms,
      notes: q.notes,
      publicToken: q.public_token,
      validityDays: q.validity_days || 30,
      customerResponseNotes: q.customer_response_notes,
      createdAt: q.created_at,
    };
  }

  /**
   * Update quotation status via public token (ACCEPT, DECLINE, REQUEST_REVISION)
   */
  public static async updatePublicStatus(
    token: string,
    status: 'ACCEPTED' | 'DECLINED' | 'REVISION_REQUESTED',
    notes?: string
  ): Promise<any> {
    const q = await this.getPublicQuotationByToken(token);
    await db.query(
      `UPDATE estimates SET status = $1, customer_response_notes = $2 WHERE public_token = $3`,
      [status, notes || '', token]
    );
    return { quotationId: q.id, status, notes };
  }

  /**
   * Get all revisions for a quotation
   */
  public static async getQuotationRevisions(orgId: string, quotationId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM quotation_revisions WHERE organization_id = $1 AND quotation_id = $2 ORDER BY revision_number ASC`,
      [orgId, quotationId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      revisionNumber: r.revision_number,
      totalAmount: Number(r.total_amount),
      status: r.status,
      changeSummary: r.change_summary,
      createdBy: r.created_by,
      createdAt: r.created_at,
      data: typeof r.revision_data === 'string' ? JSON.parse(r.revision_data) : r.revision_data,
    }));
  }

  /**
   * Convert quotation to Sales Order
   */
  public static async convertToSalesOrder(orgId: string, quotationId: string): Promise<SalesOrderModel> {
    const q = await this.getQuotation(orgId, quotationId);
    
    const soNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'SALES_ORDER', new Date().toISOString().split('T')[0]);

    const so = await SalesEngine.createSalesOrder(orgId, {
      salesOrderNumber: soNumber,
      estimateId: q.id,
      customerId: q.customerId,
      customerName: q.customerName,
      orderDate: new Date().toISOString().split('T')[0],
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      discount: q.overallDiscount,
      totalAmount: q.totalAmount,
      lineItems: q.lineItems,
      notes: `Converted from Quotation ${q.estimateNumber}`,
    });

    await db.query(`UPDATE estimates SET status = 'CONVERTED' WHERE organization_id = $1 AND id = $2`, [orgId, quotationId]);

    return so;
  }

  /**
   * Convert quotation directly to Invoice
   */
  public static async convertToInvoice(orgId: string, quotationId: string): Promise<InvoiceModel> {
    const q = await this.getQuotation(orgId, quotationId);

    const invNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', new Date().toISOString().split('T')[0]);

    const inv = await SalesEngine.createAndPostInvoice(orgId, {
      invoiceNumber: invNumber,
      estimateId: q.id,
      customerId: q.customerId,
      customerName: q.customerName,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().split('T')[0],
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      discount: q.overallDiscount,
      totalAmount: q.totalAmount,
      balanceDue: q.totalAmount,
      status: 'POSTED',
      lineItems: q.lineItems,
      notes: `Converted from Quotation ${q.estimateNumber}`,
    });

    await db.query(`UPDATE estimates SET status = 'CONVERTED' WHERE organization_id = $1 AND id = $2`, [orgId, quotationId]);

    return inv;
  }

  /**
   * Save / update quotation visual template
   */
  public static async saveTemplate(orgId: string, data: Partial<QuotationTemplateModel>): Promise<QuotationTemplateModel> {
    const id = data.id || `tpl-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();

    if (data.isDefault) {
      await db.query(`UPDATE quotation_templates SET is_default = FALSE WHERE organization_id = $1`, [orgId]);
    }

    await db.query(
      `INSERT INTO quotation_templates (
        id, organization_id, name, template_type, primary_color, font_family, show_logo,
        logo_url, company_info, show_tax_breakdown, show_signature, terms_and_conditions, bank_details, footer_note, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, template_type = EXCLUDED.template_type, primary_color = EXCLUDED.primary_color,
        font_family = EXCLUDED.font_family, show_logo = EXCLUDED.show_logo, logo_url = EXCLUDED.logo_url,
        company_info = EXCLUDED.company_info, show_tax_breakdown = EXCLUDED.show_tax_breakdown,
        show_signature = EXCLUDED.show_signature, terms_and_conditions = EXCLUDED.terms_and_conditions,
        bank_details = EXCLUDED.bank_details, footer_note = EXCLUDED.footer_note, is_default = EXCLUDED.is_default,
        updated_at = EXCLUDED.updated_at`,
      [
        id,
        orgId,
        data.name || 'Standard Quotation Template',
        data.templateType || 'Classic',
        data.primaryColor || '#1e293b',
        data.fontFamily || 'Inter',
        data.showLogo !== undefined ? data.showLogo : true,
        data.logoUrl || '',
        JSON.stringify(data.companyInfo || {}),
        data.showTaxBreakdown !== undefined ? data.showTaxBreakdown : true,
        data.showSignature !== undefined ? data.showSignature : true,
        data.termsAndConditions || 'Payment terms: 30 days net.',
        data.bankDetails || 'Bank Name: HDFC Bank | Account #: 1234567890 | IFSC: HDFC0001234',
        data.footerNote || 'Thank you for your business!',
        Boolean(data.isDefault),
        now,
        now,
      ]
    );

    return {
      id,
      organizationId: orgId,
      name: data.name || 'Standard Quotation Template',
      templateType: data.templateType || 'Classic',
      primaryColor: data.primaryColor || '#1e293b',
      fontFamily: data.fontFamily || 'Inter',
      showLogo: data.showLogo !== undefined ? data.showLogo : true,
      logoUrl: data.logoUrl,
      companyInfo: data.companyInfo,
      showTaxBreakdown: data.showTaxBreakdown !== undefined ? data.showTaxBreakdown : true,
      showSignature: data.showSignature !== undefined ? data.showSignature : true,
      termsAndConditions: data.termsAndConditions,
      bankDetails: data.bankDetails,
      footerNote: data.footerNote,
      isDefault: Boolean(data.isDefault),
    };
  }

  /**
   * List templates for an organization
   */
  public static async getTemplates(orgId: string): Promise<QuotationTemplateModel[]> {
    const res = await db.query(`SELECT * FROM quotation_templates WHERE organization_id = $1 ORDER BY is_default DESC, name ASC`, [orgId]);
    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      name: r.name,
      templateType: r.template_type,
      primaryColor: r.primary_color,
      fontFamily: r.font_family,
      showLogo: r.show_logo,
      logoUrl: r.logo_url,
      companyInfo: typeof r.company_info === 'string' ? JSON.parse(r.company_info) : r.company_info,
      showTaxBreakdown: r.show_tax_breakdown,
      showSignature: r.show_signature,
      termsAndConditions: r.terms_and_conditions,
      bankDetails: r.bank_details,
      footerNote: r.footer_note,
      isDefault: r.is_default,
    }));
  }
}
