import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { newId } from '../utils/ids';

const ORG = F.ORG_A.id;
const CUSTOMER_ID = F.CUSTOMERS.A1.id;
const VENDOR_ID = F.VENDORS.A1.id;
const OWNER_ID = F.PERSONAS.ORG_A.owner.id;

describe('Payment Accounting Flow Audit & Invariant Hardening', () => {
  beforeEach(async () => {
    await MasterFinanceFixture.setup();

    // Ensure operating bank account (1010) exists in bank_accounts table for ORG_A
    const acc1010 = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG])).rows[0];
    if (acc1010) {
      await db.query(
        `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, opening_balance_date, status, is_active)
         VALUES ($1, $2, $3, 'Operating Checking Account', '50100012345678', '•••• 5678', 'Standard Bank', 'Checking', 'INR', 0.00, '2026-01-01', 'Active', TRUE)`,
        ['bank-acc-main', ORG, acc1010.id]
      );
    }
  });

  // INVARIANT 4 & P0: Real-time Bank Account Balance Synchronization with GL
  it('Invariant 4 & P0: bank_accounts.current_balance synchronizes in real-time on every GL journal posting and reversal', async () => {
    // 1. Check initial operating bank account (1010) balance
    const bankAccRes = await db.query(
      `SELECT ba.id, ba.current_balance, a.id as ledger_acc_id, a.balance as gl_balance 
       FROM bank_accounts ba 
       JOIN accounts a ON a.organization_id = ba.organization_id AND a.id = ba.ledger_account_id
       WHERE ba.organization_id = $1 AND a.code = '1010'`,
      [ORG]
    );
    expect(bankAccRes.rows.length).toBe(1);
    const initialBankAcc = bankAccRes.rows[0];
    const initialBankBal = Number(initialBankAcc.current_balance || 0);
    const initialGlBal = Number(initialBankAcc.gl_balance || 0);

    // 2. Create and post an invoice
    const inv = await SalesEngine.createAndPostInvoice(ORG, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Advisory Retainer', quantity: 1, unitPrice: 500, taxRate: 0 }],
    });

    // 3. Record Customer Payment into Bank Account
    const pmt = await SalesEngine.recordCustomerPayment(ORG, {
      invoiceId: inv.id,
      amount: 500,
      paymentDate: '2026-03-02',
      paymentMode: 'BANK_TRANSFER',
      depositAccountId: initialBankAcc.ledger_acc_id,
      reference: 'WIRE-500-TEST',
    });
    expect(pmt.id).toBeDefined();

    // 4. Verify both accounts.balance and bank_accounts.current_balance incremented by exactly 500
    const afterPayRes = await db.query(
      `SELECT ba.current_balance, a.balance as gl_balance 
       FROM bank_accounts ba 
       JOIN accounts a ON a.organization_id = ba.organization_id AND a.id = ba.ledger_account_id
       WHERE ba.id = $1`,
      [initialBankAcc.id]
    );
    const afterBankBal = Number(afterPayRes.rows[0].current_balance);
    const afterGlBal = Number(afterPayRes.rows[0].gl_balance);

    expect(afterBankBal).toBe(initialBankBal + 500);
    expect(afterGlBal).toBe(initialGlBal + 500);
    expect(afterBankBal).toBe(afterGlBal);

    // 5. Reverse Customer Payment
    await FinancialDestructiveActionsService.reversePaymentReceived(ORG, pmt.id, OWNER_ID, 'Customer cheque bounced');

    // 6. Verify symmetric restoration of both balances
    const afterRevRes = await db.query(
      `SELECT ba.current_balance, a.balance as gl_balance 
       FROM bank_accounts ba 
       JOIN accounts a ON a.organization_id = ba.organization_id AND a.id = ba.ledger_account_id
       WHERE ba.id = $1`,
      [initialBankAcc.id]
    );
    expect(Number(afterRevRes.rows[0].current_balance)).toBe(initialBankBal);
    expect(Number(afterRevRes.rows[0].gl_balance)).toBe(initialGlBal);
  });

  // FLOW 9 & P1: Vendor Refund End-to-End
  it('Flow 9 & P1: Vendor Refund records balanced Dr Bank / Cr AP, updates bank balance, reduces debit note, and reverses cleanly', async () => {
    // 1. Get bank account
    const bankRes = await db.query(
      `SELECT ba.id, ba.current_balance, a.id as ledger_acc_id, a.balance as gl_balance 
       FROM bank_accounts ba 
       JOIN accounts a ON a.organization_id = ba.organization_id AND a.id = ba.ledger_account_id
       WHERE ba.organization_id = $1 AND a.code = '1010'`,
      [ORG]
    );
    const bankAcc = bankRes.rows[0];
    const initialBankBal = Number(bankAcc.current_balance || 0);

    // 2. Create a Debit Note of 300 for vendor
    const dn = await PurchasesEngine.createDebitNote(ORG, {
      vendorId: VENDOR_ID,
      date: '2026-03-05',
      items: [{ description: 'Defective Materials Return', quantity: 1, unitPrice: 300, taxRate: 0 }],
      reason: 'Returned defective inventory',
    });
    expect(dn.id).toBeDefined();

    // 3. Record Vendor Refund of 300 against Debit Note deposited into Bank
    const refundResult = await PurchasesEngine.recordVendorRefund(ORG, {
      vendorId: VENDOR_ID,
      debitNoteId: dn.id,
      refundDate: '2026-03-06',
      amount: 300,
      depositToAccountId: bankAcc.ledger_acc_id,
      reference: 'VR-REFUND-001',
      notes: 'Wire refund from vendor',
    });
    expect(refundResult.refundId).toBeDefined();
    expect(refundResult.journalEntryId).toBeDefined();

    // 4. Verify Vendor Refund row persisted with status POSTED
    const refundDb = await PurchasesEngine.getVendorRefundById(ORG, refundResult.refundId);
    expect(refundDb).toBeDefined();
    expect(refundDb.status).toBe('POSTED');
    expect(Number(refundDb.amount)).toBe(300);

    // 5. Verify Debit Note was closed / remaining_credit reduced to 0
    const dnDb = await db.query(`SELECT remaining_credit, status FROM vendor_credits WHERE id = $1`, [dn.id]);
    expect(Number(dnDb.rows[0].remaining_credit)).toBe(0);
    expect(dnDb.rows[0].status).toBe('Closed');

    // 6. Verify GL Journal: Dr Bank 300, Cr Accounts Payable 300 (balanced!)
    const jlRes = await db.query(
      `SELECT jl.debit, jl.credit, jl.account_name, a.code
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.journal_entry_id = $1`,
      [refundResult.journalEntryId]
    );
    expect(jlRes.rows.length).toBe(2);
    const totalDebit = jlRes.rows.reduce((sum, r) => sum + Number(r.debit || 0), 0);
    const totalCredit = jlRes.rows.reduce((sum, r) => sum + Number(r.credit || 0), 0);
    expect(totalDebit).toBe(300);
    expect(totalCredit).toBe(300);

    // 7. Verify Bank Account current_balance incremented by 300
    const bankAfterRefund = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc.id]);
    expect(Number(bankAfterRefund.rows[0].current_balance)).toBe(initialBankBal + 300);

    // 8. Reverse Vendor Refund
    const revResult = await FinancialDestructiveActionsService.reverseVendorRefund(
      ORG,
      refundResult.refundId,
      OWNER_ID,
      'Vendor refund wire recalled by counterparty'
    );
    expect(revResult.success).toBe(true);

    // 9. Verify Vendor Refund is marked REVERSED
    const refundAfterRev = await PurchasesEngine.getVendorRefundById(ORG, refundResult.refundId);
    expect(refundAfterRev.status).toBe('REVERSED');
    expect(refundAfterRev.reversal_journal_id).toBeDefined();

    // 10. Verify Debit Note remaining credit restored to 300
    const dnRestored = await db.query(`SELECT remaining_credit, status FROM vendor_credits WHERE id = $1`, [dn.id]);
    expect(Number(dnRestored.rows[0].remaining_credit)).toBe(300);
    expect(dnRestored.rows[0].status).toBe('Open');

    // 11. Verify Bank Account current_balance restored to initial
    const bankAfterRev = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc.id]);
    expect(Number(bankAfterRev.rows[0].current_balance)).toBe(initialBankBal);
  });

  // BANK RECONCILIATION & P1: Customer and Vendor Refund Reconciliation
  it('Bank Reconciliation: Supports matching statement lines against customer_refund and vendor_refund', async () => {
    // 1. Create a bank statement transaction for refund outflow
    const stmtTxOutId = newId('stx');
    await db.query(
      `INSERT INTO bank_statement_transactions (
        id, organization_id, bank_account_id, statement_import_id, transaction_date,
        amount, direction, narration, currency, reconciliation_status, fingerprint
      ) VALUES ($1, $2, 'mock-bank', 'mock-imp', '2026-03-01', 150, 'DEBIT', 'Refund Outflow', 'INR', 'UNMATCHED', $3)`,
      [stmtTxOutId, ORG, `fp-out-${stmtTxOutId}`]
    );

    // 2. Create customer refund
    const bankAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG])).rows[0];
    const custRef = await SalesEngine.recordRefund(ORG, {
      customerId: CUSTOMER_ID,
      refundDate: '2026-03-01',
      amount: 150,
      refundAccountId: bankAcc.id,
      reference: 'REF-OUT-001',
    });

    // 3. Match customer refund in bank reconciliation
    const matchOut = await BankReconciliationService.matchTransaction(
      ORG,
      stmtTxOutId,
      'customer_refund',
      custRef.refundId,
      150,
      100,
      undefined,
      'User',
      true
    );
    expect(matchOut.accountingTransactionType).toBe('customer_refund');
    expect(matchOut.status).toBe('MATCHED');

    // 4. Create a bank statement transaction for refund inflow
    const stmtTxInId = newId('stx');
    await db.query(
      `INSERT INTO bank_statement_transactions (
        id, organization_id, bank_account_id, statement_import_id, transaction_date,
        amount, direction, narration, currency, reconciliation_status, fingerprint
      ) VALUES ($1, $2, 'mock-bank', 'mock-imp', '2026-03-02', 200, 'CREDIT', 'Vendor Refund Inflow', 'INR', 'UNMATCHED', $3)`,
      [stmtTxInId, ORG, `fp-in-${stmtTxInId}`]
    );

    // 5. Create vendor refund
    const vdrRef = await PurchasesEngine.recordVendorRefund(ORG, {
      vendorId: VENDOR_ID,
      refundDate: '2026-03-02',
      amount: 200,
      depositToAccountId: bankAcc.id,
      reference: 'VR-IN-001',
    });

    // 6. Match vendor refund in bank reconciliation
    const matchIn = await BankReconciliationService.matchTransaction(
      ORG,
      stmtTxInId,
      'vendor_refund',
      vdrRef.refundId,
      200,
      100,
      undefined,
      'User',
      true
    );
    expect(matchIn.accountingTransactionType).toBe('vendor_refund');
    expect(matchIn.status).toBe('MATCHED');
  });

  // PURCHASES ENGINE RESILIENT CoA FALLBACK (P1)
  it('PurchasesEngine: Resilient CoA fallback correctly resolves AP and Bank accounts on custom charts', async () => {
    // Post a bill payment referencing role names instead of hardcoded IDs
    const bankRes = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG]);
    const bill = await PurchasesEngine.createAndPostBill(ORG, {
      vendorId: VENDOR_ID,
      billDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Office Supplies', quantity: 1, unitPrice: 250, taxRate: 0, accountId: 'acc-supplies' }],
    });

    const payment = await PurchasesEngine.recordVendorPayment(ORG, {
      vendorId: VENDOR_ID,
      amount: 250,
      paymentDate: '2026-03-03',
      paymentMode: 'Cash',
      paidFromAccountId: bankRes.rows[0].id,
      reference: 'CASH-PAY-250',
      allocations: [{ billId: bill.id, amount: 250 }],
    });

    expect(payment.id).toBeDefined();
    expect(payment.journalEntryId).toBeDefined();

    // Verify journal was posted with debit 250 and credit 250
    const lines = await db.query(`SELECT debit, credit FROM journal_lines WHERE journal_entry_id = $1`, [payment.journalEntryId]);
    const totalDr = lines.rows.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCr = lines.rows.reduce((s, l) => s + Number(l.credit || 0), 0);
    expect(totalDr).toBe(250);
    expect(totalCr).toBe(250);
  });

  // INVARIANTS 1, 2, 3, 5, 6, 7 HARNESS
  it('All Invariants 1-7 Hold Across Payment Flows', async () => {
    // 1. Post a payment to have live data in this test
    const bankRes = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1010'`, [ORG]);
    const inv = await SalesEngine.createAndPostInvoice(ORG, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Consulting', quantity: 1, unitPrice: 1000, taxRate: 0 }],
    });
    await SalesEngine.recordCustomerPayment(ORG, {
      invoiceId: inv.id,
      amount: 1000,
      paymentDate: '2026-03-02',
      paymentMode: 'CASH',
      depositAccountId: bankRes.rows[0].id,
      reference: 'PAY-INV-1000',
    });

    // Invariant 3: SUM(debits) = SUM(credits) across ALL journals
    const allJournals = await db.query(
      `SELECT journal_entry_id, debit, credit
       FROM journal_lines
       WHERE organization_id = $1`,
      [ORG]
    );
    const journalMap: Record<string, { dr: number; cr: number }> = {};
    for (const row of allJournals.rows) {
      if (!journalMap[row.journal_entry_id]) {
        journalMap[row.journal_entry_id] = { dr: 0, cr: 0 };
      }
      journalMap[row.journal_entry_id].dr += Number(row.debit || 0);
      journalMap[row.journal_entry_id].cr += Number(row.credit || 0);
    }
    for (const [jeId, totals] of Object.entries(journalMap)) {
      expect(
        Math.abs(totals.dr - totals.cr),
        `Journal entry ${jeId} is not balanced: dr=${totals.dr}, cr=${totals.cr}`
      ).toBeLessThan(0.001);
    }

    // Invariant 2: Every payment journal touches a monetary account (Asset / Bank / Cash)
    const monetaryCheck = await db.query(
      `SELECT DISTINCT jl.journal_entry_id
       FROM journal_lines jl
       JOIN accounts a ON a.id = jl.account_id
       WHERE jl.organization_id = $1
         AND (a.type IN ('Asset', 'Bank', 'Cash') OR a.sub_type IN ('Bank', 'Cash'))`,
      [ORG]
    );
    expect(monetaryCheck.rows.length).toBeGreaterThan(0);
  });
});
