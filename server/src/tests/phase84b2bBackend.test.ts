import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Phase 8.4B.2B — Quotation Details & Conversion Commercial Consistency Backend Tests', () => {
  let token: string;
  let authHeader: { Authorization: string };
  let customerId: string;
  let masterItemId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const timestamp = Date.now() + Math.floor(Math.random() * 10000);
    const regRes = await request(app).post('/api/v1/auth/register').send({
      email: `admin-84b2b-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Phase84B2B Admin',
      organizationName: `Org 84B2B ${timestamp}`,
      role: 'Admin',
    });

    token = regRes.body.token;
    authHeader = { Authorization: `Bearer ${token}` };

    // Create Customer with Address A
    const custRes = await request(app)
      .post('/api/v1/customers')
      .set(authHeader)
      .send({
        displayName: 'Acme Commercial Corp',
        email: 'billing@acmecommercial.com',
        phone: '+91 98765 43210',
        gstin: '27AABCA1234A1Z5',
        billingAddress: {
          street: '100 Business Boulevard, Suite 500',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India',
        },
      });
    customerId = custRes.body.id || custRes.body.customer?.id;

    // Create Master Item
    const itemRes = await request(app)
      .post('/api/v1/items')
      .set(authHeader)
      .send({
        name: 'Enterprise Cloud Server Node',
        sku: `SKU-NODE-${timestamp}`,
        hsnSac: '998313',
        unit: 'Units',
        salesRate: 50000,
        gstRate: 18,
      });
    masterItemId = itemRes.body.id || itemRes.body.item?.id;
  });

  // 1. Exclusive Discounted Quotation Conversion
  it('1. Converted GST-exclusive discounted quotation creates perfectly balanced GL invoice and preserves snapshot', async () => {
    // Create Quotation with Gross 100k, Line Disc 5k, Subtotal 95k, Overall Disc 5k, Taxable 90k, GST 16.2k, Total 106.2k
    const createRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [
          {
            itemId: masterItemId,
            name: 'Enterprise Cloud Server Node',
            description: 'Dedicated high-concurrency node',
            hsnSac: '998313',
            quantity: 2,
            unit: 'Units',
            rate: 50000,
            discountAmount: 5000,
            taxRate: 18,
          },
        ],
        overallDiscount: 5000,
        notes: 'Commercial terms valid for 30 days',
      });

    expect(createRes.status).toBe(201);
    const quote = createRes.body.quotation;
    expect(quote.subtotal).toBe(95000);
    expect(quote.overallDiscount).toBe(5000);
    expect(quote.taxTotal).toBe(16200);
    expect(quote.totalAmount).toBe(106200);

    // Convert quotation to Invoice
    const invRes = await request(app)
      .post(`/api/v1/quotations/${quote.id}/convert-inv`)
      .set(authHeader);

    expect(invRes.status).toBe(200);
    const invoice = invRes.body.invoice;
    expect(invoice).toBeDefined();
    expect(invoice.estimateId || invoice.estimate_id).toBe(quote.id);
    expect(invoice.subtotal).toBe(95000);
    expect(invoice.discount).toBe(5000);
    expect(invoice.taxTotal || invoice.tax_total).toBe(16200);
    expect(invoice.totalAmount || invoice.total_amount).toBe(106200);

    // Verify GL Posting Double-Entry Invariant: Debits === Credits
    const jeRes = await db.query(
      `SELECT * FROM journal_lines WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE reference = $1)`,
      [invoice.invoiceNumber]
    );

    let totalDebits = 0;
    let totalCredits = 0;
    for (const line of jeRes.rows) {
      totalDebits += Number(line.debit || 0);
      totalCredits += Number(line.credit || 0);
    }

    expect(Math.round(totalDebits * 100) / 100).toBe(106200);
    expect(Math.round(totalCredits * 100) / 100).toBe(106200);
    expect(totalDebits).toBe(totalCredits);

    // Verify status updated to CONVERTED
    const getQRes = await request(app)
      .get(`/api/v1/quotations/${quote.id}`)
      .set(authHeader);
    expect(getQRes.body.quotation.status).toBe('CONVERTED');
  });

  // 2. GST-Inclusive Discounted Quotation Conversion
  it('2. Converted GST-inclusive discounted quotation creates perfectly balanced GL invoice', async () => {
    // ₹11,800 inclusive rate, ₹1,180 overall discount, 18% GST
    // Net line after discount = 10,620. Taxable = 9,000. GST = 1,620. Total = 10,620.
    const createRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        isGstInclusive: true,
        items: [
          {
            name: 'Inclusive Professional Service',
            quantity: 1,
            unit: 'Job',
            rate: 11800,
            taxRate: 18,
          },
        ],
        overallDiscount: 1180,
      });

    expect(createRes.status).toBe(201);
    const quote = createRes.body.quotation;

    expect(quote.subtotal).toBe(11800);
    expect(quote.overallDiscount).toBe(1180);
    expect(quote.taxTotal).toBe(1620);
    expect(quote.totalAmount).toBe(10620);

    const invRes = await request(app)
      .post(`/api/v1/quotations/${quote.id}/convert-inv`)
      .set(authHeader);

    if (invRes.status !== 200) {
      console.log('Test 2 invRes error:', invRes.body);
    }
    expect(invRes.status).toBe(200);
    const invoice = invRes.body.invoice;

    // Verify GL Double Entry Invariant
    const jeRes = await db.query(
      `SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id WHERE je.reference = $1 AND je.organization_id = (SELECT organization_id FROM estimates WHERE id = $2)`,
      [invoice.invoiceNumber, quote.id]
    );

    let totalDebits = 0;
    let totalCredits = 0;
    for (const line of jeRes.rows) {
      totalDebits += Number(line.debit || 0);
      totalCredits += Number(line.credit || 0);
    }

    expect(Math.round(totalDebits * 100) / 100).toBe(10620);
    expect(Math.round(totalCredits * 100) / 100).toBe(10620);
    expect(totalDebits).toBe(totalCredits);
  });

  // 3. Customer Master Address Change Isolation Regression
  it('3. Customer Master address modification after quotation creation does NOT alter converted invoice snapshot', async () => {
    const createRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [
          {
            name: 'Consulting Session',
            quantity: 1,
            rate: 10000,
            taxRate: 18,
          },
        ],
      });

    const quote = createRes.body.quotation;

    // Convert quotation to Invoice
    const invRes = await request(app)
      .post(`/api/v1/quotations/${quote.id}/convert-inv`)
      .set(authHeader);

    const invoiceId = invRes.body.invoice.id;

    // Now update Customer Master to Address B
    await request(app)
      .put(`/api/v1/customers/${customerId}`)
      .set(authHeader)
      .send({
        displayName: 'Acme Commercial Corp (MODIFIED NAME)',
        billingAddress: {
          street: '999 NEW TOWER, ALTERED STREET',
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India',
        },
      });

    // Check converted invoice row in database
    const invRow = await db.query(`SELECT * FROM invoices WHERE id = $1`, [invoiceId]);
    expect(invRow.rows.length).toBe(1);

    const snapshot = typeof invRow.rows[0].customer_snapshot === 'string'
      ? JSON.parse(invRow.rows[0].customer_snapshot)
      : invRow.rows[0].customer_snapshot;

    expect(snapshot).toBeDefined();
    expect(snapshot.displayName || snapshot.name).toMatch(/Acme Commercial Corp/);
    expect(snapshot.billingAddress?.street || snapshot.billingAddress).toMatch(/100 Business Boulevard/);
    expect(snapshot.billingAddress?.street).not.toMatch(/999 NEW TOWER/);
  });

  // 4. Line Item Commercial Snapshot Preservation
  it('4. Preserves quotation line item commercial snapshot fields in invoice line items', async () => {
    const createRes = await request(app)
      .post('/api/v1/quotations')
      .set(authHeader)
      .send({
        customerId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [
          {
            itemId: masterItemId,
            name: 'Enterprise Cloud Server Node',
            description: 'Customized spec with extra RAM',
            hsnSac: '998313',
            quantity: 3,
            unit: 'Units',
            rate: 50000,
            discountPercent: 10,
            taxRate: 18,
          },
          {
            name: 'Custom Unlisted Migration Service',
            description: 'Legacy DB ETL migration',
            hsnSac: '998314',
            quantity: 1,
            unit: 'Job',
            rate: 25000,
            taxRate: 18,
          },
        ],
      });

    const quote = createRes.body.quotation;

    // Modify Item Master rate to ₹999,999 after quotation creation
    await request(app)
      .put(`/api/v1/items/${masterItemId}`)
      .set(authHeader)
      .send({
        salesRate: 999999,
      });

    // Convert quotation to Invoice
    const invRes = await request(app)
      .post(`/api/v1/quotations/${quote.id}/convert-inv`)
      .set(authHeader);

    expect(invRes.status).toBe(200);
    const invoice = invRes.body.invoice;

    const lineItems = typeof invoice.line_items === 'string'
      ? JSON.parse(invoice.line_items)
      : invoice.lineItems || invoice.line_items;

    expect(lineItems).toBeDefined();
    expect(lineItems.length).toBe(2);

    const masterLine = lineItems.find((l: any) => l.itemId === masterItemId || l.name?.includes('Server'));
    expect(masterLine).toBeDefined();
    expect(Number(masterLine.unitPrice || masterLine.rate)).toBe(50000);
    expect(masterLine.hsnSac).toBe('998313');
    expect(masterLine.unit).toBe('Units');

    const customLine = lineItems.find((l: any) => !l.itemId || l.name?.includes('Migration'));
    expect(customLine).toBeDefined();
    expect(customLine.itemId).toBeNull();
    expect(customLine.hsnSac).toBe('998314');

    // Section 12 strengthening assertions
    expect(invoice.estimateId || invoice.estimate_id).toBe(quote.id);
    expect(invoice.projectId).toBe(quote.projectId || undefined);
    expect(invoice.customerSnapshot).toBeDefined();
    expect(invoice.isGstInclusive).toBe(false);
    expect(invoice.roundOffAmount).toBe(0);

    expect(masterLine.discountAmount).toBe(15000);
    expect(masterLine.taxableAmount).toBe(135000);
    expect(masterLine.taxAmount).toBe(24300);
    expect(masterLine.totalAmount).toBe(159300);
    expect(masterLine.lineTotal).toBe(159300);
  });
});
