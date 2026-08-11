import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';

describe('Phase 8.4B.1C — Backend Customer Search, Isolation & RBAC Test Suite', () => {
  let salesToken: string;
  let purchaseToken: string;
  let viewerToken: string;
  let orgAToken: string;
  let orgBToken: string;
  let itemIdToTest: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    const timestamp = Date.now();

    // 1. Sales User Registration
    const salesReg = await request(app).post('/api/v1/auth/register').send({
      email: `sales-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Sales User',
      organizationName: `Org Sales ${timestamp}`,
      role: 'Sales',
    });
    salesToken = salesReg.body.token;

    // 2. Purchase User Registration
    const purchaseReg = await request(app).post('/api/v1/auth/register').send({
      email: `purchase-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Purchase User',
      organizationName: `Org Purchase ${timestamp}`,
      role: 'Purchase',
    });
    purchaseToken = purchaseReg.body.token;

    // 3. Viewer User Registration
    const viewerReg = await request(app).post('/api/v1/auth/register').send({
      email: `viewer-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Viewer User',
      organizationName: `Org Viewer ${timestamp}`,
      role: 'Viewer',
    });
    viewerToken = viewerReg.body.token;

    // 4. Org A Token
    const orgAReg = await request(app).post('/api/v1/auth/register').send({
      email: `orga-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Org A Owner',
      organizationName: `Org A ${timestamp}`,
      role: 'Owner',
    });
    orgAToken = orgAReg.body.token;

    // 5. Org B Token
    const orgBReg = await request(app).post('/api/v1/auth/register').send({
      email: `orgb-84b1c-${timestamp}@test.com`,
      password: 'Password123!',
      fullName: 'Org B Owner',
      organizationName: `Org B ${timestamp}`,
      role: 'Owner',
    });
    orgBToken = orgBReg.body.token;

    // Create item under Sales role for testing updates/deletions
    const itemRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({
        name: 'Initial Sales Item',
        sku: `SKU-SALE-${timestamp}`,
        rate: 100,
      });
    itemIdToTest = itemRes.body.item.id;
  });

  // --- 1. Customer Search & Organization Security Tests ---
  it('1. GET /finance/customers?search=Alpha filters results and isolates cross-org customers', async () => {
    // Org A creates "Alpha Customer" & "Beta Customer"
    await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'Alpha Customer', email: 'alpha@orga.com' });

    await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${orgAToken}`)
      .send({ name: 'Beta Customer', email: 'beta@orga.com' });

    // Org B creates "Alpha Other Org"
    await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${orgBToken}`)
      .send({ name: 'Alpha Other Org', email: 'alpha@orgb.com' });

    // Query Org A for "Alpha"
    const resA = await request(app)
      .get('/api/v1/finance/customers?search=Alpha')
      .set('Authorization', `Bearer ${orgAToken}`);

    expect(resA.status).toBe(200);
    expect(resA.body.length).toBe(1);
    expect(resA.body[0].display_name || resA.body[0].displayName).toBe('Alpha Customer');
  });

  it('2. Customer search handles SQL injection attempts safely via parameterized queries', async () => {
    const res = await request(app)
      .get("/api/v1/finance/customers?search=' OR 1=1 --")
      .set('Authorization', `Bearer ${orgAToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should not dump all rows or cause SQL error
  });

  // --- 2. Sales Role RBAC Tests ---
  it('3. Sales role GET /finance/customers returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
  });

  it('4. Sales role POST /finance/customers returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales Added Customer' });
    expect(res.status).toBe(201);
  });

  it('5. Sales role GET /items returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(200);
  });

  it('6. Sales role POST /items returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales Created Item', sku: `SKU-${Date.now()}` });
    expect(res.status).toBe(201);
  });

  it('7. Sales role PUT /items/:id returns HTTP 200', async () => {
    const res = await request(app)
      .put(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ name: 'Sales Updated Item' });
    expect(res.status).toBe(200);
  });

  it('8. Sales role DELETE /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(res.status).toBe(403);
  });

  // --- 3. Purchase Role RBAC Tests ---
  it('9. Purchase role GET /finance/customers returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(200);
  });

  it('10. Purchase role POST /finance/customers returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Added Customer' });
    expect(res.status).toBe(201);
  });

  it('11. Purchase role GET /finance/projects returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(200);
  });

  it('12. Purchase role POST /finance/projects returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ code: 'PRJ-PURCH', name: 'Purchase Added Project' });
    expect(res.status).toBe(201);
  });

  it('13. Purchase role GET /items returns HTTP 200', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(200);
  });

  it('14. Purchase role POST /items returns HTTP 201', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Created Item', sku: `SKU-P-${Date.now()}` });
    expect(res.status).toBe(201);
  });

  it('15. Purchase role PUT /items/:id returns HTTP 200', async () => {
    const itemRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Item To Edit', sku: `SKU-PE-${Date.now()}` });

    const itemId = itemRes.body.item.id;

    const res = await request(app)
      .put(`/api/v1/items/${itemId}`)
      .set('Authorization', `Bearer ${purchaseToken}`)
      .send({ name: 'Purchase Updated Item' });
    expect(res.status).toBe(200);
  });

  it('16. Purchase role DELETE /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${purchaseToken}`);
    expect(res.status).toBe(403);
  });

  // --- 4. Viewer Role RBAC Tests ---
  it('17. Viewer role GET /finance/customers returns HTTP 200 (read-only allowed)', async () => {
    const res = await request(app)
      .get('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it('18. Viewer role POST /finance/customers returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Customer' });
    expect(res.status).toBe(403);
  });

  it('19. Viewer role POST /finance/projects returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Project' });
    expect(res.status).toBe(403);
  });

  it('20. Viewer role POST /items returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Item' });
    expect(res.status).toBe(403);
  });

  it('21. Viewer role PUT /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .put(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Forbidden Edit' });
    expect(res.status).toBe(403);
  });

  it('22. Viewer role DELETE /items/:id returns HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .delete(`/api/v1/items/${itemIdToTest}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });
});
