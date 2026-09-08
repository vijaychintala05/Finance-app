import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { TrialBalanceReportService } from '../services/TrialBalanceReportService';
import { ProfitAndLossReportService } from '../services/ProfitAndLossReportService';
import { BalanceSheetReportService } from '../services/BalanceSheetReportService';
import { AccountantSignOffAuditService } from '../services/AccountantSignOffAuditService';

describe('Stage 8: Realistic End-to-End Monthly Pilot Accounting Lifecycle', () => {
  const ORG_PILOT = `org_pilot_${Date.now()}`;
  const USER_PILOT = `usr_pilot_${Date.now()}`;
  let bankAccountId: string;
  let bankFeedAccountId: string;
  let equityAccountId: string;
  let customerId: string;
  let invoiceId: string;
  let vendorId: string;
  let billId: string;

  beforeAll(async () => {
    await MigrationRunner.runMigrations();

    // 1. Provision User & Organization
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4, 'Active') ON CONFLICT DO NOTHING`,
      [USER_PILOT, `pilot_cfo_${Date.now()}@apexcloud.io`, 'hashed_secret', 'Pilot Program Controller']
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [ORG_PILOT, `uuid_${ORG_PILOT}`, `pub_${ORG_PILOT}`, 'PILOT', 'Apex Cloud Solutions Inc', 'US', 'USD', '$', USER_PILOT]
    );

    await OrganizationProvisioningService.provisionDefaultChart(db, ORG_PILOT);

    const bankAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000'`, [ORG_PILOT]);
    const equityAcc = await db.query(`SELECT id FROM accounts WHERE organization_id = $1 AND code = '3000'`, [ORG_PILOT]);
    bankAccountId = bankAcc.rows[0].id;
    equityAccountId = equityAcc.rows[0].id;

    bankFeedAccountId = `bank_acc_${Date.now()}`;
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, status, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [bankFeedAccountId, ORG_PILOT, bankAccountId, 'Primary Corporate Checking', '1122334455', '•••• 4455', 'Silicon Valley Bank', 'Checking', 'USD', 50000, 'Active', true]
    );
  }, 30000);

  it('Step 1: Onboards organization and migrates initial opening balances', async () => {
    // Post initial opening capital: $50,000 cash in operating bank, $50,000 equity
    const openJournal = await ServerPostingEngine.postEntry({
      organizationId: ORG_PILOT,
      entryNumber: 'OPEN-2026-001',
      date: '2026-01-01',
      description: 'Pilot Launch Opening Capital Injection',
      reference: 'CAP-SEED',
      lines: [
        { accountId: bankAccountId, debit: 50000.0, credit: 0.0, description: 'Seed Cash Balance' },
        { accountId: equityAccountId, debit: 0.0, credit: 50000.0, description: 'Founders Equity' },
      ],
    });

    expect(openJournal.entryId).toBeDefined();

    const tb = await TrialBalanceReportService.getTrialBalance(ORG_PILOT);
    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);
    expect(tb.totalClosingDebit).toBe(50000);
  });

  it('Step 2: Executes full Order-to-Cash cycle (Invoice -> Payment Allocation)', async () => {
    // 1. Create client / customer
    const custRes = await db.query(
      `INSERT INTO customers (id, organization_id, display_name, email, currency)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [`cust_pilot_${Date.now()}`, ORG_PILOT, 'Acme Global Holdings', 'billing@acmeglobal.com', 'USD']
    );
    customerId = custRes.rows[0].id;

    // 2. Create and post invoice for Cloud Architecture Consulting ($10,000 + 10% tax = $11,000)
    const inv = await SalesEngine.createAndPostInvoice(
      ORG_PILOT,
      {
        customerId,
        clientName: 'Acme Global Holdings',
        issueDate: '2026-01-10',
        dueDate: '2026-01-31',
        status: 'POSTED',
        lineItems: [
          { description: 'Cloud Architecture & Security Retainer', quantity: 1, unitPrice: 10000.0, taxRate: 10 },
        ],
      },
      USER_PILOT
    );

    invoiceId = inv.id;
    expect(Number(inv.totalAmount)).toBe(11000);
    expect(Number(inv.balanceDue)).toBe(11000);

    // 3. Receive full payment of $11,000 into Operating Bank Account
    const pmt = await SalesEngine.recordPayment(ORG_PILOT, {
      customerId,
      customerName: 'Acme Global Holdings',
      paymentDate: '2026-01-20',
      amount: 11000.0,
      paymentMode: 'Bank Transfer',
      depositToAccountId: bankAccountId,
      reference: 'WIRE-ACME-8891',
      allocations: [{ invoiceId, amount: 11000.0 }],
    });

    expect(pmt).toBeDefined();

    // Verify invoice is fully paid with zero remaining balance
    const updatedInv = await db.query(`SELECT balance_due, paid_amount, status FROM invoices WHERE id = $1`, [invoiceId]);
    expect(Number(updatedInv.rows[0].balance_due)).toBe(0);
    expect(Number(updatedInv.rows[0].paid_amount)).toBe(11000);
    expect(updatedInv.rows[0].status).toBe('PAID');
  });

  it('Step 3: Executes full Procure-to-Pay cycle (Vendor Bill -> Payment)', async () => {
    // 1. Create vendor
    const vendor = await PurchasesEngine.createVendor(ORG_PILOT, {
      name: 'Datacenter Infrastructure Hosting Inc',
      email: 'finance@datacenter.net',
      currency: 'USD',
    });
    vendorId = vendor.id;

    // 2. Create and post bill for $3,000 hosting services
    const bill = await PurchasesEngine.createAndPostBill(
      ORG_PILOT,
      {
        vendorId,
        vendorName: 'Datacenter Infrastructure Hosting Inc',
        billDate: '2026-01-12',
        dueDate: '2026-01-28',
        status: 'POSTED',
        lineItems: [
          { description: 'Dedicated Kubernetes Cluster Hosting', quantity: 1, unitPrice: 3000.0, taxRate: 0 },
        ],
      },
      USER_PILOT
    );

    billId = bill.id;
    expect(Number(bill.totalAmount)).toBe(3000);

    // 3. Settle vendor bill from operating bank account
    const billPmt = await PurchasesEngine.recordVendorPayment(
      ORG_PILOT,
      {
        vendorId,
        paymentDate: '2026-01-25',
        amount: 3000.0,
        paymentMode: 'Electronic Transfer',
        paidFromAccountId: bankAccountId,
        reference: 'VEND-PAY-001',
        allocations: [{ billId, amount: 3000.0 }],
      },
      USER_PILOT
    );

    expect(billPmt).toBeDefined();

    // Verify bill is settled
    const updatedBill = await db.query(`SELECT balance_due, status FROM bills WHERE id = $1`, [billId]);
    expect(Number(updatedBill.rows[0].balance_due)).toBe(0);
    expect(updatedBill.rows[0].status).toBe('PAID');
  });

  it('Step 4: Conducts monthly bank statement import and reconciliation', async () => {
    // Import bank statement reflecting:
    // 1. Customer receipt +$11,000
    // 2. Vendor disbursement -$3,000
    const csvContent = `Date,Description,Reference,Withdrawal,Deposit,Balance\n` +
      `2026-01-20,Acme Global Payment,WIRE-ACME-8891,0,11000,61000\n` +
      `2026-01-25,Datacenter Infrastructure,VEND-PAY-001,3000,0,58000\n`;

    const importRes = await BankReconciliationService.importStatement(
      ORG_PILOT,
      bankFeedAccountId,
      'bank_statement_jan_2026.csv',
      csvContent,
      'CSV',
      { currency: 'USD' } as any
    );

    expect(importRes.newTransactionsCount).toBe(2);

    const statementTxs = await BankReconciliationService.getTransactions(ORG_PILOT, {
      bankAccountId: bankFeedAccountId,
    });
    expect(statementTxs.length).toBeGreaterThanOrEqual(2);

    // Verify statement balances match general ledger
    const glRes = await db.query(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as bank_gl_balance
       FROM journal_lines jl
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE je.organization_id = $1 AND jl.account_id = $2 AND UPPER(je.status) = 'POSTED'`,
      [ORG_PILOT, bankAccountId]
    );
    const glBalance = Number(glRes.rows[0].bank_gl_balance);

    // Initial $50,000 + $11,000 receipt - $3,000 disbursement = $58,000
    // Match statement transactions with recorded payments
    const txDeposit = statementTxs.find((t) => t.direction === 'CREDIT');
    const txWithdrawal = statementTxs.find((t) => t.direction === 'DEBIT');

    expect(txDeposit).toBeDefined();
    expect(txWithdrawal).toBeDefined();

    const pmtRec = await db.query(`SELECT id FROM payments_received WHERE organization_id = $1 LIMIT 1`, [ORG_PILOT]);
    const pmtMade = await db.query(`SELECT id FROM payments_made WHERE organization_id = $1 LIMIT 1`, [ORG_PILOT]);

    if (txDeposit && pmtRec.rows[0]) {
      await BankReconciliationService.matchTransaction(
        ORG_PILOT,
        txDeposit.id,
        'payment_received',
        pmtRec.rows[0].id,
        11000
      );
    }

    if (txWithdrawal && pmtMade.rows[0]) {
      await BankReconciliationService.matchTransaction(
        ORG_PILOT,
        txWithdrawal.id,
        'payment_made',
        pmtMade.rows[0].id,
        3000
      );
    }

    const summary = await BankReconciliationService.getReconciliationSummary(
      ORG_PILOT,
      bankFeedAccountId,
      '2026-01-31',
      58000,
      glBalance
    );

    expect(summary.difference).toBe(0);
    expect(summary.status).toBe('BALANCED');

    const session = await BankReconciliationService.completeReconciliationSession(
      ORG_PILOT,
      bankFeedAccountId,
      '2026-01-31',
      58000,
      glBalance,
      USER_PILOT
    );
    expect(session.status).toBe('COMPLETED');
  });

  it('Step 5: Enforces period locking and blocks retroactive edits', async () => {
    // Lock the period ending 2026-01-31
    await db.query(
      `INSERT INTO period_locks (id, organization_id, period_name, is_locked, lock_date, status, locked_by, reason)
       VALUES ($1, $2, '2026-01', TRUE, '2026-01-31', 'Active', $3, 'Monthly Close 2026-01')`,
      [`pl_pilot_${Date.now()}`, ORG_PILOT, USER_PILOT]
    );

    // Attempting to post a new backdated invoice on 2026-01-15 MUST throw period lock exception
    await expect(
      SalesEngine.createAndPostInvoice(
        ORG_PILOT,
        {
          customerId,
          clientName: 'Acme Global Holdings',
          issueDate: '2026-01-15',
          dueDate: '2026-01-31',
          lineItems: [{ description: 'Illegal Backdated Line', quantity: 1, unitPrice: 500, taxRate: 0 }],
        },
        USER_PILOT
      )
    ).rejects.toThrow(/falls within a locked accounting period/);
  });

  it('Step 6: Generates certified financial statements and secures Accountant Sign-Off', async () => {
    // 1. Trial Balance Check
    const tb = await TrialBalanceReportService.getTrialBalance(ORG_PILOT, { toDate: '2026-01-31' });
    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);

    // 2. Profit & Loss Check ($10,000 revenue - $3,000 expense = $7,000 net income)
    const pl = await ProfitAndLossReportService.getProfitAndLoss(ORG_PILOT, {
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    });
    expect(pl.totalRevenue).toBe(10000);
    expect(pl.totalExpenses).toBe(3000);
    expect(pl.netProfit).toBe(7000);

    // 3. Balance Sheet Check
    const bs = await BalanceSheetReportService.getBalanceSheet(ORG_PILOT, { asOfDate: '2026-01-31' });
    expect(bs.totalAssets).toBe(58000); // $58,000 cash in bank

    // 4. Formal Accountant Sign-Off Audit
    const auditReport = await AccountantSignOffAuditService.conductSignOffAudit(
      ORG_PILOT,
      'Arthur Pendelton, Lead CPA'
    );

    expect(auditReport.isQualified).toBe(true);
    expect(auditReport.status).toBe('QUALIFIED');
    expect(auditReport.failedAssertionsCount).toBe(0);
    expect(auditReport.financialSummary.imbalance).toBe(0);
  });
});
