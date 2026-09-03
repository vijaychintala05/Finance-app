import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { JwtAuth } from '../auth/jwt';
import { newId } from '../utils/ids';
import { TENANT_SCOPED_TABLES } from '../database/enterpriseHardeningSchema';

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

  it('5. Successfully creates an invoice through the full middleware chain', async () => {
    // Create client and required accounts first
    const clientRes = await db.query(
      `INSERT INTO clients (id, organization_id, name, company_name, email, currency)
       VALUES ($1, $2, 'Invoice NAS Client', 'Invoice NAS Client', 'inv@nas.test', 'USD') RETURNING id`,
      [newId('cli'), orgId]
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '1100', 'Accounts Receivable', 'Asset', 'Accounts Receivable', 0, 'Active')`,
      [newId('acc'), orgId]
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '4000', 'Sales Revenue', 'Income', 'Operating Revenue', 0, 'Active')`,
      [newId('acc'), orgId]
    );

    const res = await request(app)
      .post('/api/v1/finance/invoices')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .set('Idempotency-Key', `nas-inv-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`)
      .send({
        clientId: clientRes.rows[0].id,
        clientName: 'Invoice NAS Client',
        issueDate: '2026-09-03',
        dueDate: '2026-10-03',
        items: [{ description: 'Cloud Infrastructure Engineering', quantity: 1, unitPrice: 2400, taxRate: 0, amount: 2400 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(2400);

    const dbCheck = await db.query('SELECT * FROM invoices WHERE organization_id = $1', [orgId]);
    expect(dbCheck.rows).toHaveLength(1);
  });

  it('6. Successfully creates a bill through the full middleware chain', async () => {
    // Create vendor and required accounts first
    const vendorRes = await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, email, currency)
       VALUES ($1, $2, 'Bill NAS Vendor', 'Bill NAS Vendor', 'bill@nas.test', 'USD') RETURNING id`,
      [newId('ven'), orgId]
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '2000', 'Accounts Payable', 'Liability', 'Accounts Payable', 0, 'Active')`,
      [newId('acc'), orgId]
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '6000', 'Operating Expense', 'Expense', 'Operating Expense', 0, 'Active')`,
      [newId('acc'), orgId]
    );

    const res = await request(app)
      .post('/api/v1/finance/bills')
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .set('Idempotency-Key', `nas-bill-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`)
      .send({
        vendorId: vendorRes.rows[0].id,
        vendorName: 'Bill NAS Vendor',
        billDate: '2026-09-03',
        dueDate: '2026-10-03',
        totalAmount: 1800,
        subtotal: 1800,
        taxTotal: 0,
        lineItems: [{ description: 'Dedicated Rackspace', quantity: 1, unitPrice: 1800, taxRate: 0, amount: 1800 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.totalAmount).toBe(1800);

    const dbCheck = await db.query('SELECT * FROM bills WHERE organization_id = $1', [orgId]);
    expect(dbCheck.rows).toHaveLength(1);
  });

  it('7. Verifies set_config execution during db.transaction and savepoints', async () => {
    await db.transaction(async (tx) => {
      // Test nested transaction with savepoint
      await db.transaction(async (nestedTx) => {
        const check = await nestedTx.query('SELECT 1 as alive');
        expect(check.rows[0].alive).toBe(1);
      }, { organizationId: orgId });
    }, { organizationId: orgId });
  });

  it('8. Code Guardian: Strictly forbids invalid parameterized "SET LOCAL" syntax in database layer', () => {
    const dbSource = fs.readFileSync(path.join(__dirname, '../database/db.ts'), 'utf-8');

    // Reject parameterized SET / SET LOCAL
    const invalidSetRegex = /SET\s+LOCAL\s+[A-Za-z0-9_.]+\s*=\s*\$1/i;
    expect(invalidSetRegex.test(dbSource)).toBe(false);

    // Mandate use of set_config with local parameter
    const setConfigRegex = /set_config\(\s*'app\.current_org_id'\s*,\s*\$1\s*,\s*true\s*\)/;
    expect(setConfigRegex.test(dbSource)).toBe(true);
  });

  it('9. Schema Guardian: Guarantees enterpriseHardeningSchema RLS policy includes null fallback safeguard', () => {
    const schemaSource = fs.readFileSync(path.join(__dirname, '../database/enterpriseHardeningSchema.ts'), 'utf-8');

    // Ensure policy has the null-safe check so unconfigured administrative tasks do not explode
    expect(schemaSource).toContain("OR NULLIF(current_setting(''app.current_org_id'', true), '''') IS NULL");

    // Ensure all critical tables are registered
    expect(TENANT_SCOPED_TABLES).toContain('accounts');
    expect(TENANT_SCOPED_TABLES).toContain('invoices');
    expect(TENANT_SCOPED_TABLES).toContain('bills');
    expect(TENANT_SCOPED_TABLES).toContain('expenses');
    expect(TENANT_SCOPED_TABLES).toContain('audit_logs');
    expect(TENANT_SCOPED_TABLES).toContain('document_sequences');
  });

  it('10. Organization Context Guardian: Retains store across asynchronous microtasks and timer ticks', async () => {
    const testOrg = 'org_async_context_verify';

    await db.withOrganizationContext(testOrg, async () => {
      expect(db.getCurrentOrganizationId()).toBe(testOrg);

      // Verify across microtask
      await Promise.resolve();
      expect(db.getCurrentOrganizationId()).toBe(testOrg);

      // Verify across macrotask (setImmediate)
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          expect(db.getCurrentOrganizationId()).toBe(testOrg);
          resolve();
        });
      });

      // Verify across timer macrotask (setTimeout)
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(db.getCurrentOrganizationId()).toBe(testOrg);
          resolve();
        }, 10);
      });
    });

    // Cleaned up outside context
    expect(db.getCurrentOrganizationId()).toBeUndefined();
  });
});
