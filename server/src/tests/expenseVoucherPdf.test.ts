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

describe('Expense Payment Voucher PDF Generation & Security Tests', () => {
  let tokenA: string;
  let authHeaderA: { Authorization: string };
  let orgIdA: string;
  let userIdA: string;
  let expenseAccountIdA: string;
  let bankAccountIdA: string;

  let tokenB: string;
  let authHeaderB: { Authorization: string };
  let orgIdB: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const timestampA = Date.now() + Math.floor(Math.random() * 10000);
    const regResA = await request(app).post('/api/v1/auth/register').send({
      email: `admin-voucher-a-${timestampA}@test.com`,
      password: 'Password123!',
      fullName: 'Alice Finance Manager',
      organizationName: `Voucher Org A ${timestampA}`,
      role: 'Admin',
    });
    tokenA = regResA.body.token;
    authHeaderA = { Authorization: `Bearer ${tokenA}` };
    orgIdA = regResA.body.organizationId;
    userIdA = regResA.body.user.id;

    // Fetch default chart of accounts for Org A
    const accounts = await db.query(
      `SELECT id, code, type, sub_type FROM accounts WHERE organization_id = $1`,
      [orgIdA]
    );
    const expRow = accounts.rows.find((row) => row.code === '6000') || accounts.rows.find((row) => row.type === 'Expense');
    const bankRow = accounts.rows.find((row) => row.code === '1000') || accounts.rows.find((row) => row.type === 'Asset' && ['bank', 'cash'].includes(String(row.sub_type || '').toLowerCase()));
    expenseAccountIdA = expRow.id;
    bankAccountIdA = bankRow.id;

    const timestampB = Date.now() + Math.floor(Math.random() * 10000);
    const regResB = await request(app).post('/api/v1/auth/register').send({
      email: `admin-voucher-b-${timestampB}@test.com`,
      password: 'Password123!',
      fullName: 'Bob Competitor',
      organizationName: `Voucher Org B ${timestampB}`,
      role: 'Admin',
    });
    tokenB = regResB.body.token;
    authHeaderB = { Authorization: `Bearer ${tokenB}` };
    orgIdB = regResB.body.organizationId;
  });

  it('1. Generates professional Expense Payment Voucher PDF with correct headers and legal text', async () => {
    // Post an expense
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(authHeaderA)
      .send({
        expenseNumber: `EXP-VCH-${Date.now()}`,
        expenseAccountId: expenseAccountIdA,
        paidFromAccountId: bankAccountIdA,
        date: '2026-08-11',
        amount: 15000,
        description: 'Enterprise Server Hosting',
        vendorName: 'Global Cloud Systems Inc.',
      });

        expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    const pdfRes = await getPdfResponse(`/api/v1/finance/expenses/${expenseId}/pdf`, authHeaderA);

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdfRes.headers['content-disposition']).toMatch(/inline; filename="ExpenseVoucher-.*\.pdf"/);

    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.text || pdfRes.body);
    expect(buffer.toString('binary', 0, 8)).toMatch(/^%PDF-1\./);

    // Verify content extracted by pdf-parse
    const parsed = await parsePdf(buffer);
    expect(parsed.numpages).toBeGreaterThanOrEqual(1);
    expect(parsed.text).toContain('EXPENSE PAYMENT VOUCHER');
    expect(parsed.text).toContain('Global Cloud Systems Inc.');
    expect(parsed.text).toContain('Enterprise Server Hosting');
    expect(parsed.text).toContain('Amount in Words:');
    expect(parsed.text).toContain('USD Fifteen Thousand Only');
  });

  it('2. Compiles attached receipt images into multi-page Annexure dossier', async () => {
    // Valid 1x1 transparent PNG base64
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(authHeaderA)
      .send({
        expenseNumber: `EXP-TAX-${Date.now()}`,
        expenseAccountId: expenseAccountIdA,
        paidFromAccountId: bankAccountIdA,
        date: '2026-08-11',
        amount: 4500,
        description: 'Executive Airport Taxi',
        vendorName: 'City Taxi Fleet',
        receiptImages: [
          {
            name: 'taxi_receipt_01.png',
            mimeType: 'image/png',
            dataBase64: samplePngBase64,
          },
        ],
      });

    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    const pdfRes = await getPdfResponse(`/api/v1/finance/expenses/${expenseId}/pdf`, authHeaderA);

    expect(pdfRes.status).toBe(200);
    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.text || pdfRes.body);
    const parsed = await parsePdf(buffer);

    // Multi-page document with receipt annexure
    expect(parsed.numpages).toBeGreaterThanOrEqual(2);
    expect(parsed.text).toContain('ANNEXURE: ATTACHED DIGITAL RECEIPTS');
    expect(parsed.text).toContain('taxi_receipt_01.png');
  });

  it('3. Enforces strict tenant isolation and authentication boundaries', async () => {
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(authHeaderA)
      .send({
        expenseNumber: `EXP-ISO-${Date.now()}`,
        expenseAccountId: expenseAccountIdA,
        paidFromAccountId: bankAccountIdA,
        date: '2026-08-11',
        amount: 2000,
        description: 'Stationery Supplies',
      });
    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // 401 Unauthenticated
    const noAuth = await request(app).get(`/api/v1/finance/expenses/${expenseId}/pdf`);
    expect(noAuth.status).toBe(401);

    // 404 Missing Expense
    const missing = await request(app)
      .get(`/api/v1/finance/expenses/non-existent-id/pdf`)
      .set(authHeaderA);
    expect(missing.status).toBe(404);

    // 404 Cross-Tenant Isolation (Org B cannot access Org A expense)
    const crossOrg = await request(app)
      .get(`/api/v1/finance/expenses/${expenseId}/pdf`)
      .set(authHeaderB);
    expect(crossOrg.status).toBe(404);
  });

  it('4. Records itemized expenses across multiple categories with balanced GL splits and certified PDF voucher', async () => {
    // Find two distinct expense accounts in Org A
    const accounts = await db.query(
      `SELECT id, code, name FROM accounts WHERE organization_id = $1 AND type = 'Expense'`,
      [orgIdA]
    );
    expect(accounts.rows.length).toBeGreaterThanOrEqual(2);
    const acc1 = accounts.rows[0];
    const acc2 = accounts.rows[1];

    const itemizedPayload = {
      expenseNumber: `EXP-SPLIT-${Date.now()}`,
      expenseAccountId: acc1.id,
      paidFromAccountId: bankAccountIdA,
      date: '2026-08-11',
      amount: 12500,
      description: 'Quarterly Team Summit & Cloud Infrastructure',
      vendorName: 'Unified Corporate Solutions',
      isItemized: true,
      items: [
        { accountId: acc1.id, description: 'Cloud Computing Services', amount: 8000 },
        { accountId: acc2.id, description: 'Travel & Accommodation', amount: 4500 },
      ],
    };

    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(authHeaderA)
      .send(itemizedPayload);

    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;
    const journalEntryId = expRes.body.journalEntryId;

    // Verify double entry journal lines
    const lines = await db.query(
      `SELECT account_id, debit, credit FROM journal_lines WHERE journal_entry_id = $1 ORDER BY debit DESC`,
      [journalEntryId]
    );
    expect(lines.rows).toHaveLength(3);
    expect(Number(lines.rows[0].debit)).toBe(8000);
    expect(lines.rows[0].account_id).toBe(acc1.id);
    expect(Number(lines.rows[1].debit)).toBe(4500);
    expect(lines.rows[1].account_id).toBe(acc2.id);
    expect(Number(lines.rows[2].credit)).toBe(12500);
    expect(lines.rows[2].account_id).toBe(bankAccountIdA);

    // Verify list response includes isItemized and items
    const listRes = await request(app)
      .get('/api/v1/finance/expenses')
      .set(authHeaderA);
    expect(listRes.status).toBe(200);
    const savedExp = listRes.body.find((e: any) => e.id === expenseId);
    expect(savedExp.isItemized).toBe(true);
    expect(savedExp.items).toHaveLength(2);

    // Verify PDF generation includes all split rows
    const pdfRes = await getPdfResponse(`/api/v1/finance/expenses/${expenseId}/pdf`, authHeaderA);
    if (pdfRes.status !== 200) console.log("DEBUG_PDF_ERR:", pdfRes.status, pdfRes.body ? pdfRes.body.toString("utf8") : "");
    expect(pdfRes.status).toBe(200);
    const buffer = pdfRes.body instanceof Buffer ? pdfRes.body : Buffer.from(pdfRes.text || pdfRes.body);
    const parsed = await parsePdf(buffer);

    expect(parsed.text).toContain('EXPENSE PAYMENT VOUCHER');
    expect(parsed.text).toContain('Unified Corporate Solutions');
    expect(parsed.text).toContain('Cloud Computing Services');
    expect(parsed.text).toContain('Travel & Accommodation');
    expect(parsed.text).toContain('USD Twelve Thousand Five Hundred Only');
  });
});
