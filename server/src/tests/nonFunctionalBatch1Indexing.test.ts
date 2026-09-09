import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';

describe('Non-Functional Batch 1: High-Volume Database Indexing & Query Timeouts', () => {
  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('1. Initializes composite database indexes cleanly during schema migrations', async () => {
    // Verify that querying with composite filters against core tables runs cleanly
    const orgId = 'org-test-nfr-1';
    
    // Insert a test organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [orgId, 'uuid-test-nfr-1', 'PUB-NFR-1', 'NFR1', 'Test Org NFR', 'India', 'INR', '₹', 'usr-test-1']
    );

    // Verify index-targeted queries on journal_lines
    const jlRes = await db.query(
      `SELECT id FROM journal_lines WHERE organization_id = $1 AND account_id = $2 AND journal_entry_id = $3`,
      [orgId, 'acc-1', 'je-1']
    );
    expect(jlRes.rows).toEqual([]);

    // Verify index-targeted queries on invoices
    const invRes = await db.query(
      `SELECT id FROM invoices WHERE organization_id = $1 AND status = $2 AND issue_date >= $3`,
      [orgId, 'PAID', '2026-01-01']
    );
    expect(invRes.rows).toEqual([]);

    // Verify index-targeted queries on bills
    const billRes = await db.query(
      `SELECT id FROM bills WHERE organization_id = $1 AND status = $2 AND bill_date >= $3`,
      [orgId, 'OPEN', '2026-01-01']
    );
    expect(billRes.rows).toEqual([]);

    // Verify index-targeted queries on payments_received
    const prRes = await db.query(
      `SELECT id FROM payments_received WHERE organization_id = $1 AND client_id = $2 AND payment_date >= $3`,
      [orgId, 'cust-1', '2026-01-01']
    );
    expect(prRes.rows).toEqual([]);

    // Verify index-targeted queries on payments_made
    const pmRes = await db.query(
      `SELECT id FROM payments_made WHERE organization_id = $1 AND vendor_id = $2 AND payment_date >= $3`,
      [orgId, 'vend-1', '2026-01-01']
    );
    expect(pmRes.rows).toEqual([]);
  });

  it('2. Executes queries with statement timeout successfully when query completes within limit', async () => {
    const result = await db.query(
      'SELECT 1 as num, CURRENT_TIMESTAMP as ts',
      [],
      { timeoutMs: 2000 }
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].num).toBe(1);
  });

  it('3. executeWithTimeout aborts long-running operations and throws QUERY_TIMEOUT', async () => {
    const timeoutMs = 50;

    await expect(
      db.executeWithTimeout(timeoutMs, async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return 'should_not_reach';
      })
    ).rejects.toThrow(/QUERY_TIMEOUT/);
  });

  it('4. executeWithTimeout succeeds within timeout limit', async () => {
    const res = await db.executeWithTimeout(1000, async (client) => {
      const q = await client.query('SELECT 42 as answer');
      return q.rows[0].answer;
    });
    expect(res).toBe(42);
  });
});
