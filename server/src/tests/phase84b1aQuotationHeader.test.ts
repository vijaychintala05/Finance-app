import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SalesEngine } from '../sales/SalesEngine';

const request = supertest(app);

describe('Phase 8.4B.1A — Quotation Header, Customer Master & Project Integration Backend Tests', () => {
  const originalEnv = process.env.NODE_ENV;
  let tokenOrgA: string;
  let orgIdA: string;
  let tokenOrgB: string;
  let orgIdB: string;
  let customerA: any;
  let customerB: any;
  let projectA: any;
  let projectB: any;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Register Org A
    const regA = await request.post('/api/v1/auth/register').send({
      email: `owner-orga-p84b1a-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org A',
      organizationName: 'Quotation Header Testing Org A',
      role: 'Owner',
    });
    expect(regA.status).toBe(201);
    tokenOrgA = regA.body.token;

    const healthA = await request.get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgA}`);
    orgIdA = healthA.body.organizationId;

    // Register Org B
    const regB = await request.post('/api/v1/auth/register').send({
      email: `owner-orgb-p84b1a-${Date.now()}@test.com`,
      password: 'Password123!',
      fullName: 'Owner Org B',
      organizationName: 'Quotation Header Testing Org B',
      role: 'Owner',
    });
    expect(regB.status).toBe(201);
    tokenOrgB = regB.body.token;

    const healthB = await request.get('/api/v1/health').set('Authorization', `Bearer ${tokenOrgB}`);
    orgIdB = healthB.body.organizationId;

    // Create Customer A in Org A
    customerA = await SalesEngine.createCustomer(orgIdA, {
      displayName: 'Customer Org A',
      legalName: 'Acme Org A Corp',
      email: 'customer-a@orga.com',
      phone: '+91 99999 11111',
      gstin: '27AAAAA1111A1Z1',
      billingAddress: '123 Org A Street, Mumbai',
      paymentTerms: 'Net 30',
    });

    // Create Customer B in Org B
    customerB = await SalesEngine.createCustomer(orgIdB, {
      displayName: 'Customer Org B',
      legalName: 'Beta Org B Inc',
      email: 'customer-b@orgb.com',
      gstin: '27BBBBB2222B1Z2',
    });

    // Create Project A in Org A
    const prjARes = await request
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        code: 'PRJ-ORGA-101',
        name: 'Org A Enterprise Portal',
      });
    expect(prjARes.status).toBe(201);
    projectA = prjARes.body;

    // Create Project B in Org B
    const prjBRes = await request
      .post('/api/v1/finance/projects')
      .set('Authorization', `Bearer ${tokenOrgB}`)
      .set('x-organization-id', orgIdB)
      .send({
        code: 'PRJ-ORGB-202',
        name: 'Org B Secret Infra',
      });
    expect(prjBRes.status).toBe(201);
    projectB = prjBRes.body;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('1. Valid same-org customerId accepted', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        items: [{ name: 'Development Service', quantity: 1, rate: 10000 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.quotation.customerId).toBe(customerA.id);
    expect(res.body.quotation.customerName).toBe('Customer Org A');
  });

  it('2. Random customerId rejected', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: 'random-nonexistent-cust-id',
        items: [{ name: 'Service', quantity: 1, rate: 1000 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('3. Cross-org customerId rejected', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerB.id,
        items: [{ name: 'Cross Org Hack', quantity: 1, rate: 5000 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong to organization/i);
  });

  it('4. Quotation stores customer snapshot', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        items: [{ name: 'Consulting', quantity: 2, rate: 5000 }],
      });

    expect(res.status).toBe(201);
    const q = res.body.quotation;
    expect(q.customerSnapshot).toBeDefined();
    expect(q.customerSnapshot.displayName).toBe('Customer Org A');
    expect(q.customerSnapshot.gstin).toBe('27AAAAA1111A1Z1');
    expect(q.customerSnapshot.email).toBe('customer-a@orga.com');
  });

  it('5. Customer Master change does not alter saved quotation snapshot', async () => {
    const qRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        items: [{ name: 'Fixed Snapshot Line', quantity: 1, rate: 8000 }],
      });

    expect(qRes.status).toBe(201);
    const qId = qRes.body.quotation.id;

    // Mutate Customer Master
    await db.query(`UPDATE customers SET display_name = 'Changed Name Later', gstin = '99CHANGED99' WHERE id = $1`, [customerA.id]);

    // Fetch saved quotation
    const getRes = await request
      .get(`/api/v1/quotations/${qId}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(getRes.status).toBe(200);
    expect(getRes.body.quotation.customerSnapshot.displayName).toBe('Customer Org A');
    expect(getRes.body.quotation.customerSnapshot.gstin).toBe('27AAAAA1111A1Z1');
  });

  it('6. Draft customer change persists', async () => {
    const custA2 = await SalesEngine.createCustomer(orgIdA, {
      displayName: 'Customer A2',
      email: 'a2@test.com',
    });

    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        items: [{ name: 'Initial Line', quantity: 1, rate: 2000 }],
      });

    const qId = createRes.body.quotation.id;

    const putRes = await request
      .put(`/api/v1/quotations/${qId}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: custA2.id,
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.quotation.customerId).toBe(custA2.id);
    expect(putRes.body.quotation.customerName).toBe('Customer A2');
    expect(putRes.body.quotation.customerSnapshot.displayName).toBe('Customer A2');
  });

  it('7. Draft issue date change persists', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        issueDate: '2026-03-01',
        expiryDate: '2026-03-31',
        items: [{ name: 'Item', quantity: 1, rate: 1000 }],
      });

    const qId = createRes.body.quotation.id;

    const putRes = await request
      .put(`/api/v1/quotations/${qId}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        issueDate: '2026-03-10',
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.quotation.issueDate).toBe('2026-03-10');
  });

  it('8. Draft expiry date change persists', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        issueDate: '2026-03-01',
        expiryDate: '2026-03-31',
        items: [{ name: 'Item', quantity: 1, rate: 1000 }],
      });

    const qId = createRes.body.quotation.id;

    const putRes = await request
      .put(`/api/v1/quotations/${qId}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        expiryDate: '2026-04-15',
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.quotation.expiryDate).toBe('2026-04-15');
  });

  it('9. Invalid expiry-before-issue rejected', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        issueDate: '2026-05-15',
        expiryDate: '2026-05-10',
        items: [{ name: 'Invalid Dates', quantity: 1, rate: 1000 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expiry date cannot precede issue date/i);
  });

  it('10. Project persists if project support retained', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        projectId: projectA.id,
        items: [{ name: 'Project Milestone Line', quantity: 1, rate: 50000 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.quotation.projectId).toBe(projectA.id);

    const getRes = await request
      .get(`/api/v1/quotations/${res.body.quotation.id}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(getRes.status).toBe(200);
    expect(getRes.body.quotation.projectId).toBe(projectA.id);
  });

  it('11. Cross-org projectId rejected if supported', async () => {
    const res = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        projectId: projectB.id,
        items: [{ name: 'Sneaky Project', quantity: 1, rate: 5000 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/does not belong to organization/i);
  });

  it('12. Full revision snapshot contains header + lines + totals', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        projectId: projectA.id,
        items: [{ name: 'Revision Full Snap Item', quantity: 2, rate: 6000, taxRate: 18 }],
      });

    const qId = createRes.body.quotation.id;

    const revsRes = await db.query(`SELECT * FROM quotation_revisions WHERE quotation_id = $1`, [qId]);
    expect(revsRes.rows.length).toBeGreaterThanOrEqual(1);

    const snapshot = typeof revsRes.rows[0].revision_data === 'string'
      ? JSON.parse(revsRes.rows[0].revision_data)
      : revsRes.rows[0].revision_data;

    expect(snapshot.estimateNumber).toBeDefined();
    expect(snapshot.customerId).toBe(customerA.id);
    expect(snapshot.customerSnapshot).toBeDefined();
    expect(snapshot.projectId).toBe(projectA.id);
    expect(snapshot.items.length).toBe(1);
    expect(snapshot.totals.totalAmount).toBe(14160);
  });

  it('13. Updating omitted header fields preserves existing values', async () => {
    const createRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        projectId: projectA.id,
        notes: 'Original Notes Preserved',
        items: [{ name: 'Original Line', quantity: 1, rate: 3000 }],
      });

    const qId = createRes.body.quotation.id;

    const putRes = await request
      .put(`/api/v1/quotations/${qId}`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        changeSummary: 'Updated only line quantity',
        items: [{ name: 'Original Line', quantity: 2, rate: 3000 }],
      });

    expect(putRes.status).toBe(200);
    expect(putRes.body.quotation.customerId).toBe(customerA.id);
    expect(putRes.body.quotation.projectId).toBe(projectA.id);
    expect(putRes.body.quotation.notes).toBe('Original Notes Preserved');
  });

  it('14. Conversion uses saved customer snapshot/customer ID correctly', async () => {
    const qRes = await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        items: [{ name: 'Convert Snapshot Product', quantity: 1, rate: 15000, taxRate: 18 }],
      });

    const qId = qRes.body.quotation.id;

    const convRes = await request
      .post(`/api/v1/quotations/${qId}/convert-inv`)
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA);

    expect(convRes.status).toBe(200);
    expect(convRes.body.invoice.customerId).toBe(customerA.id);
    expect(convRes.body.invoice.totalAmount).toBe(17700);
  });

  it('15. Quotation remains GL-neutral', async () => {
    const glBefore = await db.query(`SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1`, [orgIdA]);

    await request
      .post('/api/v1/quotations')
      .set('Authorization', `Bearer ${tokenOrgA}`)
      .set('x-organization-id', orgIdA)
      .send({
        customerId: customerA.id,
        items: [{ name: 'Huge Contract Line', quantity: 1, rate: 1000000, taxRate: 18 }],
      });

    const glAfter = await db.query(`SELECT COUNT(*) as cnt FROM journal_entries WHERE organization_id = $1`, [orgIdA]);
    expect(Number(glAfter.rows[0].cnt)).toBe(Number(glBefore.rows[0].cnt));
  });
});
