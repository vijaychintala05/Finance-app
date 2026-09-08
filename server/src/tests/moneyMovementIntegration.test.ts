import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ExpensePostingService } from '../services/ExpensePostingService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { JwtAuth } from '../auth/jwt';
import { newId } from '../utils/ids';

import { CERTIFIED_OPTIONAL_FEATURES } from '../middleware/trustedFeature.middleware';

const ORG_A = F.ORG_A.id;
const ORG_B = F.ORG_B.id;
const CUSTOMER_ID = F.CUSTOMERS.A1.id;
const VENDOR_ID = F.VENDORS.A1.id;
const OWNER_A = F.PERSONAS.ORG_A.owner.id;
const OWNER_B = F.PERSONAS.ORG_B.owner.id;

describe('Money-Movement Workflow Integration Tests', () => {
  let authHeadersA: Record<string, string>;
  let authHeadersB: Record<string, string>;
  let bankAAccountId: string;
  let bankBAccountId: string;
  let cashAccountId: string;
  let arAccountId: string;
  let apAccountId: string;
  let expenseAccountId: string;
  let creditCardAccountId: string;

  let bankABankRowId: string;
  let bankBBankRowId: string;

  beforeAll(async () => {
    process.env.TRUSTED_FINANCE_FEATURES = Array.from(CERTIFIED_OPTIONAL_FEATURES).join(',');
    await MasterFinanceFixture.setup({ usePgMem: true });

    // Ensure Credit Card liability account exists in ORG_A
    creditCardAccountId = `acc-${ORG_A}-2050`;
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, normal_balance, balance, status, is_locked)
       VALUES ($1, $2, '2050', 'Corporate Credit Card Payable', 'Liability', 'credit card', 'Credit', 0, 'Active', FALSE)
       ON CONFLICT (id) DO UPDATE SET sub_type = 'credit card', status = 'Active', is_locked = FALSE`,
      [creditCardAccountId, ORG_A]
    );

    // Resolve Ledger Account IDs
    const accRows = (await db.query(`SELECT id, code FROM accounts WHERE organization_id = $1`, [ORG_A])).rows;
    const findAcc = (code: string) => accRows.find((r) => r.code === code)?.id || `acc-${ORG_A}-${code}`;

    bankAAccountId = findAcc('1010'); // HDFC
    bankBAccountId = findAcc('1020'); // ICICI
    cashAccountId = findAcc('1000');  // Petty Cash
    arAccountId = findAcc('1100');    // AR
    apAccountId = findAcc('2000');    // AP
    expenseAccountId = findAcc('6000'); // Office Expense

    // Ensure bank_accounts table rows exist for Bank A and Bank B
    bankABankRowId = 'bank-acc-a-test';
    bankBBankRowId = 'bank-acc-b-test';

    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, opening_balance_date, status, is_active)
       VALUES ($1, $2, $3, 'HDFC Operating Bank A', '50100012345678', '•••• 5678', 'HDFC Bank', 'Checking', 'INR', 50000.00, '2026-01-01', 'Active', TRUE)
       ON CONFLICT (id) DO UPDATE SET current_balance = 50000.00, ledger_account_id = $3`,
      [bankABankRowId, ORG_A, bankAAccountId]
    );

    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, opening_balance_date, status, is_active)
       VALUES ($1, $2, $3, 'ICICI Operating Bank B', '50200087654321', '•••• 4321', 'ICICI Bank', 'Checking', 'INR', 10000.00, '2026-01-01', 'Active', TRUE)
       ON CONFLICT (id) DO UPDATE SET current_balance = 10000.00, ledger_account_id = $3`,
      [bankBBankRowId, ORG_A, bankBAccountId]
    );

    // Set initial account balances in accounts table
    await db.query(`UPDATE accounts SET balance = 50000.00 WHERE id = $1`, [bankAAccountId]);
    await db.query(`UPDATE accounts SET balance = 10000.00 WHERE id = $1`, [bankBAccountId]);
    await db.query(`UPDATE accounts SET balance = 5000.00 WHERE id = $1`, [cashAccountId]);
    await db.query(`UPDATE accounts SET balance = 0.00 WHERE id IN ($1, $2, $3, $4)`, [arAccountId, apAccountId, expenseAccountId, creditCardAccountId]);

    // Setup Auth
    const tokenA = JwtAuth.generateToken({ userId: OWNER_A, email: F.PERSONAS.ORG_A.owner.email });
    authHeadersA = {
      Authorization: `Bearer ${tokenA}`,
      'X-Organization-ID': ORG_A,
    };

    const tokenB = JwtAuth.generateToken({ userId: OWNER_B, email: F.PERSONAS.ORG_B.owner.email });
    authHeadersB = {
      Authorization: `Bearer ${tokenB}`,
      'X-Organization-ID': ORG_B,
    };
  });

  // Helper: get GL account balance
  const getGlBalance = async (accId: string): Promise<number> => {
    const res = await db.query(`SELECT balance FROM accounts WHERE id = $1`, [accId]);
    return Number(res.rows[0]?.balance || 0);
  };

  // Helper: get bank account current_balance
  const getBankBalance = async (bankRowId: string): Promise<number> => {
    const res = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankRowId]);
    return Number(res.rows[0]?.current_balance || 0);
  };

  // --------------------------------------------------------------------------
  // TEST 1: ₹10,000 customer payment received into Bank A
  // Expected: Dr Bank A 10,000 | Cr Accounts Receivable 10,000
  // --------------------------------------------------------------------------
  it('1. ₹10,000 customer payment received into Bank A', async () => {
    const initialBankBal = await getBankBalance(bankABankRowId);
    const initialGlBankBal = await getGlBalance(bankAAccountId);
    const initialArBal = await getGlBalance(arAccountId);

    // 1. Create and post invoice for ₹10,000
    const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Commercial Interior Consulting', quantity: 1, unitPrice: 10000, taxRate: 0 }],
    });
    expect(Number(inv.totalAmount)).toBe(10000);
    expect(Number(inv.balanceDue)).toBe(10000);

    // AR should have increased by 10,000 after invoice posting
    expect(await getGlBalance(arAccountId)).toBe(initialArBal + 10000);

    // 2. Record Customer Payment via API
    const payRes = await request(app)
      .post('/api/v1/finance/payments-received')
      .set(authHeadersA)
      .send({
        customerId: CUSTOMER_ID,
        paymentDate: '2026-03-02',
        amount: 10000,
        paymentMode: 'Bank Transfer',
        depositToAccountId: bankAAccountId,
        invoiceId: inv.id,
        reference: 'WIRE-CUST-10000',
      });

    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.id;
    expect(paymentId).toBeDefined();

    // 3. Verify payment record
    const pmtDb = (await db.query(`SELECT * FROM payments_received WHERE id = $1`, [paymentId])).rows[0];
    expect(pmtDb).toBeDefined();
    expect(Number(pmtDb.amount)).toBe(10000);
    expect(Number(pmtDb.unallocated_amount)).toBe(0);
    expect(pmtDb.status).toBe('ALLOCATED');
    expect(pmtDb.journal_entry_id).toBeDefined();

    // 4. Verify journal header
    const je = (await db.query(`SELECT * FROM journal_entries WHERE id = $1`, [pmtDb.journal_entry_id])).rows[0];
    expect(je).toBeDefined();
    expect(je.status).toBe('Posted');
    expect(je.organization_id).toBe(ORG_A);

    // 5. Verify journal lines & debit/credit equality
    const lines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [je.id])).rows;
    expect(lines.length).toBe(2);

    const drLine = lines.find((l) => Number(l.debit) > 0);
    const crLine = lines.find((l) => Number(l.credit) > 0);
    expect(drLine).toBeDefined();
    expect(crLine).toBeDefined();

    // Debit/Credit equality
    expect(Number(drLine.debit)).toBe(10000);
    expect(Number(crLine.credit)).toBe(10000);

    // Account IDs: Dr Bank A, Cr Accounts Receivable
    expect(drLine.account_id).toBe(bankAAccountId);
    expect(crLine.account_id).toBe(arAccountId);

    // 6. Verify GL balance
    expect(await getGlBalance(bankAAccountId)).toBe(initialGlBankBal + 10000);
    expect(await getGlBalance(arAccountId)).toBe(initialArBal); // 10000 (inv) - 10000 (pmt) = initial

    // 7. Verify cash/bank balance
    expect(await getBankBalance(bankABankRowId)).toBe(initialBankBal + 10000);

    // 8. Verify invoice outstanding amount
    const invAfter = (await db.query(`SELECT balance_due, paid_amount, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter.balance_due)).toBe(0);
    expect(Number(invAfter.paid_amount)).toBe(10000);
    expect(invAfter.status).toBe('PAID');

    // 9. Verify reconciliation visibility
    const candidates = await BankReconciliationService.findMatchSuggestions(ORG_A, 'mock-stx', [
      {
        id: paymentId,
        type: 'payment_received',
        amount: 10000,
        date: '2026-03-02',
        referenceNumber: 'WIRE-CUST-10000',
      },
    ]);
    expect(candidates).toBeDefined();

    // 10. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`,
      [ORG_A, paymentId]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.rows[0].action).toBe('PAYMENT_RECORDED');
  });

  // --------------------------------------------------------------------------
  // TEST 2: ₹5,000 customer payment received as Cash
  // Expected: Dr Cash on Hand 5,000 | Cr Accounts Receivable 5,000
  // --------------------------------------------------------------------------
  it('2. ₹5,000 customer payment received as Cash', async () => {
    const initialCashBal = await getGlBalance(cashAccountId);
    const initialArBal = await getGlBalance(arAccountId);

    // 1. Create and post invoice for ₹5,000
    const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-03',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Drafting Services', quantity: 1, unitPrice: 5000, taxRate: 0 }],
    });
    expect(Number(inv.balanceDue)).toBe(5000);

    // 2. Record Customer Payment as Cash
    const payRes = await request(app)
      .post('/api/v1/finance/payments-received')
      .set(authHeadersA)
      .send({
        customerId: CUSTOMER_ID,
        paymentDate: '2026-03-04',
        amount: 5000,
        paymentMode: 'CASH',
        depositToAccountId: cashAccountId,
        invoiceId: inv.id,
        reference: 'CASH-REC-5000',
      });

    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.id;

    // 3. Verify payment record
    const pmtDb = (await db.query(`SELECT * FROM payments_received WHERE id = $1`, [paymentId])).rows[0];
    expect(pmtDb.payment_mode).toBe('CASH');
    expect(Number(pmtDb.amount)).toBe(5000);
    expect(pmtDb.status).toBe('ALLOCATED');

    // 4. Verify journal header & lines
    const lines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [pmtDb.journal_entry_id])).rows;
    expect(lines.length).toBe(2);

    const drLine = lines.find((l) => Number(l.debit) > 0);
    const crLine = lines.find((l) => Number(l.credit) > 0);

    // Debit/credit equality: Dr 5000, Cr 5000
    expect(Number(drLine.debit)).toBe(5000);
    expect(Number(crLine.credit)).toBe(5000);

    // Account IDs: Dr Cash on Hand, Cr AR
    expect(drLine.account_id).toBe(cashAccountId);
    expect(crLine.account_id).toBe(arAccountId);

    // 5. Verify GL & cash balance
    expect(await getGlBalance(cashAccountId)).toBe(initialCashBal + 5000);
    expect(await getGlBalance(arAccountId)).toBe(initialArBal); // Restored to initial

    // 6. Verify invoice outstanding amount
    const invAfter = (await db.query(`SELECT balance_due, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter.balance_due)).toBe(0);
    expect(invAfter.status).toBe('PAID');

    // 7. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`,
      [ORG_A, paymentId]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // TEST 3: ₹7,500 vendor bill paid from Bank A
  // Expected: Dr Accounts Payable 7,500 | Cr Bank A 7,500
  // --------------------------------------------------------------------------
  it('3. ₹7,500 vendor bill paid from Bank A', async () => {
    const initialBankBal = await getBankBalance(bankABankRowId);
    const initialGlBankBal = await getGlBalance(bankAAccountId);
    const initialApBal = await getGlBalance(apAccountId);

    // 1. Create a bill for ₹7,500
    const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
      vendorId: VENDOR_ID,
      billNumber: `BILL-${Date.now()}`,
      billDate: '2026-03-01',
      dueDate: '2026-03-31',
      totalAmount: 7500,
      items: [{ description: 'Raw Plywood Supply', quantity: 1, unitPrice: 7500, amount: 7500, expenseAccountId }],
    });
    expect(Number(bill.balanceDue)).toBe(7500);

    // 2. Pay vendor bill via API
    const payRes = await request(app)
      .post('/api/v1/finance/vendor-payments')
      .set(authHeadersA)
      .send({
        vendorId: VENDOR_ID,
        paymentDate: '2026-03-04',
        amount: 7500,
        paymentMode: 'Bank Wire / NEFT',
        paidFromAccountId: bankAAccountId,
        allocations: [{ billId: bill.id, amount: 7500 }],
        reference: 'WIRE-VEND-7500',
      });

    expect(payRes.status).toBe(201);
    const paymentId = payRes.body.id;

    // 3. Verify payment record
    const pmtDb = (await db.query(`SELECT * FROM payments_made WHERE id = $1`, [paymentId])).rows[0];
    expect(pmtDb).toBeDefined();
    expect(Number(pmtDb.amount)).toBe(7500);
    expect(Number(pmtDb.unallocated_amount)).toBe(0);
    expect(pmtDb.status).toBe('ALLOCATED');

    // 4. Verify journal header & lines
    const lines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [pmtDb.journal_entry_id])).rows;
    expect(lines.length).toBe(2);

    const drLine = lines.find((l) => Number(l.debit) > 0);
    const crLine = lines.find((l) => Number(l.credit) > 0);

    // Debit/credit equality: Dr 7500, Cr 7500
    expect(Number(drLine.debit)).toBe(7500);
    expect(Number(crLine.credit)).toBe(7500);

    // Account IDs: Dr AP, Cr Bank A
    expect(drLine.account_id).toBe(apAccountId);
    expect(crLine.account_id).toBe(bankAAccountId);

    // 5. Verify GL & bank balance
    expect(await getGlBalance(bankAAccountId)).toBe(initialGlBankBal - 7500);
    expect(await getBankBalance(bankABankRowId)).toBe(initialBankBal - 7500);

    // 6. Verify bill outstanding amount
    const billAfter = (await db.query(`SELECT balance_due, amount_paid, status FROM bills WHERE id = $1`, [bill.id])).rows[0];
    expect(Number(billAfter.balance_due)).toBe(0);
    expect(Number(billAfter.amount_paid)).toBe(7500);
    expect(billAfter.status).toBe('PAID');

    // 7. Verify reconciliation visibility
    const candidates = await BankReconciliationService.findMatchSuggestions(ORG_A, 'mock-stx', [
      {
        id: paymentId,
        type: 'payment_made',
        amount: 7500,
        date: '2026-03-04',
        referenceNumber: 'WIRE-VEND-7500',
      },
    ]);
    expect(candidates).toBeDefined();

    // 8. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`,
      [ORG_A, paymentId]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.rows[0].action).toBe('VENDOR_PAYMENT_RECORDED');
  });

  // --------------------------------------------------------------------------
  // TEST 4: ₹2,000 direct cash expense
  // Expected: Dr Expense 2,000 | Cr Cash on Hand 2,000
  // --------------------------------------------------------------------------
  it('4. ₹2,000 direct cash expense', async () => {
    const initialCashBal = await getGlBalance(cashAccountId);
    const initialExpBal = await getGlBalance(expenseAccountId);

    // 1. Create direct cash expense via ExpensePostingService / API
    const expRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(authHeadersA)
      .send({
        expenseAccountId,
        paidFromAccountId: cashAccountId,
        vendorName: 'Stationery Mart',
        date: '2026-03-05',
        amount: 2000,
        description: 'Office stationery supplies',
      });

    expect(expRes.status).toBe(201);
    const expenseId = expRes.body.id;

    // 2. Verify expense record
    const expDb = (await db.query(`SELECT * FROM expenses WHERE id = $1`, [expenseId])).rows[0];
    expect(expDb).toBeDefined();
    expect(Number(expDb.amount)).toBe(2000);
    expect(expDb.journal_entry_id).toBeDefined();

    // 3. Verify journal header & lines
    const lines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [expDb.journal_entry_id])).rows;
    expect(lines.length).toBe(2);

    const drLine = lines.find((l) => Number(l.debit) > 0);
    const crLine = lines.find((l) => Number(l.credit) > 0);

    // Debit/credit equality: Dr 2000, Cr 2000
    expect(Number(drLine.debit)).toBe(2000);
    expect(Number(crLine.credit)).toBe(2000);

    // Account IDs: Dr Expense, Cr Cash on Hand
    expect(drLine.account_id).toBe(expenseAccountId);
    expect(crLine.account_id).toBe(cashAccountId);

    // 4. Verify GL balance & cash balance
    expect(await getGlBalance(expenseAccountId)).toBe(initialExpBal + 2000);
    expect(await getGlBalance(cashAccountId)).toBe(initialCashBal - 2000);

    // 5. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`,
      [ORG_A, expenseId]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.rows[0].action).toBe('EXPENSE_CREATED');
  });

  // --------------------------------------------------------------------------
  // TEST 5: ₹15,000 expense paid by credit card
  // Expected: Dr Expense 15,000 | Cr Credit Card Payable 15,000
  // --------------------------------------------------------------------------
  it('5. ₹15,000 expense paid by credit card', async () => {
    const initialExpBal = await getGlBalance(expenseAccountId);
    const initialCcBal = await getGlBalance(creditCardAccountId);

    // 1. Post expense paid by credit card
    const exp = await ExpensePostingService.createAndPost(ORG_A, OWNER_A, {
      expenseAccountId,
      paidFromAccountId: creditCardAccountId,
      vendorName: 'AWS Cloud Services',
      date: '2026-03-05',
      amount: 15000,
      description: 'Monthly cloud infrastructure hosting',
    });

    expect(exp.id).toBeDefined();
    expect(exp.journalEntryId).toBeDefined();

    // 2. Verify expense record
    const expDb = (await db.query(`SELECT * FROM expenses WHERE id = $1`, [exp.id])).rows[0];
    expect(Number(expDb.amount)).toBe(15000);

    // 3. Verify journal lines
    const lines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [exp.journalEntryId])).rows;
    expect(lines.length).toBe(2);

    const drLine = lines.find((l) => Number(l.debit) > 0);
    const crLine = lines.find((l) => Number(l.credit) > 0);

    // Debit/credit equality: Dr 15000, Cr 15000
    expect(Number(drLine.debit)).toBe(15000);
    expect(Number(crLine.credit)).toBe(15000);

    // Account IDs: Dr Expense, Cr Credit Card Payable
    expect(drLine.account_id).toBe(expenseAccountId);
    expect(crLine.account_id).toBe(creditCardAccountId);

    // 4. Verify GL balance: Expense +15,000, Credit Card Payable liability +15,000 (credit normal)
    expect(await getGlBalance(expenseAccountId)).toBe(initialExpBal + 15000);
    expect(await getGlBalance(creditCardAccountId)).toBe(initialCcBal + 15000);

    // 5. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`,
      [ORG_A, exp.id]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.rows[0].action).toBe('EXPENSE_CREATED');
  });

  // --------------------------------------------------------------------------
  // TEST 6: ₹20,000 transfer Bank A → Bank B
  // Expected: Dr Bank B 20,000 | Cr Bank A 20,000
  // --------------------------------------------------------------------------
  it('6. ₹20,000 transfer Bank A → Bank B', async () => {
    const initialBankABal = await getBankBalance(bankABankRowId);
    const initialBankBBal = await getBankBalance(bankBBankRowId);
    const initialGlBankABal = await getGlBalance(bankAAccountId);
    const initialGlBankBBal = await getGlBalance(bankBAccountId);

    // 1. Create Internal Bank Transfer
    const transfer = await BankReconciliationService.createInternalTransfer(
      ORG_A,
      bankABankRowId,
      bankBBankRowId,
      20000,
      '2026-03-06',
      'TRF-20000-TEST',
      'Internal Liquidity Rebalancing'
    );
    expect(transfer.journalEntryId).toBeDefined();

    // 2. Verify journal header
    const je = (await db.query(`SELECT * FROM journal_entries WHERE id = $1`, [transfer.journalEntryId])).rows[0];
    expect(je).toBeDefined();
    expect(je.status).toBe('Posted');

    // 3. Verify journal lines
    const lines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [transfer.journalEntryId])).rows;
    expect(lines.length).toBe(2);

    const drLine = lines.find((l) => Number(l.debit) > 0);
    const crLine = lines.find((l) => Number(l.credit) > 0);

    // Debit/credit equality: Dr 20000, Cr 20000
    expect(Number(drLine.debit)).toBe(20000);
    expect(Number(crLine.credit)).toBe(20000);

    // Account IDs: Dr Bank B (destination), Cr Bank A (source)
    expect(drLine.account_id).toBe(bankBAccountId);
    expect(crLine.account_id).toBe(bankAAccountId);

    // 4. Verify GL balance
    expect(await getGlBalance(bankBAccountId)).toBe(initialGlBankBBal + 20000);
    expect(await getGlBalance(bankAAccountId)).toBe(initialGlBankABal - 20000);

    // 5. Verify cash/bank balance
    expect(await getBankBalance(bankBBankRowId)).toBe(initialBankBBal + 20000);
    expect(await getBankBalance(bankABankRowId)).toBe(initialBankABal - 20000);

    // 6. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`,
      [ORG_A, transfer.journalEntryId]
    );
    expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    expect(auditRes.rows[0].action).toBe('INTERNAL_TRANSFER_CREATED');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Customer payment reversed
  // Verify original transaction is preserved and reversal journal is generated
  // --------------------------------------------------------------------------
  it('7. Customer payment reversed preserves original and generates reversal journal', async () => {
    // 1. Create and pay an invoice
    const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-06',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Design Retainer', quantity: 1, unitPrice: 3000, taxRate: 0 }],
    });

    const pmt = await SalesEngine.recordCustomerPayment(ORG_A, {
      invoiceId: inv.id,
      amount: 3000,
      paymentDate: '2026-03-07',
      paymentMode: 'Bank Transfer',
      depositAccountId: bankAAccountId,
      reference: 'WIRE-REV-TEST',
    });

    const bankBalBeforeRev = await getBankBalance(bankABankRowId);
    const glBankBalBeforeRev = await getGlBalance(bankAAccountId);
    const arBalBeforeRev = await getGlBalance(arAccountId);

    // 2. Reverse customer payment
    const revResult = await FinancialDestructiveActionsService.reversePaymentReceived(
      ORG_A,
      pmt.id,
      OWNER_A,
      'Customer cheque bounced / Counterparty recall'
    );
    expect(revResult.success).toBe(true);
    expect(revResult.journalEntryId).toBeDefined();

    // 3. Verify original payment is PRESERVED with status REVERSED
    const origPmt = (await db.query(`SELECT * FROM payments_received WHERE id = $1`, [pmt.id])).rows[0];
    expect(origPmt.status).toBe('REVERSED');
    expect(origPmt.reversal_journal_id).toBe(revResult.journalEntryId);
    expect(origPmt.journal_entry_id).toBeDefined(); // Original journal preserved!

    // 4. Verify reversal journal lines: Dr AR 3000, Cr Bank A 3000
    const revLines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [revResult.journalEntryId])).rows;
    expect(revLines.length).toBe(2);

    const drLine = revLines.find((l) => Number(l.debit) > 0);
    const crLine = revLines.find((l) => Number(l.credit) > 0);
    expect(Number(drLine.debit)).toBe(3000);
    expect(Number(crLine.credit)).toBe(3000);
    expect(drLine.account_id).toBe(arAccountId);
    expect(crLine.account_id).toBe(bankAAccountId);

    // 5. Verify GL & bank balance restored
    expect(await getBankBalance(bankABankRowId)).toBe(bankBalBeforeRev - 3000);
    expect(await getGlBalance(bankAAccountId)).toBe(glBankBalBeforeRev - 3000);
    expect(await getGlBalance(arAccountId)).toBe(arBalBeforeRev + 3000);

    // 6. Verify invoice outstanding balance restored
    const invAfter = (await db.query(`SELECT balance_due, paid_amount, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter.balance_due)).toBe(3000);
    expect(Number(invAfter.paid_amount)).toBe(0);
    expect(invAfter.status).toBe('POSTED');

    // 7. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'PAYMENT_RECEIVED_REVERSED'`,
      [ORG_A, pmt.id]
    );
    expect(auditRes.rows.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Vendor payment reversed
  // Verify correct opposite accounting entry
  // --------------------------------------------------------------------------
  it('8. Vendor payment reversed with correct opposite accounting entry', async () => {
    // 1. Create and pay bill
    const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
      vendorId: VENDOR_ID,
      billNumber: `BILL-REV-${Date.now()}`,
      billDate: '2026-03-01',
      dueDate: '2026-03-31',
      totalAmount: 4000,
      items: [{ description: 'Timber', quantity: 1, unitPrice: 4000, amount: 4000, expenseAccountId }],
    });

    const vpmt = await PurchasesEngine.recordVendorPayment(ORG_A, {
      vendorId: VENDOR_ID,
      paymentDate: '2026-03-07',
      amount: 4000,
      paidFromAccountId: bankAAccountId,
      allocations: [{ billId: bill.id, amount: 4000 }],
      reference: 'VPMT-REV-TEST',
    });

    const bankBalBeforeRev = await getBankBalance(bankABankRowId);
    const glBankBalBeforeRev = await getGlBalance(bankAAccountId);

    // 2. Reverse vendor payment
    const revResult = await FinancialDestructiveActionsService.reverseVendorPayment(
      ORG_A,
      vpmt.id,
      OWNER_A,
      'Vendor payment cancelled before clearing'
    );
    expect(revResult.success).toBe(true);

    // 3. Verify original payment is PRESERVED with status REVERSED
    const origPmt = (await db.query(`SELECT * FROM payments_made WHERE id = $1`, [vpmt.id])).rows[0];
    expect(origPmt.status).toBe('REVERSED');
    expect(origPmt.reversal_journal_id).toBe(revResult.journalEntryId);

    // 4. Verify reversal journal lines: Dr Bank A 4000, Cr Accounts Payable 4000
    const revLines = (await db.query(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [revResult.journalEntryId])).rows;
    expect(revLines.length).toBe(2);

    const drLine = revLines.find((l) => Number(l.debit) > 0);
    const crLine = revLines.find((l) => Number(l.credit) > 0);
    expect(Number(drLine.debit)).toBe(4000);
    expect(Number(crLine.credit)).toBe(4000);
    expect(drLine.account_id).toBe(bankAAccountId);
    expect(crLine.account_id).toBe(apAccountId);

    // 5. Verify GL & bank balance restored
    expect(await getBankBalance(bankABankRowId)).toBe(bankBalBeforeRev + 4000);
    expect(await getGlBalance(bankAAccountId)).toBe(glBankBalBeforeRev + 4000);

    // 6. Verify bill balance restored
    const billAfter = (await db.query(`SELECT balance_due, amount_paid, status FROM bills WHERE id = $1`, [bill.id])).rows[0];
    expect(Number(billAfter.balance_due)).toBe(4000);
    expect(Number(billAfter.amount_paid)).toBe(0);

    // 7. Verify audit trail
    const auditRes = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 AND entity_id = $2 AND action = 'VENDOR_PAYMENT_REVERSED'`,
      [ORG_A, vpmt.id]
    );
    expect(auditRes.rows.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Duplicate API request
  // Verify only one financial posting occurs
  // --------------------------------------------------------------------------
  it('9. Duplicate API request verifies only one financial posting occurs', async () => {
    const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-08',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Duplicate Test Invoice', quantity: 1, unitPrice: 2500, taxRate: 0 }],
    });

    const idempotencyKey = `idemp-pay-${Date.now()}-${newId('key').slice(0, 10)}`;
    const payload = {
      customerId: CUSTOMER_ID,
      paymentDate: '2026-03-08',
      amount: 2500,
      paymentMode: 'Bank Transfer',
      depositToAccountId: bankAAccountId,
      invoiceId: inv.id,
      reference: 'DUP-TEST-001',
    };

    const bankBalBefore = await getBankBalance(bankABankRowId);
    const glBalBefore = await getGlBalance(bankAAccountId);

    // First API request
    const res1 = await request(app)
      .post('/api/v1/finance/payments-received')
      .set({ ...authHeadersA, 'Idempotency-Key': idempotencyKey })
      .send(payload);

    expect(res1.status).toBe(201);
    const firstPaymentId = res1.body.id;

    // Second (duplicate) API request with identical idempotency key
    const res2 = await request(app)
      .post('/api/v1/finance/payments-received')
      .set({ ...authHeadersA, 'Idempotency-Key': idempotencyKey })
      .send(payload);

    // Duplicate returns cached response
    expect(res2.status).toBe(201);
    expect(res2.body.id).toBe(firstPaymentId);

    // Verify only ONE payment record exists for this reference
    const pmtCount = await db.query(
      `SELECT COUNT(*) FROM payments_received WHERE organization_id = $1 AND reference = 'DUP-TEST-001'`,
      [ORG_A]
    );
    expect(Number(pmtCount.rows[0].count)).toBe(1);

    // Verify bank balance only incremented once by 2500
    expect(await getBankBalance(bankABankRowId)).toBe(bankBalBefore + 2500);
    expect(await getGlBalance(bankAAccountId)).toBe(glBalBefore + 2500);

    // Verify invoice balance due is 0
    const invAfter = (await db.query(`SELECT balance_due, paid_amount FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invAfter.balance_due)).toBe(0);
    expect(Number(invAfter.paid_amount)).toBe(2500);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Failure during GL posting
  // Verify the payment itself is rolled back
  // --------------------------------------------------------------------------
  it('10. Failure during GL posting rolls back the entire payment', async () => {
    const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-08',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Rollback Test Invoice', quantity: 1, unitPrice: 1800, taxRate: 0 }],
    });

    const bankBalBefore = await getBankBalance(bankABankRowId);
    const glBalBefore = await getGlBalance(bankAAccountId);

    // Trigger failure hook after journal entry creation
    await expect(
      SalesEngine.recordPayment(ORG_A, {
        customerId: CUSTOMER_ID,
        paymentDate: '2026-03-08',
        amount: 1800,
        invoiceId: inv.id,
        depositToAccountId: bankAAccountId,
        reference: 'ROLLBACK-TRIGGER',
        _debugFailPoint: 'after_journal',
      })
    ).rejects.toThrow('DEBUG_FAILURE: Forced failure after journal entry creation');

    // Verify no payment was created
    const pmtDb = await db.query(
      `SELECT * FROM payments_received WHERE organization_id = $1 AND reference = 'ROLLBACK-TRIGGER'`,
      [ORG_A]
    );
    expect(pmtDb.rows.length).toBe(0);

    // Verify no journal entries leaked
    const jeDb = await db.query(
      `SELECT * FROM journal_entries WHERE organization_id = $1 AND description LIKE '%ROLLBACK-TRIGGER%'`,
      [ORG_A]
    );
    expect(jeDb.rows.length).toBe(0);

    // Verify invoice balance due remained intact
    const invDb = (await db.query(`SELECT balance_due, paid_amount, status FROM invoices WHERE id = $1`, [inv.id])).rows[0];
    expect(Number(invDb.balance_due)).toBe(1800);
    expect(Number(invDb.paid_amount)).toBe(0);
    expect(invDb.status).toBe('POSTED');

    // Verify balances untouched
    expect(await getBankBalance(bankABankRowId)).toBe(bankBalBefore);
    expect(await getGlBalance(bankAAccountId)).toBe(glBalBefore);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Wrong/cross-organisation account ID
  // Verify transaction is rejected
  // --------------------------------------------------------------------------
  it('11. Wrong/cross-organisation account ID is rejected without posting', async () => {
    // Get an account ID belonging to ORG_B
    const orgBAcc = (await db.query(`SELECT id FROM accounts WHERE organization_id = $1 LIMIT 1`, [ORG_B])).rows[0];
    expect(orgBAcc).toBeDefined();

    // Attempt to post expense in ORG_A referencing ORG_B's account
    await expect(
      ExpensePostingService.createAndPost(ORG_A, OWNER_A, {
        expenseAccountId: orgBAcc.id,
        paidFromAccountId: cashAccountId,
        vendorName: 'Cross Org Vendor',
        date: '2026-03-08',
        amount: 500,
        description: 'Cross-tenant account tampering attempt',
      })
    ).rejects.toThrow(/EXPENSE_ACCOUNT_INVALID|does not belong to this organization/);

    // Verify no expense was persisted in either organization
    const expCountA = await db.query(`SELECT COUNT(*) FROM expenses WHERE organization_id = $1 AND amount = 500`, [ORG_A]);
    const expCountB = await db.query(`SELECT COUNT(*) FROM expenses WHERE organization_id = $1 AND amount = 500`, [ORG_B]);
    expect(Number(expCountA.rows[0].count)).toBe(0);
    expect(Number(expCountB.rows[0].count)).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 12: Bank reconciliation
  // Verify bank-side payments and receipts appear correctly
  // --------------------------------------------------------------------------
  it('12. Bank reconciliation: bank-side payments and receipts appear and match correctly', async () => {
    // 1. Create a customer payment receipt of ₹10,000 in ORG_A
    const inv = await SalesEngine.createAndPostInvoice(ORG_A, {
      customerId: CUSTOMER_ID,
      issueDate: '2026-03-08',
      dueDate: '2026-03-31',
      lineItems: [{ description: 'Reconciliation Receipt Test', quantity: 1, unitPrice: 10000, taxRate: 0 }],
    });

    const pmt = await SalesEngine.recordCustomerPayment(ORG_A, {
      invoiceId: inv.id,
      amount: 10000,
      paymentDate: '2026-03-08',
      paymentMode: 'Bank Transfer',
      depositAccountId: bankAAccountId,
      reference: 'RECON-CUST-10000',
    });

    // 2. Insert bank statement transaction for incoming credit (₹10,000)
    const stmtCreditTxId = newId('stx-cr');
    await db.query(
      `INSERT INTO bank_statement_transactions (
        id, organization_id, bank_account_id, statement_import_id, transaction_date,
        amount, direction, narration, currency, reconciliation_status, fingerprint
      ) VALUES ($1, $2, $3, 'import-recon-01', '2026-03-08', 10000, 'CREDIT', 'NEFT CR RECON-CUST-10000', 'INR', 'UNMATCHED', $4)`,
      [stmtCreditTxId, ORG_A, bankABankRowId, `fp-${stmtCreditTxId}`]
    );

    // 3. Match customer payment against bank statement credit
    const matchReceipt = await BankReconciliationService.matchTransaction(
      ORG_A,
      stmtCreditTxId,
      'payment_received',
      pmt.id,
      10000,
      100,
      undefined,
      OWNER_A,
      true
    );

    expect(matchReceipt.status).toBe('MATCHED');
    expect(matchReceipt.accountingTransactionType).toBe('payment_received');
    expect(matchReceipt.accountingTransactionId).toBe(pmt.id);
    expect(Number(matchReceipt.matchedAmount)).toBe(10000);

    // Verify statement transaction status updated to MATCHED
    const stmtTxAfter = (await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [stmtCreditTxId])).rows[0];
    expect(stmtTxAfter.reconciliation_status).toBe('MATCHED');

    // 4. Create a vendor payment of ₹7,500
    const bill = await PurchasesEngine.createAndPostBill(ORG_A, {
      vendorId: VENDOR_ID,
      billNumber: `BILL-RECON-${Date.now()}`,
      billDate: '2026-03-01',
      dueDate: '2026-03-31',
      totalAmount: 7500,
      items: [{ description: 'Recon Raw Material', quantity: 1, unitPrice: 7500, amount: 7500, expenseAccountId }],
    });

    const vpmt = await PurchasesEngine.recordVendorPayment(ORG_A, {
      vendorId: VENDOR_ID,
      paymentDate: '2026-03-08',
      amount: 7500,
      paidFromAccountId: bankAAccountId,
      allocations: [{ billId: bill.id, amount: 7500 }],
      reference: 'RECON-VEND-7500',
    });

    // 5. Insert bank statement transaction for outgoing debit (₹7,500)
    const stmtDebitTxId = newId('stx-dr');
    await db.query(
      `INSERT INTO bank_statement_transactions (
        id, organization_id, bank_account_id, statement_import_id, transaction_date,
        amount, direction, narration, currency, reconciliation_status, fingerprint
      ) VALUES ($1, $2, $3, 'import-recon-01', '2026-03-08', 7500, 'DEBIT', 'NEFT DR RECON-VEND-7500', 'INR', 'UNMATCHED', $4)`,
      [stmtDebitTxId, ORG_A, bankABankRowId, `fp-${stmtDebitTxId}`]
    );

    // 6. Match vendor payment against bank statement debit
    const matchPayment = await BankReconciliationService.matchTransaction(
      ORG_A,
      stmtDebitTxId,
      'payment_made',
      vpmt.id,
      7500,
      100,
      undefined,
      OWNER_A,
      true
    );

    expect(matchPayment.status).toBe('MATCHED');
    expect(matchPayment.accountingTransactionType).toBe('payment_made');
    expect(matchPayment.accountingTransactionId).toBe(vpmt.id);
    expect(Number(matchPayment.matchedAmount)).toBe(7500);

    // Verify statement transaction status updated to MATCHED
    const stmtDebitAfter = (await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [stmtDebitTxId])).rows[0];
    expect(stmtDebitAfter.reconciliation_status).toBe('MATCHED');

    // 7. Unmatch and verify status reverts to UNMATCHED
    const unmatchOk = await BankReconciliationService.unmatchTransaction(ORG_A, matchPayment.id, OWNER_A);
    expect(unmatchOk).toBe(true);

    const stmtDebitReverted = (await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [stmtDebitTxId])).rows[0];
    expect(stmtDebitReverted.reconciliation_status).toBe('UNMATCHED');
  });
});
