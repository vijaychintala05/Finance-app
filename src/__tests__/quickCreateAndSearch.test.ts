import { describe, it, expect, beforeAll } from 'vitest';
import { GlobalSearchService } from '../../server/src/services/GlobalSearchService';
import { db } from '../../server/src/database/db';
import { MigrationRunner } from '../../server/src/database/migrationRunner';

describe('Quick Create and Global Search Integration Tests', () => {
  const testOrgId = 'ORG-TEST-SEARCH-01';

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  it('1. GlobalSearchService enforces organization isolation on queries', async () => {
    // Insert test invoice for testOrgId
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, total_amount, status, issue_date, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      ['inv-search-test-1', testOrgId, 'INV-SEARCH-999', 'Search Target Customer', 8888, 'Sent', '2026-08-10', '2026-08-20']
    );

    // Search with matching orgId
    const matchingResults = await GlobalSearchService.search(testOrgId, 'INV-SEARCH-999');
    expect(matchingResults.some((r) => r.title === 'INV-SEARCH-999')).toBe(true);

    // Search with different orgId (isolation check)
    const isolatedResults = await GlobalSearchService.search('ORG-OTHER-TENANT', 'INV-SEARCH-999');
    expect(isolatedResults.some((r) => r.title === 'INV-SEARCH-999')).toBe(false);
  });

  it('2. GlobalSearchService matches customer names and amounts', async () => {
    const results = await GlobalSearchService.search(testOrgId, 'Search Target Customer');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].category).toBe('Invoice');
    expect(results[0].amount).toBe(8888);
  });
});
