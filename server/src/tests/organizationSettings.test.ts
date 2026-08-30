import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Organization Settings & Profile API', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('retrieves default organization settings and updates profile with audit logging', async () => {
    const ownerRes = await request(app).post('/api/v1/auth/register').send({
      email: `org-owner-${Date.now()}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Sense Owner',
      organizationName: 'Sense Studios Private Limited',
      country: 'India',
      baseCurrency: 'INR',
    });
    expect(ownerRes.status).toBe(201);
    const ownerAuth = {
      Authorization: `Bearer ${ownerRes.body.token}`,
      'X-Organization-ID': ownerRes.body.organizationId,
    };

    // 1. Fetch current settings
    const currentRes = await request(app).get('/api/v1/organizations/current').set(ownerAuth);
    expect(currentRes.status).toBe(200);
    expect(currentRes.body.name).toBe('Sense Studios Private Limited');
    expect(currentRes.body.country).toBe('India');
    expect(currentRes.body.baseCurrency).toBe('INR');
    expect(currentRes.body.profile).toBeDefined();
    expect(currentRes.body.profile.fiscalYearStart).toBe('April');
    expect(currentRes.body.profile.defaultPaymentTerms).toBe('Net 30');

    // 2. Update profile with business credentials, tax IDs, and bank settlement details
    const patchPayload = {
      name: 'Sense Studios Tech Pvt Ltd',
      legalName: 'Sense Studios Technology Private Limited',
      tradeName: 'Sense Studios',
      taxId: 'U72200TG2020PTC123456',
      gstin: '36AABCU9603R1ZM',
      pan: 'AABCU9603R',
      addressLine1: 'Hitech City, Madhapur',
      addressLine2: 'Phase 2, Cyber Towers',
      city: 'Hyderabad',
      state: 'Telangana',
      postalCode: '500081',
      phone: '+91 98765 43210',
      email: 'finance@sensestudios.com',
      website: 'https://sensestudios.com',
      fiscalYearStart: 'April',
      defaultPaymentTerms: 'Net 45',
      invoicePrefix: 'SENSE-INV-',
      estimatePrefix: 'SENSE-EST-',
      bankName: 'HDFC Bank',
      bankAccountNumber: '50200012345678',
      bankIfscSwift: 'HDFC0001234',
    };

    const updateRes = await request(app)
      .patch('/api/v1/organizations/current')
      .set(ownerAuth)
      .set('Idempotency-Key', `org-update-${Date.now()}`)
      .send(patchPayload);

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe('Sense Studios Tech Pvt Ltd');
    expect(updateRes.body.profile.legalName).toBe('Sense Studios Technology Private Limited');
    expect(updateRes.body.profile.gstin).toBe('36AABCU9603R1ZM');
    expect(updateRes.body.profile.pan).toBe('AABCU9603R');
    expect(updateRes.body.profile.defaultPaymentTerms).toBe('Net 45');
    expect(updateRes.body.profile.invoicePrefix).toBe('SENSE-INV-');
    expect(updateRes.body.profile.bankName).toBe('HDFC Bank');
    expect(updateRes.body.profile.bankAccountNumber).toBe('50200012345678');

    // 3. Verify audit log entry was created
    const auditRes = await request(app).get('/api/v1/security/audit-logs').set(ownerAuth);
    expect(auditRes.status).toBe(200);
    const profileAudit = (auditRes.body.auditLogs || []).find((a: any) => a.action === 'ORGANIZATION_PROFILE_UPDATED');
    expect(profileAudit).toBeDefined();

    // 4. Verify validation errors for invalid organization name
    const badUpdateRes = await request(app)
      .patch('/api/v1/organizations/current')
      .set(ownerAuth)
      .send({ name: 'A' }); // less than 2 characters
    expect(badUpdateRes.status).toBe(400);
  });
});
