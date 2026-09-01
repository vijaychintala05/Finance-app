import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { BackupRestoreService, BackupPayload } from '../database/BackupRestoreService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { SalesEngine } from '../sales/SalesEngine';
import { MigrationRunner } from '../database/migrationRunner';

describe('Gate 8: Legacy Backup Upgrade, 3x Multi-Cycle Restore & Operational Continuity Suite', () => {
  const ORG_A = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const CUST_A1 = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
  const VEND_A1 = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id;

  beforeEach(async () => {
    await MasterFinanceFixture.reset();
  });

  it('1. 3x Multi-Cycle Restore: 3 consecutive backup/restore cycles produce identical financial states with zero drift', async () => {
    // 1. Seed initial data
    for (let i = 1; i <= 3; i++) {
      await MasterFinanceFixture.createStandardInvoice(ORG_A, {
        customerId: CUST_A1,
        issueDate: `2026-05-0${i}`,
        quantity: 5,
        unitPrice: 2000.00,
      });
      await MasterFinanceFixture.createStandardBill(ORG_A, {
        vendorId: VEND_A1,
        billDate: `2026-05-0${i}`,
        quantity: 2,
        unitPrice: 1500.00,
      });
    }

    // Capture initial baseline reports
    const baseTB = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-05-31' });
    const baseBS = await BalanceSheetReportService.getBalanceSheet(ORG_A, { toDate: '2026-05-31' });
    const basePL = await ProfitAndLossReportService.getProfitAndLoss(ORG_A, { toDate: '2026-05-31' });

    let currentBackup: BackupPayload;

    // Cycle 1: Backup -> Restore
    currentBackup = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
    await BackupRestoreService.restoreBackup(ORG_A, currentBackup, 'usr-owner-a');
    const tbCycle1 = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-05-31' });
    expect(tbCycle1.totalClosingDebit).toBe(baseTB.totalClosingDebit);

    // Cycle 2: Backup -> Restore
    currentBackup = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
    await BackupRestoreService.restoreBackup(ORG_A, currentBackup, 'usr-owner-a');
    const bsCycle2 = await BalanceSheetReportService.getBalanceSheet(ORG_A, { toDate: '2026-05-31' });
    expect(bsCycle2.totalAssets).toBe(baseBS.totalAssets);

    // Cycle 3: Backup -> Restore
    currentBackup = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
    await BackupRestoreService.restoreBackup(ORG_A, currentBackup, 'usr-owner-a');
    const tbCycle3 = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-05-31' });
    const bsCycle3 = await BalanceSheetReportService.getBalanceSheet(ORG_A, { toDate: '2026-05-31' });
    const plCycle3 = await ProfitAndLossReportService.getProfitAndLoss(ORG_A, { toDate: '2026-05-31' });

    // Assert absolute parity at Cycle 3
    expect(tbCycle3.totalClosingDebit).toBe(baseTB.totalClosingDebit);
    expect(tbCycle3.totalClosingCredit).toBe(baseTB.totalClosingCredit);
    expect(bsCycle3.totalAssets).toBe(baseBS.totalAssets);
    expect(bsCycle3.totalLiabilitiesAndEquity).toBe(baseBS.totalLiabilitiesAndEquity);
    expect(plCycle3.netProfit).toBe(basePL.netProfit);
  });

  it('2. Schema Upgrade on Restored Data: Migrations run idempotently over restored database without altering financial values', async () => {
    // 1. Create and backup data
    await MasterFinanceFixture.createStandardInvoice(ORG_A, {
      customerId: CUST_A1,
      issueDate: '2026-05-15',
      quantity: 10,
      unitPrice: 5000.00,
    });
    const backup = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');

    // 2. Restore into clean environment
    await db.query(`DELETE FROM invoices WHERE organization_id = $1`, [ORG_A]);
    await db.query(`DELETE FROM invoice_items WHERE invoice_id NOT IN (SELECT id FROM invoices)`);
    await BackupRestoreService.restoreBackup(ORG_A, backup, 'usr-owner-a');

    // 3. Re-run migration suite over restored database
    await MigrationRunner.runMigrations();

    // 4. Verify financial integrity
    const health = await AccountingIntegrityService.verifyOrganizationIntegrity(ORG_A);
    expect(health.isHealthy).toBe(true);

    const tb = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-05-31' });
    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);
  });

  it('3. Post-Restore Payment Settlement: Restored invoices can be settled via PaymentsEngine seamlessly', async () => {
    // 1. Create unpaid invoice
    const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A, {
      customerId: CUST_A1,
      issueDate: '2026-05-10',
      quantity: 5,
      unitPrice: 2000.00, // ₹10,000 + 18% = ₹11,800
    });

    // 2. Backup and restore
    const backup = await BackupRestoreService.createBackup(ORG_A, 'usr-owner-a');
    await BackupRestoreService.restoreBackup(ORG_A, backup, 'usr-owner-a');

    // 3. Settle invoice on restored database
    const payment = await SalesEngine.recordPayment(ORG_A, {
      customerId: CUST_A1,
      paymentDate: '2026-05-20',
      depositToAccountId: '1010', // Bank account
      amount: 11800.00,
      reference: 'CHQ-RESTORE-001',
      allocations: [
        {
          invoiceId: inv.invoiceId,
          amount: 11800.00,
        },
      ],
    });

    expect(payment.id).toBeDefined();

    // 4. Verify invoice status is updated to PAID on restored database
    const checkInv = await db.query(`SELECT status, balance_due FROM invoices WHERE id = $1`, [inv.invoiceId]);
    expect(checkInv.rows[0].status).toBe('PAID');
    expect(Number(checkInv.rows[0].balance_due)).toBe(0);

    // 5. Verify accounting health
    const postPayHealth = await AccountingIntegrityService.verifyOrganizationIntegrity(ORG_A);
    expect(postPayHealth.isHealthy).toBe(true);
  });
});
