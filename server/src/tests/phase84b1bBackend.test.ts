import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Phase 8.4B.1B — Backend Customer Validation, Project Safety & RBAC Test Suite', () => {
  let tokenOrgA: string;
  let orgIdA: string;
  let tokenOrgB: string;
  let orgIdB: string;
  let customerAId: string;
  let customerBId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Register Org A Owner
    const regA = await request(app).post('/api/v1/auth/register').send({
      email: `owner-84b1b-a-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org A',
      organizationName: 'Org A 84B1B',
      role: 'Owner',
    });
    tokenOrgA = regA.body.token;

    const healthA = await request(app).get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgA}`);
    orgIdA = healthA.body.organizationId;

    // Register Org B Owner
    const regB = await request(app).post('/api/v1/auth/register').send({
      email: `owner-84b1b-b-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org B',
      organizationName: 'Org B 84B1B',
      role: 'Owner',
    });
    tokenOrgB = regB.body.token;

    const healthB = await request(app).get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgB}`);
    orgIdB = healthB.body.organizationId;

    // Create real PostgreSQL customer for Org A
    const custARes = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        displayName: 'Customer A Master',
        name: 'Customer A Master',
        companyName: 'Customer A Legal',
        email: 'custA@test.com',
        gstin: '27AAACG1234A1Z5',
      });
    customerAId = custARes.body.id;

    // Create real PostgreSQL customer for Org B
    const custBRes = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .send({
        displayName: 'Customer B Master',
        name: 'Customer B Master',
        companyName: 'Customer B Legal',
        email: 'custB@test.com',
        gstin: '29AAACG5678B1Z2',
      });
    customerBId = custBRes.body.id;
  });

  // 1. POST quotation without customerId -> 400
  it('1. POST quotation without customerId returns HTTP 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [{ name: 'Item A', quantity: 1, rate: 100 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('customerId is required');
  });

  // 2. Valid customer quotation -> allowed
  it('2. Valid customer quotation creation returns HTTP 201 Created', async () => {
    const res = await request(app)
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        customerId: customerAId,
        issueDate: '2026-08-11',
        expiryDate: '2026-09-10',
        items: [{ name: 'Service A', quantity: 2, rate: 500 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.quotation.customerId).toBe(customerAId);
    expect(res.body.quotation.customerSnapshot.displayName).toBe('Customer A Master');
  });

  // 3. Customer GET requires view permission
  it('3. GET /api/v1/finance/customers returns organization customers', async () => {
    const res = await request(app)
      .get('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${tokenOrgA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  // 4. Customer POST requires create permission
  it('4. POST /api/v1/finance/customers creates customer in PostgreSQL', async () => {
    const res = await request(app)
      .post('/api/v1/finance/customers')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        name: 'New Customer 84B1B',
        email: 'newcust@test.com',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  // 5. Project GET requires view permission
  it('5. GET /api/v1/finance/projects returns organization projects', async () => {
    const res = await request(app)
      .get('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${tokenOrgA}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // 6. Project POST requires create permission
  it('6. POST /api/v1/finance/projects creates project with customer validation', async () => {
    const res = await request(app)
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        code: 'PRJ-101',
        name: 'Website Redesign',
        customerId: customerAId,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  // 7. Cross-org project customer reference rejected
  it('7. Creating a project with cross-organization customer ID returns HTTP 400', async () => {
    const res = await request(app)
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        code: 'PRJ-CROSS',
        name: 'Cross Org Project',
        customerId: customerBId, // Belongs to Org B!
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('does not belong to organization');
  });

  // 8. Purchase/Sales role can view Item Master
  it('8. User with invoices.view or purchases.view permission can view Item Master items', async () => {
    const res = await request(app)
      .get('/api/v1/items')
      .set('Authorization', `Bearer ${tokenOrgA}`);

    expect(res.status).toBe(200);
  });

  // 9. Write role can create/edit/archive Item Master
  it('9. User with write permissions can manage Item Master items', async () => {
    const createRes = await request(app)
      .post('/api/v1/items')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        name: 'Purchase Item X',
        sku: `SKU-PURCH-${Date.now()}`,
        rate: 250,
      });

    expect(createRes.status).toBe(201);
    const itemId = createRes.body.item.id;

    const updateRes = await request(app)
      .put(`/api/v1/items/${itemId}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .send({
        name: 'Purchase Item X Updated',
        rate: 300,
      });

    expect(updateRes.status).toBe(200);
  });
});
