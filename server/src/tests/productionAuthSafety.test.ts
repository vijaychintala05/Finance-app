import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';

const request = supertest(app);

describe('Phase 8.3C — Production Authentication & Security Hardening Tests', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;
  let validToken: string;
  let testOrgId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'production-auth-test-secret-at-least-32-characters-long';
    await MigrationRunner.runMigrations();

    const regRes = await request.post('/api/v1/auth/register').send({
      email: `owner-prod-${Date.now()}@prodauth.com`,
      password: 'SecurePassword123!',
      fullName: 'Production Test Owner',
      organizationName: 'Production Auth Test Org',
      role: 'Owner',
    });

    expect(regRes.status).toBe(201);
    validToken = regRes.body.token;

    const healthRes = await request
      .get('/api/v1/health')
      .set('Authorization', `Bearer ${validToken}`);

    testOrgId = healthRes.body.organizationId;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  it('1. Production request without JWT returns HTTP 401 Unauthorized for Global Search', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request
      .get('/api/v1/search?q=test')
      .set('x-organization-id', testOrgId);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('2. Production request with invalid/tampered JWT returns HTTP 401 Unauthorized', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request
      .get('/api/v1/search?q=test')
      .set('Authorization', 'Bearer invalid-token-sig-xyz')
      .set('x-organization-id', testOrgId);

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('3. Production request with developer identity headers cannot bypass authentication', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request
      .get('/api/v1/search?q=test')
      .set('x-user-id', 'usr-fake-admin')
      .set('x-user-email', 'fake-admin@domain.com')
      .set('x-organization-id', testOrgId);

    expect(res.status).toBe(401);
  });

  it('4. Production request with valid JWT succeeds and accesses protected search API', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request
      .get('/api/v1/search?q=test')
      .set('Authorization', `Bearer ${validToken}`)
      .set('x-organization-id', testOrgId);

    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
  });

  it('5. Default ORG-2026-PRIMARY does not grant unauthenticated Super Admin access in production', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request
      .get('/api/v1/dashboard-summary')
      .set('x-user-id', 'unauthorized-user');

    expect(res.status).toBe(401);
  });

  it('6. Production financial APIs across Sales, Purchases, Banking, Security and Search require valid JWT authentication', async () => {
    process.env.NODE_ENV = 'production';

    // Sales
    const quotesRes = await request.get('/api/v1/quotations/templates');
    expect(quotesRes.status).toBe(401);

    // Items / Inventory
    const itemsRes = await request.get('/api/v1/items');
    expect(itemsRes.status).toBe(401);

    // Banking
    const bankingRes = await request.get('/api/v1/banking/statements');
    expect(bankingRes.status).toBe(401);

    // Security / Audit
    const auditRes = await request.get('/api/v1/security/audit-trail');
    expect(auditRes.status).toBe(401);

    // Global Search
    const searchRes = await request.get('/api/v1/search?q=invoice');
    expect(searchRes.status).toBe(401);
  });
});
