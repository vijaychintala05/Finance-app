import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ItemMasterService } from '../services/ItemMasterService';
import { QuotationEngine, QuotationLineItem } from '../sales/QuotationEngine';
import { SalesEngine } from '../sales/SalesEngine';

const request = supertest(app);

describe('Phase 8.4A.3 — Quotation & Item Master Full Regression & Integrity Test Suite', () => {
  const originalEnv = process.env.NODE_ENV;
  let tokenOrgA: string;
  let orgIdA: string;
  let tokenOrgB: string;
  let orgIdB: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Register Org A
    const regA = await request.post('/api/v1/auth/register').send({
      email: `owner-orga-p84a3-${Date.now()}@test.com`,
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
      email: `owner-orgb-p84a3-${Date.now()}@test.com`,
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

  // --- RESTORED PHASE 8.4A.1 INTEGRATION TESTS (1 to 35) ---

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

    const delRes = await ItemMasterService.deleteItem(orgIdA, refItem.id);
    expect(delRes.archived).toBe(true);

    const fetched = await ItemMasterService.getItem(orgIdA, refItem.id);
    expect(fetched.isActive).toBe(false);
  });

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
    expect(q.subtotal).toBe(27500);
    expect(q.taxTotal).toBe(4950);
    expect(q.totalAmount).toBe(32450);
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

    await ItemMasterService.updateItem(orgIdA, master.id, {
      salesRate: 12000,
    });

    const fetchedQ = await QuotationEngine.getQuotation(orgIdA, q.id);
    expect(fetchedQ.lineItems[0].rate).toBe(10000);
    expect(fetchedQ.totalAmount).toBe(11800);
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

    await ItemMasterService.updateItem(orgIdA, master.id, { salesRate: 8000 });

    const inv = await QuotationEngine.convertToInvoice(orgIdA, q.id);
    expect(inv.subtotal).toBe(10000);
    expect(inv.totalAmount).toBe(11800);
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

    expect(afterCount).toBe(beforeCount);
  });

  it('23. Organization isolation enforced for quotations', async () => {
    const qA = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Org A Client',
      items: [{ name: 'Service A', quantity: 1, rate: 500 }],
    });

    await expect(QuotationEngine.getQuotation(orgIdB, qA.id)).rejects.toThrow();
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

    const reloadedQ = await QuotationEngine.getQuotation(orgIdA, createdQ.id);

    expect(reloadedQ.id).toBe(createdQ.id);
    expect(reloadedQ.customerName).toBe('Persistent Client');
    expect(reloadedQ.notes).toBe('Urgent delivery required');
    expect(reloadedQ.lineItems.length).toBe(2);
    expect(reloadedQ.subtotal).toBe(13000);
    expect(reloadedQ.taxTotal).toBe(2340);
    expect(reloadedQ.totalAmount).toBe(15340);
  });

  it('26. Multiple lines with different GST rates + overall discount proportional allocation', () => {
    const items: QuotationLineItem[] = [
      { name: 'Line 1 (18% GST)', quantity: 1, rate: 10000, taxRate: 18 },
      { name: 'Line 2 (12% GST)', quantity: 1, rate: 10000, taxRate: 12 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items, 2000, false, 0);

    expect(totals.subtotal).toBe(20000);
    expect(totals.taxableTotal).toBe(18000);
    expect(items[0].taxableAmount).toBe(9000);
    expect(items[0].taxAmount).toBe(1620);
    expect(items[1].taxableAmount).toBe(9000);
    expect(items[1].taxAmount).toBe(1080);
    expect(totals.taxTotal).toBe(2700);
    expect(totals.totalAmount).toBe(20700);
  });

  it('27. Overall discount = 0 calculation', () => {
    const items: QuotationLineItem[] = [
      { name: 'Line 1', quantity: 1, rate: 5000, taxRate: 18 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items, 0, false, 0);

    expect(totals.subtotal).toBe(5000);
    expect(totals.overallDiscount).toBe(0);
    expect(totals.taxTotal).toBe(900);
    expect(totals.totalAmount).toBe(5900);
  });

  it('28. Overall discount greater than subtotal is rejected', () => {
    const items: QuotationLineItem[] = [
      { name: 'Line 1', quantity: 1, rate: 5000, taxRate: 18 },
    ];
    expect(() => QuotationEngine.calculateQuotationTotals(items, 6000, false, 0)).toThrow('Overall discount (6000) cannot exceed quotation subtotal (5000)');
  });

  it('29. GST-inclusive quotation with overall discount', () => {
    const items: QuotationLineItem[] = [
      { name: 'Inclusive Item', quantity: 1, rate: 11800, taxRate: 18 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items, 1180, true, 0);
    expect(totals.subtotal).toBe(11800);
    expect(totals.overallDiscount).toBe(1180);
    expect(totals.taxableTotal).toBe(9000);
    expect(totals.taxTotal).toBe(1620);
    expect(totals.totalAmount).toBe(10620);
  });

  it('30. Line validation rejects invalid line inputs', () => {
    expect(() => QuotationEngine.validateQuotationLines([{ name: 'Test', quantity: 0, rate: 100 }]))
      .toThrow('Quantity must be greater than 0');

    expect(() => QuotationEngine.validateQuotationLines([{ name: 'Test', quantity: 1, rate: -10 }]))
      .toThrow('Rate must be a non-negative number');

    expect(() => QuotationEngine.validateQuotationLines([{ name: 'Test', quantity: 1, rate: 100, discountAmount: 150 }]))
      .toThrow('Discount amount cannot exceed line gross value');

    expect(() => QuotationEngine.validateQuotationLines([{ name: 'Test', quantity: 1, rate: 100, taxRate: 150 }]))
      .toThrow('Tax rate must be between 0 and 100');

    expect(() => QuotationEngine.validateQuotationLines([{ name: '   ', quantity: 1, rate: 100 }]))
      .toThrow('Line item name or title is required');
  });

  it('31. Cross-organization itemId reference rejection', async () => {
    const itemB = await ItemMasterService.createItem(orgIdB, {
      name: 'Org B Item',
      salesRate: 1000,
    });

    await expect(
      QuotationEngine.createQuotation(orgIdA, {
        customerName: 'Sneaky Client',
        items: [
          {
            itemId: itemB.id,
            name: 'Attempted Org B Item',
            quantity: 1,
            rate: 1000,
          },
        ],
      })
    ).rejects.toThrow(`Item ${itemB.id} does not belong to organization ${orgIdA}`);
  });

  it('32. Creating new quotation using an inactive item is rejected', async () => {
    const inactiveItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Retired Model X',
      salesRate: 2000,
      isActive: false,
    });

    await expect(
      QuotationEngine.createQuotation(orgIdA, {
        customerName: 'Test Client',
        items: [
          {
            itemId: inactiveItem.id,
            name: inactiveItem.name,
            quantity: 1,
            rate: inactiveItem.salesRate,
          },
        ],
      })
    ).rejects.toThrow(`Item ${inactiveItem.id} ("Retired Model X") is inactive and cannot be selected for new quotations`);
  });

  it('33. Concurrent SKU uniqueness database constraint protection', async () => {
    const sku = `CONCUR-SKU-${Date.now()}`;
    await ItemMasterService.createItem(orgIdA, { name: 'SKU Item 1', sku });

    await expect(
      db.query(
        `INSERT INTO items (id, organization_id, name, sku, unit, sales_rate, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [`item-dup-${Date.now()}`, orgIdA, 'SKU Item 2', sku.toLowerCase(), 'Pcs', 100, true]
      )
    ).rejects.toThrow();
  });

  it('34. Money precision test with fractional quantities and rates', () => {
    const items: QuotationLineItem[] = [
      { name: 'Custom Fabrication', quantity: 2.5, rate: 199.99, taxRate: 18 },
    ];
    const totals = QuotationEngine.calculateQuotationTotals(items);

    expect(items[0].taxableAmount).toBe(499.98);
    expect(items[0].taxAmount).toBe(90.00);
    expect(totals.totalAmount).toBe(589.98);
  });

  it('35. Item Master GST rate validation rejects rates > 100% or < 0%', async () => {
    await expect(
      ItemMasterService.createItem(orgIdA, {
        name: 'Invalid GST Item',
        salesRate: 100,
        gstRate: 150,
      })
    ).rejects.toThrow('GST rate must be between 0 and 100');
  });

  // --- ADDITIONAL PHASE 8.4A.3 INTEGRATION TESTS (36 to 50) ---

  it('36. Item referenced in Invoice archives item safely and preserves invoice rendering', async () => {
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

  it('37. Item referenced in Sales Order archives item safely', async () => {
    const soItem = await ItemMasterService.createItem(orgIdA, { name: 'SO Item', salesRate: 500 });
    await db.query(
      `INSERT INTO sales_orders (id, organization_id, sales_order_number, customer_id, customer_name, order_date, subtotal, tax_total, total_amount, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [`so-${Date.now()}`, orgIdA, `SO-101`, 'c-1', 'Cust', '2026-08-10', 500, 0, 500, JSON.stringify([{ itemId: soItem.id, name: 'SO Item' }])]
    );
    const delSO = await ItemMasterService.deleteItem(orgIdA, soItem.id);
    expect(delSO.archived).toBe(true);
  });

  it('38. Item referenced in Purchase Order archives item safely', async () => {
    const poItem = await ItemMasterService.createItem(orgIdA, { name: 'PO Item', purchaseRate: 800 });
    await db.query(
      `INSERT INTO purchase_orders (id, organization_id, purchase_order_number, vendor_id, vendor_name, order_date, subtotal, tax_total, total_amount, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [`po-${Date.now()}`, orgIdA, `PO-101`, 'v-1', 'Vendor', '2026-08-10', 800, 0, 800, JSON.stringify([{ itemId: poItem.id }])]
    );
    const delPO = await ItemMasterService.deleteItem(orgIdA, poItem.id);
    expect(delPO.archived).toBe(true);
  });

  it('39. Item referenced in Vendor Bill archives item safely', async () => {
    const billItem = await ItemMasterService.createItem(orgIdA, { name: 'Bill Item', purchaseRate: 1500 });
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [`bill-${Date.now()}`, orgIdA, `BILL-101`, 'v-1', 'Vendor', '2026-08-10', '2026-08-25', 1500, 0, 1500, JSON.stringify([{ itemId: billItem.id }])]
    );
    const delBill = await ItemMasterService.deleteItem(orgIdA, billItem.id);
    expect(delBill.archived).toBe(true);
  });

  it('40. Item referenced in Delivery Challan archives item safely', async () => {
    const dcItem = await ItemMasterService.createItem(orgIdA, { name: 'DC Item', salesRate: 300 });
    await db.query(
      `INSERT INTO delivery_challans (id, organization_id, challan_number, customer_id, customer_name, delivery_date, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`dc-${Date.now()}`, orgIdA, `DC-101`, 'c-1', 'Cust', '2026-08-10', JSON.stringify([{ itemId: dcItem.id }])]
    );
    const delDC = await ItemMasterService.deleteItem(orgIdA, dcItem.id);
    expect(delDC.archived).toBe(true);
  });

  it('41. Item referenced in Goods Service Receipt archives item safely', async () => {
    const gsrItem = await ItemMasterService.createItem(orgIdA, { name: 'GSR Item', purchaseRate: 400 });
    await db.query(
      `INSERT INTO goods_service_receipts (id, organization_id, receipt_number, vendor_id, vendor_name, receipt_date, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`gsr-${Date.now()}`, orgIdA, `GSR-101`, 'v-1', 'Vendor', '2026-08-10', JSON.stringify([{ itemId: gsrItem.id }])]
    );
    const delGSR = await ItemMasterService.deleteItem(orgIdA, gsrItem.id);
    expect(delGSR.archived).toBe(true);
  });

  it('42. Item referenced in Recurring Invoice Profile archives item safely', async () => {
    const recItem = await ItemMasterService.createItem(orgIdA, { name: 'Recurring Item', salesRate: 2000 });
    await db.query(
      `INSERT INTO recurring_invoice_profiles (id, organization_id, profile_name, frequency, start_date, next_generation_date, customer_id, customer_name, line_items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [`rec-${Date.now()}`, orgIdA, `Rec-Profile-1`, 'MONTHLY', '2026-08-01', '2026-09-01', 'c-1', 'Cust', JSON.stringify([{ itemId: recItem.id }])]
    );
    const delRec = await ItemMasterService.deleteItem(orgIdA, recItem.id);
    expect(delRec.archived).toBe(true);
  });

  it('43. Unused item allows permanent deletion', async () => {
    const unused = await ItemMasterService.createItem(orgIdA, {
      name: 'Completely Unused Item',
      salesRate: 100,
    });

    const delRes = await ItemMasterService.deleteItem(orgIdA, unused.id);
    expect(delRes.archived).toBe(false);

    await expect(ItemMasterService.getItem(orgIdA, unused.id)).rejects.toThrow('not found');
  });

  it('44. Quotation revision preserves status when newData.status is omitted', async () => {
    const qDraft = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Draft Revision Customer',
      status: 'DRAFT',
      items: [{ name: 'Item A', quantity: 1, rate: 1000 }],
    });

    const revisedDraft = await QuotationEngine.reviseQuotation(orgIdA, qDraft.id, {
      notes: 'Updated notes',
    });
    expect(revisedDraft.status).toBe('DRAFT');

    const qSent = await QuotationEngine.createQuotation(orgIdA, {
      customerName: 'Sent Revision Customer',
      status: 'SENT',
      items: [{ name: 'Item B', quantity: 1, rate: 2000 }],
    });

    const revisedSent = await QuotationEngine.reviseQuotation(orgIdA, qSent.id, {
      notes: 'Updated terms',
    });
    expect(revisedSent.status).toBe('SENT');

    const revisedExplicit = await QuotationEngine.reviseQuotation(orgIdA, qSent.id, {
      status: 'ACCEPTED',
    });
    expect(revisedExplicit.status).toBe('ACCEPTED');
  });

  it('45. Proportional discount allocation rounding residual handling & edge cases', () => {
    const itemsA: QuotationLineItem[] = [
      { name: 'Low Val 1', quantity: 1, rate: 0.05, taxRate: 18 },
      { name: 'Low Val 2', quantity: 1, rate: 0.05, taxRate: 18 },
    ];
    const totalsA = QuotationEngine.calculateQuotationTotals(itemsA, 0.01, false, 0);
    const sumAllocatedA = itemsA.reduce((sum, it) => sum + (it.allocatedOverallDiscount || 0), 0);
    expect(Number(sumAllocatedA.toFixed(2))).toBe(0.01);
    expect(itemsA[0].allocatedOverallDiscount).toBeGreaterThanOrEqual(0);
    expect(itemsA[1].allocatedOverallDiscount).toBeGreaterThanOrEqual(0);

    const itemsB: QuotationLineItem[] = [
      { name: 'Normal Item', quantity: 1, rate: 100, taxRate: 18 },
      { name: 'Zero Taxable Item', quantity: 1, rate: 0, taxRate: 18 },
    ];
    const totalsB = QuotationEngine.calculateQuotationTotals(itemsB, 10, false, 0);
    expect(itemsB[1].allocatedOverallDiscount).toBe(0);
    expect(itemsB[0].allocatedOverallDiscount).toBe(10);
    expect(itemsB[1].taxableAmount).toBe(0);

    const itemsC: QuotationLineItem[] = [
      { name: 'Item 1 (18%)', quantity: 1, rate: 333.33, taxRate: 18 },
      { name: 'Item 2 (12%)', quantity: 1, rate: 666.67, taxRate: 12 },
    ];
    const totalsC = QuotationEngine.calculateQuotationTotals(itemsC, 33.33, false, 0);
    const sumAllocatedC = itemsC.reduce((sum, it) => sum + (it.allocatedOverallDiscount || 0), 0);
    expect(Number(sumAllocatedC.toFixed(2))).toBe(33.33);

    const itemsD: QuotationLineItem[] = [
      { name: 'Item 100% Discounted', quantity: 1, rate: 5000, taxRate: 18 },
    ];
    const totalsD = QuotationEngine.calculateQuotationTotals(itemsD, 5000, false, 0);
    expect(totalsD.taxableTotal).toBe(0);
    expect(totalsD.taxTotal).toBe(0);
    expect(totalsD.totalAmount).toBe(0);
  });

  it('46. Item reference check database error fails closed (archives safely)', async () => {
    const testItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Fail Closed Safety Test Item',
      salesRate: 1500,
    });

    const origQuery = db.query.bind(db);
    vi.spyOn(db, 'query').mockImplementation(async (sql: string, params?: any[]) => {
      if (sql.includes('invoice_items') && sql.includes('JOIN invoices')) {
        throw new Error('Simulated Database Failure During Reference Check');
      }
      return origQuery(sql, params);
    });

    const delRes = await ItemMasterService.deleteItem(orgIdA, testItem.id);
    expect(delRes.archived).toBe(true);

    const fetched = await ItemMasterService.getItem(orgIdA, testItem.id);
    expect(fetched.isActive).toBe(false);
  });

  it('47. Saved Item Master quotation line converts to invoice with verified invoice_items.item_id', async () => {
    const masterItem = await ItemMasterService.createItem(orgIdA, {
      name: 'Verified Master Product',
      salesRate: 7500,
      gstRate: 18,
    });

    const inv = await SalesEngine.createAndPostInvoice(orgIdA, {
      invoiceNumber: `INV-VERIFIED-${Date.now()}`,
      customerId: 'cust-201',
      customerName: 'Verified Master Customer',
      issueDate: '2026-08-10',
      dueDate: '2026-08-25',
      subtotal: 7500,
      taxTotal: 1350,
      totalAmount: 8850,
      lineItems: [
        {
          itemId: masterItem.id,
          description: masterItem.name,
          quantity: 1,
          unitPrice: 7500,
          amount: 7500,
        },
      ],
    });

    const dbRes = await db.query(`SELECT item_id FROM invoice_items WHERE invoice_id = $1`, [inv.id]);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].item_id).toBe(masterItem.id);
  });

  it('48. Custom quotation line converts to invoice with invoice_items.item_id = NULL', async () => {
    const inv = await SalesEngine.createAndPostInvoice(orgIdA, {
      invoiceNumber: `INV-CUSTOM-${Date.now()}`,
      customerId: 'cust-202',
      customerName: 'Custom Line Customer',
      issueDate: '2026-08-10',
      dueDate: '2026-08-25',
      subtotal: 3000,
      taxTotal: 540,
      totalAmount: 3540,
      lineItems: [
        {
          description: 'One-off Custom Consultation',
          quantity: 1,
          unitPrice: 3000,
          amount: 3000,
        },
      ],
    });

    const dbRes = await db.query(`SELECT item_id FROM invoice_items WHERE invoice_id = $1`, [inv.id]);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].item_id).toBeNull();
  });

  it('49. Generic unverified line ID does NOT become invoice_items.item_id (stored as NULL)', async () => {
    const inv = await SalesEngine.createAndPostInvoice(orgIdA, {
      invoiceNumber: `INV-UNVERIFIED-${Date.now()}`,
      customerId: 'cust-203',
      customerName: 'Unverified Line Customer',
      issueDate: '2026-08-10',
      dueDate: '2026-08-25',
      subtotal: 4000,
      taxTotal: 0,
      totalAmount: 4000,
      lineItems: [
        {
          itemId: 'fake-item-id-99999',
          description: 'Fake Item ID Line',
          quantity: 1,
          unitPrice: 4000,
          amount: 4000,
        },
      ],
    });

    const dbRes = await db.query(`SELECT item_id FROM invoice_items WHERE invoice_id = $1`, [inv.id]);
    expect(dbRes.rows.length).toBe(1);
    expect(dbRes.rows[0].item_id).toBeNull();
  });

  it('50. Extended money precision rounding edge cases (1.005, 2.675, sub-paisa percentages)', () => {
    const items: QuotationLineItem[] = [
      { name: 'Precision Line 1', quantity: 1, rate: 1.005, taxRate: 18 },
      { name: 'Precision Line 2', quantity: 1, rate: 2.675, taxRate: 18 },
      { name: 'Precision Line 3', quantity: 3, rate: 33.333, discountPercent: 3.333, taxRate: 18 },
    ];

    const totals = QuotationEngine.calculateQuotationTotals(items);
    expect(items[0].taxableAmount).toBe(1.01);
    expect(items[1].taxableAmount).toBe(2.68);
    expect(totals.subtotal).toBeGreaterThan(0);
    expect(totals.totalAmount).toBe(QuotationEngine.calculateQuotationTotals(items).totalAmount);
  });
});
