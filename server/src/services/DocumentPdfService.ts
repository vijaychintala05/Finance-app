import PDFDocument from 'pdfkit';
import { type DbQueryClient, db } from '../database/db';
import { amountToWords } from '../utils/numberToWords';
import { formatCurrencyAmount } from '../utils/money';
import { CustomerStatementService } from './CustomerStatementService';
import { VendorStatementService } from './VendorStatementService';
import { DocumentTemplateService, type DocumentTemplateRecord } from './DocumentTemplateService';

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
  'customer-statements': ['ledger', 'aging', 'summary'],
  bills: ['standard', 'accrual', 'matching'],
  expenses: ['reimburse', 'petty', 'standard'],
  'vendor-credits': ['standard', 'return', 'adjustment'],
  'vendor-payments': ['advice', 'cheque', 'settlement'],
  'vendor-statements': ['payables', 'aging', 'ledger'],
  journals: ['standard', 'three-tier', 'ledger'],
} as const;

export type DocumentPdfCategory = keyof typeof DOCUMENT_PDF_CATALOG;

type PdfLine = { description: string; quantity?: number; rate?: number; debit?: number; credit?: number; amount?: number; reference?: string; date?: string; balance?: number };
type RenderModel = {
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
  balance?: number;
  notes?: string;
  journalLines: PdfLine[];
  versionedTemplate?: DocumentTemplateRecord | null;
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

  public static async generatePdf(client: DbQueryClient, organizationId: string, category: DocumentPdfCategory, documentId: string, requestedTemplateId?: string, options: { fromDate?: string; toDate?: string } = {}): Promise<{ pdf: Buffer; filename: string; templateId: string }> {
    const model = await this.buildModel(client, organizationId, category, documentId, requestedTemplateId, options);
    const pdf = await this.render(model);
    const snapshotStatus = ['POSTED', 'SENT', 'PAID', 'PARTIALLY_PAID', 'ACCEPTED', 'CONVERTED', 'RECEIVED', 'APPROVED', 'ISSUED'];
    if (snapshotStatus.includes(model.status) || category === 'customer-statements' || category === 'vendor-statements') {
      await DocumentTemplateService.persistSnapshot(client, organizationId, category, documentId, model.versionedTemplate || null, model, pdf.length);
    }
    const filename = `${sanitize(model.title).replace(/[^A-Za-z0-9]+/g, '-')}-${sanitize(model.number).replace(/[^A-Za-z0-9_-]+/g, '-') || documentId}.pdf`;
    return { pdf, filename, templateId: model.templateId };
  }

  private static async buildModel(client: DbQueryClient, organizationId: string, category: DocumentPdfCategory, documentId: string, requestedTemplateId?: string, options: { fromDate?: string; toDate?: string } = {}): Promise<RenderModel> {
    const meta = CATEGORY_META[category];
    const orgResult = await client.query(
      `SELECT o.*, p.legal_name, p.trade_name, p.gstin, p.tax_id, p.pan, p.address_line1, p.address_line2, p.city, p.state, p.postal_code, p.phone, p.email, p.website, p.bank_name, p.bank_account_number, p.bank_ifsc_swift, p.invoice_notes, p.branding, p.document_templates
       FROM organizations o LEFT JOIN organization_profiles p ON p.organization_id = o.id WHERE o.id = $1`,
      [organizationId]
    );
    if (!orgResult.rows[0]) throw new Error('Organization not found');
    const organization = orgResult.rows[0] as Record<string, any>;
    const documentTemplates = parseJson(organization.document_templates) || {};
    const legacyTemplateConfig = this.templateConfig(documentTemplates, category);
    const versionedTemplate = await DocumentTemplateService.resolve(client, organizationId, category, requestedTemplateId);
    const templateConfig = versionedTemplate?.configuration && Object.keys(versionedTemplate.configuration).length
      ? { ...legacyTemplateConfig, ...versionedTemplate.configuration }
      : legacyTemplateConfig;
    const savedTemplate = templateConfig.defaultTemplate;
    const templateId = requestedTemplateId || versionedTemplate?.modelId || savedTemplate || DOCUMENT_PDF_CATALOG[category][0];
    if (!(DOCUMENT_PDF_CATALOG[category] as readonly string[]).includes(templateId) && !(versionedTemplate && templateId === versionedTemplate.modelId)) {
      throw new Error(`Unsupported ${category} PDF template: ${sanitize(templateId)}`);
    }

    if (category === 'customer-statements' || category === 'vendor-statements') {
      return this.buildStatementModel(organizationId, category, documentId, templateId, organization, templateConfig, options, versionedTemplate);
    }
    const sourceResult = await client.query(`SELECT * FROM ${meta.table} WHERE organization_id = $1 AND id = $2`, [organizationId, documentId]);
    if (!sourceResult.rows[0]) throw new Error(`${meta.title} record not found: ${documentId}`);
    const source = sourceResult.rows[0] as Record<string, any>;
    const lines = await this.resolveDocumentLines(client, organizationId, category, source);
    const journalLines = await this.resolveJournalLines(client, organizationId, source.journal_entry_id || (category === 'journals' ? source.id : undefined));
    const partyName = sanitize(source[meta.party] || source.client_name || source.customer_name || source.vendor_name || (category === 'journals' ? 'General Ledger' : 'Counterparty'));
    const partyDetails = [source.client_email || source.vendor_email, source.reference ? `Reference: ${source.reference}` : '', source.vendor_invoice_number ? `Vendor invoice: ${source.vendor_invoice_number}` : ''].filter(Boolean).map(sanitize);
    const subtotal = number(source.subtotal || source.amount || source.total_amount);
    const tax = number(source.tax_total || source.tax_amount);
    const discount = number(source.discount);
    const total = number(source[meta.amount] || source.amount || source.total_amount || lines.reduce((sum, line) => sum + number(line.amount), 0));
    return {
      category, templateId, title: sanitize(templateConfig.templateTitle || meta.title),
      number: sanitize(source[meta.number] || source.id), status: sanitize(source.status || 'DRAFT').toUpperCase(), date: isoDate(source[meta.date]), dueDate: isoDate(source.due_date || source.expected_delivery),
      partyLabel: category === 'journals' ? 'LEDGER' : category.includes('vendor') || category === 'bills' ? 'VENDOR' : 'CUSTOMER', partyName, partyDetails,
      organization, source, templateConfig, lines, subtotal, tax, discount, total, balance: number(source.balance_due ?? source.remaining_credit ?? source.unallocated_amount), notes: sanitize(source.notes || source.reason || source.description), journalLines, versionedTemplate,
    };
  }

  private static async buildStatementModel(organizationId: string, category: 'customer-statements' | 'vendor-statements', partyId: string, templateId: string, organization: Record<string, any>, config: Record<string, any>, options: { fromDate?: string; toDate?: string }, versionedTemplate: DocumentTemplateRecord | null): Promise<RenderModel> {
    const toDate = options.toDate || new Date().toISOString().split('T')[0];
    const fromDate = options.fromDate || `${new Date(toDate).getUTCFullYear()}-04-01`;
    const statement = category === 'customer-statements'
      ? await CustomerStatementService.getCustomerStatement(organizationId, partyId, fromDate, toDate)
      : await VendorStatementService.getVendorStatement(organizationId, partyId, fromDate, toDate);
    const title = sanitize(config.templateTitle || CATEGORY_META[category].title);
    return {
      category, templateId, title, number: `${fromDate} to ${toDate}`, status: 'ISSUED', date: toDate,
      partyLabel: category === 'customer-statements' ? 'CUSTOMER' : 'VENDOR', partyName: sanitize((statement as any).customerName || (statement as any).vendorName), partyDetails: [`Period: ${fromDate} to ${toDate}`], organization, source: statement as any, templateConfig: config,
      lines: statement.transactions.map((line: any) => ({ date: isoDate(line.date), description: `${line.type} — ${line.reference}`, debit: number(line.debit), credit: number(line.credit), balance: number(line.runningBalance) })),
      subtotal: number((statement as any).totalInvoices || (statement as any).totalBills), tax: 0, discount: 0, total: number(statement.closingBalance), balance: number(statement.closingBalance), notes: '', journalLines: [], versionedTemplate,
    };
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
    if (Array.isArray(rawLines)) return rawLines.map((line: any) => ({ description: sanitize(line.description || line.name || line.itemName || 'Line item'), quantity: number(line.quantity ?? line.qty), rate: number(line.unitPrice ?? line.unit_price ?? line.rate), amount: number(line.amount ?? line.lineTotal ?? ((number(line.quantity ?? line.qty) || 1) * number(line.unitPrice ?? line.unit_price ?? line.rate))) }));
    return [];
  }

  private static async resolveJournalLines(client: DbQueryClient, organizationId: string, journalEntryId?: string): Promise<PdfLine[]> {
    if (!journalEntryId) return [];
    const result = await client.query(`SELECT account_code, account_name, description, debit, credit FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2 ORDER BY id`, [organizationId, journalEntryId]);
    return result.rows.map((line: any) => ({ description: sanitize(line.account_name || line.account_code || line.description || 'Ledger account'), debit: number(line.debit), credit: number(line.credit), reference: sanitize(line.description) }));
  }

  private static formatAmount(amount: number, org: Record<string, any>): string {
    const code = sanitize(org.base_currency || 'INR');
    const symbol = sanitize(org.currency_symbol || (code === 'INR' ? '₹' : code));
    return formatCurrencyAmount(amount, symbol);
  }

  private static layout(templateId: string): 'standard' | 'ledger' | 'compact' {
    if (['spreadsheet', 'ledger', 'aging', 'accrual', 'three-tier', 'matching', 'return', 'contract', 'jobwork', 'requisition'].includes(templateId)) return 'ledger';
    if (['compact', 'pos', 'petty', 'cheque', 'dispatch', 'acknowledgment', 'settlement'].includes(templateId)) return 'compact';
    return 'standard';
  }

  private static async render(model: RenderModel): Promise<Buffer> {
    const branding = parseJson(model.organization.branding) || {};
    const primary = sanitize(branding.primaryColor || '#1d4ed8');
    const accent = sanitize(branding.accentColor || '#0f172a');
    const layout = this.layout(model.templateId);
    const amount = (value: number) => this.formatAmount(value, model.organization);
    const columns = model.category.includes('statement') ? ['Date', 'Transaction', 'Debit', 'Credit', 'Balance'] : model.category === 'journals' || model.journalLines.length ? ['Account / detail', 'Debit', 'Credit'] : ['Description', 'Qty', 'Rate', 'Amount'];
    const displayLines = model.category === 'journals' || (model.lines.length === 0 && model.journalLines.length) ? model.journalLines : model.lines;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', reject);
        const pageWidth = 515;
        let y = 40;
        const ensure = (height: number) => { if (y + height > 735) { doc.addPage(); y = 40; } };
        const text = (value: unknown, x: number, top: number, width: number, options: any = {}) => doc.text(sanitize(value || '-'), x, top, { width, ...options });

        if (layout === 'standard') {
          doc.rect(40, y, pageWidth, 54).fill(primary);
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16); text(model.title, 52, y + 12, 290);
          doc.font('Helvetica').fontSize(8); text(`Template: ${model.templateId}`, 52, y + 33, 200);
          doc.font('Helvetica-Bold').fontSize(12); text(model.number, 350, y + 14, 193, { align: 'right' });
          doc.font('Helvetica').fontSize(8); text(`Status: ${model.status}`, 350, y + 34, 193, { align: 'right' }); y += 68;
        } else if (layout === 'ledger') {
          doc.rect(40, y, pageWidth, 2).fill(primary); y += 12;
          doc.fillColor(accent).font('Helvetica-Bold').fontSize(18); text(model.title, 40, y, 310);
          doc.fontSize(10); text(model.number, 355, y + 3, 200, { align: 'right' }); y += 32;
          doc.rect(40, y, pageWidth, 22).fill('#eff6ff'); doc.fillColor(primary).fontSize(8).font('Helvetica-Bold'); text(`CONTROLLED ${model.title}`, 50, y + 7, 250); text(`STATUS: ${model.status}`, 330, y + 7, 215, { align: 'right' }); y += 34;
        } else {
          doc.rect(40, y, pageWidth, 34).fill(accent); doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13); text(model.title, 50, y + 10, 280); text(model.number, 350, y + 10, 195, { align: 'right' }); y += 46;
        }

        if (model.templateConfig.showWatermark && model.templateConfig.watermarkText) {
          doc.save();
          doc.opacity(0.08).fillColor(primary).font('Helvetica-Bold').fontSize(44);
          doc.rotate(-24, { origin: [297, 410] });
          text(model.templateConfig.watermarkText, 70, 385, 450, { align: 'center' });
          doc.restore();
        }
        const orgName = sanitize(model.organization.legal_name || model.organization.trade_name || model.organization.name || 'Organization');
        const orgAddress = [model.organization.address_line1, model.organization.address_line2, model.organization.city, model.organization.state, model.organization.postal_code].filter(Boolean).map(sanitize).join(', ');
        doc.fillColor(accent).font('Helvetica-Bold').fontSize(10); text(orgName, 40, y, 245);
        doc.font('Helvetica').fontSize(7.5).fillColor('#475569'); text([orgAddress, model.organization.gstin ? `GSTIN: ${model.organization.gstin}` : '', model.organization.phone, model.organization.email].filter(Boolean).join('\n'), 40, y + 14, 245);
        doc.fillColor(accent).font('Helvetica-Bold').fontSize(8); text(model.partyLabel, 335, y, 220, { align: 'right' });
        doc.fontSize(10).font('Helvetica-Bold'); text(model.partyName, 335, y + 13, 220, { align: 'right' });
        doc.font('Helvetica').fontSize(7.5).fillColor('#475569'); text(model.partyDetails.join('\n'), 335, y + 28, 220, { align: 'right' });
        y += 66;
        doc.moveTo(40, y).lineTo(555, y).strokeColor('#cbd5e1').stroke(); y += 10;

        const metadata = [['Date', model.date], ...(model.dueDate && model.dueDate !== '-' ? [['Due / delivery', model.dueDate]] : []), ['Status', model.status], ...(model.source.reference ? [['Reference', sanitize(model.source.reference)]] : [])];
        for (let index = 0; index < metadata.length; index += 2) {
          const left = metadata[index]; const right = metadata[index + 1];
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b'); text(left[0], 40, y, 95); doc.font('Helvetica').fillColor(accent); text(left[1], 138, y, 130);
          if (right) { doc.font('Helvetica-Bold').fillColor('#64748b'); text(right[0], 300, y, 105); doc.font('Helvetica').fillColor(accent); text(right[1], 410, y, 145, { align: 'right' }); }
          y += 14;
        }
        y += 8;

        if (displayLines.length) {
          const isStatement = model.category.includes('statement'); const isJournal = model.category === 'journals' || displayLines === model.journalLines;
          const widths = isStatement ? [72, 210, 75, 75, 83] : isJournal ? [290, 112, 113] : [250, 58, 92, 115];
          const drawHeader = () => { ensure(26); doc.rect(40, y, pageWidth, 20).fill(layout === 'compact' ? accent : '#e2e8f0'); doc.font('Helvetica-Bold').fontSize(7.5).fillColor(layout === 'compact' ? '#ffffff' : '#334155'); let x = 46; columns.forEach((column, i) => { text(column, x, y + 6, widths[i] - 8, { align: i === 0 || (isStatement && i === 1) ? 'left' : 'right' }); x += widths[i]; }); y += 20; };
          drawHeader();
          displayLines.forEach((line) => {
            ensure(25); if (y === 40) drawHeader();
            doc.font('Helvetica').fontSize(7.5).fillColor('#1e293b'); let x = 46;
            const values = isStatement ? [line.date, line.description, amount(number(line.debit)), amount(number(line.credit)), amount(number(line.balance))] : isJournal ? [`${line.description}${line.reference ? `\n${line.reference}` : ''}`, amount(number(line.debit)), amount(number(line.credit))] : [line.description, line.quantity ? String(line.quantity) : '-', line.rate ? amount(number(line.rate)) : '-', amount(number(line.amount))];
            values.forEach((value, i) => { text(value, x, y + 6, widths[i] - 8, { align: i === 0 || (isStatement && i === 1) ? 'left' : 'right' }); x += widths[i]; });
            doc.moveTo(40, y + 22).lineTo(555, y + 22).strokeColor('#e2e8f0').lineWidth(0.5).stroke(); y += 23;
          });
          y += 8;
        }

        ensure(118);
        const totalX = 340;
        if (!model.category.includes('statement') && model.category !== 'journals') {
          const rows = [['Subtotal', model.subtotal], ...(model.tax && model.templateConfig.showTaxBreakdown !== false ? [['Tax', model.tax]] : []), ...(model.discount && model.templateConfig.showDiscount !== false ? [['Discount', -model.discount]] : []), ['Total', model.total], ...(model.balance ? [['Balance', model.balance]] : [])];
          rows.forEach(([label, value], index) => { if (index === rows.length - 2) { doc.rect(totalX - 10, y - 3, 225, 22).fill(primary); doc.fillColor('#ffffff'); } else doc.fillColor(index === rows.length - 1 ? '#dc2626' : '#475569'); doc.font(index === rows.length - 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(index === rows.length - 2 ? 10 : 8); text(label, totalX, y + 3, 95); text(amount(number(value)), totalX + 95, y + 3, 110, { align: 'right' }); y += 22; });
          y += 8; doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#64748b'); text(`Amount in words: ${amountToWords(model.total, sanitize(model.organization.base_currency || 'INR'))}`, 40, y, 285);
        } else if (model.category.includes('statement')) {
          doc.rect(totalX - 10, y, 225, 30).fill(primary); doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8); text('CLOSING BALANCE', totalX, y + 8, 100); text(amount(model.total), totalX + 100, y + 8, 105, { align: 'right' }); y += 40;
        } else {
          const debits = model.journalLines.reduce((sum, line) => sum + number(line.debit), 0); const credits = model.journalLines.reduce((sum, line) => sum + number(line.credit), 0);
          doc.rect(totalX - 10, y, 225, 32).fill(primary); doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8); text(`TOTAL DEBIT ${amount(debits)}`, totalX, y + 7, 195, { align: 'right' }); text(`TOTAL CREDIT ${amount(credits)}`, totalX, y + 18, 195, { align: 'right' }); y += 42;
        }
        if (model.notes && model.templateConfig.showNarration !== false) { ensure(46); doc.font('Helvetica-Bold').fontSize(8).fillColor(accent); text('Notes', 40, y, 100); doc.font('Helvetica').fontSize(7.5).fillColor('#475569'); text(model.notes, 40, y + 12, pageWidth); y += 35; }
        if (layout === 'ledger' || model.templateId === 'three-tier') { ensure(58); doc.moveTo(40, y + 28).lineTo(170, y + 28).strokeColor('#94a3b8').stroke(); doc.moveTo(220, y + 28).lineTo(350, y + 28).strokeColor('#94a3b8').stroke(); doc.moveTo(400, y + 28).lineTo(530, y + 28).strokeColor('#94a3b8').stroke(); doc.font('Helvetica').fontSize(7).fillColor('#475569'); text('Prepared by', 40, y + 32, 130, { align: 'center' }); text('Checked by', 220, y + 32, 130, { align: 'center' }); text('Authorized by', 400, y + 32, 130, { align: 'center' }); }

        const pages = doc.bufferedPageRange();
        for (let i = pages.start; i < pages.start + pages.count; i += 1) { doc.switchToPage(i); doc.moveTo(40, 780).lineTo(555, 780).strokeColor('#cbd5e1').lineWidth(0.5).stroke(); doc.font('Helvetica').fontSize(7).fillColor('#64748b'); text(sanitize(model.templateConfig.footerNote || `FirmBooks • ${model.title} • Server-rendered from organization records`), 40, 788, 330); text(`Page ${i + 1} of ${pages.count}`, 400, 788, 155, { align: 'right' }); }
        doc.end();
      } catch (error) { reject(error); }
    });
  }
}
