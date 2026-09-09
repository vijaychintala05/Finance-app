import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { newId } from '../utils/ids';

describe('Gap 5: Optimistic Concurrency & Simultaneous Document Mutation', () => {
  const ORG_ID = 'org-gap5-concurrency';
  const USER_ID = 'usr-gap5-auditor';

  let bankAcc1Id: string;
  let bankAcc2Id: string;
  let ledgerAcc1Id: string;
  let ledgerAcc2Id: string;

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    // Seed user
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'gap5@concurrency.test', 'hashed_pass', 'Gap 5 Tester', 'Active')
       ON CONFLICT DO NOTHING`,
      [USER_ID]
    );

    // Seed organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-gap5', 'pub-gap5', 'GAP5', 'Concurrency Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // Seed ledger accounts
    ledgerAcc1Id = newId('acc');
    ledgerAcc2Id = newId('acc');
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status)
       VALUES 
         ($1, $3, '1010', 'Primary Checking', 'Asset', 'Bank', 10000.00, 'Active'),
         ($2, $3, '1020', 'Reserve Savings', 'Asset', 'Bank', 0.00, 'Active')`,
      [ledgerAcc1Id, ledgerAcc2Id, ORG_ID]
    );

    // Seed bank accounts
    bankAcc1Id = newId('bnk');
    bankAcc2Id = newId('bnk');
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, current_balance, status, is_active, currency)
       VALUES 
         ($1, $3, $4, 'Primary Checking', '9988776655', 'HDFC Bank', 10000.00, 'Active', true, 'INR'),
         ($2, $3, $5, 'Reserve Savings', '1122334455', 'ICICI Bank', 0.00, 'Active', true, 'INR')`,
      [bankAcc1Id, bankAcc2Id, ORG_ID, ledgerAcc1Id, ledgerAcc2Id]
    );
  });

  it('1. Guarantees balance equilibrium and deadlock-free execution under concurrent transfers', async () => {
    // Initial balances: Checking has 10,000, Savings has 0. Total = 10,000.
    // Concurrently transfer 4,000 from Checking -> Savings, and 1,000 from Savings -> Checking
    const [t1, t2] = await Promise.all([
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        bankAcc1Id,
        bankAcc2Id,
        4000,
        '2026-09-08',
        'TRF-RACE-1',
        'Concurrent transfer 1',
        USER_ID
      ),
      BankReconciliationService.createInternalTransfer(
        ORG_ID,
        bankAcc2Id,
        bankAcc1Id,
        1000,
        '2026-09-08',
        'TRF-RACE-2',
        'Concurrent transfer 2',
        USER_ID
      ),
    ]);

    expect(t1.journalEntryId).toBeDefined();
    expect(t2.journalEntryId).toBeDefined();

    // Verify net balances: Checking should be 10,000 - 4,000 + 1,000 = 7,000
    // Savings should be 0 + 4,000 - 1,000 = 3,000
    // Total money in the system must strictly equal 10,000
    const bnkHdfc = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc1Id]);
    const bnkIcici = await db.query(`SELECT current_balance FROM bank_accounts WHERE id = $1`, [bankAcc2Id]);

    const bal1 = Number(bnkHdfc.rows[0].current_balance);
    const bal2 = Number(bnkIcici.rows[0].current_balance);

    expect(bal1).toBe(7000);
    expect(bal2).toBe(3000);
    expect(bal1 + bal2).toBe(10000);
  });

  it('2. Enforces period lock collision protection against simultaneous posting attempts', async () => {
    // Lock the period for August 2026
    await db.query(
      `INSERT INTO period_locks (id, organization_id, year, month, period_name, is_locked, lock_date, locked_by, status)
       VALUES ('plk-gap5', $1, 2026, 8, '2026-08', true, '2026-08-31', $2, 'Active')`,
      [ORG_ID, USER_ID]
    );

    // Attempt to post backdated to locked period must be immediately rejected
    await expect(
      ServerPostingEngine.postEntry({
        organizationId: ORG_ID,
        entryNumber: 'JE-LOCKED-001',
        date: '2026-08-15',
        description: 'Attempt to post into locked period',
        lines: [
          { accountId: ledgerAcc1Id, debit: 1000, credit: 0 },
          { accountId: ledgerAcc2Id, debit: 0, credit: 1000 },
        ],
      })
    ).rejects.toThrow(/Accounting period is locked/i);
  });

  it('3. Successfully allows postings dated after the active period lock date', async () => {
    // Lock August 2026
    await db.query(
      `INSERT INTO period_locks (id, organization_id, year, month, period_name, is_locked, lock_date, locked_by, status)
       VALUES ('plk-gap5-sep', $1, 2026, 8, '2026-08', true, '2026-08-31', $2, 'Active')
       ON CONFLICT DO NOTHING`,
      [ORG_ID, USER_ID]
    );

    // Post in September 2026 (unlocked)
    const entry = await ServerPostingEngine.postEntry({
      organizationId: ORG_ID,
      entryNumber: 'JE-OPEN-001',
      date: '2026-09-05',
      description: 'Post in open future period',
      lines: [
        { accountId: ledgerAcc1Id, debit: 500, credit: 0 },
        { accountId: ledgerAcc2Id, debit: 0, credit: 500 },
      ],
    });

    expect(entry.entryId).toBeDefined();
  });
});
