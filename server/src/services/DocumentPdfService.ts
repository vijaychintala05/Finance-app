import PDFDocument from 'pdfkit';
import crypto from 'node:crypto';
import { type DbQueryClient, db } from '../database/db';
import { amountToWords } from '../utils/numberToWords';
import { centsToSafeNumber, databaseMoneyToCents, formatCurrencyAmount } from '../utils/money';
import { CustomerStatementService } from './CustomerStatementService';
import { VendorStatementService } from './VendorStatementService';
import { DocumentTemplateService, type DocumentTemplateRecord } from './DocumentTemplateService';
import { AuditTrailService } from '../security/AuditTrailService';
import { DocumentPdfArtifactConflictError, DocumentPdfArtifactService, type DocumentPdfArtifact } from './DocumentPdfArtifactService';
import type { QuotationRenderDTO } from '../sales/QuotationRenderModelService';

/**
 * The document PDF catalogue is deliberately owned by the server.  A browser
 * may choose a template, but it cannot invent a category, read another
 * tenant's document, or select an unrecognised renderer.
 */
export const DOCUMENT_PDF_CATALOG = {
  quotes: ['spreadsheet', 'standard', 'modern', 'compact'],
  'sales-orders': ['standard', 'spreadsheet', 'modern'],
  'delivery-challans': ['standard', 'dispatch', 'jobwork'],
  invoices: ['standard', 'spreadsheet', 'export', 'pos'],
  'credit-notes': ['standard', 'spreadsheet', 'adjustment'],
  'purchase-orders': ['standard', 'contract', 'requisition'],
  'payment-receipts': ['standard', 'compact', 'acknowledgment'],
  'customer-statements': ['running-ledger', 'aging-statement', 'open-summary'],
  bills: ['standard', 'accrual', 'matching'],
  expenses: ['reimburse', 'petty', 'standard'],
  'vendor-credits': ['standard', 'return', 'adjustment'],
  'vendor-payments': ['advice', 'cheque', 'settlement'],
  'vendor-statements': ['vendor-ledger', 'payables-aging', 'reconciliation'],
  journals: ['standard', 'three-tier', 'ledger'],
} as const;

export type DocumentPdfCategory = keyof typeof DOCUMENT_PDF_CATALOG;

const PDF_CATEGORY_ACCENTS: Record<DocumentPdfCategory, string> = {
  quotes: '#0f766e',
  'sales-orders': '#0369a1',
  'delivery-challans': '#b45309',
  invoices: '#4338ca',
  'credit-notes': '#be123c',
  'purchase-orders': '#6d28d9',
  'payment-receipts': '#047857',
  'customer-statements': '#0e7490',
  bills: '#c2410c',
  expenses: '#475569',
  'vendor-credits': '#a21caf',
  'vendor-payments': '#0f766e',
  'vendor-statements': '#4d7c0f',
  journals: '#334155',
};

const PDF_CATEGORY_LABELS: Record<DocumentPdfCategory, string> = {
  quotes: 'CUSTOMER QUOTE',
  'sales-orders': 'SALES ORDER',
  'delivery-challans': 'GOODS DISPATCH',
  invoices: 'TAX INVOICE',
  'credit-notes': 'CUSTOMER CREDIT',
  'purchase-orders': 'PROCUREMENT',
  'payment-receipts': 'PAYMENT RECEIPT',
  'customer-statements': 'RECEIVABLES',
  bills: 'VENDOR BILL',
  expenses: 'EXPENSE VOUCHER',
  'vendor-credits': 'VENDOR CREDIT',
  'vendor-payments': 'VENDOR PAYMENT',
  'vendor-statements': 'PAYABLES',
  journals: 'GENERAL LEDGER',
};

export type PdfLine = {
  description: string;
  hsnSac?: string;
  packages?: string;
  quantity?: number;
  rate?: number;
  debit?: number;
  credit?: number;
  amount?: number;
  reference?: string;
  date?: string;
  balance?: number;
  account?: string;
};

export type RenderModel = {
  category: DocumentPdfCategory;
  templateId: string;
  title: string;
  number: string;
  status: string;
  date: string;
  dueDate?: string;
  partyLabel: string;
  partyName: string;
  partyDetails: string[];
  organization: Record<string, any>;
  source: Record<string, any>;
  templateConfig: Record<string, any>;
  lines: PdfLine[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  netPaid?: number;
  expenseBilling?: { projectName: string; clientName: string; invoiceNumber: string; invoiceStatus: string; invoiceLinked: boolean; isBillable: boolean; clientCharge: number; markupPercentage: number; isBilled: boolean };
  balance?: number;
  notes?: string;
  journalLines: PdfLine[];
  versionedTemplate?: DocumentTemplateRecord | null;
  isSamplePreview?: boolean;
  statementOverview?: { openingBalance: number; transactionCount: number; closingBalance: number };
  statementActivityRows?: Array<{ label: string; amount: number; side: 'Debit' | 'Credit' }>;
  returnCredit?: { reason: string; total: number; remaining: number; reversed?: boolean; applications: Array<{ id: string; date: string; invoiceNumber: string; amount: number }> };
};

const CATEGORY_META: Record<DocumentPdfCategory, { table?: string; title: string; number: string; date: string; party: string; amount: string; lineDocument?: boolean }> = {
  quotes: { table: 'estimates', title: 'COMMERCIAL QUOTATION', number: 'estimate_number', date: 'issue_date', party: 'client_name', amount: 'total_amount', lineDocument: true },
  'sales-orders': { table: 'sales_orders', title: 'SALES ORDER', number: 'sales_order_number', date: 'order_date', party: 'customer_name', amount: 'total_amount', lineDocument: true },
  'delivery-challans': { table: 'delivery_challans', title: 'DELIVERY CHALLAN', number: 'challan_number', date: 'delivery_date', party: 'customer_name', amount: 'total_amount', lineDocument: true },
  invoices: { table: 'invoices', title: 'TAX INVOICE', number: 'invoice_number', date: 'issue_date', party: 'client_name', amount: 'total_amount', lineDocument: true },
  'credit-notes': { table: 'credit_notes', title: 'CREDIT NOTE', number: 'credit_note_number', date: 'date', party: 'client_name', amount: 'total_amount' },
  'purchase-orders': { table: 'purchase_orders', title: 'PURCHASE ORDER', number: 'purchase_order_number', date: 'order_date', party: 'vendor_name', amount: 'total_amount', lineDocument: true },
  'payment-receipts': { table: 'payments_received', title: 'PAYMENT RECEIPT', number: 'payment_number', date: 'payment_date', party: 'client_name', amount: 'amount' },
  'customer-statements': { title: 'STATEMENT OF ACCOUNT', number: 'customer statement', date: 'date', party: 'customerName', amount: 'closingBalance' },
  bills: { table: 'bills', title: 'VENDOR BILL', number: 'bill_number', date: 'bill_date', party: 'vendor_name', amount: 'total_amount', lineDocument: true },
  expenses: { table: 'expenses', title: 'EXPENSE VOUCHER', number: 'expense_number', date: 'date', party: 'vendor_name', amount: 'amount' },
  'vendor-credits': { table: 'vendor_credits', title: 'VENDOR CREDIT / DEBIT NOTE', number: 'credit_number', date: 'date', party: 'vendor_name', amount: 'total_amount' },
  'vendor-payments': { table: 'payments_made', title: 'PAYMENT ADVICE', number: 'payment_number', date: 'payment_date', party: 'vendor_name', amount: 'amount' },
  'vendor-statements': { title: 'VENDOR STATEMENT', number: 'vendor statement', date: 'date', party: 'vendorName', amount: 'closingBalance' },
  journals: { table: 'journal_entries', title: 'JOURNAL VOUCHER', number: 'entry_number', date: 'date', party: '', amount: 'total_amount' },
};

const documentTitle = (category: DocumentPdfCategory, _templateId: string, configuredTitle?: unknown): string =>
  sanitize(configuredTitle || CATEGORY_META[category].title);

// Settings written before the consolidated PDF gallery used singular,
// underscore names. Keep them readable so an organization does not lose its
// established document title or default merely by upgrading.
const TEMPLATE_CONFIG_ALIASES: Partial<Record<DocumentPdfCategory, string[]>> = {
  quotes: ['quote', 'quotation'],
  'sales-orders': ['sales_order'],
  'delivery-challans': ['delivery_challan'],
  invoices: ['invoice'],
  'credit-notes': ['credit_note'],
  'purchase-orders': ['purchase_order'],
  'payment-receipts': ['payment_receipt'],
  'customer-statements': ['customer_statement'],
  bills: ['bill'],
  expenses: ['expense'],
  'vendor-credits': ['vendor_credit'],
  'vendor-payments': ['vendor_payment'],
  'vendor-statements': ['vendor_statement'],
  journals: ['journal'],
};

const sanitize = (value: unknown): string => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();
export const contrastTextForFill = (color: string): '#ffffff' | '#000000' => {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return '#ffffff';
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
};
export const readableInkOnWhite = (color: string): string => contrastTextForFill(color) === '#ffffff' ? color : '#1e293b';
const number = (value: unknown): number => Number.isFinite(Number(value)) ? Number(value) : 0;
const isoDate = (value: unknown): string => {
  if (!value) return '-';
  if (typeof value === 'string') return value.split('T')[0];
  try { return new Date(value as any).toISOString().split('T')[0]; } catch { return '-'; }
};
const parseJson = (value: unknown): any => {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
};

export class DocumentPdfService {
  public static isSupportedCategory(value: string): value is DocumentPdfCategory {
    return Object.prototype.hasOwnProperty.call(DOCUMENT_PDF_CATALOG, value);
  }

  public static getTemplateIds(category: DocumentPdfCategory): readonly string[] {
    return DOCUMENT_PDF_CATALOG[category];
  }

  private static templateConfig(allTemplates: Record<string, any>, category: DocumentPdfCategory): Record<string, any> {
    if (allTemplates[category] && typeof allTemplates[category] === 'object') return allTemplates[category];
    const legacyKey = TEMPLATE_CONFIG_ALIASES[category]?.find((key) => allTemplates[key] && typeof allTemplates[key] === 'object');
    return legacyKey ? allTemplates[legacyKey] : {};
  }

  public static async listRecentDocuments(client: DbQueryClient, organizationId: string, category: DocumentPdfCategory): Promise<Array<{ id: string; label: string; date: string; status: string }>> {
    const meta = CATEGORY_META[category];
    if (category === 'customer-statements') {
      const result = await client.query(
        `SELECT id, label, created_at FROM (
           SELECT id, COALESCE(display_name, legal_name) AS label, created_at FROM customers WHERE organization_id = $1
           UNION ALL
           SELECT c.id, COALESCE(c.name, c.company_name) AS label, c.created_at FROM clients c
            WHERE c.organization_id = $1 AND NOT EXISTS (SELECT 1 FROM customers cu WHERE cu.organization_id = c.organization_id AND cu.id = c.id)
         ) statement_customers ORDER BY created_at DESC LIMIT 25`,
        [organizationId]
      );
      return result.rows.map((row: any) => ({ id: row.id, label: sanitize(row.label || 'Customer'), date: isoDate(row.created_at), status: 'AVAILABLE' }));
    }
    if (category === 'vendor-statements') {
      const result = await client.query(`SELECT id, COALESCE(name, company_name) AS label, created_at FROM vendors WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 25`, [organizationId]);
      return result.rows.map((row: any) => ({ id: row.id, label: sanitize(row.label || 'Vendor'), date: isoDate(row.created_at), status: 'AVAILABLE' }));
    }
    if (!meta.table) return [];
    const result = await client.query(`SELECT id, ${meta.number} AS number, ${meta.date} AS document_date, status FROM ${meta.table} WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 25`, [organizationId]);
    return result.rows.map((row: any) => ({ id: row.id, label: sanitize(row.number || row.id), date: isoDate(row.document_date), status: sanitize(row.status || 'DRAFT').toUpperCase() }));
  }

  public static async generatePdf(
    client: DbQueryClient,
    organizationId: string,
    category: DocumentPdfCategory,
    documentId: string,
    requestedTemplateId?: string,
    options: { fromDate?: string; toDate?: string; preview?: boolean; persistSnapshot?: boolean } = {}
  ): Promise<{ pdf: Buffer; filename: string; templateId: string }> {
    const model = await this.buildModel(client, organizationId, category, documentId, requestedTemplateId, options);
    if (options.preview) {
      model.templateConfig = { ...model.templateConfig, showWatermark: true, watermarkText: 'PREVIEW - NOT AN ISSUED DOCUMENT' };
    }
    const pdf = await this.render(model);
    const snapshotStatus = ['POSTED', 'SENT', 'PAID', 'PARTIALLY_PAID', 'ACCEPTED', 'CONVERTED', 'RECEIVED', 'APPROVED', 'ISSUED'];
    if (!options.preview && options.persistSnapshot !== false && (snapshotStatus.includes(model.status) || category === 'customer-statements' || category === 'vendor-statements')) {
      await DocumentTemplateService.persistSnapshot(client, organizationId, category, documentId, model.versionedTemplate || null, model, pdf.length);
    }
    const fallbackFilename = category === 'invoices' ? 'Invoice-' + (sanitize(model.number).replace(/[^A-Za-z0-9_-]+/g, '-') || documentId) + '.pdf' : (sanitize(model.title).replace(/[^A-Za-z0-9]+/g, '-') + '-' + (sanitize(model.number).replace(/[^A-Za-z0-9_-]+/g, '-') || documentId) + '.pdf');
    const filename = this.buildFilename(model, fallbackFilename);
    return { pdf, filename, templateId: model.templateId };
  }

  public static async generateQuotationRevisionPdf(
    quotation: QuotationRenderDTO,
    template: DocumentTemplateRecord,
  ): Promise<Buffer> {
    if (template.category !== 'quotes' || !template.modelId || !template.configuration) {
      throw new Error('Quotation revision has an invalid frozen document template');
    }
    const config = { ...template.configuration };
    const address = quotation.customerSnapshot.billingAddress;
    const partyDetails = [
      quotation.customerSnapshot.email,
      quotation.customerSnapshot.phone,
      quotation.customerSnapshot.gstin ? `GSTIN: ${quotation.customerSnapshot.gstin}` : '',
      address && [address.street, address.city, address.state, address.pincode, address.country].filter(Boolean).join(', '),
    ].filter((value): value is string => Boolean(value));
    const model: RenderModel = {
      category: 'quotes',
      templateId: template.modelId,
      title: sanitize(config.templateTitle || 'COMMERCIAL QUOTATION'),
      number: sanitize(quotation.document.quotationNumber),
      status: sanitize(quotation.document.status).toUpperCase(),
      date: isoDate(quotation.document.issueDate),
      dueDate: config.showExpiryDate === false ? undefined : isoDate(quotation.document.expiryDate),
      partyLabel: 'CUSTOMER',
      partyName: sanitize(quotation.customerSnapshot.displayName),
      partyDetails: partyDetails.map(sanitize),
      organization: {
        legal_name: quotation.organization.legalName,
        trade_name: quotation.organization.tradeName,
        logo_url: quotation.organization.logoUrl,
        address_line1: quotation.organization.address,
        gstin: quotation.organization.gstin,
        email: quotation.organization.email,
        phone: quotation.organization.phone,
        website: quotation.organization.website,
        base_currency: quotation.document.currency,
      },
      source: {
        id: quotation.document.quotationId,
        status: quotation.document.status,
        subtotal: quotation.totals.subtotal,
        tax_total: quotation.totals.taxTotal,
        discount: quotation.totals.overallDiscount,
        total_amount: quotation.totals.grandTotal,
        expiry_date: quotation.document.expiryDate,
        notes: quotation.document.notes,
        terms: quotation.document.terms,
        is_gst_inclusive: quotation.document.isGstInclusive,
        taxable_amount: quotation.totals.taxableAmount,
        gst_breakdown: quotation.totals.gstBreakdown,
        round_off_amount: quotation.totals.roundOffAmount,
        quotation_revision: true,
      },
      templateConfig: config,
      lines: quotation.lineItems.map((line) => ({
        description: sanitize([line.name, line.description].filter(Boolean).join(' - ')),
        hsnSac: line.hsnSac,
        quantity: line.quantity,
        rate: line.rate,
        amount: line.totalAmount,
      })),
      subtotal: quotation.totals.subtotal,
      tax: quotation.totals.taxTotal,
      discount: quotation.totals.overallDiscount,
      total: quotation.totals.grandTotal,
      notes: config.showScopeOfWork === false ? '' : sanitize(
        [quotation.document.notes, quotation.document.terms].filter(Boolean).join('\n'),
      ),
      journalLines: [],
      versionedTemplate: template,
    };
    return this.render(model);
  }

  public static async issuePdf(
    organizationId: string,
    category: DocumentPdfCategory,
    documentId: string,
    issuedBy: string,
    idempotencyKey: string,
    requestedTemplateId?: string,
    options: { fromDate?: string; toDate?: string; reason?: string } = {},
    transactionClient?: DbQueryClient,
  ): Promise<DocumentPdfArtifact> {
    const key = idempotencyKey.trim();
    if (!issuedBy || key.length < 16 || key.length > 128) {
      throw new Error('A user and an idempotency key between 16 and 128 characters are required');
    }
    const normalizedReason = options.reason?.trim() || null;
    const idempotencyPayloadHash = crypto.createHash('sha256').update(JSON.stringify({
      organizationId, category, documentId, requestedTemplateId: requestedTemplateId || null,
      fromDate: options.fromDate || null, toDate: options.toDate || null, reason: normalizedReason,
    })).digest('hex');

    const issueWithinTransaction = async (tx: DbQueryClient): Promise<DocumentPdfArtifact> => {
      if (!db.isMemoryMode()) {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [
          organizationId,
          'document-pdf-issue:' + category + ':' + documentId,
        ]);
      }
      const scope = { organizationId, category, documentId };
      const existing = await DocumentPdfArtifactService.findByIdempotencyKey(tx, { ...scope, idempotencyKey: key });
      if (existing) {
        if (existing.idempotencyPayloadHash !== idempotencyPayloadHash) {
          throw new DocumentPdfArtifactConflictError('Idempotency key was already used with different PDF issuance parameters');
        }
        return existing;
      }

      const model = await this.buildModel(tx, organizationId, category, documentId, requestedTemplateId, {
        ...options,
        lockSource: category === 'credit-notes',
      });
      const issuableStatuses = ['POSTED', 'SENT', 'OVERDUE', 'PAID', 'PARTIALLY_PAID', 'ACCEPTED', 'CONVERTED', 'RECEIVED', 'APPROVED', 'ISSUED'];
      const statementCategory = category === 'customer-statements' || category === 'vendor-statements';
      const isCreditNote = category === 'credit-notes';
      if (isCreditNote) {
        if (!['statutory', 'goods-return', 'adjustment'].includes(model.templateId)) {
          throw new Error('Unsupported credit-note PDF template for issuance');
        }
        const note = model.source;
        const noteStatus = String(note.status || '').toUpperCase();
        if (!['OPEN', 'CLOSED', 'PARTIALLY APPLIED'].includes(noteStatus)
          || note.reversed_at || note.reversal_journal_id || !note.journal_entry_id) {
          throw new Error('Only finalized open, closed, or partially applied unreversed credit notes can be issued as an immutable PDF');
        }
        const totalCents = databaseMoneyToCents(note.total_amount, 'Credit note total');
        const remainingCents = databaseMoneyToCents(note.remaining_credit, 'Credit note remaining credit');
        if (totalCents <= 0n || remainingCents < 0n || remainingCents > totalCents) throw new Error('Credit note amounts are outside the supported range');
        const journalResult = await tx.query(
          `SELECT status, reversed_by_journal_id, reversal_of_journal_id, reversed_at
             FROM journal_entries
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, note.journal_entry_id]
        );
        const journal = journalResult.rows[0] as Record<string, any> | undefined;
        if (!journal || String(journal.status || '').toUpperCase() !== 'POSTED'
          || journal.reversed_by_journal_id || journal.reversal_of_journal_id || journal.reversed_at) {
          throw new Error('Only finalized credit notes with a posted, unreversed journal can be issued');
        }
      } else if (!statementCategory && !issuableStatuses.includes(model.status)) {
        throw new Error('Only finalized documents can be issued as an immutable PDF');
      }
      const pdfBytes = await this.render(model);
      if (pdfBytes.length > 25 * 1024 * 1024) throw new Error('Issued PDF exceeds the 25 MiB storage limit');

      const sourceDataHash = crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex');
      const issuanceNumber = await DocumentPdfArtifactService.computeNextIssuanceNumber(tx, scope);
      const safeNumber = sanitize(model.number).replace(/[^A-Za-z0-9_-]+/g, '-') || documentId;
      const fallback = category === 'invoices'
        ? 'Invoice-' + safeNumber + '.pdf'
        : sanitize(model.title).replace(/[^A-Za-z0-9]+/g, '-') + '-' + safeNumber + '.pdf';
      const filename = this.buildFilename(model, fallback);
      const sourceRevisionRef = String(model.source.edit_version || model.source.revision_number || model.source.updated_at || model.source.created_at || sourceDataHash).slice(0, 128);
      const artifact = await DocumentPdfArtifactService.insertIssuedArtifact(tx, {
        ...scope,
        issuanceNumber,
        idempotencyKey: key,
        idempotencyPayloadHash,
        templateVersionId: model.versionedTemplate?.currentVersionId || null,
        sourceDataHash,
        sourceRevisionRef,
        issuedBy,
        issuedAt: new Date(),
        issuanceReason: options.reason?.trim().slice(0, 500) || null,
        filename,
        renderModel: model as unknown as Record<string, unknown>,
        pdfBytes,
      });
      await AuditTrailService.appendBatchInTransaction(tx, organizationId, [{
        userId: issuedBy,
        action: 'DOCUMENT_PDF_ISSUED',
        entityType: 'DocumentPdfArtifact',
        entityId: artifact.id,
        afterState: { category, documentId, issuanceNumber, sourceDataHash, pdfSha256: artifact.pdfSha256, templateVersionId: artifact.templateVersionId },
        metadata: { idempotencyKey: key, reason: options.reason?.trim().slice(0, 500) || null },
      }], { strict: true });
      return artifact;
    };

    if (transactionClient) return issueWithinTransaction(transactionClient);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await db.transaction(issueWithinTransaction, { organizationId, isolationLevel: 'REPEATABLE READ' });
      } catch (error) {
        const code = (error as { code?: string }).code;
        const retryable = error instanceof DocumentPdfArtifactConflictError || code === '40001';
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new Error('PDF issuance retry limit reached');
  }

  public static async generateSamplePreviewPdf(
    client: DbQueryClient,
    organizationId: string,
    category: DocumentPdfCategory,
    requestedTemplateId?: string,
    customConfig: Record<string, any> = {},
  ): Promise<{ pdf: Buffer; filename: string; templateId: string }> {
    const orgResult = await client.query(
      `SELECT o.*, p.legal_name, p.trade_name, p.gstin, p.tax_id, p.pan, p.address_line1, p.address_line2, p.city, p.state, p.postal_code, p.phone, p.email, p.website, p.bank_name, p.bank_account_number, p.bank_ifsc_swift, p.invoice_notes, p.branding, p.document_templates
       FROM organizations o LEFT JOIN organization_profiles p ON p.organization_id = o.id WHERE o.id = $1`,
      [organizationId]
    );
    const organization = (orgResult.rows[0] as Record<string, any>) || { name: 'FirmBooks Technologies Pvt Ltd', base_currency: 'INR' };
    const documentTemplates = parseJson(organization.document_templates) || {};
    const hasRegistry = await DocumentTemplateService.hasRegistry(client);
    const legacyTemplateConfig = hasRegistry ? {} : this.templateConfig(documentTemplates, category);
    const versionedTemplate = await DocumentTemplateService.resolve(client, organizationId, category, requestedTemplateId);
    const templateConfig: Record<string, any> = {
      ...legacyTemplateConfig,
      ...(versionedTemplate?.configuration || {}),
      ...customConfig,
      showWatermark: true,
      watermarkText: customConfig.watermarkText || 'SAMPLE PREVIEW — NOT AN ISSUED DOCUMENT',
    };
    if (requestedTemplateId && !versionedTemplate && !((DOCUMENT_PDF_CATALOG[category] as readonly string[]).includes(requestedTemplateId)) && !(['standard', 'ledger', 'compact'].includes(requestedTemplateId))) {
      const missingRecord = requestedTemplateId.startsWith('tmpl-') || requestedTemplateId.startsWith(`${category}-`);
      throw new Error(missingRecord ? `Document template not found: ${sanitize(requestedTemplateId)}` : `Unsupported ${category} PDF template: ${sanitize(requestedTemplateId)}`);
    }
    const templateId = versionedTemplate?.modelId || requestedTemplateId || templateConfig.defaultTemplate || DOCUMENT_PDF_CATALOG[category][0];

    const model = this.buildSampleModel(category, templateId, organization, templateConfig, versionedTemplate);
    const pdf = await this.render(model);
    const filename = `Sample-Preview-${sanitize(category)}-${sanitize(templateId)}.pdf`;
    return { pdf, filename, templateId };
  }

  private static async buildModel(
    client: DbQueryClient,
    organizationId: string,
    category: DocumentPdfCategory,
    documentId: string,
    requestedTemplateId?: string,
    options: { fromDate?: string; toDate?: string; lockSource?: boolean } = {}
  ): Promise<RenderModel> {
    const meta = CATEGORY_META[category];
    const orgResult = await client.query(
      `SELECT o.*, p.legal_name, p.trade_name, p.gstin, p.tax_id, p.pan, p.address_line1, p.address_line2, p.city, p.state, p.postal_code, p.phone, p.email, p.website, p.bank_name, p.bank_account_number, p.bank_ifsc_swift, p.invoice_notes, p.branding, p.document_templates
       FROM organizations o LEFT JOIN organization_profiles p ON p.organization_id = o.id WHERE o.id = $1`,
      [organizationId]
    );
    if (!orgResult.rows[0]) throw new Error('Organization not found');
    const organization = orgResult.rows[0] as Record<string, any>;
    const documentTemplates = parseJson(organization.document_templates) || {};
    const hasRegistry = await DocumentTemplateService.hasRegistry(client);
    const legacyTemplateConfig = hasRegistry ? {} : this.templateConfig(documentTemplates, category);
    const versionedTemplate = await DocumentTemplateService.resolve(client, organizationId, category, requestedTemplateId);
    const templateConfig = versionedTemplate?.configuration && Object.keys(versionedTemplate.configuration).length
      ? { ...legacyTemplateConfig, ...versionedTemplate.configuration }
      : legacyTemplateConfig;
    const savedTemplate = templateConfig.defaultTemplate;
    if (requestedTemplateId && !versionedTemplate && !((DOCUMENT_PDF_CATALOG[category] as readonly string[]).includes(requestedTemplateId)) && !(['standard', 'ledger', 'compact'].includes(requestedTemplateId))) {
      const missingRecord = requestedTemplateId.startsWith('tmpl-') || requestedTemplateId.startsWith(`${category}-`);
      throw new Error(missingRecord ? `Document template not found: ${sanitize(requestedTemplateId)}` : `Unsupported ${category} PDF template: ${sanitize(requestedTemplateId)}`);
    }
    const templateId = versionedTemplate?.modelId || requestedTemplateId || savedTemplate || DOCUMENT_PDF_CATALOG[category][0];
    if (!(DOCUMENT_PDF_CATALOG[category] as readonly string[]).includes(templateId) && !(['standard', 'ledger', 'compact'].includes(templateId)) && !(versionedTemplate && [versionedTemplate.modelId, versionedTemplate.id].includes(templateId))) {
      throw new Error(`Unsupported ${category} PDF template: ${sanitize(templateId)}`);
    }

    if (category === 'customer-statements' || category === 'vendor-statements') {
      return this.buildStatementModel(client, organizationId, category, documentId, templateId, organization, templateConfig, options, versionedTemplate);
    }
    const sourceResult = await client.query(
      `SELECT * FROM ${meta.table} WHERE organization_id = $1 AND id = $2${options.lockSource ? ' FOR UPDATE' : ''}`,
      [organizationId, documentId]
    );
    if (!sourceResult.rows[0]) throw new Error(`${meta.title} record not found: ${documentId}`);
    const source = sourceResult.rows[0] as Record<string, any>;
    let returnCredit: RenderModel['returnCredit'];
    if (category === 'credit-notes') {
      const totalCents = databaseMoneyToCents(source.total_amount, 'Sales return total');
      const storedRemainingCents = databaseMoneyToCents(source.remaining_credit, 'Sales return remaining credit');
      let reversed = String(source.status || '').toUpperCase() === 'REVERSED'
        || Boolean(source.reversed_at || source.reversal_journal_id);
      if (templateId === 'goods-return' && source.journal_entry_id) {
        const journalResult = await client.query(
          `SELECT reversed_by_journal_id, reversal_of_journal_id, reversed_at
             FROM journal_entries WHERE organization_id = $1 AND id = $2`,
          [organizationId, source.journal_entry_id]
        );
        const journal = journalResult.rows[0] as Record<string, any> | undefined;
        reversed ||= Boolean(journal?.reversed_by_journal_id || journal?.reversal_of_journal_id || journal?.reversed_at);
      }
      if (reversed) source.status = 'REVERSED';
      if (totalCents <= 0n || storedRemainingCents < 0n || storedRemainingCents > totalCents) {
        throw new Error('Sales return credit amounts are outside the supported range');
      }
      let applications: NonNullable<RenderModel['returnCredit']>['applications'] = [];
      if (templateId === 'goods-return' && !reversed) {
        const applicationResult = await client.query(
          `SELECT a.id, a.invoice_id, a.amount_applied, a.applied_date, i.id AS matched_invoice_id, i.invoice_number
             FROM credit_note_applications a
             LEFT JOIN invoices i ON i.id = a.invoice_id AND i.organization_id = a.organization_id
            WHERE a.organization_id = $1 AND a.credit_note_id = $2
              AND UPPER(COALESCE(a.status, 'POSTED')) = 'POSTED' AND a.reversed_at IS NULL
            ORDER BY a.applied_date, a.id`,
          [organizationId, documentId]
        );
        let activeAppliedCents = 0n;
        applications = applicationResult.rows.map((row: any) => {
          if (row.invoice_id && !row.matched_invoice_id) throw new Error('Sales return application references an unavailable invoice');
          const amountCents = databaseMoneyToCents(row.amount_applied, 'Sales return application amount');
          if (amountCents <= 0n) throw new Error('Sales return applications must be positive amounts');
          activeAppliedCents += amountCents;
          return { id: String(row.id), date: isoDate(row.applied_date), invoiceNumber: sanitize(row.invoice_number), amount: centsToSafeNumber(amountCents, 'Sales return application amount') };
        });
        if (activeAppliedCents > totalCents) throw new Error('Sales return active applications exceed the return total');
      }
      returnCredit = {
        reason: sanitize(source.reason || ''),
        total: centsToSafeNumber(totalCents, 'Sales return total'),
        remaining: reversed ? 0 : centsToSafeNumber(storedRemainingCents, 'Sales return remaining credit'),
        reversed,
        applications: reversed ? [] : applications,
      };
    }
    if (category === 'expenses' && source.expense_account_id) {
      const account = await client.query('SELECT name FROM accounts WHERE organization_id = $1 AND id = $2', [organizationId, source.expense_account_id]);
      source.expense_category_name = account.rows[0]?.name || '';
    }
    let expenseBilling: RenderModel['expenseBilling'];
    if (category === 'expenses' && templateId === 'project-billable') {
      let project: Record<string, any> | undefined;
      if (source.project_id) {
        const projectResult = await client.query(
          'SELECT name, client_id, client_name FROM projects WHERE organization_id = $1 AND id = $2',
          [organizationId, source.project_id]
        );
        project = projectResult.rows[0] as Record<string, any> | undefined;
      }
      const billingClientId = source.client_id || project?.client_id;
      let billingClientName = '';
      if (billingClientId) {
        const customerResult = await client.query(
          'SELECT legal_name, display_name FROM customers WHERE organization_id = $1 AND id = $2',
          [organizationId, billingClientId]
        );
        const linkedCustomer = customerResult.rows[0] as Record<string, any> | undefined;
        if (linkedCustomer) {
          billingClientName = sanitize(linkedCustomer.legal_name || linkedCustomer.display_name || '');
        } else {
          const clientResult = await client.query(
            'SELECT name, company_name FROM clients WHERE organization_id = $1 AND id = $2',
            [organizationId, billingClientId]
          );
          billingClientName = sanitize(clientResult.rows[0]?.company_name || clientResult.rows[0]?.name || '');
        }
      } else {
        billingClientName = sanitize(project?.client_name || '');
      }
      let invoiceNumber = '';
      let invoiceStatus = '';
      const invoiceLinked = Boolean(source.invoice_id);
      if (invoiceLinked) {
        const invoice = await client.query(
          'SELECT invoice_number, status FROM invoices WHERE organization_id = $1 AND id = $2',
          [organizationId, source.invoice_id]
        );
        invoiceNumber = sanitize(invoice.rows[0]?.invoice_number || '');
        invoiceStatus = sanitize(invoice.rows[0]?.status || 'UNAVAILABLE').toUpperCase();
      }
      expenseBilling = {
        projectName: sanitize(project?.name || ''),
        clientName: billingClientName,
        invoiceNumber,
        invoiceStatus,
        invoiceLinked,
        isBillable: Boolean(source.is_billable),
        clientCharge: number(source.selling_price ?? 0),
        markupPercentage: number(source.markup_percentage ?? 0),
        isBilled: Boolean(source.is_billed),
      };
    }    const lines = category === 'credit-notes' ? [] : await this.resolveDocumentLines(client, organizationId, category, source);
    const journalLines = category === 'credit-notes' ? [] : await this.resolveJournalLines(client, organizationId, source.journal_entry_id || (category === 'journals' ? source.id : undefined));
    const partyName = sanitize(source[meta.party] || source.client_name || source.customer_name || source.vendor_name || (category === 'journals' ? 'General Ledger' : 'Counterparty'));
    const partyDetails = category === 'credit-notes' ? [] : [
      source.client_email || source.vendor_email,
      source.reference ? `Reference: ${source.reference}` : '',
      source.vendor_invoice_number ? `Vendor invoice: ${source.vendor_invoice_number}` : '',
      source.expense_category_name && templateConfig.showExpenseCategory !== false ? `Category: ${source.expense_category_name}` : '',
      source.reimbursement_status && templateConfig.showReimbursementStatus !== false ? `Reimbursement Status: ${source.reimbursement_status}` : '',
      source.vehicle_number ? `Vehicle #: ${source.vehicle_number}` : '',
      source.transporter_name ? `Transporter: ${source.transporter_name}` : '',
      source.e_way_bill_number ? `E-Way Bill: ${source.e_way_bill_number}` : '',
      source.payment_mode ? `Payment Mode: ${source.payment_mode}` : '',
      source.reason ? `Reason: ${source.reason}` : '',
    ].filter(Boolean).map(sanitize).filter((detail: string) => this.isPartyDetailVisible(category, detail, templateConfig));
    let subtotal = number(source.subtotal || source.amount || source.total_amount);
    const tax = number(source.tax_total || source.tax_amount);
    const discount = number(source.discount);
    const rawTotal = source[meta.amount] ?? source.amount ?? source.total_amount ?? lines.reduce((sum, line) => sum + number(line.amount), 0);
    let total = number(rawTotal);
    let netPaid: number | undefined;
    if (category === 'expenses') {
      const amountCents = databaseMoneyToCents(source.amount ?? 0, 'Expense amount');
      const taxCents = databaseMoneyToCents(source.tax_amount ?? 0, 'Expense tax amount');
      const tdsCents = databaseMoneyToCents(source.tds_amount ?? 0, 'Expense TDS amount');
      const inclusive = Boolean(source.is_tax_inclusive);
      const reverseCharge = Boolean(source.is_rcm);
      const baseCents = inclusive ? amountCents - taxCents : amountCents;
      const totalCents = reverseCharge ? baseCents : inclusive ? amountCents : baseCents + taxCents;
      subtotal = centsToSafeNumber(baseCents, 'Expense subtotal');
      total = centsToSafeNumber(totalCents, 'Expense total');
      netPaid = centsToSafeNumber(totalCents - tdsCents, 'Expense net paid');
    }
    const branding = parseJson(organization.branding) || {};
    const notesSource = category === 'vendor-credits' && templateConfig.showDebitReason === false
      ? source.notes || source.description || source.terms_and_conditions || templateConfig.termsAndConditions || branding.termsAndConditions
      : source.notes || source.reason || source.description || source.terms_and_conditions || templateConfig.termsAndConditions || branding.termsAndConditions;
    const notes = category === 'credit-notes'
      ? ''
      : (['quotes', 'sales-orders', 'purchase-orders'].includes(category) && templateConfig.showScopeOfWork === false)
        ? ''
        : sanitize(notesSource);
    const rawBalance = source.balance_due ?? source.remaining_credit ?? source.unallocated_amount;
    return {
      category, templateId, title: documentTitle(category, templateId, templateConfig.templateTitle),
      number: sanitize(source[meta.number] || source.id), status: sanitize(source.status || 'DRAFT').toUpperCase(), date: isoDate(source[meta.date]), dueDate: ((category === 'quotes' && templateConfig.showExpiryDate === false) || ((category === 'sales-orders' || category === 'purchase-orders') && templateConfig.showDeliveryDate === false)) ? undefined : isoDate(source.due_date || source.expected_delivery || source.expiry_date),
      partyLabel: category === 'journals' ? 'LEDGER' : category.includes('vendor') || category === 'bills' ? 'VENDOR' : category === 'delivery-challans' ? 'CONSIGNEE' : 'CUSTOMER',
      partyName, partyDetails, organization, source, templateConfig, lines: this.filterDocumentLines(category, lines, templateConfig), subtotal, tax, discount, total, netPaid,
      expenseBilling,
      balance: rawBalance == null ? undefined : number(rawBalance),
      notes,
      journalLines, versionedTemplate, returnCredit,
    };
  }

  private static async buildStatementModel(
    client: DbQueryClient,
    organizationId: string,
    category: 'customer-statements' | 'vendor-statements',
    partyId: string,
    templateId: string,
    organization: Record<string, any>,
    config: Record<string, any>,
    options: { fromDate?: string; toDate?: string },
    versionedTemplate: DocumentTemplateRecord | null
  ): Promise<RenderModel> {
    const toDate = options.toDate || new Date().toISOString().split('T')[0];
    const fromDate = options.fromDate || `${new Date(toDate).getUTCFullYear()}-04-01`;
    const statement = category === 'customer-statements'
      ? await CustomerStatementService.getCustomerStatement(organizationId, partyId, fromDate, toDate, client)
      : await VendorStatementService.getVendorStatement(organizationId, partyId, fromDate, toDate, client);
    const title = documentTitle(category, templateId, config.templateTitle);
    const customerStatement = category === 'customer-statements';
    const isOverviewTemplate = (customerStatement && templateId === 'open-summary') || (!customerStatement && templateId === 'reconciliation');
    const statementOverview = {
      openingBalance: number(statement.openingBalance),
      transactionCount: statement.transactions.length,
      closingBalance: number(statement.closingBalance),
    };
    const statementActivityRows = customerStatement
      ? [
          { label: 'Invoices', amount: number((statement as any).totalInvoices), side: 'Debit' as const },
          { label: 'Customer refunds', amount: number((statement as any).totalRefunds), side: 'Debit' as const },
          { label: 'Payments received', amount: number((statement as any).totalPayments), side: 'Credit' as const },
          { label: 'Credit notes', amount: number((statement as any).totalCredits), side: 'Credit' as const },
          { label: 'Write-offs', amount: number((statement as any).totalWriteOffs), side: 'Credit' as const },
          { label: 'Advances applied', amount: number((statement as any).totalAdvancesApplied), side: 'Credit' as const },
        ]
      : [
          { label: 'Vendor bills', amount: number((statement as any).totalBills), side: 'Credit' as const },
          { label: 'Vendor refunds', amount: number((statement as any).totalRefunds), side: 'Credit' as const },
          { label: 'Payments made', amount: number((statement as any).totalPayments), side: 'Debit' as const },
          { label: 'Vendor credits / debit notes', amount: number((statement as any).totalDebits), side: 'Debit' as const },
          { label: 'Write-offs', amount: number((statement as any).totalWriteOffs), side: 'Debit' as const },
        ];
    return {
      category, templateId, title, number: `${fromDate} to ${toDate}`, status: 'ISSUED', date: toDate,
      partyLabel: category === 'customer-statements' ? 'CUSTOMER' : 'VENDOR', partyName: sanitize((statement as any).customerName || (statement as any).vendorName),
      partyDetails: [
        ...(config.showStatementPeriod === false ? [] : [`Statement Period: ${fromDate} to ${toDate}`]),
        ...(config.showOpeningBalance === false || isOverviewTemplate ? [] : [`${customerStatement ? 'Opening Balance' : 'Opening Payables'}: ${this.formatAmount(number(statement.openingBalance), organization)}`]),
      ],
      organization, source: statement as any, templateConfig: config,
      lines: statement.transactions.map((line: any) => ({ date: isoDate(line.date), description: `${line.type} — ${line.reference}`, debit: number(line.debit), credit: number(line.credit), balance: number(line.runningBalance) })),
      subtotal: number((statement as any).totalInvoices || (statement as any).totalBills), tax: 0, discount: 0, total: number(statement.closingBalance), balance: number(statement.closingBalance), notes: '', journalLines: [], versionedTemplate,
      statementOverview,
      statementActivityRows,
    };
  }

  private static buildSampleModel(
    category: DocumentPdfCategory,
    templateId: string,
    organization: Record<string, any>,
    templateConfig: Record<string, any>,
    versionedTemplate: DocumentTemplateRecord | null = null
  ): RenderModel {
    const meta = CATEGORY_META[category];
    const title = documentTitle(category, templateId, templateConfig.templateTitle);
    const date = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    const sampleDefinitions: Record<DocumentPdfCategory, Partial<RenderModel>> = {
      quotes: {
        number: 'EST-SAMPLE-0042',
        partyLabel: 'CUSTOMER',
        partyName: 'Acme Global Technologies Pvt Ltd',
        partyDetails: ['acme.procurement@example.com'],
        lines: [
          { description: 'Enterprise Double-Entry Financial Engine License', hsnSac: '997331', quantity: 1, rate: 85000, amount: 85000 },
          { description: 'Dedicated Multi-Tenant Database Migration', hsnSac: '998313', quantity: 30, rate: 1500, amount: 45000 },
          { description: 'Priority SLA & Audit Support Service (12 Months)', hsnSac: '998314', quantity: 1, rate: 25000, amount: 25000 },
        ],
        subtotal: 155000, tax: 27900, discount: 5000, total: 177900,
        notes: 'Scope, pricing, and delivery details are listed for customer review.',
      },
      'sales-orders': {
        number: 'SO-SAMPLE-0189',
        partyLabel: 'CUSTOMER',
        partyName: 'Zenith Retail & Logistics Ltd',
        partyDetails: ['Customer PO #: PO-ZENITH-8842', 'Delivery Destination: Central Distribution Center, Mumbai'],
        lines: [
          { description: 'Automated POS Thermal Receipt Printers', quantity: 25, rate: 4200, amount: 105000 },
          { description: 'Heavy-Duty Cash Drawers with Dual Media Slots', quantity: 25, rate: 1800, amount: 45000 },
        ],
        subtotal: 150000, tax: 27000, discount: 0, total: 177000,
        notes: 'Dispatch scheduled via BlueDart Logistics. Standard transit insurance included.',
      },
      'delivery-challans': {
        number: 'DC-SAMPLE-0055',
        partyLabel: 'CONSIGNEE',
        partyName: 'Apex Commercial Infrastructure Ltd',
        partyDetails: ['Delivery Address: Plot 42, Sector 18, Electronic City, Bengaluru', 'Vehicle #: KA-01-MJ-9921', 'Transporter: SafeXpress India', 'E-Way Bill #: 241088492019'],
        lines: [
          { description: 'Precision CNC Machined Aluminum Enclosures', hsnSac: '7616', packages: '12 Crates', quantity: 120, rate: 1250, amount: 150000 },
          { description: 'Shielded Interface Connection Wiring Bundles', hsnSac: '8544', packages: '5 Boxes', quantity: 240, rate: 250, amount: 60000 },
        ],
        subtotal: 210000, tax: 37800, discount: 0, total: 247800,
        notes: 'Item and transport details are listed for reference.',
      },
      invoices: {
        number: 'INV-SAMPLE-1092',
        partyLabel: 'CUSTOMER',
        partyName: 'Reliance Retail Ventures Ltd',
        partyDetails: [],
        lines: [
          { description: 'Enterprise Financial Accounting & Banking Suite', hsnSac: '998314', quantity: 1, rate: 125000, amount: 125000 },
          { description: 'PostgreSQL Ledger Integrity Hardening & API Integration', hsnSac: '998315', quantity: 1, rate: 45000, amount: 45000 },
        ],
        subtotal: 170000, tax: 30600, discount: 0, total: 200600, balance: 200600,
        notes: 'Bank: HDFC Bank • Account: 50200012345678 • IFSC: HDFC0000123 • UPI: firmbooks@hdfcbank',
      },
      'credit-notes': {
        number: 'CN-SAMPLE-0018',
        partyLabel: 'CUSTOMER',
        partyName: 'Acme Global Technologies Pvt Ltd',
        partyDetails: [], lines: [], subtotal: 0, tax: 0, discount: 0, total: 18000,
        returnCredit: { reason: 'Goods returned', total: 18000, remaining: 18000, applications: [] },
        notes: 'The credit is available for application to an invoice or customer refund.',
      },
      'purchase-orders': {
        number: 'PO-SAMPLE-0312',
        partyLabel: 'VENDOR',
        partyName: 'Global Microchips & Hardware Components Ltd',
        partyDetails: ['Vendor GSTIN: 33AABCG5567K1ZO', 'Delivery Destination: FirmBooks Technology Campus, Whitefield, Bengaluru'],
        lines: [
          { description: 'High-Performance Dual-Core Industrial Controller ICs', hsnSac: '8542', quantity: 500, rate: 320, amount: 160000 },
          { description: 'SMD Ceramic Capacitor Reel 10uF (Pack of 1000)', hsnSac: '8532', quantity: 10, rate: 2400, amount: 24000 },
        ],
        subtotal: 184000, tax: 33120, discount: 0, total: 217120,
        notes: 'Payment terms: Net 45 days after verified receipt and QA acceptance test pass.',
      },
      'payment-receipts': {
        number: 'REC-SAMPLE-0544',
        partyLabel: 'CUSTOMER',
        partyName: 'Nexus Global Software Solutions Ltd',
        partyDetails: ['Payment Mode: NEFT / RTGS Wire Transfer', 'UTR Reference: CMS904481023812', 'Deposited To: Current Bank Account'],
        lines: [
          { description: 'Allocation: Settlement for Tax Invoice INV-2026-1042', amount: 80000 },
          { description: 'Allocation: Settlement for Tax Invoice INV-2026-1049', amount: 45000 },
        ],
        subtotal: 125000, tax: 0, discount: 0, total: 125000,
        notes: 'Official payment receipt acknowledgment issued with thanks.',
      },
      'customer-statements': {
        number: '2026-04-01 to 2026-09-24',
        partyLabel: 'CUSTOMER',
        partyName: 'Tata Consultancy Services Ltd',
        partyDetails: ['Statement Period: 01 Apr 2026 – 24 Sep 2026', 'Opening Balance: ₹25,000.00'],
        lines: [
          { date: '2026-05-10', description: 'Invoice INV-2026-0810', debit: 118000, credit: 0, balance: 143000 },
          { date: '2026-05-25', description: 'Payment REC-2026-0391 (NEFT)', debit: 0, credit: 100000, balance: 43000 },
          { date: '2026-07-12', description: 'Invoice INV-2026-0940', debit: 85000, credit: 0, balance: 128000 },
          { date: '2026-08-01', description: 'Payment REC-2026-0480 (IMPS)', debit: 0, credit: 75000, balance: 53000 },
        ],
        subtotal: 203000, tax: 0, discount: 0, total: 53000, balance: 53000,
        statementOverview: { openingBalance: 25000, transactionCount: 4, closingBalance: 53000 },
        statementActivityRows: [
          { label: 'Invoices', amount: 203000, side: 'Debit' },
          { label: 'Customer refunds', amount: 0, side: 'Debit' },
          { label: 'Payments received', amount: 175000, side: 'Credit' },
          { label: 'Credit notes', amount: 0, side: 'Credit' },
          { label: 'Write-offs', amount: 0, side: 'Credit' },
          { label: 'Advances applied', amount: 0, side: 'Credit' },
        ],
        notes: 'Please remit outstanding balance of ₹53,000.00 according to agreed credit terms.',
      },
      bills: {
        number: 'BILL-SAMPLE-0231',
        partyLabel: 'VENDOR',
        partyName: 'Amazon Web Services India Pvt Ltd',
        partyDetails: ['Vendor Invoice #: AWS-IN-9812491'],
        lines: [
          { description: 'Elastic Compute Cloud (EC2) Dedicated Instances', quantity: 1, rate: 54000, amount: 54000 },
          { description: 'Relational Database Service (RDS) Multi-AZ Cluster', quantity: 1, rate: 38000, amount: 38000 },
        ],
        subtotal: 92000, tax: 16560, discount: 0, total: 108560,
        notes: 'Allocated to General Ledger: 5010 - Cloud Computing Infrastructure & Hosting.',
      },
      expenses: {
        number: 'EXP-SAMPLE-0112',
        partyLabel: 'VENDOR',
        partyName: 'The Leela Palace Bangalore',
        partyDetails: ['Payment Account: Corporate Credit Card'],
        lines: [
          { description: 'Quarterly Executive Business Review Conference Suite', amount: 24500 },
        ],
        journalLines: [
          { description: '6100 - Business Travel & Executive Lodging', debit: 24500, credit: 0 },
          { description: '2040 - Corporate Credit Card Clearing', debit: 0, credit: 24500 },
        ],
        subtotal: 24500, tax: 0, discount: 0, total: 24500,
        notes: 'Expense details are listed for review.',
        expenseBilling: { projectName: 'Year-End Controls Modernization', clientName: 'Nexus Global Software Solutions Ltd', invoiceNumber: '', invoiceStatus: '', invoiceLinked: false, isBillable: true, clientCharge: 29400, markupPercentage: 20, isBilled: false },
      },
      'vendor-credits': {
        number: 'VC-SAMPLE-0023',
        partyLabel: 'VENDOR',
        partyName: 'Kaveri Industrial Packaging Mill',
        partyDetails: ['Reason: Moisture damage in received goods'],
        lines: [],
        subtotal: 11250, tax: 2025, discount: 0, total: 13275,
        notes: 'Vendor credit amount and reason are shown for reference.',
      },
      'vendor-payments': {
        number: 'VP-SAMPLE-0391',
        partyLabel: 'VENDOR',
        partyName: 'Infosys BPM Limited',
        partyDetails: ['Payment Mode: RTGS Electronic Remittance', 'UTR Reference: HDFCR5202609240182', 'Bank Account: HDFC Current Operating A/C'],
        lines: [
          { description: 'Settlement for Vendor Bill BILL-2026-0205', amount: 85000 },
          { description: 'Settlement for Vendor Bill BILL-2026-0211', amount: 55000 },
        ],
        subtotal: 140000, tax: 0, discount: 0, total: 140000,
        notes: 'Vendor payment details and allocations are listed for reference.',
      },
      'vendor-statements': {
        number: '2026-04-01 to 2026-09-24',
        partyLabel: 'VENDOR',
        partyName: 'Tata Steel Tubes Division Ltd',
        partyDetails: ['Statement Period: 01 Apr 2026 – 24 Sep 2026', 'Opening Payables: ₹15,000.00'],
        lines: [
          { date: '2026-05-18', description: 'Bill BILL-2026-0150', debit: 0, credit: 95000, balance: 110000 },
          { date: '2026-06-02', description: 'Payment VP-2026-0240 (RTGS)', debit: 80000, credit: 0, balance: 30000 },
          { date: '2026-08-14', description: 'Bill BILL-2026-0220', debit: 0, credit: 60000, balance: 90000 },
        ],
        subtotal: 155000, tax: 0, discount: 0, total: 90000, balance: 90000,
        statementOverview: { openingBalance: 15000, transactionCount: 3, closingBalance: 90000 },
        statementActivityRows: [
          { label: 'Vendor bills', amount: 155000, side: 'Credit' },
          { label: 'Vendor refunds', amount: 0, side: 'Credit' },
          { label: 'Payments made', amount: 80000, side: 'Debit' },
          { label: 'Vendor credits / debit notes', amount: 0, side: 'Debit' },
          { label: 'Write-offs', amount: 0, side: 'Debit' },
        ],
        notes: 'Net accounts payable outstanding balance: ₹90,000.00.',
      },
      journals: {
        number: 'JV-SAMPLE-0419',
        partyLabel: 'GENERAL LEDGER',
        partyName: 'General Accounting Ledger',
        partyDetails: ['Voucher Type: Double-Entry Journal Voucher', 'Posting Date: 2026-09-24', 'Status: POSTED'],
        lines: [],
        journalLines: [
          { description: '1010 - Current Operating Bank Account', debit: 180000, credit: 0, reference: 'Prepaid retainer transfer' },
          { description: '2110 - Unearned Revenue Liability', debit: 0, credit: 180000, reference: 'Prepaid enterprise retainer' },
        ],
        subtotal: 180000, tax: 0, discount: 0, total: 180000,
        notes: 'Adjusting journal entry to recognize prepaid software implementation retainer.',
      },
    };

    const def = sampleDefinitions[category] || sampleDefinitions.invoices;

    return {
      category,
      templateId,
      title,
      number: def.number || 'SAMPLE-001',
      status: 'SAMPLE',
      date,
      dueDate: (category === 'customer-statements' || category === 'vendor-statements' || (category === 'quotes' && templateConfig.showExpiryDate === false) || ((category === 'sales-orders' || category === 'purchase-orders') && templateConfig.showDeliveryDate === false)) ? undefined : dueDate,
      partyLabel: def.partyLabel || 'COUNTERPARTY',
      partyName: def.partyName || 'Sample Partner Ltd',
      partyDetails: (def.partyDetails || []).filter((detail: string) => this.isPartyDetailVisible(category, detail, templateConfig)).filter((detail: string) => {
        if (category === 'credit-notes' && detail.startsWith('Reason:') && templateConfig.showReturnReason === false) return false;
        if (category !== 'customer-statements' && category !== 'vendor-statements') return true;
        if (templateConfig.showStatementPeriod === false && detail.startsWith('Statement Period:')) return false;
        if (templateConfig.showOpeningBalance === false && /^Opening (Balance|Payables):/.test(detail)) return false;
        return true;
      }),
      organization,
      source: { sample: true },
      templateConfig,
      lines: this.filterDocumentLines(category, (def.lines || []).filter((line: PdfLine) => {
        if ((category === 'customer-statements' || category === 'vendor-statements') && templateConfig.showOpeningBalance === false) {
          return line.description !== 'Opening Balance';
        }
        return true;
      }), templateConfig),
      subtotal: def.subtotal || 0,
      tax: def.tax || 0,
      discount: def.discount || 0,
      total: def.total || 0,
      returnCredit: def.returnCredit as RenderModel['returnCredit'],
      balance: def.balance,
      notes: category === 'credit-notes'
        || (['quotes', 'sales-orders', 'purchase-orders'].includes(category) && templateConfig.showScopeOfWork === false) ? '' : def.notes,
      journalLines: def.journalLines || [],
      versionedTemplate,
      isSamplePreview: true,
      statementOverview: def.statementOverview,
      statementActivityRows: def.statementActivityRows,
      expenseBilling: category === 'expenses' && templateId === 'project-billable' ? def.expenseBilling : undefined,
    };
  }

  private static filterDocumentLines(category: DocumentPdfCategory, lines: PdfLine[], config: Record<string, any>): PdfLine[] {
    if (category === 'payment-receipts' && config.showInvoicesSettled === false) {
      return lines.filter((line) => !/\b(invoice|allocation)\b/i.test(line.description));
    }
    if (category === 'vendor-payments' && config.showBillsSettled === false) {
      return lines.filter((line) => !/\b(bill|settlement)\b/i.test(line.description));
    }
    return lines;
  }
  private static isPartyDetailVisible(category: DocumentPdfCategory, detail: string, config: Record<string, any>): boolean {
    const hiddenWhenDisabled: Array<[string, string[]]> = [
      ['showShippingAddress', ['Delivery Address:', 'Delivery Destination:']],
      ['showPoNumber', ['Customer PO #:']],
      ['showVehicleDetails', ['Vehicle #:']],
      ['showTransportDetails', ['Transporter:']],
      ['showEWayBill', ['E-Way Bill']],
      ['showVendorGstin', ['Vendor GSTIN:']],
      ['showPaymentModeBadge', ['Payment Mode:']],
      ['showUtrReference', ['UTR Reference:']],
      ['showOriginalInvoiceRef', ['Original Invoice #:']],
      ['showReturnReason', ['Reason:']],
      ['showVendorInvoiceRef', ['Vendor Invoice #:', 'Vendor invoice:']],
      ['showItcTag', ['Input Tax Credit (ITC):']],
      ['showClaimantName', ['Claimant:']],
      ['showReceiptsAttached', ['Evidence:']],
      ['showOriginalBillRef', ['Original Vendor Bill #:']],
      ['showDebitReason', ['Debit Reason:', ...(category === 'vendor-credits' ? ['Reason:'] : [])]],
    ];
    return !hiddenWhenDisabled.some(([key, prefixes]) =>
      config[key] === false && prefixes.some((prefix) => detail.startsWith(prefix))
    );
  }
  private static async resolveDocumentLines(client: DbQueryClient, organizationId: string, category: DocumentPdfCategory, source: Record<string, any>): Promise<PdfLine[]> {
    if (category === 'invoices') {
      const result = await client.query(`SELECT description, quantity, unit_price, amount FROM invoice_items WHERE organization_id = $1 AND invoice_id = $2 ORDER BY id`, [organizationId, source.id]);
      if (result.rows.length) return result.rows.map((line: any) => ({ description: sanitize(line.description || 'Line item'), quantity: number(line.quantity), rate: number(line.unit_price), amount: number(line.amount) }));
    }
    if (category === 'payment-receipts') {
      const result = await client.query(`SELECT i.invoice_number, a.amount FROM payment_received_allocations a LEFT JOIN invoices i ON i.id = a.invoice_id AND i.organization_id = a.organization_id WHERE a.organization_id = $1 AND a.payment_id = $2 ORDER BY a.id`, [organizationId, source.id]);
      return result.rows.map((line: any) => ({ description: `Invoice ${sanitize(line.invoice_number || 'allocation')}`, amount: number(line.amount) }));
    }
    if (category === 'vendor-payments') {
      const result = await client.query(`SELECT b.bill_number, a.amount FROM payment_made_allocations a LEFT JOIN bills b ON b.id = a.bill_id AND b.organization_id = a.organization_id WHERE a.organization_id = $1 AND a.payment_id = $2 ORDER BY a.id`, [organizationId, source.id]);
      return result.rows.map((line: any) => ({ description: `Bill ${sanitize(line.bill_number || 'allocation')}`, amount: number(line.amount) }));
    }
    const rawLines = parseJson(source.line_items || source.items);
    if (Array.isArray(rawLines)) return rawLines.map((line: any) => ({
      description: sanitize([line.name || line.itemName, line.description].filter(Boolean).join(' - ') || 'Line item'),
      hsnSac: sanitize(line.hsnSac || line.hsn_sac || ''),
      packages: sanitize(line.packages || line.pkg || ''),
      quantity: number(line.quantity ?? line.qty),
      rate: number(line.unitPrice ?? line.unit_price ?? line.rate),
      amount: number(line.amount ?? line.lineTotal ?? ((number(line.quantity ?? line.qty) || 1) * number(line.unitPrice ?? line.unit_price ?? line.rate))),
    }));
    return [];
  }

  private static async resolveJournalLines(client: DbQueryClient, organizationId: string, journalEntryId?: string): Promise<PdfLine[]> {
    if (!journalEntryId) return [];
    const result = await client.query(`SELECT account_code, account_name, description, debit, credit FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2 ORDER BY id`, [organizationId, journalEntryId]);
    return result.rows.map((line: any) => ({ description: sanitize(line.account_name || line.account_code || line.description || 'Ledger account'), debit: number(line.debit), credit: number(line.credit), reference: sanitize(line.description) }));
  }

  private static formatAmount(amount: number, org: Record<string, any>): string {
    const code = sanitize(org.base_currency || 'INR');
    const configuredSymbol = String(org.currency_symbol || (code === 'INR' ? '₹' : code));
    const symbol = sanitize(configuredSymbol) || code;
    return formatCurrencyAmount(amount, symbol);
  }

  private static layout(templateId: string, registeredLayout?: string): 'standard' | 'ledger' | 'compact' {
    if (registeredLayout === 'standard' || registeredLayout === 'ledger' || registeredLayout === 'compact') return registeredLayout;
    if (templateId === 'goods-return') return 'ledger';
    if (templateId === 'adjustment') return 'compact';
    if (['running-ledger', 'vendor-ledger'].includes(templateId)) return 'ledger';
    if (['open-summary', 'reconciliation'].includes(templateId)) return 'compact';
    if (['aging-statement', 'payables-aging'].includes(templateId)) return 'standard';
    if (['spreadsheet', 'ledger', 'accrual', 'three-tier', 'matching', 'return', 'contract', 'jobwork', 'requisition'].includes(templateId)) return 'ledger';

    if (['compact', 'pos', 'petty', 'cheque', 'dispatch', 'acknowledgment', 'settlement'].includes(templateId)) return 'compact';
    return 'standard';
  }
  private static buildFilename(model: RenderModel, fallback: string): string {
    const pattern = typeof model.templateConfig.exportFileNamePattern === 'string' ? model.templateConfig.exportFileNamePattern : '';
    if (!pattern) return fallback;
    const rendered = pattern.replace(/%\{([A-Za-z]+)\}/g, (_match, token: string) => {
      if (token === 'PartyName') return model.partyName;
      if (token === 'Date') return model.date;
      if (token === 'DocumentNumber' || /Number$/.test(token)) return model.number;
      return '';
    });
    const safe = sanitize(rendered).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 120);
    return `${safe || sanitize(fallback).replace(/\.pdf$/i, '')}.pdf`;
  }

  private static render(model: RenderModel): Promise<Buffer> {
    const branding = parseJson(model.organization.branding) || {};
    const primary = sanitize(model.templateConfig?.primaryColor || branding.primaryColor || '#1d4ed8');
    const accent = sanitize(model.templateConfig?.accentColor || branding.accentColor || '#0f172a');
    const primaryText = contrastTextForFill(primary);
    const accentText = contrastTextForFill(accent);
    const primaryInk = readableInkOnWhite(primary);
    const accentInk = readableInkOnWhite(accent);
    const categoryAccent = PDF_CATEGORY_ACCENTS[model.category];
    const categoryLabel = PDF_CATEGORY_LABELS[model.category];
    const layout = this.layout(model.templateId, model.versionedTemplate?.layoutFamily || model.templateConfig?.layoutFamily);
    const amount = (value: number) => this.formatAmount(value, model.organization);
    const isStatement = model.category === 'customer-statements' || model.category === 'vendor-statements';
    const displayNumber = isStatement && model.templateConfig.showStatementPeriod === false ? '' : model.number;

    const paperSize = (model.templateConfig?.paperSize || model.versionedTemplate?.paperSize || 'A4').toUpperCase();
    const orientation = (model.templateConfig?.orientation || model.versionedTemplate?.orientation || 'portrait').toLowerCase() as 'portrait' | 'landscape';
    const fontChoice = model.templateConfig?.fontFamily === 'Courier' ? 'Courier' : model.templateConfig?.fontFamily === 'Times-Roman' ? 'Times-Roman' : 'Helvetica';
    const boldFont = fontChoice === 'Courier' ? 'Courier-Bold' : fontChoice === 'Times-Roman' ? 'Times-Bold' : 'Helvetica-Bold';
    const italicFont = fontChoice === 'Courier' ? 'Courier-Oblique' : fontChoice === 'Times-Roman' ? 'Times-Italic' : 'Helvetica-Oblique';

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          size: paperSize as any,
          layout: orientation,
          bufferPages: true,
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 80;
        const pageHeight = doc.page.height;
        const maxContentY = pageHeight - 88;
        let y = 40;

        const ensure = (height: number) => {
          if (y + height > maxContentY) {
            doc.addPage();
            y = 40;
          }
        };
        const returnContentMaxY = maxContentY - 20;
        const ensureReturnContent = (height: number) => {
          if (y + height > returnContentMaxY) {
            doc.addPage();
            y = 40;
          }
        };

        const text = (value: unknown, x: number, top: number, width: number, options: any = {}) => {
          return doc.text(sanitize(value || '-'), x, top, { width, ...options });
        };
        const fitSingleLine = (value: unknown, width: number) => {
          let fitted = sanitize(value || '-');
          if (doc.widthOfString(fitted) <= width) return fitted;
          while (fitted.length > 1 && doc.widthOfString(fitted + '...') > width) fitted = fitted.slice(0, -1);
          return fitted.length > 1 ? fitted + '...' : fitted;
        };
        const drawFittedText = (value: unknown, x: number, top: number, width: number, maxFontSize: number, minFontSize: number, options: any = {}) => {
          const content = sanitize(value || '-');
          let fontSize = maxFontSize;
          while (fontSize > minFontSize && doc.widthOfString(content) > width) {
            fontSize = Math.max(minFontSize, fontSize - 0.5);
            doc.fontSize(fontSize);
          }
          return doc.text(content, x, top, { width, lineBreak: false, ...options });
        };
        const drawBoundedSingleLine = (value: unknown, x: number, top: number, width: number, maxFontSize: number, minFontSize: number, options: any = {}) => {
          const content = sanitize(value || '-');
          let fontSize = maxFontSize;
          doc.fontSize(fontSize);
          while (fontSize > minFontSize && doc.widthOfString(content) > width) {
            fontSize = Math.max(minFontSize, fontSize - 0.5);
            doc.fontSize(fontSize);
          }
          let visible = content;
          if (doc.widthOfString(visible) > width) {
            while (visible.length > 1 && doc.widthOfString(visible + '...') > width) visible = visible.slice(0, -1);
            visible = visible.length > 1 ? visible + '...' : '...';
          }
          return doc.text(visible, x, top, { width, lineBreak: false, ...options });
        };        const wrapToWidth = (value: unknown, width: number): string[] => {
          const words = sanitize(value || '-').split(/\s+/);
          const lines: string[] = [];
          let current = '';
          for (const word of words) {
            const candidate = current ? current + ' ' + word : word;
            if (doc.widthOfString(candidate) <= width) { current = candidate; continue; }
            if (current) lines.push(current);
            current = '';
            let segment = '';
            for (const character of word) {
              if (doc.widthOfString(segment + character) > width && segment) { lines.push(segment); segment = character; }
              else segment += character;
            }
            current = segment;
          }
          if (current) lines.push(current);
          return lines.length ? lines : ['-'];
        };

        // --- 1. HEADER SECTION ---
        if (model.category === 'quotes' && model.templateId === 'milestone-proposal') {
          doc.rect(40, y, pageWidth, 4).fill(primary);
          doc.rect(40, y + 13, 5, 45).fill(categoryAccent);
          doc.fillColor(categoryAccent).font(boldFont).fontSize(7);
          text('CLIENT PROPOSAL', 54, y + 13, pageWidth * 0.58);
          doc.fillColor(accentInk).font(boldFont).fontSize(17);
          drawBoundedSingleLine(model.title, 54, y + 25, pageWidth * 0.59, 17, 10);
          doc.fillColor('#475569').font(fontChoice).fontSize(8);
          text(`Status: ${model.status}`, 54, y + 49, pageWidth * 0.58);
          doc.rect(40 + pageWidth * 0.68, y + 13, pageWidth * 0.32, 45).fill('#f1f5f9');
          doc.fillColor(primaryInk).font(boldFont).fontSize(7);
          text('QUOTE REFERENCE', 46 + pageWidth * 0.68, y + 19, pageWidth * 0.28);
          doc.font(boldFont).fontSize(10);
          if (displayNumber) drawBoundedSingleLine(displayNumber, 46 + pageWidth * 0.68, y + 33, pageWidth * 0.28, 10, 7);
          y += 72;
        } else if (model.category === 'delivery-challans' && model.templateId === 'packing-list') {
          doc.rect(40, y, pageWidth, 57).strokeColor(categoryAccent).lineWidth(1).stroke();
          doc.rect(40, y, pageWidth, 8).fill(primary);
          doc.fillColor(categoryAccent).font(boldFont).fontSize(7);
          text('DISPATCH NOTE', 50, y + 15, pageWidth * 0.58);
          doc.fillColor(accentInk).font(boldFont).fontSize(15);
          drawBoundedSingleLine(model.title, 50, y + 27, pageWidth * 0.58, 15, 9);
          doc.fillColor(primaryInk).font(boldFont).fontSize(10);
          if (displayNumber) drawBoundedSingleLine(displayNumber, 40 + pageWidth * 0.62, y + 20, pageWidth * 0.34, 10, 7, { align: 'right' });
          doc.fillColor('#475569').font(fontChoice).fontSize(8);
          text(`Status: ${model.status}`, 40 + pageWidth * 0.62, y + 40, pageWidth * 0.34, { align: 'right' });
          y += 69;
        } else if (model.category === 'invoices' && model.templateId === 'export') {
          doc.rect(40, y, 5, 58).fill(categoryAccent);
          doc.rect(49, y, pageWidth - 9, 2.5).fill(primary);
          doc.fillColor(categoryAccent).font(boldFont).fontSize(7);
          text('COMMERCIAL DOCUMENT', 54, y + 11, pageWidth * 0.58);
          doc.fillColor(accentInk).font(boldFont).fontSize(17);
          drawBoundedSingleLine(model.title, 54, y + 24, pageWidth * 0.57, 17, 10);
          doc.fillColor('#475569').font(fontChoice).fontSize(8);
          text(`Status: ${model.status}`, 54, y + 49, pageWidth * 0.56);
          doc.rect(40 + pageWidth * 0.68, y + 10, pageWidth * 0.32, 48).fill('#eff6ff');
          doc.fillColor(primaryInk).font(boldFont).fontSize(7);
          text('INVOICE NUMBER', 46 + pageWidth * 0.68, y + 17, pageWidth * 0.28);
          doc.font(boldFont).fontSize(10);
          if (displayNumber) drawBoundedSingleLine(displayNumber, 46 + pageWidth * 0.68, y + 32, pageWidth * 0.28, 10, 7);
          y += 70;
        } else if (layout === 'standard') {
          doc.rect(40, y, pageWidth, 54).fill(primary);
          doc.rect(40, y, 4, 54).fill(categoryAccent);
          doc.fillColor(primaryText).font(boldFont).fontSize(6);
          text(categoryLabel, 52, y + 4, pageWidth * 0.55);
          doc.fillColor(primaryText).font(boldFont).fontSize(14);
          drawBoundedSingleLine(model.title, 52, y + 13, pageWidth * 0.6 - 20, 14, 9);
          doc.font(fontChoice).fontSize(8);
          text(`Template: ${model.templateId}`, 52, y + 36, pageWidth * 0.4);
          doc.font(boldFont).fontSize(12);
          if (displayNumber) text(displayNumber, 40 + pageWidth * 0.6, y + 15, pageWidth * 0.38, { align: 'right' });
          doc.font(fontChoice).fontSize(8);
          text(`Status: ${model.status}`, 40 + pageWidth * 0.6, y + 36, pageWidth * 0.38, { align: 'right' });
          y += 66;
        } else if (layout === 'ledger') {
          doc.rect(40, y, pageWidth, 2.5).fill(primary);
          doc.rect(40, y + 3, pageWidth * 0.24, 2).fill(categoryAccent);
          y += 10;
          doc.fillColor(accentInk).font(boldFont).fontSize(18);
          drawBoundedSingleLine(model.title, 40, y, pageWidth * 0.6, 18, 12);
          doc.fontSize(10);
          if (displayNumber) text(displayNumber, 40 + pageWidth * 0.6, y + 3, pageWidth * 0.38, { align: 'right' });
          y += 28;
          doc.rect(40, y, pageWidth, 22).fill('#eff6ff');
          doc.fillColor(primaryInk).fontSize(8).font(boldFont);
          drawBoundedSingleLine(`FORMAL DOCUMENT RECORD: ${model.title}`, 50, y + 6, pageWidth * 0.55 - 10, 8, 5.5);
          text(`STATUS: ${model.status}`, 40 + pageWidth * 0.55, y + 6, pageWidth * 0.42, { align: 'right' });
          y += 32;
        } else {
          // compact
          doc.rect(40, y, pageWidth, 32).fill(accent);
          doc.rect(40, y, 4, 32).fill(categoryAccent);
          doc.fillColor(accentText).font(boldFont).fontSize(12);
          drawBoundedSingleLine(model.title, 50, y + 9, pageWidth * 0.55 - 18, 12, 8.5);
          if (displayNumber) text(displayNumber, 40 + pageWidth * 0.55, y + 9, pageWidth * 0.42, { align: 'right' });
          y += 44;
        }

        // --- 2. WATERMARK ---
        const hasWatermark = Boolean(model.isSamplePreview || model.templateConfig.showWatermark);
        const watermarkString = sanitize(model.isSamplePreview ? 'SAMPLE PREVIEW — NOT AN ISSUED DOCUMENT' : model.templateConfig.watermarkText || 'ORIGINAL FOR RECIPIENT');

        // --- 3. ISSUER & COUNTERPARTY IDENTITIES ---
        let logoBuffer: Buffer | null = null;
        if (model.organization.logo_url && typeof model.organization.logo_url === 'string') {
          const trimmed = model.organization.logo_url.trim();
          if (trimmed.startsWith('data:image/')) {
            const commaIdx = trimmed.indexOf(',');
            if (commaIdx !== -1) {
              try {
                logoBuffer = Buffer.from(trimmed.slice(commaIdx + 1), 'base64');
              } catch {
                logoBuffer = null;
              }
            }
          }
        }

        if (logoBuffer) {
          try {
            doc.image(logoBuffer, 40, y, { fit: [140, 36] });
            y += 42;
          } catch {
            // Ignore if image unsupported
          }
        }

        const orgName = sanitize(model.organization.legal_name || model.organization.trade_name || model.organization.name || 'Organization');
        const orgAddress = [model.organization.address_line1, model.organization.address_line2, model.organization.city, model.organization.state, model.organization.postal_code].filter(Boolean).map(sanitize).join(', ');
        const orgTaxDetails = [model.organization.gstin ? `GSTIN: ${model.organization.gstin}` : '', model.organization.pan ? `PAN: ${model.organization.pan}` : ''].filter(Boolean).join(' • ');

        const halfWidth = (pageWidth - 20) / 2;
        doc.fillColor(accentInk).font(boldFont).fontSize(10);
        text(orgName, 40, y, halfWidth);
        doc.font(fontChoice).fontSize(7.5).fillColor('#475569');
        const orgSubDetails = [orgAddress, orgTaxDetails, model.organization.phone, model.organization.email].filter(Boolean).join('\n');
        text(orgSubDetails, 40, y + 14, halfWidth);

        // Counterparty
        const rightColX = 40 + halfWidth + 20;
        doc.fillColor(accentInk).font(boldFont).fontSize(8);
        text(model.partyLabel, rightColX, y, halfWidth, { align: 'right' });
        doc.fontSize(10).font(boldFont);
        const partyNameLines = wrapToWidth(model.partyName, halfWidth);
        const partyNameText = partyNameLines.join('\n');
        const partyNameHeight = doc.heightOfString(partyNameText, { width: halfWidth });
        doc.text(partyNameText, rightColX, y + 12, { width: halfWidth, align: 'right', lineGap: 0 });
        doc.font(fontChoice).fontSize(7.5).fillColor('#475569');
        const partySubDetails = model.partyDetails
          .filter((detail) => this.isPartyDetailVisible(model.category, detail, model.templateConfig))
          .join('\n');
        const partyDetailsTop = y + 14 + partyNameHeight;
        text(partySubDetails, rightColX, partyDetailsTop, halfWidth, { align: 'right' });

        const leftHeight = 14 + (orgSubDetails ? doc.heightOfString(orgSubDetails, { width: halfWidth }) : 0);
        const rightHeight = 14 + partyNameHeight + (partySubDetails ? doc.heightOfString(partySubDetails, { width: halfWidth }) : 0);
        y += Math.max(64, Math.max(leftHeight, rightHeight) + 8);

        doc.moveTo(40, y).lineTo(40 + pageWidth, y).strokeColor('#cbd5e1').stroke();
        y += 8;

        // --- 4. METADATA ATTRIBUTES ---
        const metadata: Array<[string, string]> = [
          ['Date', model.date],
          ...(model.dueDate && model.dueDate !== '-' ? [['Due / Delivery', model.dueDate] as [string, string]] : []),
          ['Status', model.status],
          ...(model.source.reference ? [['Reference', sanitize(model.source.reference)] as [string, string]] : []),
        ];

        for (let index = 0; index < metadata.length; index += 2) {
          const left = metadata[index];
          const right = metadata[index + 1];
          doc.font(boldFont).fontSize(7.5).fillColor('#64748b');
          text(left[0], 40, y, 90);
          doc.font(fontChoice).fillColor(accentInk);
          text(left[1], 135, y, halfWidth - 95);
          if (right) {
            doc.font(boldFont).fillColor('#64748b');
            text(right[0], rightColX, y, 100);
            doc.font(fontChoice).fillColor(accentInk);
            text(right[1], rightColX + 105, y, halfWidth - 105, { align: 'right' });
          }
          y += 13;
        }
        y += 6;

        // Registered order models use different document bodies while staying
        // grounded in the source-backed render model. These panels describe
        // order facts only; they never imply that goods were shipped/received.
        const orderPanel = (() => {
          if (model.category === 'sales-orders') {
            if (model.templateId === 'confirmation') return {
              heading: 'ORDER CONFIRMATION',
              facts: [['Order number', model.number], ['Customer', model.partyName], ['Delivery date', model.dueDate || 'Not specified']],
            };
            if (model.templateId === 'commercial') return {
              heading: 'COMMERCIAL ORDER SUMMARY',
              facts: [['Order value', amount(model.total)], ['Tax', amount(model.tax)], ['Terms', model.notes || 'Not specified']],
            };
            if (model.templateId === 'fulfillment') return {
              heading: 'ORDERED ITEMS & DELIVERY PLAN',
              facts: [['Order number', model.number], ['Delivery destination', model.partyDetails.find((detail) => detail.startsWith('Delivery Destination:'))?.replace('Delivery Destination:', '').trim() || 'Not specified'], ['Ordered lines', String(model.lines.length)]],
            };
          }
          if (model.category === 'purchase-orders') {
            if (model.templateId === 'standard-po') return {
              heading: 'PURCHASE ORDER SUMMARY',
              facts: [['Vendor', model.partyName], ['Order value', amount(model.total)], ['Delivery date', model.dueDate || 'Not specified']],
            };
            if (model.templateId === 'contract-po') return {
              heading: 'PROCUREMENT COMMERCIAL TERMS',
              facts: [['Vendor', model.partyName], ['Order value', amount(model.total)], ['Terms', model.notes || 'Not specified']],
            };
            if (model.templateId === 'requisition') return {
              heading: 'PURCHASE ITEMS SUMMARY',
              facts: [['Order line items', String(model.lines.length)], ['Order total', amount(model.total)], ['Delivery destination', model.partyDetails.find((detail) => detail.startsWith('Delivery Destination:'))?.replace('Delivery Destination:', '').trim() || 'Not specified']],
            };
          }
          const detail = (prefix: string, fallback = 'Not provided', visibilitySetting?: string) =>
            visibilitySetting && model.templateConfig[visibilitySetting] === false
              ? fallback
              : model.partyDetails.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() || fallback;
          if (model.category === 'bills') {
            if (model.templateId === 'bill-itc') return {
              heading: 'VENDOR BILL & TAX DETAILS',
              facts: [['Vendor invoice', detail('Vendor Invoice #:', detail('Vendor invoice:', 'Not provided', 'showVendorInvoiceRef'), 'showVendorInvoiceRef')], ['ITC information', detail('Input Tax Credit (ITC):', 'Not provided', 'showItcTag')], ['Bill total', amount(model.total)]],
            };
            if (model.templateId === 'accrual-voucher') return {
              heading: 'BILL RECORD SUMMARY',
              facts: [['Bill number', model.number], ['Vendor', model.partyName], ['Recorded total', amount(model.total)]],
            };
            if (model.templateId === 'matching') return {
              heading: 'BILL REFERENCE DETAILS',
              facts: [['Vendor invoice', detail('Vendor Invoice #:', detail('Vendor invoice:', 'Not provided', 'showVendorInvoiceRef'), 'showVendorInvoiceRef')], ['Bill line items', String(model.lines.length)], ['Recorded total', amount(model.total)]],
            };
          }
          if (model.category === 'vendor-credits') {
            if (model.templateId === 'debit-note') return {
              heading: 'VENDOR CREDIT DETAILS',
              facts: [['Credit number', model.number], ['Original bill', detail('Original Vendor Bill #:', 'Not provided', 'showOriginalBillRef')], ['Reason', detail('Debit Reason:', detail('Reason:', 'Not provided', 'showDebitReason'), 'showDebitReason')]],
            };
            if (['purchase-return', 'return'].includes(model.templateId)) return {
              heading: 'VENDOR CREDIT LINE SUMMARY',
              facts: [['Credit line items', String(model.lines.length)], ['Credit total', amount(model.total)], ['Original bill', detail('Original Vendor Bill #:', 'Not provided', 'showOriginalBillRef')]],
            };
            if (['adjustment-memo', 'adjustment'].includes(model.templateId)) return {
              heading: 'VENDOR CREDIT AMOUNT SUMMARY',
              facts: [['Credit number', model.number], ['Recorded amount', amount(model.total)], ['Available balance', model.balance === undefined ? 'Not provided' : amount(model.balance)]],
            };
          }
          return null;
        })();
        const visibleOrderFacts = orderPanel?.facts.filter(([label]) => {
          const visibilitySetting: Record<string, string> = {
            'Vendor invoice': 'showVendorInvoiceRef',
            'ITC information': 'showItcTag',
            'Original bill': 'showOriginalBillRef',
            Reason: 'showDebitReason',
          };
          const setting = visibilitySetting[label];
          return !setting || model.templateConfig[setting] !== false;
        }) || [];
        if (orderPanel) {
          const panelHeight = 42;
          ensure(panelHeight + 8);
          doc.roundedRect(40, y, pageWidth, panelHeight, 3).fillAndStroke('#f8fafc', '#cbd5e1');
          doc.font(boldFont).fontSize(7.5).fillColor(accentInk);
          text(orderPanel.heading, 48, y + 6, pageWidth - 16);
          const factWidth = (pageWidth - 20) / Math.max(visibleOrderFacts.length, 1);
          visibleOrderFacts.forEach(([label, value], index) => {
            const x = 48 + factWidth * index;
            doc.font(boldFont).fontSize(6.5).fillColor('#64748b');
            text(label, x, y + 19, factWidth - 8);
            doc.font(fontChoice).fontSize(7).fillColor('#1e293b');
            // Keep the summary panel compact even for unusually long names or
            // destinations. The complete values remain in the party details,
            // line items, or terms section elsewhere in the PDF.
            text(fitSingleLine(value, factWidth - 8), x, y + 28, factWidth - 8, { lineBreak: false });
          });
          y += panelHeight + 8;
        }

        const categoryPanel = (() => {
          if (model.category === 'quotes') {
            if (model.templateId === 'proposal') return {
              heading: 'QUOTE OVERVIEW',
              facts: [...(model.templateConfig.showExpiryDate === false ? [] : [['Valid through', model.dueDate || 'Not specified'] as [string, string]]), ['Line items', String(model.lines.length)], ['Proposed total', amount(model.total)]],
            };
            if (model.templateId === 'commercial') return {
              heading: 'COMMERCIAL OFFER',
              facts: [
                ...(model.source.sample || number(model.source.subtotal) > 0 ? [[model.source.quotation_revision && model.source.is_gst_inclusive ? 'Subtotal (tax inclusive)' : 'Subtotal', amount(model.subtotal)] as [string, string]] : []),
                ...(model.templateConfig.showTaxBreakdown !== false && (model.source.sample || number(model.source.tax_total ?? model.source.tax_amount) > 0) ? [[model.source.quotation_revision && model.source.is_gst_inclusive ? 'Tax included' : 'Tax', amount(model.tax)] as [string, string]] : []),
                ...(model.source.sample || number(model.source.discount) > 0 ? [['Discount', amount(model.discount)] as [string, string]] : []),
                ...(model.source.quotation_revision && number(model.source.round_off_amount) ? [['Round-off', amount(number(model.source.round_off_amount))] as [string, string]] : []),
                ['Offer total', amount(model.total)],
              ],
            };
            if (model.templateId === 'compact') return {
              heading: 'QUICK QUOTE',
              facts: [
                ['Quote number', model.number],
                ...(model.templateConfig.showExpiryDate === false ? [] : [['Valid through', model.dueDate || 'Not specified'] as [string, string]]),
                ...(model.source.sample || number(model.source.subtotal) > 0 ? [[model.source.quotation_revision && model.source.is_gst_inclusive ? 'Subtotal (tax inclusive)' : 'Subtotal', amount(model.subtotal)] as [string, string]] : []),
                ...(model.templateConfig.showTaxBreakdown !== false && (model.source.sample || number(model.source.tax_total ?? model.source.tax_amount) > 0) ? [[model.source.quotation_revision && model.source.is_gst_inclusive ? 'Tax included' : 'Tax', amount(model.tax)] as [string, string]] : []),
                ...(model.source.sample || number(model.source.discount) > 0 ? [['Discount', amount(model.discount)] as [string, string]] : []),
                ...(model.source.quotation_revision && number(model.source.round_off_amount) ? [['Round-off', amount(number(model.source.round_off_amount))] as [string, string]] : []),
                ['Offer total', amount(model.total)],
              ],
            };
          }
          if (model.category === 'delivery-challans') {
            const quantity = model.lines.reduce((sum, line) => sum + number(line.quantity), 0);
            const packageCount = model.lines.filter((line) => Boolean(line.packages)).length;
            if (model.templateId === 'dispatch') return {
              heading: 'DELIVERY CHALLAN OVERVIEW',
              facts: [['Item lines', String(model.lines.length)], ['Quantity listed', String(quantity)], ...(model.templateConfig.showPackageDetails === false ? [] : [['Packages listed', String(packageCount)] as [string, string]])],
            };
            if (model.templateId === 'jobwork') return {
              heading: 'CHALLAN ITEM SUMMARY',
              facts: [['Material lines', String(model.lines.length)], ['Recorded quantity', String(quantity)], ...(model.templateConfig.showPackageDetails === false ? [] : [['Package entries', String(packageCount)] as [string, string]])],
            };
          }
          if (model.category === 'invoices') {
            if (model.templateId === 'tax-invoice') return {
              heading: 'TAX INVOICE TOTALS',
              facts: [['Invoice number', model.number], ['Invoice total', amount(model.total)], ['Tax total', amount(model.tax)], ...(model.balance === undefined ? [] : [['Balance due', amount(model.balance)] as [string, string]])],
            };
            if (model.templateId === 'ledger-invoice') return {
              heading: 'INVOICE LEDGER OVERVIEW',
              facts: [
                ['Invoice number', model.number],
                ...(model.source.sample || number(model.source.subtotal) > 0 ? [['Subtotal', amount(model.subtotal)] as [string, string]] : []),
                ...(model.source.sample || number(model.source.tax_total ?? model.source.tax_amount) > 0 ? [['Tax total', amount(model.tax)] as [string, string]] : []),
                ...(model.source.sample || number(model.source.discount) > 0 ? [['Discount', amount(model.discount)] as [string, string]] : []),
                ['Recorded total', amount(model.total)],
                ...(model.balance === undefined ? [] : [['Balance due', amount(model.balance)] as [string, string]]),
                ['Line items', String(model.lines.length)],
              ],
            };
          }
          return null;
        })();
        const visibleCategoryFacts = categoryPanel?.facts.filter(([label]) => {
          if (label === 'Tax' || label === 'Tax total') return model.templateConfig.showTaxBreakdown !== false;
          if (label === 'Discount') return model.templateConfig.showDiscount !== false;
          return true;
        }) || [];
        const drawCategoryPanel = () => {
          if (!categoryPanel) return;
          const factsPerRow = 3;
          const factCellWidth = (pageWidth - 20) / factsPerRow;
          const preparedFacts = visibleCategoryFacts.map(([label, value]) => {
            doc.font(boldFont).fontSize(6.5);
            const labelLines = wrapToWidth(label, factCellWidth - 8);
            doc.font(fontChoice).fontSize(7);
            const valueLines = wrapToWidth(value, factCellWidth - 8);
            return { labelLines, valueLines };
          });
          const rowHeights: number[] = [];
          for (let index = 0; index < preparedFacts.length; index += factsPerRow) {
            const row = preparedFacts.slice(index, index + factsPerRow);
            rowHeights.push(Math.max(28, ...row.map((fact) => 9 + fact.labelLines.length * 7 + fact.valueLines.length * 8)));
          }
          const panelHeight = Math.max(42, 22 + rowHeights.reduce((sum, height) => sum + height, 0) + 5);
          ensure(panelHeight + 8);
          doc.roundedRect(40, y, pageWidth, panelHeight, 3).fillAndStroke('#f8fafc', '#cbd5e1');
          doc.font(boldFont).fontSize(7.5).fillColor(accentInk);
          text(categoryPanel.heading, 48, y + 6, pageWidth - 16);
          let rowTop = y + 20;
          for (let index = 0; index < preparedFacts.length; index += factsPerRow) {
            const row = preparedFacts.slice(index, index + factsPerRow);
            row.forEach((fact, column) => {
              const x = 48 + factCellWidth * column;
              doc.font(boldFont).fontSize(6.5).fillColor('#64748b');
              doc.text(fact.labelLines.join('\n'), x, rowTop, { width: factCellWidth - 8, lineGap: 0 });
              doc.font(fontChoice).fontSize(7).fillColor('#1e293b');
              doc.text(fact.valueLines.join('\n'), x, rowTop + fact.labelLines.length * 7 + 2, { width: factCellWidth - 8, lineGap: 0 });
            });
            rowTop += rowHeights[index / factsPerRow];
          }
          y += panelHeight + 8;
        };
        const deferCategoryPanel = (model.category === 'quotes' && ['commercial', 'compact'].includes(model.templateId))
          || (model.category === 'invoices' && model.templateId === 'ledger-invoice');
        if (categoryPanel && !deferCategoryPanel) drawCategoryPanel();

        if (model.expenseBilling) {
          const billing = model.expenseBilling;
          const pendingInvoiceStatus: Record<string, string> = {
            DRAFT: 'Invoice draft (not posted)',
            SUBMITTED: 'Invoice submitted (not posted)',
            APPROVED: 'Invoice approved (not posted)',
            UNAVAILABLE: 'Invoice link unavailable',
          };
          const billingStatus = !billing.isBillable
            ? 'Not billable'
            : billing.isBilled
              ? 'Invoiced'
              : billing.invoiceLinked
                ? (pendingInvoiceStatus[billing.invoiceStatus] || `Invoice ${billing.invoiceStatus.toLowerCase()} (not posted)`)
                : 'Not yet invoiced';
          const invoiceReference = billing.invoiceNumber || (billing.invoiceLinked ? 'Invoice reference unavailable' : 'Not invoiced');
          const formattedBillableMarkup = billing.isBillable
            ? Number(billing.markupPercentage.toFixed(2)).toString() + '%'
            : 'N/A';
          const secondColumnX = 40 + pageWidth / 2;
          const cellWidth = pageWidth / 3;
          const columnWidth = pageWidth / 2 - 12;
          doc.font(boldFont).fontSize(7).fillColor('#64748b');
          const projectLines = wrapToWidth('Project: ' + (billing.projectName || 'Not linked'), columnWidth);
          const clientLines = wrapToWidth('Client: ' + (billing.clientName || 'Not assigned'), columnWidth);
          doc.font(fontChoice).fontSize(7).fillColor('#475569');
          const statusLines = wrapToWidth('Billing status: ' + billingStatus, columnWidth);
          const invoiceReferenceLines = wrapToWidth('Invoice reference: ' + invoiceReference, columnWidth);
          const projectRows = Math.max(projectLines.length, clientLines.length);
          const billingRows = Math.max(statusLines.length, invoiceReferenceLines.length);
          const billingPanelHeight = Math.max(52, 24 + projectRows * 8 + 3 + billingRows * 8 + 4);
          ensure(billingPanelHeight + 48);
          doc.roundedRect(40, y, pageWidth, billingPanelHeight, 3).fillAndStroke('#f8fafc', '#cbd5e1');
          doc.font(boldFont).fontSize(8).fillColor(accentInk);
          text('PROJECT BILLABLE EXPENSE', 48, y + 7, pageWidth - 16);
          doc.font(boldFont).fontSize(7).fillColor('#64748b');
          const drawRecoveryLines = (lines: string[], x: number, top: number, width: number) => {
            lines.forEach((line, index) => doc.text(line, x, top + index * 8, { width, lineBreak: false }));
          };
          drawRecoveryLines(projectLines, 48, y + 24, columnWidth);
          drawRecoveryLines(clientLines, secondColumnX, y + 24, columnWidth);
          doc.font(fontChoice).fontSize(7).fillColor('#475569');
          const billingDetailsY = y + 24 + projectRows * 8 + 3;
          drawRecoveryLines(statusLines, 48, billingDetailsY, columnWidth);
          drawRecoveryLines(invoiceReferenceLines, secondColumnX, billingDetailsY, columnWidth);
          y += billingPanelHeight + 6;
          doc.roundedRect(40, y, pageWidth, 34, 3).fill(primary);
          const financialFacts: Array<[string, string]> = [
            ['EXPENSE TOTAL', amount(model.total)],
            ['STORED CLIENT CHARGE', billing.isBillable ? amount(billing.clientCharge) : 'Not billable'],
            ['STORED MARKUP', formattedBillableMarkup],
          ];
          financialFacts.forEach(([label, value], index) => {
            const x = 44 + cellWidth * index;
            doc.font(boldFont).fontSize(6.5).fillColor(primaryText);
            text(label, x, y + 5, cellWidth - 10);
            doc.font(boldFont).fontSize(8.5).fillColor(primaryText);
            drawFittedText(value, x, y + 17, cellWidth - 10, 8.5, 5.5);
          });
          y += 42;
        }
        // --- 5. CATEGORY-SPECIFIC LINE ITEMS TABLE ---
        const isStatement = model.category === 'customer-statements' || model.category === 'vendor-statements';
        const isStatementActivity = (model.category === 'customer-statements' && model.templateId === 'aging-statement') || (model.category === 'vendor-statements' && model.templateId === 'payables-aging');
        const isStatementOverview = (model.category === 'customer-statements' && model.templateId === 'open-summary') || (model.category === 'vendor-statements' && model.templateId === 'reconciliation');
        const isGoodsReturn = model.category === 'credit-notes' && model.templateId === 'goods-return';
        const displayLines = model.category === 'credit-notes' || isGoodsReturn ? [] : isStatement && (isStatementActivity || isStatementOverview)
          ? []
          : model.category === 'journals' || (model.lines.length === 0 && model.journalLines.length && !['payment-receipts', 'vendor-payments'].includes(model.category)) ? model.journalLines : model.lines;
        const showHsnSac = model.templateConfig.showHsnSac !== false;
        const showRunningBalance = model.templateConfig.showRunningBalance !== false;

        if (displayLines.length) {
          const isStatement = model.category.includes('statement');
          const isJournal = model.category === 'journals' || displayLines === model.journalLines;
          const isReceipt = model.category === 'payment-receipts';
          const isChallan = model.category === 'delivery-challans';
          const isInvoicePos = model.category === 'invoices' && model.templateId === 'pos';
          const isCompactQuote = model.category === 'quotes' && model.templateId === 'compact';
          const isCommercialQuote = model.category === 'quotes' && model.templateId === 'commercial';
          const isJobworkChallan = isChallan && model.templateId === 'jobwork';
          const isLedgerInvoice = model.category === 'invoices' && model.templateId === 'ledger-invoice';
          const tableHeading = isCompactQuote ? 'QUICK QUOTE ITEMS'
            : isCommercialQuote ? 'COMMERCIAL QUOTE LINES'
              : isJobworkChallan ? 'CHALLAN MATERIAL LINES'
                : isChallan ? 'DELIVERY ITEMS'
                  : isLedgerInvoice ? 'INVOICE LEDGER ENTRIES'
                    : model.category === 'invoices' && model.templateId === 'tax-invoice' ? 'TAX INVOICE ITEMS'
                      : model.category === 'quotes' && model.templateId === 'proposal' ? 'PROPOSED ITEMS & SERVICES'
                        : '';
          const hideRates = Boolean(isChallan && model.templateConfig.hideRatesInChallan);
          const showHsnSacColumn = showHsnSac && !isChallan && displayLines.some((line) => Boolean(line.hsnSac));

          let columns: string[];
          let widths: number[];

          if (isStatement) {
            columns = ['Date', 'Transaction / Reference', 'Debit', 'Credit', ...(showRunningBalance ? ['Running Balance'] : [])];
            const rem = pageWidth - (65 + 65 + 65 + (showRunningBalance ? 75 : 0));
            widths = [65, Math.max(rem, 150), 65, 65, ...(showRunningBalance ? [75] : [])];
          } else if (isJournal) {
            columns = ['Account Code & Name', 'Line Narration', 'Debit', 'Credit'];
            const rem = pageWidth - (85 + 85);
            widths = [Math.floor(rem * 0.45), Math.floor(rem * 0.55), 85, 85];
          } else if (isReceipt) {
            columns = ['Settled Document / Reference', 'Allocation Details', 'Amount Settled'];
            const rem = pageWidth - 100;
            widths = [Math.floor(rem * 0.45), Math.floor(rem * 0.55), 100];
          } else if (isInvoicePos) {
            columns = ['Item', 'Qty', 'Amount'];
            widths = [pageWidth - 150, 55, 95];
          } else if (isCompactQuote) {
            columns = ['Item / Scope', 'Qty × Rate', 'Line Total'];
            widths = [Math.floor(pageWidth * 0.57), Math.floor(pageWidth * 0.21), Math.ceil(pageWidth * 0.22)];
          } else if (isCommercialQuote) {
            columns = [...(showHsnSacColumn ? ['HSN/SAC'] : []), 'Commercial Description', 'Quantity', 'Unit Price', 'Line Value'];
            widths = showHsnSacColumn
              ? [Math.floor(pageWidth * 0.17), Math.floor(pageWidth * 0.38), Math.floor(pageWidth * 0.13), Math.floor(pageWidth * 0.16), 0]
              : [Math.floor(pageWidth * 0.45), Math.floor(pageWidth * 0.16), Math.floor(pageWidth * 0.19), 0];
            widths[widths.length - 1] = pageWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
          } else if (isChallan && isJobworkChallan) {
            const showPackages = model.templateConfig.showPackageDetails !== false;
            columns = ['Item Description', 'Quantity', ...(showHsnSac ? ['HSN/SAC'] : []), ...(showPackages ? ['Packages'] : []), ...(hideRates ? [] : ['Rate', 'Amount'])];
            const weights = hideRates
              ? [0.52, 0.18, ...(showHsnSac ? [0.13] : []), ...(showPackages ? [0.17] : [])]
              : [0.38, 0.14, ...(showHsnSac ? [0.14] : []), ...(showPackages ? [0.14] : []), 0.10, 0.10];
            widths = weights.map((weight) => Math.floor(pageWidth * weight));
            widths[widths.length - 1] = pageWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
          } else if (model.category === 'invoices' && model.templateId === 'tax-invoice') {
            columns = ['Description', ...(showHsnSacColumn ? ['HSN/SAC'] : []), 'Qty', 'Rate', 'Amount'];
            const weights = showHsnSacColumn ? [0.40, 0.15, 0.12, 0.16, 0.17] : [0.55, 0.12, 0.16, 0.17];
            widths = weights.map((weight) => Math.floor(pageWidth * weight));
            widths[widths.length - 1] = pageWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
          } else if (isLedgerInvoice) {
            columns = ['Ledger Entry', 'Qty', 'Amount', ...(showHsnSacColumn ? ['HSN/SAC'] : []), 'Unit Rate'];
            const weights = showHsnSacColumn ? [0.39, 0.12, 0.21, 0.12, 0.16] : [0.51, 0.13, 0.21, 0.15];
            widths = weights.map((weight) => Math.floor(pageWidth * weight));
            widths[widths.length - 1] = pageWidth - widths.slice(0, -1).reduce((sum, width) => sum + width, 0);
          } else if (isChallan && hideRates) {
            const showPackages = model.templateConfig.showPackageDetails !== false;
            columns = ['Item Description', ...(showHsnSac ? ['HSN/SAC'] : []), ...(showPackages ? ['Packages'] : []), 'Quantity'];
            const fixedWidth = (showHsnSac ? 80 : 0) + (showPackages ? 90 : 0) + 70;
            widths = [Math.max(pageWidth - fixedWidth, 150), ...(showHsnSac ? [80] : []), ...(showPackages ? [90] : []), 70];
          } else {
            const packageWidth = isChallan && model.templateConfig.showPackageDetails !== false ? 75 : 0;
            columns = ['Description', ...(showHsnSacColumn ? ['HSN/SAC'] : []), ...(packageWidth ? ['Packages'] : []), 'Qty', 'Rate', 'Amount'];
            const rem = pageWidth - (showHsnSacColumn ? 300 : 230) - packageWidth;
            widths = [Math.max(rem, 150), ...(showHsnSacColumn ? [70] : []), ...(packageWidth ? [packageWidth] : []), 55, 80, 95];
          }

          if (tableHeading) {
            ensure(24);
            doc.font(boldFont).fontSize(8).fillColor(accentInk);
            text(tableHeading, 40, y, pageWidth);
            y += 13;
          }

          const drawTableHeader = () => {
            ensure(24);
            doc.rect(40, y, pageWidth, 20).fill(layout === 'compact' ? accent : '#e2e8f0');
            doc.font(boldFont).fontSize(7.5).fillColor(layout === 'compact' ? accentText : '#334155');
            let curX = 46;
            columns.forEach((col, i) => {
              text(col, curX, y + 5, widths[i] - 10, { align: i === 0 || (isStatement && i === 1) || (isJournal && i < 2) ? 'left' : 'right' });
              curX += widths[i];
            });
            y += 20;
          };

          drawTableHeader();

          displayLines.forEach((line) => {
            doc.font(fontChoice).fontSize(7.5).fillColor('#1e293b');
            let curX = 46;

            let rowValues: string[];
            if (isStatement) {
              rowValues = [line.date || '-', line.description, amount(number(line.debit)), amount(number(line.credit)), ...(showRunningBalance ? [amount(number(line.balance))] : [])];
            } else if (isJournal) {
              rowValues = [line.description, line.reference || '-', amount(number(line.debit)), amount(number(line.credit))];
            } else if (isReceipt) {
              rowValues = [line.description, line.reference || 'Invoice Allocation', amount(number(line.amount))];
            } else if (isInvoicePos) {
              rowValues = [line.description, line.quantity ? String(line.quantity) : '-', amount(number(line.amount))];
            } else if (isCompactQuote) {
              const description = showHsnSacColumn && line.hsnSac ? `${line.description} (HSN/SAC ${line.hsnSac})` : line.description;
              rowValues = [description, `${line.quantity ?? '-'} × ${line.rate === undefined ? '-' : amount(number(line.rate))}`, amount(number(line.amount))];
            } else if (isCommercialQuote) {
              rowValues = [...(showHsnSacColumn ? [line.hsnSac || '-'] : []), line.description, line.quantity ? String(line.quantity) : '-', line.rate ? amount(number(line.rate)) : '-', amount(number(line.amount))];
            } else if (isChallan && isJobworkChallan) {
              rowValues = [line.description, line.quantity ? String(line.quantity) : '-', ...(showHsnSac ? [line.hsnSac || '-'] : []), ...(model.templateConfig.showPackageDetails !== false ? [line.packages || '-'] : []), ...(hideRates ? [] : [line.rate ? amount(number(line.rate)) : '-', amount(number(line.amount))])];
            } else if (model.category === 'invoices' && model.templateId === 'tax-invoice') {
              rowValues = [line.description, ...(showHsnSacColumn ? [line.hsnSac || '-'] : []), line.quantity ? String(line.quantity) : '-', line.rate ? amount(number(line.rate)) : '-', amount(number(line.amount))];
            } else if (isLedgerInvoice) {
              rowValues = [line.description, line.quantity ? String(line.quantity) : '-', amount(number(line.amount)), ...(showHsnSacColumn ? [line.hsnSac || '-'] : []), line.rate ? amount(number(line.rate)) : '-'];
            } else if (isChallan && hideRates) {
              rowValues = [line.description, ...(showHsnSac ? [line.hsnSac || '-'] : []), ...(model.templateConfig.showPackageDetails !== false ? [line.packages || '-'] : []), line.quantity ? String(line.quantity) : '-'];
            } else {
              rowValues = [line.description, ...(showHsnSacColumn ? [line.hsnSac || '-'] : []), ...(isChallan && model.templateConfig.showPackageDetails !== false ? [line.packages || '-'] : []), line.quantity ? String(line.quantity) : '-', line.rate ? amount(number(line.rate)) : '-', amount(number(line.amount))];
            }

            const wrappedValues = rowValues.map((value, index) => wrapToWidth(value, widths[index] - 10));
            const visualLineCount = Math.max(...wrappedValues.map((lines) => lines.length));
            const linesPerPage = Math.max(1, Math.floor((maxContentY - 60 - 20) / 12));
            for (let offset = 0; offset < visualLineCount; offset += linesPerPage) {
              const chunkValues = wrappedValues.map((lines) => lines.slice(offset, offset + linesPerPage).join('\n'));
              const contentHeight = Math.max(...chunkValues.map((value, index) =>
                value ? doc.heightOfString(value, { width: widths[index] - 10 }) : 0
              ));
              const rowHeight = Math.max(22, Math.ceil(contentHeight) + 10);
              if (y + rowHeight + 2 > maxContentY) {
                doc.addPage();
                y = 40;
                drawTableHeader();
              }
              doc.font(fontChoice).fontSize(7.5).fillColor('#1e293b');
              let curX = 46;
              chunkValues.forEach((value, index) => {
                if (value) text(value, curX, y + 5, widths[index] - 10, { align: index === 0 || (isStatement && index === 1) || (isJournal && index < 2) ? 'left' : 'right' });
                curX += widths[index];
              });
              doc.moveTo(40, y + rowHeight - 1).lineTo(40 + pageWidth, y + rowHeight - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
              y += rowHeight;
            }
          });
          y += 8;
        }

        if (categoryPanel && deferCategoryPanel) drawCategoryPanel();

        // --- 6. TOTALS & FINANCIAL SUMMARY ---
        ensure(110);
        const totalsBlockWidth = 230;
        const totalX = 40 + pageWidth - totalsBlockWidth;

        const isCashReceipt = model.category === 'payment-receipts' && model.templateId === 'cash-receipt';
        if (isCashReceipt) {
          ensure(66);
          doc.roundedRect(totalX - 10, y, totalsBlockWidth + 10, 44, 3).fill(primary);
          doc.font(boldFont).fontSize(8).fillColor(primaryText);
          text('AMOUNT RECEIVED', totalX, y + 7, totalsBlockWidth - 16);
          doc.font(boldFont).fontSize(15).fillColor(primaryText);
          text(amount(model.total), totalX, y + 20, totalsBlockWidth - 16);
          y += 50;
          if (model.templateConfig.showAmountInWords !== false) {
            doc.font(italicFont).fontSize(7.5).fillColor('#475569');
            text(`Amount in words: ${amountToWords(model.total, sanitize(model.organization.base_currency || 'INR'))}`, 40, y, pageWidth);
            y += 15;
          }
        } else if (isGoodsReturn && model.returnCredit) {
          ensureReturnContent(82);
          doc.font(boldFont).fontSize(8.5).fillColor(accentInk);
          text('SALES RETURN CREDIT SUMMARY', 40, y, pageWidth);
          y += 16;
          const reasonWidth = pageWidth - 12;
          const reasonLines = model.templateConfig.showReturnReason === false
            ? []
            : (doc.font(fontChoice).fontSize(7), wrapToWidth(model.returnCredit.reason || '-', reasonWidth));
          let reasonLine = 0;
          while (reasonLine < reasonLines.length) {
            ensureReturnContent(30);
            const available = returnContentMaxY - y - 16;
            let count = 0;
            while (reasonLine + count < reasonLines.length && doc.heightOfString(reasonLines.slice(reasonLine, reasonLine + count + 1).join('\n'), { width: reasonWidth }) <= available) count += 1;
            if (!count) {
              doc.addPage();
              y = 40;
              continue;
            }
            const chunk = reasonLines.slice(reasonLine, reasonLine + count).join('\n');
            const chunkHeight = Math.max(10, doc.heightOfString(chunk, { width: reasonWidth }));
            doc.rect(40, y, pageWidth, chunkHeight + 16).fill('#f1f5f9');
            doc.font(fontChoice).fontSize(7).fillColor('#64748b');
            text(reasonLine === 0 ? 'Return reason' : 'Return reason (continued)', 46, y + 4, reasonWidth);
            doc.font(fontChoice).fontSize(7).fillColor('#1e293b');
            doc.text(chunk, 46, y + 13, { width: reasonWidth });
            y += chunkHeight + 20;
            reasonLine += count;
            if (reasonLine < reasonLines.length) {
              doc.addPage();
              y = 40;
            }
          }
          ensureReturnContent(34);
          const summaryHeight = 30;
          doc.rect(40, y, pageWidth, summaryHeight).fill('#f1f5f9');
          const factY = y + 3;
          const cellWidth = pageWidth / 2;
          doc.font(fontChoice).fontSize(7).fillColor('#64748b');
          text('Credit note total', 46, factY, cellWidth - 10);
          text('Remaining credit', 46 + cellWidth, factY, cellWidth - 10);
          doc.font(boldFont).fontSize(8).fillColor('#1e293b');
          text(amount(model.returnCredit.total), 46, factY + 12, cellWidth - 10);
          text(model.returnCredit.reversed ? amount(0) : amount(model.returnCredit.remaining), 46 + cellWidth, factY + 12, cellWidth - 10);
          y += summaryHeight + 8;
          ensureReturnContent(28);
          doc.font(boldFont).fontSize(8.5).fillColor(accentInk);
          text('APPLIED TO INVOICES', 40, y, pageWidth);
          y += 15;
          const applications = model.returnCredit.reversed ? [] : model.returnCredit.applications;
          if (!applications.length) {
            doc.font(fontChoice).fontSize(7.5).fillColor('#475569');
            text('No invoice applications', 46, y + 3, pageWidth - 12);
            y += 20;
          } else {
            const dateWidth = Math.min(90, pageWidth * 0.28);
            const amountWidth = Math.min(110, pageWidth * 0.32);
            const invoiceWidth = pageWidth - dateWidth - amountWidth;
            const headerHeight = 18;
            const drawApplicationHeader = () => {
              doc.rect(40, y, pageWidth, headerHeight).fill('#e2e8f0');
              doc.font(boldFont).fontSize(7.5).fillColor('#334155');
              text('Date', 46, y + 5, dateWidth - 8);
              text('Invoice', 40 + dateWidth, y + 5, invoiceWidth - 8);
              text('Applied', 40 + dateWidth + invoiceWidth, y + 5, amountWidth - 8, { align: 'right' });
              y += headerHeight;
            };
            ensureReturnContent(headerHeight + 14);
            drawApplicationHeader();
            for (const application of applications) {
              doc.font(fontChoice).fontSize(7.5);
              const invoiceText = application.invoiceNumber || '-';
              const invoiceHeight = Math.max(10, doc.heightOfString(invoiceText, { width: invoiceWidth - 8 }));
              const rowHeight = Math.max(22, invoiceHeight + 8);
              if (y + rowHeight > returnContentMaxY) {
                doc.addPage();
                y = 40;
                drawApplicationHeader();
              }
              doc.font(fontChoice).fontSize(7.5).fillColor('#1e293b');
              text(application.date, 46, y + 4, dateWidth - 8);
              doc.text(invoiceText, 40 + dateWidth, y + 4, { width: invoiceWidth - 8 });
              text(amount(application.amount), 40 + dateWidth + invoiceWidth, y + 4, amountWidth - 8, { align: 'right' });
              doc.moveTo(40, y + rowHeight - 1).lineTo(40 + pageWidth, y + rowHeight - 1).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
              y += rowHeight;
            }
          }
          y += 8;
        } else if (model.category === 'credit-notes') {
          const reason = model.isSamplePreview ? model.returnCredit?.reason : model.source.reason;
          const total = model.returnCredit?.total ?? model.total;
          const reasonText = model.templateConfig.showReturnReason !== false && reason ? sanitize(reason) : '';
          const isAdjustment = model.templateId === 'adjustment';
          const adjustmentValueWidth = Math.min(pageWidth * 0.58, Math.max(pageWidth * 0.36, 140));
          const reasonWidth = isAdjustment ? pageWidth - adjustmentValueWidth - 20 : pageWidth - 40;
          doc.font(fontChoice).fontSize(8);
          const reasonLines = reasonText ? wrapToWidth(reasonText, reasonWidth) : [];

          if (!isAdjustment) {
            doc.font(boldFont).fontSize(8.5).fillColor(accentInk);
            text('CREDIT NOTE DETAILS', 40, y, pageWidth);
            y += 18;
            let reasonLine = 0;
            while (reasonLine < reasonLines.length) {
              const remainingLines = reasonLines.length - reasonLine;
              const maxLines = Math.floor((maxContentY - y - 75) / 10);
              if (maxLines < 1) {
                doc.addPage();
                y = 40;
                continue;
              }
              const chunkLines = Math.min(remainingLines, maxLines);
              const chunk = reasonLines.slice(reasonLine, reasonLine + chunkLines).join('\n');
              const panelHeight = 25 + chunkLines * 10;
              if (y + panelHeight + (reasonLine + chunkLines === reasonLines.length ? 50 : 8) > maxContentY) {
                doc.addPage();
                y = 40;
                continue;
              }
              doc.rect(40, y, pageWidth, panelHeight).fill('#f8fafc');
              doc.rect(40, y, 3, panelHeight).fill(accent);
              doc.font(boldFont).fontSize(6.5).fillColor('#64748b');
              text(reasonLine === 0 ? 'CREDIT REASON' : 'CREDIT REASON (CONTINUED)', 50, y + 5, pageWidth - 20);
              doc.font(fontChoice).fontSize(8).fillColor('#1e293b');
              doc.text(chunk, 50, y + 15, { width: pageWidth - 20, lineGap: 1 });
              y += panelHeight + 7;
              reasonLine += chunkLines;
              if (reasonLine < reasonLines.length) {
                doc.addPage();
                y = 40;
              }
            }
            ensure(50);
            const valueHeight = 43;
            doc.rect(40, y, pageWidth, valueHeight).fill('#fff1f2');
            doc.font(boldFont).fontSize(7).fillColor('#9f1239');
            text('CREDIT NOTE VALUE', 50, y + 8, pageWidth - 20);
            doc.font(boldFont).fontSize(15).fillColor('#881337');
            text(amount(total), 50, y + 20, pageWidth - 20);
            y += valueHeight + 8;
          } else {
            doc.font(boldFont).fontSize(8.5).fillColor(accentInk);
            text('CREDIT ADJUSTMENT SLIP', 40, y, pageWidth);
            y += 18;
            if (y + 58 > maxContentY) {
              doc.addPage();
              y = 40;
            }
            const valueWidth = adjustmentValueWidth;
            const reasonLinesPerFirstPanel = reasonLines.length
              ? Math.max(1, Math.floor((maxContentY - y - 70) / 10))
              : 0;
            const firstReasonLines = reasonLines.slice(0, reasonLinesPerFirstPanel);
            const firstReasonText = firstReasonLines.join('\n');
            const summaryHeight = Math.max(58, 30 + firstReasonLines.length * 10);
            doc.rect(40, y, pageWidth, summaryHeight).fillAndStroke('#f8fafc', '#cbd5e1');
            doc.rect(40 + pageWidth - valueWidth, y, valueWidth, summaryHeight).fill(primary);
            if (firstReasonText) {
              doc.font(boldFont).fontSize(6.5).fillColor('#64748b');
              text('ADJUSTMENT REASON', 50, y + 8, pageWidth - valueWidth - 20);
              doc.font(fontChoice).fontSize(8).fillColor('#1e293b');
              doc.text(firstReasonText, 50, y + 19, { width: pageWidth - valueWidth - 20, lineGap: 1 });
            }
            doc.font(boldFont).fontSize(6.5).fillColor(primaryText);
            text('ADJUSTMENT VALUE', 40 + pageWidth - valueWidth + 8, y + 11, valueWidth - 16);
            doc.font(boldFont).fontSize(10).fillColor(primaryText);
            drawFittedText(amount(total), 40 + pageWidth - valueWidth + 8, y + 27, valueWidth - 16, 10, 4.5);
            y += summaryHeight + 8;
            let reasonLine = firstReasonLines.length;
            while (reasonLine < reasonLines.length) {
              doc.addPage();
              y = 40;
              const maxLines = Math.max(1, Math.floor((maxContentY - y - 70) / 10));
              const chunkLines = Math.min(reasonLines.length - reasonLine, maxLines);
              const chunk = reasonLines.slice(reasonLine, reasonLine + chunkLines).join('\n');
              const panelHeight = 25 + chunkLines * 10;
              doc.rect(40, y, pageWidth, panelHeight).fill('#f8fafc');
              doc.rect(40, y, 3, panelHeight).fill(primary);
              doc.font(boldFont).fontSize(6.5).fillColor('#64748b');
              text('ADJUSTMENT REASON (CONTINUED)', 50, y + 5, pageWidth - 20);
              doc.font(fontChoice).fontSize(8).fillColor('#1e293b');
              doc.text(chunk, 50, y + 15, { width: pageWidth - 20, lineGap: 1 });
              y += panelHeight + 7;
              reasonLine += chunkLines;
            }
            if (model.returnCredit) {
              ensure(20);
              doc.font(boldFont).fontSize(7).fillColor('#475569');
              text('AVAILABLE CREDIT', 40, y, pageWidth - 120);
              doc.font(boldFont).fontSize(8).fillColor('#1e293b');
              text(model.returnCredit.reversed ? amount(0) : amount(model.returnCredit.remaining), pageWidth - 115, y, 105, { align: 'right' });
              y += 18;
            }
          }
        } else if (!model.category.includes('statement') && model.category !== 'journals'
          && !((model.category === 'quotes' && ['commercial', 'compact'].includes(model.templateId))
            || (model.category === 'invoices' && model.templateId === 'ledger-invoice'))) {
          const showBalanceDue = Boolean(model.balance) && !(model.category === 'vendor-credits' && model.templateConfig.showPayablesLedger === false);
          const rows: Array<[string, number]> = [
            ...((model.category !== 'bills' || number(model.source.subtotal) > 0 || number(model.source.amount) > 0) ? [[model.source.quotation_revision && model.source.is_gst_inclusive ? 'Subtotal (tax inclusive)' : 'Subtotal', model.subtotal] as [string, number]] : []),
            ...(model.tax && model.templateConfig.showTaxBreakdown !== false ? [[model.source.quotation_revision && model.source.is_gst_inclusive ? 'Tax included' : model.category === 'expenses' && model.source.is_rcm ? 'RCM tax (not paid to vendor)' : 'Tax', model.tax] as [string, number]] : []),
            ...(model.discount && model.templateConfig.showDiscount !== false ? [['Discount', -model.discount] as [string, number]] : []),
            ...(model.source.quotation_revision && number(model.source.round_off_amount) ? [['Round-off', number(model.source.round_off_amount)] as [string, number]] : []),
            [model.category === 'invoices' ? 'Total Amount:' : 'Total', model.total],
            ...(model.category === 'expenses' && number(model.source.tds_amount) > 0 && model.templateConfig.showTdsDeduction !== false ? [[model.source.tds_section ? `TDS Withheld (${sanitize(model.source.tds_section)})` : 'TDS Withheld', -number(model.source.tds_amount)] as [string, number]] : []),
            ...(model.category === 'expenses' && number(model.source.tds_amount) > 0 && model.templateConfig.showTdsDeduction !== false ? [['Net Paid', model.netPaid ?? model.total - number(model.source.tds_amount)] as [string, number]] : []),
            ...(showBalanceDue ? [['Balance Due', model.balance!] as [string, number]] : []),
          ];

          rows.forEach(([label, val], idx) => {
            const isTotalRow = label === (model.category === 'invoices' ? 'Total Amount:' : 'Total');
            if (isTotalRow) {
              doc.rect(totalX - 10, y - 2, totalsBlockWidth + 10, 20).fill(primary);
              doc.fillColor(primaryText).font(boldFont).fontSize(9);
            } else {
              doc.fillColor(label === 'Balance Due' ? '#dc2626' : label === 'Net Paid' ? '#15803d' : '#475569').font(label === 'Net Paid' ? boldFont : fontChoice).fontSize(8);
            }
            text(label, totalX, y + 3, 135);
            text(amount(number(val)), totalX + 135, y + 3, totalsBlockWidth - 135, { align: 'right' });
            y += 20;
          });

          y += 6;
          if (model.category === 'invoices' && model.templateConfig.showPaidStamp !== false && model.status === 'PAID' && model.balance !== undefined && model.balance !== null && number(model.balance) <= 0) {
            ensure(36);
            doc.save();
            doc.rotate(-8, { origin: [totalX + 90, y + 15] });
            doc.roundedRect(totalX + 20, y + 2, 150, 28, 4).lineWidth(2).strokeColor('#16a34a').stroke();
            doc.font(boldFont).fontSize(15).fillColor('#15803d');
            text('PAID IN FULL', totalX + 20, y + 8, 150, { align: 'center' });
            doc.restore();
            y += 36;
          }
          doc.font(italicFont).fontSize(7.5).fillColor('#64748b');
          if (model.templateConfig.showAmountInWords !== false) {
            const words = `Amount in words: ${amountToWords(model.total, sanitize(model.organization.base_currency || 'INR'))}`;
            const wordsHeight = doc.heightOfString(words, { width: pageWidth * 0.6 });
            ensure(wordsHeight + 10);
            text(words, 40, y, pageWidth * 0.6);
            y += wordsHeight + 10;
          }
        } else if (model.category.includes('statement')) {
          if (!isStatementOverview) {
            doc.rect(totalX - 10, y, totalsBlockWidth + 10, 28).fill(primary);
            doc.fillColor(primaryText).font(boldFont).fontSize(8.5);
            text('CLOSING BALANCE', totalX, y + 8, 100);
            text(amount(model.total), totalX + 100, y + 8, totalsBlockWidth - 100, { align: 'right' });
            y += 36;
          }


        } else if (model.category === 'journals' && model.templateConfig.showDebitCreditTotals !== false) {
          // Journals
          const debits = model.journalLines.reduce((sum, line) => sum + number(line.debit), 0);
          const credits = model.journalLines.reduce((sum, line) => sum + number(line.credit), 0);
          doc.rect(totalX - 10, y, totalsBlockWidth + 10, 30).fill(primary);
          doc.fillColor(primaryText).font(boldFont).fontSize(8);
          text(`TOTAL DEBITS ${amount(debits)}`, totalX, y + 6, totalsBlockWidth, { align: 'right' });
          text(`TOTAL CREDITS ${amount(credits)}`, totalX, y + 17, totalsBlockWidth, { align: 'right' });
          y += 38;
        }

        if (isStatementActivity && model.statementActivityRows) {
          ensure(42 + model.statementActivityRows.length * 18);
          const isVendorStatement = model.category === 'vendor-statements';
          doc.font(boldFont).fontSize(8.5).fillColor(accentInk);
          text(isVendorStatement ? 'Payables Activity Summary' : 'Receivables Activity Summary', 40, y, pageWidth);
          y += 15;
          doc.rect(40, y, pageWidth, 18).fill('#e2e8f0');
          doc.font(boldFont).fontSize(7.5).fillColor('#334155');
          text('Activity', 46, y + 5, pageWidth * 0.56);
          text('Side', 40 + pageWidth * 0.58, y + 5, pageWidth * 0.16);
          text('Amount', 40 + pageWidth * 0.74, y + 5, pageWidth * 0.24, { align: 'right' });
          y += 18;
          for (const row of model.statementActivityRows) {
            doc.font(fontChoice).fontSize(7.5).fillColor('#1e293b');
            text(row.label, 46, y + 4, pageWidth * 0.56);
            text(row.side, 40 + pageWidth * 0.58, y + 4, pageWidth * 0.16);
            text(amount(row.amount), 40 + pageWidth * 0.74, y + 4, pageWidth * 0.24, { align: 'right' });
            doc.moveTo(40, y + 17).lineTo(40 + pageWidth, y + 17).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            y += 18;
          }
          y += 8;
        } else if (isStatementOverview && model.statementOverview) {
          ensure(54);
          const overview = model.statementOverview;
          const showOpeningBalance = model.templateConfig.showOpeningBalance !== false;
          const labels = [...(showOpeningBalance ? ['Opening Balance'] : []), 'Transactions', 'Closing Balance'];
          const values = [...(showOpeningBalance ? [amount(overview.openingBalance)] : []), String(overview.transactionCount), amount(overview.closingBalance)];
          const cellWidth = pageWidth / labels.length;
          labels.forEach((label, index) => {
            const x = 40 + cellWidth * index;
            doc.rect(x, y, cellWidth - 6, 42).fill(index === labels.length - 1 ? primary : '#f1f5f9');
            doc.font(boldFont).fontSize(7).fillColor(index === labels.length - 1 ? primaryText : '#64748b');
            text(label, x + 7, y + 6, cellWidth - 20);
            doc.font(boldFont).fontSize(9).fillColor(index === labels.length - 1 ? primaryText : accentInk);
            text(values[index], x + 7, y + 21, cellWidth - 20);
          });
          y += 50;
        }
        if (model.category === 'bills' && model.templateConfig.showAccountAllocation !== false && model.journalLines.length) {
          ensure(38 + model.journalLines.length * 16);
          doc.font(boldFont).fontSize(8.5).fillColor(accentInk);
          text('Posted General Ledger Allocation', 40, y, pageWidth);
          y += 14;
          const debitX = 40 + pageWidth * 0.70;
          const creditX = 40 + pageWidth * 0.84;
          doc.rect(40, y, pageWidth, 18).fill('#e2e8f0');
          doc.font(boldFont).fontSize(7.5).fillColor('#334155');
          text('Account', 46, y + 5, pageWidth * 0.62);
          text('Debit', debitX, y + 5, pageWidth * 0.12, { align: 'right' });
          text('Credit', creditX, y + 5, pageWidth * 0.14, { align: 'right' });
          y += 18;
          for (const line of model.journalLines) {
            ensure(18);
            doc.font(fontChoice).fontSize(7.5).fillColor('#1e293b');
            text(line.description, 46, y + 4, pageWidth * 0.62);
            text(amount(number(line.debit)), debitX, y + 4, pageWidth * 0.12, { align: 'right' });
            text(amount(number(line.credit)), creditX, y + 4, pageWidth * 0.14, { align: 'right' });
            doc.moveTo(40, y + 17).lineTo(40 + pageWidth, y + 17).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            y += 18;
          }
          y += 8;
        }

        // --- 7. NOTES & TERMS ---
        if (model.source.quotation_revision && model.templateConfig.showTaxBreakdown !== false) {
          const breakdown = model.source.gst_breakdown;
          const taxFacts: Array<[string, number]> = [
            ['Taxable amount', number(model.source.taxable_amount)],
            ...(breakdown ? (breakdown.isInterState
              ? [['IGST', number(breakdown.igstTotal)] as [string, number]]
              : [['CGST', number(breakdown.cgstTotal)], ['SGST', number(breakdown.sgstTotal)]] as Array<[string, number]>) : []),
          ];
          ensure(22 + taxFacts.length * 16);
          doc.font(boldFont).fontSize(8).fillColor(accentInk);
          text(model.source.is_gst_inclusive ? 'GST BREAKDOWN - INCLUDED IN PRICE' : 'GST BREAKDOWN', 40, y, pageWidth);
          y += 18;
          for (const [label, value] of taxFacts) {
            doc.font(fontChoice).fontSize(8).fillColor('#475569');
            text(`${label}: ${amount(value)}`, 40, y, pageWidth);
            y += 16;
          }
          y += 8;
        }
        const notesAreHiddenDebitReason = model.category === 'vendor-credits'
          && model.templateConfig.showDebitReason === false
          && !model.source.notes
          && model.notes === sanitize(model.source.reason);
        if (model.notes && model.templateConfig.showNarration !== false && !notesAreHiddenDebitReason) {
          const notesHeading = ['quotes', 'sales-orders', 'purchase-orders'].includes(model.category) ? 'Scope of Work & Terms' : 'Notes & Terms';
          ensure(24);
          doc.font(boldFont).fontSize(7.5).fillColor(accentInk);
          text(notesHeading, 40, y, 220);
          y += 12;

          doc.font(fontChoice).fontSize(7).fillColor('#475569');
          const noteLines = wrapToWidth(model.notes, pageWidth);
          let noteLine = 0;
          while (noteLine < noteLines.length) {
            if (maxContentY - y < 10) {
              doc.addPage();
              y = 40;
            }
            const availableHeight = maxContentY - y;
            let lineCount = 0;
            while (noteLine + lineCount < noteLines.length) {
              const candidate = noteLines.slice(noteLine, noteLine + lineCount + 1).join('\n');
              if (doc.heightOfString(candidate, { width: pageWidth }) > availableHeight - 2) break;
              lineCount += 1;
            }
            if (lineCount === 0) {
              doc.addPage();
              y = 40;
              continue;
            }
            const chunk = noteLines.slice(noteLine, noteLine + lineCount).join('\n');
            doc.text(chunk, 40, y, { width: pageWidth });
            y = doc.y + 5;
            noteLine += lineCount;
            if (noteLine < noteLines.length) {
              doc.addPage();
              y = 40;
            }
          }
          y += 3;
        }

        if (model.category === 'invoices' && model.templateConfig.showBankDetails !== false) {
          const bankDetails = [
            model.organization.bank_name && `Bank: ${sanitize(model.organization.bank_name)}`,
            model.organization.bank_account_number && `Account: ${sanitize(model.organization.bank_account_number)}`,
            model.organization.bank_ifsc_swift && `IFSC / SWIFT: ${sanitize(model.organization.bank_ifsc_swift)}`,
          ].filter(Boolean);
          if (bankDetails.length) {
            ensure(38);
            doc.font(boldFont).fontSize(7.5).fillColor(accentInk);
            text('Payment Details', 40, y, 150);
            doc.font(fontChoice).fontSize(7).fillColor('#475569');
            text(bankDetails.join('  |  '), 40, y + 11, pageWidth);
            y += 30;
          }
        }

        // --- 8. CATEGORY-SPECIFIC SIGNATURE BLOCKS ---
        if ((model.category === 'journals' || layout === 'ledger' || model.templateId === 'three-tier') && model.templateConfig.showThreeTierSignatures !== false) {
          ensure(52);
          const blockWidth = (pageWidth - 40) / 3;
          [0, 1, 2].forEach((idx) => {
            const blockX = 40 + (idx * (blockWidth + 20));
            doc.moveTo(blockX, y + 24).lineTo(blockX + blockWidth, y + 24).strokeColor('#94a3b8').stroke();
            doc.font(fontChoice).fontSize(7).fillColor('#475569');
            const labels = ['Prepared By', 'Checked By', 'Authorized By'];
            text(labels[idx], blockX, y + 28, blockWidth, { align: 'center' });
          });
          y += 42;
        } else if (model.category === 'delivery-challans') {
          ensure(48);
          doc.moveTo(40, y + 24).lineTo(220, y + 24).strokeColor('#94a3b8').stroke();
          doc.font(fontChoice).fontSize(7).fillColor('#475569');
          if (model.templateConfig.showReceiverAck !== false) text('Consignee Signature & Date', 40, y + 28, 200, { align: 'left' });
          const authX = 40 + pageWidth - 180;
          doc.moveTo(authX, y + 24).lineTo(authX + 180, y + 24).strokeColor('#94a3b8').stroke();
          text(sanitize(model.templateConfig.signatoryTitle || branding.authorizedSignatoryTitle || 'Authorized Signatory'), authX, y + 28, 180, { align: 'right' });
          y += 40;
        } else if (model.category === 'payment-receipts') {
          ensure(48);
          doc.roundedRect(40, y + 6, 85, 24, 3).strokeColor('#10b981').stroke();
          doc.font(boldFont).fontSize(9).fillColor('#10b981');
          text('PAID / RECEIVED', 40, y + 13, 85, { align: 'center' });
          const authX = 40 + pageWidth - 180;
          doc.moveTo(authX, y + 24).lineTo(authX + 180, y + 24).strokeColor('#94a3b8').stroke();
          doc.font(fontChoice).fontSize(7).fillColor('#475569');
          text(sanitize(model.templateConfig.signatoryTitle || branding.authorizedSignatoryTitle || 'Cashier / Authorized Signatory'), authX, y + 28, 180, { align: 'right' });
          y += 40;
        } else if (model.category === 'quotes') {
          ensure(48);
          doc.moveTo(40, y + 24).lineTo(200, y + 24).strokeColor('#94a3b8').stroke();
          doc.font(fontChoice).fontSize(7).fillColor('#475569');
          if (model.templateConfig.showClientAcceptance !== false) text('Customer Review Signature & Date', 40, y + 28, 190, { align: 'left' });
          const authX = 40 + pageWidth - 180;
          doc.moveTo(authX, y + 24).lineTo(authX + 180, y + 24).strokeColor('#94a3b8').stroke();
          text(sanitize(model.templateConfig.signatoryTitle || branding.authorizedSignatoryTitle || 'Authorized Signatory'), authX, y + 28, 180, { align: 'right' });
          y += 40;
        } else {
          ensure(44);
          const authX = 40 + pageWidth - 180;
          doc.moveTo(authX, y + 20).lineTo(authX + 180, y + 20).strokeColor('#94a3b8').stroke();
          doc.font(fontChoice).fontSize(7).fillColor('#475569');
          text(sanitize(model.templateConfig.signatoryTitle || branding.authorizedSignatoryTitle || 'Authorized Signatory'), authX, y + 24, 180, { align: 'right' });
          y += 36;
        }

        // --- 9. DYNAMIC FOOTER & PAGE NUMBERING ---
        const pages = doc.bufferedPageRange();
        const footerY = pageHeight - 72;
        for (let i = pages.start; i < pages.start + pages.count; i += 1) {
          doc.switchToPage(i);
          if (hasWatermark && watermarkString) {
            doc.save();
            doc.opacity(model.isSamplePreview ? 0.12 : 0.08).fillColor(primaryInk).font(boldFont).fontSize(orientation === 'landscape' ? 42 : 36);
            const centerX = doc.page.width / 2;
            const centerY = doc.page.height / 2;
            doc.rotate(-24, { origin: [centerX, centerY] });
            doc.text(watermarkString, centerX - (pageWidth / 2), centerY - 15, { width: pageWidth, align: 'center', lineBreak: false });
            doc.restore();
          }
          doc.moveTo(40, footerY).lineTo(40 + pageWidth, footerY).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
          doc.font(fontChoice).fontSize(7).fillColor('#64748b');
          const defaultFooterNote = model.isSamplePreview
            ? 'SAMPLE PREVIEW • Not an issued document • Powered by FirmBooks'
            : `FirmBooks • ${model.title} • Server-rendered from organization records`;
          const footerWidth = pageWidth * 0.65;
          const footerValue = sanitize(model.templateConfig.footerNote || branding.footerNote || defaultFooterNote);
          const footerLines = wrapToWidth(footerValue, footerWidth);
          const visibleFooterLines = footerLines.slice(0, 3);
          if (footerLines.length > visibleFooterLines.length) {
            let last = visibleFooterLines[visibleFooterLines.length - 1];
            while (last && doc.widthOfString(last + '...') > footerWidth) last = last.slice(0, -1);
            visibleFooterLines[visibleFooterLines.length - 1] = last.trimEnd() + '...';
          }
          visibleFooterLines.forEach((line, lineIndex) => {
            doc.text(line, 40, footerY + 6 + lineIndex * 8, { width: footerWidth, lineBreak: false });
          });
          text(`Page ${i + 1} of ${pages.count}`, 40 + pageWidth * 0.65, footerY + 8, pageWidth * 0.35, { align: 'right', lineBreak: false });
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}
