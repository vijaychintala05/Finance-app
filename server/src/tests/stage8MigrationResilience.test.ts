import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner, CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';

describe('Stage 8: Migration Resilience & Schema Integrity Tests', () => {
  beforeEach(async () => {
    // Ensure baseline schema is present
    await MigrationRunner.runMigrations();
  });

  it('1. Executes migrations idempotently multiple times without data corruption or constraint failure', async () => {
    // Seed a representative existing tenant database
    const orgId = `org_mig_${Date.now()}`;
    const userId = `usr_mig_${Date.now()}`;

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name)
       VALUES ($1, $2, $3, $4)`,
      [userId, `miguser_${Date.now()}@example.com`, 'hash123', 'Migration Test User']
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [orgId, `uuid_${orgId}`, `pub_${orgId}`, `MIG`, 'Migration Test Corp', 'US', 'USD', '$', userId]
    );

    await OrganizationProvisioningService.provisionDefaultChart(db, orgId);

    // Add a custom chart of account to ensure migrations don't overwrite custom accounts
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`acc_custom_${Date.now()}`, orgId, '9999', 'Custom Innovation Reserve', 'EQUITY', 'EQUITY', 'Active']
    );

    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, currency, active)
       VALUES ('cust_1', $1, 'CUST-001', 'Migration Client Corp', 'Migration Client Corp Ltd', 'USD', true)
       ON CONFLICT DO NOTHING`,
      [orgId]
    );

    // Insert an invoice and a journal entry
    const invId = `inv_mig_${Date.now()}`;
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_name, issue_date, due_date, total_amount, balance_due, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [invId, orgId, 'INV-MIG-001', 'cust_1', 'Migration Client Corp', '2026-03-01', '2026-03-31', 5000, 5000, 'ISSUED']
    );

    const initialAccCountRes = await db.query(`SELECT COUNT(*) as cnt FROM accounts WHERE organization_id = $1`, [orgId]);
    const initialAccCount = Number(initialAccCountRes.rows[0].cnt);
    expect(initialAccCount).toBeGreaterThan(10);

    // Run migration cycle 2
    await expect(MigrationRunner.runMigrations()).resolves.not.toThrow();

    // Run migration cycle 3
    await expect(MigrationRunner.runMigrations()).resolves.not.toThrow();

    // Verify schema is current
    const isCurrent = await MigrationRunner.isCurrent();
    expect(isCurrent).toBe(true);

    // Verify existing data remained completely intact
    const postInvRes = await db.query(`SELECT * FROM invoices WHERE id = $1`, [invId]);
    expect(postInvRes.rows.length).toBe(1);
    expect(Number(postInvRes.rows[0].total_amount)).toBe(5000);
    expect(postInvRes.rows[0].status).toBe('ISSUED');

    // Verify custom account preserved
    const customAccRes = await db.query(`SELECT * FROM accounts WHERE organization_id = $1 AND code = $2`, [orgId, '9999']);
    expect(customAccRes.rows.length).toBe(1);
    expect(customAccRes.rows[0].name).toBe('Custom Innovation Reserve');

    // Total account count should remain identical (no duplicate provisioning)
    const postAccCountRes = await db.query(`SELECT COUNT(*) as cnt FROM accounts WHERE organization_id = $1`, [orgId]);
    expect(Number(postAccCountRes.rows[0].cnt)).toBe(initialAccCount);
  });

  it('2. Enforces schema migrations tracking and version history integrity', async () => {
    const historyRes = await db.query(`SELECT * FROM schema_migrations WHERE version = $1`, [CURRENT_SCHEMA_VERSION]);
    expect(historyRes.rows.length).toBe(1);
    expect(historyRes.rows[0].description).toBeDefined();
    expect(historyRes.rows[0].applied_at).toBeDefined();

    // Test unique constraint on migration version
    await expect(
      db.query(
        `INSERT INTO schema_migrations (version, description) VALUES ($1, $2)`,
        [CURRENT_SCHEMA_VERSION, 'Duplicate version attempt']
      )
    ).rejects.toThrow();
  });
});
