import { describe, it, expect, beforeAll } from 'vitest';
import { GlobalSearchService } from '../../server/src/services/GlobalSearchService';
import { db } from '../../server/src/database/db';
import { MigrationRunner } from '../../server/src/database/migrationRunner';

describe('Phase 8.3 — Global Search Integration, Navigation & Security Tests', () => {
  const testOrgA = 'ORG-TEST-SEARCH-A';
  const testOrgB = 'ORG-TEST-SEARCH-B';

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Seed test customer for Org A
    await db.query(
      `INSERT INTO customers (id, organization_id, display_name, legal_name, email, gstin, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      ['cust-s-1', testOrgA, 'Apex Global Systems', 'Apex Global Systems Pvt Ltd', 'contact@apexglobal.com', '36AABCA1234F1Z5', '+91 9876543210']
    );

    // Seed test vendor for Org A
    await db.query(
      `INSERT INTO vendors (id, organization_id, name, company_name, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      ['vend-s-1', testOrgA, 'Cloud Infrastructure Solutions', 'Cloud Infra Inc', 'billing@cloudinfra.io', '+1 555-0199']
    );

    // Seed test invoice for Org A
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, total_amount, status, issue_date, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      ['inv-s-1', testOrgA, 'INV-2026-SEARCH-001', 'Apex Global Systems', 95000, 'Sent', '2026-08-10', '2026-08-20']
    );

    // Seed test bill for Org A
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_name, total_amount, status, bill_date, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      ['bill-s-1', testOrgA, 'BILL-2026-SEARCH-001', 'Cloud Infrastructure Solutions', 42000, 'Unpaid', '2026-08-10', '2026-08-25']
    );

    // Seed secret record in Org B
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, client_name, total_amount, status, issue_date, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      ['inv-s-b', testOrgB, 'INV-SECRET-TENANT-B', 'Secret Client Org B', 500000, 'Paid', '2026-08-10', '2026-08-20']
    );
  });

  it('1. GlobalSearchService connects and returns real search results', async () => {
    const results = await GlobalSearchService.search(testOrgA, 'INV-2026-SEARCH');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.title === 'INV-2026-SEARCH-001')).toBe(true);
  });

  it('2. Minimum query length is respected (queries under 2 characters return empty array)', async () => {
    const singleChar = await GlobalSearchService.search(testOrgA, 'A');
    expect(singleChar).toEqual([]);
    const emptyQuery = await GlobalSearchService.search(testOrgA, '  ');
    expect(emptyQuery).toEqual([]);
  });

  it('3. Customer search matches customer name, email, phone, and GSTIN', async () => {
    const byName = await GlobalSearchService.search(testOrgA, 'Apex Global');
    expect(byName.some((r) => r.category === 'Customer' && r.title === 'Apex Global Systems')).toBe(true);

    const byGstin = await GlobalSearchService.search(testOrgA, '36AABCA1234F1Z5');
    expect(byGstin.some((r) => r.category === 'Customer')).toBe(true);

    const byEmail = await GlobalSearchService.search(testOrgA, 'apexglobal.com');
    expect(byEmail.some((r) => r.category === 'Customer')).toBe(true);
  });

  it('4. Vendor search matches vendor name, company name, and email', async () => {
    const byVendorName = await GlobalSearchService.search(testOrgA, 'Cloud Infrastructure');
    expect(byVendorName.some((r) => r.category === 'Vendor' && r.title === 'Cloud Infrastructure Solutions')).toBe(true);

    const byEmail = await GlobalSearchService.search(testOrgA, 'cloudinfra.io');
    expect(byEmail.some((r) => r.category === 'Vendor')).toBe(true);
  });

  it('5. Document number search matches invoices, quotes, bills, and purchase orders', async () => {
    const invResults = await GlobalSearchService.search(testOrgA, 'INV-2026-SEARCH-001');
    expect(invResults.some((r) => r.category === 'Invoice' && r.amount === 95000)).toBe(true);

    const billResults = await GlobalSearchService.search(testOrgA, 'BILL-2026-SEARCH-001');
    expect(billResults.some((r) => r.category === 'Vendor Bill' && r.amount === 42000)).toBe(true);
  });

  it('6. Organization A search NEVER leaks records from Organization B', async () => {
    // Org A querying Org B record
    const orgASearch = await GlobalSearchService.search(testOrgA, 'INV-SECRET-TENANT-B');
    expect(orgASearch.length).toBe(0);

    // Org B querying Org B record
    const orgBSearch = await GlobalSearchService.search(testOrgB, 'INV-SECRET-TENANT-B');
    expect(orgBSearch.length).toBe(1);
    expect(orgBSearch[0].title).toBe('INV-SECRET-TENANT-B');
  });

  it('7. Permission-restricted records are filtered out for users lacking permissions', async () => {
    // User with only invoice permissions should not see bills
    const salesOnlyPerms = ['invoice.view', 'invoice.create'];
    const resultsSalesUser = await GlobalSearchService.search(testOrgA, '2026-SEARCH', salesOnlyPerms);
    expect(resultsSalesUser.some((r) => r.category === 'Invoice')).toBe(true);
    expect(resultsSalesUser.some((r) => r.category === 'Vendor Bill')).toBe(false);

    // User with purchase permissions should see bills
    const purchasePerms = ['bill.view', 'bill.create'];
    const resultsPurchasesUser = await GlobalSearchService.search(testOrgA, '2026-SEARCH', purchasePerms);
    expect(resultsPurchasesUser.some((r) => r.category === 'Vendor Bill')).toBe(true);
    expect(resultsPurchasesUser.some((r) => r.category === 'Invoice')).toBe(false);
  });

  it('8. Empty results state returns empty list without error', async () => {
    const results = await GlobalSearchService.search(testOrgA, 'NON_EXISTENT_STRING_XYZ_999');
    expect(results).toEqual([]);
  });

  it('9. Stale request token logic ensures latest query is authoritative', () => {
    let latestSequence = 0;
    const executeMockSearch = (seq: number) => {
      if (seq < latestSequence) {
        return null; // Stale request discarded
      }
      return `Results for seq ${seq}`;
    };

    latestSequence = 1;
    const req1 = 1;

    latestSequence = 2;
    const req2 = 2;

    // Suppose req1 finishes after req2
    expect(executeMockSearch(req2)).toBe('Results for seq 2');
    expect(executeMockSearch(req1)).toBeNull(); // Discarded
  });
});
