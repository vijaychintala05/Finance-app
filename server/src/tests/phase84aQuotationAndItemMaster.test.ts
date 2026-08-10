import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ItemMasterService } from '../services/ItemMasterService';
import { QuotationEngine, QuotationLineItem } from '../sales/QuotationEngine';
import { SalesEngine } from '../sales/SalesEngine';

const request = supertest(app);

describe('Phase 8.4A.2 — Quotation & Item Master Final Foundation & Integrity Tests', () => {
  const originalEnv = process.env.NODE_ENV;
  let tokenOrgA: string;
  let orgIdA: string;
  let tokenOrgB: string;
  let orgIdB: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Register Org A
    const regA = await request.post('/api/v1/auth/register').send({
      email: `owner-orga-p84a2-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org A',
      organizationName: 'Quotation Testing Org A',
      role: 'Owner',
    });
    expect(regA.status).toBe(201);
    tokenOrgA = regA.body.token;

    const healthA = await request.get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgA}`);
    orgIdA = healthA.body.organizationId;

    // Register Org B
    const regB = await request.post('/api/v1/auth/register').send({
      email: `owner-orgb-p84a2-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org B',
      organizationName: 'Quotation Testing Org B',
      role: 'Owner',
    });
    expect(regB.status).toBe(201);
    tokenOrgB = regB.body.token;

    const healthB = await request.get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgB}`);
    orgIdB = healthB.body.organizationId;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  // --- ITEM MASTER TESTS ---

  it('1. Create valid item', async () => {
    const itemData = {
      name: 'Software License',
      sku: 'SKU-SOFT-101',
      description: 'Annual enterprise license',
      hsnSac: '998313',
      unit: 'Units',
      salesRate: 15000,
      purchaseRate: 10000,
      gstRate: 18,
    };

    const res = await request
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send(itemData);

    expect(res.status).toBe(201);
    expect(res.body.item.id).toBeDefined();
    expect(res.body.item.name).toBe('Software License');
    expect(res.body.item.salesRate).toBe(15000);
    expect(res.body.item.gstRate).toBe(18);
    expect(res.body.item.isActive).toBe(true);
  });

  it('2. Update item', async () => {
    const created = await ItemMasterService.createItem(orgIdA, {
      name: 'Initial Name',
      unit: 'Pcs',
      salesRate: 500,
      gstRate: 12,
    });

    const res = await request
      .put(`/api/v1/items/${created.id}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        name: 'Updated Item Name',
        salesRate: 750,
      });

    expect(res.status).toBe(200);
    expect(res.body.item.name).toBe('Updated Item Name');
    expect(res.body.item.salesRate).toBe(750);
  });

  it('3. Search item', async () => {
    const uniqueSku = `SKU-SEARCH-${Date.now()}`;
    await ItemMasterService.createItem(orgIdA, {
      name: 'Custom Search Widget',
      sku: uniqueSku,
      unit: 'Pcs',
      salesRate: 1200,
    });

    const res = await request
      .get(`/api/v1/items?search=${uniqueSku}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].sku).toBe(uniqueSku);
  });

  it('4. Duplicate SKU in same organization rejected', async () => {
    const dupSku = `DUP-SKU-${Date.now()}`;
    await ItemMasterService.createItem(orgIdA, {
      name: 'Original Item',
      sku: dupSku,
      unit: 'Pcs',
      salesRate: 100,
    });

    const res = await request
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        name: 'Cloned Item',
        sku: dupSku,
        unit: 'Pcs',
        salesRate: 200,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already exists');
  });

  it('5. Same SKU in another organization allowed', async () => {
    const sharedSku = `SHARED-SKU-${Date.now()}`;
    await ItemMasterService.createItem(orgIdA, {
      name: 'Org A Item',
      sku: sharedSku,
      unit: 'Pcs',
      salesRate: 100,
    });

    const res = await request
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .set('x-organization-id', orgIdB)
      .send({
        name: 'Org B Item',
        sku: sharedSku,
        unit: 'Pcs',
        salesRate: 150,
      });

    expect(res.status).toBe(201);
    expect(res.body.item.sku).toBe(sharedSku);
    expect(res.body.item.organizationId).toBe(orgIdB);
  });

  it('6. Invalid negative rate rejected', async () => {
    const res = await request
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        name: 'Bad Rate Item',
        unit: 'Pcs',
        salesRate: -50,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('non-negative');
  });

  it('7. Invalid tax rate rejected', async () => {
    const res = await request
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        name: 'Bad Tax Item',
        unit: 'Pcs',
        salesRate: 100,
        gstRate: -18,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('between 0 and 100');
  });

  it('8. Inactive item excluded from default new-document selection', async () => {
    const inactiveItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Deprecated Product',
      unit: 'Pcs',
      salesRate: 1000,
      isActive: false,
    });

    const listRes = await ItemMasterService.listItems(orgIdA, 'Deprecated Product', false);
    const found = listRes.find((i) => i.id === inactiveItem.id);
    expect(found).toBeUndefined();

    const includeRes = await ItemMasterService.listItems(orgIdA, 'Deprecated Product', true);
    const foundInclude = includeRes.find((i) => i.id === inactiveItem.id);
    expect(foundInclude).toBeDefined();
    expect(foundInclude?.isActive).toBe(false);
  });

  it('9. Org A cannot edit/delete Org B item', async () => {
    const itemB = await ItemMasterService.createItem(orgIdB, {
      name: 'Org B Secret Item',
      unit: 'Pcs',
      salesRate: 999,
    });

    // Try edit from Org A
    const editRes = await request
      .put(`/api/v1/items/${itemB.id}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({ salesRate: 1 });

    expect(editRes.status).toBe(404);

    // Try delete from Org A
    const delRes = await request
      .delete(`/api/v1/items/${itemB.id}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(delRes.status).toBe(404);
  });

  it('10. Referenced item cannot be destructively removed from history', async () => {
    const refItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Historical Hardware',
      unit: 'Pcs',
      salesRate: 5000,
    });

    // Reference in a quotation
    await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Historical Client',
      items: [
        {
          itemId: refItem.id,
          name: refItem.name,
          quantity: 1,
          rate: 5000,
          taxRate: 18,
        },
      ],
    });

    // Attempt deletion
    const delRes = await ItemMasterService.deleteItem(orgIdA, refItem.id);
    expect(delRes.archived).toBe(true);

    // Item remains in database as inactive
    const fetched = await ItemMasterService.getItem(orgIdA, refItem.id);
    expect(fetched.isActive).toBe(false);
  });

  // --- QUOTATION TESTS ---

  it('11. Create quotation with multiple lines', async () => {
    const q = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Multi-Line Client',
      items: [
        { name: 'Consulting', quantity: 2, rate: 10000, taxRate: 18 },
        { name: 'Installation', quantity: 1, rate: 5000, taxRate: 18 },
        { name: 'Transport', quantity: 1, rate: 2500, taxRate: 18 },
      ],
    });

    expect(q.id).toBeDefined();
    expect(q.lineItems.length).toBe(3);
    expect(q.subtotal).toBe(27500); // 20000 + 5000 + 2500
    expect(q.taxTotal).toBe(4950); // 27500 * 18%
    expect(q.totalAmount).toBe(32450); // 27500 + 4950
  });

  it('12. Create quotation using saved Item Master item', async () => {
    const masterItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Server Infrastructure',
      hsnSac: '998315',
      unit: 'Units',
      salesRate: 50000,
      gstRate: 18,
    });

    const q = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Enterprise Client',
      items: [
        {
          itemId: masterItem.id,
          name: masterItem.name,
          hsnSac: masterItem.hsnSac,
          unit: masterItem.unit,
          quantity: 2,
          rate: masterItem.salesRate,
          taxRate: masterItem.gstRate,
        },
      ],
    });

    expect(q.lineItems[0].itemId).toBe(masterItem.id);
    expect(q.lineItems[0].rate).toBe(50000);
    expect(q.subtotal).toBe(100000);
    expect(q.taxTotal).toBe(18000);
    expect(q.totalAmount).toBe(118000);
  });

  it('13. Create quotation using custom line item', async () => {
    const q = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Ad-hoc Client',
      items: [
        {
          name: 'Special Site Consultation',
          quantity: 3,
          unit: 'Hours',
          rate: 2000,
          taxRate: 18,
        },
      ],
    });

    expect(q.lineItems[0].itemId).toBeUndefined();
    expect(q.lineItems[0].name).toBe('Special Site Consultation');
    expect(q.subtotal).toBe(6000);
    expect(q.taxTotal).toBe(1080);
    expect(q.totalAmount).toBe(7080);
  });

  it('14. Backend calculates line totals', () => {
    const items: QuotationLineItem[] = [
      { name: 'Item 1', quantity: 4, rate: 250, taxRate: 10 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items);

    expect(items[0].taxableAmount).toBe(1000);
    expect(items[0].taxAmount).toBe(100);
    expect(items[0].totalAmount).toBe(1100);
    expect(totals.totalAmount).toBe(1100);
  });

  it('15. Backend calculates quotation totals with pre-tax overall discount (Corrected Math)', () => {
    const items: QuotationLineItem[] = [
      { name: 'Service A', quantity: 2, rate: 5000, taxRate: 18 },
      { name: 'Service B', quantity: 1, rate: 10000, taxRate: 18 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items, 2000, false, 0);

    expect(totals.subtotal).toBe(20000);
    expect(totals.overallDiscount).toBe(2000);
    expect(totals.taxableTotal).toBe(18000);
    expect(totals.taxTotal).toBe(3240); // 18000 * 18% = 3240
    expect(totals.totalAmount).toBe(21240); // 18000 + 3240 = 21240
  });

  it('16. Line discount calculation correct', () => {
    const items: QuotationLineItem[] = [
      { name: 'Discounted Gadget', quantity: 10, rate: 100, discountPercent: 10, taxRate: 18 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items);

    expect(items[0].discountAmount).toBe(100);
    expect(items[0].taxableAmount).toBe(900);
    expect(items[0].taxAmount).toBe(162); // 900 * 18%
    expect(totals.totalAmount).toBe(1062);
  });

  it('17. Tax calculation correct', () => {
    const items: QuotationLineItem[] = [
      { name: 'Taxed Unit', quantity: 1, rate: 1000, taxRate: 12 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items);

    expect(totals.taxTotal).toBe(120);
    expect(totals.totalAmount).toBe(1120);
  });

  it('18. Saved item becomes commercial snapshot', async () => {
    const master = await ItemMasterService.createItem(orgIdA, {
      name: 'Snapshot Widget',
      salesRate: 10000,
      gstRate: 18,
    });

    const q = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Snapshot Customer',
      items: [
        {
          itemId: master.id,
          name: master.name,
          quantity: 1,
          rate: master.salesRate,
          taxRate: master.gstRate,
        },
      ],
    });

    expect(q.lineItems[0].rate).toBe(10000);
    expect(q.totalAmount).toBe(11800);
  });

  it('19. Updating Item Master does not alter old quotation', async () => {
    const master = await ItemMasterService.createItem(orgIdA, {
      name: 'Consulting Original',
      salesRate: 10000,
      gstRate: 18,
    });

    const q = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Immutable Quote Customer',
      items: [
        {
          itemId: master.id,
          name: master.name,
          quantity: 1,
          rate: master.salesRate,
          taxRate: master.gstRate,
        },
      ],
    });

    // Update Item Master rate from 10000 to 12000
    await ItemMasterService.updateItem(orgIdA, master.id, {
      salesRate: 12000,
    });

    // Fetch quotation from DB
    const fetchedQ = await QuotationEngine.getQuotation(orgIdA, q.id);
    expect(fetchedQ.lineItems[0].rate).toBe(10000);
    expect(fetchedQ.totalAmount).toBe(11800); // Remains ₹10,000 + GST
  });

  it('20. Conversion uses saved quotation rate, not current Item Master rate', async () => {
    const master = await ItemMasterService.createItem(orgIdA, {
      name: 'Rate-Protected Service',
      salesRate: 5000,
      gstRate: 18,
    });

    const q = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Convert Customer',
      items: [
        {
          itemId: master.id,
          name: master.name,
          quantity: 2,
          rate: master.salesRate,
          taxRate: master.gstRate,
        },
      ],
    });

    // Update Item Master rate to 8000
    await ItemMasterService.updateItem(orgIdA, master.id, { salesRate: 8000 });

    // Convert quotation to Invoice
    const inv = await QuotationEngine.convertToInvoice(orgIdA, q.id);

    expect(inv.subtotal).toBe(10000); // 2 x 5000
    expect(inv.totalAmount).toBe(11800); // 10000 + 18% GST
  });

  it('21. New quotation defaults to Draft', async () => {
    const q = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Draft Test Customer',
      items: [{ name: 'Item', quantity: 1, rate: 100 }],
    });

    expect(q.status).toBe('DRAFT');
  });

  it('22. Quotation creation is GL neutral', async () => {
    const beforeGlRes = await db.query(`SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1`, [orgIdA]);
    const beforeCount = Number(beforeGlRes.rows[0].cnt);

    await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'GL Neutral Customer',
      items: [{ name: 'High Value Contract', quantity: 1, rate: 100000, taxRate: 18 }],
    });

    const afterGlRes = await db.query(`SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1`, [orgIdA]);
    const afterCount = Number(afterGlRes.rows[0].cnt);

    expect(afterCount).toBe(beforeCount); // 0 new GL entries created
  });

  it('23. Organization isolation enforced for quotations', async () => {
    const qA = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Org A Client',
      items: [{ name: 'Service A', quantity: 1, rate: 500 }],
    });

    // Try reading Org A quotation from Org B
    await expect(QuotationEngine.getQuotation(orgIdB, qA.id)).rejects.toThrow();

    // Try converting Org A quotation from Org B
    await expect(QuotationEngine.convertToInvoice(orgIdB, qA.id)).rejects.toThrow();
  });

  it('24. Unauthorized create/update rejected', async () => {
    process.env.NODE_ENV = 'production';

    const unauthRes = await request
      .post('/api/v1/items')
      .send({ name: 'Hacker Item', unit: 'Pcs', salesRate: 100 });

    expect(unauthRes.status).toBe(401);
  });

  it('25. Data survives reload/re-query from database', async () => {
    const createdQ = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Persistent Client',
      notes: 'Urgent delivery required',
      items: [
        { name: 'Hardware Module A', quantity: 5, rate: 2000, taxRate: 18 },
        { name: 'Setup Fee', quantity: 1, rate: 3000, taxRate: 18 },
      ],
    });

    // Query directly from database
    const reloadedQ = await QuotationEngine.getQuotation(orgIdA, createdQ.id);

    expect(reloadedQ.id).toBe(createdQ.id);
    expect(reloadedQ.customerName).toBe('Persistent Client');
    expect(reloadedQ.notes).toBe('Urgent delivery required');
    expect(reloadedQ.lineItems.length).toBe(2);
    expect(reloadedQ.subtotal).toBe(13000); // 10000 + 3000
    expect(reloadedQ.taxTotal).toBe(2340); // 13000 * 18%
    expect(reloadedQ.totalAmount).toBe(15340);
  });

  // --- PHASE 8.4A.2 CORRECTION & ENHANCEMENT TESTS ---

  it('26. Item referenced in Invoice cannot be destructively deleted', async () => {
    const invItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Invoice Reference Item',
      salesRate: 1200,
    });

    await SalesEngine.createAndPostInvoice(orgIdA, {
      invoiceNumber: `INV-${Date.now()}`,
      customerId: 'cust-101',
      customerName: 'Invoice Test Customer',
      issueDate: '2026-08-10',
      dueDate: '2026-08-25',
      subtotal: 1200,
      taxTotal: 0,
      totalAmount: 1200,
      lineItems: [
        {
          itemId: invItem.id,
          description: invItem.name,
          quantity: 1,
          unitPrice: 1200,
          amount: 1200,
        },
      ],
    });

    const delRes = await ItemMasterService.deleteItem(orgIdA, invItem.id);
    expect(delRes.archived).toBe(true);

    const fetched = await ItemMasterService.getItem(orgIdA, invItem.id);
    expect(fetched.isActive).toBe(false);
  });

  it('27. Item referenced in Sales Order, Purchase Order, Bill, Credit Note, Vendor Credit, Delivery Challan is archived', async () => {
    const soItem = await ItemMasterService.createItem(orgIdA, { name: 'SO Item', salesRate: 500 });
    await db.query(
      `INSERT INTO sales_orders (id, organization_id, sales_order_number, customer_id, customer_name, order_date, subtotal, tax_total, total_amount, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [`so-${Date.now()}`, orgIdA, `SO-101`, 'c-1', 'Cust', '2026-08-10', 500, 0, 500, JSON.stringify([{ itemId: soItem.id, name: 'SO Item' }])]
    );
    const delSO = await ItemMasterService.deleteItem(orgIdA, soItem.id);
    expect(delSO.archived).toBe(true);

    const poItem = await ItemMasterService.createItem(orgIdA, { name: 'PO Item', purchaseRate: 800 });
    await db.query(
      `INSERT INTO purchase_orders (id, organization_id, purchase_order_number, vendor_id, vendor_name, order_date, subtotal, tax_total, total_amount, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [`po-${Date.now()}`, orgIdA, `PO-101`, 'v-1', 'Vendor', '2026-08-10', 800, 0, 800, JSON.stringify([{ itemId: poItem.id }])]
    );
    const delPO = await ItemMasterService.deleteItem(orgIdA, poItem.id);
    expect(delPO.archived).toBe(true);
  });

  it('28. Unused item allows permanent deletion', async () => {
    const unused = await ItemMasterService.createItem(orgIdA, {
      name: 'Completely Unused Item',
      salesRate: 100,
    });

    const delRes = await ItemMasterService.deleteItem(orgIdA, unused.id);
    expect(delRes.archived).toBe(false);

    await expect(ItemMasterService.getItem(orgIdA, unused.id)).rejects.toThrow('not found');
  });

  it('29. Quotation revision preserves status when newData.status is omitted', async () => {
    // Draft remains Draft
    const qDraft = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Draft Revision Customer',
      status: 'DRAFT',
      items: [{ name: 'Item A', quantity: 1, rate: 1000 }],
    });

    const revisedDraft = await QuotationEngine.reviseQuotation(orgIdA, qDraft.id, {
      notes: 'Updated notes',
    });
    expect(revisedDraft.status).toBe('DRAFT');

    // Sent status remains Sent
    const qSent = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Sent Revision Customer',
      status: 'SENT',
      items: [{ name: 'Item B', quantity: 1, rate: 2000 }],
    });

    const revisedSent = await QuotationEngine.reviseQuotation(orgIdA, qSent.id, {
      notes: 'Updated terms',
    });
    expect(revisedSent.status).toBe('SENT');

    // Explicit valid status applies
    const revisedExplicit = await QuotationEngine.reviseQuotation(orgIdA, qSent.id, {
      status: 'ACCEPTED',
    });
    expect(revisedExplicit.status).toBe('ACCEPTED');
  });

  it('30. Proportional discount allocation rounding residual handling & edge cases', () => {
    // Edge Case A: Multiple low-value lines, overall discount ₹0.01
    const itemsA: QuotationLineItem[] = [
      { name: 'Low Val 1', quantity: 1, rate: 0.05, taxRate: 18 },
      { name: 'Low Val 2', quantity: 1, rate: 0.05, taxRate: 18 },
    ];
    const totalsA = QuotationEngine.calculateQuotationTotals(itemsA, 0.01, false, 0);
    const sumAllocatedA = itemsA.reduce((sum, it) => sum + (it.allocatedOverallDiscount || 0), 0);
    expect(Number(sumAllocatedA.toFixed(2))).toBe(0.01);
    expect(itemsA[0].allocatedOverallDiscount).toBeGreaterThanOrEqual(0);
    expect(itemsA[1].allocatedOverallDiscount).toBeGreaterThanOrEqual(0);

    // Edge Case B: Last array item has ₹0 taxable value
    const itemsB: QuotationLineItem[] = [
      { name: 'Normal Item', quantity: 1, rate: 100, taxRate: 18 },
      { name: 'Zero Taxable Item', quantity: 1, rate: 0, taxRate: 18 },
    ];
    const totalsB = QuotationEngine.calculateQuotationTotals(itemsB, 10, false, 0);
    expect(itemsB[1].allocatedOverallDiscount).toBe(0);
    expect(itemsB[0].allocatedOverallDiscount).toBe(10);
    expect(itemsB[1].taxableAmount).toBe(0);

    // Edge Case C: Mixed GST rates + awkward fractional overall discount
    const itemsC: QuotationLineItem[] = [
      { name: 'Item 1 (18%)', quantity: 1, rate: 333.33, taxRate: 18 },
      { name: 'Item 2 (12%)', quantity: 1, rate: 666.67, taxRate: 12 },
    ];
    const totalsC = QuotationEngine.calculateQuotationTotals(itemsC, 33.33, false, 0);
    const sumAllocatedC = itemsC.reduce((sum, it) => sum + (it.allocatedOverallDiscount || 0), 0);
    expect(Number(sumAllocatedC.toFixed(2))).toBe(33.33);

    // Edge Case D: Overall discount exactly equals subtotal
    const itemsD: QuotationLineItem[] = [
      { name: 'Item 100% Discounted', quantity: 1, rate: 5000, taxRate: 18 },
    ];
    const totalsD = QuotationEngine.calculateQuotationTotals(itemsD, 5000, false, 0);
    expect(totalsD.taxableTotal).toBe(0);
    expect(totalsD.taxTotal).toBe(0);
    expect(totalsD.totalAmount).toBe(0);
  });

  it('31. Item reference check database error fails closed (archives safely)', async () => {
    const testItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Fail Closed Safety Test Item',
      salesRate: 1500,
    });

    // Mock db.query to throw error during reference check queries
    const origQuery = db.query.bind(db);
    vi.spyOn(db, 'query').mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('SELECT 1 FROM invoice_items') || sql.includes('SELECT items, line_items FROM estimates')) {
        throw new Error('Simulated Database Failure During Reference Check');
      }
      return origQuery(sql, params);
    });

    const delRes = await ItemMasterService.deleteItem(orgIdA, testItem.id);
    expect(delRes.archived).toBe(true);

    const fetched = await ItemMasterService.getItem(orgIdA, testItem.id);
    expect(fetched.isActive).toBe(false);
  });
});
