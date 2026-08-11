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
  projectId?: string;
  customerSnapshot?: any;
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
   * Validate customer reference in PostgreSQL
   */
  public static async validateCustomerReference(orgId: string, customerId?: string): Promise<any> {
    if (!customerId || typeof customerId !== 'string' || !customerId.trim()) {
      return {
        customerId: '',
        displayName: 'Valued Customer',
        legalName: 'Valued Customer',
        gstin: '',
        billingAddress: '',
        shippingAddress: '',
        email: '',
        phone: '',
        placeOfSupply: '',
        paymentTerms: 'Net 30',
        currency: 'INR',
      };
    }
    const trimmedId = customerId.trim();
    const res = await db.query(`SELECT * FROM customers WHERE organization_id = $1 AND id = $2`, [orgId, trimmedId]);
    if (res.rows.length === 0) {
      const otherOrgRes = await db.query(`SELECT organization_id FROM customers WHERE id = $1`, [trimmedId]);
      if (otherOrgRes.rows.length > 0) {
        throw new Error(`Customer ${trimmedId} does not belong to organization ${orgId}`);
      }
      throw new Error(`Customer ${trimmedId} not found`);
    }
    const c = res.rows[0];
    return {
      customerId: c.id,
      displayName: c.display_name || c.name || '',
      legalName: c.legal_name || c.company_name || c.display_name || '',
      gstin: c.gstin || c.tax_id || '',
      billingAddress: c.billing_address || '',
      shippingAddress: c.shipping_addresses || c.shipping_address || '',
      email: c.email || '',
      phone: c.phone || '',
      placeOfSupply: c.place_of_supply || '',
      paymentTerms: c.payment_terms || 'Net 30',
      currency: c.currency || 'INR',
    };
  }

  /**
   * Validate project reference in PostgreSQL if provided
   */
  public static async validateProjectReference(orgId: string, projectId?: string): Promise<any> {
    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      return null;
    }
    const trimmedId = projectId.trim();
    const res = await db.query(`SELECT * FROM projects WHERE organization_id = $1 AND id = $2`, [orgId, trimmedId]);
    if (res.rows.length === 0) {
      const otherOrgRes = await db.query(`SELECT organization_id FROM projects WHERE id = $1`, [trimmedId]);
      if (otherOrgRes.rows.length > 0) {
        throw new Error(`Project ${trimmedId} does not belong to organization ${orgId}`);
      }
      throw new Error(`Project ${trimmedId} not found`);
    }
    return res.rows[0];
  }

  public static formatDateStr(d: any): string {
    if (!d) return '';
    if (d instanceof Date) {
      return d.toISOString().split('T')[0];
    }
    const str = String(d);
    return str.includes('T') ? str.split('T')[0] : str;
  }

  /**
   * Validate issue and expiry dates
   */
  public static validateDates(rawIssueDate: any, rawExpiryDate: any) {
    const issueDate = this.formatDateStr(rawIssueDate);
    const expiryDate = this.formatDateStr(rawExpiryDate);

    if (!issueDate || isNaN(Date.parse(issueDate))) {
      throw new Error('Valid issue date is required');
    }
    if (!expiryDate || isNaN(Date.parse(expiryDate))) {
      throw new Error('Valid expiry date is required');
    }
    const issueTime = new Date(issueDate).getTime();
    const expiryTime = new Date(expiryDate).getTime();
    if (expiryTime < issueTime) {
      throw new Error('Expiry date cannot precede issue date');
    }
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
        throw new Error(`Line ${i + 1}: Discount amount must be a non-negative number`);
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
   * Validate Item Master references in quotation lines
   */
  public static async validateItemReferences(
    orgId: string,
    items: QuotationLineItem[],
    requireActive: boolean = true
  ) {
    for (const item of items) {
      if (item.itemId) {
        const itemMaster = await ItemMasterService.getItem(orgId, item.itemId);
        if (requireActive && !itemMaster.isActive) {
          throw new Error(
            `Item ${item.itemId} ("${itemMaster.name}") is inactive and cannot be selected for new quotations`
          );
        }
      }
    }
  }

  /**
   * Calculate Quotation Totals with pre-tax document overall discount
   */
  public static calculateQuotationTotals(
    items: QuotationLineItem[],
    overallDiscount: number = 0,
    isGstInclusive: boolean = false,
    roundOff: number = 0
  ) {
    this.validateQuotationLines(items);

    let rawSubtotal = 0;
    let totalLineDiscounts = 0;

    for (const item of items) {
      const qty = Number(item.quantity);
      const rate = Number(item.rate);
      const gross = this.roundMoney(qty * rate);

      let discAmt = Number(item.discountAmount || 0);
      if (discAmt === 0 && item.discountPercent && item.discountPercent > 0) {
        discAmt = this.roundMoney(gross * (Number(item.discountPercent) / 100));
      }
      if (discAmt > gross) discAmt = gross;

      item.discountAmount = discAmt;
      const netLine = this.roundMoney(gross - discAmt);

      rawSubtotal += gross;
      totalLineDiscounts += discAmt;
      (item as any)._netLine = netLine;
    }

    rawSubtotal = this.roundMoney(rawSubtotal);
    totalLineDiscounts = this.roundMoney(totalLineDiscounts);
    const subtotalPreDocDisc = this.roundMoney(rawSubtotal - totalLineDiscounts);

    const ovDisc = this.roundMoney(Math.max(0, Number(overallDiscount || 0)));
    if (ovDisc > subtotalPreDocDisc) {
      throw new Error(`Overall discount (${ovDisc}) cannot exceed quotation subtotal (${subtotalPreDocDisc})`);
    }

    // Deterministic Proportional Discount Allocation (Largest-Remainder Method)
    const lineAllocatedDiscounts = new Array(items.length).fill(0);

    if (ovDisc > 0 && subtotalPreDocDisc > 0) {
      let initialSum = 0;
      const remainders: { index: number; fracRemainder: number; capacity: number }[] = [];

      for (let i = 0; i < items.length; i++) {
        const netLine = (items[i] as any)._netLine || 0;
        if (netLine > 0) {
          const exactProp = (netLine / subtotalPreDocDisc) * ovDisc;
          const floorProp = Math.floor(exactProp * 100) / 100;
          const clampedProp = Math.min(floorProp, netLine);

          lineAllocatedDiscounts[i] = clampedProp;
          initialSum = this.roundMoney(initialSum + clampedProp);

          remainders.push({
            index: i,
            fracRemainder: exactProp - floorProp,
            capacity: this.roundMoney(netLine - clampedProp),
          });
        }
      }

      let centsToDistribute = Math.round((ovDisc - initialSum) * 100);

      // Sort by fractional remainder descending, then original index ascending
      remainders.sort((a, b) => {
        if (Math.abs(b.fracRemainder - a.fracRemainder) > 0.000001) {
          return b.fracRemainder - a.fracRemainder;
        }
        return a.index - b.index;
      });

      let remIdx = 0;
      while (centsToDistribute > 0 && remainders.length > 0 && remIdx < remainders.length * 100) {
        const candidate = remainders[remIdx % remainders.length];
        if (candidate.capacity >= 0.01) {
          lineAllocatedDiscounts[candidate.index] = this.roundMoney(lineAllocatedDiscounts[candidate.index] + 0.01);
          candidate.capacity = this.roundMoney(candidate.capacity - 0.01);
          centsToDistribute--;
        }
        remIdx++;
      }
    }

    let taxTotal = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const netLine = (item as any)._netLine || 0;
      const linePropDisc = lineAllocatedDiscounts[i] || 0;

      item.allocatedOverallDiscount = linePropDisc;
      const netLineTaxableBase = Math.max(0, this.roundMoney(netLine - linePropDisc));
      const taxRate = Number(item.taxRate || 0);

      if (isGstInclusive && taxRate > 0) {
        const taxable = this.roundMoney(netLineTaxableBase / (1 + taxRate / 100));
        const tax = this.roundMoney(netLineTaxableBase - taxable);
        item.taxableAmount = taxable;
        item.taxAmount = tax;
        item.totalAmount = netLineTaxableBase;
        item.lineTotal = netLineTaxableBase;
      } else {
        const tax = this.roundMoney(netLineTaxableBase * (taxRate / 100));
        item.taxableAmount = netLineTaxableBase;
        item.taxAmount = tax;
        item.totalAmount = this.roundMoney(netLineTaxableBase + tax);
        item.lineTotal = item.totalAmount;
      }

      taxTotal += item.taxAmount;
      delete (item as any)._netLine;
    }

    taxTotal = this.roundMoney(taxTotal);
    const roundOffAmount = this.roundMoney(roundOff);
    const taxableTotal = isGstInclusive
      ? this.roundMoney(items.reduce((sum, it) => sum + (it.taxableAmount || 0), 0))
      : this.roundMoney(subtotalPreDocDisc - ovDisc);

    const finalTotal = isGstInclusive
      ? this.roundMoney(subtotalPreDocDisc - ovDisc + roundOffAmount)
      : this.roundMoney(taxableTotal + taxTotal + roundOffAmount);

    return {
      subtotal: subtotalPreDocDisc,
      lineDiscounts: totalLineDiscounts,
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

    const rawCustomerId = data.customerId || (data as any).clientId;
    const customerSnapshot = await this.validateCustomerReference(orgId, rawCustomerId);
    const targetCustomerId = customerSnapshot.customerId;
    const targetCustomerName = data.customerName || (data as any).clientName || customerSnapshot.displayName || 'Valued Customer';
    if (!customerSnapshot.displayName || customerSnapshot.displayName === 'Valued Customer') {
      customerSnapshot.displayName = targetCustomerName;
      customerSnapshot.legalName = targetCustomerName;
    }

    const rawProjectId = data.projectId;
    if (rawProjectId) {
      await this.validateProjectReference(orgId, rawProjectId);
    }
    const targetProjectId = rawProjectId || null;

    const id = data.id || `est-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const issueDate = data.issueDate || now.split('T')[0];
    const expiryDate = data.expiryDate || new Date(new Date(issueDate).getTime() + (data.validityDays || 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    this.validateDates(issueDate, expiryDate);

    const estNumber = data.estimateNumber || (await DocumentNumberingEngine.getNextNumber(orgId, 'QUOTATION', issueDate));
    const publicToken = data.publicToken || crypto.randomBytes(24).toString('hex');

    const totals = this.calculateQuotationTotals(
      items,
      data.overallDiscount || data.discount || 0,
      data.isGstInclusive || false,
      data.roundOffAmount || 0
    );

    await db.query(
      `INSERT INTO estimates (
        id, organization_id, estimate_number, revision_number, client_id, customer_id, client_name,
        customer_snapshot, project_id, issue_date, expiry_date, subtotal, tax_total, discount,
        overall_discount, total_amount, round_off_amount, is_gst_inclusive, status, terms, notes,
        public_token, items, line_items, template_id, validity_days, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
      [
        id,
        orgId,
        estNumber,
        0,
        targetCustomerId,
        targetCustomerId,
        targetCustomerName,
        JSON.stringify(customerSnapshot),
        targetProjectId,
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

    const revisionSnapshot = {
      estimateNumber: estNumber,
      revisionNumber: 0,
      customerId: targetCustomerId,
      customerName: targetCustomerName,
      customerSnapshot,
      projectId: targetProjectId,
      issueDate,
      expiryDate,
      items,
      overallDiscount: totals.overallDiscount,
      isGstInclusive: Boolean(data.isGstInclusive),
      totals,
      terms: data.terms || 'Standard payment terms apply.',
      notes: data.notes || '',
      status: data.status || 'DRAFT',
      changeSummary: 'Initial Quotation Created',
    };

    // Initial Revision 0 snapshot
    await db.query(
      `INSERT INTO quotation_revisions (id, organization_id, quotation_id, revision_number, revision_data, total_amount, status, change_summary, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `qrev-${Date.now()}-0`,
        orgId,
        id,
        0,
        JSON.stringify(revisionSnapshot),
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
      customerId: targetCustomerId,
      customerName: targetCustomerName,
      customerSnapshot,
      projectId: targetProjectId || undefined,
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
   * Save a new revision of a quotation (preserves existing status if newData.status is omitted)
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

    let targetCustomerId = q.customer_id || q.client_id;
    let targetCustomerSnapshot = q.customer_snapshot;
    if (typeof targetCustomerSnapshot === 'string') {
      try { targetCustomerSnapshot = JSON.parse(targetCustomerSnapshot); } catch { targetCustomerSnapshot = null; }
    }

    const inputCustomerId = newData.customerId || (newData as any).clientId;
    if (inputCustomerId && inputCustomerId !== targetCustomerId) {
      targetCustomerSnapshot = await this.validateCustomerReference(orgId, inputCustomerId);
      targetCustomerId = inputCustomerId;
    } else if (!targetCustomerSnapshot && targetCustomerId) {
      try {
        targetCustomerSnapshot = await this.validateCustomerReference(orgId, targetCustomerId);
      } catch {
        // preserve existing if lookup fails
      }
    }

    let targetProjectId = q.project_id;
    if (newData.projectId !== undefined) {
      if (newData.projectId) {
        await this.validateProjectReference(orgId, newData.projectId);
        targetProjectId = newData.projectId;
      } else {
        targetProjectId = null;
      }
    }

    const issueDate = newData.issueDate ? this.formatDateStr(newData.issueDate) : this.formatDateStr(q.issue_date);
    const expiryDate = newData.expiryDate ? this.formatDateStr(newData.expiryDate) : this.formatDateStr(q.expiry_date);
    this.validateDates(issueDate, expiryDate);

    const targetCustomerName = newData.customerName || (newData as any).clientName || targetCustomerSnapshot?.displayName || q.client_name || 'Valued Customer';

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

    const targetIsGstInclusive = newData.isGstInclusive !== undefined ? Boolean(newData.isGstInclusive) : Boolean(q.is_gst_inclusive);
    const targetRoundOff = newData.roundOffAmount !== undefined ? Number(newData.roundOffAmount) : Number(q.round_off_amount || 0);
    const targetOverallDiscount = newData.overallDiscount !== undefined ? Number(newData.overallDiscount) : (q.overall_discount || q.discount || 0);

    const totals = this.calculateQuotationTotals(items, targetOverallDiscount, targetIsGstInclusive, targetRoundOff);
    const targetStatus = newData.status || q.status || 'DRAFT';
    const targetTerms = newData.terms !== undefined ? newData.terms : q.terms;
    const targetNotes = newData.notes !== undefined ? newData.notes : q.notes;

    await db.query(
      `UPDATE estimates
       SET revision_number = $1, subtotal = $2, tax_total = $3, discount = $4, overall_discount = $5,
           total_amount = $6, round_off_amount = $7, is_gst_inclusive = $8, items = $9, line_items = $9,
           terms = $10, notes = $11, status = $12, customer_id = $13, client_id = $13, client_name = $14,
           customer_snapshot = $15, project_id = $16, issue_date = $17, expiry_date = $18
       WHERE organization_id = $19 AND id = $20`,
      [
        nextRev,
        totals.subtotal,
        totals.taxTotal,
        totals.overallDiscount,
        totals.overallDiscount,
        totals.totalAmount,
        totals.roundOffAmount,
        targetIsGstInclusive,
        JSON.stringify(items),
        targetTerms,
        targetNotes,
        targetStatus,
        targetCustomerId,
        targetCustomerName,
        JSON.stringify(targetCustomerSnapshot),
        targetProjectId,
        issueDate,
        expiryDate,
        orgId,
        quotationId,
      ]
    );

    const revisionSnapshot = {
      estimateNumber: q.estimate_number,
      revisionNumber: nextRev,
      customerId: targetCustomerId,
      customerName: targetCustomerName,
      customerSnapshot: targetCustomerSnapshot,
      projectId: targetProjectId,
      issueDate,
      expiryDate,
      items,
      overallDiscount: totals.overallDiscount,
      isGstInclusive: targetIsGstInclusive,
      totals,
      terms: targetTerms,
      notes: targetNotes,
      status: targetStatus,
      changeSummary,
    };

    await db.query(
      `INSERT INTO quotation_revisions (id, organization_id, quotation_id, revision_number, revision_data, total_amount, status, change_summary, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `qrev-${Date.now()}-${nextRev}`,
        orgId,
        quotationId,
        nextRev,
        JSON.stringify(revisionSnapshot),
        totals.totalAmount,
        targetStatus,
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

    let customerSnapshot = q.customer_snapshot;
    if (typeof customerSnapshot === 'string') {
      try { customerSnapshot = JSON.parse(customerSnapshot); } catch { customerSnapshot = null; }
    }

    return {
      id: q.id,
      organizationId: q.organization_id,
      estimateNumber: q.estimate_number,
      revisionNumber: q.revision_number || 0,
      customerId: q.customer_id || q.client_id,
      customerName: q.client_name,
      customerSnapshot,
      projectId: q.project_id || undefined,
      issueDate: this.formatDateStr(q.issue_date),
      expiryDate: this.formatDateStr(q.expiry_date),
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
   * List organization-scoped quotations with optional search & status filter
   */
  public static async listQuotations(
    orgId: string,
    filter?: { search?: string; status?: string }
  ): Promise<DetailedQuotationModel[]> {
    let sql = `SELECT * FROM estimates WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (filter?.status && filter.status.trim()) {
      params.push(filter.status.trim());
      sql += ` AND UPPER(status) = UPPER($${params.length})`;
    }

    if (filter?.search && filter.search.trim()) {
      params.push(`%${filter.search.trim().toLowerCase()}%`);
      const idx = params.length;
      sql += ` AND (LOWER(estimate_number) LIKE $${idx} OR LOWER(client_name) LIKE $${idx} OR LOWER(customer_name) LIKE $${idx})`;
    }

    sql += ` ORDER BY created_at DESC, estimate_number DESC`;

    const res = await db.query(sql, params);
    return res.rows.map((q) => {
      const rawItems = q.items || q.line_items;
      let items = [];
      if (typeof rawItems === 'string') {
        try { items = JSON.parse(rawItems); } catch { items = []; }
      } else if (Array.isArray(rawItems)) {
        items = rawItems;
      }

      let customerSnapshot = q.customer_snapshot;
      if (typeof customerSnapshot === 'string') {
        try { customerSnapshot = JSON.parse(customerSnapshot); } catch { customerSnapshot = null; }
      }

      return {
        id: q.id,
        organizationId: q.organization_id,
        estimateNumber: q.estimate_number,
        revisionNumber: q.revision_number || 0,
        customerId: q.customer_id || q.client_id || '',
        customerName: q.client_name || q.customer_name || 'Valued Customer',
        customerSnapshot,
        projectId: q.project_id || undefined,
        issueDate: q.issue_date,
        expiryDate: q.expiry_date,
        subtotal: Number(q.subtotal || 0),
        taxTotal: Number(q.tax_total || 0),
        discount: Number(q.overall_discount || q.discount || 0),
        overallDiscount: Number(q.overall_discount || q.discount || 0),
        totalAmount: Number(q.total_amount || 0),
        roundOffAmount: Number(q.round_off_amount || 0),
        isGstInclusive: Boolean(q.is_gst_inclusive),
        status: q.status || 'DRAFT',
        lineItems: items,
        items,
        terms: q.terms,
        notes: q.notes,
        publicToken: q.public_token,
        validityDays: q.validity_days || 30,
        customerResponseNotes: q.customer_response_notes,
        createdAt: q.created_at,
      };
    });
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

    let customerSnapshot = q.customer_snapshot;
    if (typeof customerSnapshot === 'string') {
      try { customerSnapshot = JSON.parse(customerSnapshot); } catch { customerSnapshot = null; }
    }

    return {
      id: q.id,
      organizationId: q.organization_id,
      estimateNumber: q.estimate_number,
      revisionNumber: q.revision_number || 0,
      customerId: q.customer_id || q.client_id,
      customerName: q.client_name,
      customerSnapshot,
      projectId: q.project_id || undefined,
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
   * Save a quotation visual template
   */
  public static async saveTemplate(orgId: string, data: Partial<QuotationTemplateModel>): Promise<QuotationTemplateModel> {
    const id = data.id || `tmpl-${Date.now()}`;
    const name = data.name || 'Custom Template';
    const type = data.templateType || 'Classic';

    if (data.isDefault) {
      await db.query(`UPDATE quotation_templates SET is_default = FALSE WHERE organization_id = $1`, [orgId]);
    }

    await db.query(
      `INSERT INTO quotation_templates (
        id, organization_id, name, template_type, primary_color, font_family, show_logo,
        logo_url, company_info, show_tax_breakdown, show_signature, terms_and_conditions,
        bank_details, footer_note, is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          template_type = EXCLUDED.template_type,
          primary_color = EXCLUDED.primary_color,
          font_family = EXCLUDED.font_family,
          show_logo = EXCLUDED.show_logo,
          logo_url = EXCLUDED.logo_url,
          company_info = EXCLUDED.company_info,
          show_tax_breakdown = EXCLUDED.show_tax_breakdown,
          show_signature = EXCLUDED.show_signature,
          terms_and_conditions = EXCLUDED.terms_and_conditions,
          bank_details = EXCLUDED.bank_details,
          footer_note = EXCLUDED.footer_note,
          is_default = EXCLUDED.is_default`,
      [
        id,
        orgId,
        name,
        type,
        data.primaryColor || '#1e40af',
        data.fontFamily || 'Inter',
        data.showLogo !== undefined ? Boolean(data.showLogo) : true,
        data.logoUrl || '',
        JSON.stringify(data.companyInfo || {}),
        data.showTaxBreakdown !== undefined ? Boolean(data.showTaxBreakdown) : true,
        data.showSignature !== undefined ? Boolean(data.showSignature) : true,
        data.termsAndConditions || '',
        data.bankDetails || '',
        data.footerNote || '',
        data.isDefault !== undefined ? Boolean(data.isDefault) : false,
      ]
    );

    return {
      id,
      organizationId: orgId,
      name,
      templateType: type,
      primaryColor: data.primaryColor || '#1e40af',
      fontFamily: data.fontFamily || 'Inter',
      showLogo: data.showLogo !== undefined ? Boolean(data.showLogo) : true,
      logoUrl: data.logoUrl,
      companyInfo: data.companyInfo,
      showTaxBreakdown: data.showTaxBreakdown !== undefined ? Boolean(data.showTaxBreakdown) : true,
      showSignature: data.showSignature !== undefined ? Boolean(data.showSignature) : true,
      termsAndConditions: data.termsAndConditions,
      bankDetails: data.bankDetails,
      footerNote: data.footerNote,
      isDefault: data.isDefault !== undefined ? Boolean(data.isDefault) : false,
    };
  }

  /**
   * List templates for an organization
   */
  public static async getTemplates(orgId: string): Promise<QuotationTemplateModel[]> {
    const res = await db.query(`SELECT * FROM quotation_templates WHERE organization_id = $1 ORDER BY name ASC`, [orgId]);
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

  /**
   * Update quotation status when customer responds via portal
   */
  public static async updatePublicStatus(
    token: string,
    status: 'ACCEPTED' | 'DECLINED' | 'REVISION_REQUESTED',
    notes?: string
  ): Promise<{ quotationId: string; status: string }> {
    const qRes = await db.query(`SELECT * FROM estimates WHERE public_token = $1`, [token]);
    if (qRes.rows.length === 0) throw new Error('Quotation not found for public token');
    const q = qRes.rows[0];

    await db.query(
      `UPDATE estimates SET status = $1, customer_response_notes = COALESCE($2, customer_response_notes) WHERE id = $3`,
      [status, notes || null, q.id]
    );

    await db.query(
      `INSERT INTO quotation_revisions (id, organization_id, quotation_id, revision_number, revision_data, total_amount, status, change_summary, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `qrev-${Date.now()}-${(q.revision_number || 0) + 1}`,
        q.organization_id,
        q.id,
        (q.revision_number || 0) + 1,
        JSON.stringify({ status, responseNotes: notes }),
        q.total_amount,
        status,
        `Customer response: ${status}`,
        'Customer Portal',
        new Date().toISOString(),
      ]
    );

    return { quotationId: q.id, status };
  }

  /**
   * Fetch revision history for a quotation
   */
  public static async getQuotationRevisions(orgId: string, quotationId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM quotation_revisions WHERE organization_id = $1 AND quotation_id = $2 ORDER BY revision_number DESC`,
      [orgId, quotationId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      quotationId: r.quotation_id,
      revisionNumber: r.revision_number,
      revisionData: typeof r.revision_data === 'string' ? JSON.parse(r.revision_data) : r.revision_data,
      totalAmount: Number(r.total_amount),
      status: r.status,
      changeSummary: r.change_summary,
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  }

  /**
   * Convert quotation to Sales Order using stored commercial snapshot
   */
  public static async convertToSalesOrder(orgId: string, quotationId: string): Promise<SalesOrderModel> {
    const q = await this.getQuotation(orgId, quotationId);
    if (!q) throw new Error(`Quotation ${quotationId} not found`);

    const soNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'SALES_ORDER', new Date().toISOString().split('T')[0]);

    const salesOrder = await SalesEngine.createSalesOrder(orgId, {
      salesOrderNumber: soNumber,
      customerId: q.customerId,
      customerName: q.customerName,
      customerSnapshot: q.customerSnapshot,
      orderDate: new Date().toISOString().split('T')[0],
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      totalAmount: q.totalAmount,
      notes: q.notes,
      lineItems: q.lineItems,
    });

    await db.query(`UPDATE estimates SET status = 'CONVERTED' WHERE organization_id = $1 AND id = $2`, [orgId, quotationId]);

    return salesOrder;
  }

  /**
   * Convert quotation directly to Invoice using stored commercial snapshot
   */
  public static async convertToInvoice(orgId: string, quotationId: string): Promise<InvoiceModel> {
    const q = await this.getQuotation(orgId, quotationId);
    if (!q) throw new Error(`Quotation ${quotationId} not found`);

    const invNumber = await DocumentNumberingEngine.getNextNumber(orgId, 'INVOICE', new Date().toISOString().split('T')[0]);

    const lineItemsSnapshot = (q.lineItems || q.items || []).map((it: any) => {
      const qty = Number(it.quantity) || 1;
      const rate = Number(it.rate ?? it.unitPrice ?? 0);
      const discAmt = Number(it.discountAmount || 0);
      const discPct = Number(it.discountPercent || 0);
      const taxable = Number(it.taxableAmount ?? Math.max(0, qty * rate - (discAmt || (discPct ? qty * rate * discPct / 100 : 0))));
      const taxAmt = Number(it.taxAmount ?? Math.round(taxable * (Number(it.taxRate || 0) / 100) * 100) / 100);
      const lineTot = Number(it.totalAmount ?? it.lineTotal ?? (taxable + taxAmt));

      return {
        id: it.id,
        itemId: it.itemId || null,
        name: it.name || it.itemName || it.description || 'Quoted Item',
        description: it.description || it.name || 'Quoted Item',
        hsnSac: it.hsnSac || it.hsn_sac || '',
        unit: it.unit || 'Pcs',
        quantity: qty,
        unitPrice: rate,
        rate: rate,
        discountPercent: discPct,
        discountAmount: discAmt,
        allocatedOverallDiscount: Number(it.allocatedOverallDiscount || 0),
        taxableAmount: taxable,
        taxRate: Number(it.taxRate || 0),
        taxAmount: taxAmt,
        totalAmount: lineTot,
        lineTotal: lineTot,
        amount: taxable,
      };
    });

    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      invoiceNumber: invNumber,
      estimateId: quotationId,
      projectId: q.projectId,
      customerId: q.customerId,
      customerName: q.customerName,
      customerEmail: q.customerSnapshot?.email || '',
      customerSnapshot: q.customerSnapshot,
      issueDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subtotal: q.subtotal,
      taxTotal: q.taxTotal,
      discount: q.overallDiscount || q.discount || 0,
      roundOffAmount: q.roundOffAmount || 0,
      totalAmount: q.totalAmount,
      isGstInclusive: q.isGstInclusive,
      notes: q.notes,
      lineItems: lineItemsSnapshot,
    });

    await db.query(`UPDATE estimates SET status = 'CONVERTED' WHERE organization_id = $1 AND id = $2`, [orgId, quotationId]);

    return invoice;
  }
}
