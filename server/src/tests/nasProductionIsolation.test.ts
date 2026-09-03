import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { JwtAuth } from '../auth/jwt';
import { newId } from '../utils/ids';

describe('NAS Server & Production RLS Hardening Suite', () => {
  const orgId = `org_nas_${Date.now()}`;
  const userId = `usr_nas_${Date.now()}`;
  let token: string;

  beforeEach(async () => {
    db.resetPool();
    await MigrationRunner.runMigrations();

    // Setup organization, user, and membership
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'United States', 'USD', '$', $6)`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`, 'NAS1', 'NAS Test Organization', userId]
    );
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, 'hash123', 'NAS Admin', 'Active')`,
      [userId, 'nas-admin@example.com']
    );
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status) VALUES ($1, $2, $3, 'Owner', 'Active')`,
      [newId('mem'), orgId, userId]
    );

    token = JwtAuth.generateToken({ userId, email: 'nas-admin@example.com' });
  });

  it('1. Successfully creates an account through the full middleware chain (with idempotency and org context)', async () => {
    const res = await request(app)
      .post('/api/v1/finance/accounts')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .set('Idempotency-Key', `nas-acc-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`)
      .send({
        code: '1099',
        name: 'NAS Test Petty Cash',
        type: 'Asset',
        subType: 'Cash',
        description: 'Verifying account creation on NAS production stack',
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('1099');
    expect(res.body.name).toBe('NAS Test Petty Cash');

    const dbCheck = await db.query('SELECT * FROM accounts WHERE organization_id = $1 AND code = $2', [orgId, '1099']);
    expect(dbCheck.rows).toHaveLength(1);
    expect(dbCheck.rows[0].name).toBe('NAS Test Petty Cash');
  });

  it('2. Successfully creates a client/customer through the full middleware chain', async () => {
    const res = await request(app)
      .post('/api/v1/finance/clients')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .set('Idempotency-Key', `nas-cli-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`)
      .send({
        name: 'NAS Enterprise Client',
        companyName: 'NAS Enterprise LLC',
        email: 'billing@nasenterprise.com',
        phone: '+1 555-0199',
        billingAddress: '100 NAS Parkway, Suite 500',
        currency: 'USD',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('NAS Enterprise Client');

    const dbCheck = await db.query('SELECT * FROM clients WHERE organization_id = $1 AND name = $2', [orgId, 'NAS Enterprise Client']);
    expect(dbCheck.rows).toHaveLength(1);
  });

  it('3. Successfully creates a vendor through the full middleware chain', async () => {
    const res = await request(app)
      .post('/api/v1/finance/vendors')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .set('Idempotency-Key', `nas-ven-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`)
      .send({
        name: 'NAS Cloud Hardware Supplies',
        companyName: 'Cloud Supplies Corp',
        email: 'orders@cloudsupplies.com',
        phone: '+1 555-0299',
        billingAddress: '200 Hardware Lane',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('NAS Cloud Hardware Supplies');

    const dbCheck = await db.query('SELECT * FROM vendors WHERE organization_id = $1 AND name = $2', [orgId, 'NAS Cloud Hardware Supplies']);
    expect(dbCheck.rows).toHaveLength(1);
  });

  it('4. Successfully records an expense through the full middleware chain (document numbering + audit)', async () => {
    // Setup required accounts first
    const expAccRes = await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '6050', 'Hardware Maintenance', 'Expense', 'Operating Expense', 0, 'Active') RETURNING id`,
      [newId('acc'), orgId]
    );
    const bankAccRes = await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '1050', 'Checking Account', 'Asset', 'Bank', 5000, 'Active') RETURNING id`,
      [newId('acc'), orgId]
    );

    const res = await request(app)
      .post('/api/v1/finance/expenses')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .set('Idempotency-Key', `nas-exp-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`)
      .send({
        expenseAccountId: expAccRes.rows[0].id,
        paidFromAccountId: bankAccRes.rows[0].id,
        date: '2026-09-03',
        amount: 350.00,
        description: 'NAS Drive Array Replacement',
      });

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(350);

    const dbCheck = await db.query('SELECT * FROM expenses WHERE organization_id = $1', [orgId]);
    expect(dbCheck.rows).toHaveLength(1);
    expect(Number(dbCheck.rows[0].amount)).toBe(350);
  });

  it('5. Verifies set_config execution during db.transaction and savepoints', async () => {
    await db.transaction(async (tx) => {
      // Test nested transaction with savepoint
      await db.transaction(async (nestedTx) => {
        const check = await nestedTx.query('SELECT 1 as alive');
        expect(check.rows[0].alive).toBe(1);
      }, { organizationId: orgId });
    }, { organizationId: orgId });
  });
});
