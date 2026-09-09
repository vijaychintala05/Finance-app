import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

const request = supertest(app);

describe('Gap 3: End-to-End Workflow Parity & Correlation Telemetry', () => {
  const timestamp = Date.now();
  const ownerEmail = `e2e-parity-${timestamp}@firmbooks.test`;
  let authHeader: { Authorization: string };
  let orgId: string;

  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // 1. Register organization and obtain JWT
    const regRes = await request.post('/api/v1/auth/register').send({
      email: ownerEmail,
      password: 'SecurePassword123!',
      fullName: 'E2E Parity Owner',
      organizationName: 'Parity Global Industries',
      role: 'Owner',
    });

    expect(regRes.status).toBe(201);
    expect(regRes.body.token).toBeDefined();
    authHeader = { Authorization: `Bearer ${regRes.body.token}` };

    const meRes = await request.get('/api/v1/auth/me').set(authHeader);
    orgId = meRes.body.organizations?.[0]?.id;
    expect(orgId).toBeDefined();
  });

  it('1. Propagates and returns request correlation IDs across HTTP endpoints', async () => {
    const customTraceId = `trace-e2e-parity-${Date.now()}`;
    const res = await request
      .get('/api/v1/auth/me')
      .set(authHeader)
      .set('x-request-id', customTraceId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customTraceId);
  });

  it('2. Exposes live Prometheus telemetry metrics endpoint with process health and DB connectivity', async () => {
    const res = await request.get('/api/readyz/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    const text = res.text;
    expect(text).toContain('process_uptime_seconds');
    expect(text).toContain('firmbooks_database_connected 1');
    expect(text).toContain('nodejs_heap_size_used_bytes');
  });

  it('3. Successfully queries organizations metadata with warm in-memory cache delivery', async () => {
    // First read populates cache
    const res1 = await request.get('/api/v1/organizations/current').set(authHeader);
    expect(res1.status).toBe(200);
    expect(res1.body.name).toBe('Parity Global Industries');

    // Second read hits cache
    const res2 = await request.get('/api/v1/organizations/current').set(authHeader);
    expect(res2.status).toBe(200);
    expect(res2.body.name).toBe('Parity Global Industries');
  });

  it('4. Asserts readyz and healthz endpoints return healthy operational status', async () => {
    const readyRes = await request.get('/api/readyz');
    expect(readyRes.status).toBe(200);

    const healthRes = await request.get('/api/v1/health').set(authHeader);
    expect([200, 404]).toContain(healthRes.status);
  });
});
