import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';

describe('Phase 8.5A — Quotation Template Security & Validation Tests', () => {
  let tokenA: string;
  let authHeaderA: { Authorization: string };
  let orgIdA: string;

  let tokenB: string;
  let authHeaderB: { Authorization: string };
  let orgIdB: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  beforeEach(async () => {
    const timestampA = Date.now() + Math.floor(Math.random() * 10000);
    const regResA = await request(app).post('/api/v1/auth/register').send({
      email: `admin-85a-tmpl-a-${timestampA}@test.com`,
      password: 'Password123!',
      fullName: 'Org A Admin',
      organizationName: `Org A ${timestampA}`,
      role: 'Admin',
    });
    tokenA = regResA.body.token;
    authHeaderA = { Authorization: `Bearer ${tokenA}` };
    orgIdA = regResA.body.organizationId;

    const timestampB = Date.now() + Math.floor(Math.random() * 10000);
    const regResB = await request(app).post('/api/v1/auth/register').send({
      email: `admin-85a-tmpl-b-${timestampB}@test.com`,
      password: 'Password123!',
      fullName: 'Org B Admin',
      organizationName: `Org B ${timestampB}`,
      role: 'Admin',
    });
    tokenB = regResB.body.token;
    authHeaderB = { Authorization: `Bearer ${tokenB}` };
    orgIdB = regResB.body.organizationId;
  });

  // 1. Org A creates template
  it('1. Org A creates quotation template successfully', async () => {
    const res = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        name: 'Org A Premium Template',
        templateType: 'Modern',
        primaryColor: '#2563eb',
        fontFamily: 'Roboto',
        showLogo: true,
        isDefault: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.template).toBeDefined();
    expect(res.body.template.name).toBe('Org A Premium Template');
    expect(res.body.template.organizationId).toBe(orgIdA);
    expect(res.body.template.isDefault).toBe(true);
  });

  // 2. Org A lists template & Org B cannot see it
  it('2. Org B cannot see Org A templates', async () => {
    const tmplRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        name: 'Org A Secret Style',
        templateType: 'Minimalist',
      });
    const tmplId = tmplRes.body.template.id;

    // Org A lists templates -> sees it
    const listARes = await request(app)
      .get('/api/v1/quotations/templates')
      .set(authHeaderA);
    expect(listARes.body.templates.some((t: any) => t.id === tmplId)).toBe(true);

    // Org B lists templates -> does NOT see it
    const listBRes = await request(app)
      .get('/api/v1/quotations/templates')
      .set(authHeaderB);
    expect(listBRes.body.templates.some((t: any) => t.id === tmplId)).toBe(false);
  });

  // 3. Org B cannot update Org A template using Org A template ID
  it('3. Org B cannot update Org A template using Org A template ID (cross-org protection)', async () => {
    const tmplRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        name: 'Org A Original Template',
        primaryColor: '#10b981',
      });
    const tmplId = tmplRes.body.template.id;

    // Org B attempts to update Org A's template ID
    const updateRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderB)
      .send({
        id: tmplId,
        name: 'HACKED BY ORG B',
      });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.error).toMatch(/forbidden|Cross-organization/i);

    // Verify Org A's template remains unchanged
    const listARes = await request(app)
      .get('/api/v1/quotations/templates')
      .set(authHeaderA);
    const tmplA = listARes.body.templates.find((t: any) => t.id === tmplId);
    expect(tmplA.name).toBe('Org A Original Template');
  });

  // 4. Org A can update its own template
  it('4. Org A can update its own template', async () => {
    const createRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        name: 'Initial Name',
        primaryColor: '#1e40af',
      });
    const tmplId = createRes.body.template.id;

    const updateRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        id: tmplId,
        name: 'Updated Name by Org A',
        primaryColor: '#3b82f6',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.template.name).toBe('Updated Name by Org A');
    expect(updateRes.body.template.primaryColor).toBe('#3b82f6');
  });

  // 5. Single default template per organization & independent defaults for Org A and Org B
  it('5. Enforces single default template per org, while Org A and Org B have independent defaults', async () => {
    const tmplA1 = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({ name: 'Org A Template 1', isDefault: true });

    const tmplA2 = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({ name: 'Org A Template 2', isDefault: true });

    const tmplB1 = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderB)
      .send({ name: 'Org B Template 1', isDefault: true });

    // Org A list templates check
    const listA = await request(app).get('/api/v1/quotations/templates').set(authHeaderA);
    const a1 = listA.body.templates.find((t: any) => t.id === tmplA1.body.template.id);
    const a2 = listA.body.templates.find((t: any) => t.id === tmplA2.body.template.id);

    expect(a1.isDefault).toBe(false);
    expect(a2.isDefault).toBe(true);

    // Org B list templates check
    const listB = await request(app).get('/api/v1/quotations/templates').set(authHeaderB);
    const b1 = listB.body.templates.find((t: any) => t.id === tmplB1.body.template.id);
    expect(b1.isDefault).toBe(true);
  });

  // 6. Template Validation: invalid color and unsupported font
  it('6. Rejects invalid primaryColor format and unsupported fontFamily', async () => {
    const colorRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        name: 'Bad Color Template',
        primaryColor: 'INVALID_HEX',
      });
    expect(colorRes.status).toBe(400);
    expect(colorRes.body.error).toMatch(/primaryColor/i);

    const fontRes = await request(app)
      .post('/api/v1/quotations/templates')
      .set(authHeaderA)
      .send({
        name: 'Bad Font Template',
        fontFamily: 'ComicSansUnsafe',
      });
    expect(fontRes.status).toBe(400);
    expect(fontRes.body.error).toMatch(/fontFamily/i);
  });
});
