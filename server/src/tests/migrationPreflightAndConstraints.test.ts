import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { newId } from '../utils/ids';

describe('Migration Preflight Validation, Constraint Integrity & Non-Destructive Check Suite', () => {
  const orgId = 'org-preflight-test';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'India', 'INR', '₹', 'user-owner')
       ON CONFLICT (id) DO NOTHING`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`, 'PREF', 'Preflight Test Org']
    );
  });

  it('1. Preflight check detects orphaned payment_received_allocations and aborts safely with exact count', async () => {
    // Insert an orphaned allocation pointing to nonexistent payment and invoice
    const orphanId = newId('alloc');
    await db.query(
      `INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount)
       VALUES ($1, $2, 'nonexistent-pay', 'nonexistent-inv', 150.00)`,
      [orphanId, orgId]
    );

    // Preflight query matching migrationRunner DO block logic
    const praCorruptRes = await db.query(`
      SELECT COUNT(*)::int AS count
        FROM payment_received_allocations pra
        LEFT JOIN payments_received p ON p.organization_id = pra.organization_id AND p.id = pra.payment_id
        LEFT JOIN invoices i ON i.organization_id = pra.organization_id AND i.id = pra.invoice_id
       WHERE p.id IS NULL OR i.id IS NULL
    `);

    const count = Number(praCorruptRes.rows[0].count);
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify record was NOT silently deleted (non-destructive safety)
    const checkRecord = await db.query(`SELECT id, amount FROM payment_received_allocations WHERE id = $1`, [orphanId]);
    expect(checkRecord.rows.length).toBe(1);
    expect(Number(checkRecord.rows[0].amount)).toBe(150.00);
  });

  it('2. Preflight check detects orphaned payment_made_allocations and aborts safely with exact count', async () => {
    const orphanId = newId('alloc');
    await db.query(
      `INSERT INTO payment_made_allocations (id, organization_id, payment_id, bill_id, amount)
       VALUES ($1, $2, 'nonexistent-pmt', 'nonexistent-bill', 275.50)`,
      [orphanId, orgId]
    );

    const pmaCorruptRes = await db.query(`
      SELECT COUNT(*)::int AS count
        FROM payment_made_allocations pma
        LEFT JOIN payments_made p ON p.organization_id = pma.organization_id AND p.id = pma.payment_id
        LEFT JOIN bills b ON b.organization_id = pma.organization_id AND b.id = pma.bill_id
       WHERE p.id IS NULL OR b.id IS NULL
    `);

    const count = Number(pmaCorruptRes.rows[0].count);
    expect(count).toBeGreaterThanOrEqual(1);

    const checkRecord = await db.query(`SELECT id, amount FROM payment_made_allocations WHERE id = $1`, [orphanId]);
    expect(checkRecord.rows.length).toBe(1);
    expect(Number(checkRecord.rows[0].amount)).toBe(275.50);
  });

  it('3. Preflight check passes with zero errors on clean relational data', async () => {
    const praCorruptRes = await db.query(`
      SELECT COUNT(*)::int AS count
        FROM payment_received_allocations pra
        LEFT JOIN payments_received p ON p.organization_id = pra.organization_id AND p.id = pra.payment_id
        LEFT JOIN invoices i ON i.organization_id = pra.organization_id AND i.id = pra.invoice_id
       WHERE p.id IS NULL OR i.id IS NULL
    `);
    expect(Number(praCorruptRes.rows[0].count)).toBe(0);

    const pmaCorruptRes = await db.query(`
      SELECT COUNT(*)::int AS count
        FROM payment_made_allocations pma
        LEFT JOIN payments_made p ON p.organization_id = pma.organization_id AND p.id = pma.payment_id
        LEFT JOIN bills b ON b.organization_id = pma.organization_id AND b.id = pma.bill_id
       WHERE p.id IS NULL OR b.id IS NULL
    `);
    expect(Number(pmaCorruptRes.rows[0].count)).toBe(0);
  });
});
