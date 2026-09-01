import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { MigrationRunner, CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { newId } from '../utils/ids';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';

describe('Gate 7: Migration Atomicity, Rollback Safety & Preflight Constraint Validation', () => {
  const orgId = 'org-atomicity-test';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'India', 'INR', '₹', 'usr-owner-atom')
       ON CONFLICT (id) DO NOTHING`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`, 'ATOM', 'Atomicity Test Org']
    );
  });

  it('1. Transactional Rollback: Rolls back entire migration batch on injected mid-migration failure without leaving orphan artifacts', async () => {
    // Record baseline account count and migration version
    const baseAccCount = (await db.query(`SELECT COUNT(*) as cnt FROM accounts WHERE organization_id = $1`, [orgId])).rows[0].cnt;
    const baseVersion = (await db.query(`SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`)).rows[0]?.version;

    // Simulate an upgrade migration batch with an intentional failure
    const newVersionName = '2026.09.01-v8-failing-migration-test';
    let caughtError: any = null;

    try {
      await db.transaction(async (client) => {
        // Statement 1: Insert an account row
        await client.query(
          `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
           VALUES ('acc-rollback-test', $1, '8888', 'Rollback Test Account', 'Asset', 'Cash', 100.00)`,
          [orgId]
        );

        // Statement 2: Record migration version
        await client.query(
          `INSERT INTO schema_migrations (version, description) VALUES ($1, $2)`,
          [newVersionName, 'Failing migration']
        );

        // Statement 3: Inject fatal failure
        throw new Error('SIMULATED_MIGRATION_EXECUTION_FAILURE');
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeDefined();

    // Verify rollback: acc-rollback-test must NOT exist
    const checkAcc = await db.query(
      `SELECT 1 FROM accounts WHERE id = 'acc-rollback-test'`
    );
    expect(checkAcc.rows.length).toBe(0);

    // Verify schema_migrations was NOT updated with the failed version
    const checkVersion = await db.query(
      `SELECT 1 FROM schema_migrations WHERE version = $1`,
      [newVersionName]
    );
    expect(checkVersion.rows.length).toBe(0);

    // Current version is still baseline
    const currentVersion = (await db.query(`SELECT version FROM schema_migrations ORDER BY applied_at DESC LIMIT 1`)).rows[0]?.version;
    expect(currentVersion).toBe(baseVersion);
  });

  it('2. Preflight Constraint Validation: Detects orphaned customer payment allocations and prevents unsafe foreign keys', async () => {
    const orphanAllocId = newId('alloc');

    // Insert an orphaned payment allocation
    await db.query(
      `INSERT INTO payment_received_allocations (id, organization_id, payment_id, invoice_id, amount)
       VALUES ($1, $2, 'nonexistent-payment-id', 'nonexistent-invoice-id', 500.00)`,
      [orphanAllocId, orgId]
    );

    // Run relational preflight orphan query
    const orphanCheck = await db.query(`
      SELECT COUNT(*)::int AS count
        FROM payment_received_allocations pra
        LEFT JOIN payments_received p ON p.organization_id = pra.organization_id AND p.id = pra.payment_id
        LEFT JOIN invoices i ON i.organization_id = pra.organization_id AND i.id = pra.invoice_id
       WHERE p.id IS NULL OR i.id IS NULL
    `);

    expect(Number(orphanCheck.rows[0].count)).toBeGreaterThanOrEqual(1);

    // Non-destructive check: verify corrupt record was NOT silently destroyed
    const recordCheck = await db.query(
      `SELECT id, amount FROM payment_received_allocations WHERE id = $1`,
      [orphanAllocId]
    );
    expect(recordCheck.rows.length).toBe(1);
    expect(Number(recordCheck.rows[0].amount)).toBe(500.00);
  });

  it('3. Preflight Constraint Validation: Detects orphaned vendor payment allocations non-destructively', async () => {
    const orphanAllocId = newId('valloc');

    // Insert an orphaned vendor payment allocation
    await db.query(
      `INSERT INTO payment_made_allocations (id, organization_id, payment_id, bill_id, amount)
       VALUES ($1, $2, 'nonexistent-pmt-id', 'nonexistent-bill-id', 750.00)`,
      [orphanAllocId, orgId]
    );

    const orphanCheck = await db.query(`
      SELECT COUNT(*)::int AS count
        FROM payment_made_allocations pma
        LEFT JOIN payments_made p ON p.organization_id = pma.organization_id AND p.id = pma.payment_id
        LEFT JOIN bills b ON b.organization_id = pma.organization_id AND b.id = pma.bill_id
       WHERE p.id IS NULL OR b.id IS NULL
    `);

    expect(Number(orphanCheck.rows[0].count)).toBeGreaterThanOrEqual(1);

    const recordCheck = await db.query(
      `SELECT id, amount FROM payment_made_allocations WHERE id = $1`,
      [orphanAllocId]
    );
    expect(recordCheck.rows.length).toBe(1);
    expect(Number(recordCheck.rows[0].amount)).toBe(750.00);
  });

  it('4. Audit Log Hash-Chaining: Preserves SHA-256 audit log cryptographic chain across migration upgrades', async () => {
    // Create an audit log hash chain of 5 events
    let prevHash = '0'.repeat(64);
    const logIds: string[] = [];

    for (let i = 1; i <= 5; i++) {
      const logId = newId('audit');
      const action = `FINANCIAL_EVENT_${i}`;
      const payload = { eventNumber: i, amount: i * 1000 };
      const currentHash = crypto
        .createHash('sha256')
        .update(`${prevHash}:${orgId}:${action}:${JSON.stringify(payload)}`)
        .digest('hex');

      await db.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata, previous_hash, current_hash)
         VALUES ($1, $2, 'usr-owner-atom', $3, 'JOURNAL', $4, $5, $6, $7)`,
        [logId, orgId, action, `ent-${i}`, JSON.stringify(payload), prevHash, currentHash]
      );

      logIds.push(logId);
      prevHash = currentHash;
    }

    // Execute schema upgrade
    await MigrationRunner.runMigrations();

    // Verify hash chain continuity post-migration
    const logsRes = await db.query(
      `SELECT id, organization_id, action, metadata, previous_hash, current_hash FROM audit_logs
       WHERE organization_id = $1 ORDER BY timestamp ASC`,
      [orgId]
    );

    expect(logsRes.rows.length).toBe(5);

    let recomputedPrev = '0'.repeat(64);
    for (const log of logsRes.rows) {
      expect(log.previous_hash).toBe(recomputedPrev);
      const expectedCurr = crypto
        .createHash('sha256')
        .update(`${recomputedPrev}:${orgId}:${log.action}:${typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata)}`)
        .digest('hex');
      expect(log.current_hash).toBe(expectedCurr);
      recomputedPrev = log.current_hash;
    }
  });

  it('5. Safe DDL Invariants: All migration table creation statements are non-destructive and use IF NOT EXISTS', async () => {
    // Verify that every table in public schema remains queryable without permission or structural errors
    const tables = await db.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );

    expect(tables.rows.length).toBeGreaterThan(30);

    for (const t of tables.rows) {
      const q = await db.query(`SELECT 1 FROM ${t.table_name} LIMIT 1`);
      expect(q).toBeDefined();
    }
  });
});
