import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { ARAgingReportService } from '../services/ARAgingReportService';
import { APAgingReportService } from '../services/APAgingReportService';
import { CustomerStatementService } from '../services/CustomerStatementService';
import { VendorStatementService } from '../services/VendorStatementService';
import { CashFlowStatementService } from '../services/CashFlowStatementService';
import { AccountingIntegrityService } from '../services/AccountingIntegrityService';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

describe('Gate 6: Master Financial Reporting & Cross-System Reconciliation Suite', () => {
  const ORG_ID = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const OWNER_ID = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;
  const AS_OF_DATE = '2026-05-31';

  const customer1Id = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id;
  const customer2Id = MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A2.id;
  const vendor1Id = MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id;
  const vendor2Id = MASTER_FIXTURE_CONSTANTS.VENDORS.A2.id;
  const projectId = MASTER_FIXTURE_CONSTANTS.PROJECTS.A.id;

  beforeAll(async () => {
    await MasterFinanceFixture.reset();

    // Post Opening Balance Journal Entry using ServerPostingEngine (Equilibrium check: Debit = Credit)
    // Bank (1010): 500,000 | Cash (1000): 100,000 | Capital (3000): 600,000
    const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG_ID])).rows[0].id;
    const cashAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [ORG_ID])).rows[0].id;
    const capAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '3000'`, [ORG_ID])).rows[0].id;

    await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-OPENING-01',
      date: '2026-05-01',
      description: 'Opening Balances',
      lines: [
        { accountId: bankAcc, debit: 500000.00, credit: 0, description: 'Opening Bank' },
        { accountId: cashAcc, debit: 100000.00, credit: 0, description: 'Opening Cash' },
        { accountId: capAcc, debit: 0, credit: 600000.00, description: 'Share Capital' },
      ],
    });
  });

  // =========================================================================
  // 1. MASTER ACCOUNTING MONTH EXECUTION
  // =========================================================================
  describe('1. Complex Accounting Month Execution & Transaction Posting', () => {
    it('creates 20 sales invoices with varying tax slabs, discounts, and jurisdictions', async () => {
      for (let i = 1; i <= 20; i++) {
        const targetCustomer = i <= 12 ? customer1Id : customer2Id;
        const subtotal = 1000.00 * i;
        const taxRate = i % 4 === 0 ? 0.28 : i % 3 === 0 ? 0.18 : i % 2 === 0 ? 0.12 : 0.05;
        const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
        const total = subtotal + taxAmount;

        const inv = await SalesEngine.createAndPostInvoice(
          ORG_ID,
          {
            invoiceNumber: `INV-2026-${String(i).padStart(3, '0')}`,
            customerId: targetCustomer,
            issueDate: '2026-05-10',
            dueDate: '2026-05-30',
            projectId: i <= 5 ? projectId : undefined,
            subtotal,
            taxTotal: taxAmount,
            totalAmount: total,
            createdBy: OWNER_ID,
            lineItems: [
              {
                id: newId('inv-item'),
                description: `Professional Cloud Services Tier ${i}`,
                quantity: 1,
                unitPrice: subtotal,
                taxRate: taxRate * 100,
                taxAmount,
                totalAmount: total,
              },
            ],
          }
        );
        expect(inv).toBeDefined();
        expect(inv.status).toBe('POSTED');
      }

      const invCount = await db.query(`SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1`, [ORG_ID]);
      expect(Number(invCount.rows[0].cnt)).toBe(20);
    });

    it('records customer payments (full, partial, and on-account remittances)', async () => {
      // Fetch some invoices for customer1
      const invs = (
        await db.query(
          `SELECT id, invoice_number, balance_due FROM invoices WHERE organization_id = $1 AND customer_id = $2 ORDER BY invoice_number ASC`,
          [ORG_ID, customer1Id]
        )
      ).rows;

      // 1. Full payment on INV-001 (subtotal 1000 + 5% = 1050)
      const pay1 = await SalesEngine.recordPayment(
        ORG_ID,
        {
          customerId: customer1Id,
          paymentDate: '2026-05-15',
          paymentMode: 'BANK_TRANSFER',
          amount: Number(invs[0].balance_due),
          reference: 'UTR-FULL-001',
          allocations: [{ invoiceId: invs[0].id, amount: Number(invs[0].balance_due) }],
        }
      );
      expect(pay1).toBeDefined();

      // 2. Partial payment on INV-002 (subtotal 2000 + 12% = 2240, paying 1000)
      const pay2 = await SalesEngine.recordPayment(
        ORG_ID,
        {
          customerId: customer1Id,
          paymentDate: '2026-05-16',
          paymentMode: 'BANK_TRANSFER',
          amount: 1000.00,
          reference: 'UTR-PARTIAL-002',
          allocations: [{ invoiceId: invs[1].id, amount: 1000.00 }],
        }
      );
      expect(pay2).toBeDefined();

      // 3. Batch payment across INV-003 and INV-004
      const bal3 = Number(invs[2].balance_due);
      const bal4 = Number(invs[3].balance_due);
      const pay3 = await SalesEngine.recordPayment(
        ORG_ID,
        {
          customerId: customer1Id,
          paymentDate: '2026-05-18',
          paymentMode: 'BANK_TRANSFER',
          amount: bal3 + 500.00,
          reference: 'UTR-BATCH-003',
          allocations: [
            { invoiceId: invs[2].id, amount: bal3 },
            { invoiceId: invs[3].id, amount: 500.00 },
          ],
        }
      );
      expect(pay3).toBeDefined();
    });

    it('issues and applies customer credit note with GST reversal', async () => {
      // Issue credit note of 1180 (1000 + 18% GST) to customer2
      const cn = await SalesEngine.createCreditNote(
        ORG_ID,
        {
          customerId: customer2Id,
          customerName: 'Customer A2 (TG GST Registered)',
          date: '2026-05-20',
          reason: 'Service SLA Discount Credit',
          taxableAmount: 1000.00,
          taxAmount: 180.00,
        }
      );
      expect(cn).toBeDefined();
      expect(cn.totalAmount).toBe(1180.00);

      // Apply credit note against customer2's first open invoice
      const targetInv = (
        await db.query(
          `SELECT id, balance_due FROM invoices WHERE organization_id = $1 AND customer_id = $2 AND balance_due >= 1180 ORDER BY invoice_number ASC LIMIT 1`,
          [ORG_ID, customer2Id]
        )
      ).rows[0];

      if (targetInv) {
        await SalesEngine.applyCreditNoteToInvoice(
          ORG_ID,
          cn.creditNoteId,
          targetInv.id,
          1180.00,
          '2026-05-21'
        );
      }
    });

    it('creates 10 vendor bills and executes vendor advances & disbursements', async () => {
      for (let i = 1; i <= 10; i++) {
        const targetVendor = i <= 6 ? vendor1Id : vendor2Id;
        const subtotal = 2500.00 * i;
        const taxAmount = Math.round(subtotal * 0.18 * 100) / 100;
        const total = subtotal + taxAmount;

        const bill = await PurchasesEngine.createAndPostBill(
          ORG_ID,
          {
            billNumber: `BILL-2026-${String(i).padStart(3, '0')}`,
            vendorId: targetVendor,
            billDate: '2026-05-12',
            dueDate: '2026-06-12',
            subtotal,
            taxTotal: taxAmount,
            totalAmount: total,
            lineItems: [
              {
                id: newId('bill-item'),
                description: `Hardware Components Batch ${i}`,
                quantity: 10,
                unitPrice: subtotal / 10,
                taxRate: 18,
                taxAmount,
                totalAmount: total,
              },
            ],
          }
        );
        expect(bill).toBeDefined();
        expect(bill.status).toBe('POSTED');
      }

      // Record vendor disbursement payment for BILL-001
      const bills = (
        await db.query(
          `SELECT id, bill_number, balance_due FROM bills WHERE organization_id = $1 AND vendor_id = $2 ORDER BY bill_number ASC`,
          [ORG_ID, vendor1Id]
        )
      ).rows;

      await PurchasesEngine.recordVendorPayment(
        ORG_ID,
        {
          vendorId: vendor1Id,
          paymentDate: '2026-05-22',
          paymentMode: 'BANK_TRANSFER',
          amount: Number(bills[0].balance_due),
          reference: 'DISB-VEND-001',
          allocations: [{ billId: bills[0].id, amount: Number(bills[0].balance_due) }],
        }
      );

      // Record vendor advance payment of 10,000 for vendor2
      const adv = await PurchasesEngine.recordVendorAdvance(
        ORG_ID,
        {
          vendorId: vendor2Id,
          paidDate: '2026-05-25',
          paidFromAccountId: 'acc-1010',
          amount: 10000.00,
          reference: 'ADV-VEND-002',
        }
      );
      expect(adv).toBeDefined();

      // Apply 5,000 of advance to vendor2's first bill
      const v2Bills = (
        await db.query(
          `SELECT id, bill_number, balance_due FROM bills WHERE organization_id = $1 AND vendor_id = $2 ORDER BY bill_number ASC`,
          [ORG_ID, vendor2Id]
        )
      ).rows;

      await PurchasesEngine.applyVendorAdvance(
        ORG_ID,
        {
          advanceId: adv.id,
          vendorId: vendor2Id,
          billId: v2Bills[0].id,
          amount: 5000.00,
          appliedDate: '2026-05-26',
        }
      );
    });

    it('posts direct operating expenses and manual adjusting entries', async () => {
      const utilAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '6000'`, [ORG_ID])).rows[0].id;
      const gstInAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1200'`, [ORG_ID])).rows[0].id;
      const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG_ID])).rows[0].id;
      const rentExpAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '6010'`, [ORG_ID])).rows[0].id;

      // 1. Operating Expense: Office Utilities 5,900
      await ServerPostingEngine.postEntry({
        organizationId: ORG_ID,
        entryNumber: 'JE-EXP-001',
        date: '2026-05-26',
        description: 'Office Utilities Payment',
        lines: [
          { accountId: utilAcc, debit: 5900.00, credit: 0, description: 'Utilities Expense' },
          { accountId: bankAcc, debit: 0, credit: 5900.00, description: 'Bank Outflow' },
        ],
      });

      // 2. Office Rent & Facilities Expense: Dr 6010 (15,000), Cr 1010 Bank (15,000)
      await ServerPostingEngine.postEntry({
        organizationId: ORG_ID,
        entryNumber: 'JE-RENT-001',
        date: '2026-05-31',
        description: 'Monthly Office Rent',
        lines: [
          { accountId: rentExpAcc, debit: 15000.00, credit: 0, description: 'Office Rent Expense' },
          { accountId: bankAcc, debit: 0, credit: 15000.00, description: 'Bank Outflow' },
        ],
      });
    });
  });

  // =========================================================================
  // 2. CORE FINANCIAL REPORT INVARIANTS
  // =========================================================================
  describe('2. Core Financial Statements & Global Ledger Equilibrium', () => {
    it('verifies Trial Balance satisfies SUM(Debits) === SUM(Credits) to the exact cent', async () => {
      const tb = await TrialBalanceReportService.getTrialBalance(ORG_ID, { toDate: AS_OF_DATE });

      expect(tb.isBalanced).toBe(true);
      expect(tb.difference).toBe(0);
      expect(tb.totalClosingDebit).toBeGreaterThan(0);
      expect(tb.totalClosingDebit).toBe(tb.totalClosingCredit);

      // Verify each individual row has correct non-negative presentation
      for (const row of tb.rows) {
        expect(row.debit).toBeGreaterThanOrEqual(0);
        expect(row.credit).toBeGreaterThanOrEqual(0);
        if (row.debit > 0) {
          expect(row.credit).toBe(0);
        }
      }
    });

    it('verifies Balance Sheet satisfies Assets === Liabilities + Equity exactly', async () => {
      const bs = await BalanceSheetReportService.getBalanceSheet(ORG_ID, { toDate: AS_OF_DATE });

      expect(bs.isBalanced).toBe(true);
      expect(bs.difference).toBe(0);
      expect(bs.totalAssets).toBe(bs.totalLiabilitiesAndEquity);
      expect(bs.totalEquity).toBe(bs.equity.totalEquityBeforeEarnings + bs.currentYearEarnings);

      // Assets > 0
      expect(bs.totalAssets).toBeGreaterThan(0);
    });

    it('verifies Profit & Loss matches General Ledger revenue and expense accounts', async () => {
      const pnl = await ProfitAndLossReportService.getProfitAndLoss(ORG_ID, { toDate: AS_OF_DATE });
      const tb = await TrialBalanceReportService.getTrialBalance(ORG_ID, { toDate: AS_OF_DATE });

      // Calculate total revenue and expenses directly from Trial Balance
      let tbRevenueCents = 0n;
      let tbExpenseCents = 0n;

      for (const row of tb.rows) {
        const type = (row.accountType || '').toUpperCase();
        if (type === 'INCOME' || type === 'REVENUE' || type === 'OTHER INCOME') {
          tbRevenueCents += databaseMoneyToCents(row.credit, `TB Revenue ${row.accountCode}`) - databaseMoneyToCents(row.debit, `TB Revenue ${row.accountCode}`);
        } else if (type === 'EXPENSE' || type === 'COST OF GOODS SOLD' || type === 'OTHER EXPENSE') {
          tbExpenseCents += databaseMoneyToCents(row.debit, `TB Expense ${row.accountCode}`) - databaseMoneyToCents(row.credit, `TB Expense ${row.accountCode}`);
        }
      }

      const expectedRevenue = centsToSafeNumber(tbRevenueCents, 'TB Revenue');
      const expectedExpense = centsToSafeNumber(tbExpenseCents, 'TB Expense');
      const expectedNetProfit = centsToSafeNumber(tbRevenueCents - tbExpenseCents, 'TB Net Profit');

      expect(pnl.totalRevenue).toBe(expectedRevenue);
      expect(pnl.totalExpenses).toBe(expectedExpense);
      expect(pnl.netProfit).toBe(expectedNetProfit);
    });
  });

  // =========================================================================
  // 3. SUBLEDGER TO GENERAL LEDGER CONTROL RECONCILIATIONS
  // =========================================================================
  describe('3. Subledger Control Reconciliations (AR, AP, Statements & Banking)', () => {
    it('proves Accounts Receivable Aging strictly reconciles with AR Control Account (1100)', async () => {
      const arReport = await ARAgingReportService.getARAgingReport(ORG_ID, AS_OF_DATE);
      const integrity = await AccountingIntegrityService.verifyARIntegrity(ORG_ID);

      expect(arReport.isReconciled).toBe(true);
      expect(arReport.difference).toBe(0);
      expect(arReport.totalSubledgerAmount).toBe(arReport.totalGLControlAmount);
      expect(integrity.isBalanced).toBe(true);
      expect(integrity.difference).toBe('0.00');
    });

    it('proves Accounts Payable Aging strictly reconciles with AP Control Account (2000)', async () => {
      const apReport = await APAgingReportService.getAPAgingReport(ORG_ID, AS_OF_DATE);
      const integrity = await AccountingIntegrityService.verifyAPIntegrity(ORG_ID);

      expect(apReport.isReconciled).toBe(true);
      expect(apReport.difference).toBe(0);
      expect(apReport.totalSubledgerAmount).toBe(apReport.totalGLControlAmount);
      expect(integrity.isBalanced).toBe(true);
      expect(integrity.difference).toBe('0.00');
    });

    it('verifies Customer Statements match underlying documents and active balances', async () => {
      const stmt1 = await CustomerStatementService.getCustomerStatement(ORG_ID, customer1Id, '2026-05-01', AS_OF_DATE);

      // Verify mathematical identity: Opening + Invoices - Payments - Credits === Closing
      const expectedClosing = Math.round((stmt1.openingBalance + stmt1.totalInvoices - stmt1.totalPayments - stmt1.totalCredits) * 100) / 100;
      expect(stmt1.closingBalance).toBe(expectedClosing);

      // Compare with outstanding invoice balances from database
      const openInvs = (
        await db.query(
          `SELECT COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2) AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
          [ORG_ID, customer1Id]
        )
      ).rows[0].total;

      expect(stmt1.closingBalance).toBe(Math.round(Number(openInvs) * 100) / 100);
    });

    it('verifies Vendor Statements match underlying bills, disbursements and advances', async () => {
      const stmt1 = await VendorStatementService.getVendorStatement(ORG_ID, vendor1Id, '2026-05-01', AS_OF_DATE);

      const expectedClosing = Math.round((stmt1.openingBalance + stmt1.totalBills - stmt1.totalPayments - stmt1.totalDebits) * 100) / 100;
      expect(stmt1.closingBalance).toBe(expectedClosing);

      const openBills = (
        await db.query(
          `SELECT COALESCE(SUM(balance_due), 0) as total FROM bills WHERE organization_id = $1 AND vendor_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
          [ORG_ID, vendor1Id]
        )
      ).rows[0].total;

      expect(stmt1.closingBalance).toBe(Math.round(Number(openBills) * 100) / 100);
    });

    it('verifies Cash Flow Statement balances with GL Bank accounts', async () => {
      const cf = await CashFlowStatementService.getCashFlowStatement(ORG_ID, { fromDate: '2026-05-01', toDate: AS_OF_DATE });

      expect(cf.isBalanced).toBe(true);
      expect(cf.difference).toBe(0);
      expect(cf.closingCashBalance).toBe(
        Math.round((cf.openingCashBalance + cf.operatingActivities.total + cf.investingActivities.total + cf.financingActivities.total) * 100) / 100
      );

      // Compare closing cash with GL Bank Account 1010 + Cash Account 1000
      const bankGL = (
        await db.query(
          `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as balance
           FROM journal_lines jl
           JOIN journal_entries je ON jl.journal_entry_id = je.id
           JOIN accounts a ON jl.account_id = a.id
           WHERE je.organization_id = $1 AND a.code IN ('1000', '1010') AND UPPER(je.status) = 'POSTED' AND je.date <= $2`,
          [ORG_ID, AS_OF_DATE]
        )
      ).rows[0].balance;

      expect(cf.closingCashBalance).toBe(Math.round(Number(bankGL) * 100) / 100);
    });
  });

  // =========================================================================
  // 4. ORGANIZATION-WIDE INTEGRITY HEALTH CHECK
  // =========================================================================
  describe('4. Full Organization Integrity Health Audit', () => {
    it('executes full automated integrity check and verifies 100% healthy status', async () => {
      const health = await AccountingIntegrityService.verifyOrganizationIntegrity(ORG_ID);

      expect(health.checks.journal.isBalanced, `Journal check failed: ${JSON.stringify(health.checks.journal)}`).toBe(true);
      expect(health.checks.trialBalance.isBalanced, `Trial Balance check failed: ${JSON.stringify(health.checks.trialBalance)}`).toBe(true);
      expect(health.checks.accountsReceivable.isBalanced, `AR check failed: ${JSON.stringify(health.checks.accountsReceivable)}`).toBe(true);
      expect(health.checks.accountsPayable.isBalanced, `AP check failed: ${JSON.stringify(health.checks.accountsPayable)}`).toBe(true);
      expect(health.checks.banking.isBalanced, `Banking check failed: ${JSON.stringify(health.checks.banking)}`).toBe(true);
      expect(health.checks.gst.isBalanced, `GST check failed: ${JSON.stringify(health.checks.gst)}`).toBe(true);
      expect(health.checks.accountBalanceCache.isBalanced, `Account balance cache failed: ${JSON.stringify(health.checks.accountBalanceCache)}`).toBe(true);
      expect(health.isHealthy).toBe(true);
    });
  });
});
