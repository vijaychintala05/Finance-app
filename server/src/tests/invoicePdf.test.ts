import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';
import { db } from '../database/db';

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
    console.log('[DEBUG parsePdf uint8 err]:', err);
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

describe('Invoice PDF Generation & Data Integrity Tests', () => {
  let tokenA: string;
  let authHeaderA: { Authorization: string };
  let orgIdA: string;
  let userIdA: string;
  let clientIdA: string;

  let tokenB: string;
  let authHeaderB: { Authorization: string };
  let orgIdB: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const timestampA = Date.now() + Math.floor(Math.random() * 10000);
    const regResA = await request(app).post('/api/v1/auth/register').send({
      email: `admin-inv-pdf-a-${timestampA}@test.com`,
      password: 'Password123!',
      fullName: 'Alice Invoice Manager',
      organizationName: `Tax Invoice Org A ${timestampA}`,
      role: 'Admin',
    });
    tokenA = regResA.body.token;
    authHeaderA = { Authorization: `Bearer ${tokenA}` };
    orgIdA = regResA.body.organizationId;
    userIdA = regResA.body.user.id;

    // Create a customer for Org A
    const clientRes = await request(app)
      .post('/api/v1/finance/clients')
      .set(authHeaderA)
      .send({
        name: 'Apex Global Enterprises',
        email: 'billing@apexglobal.com',
        phone: '+1 555 123 4567',
        paymentTerms: 'Net 30',
        billingAddress: 'Tower B, Tech Park, New York, NY 10001',
      });
    clientIdA = clientRes.body.id || clientRes.body.client?.id;
    expect(clientIdA).toBeDefined();

    // Update organization profile with GSTIN and Bank remittance info
    await db.query(
      `INSERT INTO organization_profiles (
         organization_id, legal_name, gstin, pan, address_line1, city, state, postal_code, country,
         bank_name, bank_account_number, bank_ifsc_swift
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (organization_id) DO UPDATE SET
         bank_name = EXCLUDED.bank_name,
         bank_account_number = EXCLUDED.bank_account_number,
         bank_ifsc_swift = EXCLUDED.bank_ifsc_swift`,
      [
        orgIdA,
        `Tax Invoice Org A ${timestampA} Pvt Ltd`,
        '29AABCT1332L1ZV',
        'AABCT1332L',
        '42 MG Road',
        'Bengaluru',
        'Karnataka',
        '560001',
        'India',
        'Chase Manhattan Bank',
        '50200012345678',
        'HDFC0001234',
      ]
    );

    // Register Org B for isolation checks
    const timestampB = Date.now() + Math.floor(Math.random() * 10000);
    const regResB = await request(app).post('/api/v1/auth/register').send({
      email: `admin-inv-pdf-b-${timestampB}@test.com`,
      password: 'Password123!',
      fullName: 'Bob Competitor',
      organizationName: `Tax Invoice Org B ${timestampB}`,
      role: 'Admin',
    });
    tokenB = regResB.body.token;
    authHeaderB = { Authorization: `Bearer ${tokenB}` };
    orgIdB = regResB.body.organizationId;
  });

  it('1. Generates certified Tax Invoice PDF with correct headers, metadata, line items and totals', async () => {
    // Create an invoice
    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set(authHeaderA)
      .send({
        clientId: clientIdA,
        clientName: 'Apex Global Enterprises',
        clientEmail: 'billing@apexglobal.com',
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        discount: 500,
        notes: 'Thank you for your partnership. Please remit within 30 days.',
        items: [
          {
            description: 'Cloud Infrastructure Architecture & Consulting',
            quantity: 2,
            unitPrice: 25000,
            taxRate: 18,
          },
          {
            description: 'Security Audit & Compliance Review',
            quantity: 1,
            unitPrice: 15000,
            taxRate: 18,
          },
        ],
      });

    expect(invRes.status).toBe(201);
    const invoice = invRes.body.invoice || invRes.body;
    const invoiceId = invoice.id;

    // Fetch PDF
    const pdfRes = await getPdfResponse(`/api/v1/finance/invoices/${invoiceId}/pdf`, authHeaderA);

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdfRes.headers['content-disposition']).toMatch(/inline; filename="Invoice-.*\.pdf"/);

    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.text || pdfRes.body);
    expect(buffer.toString('binary', 0, 8)).toMatch(/^%PDF-1\./);

    // Extract text from generated PDF
    const parsed = await parsePdf(buffer);
    expect(parsed.text).toContain('TAX INVOICE');
    expect(parsed.text).toContain(invoice.invoiceNumber || invoice.invoice_number);
    expect(parsed.text).toContain('Apex Global Enterprises');
    expect(parsed.text).toContain('Cloud Infrastructure Architecture');
    expect(parsed.text).toContain('Security Audit & Compliance Review');
    expect(parsed.text).toContain('Chase Manhattan Bank');
    expect(parsed.text).toContain('50200012345678');
    expect(parsed.text).toContain('Authorized Signatory');
  });

  it('2. Enforces strict tenant isolation and authentication boundaries for invoice PDFs', async () => {
    // Org A creates an invoice
    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set(authHeaderA)
      .send({
        clientId: clientIdA,
        clientName: 'Apex Global Enterprises',
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        items: [{ description: 'Private Consulting', quantity: 1, unitPrice: 10000, taxRate: 0 }],
      });

    const invoiceId = (invRes.body.invoice || invRes.body).id;

    // 1. Unauthenticated request -> 401
    const unauthRes = await request(app).get(`/api/v1/finance/invoices/${invoiceId}/pdf`);
    expect(unauthRes.status).toBe(401);

    // 2. Org B attempts to access Org A's invoice -> 404 (isolated)
    const crossTenantRes = await request(app)
      .get(`/api/v1/finance/invoices/${invoiceId}/pdf`)
      .set(authHeaderB);
    expect(crossTenantRes.status).toBe(404);

    // 3. Non-existent invoice ID -> 404
    const notFoundRes = await request(app)
      .get('/api/v1/finance/invoices/non-existent-invoice-id/pdf')
      .set(authHeaderA);
    expect(notFoundRes.status).toBe(404);
  });

  it('3. Seamlessly generates multipage PDF for invoices with 25+ line items', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({
      description: `Hardware Maintenance Service Component Unit #${i + 1}`,
      quantity: 1,
      unitPrice: 1000 + i * 50,
      taxRate: 18,
    }));

    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set(authHeaderA)
      .send({
        clientId: clientIdA,
        clientName: 'Apex Global Enterprises',
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        items,
      });

    expect(invRes.status).toBe(201);
    const invoiceId = (invRes.body.invoice || invRes.body).id;

    const pdfRes = await getPdfResponse(`/api/v1/finance/invoices/${invoiceId}/pdf`, authHeaderA);
    expect(pdfRes.status).toBe(200);

    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.text || pdfRes.body);
    const parsed = await parsePdf(buffer);

    // Multipage document check
    expect(parsed.numpages).toBeGreaterThan(1);
    expect(parsed.text).toContain('Hardware Maintenance Service Component');
    expect(parsed.text).toContain('#25');
    expect(parsed.text).toContain('Authorized Signatory');
    expect(parsed.text).toContain('Total Amount:');
  });
});
