import { beforeAll, describe, expect, it } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { MigrationRunner } from '../database/migrationRunner';
import { db } from '../database/db';

const request = supertest(app);

describe('dashboard due-date serialization', () => {
  let ownerAuth: { Authorization: string };
  let organizationId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    const registration = await request.post('/api/v1/auth/register').send({
      email: `dashboard-due-date-${Date.now()}@firmbooks.local`,
      password: 'SecurePassword123!',
      fullName: 'Dashboard Due Date Owner',
      organizationName: 'Dashboard Due Date Organization',
      role: 'Owner',
    });
    ownerAuth = { Authorization: `Bearer ${registration.body.token}` };
    organizationId = registration.body.organizationId;
  });

  // Regression coverage for QA-2026-09-21-001: date objects must not be shortened to weekday/month text.
  it('returns full ISO due dates for dashboard collection cards', async () => {
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ('dashboard-due-date-invoice', $1, 'INV-DUE-DATE', 'Calendar Customer', '2026-09-01', '2026-09-26', 125, 125, 'POSTED')`,
      [organizationId],
    );

    const response = await request
      .get('/api/v1/dashboard?view=overview&asOfDate=2026-09-21')
      .set(ownerAuth);

    expect(response.status).toBe(200);
    expect(response.body.dashboard.overview.collections).toEqual(expect.arrayContaining([
      expect.objectContaining({ partyName: 'Calendar Customer', dueDate: '2026-09-26', overdue: false }),
    ]));
  });
});
