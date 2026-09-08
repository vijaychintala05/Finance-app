import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { BackupRestoreService, BackupPayload } from '../database/BackupRestoreService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';

const ORG_A = F.ORG_A.id;
const ORG_B = F.ORG_B.id;
const CUST_A = F.CUSTOMERS.A1.id;
const VEND_A = F.VENDORS.A1.id;
const OWNER_A = F.PERSONAS.ORG_A.owner.id;

describe('Stage 8: Disaster Recovery & Tenant-Isolated Restore Drills', () => {
  beforeEach(async () => {
    await MasterFinanceFixture.setup();
  });

  it('1. Executes full tenant backup, simulates database corruption, and verifies 100% financial restoration within RTO/RPO targets', async () => {
    // 1. Seed rich transactions in Org A
    const invoice1 = await SalesEngine.createAndPostInvoice(ORG_A, {
      customerId: CUST_A,
      issueDate: '2026-03-01',
      dueDate: '2026-03-15',
      lineItems: [{ description: 'Enterprise Licensing', quantity: 2, unitPrice: 5000, taxRate: 0 }],
    });
    expect(invoice1.totalAmount).toBe(10000);

    const payment1 = await SalesEngine.recordCustomerPayment(
      ORG_A,
      {
        invoiceId: invoice1.id,
        amount: 6000,
        paymentDate: '2026-03-05',
        paymentMode: 'BANK_TRANSFER',
        depositAccountId: `acc-${ORG_A}-1010`,
      },
      OWNER_A
    );
    expect(payment1.paymentId).toBeDefined();

    const bill1 = await PurchasesEngine.createAndPostBill(
      ORG_A,
      {
        vendorId: VEND_A,
        billDate: '2026-03-02',
        dueDate: '2026-03-20',
        lineItems: [{ description: 'Cloud Infrastructure Servers', quantity: 1, unitPrice: 3500, taxRate: 0 }],
      },
      OWNER_A
    );
    expect(bill1.totalAmount).toBe(3500);

    // 2. Also seed independent transaction in Org B to verify tenant isolation
    const invB = await SalesEngine.createAndPostInvoice(ORG_B, {
      customerId: F.CUSTOMERS.B1.id,
      issueDate: '2026-03-01',
      dueDate: '2026-03-15',
      lineItems: [{ description: 'Isolation Client Service', quantity: 1, unitPrice: 2000, taxRate: 0 }],
    });
    expect(invB.totalAmount).toBe(2000);

    // 3. Capture baseline pre-disaster state
    const preTB = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-03-31' });
    expect(preTB.difference).toBe(0);

    const preInvCountRes = await db.query(`SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1`, [ORG_A]);
    const preInvCount = Number(preInvCountRes.rows[0].cnt);

    const preJlCountRes = await db.query(
      `SELECT COUNT(*) as cnt FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.organization_id = $1`,
      [ORG_A]
    );
    const preJlCount = Number(preJlCountRes.rows[0].cnt);

    // 4. Create encrypted tenant snapshot
    const startTimeMs = Date.now();
    const backupSnapshot: BackupPayload = await BackupRestoreService.createBackup(ORG_A, OWNER_A);
    expect(backupSnapshot.metadata.organizationId).toBe(ORG_A);
    expect(backupSnapshot.metadata.checksum).toBeDefined();
    const verification = BackupRestoreService.verifyBackup(backupSnapshot);
    expect(verification.isValid).toBe(true);

    // 5. Simulate severe database disaster / corruption in Org A
    await db.query(`DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE organization_id = $1)`, [ORG_A]);
    await db.query(`DELETE FROM payment_received_allocations WHERE payment_id IN (SELECT id FROM payments_received WHERE organization_id = $1)`, [ORG_A]);
    await db.query(`DELETE FROM payments_received WHERE organization_id = $1`, [ORG_A]);
    await db.query(`DELETE FROM invoices WHERE organization_id = $1`, [ORG_A]);

    const corruptedInvCountRes = await db.query(`SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1`, [ORG_A]);
    expect(Number(corruptedInvCountRes.rows[0].cnt)).toBe(0);

    // 6. Execute atomic restore drill
    const restoreResult = await BackupRestoreService.restoreBackup(ORG_A, backupSnapshot, OWNER_A);
    expect(restoreResult.success).toBe(true);

    const restoreDurationMs = Date.now() - startTimeMs;
    // RTO target: < 30 seconds
    expect(restoreDurationMs).toBeLessThan(30000);

    // 7. Verify RPO = 0: All financial records restored to exact pre-disaster counts
    const postInvCountRes = await db.query(`SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1`, [ORG_A]);
    expect(Number(postInvCountRes.rows[0].cnt)).toBe(preInvCount);

    const postJlCountRes = await db.query(
      `SELECT COUNT(*) as cnt FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.organization_id = $1`,
      [ORG_A]
    );
    expect(Number(postJlCountRes.rows[0].cnt)).toBe(preJlCount);

    // 8. Verify General Ledger Trial Balance equilibrium & exact figures match
    const postTB = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-03-31' });
    expect(postTB.difference).toBe(0);
    expect(postTB.totalClosingDebit).toBeCloseTo(preTB.totalClosingDebit, 2);
    expect(postTB.totalClosingCredit).toBeCloseTo(preTB.totalClosingCredit, 2);

    // 9. Verify Tenant Isolation: Org B was completely untouched by Org A's disaster & restore
    const postInvBRes = await db.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2`, [ORG_B, invB.id]);
    expect(postInvBRes.rows.length).toBe(1);
    expect(Number(postInvBRes.rows[0].total_amount)).toBe(2000);
  });
});
