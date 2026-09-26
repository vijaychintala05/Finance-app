import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Branding and Document Templates API Tests', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('1. GET /organizations/current returns default branding tokens and document templates', async () => {
    const ownerRes = await request(app).post('/api/v1/auth/register').send({
      email: `branding-test-${Date.now()}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Branding Admin',
      organizationName: 'Emerald Accounting Group',
      country: 'India',
      baseCurrency: 'INR',
    });
    expect(ownerRes.status).toBe(201);
    const authHeaders = {
      Authorization: `Bearer ${ownerRes.body.token}`,
      'X-Organization-ID': ownerRes.body.organizationId,
    };

    const res = await request(app).get('/api/v1/organizations/current').set(authHeaders);
    expect(res.status).toBe(200);
    expect(res.body.profile).toBeDefined();
    expect(res.body.profile.branding).toBeDefined();
    expect(res.body.profile.branding.primaryColor).toBe('#1e40af');
    expect(res.body.profile.branding.accentColor).toBe('#0f172a');
    expect(res.body.profile.branding.fontFamily).toBe('Inter');
    expect(res.body.profile.documentTemplates).toBeDefined();
  });

  it('2. PATCH /organizations/current rejects invalid brand color hex formats with HTTP 400', async () => {
    const ownerRes = await request(app).post('/api/v1/auth/register').send({
      email: `branding-val-${Date.now()}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Validation Admin',
      organizationName: 'Color Test Corp',
      country: 'India',
      baseCurrency: 'INR',
    });
    const authHeaders = {
      Authorization: `Bearer ${ownerRes.body.token}`,
      'X-Organization-ID': ownerRes.body.organizationId,
    };

    // Invalid primaryColor
    const invalidRes1 = await request(app)
      .patch('/api/v1/organizations/current')
      .set(authHeaders)
      .send({
        branding: {
          primaryColor: 'rgb(255, 0, 0)', // Not hex
        },
      });
    expect(invalidRes1.status).toBe(400);
    expect(invalidRes1.body.error).toMatch(/Invalid primary brand color hex format/i);

    // Invalid accentColor
    const invalidRes2 = await request(app)
      .patch('/api/v1/organizations/current')
      .set(authHeaders)
      .send({
        branding: {
          primaryColor: '#059669',
          accentColor: 'blue', // Not hex
        },
      });
    expect(invalidRes2.status).toBe(400);
    expect(invalidRes2.body.error).toMatch(/Invalid accent brand color hex format/i);
  });

  it('3. PATCH /organizations/current updates branding and rejects legacy documentTemplates writes', async () => {
    const ownerRes = await request(app).post('/api/v1/auth/register').send({
      email: `branding-update-${Date.now()}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Branding Executive',
      organizationName: 'Apex Advisory Services',
      country: 'India',
      baseCurrency: 'INR',
    });
    const authHeaders = {
      Authorization: `Bearer ${ownerRes.body.token}`,
      'X-Organization-ID': ownerRes.body.organizationId,
    };

    const logoSampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const patchPayload = {
      logoUrl: logoSampleBase64,
      branding: {
        primaryColor: '#059669',
        accentColor: '#064e3b',
        fontFamily: 'Roboto',
        footerNote: 'Official accounting document powered by Apex Advisory.',
        termsAndConditions: 'All payments due net 15 days upon receipt.',
        authorizedSignatoryTitle: 'Managing Partner',
      },
    };

    const updateRes = await request(app)
      .patch('/api/v1/organizations/current')
      .set(authHeaders)
      .send(patchPayload);

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.profile.logoUrl).toBe(logoSampleBase64);
    expect(updateRes.body.profile.branding.primaryColor).toBe('#059669');
    expect(updateRes.body.profile.branding.accentColor).toBe('#064e3b');
    expect(updateRes.body.profile.branding.fontFamily).toBe('Roboto');
    expect(updateRes.body.profile.branding.authorizedSignatoryTitle).toBe('Managing Partner');

    const beforeLegacyWrite = await request(app).get('/api/v1/organizations/current').set(authHeaders);
    expect(beforeLegacyWrite.status).toBe(200);
    const legacyWriteRes = await request(app)
      .patch('/api/v1/organizations/current')
      .set(authHeaders)
      .send({ documentTemplates: { invoice: { defaultTemplate: 'untrusted-legacy-template' } } });
    expect(legacyWriteRes.status).toBe(400);

    const getRes = await request(app).get('/api/v1/organizations/current').set(authHeaders);
    expect(getRes.status).toBe(200);
    expect(getRes.body.profile.logoUrl).toBe(logoSampleBase64);
    expect(getRes.body.profile.branding.primaryColor).toBe('#059669');
    expect(getRes.body.profile.documentTemplates).toEqual(beforeLegacyWrite.body.profile.documentTemplates);
  });
});
