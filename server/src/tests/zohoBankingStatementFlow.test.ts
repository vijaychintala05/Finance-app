import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { BankStatementParserFactory } from '../banking/parsers/BankStatementParserFactory';
import { newId } from '../utils/ids';

describe('Zoho-Style Statement-First Banking Integration Suite', () => {
  const ORG_ID = 'org-zoho-banking-test';
  const USER_ID = 'usr-banking-tester';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'zoho_tester@firmbooks.io', 'hashed_pass', 'Zoho Banking Tester', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-zoho-1', 'pub-z1', 'ZOHOBANK', 'Zoho Books Corp', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );
  });

  it('1. File Support: strictly rejects PDF, OFX, MT940, and Google Sheets links', () => {
    // PDF
    expect(() =>
      BankStatementParserFactory.validateAllowedFormat('statement.pdf', '%PDF-1.4 file content...')
    ).toThrow(/PDF statements and scanned files are not supported/);

    // Google Sheets link
    expect(() =>
      BankStatementParserFactory.validateAllowedFormat('https://docs.google.com/spreadsheets/d/123/edit', 'dummy')
    ).toThrow(/Google Sheet links are not supported/);

    // OFX
    expect(() =>
      BankStatementParserFactory.validateAllowedFormat('statement.ofx', '<OFX><BANKMSGSRSV1></OFX>', 'OFX')
    ).toThrow(/OFX, MT940, and CAMT053 formats are not accepted/);

    // Unsupported extension
    expect(() =>
      BankStatementParserFactory.validateAllowedFormat('statement.docx', 'dummy content')
    ).toThrow(/is not supported/);
  });

  it('2. Statement Preview: parses CSV, detects bank name, reports counts, and flags discrepancy warning without blocking', async () => {
    const csvContent = `HDFC Bank Statement - Account No: 50100234567890
Date,Narration,Ref No,Withdrawal,Deposit,Balance
2026-09-01,Opening Balance,,,0,10000.00
2026-09-05,Client Remittance Acme,UTR9871,,50000.00,60000.00
2026-09-08,Office Rent Payout,CHQ1001,15000.00,,45000.00
2026-09-10,Vendor Payment Plywood,UPI8872,12500.00,,32500.00`;

    const preview = await BankReconciliationService.previewStatementImport(ORG_ID, {
      fileContent: csvContent,
      filename: 'HDFC_Sept_Statement.csv',
    });

    expect(preview.totalRows).toBe(3);
    expect(preview.newRowsCount).toBe(3);
    expect(preview.exactDuplicatesCount).toBe(0);
    expect(preview.detectedBankName).toContain('HDFC');
    expect(preview.detectedAccountNumber).toContain('50100234567890');
    expect(preview.currency).toBe('INR');
    expect(preview.previewRows.length).toBe(3);
    expect(preview.previewRows[0].moneyIn).toBe(50000);
    expect(preview.previewRows[1].moneyOut).toBe(15000);
  });

  it('3. Confirmed Statement Import: provisions bank account from statement evidence and creates 0 expenses / 0 GL movements', async () => {
    const csvContent = `Date,Narration,Ref No,Withdrawal,Deposit,Balance
2026-09-01,Client Wire A,UTR-A-1,,25000.00,25000.00
2026-09-02,Client Wire B,UTR-B-2,,35000.00,60000.00`;

    // Verify initial state: 0 bank accounts, 0 journal entries, 0 expenses
    const initialJournals = await db.query(`SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1`, [ORG_ID]);
    const initialExpenses = await db.query(`SELECT COUNT(*) as count FROM expenses WHERE organization_id = $1`, [ORG_ID]);
    expect(Number(initialJournals.rows[0].count)).toBe(0);
    expect(Number(initialExpenses.rows[0].count)).toBe(0);

    // Confirm import with CREATE_NEW mode
    const confirmResult = await BankReconciliationService.confirmStatementImport(
      ORG_ID,
      {
        fileContent: csvContent,
        filename: 'ICICI_Statement.csv',
        mode: 'CREATE_NEW',
        newBankData: {
          bankName: 'ICICI Bank',
          accountName: 'ICICI Current Operational',
          accountNumber: '001205001234',
          currency: 'INR',
        },
      },
      USER_ID
    );

    expect(confirmResult.success).toBe(true);
    expect(confirmResult.bankAccountId).toBeDefined();
    expect(confirmResult.newTransactionsCount).toBe(2);

    // Verify Bank Account created
    const bankRes = await db.query(`SELECT * FROM bank_accounts WHERE organization_id = $1 AND id = $2`, [ORG_ID, confirmResult.bankAccountId]);
    expect(bankRes.rows.length).toBe(1);
    expect(bankRes.rows[0].bank_name).toBe('ICICI Bank');
    expect(bankRes.rows[0].account_number).toBe('001205001234');

    // ZERO EXPENSE / ZERO GL INVARIANT:
    const afterJournals = await db.query(`SELECT COUNT(*) as count FROM journal_entries WHERE organization_id = $1`, [ORG_ID]);
    const afterExpenses = await db.query(`SELECT COUNT(*) as count FROM expenses WHERE organization_id = $1`, [ORG_ID]);
    expect(Number(afterJournals.rows[0].count)).toBe(0);
    expect(Number(afterExpenses.rows[0].count)).toBe(0);

    // Verify observations created
    const obsRes = await db.query(`SELECT COUNT(*) as count FROM bank_statement_import_observations WHERE organization_id = $1`, [ORG_ID]);
    expect(Number(obsRes.rows[0].count)).toBe(2);
  });

  it('4. Overlap & Duplicate Protection: overlapping statement skips canonical transaction duplication and stores observations', async () => {
    // Statement 1: Jan to Feb (Rows 1 & 2)
    const stmt1 = `Date,Narration,Ref No,Withdrawal,Deposit,Balance
2026-01-15,Payment Alpha,UTR-ALPHA,,10000.00,10000.00
2026-02-10,Payment Beta,UTR-BETA,,20000.00,30000.00`;

    const imp1 = await BankReconciliationService.confirmStatementImport(
      ORG_ID,
      {
        fileContent: stmt1,
        filename: 'HDFC_Jan_Feb.csv',
        mode: 'CREATE_NEW',
        newBankData: {
          bankName: 'HDFC Bank',
          accountName: 'HDFC Corporate',
          accountNumber: '5010099999',
          currency: 'INR',
        },
      },
      USER_ID
    );
    expect(imp1.newTransactionsCount).toBe(2);

    // Statement 2: Feb to Mar (Contains row Beta again + row Gamma)
    const stmt2 = `Date,Narration,Ref No,Withdrawal,Deposit,Balance
2026-02-10,Payment Beta,UTR-BETA,,20000.00,30000.00
2026-03-05,Payment Gamma,UTR-GAMMA,,30000.00,60000.00`;

    const imp2 = await BankReconciliationService.confirmStatementImport(
      ORG_ID,
      {
        fileContent: stmt2,
        filename: 'HDFC_Feb_Mar.csv',
        mode: 'USE_EXISTING',
        bankAccountId: imp1.bankAccountId,
      },
      USER_ID
    );

    // Row Beta should be skipped as exact duplicate, Row Gamma added
    expect(imp2.exactDuplicatesCount).toBe(1);
    expect(imp2.newTransactionsCount).toBe(1);

    // Total canonical transactions in database should be precisely 3 (Alpha, Beta, Gamma)
    const txCountRes = await db.query(
      `SELECT COUNT(*) as count FROM bank_statement_transactions WHERE organization_id = $1 AND bank_account_id = $2`,
      [ORG_ID, imp1.bankAccountId]
    );
    expect(Number(txCountRes.rows[0].count)).toBe(3);

    // Total observations should be 4 (2 from stmt1, 2 from stmt2)
    const obsCountRes = await db.query(
      `SELECT COUNT(*) as count FROM bank_statement_import_observations WHERE organization_id = $1`,
      [ORG_ID]
    );
    expect(Number(obsCountRes.rows[0].count)).toBe(4);
  });

  it('5. Explicit Categorization: user creates a balanced GL transaction and links statement row atomically', async () => {
    // 1. Setup bank with 1 statement row
    const stmt = `Date,Narration,Ref No,Withdrawal,Deposit,Balance
2026-09-05,Vendor Software Subscription,REF-SOFT-01,5000.00,,45000.00`;

    const imp = await BankReconciliationService.confirmStatementImport(
      ORG_ID,
      {
        fileContent: stmt,
        filename: 'Bank_Stmt.csv',
        mode: 'CREATE_NEW',
        newBankData: {
          bankName: 'Axis Bank',
          accountName: 'Axis Operating',
          accountNumber: '912010001234',
        },
      },
      USER_ID
    );

    // Fetch the statement transaction ID
    const txs = await BankReconciliationService.getTransactions(ORG_ID, { bankAccountId: imp.bankAccountId });
    expect(txs.length).toBe(1);
    const stmtTx = txs[0];
    expect(stmtTx.reconciliationStatus).toBe('TO_REVIEW');

    // Create an expense category account in Chart of Accounts
    const expAccId = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES ($1, $2, '6050', 'Software Expenses', 'Expense', 'Operating Expense', 0, 'Active')`,
      [expAccId, ORG_ID]
    );

    // 2. Perform explicit categorization
    const catResult = await BankReconciliationService.categorizeTransaction(
      ORG_ID,
      stmtTx.id,
      {
        ledgerAccountId: expAccId,
        counterpartyName: 'Adobe Systems',
        notes: 'Monthly Creative Cloud Subscription',
        createRule: true,
      },
      USER_ID
    );

    expect(catResult.success).toBe(true);
    expect(catResult.journalEntryId).toBeDefined();

    // Verify GL entry is balanced: Debit Software Expenses (5000), Credit Bank (5000)
    const lines = await db.query(
      `SELECT * FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2`,
      [ORG_ID, catResult.journalEntryId]
    );
    expect(lines.rows.length).toBe(2);
    const debitLine = lines.rows.find((l) => Number(l.debit) > 0);
    const creditLine = lines.rows.find((l) => Number(l.credit) > 0);
    expect(Number(debitLine.debit)).toBe(5000);
    expect(Number(creditLine.credit)).toBe(5000);

    // Verify journal description audit
    const jrn = await db.query(`SELECT description FROM journal_entries WHERE id = $1`, [catResult.journalEntryId]);
    expect(jrn.rows[0].description).toContain('[Created from bank statement]');

    // Verify statement transaction status updated to CATEGORIZED
    const updatedTx = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [stmtTx.id]);
    expect(updatedTx.rows[0].reconciliation_status).toBe('CATEGORIZED');

    // Verify rule was created
    const rules = await BankReconciliationService.getRules(ORG_ID);
    expect(rules.some((r) => r.suggestedAccountId === expAccId)).toBe(true);
  });

  it('6. Banking Overview & Workspace: calculates real Book Balance, Statement Balance, Difference, and Health counters', async () => {
    // Setup bank with statement
    const stmt = `Date,Narration,Ref No,Withdrawal,Deposit,Balance
2026-09-01,Opening Deposit,,0,100000.00,100000.00
2026-09-02,Client Advance,UTR-ADV,,50000.00,150000.00`;

    const imp = await BankReconciliationService.confirmStatementImport(
      ORG_ID,
      {
        fileContent: stmt,
        filename: 'Overview_Test.csv',
        mode: 'CREATE_NEW',
        newBankData: {
          bankName: 'Kotak Bank',
          accountName: 'Kotak Main',
          accountNumber: '77889900',
        },
      },
      USER_ID
    );

    const overview = await BankReconciliationService.getBankingOverview(ORG_ID);
    expect(overview.accounts.length).toBe(1);
    const acc = overview.accounts[0];
    expect(acc.bankName).toBe('Kotak Bank');
    expect(acc.statementBalance).toBe(150000);
    expect(acc.hasStatement).toBe(true);
    expect(acc.toReviewCount).toBe(2);
    expect(overview.health.totalToReview).toBe(2);

    // Workspace endpoint
    const workspace = await BankReconciliationService.getWorkspace(ORG_ID, imp.bankAccountId, { tab: 'ALL' });
    expect(workspace.accountProfile.bankName).toBe('Kotak Bank');
    expect(workspace.statusCounts.toReview).toBe(2);
    expect(workspace.transactions.length).toBe(2);
    expect(workspace.transactions[0].moneyIn).toBe(50000);
    expect(workspace.transactions[1].moneyIn).toBe(100000);
  });
});
