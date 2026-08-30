import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('chart of accounts governance', () => {
  let auth: { Authorization: string };
  let orgId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `coa-governance-${Date.now()}@firmbooks.local`,
      password: 'SecurePassword123!',
      fullName: 'COA Owner',
      organizationName: 'COA Governance Firm',
    });
    expect(registration.status).toBe(201);
    auth = { Authorization: `Bearer ${registration.body.token}` };
    orgId = registration.body.organizationId;
  });

  it('persists a tenant-scoped hierarchy and audited account maintenance changes', async () => {
    const parent = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '6101', name: 'Operations', type: 'Expense', subType: 'Office & Administrative', reportingGroup: 'Operations', allowDirectPosting: false,
    });
    expect(parent.status).toBe(201);
    const child = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '6102', name: 'Office supplies', type: 'Expense', subType: 'Office & Administrative', parentAccountId: parent.body.id,
    });
    expect(child.status).toBe(201);

    const updated = await request(app).patch(`/api/v1/finance/accounts/${child.body.id}`).set(auth).send({
      name: 'Office supplies and consumables', reportingGroup: 'Operations', allowDirectPosting: false,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.parent_account_id).toBe(parent.body.id);
    expect(updated.body.allow_direct_posting).toBe(false);

    const audit = await db.query(
      `SELECT action FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'ACCOUNT_UPDATED'`, [orgId, child.body.id]
    );
    expect(audit.rows).toHaveLength(1);
  });

  it('rejects cross-tenant parenting, hierarchy cycles, unsafe archive, and direct journal posting', async () => {
    const foreign = await request(app).post('/api/v1/auth/register').send({
      email: `coa-foreign-${Date.now()}@firmbooks.local`, password: 'SecurePassword123!', fullName: 'Other Owner', organizationName: 'Other COA Firm',
    });
    const foreignAccount = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '6000'`, [foreign.body.organizationId])).rows[0];
    const local = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '6103', name: 'Local supplies', type: 'Expense', subType: 'Office & Administrative', parentAccountId: foreignAccount.id,
    });
    expect(local.status).toBeGreaterThanOrEqual(400);

    const parent = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '6104', name: 'Local operations', type: 'Expense', subType: 'Office & Administrative', allowDirectPosting: false,
    });
    const child = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '6105', name: 'Local stationery', type: 'Expense', subType: 'Office & Administrative', parentAccountId: parent.body.id,
    });
    const cycle = await request(app).patch(`/api/v1/finance/accounts/${parent.body.id}`).set(auth).send({ parentAccountId: child.body.id });
    expect(cycle.status).toBe(400);

    const journal = await request(app).post('/api/v1/finance/journals').set(auth).send({
      date: '2026-08-23', lines: [
        { accountId: parent.body.id, debit: 10, credit: 0 },
        { accountId: (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [orgId])).rows[0].id, debit: 0, credit: 10 },
      ],
    });
    expect(journal.status).toBeGreaterThanOrEqual(400);

    const archiveParent = await request(app).patch(`/api/v1/finance/accounts/${parent.body.id}`).set(auth).send({ status: 'Archived' });
    expect(archiveParent.status).toBe(400);
  });
});
