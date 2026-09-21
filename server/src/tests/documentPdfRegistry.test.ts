import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';
import { db } from '../database/db';
import { DOCUMENT_PDF_CATALOG, DocumentPdfService, type DocumentPdfCategory } from '../services/DocumentPdfService';

function getPdf(url: string, headers: Record<string, string>) {
  return request(app)
    .get(url)
    .set(headers)
    .parse((res, callback) => {
      res.setEncoding('binary');
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => callback(null, Buffer.from(data, 'binary')));
    });
}

describe('Document PDF registry', () => {
  let authA: Record<string, string>;
  let authB: Record<string, string>;
  let invoiceId: string;
  let orgIdA: string;
  let clientId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    const a = await request(app).post('/api/v1/auth/register').send({
      email: `pdf-catalogue-a-${suffix}@test.example`, password: 'Password123!', fullName: 'PDF Owner A', organizationName: `PDF Catalogue A ${suffix}`, role: 'Admin',
    });
    const b = await request(app).post('/api/v1/auth/register').send({
      email: `pdf-catalogue-b-${suffix}@test.example`, password: 'Password123!', fullName: 'PDF Owner B', organizationName: `PDF Catalogue B ${suffix}`, role: 'Admin',
    });
    authA = { Authorization: `Bearer ${a.body.token}` };
    authB = { Authorization: `Bearer ${b.body.token}` };
    orgIdA = a.body.organizationId;
    const client = await request(app).post('/api/v1/finance/clients').set(authA).send({
      name: 'Real PDF Customer', email: 'real-pdf@example.com', phone: '9000000000', paymentTerms: 'Net 30', billingAddress: '1 Authoritative Ledger Road',
    });
    clientId = client.body.id || client.body.client?.id;
    const invoice = await request(app).post('/api/v1/finance/invoices').set(authA).send({
      clientId, clientName: 'Real PDF Customer', clientEmail: 'real-pdf@example.com', issueDate: '2026-09-21', dueDate: '2026-10-21',
      items: [{ description: 'Database-backed implementation service', quantity: 1, unitPrice: 123456.78, taxRate: 18 }],
    });
    expect(invoice.status).toBe(201);
    invoiceId = (invoice.body.invoice || invoice.body).id;
  });

  it('defines at least three server-owned renderers for every supported document family', () => {
    expect(Object.keys(DOCUMENT_PDF_CATALOG)).toHaveLength(14);
    for (const [category, templates] of Object.entries(DOCUMENT_PDF_CATALOG)) {
      expect(templates.length, `${category} must retain at least three templates`).toBeGreaterThanOrEqual(3);
      expect(new Set(templates).size).toBe(templates.length);
    }
  });

  it('renders a selected invoice model from persisted data and exposes it as a PDF', async () => {
    const response = await getPdf(`/api/v1/finance/documents/invoices/${invoiceId}/pdf?templateId=pos`, authA);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['x-document-pdf-template']).toBe('pos');
    const body = response.body instanceof Buffer ? response.body : Buffer.from(response.body);
    expect(body.subarray(0, 8).toString('binary')).toMatch(/^%PDF-1\./);
  });

  it('only lists and renders documents within the authenticated organization', async () => {
    const recent = await request(app).get('/api/v1/finance/documents/invoices/recent').set(authA);
    expect(recent.status).toBe(200);
    expect(recent.body.documents.some((document: any) => document.id === invoiceId)).toBe(true);

    const foreign = await getPdf(`/api/v1/finance/documents/invoices/${invoiceId}/pdf`, authB);
    expect(foreign.status).toBe(404);
  });

  it('rejects an unregistered template instead of silently falling back', async () => {
    const response = await request(app).get(`/api/v1/finance/documents/invoices/${invoiceId}/pdf?templateId=untrusted-html`).set(authA);
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/Unsupported invoices PDF template/);
  });

  it('can render persisted source records for every document family', async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const vendorId = `pdf-vendor-${suffix}`;
    const account = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 ORDER BY code LIMIT 1`, [orgIdA]);
    const accountId = account.rows[0].id;
    await db.query(`INSERT INTO vendors (id, organization_id, name, currency) VALUES ($1, $2, $3, 'INR')`, [vendorId, orgIdA, 'Real PDF Vendor']);
    const ids: Record<DocumentPdfCategory, string> = {
      quotes: `quote-${suffix}`,
      'sales-orders': `sales-order-${suffix}`,
      'delivery-challans': `challan-${suffix}`,
      invoices: invoiceId,
      'credit-notes': `credit-note-${suffix}`,
      'purchase-orders': `purchase-order-${suffix}`,
      'payment-receipts': `payment-received-${suffix}`,
      'customer-statements': clientId,
      bills: `bill-${suffix}`,
      expenses: `expense-${suffix}`,
      'vendor-credits': `vendor-credit-${suffix}`,
      'vendor-payments': `vendor-payment-${suffix}`,
      'vendor-statements': vendorId,
      journals: `journal-${suffix}`,
    };
    const items = JSON.stringify([{ description: 'Persisted line item', quantity: 2, unitPrice: 500, amount: 1000 }]);
    await Promise.all([
      db.query(`INSERT INTO estimates (id, organization_id, estimate_number, client_id, client_name, issue_date, expiry_date, subtotal, total_amount) VALUES ($1,$2,$3,$4,$5,'2026-09-01','2026-10-01',1000,1000)`, [ids.quotes, orgIdA, `EST-${suffix}`, clientId, 'Real PDF Customer']),
      db.query(`INSERT INTO sales_orders (id, organization_id, sales_order_number, customer_id, customer_name, order_date, subtotal, total_amount, line_items) VALUES ($1,$2,$3,$4,$5,'2026-09-01',1000,1000,$6)`, [ids['sales-orders'], orgIdA, `SO-${suffix}`, clientId, 'Real PDF Customer', items]),
      db.query(`INSERT INTO delivery_challans (id, organization_id, challan_number, customer_id, customer_name, delivery_date, line_items) VALUES ($1,$2,$3,$4,$5,'2026-09-02',$6)`, [ids['delivery-challans'], orgIdA, `DC-${suffix}`, clientId, 'Real PDF Customer', items]),
      db.query(`INSERT INTO credit_notes (id, organization_id, credit_note_number, client_id, client_name, date, total_amount, remaining_credit) VALUES ($1,$2,$3,$4,$5,'2026-09-03',1000,1000)`, [ids['credit-notes'], orgIdA, `CN-${suffix}`, clientId, 'Real PDF Customer']),
      db.query(`INSERT INTO purchase_orders (id, organization_id, purchase_order_number, vendor_id, vendor_name, order_date, subtotal, total_amount, line_items) VALUES ($1,$2,$3,$4,$5,'2026-09-04',1000,1000,$6)`, [ids['purchase-orders'], orgIdA, `PO-${suffix}`, vendorId, 'Real PDF Vendor', items]),
      db.query(`INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status) VALUES ($1,$2,$3,$4,$5,'2026-09-05',1000,'Bank',$6,'DRAFT')`, [ids['payment-receipts'], orgIdA, `REC-${suffix}`, clientId, 'Real PDF Customer', accountId]),
      db.query(`INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, total_amount, status, line_items) VALUES ($1,$2,$3,$4,$5,'2026-09-06','2026-10-06',1000,'DRAFT',$6)`, [ids.bills, orgIdA, `BILL-${suffix}`, vendorId, 'Real PDF Vendor', items]),
      db.query(`INSERT INTO expenses (id, organization_id, expense_number, expense_account_id, paid_from_account_id, vendor_id, vendor_name, date, amount, description) VALUES ($1,$2,$3,$4,$5,$6,$7,'2026-09-07',1000,'Persisted expense')`, [ids.expenses, orgIdA, `EXP-${suffix}`, accountId, accountId, vendorId, 'Real PDF Vendor']),
      db.query(`INSERT INTO vendor_credits (id, organization_id, credit_number, vendor_id, vendor_name, date, total_amount, remaining_credit) VALUES ($1,$2,$3,$4,$5,'2026-09-08',1000,1000)`, [ids['vendor-credits'], orgIdA, `VC-${suffix}`, vendorId, 'Real PDF Vendor']),
      db.query(`INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, status) VALUES ($1,$2,$3,$4,$5,'2026-09-09',1000,'Bank',$6,'DRAFT')`, [ids['vendor-payments'], orgIdA, `VP-${suffix}`, vendorId, 'Real PDF Vendor', accountId]),
      db.query(`INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status) VALUES ($1,$2,$3,'2026-09-10','Persisted journal','DRAFT')`, [ids.journals, orgIdA, `JV-${suffix}`]),
    ]);
    await db.query(`INSERT INTO journal_lines (id, organization_id, journal_entry_id, account_id, account_name, debit, credit) VALUES ($1,$2,$3,$4,'Authoritative account',1000,0), ($5,$2,$3,$4,'Offset account',0,1000)`, [`journal-line-a-${suffix}`, orgIdA, ids.journals, accountId, `journal-line-b-${suffix}`]);

    for (const [category, id] of Object.entries(ids) as Array<[DocumentPdfCategory, string]>) {
      const rendered = await DocumentPdfService.generatePdf(db, orgIdA, category, id, DOCUMENT_PDF_CATALOG[category][0]);
      expect(rendered.pdf.subarray(0, 8).toString('binary'), category).toMatch(/^%PDF-1\./);
    }
  });
});
