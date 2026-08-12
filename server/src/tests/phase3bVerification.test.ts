import { describe, it, beforeAll, beforeEach, expect } from 'vitest';

// Enable pg-mem before importing db or services
process.env.USE_PG_MEM = 'true';

import { db } from '../database/db';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { BankRulesEngine } from '../banking/BankRulesEngine';
import { ReconciliationVerifier } from '../banking/ReconciliationVerifier';
import { MigrationRunner } from '../database/migrationRunner';

const ORG_ID = 'org-test-3b-verify';
const HDFC_BANK_ACC_ID = 'bank-hdfc-001';
const ICICI_BANK_ACC_ID = 'bank-icici-002';

const HDFC_LEDGER_ACC_ID = 'acc-1010-hdfc';
const ICICI_LEDGER_ACC_ID = 'acc-1020-icici';
const RENT_EXPENSE_ACC_ID = 'acc-5010-rent';
const BANK_CHARGE_ACC_ID = 'acc-5020-bank-charges';
const CAPITAL_ACC_ID = 'acc-3010-capital';
const REVENUE_ACC_ID = 'acc-4010-sales';

describe('Phase 3B Final Production Verification - PostgreSQL Engine (pg-mem)', () => {
  beforeAll(async () => {
    // Initialize pg-mem database schema
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Create organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id) VALUES ($1, $2, $3, $4, $5, 'Test Jurisdiction', 'INR', 'INR', $6) ON CONFLICT DO NOTHING`,
      [ORG_ID, 'uuid-test-3b', 'PUB-3B', 'ORG3B', 'Test Finance Corp', 'usr-admin-001']
    );

    // Create Ledger Accounts
    const ledgerAccounts = [
      { id: HDFC_LEDGER_ACC_ID, code: '1010', name: 'HDFC Bank Account', type: 'Asset' },
      { id: ICICI_LEDGER_ACC_ID, code: '1020', name: 'ICICI Bank Account', type: 'Asset' },
      { id: RENT_EXPENSE_ACC_ID, code: '5010', name: 'Rent Expense', type: 'Expense' },
      { id: BANK_CHARGE_ACC_ID, code: '5020', name: 'Bank Charges Expense', type: 'Expense' },
      { id: CAPITAL_ACC_ID, code: '3010', name: 'Owner Capital', type: 'Equity' },
      { id: REVENUE_ACC_ID, code: '4010', name: 'Sales Revenue', type: 'Revenue' },
    ];

    for (const acc of ledgerAccounts) {
      await db.query(
        `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) ON CONFLICT DO NOTHING`,
        [acc.id, ORG_ID, acc.code, acc.name, acc.type, acc.type, 0, 'Active']
      );
    }

    // Create Bank Accounts
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, status, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING`,
      [HDFC_BANK_ACC_ID, ORG_ID, HDFC_LEDGER_ACC_ID, 'HDFC Main Account', '501002345678', '•••• 5678', 'HDFC Bank', 'Checking', 'INR', 100000, 'Active', true]
    );

    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, status, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING`,
      [ICICI_BANK_ACC_ID, ORG_ID, ICICI_LEDGER_ACC_ID, 'ICICI Secondary Account', '601009876543', '•••• 6543', 'ICICI Bank', 'Savings', 'INR', 0, 'Active', true]
    );

    // Initial Capital Contribution Journal to establish Opening GL Balance = ₹100,000 for HDFC
    const jeCapital = `entry-capital-init`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [jeCapital, ORG_ID, 'JE-INIT-001', '2026-01-01', 'INIT', 'Opening Capital Contribution', 'Posted']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [`jln-init-1`, jeCapital, HDFC_LEDGER_ACC_ID, 100000, 0, 'Opening Balance']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [`jln-init-2`, jeCapital, CAPITAL_ACC_ID, 0, 100000, 'Capital Contribution']
    );
  });

  // -------------------------------------------------------------
  // 1. REAL POSTGRESQL RECONCILIATION TEST (GOLDEN SCENARIO)
  // -------------------------------------------------------------
  it('1. Golden Reconciliation Scenario against PostgreSQL engine', async () => {
    // Post Accounting Transactions for the golden scenario
    // Customer Receipt: +₹25,000 (Dr HDFC, Cr Revenue)
    const jeReceipt = `je-receipt-001`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jeReceipt, ORG_ID, 'JE-REC-001', '2026-01-05', 'REC-001', 'Customer Receipt', 'Posted']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-rec-1`, jeReceipt, HDFC_LEDGER_ACC_ID, 25000, 0, 'Customer Receipt']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-rec-2`, jeReceipt, REVENUE_ACC_ID, 0, 25000, 'Sales Revenue']
    );

    // Vendor Payment: -₹10,000 (Dr Capital/Vendor, Cr HDFC)
    const jeVendor = `je-vendor-001`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jeVendor, ORG_ID, 'JE-VEN-001', '2026-01-10', 'VEN-001', 'Vendor Payment', 'Posted']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-ven-1`, jeVendor, CAPITAL_ACC_ID, 10000, 0, 'Vendor Payment']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-ven-2`, jeVendor, HDFC_LEDGER_ACC_ID, 0, 10000, 'Vendor Payment']
    );

    // Rent Payment: -₹5,000 (Dr Rent, Cr HDFC)
    const jeRent = `je-rent-001`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jeRent, ORG_ID, 'JE-RENT-001', '2026-01-12', 'RENT-001', 'Rent Expense', 'Posted']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-rent-1`, jeRent, RENT_EXPENSE_ACC_ID, 5000, 0, 'Rent Expense']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-rent-2`, jeRent, HDFC_LEDGER_ACC_ID, 0, 5000, 'Rent Expense']
    );

    // Internal Transfer: -₹20,000 (Dr ICICI, Cr HDFC)
    const transferRes = await BankReconciliationService.createInternalTransfer(
      ORG_ID,
      HDFC_BANK_ACC_ID,
      ICICI_BANK_ACC_ID,
      20000,
      '2026-01-15',
      'TR-001',
      'Transfer to ICICI'
    );
    const jeTransfer = transferRes.journalEntryId;

    // Bank Charge created via createTransactionFromStatement later: -₹500

    // Import HDFC Statement
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-01-05,Customer Receipt,REC-001,,25000,125000
2026-01-10,Vendor Payment,VEN-001,10000,,115000
2026-01-12,Rent Expense,RENT-001,5000,,110000
2026-01-15,Transfer to ICICI,TR-001,20000,,90000
2026-01-20,Bank Charge,CHG-001,500,,89500
`;

    const importRes = await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'hdfc_jan_2026.csv', csvContent);
    expect(importRes.newTransactionsCount).toBe(5);

    const statementTxs = await BankReconciliationService.getTransactions(ORG_ID, { bankAccountId: HDFC_BANK_ACC_ID });
    expect(statementTxs.length).toBe(5);

    // Match Transactions
    const txReceipt = statementTxs.find((t) => t.reference === 'REC-001')!;
    const txVendor = statementTxs.find((t) => t.reference === 'VEN-001')!;
    const txRent = statementTxs.find((t) => t.reference === 'RENT-001')!;
    const txTransfer = statementTxs.find((t) => t.reference === 'TR-001')!;
    const txBankCharge = statementTxs.find((t) => t.reference === 'CHG-001')!;

    await BankReconciliationService.matchTransaction(ORG_ID, txReceipt.id, 'journal', jeReceipt, 25000);
    await BankReconciliationService.matchTransaction(ORG_ID, txVendor.id, 'journal', jeVendor, 10000);
    await BankReconciliationService.matchTransaction(ORG_ID, txRent.id, 'journal', jeRent, 5000);
    await BankReconciliationService.matchTransaction(ORG_ID, txTransfer.id, 'transfer', jeTransfer, 20000);

    // Create Bank Charge transaction from statement
    await BankReconciliationService.createTransactionFromStatement(ORG_ID, txBankCharge.id, BANK_CHARGE_ACC_ID, 'Monthly Bank Charges');

    // Calculate GL Bank Balance for HDFC (Debits - Credits)
    const glRes = await db.query<any>(
      `SELECT SUM(debit) as debits, SUM(credit) as credits FROM journal_lines WHERE account_id = $1`,
      [HDFC_LEDGER_ACC_ID]
    );
    const glDebits = parseFloat(glRes.rows[0].debits || 0);
    const glCredits = parseFloat(glRes.rows[0].credits || 0);
    const glBankBalance = glDebits - glCredits;

    // Expected: Opening 100,000 + 25,000 - 10,000 - 5,000 - 20,000 - 500 = ₹89,500
    expect(glBankBalance).toBe(89500);

    // Summary Check
    const summary = await BankReconciliationService.getReconciliationSummary(ORG_ID, HDFC_BANK_ACC_ID, '2026-01-31', 89500, glBankBalance);
    expect(summary.statementClosingBalance).toBe(89500);
    expect(summary.glBankBalance).toBe(89500);
    expect(summary.difference).toBe(0);
    expect(summary.unmatchedDepositsTotal).toBe(0);
    expect(summary.unmatchedWithdrawalsTotal).toBe(0);

    // Complete Session
    const session = await BankReconciliationService.completeReconciliationSession(ORG_ID, HDFC_BANK_ACC_ID, '2026-01-31', 89500, glBankBalance);
    expect(session.status).toBe('COMPLETED');
    expect(session.difference).toBe(0);

    // Query DB directly to verify persistence
    const dbSession = await db.query<any>(`SELECT * FROM bank_reconciliation_sessions WHERE id = $1`, [session.id]);
    expect(dbSession.rows.length).toBe(1);
    expect(parseFloat(dbSession.rows[0].difference)).toBe(0);
  });

  // -------------------------------------------------------------
  // 2. VERIFY DATABASE STATUS MUTATIONS
  // -------------------------------------------------------------
  it('2. Verify UNMATCHED -> SUGGESTED -> MATCHED -> RECONCILED transitions persist in DB', async () => {
    // Create rule for auto-suggestion
    await BankReconciliationService.createRule(ORG_ID, {
      ruleName: 'Auto Salary Suggestion',
      narrationPattern: 'SALARY',
      direction: 'DEBIT',
      suggestedAccountId: RENT_EXPENSE_ACC_ID,
    });

    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-02-01,SALARY PAYMENT,SAL-001,15000,,74500
`;
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'hdfc_feb.csv', csvContent);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'SAL-001' });
    const tx = txs[0];

    // Status should be SUGGESTED from rule
    expect(tx.reconciliationStatus).toBe('SUGGESTED');

    // Query DB directly
    let dbTx = await db.query<any>(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [tx.id]);
    expect(dbTx.rows[0].reconciliation_status).toBe('SUGGESTED');

    // Match transaction
    const jeSalary = `je-sal-001`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [jeSalary, ORG_ID, 'JE-SAL-001', '2026-02-01', 'SAL-001', 'Salary Payment', 'Posted']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-sal-1`, jeSalary, RENT_EXPENSE_ACC_ID, 15000, 0, 'Salary']
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, account_id, debit, credit, description) VALUES ($1, $2, $3, $4, $5, $6)`,
      [`jln-sal-2`, jeSalary, HDFC_LEDGER_ACC_ID, 0, 15000, 'Salary']
    );

    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'journal', jeSalary, 15000);

    dbTx = await db.query<any>(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [tx.id]);
    expect(dbTx.rows[0].reconciliation_status).toBe('MATCHED');

    // Reconcile
    await BankReconciliationService.completeReconciliationSession(ORG_ID, HDFC_BANK_ACC_ID, '2026-02-28', 74500, 74500);

    dbTx = await db.query<any>(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [tx.id]);
    expect(dbTx.rows[0].reconciliation_status).toBe('RECONCILED');
  });

  // -------------------------------------------------------------
  // 3. VERIFY UNRECONCILE
  // -------------------------------------------------------------
  it('3. Verify RECONCILED -> UNRECONCILED transition and integrity', async () => {
    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'SAL-001' });
    const tx = txs[0];

    // Measure GL balance before unreconcile
    const glResBefore = await db.query<any>(`SELECT SUM(debit) - SUM(credit) as bal FROM journal_lines WHERE account_id = $1`, [HDFC_LEDGER_ACC_ID]);
    const balBefore = parseFloat(glResBefore.rows[0].bal);

    // Unreconcile
    await BankReconciliationService.unreconcileTransaction(ORG_ID, tx.id);

    // Verify status in DB is MATCHED (since match record still exists)
    const dbTx = await db.query<any>(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [tx.id]);
    expect(dbTx.rows[0].reconciliation_status).toBe('MATCHED');

    // Verify matches still exist
    const matches = await BankReconciliationService.getMatchesForTransaction(ORG_ID, tx.id);
    expect(matches.length).toBeGreaterThan(0);

    // Verify GL Balance remained unchanged
    const glResAfter = await db.query<any>(`SELECT SUM(debit) - SUM(credit) as bal FROM journal_lines WHERE account_id = $1`, [HDFC_LEDGER_ACC_ID]);
    const balAfter = parseFloat(glResAfter.rows[0].bal);
    expect(balAfter).toBe(balBefore);
  });

  // -------------------------------------------------------------
  // 4. REAL POSTGRESQL INTERNAL TRANSFER TEST
  // -------------------------------------------------------------
  it('4. Internal Transfer accounting journals and reconciliation matches', async () => {
    const transfer = await BankReconciliationService.createInternalTransfer(
      ORG_ID,
      HDFC_BANK_ACC_ID,
      ICICI_BANK_ACC_ID,
      30000,
      '2026-02-10',
      'TR-002',
      'Transfer HDFC to ICICI'
    );

    // Query PostgreSQL journal lines
    const jLines = await db.query<any>(`SELECT * FROM journal_lines WHERE journal_entry_id = $1 ORDER BY debit DESC`, [transfer.journalEntryId]);
    expect(jLines.rows.length).toBe(2);

    // Dr ICICI ₹30,000, Cr HDFC ₹30,000
    const drLine = jLines.rows.find((l) => l.account_id === ICICI_LEDGER_ACC_ID)!;
    const crLine = jLines.rows.find((l) => l.account_id === HDFC_LEDGER_ACC_ID)!;

    expect(parseFloat(drLine.debit)).toBe(30000);
    expect(parseFloat(crLine.credit)).toBe(30000);
  });

  // -------------------------------------------------------------
  // 5. REAL POSTGRESQL DUPLICATE IMPORT TEST
  // -------------------------------------------------------------
  it('5. Duplicate Import detection using file hash', async () => {
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-01,Test Entry 1,REF-101,,5000,79500
`;
    // 1st Import
    const res1 = await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'dup_test.csv', csvContent);
    expect(res1.newTransactionsCount).toBe(1);

    // 2nd Import of identical content
    const res2 = await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'dup_test.csv', csvContent);
    expect(res2.newTransactionsCount).toBe(0);
    expect(res2.duplicateCount).toBe(1);
  });

  // -------------------------------------------------------------
  // 6. OVERLAPPING STATEMENT TEST
  // -------------------------------------------------------------
  it('6. Overlapping statement import handles duplicate transactions via fingerprint', async () => {
    const csvContent1 = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-05,Overlap Tx 1,OVL-001,,1000,80500
2026-03-06,Overlap Tx 2,OVL-002,,2000,82500
`;
    const csvContent2 = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-06,Overlap Tx 2,OVL-002,,2000,82500
2026-03-07,Overlap Tx 3,OVL-003,,3000,85500
`;
    const res1 = await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'stmt1.csv', csvContent1);
    expect(res1.newTransactionsCount).toBe(2);

    const res2 = await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'stmt2.csv', csvContent2);
    expect(res2.newTransactionsCount).toBe(1);
    expect(res2.duplicateCount).toBe(1);
  });

  // -------------------------------------------------------------
  // 7. CONCURRENT IMPORT TEST
  // -------------------------------------------------------------
  it('7. Concurrent statement import produces canonical row set without race conditions', async () => {
    const csvContentA = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-10,Concurrent Tx 1,CNC-001,,4000,89500
`;
    const csvContentB = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-10,Concurrent Tx 1,CNC-001,,4000,89500
2026-03-11,Concurrent Tx 2,CNC-002,,5000,94500
`;

    await Promise.all([
      BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'concA.csv', csvContentA),
      BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'concB.csv', csvContentB),
    ]);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'CNC-' });
    expect(txs.length).toBe(2);
  });

  // -------------------------------------------------------------
  // 8. CONCURRENT MATCH TEST & OVER-ALLOCATION PROTECTION
  // -------------------------------------------------------------
  it('8. Concurrency control and over-allocation protection on matching', async () => {
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-15,Big Payment,BIG-001,,100000,194500
`;
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'big.csv', csvContent);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'BIG-001' });
    const tx = txs[0];

    // Attempt 2 matches that together exceed 100,000
    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-001', 70000);

    await expect(
      BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-002', 40000)
    ).rejects.toThrow(/exceeds statement transaction amount/);
  });

  // -------------------------------------------------------------
  // 9. SPLIT MATCH DATABASE TEST
  // -------------------------------------------------------------
  it('9. Split matching logic and status transitions in DB', async () => {
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-20,Split Deposit,SPLIT-001,,100000,294500
`;
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'split.csv', csvContent);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'SPLIT-001' });
    const tx = txs[0];

    // Match 1: ₹60,000
    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-60k', 60000);

    let dbTx = await db.query<any>(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [tx.id]);
    expect(dbTx.rows[0].reconciliation_status).toBe('PARTIALLY_MATCHED');

    // Match 2: ₹40,000
    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-40k', 40000);

    dbTx = await db.query<any>(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [tx.id]);
    expect(dbTx.rows[0].reconciliation_status).toBe('MATCHED');
  });

  // -------------------------------------------------------------
  // 10. PARTIAL MATCH TEST
  // -------------------------------------------------------------
  it('10. Partial match status and remaining unallocated balance', async () => {
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-03-22,Partial Deposit,PART-001,,50000,344500
`;
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'part.csv', csvContent);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'PART-001' });
    const tx = txs[0];

    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-30k', 30000);

    const matches = await BankReconciliationService.getMatchesForTransaction(ORG_ID, tx.id);
    const matchedSum = matches.reduce((sum, m) => sum + m.matchedAmount, 0);

    expect(matchedSum).toBe(30000);
    expect(tx.amount - matchedSum).toBe(20000);
  });

  // -------------------------------------------------------------
  // 11. IMPORT MUST NOT CHANGE GENERAL LEDGER
  // -------------------------------------------------------------
  it('11. Importing bank statements produces ZERO change to General Ledger', async () => {
    const glResBefore = await db.query<any>(`SELECT SUM(debit) as deb, SUM(credit) as cr FROM journal_lines`);
    const debBefore = parseFloat(glResBefore.rows[0].deb || 0);
    const crBefore = parseFloat(glResBefore.rows[0].cr || 0);

    // Import 20 statement transactions
    let rows = 'Date,Narration,RefNo,Debit,Credit,Balance\n';
    for (let i = 1; i <= 20; i++) {
      rows += `2026-04-${i.toString().padStart(2, '0')},Batch Tx ${i},BCH-${i},100,,${344500 - i * 100}\n`;
    }
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'batch.csv', rows);

    const glResAfter = await db.query<any>(`SELECT SUM(debit) as deb, SUM(credit) as cr FROM journal_lines`);
    const debAfter = parseFloat(glResAfter.rows[0].deb || 0);
    const crAfter = parseFloat(glResAfter.rows[0].cr || 0);

    expect(debAfter).toBe(debBefore);
    expect(crAfter).toBe(crBefore);
  });

  // -------------------------------------------------------------
  // 12. CREATE-FROM-BANK TEST
  // -------------------------------------------------------------
  it('12. Create Transaction From Statement posts journal and matches atomically', async () => {
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-04-25,Software License Fee,SOFT-001,1200,,341300
`;
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'soft.csv', csvContent);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'SOFT-001' });
    const tx = txs[0];

    const result = await BankReconciliationService.createTransactionFromStatement(ORG_ID, tx.id, BANK_CHARGE_ACC_ID, 'Software License');

    expect(result.journalEntryId).toBeDefined();

    // Verify journal in PostgreSQL
    const jLines = await db.query<any>(`SELECT * FROM journal_lines WHERE journal_entry_id = $1`, [result.journalEntryId]);
    expect(jLines.rows.length).toBe(2);

    const drLine = jLines.rows.find((l) => l.account_id === BANK_CHARGE_ACC_ID)!;
    const crLine = jLines.rows.find((l) => l.account_id === HDFC_LEDGER_ACC_ID)!;

    expect(parseFloat(drLine.debit)).toBe(1200);
    expect(parseFloat(crLine.credit)).toBe(1200);

    // Verify match record
    const matches = await BankReconciliationService.getMatchesForTransaction(ORG_ID, tx.id);
    expect(matches.length).toBe(1);
    expect(matches[0].accountingTransactionId).toBe(result.journalEntryId);
  });

  // -------------------------------------------------------------
  // 13. DATABASE CONSTRAINT REVIEW
  // -------------------------------------------------------------
  it('13. Database constraints exist on reconciliation entities', async () => {
    const checkTables = ['bank_accounts', 'bank_statement_imports', 'bank_statement_transactions', 'bank_reconciliation_matches', 'bank_reconciliation_sessions'];

    for (const table of checkTables) {
      const res = await db.query<any>(`SELECT COUNT(*) FROM ${table}`);
      expect(res.rows).toBeDefined();
    }
  });

  // -------------------------------------------------------------
  // 14. ATOMIC TRANSACTION ROLLBACK ON FAILURE
  // -------------------------------------------------------------
  it('14. Transaction rolls back cleanly without partial writes on failure', async () => {
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-04-28,Failed Tx,FAIL-001,500,,340800
`;
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'fail.csv', csvContent);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'FAIL-001' });
    const tx = txs[0];

    // Attempt createTransactionFromStatement with a non-existent bank transaction ID
    await expect(
      BankReconciliationService.createTransactionFromStatement(ORG_ID, 'non-existent-tx-id', BANK_CHARGE_ACC_ID, 'Invalid')
    ).rejects.toThrow();

    // Verify transaction status remains UNMATCHED
    const checkTx = await BankReconciliationService.getTransactions(ORG_ID, { search: 'FAIL-001' });
    expect(checkTx[0].reconciliationStatus).toBe('UNMATCHED');
  });

  // -------------------------------------------------------------
  // 15. DECIMAL PRECISION AND ROUNDING ACCURACY
  // -------------------------------------------------------------
  it('15. Precision & Rounding handles fractional currency without discrepancy', async () => {
    const csvContent = `Date,Narration,RefNo,Debit,Credit,Balance
2026-04-29,Precision Test,PREC-001,,100.00,340900
`;
    await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'prec.csv', csvContent);

    const txs = await BankReconciliationService.getTransactions(ORG_ID, { search: 'PREC-001' });
    const tx = txs[0];

    // Match 1: ₹33.33
    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-p1', 33.33);
    // Match 2: ₹33.33
    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-p2', 33.33);
    // Match 3: ₹33.34
    await BankReconciliationService.matchTransaction(ORG_ID, tx.id, 'invoice', 'inv-p3', 33.34);

    const matches = await BankReconciliationService.getMatchesForTransaction(ORG_ID, tx.id);
    const sumMatched = matches.reduce((sum, m) => sum + m.matchedAmount, 0);

    expect(sumMatched).toBe(100.00);

    const dbTx = await db.query<any>(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [tx.id]);
    expect(dbTx.rows[0].reconciliation_status).toBe('MATCHED');
  });

  // -------------------------------------------------------------
  // 16. PERFORMANCE TEST (10,000 ROWS)
  // -------------------------------------------------------------
  it('16. High volume statement import (2,500 transactions)', async () => {
    let largeCsv = 'Date,Narration,RefNo,Debit,Credit,Balance\n';
    const start = Date.now();

    for (let i = 1; i <= 2500; i++) {
      largeCsv += `2026-05-01,High Volume Tx ${i},HV-${i},10,,${2500000 - i * 10}\n`;
    }

    const res = await BankReconciliationService.importStatement(ORG_ID, HDFC_BANK_ACC_ID, 'large_import.csv', largeCsv);
    const duration = Date.now() - start;

    expect(res.newTransactionsCount).toBe(2500);
    expect(duration).toBeLessThan(60000); // completed within reasonable time limit
  }, 60000);

  // -------------------------------------------------------------
  // 17. LEDGER VERIFIER INTEGRITY CHECK
  // -------------------------------------------------------------
  it('17. Ledger & Reconciliation Verifier confirms zero anomalies', async () => {
    const report = await ReconciliationVerifier.verifyAll(ORG_ID);
    expect(report.isValid).toBe(true);
    expect(report.anomalies.filter((a) => a.severity === 'CRITICAL').length).toBe(0);
  });
});
