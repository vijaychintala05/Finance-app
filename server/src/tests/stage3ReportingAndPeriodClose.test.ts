import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ARAgingReportService } from '../services/ARAgingReportService';
import { APAgingReportService } from '../services/APAgingReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { CashFlowStatementService } from '../services/CashFlowStatementService';
import { CustomerStatementService } from '../services/CustomerStatementService';
import { VendorStatementService } from '../services/VendorStatementService';
import { DrillDownService } from '../services/DrillDownService';
import { PeriodCloseService } from '../services/PeriodCloseService';
import { ReportExportService } from '../services/ReportExportService';
import { LedgerQueryService } from '../services/LedgerQueryService';
import { newId } from '../utils/ids';

const ORG = F.ORG_A.id;
const ACTOR = F.PERSONAS.ORG_A.owner.id;
const CUST = F.CUSTOMERS.A1.id;
const VEND = F.VENDORS.A1.id;

describe('Stage 3 — Make reporting and period closing dependable', () => {
  beforeEach(async () => {
    await MasterFinanceFixture.setup();
  });

  // 1. Historical AR Aging
  describe('1. Historical AR Aging using effective-date settlements', () => {
    it('reports historical balance correctly as of effective date even after later full settlement', async () => {
      // Create invoice on 2026-03-05 for 10,000, due 2026-03-25
      const invoice = await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-03-05',
        dueDate: '2026-03-25',
        lineItems: [
          { description: 'Consulting Service', quantity: 1, unitPrice: 10000, taxRate: 0, amount: 10000 },
        ],
        notes: 'Invoice for March 5',
      }, ACTOR);

      expect(invoice.id).toBeDefined();
      expect(Number(invoice.totalAmount)).toBe(10000);

      // On 2026-03-15 (10 days later), customer pays in full
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG])).rows[0].id;
      await SalesEngine.recordPayment(ORG, {
        customerId: CUST,
        invoiceId: invoice.id,
        amount: 10000,
        paymentDate: '2026-03-15',
        depositAccountId: bankAcc,
        paymentMode: 'BANK_TRANSFER',
      }, ACTOR);

      // Query AR aging as of 2026-03-05 (Before payment was made)
      const agingAsOf05 = await ARAgingReportService.getARAgingReport(ORG, '2026-03-05');
      expect(agingAsOf05.totalAgingAmount).toBe(10000);
      expect(agingAsOf05.rows.length).toBe(1);
      expect(agingAsOf05.rows[0].balance_due).toBe(10000);
      expect(agingAsOf05.rows[0].bucket).toBe('current');
      expect(agingAsOf05.isReconciled).toBe(true);
      expect(agingAsOf05.totalGLControlAmount).toBe(10000);

      // Query AR aging as of 2026-03-20 (After payment was made)
      const agingAsOf20 = await ARAgingReportService.getARAgingReport(ORG, '2026-03-20');
      expect(agingAsOf20.totalAgingAmount).toBe(0);
      expect(agingAsOf20.rows.length).toBe(0);
      expect(agingAsOf20.isReconciled).toBe(true);
      expect(agingAsOf20.totalGLControlAmount).toBe(0);
    });
  });

  // 2. Historical AP Aging
  describe('2. Historical AP Aging using effective-date settlements', () => {
    it('reports historical balance correctly as of effective date even after later full settlement', async () => {
      // Create bill on 2026-03-05 for 6,000, due 2026-03-20
      const bill = await PurchasesEngine.createAndPostBill(ORG, {
        vendorId: VEND,
        billDate: '2026-03-05',
        dueDate: '2026-03-20',
        lineItems: [
          { description: 'Raw materials', quantity: 1, unitPrice: 6000, taxRate: 0, amount: 6000 },
        ],
        notes: 'Bill for March 5',
      }, ACTOR);

      expect(bill.id).toBeDefined();
      expect(Number(bill.totalAmount)).toBe(6000);

      // On 2026-03-15, pay bill in full
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG])).rows[0].id;
      await PurchasesEngine.recordVendorPayment(ORG, {
        vendorId: VEND,
        billId: bill.id,
        amount: 6000,
        paymentDate: '2026-03-15',
        paidFromAccountId: bankAcc,
        paymentMode: 'BANK_TRANSFER',
      }, ACTOR);

      // Query AP aging as of 2026-03-05 (Before payment was made)
      const agingAsOf05 = await APAgingReportService.getAPAgingReport(ORG, '2026-03-05');
      expect(agingAsOf05.totalAgingAmount).toBe(6000);
      expect(agingAsOf05.rows.length).toBe(1);
      expect(agingAsOf05.rows[0].balance_due).toBe(6000);
      expect(agingAsOf05.rows[0].bucket).toBe('current');
      expect(agingAsOf05.isReconciled).toBe(true);
      expect(agingAsOf05.totalGLControlAmount).toBe(6000);

      // Query AP aging as of 2026-03-20 (After payment was made)
      const agingAsOf20 = await APAgingReportService.getAPAgingReport(ORG, '2026-03-20');
      expect(agingAsOf20.totalAgingAmount).toBe(0);
      expect(agingAsOf20.rows.length).toBe(0);
      expect(agingAsOf20.isReconciled).toBe(true);
      expect(agingAsOf20.totalGLControlAmount).toBe(0);
    });
  });

  // 3. Comparative P&L and Balance Sheet
  describe('3. Comparative P&L and Balance Sheet', () => {
    it('computes multi-period P&L variances and maintains Balance Sheet equilibrium', async () => {
      // Period 1 (2026-01-01 to 2026-01-31): Invoice for 20,000 revenue
      await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-01-15',
        lineItems: [{ description: 'P1 Consulting', quantity: 1, unitPrice: 20000, taxRate: 0, amount: 20000 }],
      }, ACTOR);

      // Period 2 (2026-02-01 to 2026-02-28): Invoice for 30,000 revenue
      await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-02-15',
        lineItems: [{ description: 'P2 Consulting', quantity: 1, unitPrice: 30000, taxRate: 0, amount: 30000 }],
      }, ACTOR);

      // Comparative P&L: Current (Feb 2026) vs Prior (Jan 2026)
      const compPnl = await ProfitAndLossReportService.getComparativeProfitAndLoss(ORG, {
        currentFromDate: '2026-02-01',
        currentToDate: '2026-02-28',
        priorFromDate: '2026-01-01',
        priorToDate: '2026-01-31',
      });

      expect(compPnl.totalRevenue.current).toBe(30000);
      expect(compPnl.totalRevenue.prior).toBe(20000);
      expect(compPnl.totalRevenue.varianceAmount).toBe(10000);
      expect(compPnl.totalRevenue.variancePercentage).toBe(50); // 50% growth

      // Comparative Balance Sheet: As of 2026-02-28 vs As of 2026-01-31
      const compBs = await BalanceSheetReportService.getComparativeBalanceSheet(ORG, {
        currentAsOfDate: '2026-02-28',
        priorAsOfDate: '2026-01-31',
      });

      expect(compBs.isBalancedCurrent).toBe(true);
      expect(compBs.isBalancedPrior).toBe(true);
      expect(compBs.totalAssets.prior).toBe(20000);
      expect(compBs.totalAssets.current).toBe(50000);
      expect(compBs.totalAssets.varianceAmount).toBe(30000);
    });
  });

  // 4. Validated Cash Flow Classification
  describe('4. Validated Cash Flow Statement Classification', () => {
    it('classifies operating working capital (AP) as operating and validates cash equation', async () => {
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG])).rows[0].id;

      // Initial funding / equity deposit on 2026-01-01 of 100,000
      const equityAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '3000'`, [ORG])).rows[0].id;
      const initialEntryId = newId('je');
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
         VALUES ($1, $2, 'JE-INIT-CASH', '2026-01-01', 'Capital', 'Initial capital funding', 'POSTED')`,
        [initialEntryId, ORG]
      );
      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
         VALUES 
          ($1, $2, $3, $4, 100000, 0),
          ($5, $2, $3, $6, 0, 100000)`,
        [newId('jl'), initialEntryId, ORG, bankAcc, newId('jl'), equityAcc]
      );

      // Incur vendor bill of 15,000 on 2026-01-05
      const bill = await PurchasesEngine.createAndPostBill(ORG, {
        vendorId: VEND,
        billDate: '2026-01-05',
        lineItems: [{ description: 'Office supplies', quantity: 1, unitPrice: 15000, taxRate: 0, amount: 15000 }],
      }, ACTOR);

      // Pay the vendor bill 15,000 from Bank on 2026-01-10 (Operating cash outflow via AP)
      await PurchasesEngine.recordVendorPayment(ORG, {
        vendorId: VEND,
        billId: bill.id,
        amount: 15000,
        paymentDate: '2026-01-10',
        paidFromAccountId: bankAcc,
        paymentMode: 'BANK_TRANSFER',
      }, ACTOR);

      // Generate Cash Flow Statement for January 2026
      const cfs = await CashFlowStatementService.getCashFlowStatement(ORG, {
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      });

      // Financing activities: +100,000 equity injection
      expect(cfs.financing.total).toBe(100000);
      // Operating activities: -15,000 paid to vendor (AP is operating working capital)
      expect(cfs.operating.total).toBe(-15000);
      expect(cfs.investing.total).toBe(0);

      // Check mathematical identity: Opening + Net Change == Closing
      const expectedClosing = cfs.openingCashBalance + cfs.operating.total + cfs.investing.total + cfs.financing.total;
      expect(cfs.closingCashBalance).toBe(expectedClosing);
      expect(cfs.difference).toBe(0);
    });
  });

  // 5. Customer & Vendor Statements
  describe('5. Customer and Vendor Statements with reliable opening balances', () => {
    it('maintains deterministic opening balance and running balances including write-offs', async () => {
      // Period 1: Invoice of 12,000 on 2026-01-10
      const inv = await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-01-10',
        lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 12000, taxRate: 0, amount: 12000 }],
      }, ACTOR);

      // Partial payment of 7,000 on 2026-01-20
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG])).rows[0].id;
      await SalesEngine.recordPayment(ORG, {
        customerId: CUST,
        invoiceId: inv.id,
        amount: 7000,
        paymentDate: '2026-01-20',
        depositAccountId: bankAcc,
        paymentMode: 'BANK_TRANSFER',
      }, ACTOR);

      // Write-off remaining 5,000 on 2026-02-05
      const badDebtAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '5000'`, [ORG])).rows[0].id;
      await db.query(
        `INSERT INTO ar_write_offs (id, organization_id, invoice_id, customer_id, write_off_date, amount, write_off_account_id, reason)
         VALUES ($1, $2, $3, $4, '2026-02-05', 5000, $5, 'Uncollectible')`,
        [newId('wo'), ORG, inv.id, CUST, badDebtAcc]
      );

      // Statement for Period 2 (2026-02-01 to 2026-02-28)
      const stmtFeb = await CustomerStatementService.getCustomerStatement(ORG, CUST, '2026-02-01', '2026-02-28');
      // Opening balance on Feb 1 must be 12,000 - 7,000 = 5,000
      expect(stmtFeb.openingBalance).toBe(5000);
      // In February, write-off occurred: 5,000 credit
      expect(stmtFeb.totalWriteOffs).toBe(5000);
      // Closing balance on Feb 28 must be 0
      expect(stmtFeb.closingBalance).toBe(0);
      expect(stmtFeb.transactions.length).toBe(1);
      expect(stmtFeb.transactions[0].type).toBe('Write-Off');
      expect(stmtFeb.transactions[0].runningBalance).toBe(0);
    });
  });

  // 6. Drill-Down Service
  describe('6. Report -> Journal -> Source-Document Drill-Down', () => {
    it('resolves journal entry back to invoice source document with party and lines', async () => {
      const invoice = await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-03-01',
        lineItems: [{ description: 'Web Platform Development', quantity: 1, unitPrice: 25000, taxRate: 0, amount: 25000 }],
      }, ACTOR);

      // Query journal entry ID created for this invoice
      const invRow = (await db.query(`SELECT journal_entry_id FROM invoices WHERE id = $1`, [invoice.id])).rows[0];
      expect(invRow.journal_entry_id).toBeDefined();

      // Drill down via DrillDownService
      const drill = await DrillDownService.getDrillDown(ORG, invRow.journal_entry_id);
      expect(drill.journalEntry).toBeDefined();
      expect(drill.journalEntry.lines.length).toBe(2);
      expect(drill.sourceDocument.type).toBe('INVOICE');
      expect(drill.sourceDocument.id).toBe(invoice.id);
      expect(drill.sourceDocument.documentNumber).toBe(invoice.invoiceNumber);
      expect(drill.sourceDocument.amount).toBe(25000);
      expect(drill.sourceDocument.partyId).toBe(CUST);
    });
  });

  // 7. Period Close and Reopen Governance
  describe('7. Consolidated Period Close and Reopen Governance', () => {
    it('validates integrity, closes period, prevents tampering, and logs audited reopen', async () => {
      const periodKey = '2026-01';
      const periodStart = '2026-01-01';
      const periodEnd = '2026-01-31';

      // 1. Validate period close
      const status = await PeriodCloseService.validatePeriodClose(ORG, periodKey, periodStart, periodEnd);
      expect(status.status).toBe('OPEN');
      expect(status.canClose).toBe(true);

      // 2. Complete saved month-end review
      const workspace = await PeriodCloseService.saveReview(
        ORG,
        ACTOR,
        periodKey,
        periodStart,
        periodEnd,
        [
          { code: 'REVIEW_TRIAL_BALANCE', title: 'Review trial balance and unusual balances', completed: true },
          { code: 'REVIEW_AR_AGING', title: 'Review receivables aging and exceptions', completed: true },
          { code: 'REVIEW_AP_AGING', title: 'Review payables aging and exceptions', completed: true },
          { code: 'REVIEW_BANK_RECON', title: 'Review bank reconciliation exceptions', completed: true },
        ],
        'All January accounts reconciled successfully'
      );
      expect(workspace.review?.status).toBe('READY_TO_CLOSE');

      // 3. Close the period
      const closeResult = await PeriodCloseService.closePeriod(ORG, ACTOR, periodKey, periodStart, periodEnd);
      expect(closeResult.success).toBe(true);

      // Check period lock exists and is active
      const lockRes = await db.query(
        `SELECT is_locked, status FROM period_locks WHERE organization_id = $1 AND period_name = $2`,
        [ORG, periodKey]
      );
      expect(lockRes.rows[0].is_locked).toBe(true);
      expect(lockRes.rows[0].status).toBe('Active');

      // 4. Reopen period with valid reason
      const reopenResult = await PeriodCloseService.reopenPeriod(
        ORG,
        ACTOR,
        periodKey,
        'Auditor requested backdated depreciation adjustment'
      );
      expect(reopenResult.success).toBe(true);

      // Verify audit log has recorded the reopen event
      const auditRes = await db.query(
        `SELECT action, user_id FROM audit_logs WHERE organization_id = $1 AND action = 'ACCOUNTING_PERIOD_REOPENED'`,
        [ORG]
      );
      expect(auditRes.rows.length).toBeGreaterThan(0);
      expect(auditRes.rows[0].user_id).toBe(ACTOR);
    });
  });

  // 8. CSV Exports
  describe('8. CSV Exports formatting', () => {
    it('formats General Ledger, AR aging, and customer statements correctly to CSV', async () => {
      // Create test data
      await SalesEngine.createAndPostInvoice(ORG, {
        customerId: CUST,
        issueDate: '2026-03-01',
        lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 5000, taxRate: 0, amount: 5000 }],
      }, ACTOR);

      const gl = await LedgerQueryService.getGeneralLedgerReport(ORG, {
        fromDate: '2026-03-01',
        toDate: '2026-03-31',
      });
      const rows = gl.accounts.flatMap((acc: any) =>
        acc.transactions.map((t: any) => ({
          accountCode: acc.accountCode || acc.code,
          accountName: acc.accountName || acc.name,
          date: t.entryDate,
          entryNumber: t.entryNumber,
          reference: t.reference || '',
          narration: t.narration || '',
          debit: t.debit,
          credit: t.credit,
        }))
      );

      const csv = ReportExportService.convertToCSV(rows);
      expect(csv).toContain('accountCode,accountName,date,entryNumber,reference,narration,debit,credit');
      expect(csv).toContain('1100');
      expect(csv).toContain('4010');
    });
  });
});
