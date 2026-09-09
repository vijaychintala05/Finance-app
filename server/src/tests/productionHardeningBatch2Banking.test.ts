import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { newId } from '../utils/ids';

describe('Production Hardening: Batch 2 - Banking Concurrency & Validation Hardening', () => {
  const ORG_ID = 'org-hardening-batch2';
  const OTHER_ORG = 'org-hardening-batch2-other';
  const USER_ID = 'usr-hardening-batch2';

  let bankAcc1Id: string;
  let bankAcc2Id: string;
  let ledgerAcc1Id: string;
  let ledgerAcc2Id: string;

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // 1. Seed user and organizations
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'batch2_tester@firmbooks.io', 'hashed_pass', 'Batch 2 Tester', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES 
         ($1, 'uuid-batch2-1', 'pub-b2-1', 'B2ORG', 'Batch 2 Org', 'IN', 'INR', '₹', $3),
         ($2, 'uuid-batch2-2', 'pub-b2-2', 'B2OTH', 'Other Org', 'IN', 'INR', '₹', $3)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, OTHER_ORG, USER_ID]
    );

    // 2. Seed ledger accounts
    ledgerAcc1Id = newId('acc');
    ledgerAcc2Id = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ($1, $3, '1010', 'HDFC Bank Account', 'Asset', 'Bank', 100000.00, 'Active'),
         ($2, $3, '1020', 'ICICI Bank Account', 'Asset', 'Bank', 50000.00, 'Active')`,
      [ledgerAcc1Id, ledgerAcc2Id, ORG_ID]
    );

    // 3. Seed bank accounts
    bankAcc1Id = newId('bnk');
    bankAcc2Id = newId('bnk');
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, current_balance, status, is_active, currency)
       VALUES 
         ($1, $3, $4, 'HDFC Operational', '1234567890', 'HDFC Bank', 100000.00, 'Active', true, 'INR'),
         ($2, $3, $5, 'ICICI Reserve', '9876543210', 'ICICI Bank', 50000.00, 'Active', true, 'INR')`,
      [bankAcc1Id, bankAcc2Id, ORG_ID, ledgerAcc1Id, ledgerAcc2Id]
    );
  });

  it('1. Rejects self-transfer between the same bank account', async () => {
    await expect(
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        bankAcc1Id,
        bankAcc1Id,
        10000,
        '2026-09-08',
        'TRF-SELF',
        'Self transfer test'
      )
    ).rejects.toThrow('INVALID_TRANSFER');
  });

  it('2. Rejects invalid or negative transfer amounts', async () => {
    await expect(
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        bankAcc1Id,
        bankAcc2Id,
        -5000,
        '2026-09-08'
      )
    ).rejects.toThrow('INVALID_AMOUNT');

    await expect(
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        bankAcc1Id,
        bankAcc2Id,
        0,
        '2026-09-08'
      )
    ).rejects.toThrow('INVALID_AMOUNT');
  });

  it('3. Rejects non-existent or cross-tenant bank accounts', async () => {
    await expect(
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        'non-existent-bank',
        bankAcc2Id,
        10000,
        '2026-09-08'
      )
    ).rejects.toThrow('BANK_ACCOUNT_NOT_FOUND');

    // Attempt transfer referencing an account in another organization
    await expect(
      BankReconciliationService.createInternalTransfer(
        OTHER_ORG,
        bankAcc1Id,
        bankAcc2Id,
        10000,
        '2026-09-08'
      )
    ).rejects.toThrow('BANK_ACCOUNT_NOT_FOUND');
  });

  it('4. Successfully executes transfer, creates balanced journal, and updates both GL and bank balances', async () => {
    const result = await BankReconciliationService.createInternalTransfer(
      ORG_ID,
      bankAcc1Id,
      bankAcc2Id,
      25000,
      '2026-09-08',
      'TRF-VAL-01',
      'Internal Liquidity Rebalancing'
    );

    expect(result.journalEntryId).toBeDefined();

    // Verify journal lines balance
    const linesRes = await db.query(
      `SELECT * FROM journal_lines WHERE journal_entry_id = $1 AND organization_id = $2`,
      [result.journalEntryId, ORG_ID]
    );
    expect(linesRes.rows.length).toBe(2);

    const debitLine = linesRes.rows.find((l) => Number(l.debit) > 0);
    const creditLine = linesRes.rows.find((l) => Number(l.credit) > 0);
    expect(Number(debitLine?.debit)).toBe(25000);
    expect(Number(creditLine?.credit)).toBe(25000);

    // Verify GL balances: Source HDFC (100k - 25k = 75k), Destination ICICI (50k + 25k = 75k)
    const glHdfc = await db.query(`SELECT balance FROM accounts WHERE id = $1`, [ledgerAcc1Id]);
    const glIcici = await db.query(`SELECT balance FROM accounts WHERE id = $1`, [ledgerAcc2Id]);
    expect(Number(glHdfc.rows[0].balance)).toBe(75000);
    expect(Number(glIcici.rows[0].balance)).toBe(75000);

    // Verify bank_accounts balances
    const bnkHdfc = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc1Id]);
    const bnkIcici = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc2Id]);
    expect(Number(bnkHdfc.rows[0].current_balance)).toBe(75000);
    expect(Number(bnkIcici.rows[0].current_balance)).toBe(75000);
  });

  it('5. Concurrent bidirectional transfers execute safely without deadlocks', async () => {
    // Transfer 1: HDFC -> ICICI ₹5,000
    // Transfer 2: ICICI -> HDFC ₹5,000
    const [res1, res2] = await Promise.all([
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        bankAcc1Id,
        bankAcc2Id,
        5000,
        '2026-09-08',
        'TRF-CONC-1'
      ),
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        bankAcc2Id,
        bankAcc1Id,
        5000,
        '2026-09-08',
        'TRF-CONC-2'
      ),
    ]);

    expect(res1.journalEntryId).toBeDefined();
    expect(res2.journalEntryId).toBeDefined();

    // Net balance should remain unchanged
    const bnkHdfc = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc1Id]);
    const bnkIcici = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc2Id]);
    expect(Number(bnkHdfc.rows[0].current_balance)).toBe(100000);
    expect(Number(bnkIcici.rows[0].current_balance)).toBe(50000);
  });

  it('6. Persists a transfer source record and reverses the journal without deleting history', async () => {
    const transfer = await BankReconciliationService.createInternalTransfer(
      ORG_ID,
      bankAcc1Id,
      bankAcc2Id,
      12500,
      '2026-09-08',
      'TRF-REV-1',
      'Transfer reversal coverage',
      USER_ID
    );

    const source = await db.query(
      `SELECT * FROM bank_transfers WHERE organization_id = $1 AND id = $2`,
      [ORG_ID, transfer.transferId]
    );
    expect(source.rows[0].status).toBe('POSTED');
    expect(source.rows[0].journal_entry_id).toBe(transfer.journalEntryId);

    const reversed = await BankReconciliationService.reverseInternalTransfer(
      ORG_ID,
      transfer.transferId,
      USER_ID,
      'Transfer was entered against the wrong date'
    );
    expect(reversed.reversalJournalEntryId).toBeDefined();

    const sourceAfter = await db.query(
      `SELECT status, journal_entry_id, reversal_journal_id FROM bank_transfers WHERE organization_id = $1 AND id = $2`,
      [ORG_ID, transfer.transferId]
    );
    expect(sourceAfter.rows[0].status).toBe('REVERSED');
    expect(sourceAfter.rows[0].journal_entry_id).toBe(transfer.journalEntryId);
    expect(sourceAfter.rows[0].reversal_journal_id).toBe(reversed.reversalJournalEntryId);

    const balances = await db.query(
      `SELECT id, current_balance FROM bank_accounts WHERE organization_id = $1 ORDER BY id`,
      [ORG_ID]
    );
    expect(Number(balances.rows.find((row) => row.id === bankAcc1Id)?.current_balance)).toBe(100000);
    expect(Number(balances.rows.find((row) => row.id === bankAcc2Id)?.current_balance)).toBe(50000);

    await expect(
      BankReconciliationService.reverseInternalTransfer(ORG_ID, transfer.transferId, USER_ID, 'Duplicate reversal attempt')
    ).rejects.toThrow('BANK_TRANSFER_ALREADY_REVERSED');
  });
});
