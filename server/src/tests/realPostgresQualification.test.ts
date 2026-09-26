import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { db } from '../database/db';
import { CURRENT_SCHEMA_VERSION, MigrationRunner } from '../database/migrationRunner';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { SalesEngine } from '../sales/SalesEngine';
import { PeriodCloseService } from '../services/PeriodCloseService';
import { RecoveryArtifactService } from '../recovery/RecoveryArtifactService';
import { openRecoveryPayload } from '../recovery/crypto';
import { SqlRecoveryRepository } from '../recovery/RecoveryRepository';

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
    await client.query(
      "INSERT INTO accounting_defaults (organization_id, system_role, account_id) VALUES ($1, 'AR_CONTROL', $2), ($1, 'SALES_REVENUE', $3) ON CONFLICT (organization_id, system_role) DO UPDATE SET account_id = EXCLUDED.account_id",
      [organizationA, bankAccountId, revenueAccountId],
    );
    await client.query(
      "INSERT INTO customers (id, organization_id, display_name, legal_name, currency, active) VALUES ($1, $2, 'Qualification Customer', 'Qualification Customer', 'USD', TRUE)",
      [`cus_pg_${suffix}`, organizationA],
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

  it('sets requested transaction isolation before tenant context', async () => {
    const isolation = await db.transaction(async (tx) => {
      const result = await tx.query<{ transaction_isolation: string }>('SHOW transaction_isolation');
      return result.rows[0]?.transaction_isolation;
    }, { organizationId: organizationA, isolationLevel: 'REPEATABLE READ' });
    expect(isolation).toBe('repeatable read');
  });

  it('exports a tenant-scoped recovery artifact inside a repeatable-read transaction', async () => {
    const keyring = {
      activeKeyId: 'pg-qualification',
      encryptionKeys: { 'pg-qualification': Buffer.alloc(32, 17) },
      hmacKeys: { 'pg-qualification': Buffer.alloc(32, 29) },
    };
    let transactionOptions: { organizationId?: string; isolationLevel?: string } | undefined;
    const service = new RecoveryArtifactService({
      repository: new SqlRecoveryRepository(),
      keyring,
      stager: { stage: async () => undefined },
      reconcilers: [],
      promoter: {} as any,
      ownerAuthorizer: {} as any,
      transactionManager: {
        transaction: (callback, options) => {
          transactionOptions = options;
          return db.transaction(callback, options);
        },
      },
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });

    const artifact = await service.createArtifact(organizationA, ownerId);
    const payload = openRecoveryPayload(artifact.envelope, keyring);
    expect(transactionOptions).toEqual({ organizationId: organizationA, isolationLevel: 'REPEATABLE READ' });
    expect(payload.organizationId).toBe(organizationA);
    expect(payload.tables.accounts.every((row) => row.organization_id === organizationA)).toBe(true);
    expect(payload.tables.accounts.some((row) => row.id === `acc_pg_other_${suffix}`)).toBe(false);
  });

  it('round-trips SQL DATE ranges as calendar dates in Asia/Calcutta', async () => {
    const originalTimeZone = process.env.TZ;
    process.env.TZ = 'Asia/Calcutta';
    try {
      const periodKey = '1999-05';
      const review = await PeriodCloseService.saveReview(
        organizationA, ownerId, periodKey, '1999-05-01', '1999-05-31', [], 'Timezone qualification review'
      );
      expect(review.periodStart).toBe('1999-05-01');
      expect(review.periodEnd).toBe('1999-05-31');
      await expect(PeriodCloseService.saveReview(
        organizationA, ownerId, periodKey, '1999-05-01', '1999-05-30', [], 'Mismatched date range'
      )).rejects.toThrow(/PERIOD_CLOSE_RANGE_CONFLICT/);
    } finally {
      if (originalTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimeZone;
    }
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

  it('creates, edits with a stale-version guard, and voids an invoice with balanced linked journals and audit evidence on PostgreSQL', async () => {
    const customerId = 'cus_pg_' + suffix;
    const invoice = await SalesEngine.createAndPostInvoice(organizationA, {
      invoiceNumber: 'PG-INV-' + suffix,
      customerId,
      customerName: 'Qualification Customer',
      issueDate: '2026-09-09',
      dueDate: '2026-10-09',
      lineItems: [{ description: 'PostgreSQL invoice qualification', quantity: 1, unitPrice: 125, taxRate: 0 }],
    }, ownerId);
    expect(invoice.status).toBe('POSTED');
    expect(String(invoice.editVersion)).toBe('1');

    await expect(SalesEngine.updateInvoice(organizationA, invoice.id, {
      items: [{ description: 'Stale invoice draft', quantity: 1, unitPrice: 150, taxRate: 0 }],
      editReason: 'Qualification stale version attempt',
    }, ownerId, '0')).rejects.toMatchObject({ code: 'INVOICE_EDIT_CONFLICT' });
    const unchanged = await client.query(
      'SELECT total_amount, edit_version, journal_entry_id FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationA, invoice.id],
    );
    expect(Number(unchanged.rows[0].total_amount)).toBe(125);
    expect(String(unchanged.rows[0].edit_version)).toBe('1');
    expect(unchanged.rows[0].journal_entry_id).toBe(invoice.journalEntryId);

    const revised = await SalesEngine.updateInvoice(organizationA, invoice.id, {
      items: [{ description: 'Revised PostgreSQL qualification', quantity: 1, unitPrice: 150, taxRate: 0 }],
      editReason: 'Qualification invoice revision',
    }, ownerId, '1');
    expect(Number(revised.totalAmount)).toBe(150);
    expect(String(revised.editVersion)).toBe('2');
    expect(revised.journalEntryId).not.toBe(invoice.journalEntryId);

    const voided = await FinancialDestructiveActionsService.voidInvoice(
      organizationA, invoice.id, ownerId, 'PostgreSQL qualification void',
    );
    expect(voided.success).toBe(true);
    expect(voided.journalEntryId).toBeTruthy();
    expect(voided.auditLogId).toBeTruthy();
    const finalInvoice = await client.query(
      'SELECT status, balance_due, edit_version, reversal_journal_id, reversal_reason FROM invoices WHERE organization_id = $1 AND id = $2',
      [organizationA, invoice.id],
    );
    expect(finalInvoice.rows[0]).toMatchObject({ status: 'VOIDED', reversal_journal_id: voided.journalEntryId, reversal_reason: 'PostgreSQL qualification void' });
    expect(Number(finalInvoice.rows[0].balance_due)).toBe(0);
    expect(String(finalInvoice.rows[0].edit_version)).toBe('3');

    const journals = await client.query(
      'SELECT id, status, reversal_of_journal_id FROM journal_entries WHERE organization_id = $1 AND id = ANY($2::varchar[])',
      [organizationA, [invoice.journalEntryId, revised.journalEntryId, voided.journalEntryId]],
    );
    expect(journals.rows).toHaveLength(3);
    const reversal = journals.rows.find((row) => row.id === voided.journalEntryId);
    expect(reversal).toMatchObject({ status: 'Posted', reversal_of_journal_id: revised.journalEntryId });
    const reversedBalances = await client.query(
      'SELECT original.account_id, SUM(original.debit - original.credit) AS original_net, SUM(reversal.debit - reversal.credit) AS reversal_net FROM journal_lines original JOIN journal_lines reversal ON reversal.account_id = original.account_id WHERE original.organization_id = $1 AND original.journal_entry_id = $2 AND reversal.organization_id = $1 AND reversal.journal_entry_id = $3 GROUP BY original.account_id',
      [organizationA, revised.journalEntryId, voided.journalEntryId],
    );
    expect(reversedBalances.rows.length).toBeGreaterThanOrEqual(2);
    for (const row of reversedBalances.rows) expect(Number(row.original_net) + Number(row.reversal_net)).toBe(0);
    const audit = await client.query(
      "SELECT after_state FROM audit_logs WHERE organization_id = $1 AND user_id = $2 AND action = 'INVOICE_VOIDED' AND entity_id = $3",
      [organizationA, ownerId, invoice.id],
    );
    expect(audit.rows).toHaveLength(1);
    const after = typeof audit.rows[0].after_state === 'string' ? JSON.parse(audit.rows[0].after_state) : audit.rows[0].after_state;
    expect(after).toMatchObject({ status: 'VOIDED', reversalJournalId: voided.journalEntryId, reason: 'PostgreSQL qualification void' });
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
