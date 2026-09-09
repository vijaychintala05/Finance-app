import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { newId } from '../utils/ids';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { CustomerPortalService } from '../services/CustomerPortalService';
import { ExpensePostingService } from '../services/ExpensePostingService';

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

  it('Advance refunds use the advance ledger and restore both source and cash balances on reversal', async () => {
    const bank = (await db.query(
      `SELECT ba.id, ba.current_balance, ba.ledger_account_id
         FROM bank_accounts ba
         JOIN accounts a ON a.organization_id = ba.organization_id AND a.id = ba.ledger_account_id
        WHERE ba.organization_id = $1 AND a.code = '1010'`,
      [ORG]
    )).rows[0];
    const initialBank = Number(bank.current_balance);

    const customerAdvance = await SalesEngine.recordCustomerAdvance(ORG, {
      customerId: CUSTOMER_ID,
      amount: 400,
      paymentDate: '2026-03-03',
      depositAccountId: bank.ledger_account_id,
      reference: 'CUST-ADV-REFUND',
    });
    const customerRefund = await SalesEngine.recordRefund(ORG, {
      customerId: CUSTOMER_ID,
      advanceId: customerAdvance.advanceId,
      refundDate: '2026-03-04',
      amount: 150,
      refundAccountId: bank.ledger_account_id,
    });
    const customerRefundLines = await db.query(
      `SELECT a.system_role, jl.debit, jl.credit
         FROM customer_refunds r
         JOIN journal_lines jl ON jl.organization_id = r.organization_id AND jl.journal_entry_id = r.journal_entry_id
         JOIN accounts a ON a.organization_id = jl.organization_id AND a.id = jl.account_id
        WHERE r.organization_id = $1 AND r.id = $2`,
      [ORG, customerRefund.refundId]
    );
    expect(customerRefundLines.rows.some((row) => row.system_role === 'CUSTOMER_ADVANCE' && Number(row.debit) === 150)).toBe(true);
    expect(Number((await db.query(`SELECT unapplied_amount FROM customer_advances WHERE id = $1`, [customerAdvance.advanceId])).rows[0].unapplied_amount)).toBe(250);

    await FinancialDestructiveActionsService.reverseCustomerRefund(
      ORG, customerRefund.refundId, OWNER_ID, 'Customer refund was cancelled'
    );
    expect(Number((await db.query(`SELECT unapplied_amount FROM customer_advances WHERE id = $1`, [customerAdvance.advanceId])).rows[0].unapplied_amount)).toBe(400);
    await FinancialDestructiveActionsService.reverseCustomerAdvance(
      ORG, customerAdvance.advanceId, OWNER_ID, 'Customer advance was entered in error'
    );

    const vendorAdvance = await PurchasesEngine.recordVendorAdvance(ORG, {
      vendorId: VENDOR_ID,
      amount: 500,
      paidDate: '2026-03-05',
      paidFromAccountId: bank.ledger_account_id,
      reference: 'VEND-ADV-REFUND',
    });
    const vendorRefund = await PurchasesEngine.recordVendorRefund(ORG, {
      vendorId: VENDOR_ID,
      advanceId: vendorAdvance.id,
      refundDate: '2026-03-06',
      amount: 200,
      depositToAccountId: bank.ledger_account_id,
    });
    const vendorRefundLines = await db.query(
      `SELECT a.system_role, jl.debit, jl.credit
         FROM vendor_refunds r
         JOIN journal_lines jl ON jl.organization_id = r.organization_id AND jl.journal_entry_id = r.journal_entry_id
         JOIN accounts a ON a.organization_id = jl.organization_id AND a.id = jl.account_id
        WHERE r.organization_id = $1 AND r.id = $2`,
      [ORG, vendorRefund.refundId]
    );
    expect(vendorRefundLines.rows.some((row) => row.system_role === 'VENDOR_ADVANCE' && Number(row.credit) === 200)).toBe(true);
    expect(Number((await db.query(`SELECT unapplied_amount FROM vendor_advances WHERE id = $1`, [vendorAdvance.id])).rows[0].unapplied_amount)).toBe(300);

    await FinancialDestructiveActionsService.reverseVendorRefund(
      ORG, vendorRefund.refundId, OWNER_ID, 'Vendor refund was cancelled'
    );
    expect(Number((await db.query(`SELECT unapplied_amount FROM vendor_advances WHERE id = $1`, [vendorAdvance.id])).rows[0].unapplied_amount)).toBe(500);
    await FinancialDestructiveActionsService.reverseVendorAdvance(
      ORG, vendorAdvance.id, OWNER_ID, 'Vendor advance was entered in error'
    );

    expect(Number((await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bank.id])).rows[0].current_balance)).toBe(initialBank);
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
    const creditNote = await SalesEngine.createCreditNote(ORG, {
      customerId: CUSTOMER_ID,
      date: '2026-03-01',
      amount: 150,
      reason: 'Refund reconciliation test',
    });
    const custRef = await SalesEngine.recordRefund(ORG, {
      customerId: CUSTOMER_ID,
      creditNoteId: creditNote.id,
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
    const debitNote = await PurchasesEngine.createDebitNote(ORG, {
      vendorId: VENDOR_ID,
      date: '2026-03-02',
      items: [{ description: 'Vendor refund reconciliation', quantity: 1, unitPrice: 200, taxRate: 0 }],
    });
    const vdrRef = await PurchasesEngine.recordVendorRefund(ORG, {
      vendorId: VENDOR_ID,
      debitNoteId: debitNote.id,
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

    // Invariants 1 & 2: every final payment has one posted journal and a monetary line.
    const payments = await db.query(
      `SELECT id, journal_entry_id FROM payments_received
        WHERE organization_id = $1 AND status IN ('ALLOCATED', 'PARTIALLY_ALLOCATED', 'UNALLOCATED')`,
      [ORG]
    );
    for (const payment of payments.rows) {
      expect(payment.journal_entry_id).toBeTruthy();
      const monetaryLines = await db.query(
        `SELECT jl.id FROM journal_lines jl
          JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = jl.organization_id
          JOIN accounts a ON a.id = jl.account_id AND a.organization_id = jl.organization_id
          LEFT JOIN bank_accounts ba ON ba.organization_id = a.organization_id AND ba.ledger_account_id = a.id AND ba.is_active = TRUE
         WHERE jl.organization_id = $1 AND jl.journal_entry_id = $2 AND UPPER(je.status) = 'POSTED'
           AND (ba.id IS NOT NULL OR UPPER(a.type) IN ('BANK', 'CASH') OR (UPPER(a.type) = 'ASSET' AND UPPER(a.sub_type) IN ('BANK', 'CASH', 'CASH & BANK', 'CASH AND CASH EQUIVALENTS', 'DIGITAL WALLET', 'UNDEPOSITED FUNDS', 'PAYMENT CLEARING')))`,
        [ORG, payment.journal_entry_id]
      );
      expect(monetaryLines.rows.length, `Payment ${payment.id} has no monetary journal line`).toBeGreaterThan(0);
    }
  });

  it('rejects non-monetary accounts across receipt, payment, and refund services', async () => {
    const expenseAccount = (await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '6000'`,
      [ORG]
    )).rows[0].id;
    const invoice = await SalesEngine.createAndPostInvoice(ORG, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Account policy test', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    await expect(SalesEngine.recordCustomerPayment(ORG, {
      invoiceId: invoice.id,
      amount: 100,
      paymentDate: '2026-03-02',
      depositAccountId: expenseAccount,
    })).rejects.toThrow(/DEPOSIT_ACCOUNT_TYPE_INVALID/);

    const bill = await PurchasesEngine.createAndPostBill(ORG, {
      vendorId: VENDOR_ID,
      billDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Account policy bill', quantity: 1, unitPrice: 100, taxRate: 0, accountId: expenseAccount }],
    });
    await expect(PurchasesEngine.recordVendorPayment(ORG, {
      vendorId: VENDOR_ID,
      amount: 100,
      paymentDate: '2026-03-02',
      paidFromAccountId: expenseAccount,
      allocations: [{ billId: bill.id, amount: 100 }],
    })).rejects.toThrow(/PAID_FROM_ACCOUNT_TYPE_INVALID/);

    const creditNote = await SalesEngine.createCreditNote(ORG, { customerId: CUSTOMER_ID, date: '2026-03-03', amount: 25 });
    await expect(SalesEngine.recordRefund(ORG, {
      customerId: CUSTOMER_ID,
      creditNoteId: creditNote.id,
      refundDate: '2026-03-04',
      amount: 25,
      refundAccountId: expenseAccount,
    })).rejects.toThrow(/REFUND_ACCOUNT_TYPE_INVALID/);
  });

  it('posts verified gateway receipts to clearing, settles payout to bank, and lets the portal confirm only that event', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(ORG, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Gateway clearing test', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    const receiptEventId = `evt-receipt-${newId('x')}`;
    const receipt = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'mock',
      eventId: receiptEventId,
      eventType: 'payment.succeeded',
      payload: { id: receiptEventId, invoiceId: invoice.id, amount: 100, currency: 'INR', created_at: '2026-03-02T10:00:00Z' },
    });
    expect(receipt.status).toBe('PROCESSED');
    const event = (await db.query(
      `SELECT payment_id, invoice_id, journal_entry_id FROM payment_gateway_events WHERE organization_id = $1 AND event_id = $2`,
      [ORG, receiptEventId]
    )).rows[0];
    expect(event.payment_id).toBe(receipt.paymentId);
    expect(event.invoice_id).toBe(invoice.id);
    expect(event.journal_entry_id).toBeTruthy();

    const token = await CustomerPortalService.generatePortalToken(ORG, CUSTOMER_ID);
    const confirmation = await CustomerPortalService.processPortalPayment(token.token, {
      invoiceId: invoice.id,
      amount: 100,
      gatewayEventId: receiptEventId,
    });
    expect(confirmation.paymentId).toBe(receipt.paymentId);
    expect(confirmation.remainingBalance).toBe(0);

    const clearingId = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1600'`, [ORG])).rows[0].id;
    expect(Number((await db.query(`SELECT balance FROM accounts WHERE id = $1`, [clearingId])).rows[0].balance)).toBe(100);
    const payoutEventId = `evt-payout-${newId('x')}`;
    const payout = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'mock',
      eventId: payoutEventId,
      eventType: 'payout.paid',
      payload: { id: payoutEventId, amount: 100, currency: 'INR', bankAccountId: 'bank-acc-main', created_at: 1772445600 },
    });
    expect(payout.status).toBe('PROCESSED');
    expect(Number((await db.query(`SELECT balance FROM accounts WHERE id = $1`, [clearingId])).rows[0].balance)).toBe(0);

    const invalidEventId = `evt-invalid-${newId('x')}`;
    const invalid = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'mock',
      eventId: invalidEventId,
      eventType: 'payment.succeeded',
      payload: { id: invalidEventId, amount: 10, currency: 'INR' },
    });
    expect(invalid.status).toBe('FAILED');
    const invalidRow = (await db.query(
      `SELECT status, journal_entry_id FROM payment_gateway_events WHERE organization_id = $1 AND event_id = $2`,
      [ORG, invalidEventId]
    )).rows[0];
    expect(invalidRow.status).toBe('FAILED');
    expect(invalidRow.journal_entry_id).toBeNull();
  });

  it('posts gateway refunds and chargeback reinstatements through AR and payment clearing without duplicating the original receipt', async () => {
    const invoice = await SalesEngine.createAndPostInvoice(ORG, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Gateway refund test', quantity: 1, unitPrice: 100, taxRate: 0 }],
    });
    const receiptEventId = `evt-receipt-refund-${newId('x')}`;
    const receipt = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'mock',
      eventId: receiptEventId,
      eventType: 'payment.succeeded',
      payload: { id: receiptEventId, invoiceId: invoice.id, amount: 100, currency: 'INR', created_at: '2026-03-02T10:00:00Z' },
    });
    const refundEventId = `evt-refund-${newId('x')}`;
    const refund = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'mock',
      eventId: refundEventId,
      eventType: 'refund.succeeded',
      payload: { id: refundEventId, originalEventId: receiptEventId, invoiceId: invoice.id, amount: 40, currency: 'INR', created_at: '2026-03-03T10:00:00Z' },
    });
    expect(refund).toMatchObject({ status: 'PROCESSED', paymentId: receipt.paymentId });
    const refundLines = await db.query(
      `SELECT a.code, jl.debit, jl.credit
         FROM payment_gateway_events e JOIN journal_lines jl ON jl.organization_id = e.organization_id AND jl.journal_entry_id = e.journal_entry_id
         JOIN accounts a ON a.organization_id = jl.organization_id AND a.id = jl.account_id
        WHERE e.organization_id = $1 AND e.event_id = $2`,
      [ORG, refundEventId]
    );
    expect(refundLines.rows.some((line) => line.code === '1100' && Number(line.debit) === 40)).toBe(true);
    expect(refundLines.rows.some((line) => line.code === '1600' && Number(line.credit) === 40)).toBe(true);
    expect(Number((await db.query(`SELECT paid_amount, balance_due FROM invoices WHERE organization_id = $1 AND id = $2`, [ORG, invoice.id])).rows[0].paid_amount)).toBe(60);

    const reinstatementEventId = `evt-refund-reinstated-${newId('x')}`;
    const reinstatement = await PaymentGatewayService.processWebhook({
      organizationId: ORG,
      gateway: 'mock',
      eventId: reinstatementEventId,
      eventType: 'refund.reversed',
      payload: { id: reinstatementEventId, originalEventId: refundEventId, amount: 40, currency: 'INR', created_at: '2026-03-04T10:00:00Z' },
    });
    expect(reinstatement).toMatchObject({ status: 'PROCESSED', paymentId: receipt.paymentId });
    const invoiceAfter = (await db.query(`SELECT paid_amount, balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2`, [ORG, invoice.id])).rows[0];
    expect(Number(invoiceAfter.paid_amount)).toBe(100);
    expect(Number(invoiceAfter.balance_due)).toBe(0);
    expect(String(invoiceAfter.status).toUpperCase()).toBe('PAID');
    const outflowEvent = (await db.query(`SELECT status, reversal_journal_id FROM payment_gateway_events WHERE organization_id = $1 AND event_id = $2`, [ORG, refundEventId])).rows[0];
    expect(outflowEvent.status).toBe('REVERSED');
    expect(outflowEvent.reversal_journal_id).toBeTruthy();
  });

  it('recovers a direct vendor-paid expense to the selected monetary account and reverses without altering AP', async () => {
    const bank = (await db.query(
      `SELECT ledger_account_id FROM bank_accounts WHERE organization_id = $1 AND id = 'bank-acc-main'`, [ORG]
    )).rows[0];
    const expenseAccount = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '6000'`, [ORG])).rows[0];
    const directExpense = await ExpensePostingService.createAndPost(ORG, OWNER_ID, {
      expenseAccountId: expenseAccount.id,
      paidFromAccountId: bank.ledger_account_id,
      vendorName: F.VENDORS.A1.name,
      date: '2026-03-05',
      amount: 200,
      description: 'Recoverable supplier delivery charge',
    });
    const vendorBefore = Number((await db.query(`SELECT payables_balance FROM vendors WHERE organization_id = $1 AND id = $2`, [ORG, VENDOR_ID])).rows[0].payables_balance || 0);
    const refund = await PurchasesEngine.recordVendorRefund(ORG, {
      vendorId: VENDOR_ID,
      expenseId: directExpense.id,
      refundDate: '2026-03-06',
      amount: 80,
      depositToAccountId: bank.ledger_account_id,
      reference: 'SUPPLIER-REIMBURSEMENT',
    });
    const lines = await db.query(
      `SELECT a.code, jl.debit, jl.credit FROM journal_lines jl JOIN accounts a ON a.organization_id = jl.organization_id AND a.id = jl.account_id WHERE jl.organization_id = $1 AND jl.journal_entry_id = $2`,
      [ORG, refund.journalEntryId]
    );
    expect(lines.rows.some((row) => row.code === '1010' && Number(row.debit) === 80)).toBe(true);
    expect(lines.rows.some((row) => row.code === '6000' && Number(row.credit) === 80)).toBe(true);
    expect(Number((await db.query(`SELECT payables_balance FROM vendors WHERE organization_id = $1 AND id = $2`, [ORG, VENDOR_ID])).rows[0].payables_balance || 0)).toBe(vendorBefore);
    await FinancialDestructiveActionsService.reverseVendorRefund(ORG, refund.refundId, OWNER_ID, 'Supplier reimbursement was recalled');
    const source = (await db.query(`SELECT status, expense_id, reversal_journal_id FROM vendor_refunds WHERE organization_id = $1 AND id = $2`, [ORG, refund.refundId])).rows[0];
    expect(source).toMatchObject({ status: 'REVERSED', expense_id: directExpense.id });
    expect(source.reversal_journal_id).toBeTruthy();
  });
});
