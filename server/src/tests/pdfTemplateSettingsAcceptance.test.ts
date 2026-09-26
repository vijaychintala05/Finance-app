import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';
import { ALL_44_TEMPLATE_MODELS, DEFAULT_TEMPLATE_MODEL_BY_CATEGORY, seedAndMigrateOrganizationTemplates } from '../database/documentTemplateSchema';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { AuditTrailService } from '../security/AuditTrailService';
import { DOCUMENT_PDF_CATALOG, DocumentPdfService, contrastTextForFill, readableInkOnWhite, type DocumentPdfCategory } from '../services/DocumentPdfService';

async function parsePdf(buffer: Buffer): Promise<{ numpages: number; text: string }> {
  const mod = require('pdf-parse');
  const PDFClass = mod.PDFParse || mod.default || mod;
  const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let text = '';
  let numpages = 1;

  try {
    const instance = new PDFClass(uint8);
    if (typeof instance.getText === 'function') {
      const res = await instance.getText();
      text = typeof res === 'string' ? res : (res?.text || '');
      numpages = res?.numpages || res?.numPages || instance.doc?.numPages || 1;
    }
  } catch (err: any) {
    // Fallback simple string extraction if PDF parsing stream throws
    text = buffer.toString('binary');
  }

  return { numpages, text };
}

function getPdfResponse(url: string, headers: any) {
  return request(app)
    .get(url)
    .set(headers)
    .parse((res, callback) => {
      res.setEncoding('binary');
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
    });
}

async function readPdfTextPositions(buffer: Buffer): Promise<Array<Array<{ text: string; baselineY: number; x: number; width: number; pageWidth: number; pageHeight: number }>>> {
  const mod = require('pdf-parse');
  const PDFClass = mod.PDFParse || mod.default || mod;
  const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const parser = new PDFClass(bytes);
  await parser.getText();
  const doc = (parser as any).doc;
  const pages: Array<Array<{ text: string; baselineY: number; x: number; width: number; pageWidth: number; pageHeight: number }>> = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });
    pages.push(content.items.filter((item: any) => typeof item.str === 'string').map((item: any) => ({
      text: item.str,
      baselineY: Number(item.transform[5]),
      x: Number(item.transform[4]),
      width: Number(item.width),
      pageWidth: viewport.width,
      pageHeight: viewport.height,
    })));
    page.cleanup();
  }
  await parser.destroy();
  return pages;
}
describe('PDF Template Settings Acceptance Suite (14-Category Matrix & Requirements)', () => {
  let authHeadersA: { Authorization: string; 'X-Organization-ID': string };
  let orgIdA: string;
  let userIdA: string;

  let authHeadersB: { Authorization: string; 'X-Organization-ID': string };
  let orgIdB: string;

  beforeAll(async () => {
    if (process.env.REQUIRE_REAL_POSTGRES === 'true') {
      db.resetPool();
      expect(db.isMemoryMode()).toBe(false);
    } else {
      db.initPgMem();
    }
    await MigrationRunner.runMigrations();

    const timestamp = Date.now();

    // Register Organization A
    const regResA = await request(app).post('/api/v1/auth/register').send({
      email: `accept-pdf-a-${timestamp}@firmbooks.com`,
      password: 'Password123!',
      fullName: 'Finance Director Org A',
      organizationName: 'Alpha Financial Global Ltd',
      country: 'India',
      baseCurrency: 'INR',
    });
    expect(regResA.status).toBe(201);
    orgIdA = regResA.body.organizationId;
    await seedAndMigrateOrganizationTemplates(db, orgIdA);
    userIdA = regResA.body.user?.id || regResA.body.userId;
    authHeadersA = {
      Authorization: `Bearer ${regResA.body.token}`,
      'X-Organization-ID': orgIdA,
    };

    // Register Organization B
    const regResB = await request(app).post('/api/v1/auth/register').send({
      email: `accept-pdf-b-${timestamp}@firmbooks.com`,
      password: 'Password123!',
      fullName: 'Finance Controller Org B',
      organizationName: 'Beta Enterprises Ltd',
      country: 'India',
      baseCurrency: 'INR',
    });
    expect(regResB.status).toBe(201);
    orgIdB = regResB.body.organizationId;
    authHeadersB = {
      Authorization: `Bearer ${regResB.body.token}`,
      'X-Organization-ID': orgIdB,
    };
  });

  // =========================================================================
  // 1. INVENTORY & CATEGORY COVERAGE MATRIX
  // =========================================================================
  it('covers all 14 supported categories with at least 3 distinct server-owned templates', async () => {
    const categories = Object.keys(DOCUMENT_PDF_CATALOG) as DocumentPdfCategory[];
    expect(categories.length).toBe(14);

    for (const cat of categories) {
      const templates = DOCUMENT_PDF_CATALOG[cat];
      expect(templates.length).toBeGreaterThanOrEqual(3);

      const res = await request(app)
        .get(`/api/v1/finance/documents/${cat}/templates`)
        .set(authHeadersA);

      expect(res.status).toBe(200);
      expect(res.body.category).toBe(cat);
      expect(res.body.templateIds).toEqual(templates);
      expect(res.body.templates.length).toBe(templates.length);
    }
  });

  // =========================================================================
  it('preserves all published template model IDs and category defaults', async () => {
    const expected: Record<string, string[]> = {
      quotes: ['proposal', 'commercial', 'compact', 'milestone-proposal'],
      'sales-orders': ['confirmation', 'commercial', 'fulfillment'],
      'delivery-challans': ['dispatch', 'packing-list', 'jobwork'],
      invoices: ['tax-invoice', 'ledger-invoice', 'export', 'pos'],
      'credit-notes': ['statutory', 'goods-return', 'adjustment'],
      'purchase-orders': ['standard-po', 'requisition', 'contract-po'],
      'payment-receipts': ['receipt-voucher', 'allocation-advice', 'cash-receipt'],
      'customer-statements': ['running-ledger', 'aging-statement', 'open-summary'],
      bills: ['bill-itc', 'accrual-voucher', 'matching'],
      expenses: ['reimbursement', 'petty-cash', 'project-billable'],
      'vendor-credits': ['debit-note', 'purchase-return', 'adjustment-memo'],
      'vendor-payments': ['remittance-advice', 'cheque-disbursement', 'allocation-advice'],
      'vendor-statements': ['vendor-ledger', 'payables-aging', 'reconciliation'],
      journals: ['general-voucher', 'audit-voucher', 'adjustment-journal'],
    };
    expect(ALL_44_TEMPLATE_MODELS).toHaveLength(44);
    for (const [category, ids] of Object.entries(expected)) {
      expect(ALL_44_TEMPLATE_MODELS.filter((model) => model.category === category).map((model) => model.modelId).sort()).toEqual([...ids].sort());
      const seeded = await db.query('SELECT model_id FROM document_templates WHERE organization_id = $1 AND category = $2 ORDER BY model_id', [orgIdA, category]);
      expect(seeded.rows.map((row: any) => row.model_id).sort()).toEqual([...ids].sort());
      const assigned = await db.query(
        `SELECT t.model_id FROM document_template_assignments a JOIN document_templates t ON t.id = a.template_id AND t.organization_id = a.organization_id WHERE a.organization_id = $1 AND a.category = $2 AND a.entity_type = 'ORGANIZATION' AND a.entity_id IS NULL`,
        [orgIdA, category],
      );
      expect(assigned.rows[0]?.model_id).toBe(DEFAULT_TEMPLATE_MODEL_BY_CATEGORY[category]);
    }
  });
  it('preserves existing statement model IDs and the seeded organization defaults', async () => {
    const cases = [
      ['customer-statements', ['running-ledger', 'aging-statement', 'open-summary'], 'running-ledger'],
      ['vendor-statements', ['vendor-ledger', 'payables-aging', 'reconciliation'], 'vendor-ledger'],
    ] as const;
    for (const [category, expectedIds, defaultId] of cases) {
      const models = await db.query('SELECT model_id FROM document_templates WHERE organization_id = $1 AND category = $2 ORDER BY model_id', [orgIdA, category]);
      expect(models.rows.map((row: any) => row.model_id).sort()).toEqual([...expectedIds].sort());
      const assigned = await db.query(
        `SELECT t.model_id FROM document_template_assignments a JOIN document_templates t ON t.id = a.template_id AND t.organization_id = a.organization_id WHERE a.organization_id = $1 AND a.category = $2 AND a.entity_type = 'ORGANIZATION' AND a.entity_id IS NULL`,
        [orgIdA, category],
      );
      expect(assigned.rows[0]?.model_id).toBe(defaultId);
    }
  });
  // 2. SAMPLE PREVIEW WITHOUT TRANSACTIONS MUTATION
  // =========================================================================
  it('renders realistic sample preview PDFs for all 14 categories without mutating database records', async () => {
    const categories = Object.keys(DOCUMENT_PDF_CATALOG) as DocumentPdfCategory[];

    // Count records before preview
    const invoicesBefore = await db.query('SELECT COUNT(*) AS c FROM invoices');
    const journalsBefore = await db.query('SELECT COUNT(*) AS c FROM journal_entries');

    for (const cat of categories) {
      const defaultTmpl = DOCUMENT_PDF_CATALOG[cat][0];
      const previewRes = await getPdfResponse(
        `/api/v1/finance/documents/${cat}/preview/pdf?templateId=${defaultTmpl}&primaryColor=%230284c7&accentColor=%230f172a`,
        authHeadersA
      );

      expect(previewRes.status).toBe(200);
      expect(previewRes.headers['content-type']).toMatch(/application\/pdf/);
      expect(previewRes.headers['x-document-pdf-sample-preview']).toBe('true');

      const buffer = previewRes.body instanceof Buffer ? previewRes.body : Buffer.from(previewRes.body);
      expect(buffer.toString('binary', 0, 8)).toMatch(/^%PDF-1\./);

      const parsed = await parsePdf(buffer);
      expect(parsed.text).toContain('SAMPLE PREVIEW');
      expect(parsed.numpages).toBe(1);
    }

    // Verify record counts remain identical
    const invoicesAfter = await db.query('SELECT COUNT(*) AS c FROM invoices');
    const journalsAfter = await db.query('SELECT COUNT(*) AS c FROM journal_entries');
    expect(invoicesAfter.rows[0].c).toBe(invoicesBefore.rows[0].c);
    expect(journalsAfter.rows[0].c).toBe(journalsBefore.rows[0].c);
  });

  it('contains long footers and preserves over-height line descriptions across pages', async () => {
    const footerPreview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'invoices', 'standard', {
      footerNote: 'Footer marker '.repeat(700),
    });
    const footerPdf = await parsePdf(footerPreview.pdf);
    expect(footerPdf.numpages).toBe(1);
    expect(footerPdf.text).toContain('Footer marker');
    expect(footerPdf.text).toContain('Page 1 of 1');

    const model = (DocumentPdfService as any)['buildSampleModel'](
      'invoices',
      'standard',
      { name: 'PDF Acceptance Org', base_currency: 'INR' },
      { showAmountInWords: false, showNarration: false },
    );
    model.lines = [{ description: Array.from({ length: 400 }, () => 'LONGDESCRIPTIONTOKEN').join(' '), quantity: 1, rate: 10, amount: 10 }];
    model.subtotal = 10;
    model.tax = 0;
    model.discount = 0;
    model.total = 10;
    const rendered = await (DocumentPdfService as any)['render'](model) as Buffer;
    const parsed = await parsePdf(rendered);
    expect(parsed.numpages).toBeGreaterThan(1);
    expect(parsed.text.match(/LONGDESCRIPTIONTOKEN/g) || []).toHaveLength(400);
    for (let page = 1; page <= parsed.numpages; page += 1) {
      expect(parsed.text).toContain(`Page ${page} of ${parsed.numpages}`);
    }

    const challan = (DocumentPdfService as any)['buildSampleModel'](
      'delivery-challans',
      'standard',
      { name: 'PDF Acceptance Org', base_currency: 'INR' },
      { hideRatesInChallan: true, showHsnSac: false, showNarration: false },
    );
    challan.lines = [{ description: 'Hardware shipment', packages: Array.from({ length: 400 }, () => 'PKG000').join(' '), quantity: 1 }];
    challan.subtotal = 0;
    challan.tax = 0;
    challan.discount = 0;
    challan.total = 0;
    const challanPdf = await (DocumentPdfService as any)['render'](challan) as Buffer;
    const challanParsed = await parsePdf(challanPdf);
    expect(challanParsed.numpages).toBeGreaterThan(1);
    expect(challanParsed.text.match(/PKG000/g) || []).toHaveLength(400);
  });

  // =========================================================================
  // 3. PURPOSE-BUILT CONTENT PER CATEGORY
  // =========================================================================
  it('watermarks every page and lays out long notes before signatures and footers', async () => {
    const model = (DocumentPdfService as any)['buildSampleModel'](
      'quotes',
      'proposal',
      { name: 'Long Note PDF Test', base_currency: 'INR' },
      { showAmountInWords: false, showWatermark: true, watermarkText: 'PAGE-WATERMARK-913', footerNote: 'LONG-NOTE-FOOTER' },
    );
    model.isSamplePreview = false;
    model.notes = `${'Long contractual clause with a full line of terms. '.repeat(500)}ENDNOTESTOKEN`;
    const rendered = await (DocumentPdfService as any)['render'](model) as Buffer;
    const parsed = await parsePdf(rendered);
    expect(parsed.numpages).toBeGreaterThan(1);
    expect(parsed.text.match(/PAGE-WATERMARK-913/g) || []).toHaveLength(parsed.numpages);
    expect(parsed.text.replace(/\s+/g, ' ')).toContain('ENDNOTESTOKEN');
    expect(parsed.text).toContain('Customer Review Signature & Date');
    expect(parsed.text).toContain('LONG-NOTE-FOOTER');
    const positionedPages = await readPdfTextPositions(rendered);
    let pagesWithNotes = 0;
    for (const page of positionedPages) {
      expect(page.filter((item) => item.text.includes('PAGE-WATERMARK-913'))).toHaveLength(1);
      const noteBaselines = page.filter((item) => item.text.includes('Long contractual clause')).map((item) => item.baselineY);
      const footerBaseline = page.find((item) => item.text === 'LONG-NOTE-FOOTER')?.baselineY;
      expect(footerBaseline).toBeDefined();
      if (noteBaselines.length) {
        pagesWithNotes += 1;
        expect(Math.min(...noteBaselines)).toBeGreaterThan(footerBaseline! + 12);
      }
    }
    expect(pagesWithNotes).toBeGreaterThan(0);
    for (let page = 1; page <= parsed.numpages; page += 1) expect(parsed.text).toContain(`Page ${page} of ${parsed.numpages}`);
  });
  it('honors HSN/SAC and amount-in-words template visibility settings', async () => {
    const shown = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'invoices', 'standard', {
      showHsnSac: true,
      showAmountInWords: true,
    });
    const shownText = (await parsePdf(shown.pdf)).text;
    expect(shownText).toContain('HSN/SAC');
    expect(shownText).toContain('Amount in words');

    const hidden = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'invoices', 'standard', {
      showHsnSac: false,
      showAmountInWords: false,
    });
    const hiddenText = (await parsePdf(hidden.pdf)).text;
    expect(hiddenText).not.toContain('HSN/SAC');
    expect(hiddenText).not.toContain('Amount in words');
  });

  it('renders truthful category-specific settings into their PDFs', async () => {
    const renderSample = async (category: DocumentPdfCategory, templateId: string, config: Record<string, any>) => {
      const model = (DocumentPdfService as any)['buildSampleModel'](category, templateId, { name: 'Settings Test Org', base_currency: 'INR' }, config);
      return parsePdf(await (DocumentPdfService as any)['render'](model) as Buffer);
    };

    const challanModel = (DocumentPdfService as any)['buildSampleModel']('delivery-challans', 'dispatch', { name: 'Settings Test Org', base_currency: 'INR' }, { hideRatesInChallan: true, showPackageDetails: true });
    challanModel.lines = [{ description: 'Package test item', packages: 'PKG742', quantity: 2, rate: 50, amount: 100 }];
    const packagesShown = await parsePdf(await (DocumentPdfService as any)['render'](challanModel) as Buffer);
    challanModel.templateConfig.showPackageDetails = false;
    const packagesHidden = await parsePdf(await (DocumentPdfService as any)['render'](challanModel) as Buffer);
    expect(packagesShown.text).toContain('PKG742');
    expect(packagesHidden.text).not.toContain('PKG742');
    expect(packagesHidden.text).not.toContain('Packages');
    challanModel.templateConfig.showPackageDetails = true;
    challanModel.templateConfig.hideRatesInChallan = false;
    const regularPackagesShown = await parsePdf(await (DocumentPdfService as any)['render'](challanModel) as Buffer);
    challanModel.templateConfig.showPackageDetails = false;
    const regularPackagesHidden = await parsePdf(await (DocumentPdfService as any)['render'](challanModel) as Buffer);
    expect(regularPackagesShown.text).toContain('PKG742');
    expect(regularPackagesShown.text).toContain('Packages');
    expect(regularPackagesHidden.text).not.toContain('PKG742');
    expect(regularPackagesHidden.text).not.toContain('Packages');

    const expenseModel = (DocumentPdfService as any)['buildSampleModel']('expenses', 'reimburse', { name: 'Settings Test Org', base_currency: 'INR' }, { showTdsDeduction: true });
    expenseModel.source = { tds_amount: 2450, tds_section: '194J' };
    const expenseShown = await parsePdf(await (DocumentPdfService as any)['render'](expenseModel) as Buffer);
    expenseModel.templateConfig.showTdsDeduction = false;
    const expenseHidden = await parsePdf(await (DocumentPdfService as any)['render'](expenseModel) as Buffer);
    expect(expenseShown.text).toContain('TDS Withheld (194J)');
    expect(expenseShown.text).toContain('INR 2,450.00');
    expect(expenseHidden.text).not.toContain('TDS Withheld');
    expect(expenseHidden.text).not.toContain('Net Paid');

    const renderPaidInvoice = async (status: string, balance?: number, showPaidStamp = true) => {
      const model = (DocumentPdfService as any)['buildSampleModel']('invoices', 'standard', { name: 'Settings Test Org', base_currency: 'INR' }, { showPaidStamp });
      model.status = status;
      if (balance === undefined) delete model.balance;
      else model.balance = balance;
      return parsePdf(await (DocumentPdfService as any)['render'](model) as Buffer);
    };
    expect((await renderPaidInvoice('PAID', 0)).text).toContain('PAID IN FULL');
    expect((await renderPaidInvoice('PAID', 0, false)).text).not.toContain('PAID IN FULL');
    expect((await renderPaidInvoice('DRAFT', 0)).text).not.toContain('PAID IN FULL');
    expect((await renderPaidInvoice('PARTIALLY_PAID', 10)).text).not.toContain('PAID IN FULL');
    expect((await renderPaidInvoice('PAID', 10)).text).not.toContain('PAID IN FULL');
    expect((await renderPaidInvoice('PAID')).text).not.toContain('PAID IN FULL');

    const billModel = (DocumentPdfService as any)['buildSampleModel']('bills', 'standard', { name: 'Settings Test Org', base_currency: 'INR' }, { showAccountAllocation: true });
    billModel.journalLines = [{ description: 'GL-ALLOCATION-UNIQUE-913', debit: 100, credit: 0 }];
    const allocationShown = await parsePdf(await (DocumentPdfService as any)['render'](billModel) as Buffer);
    billModel.templateConfig.showAccountAllocation = false;
    const allocationHidden = await parsePdf(await (DocumentPdfService as any)['render'](billModel) as Buffer);
    expect(allocationShown.text).toContain('Posted General Ledger Allocation');
    expect(allocationShown.text).toContain('GL-ALLOCATION-UNIQUE-913');
    expect(allocationHidden.text).not.toContain('GL-ALLOCATION-UNIQUE-913');

    const scopeShown = await renderSample('quotes', 'proposal', { showScopeOfWork: true });
    const scopeHidden = await renderSample('quotes', 'proposal', { showScopeOfWork: false });
    const purchaseTerms = await renderSample('purchase-orders', 'standard-po', { showScopeOfWork: true });
    const purchaseTermsHidden = await renderSample('purchase-orders', 'standard-po', { showScopeOfWork: false });
    expect(scopeShown.text).toContain('Scope, pricing, and delivery details');
    expect(scopeHidden.text).not.toContain('Scope, pricing, and delivery details');
    expect(purchaseTerms.text).toContain('Payment terms');
    expect(purchaseTermsHidden.text).not.toContain('Payment terms');
    expect((DocumentPdfService as any)['formatAmount'](1250, { base_currency: 'INR' })).toBe('INR 1,250.00');
  });
  it('gives every registered sales and purchase order model a distinct, source-backed body', async () => {
    const renderModel = async (category: DocumentPdfCategory, templateId: string) => {
      const model = (DocumentPdfService as any)['buildSampleModel'](
        category,
        templateId,
        { name: 'Order Model Test Org', base_currency: 'INR' },
        {}
      );
      return (await parsePdf(await (DocumentPdfService as any)['render'](model) as Buffer)).text.replace(/\s+/g, ' ');
    };

    const confirmation = await renderModel('sales-orders', 'confirmation');
    const commercialOrder = await renderModel('sales-orders', 'commercial');
    const fulfillment = await renderModel('sales-orders', 'fulfillment');
    expect(confirmation).toContain('ORDER CONFIRMATION');
    expect(confirmation).toContain('SO-SAMPLE-0189');
    expect(confirmation).toContain('Zenith Retail & Logistics Ltd');
    expect(commercialOrder).toContain('COMMERCIAL ORDER SUMMARY');
    expect(commercialOrder).toContain('INR 1,77,000.00');
    expect(commercialOrder).toContain('Dispatch scheduled via BlueDart Logistics');
    expect(fulfillment).toContain('ORDERED ITEMS & DELIVERY PLAN');
    expect(fulfillment).toContain('Ordered lines');
    expect(fulfillment).toContain('Central Distribution Center, Mumbai');

    const standardPo = await renderModel('purchase-orders', 'standard-po');
    const contractPo = await renderModel('purchase-orders', 'contract-po');
    const requisition = await renderModel('purchase-orders', 'requisition');
    expect(standardPo).toContain('PURCHASE ORDER SUMMARY');
    expect(standardPo).toContain('Global Microchips & Hardware Components Ltd');
    expect(contractPo).toContain('PROCUREMENT COMMERCIAL TERMS');
    expect(contractPo).toContain('Net 45 days after verified receipt');
    expect(requisition).toContain('PURCHASE ITEMS SUMMARY');
    expect(requisition).toContain('Order line items');
    expect(requisition).toContain('FirmBooks Technology Campus, Whitefield, Bengaluru');
    expect(new Set([confirmation, commercialOrder, fulfillment]).size).toBe(3);
    expect(new Set([standardPo, contractPo, requisition]).size).toBe(3);
  });
  it('keeps compact order summaries inside A6 landscape pages with long source values', async () => {
    for (const [category, templateId] of [
      ['sales-orders', 'fulfillment'],
      ['purchase-orders', 'requisition'],
    ] as const) {
      const model = (DocumentPdfService as any)['buildSampleModel'](
        category,
        templateId,
        { name: 'Order Model Test Org', base_currency: 'INR' },
        { paperSize: 'A6', orientation: 'landscape' }
      );
      const longValue = `${'Extended Organization or Destination '.repeat(8)}END-OF-FACT`;
      model.partyName = longValue;
      model.partyDetails = [`Delivery Destination: ${longValue}`];
      model.notes = `Full terms remain visible below the summary. ${'Long delivery terms detail. '.repeat(16)}`;
      const pdf = await (DocumentPdfService as any)['render'](model) as Buffer;
      const parsed = await parsePdf(pdf);
      const positions = await readPdfTextPositions(pdf);
      expect(parsed.text).toContain('END-OF-FACT');
      expect(parsed.text).toContain('Full terms remain visible below the summary.');
      for (const page of positions) {
        for (const item of page) {
          expect(item.x).toBeGreaterThanOrEqual(-0.5);
          expect(item.x + item.width, `${templateId}/landscape: ${item.text}`).toBeLessThanOrEqual(item.pageWidth + 1);
          expect(item.baselineY).toBeGreaterThanOrEqual(-0.5);
          expect(item.baselineY).toBeLessThanOrEqual(item.pageHeight + 1);
        }
      }
    }
  });
  it('renders all registered model IDs in read-only sample previews', async () => {
    const invoiceCountBefore = await db.query('SELECT COUNT(*) AS c FROM invoices');
    const journalCountBefore = await db.query('SELECT COUNT(*) AS c FROM journal_entries');
    const bodyMarkers: Record<string, string> = {
      proposal: 'QUOTE OVERVIEW',
      commercial: 'COMMERCIAL OFFER',
      compact: 'QUICK QUOTE',
      dispatch: 'DELIVERY CHALLAN OVERVIEW',
      jobwork: 'CHALLAN ITEM SUMMARY',
      'tax-invoice': 'TAX INVOICE TOTALS',
      'ledger-invoice': 'INVOICE LEDGER OVERVIEW',
      'commercial-order': 'COMMERCIAL ORDER SUMMARY',
    };
    for (const registered of ALL_44_TEMPLATE_MODELS) {
      const category = registered.category as DocumentPdfCategory;
      const model = (DocumentPdfService as any)['buildSampleModel'](
        category,
        registered.modelId,
        { name: 'All Models Acceptance Org', base_currency: 'INR' },
        {},
        { modelId: registered.modelId, layoutFamily: registered.layoutFamily }
      );
      const pdf = await (DocumentPdfService as any)['render'](model) as Buffer;
      const parsed = await parsePdf(pdf);
      expect(pdf.toString('binary', 0, 8), `${category}/${registered.modelId}`).toMatch(/^%PDF-1\./);
      expect(parsed.text, `${category}/${registered.modelId}`).toContain('SAMPLE PREVIEW');
      expect(parsed.text, `${category}/${registered.modelId}`).toContain(model.number);
      const marker = category === 'sales-orders' && registered.modelId === 'commercial'
        ? bodyMarkers['commercial-order']
        : bodyMarkers[registered.modelId];
      if (marker) expect(parsed.text, `${category}/${registered.modelId}`).toContain(marker);
    }
    expect((await db.query('SELECT COUNT(*) AS c FROM invoices')).rows[0].c).toBe(invoiceCountBefore.rows[0].c);
    expect((await db.query('SELECT COUNT(*) AS c FROM journal_entries')).rows[0].c).toBe(journalCountBefore.rows[0].c);
  });
  it('uses distinct quote, challan, and invoice bodies with source facts on small pages', async () => {
    const variants = [
      ['quotes', 'proposal', 'QUOTE OVERVIEW', 'PROPOSED ITEMS & SERVICES'],
      ['quotes', 'commercial', 'COMMERCIAL OFFER', 'COMMERCIAL QUOTE LINES'],
      ['quotes', 'compact', 'QUICK QUOTE', 'QUICK QUOTE ITEMS'],
      ['delivery-challans', 'dispatch', 'DELIVERY CHALLAN OVERVIEW', 'DELIVERY ITEMS'],
      ['delivery-challans', 'jobwork', 'CHALLAN ITEM SUMMARY', 'CHALLAN MATERIAL LINES'],
      ['invoices', 'tax-invoice', 'TAX INVOICE TOTALS', 'TAX INVOICE ITEMS'],
      ['invoices', 'ledger-invoice', 'INVOICE LEDGER OVERVIEW', 'INVOICE LEDGER ENTRIES'],
    ] as const;
    const renderSample = async (category: DocumentPdfCategory, templateId: string, config: Record<string, any> = {}) => {
      const registered = ALL_44_TEMPLATE_MODELS.find((template) => template.category === category && template.modelId === templateId);
      const model = (DocumentPdfService as any)['buildSampleModel'](
        category,
        templateId,
        { name: 'Variant Layout Test Org', base_currency: 'INR' },
        config,
        registered ? { modelId: registered.modelId, layoutFamily: registered.layoutFamily } : null
      );
      return { model, pdf: await (DocumentPdfService as any)['render'](model) as Buffer };
    };
    const variantsText: string[] = [];
    for (const [category, templateId, summaryMarker, tableMarker] of variants) {
      const { model, pdf } = await renderSample(category, templateId);
      const parsed = await parsePdf(pdf);
      variantsText.push(parsed.text);
      expect(parsed.text).toContain(summaryMarker);
      expect(parsed.text).toContain(tableMarker);
      expect(parsed.text).toContain(model.number);

      for (const orientation of ['portrait', 'landscape'] as const) {
        const longModel = (DocumentPdfService as any)['buildSampleModel'](
          category,
          templateId,
          { name: 'Variant Layout Test Org', base_currency: 'INR' },
          { paperSize: 'A6', orientation },
          ALL_44_TEMPLATE_MODELS.find((registered) => registered.category === category && registered.modelId === templateId)
            ? { modelId: templateId, layoutFamily: ALL_44_TEMPLATE_MODELS.find((registered) => registered.category === category && registered.modelId === templateId)!.layoutFamily }
            : null
        );
        const marker = `LONG-ITEM-${templateId}-END`;
        const partyMarker = 'PARTY-END';
        longModel.partyName = `${'Extended Counterparty Name '.repeat(10)}${partyMarker}`;
        longModel.lines = [{
          description: `${'Long source description '.repeat(4)}${marker}`,
          hsnSac: '998314', packages: 'PKG-A6-412', quantity: 18, rate: 1250, amount: 22500,
        }];
        longModel.subtotal = 22500;
        longModel.tax = 4050;
        longModel.discount = 0;
        longModel.total = 26550;
        longModel.balance = 26550;
        longModel.notes = `Full note detail ${'Long terms detail '.repeat(24)}END-NOTES-${templateId}`;
        const longPdf = await (DocumentPdfService as any)['render'](longModel) as Buffer;
        const longText = (await parsePdf(longPdf)).text;
        const pages = await readPdfTextPositions(longPdf);
        expect(longText.replace(/\s+/g, '')).toContain(marker);
        const extractedParty = pages.flat().map((item) => item.text).join('').replace(/SAMPLE\s*PREVIEW\s*NOT\s*AN\s*ISSUED/gi, '').replace(/\s+/g, '');
        expect(extractedParty).toContain(partyMarker);
        expect(longText).toContain(`END-NOTES-${templateId}`);
        expect(longText).toContain('INR 26,550.00');
        for (const [pageIndex, page] of pages.entries()) for (const item of page) {
          expect(item.x).toBeGreaterThanOrEqual(-0.5);
          expect(item.x + item.width).toBeLessThanOrEqual(item.pageWidth + 1);
          expect(item.baselineY, `${category}/${templateId}/${orientation}/page ${pageIndex + 1}: ${item.text}`).toBeGreaterThanOrEqual(-0.5);
          expect(item.baselineY, `${category}/${templateId}/${orientation}/page ${pageIndex + 1}: ${item.text}`).toBeLessThanOrEqual(item.pageHeight + 1);
        }
      }
    }
    const multiPageQuote = (DocumentPdfService as any)['buildSampleModel'](
      'quotes',
      'commercial',
      { name: 'Variant Layout Test Org', base_currency: 'INR' },
      { paperSize: 'A6', orientation: 'landscape' },
      { modelId: 'commercial', layoutFamily: 'standard' }
    );
    const commercialDescriptionEnd = 'COMMERCIAL-DESCRIPTION-END-MARKER';
    multiPageQuote.lines = [{
      description: `${'Long commercial line detail '.repeat(90)}${commercialDescriptionEnd}`,
      hsnSac: 'HSN-CONTINUATION-998314', quantity: 18, rate: 1250, amount: 22500,
    }];
    const multiPageQuotePdf = await (DocumentPdfService as any)['render'](multiPageQuote) as Buffer;
    const multiPageQuoteParsed = await parsePdf(multiPageQuotePdf);
    const normalizedMultiPageQuoteText = multiPageQuoteParsed.text.replace(/\s+/g, '');
    expect(multiPageQuoteParsed.numpages).toBeGreaterThan(1);
    expect(normalizedMultiPageQuoteText).toContain('HSN-CONTINUATION-998314');
    expect(normalizedMultiPageQuoteText).toContain(commercialDescriptionEnd);

    expect(new Set(variantsText.slice(0, 3)).size).toBe(3);
    expect(new Set(variantsText.slice(3, 5)).size).toBe(2);
    expect(new Set(variantsText.slice(5, 7)).size).toBe(2);

    const quoteHidden = await renderSample('quotes', 'commercial', { showTaxBreakdown: false, showDiscount: false, showScopeOfWork: false });
    const quoteHiddenText = (await parsePdf(quoteHidden.pdf)).text;
    expect(quoteHiddenText).not.toContain('Tax\n');
    expect(quoteHiddenText).not.toContain('Discount');
    expect(quoteHiddenText).not.toContain('Scope, pricing, and delivery details');
    const quoteExpiryHidden = await renderSample('quotes', 'proposal', { showExpiryDate: false });
    expect((await parsePdf(quoteExpiryHidden.pdf)).text).not.toContain('Valid through');
    const challanHidden = await renderSample('delivery-challans', 'dispatch', { hideRatesInChallan: true, showPackageDetails: false, showReceiverAck: false });
    const challanHiddenText = (await parsePdf(challanHidden.pdf)).text;
    expect(challanHiddenText).not.toContain('Packages');
    expect(challanHiddenText).not.toContain('Rate');
    expect(challanHiddenText).not.toContain('Consignee Signature & Date');
    const invoiceHidden = await renderSample('invoices', 'tax-invoice', { showTaxBreakdown: false, showHsnSac: false });
    const invoiceHiddenText = (await parsePdf(invoiceHidden.pdf)).text;
    expect(invoiceHiddenText).not.toContain('HSN/SAC');
    expect(invoiceHiddenText).not.toMatch(/\bTax total\b/);
  });
  it('renders quote, challan, and invoice template variants from persisted source records', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-variant-client-${suffix}`;
    const estimateId = `pdf-variant-estimate-${suffix}`;
    const challanId = `pdf-variant-challan-${suffix}`;
    const invoiceId = `pdf-variant-invoice-${suffix}`;
    const lines = JSON.stringify([{ description: `LIVE-VARIANT-LINE-${suffix}`, hsnSac: '998314', packages: 'LIVE-PACK-3', quantity: 3, unitPrice: 200, amount: 600 }]);
    await db.query(`INSERT INTO clients (id, organization_id, name, company_name, currency) VALUES ($1, $2, $3, $3, 'INR')`, [clientId, orgIdA, `Live Variant Customer ${suffix}`]);
    await db.query(
      `INSERT INTO estimates (id, organization_id, estimate_number, client_id, client_name, issue_date, expiry_date, subtotal, tax_total, discount, total_amount, line_items)
       VALUES ($1, $2, $3, $4, $5, '2026-09-10', '2026-10-10', 600, 108, 0, 708, $6)`,
      [estimateId, orgIdA, `EST-VARIANT-${suffix}`, clientId, `Live Variant Customer ${suffix}`, lines]
    );
    await db.query(
      `INSERT INTO delivery_challans (id, organization_id, challan_number, customer_id, customer_name, delivery_date, status, line_items)
       VALUES ($1, $2, $3, $4, $5, '2026-09-11', 'DRAFT', $6)`,
      [challanId, orgIdA, `DC-VARIANT-${suffix}`, clientId, `Live Variant Customer ${suffix}`, lines]
    );
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status, line_items)
       VALUES ($1, $2, $3, $4, $5, '2026-09-12', '2026-10-12', 600, 108, 708, 708, 'SENT', $6)`,
      [invoiceId, orgIdA, `INV-VARIANT-${suffix}`, clientId, `Live Variant Customer ${suffix}`, lines]
    );
    const liveVariants = [
      ['quotes', estimateId, 'proposal', 'QUOTE OVERVIEW'],
      ['quotes', estimateId, 'commercial', 'COMMERCIAL OFFER'],
      ['quotes', estimateId, 'compact', 'QUICK QUOTE'],
      ['delivery-challans', challanId, 'dispatch', 'DELIVERY CHALLAN OVERVIEW'],
      ['delivery-challans', challanId, 'jobwork', 'CHALLAN ITEM SUMMARY'],
      ['invoices', invoiceId, 'tax-invoice', 'TAX INVOICE TOTALS'],
      ['invoices', invoiceId, 'ledger-invoice', 'INVOICE LEDGER OVERVIEW'],
    ] as const;
    for (const [category, documentId, templateId, marker] of liveVariants) {
      const model = await (DocumentPdfService as any)['buildModel'](db, orgIdA, category, documentId, templateId, {});
      const parsed = await parsePdf(await (DocumentPdfService as any)['render'](model) as Buffer);
      expect(parsed.text, `${category}/${templateId}`).toContain(marker);
      expect(parsed.text.replace(/\s+/g, ''), `${category}/${templateId}`).toContain(`LIVE-VARIANT-LINE-${suffix}`);
    }
  });
  it('renders distinct bill and vendor-credit bodies from supported source facts', async () => {
    const renderModel = async (category: DocumentPdfCategory, templateId: string, paperSize = 'A4', orientation = 'portrait') => {
      const model = (DocumentPdfService as any)['buildSampleModel'](
        category,
        templateId,
        { name: 'Payables Model Test Org', base_currency: 'INR' },
        { paperSize, orientation }
      );
      const pdf = await (DocumentPdfService as any)['render'](model) as Buffer;
      return { text: (await parsePdf(pdf)).text.replace(/\s+/g, ' '), positions: await readPdfTextPositions(pdf) };
    };

    const billItc = await renderModel('bills', 'bill-itc');
    const accrualVoucher = await renderModel('bills', 'accrual-voucher');
    const matching = await renderModel('bills', 'matching');
    expect(billItc.text).toContain('VENDOR BILL & TAX DETAILS');
    expect(billItc.text).toContain('AWS-IN-9812491');
    expect(billItc.text).not.toContain('ELIGIBLE');
    expect(accrualVoucher.text).toContain('BILL RECORD SUMMARY');
    expect(accrualVoucher.text).toContain('Recorded total');
    expect(matching.text).toContain('BILL REFERENCE DETAILS');
    expect(matching.text).toContain('Bill line items');
    expect(matching.text).not.toContain('Three-Way Match');

    const debitNote = await renderModel('vendor-credits', 'debit-note');
    const purchaseReturn = await renderModel('vendor-credits', 'purchase-return');
    const adjustmentMemo = await renderModel('vendor-credits', 'adjustment-memo');
    expect(debitNote.text).toContain('VENDOR CREDIT DETAILS');
    expect(debitNote.text).toContain('Moisture damage in received goods');
    expect(purchaseReturn.text).toContain('VENDOR CREDIT LINE SUMMARY');
    expect(purchaseReturn.text).toContain('Credit line items');
    expect(purchaseReturn.text).not.toContain('Goods returned');
    expect(adjustmentMemo.text).toContain('VENDOR CREDIT AMOUNT SUMMARY');
    expect(adjustmentMemo.text).toContain('Recorded amount');
    expect(adjustmentMemo.text).not.toContain('Approved');
    expect(new Set([billItc.text, accrualVoucher.text, matching.text]).size).toBe(3);
    expect(new Set([debitNote.text, purchaseReturn.text, adjustmentMemo.text]).size).toBe(3);

    const itcHidden = (DocumentPdfService as any)['buildSampleModel']('bills', 'bill-itc', { name: 'Payables Model Test Org', base_currency: 'INR' }, { showItcTag: false });
    const itcHiddenText = (await parsePdf(await (DocumentPdfService as any)['render'](itcHidden) as Buffer)).text;
    expect(itcHiddenText).not.toContain('Input Tax Credit (ITC):');
    expect(itcHiddenText).not.toContain('ITC information');

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const vendorId = `pdf-order-vendor-${suffix}`;
    const billId = `pdf-amount-bill-${suffix}`;
    const creditId = `pdf-reason-credit-${suffix}`;
    await db.query(`INSERT INTO vendors (id, organization_id, name, company_name, currency) VALUES ($1, $2, $3, $3, 'INR')`, [vendorId, orgIdA, 'Persisted Amount Vendor']);
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, vendor_invoice_number, bill_date, due_date, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, '2026-09-12', '2026-10-12', 1845, 'DRAFT')`,
      [billId, orgIdA, `BILL-TOTAL-${suffix}`, vendorId, 'Persisted Amount Vendor', `INV-SUPPLIER-${suffix}`]
    );
    await db.query(
      `INSERT INTO vendor_credits (id, organization_id, credit_number, vendor_id, vendor_name, date, total_amount, remaining_credit, status, reason)
       VALUES ($1, $2, $3, $4, $5, '2026-09-13', 320, 320, 'DRAFT', $6)`,
      [creditId, orgIdA, `VC-REASON-${suffix}`, vendorId, 'Persisted Amount Vendor', 'Persisted reason must stay hidden']
    );
    const liveBill = await (DocumentPdfService as any)['buildModel'](db, orgIdA, 'bills', billId, 'accrual-voucher', {});
    const liveBillText = (await parsePdf(await (DocumentPdfService as any)['render'](liveBill) as Buffer)).text;
    expect(liveBillText).toContain('BILL RECORD SUMMARY');
    expect(liveBillText).toContain('BILL-TOTAL-');
    expect(liveBillText).toContain('INR 1,845.00');
    expect(liveBillText).not.toContain('Subtotal');
    expect(liveBillText).not.toContain('Tax');

    const liveBillReference = await (DocumentPdfService as any)['buildModel'](db, orgIdA, 'bills', billId, 'bill-itc', {});
    liveBillReference.templateConfig.showVendorInvoiceRef = false;
    const liveBillHiddenText = (await parsePdf(await (DocumentPdfService as any)['render'](liveBillReference) as Buffer)).text;
    expect(liveBillHiddenText).not.toContain(`INV-SUPPLIER-${suffix}`);

    const referenceOnlyBillId = `pdf-ref-bill-${suffix}`;
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, '2026-09-14', '2026-10-14', 925, 'DRAFT')`,
      [referenceOnlyBillId, orgIdA, `BILL-REF-${suffix}`, vendorId, 'Persisted Amount Vendor']
    );
    const referenceOnlyBill = await (DocumentPdfService as any)['buildModel'](db, orgIdA, 'bills', referenceOnlyBillId, 'matching', {});
    // Bills do not have a reference column in this database version. Exercise
    // an optional generic source reference on the persisted bill render model.
    referenceOnlyBill.source.reference = `REF-ONLY-${suffix}`;
    referenceOnlyBill.partyDetails.push(`Reference: REF-ONLY-${suffix}`);
    referenceOnlyBill.templateConfig.showVendorInvoiceRef = false;
    const referenceOnlyBillText = (await parsePdf(await (DocumentPdfService as any)['render'](referenceOnlyBill) as Buffer)).text;
    expect(referenceOnlyBillText).toContain(`REF-ONLY-${suffix}`);
    expect(referenceOnlyBillText).not.toContain('Vendor invoice');

    const liveCredit = await (DocumentPdfService as any)['buildModel'](db, orgIdA, 'vendor-credits', creditId, 'debit-note', {});
    liveCredit.templateConfig.showDebitReason = false;
    const liveCreditHiddenText = (await parsePdf(await (DocumentPdfService as any)['render'](liveCredit) as Buffer)).text;
    expect(liveCreditHiddenText).not.toContain('Persisted reason must stay hidden');
    expect(liveCreditHiddenText).not.toContain('Reason');
    const creditDetailsHidden = (DocumentPdfService as any)['buildSampleModel']('vendor-credits', 'debit-note', { name: 'Payables Model Test Org', base_currency: 'INR' }, { showOriginalBillRef: false, showDebitReason: false });
    const creditDetailsHiddenText = (await parsePdf(await (DocumentPdfService as any)['render'](creditDetailsHidden) as Buffer)).text;
    expect(creditDetailsHiddenText).not.toContain('Original bill');
    expect(creditDetailsHiddenText).not.toContain('Reason');

    for (const [category, templateId] of [
      ['bills', 'bill-itc'],
      ['bills', 'accrual-voucher'],
      ['bills', 'matching'],
      ['vendor-credits', 'debit-note'],
      ['vendor-credits', 'purchase-return'],
      ['vendor-credits', 'adjustment-memo'],
    ] as const) {
      const { positions } = await renderModel(category, templateId, 'A6', 'landscape');
      for (const page of positions) {
        for (const item of page) {
          expect(item.x).toBeGreaterThanOrEqual(-0.5);
          expect(item.x + item.width).toBeLessThanOrEqual(item.pageWidth + 1);
          expect(item.baselineY).toBeGreaterThanOrEqual(-0.5);
          expect(item.baselineY).toBeLessThanOrEqual(item.pageHeight + 1);
        }
      }
    }
  });
  it('can hide statement running-balance columns without changing closing totals', async () => {
    const rendered = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'customer-statements', 'running-ledger', {
      showRunningBalance: false,
    });
    const parsed = await parsePdf(rendered.pdf);
    expect(parsed.text).not.toContain('Running Balance');
    expect(parsed.text).toContain('CLOSING BALANCE');
  });

  it.each([
    ['customer-statements', 'Opening Balance:'],
    ['vendor-statements', 'Opening Payables:'],
  ] as const)('applies statement period and opening-balance visibility to %s preview PDFs', async (category, openingLabel) => {
    const shown = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, category, 'ledger', {
      showStatementPeriod: true,
      showOpeningBalance: true,
    });
    const shownText = (await parsePdf(shown.pdf)).text;
    expect(shownText).toContain('Statement Period:');
    expect(shownText).toContain(openingLabel);


    const hidden = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, category, 'ledger', {
      showStatementPeriod: false,
      showOpeningBalance: false,
    });
    const hiddenText = (await parsePdf(hidden.pdf)).text;
    expect(hiddenText).not.toContain('Statement Period:');
    expect(hiddenText).not.toContain('2026-04-01 to 2026-09-24');
    const model = (DocumentPdfService as any)['buildSampleModel'](category, 'ledger', {}, {
      showStatementPeriod: false,
      showOpeningBalance: false,
      exportFileNamePattern: '%{DocumentNumber}',
    });
    expect(model.number).toContain('2026-04-01 to 2026-09-24');
    expect((DocumentPdfService as any)['buildFilename'](model, 'fallback.pdf')).toContain('2026-04-01-to-2026-09-24');
    expect(hiddenText).not.toContain(openingLabel);

  });
  it.each([
    ['delivery-challans', { showVehicleDetails: false, showTransportDetails: false, showEWayBill: false, showShippingAddress: false }, ['Vehicle #:', 'Transporter:', 'E-Way Bill', 'Delivery Address:']],
    ['payment-receipts', { showPaymentModeBadge: false, showUtrReference: false }, ['Payment Mode:', 'UTR Reference:']],
    ['purchase-orders', { showVendorGstin: false, showShippingAddress: false }, ['Vendor GSTIN:', 'Delivery Destination:']],
    ['bills', { showVendorInvoiceRef: false, showItcTag: false }, ['Vendor Invoice #:', 'Input Tax Credit (ITC):']],
    ['expenses', { showClaimantName: false, showReceiptsAttached: false }, ['Claimant:', 'Evidence:']],
    ['vendor-credits', { showOriginalBillRef: false, showDebitReason: false }, ['Original Vendor Bill #:', 'Debit Reason:']],
  ] as const)('hides configured %s party details in generated previews', async (category, config, hiddenLabels) => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, category, 'standard', config);
    const text = (await parsePdf(preview.pdf)).text;
    for (const label of hiddenLabels) expect(text).not.toContain(label);
  });
  it.each([
    ['quotes', { showExpiryDate: false, showClientAcceptance: false }, ['Due / Delivery', 'Customer Review Signature & Date']],
    ['sales-orders', { showPoNumber: false, showDeliveryDate: false }, ['Customer PO #:', 'Due / Delivery']],
    ['delivery-challans', { showReceiverAck: false }, ['Consignee Signature & Date']],
    ['journals', { showThreeTierSignatures: false, showDebitCreditTotals: false }, ['TOTAL DEBITS', 'TOTAL CREDITS', 'Prepared By', 'Checked By']],
  ] as const)('applies %s metadata and signature visibility settings', async (category, config, hiddenLabels) => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, category, category === 'journals' ? 'three-tier' : 'standard', config);
    const text = (await parsePdf(preview.pdf)).text;
    for (const label of hiddenLabels) expect(text).not.toContain(label);
  });
  it('renders purpose-built operational content for Delivery Challans (Transit & Consignee Ack)', async () => {
    const previewRes = await getPdfResponse(
      `/api/v1/finance/documents/delivery-challans/preview/pdf?templateId=standard`,
      authHeadersA
    );
    expect(previewRes.status).toBe(200);
    const parsed = await parsePdf(previewRes.body);
    expect(parsed.text).toContain('DELIVERY CHALLAN');
    expect(parsed.text).toContain('CONSIGNEE');
    expect(parsed.text).toContain('E-Way Bill');
    expect(parsed.text).toContain('Vehicle #');
    expect(parsed.text).toContain('Consignee Signature & Date');
  });

  it('renders the POS invoice as a receipt-style item, quantity, and amount table', async () => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'invoices', 'pos');
    const text = (await parsePdf(preview.pdf)).text;
    expect(text).toContain('RETAIL INVOICE');
    expect(text).toContain('Item');
    expect(text).toContain('Qty');
    expect(text).toContain('Amount');
    expect(text).not.toContain('HSN/SAC');
    expect(text).not.toMatch(/\bRate\b/);
    expect(text).toContain('Enterprise Financial Accounting & Banking Suite');
  });

  it('renders project-billable expenses with linked project recovery details and stored amounts', async () => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'expenses', 'project-billable');
    const text = (await parsePdf(preview.pdf)).text;
    expect(text).toContain('PROJECT BILLABLE EXPENSE');
    expect(text).toContain('Project: Year-End Controls Modernization');
    expect(text).toContain('Client: Nexus Global Software Solutions Ltd');
    expect(text).toContain('Billing status: Not yet invoiced');
    expect(text).toContain('Invoice reference: Not invoiced');
    expect(text).toContain('INR 24,500.00');
    expect(text).toContain('INR 29,400.00');
    expect(text).toContain('20%');
    const reimbursement = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'expenses', 'reimbursement');
    expect((await parsePdf(reimbursement.pdf)).text).not.toContain('PROJECT BILLABLE EXPENSE');
  });
  it('bounds maximum-length titles in all layouts on narrow paper without wrapping into adjacent header content', async () => {
    const model = (DocumentPdfService as any)['buildSampleModel']('expenses', 'project-billable', { name: 'Settings Test Org', base_currency: 'INR' }, {});
    model.title = ('RECOVERY TITLE ' + 'LONG ').padEnd(4000, 'X');
    model.templateConfig.paperSize = 'A6';
    const layoutWidths: Record<string, number> = { ledger: 132, standard: 121, compact: 111 };
    for (const layout of ['ledger', 'standard', 'compact']) {
      model.templateConfig.layoutFamily = layout;
      const pdf = await (DocumentPdfService as any)['render'](model) as Buffer;
      const positioned = (await readPdfTextPositions(pdf)).flat();
      const titleLine = positioned.find((item) => item.text.startsWith('RECOVERY TITLE'));
      expect(titleLine).toBeDefined();
      expect(titleLine!.text.endsWith('...')).toBe(true);
      expect(titleLine!.width).toBeLessThanOrEqual(layoutWidths[layout]);
      if (layout === 'ledger') {
        const formalRecordLine = positioned.find((item) => item.text.startsWith('FORMAL DOCUMENT RECORD:'));
        expect(formalRecordLine).toBeDefined();
        expect(formalRecordLine!.text.endsWith('...')).toBe(true);
        expect(formalRecordLine!.width).toBeLessThanOrEqual(111);
        expect(titleLine!.baselineY - formalRecordLine!.baselineY).toBeGreaterThan(12);
      }
    }
  });
  it('gives similarly grouped templates distinct PDF headers without changing their document facts', async () => {
    const cases = [
      { category: 'quotes', ordinary: 'proposal', distinctive: 'milestone-proposal', marker: 'CLIENT PROPOSAL' },
      { category: 'delivery-challans', ordinary: 'dispatch', distinctive: 'packing-list', marker: 'DISPATCH NOTE' },
      { category: 'invoices', ordinary: 'ledger-invoice', distinctive: 'export', marker: 'COMMERCIAL DOCUMENT' },
    ] as const;
    for (const variant of cases) {
      const ordinary = await parsePdf((await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, variant.category, variant.ordinary)).pdf);
      const distinctive = await parsePdf((await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, variant.category, variant.distinctive)).pdf);
      expect(distinctive.text).toContain(variant.marker);
      expect(ordinary.text).not.toContain(variant.marker);
      expect(distinctive.text).toContain('SAMPLE PREVIEW');
      expect(distinctive.numpages).toBeGreaterThan(0);
    }
  });
  it('keeps colored PDF panels readable for light and dark custom theme colors', () => {
    expect(contrastTextForFill('#ffffff')).toBe('#000000');
    expect(contrastTextForFill('#f8fafc')).toBe('#000000');
    expect(contrastTextForFill('#0f172a')).toBe('#ffffff');
    expect(contrastTextForFill('#000000')).toBe('#ffffff');
    expect(readableInkOnWhite('#ffffff')).toBe('#1e293b');
    expect(readableInkOnWhite('#f8fafc')).toBe('#1e293b');
    expect(readableInkOnWhite('#0f172a')).toBe('#0f172a');
  });
  it('renders compact tables, statement balances, and special references with light custom colors', async () => {
    const lightTheme = { primaryColor: '#ffffff', accentColor: '#ffffff' };
    const cases = [
      { category: 'invoices', templateId: 'pos', marker: 'Item' },
      { category: 'customer-statements', templateId: 'open-summary', marker: 'Closing Balance' },
      { category: 'quotes', templateId: 'milestone-proposal', marker: 'QUOTE REFERENCE' },
      { category: 'delivery-challans', templateId: 'packing-list', marker: 'DISPATCH NOTE' },
      { category: 'invoices', templateId: 'export', marker: 'INVOICE NUMBER' },
    ] as const;
    for (const { category, templateId, marker } of cases) {
      const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, category, templateId, lightTheme);
      expect(preview.pdf.subarray(0, 4).toString()).toBe('%PDF');
      expect((await parsePdf(preview.pdf)).text).toContain(marker);
    }
  });
  it('renders the goods-return sample from supported credit-note facts only', async () => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'credit-notes', 'goods-return');
    const text = (await parsePdf(preview.pdf)).text;
    expect(text).toContain('SALES RETURN CREDIT SUMMARY');
    expect(text).toContain('Return reason');
    expect(text).toContain('Credit note total');
    expect(text).toContain('Remaining credit');
    expect(text).toContain('APPLIED TO INVOICES');
    expect(text).toContain('No invoice applications');
    expect(text).not.toContain('Original invoice');
    expect(text).not.toContain('HSN/SAC');
    expect(text).not.toMatch(/\bQuantity\b|\bRate\b/);
    expect(text).not.toContain('Subtotal');
    expect(text).not.toContain('Balance Due');
  });

  it('keeps credit-note samples useful across variants and honors return-reason visibility', async () => {
    const variantTitles: Record<string, string> = {
      statutory: 'CREDIT NOTE',
      'goods-return': 'CREDIT NOTE',
      adjustment: 'CREDIT ADJUSTMENT MEMO',
    };
    const variantLayouts: Record<string, string> = { statutory: 'standard', 'goods-return': 'ledger', adjustment: 'compact' };
    for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
      const shownPreview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'credit-notes', templateId, { showReturnReason: true });
      const shown = (await parsePdf(shownPreview.pdf)).text;
      expect(shown).toContain('INR 18,000.00');
      expect(shown).toContain('Goods returned');
      expect(shown).toContain(templateId === 'adjustment' ? 'ADJUSTMENT REASON' : templateId === 'statutory' ? 'CREDIT REASON' : 'Return reason');
      expect(shown).toContain(variantTitles[templateId]);
      expect((DocumentPdfService as any)['layout'](templateId)).toBe(variantLayouts[templateId]);
      expect(shown).not.toMatch(/Industrial controller|Return freight|HSN\/SAC|\bQty\b|\bRate\b|\bTax\b|\bSubtotal\b|\bDiscount\b/);

      const hiddenPreview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'credit-notes', templateId, { showReturnReason: false });
      const hidden = (await parsePdf(hiddenPreview.pdf)).text;
      expect(hidden).not.toContain('Goods returned');
      expect(hidden).toContain('INR 18,000.00');
      expect(hidden).not.toContain('Reason');
    }
  });

  it('keeps statutory live PDFs aligned to supported credit-note facts without GL or application rows', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-credit-parity-client-${suffix}`;
    const noteId = `pdf-credit-parity-note-${suffix}`;
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'Parity Customer', 'Parity Customer Ltd', 'INR')`,
      [clientId, orgIdA]
    );
    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason)
       VALUES ($1, $2, $3, $4, 'Parity Customer Ltd', '2026-08-21', 18000, 12500, 'Open', 'Persisted return reason')`,
      [noteId, orgIdA, `CN-PARITY-${suffix}`, clientId]
    );
    const guardedClient = {
      query: (sql: string, params?: unknown[]) => {
        if (/credit_note_applications|journal_lines/i.test(sql)) throw new Error('Standard credit-note PDF queried ledger detail');
        return db.query(sql, params);
      },
    } as typeof db;
    const [sample, live] = await Promise.all([
      DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'credit-notes', 'statutory'),
      DocumentPdfService.generatePdf(guardedClient, orgIdA, 'credit-notes', noteId, 'statutory'),
    ]);
    const sampleText = (await parsePdf(sample.pdf)).text;
    const liveText = (await parsePdf(live.pdf)).text;
    for (const text of [sampleText, liveText]) {
      expect(text).toContain('CREDIT NOTE VALUE');
      expect(text).toContain('CREDIT REASON');
      expect(text).not.toMatch(/Industrial controller|Return freight|HSN\/SAC|\bQty\b|\bRate\b|\bTax\b|\bSubtotal\b|\bDiscount\b|Balance Due|Account Code & Name/);
    }
    expect(liveText).toContain('CN-PARITY-' + suffix);
    expect(liveText).toContain('Persisted return reason');
    expect(liveText).toContain('INR 18,000.00');
  });

  it('keeps long sales-return reasons and invoice applications inside A6 pages', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-return-a6-client-${suffix}`;
    const invoiceId = `pdf-return-a6-invoice-${suffix}`;
    const noteId = `pdf-return-a6-note-${suffix}`;
    const longReason = `LONG-RETURN-REASON-START ${'Packaging returned after inspection. '.repeat(90)} LONG-RETURN-REASON-END`;
    const invoiceNumber = `INV${'X'.repeat(61)}`;
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'A6 Return Customer', 'A6 Return Customer Ltd', 'INR')`,
      [clientId, orgIdA]
    );
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, 'A6 Return Customer Ltd', '2026-08-19', '2026-09-18', 10000, 10000, 'SENT')`,
      [invoiceId, orgIdA, invoiceNumber, clientId]
    );
    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason)
       VALUES ($1, $2, $3, $4, 'A6 Return Customer Ltd', '2026-08-20', 5000, 3800, 'Open', $5)`,
      [noteId, orgIdA, `CN-A6-${suffix}`, clientId, longReason]
    );
    for (let index = 0; index < 24; index += 1) {
      await db.query(
        `INSERT INTO credit_note_applications (id, organization_id, credit_note_id, invoice_id, amount_applied, applied_date, status)
         VALUES ($1, $2, $3, $4, 50, $5, 'POSTED')`,
        [`pdf-return-a6-application-${index}-${suffix}`, orgIdA, noteId, invoiceId, `2026-08-${String(20 + (index % 9)).padStart(2, '0')}`]
      );
    }
    const model = await (DocumentPdfService as any)['buildModel'](
      db, orgIdA, 'credit-notes', noteId, 'goods-return'
    );
    model.templateConfig.paperSize = 'A6';
    model.templateConfig.footerNote = 'A6 RETURN FOOTER MARKER';
    const pdf = await (DocumentPdfService as any)['render'](model) as Buffer;
    const parsed = await parsePdf(pdf);
    const pages = await readPdfTextPositions(pdf);

    expect(parsed.numpages).toBeGreaterThan(2);
    expect(parsed.text).toContain('LONG-RETURN-REASON-START');
    expect(parsed.text).toContain('LONG-RETURN-REASON-END');
    expect(parsed.text).toContain('SALES RETURN CREDIT SUMMARY');
    expect(parsed.text.match(/INR 50.00/g)?.length).toBe(24);
    expect(parsed.text.match(/Invoice/g)?.length).toBeGreaterThan(1);
    expect(model.notes).toBe('');
    expect(model.partyDetails.some((detail: string) => detail.includes('LONG-RETURN-REASON-START'))).toBe(false);
    expect(pages.flat().every((item) => item.x >= 0 && item.width >= 0 && item.x + item.width <= item.pageWidth + 1
      && item.baselineY > 0 && item.baselineY < item.pageHeight)).toBe(true);
    for (const page of pages) {
      const headers = page.filter((item) => item.text === 'Invoice');
      expect(headers.length).toBeLessThanOrEqual(1);
      const footerMarker = page.find((item) => item.text.includes('A6 RETURN FOOTER MARKER'));
      expect(footerMarker).toBeDefined();
      const body = page.filter((item) => item !== footerMarker && !/^Page \d+ of \d+$/.test(item.text) && item.text.trim());
      expect(Math.min(...body.map((item) => item.baselineY))).toBeGreaterThan(footerMarker!.baselineY + 8);
    }
    expect(pages.some((page) => page.some((item) => item.text.includes('INV')))).toBe(true);

    for (const templateId of ['statutory', 'adjustment']) {
      const variantModel = await (DocumentPdfService as any)['buildModel'](
        db, orgIdA, 'credit-notes', noteId, templateId
      );
      variantModel.templateConfig.paperSize = 'A6';
      variantModel.templateConfig.footerNote = 'A6 CREDIT FOOTER MARKER';
      const variantReason = `STARTXYZ ${'Adjustment reason carried over for audit review. '.repeat(90)} ENDXYZ`;
      variantModel.source.reason = variantReason;
      variantModel.returnCredit.reason = variantReason;
      variantModel.returnCredit.total = 9999999999999.99;
      variantModel.total = 9999999999999.99;
      const variantPdf = await (DocumentPdfService as any)['render'](variantModel) as Buffer;
      const variantParsed = await parsePdf(variantPdf);
      const variantPages = await readPdfTextPositions(variantPdf);

      expect(variantParsed.numpages).toBeGreaterThan(1);
      expect(variantParsed.text).toContain('STARTXYZ');
      expect(variantParsed.text).toContain('ENDXYZ');
      expect(variantParsed.text).toContain('INR 99,99,99,99,99,999.99');
      expect(variantParsed.text).toContain('A6 CREDIT FOOTER MARKER');
      expect(variantPages.flat().every((item) => item.x >= 0 && item.width >= 0 && item.x + item.width <= item.pageWidth + 1
        && item.baselineY > 0 && item.baselineY < item.pageHeight)).toBe(true);
      for (const [pageIndex, page] of variantPages.entries()) {
        const footerMarker = page.find((item) => item.text.includes('A6 CREDIT FOOTER MARKER'));
        expect(footerMarker).toBeDefined();
        const body = page.filter((item) => item !== footerMarker && !/^Page \d+ of \d+$/.test(item.text) && item.text.trim());
        if (body.length) {
          const lowest = body.reduce((a, b) => a.baselineY < b.baselineY ? a : b);
          expect(lowest.baselineY, `${templateId} page ${pageIndex + 1}: ${lowest.text}`).toBeGreaterThan(footerMarker!.baselineY + 8);
        }
      }
    }
  });

  it('renders posted credit-note applications and refund-adjusted stored credit without inventing an original invoice', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-return-client-${suffix}`;
    const noteId = `pdf-return-note-${suffix}`;
    const invoiceAId = `pdf-return-invoice-a-${suffix}`;
    const invoiceBId = `pdf-return-invoice-b-${suffix}`;
    const account = await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND (LOWER(type) IN ('bank', 'cash') OR (LOWER(type) = 'asset' AND LOWER(sub_type) IN ('bank', 'cash', 'cash & bank', 'cash and cash equivalents', 'checking', 'savings', 'digital wallet', 'undeposited funds', 'payment clearing'))) ORDER BY code LIMIT 1`,
      [orgIdA]
    );
    expect(account.rows).toHaveLength(1);
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'Return Customer', 'Return Customer Ltd', 'INR')`,
      [clientId, orgIdA]
    );
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-RETURN-A-${suffix}', $4, 'Return Customer Ltd', '2026-08-01', '2026-08-31', 2000, 2000, 'SENT'),
              ($3, $2, 'INV-RETURN-B-${suffix}', $4, 'Return Customer Ltd', '2026-08-02', '2026-09-01', 1000, 1000, 'SENT')`,
      [invoiceAId, orgIdA, invoiceBId, clientId]
    );
    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason)
       VALUES ($1, $2, $3, $4, 'Return Customer Ltd', '2026-08-03', 1500, 1500, 'Open', 'Returned damaged packaging')`,
      [noteId, orgIdA, `CN-RETURN-${suffix}`, clientId]
    );

    await SalesEngine.applyCreditNote(orgIdA, { creditNoteId: noteId, invoiceId: invoiceAId, amount: 250.25, appliedDate: '2026-08-04' }, userIdA);
    await SalesEngine.applyCreditNote(orgIdA, { creditNoteId: noteId, invoiceId: invoiceAId, amount: 149.75, appliedDate: '2026-08-05' }, userIdA);
    await SalesEngine.applyCreditNote(orgIdA, { creditNoteId: noteId, invoiceId: invoiceBId, amount: 100, appliedDate: '2026-08-06' }, userIdA);
    await SalesEngine.recordCustomerRefund(orgIdA, {
      creditNoteId: noteId,
      customerId: clientId,
      amount: 100,
      refundDate: '2026-08-07',
      paymentAccountId: account.rows[0].id,
      paymentMode: 'Bank Wire',
      reason: 'Partial refund of return credit',
    }, userIdA);

    await db.query(
      `INSERT INTO credit_note_applications (id, organization_id, credit_note_id, invoice_id, amount_applied, applied_date, status, reversed_at)
       VALUES ($1, $2, $3, $4, 700, '2026-08-08', 'REVERSED', '2026-08-09'),
              ($5, $2, $3, $4, 600, '2026-08-10', 'POSTED', '2026-08-11'),
              ($6, $2, $3, $4, 500, '2026-08-12', 'DRAFT', NULL)`,
      [`pdf-return-reversed-${suffix}`, orgIdA, noteId, invoiceBId, `pdf-return-stale-${suffix}`, `pdf-return-draft-${suffix}`]
    );

    const rendered = await DocumentPdfService.generatePdf(db, orgIdA, 'credit-notes', noteId, 'goods-return');
    const text = (await parsePdf(rendered.pdf)).text;
    expect(text).toContain('SALES RETURN CREDIT SUMMARY');
    expect(text).toContain('CN-RETURN-' + suffix);
    expect(text).toContain('Returned damaged packaging');
    expect(text).toContain('INR 1,500.00');
    expect(text).toContain('INR 900.00');
    expect(text).toContain('INV-RETURN-A-' + suffix);
    expect(text).toContain('INV-RETURN-B-' + suffix);
    expect(text).toContain('INR 250.25');
    expect(text).toContain('INR 149.75');
    expect(text).toContain('INR 100.00');
    expect(text.match(new RegExp(`INV-RETURN-A-${suffix}`, 'g'))).toHaveLength(2);
    expect(text).not.toContain('pdf-return-reversed-' + suffix);
    expect(text).not.toContain('pdf-return-stale-' + suffix);
    expect(text).not.toContain('pdf-return-draft-' + suffix);
    expect(text).not.toContain('Original invoice');
    expect(text).not.toContain('Subtotal');
    expect(text).not.toContain('Balance Due');
  });
  it('renders fully used and reversed sales-return credits from their canonical lifecycle states', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-return-life-client-${suffix}`;
    const invoiceId = `pdf-return-life-invoice-${suffix}`;
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'Lifecycle Return Customer', 'Lifecycle Return Customer Ltd', 'INR')`,
      [clientId, orgIdA]
    );
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, 'Lifecycle Return Customer Ltd', '2026-08-15', '2026-09-14', 1000, 1000, 'SENT')`,
      [invoiceId, orgIdA, `INV-RETURN-LIFE-${suffix}`, clientId]
    );
    const closed = await SalesEngine.createCreditNote(orgIdA, {
      customerId: clientId,
      customerName: 'Lifecycle Return Customer Ltd',
      amount: 200,
      issueDate: '2026-08-16',
      reason: 'Finalized customer return credit',
      autoApply: false,
    }, userIdA);
    const openIssued = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-open-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Initial sales return memo' });
    expect(openIssued.status).toBe(200);
    expect(openIssued.headers['x-document-pdf-artifact']).toBeTruthy();
    const openArtifact = await getPdfResponse(
      `/api/v1/finance/documents/credit-notes/artifacts/${openIssued.headers['x-document-pdf-artifact']}/pdf`, authHeadersA
    );
    expect(openArtifact.status).toBe(200);
    expect(openArtifact.body).toEqual(openIssued.body);
    expect((await parsePdf(openArtifact.body)).text).toContain('SALES RETURN CREDIT SUMMARY');
    const openRetry = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-open-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Initial sales return memo' });
    expect(openRetry.status).toBe(200);
    expect(openRetry.headers['x-document-pdf-artifact']).toBe(openIssued.headers['x-document-pdf-artifact']);
    expect(openRetry.body).toEqual(openIssued.body);
    const conflictingRetry = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-open-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Changed issuance reason' });
    expect(conflictingRetry.status).toBe(409);

    const rollbackKey = `pdf-return-audit-rollback-${suffix}`;
    const auditFailure = vi.spyOn(AuditTrailService, 'appendBatchInTransaction').mockRejectedValueOnce(new Error('forced audit failure'));
    try {
      await expect(DocumentPdfService.issuePdf(
        orgIdA, 'credit-notes', closed.creditNoteId, userIdA, rollbackKey, 'statutory',
      )).rejects.toThrow('forced audit failure');
    } finally {
      auditFailure.mockRestore();
    }
    const rolledBackArtifact = await db.query(
      'SELECT id FROM document_render_snapshots WHERE organization_id = $1 AND idempotency_key = $2',
      [orgIdA, rollbackKey]
    );
    const rolledBackAudit = await db.query(
      "SELECT id FROM audit_logs WHERE organization_id = $1 AND action = 'DOCUMENT_PDF_ISSUED' AND metadata::text LIKE $2",
      [orgIdA, `%${rollbackKey}%`]
    );
    expect(rolledBackArtifact.rows).toHaveLength(0);
    expect(rolledBackAudit.rows).toHaveLength(0);

    const draftId = `pdf-return-draft-issue-${suffix}`;
    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason)
       VALUES ($1, $2, $3, $4, 'Lifecycle Return Customer Ltd', '2026-08-16', 100, 100, 'Open', 'Missing posting journal')`,
      [draftId, orgIdA, `CN-DRAFT-ISSUE-${suffix}`, clientId]
    );
    for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
      const missingJournalIssue = await request(app).post(`/api/v1/finance/documents/credit-notes/${draftId}/pdf/issue`)
        .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-no-journal-${templateId}-${suffix}` })
        .send({ templateId });
      expect(missingJournalIssue.status).toBe(400);
    }

    const rogueTemplateId = `rogue-${suffix}`.slice(0, 32);
    await db.query(
      `INSERT INTO document_templates (id, organization_id, category, model_id, name, paper_size, orientation, layout_family, is_active, is_system)
       VALUES ($1, $2, 'credit-notes', $3, 'Unexpected credit memo layout', 'A4', 'portrait', 'standard', TRUE, FALSE)`,
      [`credit-notes-${rogueTemplateId}`.slice(0, 64), orgIdA, rogueTemplateId]
    );
    const rogueTemplateIssue = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-rogue-${suffix}` }).send({ templateId: rogueTemplateId });
    expect(rogueTemplateIssue.status).toBe(400);

    const linkedJournal = await db.query('SELECT journal_entry_id FROM credit_notes WHERE organization_id = $1 AND id = $2', [orgIdA, closed.creditNoteId]);
    const journalId = linkedJournal.rows[0]?.journal_entry_id;
    expect(journalId).toBeTruthy();

    const invalidSourceCases = [
      { key: 'zero', total: 0, remaining: 0, status: 'OPEN' },
      { key: 'negative', total: -25, remaining: 0, status: 'OPEN' },
      { key: 'negative-remaining', total: 100, remaining: -1, status: 'OPEN' },
      { key: 'remaining-over-total', total: 100, remaining: 101, status: 'OPEN' },
      { key: 'draft-status', total: 100, remaining: 100, status: 'DRAFT' },
    ];
    const invalidIssueKeys: string[] = [];
    for (const invalid of invalidSourceCases) {
      const invalidId = `pdf-return-invalid-${invalid.key}-${suffix}`;
      await db.query(
        `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason, journal_entry_id)
         VALUES ($1, $2, $3, $4, 'Lifecycle Return Customer Ltd', '2026-08-16', $5, $6, $7, 'Invalid issuance fixture', $8)`,
        [invalidId, orgIdA, `CN-INVALID-${invalid.key}-${suffix}`, clientId, invalid.total, invalid.remaining, invalid.status, journalId]
      );
      for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
        const idempotencyKey = `pdf-return-invalid-${invalid.key}-${templateId}-${suffix}`;
        invalidIssueKeys.push(idempotencyKey);
        const rejected = await request(app).post(`/api/v1/finance/documents/credit-notes/${invalidId}/pdf/issue`)
          .set({ ...authHeadersA, 'Idempotency-Key': idempotencyKey }).send({ templateId });
        expect(rejected.status).toBe(400);
      }
    }
    for (const idempotencyKey of invalidIssueKeys) {
      const artifact = await db.query(
        'SELECT id FROM document_render_snapshots WHERE organization_id = $1 AND idempotency_key = $2',
        [orgIdA, idempotencyKey]
      );
      expect(artifact.rows).toHaveLength(0);
    }

    const otherTenantClientId = `pdf-return-other-tenant-client-${suffix}`;
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'Foreign Return Customer', 'Foreign Return Customer Ltd', 'INR')`,
      [otherTenantClientId, orgIdB]
    );
    const foreignNote = await SalesEngine.createCreditNote(orgIdB, {
      customerId: otherTenantClientId,
      customerName: 'Foreign Return Customer Ltd',
      amount: 60,
      issueDate: '2026-08-16',
      reason: 'Foreign tenant journal scope fixture',
      autoApply: false,
    }, userIdA);
    const foreignJournal = await db.query('SELECT journal_entry_id FROM credit_notes WHERE organization_id = $1 AND id = $2', [orgIdB, foreignNote.creditNoteId]);
    const crossTenantNoteId = `pdf-return-cross-tenant-${suffix}`;
    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason, journal_entry_id)
       VALUES ($1, $2, $3, $4, 'Lifecycle Return Customer Ltd', '2026-08-16', 60, 60, 'OPEN', 'Cross-tenant journal fixture', $5)`,
      [crossTenantNoteId, orgIdA, `CN-CROSS-TENANT-${suffix}`, clientId, foreignJournal.rows[0].journal_entry_id]
    );
    for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
      const foreignJournalIssue = await request(app).post(`/api/v1/finance/documents/credit-notes/${crossTenantNoteId}/pdf/issue`)
        .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-foreign-journal-${templateId}-${suffix}` }).send({ templateId });
      expect(foreignJournalIssue.status).toBe(400);
    }

    const draftJournalId = `je_pdf_draft_${suffix}`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
       VALUES ($1, $2, $3, '2026-08-16', 'PDF test draft journal', 'DRAFT')`,
      [draftJournalId, orgIdA, `PDF-DRAFT-${suffix}`]
    );
    await db.query('UPDATE credit_notes SET journal_entry_id = $1 WHERE organization_id = $2 AND id = $3', [draftJournalId, orgIdA, closed.creditNoteId]);
    for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
      const unposted = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
        .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-unposted-${templateId}-${suffix}` }).send({ templateId });
      expect(unposted.status).toBe(400);
    }
    await db.query('UPDATE credit_notes SET journal_entry_id = $1 WHERE organization_id = $2 AND id = $3', [journalId, orgIdA, closed.creditNoteId]);

    const reversalProbe = await SalesEngine.createCreditNote(orgIdA, {
      customerId: clientId,
      customerName: 'Lifecycle Return Customer Ltd',
      amount: 75,
      issueDate: '2026-08-16',
      reason: 'Reversed journal issuance guard',
      autoApply: false,
    }, userIdA);
    const reversalProbeJournal = await db.query('SELECT journal_entry_id FROM credit_notes WHERE organization_id = $1 AND id = $2', [orgIdA, reversalProbe.creditNoteId]);
    await db.transaction(
      (tx) => FinancialDestructiveActionsService.reversePostedJournal(tx, orgIdA, reversalProbeJournal.rows[0].journal_entry_id, userIdA, 'PDF issuance reversal guard', 'credit note'),
      { organizationId: orgIdA }
    );
    for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
      const reversedJournal = await request(app).post(`/api/v1/finance/documents/credit-notes/${reversalProbe.creditNoteId}/pdf/issue`)
        .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-reversed-journal-${templateId}-${suffix}` }).send({ templateId });
      expect(reversedJournal.status).toBe(400);
    }

    const creditVariantPositions = new Map<string, Array<{ text: string; baselineY: number; x: number; width: number; pageWidth: number; pageHeight: number }>>();
    for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
      const issued = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
        .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-variant-${templateId}-${suffix}` })
        .send({ templateId });
      expect(issued.status).toBe(200);
      const artifactPdf = await getPdfResponse(
        `/api/v1/finance/documents/credit-notes/artifacts/${issued.headers['x-document-pdf-artifact']}/pdf`, authHeadersA
      );
      expect(artifactPdf.status).toBe(200);
      expect(artifactPdf.body).toEqual(issued.body);
      const variantText = (await parsePdf(issued.body)).text;
      const marker = templateId === 'goods-return' ? 'SALES RETURN CREDIT SUMMARY' : templateId === 'adjustment' ? 'CREDIT ADJUSTMENT SLIP' : 'CREDIT NOTE DETAILS';
      expect(variantText).toContain(marker);
      if (templateId === 'goods-return') {
        expect(variantText).toContain('APPLIED TO INVOICES');
        expect(variantText).toContain('Remaining credit');
      } else if (templateId === 'adjustment') {
        expect(variantText).toContain('ADJUSTMENT VALUE');
        expect(variantText).toContain('AVAILABLE CREDIT');
      } else {
        expect(variantText).toContain('CREDIT NOTE VALUE');
        expect(variantText).toContain('CREDIT REASON');
      }
      creditVariantPositions.set(templateId, (await readPdfTextPositions(issued.body)).flat());
      expect(variantText).not.toMatch(/HSN\/SAC|\bTax\b|\bSubtotal\b|\bDiscount\b|Account Code & Name/);
    }
    const statutoryValue = creditVariantPositions.get('statutory')!.find((item) => item.text.includes('CREDIT NOTE VALUE'))!;
    const returnLedger = creditVariantPositions.get('goods-return')!;
    const adjustmentValue = creditVariantPositions.get('adjustment')!.find((item) => item.text.includes('ADJUSTMENT VALUE'))!;
    expect(returnLedger.some((item) => item.text.includes('APPLIED TO INVOICES'))).toBe(true);
    expect(adjustmentValue.x).toBeGreaterThan(statutoryValue.x + 100);
    const defaultIssued = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-default-${suffix}` }).send({});
    expect(defaultIssued.status).toBe(200);
    expect((await parsePdf(defaultIssued.body)).text).toContain('CREDIT NOTE DETAILS');

    await SalesEngine.applyCreditNote(orgIdA, {
      creditNoteId: closed.creditNoteId,
      invoiceId,
      amount: 200,
      appliedDate: '2026-08-17',
    }, userIdA);
    const closedPdf = await DocumentPdfService.generatePdf(db, orgIdA, 'credit-notes', closed.creditNoteId, 'goods-return');
    const closedText = (await parsePdf(closedPdf.pdf)).text;
    expect(closedText).toContain('Remaining credit');
    expect(closedText).toContain('INR 0.00');
    expect(closedText).toContain(`INV-RETURN-LIFE-${suffix}`);
    const closedIssued = await request(app).post(`/api/v1/finance/documents/credit-notes/${closed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-closed-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Fully applied sales return memo' });
    expect(closedIssued.status).toBe(200);
    expect((await parsePdf(closedIssued.body)).text).toContain(`INV-RETURN-LIFE-${suffix}`);

    const partial = await SalesEngine.createCreditNote(orgIdA, {
      customerId: clientId,
      customerName: 'Lifecycle Return Customer Ltd',
      amount: 400,
      issueDate: '2026-08-17',
      reason: 'Partially applied sales return credit',
      autoApply: false,
    }, userIdA);
    await SalesEngine.applyCreditNote(orgIdA, {
      creditNoteId: partial.creditNoteId,
      invoiceId,
      amount: 100,
      appliedDate: '2026-08-18',
    }, userIdA);
    const cashAccount = await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND (LOWER(type) IN ('bank', 'cash') OR (LOWER(type) = 'asset' AND LOWER(sub_type) IN ('bank', 'cash', 'cash & bank', 'cash and cash equivalents', 'checking', 'savings', 'digital wallet', 'undeposited funds', 'payment clearing'))) ORDER BY code LIMIT 1`,
      [orgIdA]
    );
    const refund = await SalesEngine.recordCustomerRefund(orgIdA, {
      creditNoteId: partial.creditNoteId,
      customerId: clientId,
      amount: 100,
      refundDate: '2026-08-19',
      paymentAccountId: cashAccount.rows[0].id,
      paymentMode: 'Bank Wire',
      reason: 'Return-credit refund',
    }, userIdA);
    await FinancialDestructiveActionsService.reverseCustomerRefund(
      orgIdA, refund.refundId, userIdA, 'Restore credit for lifecycle issuance test'
    );
    const partialState = await db.query('SELECT status FROM credit_notes WHERE organization_id = $1 AND id = $2', [orgIdA, partial.creditNoteId]);
    expect(String(partialState.rows[0].status).toUpperCase()).toBe('PARTIALLY APPLIED');
    const partialIssued = await request(app).post(`/api/v1/finance/documents/credit-notes/${partial.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-partial-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Partially applied sales return memo' });
    expect(partialIssued.status).toBe(200);
    expect((await parsePdf(partialIssued.body)).text).toContain('INR 300.00');

    const foreignNoteId = `pdf-return-foreign-${suffix}`;
    const foreignClientId = `pdf-return-foreign-client-${suffix}`;
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'Foreign Return Customer', 'Foreign Return Customer Ltd', 'INR')`,
      [foreignClientId, orgIdB]
    );
    await db.query(
      `INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit, status, reason)
       VALUES ($1, $2, $3, $4, 'Foreign Return Customer Ltd', '2026-08-17', 100, 100, 'Open', 'Tenant isolation')`,
      [foreignNoteId, orgIdB, `CN-FOREIGN-${suffix}`, foreignClientId]
    );
    const foreignIssue = await request(app).post(`/api/v1/finance/documents/credit-notes/${foreignNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-foreign-${suffix}` })
      .send({ templateId: 'goods-return' });
    expect(foreignIssue.status).toBe(404);

    const reversed = await SalesEngine.createCreditNote(orgIdA, {
      customerId: clientId,
      customerName: 'Lifecycle Return Customer Ltd',
      amount: 150,
      issueDate: '2026-08-18',
      reason: 'Credit note issued in error',
      autoApply: false,
    }, userIdA);
    const preReversalIssued = await request(app).post(`/api/v1/finance/documents/credit-notes/${reversed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-prereverse-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Pre-reversal retained memo' });
    expect(preReversalIssued.status).toBe(200);
    await FinancialDestructiveActionsService.reverseCreditNote(
      orgIdA, reversed.creditNoteId, userIdA, 'Test reversal for PDF lifecycle coverage'
    );
    // Simulate a historical stale status while preserving authoritative reversal markers.
    await db.query('UPDATE credit_notes SET status = $1 WHERE organization_id = $2 AND id = $3', ['Open', orgIdA, reversed.creditNoteId]);
    const postReversalIssue = await request(app).post(`/api/v1/finance/documents/credit-notes/${reversed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-postreverse-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Must not issue reversed memo' });
    expect(postReversalIssue.status).toBe(400);
    for (const templateId of ['statutory', 'goods-return', 'adjustment']) {
      const reversedVariant = await request(app).post(`/api/v1/finance/documents/credit-notes/${reversed.creditNoteId}/pdf/issue`)
        .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-reversed-${templateId}-${suffix}` })
        .send({ templateId });
      expect(reversedVariant.status).toBe(400);
    }
    const historicalRetry = await request(app).post(`/api/v1/finance/documents/credit-notes/${reversed.creditNoteId}/pdf/issue`)
      .set({ ...authHeadersA, 'Idempotency-Key': `pdf-return-prereverse-${suffix}` })
      .send({ templateId: 'goods-return', reason: 'Pre-reversal retained memo' });
    expect(historicalRetry.status).toBe(200);
    expect(historicalRetry.headers['x-document-pdf-artifact']).toBe(preReversalIssued.headers['x-document-pdf-artifact']);
    expect(historicalRetry.body).toEqual(preReversalIssued.body);
    const retainedBeforeReversal = await getPdfResponse(
      `/api/v1/finance/documents/credit-notes/artifacts/${preReversalIssued.headers['x-document-pdf-artifact']}/pdf`, authHeadersA
    );
    expect(retainedBeforeReversal.status).toBe(200);
    expect(retainedBeforeReversal.body).toEqual(preReversalIssued.body);
    const querySpyClient = {
      query: (sql: string, params?: unknown[]) => {
        if (/credit_note_applications/i.test(sql)) throw new Error('Reversed credit note queried application rows');
        return db.query(sql, params);
      },
    } as typeof db;
    const reversedPdf = await DocumentPdfService.generatePdf(querySpyClient, orgIdA, 'credit-notes', reversed.creditNoteId, 'goods-return');
    const reversedText = (await parsePdf(reversedPdf.pdf)).text;
    expect(reversedText).toContain('REVERSED');
    expect(reversedText).toContain('Remaining credit');
    expect(reversedText).toContain('INR 0.00');
    expect(reversedText).toContain('No invoice applications');
    expect(reversedText).not.toContain('INV-RETURN-LIFE-' + suffix);

    const reversedJournalClient = {
      query: (sql: string, params?: unknown[]) => {
        if (/FROM journal_entries WHERE organization_id = \$1 AND id = \$2/i.test(sql)) {
          return Promise.resolve({ rows: [{ reversed_by_journal_id: 'simulated-reversal', reversal_of_journal_id: null, reversed_at: new Date() }], rowCount: 1 });
        }
        if (/credit_note_applications/i.test(sql)) throw new Error('Reversed journal queried credit-note applications');
        return db.query(sql, params);
      },
    } as typeof db;
    const reversedJournalPdf = await DocumentPdfService.generatePdf(reversedJournalClient, orgIdA, 'credit-notes', closed.creditNoteId, 'goods-return');
    const reversedJournalText = (await parsePdf(reversedJournalPdf.pdf)).text;
    expect(reversedJournalText).toContain('REVERSED');
    expect(reversedJournalText).toContain('INR 0.00');
    expect(reversedJournalText).toContain('No invoice applications');
  });
  it('renders persisted project-billable expense values from tenant-scoped records', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const projectId = `pdf-billable-project-${suffix}`;
    const expenseId = `pdf-billable-expense-${suffix}`;
    const account = await db.query('SELECT id FROM accounts WHERE organization_id = $1 ORDER BY code LIMIT 1', [orgIdA]);
    const clientId = `pdf-billable-client-${suffix}`;
    const invoiceId = `pdf-billable-invoice-${suffix}`;
    const clientName = 'Persisted Recovery Customer Master';
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, legal_name, currency)
       VALUES ($1, $2, $3, $3, 'INR')`,
      [clientId, orgIdA, clientName]
    );
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Active')`,
      [projectId, orgIdA, `PDF-${suffix}`, 'Persisted PDF Recovery Project', clientId, clientName]
    );
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id,
       date, amount, description, project_id, client_id, is_billable, markup_percentage, selling_price, is_billed)
       VALUES ($1, $2, $3, $4, $4, '2026-09-12', 1000, 'Persisted billable expense', $5, $6, TRUE, 25, 1250, FALSE)`,
      [expenseId, orgIdA, `EXP-${suffix}`, account.rows[0].id, projectId, clientId]
    );

    const rendered = await DocumentPdfService.generatePdf(db, orgIdA, 'expenses', expenseId, 'project-billable');
    const text = (await parsePdf(rendered.pdf)).text;
    expect(text).toContain('PROJECT BILLABLE EXPENSE');
    expect(text).toContain('Project: Persisted PDF Recovery Project');
    expect(text).toContain(`Client: ${clientName}`);
    expect(text).toContain('Billing status: Not yet invoiced');
    expect(text).toContain('Invoice reference: Not invoiced');
    expect(text).toContain('1,000.00');
    expect(text).toContain('1,250.00');
    expect(text).toContain('25%');

    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, '2026-09-12', '2026-10-12', 1250, 'DRAFT')`,
      [invoiceId, orgIdA, `INV-PENDING-${suffix}`, clientId, clientName]
    );
    await db.query('UPDATE expenses SET invoice_id = $1 WHERE organization_id = $2 AND id = $3', [invoiceId, orgIdA, expenseId]);
    const pendingPdf = await DocumentPdfService.generatePdf(db, orgIdA, 'expenses', expenseId, 'project-billable');
    const pendingText = (await parsePdf(pendingPdf.pdf)).text;
    expect(pendingText).toContain('Billing status: Invoice draft (not posted)');
    expect(pendingText).toContain(`Invoice reference: INV-PENDING-${suffix}`);

    await db.query('UPDATE invoices SET status = $1 WHERE organization_id = $2 AND id = $3', ['POSTED', orgIdA, invoiceId]);
    await db.query('UPDATE expenses SET is_billed = TRUE WHERE organization_id = $1 AND id = $2', [orgIdA, expenseId]);
    const postedPdf = await DocumentPdfService.generatePdf(db, orgIdA, 'expenses', expenseId, 'project-billable');
    const postedText = (await parsePdf(postedPdf.pdf)).text;
    expect(postedText).toContain('Billing status: Invoiced');
    expect(postedText).toContain(`Invoice reference: INV-PENDING-${suffix}`);

    const longProjectName = 'Long recovery project ' + 'project-name-segment '.repeat(9);
    const longClientName = 'Long recovery customer ' + 'customer-name-segment '.repeat(8);
    const longInvoiceNumber = `INV-LONG-${'REFERENCE'.repeat(5)}`;
    await db.query('UPDATE projects SET name = $1 WHERE organization_id = $2 AND id = $3', [longProjectName, orgIdA, projectId]);
    await db.query('UPDATE customers SET legal_name = $1 WHERE organization_id = $2 AND id = $3', [longClientName, orgIdA, clientId]);
    await db.query('UPDATE invoices SET invoice_number = $1 WHERE organization_id = $2 AND id = $3', [longInvoiceNumber, orgIdA, invoiceId]);
    const longPdf = await DocumentPdfService.generatePdf(db, orgIdA, 'expenses', expenseId, 'project-billable');
    const longText = (await parsePdf(longPdf.pdf)).text;
    expect(longText).toContain('PROJECT BILLABLE EXPENSE');
    expect(longText).toContain('Billing status: Invoiced');
    expect(longText).toContain('EXPENSE TOTAL');
    const positioned = (await readPdfTextPositions(longPdf.pdf)).flat();
    const billingStatusLine = positioned.find((item) => item.text.includes('Billing status:'));
    const totalLabelLine = positioned.find((item) => item.text.includes('EXPENSE TOTAL'));
    const recoveryTitleLine = positioned.find((item) => item.text === 'PROJECT EXPENSE RECOVERY VOUCHER');
    const formalRecordLine = positioned.find((item) => item.text.startsWith('FORMAL DOCUMENT RECORD:'));
    expect(billingStatusLine).toBeDefined();
    expect(totalLabelLine).toBeDefined();
    expect(recoveryTitleLine).toBeDefined();
    expect(formalRecordLine).toBeDefined();
    expect(recoveryTitleLine!.width).toBeLessThanOrEqual(310);
    expect(formalRecordLine!.width).toBeLessThanOrEqual(273);
    expect(recoveryTitleLine!.baselineY - formalRecordLine!.baselineY).toBeGreaterThan(12);
    const recoveredText = positioned.map((item) => item.text).join('').replace(/\s+/g, '');
    expect(recoveredText).toContain(longProjectName.replace(/\s+/g, ''));
    expect(recoveredText).toContain(longClientName.replace(/\s+/g, ''));
    expect(recoveredText).toContain(longInvoiceNumber);
    expect(Math.abs((totalLabelLine?.baselineY || 0) - (billingStatusLine?.baselineY || 0))).toBeGreaterThan(10);

    await db.query('UPDATE expenses SET selling_price = $1 WHERE organization_id = $2 AND id = $3', [9999999999999.99, orgIdA, expenseId]);
    const longAmountPdf = await DocumentPdfService.generatePdf(db, orgIdA, 'expenses', expenseId, 'project-billable');
    const longAmountText = (await parsePdf(longAmountPdf.pdf)).text;
    expect(longAmountText).toContain('INR 99,99,99,99,99,999.99');
  });
  it('resolves the clients master fallback for persisted billable expenses', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-client-master-${suffix}`;
    const expenseId = `pdf-client-expense-${suffix}`;
    const account = await db.query('SELECT id FROM accounts WHERE organization_id = $1 ORDER BY code LIMIT 1', [orgIdA]);
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, 'Client Display Name', 'Client Legal Company', 'INR')`,
      [clientId, orgIdA]
    );
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id,
       date, amount, description, client_id, is_billable, markup_percentage, selling_price)
       VALUES ($1, $2, $3, $4, $4, '2026-09-12', 400, 'Client master fallback', $5, TRUE, 0, 400)`,
      [expenseId, orgIdA, `EXP-CLIENT-${suffix}`, account.rows[0].id, clientId]
    );

    const rendered = await DocumentPdfService.generatePdf(db, orgIdA, 'expenses', expenseId, 'project-billable');
    const text = (await parsePdf(rendered.pdf)).text;
    expect(text).toContain('Client: Client Legal Company');
    expect(text).toContain('Billing status: Not yet invoiced');
    expect(text).toContain('STORED MARKUP');
    expect(text).toContain('0%');
  });
  it('does not disclose tenant-B project, customer, or invoice data in a tenant-A expense PDF', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const foreignCustomerId = `pdf-foreign-customer-${suffix}`;
    const foreignProjectId = `pdf-foreign-project-${suffix}`;
    const foreignInvoiceId = `pdf-foreign-invoice-${suffix}`;
    const expenseId = `pdf-isolated-expense-${suffix}`;
    const account = await db.query('SELECT id FROM accounts WHERE organization_id = $1 ORDER BY code LIMIT 1', [orgIdA]);
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, legal_name, currency)
       VALUES ($1, $2, 'TENANT-B SECRET CUSTOMER', 'TENANT-B SECRET CUSTOMER', 'INR')`,
      [foreignCustomerId, orgIdB]
    );
    await db.query(
      `INSERT INTO projects (id, organization_id, code, name, client_id, client_name)
       VALUES ($1, $2, $3, 'TENANT-B SECRET PROJECT', $4, 'TENANT-B SECRET CUSTOMER')`,
      [foreignProjectId, orgIdB, `FOREIGN-${suffix}`, foreignCustomerId]
    );
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, status)
       VALUES ($1, $2, 'TENANT-B-SECRET-INVOICE', $3, 'TENANT-B SECRET CUSTOMER', '2026-09-10', '2026-10-10', 900, 'DRAFT')`,
      [foreignInvoiceId, orgIdB, foreignCustomerId]
    );
    await db.query(
      `INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id,
       date, amount, description, project_id, client_id, is_billable, selling_price, invoice_id)
       VALUES ($1, $2, $3, $4, $4, '2026-09-12', 800, 'Tenant isolation PDF test', $5, $6, TRUE, 900, $7)`,
      [expenseId, orgIdA, `EXP-ISOLATED-${suffix}`, account.rows[0].id, foreignProjectId, foreignCustomerId, foreignInvoiceId]
    );

    const rendered = await DocumentPdfService.generatePdf(db, orgIdA, 'expenses', expenseId, 'project-billable');
    const text = (await parsePdf(rendered.pdf)).text;
    expect(text).toContain('Project: Not linked');
    expect(text).toContain('Client: Not assigned');
    expect(text).toContain('Billing status: Invoice link unavailable');
    expect(text).toContain('Invoice reference: Invoice reference unavailable');
    expect(text).not.toContain('TENANT-B SECRET');
    expect(text).not.toContain('TENANT-B-SECRET-INVOICE');
  });
  it('renders persisted cash receipt allocations and preserves an exact zero amount', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-receipt-client-${suffix}`;
    const invoiceId = `pdf-receipt-invoice-${suffix}`;
    const paymentId = `pdf-receipt-payment-${suffix}`;
    const account = await db.query('SELECT id FROM accounts WHERE organization_id = $1 ORDER BY code LIMIT 1', [orgIdA]);
    const clientName = 'Persisted Receipt Customer';
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, $3, $3, 'INR')`,
      [clientId, orgIdA, clientName]
    );
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, $5, '2026-09-10', '2026-10-10', 5000, 3765.44, 'SENT')`,
      [invoiceId, orgIdA, `INV-PDF-${suffix}`, clientId, clientName]
    );
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, reference, unallocated_amount, status)
       VALUES ($1, $2, $3, $4, $5, '2026-09-12', 1234.56, 'Bank', $6, 'UTR-PDF-RECEIPT', 0, 'DRAFT')`,
      [paymentId, orgIdA, `REC-PDF-${suffix}`, clientId, clientName, account.rows[0].id]
    );
    await db.query(
      `INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount)
       VALUES ($1, $2, $3, $4, 1234.56)`,
      [`pdf-receipt-allocation-${suffix}`, orgIdA, paymentId, invoiceId]
    );

    const rendered = await DocumentPdfService.generatePdf(db, orgIdA, 'payment-receipts', paymentId, 'cash-receipt');
    const text = (await parsePdf(rendered.pdf)).text;
    expect(text).toContain('INR 1,234.56');
    expect(text).toContain(`INV-PDF-${suffix}`);
    expect(text).toContain('INR 1,234.56');

    expect((DocumentPdfService as any).formatAmount(0, { base_currency: 'INR' })).toBe('INR 0.00');
  });
  it('renders cash receipt as an amount-forward receipt while preserving actual allocations', async () => {
    const standard = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'payment-receipts', 'receipt-voucher');
    const cash = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'payment-receipts', 'cash-receipt');
    const standardText = (await parsePdf(standard.pdf)).text;
    const cashText = (await parsePdf(cash.pdf)).text;
    expect(cashText).toContain('PAYMENT RECEIPT');
    expect(cashText).toContain('AMOUNT RECEIVED');
    expect(cashText).toContain('INR 1,25,000.00');
    expect(cashText).toContain('Amount in words:');
    expect(cashText).toContain('Payment Mode: NEFT / RTGS Wire Transfer');
    expect(cashText).toContain('UTR Reference:');
    expect(cashText).toContain('CMS904481023812');
    expect(cashText).toContain('INV-2026-1042');
    expect(cashText).toContain('INV-2026-1049');
    expect(cashText).not.toContain('Subtotal');
    expect(standardText).not.toContain('AMOUNT RECEIVED');
    expect(standardText).toContain('Subtotal');
    expect(standardText).toContain('Rupees One Lakh Twenty Five Thousand Only');
    expect(standardText).toContain('Payment Mode: NEFT / RTGS Wire Transfer');
    expect(standardText).toContain('UTR Reference:');
    expect(standardText).toContain('CMS904481023812');

    const noWords = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'payment-receipts', 'cash-receipt', { showAmountInWords: false });
    expect((await parsePdf(noWords.pdf)).text).not.toContain('Amount in words:');

    const allocationAdvice = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'payment-receipts', 'allocation-advice');
    const adviceText = (await parsePdf(allocationAdvice.pdf)).text;
    expect(adviceText).not.toContain('AMOUNT RECEIVED');
    expect(adviceText).toContain('INV-2026-1042');
    expect(adviceText).toContain('INR 1,25,000.00');
  });

  it('renders purpose-built cash & allocation layout for Payment Receipts', async () => {
    const previewRes = await getPdfResponse(
      `/api/v1/finance/documents/payment-receipts/preview/pdf?templateId=standard`,
      authHeadersA
    );
    expect(previewRes.status).toBe(200);
    const parsed = await parsePdf(previewRes.body);
    expect(parsed.text).toContain('PAYMENT RECEIPT');
    expect(parsed.text).toContain('PAID / RECEIVED');
    expect(parsed.text).toContain('Payment Mode');
    expect(parsed.text).toContain('Cashier / Authorized Signatory');
  });

  it.each([
    ['payment-receipts', { showInvoicesSettled: false }, ['Allocation:', 'INV-2026-1042', 'INV-2026-1049'], 'INR 1,25,000.00'],
    ['vendor-payments', { showBillsSettled: false }, ['Settlement for Vendor Bill', 'BILL-2026-0205', 'BILL-2026-0211'], 'INR 1,40,000.00'],
  ] as const)('hides settled source rows when %s settlement visibility is disabled', async (category, config, hiddenText, total) => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, category, 'standard', config);
    const text = (await parsePdf(preview.pdf)).text;
    for (const value of hiddenText) expect(text).not.toContain(value);
    expect(text).toContain(total);
  });
  it('renders purpose-built accounting journal vouchers with 3-tier signatures', async () => {
    const previewRes = await getPdfResponse(
      `/api/v1/finance/documents/journals/preview/pdf?templateId=three-tier`,
      authHeadersA
    );
    expect(previewRes.status).toBe(200);
    const parsed = await parsePdf(previewRes.body);
    expect(parsed.text).toContain('JOURNAL VOUCHER');
    expect(parsed.text).toContain('TOTAL DEBITS');
    expect(parsed.text).toContain('TOTAL CREDITS');
    expect(parsed.text).toContain('Prepared By');
    expect(parsed.text).toContain('Checked By');
    expect(parsed.text).toContain('Authorized By');
  });

  it('renders each live customer and vendor statement model from persisted transactions', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const clientId = `pdf-statement-client-${suffix}`;
    const vendorId = `pdf-statement-vendor-${suffix}`;
    const invoiceId = `pdf-statement-invoice-${suffix}`;
    const billId = `pdf-statement-bill-${suffix}`;
    const clientName = 'Live Statement Customer';
    const vendorName = 'Live Statement Supplier';
    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, $3, $3, 'INR')`,
      [clientId, orgIdA, clientName]
    );
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, currency)
       VALUES ($1, $2, $3, $3, 'INR')`,
      [vendorId, orgIdA, vendorName]
    );
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, $5, '2026-09-10', '2026-10-10', 2400, 2400, 'SENT')`,
      [invoiceId, orgIdA, `INV-LIVE-${suffix}`, clientId, clientName]
    );
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, total_amount, status)
       VALUES ($1, $2, $3, $4, $5, '2026-09-11', '2026-10-11', 1800, 'OVERDUE')`,
      [billId, orgIdA, `BILL-LIVE-${suffix}`, vendorId, vendorName]
    );

    const statementModels = [
      ['customer-statements', clientId, 'running-ledger', 'Running Balance', `INV-LIVE-${suffix}`, 'INR 2,400.00'],
      ['customer-statements', clientId, 'aging-statement', 'RECEIVABLES ACTIVITY SUMMARY', 'Invoices', 'INR 2,400.00'],
      ['customer-statements', clientId, 'open-summary', 'Closing Balance', 'Transactions', 'INR 2,400.00'],
      ['vendor-statements', vendorId, 'vendor-ledger', 'Running Balance', `BILL-LIVE-${suffix}`, 'INR 1,800.00'],
      ['vendor-statements', vendorId, 'payables-aging', 'PAYABLES ACTIVITY SUMMARY', 'Vendor bills', 'INR 1,800.00'],
      ['vendor-statements', vendorId, 'reconciliation', 'VENDOR BALANCE OVERVIEW', 'Transactions', 'INR 1,800.00'],
    ] as const;
    for (const [category, id, templateId, expected, sourceMarker, exactAmount] of statementModels) {
      const rendered = await DocumentPdfService.generatePdf(db, orgIdA, category, id, templateId, {
        fromDate: '2026-09-01', toDate: '2026-09-30', persistSnapshot: false,
      });
      const text = (await parsePdf(rendered.pdf)).text;
      expect(text, `${category}/${templateId}`).toContain(expected);
      expect(text, `${category}/${templateId}`).toContain(sourceMarker);
      expect(text, `${category}/${templateId}`).toContain(exactAmount);
    }
  });
  it('renders detailed statement ledgers and activity summaries without fabricated aging buckets', async () => {
    const previewRes = await getPdfResponse(
      `/api/v1/finance/documents/customer-statements/preview/pdf?templateId=aging-statement`,
      authHeadersA
    );
    expect(previewRes.status).toBe(200);
    const parsed = await parsePdf(previewRes.body);
    expect(parsed.text).toContain('RECEIVABLES ACTIVITY SUMMARY');
    expect(parsed.text).not.toContain('Running Balance');
    expect(parsed.text).toContain('CLOSING BALANCE');
    expect(parsed.text).toContain('Receivables Activity Summary');
    expect(parsed.text).toContain('Payments received');
    expect(parsed.text).not.toContain('1-30 Days');
  });

  // =========================================================================
  it('honors hidden opening balance in the compact statement overview', async () => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, 'customer-statements', 'open-summary', {
      showOpeningBalance: false,
    });
    const text = (await parsePdf(preview.pdf)).text;
    expect(text).not.toContain('Opening Balance');
    expect(text).toContain('Transactions');
    expect(text).toContain('Closing Balance');
  });
  it.each([
    ['customer-statements', 'running-ledger', 'Running Balance', 'Transaction / Reference'],
    ['customer-statements', 'aging-statement', 'Receivables Activity Summary', 'Invoices'],
    ['customer-statements', 'open-summary', 'Transactions', 'Closing Balance'],
    ['vendor-statements', 'vendor-ledger', 'Running Balance', 'Transaction / Reference'],
    ['vendor-statements', 'payables-aging', 'Payables Activity Summary', 'Vendor bills'],
    ['vendor-statements', 'reconciliation', 'VENDOR BALANCE OVERVIEW', 'Closing Balance'],
  ] as const)('renders the purpose-built %s / %s statement variant', async (category, templateId, primaryMarker, secondaryMarker) => {
    const preview = await DocumentPdfService.generateSamplePreviewPdf(db, orgIdA, category, templateId);
    expect(preview.templateId).toBe(templateId);
    const parsed = await parsePdf(preview.pdf);
    expect(parsed.text).toContain('SAMPLE PREVIEW');
    expect(parsed.text).toContain(primaryMarker);
    expect(parsed.text).toContain(secondaryMarker);
    expect(parsed.text).not.toContain('1-30 Days');
    expect(parsed.text).not.toContain('Total Overdue');
    expect(parsed.text).not.toContain('Due / Delivery');
  });
  // 4. MULTI-PAGE & LINE-ITEM CONTINUATION
  // =========================================================================
  it('handles multi-page documents (30+ items) with dynamic page numbering and repeating headers', async () => {
    // Create a customer
    const custRes = await request(app)
      .post('/api/v1/finance/customers')
      .set(authHeadersA)
      .send({
        displayName: 'Megacorp Infrastructure Corporation',
        email: 'billing@megacorp.com',
      });
    expect(custRes.status).toBe(201);
    const clientId = custRes.body.id;

    // Create an invoice with 35 items
    const longItems = Array.from({ length: 35 }, (_, idx) => ({
      description: `Industrial Server Component Module Batch #${idx + 1} with high reliability telemetry sensors`,
      quantity: 2,
      unitPrice: 1500 + idx * 10,
      taxRate: 18,
    }));

    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set(authHeadersA)
      .send({
        clientId,
        clientName: 'Megacorp Infrastructure Corporation',
        clientEmail: 'billing@megacorp.com',
        issueDate: '2026-09-15',
        dueDate: '2026-10-15',
        items: longItems,
      });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.invoice?.id || invRes.body.id;

    const pdfRes = await getPdfResponse(
      `/api/v1/finance/documents/invoices/${invoiceId}/pdf?templateId=standard`,
      authHeadersA
    );
    expect(pdfRes.status).toBe(200);

    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.body);
    const parsed = await parsePdf(buffer);

    // Multi-page verification
    expect(parsed.text).toContain('Page 1 of 2');
    expect(parsed.text).toContain('Page 2 of 2');
    expect(parsed.text).toContain('Industrial Server Component Module Batch #35');
  });

  // =========================================================================
  // 5. EDGE CASES: LONG NAMES, SPECIAL CHARS, TAX-EXEMPT & ZERO AMOUNTS
  // =========================================================================
  it('renders gracefully with long addresses, tax-exempt lines, and zero balance', async () => {
    const custRes = await request(app)
      .post('/api/v1/finance/customers')
      .set(authHeadersA)
      .send({
        displayName: 'A Very Long Enterprise Corporation Name With Special Legal Suffix Private Limited',
        email: 'long.contact@enterprise-worldwide.com',
      });
    expect(custRes.status).toBe(201);
    const clientId = custRes.body.id;

    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set(authHeadersA)
      .send({
        clientId,
        clientName: 'A Very Long Enterprise Corporation Name With Special Legal Suffix Private Limited',
        issueDate: '2026-09-20',
        dueDate: '2026-10-20',
        items: [
          { description: 'Tax-Exempt Educational Consulting Service', quantity: 1, unitPrice: 50000, taxRate: 0 },
          { description: 'Pro Bono Introductory Orientation', quantity: 1, unitPrice: 0, taxRate: 0 },
        ],
      });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.invoice?.id || invRes.body.id;

    const pdfRes = await getPdfResponse(
      `/api/v1/finance/documents/invoices/${invoiceId}/pdf`,
      authHeadersA
    );
    expect(pdfRes.status).toBe(200);
    const parsed = await parsePdf(pdfRes.body);
    expect(parsed.text).toContain('A Very Long Enterprise Corporation Name');
    expect(parsed.text).toContain('Tax-Exempt Educational Consulting Service');
  });

  // =========================================================================
  // 6. DEFAULT SETTINGS, RESTORE BUILT-IN & PERSISTENT IMMUTABILITY
  // =========================================================================
  it('manages category defaults, restores built-in defaults, and preserves historical issued documents', async () => {
    // 1. Change default template for Delivery Challans
    const changeRes = await request(app)
      .patch('/api/v1/finance/documents/delivery-challans/templates/dispatch/default')
      .set(authHeadersA);
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.template.modelId).toBe('dispatch');

    // Verify resolve reflects new default
    const resolvedRes = await request(app)
      .get('/api/v1/finance/documents/delivery-challans/templates')
      .set(authHeadersA);
    expect(resolvedRes.status).toBe(200);

    // 2. Restore built-in default
    const restoreRes = await request(app)
      .post('/api/v1/finance/documents/delivery-challans/templates/restore-default')
      .set(authHeadersA);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.template.modelId).toBe('dispatch');

    // 3. Reject invalid hex color in preview request
    const invalidColorRes = await request(app)
      .get('/api/v1/finance/documents/invoices/preview/pdf?primaryColor=invalid-not-hex')
      .set(authHeadersA);
    expect(invalidColorRes.status).toBe(400);
    expect(invalidColorRes.body.error).toContain('hex');
  });

  // =========================================================================
  // 7. TENANT ISOLATION
  // =========================================================================
  it('strictly isolates document PDF access between organizations', async () => {
    // Create an invoice in Org A
    const custA = await request(app)
      .post('/api/v1/finance/customers')
      .set(authHeadersA)
      .send({ displayName: 'Org A Exclusive Client', email: 'orga@client.com' });
    const invA = await request(app)
      .post('/api/v1/finance/invoices')
      .set(authHeadersA)
      .send({
        clientId: custA.body.id,
        clientName: 'Org A Exclusive Client',
        clientEmail: 'orga@client.com',
        issueDate: '2026-09-01',
        dueDate: '2026-10-01',
        items: [{ description: 'Confidential Strategic Advisory', quantity: 1, unitPrice: 200000, taxRate: 18 }],
      });
    expect(invA.status).toBe(201);
    const invoiceIdA = invA.body.invoice?.id || invA.body.id;
    expect(invoiceIdA).toBeDefined();

    // Org B attempts to access Org A's invoice PDF
    const crossOrgPdf = await request(app)
      .get(`/api/v1/finance/documents/invoices/${invoiceIdA}/pdf`)
      .set(authHeadersB);
    expect(crossOrgPdf.status).toBe(404);

    // Org B attempts to modify Org A's template defaults
    const crossOrgDefault = await request(app)
      .patch('/api/v1/finance/documents/invoices/templates/pos/default')
      .set(authHeadersB);
    expect(crossOrgDefault.status).toBe(200);

    // Verify Org A default remains standard
    const orgATemplates = await request(app)
      .get('/api/v1/finance/documents/invoices/templates')
      .set(authHeadersA);
    expect(orgATemplates.status).toBe(200);
  });
});
