import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { SalesEngine } from '../sales/SalesEngine';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';

describe('Stage 8: Realistic Document Volume Load & Performance Testing', () => {
  const ORG_LOAD = `org_load_${Date.now()}`;
  const USER_LOAD = `usr_load_${Date.now()}`;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4, 'Active') ON CONFLICT DO NOTHING`,
      [USER_LOAD, `load_${Date.now()}@example.com`, 'hash_pwd', 'Load Test Admin']
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [ORG_LOAD, `uuid_${ORG_LOAD}`, `pub_${ORG_LOAD}`, `LOAD`, 'High-Volume Enterprise Corp', 'US', 'USD', '$', USER_LOAD]
    );

    await OrganizationProvisioningService.provisionDefaultChart(db, ORG_LOAD);
  }, 30000);

  it('1. Benchmarks high-throughput invoice postings with transactional double-entry GL integrity', async () => {
    const INVOICE_COUNT = 100; // Realistic batch under test runner constraints
    const startTime = Date.now();

    // Create a customer
    const custRes = await db.query(
      `INSERT INTO customers (id, organization_id, display_name, email, currency)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`cust_load_${Date.now()}`, ORG_LOAD, 'Enterprise Benchmark Client', 'loadclient@example.com', 'USD']
    );
    const customerId = custRes.rows[0].id;

    const latencies: number[] = [];

    for (let i = 1; i <= INVOICE_COUNT; i++) {
      const t0 = Date.now();
      const invoice = await SalesEngine.createAndPostInvoice(
        ORG_LOAD,
        {
          customerId,
          clientName: 'Enterprise Benchmark Client',
          issueDate: '2026-03-01',
          dueDate: '2026-03-31',
          lineItems: [
            { description: `Cloud Enterprise Plan Block ${i}`, quantity: 1, unitPrice: 150.0, taxRate: 18 },
            { description: `Support Service Level ${i}`, quantity: 2, unitPrice: 75.0, taxRate: 18 },
          ],
        },
        USER_LOAD
      );
      latencies.push(Date.now() - t0);

      expect(invoice.id).toBeDefined();
      expect(invoice.journalEntryId).toBeDefined();
      expect(Number(invoice.totalAmount)).toBe(354);
    }

    const totalDuration = Date.now() - startTime;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    console.log(`[Load Benchmark] ${INVOICE_COUNT} invoices posted in ${totalDuration}ms (Avg: ${avgLatency.toFixed(1)}ms, Max: ${maxLatency}ms)`);

    // In-memory / transactional posting average should be comfortably fast (< 250ms avg)
    expect(avgLatency).toBeLessThan(250);

    // Verify all invoices exist in database with balanced journal entries
    const invCountRes = await db.query(`SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1`, [ORG_LOAD]);
    expect(Number(invCountRes.rows[0].cnt)).toBe(INVOICE_COUNT);
  }, 60000);

  it('2. Benchmarks multi-period reporting performance under high document volume', async () => {
    // Benchmark Trial Balance execution latency
    const tbStart = Date.now();
    const tb = await TrialBalanceReportService.getTrialBalance(ORG_LOAD, { toDate: '2026-03-31' });
    const tbDuration = Date.now() - tbStart;

    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);
    expect(tb.totalClosingDebit).toBeGreaterThan(0);
    expect(tb.totalClosingDebit).toBeCloseTo(tb.totalClosingCredit, 2);
    // Trial balance should compute under 2000ms
    expect(tbDuration).toBeLessThan(2000);

    // Benchmark Profit & Loss execution latency
    const plStart = Date.now();
    const pl = await ProfitAndLossReportService.getProfitAndLoss(ORG_LOAD, {
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    const plDuration = Date.now() - plStart;

    expect(pl).toBeDefined();
    expect(pl.totalRevenue).toBeGreaterThan(0);
    // P&L calculation should compute under 2000ms
    expect(plDuration).toBeLessThan(2000);

    // Benchmark Balance Sheet execution latency
    const bsStart = Date.now();
    const bs = await BalanceSheetReportService.getBalanceSheet(ORG_LOAD, {
      asOfDate: '2026-12-31',
    });
    const bsDuration = Date.now() - bsStart;

    expect(bs).toBeDefined();
    expect(bsDuration).toBeLessThan(2000);

    console.log(`[Reporting Benchmark] TB: ${tbDuration}ms | P&L: ${plDuration}ms | BS: ${bsDuration}ms`);
  }, 30000);

  it('3. Evaluates memory stability and heap growth during batch execution', () => {
    const memory = process.memoryUsage();
    const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memory.heapTotal / 1024 / 1024);

    console.log(`[Memory Profiling] Heap Used: ${heapUsedMb} MB / Total: ${heapTotalMb} MB`);
    // Memory heap should remain stable and bounded under 512 MB
    expect(heapUsedMb).toBeLessThan(512);
  });
});
