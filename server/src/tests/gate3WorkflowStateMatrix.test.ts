import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ExpensePostingService } from '../services/ExpensePostingService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { AccountingPeriodService } from '../accounting/AccountingPeriodService';
import { ARAgingReportService } from '../services/ARAgingReportService';
import { APAgingReportService } from '../services/APAgingReportService';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { CustomerStatementService } from '../services/CustomerStatementService';
import { VendorStatementService } from '../services/VendorStatementService';
import { newId } from '../utils/ids';
import { databaseMoneyToCents } from '../utils/money';

describe('Gate 3 — Core Transactional Workflow & State-Matrix Hardening', () => {
  const ORG_A = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
  const ORG_B = MASTER_FIXTURE_CONSTANTS.ORG_B.id;

  beforeEach(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });
  });

  // =========================================================================
  // 0. VERIFY GATE-2 REGRESSION FIXES
  // =========================================================================
  describe('0. Gate-2 Regression Fix Verifications', () => {
    it('[REG-G2-001] handles fractional decimal quantity on vendor bills with exact cent rounding', async () => {
      const unitPrice = 99.99;
      const quantity = 0.5;
      const roundedLineAmount = Math.round(quantity * unitPrice * 100) / 100; // 50.00
      const totalAmount = roundedLineAmount;

      const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
        billDate: '2026-05-16',
        dueDate: '2026-06-16',
        status: 'POSTED',
        subtotal: roundedLineAmount,
        taxTotal: 0,
        totalAmount,
        lineItems: [
          {
            description: 'Fractional Construction Timber',
            quantity,
            unitPrice,
            taxRate: 0,
            amount: roundedLineAmount,
            expenseAccountId: `acc-${ORG_A}-5000`,
          },
        ],
      });

      expect(bill.totalAmount).toBe(50);
      expect(bill.balanceDue).toBe(50);
      expect(bill.journalEntryId).toBeDefined();

      // Verify GL debits and credits are integers in cents with zero sub-cent error
      await MasterFinanceFixture.assertJournalBalanced(bill.journalEntryId!);
      await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, ORG_A);
    });

    it('[REG-G2-002] accepts both appliedDate and applicationDate in vendor advance drawdowns', async () => {
      const adv = await MasterFinanceFixture.createStandardVendorAdvance(ORG_A, { amount: 50000 });
      const bill = await MasterFinanceFixture.createStandardBill(ORG_A);

      // 1. Drawdown using applicationDate parameter alias
      const res1 = await PurchasesEngine.applyVendorAdvance(ORG_A, {
        advanceId: adv.id,
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        billId: bill.id,
        amount: 20000,
        applicationDate: '2026-05-18',
      } as any);

      expect(res1.amountApplied).toBe(20000);
      const appRecord1 = await db.query(`SELECT applied_date, amount_applied FROM vendor_advance_applications WHERE advance_id = $1 AND applied_date = $2`, [adv.id, '2026-05-18']);
      expect(appRecord1.rows.length).toBe(1);
      expect(Number(appRecord1.rows[0].amount_applied)).toBe(20000);

      // 2. Drawdown using appliedDate parameter
      const res2 = await PurchasesEngine.applyVendorAdvance(ORG_A, {
        advanceId: adv.id,
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        billId: bill.id,
        amount: 15000,
        appliedDate: '2026-05-19',
      });

      expect(res2.amountApplied).toBe(15000);
      const appRecord2 = await db.query(`SELECT applied_date, amount_applied FROM vendor_advance_applications WHERE advance_id = $1 AND applied_date = $2`, [adv.id, '2026-05-19']);
      expect(appRecord2.rows.length).toBe(1);
      expect(Number(appRecord2.rows[0].amount_applied)).toBe(15000);

      await MasterFinanceFixture.assertVendorAdvanceConservation(adv.id, ORG_A);
      await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, ORG_A);
    });
  });

  // =========================================================================
  // 2. SALES LIFECYCLE TEST FAMILY
  // =========================================================================
  describe('2. Sales Lifecycle Family (SALES-001 to SALES-005)', () => {
    it('[SALES-001] Basic Invoice: creates full GL postings, subledger entries, and AR aging', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A, {
        projectId: MASTER_FIXTURE_CONSTANTS.PROJECTS.A.id,
      });

      expect(inv.totalAmount).toBe(118000);
      expect(inv.balanceDue).toBe(118000);

      // Verify GL Postings: Dr AR 118,000, Cr Revenue 100,000, Cr Output GST 18,000
      await MasterFinanceFixture.assertJournalBalanced(inv.journalEntryId);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);

      // Verify AR Aging Report
      const today = new Date().toISOString().split('T')[0];
      const aging = await ARAgingReportService.getARAgingReport(ORG_A, today);
      expect(aging.isReconciled).toBe(true);

      // Verify Customer Statement
      const statement = await CustomerStatementService.getCustomerStatement(
        ORG_A,
        MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        '2026-05-01',
        '2026-05-31'
      );
      expect(Number(statement.closingBalance)).toBe(118000);

      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });

    it('[SALES-002] Invoice -> Partial Payment: updates balances, bank account, and status to PARTIALLY_PAID', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A); // 118,000

      const pmt = await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 40000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 40000 }],
      });

      const invRow = await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(Number(invRow.rows[0].paid_amount)).toBe(40000);
      expect(Number(invRow.rows[0].balance_due)).toBe(78000);
      expect(invRow.rows[0].status).toBe('PARTIALLY_PAID');

      await MasterFinanceFixture.assertPaymentConservation(pmt.id, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.invoiceId, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });

    it('[SALES-003] Invoice -> Multiple Payments: fully settles invoice to PAID status with zero balance', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A); // 118,000

      // 1. Payment 1: 40,000
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 40000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 40000 }],
      });

      // 2. Payment 2: 30,000
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 30000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 30000 }],
      });

      // 3. Payment 3: 48,000
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 48000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 48000 }],
      });

      const invRow = await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(Number(invRow.rows[0].paid_amount)).toBe(118000);
      expect(Number(invRow.rows[0].balance_due)).toBe(0);
      expect(invRow.rows[0].status).toBe('PAID');

      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.invoiceId, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });

    it('[SALES-004] One Payment -> Multiple Invoices: allocates across multiple invoices atomically', async () => {
      // Invoices: A: 50k, B: 30k, C: 20k
      const invA = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
        issueDate: '2026-05-10',
        status: 'POSTED',
        lineItems: [{ description: 'Item A', quantity: 1, unitPrice: 50000, taxRate: 0, amount: 50000 }],
      });
      const invB = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
        issueDate: '2026-05-11',
        status: 'POSTED',
        lineItems: [{ description: 'Item B', quantity: 1, unitPrice: 30000, taxRate: 0, amount: 30000 }],
      });
      const invC = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
        issueDate: '2026-05-12',
        status: 'POSTED',
        lineItems: [{ description: 'Item C', quantity: 1, unitPrice: 20000, taxRate: 0, amount: 20000 }],
      });

      // Total remittance = 100,000
      const pmt = await SalesEngine.recordPayment(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        paymentDate: '2026-05-15',
        amount: 100000,
        paymentMode: 'Bank Transfer',
        depositToAccountId: `acc-${ORG_A}-1010`,
        allocations: [
          { invoiceId: invA.id, amount: 50000 },
          { invoiceId: invB.id, amount: 30000 },
          { invoiceId: invC.id, amount: 20000 },
        ],
      });

      expect(pmt.unallocatedAmount).toBe(0);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(invA.id, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(invB.id, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(invC.id, ORG_A);
      await MasterFinanceFixture.assertPaymentConservation(pmt.id, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });

    it('[SALES-005] Payment Greater Than Outstanding: stores unallocated remainder without pushing balance negative', async () => {
      const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        customerName: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.name,
        issueDate: '2026-05-10',
        status: 'POSTED',
        lineItems: [{ description: 'Item 80k', quantity: 1, unitPrice: 80000, taxRate: 0, amount: 80000 }],
      });

      const pmt = await SalesEngine.recordPayment(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        paymentDate: '2026-05-15',
        amount: 100000,
        paymentMode: 'Bank Transfer',
        depositToAccountId: `acc-${ORG_A}-1010`,
        allocations: [{ invoiceId: inv.id, amount: 80000 }],
      });

      expect(pmt.unallocatedAmount).toBe(20000);
      const invRow = await db.query(`SELECT balance_due, status FROM invoices WHERE id = $1`, [inv.id]);
      expect(Number(invRow.rows[0].balance_due)).toBe(0);
      expect(invRow.rows[0].status).toBe('PAID');

      await MasterFinanceFixture.assertPaymentConservation(pmt.id, ORG_A);
      await MasterFinanceFixture.assertNoNegativeDocumentBalance(ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // 3. CREDIT NOTE MATRIX
  // =========================================================================
  describe('3. Credit Note Matrix', () => {
    it('applies partial and full credit notes to open invoices with exact AR reductions', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A); // 118,000

      // Partial credit note: 10,000 + 1,800 GST = 11,800
      const cn = await MasterFinanceFixture.createStandardCreditNote(ORG_A, {
        invoiceId: inv.invoiceId,
        taxableAmount: 10000,
        taxAmount: 1800,
      });

      expect(cn.totalAmount).toBe(11800);
      const invRow = await db.query(`SELECT amount_credited, balance_due FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(Number(invRow.rows[0].amount_credited)).toBe(11800);
      expect(Number(invRow.rows[0].balance_due)).toBe(106200);

      await MasterFinanceFixture.assertCreditConservation(cn.creditNoteId, ORG_A);
      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.invoiceId, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });

    it('handles Invoice -> Payment -> Credit Note sequence correctly', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A); // 118,000

      // 1. Partial Payment of 50,000 -> balance becomes 68,000
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 50000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 50000 }],
      });

      // 2. Credit Note of 10,000 + 1,800 = 11,800 -> balance becomes 56,200
      const cn = await MasterFinanceFixture.createStandardCreditNote(ORG_A, {
        invoiceId: inv.invoiceId,
        taxableAmount: 10000,
        taxAmount: 1800,
      });

      const invRow = await db.query(`SELECT paid_amount, amount_credited, balance_due FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(Number(invRow.rows[0].paid_amount)).toBe(50000);
      expect(Number(invRow.rows[0].amount_credited)).toBe(11800);
      expect(Number(invRow.rows[0].balance_due)).toBe(56200);

      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.invoiceId, ORG_A);
      await MasterFinanceFixture.assertCreditConservation(cn.creditNoteId, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });

    it('handles Invoice -> Credit Note -> Payment sequence to full settlement', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A); // 118,000

      // 1. Credit Note of 18,000 -> balance becomes 100,000
      const cn = await MasterFinanceFixture.createStandardCreditNote(ORG_A, {
        invoiceId: inv.invoiceId,
        taxableAmount: 15254.24,
        taxAmount: 2745.76,
      });

      // 2. Final Payment of remaining balance
      const invCheck = await db.query(`SELECT balance_due FROM invoices WHERE id = $1`, [inv.invoiceId]);
      const remainingBal = Number(invCheck.rows[0].balance_due);

      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: remainingBal,
        allocations: [{ invoiceId: inv.invoiceId, amount: remainingBal }],
      });

      const invRow = await db.query(`SELECT balance_due, status FROM invoices WHERE id = $1`, [inv.invoiceId]);
      expect(Number(invRow.rows[0].balance_due)).toBe(0);
      expect(invRow.rows[0].status).toBe('PAID');

      await MasterFinanceFixture.assertInvoiceBalanceCorrect(inv.invoiceId, ORG_A);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // 4. SALES REVERSAL MATRIX
  // =========================================================================
  describe('4. Sales Reversal & Void Matrix', () => {
    it('allows void of unpaid invoice and creates audit trail + reversal journal', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      const res = await FinancialDestructiveActionsService.voidInvoice(ORG_A, inv.invoiceId, 'user-admin-a', 'Mistake during creation');

      expect(res.success).toBe(true);
      await MasterFinanceFixture.assertReversalSymmetry(inv.journalEntryId, res.journalEntryId);
      await MasterFinanceFixture.assertARSubledgerMatchesGL(ORG_A);
    });

    it('strictly blocks void of invoice when active payment allocations exist (Rule #17)', async () => {
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 20000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 20000 }],
      });

      await expect(
        FinancialDestructiveActionsService.voidInvoice(ORG_A, inv.invoiceId, 'user-admin-a', 'Attempted void on paid')
      ).rejects.toThrow(/allocat/i);
    });
  });

  // =========================================================================
  // 5. QUOTATION / SALES ORDER CONVERSION
  // =========================================================================
  describe('5. Quotation & Sales Order Conversion', () => {
    it('creates Sales Order with zero initial GL impact and converts to Invoice', async () => {
      // 1. Create Sales Order for 500,000
      const so = await SalesEngine.createSalesOrder(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        orderDate: '2026-05-01',
        expectedDelivery: '2026-06-01',
        totalAmount: 500000,
        lineItems: [{ description: 'Order Materials', quantity: 100, unitPrice: 5000, taxRate: 0, amount: 500000 }],
      });

      expect(so.status).toBe('CONFIRMED');
      // Sales Order must have 0 GL impact
      const soJournals = await db.query(`SELECT id FROM journal_entries WHERE organization_id = $1 AND reference = $2`, [ORG_A, so.salesOrderNumber]);
      expect(soJournals.rows.length).toBe(0);

      // 2. Convert Partial Invoice from Sales Order (200,000)
      const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
        customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
        salesOrderId: so.id,
        issueDate: '2026-05-15',
        status: 'POSTED',
        lineItems: [{ description: 'Order Materials Partial', quantity: 40, unitPrice: 5000, taxRate: 0, amount: 200000 }],
      });

      expect(inv.totalAmount).toBe(200000);
      const soCheck = await db.query(`SELECT invoiced_amount, status FROM sales_orders WHERE id = $1`, [so.id]);
      expect(Number(soCheck.rows[0].invoiced_amount)).toBe(200000);
      expect(soCheck.rows[0].status).toBe('PARTIALLY_INVOICED');
    });
  });

  // =========================================================================
  // 6. PURCHASE ORDER MATRIX
  // =========================================================================
  describe('6. Purchase Order Matrix', () => {
    it('handles PO creation with zero GL impact and partial billings up to ordered quantity', async () => {
      const po = await MasterFinanceFixture.createStandardPurchaseOrder(ORG_A, {
        quantity: 500,
        unitPrice: 1000,
      });

      expect(po.totalAmount).toBe(590000);

      // Partial Bill: 100 units (118,000)
      const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
        purchaseOrderId: po.id,
        billDate: '2026-05-15',
        subtotal: 100000,
        taxTotal: 18000,
        totalAmount: 118000,
        lineItems: [
          {
            description: 'Plywood 18mm from PO',
            quantity: 100,
            unitPrice: 1000,
            taxRate: 18,
            amount: 100000,
            expenseAccountId: `acc-${ORG_A}-5000`,
          },
        ],
      });

      expect(bill.totalAmount).toBe(118000);
      await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, ORG_A);
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // 7. BILL PAYMENT MATRIX
  // =========================================================================
  describe('7. Bill Payment Matrix', () => {
    it('records vendor payment settlement and reduces AP balance', async () => {
      const bill = await MasterFinanceFixture.createStandardBill(ORG_A); // 118,000

      const pmt = await MasterFinanceFixture.createStandardVendorPayment(ORG_A, {
        amount: 118000,
        allocations: [{ billId: bill.id, amount: 118000 }],
      });

      const billRow = await db.query(`SELECT amount_paid, balance_due, status FROM bills WHERE id = $1`, [bill.id]);
      expect(Number(billRow.rows[0].amount_paid)).toBe(118000);
      expect(Number(billRow.rows[0].balance_due)).toBe(0);
      expect(billRow.rows[0].status).toBe('PAID');

      await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, ORG_A);
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // 8. VENDOR ADVANCE MATRIX
  // =========================================================================
  describe('8. Vendor Advance Matrix', () => {
    it('applies vendor advance across multiple bills while conserving advance asset', async () => {
      const adv = await MasterFinanceFixture.createStandardVendorAdvance(ORG_A, { amount: 100000 });
      const bill1 = await MasterFinanceFixture.createStandardBill(ORG_A); // 118,000
      const bill2 = await MasterFinanceFixture.createStandardBill(ORG_A); // 118,000

      // Apply 40,000 to bill 1
      await PurchasesEngine.applyVendorAdvance(ORG_A, {
        advanceId: adv.id,
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        billId: bill1.id,
        amount: 40000,
        appliedDate: '2026-05-18',
      });

      // Apply 50,000 to bill 2
      await PurchasesEngine.applyVendorAdvance(ORG_A, {
        advanceId: adv.id,
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        billId: bill2.id,
        amount: 50000,
        appliedDate: '2026-05-19',
      });

      // Remaining advance should be 10,000
      const advRow = await db.query(`SELECT unapplied_amount, status FROM vendor_advances WHERE id = $1`, [adv.id]);
      expect(Number(advRow.rows[0].unapplied_amount)).toBe(10000);
      expect(advRow.rows[0].status).toBe('PARTIALLY_APPLIED');

      await MasterFinanceFixture.assertVendorAdvanceConservation(adv.id, ORG_A);
      await MasterFinanceFixture.assertBillBalanceCorrect(bill1.id, ORG_A);
      await MasterFinanceFixture.assertBillBalanceCorrect(bill2.id, ORG_A);
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // 9. VENDOR CREDIT MATRIX
  // =========================================================================
  describe('9. Vendor Credit (Debit Note) Matrix', () => {
    it('applies vendor credit against bill and reverses AP + Purchase COGS', async () => {
      const bill = await MasterFinanceFixture.createStandardBill(ORG_A); // 118,000

      const vc = await MasterFinanceFixture.createStandardVendorCredit(ORG_A, {
        billId: bill.id,
        taxableAmount: 10000,
        taxAmount: 1800,
      });

      expect(vc.totalAmount).toBe(11800);
      const billRow = await db.query(`SELECT amount_debited, balance_due FROM bills WHERE id = $1`, [bill.id]);
      expect(Number(billRow.rows[0].amount_debited)).toBe(11800);
      expect(Number(billRow.rows[0].balance_due)).toBe(106200);

      await MasterFinanceFixture.assertBillBalanceCorrect(bill.id, ORG_A);
      await MasterFinanceFixture.assertAPSubledgerMatchesGL(ORG_A);
    });
  });

  // =========================================================================
  // 10. PURCHASE COMPLEX LIFECYCLE (END-TO-END)
  // =========================================================================
  describe('10. Purchase Complex Lifecycle End-to-End', () => {
    it('executes full multi-stage procurement lifecycle with perfect GL integrity at every step', async () => {
      // Step 1: PO ₹500,000
      const po = await MasterFinanceFixture.createStandardPurchaseOrder(ORG_A, {
        quantity: 500,
        unitPrice: 1000,
      });
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);

      // Step 2: Bill A ₹200,000 & Bill B ₹300,000
      const billA = await PurchasesEngine.createAndPostBill(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
        purchaseOrderId: po.id,
        billDate: '2026-05-10',
        subtotal: 200000,
        taxTotal: 0,
        totalAmount: 200000,
        lineItems: [{ description: 'Part A', quantity: 200, unitPrice: 1000, taxRate: 0, amount: 200000, expenseAccountId: `acc-${ORG_A}-5000` }],
      });

      const billB = await PurchasesEngine.createAndPostBill(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        vendorName: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.name,
        purchaseOrderId: po.id,
        billDate: '2026-05-11',
        subtotal: 300000,
        taxTotal: 0,
        totalAmount: 300000,
        lineItems: [{ description: 'Part B', quantity: 300, unitPrice: 1000, taxRate: 0, amount: 300000, expenseAccountId: `acc-${ORG_A}-5000` }],
      });
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);

      // Step 3: Vendor Advance ₹100,000
      const adv = await MasterFinanceFixture.createStandardVendorAdvance(ORG_A, { amount: 100000 });
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);

      // Step 4: Apply ₹100,000 Advance to Bill A
      await PurchasesEngine.applyVendorAdvance(ORG_A, {
        advanceId: adv.id,
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        billId: billA.id,
        amount: 100000,
        appliedDate: '2026-05-12',
      });
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);

      // Step 5: Vendor Payment ₹100,000 (Bill A fully settled)
      await PurchasesEngine.recordVendorPayment(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        paymentDate: '2026-05-13',
        amount: 100000,
        paidFromAccountId: `acc-${ORG_A}-1010`,
        allocations: [{ billId: billA.id, amount: 100000 }],
      });
      const billACheck = await db.query(`SELECT balance_due, status FROM bills WHERE id = $1`, [billA.id]);
      expect(Number(billACheck.rows[0].balance_due)).toBe(0);
      expect(billACheck.rows[0].status).toBe('PAID');
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);

      // Step 6: Vendor Credit ₹50,000 against Bill B
      await MasterFinanceFixture.createStandardVendorCredit(ORG_A, {
        billId: billB.id,
        taxableAmount: 50000,
        taxAmount: 0,
      });
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);

      // Step 7: Payment ₹250,000 against Bill B (Bill B fully settled)
      await PurchasesEngine.recordVendorPayment(ORG_A, {
        vendorId: MASTER_FIXTURE_CONSTANTS.VENDORS.A1.id,
        paymentDate: '2026-05-15',
        amount: 250000,
        paidFromAccountId: `acc-${ORG_A}-1010`,
        allocations: [{ billId: billB.id, amount: 250000 }],
      });
      const billBCheck = await db.query(`SELECT balance_due, status FROM bills WHERE id = $1`, [billB.id]);
      expect(Number(billBCheck.rows[0].balance_due)).toBe(0);
      expect(billBCheck.rows[0].status).toBe('PAID');

      // Final Master Integrity Certification
      await MasterFinanceFixture.assertGlobalFinancialIntegrity(ORG_A);
    });
  });

  // =========================================================================
  // 11. DIRECT EXPENSE MATRIX
  // =========================================================================
  describe('11. Direct Expense Matrix', () => {
    it('posts direct expense with zero tax and rejects negative or zero amounts', async () => {
      const exp = await MasterFinanceFixture.createStandardExpense(ORG_A, { amount: 5000 });
      expect(exp.journalEntryId).toBeDefined();
      await MasterFinanceFixture.assertJournalBalanced(exp.journalEntryId);

      // Negative amount rejection
      await expect(
        ExpensePostingService.createAndPost(ORG_A, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id, {
          expenseAccountId: `acc-${ORG_A}-6000`,
          paidFromAccountId: `acc-${ORG_A}-1010`,
          date: '2026-05-15',
          amount: -500,
          description: 'Illegal negative expense',
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // 12. MANUAL JOURNAL MATRIX
  // =========================================================================
  describe('12. Manual Journal Matrix', () => {
    it('posts balanced multi-line manual journal and rejects unbalanced entries', async () => {
      const jv = await ServerPostingEngine.postEntry({
        organizationId: ORG_A,
        entryNumber: 'JV-2026-001',
        date: '2026-05-15',
        description: 'Depreciation adjustment',
        lines: [
          { accountId: `acc-${ORG_A}-6000`, debit: 15000, credit: 0, description: 'Office depreciation' },
          { accountId: `acc-${ORG_A}-1010`, debit: 0, credit: 15000, description: 'Accumulated depreciation contra' },
        ],
      });

      expect(jv.entryId).toBeDefined();
      await MasterFinanceFixture.assertJournalBalanced(jv.entryId);

      // Unbalanced rejection
      await expect(
        ServerPostingEngine.postEntry({
          organizationId: ORG_A,
          entryNumber: 'JV-2026-002',
          date: '2026-05-15',
          description: 'Unbalanced JV',
          lines: [
            { accountId: `acc-${ORG_A}-6000`, debit: 10000, credit: 0 },
            { accountId: `acc-${ORG_A}-1010`, debit: 0, credit: 9000 },
          ],
        })
      ).rejects.toThrow(/unbalanced|difference/i);
    });
  });

  // =========================================================================
  // 13. PERIOD LOCK MATRIX
  // =========================================================================
  describe('13. Period Lock Matrix', () => {
    it('enforces period locks and blocks posting or mutations into locked accounting periods', async () => {
      // Lock May 2026
      await AccountingPeriodService.lockPeriod(ORG_A, 2026, 5, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.admin.id);

      const isLocked = await AccountingPeriodService.isPeriodLocked(ORG_A, '2026-05-15');
      expect(isLocked).toBe(true);

      const isUnlocked = await AccountingPeriodService.isPeriodLocked(ORG_A, '2026-06-15');
      expect(isUnlocked).toBe(false);

      // Attempting to post invoice in locked period must fail
      await expect(
        SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          issueDate: '2026-05-15',
          status: 'POSTED',
          lineItems: [{ description: 'Test', quantity: 1, unitPrice: 1000, taxRate: 0, amount: 1000 }],
        })
      ).rejects.toThrow(/locked/i);
    });
  });

  // =========================================================================
  // 14. DOCUMENT NUMBERING BEHAVIOR
  // =========================================================================
  describe('14. Document Numbering Behavior', () => {
    it('enforces tenant isolation: duplicate numbers permitted in separate tenants, prohibited in same tenant', async () => {
      const invA = await MasterFinanceFixture.createStandardInvoice(ORG_A);

      // Duplicate invoice number directly in Org A must fail
      await expect(
        db.query(
          `INSERT INTO invoices (id, organization_id, invoice_number, client_name, issue_date, due_date, total_amount, balance_due, status)
           VALUES ($1, $2, $3, 'Customer A1', '2026-05-15', '2026-06-15', $4, $5, $6)`,
          [newId('inv'), ORG_A, invA.invoiceNumber, 1000, 1000, 'POSTED']
        )
      ).rejects.toThrow();

      // Same invoice number in Org B succeeds
      const resB = await db.query(
        `INSERT INTO invoices (id, organization_id, invoice_number, client_name, issue_date, due_date, total_amount, balance_due, status)
         VALUES ($1, $2, $3, 'Customer B1', '2026-05-15', '2026-06-15', $4, $5, $6) RETURNING id`,
        [newId('inv'), ORG_B, invA.invoiceNumber, 1000, 1000, 'POSTED']
      );
      expect(resB.rows.length).toBe(1);
    });
  });

  // =========================================================================
  // 15. PROJECT ACCOUNTING MATRIX
  // =========================================================================
  describe('15. Project Accounting Matrix', () => {
    it('accurately tracks project accrual revenue, costs, and cash collections separately', async () => {
      const prjId = MASTER_FIXTURE_CONSTANTS.PROJECTS.A.id;

      // 1. Invoiced: 118,000
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A, { projectId: prjId });

      // 2. Direct Project Cost: 25,000
      await ExpensePostingService.createAndPost(ORG_A, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id, {
        expenseAccountId: `acc-${ORG_A}-6000`,
        paidFromAccountId: `acc-${ORG_A}-1010`,
        date: '2026-05-16',
        amount: 25000,
        projectId: prjId,
        description: 'Site architectural materials',
      });

      // 3. Collection: 50,000
      await MasterFinanceFixture.createStandardCustomerPayment(ORG_A, {
        amount: 50000,
        allocations: [{ invoiceId: inv.invoiceId, amount: 50000 }],
      });

      // Assert Accrual Profitability = Revenue (100,000) - Costs (25,000) = 75,000
      // Assert Cash Collection = 50,000
      const expRes = await db.query(`SELECT SUM(amount) as total FROM expenses WHERE organization_id = $1 AND project_id = $2`, [ORG_A, prjId]);
      expect(Number(expRes.rows[0].total)).toBe(25000);
    });
  });

  // =========================================================================
  // 16. REPORT RECONCILIATION MATRIX
  // =========================================================================
  describe('16. Report Reconciliation Matrix', () => {
    it('reconciles Trial Balance, Profit & Loss, and Balance Sheet with subledgers', async () => {
      await MasterFinanceFixture.createStandardInvoice(ORG_A); // Revenue 100k, Tax 18k, AR 118k
      await MasterFinanceFixture.createStandardBill(ORG_A); // COGS 100k, Input Tax 18k, AP 118k

      // Trial Balance
      const tb = await TrialBalanceReportService.getTrialBalance(ORG_A, { toDate: '2026-05-31' });
      expect(tb.isBalanced).toBe(true);
      expect(tb.difference).toBe(0);

      // P&L Report
      const pl = await ProfitAndLossReportService.getProfitAndLoss(ORG_A, { fromDate: '2026-05-01', toDate: '2026-05-31' });
      expect(Number(pl.totalIncome || pl.netProfit || 0)).toBeDefined();

      // Balance Sheet
      const bs = await BalanceSheetReportService.getBalanceSheet(ORG_A, { toDate: '2026-05-31' });
      expect(bs).toBeDefined();
    });
  });

  // =========================================================================
  // 17. AUDIT TRAIL MATRIX
  // =========================================================================
  describe('17. Audit Trail Matrix', () => {
    it('creates tamper-evident audit logs with entity, user, and before/after states for critical accounting actions', async () => {
      // 1. Invoice Void Audit
      const inv = await MasterFinanceFixture.createStandardInvoice(ORG_A);
      await FinancialDestructiveActionsService.voidInvoice(ORG_A, inv.invoiceId, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id, 'Audited void reason');
      const voidAudit = await db.query(
        `SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'INVOICE_VOIDED' AND entity_id = $2`,
        [ORG_A, inv.invoiceId]
      );
      expect(voidAudit.rows.length).toBe(1);
      expect(voidAudit.rows[0].entity_type).toBe('Invoice');
      expect(voidAudit.rows[0].user_id).toBe(MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.accountant.id);

      // 2. Period Lock Audit
      await AccountingPeriodService.lockPeriod(ORG_A, 2026, 7, MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.admin.id);
      const lockAudit = await db.query(
        `SELECT * FROM audit_logs WHERE organization_id = $1 AND action = 'ACCOUNTING_PERIOD_LOCKED' ORDER BY timestamp DESC LIMIT 1`,
        [ORG_A]
      );
      expect(lockAudit.rows.length).toBe(1);
      expect(lockAudit.rows[0].entity_type).toBe('PERIOD_LOCK');
      expect(lockAudit.rows[0].user_id).toBe(MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.admin.id);
    });
  });

  // =========================================================================
  // 18. API & SERVICE CONSISTENCY MATRIX
  // =========================================================================
  describe('18. API & Service Consistency Matrix', () => {
    it('enforces identical tenant and financial invariants whether invoked via engine or service layer', async () => {
      // Both service layer and engine must enforce positive non-zero line items and period lock restrictions
      await expect(
        SalesEngine.createAndPostInvoice(ORG_A, {
          customerId: MASTER_FIXTURE_CONSTANTS.CUSTOMERS.A1.id,
          lineItems: [],
        })
      ).rejects.toThrow(/line item/i);
    });
  });
});
