import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ItemMasterService } from '../services/ItemMasterService';

const request = supertest(app);

describe('Phase 8.4B.1 — Quotation Builder API & Real Backend Integration', () => {
  const originalEnv = process.env.NODE_ENV;
  let tokenOrgA: string;
  let orgIdA: string;
  let tokenOrgB: string;
  let orgIdB: string;

  let customerAId: string;
  let customerBId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Register Org A
    const regA = await request.post('/api/v1/auth/register').send({
      email: `owner-orga-p84b1-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org A',
      organizationName: 'Quotation API Testing Org A',
      role: 'Owner',
    });
    expect(regA.status).toBe(201);
    tokenOrgA = regA.body.token;

    const healthA = await request.get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgA}`);
    orgIdA = healthA.body.organizationId;

    // Register Org B
    const regB = await request.post('/api/v1/auth/register').send({
      email: `owner-orgb-p84b1-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org B',
      organizationName: 'Quotation API Testing Org B',
      role: 'Owner',
    });
    expect(regB.status).toBe(201);
    tokenOrgB = regB.body.token;

    const healthB = await request.get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgB}`);
    orgIdB = healthB.body.organizationId;

    const custARes = await request.post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({ displayName: 'Customer A Org', name: 'Customer A Org' });
    customerAId = custARes.body.id;

    const custBRes = await request.post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .send({ displayName: 'Customer B Org', name: 'Customer B Org' });
    customerBId = custBRes.body.id;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('1. GET quotation list organization isolated', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Org A Isolated Client',
        items: [{ name: 'Org A Service', quantity: 1, rate: 5000 }],
      });
    expect(createRes.status).toBe(201);

    const resA = await request
      .get('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(resA.status).toBe(200);
    expect(resA.body.quotations.length).toBeGreaterThanOrEqual(1);

    const resB = await request
      .get('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .set('x-organization-id', orgIdB);

    expect(resB.status).toBe(200);
    const foundInB = resB.body.quotations.find((q: any) => q.id === createRes.body.quotation.id);
    expect(foundInB).toBeUndefined();
  });

  it('2. POST quotation creates multi-line DRAFT', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Multi Line Client',
        items: [
          { name: 'Hardware Unit', quantity: 2, rate: 10000, taxRate: 18 },
          { name: 'Configuration', quantity: 1, rate: 5000, taxRate: 18 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.quotation.id).toBeDefined();
    expect(res.body.quotation.estimateNumber).toBeDefined();
    expect(res.body.quotation.status).toBe('DRAFT');
    expect(res.body.quotation.subtotal).toBe(25000);
    expect(res.body.quotation.taxTotal).toBe(4500);
    expect(res.body.quotation.totalAmount).toBe(29500);
  });

  it('3. GET quotation returns exact persisted snapshot', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Snapshot Client',
        notes: 'Special terms applied',
        items: [{ name: 'Item Snapshot', quantity: 3, rate: 2000, taxRate: 18 }],
      });

    const getRes = await request
      .get(`/api/v1/quotations/${createRes.body.quotation.id}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(getRes.status).toBe(200);
    expect(getRes.body.quotation.id).toBe(createRes.body.quotation.id);
    expect(getRes.body.quotation.notes).toBe('Special terms applied');
    expect(getRes.body.quotation.totalAmount).toBe(7080);
  });

  it('4. PUT/PATCH updates quotation safely', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Revision Client',
        items: [{ name: 'Initial Line', quantity: 1, rate: 1000 }],
      });

    const qId = createRes.body.quotation.id;

    const putRes = await request
      .put(`/api/v1/quotations/${qId}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        items: [{ name: 'Updated Line', quantity: 2, rate: 1500, taxRate: 18 }],
        changeSummary: 'Increased line items and quantity',
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.quotation.subtotal).toBe(3000);
    expect(putRes.body.quotation.status).toBe('DRAFT');
    expect(putRes.body.quotation.revisionNumber).toBe(1);
  });

  it('5. Server ignores/recalculates manipulated frontend totals', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Hack Attempt Client',
        items: [{ name: 'Expensive Item', quantity: 1, rate: 10000, taxRate: 18 }],
        subtotal: 10,
        taxTotal: 0,
        totalAmount: 10,
      });

    expect(res.status).toBe(201);
    expect(res.body.quotation.subtotal).toBe(10000);
    expect(res.body.quotation.taxTotal).toBe(1800);
    expect(res.body.quotation.totalAmount).toBe(11800);
  });

  it('6. Unauthorized quotation creation rejected', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request.post('/api/v1/quotations').send({
      customerId: customerAId,
      customerName: 'Hacker',
      items: [{ name: 'Free Item', quantity: 1, rate: 0 }],
    });

    expect(res.status).toBe(401);
  });

  it('7. Cross-org quotation retrieval rejected', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Org A Secret Client',
        items: [{ name: 'Item', quantity: 1, rate: 100 }],
      });

    const getRes = await request
      .get(`/api/v1/quotations/${createRes.body.quotation.id}`)
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .set('x-organization-id', orgIdB);

    expect(getRes.status).toBe(404);
  });

  it('8. Conversion endpoint uses saved quotation snapshot', async () => {
    const item = await ItemMasterService.createItem(orgIdA, {
      name: 'Conversion Product',
      salesRate: 4000,
      gstRate: 18,
    });

    const qRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Convert API Client',
        items: [{ itemId: item.id, name: item.name, quantity: 2, rate: item.salesRate, taxRate: item.gstRate }],
      });

    const qId = qRes.body.quotation.id;

    // Update Item Master rate after quotation creation
    await ItemMasterService.updateItem(orgIdA, item.id, { salesRate: 9000 });

    // Convert via API
    const convRes = await request
      .post(`/api/v1/quotations/${qId}/convert-inv`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(convRes.status).toBe(200);
    expect(convRes.body.invoice.subtotal).toBe(8000);
    expect(convRes.body.invoice.totalAmount).toBe(9440);
  });

  it('9. Quotation survives database reload/re-query', async () => {
    const qRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'Requery Client',
        items: [{ name: 'Persistent Line', quantity: 4, rate: 1250, taxRate: 18 }],
      });

    const dbRes = await db.query(`SELECT * FROM estimates WHERE id = $1`, [qRes.body.quotation.id]);
    expect(dbRes.rows.length).toBe(1);
    expect(Number(dbRes.rows[0].total_amount)).toBe(5900);
  });

  it('10. New quotation does not post GL', async () => {
    const glBefore = await db.query(`SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1`, [orgIdA]);

    await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerAId,
        customerName: 'GL Check Client',
        items: [{ name: 'Big Contract', quantity: 1, rate: 500000, taxRate: 18 }],
      });

    const glAfter = await db.query(`SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1`, [orgIdA]);
    expect(Number(glAfter.rows[0].cnt)).toBe(Number(glBefore.rows[0].cnt));
  });
});
