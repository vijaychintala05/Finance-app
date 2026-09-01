import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { CashFlowStatementService } from '../services/CashFlowStatementService';
import { CustomerStatementService } from '../services/CustomerStatementService';
import { ARAgingReportService } from '../services/ARAgingReportService';
import { APAgingReportService } from '../services/APAgingReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { LedgerQueryService } from '../services/LedgerQueryService';
import { VendorStatementService } from '../services/VendorStatementService';

const request = supertest(app);

describe('Phase 7B — Reporting Services & Cross-Ledger Reconciliation Verification', () => {
  const orgA = `org-report-a-${Date.now()}`;
  const orgB = `org-report-b-${Date.now()}`;
  const ownerA = `usr-owner-a-${Date.now()}`;
  const ownerB = `usr-owner-b-${Date.now()}`;

  let tokenA: string;
  let tokenB: string;
  let authA: { Authorization: string };
  let authB: { Authorization: string };

  let customerIdA: string;
  let vendorIdA: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // Register Org A
    const regA = await request.post('/api/v1/auth/register').send({
      email: `ownerA-${Date.now()}@reporting.com`,
      password: 'Password123!',
      fullName: 'Reporting Owner A',
      organizationName: 'Golden Accounting Corp A',
      country: 'India',
      baseCurrency: 'INR',
      role: 'Owner',
    });
    tokenA = regA.body.token;
    authA = { Authorization: `Bearer ${tokenA}` };

    // Register Org B (For multi-tenant isolation testing)
    const regB = await request.post('/api/v1/auth/register').send({
      email: `ownerB-${Date.now()}@reporting.com`,
      password: 'Password123!',
      fullName: 'Reporting Owner B',
      organizationName: 'Golden Accounting Corp B',
      country: 'India',
      baseCurrency: 'INR',
      role: 'Owner',
    });
    tokenB = regB.body.token;
    authB = { Authorization: `Bearer ${tokenB}` };

    // Fetch actual orgId for A
    const healthA = await request.get('/api/v1/health').set(authA);
    const actualOrgA = healthA.body.organizationId;

    // Create Standard Chart of Accounts for Org A
    const accounts = [
      { code: '1010', name: 'Main Operating Bank', type: 'Asset', subType: 'Bank' },
      { code: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Receivable' },
      { code: '1200', name: 'Input CGST', type: 'Asset', subType: 'Tax' },
      { code: '1500', name: 'Office Computers & Equipment', type: 'Asset', subType: 'Fixed Asset' },
      { code: '2000', name: 'Accounts Payable', type: 'Liability', subType: 'Payable' },
      { code: '2200', name: 'Output CGST', type: 'Liability', subType: 'Tax' },
      { code: '3000', name: 'Owner Capital Equity', type: 'Equity', subType: 'Capital' },
      { code: '4000', name: 'Software Consulting Revenue', type: 'Income', subType: 'Operating Revenue' },
      { code: '5000', name: 'Cloud Server Operating Expense', type: 'Expense', subType: 'Operating Expense' },
      { code: '5100', name: 'Office Rent Expense', type: 'Expense', subType: 'Operating Expense' },
      { code: '5200', name: 'Equipment Depreciation Expense', type: 'Expense', subType: 'Depreciation' },
      { code: '1590', name: 'Accumulated Depreciation', type: 'Asset', subType: 'Fixed Asset' },
    ];

    for (const acc of accounts) {
      await db.query(
        `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account, status)
         VALUES ($1, $2, $3, $4, $5, $6, 0, false, 'Active')
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [`acc-${acc.code}-${actualOrgA}`, actualOrgA, acc.code, acc.name, acc.type, acc.subType]
      );
    }

    // Create Customer & Vendor in Org A
    const custRes = await request.post('/api/v1/customers').set(authA).send({
      displayName: 'Acme Mega Corp',
      email: 'acme@megacorp.com',
      currency: 'INR',
    });
    customerIdA = custRes.body.customer?.id || custRes.body.id;

    const vendorRes = await request.post('/api/v1/vendors').set(authA).send({
      name: 'AWS Cloud Services',
      companyName: 'Amazon Web Services',
      email: 'billing@aws.com',
    });
    vendorIdA = vendorRes.body.vendor?.id || vendorRes.body.id;
  });

  it('1. Verifies Newly Created Services Exist & Handle Empty Datasets Gracefully', async () => {
    const healthA = await request.get('/api/v1/health').set(authA);
    const orgId = healthA.body.organizationId;

    const tb = await TrialBalanceReportService.getTrialBalance(orgId);
    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);

    const bs = await BalanceSheetReportService.getBalanceSheet(orgId);
    expect(bs.isBalanced).toBe(true);
    expect(bs.difference).toBe(0);

    const pnl = await ProfitAndLossReportService.getProfitAndLoss(orgId);
    expect(pnl.netProfit).toBe(0);

    const cf = await CashFlowStatementService.getCashFlowStatement(orgId);
    expect(cf.isReconciled).toBe(true);
    expect(cf.netCashFlow).toBe(0);

    const ar = await ARAgingReportService.getARAgingReport(orgId);
    expect(ar.isReconciled).toBe(true);
    expect(ar.difference).toBe(0);

    const ap = await APAgingReportService.getAPAgingReport(orgId);
    expect(ap.isReconciled).toBe(true);
    expect(ap.difference).toBe(0);
  });

  it('2. Seed Golden Reporting Scenario and Verify Cross-Reconciliations', async () => {
    const healthA = await request.get('/api/v1/health').set(authA);
    const orgId = healthA.body.organizationId;

    // Registration provisions mandatory control accounts, so resolve the actual
    // tenant-owned IDs instead of assuming fixture IDs for conflicting codes.
    const accountRows = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [orgId]);
    const accountId = (code: string) => accountRows.rows.find((row) => row.code === code)?.id;
    const bankAcc = accountId('1010');
    const arAcc = accountId('1100');
    const inputGstAcc = accountId('1200');
    const fixedAssetAcc = accountId('1500');
    const apAcc = accountId('2000');
    const outputGstAcc = accountId('2200');
    const capitalAcc = accountId('3000');
    const revenueAcc = accountId('4000');
    const expAcc = accountId('5000');
    const rentAcc = accountId('5100');
    const deprExpAcc = accountId('5200');
    const accumDeprAcc = accountId('1590');

    // 1. Owner Capital ₹10,00,000
    const je1 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-1', $1, 'JE-1001', '2026-08-01', 'POSTED', 'Owner Capital Introduced') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-1a', 'je-gold-1', $1, 1000000, 0)`, [bankAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-1b', 'je-gold-1', $1, 0, 1000000)`, [capitalAcc]);

    // 2. Customer Invoice: Revenue ₹2,00,000 + Output GST ₹36,000 = Total ₹2,36,000
    const je2 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-2', $1, 'JE-1002', '2026-08-02', 'POSTED', 'Customer Invoice Sales') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-2a', 'je-gold-2', $1, 236000, 0)`, [arAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-2b', 'je-gold-2', $1, 0, 200000)`, [revenueAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-2c', 'je-gold-2', $1, 0, 36000)`, [outputGstAcc]);

    await db.query(
      `INSERT INTO invoices (id, organization_id, customer_id, client_name, invoice_number, issue_date, due_date, status, total_amount, balance_due)
       VALUES ('inv-gold-1', $1, $2, 'Acme Mega Corp', 'INV-1001', '2026-08-02', '2026-08-15', 'SENT', 236000, 136000)`,
      [orgId, customerIdA]
    );

    // 3. Customer Payment ₹1,00,000
    const je3 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-3', $1, 'JE-1003', '2026-08-05', 'POSTED', 'Customer Partial Payment Received') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-3a', 'je-gold-3', $1, 100000, 0)`, [bankAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-3b', 'je-gold-3', $1, 0, 100000)`, [arAcc]);

    await db.query(
      `INSERT INTO payments_received (id, organization_id, client_id, client_name, payment_number, payment_date, amount, payment_mode, deposit_to_account_id)
       VALUES ('pmt-gold-1', $1, $2, 'Acme Mega Corp', 'PAY-1001', '2026-08-05', 100000, 'Bank Transfer', $3)`,
      [orgId, customerIdA, bankAcc]
    );

    // 4. Vendor Bill: Expense ₹80,000 + Input GST ₹14,400 = Total ₹94,400
    const je4 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-4', $1, 'JE-1004', '2026-08-06', 'POSTED', 'Vendor Cloud Bill') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-4a', 'je-gold-4', $1, 80000, 0)`, [expAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-4b', 'je-gold-4', $1, 14400, 0)`, [inputGstAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-4c', 'je-gold-4', $1, 0, 94400)`, [apAcc]);

    await db.query(
      `INSERT INTO bills (id, organization_id, vendor_id, vendor_name, bill_number, bill_date, due_date, status, total_amount, balance_due)
       VALUES ('bill-gold-1', $1, $2, 'AWS Cloud Services', 'BILL-1001', '2026-08-06', '2026-08-20', 'OPEN', 94400, 44400)`,
      [orgId, vendorIdA]
    );

    // 5. Vendor Payment ₹50,000
    const je5 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-5', $1, 'JE-1005', '2026-08-07', 'POSTED', 'Vendor Payment Made') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-5a', 'je-gold-5', $1, 50000, 0)`, [apAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-5b', 'je-gold-5', $1, 0, 50000)`, [bankAcc]);

    // 6. Rent Expense ₹30,000
    const je6 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-6', $1, 'JE-1006', '2026-08-08', 'POSTED', 'Office Rent Payment') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-6a', 'je-gold-6', $1, 30000, 0)`, [rentAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-6b', 'je-gold-6', $1, 0, 30000)`, [bankAcc]);

    // 7. Fixed Asset Purchase ₹1,20,000
    const je7 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-7', $1, 'JE-1007', '2026-08-09', 'POSTED', 'Computer Hardware Asset Purchase') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-7a', 'je-gold-7', $1, 120000, 0)`, [fixedAssetAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-7b', 'je-gold-7', $1, 0, 120000)`, [bankAcc]);

    // 8. Fixed Asset Depreciation ₹3,000
    const je8 = await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-gold-8', $1, 'JE-1008', '2026-08-10', 'POSTED', 'Monthly Computer Depreciation') RETURNING id`,
      [orgId]
    );
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-8a', 'je-gold-8', $1, 3000, 0)`, [deprExpAcc]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit) VALUES ('jl-8b', 'je-gold-8', $1, 0, 3000)`, [accumDeprAcc]);

    // RUN CROSS-RECONCILIATIONS
    // A. Trial Balance Balance Check
    const tb = await TrialBalanceReportService.getTrialBalance(orgId);
    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebits).toEqual(tb.totalCredits);
    expect(tb.difference).toBe(0);

    // B. P&L Net Profit Check
    // Revenue = 2,00,000. Expenses = 80,000 + 30,000 + 3,000 = 1,13,000. Net Profit = 87,000
    const pnl = await ProfitAndLossReportService.getProfitAndLoss(orgId);
    expect(pnl.totalRevenue).toBe(200000);
    expect(pnl.totalExpenses).toBe(113000);
    expect(pnl.netProfit).toBe(87000);

    // C. Balance Sheet & P&L Reconciled Assertion
    const bs = await BalanceSheetReportService.getBalanceSheet(orgId);
    expect(bs.isBalanced).toBe(true);
    expect(bs.currentYearEarnings).toBe(pnl.netProfit);
    expect(bs.difference).toBe(0);

    // D. Cash Flow Closing Cash Reconciled to Bank GL
    const cf = await CashFlowStatementService.getCashFlowStatement(orgId);
    expect(cf.isReconciled).toBe(true);
    expect(cf.difference).toBe(0);

    // Bank GL Net = 10,00,000 + 1,00,000 - 50,000 - 30,000 - 1,20,000 = 9,00,000
    const bankGl = await LedgerQueryService.getAccountBalances(orgId);
    const bankAccBal = bankGl.find((a: any) => a.code === '1010');
    expect(bankAccBal?.netBalance).toBe(900000);
    expect(cf.closingCashBalance).toBe(bankAccBal?.netBalance);

    // E. AR Aging Cross-Reconciliation
    const arReport = await ARAgingReportService.getARAgingReport(orgId);
    expect(arReport.totalAgingAmount).toBe(136000);
    expect(arReport.totalGLControlAmount).toBe(136000);
    expect(arReport.difference).toBe(0);
    expect(arReport.isReconciled).toBe(true);

    // F. AP Aging Cross-Reconciliation
    const apReport = await APAgingReportService.getAPAgingReport(orgId);
    expect(apReport.totalAgingAmount).toBe(44400);
    expect(apReport.totalGLControlAmount).toBe(44400);
    expect(apReport.difference).toBe(0);
    expect(apReport.isReconciled).toBe(true);
  });

  it('3. Customer Statement Test Scenario: Invoice + Payments + Credit Note = Zero Balance', async () => {
    const healthA = await request.get('/api/v1/health').set(authA);
    const orgId = healthA.body.organizationId;

    const testCustRes = await request.post('/api/v1/customers').set(authA).send({
      displayName: 'Statement Test Client',
      email: 'statement@testclient.com',
    });
    const cId = testCustRes.body.customer?.id || testCustRes.body.id;

    const fromDate = '2026-08-01';
    const toDate = '2026-08-31';

    // Invoice ₹1,18,000
    await db.query(
      `INSERT INTO invoices (id, organization_id, customer_id, client_name, invoice_number, issue_date, due_date, status, total_amount, balance_due)
       VALUES ('inv-stmt-1', $1, $2, 'Statement Test Client', 'INV-STMT-1', '2026-08-02', '2026-08-15', 'SENT', 118000, 0)`,
      [orgId, cId]
    );

    // Payment ₹50,000
    await db.query(
      `INSERT INTO payments_received (id, organization_id, client_id, client_name, payment_number, payment_date, amount, payment_mode, deposit_to_account_id)
       VALUES ('pmt-stmt-1', $1, $2, 'Statement Test Client', 'PAY-STMT-1', '2026-08-05', 50000, 'Bank Transfer', 'acc-1010')`,
      [orgId, cId]
    );

    // Payment 2 (Credit Note / Payment) ₹18,000
    await db.query(
      `INSERT INTO payments_received (id, organization_id, client_id, client_name, payment_number, payment_date, amount, payment_mode, deposit_to_account_id)
       VALUES ('pmt-stmt-2', $1, $2, 'Statement Test Client', 'PAY-STMT-2', '2026-08-10', 18000, 'Bank Transfer', 'acc-1010')`,
      [orgId, cId]
    );

    // Final Payment ₹50,000
    await db.query(
      `INSERT INTO payments_received (id, organization_id, client_id, client_name, payment_number, payment_date, amount, payment_mode, deposit_to_account_id)
       VALUES ('pmt-stmt-3', $1, $2, 'Statement Test Client', 'PAY-STMT-3', '2026-08-15', 50000, 'Bank Transfer', 'acc-1010')`,
      [orgId, cId]
    );

    const stmt = await CustomerStatementService.getCustomerStatement(orgId, cId, fromDate, toDate);
    expect(stmt.totalInvoices).toBe(118000);
    expect(stmt.totalPayments).toBe(118000);
    expect(stmt.closingBalance).toBe(0);
  });

  it('4. Report API Endpoints Direct Smoke Test (200 OK & Proper Payload)', async () => {
    const healthA = await request.get('/api/v1/health').set(authA);
    const orgId = healthA.body.organizationId;

    const ep1 = await request.get('/api/v1/finance/reports/general-ledger').set(authA);
    expect(ep1.status).toBe(200);
    expect(ep1.body.accounts).toBeDefined();

    const ep2 = await request.get('/api/v1/finance/reports/trial-balance').set(authA);
    expect(ep2.status).toBe(200);
    expect(ep2.body.isBalanced).toBe(true);

    const ep3 = await request.get('/api/v1/finance/reports/profit-loss').set(authA);
    expect(ep3.status).toBe(200);
    expect(ep3.body.netProfit).toBeDefined();

    const ep4 = await request.get('/api/v1/finance/reports/balance-sheet').set(authA);
    expect(ep4.status).toBe(200);
    expect(ep4.body.isBalanced).toBe(true);

    const ep5 = await request.get('/api/v1/finance/reports/cash-flow').set(authA);
    expect(ep5.status).toBe(503);
    expect(ep5.body.feature).toBe('cash-flow-classification');

    const ep6 = await request.get('/api/v1/finance/reports/ar-aging').set(authA);
    expect(ep6.status).toBe(200);
    expect(ep6.body.isReconciled).toBe(true);

    const ep7 = await request.get('/api/v1/finance/reports/ap-aging').set(authA);
    expect(ep7.status).toBe(200);
    expect(ep7.body.isReconciled).toBe(true);

    const ep8 = await request.get(`/api/v1/finance/reports/customer-statement/${customerIdA}?fromDate=2026-08-01&toDate=2026-08-31`).set(authA);
    expect(ep8.status).toBe(200);
    expect(ep8.body.customerId).toBe(customerIdA);
    expect(Array.isArray(ep8.body.transactions)).toBe(true);

    const ep9 = await request.get(`/api/v1/finance/reports/vendor-statement/${vendorIdA}?fromDate=2026-08-01&toDate=2026-08-31`).set(authA);
    expect(ep9.status).toBe(200);
    expect(ep9.body.vendorId).toBe(vendorIdA);
    expect(Array.isArray(ep9.body.transactions)).toBe(true);
  });

  it('5. Multi-Tenant Isolation Enforced Across All Financial Reports', async () => {
    // Org B calling Org A's reports should return Org B's isolated empty dataset or 403
    const epTB = await request.get('/api/v1/finance/reports/trial-balance').set(authB);
    expect(epTB.status).toBe(200);
    expect(epTB.body.rows.every((row: any) => row.debit === 0 && row.credit === 0)).toBe(true);

    const epBS = await request.get('/api/v1/finance/reports/balance-sheet').set(authB);
    expect(epBS.status).toBe(200);
    expect(epBS.body.totalAssets).toBe(0);
    expect(epBS.body.totalLiabilities).toBe(0);

    const epAR = await request.get('/api/v1/finance/reports/ar-aging').set(authB);
    expect(epAR.status).toBe(200);
    expect(epAR.body.totalAgingAmount).toBe(0);
  });

  it('6. Reports exclude draft and out-of-period journal lines instead of leaking them through outer joins', async () => {
    const healthA = await request.get('/api/v1/health').set(authA);
    const orgId = healthA.body.organizationId;
    const accounts = await db.query('SELECT id, code FROM accounts WHERE organization_id = $1', [orgId]);
    const bankId = accounts.rows.find((row) => row.code === '1010')?.id;
    const capitalId = accounts.rows.find((row) => row.code === '3000')?.id;

    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
       VALUES ('je-report-draft', $1, 'JE-DRAFT-REPORT', '2026-08-15', 'DRAFT', 'Must not be reported')`,
      [orgId]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit)
       VALUES ('jl-report-draft-a', 'je-report-draft', $1, 777777, 0),
              ('jl-report-draft-b', 'je-report-draft', $2, 0, 777777)`,
      [bankId, capitalId]
    );

    const asOf = '2026-08-10';
    const trialBalance = await TrialBalanceReportService.getTrialBalance(orgId, { toDate: asOf });
    const balanceSheet = await BalanceSheetReportService.getBalanceSheet(orgId, { toDate: asOf });
    const balances = await LedgerQueryService.getAccountBalances(orgId, { toDate: asOf });

    expect(trialBalance.rows.find((row) => row.accountCode === '1010')?.debit).toBe(900000);
    expect(balanceSheet.assets.accounts.find((row: any) => row.accountCode === '1010')?.balance).toBe(900000);
    expect(balances.find((row: any) => row.code === '1010')?.netBalance).toBe(900000);
  });
});
