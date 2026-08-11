import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { QuotationEngine } from '../sales/QuotationEngine';
import { SalesEngine } from '../sales/SalesEngine';

describe('Phase 8.4B.2C — Round-Off, GST Snapshot & Discount Allocation Integrity', () => {
  let token: string;
  let authHeader: { Authorization: string };
  let orgId: string;
  let customerId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: `admin-84b2c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Phase84B2C Admin',
      organizationName: `Org 84B2C ${timestamp}`,
      role: 'Admin',
    });

    token = regRes.body.token;
    authHeader = { Authorization: `Bearer ${token}` };
    orgId = regRes.body.organizationId;

    // Create Customer
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set(authHeader)
      .send({
        displayName: 'Integrity Global Corp',
        email: 'billing@integritycorp.com',
        phone: '+91 91234 56789',
        gstin: '27AAACG1234H1Z1',
        billingAddress: {
          street: '500 Integrity Tower, Tech Park',
          city: 'Pune',
          state: 'Maharashtra',
          pincode: '411001',
          country: 'India',
        },
      });
    customerId = custRes.body.id || custRes.body.customer?.id;
  });

  // 1. Section 4A: Direct Invoice Creation with Positive Round-Off (+0.40)
  it('1. Direct Invoice creation with +0.40 positive Round-Off posts Cr Round-Off Income 0.40 and balances GL', async () => {
    const invNumber = `INV-DIR-POS-${Date.now()}`;
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      invoiceNumber: invNumber,
      customerId,
      customerName: 'Integrity Global Corp',
      subtotal: 1000,
      taxTotal: 180,
      discount: 0,
      roundOffAmount: 0.40,
      lineItems: [
        {
          name: 'Consulting Unit',
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
          taxRate: 18,
        },
      ],
    });

    expect(invoice.totalAmount).toBe(1180.40);
    expect(invoice.balanceDue).toBe(1180.40);

    const jeRes = await db.query(
      `SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id WHERE je.reference = $1 AND je.organization_id = $2`,
      [invNumber, orgId]
    );

    let arDebit = 0;
    let revCredit = 0;
    let taxCredit = 0;
    let roundOffIncomeCr = 0;
    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of jeRes.rows) {
      const d = Number(line.debit || 0);
      const c = Number(line.credit || 0);
      totalDebits += d;
      totalCredits += c;

      if (line.account_code === '1100') arDebit = d;
      if (line.account_code === '4000') revCredit = c;
      if (line.account_code === '2100') taxCredit = c;
      if (line.account_code === '4900') roundOffIncomeCr = c;
    }

    expect(arDebit).toBe(1180.40);
    expect(revCredit).toBe(1000.00);
    expect(taxCredit).toBe(180.00);
    expect(roundOffIncomeCr).toBe(0.40);
    expect(Math.round(totalDebits * 100) / 100).toBe(1180.40);
    expect(Math.round(totalCredits * 100) / 100).toBe(1180.40);
  });

  // 2. Section 4B: Direct Invoice Creation with Negative Round-Off (-0.30)
  it('2. Direct Invoice creation with -0.30 negative Round-Off posts Dr Round-Off Expense 0.30 and balances GL', async () => {
    const invNumber = `INV-DIR-NEG-${Date.now()}`;
    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      invoiceNumber: invNumber,
      customerId,
      customerName: 'Integrity Global Corp',
      subtotal: 1000,
      taxTotal: 180,
      discount: 0,
      roundOffAmount: -0.30,
      lineItems: [
        {
          name: 'Consulting Unit',
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
          taxRate: 18,
        },
      ],
    });

    expect(invoice.totalAmount).toBe(1179.70);
    expect(invoice.balanceDue).toBe(1179.70);

    const jeRes = await db.query(
      `SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id WHERE je.reference = $1 AND je.organization_id = $2`,
      [invNumber, orgId]
    );

    let arDebit = 0;
    let roundOffExpenseDr = 0;
    let revCredit = 0;
    let taxCredit = 0;
    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of jeRes.rows) {
      const d = Number(line.debit || 0);
      const c = Number(line.credit || 0);
      totalDebits += d;
      totalCredits += c;

      if (line.account_code === '1100') arDebit = d;
      if (line.account_code === '5900') roundOffExpenseDr = d;
      if (line.account_code === '4000') revCredit = c;
      if (line.account_code === '2100') taxCredit = c;
    }

    expect(arDebit).toBe(1179.70);
    expect(roundOffExpenseDr).toBe(0.30);
    expect(revCredit).toBe(1000.00);
    expect(taxCredit).toBe(180.00);
    expect(Math.round(totalDebits * 100) / 100).toBe(1180.00);
    expect(Math.round(totalCredits * 100) / 100).toBe(1180.00);
  });

  // 3. Section 5: Quotation Conversion Round-Off Invariant (No Double Round-Off)
  it('3. Converted invoice total matches quotation total EXACTLY without double round-off (+0.40 & -0.30)', async () => {
    // Test +0.40 Round-off quotation via API
    const createPosRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [{ name: 'Item', quantity: 1, rate: 1000, taxRate: 18 }],
        roundOffAmount: 0.40,
      });

    expect(createPosRes.status).toBe(201);
    const quotePos = createPosRes.body.quotation;
    expect(quotePos.totalAmount).toBe(1180.40);

    const invPosRes = await request(app)
      .post(`/api/v1/quotations/${quotePos.id}/convert-inv`)
      .set(authHeader);

    if (invPosRes.status !== 200) {
      console.log('Convert error body:', invPosRes.body);
    }
    expect(invPosRes.status).toBe(200);
    expect(invPosRes.body.invoice.totalAmount).toBe(1180.40);
    expect(invPosRes.body.invoice.totalAmount).toBe(quotePos.totalAmount);

    // Test -0.30 Round-off quotation via API
    const createNegRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [{ name: 'Item', quantity: 1, rate: 1000, taxRate: 18 }],
        roundOffAmount: -0.30,
      });

    expect(createNegRes.status).toBe(201);
    const quoteNeg = createNegRes.body.quotation;
    expect(quoteNeg.totalAmount).toBe(1179.70);

    const invNegRes = await request(app)
      .post(`/api/v1/quotations/${quoteNeg.id}/convert-inv`)
      .set(authHeader);

    expect(invNegRes.status).toBe(200);
    expect(invNegRes.body.invoice.totalAmount).toBe(1179.70);
    expect(invNegRes.body.invoice.totalAmount).toBe(quoteNeg.totalAmount);
  });

  // 4. Section 6 & 7: GST-Inclusive Mode Persistence & Snapshot Reload Test
  it('4. Converted GST-inclusive invoice persists is_gst_inclusive = true and matches upon reload', async () => {
    // ₹11,800 inclusive, 18% GST, ₹1,180 overall discount
    const createRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        isGstInclusive: true,
        items: [{ name: 'Inclusive Service', quantity: 1, unit: 'Job', rate: 11800, taxRate: 18 }],
        overallDiscount: 1180,
      });

    const quote = createRes.body.quotation;
    expect(quote.isGstInclusive).toBe(true);

    const convertRes = await request(app)
      .post(`/api/v1/quotations/${quote.id}/convert-inv`)
      .set(authHeader);

    const invoiceId = convertRes.body.invoice.id;

    // Reload invoice directly from API endpoint (verifying PostgreSQL persistence)
    const reloadRes = await request(app)
      .get(`/api/v1/invoices/${invoiceId}`)
      .set(authHeader);

    expect(reloadRes.status).toBe(200);
    const inv = reloadRes.body.invoice;

    expect(inv.isGstInclusive).toBe(true);
    expect(inv.subtotal).toBe(11800);
    expect(inv.discount).toBe(1180);
    expect(inv.taxTotal).toBe(1620);
    expect(inv.totalAmount).toBe(10620);
  });

  // 5. Section 8 & 9: Proportional Discount Allocation Integrity (Largest-Remainder Method)
  it('5. Proportional discount allocation rounding produces non-negative, exact allocations across lines', () => {
    // 4 equal ₹25 lines, overall discount ₹0.02
    const items: any[] = [
      { name: 'Line 1', quantity: 1, rate: 25, taxRate: 18 },
      { name: 'Line 2', quantity: 1, rate: 25, taxRate: 18 },
      { name: 'Line 3', quantity: 1, rate: 25, taxRate: 18 },
      { name: 'Line 4', quantity: 1, rate: 25, taxRate: 18 },
    ];
    QuotationEngine.calculateQuotationTotals(items, 0.02, false);

    const allocSum = items.reduce((sum: number, it: any) => sum + (it.allocatedOverallDiscount || 0), 0);
    expect(Math.round(allocSum * 100) / 100).toBe(0.02);

    for (const item of items) {
      expect(item.allocatedOverallDiscount).toBeGreaterThanOrEqual(0);
      expect(item.taxableAmount).toBeGreaterThanOrEqual(0);
    }

    // Zero-value line receives 0 allocation
    const zeroItems: any[] = [
      { name: 'Active Line', quantity: 1, rate: 100, taxRate: 18 },
      { name: 'Zero Line', quantity: 1, rate: 0, taxRate: 18 },
    ];
    QuotationEngine.calculateQuotationTotals(zeroItems, 10, false);
    expect(zeroItems[1].allocatedOverallDiscount).toBe(0);

    // Overall discount equal to subtotal
    const fullItems: any[] = [
      { name: 'Item 1', quantity: 1, rate: 50, taxRate: 18 },
      { name: 'Item 2', quantity: 1, rate: 50, taxRate: 18 },
    ];
    const fullDiscTotals = QuotationEngine.calculateQuotationTotals(fullItems, 100, false);
    expect(fullDiscTotals.taxableTotal).toBe(0);
    for (const item of fullItems) {
      expect(item.taxableAmount).toBe(0);
      expect(item.allocatedOverallDiscount).toBe(50);
    }
  });

  // 6. Section 10: Authoritative Line Total Hardening
  it('6. Server calculated totals override manipulated frontend lineTotal in payloads', async () => {
    const createRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [
          {
            name: 'Security Test Item',
            quantity: 1,
            rate: 1000,
            taxRate: 18,
            lineTotal: 999999, // Stale/manipulated payload value
          },
        ],
      });

    expect(createRes.status).toBe(201);
    const quote = createRes.body.quotation;

    expect(quote.totalAmount).toBe(1180);
    expect(quote.items[0].lineTotal).toBe(1180);
    expect(quote.items[0].totalAmount).toBe(1180);

    const convertRes = await request(app)
      .post(`/api/v1/quotations/${quote.id}/convert-inv`)
      .set(authHeader);

    expect(convertRes.status).toBe(200);
    const invoice = convertRes.body.invoice;
    expect(invoice.totalAmount).toBe(1180);
    const lineItems = typeof invoice.line_items === 'string' ? JSON.parse(invoice.line_items) : invoice.lineItems || invoice.line_items;
    expect(lineItems[0].lineTotal).toBe(1180);
    expect(lineItems[0].totalAmount).toBe(1180);
  });

  // 7. Section 11: Invoice Snapshot Return Consistency
  it('7. SalesEngine.createAndPostInvoice return model includes all persisted commercial metadata', async () => {
    const invNumber = `INV-SNAP-${Date.now()}`;
    const customerSnapshot = { gstin: '27AAACG1234H1Z1', displayName: 'Integrity Global Corp' };

    const invoice = await SalesEngine.createAndPostInvoice(orgId, {
      invoiceNumber: invNumber,
      estimateId: 'est-777',
      projectId: 'prj-888',
      customerId,
      customerName: 'Integrity Global Corp',
      customerEmail: 'billing@integritycorp.com',
      customerSnapshot,
      subtotal: 5000,
      taxTotal: 900,
      discount: 200,
      roundOffAmount: 0.10,
      isGstInclusive: false,
      notes: 'Snapshot verification notes',
      lineItems: [
        {
          name: 'Item 1',
          quantity: 1,
          unitPrice: 5000,
          amount: 5000,
          taxRate: 18,
        },
      ],
    });

    expect(invoice.estimateId).toBe('est-777');
    expect(invoice.projectId).toBe('prj-888');
    expect(invoice.customerEmail).toBe('billing@integritycorp.com');
    expect(invoice.customerSnapshot).toEqual(customerSnapshot);
    expect(invoice.isGstInclusive).toBe(false);
    expect(invoice.roundOffAmount).toBe(0.10);
    expect(invoice.notes).toBe('Snapshot verification notes');
  });
});
