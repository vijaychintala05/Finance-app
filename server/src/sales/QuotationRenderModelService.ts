import { db } from '../database/db';
import { QuotationEngine, QuotationTemplateModel } from './QuotationEngine';

export interface QuotationRenderDTO {
  document: {
    quotationId: string;
    quotationNumber: string;
    revisionNumber: number;
    status: string;
    issueDate: string;
    expiryDate: string;
    currency: string;
    currencySymbol: string;
    isGstInclusive: boolean;
    projectId?: string;
    notes?: string;
    terms?: string;
  };
  customerSnapshot: {
    displayName: string;
    legalName?: string;
    gstin?: string;
    email?: string;
    phone?: string;
    placeOfSupply?: string;
    billingAddress?: {
      street?: string;
      city?: string;
      state?: string;
      pincode?: string;
      country?: string;
    };
  };
  organization: {
    legalName: string;
    tradeName?: string;
    logoUrl?: string;
    address?: string;
    gstin?: string;
    email?: string;
    phone?: string;
    website?: string;
  };
  lineItems: Array<{
    lineNumber: number;
    name: string;
    description: string;
    hsnSac: string;
    quantity: number;
    unit: string;
    rate: number;
    discountPercent: number;
    discountAmount: number;
    allocatedOverallDiscount: number;
    taxRate: number;
    taxableAmount: number;
    taxAmount: number;
    totalAmount: number;
    lineTotal: number;
  }>;
  totals: {
    grossAmount: number;
    lineDiscounts: number;
    subtotal: number;
    overallDiscount: number;
    taxableAmount: number;
    taxTotal: number;
    roundOffAmount: number;
    grandTotal: number;
  };
  template: {
    name: string;
    templateType: string;
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
  };
}

export class QuotationRenderModelService {
  /**
   * Built-in safe Classic fallback template
   */
  public static readonly CLASSIC_FALLBACK_TEMPLATE: QuotationTemplateModel = {
    id: 'tmpl-classic-default',
    organizationId: '',
    name: 'Classic Standard',
    templateType: 'Classic',
    primaryColor: '#1e40af',
    fontFamily: 'Inter',
    showLogo: true,
    showTaxBreakdown: true,
    showSignature: true,
    termsAndConditions: '1. Payment terms: Net 30 days from invoice date.\n2. Quotation valid for 30 days from issue date.',
    footerNote: 'Thank you for your business!',
    isDefault: true,
  };

  /**
   * Build deterministic render DTO from PostgreSQL quotation or revision snapshot
   */
  public static async buildRenderModel(
    orgId: string,
    quotationId: string,
    revisionNumber?: number
  ): Promise<QuotationRenderDTO> {
    const q = await QuotationEngine.getQuotation(orgId, quotationId);
    if (!q) {
      throw new Error(`Quotation ${quotationId} not found`);
    }

    let targetData: any = q;

    if (revisionNumber !== undefined) {
      const revRes = await db.query(
        `SELECT * FROM quotation_revisions WHERE organization_id = $1 AND quotation_id = $2 AND revision_number = $3`,
        [orgId, quotationId, revisionNumber]
      );
      if (revRes.rows.length === 0) {
        throw new Error(`Quotation revision ${revisionNumber} not found`);
      }
      const row = revRes.rows[0];
      const snapshot = typeof row.revision_data === 'string' ? JSON.parse(row.revision_data) : row.revision_data;

      let revTmplSnapshot = row.template_snapshot || snapshot.templateSnapshot;
      if (typeof revTmplSnapshot === 'string') {
        try { revTmplSnapshot = JSON.parse(revTmplSnapshot); } catch { revTmplSnapshot = null; }
      }

      targetData = {
        ...q,
        ...snapshot,
        revisionNumber: row.revision_number,
        templateSnapshot: revTmplSnapshot,
      };
    }

    // Resolve Organization Branding Details (No fabricated placeholders!)
    const orgRes = await db.query(`SELECT * FROM organizations WHERE id = $1`, [orgId]);
    const orgRow = orgRes.rows[0] || {};

    const rawOrgAddress = [orgRow.address, orgRow.city, orgRow.state, orgRow.country, orgRow.zip_code]
      .filter(Boolean)
      .join(', ');

    const orgSnapshot = {
      legalName: orgRow.name || '',
      tradeName: orgRow.name || '',
      logoUrl: orgRow.logo_url || '',
      address: rawOrgAddress || '',
      gstin: orgRow.tax_id || orgRow.gstin || '',
      email: orgRow.email || '',
      phone: orgRow.phone || '',
      website: orgRow.website || '',
    };

    // Resolve Template via Deterministic Hierarchy Rule:
    // 1. targetData.templateSnapshot
    // 2. targetData.templateId (if valid for same org)
    // 3. Organization Default Template
    // 4. Built-in Classic Fallback
    let resolvedTemplate: QuotationTemplateModel | null = null;

    if (targetData.templateSnapshot) {
      resolvedTemplate = typeof targetData.templateSnapshot === 'string'
        ? JSON.parse(targetData.templateSnapshot)
        : targetData.templateSnapshot;
    } else if (targetData.templateId) {
      resolvedTemplate = await QuotationEngine.getTemplate(orgId, targetData.templateId);
    }

    if (!resolvedTemplate) {
      resolvedTemplate = await QuotationEngine.getDefaultTemplate(orgId);
    }

    if (!resolvedTemplate) {
      resolvedTemplate = { ...this.CLASSIC_FALLBACK_TEMPLATE, organizationId: orgId };
    }

    // Map Line Items Snapshot
    const rawItems = targetData.lineItems || targetData.items || [];
    let grossAmount = 0;
    let lineDiscounts = 0;

    const mappedLines = rawItems.map((it: any, index: number) => {
      const qty = Number(it.quantity) || 1;
      const rate = Number(it.rate ?? it.unitPrice ?? 0);
      const gross = qty * rate;
      const discAmt = Number(it.discountAmount || 0);
      const discPct = Number(it.discountPercent || 0);
      const computedDisc = discAmt || (discPct ? gross * (discPct / 100) : 0);

      grossAmount += gross;
      lineDiscounts += computedDisc;

      const taxable = Number(it.taxableAmount ?? Math.max(0, gross - computedDisc));
      const taxAmt = Number(it.taxAmount ?? Math.round(taxable * (Number(it.taxRate || 0) / 100) * 100) / 100);
      const lineTot = Number(it.totalAmount ?? it.lineTotal ?? (taxable + taxAmt));

      return {
        lineNumber: index + 1,
        name: it.name || it.itemName || it.description || 'Quoted Item',
        description: it.description || it.name || '',
        hsnSac: it.hsnSac || it.hsn_sac || '',
        quantity: qty,
        unit: it.unit || 'Pcs',
        rate: rate,
        discountPercent: discPct,
        discountAmount: computedDisc,
        allocatedOverallDiscount: Number(it.allocatedOverallDiscount || 0),
        taxRate: Number(it.taxRate || 0),
        taxableAmount: taxable,
        taxAmount: taxAmt,
        totalAmount: lineTot,
        lineTotal: lineTot,
      };
    });

    const subtotal = Number(targetData.subtotal ?? Math.round((grossAmount - lineDiscounts) * 100) / 100);
    const overallDiscount = Number(targetData.overallDiscount || targetData.discount || 0);
    const taxTotal = Number(targetData.taxTotal || 0);
    const roundOffAmount = Number(targetData.roundOffAmount || 0);
    const grandTotal = Number(targetData.totalAmount || 0);

    const authoritativeTaxable = targetData.isGstInclusive
      ? Math.round((grandTotal - taxTotal - roundOffAmount) * 100) / 100
      : Math.round((subtotal - overallDiscount) * 100) / 100;

    return {
      document: {
        quotationId: targetData.id,
        quotationNumber: targetData.quotationNumber || targetData.estimate_number || targetData.estimateNumber || 'QT-0000',
        revisionNumber: targetData.revisionNumber || 0,
        status: targetData.status || 'DRAFT',
        issueDate: targetData.issueDate || new Date().toISOString().split('T')[0],
        expiryDate: targetData.expiryDate || new Date(Date.now() + 30 * 84600000).toISOString().split('T')[0],
        currency: targetData.currency || 'INR',
        currencySymbol: targetData.currencySymbol || '₹',
        isGstInclusive: Boolean(targetData.isGstInclusive),
        projectId: targetData.projectId || undefined,
        notes: targetData.notes || '',
        terms: targetData.terms || resolvedTemplate.termsAndConditions || '',
      },
      customerSnapshot: {
        displayName: targetData.customerName || targetData.customerSnapshot?.displayName || '',
        legalName: targetData.customerSnapshot?.legalName || targetData.customerName || '',
        gstin: targetData.customerSnapshot?.gstin || '',
        email: targetData.customerSnapshot?.email || '',
        phone: targetData.customerSnapshot?.phone || '',
        placeOfSupply: targetData.customerSnapshot?.billingAddress?.state || '',
        billingAddress: targetData.customerSnapshot?.billingAddress && Object.values(targetData.customerSnapshot.billingAddress).some(Boolean)
          ? targetData.customerSnapshot.billingAddress
          : undefined,
      },
      organization: orgSnapshot,
      lineItems: mappedLines,
      totals: {
        grossAmount: Math.round(grossAmount * 100) / 100,
        lineDiscounts: Math.round(lineDiscounts * 100) / 100,
        subtotal,
        overallDiscount,
        taxableAmount: authoritativeTaxable,
        taxTotal,
        roundOffAmount,
        grandTotal,
      },
      template: {
        name: resolvedTemplate.name,
        templateType: resolvedTemplate.templateType || 'Classic',
        primaryColor: resolvedTemplate.primaryColor || '#1e40af',
        fontFamily: resolvedTemplate.fontFamily || 'Inter',
        showLogo: resolvedTemplate.showLogo !== false,
        logoUrl: resolvedTemplate.logoUrl || orgSnapshot.logoUrl,
        companyInfo: resolvedTemplate.companyInfo,
        showTaxBreakdown: resolvedTemplate.showTaxBreakdown !== false,
        showSignature: resolvedTemplate.showSignature !== false,
        termsAndConditions: resolvedTemplate.termsAndConditions || targetData.terms || '',
        bankDetails: resolvedTemplate.bankDetails || '',
        footerNote: resolvedTemplate.footerNote || 'Thank you for your business!',
      },
    };
  }
}
