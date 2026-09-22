import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { newId } from '../utils/ids';

describe('Finance transaction history API', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function createTenant(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: `${label} Audit Owner`,
      organizationName: `${label} Audit Org`,
    });

    expect(registration.status).toBe(201);
    return {
      organizationId: registration.body.organizationId as string,
      userId: registration.body.user.id as string,
      auth: { Authorization: `Bearer ${registration.body.token}` },
      fullName: `${label} Audit Owner`,
    };
  }

  it('returns audit history with the canonical user full name and isolates tenants', async () => {
    const owner = await createTenant('Primary');
    const otherTenant = await createTenant('Other');
    const entityId = newId('expense');

    await db.query(
      `INSERT INTO audit_logs
        (id, organization_id, user_id, action, entity_type, entity_id, after_state)
       VALUES ($1, $2, $3, 'EXPENSE_CREATED', 'Expense', $4, $5)`,
      [newId('aud'), owner.organizationId, owner.userId, entityId, JSON.stringify({ amount: 1250 })]
    );

    const globalHistory = await request(app)
      .get('/api/v1/finance/audit')
      .set(owner.auth);

    expect(globalHistory.status).toBe(200);
    expect(globalHistory.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entity_id: entityId,
        user_name: owner.fullName,
      }),
    ]));

    const entityHistory = await request(app)
      .get(`/api/v1/finance/audit-logs?entityType=Expense&entityId=${entityId}`)
      .set(owner.auth);

    expect(entityHistory.status).toBe(200);
    expect(entityHistory.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entityId,
        userName: owner.fullName,
        action: 'EXPENSE_CREATED',
      }),
    ]));

    const isolatedHistory = await request(app)
      .get(`/api/v1/finance/audit-logs?entityType=Expense&entityId=${entityId}`)
      .set(otherTenant.auth);

    expect(isolatedHistory.status).toBe(200);
    expect(isolatedHistory.body).toEqual([]);
  });
});
