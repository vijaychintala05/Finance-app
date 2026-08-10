import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ItemMasterService } from '../services/ItemMasterService';
import { QuotationEngine, QuotationLineItem } from '../sales/QuotationEngine';

const request = supertest(app);

describe('Phase 8.4A — Quotation & Item/Service Master Production Foundation Tests', () => {
  const originalEnv = process.env.NODE_ENV;
  let tokenOrgA: string;
  let orgIdA: string;
  let tokenOrgB: string;
  let orgIdB: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Register Org A
    const regA = await request.post('/api/v1/auth/register').send({
      email: `owner-orga-${Date.now()}@test.com`,
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
      email: `owner-orgb-${Date.now()}@test.com`,
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
    expect(res.body.error).toContain('non-negative');
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
          itemName: refItem.name,
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
          itemName: masterItem.name,
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

  it('15. Backend calculates quotation totals', () => {
    const items: QuotationLineItem[] = [
      { name: 'Service A', quantity: 2, rate: 5000, taxRate: 18 },
      { name: 'Service B', quantity: 1, rate: 10000, taxRate: 18 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items, 2000, false, 0);

    expect(totals.subtotal).toBe(20000);
    expect(totals.overallDiscount).toBe(2000);
    expect(totals.taxableTotal).toBe(18000);
    expect(totals.taxTotal).toBe(3600); // 18000 * 18%
    expect(totals.totalAmount).toBe(21600);
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
});
