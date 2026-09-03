import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { JwtAuth } from '../auth/jwt';
import { newId } from '../utils/ids';
import { SalesEngine } from '../sales/SalesEngine';

describe('Invoice Editing Pipeline Integration Suite', () => {
  let authToken: string;
  let testOrgId: string;
  let testUserId: string;
  let testClientId: string;

  beforeEach(async () => {
    await MigrationRunner.runMigrations();

    const shortId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    testOrgId = `org_${shortId}`;
    testUserId = `usr_${shortId}`;
    testClientId = `cli_${shortId}`;

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'US', 'USD', '$', $6)`,
      [testOrgId, `uuid_${shortId}`, `pub_${shortId}`, 'ED1', 'Invoice Editing Test Corp', testUserId]
    );

    const userEmail = `editor_${shortId}@example.com`;

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, $3, $4, 'Active')`,
      [testUserId, userEmail, 'hash', 'Invoice Editor']
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES ($1, $2, $3, 'Owner', 'Active')`,
      [newId('mem'), testOrgId, testUserId]
    );

    await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, email, currency) VALUES ($1, $2, $3, $4, $5, $6)`,
      [testClientId, testOrgId, 'Acme Buyer', 'Acme Corp', 'billing@acme.com', 'USD']
    );

    // Seed standard chart of accounts
    const accounts = [
      { code: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Accounts Receivable' },
      { code: '4000', name: 'Sales Revenue', type: 'Revenue', subType: 'Operating Revenue' },
      { code: '2200', name: 'GST Output Liability', type: 'Liability', subType: 'Tax Payable' },
      { code: '4900', name: 'Round-Off Income', type: 'Revenue', subType: 'Other Income' },
      { code: '5900', name: 'Round-Off Expense', type: 'Expense', subType: 'Other Expense' },
    ];
    for (const acc of accounts) {
      await db.query(
        `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'Active')
         ON CONFLICT DO NOTHING`,
        [newId('acc'), testOrgId, acc.code, acc.name, acc.type, acc.subType]
      );
    }

    authToken = JwtAuth.generateToken({
      userId: testUserId,
      email: userEmail,
    });
  });

  it('1. Successfully creates an invoice and edits line items, updating totals and balance due', async () => {
    // 1. Create an invoice
    const createRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        clientName: 'Acme Buyer',
        clientEmail: 'billing@acme.com',
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        items: [
          { description: 'Initial Consulting', quantity: 2, unitPrice: 100, taxRate: 0, amount: 200 },
        ],
        discount: 0,
        notes: 'Initial notes',
      });

    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.id;
    expect(createRes.body.totalAmount).toBe(200);

    // 2. Edit the invoice: add item, change quantity, add edit reason
    const editRes = await request(app)
      .put(`/api/v1/finance/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        issueDate: '2026-03-01',
        dueDate: '2026-04-15',
        items: [
          { description: 'Extended Consulting', quantity: 5, unitPrice: 100, taxRate: 0, amount: 500 },
        ],
        discount: 50,
        notes: 'Revised engagement scope',
        terms: 'Net 45 payment terms',
        editReason: 'Client requested 3 additional days of consulting',
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.totalAmount).toBe(450); // 500 - 50 discount
    expect(editRes.body.balanceDue).toBe(450);
    expect(editRes.body.dueDate).toBe('2026-04-15');
    expect(editRes.body.notes).toBe('Revised engagement scope');
    expect(editRes.body.terms).toBe('Net 45 payment terms');

    // 3. Verify database row
    const dbInv = await db.query('SELECT * FROM invoices WHERE organization_id = $1 AND id = $2', [testOrgId, invoiceId]);
    expect(Number(dbInv.rows[0].total_amount)).toBe(450);
    expect(Number(dbInv.rows[0].balance_due)).toBe(450);
    expect(dbInv.rows[0].terms).toBe('Net 45 payment terms');

    // Verify edit_history exists and contains the revision
    const history = typeof dbInv.rows[0].edit_history === 'string' ? JSON.parse(dbInv.rows[0].edit_history) : dbInv.rows[0].edit_history;
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].reason).toBe('Client requested 3 additional days of consulting');
  });

  it('2. Prevents reducing invoice total below already paid amount', async () => {
    // 1. Create invoice of 300
    const createRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        items: [{ description: 'Software License', quantity: 3, unitPrice: 100, taxRate: 0, amount: 300 }],
      });

    expect(createRes.status).toBe(201);
    const invoiceId = createRes.body.id;

    // 2. Simulate partial payment of 200 in database
    await db.query(
      `UPDATE invoices SET paid_amount = 200, balance_due = 100, status = 'Partially Paid' WHERE organization_id = $1 AND id = $2`,
      [testOrgId, invoiceId]
    );

    // 3. Attempt to reduce invoice total to 150 (below paid 200)
    const editRes = await request(app)
      .put(`/api/v1/finance/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        items: [{ description: 'Software License Discounted', quantity: 1, unitPrice: 150, taxRate: 0, amount: 150 }],
        editReason: 'Attempting invalid reduction below paid amount',
      });

    expect(editRes.status).toBe(422);
    expect(editRes.body.error).toContain('cannot be reduced below the amount already paid');
  });

  it('3. Rejects editing a voided invoice', async () => {
    // 1. Create an invoice
    const createRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        items: [{ description: 'Advisory', quantity: 1, unitPrice: 500, taxRate: 0, amount: 500 }],
      });

    const invoiceId = createRes.body.id;

    // 2. Mark invoice as Void
    await db.query(
      `UPDATE invoices SET status = 'Void' WHERE organization_id = $1 AND id = $2`,
      [testOrgId, invoiceId]
    );

    // 3. Attempt to edit the voided invoice
    const editRes = await request(app)
      .put(`/api/v1/finance/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        items: [{ description: 'Advisory', quantity: 2, unitPrice: 500, taxRate: 0, amount: 1000 }],
        editReason: 'Trying to resurrect voided invoice',
      });

    expect(editRes.status).toBe(422);
    expect(editRes.body.error).toContain('Voided invoices cannot be edited');
  });

  it('4. Rejects invalid dates where due date precedes issue date', async () => {
    const createRes = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        issueDate: '2026-03-01',
        dueDate: '2026-03-31',
        items: [{ description: 'Work', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
      });

    const invoiceId = createRes.body.id;

    const editRes = await request(app)
      .put(`/api/v1/finance/invoices/${invoiceId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', testOrgId)
      .send({
        clientId: testClientId,
        issueDate: '2026-03-15',
        dueDate: '2026-03-10', // Before issue date!
        items: [{ description: 'Work', quantity: 1, unitPrice: 100, taxRate: 0, amount: 100 }],
      });

    expect(editRes.status).toBe(422);
    expect(editRes.body.error).toContain('due date cannot precede issue date');
  });
});
