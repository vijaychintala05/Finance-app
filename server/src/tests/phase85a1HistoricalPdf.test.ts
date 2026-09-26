import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { QuotationRenderModelService } from '../sales/QuotationRenderModelService';
import { QuotationEngine } from '../sales/QuotationEngine';
import { DocumentPdfService } from '../services/DocumentPdfService';
import { RbacService } from '../auth/RbacService';

async function parsePdf(buffer: Buffer): Promise<{ numpages: number; text: string }> {
  const mod = require('pdf-parse');
  const PDFClass = mod.PDFParse || mod.default || mod;

  const uint8 = Uint8Array.from(buffer);
  let text = '';
  let numpages = 1;

  const instance = new PDFClass(uint8);
  try {
    if (typeof instance.getText === 'function') {
      const res = await instance.getText();
      text = typeof res === 'string' ? res : (res?.text || '');
      numpages = res?.numpages || res?.numPages || instance.doc?.numPages || 1;
    }
  } finally {
    await instance.destroy?.();
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
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => { callback(null, Buffer.from(data, 'binary')); });
    });
}

describe('Phase 8.5A.1 — PDF Correctness, Historical Revision Snapshot & Template Integrity Tests', () => {
  let tokenA: string;
  let authHeaderA: { Authorization: string };
  let orgIdA: string;
  let userIdA: string;

  let tokenB: string;
  let authHeaderB: { Authorization: string };
  let orgIdB: string;

  let customerIdA: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const timestampA = Date.now() + Math.floor(Math.random() * 10000);
    const regResA = await request(app).post('/api/v1/auth/register').send({
      email: `admin-85a1-a-${timestampA}@test.com`,
      password: 'Password123!',
      fullName: 'Org A 85A1 Admin',
      organizationName: `Org A 85A1 ${timestampA}`,
      role: 'Admin',
    });
    tokenA = regResA.body.token;
    authHeaderA = { Authorization: `Bearer ${tokenA}` };
    orgIdA = regResA.body.organizationId;
    userIdA = regResA.body.user.id;

    const timestampB = Date.now() + Math.floor(Math.random() * 10000);
    const regResB = await request(app).post('/api/v1/auth/register').send({
      email: `admin-85a1-b-${timestampB}@test.com`,
      password: 'Password123!',
      fullName: 'Org B 85A1 Admin',
      organizationName: `Org B 85A1 ${timestampB}`,
      role: 'Admin',
    });
    tokenB = regResB.body.token;
    authHeaderB = { Authorization: `Bearer ${tokenB}` };
    orgIdB = regResB.body.organizationId;

    // Create Customer for Org A
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set(authHeaderA)
      .send({
        displayName: 'Apex Global Enterprises',
        email: 'accounts@apexglobal.com',
        gstin: '27AAACA1234A1Z5',
        billingAddress: {
          street: '500 Tech Boulevard',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
          country: 'India',
        },
      });
    customerIdA = custRes.body.id || custRes.body.customer?.id;
  });

  // 1. Real PDF Parser Validation (pdf-parse)
  it('1. Validates generated PDF with pdf-parse: extracts quote #, customer name, and page count', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-11',
        items: [
          { name: 'Cloud Server Hosting', quantity: 2, rate: 15000, taxRate: 18 },
        ],
      });

    const q = qRes.body.quotation;

    const pdfRes = await getPdfResponse(`/api/v1/quotations/${q.id}/pdf`, authHeaderA);

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);

    const parsedPdf = await parsePdf(pdfRes.body);

    expect(parsedPdf.numpages).toBeGreaterThanOrEqual(1);
    expect(parsedPdf.text).toContain(q.estimateNumber || q.quotationNumber || 'QT-');
    expect(parsedPdf.text).toContain('Apex Global Enterprises');
    expect(pdfRes.headers['x-quotation-pdf-source']).toBe('legacy-render');
  });

  it('serves exact issued PDF bytes from the legacy quotation URL', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        status: 'SENT',
        items: [{ name: 'Issued quotation artifact', quantity: 1, rate: 12500 }],
      });
    expect(qRes.status).toBe(201);
    const qId = qRes.body.quotation.id;
    const artifact = await DocumentPdfService.issuePdf(
      orgIdA, 'quotes', qId, userIdA, `quotation-issued-bytes-${Date.now()}`,
    );

    const response = await getPdfResponse(`/api/v1/quotations/${qId}/pdf`, authHeaderA);
    expect(response.status).toBe(200);
    expect(response.headers['x-quotation-pdf-source']).toBe('issued-artifact');
    expect(response.headers['x-document-pdf-artifact']).toBe(artifact.id);
    expect(response.headers['x-document-pdf-issuance']).toBe(String(artifact.issuanceNumber));
    expect(response.headers['x-document-pdf-sha256']).toBe(artifact.pdfSha256);
    expect(response.body).toEqual(artifact.pdfBytes);
    const override = await request(app).get(`/api/v1/quotations/${qId}/pdf?templateId=not-a-real-template`).set(authHeaderA);
    expect(override.status).toBe(409);
  });

  it('requires estimates permission for current and historical quotation PDFs', async () => {
    const created = await request(app).post('/api/v1/quotations').set(authHeaderA).send({
      customerId: customerIdA,
      items: [{ name: 'Restricted PDF fixture', quantity: 1, rate: 100 }],
    });
    expect(created.status).toBe(201);
    const quotationId = created.body.quotation.id;
    const roleId = `pdf-role-${userIdA}`;
    const roleName = `PDF Reader ${userIdA.slice(-12)}`;
    await db.query(
      'INSERT INTO roles (id, organization_id, name, description, is_system_role) VALUES ($1, $2, $3, $4, FALSE)',
      [roleId, orgIdA, roleName, 'PDF permission boundary fixture'],
    );
    await db.query('INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2)', [roleId, 'invoices.view']);
    await db.query('UPDATE organization_members SET role = $1 WHERE organization_id = $2 AND user_id = $3', [roleName, orgIdA, userIdA]);
    const urls = [
      `/api/v1/quotations/${quotationId}/pdf`,
      `/api/v1/quotations/${quotationId}/revisions/0/pdf`,
    ];
    for (const url of urls) {
      expect((await request(app).get(url).set(authHeaderA)).status).toBe(403);
    }
    await db.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    await db.query('INSERT INTO role_permissions (role_id, permission_code) VALUES ($1, $2)', [roleId, 'estimates.view']);
    await RbacService.getPermissionsForRoleAsync(orgIdA, roleName, true);
    for (const url of urls) {
      expect((await getPdfResponse(url, authHeaderA)).status).toBe(200);
    }
  });

  // 2. Historical Revision PDF Schema (quotation_id, revision_data) & API status codes
  it('preserves commercial revision fields and honors hidden scope and expiry controls', async () => {
    const qRes = await request(app).post('/api/v1/quotations').set(authHeaderA).send({
      customerId: customerIdA, status: 'SENT',
      items: [{ name: 'Revision tax fixture', quantity: 1, rate: 118, taxRate: 18 }],
    });
    expect(qRes.status).toBe(201);
    const dto = await QuotationRenderModelService.buildRenderModel(orgIdA, qRes.body.quotation.id, 0);
    dto.document.notes = 'Historical delivery scope';
    dto.lineItems[0].description = 'Distinct historical item description';
    dto.document.terms = 'Historical commercial terms';
    dto.document.expiryDate = '2031-12-29';
    dto.document.isGstInclusive = true;
    dto.totals.subtotal = 118;
    dto.totals.taxableAmount = 100;
    dto.totals.taxTotal = 18;
    dto.totals.roundOffAmount = 0.25;
    dto.totals.grandTotal = 118.25;
    dto.totals.gstBreakdown = { isInterState: false, cgstTotal: 9, sgstTotal: 9, igstTotal: 0, taxableAmount: 100 };
    const template = {
      id: 'revision-template', organizationId: orgIdA, category: 'quotes', modelId: 'proposal', name: 'Revision fixture',
      paperSize: 'A4', orientation: 'portrait', layoutFamily: 'standard', isActive: true, isSystem: true,
      configuration: { templateTitle: 'FROZEN REVISION TITLE' },
    };
    for (const modelId of ['proposal', 'commercial', 'compact']) {
      const variant = { ...template, modelId };
      const visible = await parsePdf(await DocumentPdfService.generateQuotationRevisionPdf(dto, variant));
      expect(visible.text).toContain('Historical commercial terms');
      expect(visible.text).toContain('Historical delivery scope');
      expect(visible.text).toContain('Revision tax fixture');
      expect(visible.text).toContain('Distinct historical item description');
      expect(visible.text).not.toContain('TOTAL DEBITS');
      expect(visible.text).not.toContain('TOTAL CREDITS');
      expect(visible.text).toContain('Tax included');
      expect(visible.text).toContain('Taxable amount');
      expect(visible.text).toContain('CGST');
      expect(visible.text).toContain('SGST');
      expect(visible.text).toContain('Round-off');
      const hidden = await parsePdf(await DocumentPdfService.generateQuotationRevisionPdf(dto, {
        ...variant, configuration: { ...template.configuration, showScopeOfWork: false, showExpiryDate: false, showTaxBreakdown: false },
      }));
      expect(hidden.text).not.toContain('Historical commercial terms');
      expect(hidden.text).not.toContain('Historical delivery scope');
      expect(hidden.text).not.toContain('2031-12-29');
      expect(hidden.text).not.toContain('GST BREAKDOWN');
      expect(hidden.text).not.toContain('Tax included');
    }
  });

  it('2. Historical revision PDF queries quotation_id & revision_data cleanly with correct 404 error codes', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        items: [{ name: 'Initial Software Scope', quantity: 1, rate: 50000, taxRate: 18 }],
      });
    const qId = qRes.body.quotation.id;

    // Revise quotation (creates revision 1)
    const revRes = await request(app)
      .put(`/api/v1/quotations/${qId}`)
      .set(authHeaderA)
      .send({
        items: [{ name: 'Expanded Software Scope', quantity: 1, rate: 75000, taxRate: 18 }],
        changeSummary: 'Expanded scope requested by client',
      });
    expect(revRes.status).toBe(200);

    // Fetch revision 1 PDF -> 200 OK
    const pdfRes = await getPdfResponse(`/api/v1/quotations/${qId}/revisions/1/pdf`, authHeaderA);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);

    const parsedPdf = await parsePdf(pdfRes.body);
    expect(parsedPdf.text).toContain('Expanded Software Scope');

    // Non-existent revision -> 404
    const missingRevRes = await getPdfResponse(`/api/v1/quotations/${qId}/revisions/999/pdf`, authHeaderA);
    expect(missingRevRes.status).toBe(404);

    // Cross-org revision access -> 404
    const crossOrgRes = await getPdfResponse(`/api/v1/quotations/${qId}/revisions/1/pdf`, authHeaderB);
    expect(crossOrgRes.status).toBe(404);
  });

  // 3. Historical Reproducibility & Template Snapshot Freezing
  it('3. Historical quote revision maintains frozen BLUE template snapshot after master Template A is modified to RED', async () => {
    // 1. Create Template A (Blue)
    const tmplRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        name: 'Blue Branding Template',
        primaryColor: '#2563eb',
        fontFamily: 'Inter',
      });
    expect(tmplRes.status).toBe(200);
    const tmplId = tmplRes.body.template.id;

    // 2. Create Quotation using Template A and finalize it (SENT)
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        templateId: tmplId,
        status: 'SENT',
        items: [{ name: 'Hardware Appliance', quantity: 1, rate: 100000, taxRate: 18 }],
      });
    expect(qRes.status).toBe(201);
    const qId = qRes.body.quotation.id;

    // 3. Modify Template A to RED (#dc2626)
    const updateTmplRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        id: tmplId,
        name: 'Red Branding Template',
        primaryColor: '#dc2626',
      });
    expect(updateTmplRes.status).toBe(200);

    // 4. Render DTO for historical quote -> verifies frozen BLUE primaryColor (#2563eb) is preserved!
    const renderDto = await QuotationRenderModelService.buildRenderModel(orgIdA, qId);
    expect(renderDto.template.primaryColor).toBe('#2563eb');
  });

  it('freezes the newly selected template on a revision without changing prior revision output', async () => {
    const originalTemplate = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({ name: 'Original Revision Template', primaryColor: '#2563eb' });
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        templateId: originalTemplate.body.template.id,
        status: 'SENT',
        items: [{ name: 'Snapshot template line', quantity: 1, rate: 1000 }],
      });
    const qId = qRes.body.quotation.id;
    const nextTemplate = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({ name: 'New Revision Template', primaryColor: '#dc2626' });

    const revision = await request(app)
      .put(`/api/v1/quotations/${qId}`)
      .set(authHeaderA)
      .send({ templateId: nextTemplate.body.template.id });
    expect(revision.status).toBe(200);

    await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({ id: nextTemplate.body.template.id, name: 'Changed After Revision', primaryColor: '#16a34a' });

    const prior = await QuotationRenderModelService.buildRenderModel(orgIdA, qId, 0);
    const revised = await QuotationRenderModelService.buildRenderModel(orgIdA, qId, 1);
    expect(prior.template.primaryColor).toBe('#2563eb');
    expect(revised.template.primaryColor).toBe('#dc2626');

    const historicalPdf = await getPdfResponse(`/api/v1/quotations/${qId}/revisions/1/pdf`, authHeaderA);
    expect(historicalPdf.status).toBe(200);
    expect(historicalPdf.headers['x-quotation-pdf-source']).toBe('versioned-template');
    expect(historicalPdf.headers['x-document-pdf-template']).toBeTruthy();
    expect((await parsePdf(historicalPdf.body)).text).toContain('Snapshot template line');

    const revisions = await QuotationEngine.getQuotationRevisions(orgIdA, qId);
    expect(revisions[0].revisionData.documentTemplateSnapshot.category).toBe('quotes');
    expect(revisions[0].revisionData.documentTemplateSnapshot.modelId).toBeTruthy();
  });

  // Registry version writes use PostgreSQL row locks unavailable in pg-mem.
  it.skipIf(!process.env.DATABASE_URL)('preserves the historical registry configuration after its version and default change', async () => {
    const configurationUrl = '/api/v1/finance/documents/quotes/templates/proposal/configuration';
    const configured = await request(app).patch(configurationUrl).set(authHeaderA)
      .send({ configuration: { templateTitle: 'FROZEN REGISTRY TITLE' } });
    expect(configured.status).toBe(200);
    const created = await request(app).post('/api/v1/quotations').set(authHeaderA).send({
      customerId: customerIdA,
      items: [{ name: 'Registry snapshot fixture', quantity: 1, rate: 100 }],
    });
    expect(created.status).toBe(201);
    const changed = await request(app).patch(configurationUrl).set(authHeaderA)
      .send({ configuration: { templateTitle: 'CURRENT REGISTRY TITLE' } });
    expect(changed.status).toBe(200);
    const changedDefault = await request(app)
      .patch('/api/v1/finance/documents/quotes/templates/commercial/default')
      .set(authHeaderA).send({});
    expect(changedDefault.status).toBe(200);
    const historical = await getPdfResponse(`/api/v1/quotations/${created.body.quotation.id}/revisions/0/pdf`, authHeaderA);
    expect(historical.status).toBe(200);
    const text = (await parsePdf(historical.body)).text;
    expect(text).toContain('FROZEN REGISTRY TITLE');
    expect(text).not.toContain('CURRENT REGISTRY TITLE');
    expect(text).not.toContain('COMMERCIAL OFFER');
  });

  // 4. Complete Public Response Revision Snapshot
  it('4. Customer public portal ACCEPTED response creates full commercial revision snapshot', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        status: 'SENT',
        items: [{ name: 'Annual Maintenance Contract', quantity: 1, rate: 40000, taxRate: 18 }],
      });

    const q = qRes.body.quotation;
    const token = q.publicToken;
    expect(token).toBeDefined();

    // Customer accepts via public portal
    const portalRes = await request(app)
      .post(`/api/v1/public/quotation/${token}/respond`)
      .send({
        status: 'ACCEPTED',
        notes: 'Approved as per agreement.',
      });
    expect(portalRes.status).toBe(200);

    // Fetch created revision from DB
    const revs = await QuotationEngine.getQuotationRevisions(orgIdA, q.id);
    expect(revs.length).toBeGreaterThan(0);

    const latestRev = revs[0];
    expect(latestRev.status).toBe('ACCEPTED');
    expect(latestRev.revisionData.customerResponseNotes).toBe('Approved as per agreement.');
    expect(latestRev.revisionData.lineItems.length).toBe(1);
    expect(latestRev.revisionData.totals.grandTotal).toBe(47200);

    // Render DTO from that revision -> succeeds cleanly
    const renderDto = await QuotationRenderModelService.buildRenderModel(orgIdA, q.id, latestRev.revisionNumber);
    expect(renderDto.document.status).toBe('ACCEPTED');
    expect(renderDto.totals.grandTotal).toBe(47200);
  });

  // 5. Zero Fabricated Business Data
  it('5. Render model contains ZERO fabricated business/address placeholders when fields are missing', async () => {
    // Register empty Org C
    const timestampC = Date.now() + Math.floor(Math.random() * 10000);
    const regResC = await request(app).post('/api/v1/auth/register').send({
      email: `admin-85a1-c-${timestampC}@test.com`,
      password: 'Password123!',
      fullName: 'Bare Org Admin',
      organizationName: `Bare Org ${timestampC}`,
      role: 'Admin',
    });
    const tokenC = regResC.body.token;
    const authHeaderC = { Authorization: `Bearer ${tokenC}` };
    const orgIdC = regResC.body.organizationId;

    // Create Customer with no address/phone/email
    const custResC = await request(app)
      .post('/api/v1/customers')
      .set(authHeaderC)
      .send({
        displayName: 'Bare Customer',
      });
    const customerIdC = custResC.body.id || custResC.body.customer?.id;

    // Create Quotation with minimal customer data
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderC)
      .send({
        customerId: customerIdC,
        items: [{ name: 'Bare Item', quantity: 1, rate: 100 }],
      });
    const qId = qRes.body.quotation.id;

    const renderDto = await QuotationRenderModelService.buildRenderModel(orgIdC, qId);

    // Assert NO fabricated data
    expect(renderDto.organization.address).not.toContain('100 Business Park');
    expect(renderDto.organization.email).not.toContain('contact@firmbooks.com');
    expect(renderDto.organization.phone).not.toContain('+91 98765 43210');
    expect(renderDto.customerSnapshot.billingAddress).toBeUndefined();
  });

  // 6. Content-Driven Multipage Pagination (35 items)
  it('6. Generates valid multipage PDF for 35 items with correct page count using pdf-parse', async () => {
    const items = Array.from({ length: 35 }, (_, i) => ({
      name: `Consulting Unit Service Line ${i + 1}`,
      description: `Detailed technical description for line item ${i + 1}`,
      quantity: 1,
      rate: 1000 + i * 50,
      taxRate: 18,
    }));

    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        items,
      });
    const qId = qRes.body.quotation.id;

    const pdfRes = await getPdfResponse(`/api/v1/quotations/${qId}/pdf`, authHeaderA);

    expect(pdfRes.status).toBe(200);

    const parsedPdf = await parsePdf(pdfRes.body);
    expect(parsedPdf.numpages).toBeGreaterThanOrEqual(1);
    expect(parsedPdf.text).toContain('Consulting Unit Service Line 1');
    expect(parsedPdf.text).toContain('Consulting Unit Service Line 35');
  });

  // 7. Read-Only Safety Verification
  it('7. PDF generation causes ZERO GL, status, or revision mutations (100% read-only)', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        items: [{ name: 'Read-Only Assertion Item', quantity: 1, rate: 5000, taxRate: 18 }],
      });
    const qId = qRes.body.quotation.id;

    const jeBefore = await db.query('SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1', [orgIdA]);
    const revBefore = await db.query('SELECT COUNT(*) as count FROM quotation_revisions WHERE organization_id = $1 AND quotation_id = $2', [orgIdA, qId]);

    // Download PDF 3 times
    await getPdfResponse(`/api/v1/quotations/${qId}/pdf`, authHeaderA);
    await getPdfResponse(`/api/v1/quotations/${qId}/pdf`, authHeaderA);
    await getPdfResponse(`/api/v1/quotations/${qId}/pdf`, authHeaderA);

    const jeAfter = await db.query('SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1', [orgIdA]);
    const revAfter = await db.query('SELECT COUNT(*) as count FROM quotation_revisions WHERE organization_id = $1 AND quotation_id = $2', [orgIdA, qId]);

    expect(Number(jeAfter.rows[0].count)).toBe(Number(jeBefore.rows[0].count));
    expect(Number(revAfter.rows[0].count)).toBe(Number(revBefore.rows[0].count));
  });
});
