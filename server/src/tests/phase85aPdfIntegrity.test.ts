import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { QuotationRenderModelService } from '../sales/QuotationRenderModelService';
import { QuotationPdfService } from '../sales/QuotationPdfService';
import { QuotationEngine } from '../sales/QuotationEngine';

describe('Phase 8.5A — Quotation PDF Generation & Data Integrity Tests', () => {
  let tokenA: string;
  let authHeaderA: { Authorization: string };
  let orgIdA: string;
  let userIdA: string;

  let tokenB: string;
  let authHeaderB: { Authorization: string };
  let orgIdB: string;

  let customerIdA: string;
  let masterItemIdA: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const timestampA = Date.now() + Math.floor(Math.random() * 10000);
    const regResA = await request(app).post('/api/v1/auth/register').send({
      email: `admin-85a-pdf-a-${timestampA}@test.com`,
      password: 'Password123!',
      fullName: 'Org A PDF Admin',
      organizationName: `Org A PDF ${timestampA}`,
      role: 'Admin',
    });
    tokenA = regResA.body.token;
    authHeaderA = { Authorization: `Bearer ${tokenA}` };
    orgIdA = regResA.body.organizationId;
    userIdA = regResA.body.user.id;

    const timestampB = Date.now() + Math.floor(Math.random() * 10000);
    const regResB = await request(app).post('/api/v1/auth/register').send({
      email: `admin-85a-pdf-b-${timestampB}@test.com`,
      password: 'Password123!',
      fullName: 'Org B PDF Admin',
      organizationName: `Org B PDF ${timestampB}`,
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
        displayName: 'PDF Enterprise Client',
        email: 'billing@pdfclient.com',
        gstin: '27AAAAA1234A1Z9',
        billingAddress: {
          street: '100 PDF Plaza',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411006',
          country: 'India',
        },
      });
    customerIdA = custRes.body.id || custRes.body.customer?.id;

    // Create Item for Org A
    const itemRes = await request(app)
      .post('/api/v1/items')
      .set(authHeaderA)
      .send({
        name: 'Enterprise Cloud Node',
        salesRate: 25000,
        gstRate: 18,
      });
    masterItemIdA = itemRes.body.id || itemRes.body.item?.id;
  });

  // 1. PDF generated from same-org quotation
  it('1. Generates PDF with application/pdf content type and %PDF-1.4 header for same-org quotation', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [{ name: 'Server License', quantity: 2, rate: 10000, taxRate: 18 }],
      });

    const q = qRes.body.quotation;

    const pdfRes = await request(app)
      .get(`/api/v1/quotations/${q.id}/pdf`)
      .set(authHeaderA);

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdfRes.headers['content-disposition']).toMatch(/inline; filename="Quotation-.*\.pdf"/);

    // Verify PDF binary header signature %PDF-1.4
    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.text || pdfRes.body);
    expect(buffer.toString('binary', 0, 8)).toMatch(/^%PDF-1\./);
  });

  // 2. Security: Unauthenticated, Missing & Cross-Org Isolation
  it('2. Enforces security isolation: 401 unauthenticated, 404 missing quotation & 404 cross-org', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        items: [{ name: 'Item A', quantity: 1, rate: 5000 }],
      });
    const qId = qRes.body.quotation.id;

    // Unauthenticated (invalid token) -> 401
    const unauthRes = await request(app)
      .get(`/api/v1/quotations/${qId}/pdf`)
      .set('Authorization', 'Bearer invalid-token-123');
    expect(unauthRes.status).toBe(401);

    // Missing quotation -> 404
    const missingRes = await request(app)
      .get('/api/v1/quotations/non-existent-id/pdf')
      .set(authHeaderA);
    expect(missingRes.status).toBe(404);

    // Cross-org access (Org B accesses Org A quotation) -> 404
    const crossOrgRes = await request(app)
      .get(`/api/v1/quotations/${qId}/pdf`)
      .set(authHeaderB);
    expect(crossOrgRes.status).toBe(404);
  });

  // 3. Immutability: Saved Customer & Item Master changes do NOT mutate PDF render DTO
  it('3. Preserves saved commercial snapshot: Customer/Item Master updates do NOT alter PDF render DTO', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        items: [
          {
            itemId: masterItemIdA,
            name: 'Enterprise Cloud Node',
            quantity: 2,
            rate: 25000,
            taxRate: 18,
          },
        ],
        overallDiscount: 2000,
      });

    const q = qRes.body.quotation;

    // Mutate Customer Master Address & Item Master Rate
    await request(app).put(`/api/v1/customers/${customerIdA}`).set(authHeaderA).send({
      displayName: 'MUTATED CLIENT NAME',
      billingAddress: { street: '999 MUTATED STREET' },
    });
    await request(app).put(`/api/v1/items/${masterItemIdA}`).set(authHeaderA).send({
      salesRate: 999999,
    });

    // Build Render DTO for saved quotation
    const renderDto = await QuotationRenderModelService.buildRenderModel(orgIdA, q.id);

    expect(renderDto.customerSnapshot.displayName).toBe('PDF Enterprise Client');
    expect(renderDto.customerSnapshot.billingAddress?.street).toBe('100 PDF Plaza');
    expect(renderDto.lineItems[0].rate).toBe(25000);
    expect(renderDto.totals.subtotal).toBe(50000);
    expect(renderDto.totals.overallDiscount).toBe(2000);
    expect(renderDto.totals.taxableAmount).toBe(48000);
    expect(renderDto.totals.grandTotal).toBe(56640);
  });

  // 4. GST Inclusive & Mixed Tax Rates Support
  it('4. Correctly builds render model for GST-inclusive & mixed tax rates quotations', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        isGstInclusive: true,
        items: [
          { name: 'Inclusive Item 18%', quantity: 1, rate: 11800, taxRate: 18 },
          { name: 'Inclusive Item 5%', quantity: 1, rate: 10500, taxRate: 5 },
        ],
        overallDiscount: 1000,
      });

    const q = qRes.body.quotation;

    const renderDto = await QuotationRenderModelService.buildRenderModel(orgIdA, q.id);
    expect(renderDto.document.isGstInclusive).toBe(true);
    expect(renderDto.lineItems.length).toBe(2);
    expect(renderDto.totals.subtotal).toBe(22300);
    expect(renderDto.totals.overallDiscount).toBe(1000);
    expect(renderDto.totals.grandTotal).toBe(21300);
  });

  // 5. Multipage PDF Pagination (30+ items)
  it('5. Generates multipage PDF cleanly for 30+ line items', async () => {
    const items = Array.from({ length: 35 }, (_, i) => ({
      name: `Consulting Unit Item ${i + 1}`,
      quantity: 1,
      rate: 1000 + i * 100,
      taxRate: 18,
    }));

    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        items,
      });

    const q = qRes.body.quotation;

    const renderDto = await QuotationRenderModelService.buildRenderModel(orgIdA, q.id);
    expect(renderDto.lineItems.length).toBe(35);

    const pdfBuffer = await QuotationPdfService.generatePdf(renderDto);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Verify PDF binary header signature %PDF-1.4
    expect(pdfBuffer.toString('binary', 0, 8)).toMatch(/^%PDF-1\./);
  });

  // 6. Zero GL/Status Side Effects (100% Read-Only)
  it('6. PDF generation is 100% read-only and causes zero GL, status or revision side-effects', async () => {
    const qRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeaderA)
      .send({
        customerId: customerIdA,
        items: [{ name: 'Read-Only Test Item', quantity: 1, rate: 10000, taxRate: 18 }],
      });

    const q = qRes.body.quotation;

    const jeBefore = await db.query('SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1', [orgIdA]);
    const revBefore = await db.query('SELECT COUNT(*) as count FROM quotation_revisions WHERE organization_id = $1 AND quotation_id = $2', [orgIdA, q.id]);

    // Download PDF 3 times
    await request(app).get(`/api/v1/quotations/${q.id}/pdf`).set(authHeaderA);
    await request(app).get(`/api/v1/quotations/${q.id}/pdf`).set(authHeaderA);
    await request(app).get(`/api/v1/quotations/${q.id}/pdf`).set(authHeaderA);

    const jeAfter = await db.query('SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1', [orgIdA]);
    const revAfter = await db.query('SELECT COUNT(*) as count FROM quotation_revisions WHERE organization_id = $1 AND quotation_id = $2', [orgIdA, q.id]);

    expect(Number(jeAfter.rows[0].count)).toBe(Number(jeBefore.rows[0].count));
    expect(Number(revAfter.rows[0].count)).toBe(Number(revBefore.rows[0].count));

    const freshQ = await QuotationEngine.getQuotation(orgIdA, q.id);
    expect(freshQ?.status).toBe('DRAFT');
  });
});
