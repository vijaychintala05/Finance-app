import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { ARAgingReportService } from '../services/ARAgingReportService';
import { APAgingReportService } from '../services/APAgingReportService';
import { CustomerStatementService } from '../services/CustomerStatementService';
import { VendorStatementService } from '../services/VendorStatementService';
import { CashFlowStatementService } from '../services/CashFlowStatementService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';

describe('Gate 7: Historical Financial Parity Across Application & Schema Upgrades', () => {
  const ORG_ID = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const CUST_A1 = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
  const VEND_A1 = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id;

  // Snapshot containers
  let preUpgradeRowCounts: Record<string, number> = {};
  let preUpgradeTableHashes: Record<string, string> = {};
  let preUpgradeTB: any;
  let preUpgradeBS: any;
  let preUpgradePL: any;
  let preUpgradeAR: any;
  let preUpgradeAP: any;
  let preUpgradeCustStmt: any;
  let preUpgradeVendStmt: any;
  let preUpgradeCashFlow: any;

  const FINANCIAL_TABLES = [
    'invoices',
    'invoice_items',
    'payments_received',
    'payment_received_allocations',
    'credit_notes',
    'credit_note_applications',
    'bills',
    'payments_made',
    'vendor_advances',
    'vendor_advance_applications',
    'journal_entries',
    'journal_lines',
    'accounts',
    'customers',
    'vendors',
  ];

  function hashRows(rows: any[]): string {
    const sorted = [...rows].sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    const serialized = JSON.stringify(sorted, (key, value) => {
      // Normalize timestamp fields that might change format slightly
      if (key === 'created_at' || key === 'updated_at' || key === 'applied_at') {
        return value ? new Date(value).toISOString() : null;
      }
      return value;
    });
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  beforeEach(async () => {
    // 1. Reset fixture with standard tables
    await MasterFinanceFixture.reset();

    // 2. Populate complex realistic multi-month financial ledger
    // Invoices
    for (let i = 1; i <= 10; i++) {
      await SalesEngine.createAndPostInvoice(ORG_ID, {
        customerId: CUST_A1,
        customerName: 'Customer A1 (AP GST Registered)',
        issueDate: `2026-05-${String(i).padStart(2, '0')}`,
        dueDate: `2026-06-${String(i).padStart(2, '0')}`,
        lineItems: [
          {
            itemId: 'item-org-acme-ap-ITEM-018',
            name: '18% Architectural Consultation',
            quantity: i,
            unitPrice: 5000.00,
            taxRate: 18,
            taxAmount: (5000.00 * i * 0.18),
            totalAmount: (5000.00 * i * 1.18),
          },
        ],
        subtotal: 5000.00 * i,
        taxTotal: 5000.00 * i * 0.18,
        discount: 0,
        roundOffAmount: 0,
        totalAmount: 5000.00 * i * 1.18,
        status: 'POSTED',
      });
    }

    // Bills
    for (let i = 1; i <= 5; i++) {
      await PurchasesEngine.createAndPostBill(ORG_ID, {
        vendorId: VEND_A1,
        vendorName: 'Vendor A1 (AP GST Registered)',
        billNumber: `BILL-PARITY-${i}`,
        billDate: `2026-05-${String(i + 5).padStart(2, '0')}`,
        dueDate: `2026-06-${String(i + 5).padStart(2, '0')}`,
        lineItems: [
          {
            name: 'Raw Plywood Supply',
            quantity: i * 2,
            unitPrice: 2000.00,
            taxRate: 18,
            taxAmount: (2000.00 * i * 2 * 0.18),
            amount: (2000.00 * i * 2),
          },
        ],
        subtotal: 2000.00 * i * 2,
        taxTotal: 2000.00 * i * 2 * 0.18,
        totalAmount: 2000.00 * i * 2 * 1.18,
        status: 'POSTED',
      });
    }

    // Capture pre-upgrade table hashes & row counts
    preUpgradeRowCounts = {};
    preUpgradeTableHashes = {};
    for (const table of FINANCIAL_TABLES) {
      const rowsRes = await db.query(`SELECT * FROM ${table}`);
      preUpgradeRowCounts[table] = rowsRes.rows.length;
      preUpgradeTableHashes[table] = hashRows(rowsRes.rows);
    }

    // Capture pre-upgrade financial statement reports
    preUpgradeTB = await TrialBalanceReportService.getTrialBalance(ORG_ID, { toDate: '2026-05-31' });
    preUpgradeBS = await BalanceSheetReportService.getBalanceSheet(ORG_ID, { toDate: '2026-05-31' });
    preUpgradePL = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, { toDate: '2026-05-31' });
    preUpgradeAR = await ARAgingReportService.getARAgingReport(ORG_ID, '2026-05-31');
    preUpgradeAP = await APAgingReportService.getAPAgingReport(ORG_ID, '2026-05-31');
    preUpgradeCustStmt = await CustomerStatementService.getCustomerStatement(ORG_ID, CUST_A1, '2026-05-01', '2026-05-31');
    preUpgradeVendStmt = await VendorStatementService.getVendorStatement(ORG_ID, VEND_A1, '2026-05-01', '2026-05-31');
    preUpgradeCashFlow = await CashFlowStatementService.getCashFlowStatement(ORG_ID, { fromDate: '2026-05-01', toDate: '2026-05-31' });
  });

  it('1. Upgrades database schema via MigrationRunner and preserves 100% exact row counts across all financial tables', async () => {
    // Execute full migration upgrade
    await MigrationRunner.runMigrations();

    for (const table of FINANCIAL_TABLES) {
      const postRowsRes = await db.query(`SELECT * FROM ${table}`);
      if (table === 'accounts') {
        expect(
          postRowsRes.rows.length,
          `Table accounts must preserve all existing accounts plus any newly provisioned system accounts`
        ).toBeGreaterThanOrEqual(preUpgradeRowCounts[table]);
      } else {
        expect(
          postRowsRes.rows.length,
          `Table ${table} row count must remain identical before and after migration`
        ).toBe(preUpgradeRowCounts[table]);
      }
    }
  });

  it('2. Preserves exact Trial Balance debits and credits down to the cent across schema upgrade', async () => {
    await MigrationRunner.runMigrations();

    const postUpgradeTB = await TrialBalanceReportService.getTrialBalance(ORG_ID, { toDate: '2026-05-31' });
    expect(postUpgradeTB.isBalanced).toBe(true);
    expect(postUpgradeTB.totalClosingDebit).toBe(preUpgradeTB.totalClosingDebit);
    expect(postUpgradeTB.totalClosingCredit).toBe(preUpgradeTB.totalClosingCredit);
    expect(postUpgradeTB.difference).toBe(0);
  });

  it('3. Preserves Balance Sheet equation (Assets = Liabilities + Equity) across schema upgrade', async () => {
    await MigrationRunner.runMigrations();

    const postUpgradeBS = await BalanceSheetReportService.getBalanceSheet(ORG_ID, { toDate: '2026-05-31' });
    expect(postUpgradeBS.isBalanced).toBe(true);
    expect(postUpgradeBS.totalAssets).toBe(preUpgradeBS.totalAssets);
    expect(postUpgradeBS.totalLiabilitiesAndEquity).toBe(preUpgradeBS.totalLiabilitiesAndEquity);
    expect(postUpgradeBS.difference).toBe(0);
  });

  it('4. Preserves Profit & Loss statement revenue, expenses, and net profit across schema upgrade', async () => {
    await MigrationRunner.runMigrations();

    const postUpgradePL = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, { toDate: '2026-05-31' });
    expect(postUpgradePL.totalRevenue).toBe(preUpgradePL.totalRevenue);
    expect(postUpgradePL.totalExpense).toBe(preUpgradePL.totalExpense);
    expect(postUpgradePL.netProfit).toBe(preUpgradePL.netProfit);
  });

  it('5. Preserves AR Subledger and AP Subledger reconciliation with GL Control Accounts across schema upgrade', async () => {
    await MigrationRunner.runMigrations();

    const postUpgradeAR = await ARAgingReportService.getARAgingReport(ORG_ID, '2026-05-31');
    expect(postUpgradeAR.totalSubledgerAmount).toBe(preUpgradeAR.totalSubledgerAmount);
    expect(postUpgradeAR.isReconciled).toBe(true);

    const postUpgradeAP = await APAgingReportService.getAPAgingReport(ORG_ID, '2026-05-31');
    expect(postUpgradeAP.totalSubledgerAmount).toBe(preUpgradeAP.totalSubledgerAmount);
    expect(postUpgradeAP.isReconciled).toBe(true);
  });

  it('6. Preserves Customer and Vendor Statements with zero mathematical deviation across schema upgrade', async () => {
    await MigrationRunner.runMigrations();

    const postCustStmt = await CustomerStatementService.getCustomerStatement(ORG_ID, CUST_A1, '2026-05-01', '2026-05-31');
    expect(postCustStmt.openingBalance).toBe(preUpgradeCustStmt.openingBalance);
    expect(postCustStmt.totalInvoices).toBe(preUpgradeCustStmt.totalInvoices);
    expect(postCustStmt.closingBalance).toBe(preUpgradeCustStmt.closingBalance);

    const postVendStmt = await VendorStatementService.getVendorStatement(ORG_ID, VEND_A1, '2026-05-01', '2026-05-31');
    expect(postVendStmt.openingBalance).toBe(preUpgradeVendStmt.openingBalance);
    expect(postVendStmt.totalBills).toBe(preUpgradeVendStmt.totalBills);
    expect(postVendStmt.closingBalance).toBe(preUpgradeVendStmt.closingBalance);
  });

  it('7. Full Organization Integrity Audit passes with 100% healthy status on upgraded schema', async () => {
    await MigrationRunner.runMigrations();

    const health = await AccountingIntegrityService.verifyOrganizationIntegrity(ORG_ID);
    expect(health.checks.journal.isBalanced).toBe(true);
    expect(health.checks.trialBalance.isBalanced).toBe(true);
    expect(health.checks.accountsReceivable.isBalanced).toBe(true);
    expect(health.checks.accountsPayable.isBalanced).toBe(true);
    expect(health.checks.banking.isBalanced).toBe(true);
    expect(health.checks.gst.isBalanced).toBe(true);
    expect(health.checks.accountBalanceCache.isBalanced).toBe(true);
    expect(health.isHealthy).toBe(true);
  });
});
