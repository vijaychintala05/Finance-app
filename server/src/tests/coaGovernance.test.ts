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
      code: '6101', name: 'Operations', description: 'Company-wide operating costs', type: 'Expense', subType: 'Office & Administrative', reportingGroup: 'Operations',
    });
    expect(parent.status).toBe(201);
    expect(parent.body.description).toBe('Company-wide operating costs');
    const child = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '6102', name: 'Office supplies', type: 'Expense', subType: 'Office & Administrative', parentAccountId: parent.body.id,
    });
    expect(child.status).toBe(201);
    const parentAfterChild = await db.query(`SELECT allow_direct_posting FROM accounts WHERE id = $1`, [parent.body.id]);
    expect(parentAfterChild.rows[0].allow_direct_posting).toBe(false);

    const updated = await request(app).patch(`/api/v1/finance/accounts/${child.body.id}`).set(auth).send({
      name: 'Office supplies and consumables', description: 'Consumables used by the office team', reportingGroup: 'Operations', allowDirectPosting: false,
    });
    expect(updated.status).toBe(200);
    expect(updated.body.parent_account_id).toBe(parent.body.id);
    expect(updated.body.allow_direct_posting).toBe(false);
    expect(updated.body.description).toBe('Consumables used by the office team');

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

  it('uses audited, type-safe account mappings for accounting defaults', async () => {
    const bank = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '1011', name: 'Collections bank', type: 'Asset', subType: 'Bank',
    });
    expect(bank.status).toBe(201);

    const mapped = await request(app).patch('/api/v1/finance/accounting-defaults/BANK_OPERATING').set(auth).send({ accountId: bank.body.id });
    expect(mapped.status).toBe(200);
    expect(mapped.body.accountId).toBe(bank.body.id);

    const defaults = await request(app).get('/api/v1/finance/accounting-defaults').set(auth);
    expect(defaults.status).toBe(200);
    expect(defaults.body.find((row: any) => row.system_role === 'BANK_OPERATING')?.id).toBe(bank.body.id);

    const invalidType = await request(app).patch('/api/v1/finance/accounting-defaults/BANK_OPERATING').set(auth).send({
      accountId: (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '2000'`, [orgId])).rows[0].id,
    });
    expect(invalidType.status).toBe(400);

    const audit = await db.query(`SELECT action FROM audit_logs WHERE organization_id = $1 AND action = 'ACCOUNTING_DEFAULT_UPDATED'`, [orgId]);
    expect(audit.rows).toHaveLength(1);
  });

  it('deletes only unused custom accounts and preserves all referenced or system accounts', async () => {
    const disposable = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '8990', name: 'Temporary supplies', type: 'Expense', subType: 'Office & Administrative',
    });
    expect(disposable.status).toBe(201);

    const deleted = await request(app).delete(`/api/v1/finance/accounts/${disposable.body.id}`).set(auth);
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(true);
    const removedAccount = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND id = $2`, [orgId, disposable.body.id]);
    expect(removedAccount.rows).toHaveLength(0);
    const deletionAudit = await db.query(
      `SELECT action FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'ACCOUNT_DELETED'`,
      [orgId, disposable.body.id]
    );
    expect(deletionAudit.rows).toHaveLength(1);

    const posted = await request(app).post('/api/v1/finance/accounts').set(auth).send({
      code: '8991', name: 'Posted supplies', type: 'Expense', subType: 'Office & Administrative',
    });
    expect(posted.status).toBe(201);
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status)
       VALUES ($1, $2, 'JE-COA-DELETE', '2026-08-24', 'Posted')`,
      ['je-coa-delete', orgId]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
       VALUES ($1, $2, $3, $4, 10, 0)`,
      ['jl-coa-delete', 'je-coa-delete', orgId, posted.body.id]
    );
    const referenced = await request(app).delete(`/api/v1/finance/accounts/${posted.body.id}`).set(auth);
    expect(referenced.status).toBe(409);
    expect(referenced.body.error).toMatch(/journal entry/i);

    const systemAccount = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [orgId])).rows[0];
    const protectedDeletion = await request(app).delete(`/api/v1/finance/accounts/${systemAccount.id}`).set(auth);
    expect(protectedDeletion.status).toBe(400);
    expect(protectedDeletion.body.error).toMatch(/cannot be deleted/i);
  });
});
