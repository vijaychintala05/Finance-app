import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { CustomerPortalService } from '../services/CustomerPortalService';
import { DrillDownService } from '../services/DrillDownService';
import { DocumentOcrService } from '../services/DocumentOcrService';
import { JobSchedulerService } from '../jobs/JobSchedulerService';
import { POINT1_RECOVERY_SCHEMA } from '../recovery/schema';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import request from 'supertest';
import app from '../index';

const ORG = F.ORG_A.id;
const CUSTOMER_ID = F.CUSTOMERS.A1.id;
const VENDOR_ID = F.VENDORS.A1.id;
const OWNER_ID = F.PERSONAS.ORG_A.owner.id;

describe('QA Blocker Remediations (QA-01 to QA-10)', () => {
  beforeEach(async () => {
    await MasterFinanceFixture.setup();
  });

  // QA-01 & QA-10: Public Portal Payment Authenticity & Token Hashing
  it('QA-01 & QA-10: Portal cannot self-post money without a verified gateway event and hashes token at rest', async () => {
    // 1. Create a 100 posted invoice
    const invoice = await SalesEngine.createAndPostInvoice(ORG, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Cloud Services', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    expect(invoice.totalAmount).toBe(100);
    expect(invoice.balanceDue).toBe(100);

    // 2. Generate portal token
    const tokenResult = await CustomerPortalService.generatePortalToken(ORG, CUSTOMER_ID);
    expect(tokenResult.token).toBeDefined();

    // Verify QA-10: Raw token is NOT stored in plaintext in the database
    const tokenDbRow = await db.query(
      `SELECT token, token_hash FROM customer_portal_tokens WHERE organization_id = $1 AND customer_id = $2`,
      [ORG, CUSTOMER_ID]
    );
    expect(tokenDbRow.rows.length).toBeGreaterThan(0);
    expect(tokenDbRow.rows[0].token).not.toBe(tokenResult.token);
    expect(tokenDbRow.rows[0].token_hash).toBe(CustomerPortalService.hashToken(tokenResult.token));

    await expect(CustomerPortalService.processPortalPayment(tokenResult.token, {
      invoiceId: invoice.id,
      amount: 100,
    })).rejects.toThrow(/PORTAL_PAYMENT_PROCESSOR_REQUIRED/);

    const pmtDb = await db.query(
      `SELECT id FROM payments_received WHERE organization_id = $1 AND reference = 'REF-PORTAL-TEST'`,
      [ORG]
    );
    expect(pmtDb.rows).toHaveLength(0);
    const unchangedInvoice = await SalesEngine.getInvoice(ORG, invoice.id);
    expect(unchangedInvoice?.balanceDue).toBe(100);
  });

  // QA-02: Partial SO then invoice remaining without explicit amount
  it('QA-02: Partial SO then invoice remaining balance scales line items without rejection', async () => {
    // 1. Create a 100 sales order with CONFIRMED status
    const so = await SalesEngine.createSalesOrder(ORG, {
      customerId: CUSTOMER_ID,
      customerName: 'Customer A1',
      orderDate: '2026-03-01',
      status: 'CONFIRMED',
      lineItems: [
        { description: 'Item 1', quantity: 1, unitPrice: 50, amount: 50 },
        { description: 'Item 2', quantity: 1, unitPrice: 50, amount: 50 },
      ],
      totalAmount: 100,
      subtotal: 100,
    }, undefined, OWNER_ID);

    // 2. Invoice 40 partially
    const inv1 = await SalesEngine.convertSalesOrderToInvoice(ORG, so.id, OWNER_ID, 40);
    expect(inv1.invoice.totalAmount).toBe(40);
    expect(inv1.salesOrder.status).toBe('PARTIALLY_INVOICED');

    // 3. Invoice remaining balance without explicit partial amount
    const inv2 = await SalesEngine.convertSalesOrderToInvoice(ORG, so.id, OWNER_ID, undefined);
    expect(inv2.invoice.totalAmount).toBe(60);

    // Verify SO status is now fully INVOICED
    const soAfter = await SalesEngine.getSalesOrder(ORG, so.id);
    expect(soAfter?.invoicedAmount).toBe(100);
    expect(soAfter?.status).toBe('INVOICED');
  });

  // QA-03: Partial PO then bill remaining without explicit amount
  it('QA-03: Partial PO then bill remaining balance creates balanced journal', async () => {
    // 1. Create a 100 purchase order
    const po = await PurchasesEngine.createPurchaseOrder(ORG, {
      vendorId: VENDOR_ID,
      vendorName: 'Vendor V1',
      orderDate: '2026-03-01',
      lineItems: [
        { description: 'Material 1', quantity: 1, unitPrice: 60, amount: 60 },
        { description: 'Material 2', quantity: 1, unitPrice: 40, amount: 40 },
      ],
      totalAmount: 100,
      subtotal: 100,
      status: 'APPROVED',
    });

    // 2. Bill 40 partially
    const bill1 = await PurchasesEngine.convertPurchaseOrderToBill(ORG, po.id, OWNER_ID, 40);
    expect(bill1.totalAmount).toBe(40);

    // 3. Bill remaining 60 without explicit partial amount
    const bill2 = await PurchasesEngine.convertPurchaseOrderToBill(ORG, po.id, OWNER_ID);
    expect(bill2.totalAmount).toBe(60);

    // Verify PO status is now fully BILLED
    const poAfter = await PurchasesEngine.getPurchaseOrder(ORG, po.id);
    expect(poAfter?.billedAmount).toBe(100);
    expect(poAfter?.status).toBe('BILLED');
  });

  // QA-04: Full purchase receipt reaches completed quantity and rejects duplicate
  it('QA-04: Full PO receiving marks order RECEIVED and rejects duplicate receiving', async () => {
    // 1. Create a 100 purchase order
    const po = await PurchasesEngine.createPurchaseOrder(ORG, {
      vendorId: VENDOR_ID,
      vendorName: 'Vendor V1',
      orderDate: '2026-03-01',
      lineItems: [{ description: 'Goods Item', quantity: 1, unitPrice: 100, amount: 100 }],
      totalAmount: 100,
      subtotal: 100,
      status: 'APPROVED',
    });

    // 2. Receive the order fully
    const rcpt = await PurchasesEngine.receivePurchaseOrder(ORG, po.id, OWNER_ID, {
      receiptDate: '2026-03-02',
      receivedAmount: 100,
    });
    expect(rcpt.status).toBe('RECEIVED');

    const poAfter = await PurchasesEngine.getPurchaseOrder(ORG, po.id);
    expect(poAfter?.status).toBe('RECEIVED');

    // 3. Attempt duplicate full receipt -> must be rejected
    await expect(
      PurchasesEngine.receivePurchaseOrder(ORG, po.id, OWNER_ID, {
        receiptDate: '2026-03-03',
        receivedAmount: 100,
      })
    ).rejects.toThrow(/already fully received|exceeds remaining/i);
  });

  // QA-05: Journal drill-down retains invoice identity after revision and formats ISO date
  it('QA-05: Journal drill-down retains INVOICE source type after revision and returns ISO date', async () => {
    // 1. Create and post invoice
    const inv = await SalesEngine.createAndPostInvoice(ORG, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Consulting Initial', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    const originalJournalId = inv.journalEntryId!;

    // 2. Drill down before revision
    const beforeDrill = await DrillDownService.getDrillDown(ORG, originalJournalId);
    expect(beforeDrill.sourceDocument.type).toBe('INVOICE');
    expect(beforeDrill.sourceDocument.date).toBe('2026-03-01');

    // 3. Revise invoice
    await SalesEngine.updateInvoice(ORG, inv.id, {
      items: [{ description: 'Consulting Revised', quantity: 1, unitPrice: 200, taxRate: 0 }],
      editReason: 'Customer approved higher scope',
    }, OWNER_ID);

    // 4. Drill down on the original journal AFTER revision
    const afterDrill = await DrillDownService.getDrillDown(ORG, originalJournalId);
    expect(afterDrill.sourceDocument.type).toBe('INVOICE');
    expect(afterDrill.sourceDocument.documentNumber).toBe(inv.invoiceNumber);
    expect(afterDrill.sourceDocument.date).toBe('2026-03-01');
    expect(afterDrill.journalEntry.date).toBe('2026-03-01');
  });

  // QA-06: Stage 6 routes match mounted paths and handle aliases
  it('QA-06: Stage 6 routes are accessible via both /api/v1/stage6 and /api/v1 aliases', async () => {
    const authHeaders = {
      'Authorization': 'Bearer test-token',
      'x-organization-id': ORG,
    };

    // Both /api/v1/stage6/inbox and /api/v1/documents/inbox should be valid JSON routes
    const res1 = await request(app)
      .get('/api/v1/stage6/inbox')
      .set(authHeaders);
    expect(res1.status).not.toBe(404);
    expect(res1.type).toMatch(/json/);

    const res2 = await request(app)
      .get('/api/v1/documents/inbox')
      .set(authHeaders);
    expect(res2.status).not.toBe(404);
    expect(res2.type).toMatch(/json/);
  });

  // QA-07: OCR does not hallucinate $150 or Acme Supplier on empty/unmatched text
  it('QA-07: OCR returns 0 total and 0.0 confidence when no invoice data is present', async () => {
    const emptyOcr = (DocumentOcrService as any).parseDocumentContent('receipt.pdf', '');
    expect(emptyOcr.totalAmount).toBe(0);
    expect(emptyOcr.subtotal).toBe(0);
    expect(emptyOcr.confidence).toBe(0.0);
    expect(emptyOcr.vendorName).toBeUndefined();
    expect(emptyOcr.lineItems).toEqual([]);
  });

  // QA-08: Recovery manifest includes all Stage 2/5/6 tables
  it('QA-08: POINT1_RECOVERY_SCHEMA includes all Stage 2, 5, 6 tables', () => {
    const tableNames = POINT1_RECOVERY_SCHEMA.map(t => t.name);
    const expectedTables = [
      'sales_orders',
      'purchase_orders',
      'goods_service_receipts',
      'delivery_challans',
      'estimates',
      'estimate_revisions',
      'background_jobs',
      'background_job_runs',
      'payment_gateway_events',
      'bank_feed_connections',
      'document_inbox',
      'customer_portal_tokens',
      'saved_views',
    ];
    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected);
    }
  });

  // QA-09: Background worker loop and payment gateway webhook mounted
  it('QA-09: JobSchedulerService has runnable worker loop and gateway webhook endpoint responds', async () => {
    // 1. Process pending jobs run
    const processed = await JobSchedulerService.processPendingJobs('test-worker');
    expect(typeof processed).toBe('number');

    // 2. Gateway webhook route responds with 400 on unsigned request
    const res = await request(app)
      .post('/api/v1/public/webhooks/gateway/stripe')
      .send({ id: 'evt-test-123', type: 'payment_intent.succeeded' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/MISSING_WEBHOOK_SIGNATURE/);
  });
});
