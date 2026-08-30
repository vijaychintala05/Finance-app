import { beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';

const request = supertest(app);

describe('role-adaptive dashboard API', () => {
  let ownerAuth: { Authorization: string };

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    const registration = await request.post('/api/v1/auth/register').send({
      email: `dashboard-owner-${Date.now()}@firmbooks.local`,
      password: 'SecurePassword123!',
      fullName: 'Dashboard Owner',
      organizationName: 'Dashboard Test Organization',
      role: 'Owner',
    });
    ownerAuth = { Authorization: `Bearer ${registration.body.token}` };
  });

  it('returns a tenant-scoped dashboard contract with authorized views only', async () => {
    const response = await request
      .get('/api/v1/dashboard?view=overview&asOfDate=2026-08-23')
      .set(ownerAuth);

    expect(response.status).toBe(200);
    expect(response.body.dashboard.view).toBe('overview');
    expect(response.body.dashboard.asOfDate).toBe('2026-08-23');
    expect(response.body.dashboard.availableViews).toEqual(expect.arrayContaining(['overview', 'cash-operations', 'close-controls']));
    expect(response.body.dashboard.overview.receivables).toBe(0);
    expect(response.body.dashboard.closeControls.available).toBe(true);
    expect(response.body.dashboard.cashOperations.forecast.available).toBe(false);
  });

  it('rejects invalid date and unauthorized view inputs instead of silently changing them', async () => {
    const invalidDate = await request.get('/api/v1/dashboard?asOfDate=2026-02-31').set(ownerAuth);
    expect(invalidDate.status).toBe(400);
    expect(invalidDate.body.error).toContain('DASHBOARD_DATE_INVALID');

    const invalidView = await request.get('/api/v1/dashboard?view=executive-forecast').set(ownerAuth);
    expect(invalidView.status).toBe(400);
    expect(invalidView.body.error).toContain('DASHBOARD_VIEW_INVALID');
  });

  it('returns GST return evidence without claiming a portal filing integration', async () => {
    const response = await request.get('/api/v1/finance/gst/return-summary?period=2026-08').set(ownerAuth);
    expect(response.status).toBe(200);
    expect(response.body.summary.periodKey).toBe('2026-08');
    expect(response.body.summary.integrity).toHaveProperty('isBalanced');
    expect(response.body.summary.readiness.some((item: { code: string; passed: boolean }) => item.code === 'FILING' && !item.passed)).toBe(true);
  });
});
