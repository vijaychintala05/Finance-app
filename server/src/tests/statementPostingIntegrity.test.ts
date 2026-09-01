import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { JwtAuth } from '../auth/jwt';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { CustomerStatementService } from '../services/CustomerStatementService';
import { VendorStatementService } from '../services/VendorStatementService';
import financeRoutes from '../routes/finance.routes';
import { authMiddleware, organizationIsolationMiddleware } from '../middleware/organizationIsolation.middleware';

describe('T5b: Customer & Vendor Statement Posting State Integrity Tests', () => {
  let app: Express;
  let orgId: string;
  let accountantUserId: string;
  let accountantToken: string;

  const testCustomer = {
    id: 'cust-stmt-test-1',
    name: 'Statement Test Customer Ltd',
  };

  const testVendor = {
    id: 'vend-stmt-test-1',
    name: 'Statement Test Vendor Ltd',
  };

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });

    orgId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
    accountantUserId = newId('usr-acct-stmt');

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'acct.stmt@example.com', 'hash', 'Statement Tester', 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [accountantUserId]
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, 'Accountant', 'Active', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [newId('mem'), orgId, accountantUserId]
    );

    // Create test customer & vendor in DB
    await db.query(
      `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, phone, currency, payment_terms, receivables_balance, active)
       VALUES ($1, $2, $1, $3, $3, 'stmt@cust.com', '+91 90000 00001', 'INR', 'Net 30', 0, true)
       ON CONFLICT (id) DO NOTHING`,
      [testCustomer.id, orgId, testCustomer.name]
    );

    await db.query(
      `INSERT INTO vendors (id, organization_id, vendor_id, name, company_name, email, phone, currency, payment_terms, payables_balance, active)
       VALUES ($1, $2, $1, $3, $3, 'stmt@vend.com', '+91 90000 00002', 'INR', 'Net 30', 0, true)
       ON CONFLICT (id) DO NOTHING`,
      [testVendor.id, orgId, testVendor.name]
    );

    accountantToken = JwtAuth.generateToken({
      userId: accountantUserId,
      email: 'acct.stmt@example.com',
    });

    app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(organizationIsolationMiddleware);
    app.use('/api/v1/finance', financeRoutes);
  });

  // ---------------------------------------------------------------------------
  // 1. CUSTOMER STATEMENT: EXCLUSION OF SUBMITTED, DRAFT, VOID, REVERSED
  // ---------------------------------------------------------------------------
  it('1. Customer Statement: only POSTED documents affect opening balance and statement lines', async () => {
    // A. Prior period transactions (< 2026-05-01)
    // 1. Posted invoice prior to May -> Affects opening balance (+10,000)
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-PRIOR-POSTED', $3, $3, $4, '2026-04-15', '2026-05-15', 10000, 0, 10000, 10000, 'POSTED')`,
      [newId('inv'), orgId, testCustomer.id, testCustomer.name]
    );

    // 2. Submitted draft invoice prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-PRIOR-SUBMITTED', $3, $3, $4, '2026-04-16', '2026-05-16', 50000, 0, 50000, 50000, 'SUBMITTED')`,
      [newId('inv'), orgId, testCustomer.id, testCustomer.name]
    );

    // 3. Voided invoice prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-PRIOR-VOID', $3, $3, $4, '2026-04-17', '2026-05-17', 25000, 0, 25000, 25000, 'VOID')`,
      [newId('inv'), orgId, testCustomer.id, testCustomer.name]
    );

    // 4. Posted payment received prior to May -> Affects opening balance (-3,000)
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status)
       VALUES ($1, $2, 'PMT-PRIOR-POSTED', $3, $4, '2026-04-20', 3000, 'Bank Transfer', 'acc-bank-1', 'ALLOCATED')`,
      [newId('pmt'), orgId, testCustomer.id, testCustomer.name]
    );

    // 5. Submitted payment received prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status)
       VALUES ($1, $2, 'PMT-PRIOR-SUBMITTED', $3, $4, '2026-04-21', 4000, 'Bank Transfer', 'acc-bank-1', 'SUBMITTED')`,
      [newId('pmt'), orgId, testCustomer.id, testCustomer.name]
    );

    // 6. Reversed payment received prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status)
       VALUES ($1, $2, 'PMT-PRIOR-REVERSED', $3, $4, '2026-04-22', 2000, 'Bank Transfer', 'acc-bank-1', 'REVERSED')`,
      [newId('pmt'), orgId, testCustomer.id, testCustomer.name]
    );

    // B. In-period transactions (2026-05-01 to 2026-05-31)
    // 7. Posted invoice in May -> In-period Debit (+20,000)
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-MAY-POSTED', $3, $3, $4, '2026-05-10', '2026-06-10', 20000, 0, 20000, 20000, 'POSTED')`,
      [newId('inv'), orgId, testCustomer.id, testCustomer.name]
    );

    // 8. Submitted invoice in May -> Must NOT appear in statement
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-MAY-SUBMITTED', $3, $3, $4, '2026-05-12', '2026-06-12', 99000, 0, 99000, 99000, 'SUBMITTED')`,
      [newId('inv'), orgId, testCustomer.id, testCustomer.name]
    );

    // 9. Voided invoice in May -> Must NOT appear in statement
    await db.query(
      `INSERT INTO invoices (id, organization_id, invoice_number, customer_id, client_id, client_name, issue_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'INV-MAY-VOID', $3, $3, $4, '2026-05-13', '2026-06-13', 45000, 0, 45000, 45000, 'VOIDED')`,
      [newId('inv'), orgId, testCustomer.id, testCustomer.name]
    );

    // 10. Posted payment in May -> In-period Credit (-8,000)
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status)
       VALUES ($1, $2, 'PMT-MAY-POSTED', $3, $4, '2026-05-15', 8000, 'Bank Transfer', 'acc-bank-1', 'ALLOCATED')`,
      [newId('pmt'), orgId, testCustomer.id, testCustomer.name]
    );

    // 11. Submitted payment in May -> Must NOT appear in statement
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status)
       VALUES ($1, $2, 'PMT-MAY-SUBMITTED', $3, $4, '2026-05-16', 7000, 'Bank Transfer', 'acc-bank-1', 'SUBMITTED')`,
      [newId('pmt'), orgId, testCustomer.id, testCustomer.name]
    );

    // 12. Reversed payment in May -> Must NOT appear in statement
    await db.query(
      `INSERT INTO payments_received (id, organization_id, payment_number, client_id, client_name, payment_date, amount, payment_mode, deposit_to_account_id, status)
       VALUES ($1, $2, 'PMT-MAY-REVERSED', $3, $4, '2026-05-17', 5000, 'Bank Transfer', 'acc-bank-1', 'REVERSED')`,
      [newId('pmt'), orgId, testCustomer.id, testCustomer.name]
    );

    // C. Execute Customer Statement calculation
    const statement = await CustomerStatementService.getCustomerStatement(
      orgId,
      testCustomer.id,
      '2026-05-01',
      '2026-05-31'
    );

    // Opening balance: 10,000 (posted inv) - 3,000 (posted pmt) = 7,000
    expect(statement.openingBalance).toBe(7000);

    // In-period movements: exactly 1 posted invoice (20,000) and 1 posted payment (8,000)
    expect(statement.totalInvoices).toBe(20000);
    expect(statement.totalPayments).toBe(8000);
    expect(statement.totalCredits).toBe(0);

    // Closing balance: 7,000 (opening) + 20,000 (debit) - 8,000 (credit) = 19,000
    expect(statement.closingBalance).toBe(19000);

    // Exactly 2 transactions in May statement
    expect(statement.transactions.length).toBe(2);
    expect(statement.transactions[0].reference).toBe('INV-MAY-POSTED');
    expect(statement.transactions[0].debit).toBe(20000);
    expect(statement.transactions[0].runningBalance).toBe(27000);

    expect(statement.transactions[1].reference).toBe('PMT-MAY-POSTED');
    expect(statement.transactions[1].credit).toBe(8000);
    expect(statement.transactions[1].runningBalance).toBe(19000);
  });

  // ---------------------------------------------------------------------------
  // 2. VENDOR STATEMENT: EXCLUSION OF SUBMITTED, DRAFT, VOID, REVERSED
  // ---------------------------------------------------------------------------
  it('2. Vendor Statement: only POSTED documents affect opening balance and statement lines', async () => {
    // A. Prior period transactions (< 2026-05-01)
    // 1. Posted bill prior to May -> Affects opening balance (+15,000)
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'BILL-PRIOR-POSTED', $3, $4, '2026-04-10', '2026-05-10', 15000, 0, 15000, 15000, 'POSTED')`,
      [newId('bil'), orgId, testVendor.id, testVendor.name]
    );

    // 2. Submitted bill prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'BILL-PRIOR-SUBMITTED', $3, $4, '2026-04-11', '2026-05-11', 80000, 0, 80000, 80000, 'SUBMITTED')`,
      [newId('bil'), orgId, testVendor.id, testVendor.name]
    );

    // 3. Voided bill prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'BILL-PRIOR-VOID', $3, $4, '2026-04-12', '2026-05-12', 30000, 0, 30000, 30000, 'VOID')`,
      [newId('bil'), orgId, testVendor.id, testVendor.name]
    );

    // 4. Posted vendor payment prior to May -> Affects opening balance (-5,000)
    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, status)
       VALUES ($1, $2, 'VPMT-PRIOR-POSTED', $3, $4, '2026-04-15', 5000, 'Bank Transfer', 'acc-bank-1', 'ALLOCATED')`,
      [newId('vpmt'), orgId, testVendor.id, testVendor.name]
    );

    // 5. Submitted vendor payment prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, status)
       VALUES ($1, $2, 'VPMT-PRIOR-SUBMITTED', $3, $4, '2026-04-16', 6000, 'Bank Transfer', 'acc-bank-1', 'SUBMITTED')`,
      [newId('vpmt'), orgId, testVendor.id, testVendor.name]
    );

    // 6. Reversed vendor payment prior to May -> Must NOT affect opening balance
    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, status)
       VALUES ($1, $2, 'VPMT-PRIOR-REVERSED', $3, $4, '2026-04-17', 4000, 'Bank Transfer', 'acc-bank-1', 'REVERSED')`,
      [newId('vpmt'), orgId, testVendor.id, testVendor.name]
    );

    // B. In-period transactions (2026-05-01 to 2026-05-31)
    // 7. Posted bill in May -> In-period Bill (+25,000)
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'BILL-MAY-POSTED', $3, $4, '2026-05-10', '2026-06-10', 25000, 0, 25000, 25000, 'POSTED')`,
      [newId('bil'), orgId, testVendor.id, testVendor.name]
    );

    // 8. Submitted bill in May -> Must NOT appear in statement
    await db.query(
      `INSERT INTO bills (id, organization_id, bill_number, vendor_id, vendor_name, bill_date, due_date, subtotal, tax_total, total_amount, balance_due, status)
       VALUES ($1, $2, 'BILL-MAY-SUBMITTED', $3, $4, '2026-05-12', '2026-06-12', 70000, 0, 70000, 70000, 'SUBMITTED')`,
      [newId('bil'), orgId, testVendor.id, testVendor.name]
    );

    // 9. Posted payment in May -> In-period Payment (-10,000)
    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, status)
       VALUES ($1, $2, 'VPMT-MAY-POSTED', $3, $4, '2026-05-18', 10000, 'Bank Transfer', 'acc-bank-1', 'ALLOCATED')`,
      [newId('vpmt'), orgId, testVendor.id, testVendor.name]
    );

    // 10. Submitted payment in May -> Must NOT appear in statement
    await db.query(
      `INSERT INTO payments_made (id, organization_id, payment_number, vendor_id, vendor_name, payment_date, amount, payment_mode, paid_from_account_id, status)
       VALUES ($1, $2, 'VPMT-MAY-SUBMITTED', $3, $4, '2026-05-19', 15000, 'Bank Transfer', 'acc-bank-1', 'SUBMITTED')`,
      [newId('vpmt'), orgId, testVendor.id, testVendor.name]
    );

    // C. Execute Vendor Statement calculation
    const statement = await VendorStatementService.getVendorStatement(
      orgId,
      testVendor.id,
      '2026-05-01',
      '2026-05-31'
    );

    // Opening balance: 15,000 (posted bill) - 5,000 (posted pmt) = 10,000
    expect(statement.openingBalance).toBe(10000);

    // In-period movements: exactly 1 posted bill (25,000) and 1 posted payment (10,000)
    expect(statement.totalBills).toBe(25000);
    expect(statement.totalPayments).toBe(10000);
    expect(statement.totalDebits).toBe(0);

    // Closing balance: 10,000 (opening) + 25,000 (bill) - 10,000 (payment) = 25,000
    expect(statement.closingBalance).toBe(25000);

    // Exactly 2 transactions in May statement
    expect(statement.transactions.length).toBe(2);
    expect(statement.transactions[0].reference).toBe('BILL-MAY-POSTED');
    expect(statement.transactions[0].credit).toBe(25000);
    expect(statement.transactions[0].runningBalance).toBe(35000);

    expect(statement.transactions[1].reference).toBe('VPMT-MAY-POSTED');
    expect(statement.transactions[1].debit).toBe(10000);
    expect(statement.transactions[1].runningBalance).toBe(25000);
  });

  // ---------------------------------------------------------------------------
  // 3. HTTP ENDPOINT REPORT ACCESS & PARITY
  // ---------------------------------------------------------------------------
  it('3. HTTP API: returns authoritative date-filtered customer and vendor statements', async () => {
    // Customer Statement via HTTP
    const custRes = await request(app)
      .get(`/api/v1/finance/reports/customer-statement/${testCustomer.id}?fromDate=2026-05-01&toDate=2026-05-31`)
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(custRes.status).toBe(200);
    expect(custRes.body.customerId).toBe(testCustomer.id);
    expect(custRes.body.openingBalance).toBe(7000);
    expect(custRes.body.totalInvoices).toBe(20000);
    expect(custRes.body.totalPayments).toBe(8000);
    expect(custRes.body.closingBalance).toBe(19000);
    expect(custRes.body.transactions.length).toBe(2);

    // Vendor Statement via HTTP
    const vendRes = await request(app)
      .get(`/api/v1/finance/reports/vendor-statement/${testVendor.id}?fromDate=2026-05-01&toDate=2026-05-31`)
      .set('Authorization', `Bearer ${accountantToken}`);

    expect(vendRes.status).toBe(200);
    expect(vendRes.body.vendorId).toBe(testVendor.id);
    expect(vendRes.body.openingBalance).toBe(10000);
    expect(vendRes.body.totalBills).toBe(25000);
    expect(vendRes.body.totalPayments).toBe(10000);
    expect(vendRes.body.closingBalance).toBe(25000);
    expect(vendRes.body.transactions.length).toBe(2);
  });
});
