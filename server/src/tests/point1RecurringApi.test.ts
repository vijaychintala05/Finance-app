import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Point-1 recurring transaction API', () => {
  beforeAll(async () => {
    delete process.env.TRUSTED_FINANCE_FEATURES;
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('creates, pauses, resumes, materializes, and posts a durable invoice schedule', async () => {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `recurring-${Date.now()}@example.test`,
      password: 'SecurePassword123!',
      fullName: 'Recurring Owner',
      organizationName: 'Recurring Test Firm',
    });
    expect(registration.status).toBe(201);
    const auth = { Authorization: `Bearer ${registration.body.token}` };
    const customer = await request(app)
      .post('/api/v1/finance/customers')
      .set(auth)
      .set('Idempotency-Key', `customer-${Date.now()}`)
      .send({ name: 'Subscription Customer', email: 'subscriber@example.test' });
    expect(customer.status).toBe(201);

    const today = new Date().toISOString().slice(0, 10);
    const created = await request(app)
      .post('/api/v1/recurring/profiles')
      .set(auth)
      .set('Idempotency-Key', `profile-${Date.now()}`)
      .send({
        name: 'Monthly support subscription',
        kind: 'INVOICE',
        frequency: 'MONTHLY',
        startDate: today,
        catchUpPolicy: 'ALL',
        maxCatchUp: 12,
        template: {
          customerId: customer.body.id,
          customerName: 'Subscription Customer',
          lineItems: [{ description: 'Support subscription', quantity: 1, unitPrice: 125, taxRate: 0, amount: 125 }],
        },
      });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ kind: 'INVOICE', status: 'ACTIVE' });

    const paused = await request(app)
      .post(`/api/v1/recurring/profiles/${created.body.id}/pause`)
      .set(auth).set('Idempotency-Key', `pause-${Date.now()}`);
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe('PAUSED');
    const resumed = await request(app)
      .post(`/api/v1/recurring/profiles/${created.body.id}/resume`)
      .set(auth).set('Idempotency-Key', `resume-${Date.now()}`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe('ACTIVE');

    const run = await request(app)
      .post('/api/v1/recurring/run')
      .set(auth).set('Idempotency-Key', `run-${Date.now()}`)
      .send({ asOfDate: today });
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ claimed: 1 });
    expect(run.body.completed).toHaveLength(1);

    const occurrence = (await db.query(
      `SELECT status, document_id, occurrence_key FROM recurring_transaction_occurrences
        WHERE organization_id = $1 AND profile_id = $2`,
      [registration.body.organizationId, created.body.id]
    )).rows[0];
    expect(occurrence.status).toBe('SUCCEEDED');
    const invoice = (await db.query(
      'SELECT source_occurrence_key, total_amount FROM invoices WHERE organization_id = $1 AND id = $2',
      [registration.body.organizationId, occurrence.document_id]
    )).rows[0];
    expect(invoice.source_occurrence_key).toBe(occurrence.occurrence_key);
    expect(Number(invoice.total_amount)).toBe(125);
  });
});
