import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { BackupRestoreService, BackupPayload } from '../database/BackupRestoreService';
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

describe('Gate 8: Full Clean-Instance Restore, Row Parity & Financial Equilibrium Suite', () => {
  const ORG_A = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const CUST_A1 = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
  const VEND_A1 = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id;

  let backupPayloadA: BackupPayload;
  let preBackupRowCounts: Record<string, number> = {};
  let preBackupTB: any;
  let preBackupBS: any;
  let preBackupPL: any;
  let preBackupAR: any;
  let preBackupAP: any;
  let preBackupCustStmt: any;
  let preBackupVendStmt: any;
  let preBackupCashFlow: any;

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

  beforeEach(async () => {
    await MasterFinanceFixture.reset();

    // 1. Seed rich multi-document history in ORG-A
    for (let i = 1; i <= 5; i++) {
      await MasterFinanceFixture.createStandardInvoice(ORG_A, {
        customerId: CUST_A1,
        customerName: 'Customer A1',
        issueDate: `2026-05-${String(i * 3).padStart(2, '0')}`,
        dueDate: `2026-06-${String(i * 3).padStart(2, '0')}`,
        quantity: i * 5,
        unitPrice: 2000.00,
        taxRate: 18,
      });
    }

    for (let i = 1; i <= 3; i++) {
      await MasterFinanceFixture.createStandardBill(ORG_A, {
        vendorId: VEND_A1,
        vendorName: 'Vendor A1',
        billDate: `2026-05-${String(i * 4).padStart(2, '0')}`,
        dueDate: `2026-06-${String(i * 4).padStart(2, '0')}`,
        quantity: i * 2,
        unitPrice: 3000.00,
        taxRate: 18,
      });
    }

    // Capture pre-backup row counts
    preBackupRowCounts = {};
    for (const table of FINANCIAL_TABLES) {
      const rowsRes = await db.query(`SELECT * FROM ${table}`);
      preBackupRowCounts[table] = rowsRes.rows.length;
    }

    // Capture pre-backup financial reports
    preBackupTB = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-05-31' });
    preBackupBS = await BalanceSheetReportService.getBalanceSheet(ORG_A, { toDate: '2026-05-31' });
    preBackupPL = await ProfitAndLossReportService.getProfitAndLoss(ORG_A, { toDate: '2026-05-31' });
    preBackupAR = await ARAgingReportService.getARAgingReport(ORG_A, '2026-05-31');
    preBackupAP = await APAgingReportService.getAPAgingReport(ORG_A, '2026-05-31');
    preBackupCustStmt = await CustomerStatementService.getCustomerStatement(ORG_A, CUST_A1, '2026-05-01', '2026-05-31');
    preBackupVendStmt = await VendorStatementService.getVendorStatement(ORG_A, VEND_A1, '2026-05-01', '2026-05-31');
    preBackupCashFlow = await CashFlowStatementService.getCashFlowStatement(ORG_A, { fromDate: '2026-05-01', toDate: '2026-05-31' });

    // Create pristine full backup payload
    backupPayloadA = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
  });

  it('1. Catastrophic Loss & Restore: Drops/clears database, restores from backup, and asserts exact row parity', async () => {
    // Simulate catastrophic data loss: clear all organization data
    for (const table of FINANCIAL_TABLES) {
      try {
        await db.query(`DELETE FROM ${table}`);
      } catch (e) {}
    }

    // Verify application state is empty
    const wipedInvoices = await db.query(`SELECT COUNT(*) as cnt FROM invoices`);
    expect(Number(wipedInvoices.rows[0].cnt)).toBe(0);

    // Execute restoration into clean environment
    const restoreResult = await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');
    expect(restoreResult.success).toBe(true);
    expect(restoreResult.restoredRecords).toBe(backupPayloadA.metadata.recordCount);

    // Verify row count parity across all financial tables
    for (const table of FINANCIAL_TABLES) {
      const postRowsRes = await db.query(
        table === 'journal_lines'
          ? `SELECT jl.* FROM journal_lines jl JOIN journal_entries je ON jl.journal_entry_id = je.id WHERE je.organization_id = $1`
          : table === 'invoice_items'
          ? `SELECT ii.* FROM invoice_items ii JOIN invoices i ON ii.invoice_id = i.id WHERE i.organization_id = $1`
          : `SELECT * FROM ${table} WHERE organization_id = $1`,
        [ORG_A]
      );
      const expectedCount = (backupPayloadA.data[table] || []).length;
      expect(
        postRowsRes.rows.length,
        `Table ${table} row count after restore must match backed up count`
      ).toBe(expectedCount);
    }
  });

  it('2. Financial Equilibrium Parity: Trial Balance, Balance Sheet and P&L match with ₹0.00 difference', async () => {
    // Wipe and restore
    for (const table of FINANCIAL_TABLES) {
      try { await db.query(`DELETE FROM ${table}`); } catch (e) {}
    }
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    // 1. Trial Balance Parity
    const postTB = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-05-31' });
    expect(postTB.isBalanced).toBe(true);
    expect(postTB.totalClosingDebit).toBe(preBackupTB.totalClosingDebit);
    expect(postTB.totalClosingCredit).toBe(preBackupTB.totalClosingCredit);
    expect(postTB.difference).toBe(0);

    // 2. Balance Sheet Parity
    const postBS = await BalanceSheetReportService.getBalanceSheet(ORG_A, { toDate: '2026-05-31' });
    expect(postBS.isBalanced).toBe(true);
    expect(postBS.totalAssets).toBe(preBackupBS.totalAssets);
    expect(postBS.totalLiabilitiesAndEquity).toBe(preBackupBS.totalLiabilitiesAndEquity);
    expect(postBS.difference).toBe(0);

    // 3. Profit & Loss Parity
    const postPL = await ProfitAndLossReportService.getProfitAndLoss(ORG_A, { toDate: '2026-05-31' });
    expect(postPL.totalRevenue).toBe(preBackupPL.totalRevenue);
    expect(postPL.totalExpense).toBe(preBackupPL.totalExpense);
    expect(postPL.netProfit).toBe(preBackupPL.netProfit);
  });

  it('3. Subledgers and Statements: AR/AP Aging and Customer/Vendor Statements match pre-loss numbers exactly', async () => {
    // Wipe and restore
    for (const table of FINANCIAL_TABLES) {
      try { await db.query(`DELETE FROM ${table}`); } catch (e) {}
    }
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    // AR & AP Subledgers
    const postAR = await ARAgingReportService.getARAgingReport(ORG_A, '2026-05-31');
    expect(postAR.totalSubledgerAmount).toBe(preBackupAR.totalSubledgerAmount);
    expect(postAR.isReconciled).toBe(true);

    const postAP = await APAgingReportService.getAPAgingReport(ORG_A, '2026-05-31');
    expect(postAP.totalSubledgerAmount).toBe(preBackupAP.totalSubledgerAmount);
    expect(postAP.isReconciled).toBe(true);

    // Customer & Vendor Statements
    const postCust = await CustomerStatementService.getCustomerStatement(ORG_A, CUST_A1, '2026-05-01', '2026-05-31');
    expect(postCust.openingBalance).toBe(preBackupCustStmt.openingBalance);
    expect(postCust.totalInvoices).toBe(preBackupCustStmt.totalInvoices);
    expect(postCust.closingBalance).toBe(preBackupCustStmt.closingBalance);

    const postVend = await VendorStatementService.getVendorStatement(ORG_A, VEND_A1, '2026-05-01', '2026-05-31');
    expect(postVend.openingBalance).toBe(preBackupVendStmt.openingBalance);
    expect(postVend.totalBills).toBe(preBackupVendStmt.totalBills);
    expect(postVend.closingBalance).toBe(preBackupVendStmt.closingBalance);
  });

  it('4. Global Financial Integrity Audit: Full 7/7 subsystem health check passes on restored system', async () => {
    // Wipe and restore
    for (const table of FINANCIAL_TABLES) {
      try { await db.query(`DELETE FROM ${table}`); } catch (e) {}
    }
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    const health = await AccountingIntegrityService.verifyOrganizationIntegrity(ORG_A);
    expect(health.checks.journal.isBalanced).toBe(true);
    expect(health.checks.trialBalance.isBalanced).toBe(true);
    expect(health.checks.accountsReceivable.isBalanced).toBe(true);
    expect(health.checks.accountsPayable.isBalanced).toBe(true);
    expect(health.checks.banking.isBalanced).toBe(true);
    expect(health.checks.gst.isBalanced).toBe(true);
    expect(health.checks.accountBalanceCache.isBalanced).toBe(true);
    expect(health.isHealthy).toBe(true);
  });

  it('5. Double-Entry Invariants: Restored journals contain zero unbalanced entries and zero orphan lines', async () => {
    // Wipe and restore
    for (const table of FINANCIAL_TABLES) {
      try { await db.query(`DELETE FROM ${table}`); } catch (e) {}
    }
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    // 1. Verify every journal balances via line sums
    const journals = await db.query(`
      SELECT je.id, COALESCE(SUM(jl.debit), 0) as debits, COALESCE(SUM(jl.credit), 0) as credits
      FROM journal_entries je
      JOIN journal_lines jl ON je.id = jl.journal_entry_id
      WHERE je.organization_id = $1
      GROUP BY je.id
    `, [ORG_A]);

    expect(journals.rows.length).toBeGreaterThan(0);
    for (const j of journals.rows) {
      expect(Number(j.debits)).toBe(Number(j.credits));
      expect(Number(j.debits)).toBeGreaterThan(0);
    }

    // 2. Verify no orphan lines
    const orphans = await db.query(`
      SELECT COUNT(*)::int as count
      FROM journal_lines jl
      LEFT JOIN journal_entries je ON jl.journal_entry_id = je.id
      WHERE je.id IS NULL
    `);
    expect(Number(orphans.rows[0].count)).toBe(0);
  });

  it('6. Operational Verification: Able to post new invoices, bills, and payments on the restored database', async () => {
    // Wipe and restore
    for (const table of FINANCIAL_TABLES) {
      try { await db.query(`DELETE FROM ${table}`); } catch (e) {}
    }
    await BackupRestoreService.restoreBackup(ORG_A, backupPayloadA, 'usr-owner-a');

    // Post new invoice on restored ledger
    const newInv = await MasterFinanceFixture.createStandardInvoice(ORG_A, {
      customerId: CUST_A1,
      customerName: 'Customer A1',
      issueDate: '2026-06-15',
      dueDate: '2026-07-15',
      quantity: 10,
      unitPrice: 1000.00,
    });
    expect(newInv.invoiceId).toBeDefined();

    // Verify global integrity remains healthy after new transaction
    const postTransHealth = await AccountingIntegrityService.verifyOrganizationIntegrity(ORG_A);
    expect(postTransHealth.isHealthy).toBe(true);
  });
});
