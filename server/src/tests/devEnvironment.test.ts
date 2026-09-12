import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';
import { DevEnvironmentService } from '../services/DevEnvironmentService';

describe('Local Zero-Auth Dev & Test Environment', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  it('provisions dev environment and returns valid admin session on /dev-login', async () => {
    const res = await request(app)
      .post('/api/v1/auth/dev-login')
      .send({ role: 'Owner' });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('dev@firmbooks.local');
    expect(res.body.user.fullName).toBe('Developer Admin');
    expect(res.body.organizationId).toBe('org-dev-test');
    expect(res.body.token).toBeDefined();

    // Verify token can immediately access /auth/me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe('dev@firmbooks.local');
    expect(meRes.body.organizations.length).toBeGreaterThanOrEqual(1);
    expect(meRes.body.organizations[0].id).toBe('org-dev-test');
  });

  it('allows zero-auth dev login for Accountant and Viewer personas', async () => {
    // Accountant
    const acctRes = await request(app)
      .post('/api/v1/auth/dev-login')
      .send({ role: 'Accountant' });

    expect(acctRes.status).toBe(200);
    expect(acctRes.body.user.email).toBe('accountant@firmbooks.local');
    expect(acctRes.body.token).toBeDefined();

    // Viewer
    const viewRes = await request(app)
      .post('/api/v1/auth/dev-login')
      .send({ role: 'Viewer' });

    expect(viewRes.status).toBe(200);
    expect(viewRes.body.user.email).toBe('viewer@firmbooks.local');
    expect(viewRes.body.token).toBeDefined();
  });

  it('allows re-seeding demo data via /dev-seed', async () => {
    const res = await request(app)
      .post('/api/v1/auth/dev-seed')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Demo data successfully seeded');
  });

  it('pre-seeds sample customers, vendors, and projects in demo org', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/dev-login')
      .send({ role: 'Owner' });

    const authHeaders = {
      Authorization: `Bearer ${loginRes.body.token}`,
      'X-Organization-ID': loginRes.body.organizationId,
    };

    // Check customers
    const custRes = await request(app)
      .get('/api/v1/finance/customers')
      .set(authHeaders);

    expect(custRes.status).toBe(200);
    expect(Array.isArray(custRes.body)).toBe(true);
    expect(custRes.body.length).toBeGreaterThan(0);
    const hasAcme = custRes.body.some((c: any) => (c.display_name || c.displayName || '').includes('Acme Global'));
    expect(hasAcme).toBe(true);

    // Check vendors
    const vendRes = await request(app)
      .get('/api/v1/finance/vendors')
      .set(authHeaders);

    expect(vendRes.status).toBe(200);
    expect(Array.isArray(vendRes.body)).toBe(true);
    expect(vendRes.body.length).toBeGreaterThan(0);

    // Check bank accounts
    const bnkRes = await request(app)
      .get('/api/v1/banking/accounts')
      .set(authHeaders);

    expect(bnkRes.status).toBe(200);
    const bnkAccounts = bnkRes.body.data || bnkRes.body;
    expect(Array.isArray(bnkAccounts)).toBe(true);
    expect(bnkAccounts.length).toBeGreaterThan(0);
  });

  it('strictly blocks dev login when NODE_ENV is production', async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(DevEnvironmentService.devLogin('Owner')).rejects.toThrow('DEV_AUTH_NOT_ALLOWED');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
