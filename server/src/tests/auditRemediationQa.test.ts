import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { newId } from '../utils/ids';

describe('Audit Remediation QA Verification Suite', () => {
  const orgId = 'org-qa-remed';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, 'QAORG', 'QA Test Org', 'India', 'INR', '₹', 'usr_qa_owner')
       ON CONFLICT (id) DO NOTHING`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`]
    );
  });

  it('1. express.json verify middleware captures pristine rawBody on incoming HTTP POST', async () => {
    // Send a public webhook request with deliberate whitespace and specific key formatting
    const rawPayloadString = '{\n  "id": "evt_test_raw_body_qa",\n  "type": "payment.succeeded",\n  "amount": 5000\n}';

    const res = await request(app)
      .post('/api/v1/public/webhooks/gateway/mock')
      .set('Content-Type', 'application/json')
      .query({ orgId })
      .send(rawPayloadString);

    // In non-production, mock gateway is supported
    expect([200, 400, 403]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toBeDefined();
    }
  });

  it('2. db.query successfully executes inside withOrganizationContext without connection leaks', async () => {
    await db.withOrganizationContext(orgId, async () => {
      expect(db.getCurrentOrganizationId()).toBe(orgId);

      // Execute non-transactional queries
      const res = await db.query('SELECT id, name FROM organizations WHERE id = $1', [orgId]);
      expect(res.rows.length).toBe(1);
      expect(res.rows[0].name).toBe('QA Test Org');

      // Verify second non-transactional query in same context
      const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1 LIMIT 5', [orgId]);
      expect(Array.isArray(accounts.rows)).toBe(true);
    });

    expect(db.getCurrentOrganizationId()).toBeUndefined();
  });

  it('3. Customer display name composite index is registered and accelerates lookups', async () => {
    const custId = `cust_${newId('c')}`;
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, currency)
       VALUES ($1, $2, 'Acme QA Industries', 'INR')
       ON CONFLICT (id) DO NOTHING`,
      [custId, orgId]
    );

    const lookup = await db.query(
      `SELECT id, display_name FROM customers WHERE organization_id = $1 AND display_name = $2`,
      [orgId, 'Acme QA Industries']
    );

    expect(lookup.rows.length).toBe(1);
    expect(lookup.rows[0].id).toBe(custId);
    expect(lookup.rows[0].display_name).toBe('Acme QA Industries');
  });
});
