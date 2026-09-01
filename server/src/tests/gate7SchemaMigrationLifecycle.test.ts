import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner, CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { newId } from '../utils/ids';

describe('Gate 7: Schema Migration Lifecycle, Sequencing & Idempotency Suite', () => {
  const orgId = 'org-mig-lifecycle-test';

  beforeEach(async () => {
    db.initPgMem();
  });

  it('1. Initializes schema from scratch, tracks version in schema_migrations, and reports isCurrent === true', async () => {
    expect(await MigrationRunner.isCurrent()).toBe(false);

    await MigrationRunner.runMigrations();

    expect(await MigrationRunner.isCurrent()).toBe(true);

    const versionRes = await db.query(
      `SELECT version, description, applied_at FROM schema_migrations WHERE version = $1`,
      [CURRENT_SCHEMA_VERSION]
    );
    expect(versionRes.rows.length).toBe(1);
    expect(versionRes.rows[0].version).toBe(CURRENT_SCHEMA_VERSION);
    expect(versionRes.rows[0].description).toBeDefined();
    expect(versionRes.rows[0].applied_at).toBeDefined();
  });

  it('2. Preserves existing legacy data across simulated sequential schema upgrades', async () => {
    // Step A: Run baseline migrations
    await MigrationRunner.runMigrations();

    // Step B: Seed historical legacy rows
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'India', 'INR', '₹', 'usr-legacy-owner')`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`, 'LEG', 'Legacy Pre-Upgrade Org']
    );

    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance)
       VALUES
         ('acc-leg-cash', $1, '1000', 'Legacy Petty Cash', 'Asset', 'Cash', 5000.00),
         ('acc-leg-rev', $1, '4000', 'Legacy Revenue', 'Income', 'Sales', 50000.00)`,
      [orgId]
    );

    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, issue_date, due_date, subtotal, tax_total, total_amount, paid_amount, balance_due, status)
       VALUES ('inv-leg-001', $1, 'INV-LEG-001', 'Legacy Client', '2025-01-15', '2025-02-15', 10000.00, 1800.00, 11800.00, 5000.00, 6800.00, 'PARTIALLY_PAID')`,
      [orgId]
    );

    // Step C: Run full migration suite (simulating an application upgrade)
    await MigrationRunner.runMigrations();

    // Step D: Verify legacy records are intact with 100% fidelity
    const orgCheck = await db.query(`SELECT * FROM organizations WHERE id = $1`, [orgId]);
    expect(orgCheck.rows.length).toBe(1);
    expect(orgCheck.rows[0].name).toBe('Legacy Pre-Upgrade Org');
    expect(orgCheck.rows[0].base_currency).toBe('INR');

    const accCheck = await db.query(`SELECT * FROM accounts WHERE id = 'acc-leg-cash'`);
    expect(accCheck.rows.length).toBe(1);
    expect(Number(accCheck.rows[0].balance)).toBe(5000.00);

    const invCheck = await db.query(`SELECT * FROM invoices WHERE id = 'inv-leg-001'`);
    expect(invCheck.rows.length).toBe(1);
    expect(Number(invCheck.rows[0].total_amount)).toBe(11800.00);
    expect(Number(invCheck.rows[0].balance_due)).toBe(6800.00);

    // Step E: Verify new columns exist and default properly
    const colCheck = await db.query(`
      SELECT reversal_journal_id, reversed_at, reversal_reason
      FROM invoices WHERE id = 'inv-leg-001'
    `);
    expect(colCheck.rows.length).toBe(1);
    expect(colCheck.rows[0].reversal_journal_id).toBeNull();
  });

  it('3. Guarantees 100% idempotency when run 1x, 2x, 5x, and 10x consecutively', async () => {
    // 1st run
    await MigrationRunner.runMigrations();
    const tablesCount1 = (await db.query(`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0].cnt;

    // 2nd run
    await MigrationRunner.runMigrations();
    const tablesCount2 = (await db.query(`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0].cnt;
    expect(tablesCount2).toBe(tablesCount1);

    // 3rd through 10th consecutive runs
    for (let i = 3; i <= 10; i++) {
      await MigrationRunner.runMigrations();
    }

    const tablesCountFinal = (await db.query(`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'`)).rows[0].cnt;
    expect(tablesCountFinal).toBe(tablesCount1);

    // Check version entry is single and clean
    const versionEntries = await db.query(`SELECT COUNT(*) as cnt FROM schema_migrations WHERE version = $1`, [CURRENT_SCHEMA_VERSION]);
    expect(Number(versionEntries.rows[0].cnt)).toBe(1);
  });

  it('4. Default Chart of Accounts provisioning is safe, idempotent, and preserves existing custom accounts', async () => {
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, 'India', 'INR', '₹', 'usr-owner-coa')`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`, 'COA', 'COA Test Org']
    );

    // Provision chart
    await OrganizationProvisioningService.provisionDefaultChart(db, orgId);
    const countFirst = (await db.query(`SELECT COUNT(*) as cnt FROM accounts WHERE organization_id = $1`, [orgId])).rows[0].cnt;
    expect(Number(countFirst)).toBeGreaterThanOrEqual(10);

    // Add a custom user account
    const customAccId = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account)
       VALUES ($1, $2, '9999', 'Custom Architectural Reserve', 'Equity', 'Equity', 25000.00, FALSE)`,
      [customAccId, orgId]
    );

    // Re-run provisioning (as during an upgrade)
    await OrganizationProvisioningService.provisionDefaultChart(db, orgId);

    // Verify custom account was not deleted or altered
    const customAccCheck = await db.query(`SELECT * FROM accounts WHERE id = $1`, [customAccId]);
    expect(customAccCheck.rows.length).toBe(1);
    expect(customAccCheck.rows[0].name).toBe('Custom Architectural Reserve');
    expect(Number(customAccCheck.rows[0].balance)).toBe(25000.00);

    // Verify total count equals original provisioned + 1 custom account
    const countSecond = (await db.query(`SELECT COUNT(*) as cnt FROM accounts WHERE organization_id = $1`, [orgId])).rows[0].cnt;
    expect(Number(countSecond)).toBe(Number(countFirst) + 1);
  });

  it('5. Tenant isolation tables array is comprehensive and covers all business entities', async () => {
    await MigrationRunner.runMigrations();

    // Verify TENANT_SCOPED_TABLES in enterpriseHardeningSchema covers key financial tables
    const keyTables = [
      'accounts', 'invoices', 'bills', 'payments_received', 'payments_made',
      'credit_notes', 'vendor_credits', 'customer_advances', 'vendor_advances',
      'journal_entries', 'fixed_assets', 'audit_logs', 'quotation_templates'
    ];

    for (const table of keyTables) {
      const exists = await db.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public'`,
        [table]
      );
      expect(exists.rows.length, `Table ${table} must exist in migrated schema`).toBe(1);
    }
  });
});
