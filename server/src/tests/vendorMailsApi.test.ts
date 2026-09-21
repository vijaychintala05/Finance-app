import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { JwtAuth } from '../auth/jwt';
import { newId } from '../utils/ids';

describe('Vendor Mails End-to-End API Suite', () => {
  const orgId = `org_mail_${Date.now()}`;
  const otherOrgId = `org_mail_other_${Date.now()}`;
  const userId = `usr_mail_${Date.now()}`;
  let token: string;
  let otherToken: string;
  let vendorId: string;

  beforeAll(async () => {
    db.resetPool();
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'United States', 'USD', '$', $6)`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`, 'VM1', 'Vendor Mail Org', userId]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'United States', 'USD', '$', $6)`,
      [otherOrgId, `uuid-${otherOrgId}`, `pub-${otherOrgId}`, 'VM2', 'Other Vendor Org', userId]
    );

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'mailuser@example.test', 'hash123', 'Mail User', 'Active')`,
      [userId]
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status)
       VALUES ($1, $2, $3, 'Owner', 'Active')`,
      [newId('mem'), orgId, userId]
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status)
       VALUES ($1, $2, $3, 'Owner', 'Active')`,
      [newId('mem'), otherOrgId, userId]
    );

    token = JwtAuth.generateToken({ userId, email: 'mailuser@example.test' });
    otherToken = JwtAuth.generateToken({ userId, email: 'mailuser@example.test' });

    vendorId = `ven_mail_${Date.now()}`;
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, email, currency)
       VALUES ($1, $2, 'Global Supplies Ltd', 'supplies@global.test', 'USD')`,
      [vendorId, orgId]
    );
  });

  it('1. Returns empty mail list for new vendor', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/vendors/${vendorId}/mails`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('2. Records/sends an email to vendor and creates audit log', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/vendors/${vendorId}/mails`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        toEmail: 'supplies@global.test',
        subject: 'Purchase Order Inquiry #PO-2026-001',
        body: 'Please confirm expected delivery timeline for PO-2026-001.',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.vendorId).toBe(vendorId);
    expect(res.body.toEmail).toBe('supplies@global.test');
    expect(res.body.subject).toBe('Purchase Order Inquiry #PO-2026-001');
    expect(res.body.body).toBe('Please confirm expected delivery timeline for PO-2026-001.');
    expect(res.body.status).toBe('Sent');

    // Verify audit log
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'VENDOR_MAIL_SENT'`,
      [orgId, vendorId]
    );
    expect(auditRes.rows.length).toBeGreaterThan(0);
  });

  it('3. Lists recorded mails for the vendor in chronological order', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/vendors/${vendorId}/mails`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].subject).toBe('Purchase Order Inquiry #PO-2026-001');
  });

  it('4. Enforces tenant isolation: another organization cannot access mails', async () => {
    const res = await request(app)
      .get(`/api/v1/finance/vendors/${vendorId}/mails`)
      .set('Authorization', `Bearer ${otherToken}`)
      .set('x-organization-id', otherOrgId);

    expect(res.status).toBe(404);
  });

  it('5. Validates mail input payload', async () => {
    const res = await request(app)
      .post(`/api/v1/finance/vendors/${vendorId}/mails`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-organization-id', orgId)
      .send({
        toEmail: 'invalid-email',
        subject: '',
        body: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
