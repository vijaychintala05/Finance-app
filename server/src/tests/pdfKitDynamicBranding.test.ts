import { describe, it, expect, beforeAll } from 'vitest';
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

describe('PDFKit Dynamic Organization Branding Tests', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('generates certified invoice PDF reflecting dynamic organization branding, custom signatory, and logo', async () => {
    const timestamp = Date.now();
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: `branding-pdf-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Chief Financial Officer',
      organizationName: 'Emerald Global Advisory',
      country: 'India',
      baseCurrency: 'INR',
    });
    expect(regRes.status).toBe(201);
    const authHeaders = {
      Authorization: `Bearer ${regRes.body.token}`,
      'X-Organization-ID': regRes.body.organizationId,
    };

    // 1x1 valid transparent PNG base64
    const validPngLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Update organization branding
    const patchRes = await request(app)
      .patch('/api/v1/organizations/current')
      .set(authHeaders)
      .send({
        logoUrl: validPngLogo,
        branding: {
          primaryColor: '#059669',
          accentColor: '#064e3b',
          footerNote: 'Certified electronic document issued under Digital Invoicing Standard.',
          authorizedSignatoryTitle: 'Chief Financial Officer & Partner',
          termsAndConditions: 'Remittance required within 14 calendar days.',
        },
      });
    expect(patchRes.status).toBe(200);

    // Create a customer
    const custRes = await request(app)
      .post('/api/v1/finance/customers')
      .set(authHeaders)
      .send({
        displayName: 'Reliance Industries Limited',
        email: 'accounts@ril.com',
      });
    expect(custRes.status).toBe(201);
    const clientId = custRes.body.id;

    // Create an invoice
    const invRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set(authHeaders)
      .send({
        clientId,
        clientName: 'Reliance Industries Limited',
        clientEmail: 'accounts@ril.com',
        issueDate: '2026-09-10',
        dueDate: '2026-09-24',
        items: [
          {
            description: 'Enterprise ERP Advisory & Branding Architecture',
            quantity: 1,
            unitPrice: 125000,
            taxRate: 18,
          },
        ],
      });
    expect(invRes.status).toBe(201);
    const invoiceId = invRes.body.invoice?.id || invRes.body.id;

    // Download PDF
    const pdfRes = await getPdfResponse(`/api/v1/finance/invoices/${invoiceId}/pdf`, authHeaders);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);

    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.text || pdfRes.body);
    expect(buffer.toString('binary', 0, 8)).toMatch(/^%PDF-1\./);

    const parsed = await parsePdf(buffer);
    expect(parsed.text).toContain('TAX INVOICE');
    expect(parsed.text).toContain('Emerald Global Advisory');
    expect(parsed.text).toContain('Enterprise ERP Advisory');
    expect(parsed.text).toContain('Chief Financial Officer & Partner');
    expect(parsed.text).toContain('Certified electronic document issued under Digital Invoicing Standard.');
    expect(parsed.text).toContain('Remittance required within 14 calendar days.');
  });
});
