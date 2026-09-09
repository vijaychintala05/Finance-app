import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ServerPostingEngine } from '../accounting/postingEngine';

const { Client } = pg;
const runAgainstPostgres = process.env.REQUIRE_REAL_POSTGRES === 'true';
const postgresDescribe = runAgainstPostgres ? describe : describe.skip;
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const organizationA = `org_pg_a_${suffix}`;
const organizationB = `org_pg_b_${suffix}`;
const ownerId = `usr_pg_${suffix}`;
const bankAccountId = `acc_pg_bank_${suffix}`;
const revenueAccountId = `acc_pg_revenue_${suffix}`;
const qualificationRole = `firmbooks_qualification_${suffix}`.replace(/[^a-zA-Z0-9_]/g, '_');

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

postgresDescribe('Real PostgreSQL qualification', () => {
  let client: pg.Client;
  let currentDatabaseRole = '';

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    db.resetPool();
    expect(db.isMemoryMode()).toBe(false);

    await MigrationRunner.runMigrations();
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    currentDatabaseRole = String((await client.query('SELECT current_user AS role')).rows[0].role);

    await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, $2, 'qualification-hash', 'PostgreSQL Qualification Owner', 'Active')`,
      [ownerId, `${ownerId}@firmbooks.test`],
    );
    await client.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES
         ($1, $2, $3, 'PGA', 'PostgreSQL Qualification A', 'US', 'USD', '$', $5),
         ($4, $6, $7, 'PGB', 'PostgreSQL Qualification B', 'US', 'USD', '$', $5)`,
      [organizationA, `uuid-${organizationA}`, `pub-${organizationA}`, organizationB, ownerId, `uuid-${organizationB}`, `pub-${organizationB}`],
    );
    await client.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status, allow_direct_posting)
       VALUES
         ($1, $2, '1010', 'Qualification Bank', 'Asset', 'Bank', 0, 'Active', true),
         ($3, $2, '4000', 'Qualification Revenue', 'Income', 'Operating Revenue', 0, 'Active', true),
         ($4, $5, '1010', 'Other Tenant Bank', 'Asset', 'Bank', 0, 'Active', true)`,
      [bankAccountId, organizationA, revenueAccountId, `acc_pg_other_${suffix}`, organizationB],
    );
  }, 60_000);

  afterAll(async () => {
    if (client) {
      try {
        await client.query(`REVOKE ${quoteIdentifier(qualificationRole)} FROM ${quoteIdentifier(currentDatabaseRole)}`);
        await client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(qualificationRole)}`);
      } catch {
        // The disposable qualification database is discarded by CI. Keep the
        // original qualification failure as the useful error if cleanup fails.
      }
      await client.end();
    }
  });

  it('uses PostgreSQL, applies migrations, and posts a balanced journal transactionally', async () => {
    const serverVersion = await client.query(`SHOW server_version_num`);
    expect(Number(serverVersion.rows[0].server_version_num)).toBeGreaterThanOrEqual(160000);

    const posting = await db.transaction(
      (tx) => ServerPostingEngine.postEntry({
        organizationId: organizationA,
        entryNumber: `PG-QUAL-${suffix}`,
        date: '2026-09-09',
        description: 'Real PostgreSQL qualification posting',
        lines: [
          { accountId: bankAccountId, debit: 125, credit: 0, description: 'Bank receipt' },
          { accountId: revenueAccountId, debit: 0, credit: 125, description: 'Revenue' },
        ],
      }, tx),
      { organizationId: organizationA },
    );

    const balanced = await client.query(
      `SELECT COALESCE(SUM(debit), 0) AS debit, COALESCE(SUM(credit), 0) AS credit
         FROM journal_lines WHERE journal_entry_id = $1`,
      [posting.entryId],
    );
    expect(Number(balanced.rows[0].debit)).toBe(125);
    expect(Number(balanced.rows[0].credit)).toBe(125);
  });

  it('rejects an unbalanced posted journal at PostgreSQL commit time', async () => {
    const journalId = `je_pg_unbalanced_${suffix}`;
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
         VALUES ($1, $2, $3, '2026-09-09', 'Intentionally unbalanced qualification entry', 'Posted')`,
        [journalId, organizationA, `PG-UNBALANCED-${suffix}`],
      );
      await client.query(
        `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, account_code, account_name, debit, credit, description)
         VALUES
           ($1, $2, $3, $4, '1010', 'Qualification Bank', 100, 0, 'Unbalanced debit'),
           ($5, $2, $3, $6, '4000', 'Qualification Revenue', 0, 99, 'Unbalanced credit')`,
        [`jl_pg_unbalanced_d_${suffix}`, journalId, organizationA, bankAccountId, `jl_pg_unbalanced_c_${suffix}`, revenueAccountId],
      );
      await expect(client.query('COMMIT')).rejects.toThrow(/balanced|debits|credits/i);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
    }
  });

  it('enforces fail-closed RLS for an unprivileged application role', async () => {
    const policyTables = await client.query(
      `SELECT tablename FROM pg_policies
        WHERE schemaname = 'public' AND policyname = 'tenant_isolation_policy'
          AND tablename = ANY($1::text[])`,
      [['accounts', 'journal_entries', 'journal_lines', 'payment_intents']],
    );
    expect(policyTables.rows.map((row) => row.tablename).sort()).toEqual(
      ['accounts', 'journal_entries', 'journal_lines', 'payment_intents'].sort(),
    );

    await client.query(`CREATE ROLE ${quoteIdentifier(qualificationRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await client.query(`GRANT ${quoteIdentifier(qualificationRole)} TO ${quoteIdentifier(currentDatabaseRole)}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(qualificationRole)}`);
    await client.query(`GRANT SELECT ON accounts TO ${quoteIdentifier(qualificationRole)}`);

    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${quoteIdentifier(qualificationRole)}`);
      const withoutContext = await client.query(`SELECT COUNT(*)::int AS count FROM accounts`);
      expect(Number(withoutContext.rows[0].count)).toBe(0);

      await client.query(`SELECT set_config('app.current_org_id', $1, true)`, [organizationA]);
      const tenantRows = await client.query(`SELECT DISTINCT organization_id FROM accounts ORDER BY organization_id`);
      expect(tenantRows.rows.map((row) => row.organization_id)).toEqual([organizationA]);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
    }
  });
});
