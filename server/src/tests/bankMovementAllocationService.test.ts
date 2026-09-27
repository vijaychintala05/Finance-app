import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankMovementAllocationService } from '../banking/BankMovementAllocationService';

describe('BankMovementAllocationService (prototype write path)', () => {
  const orgId = 'org-bank-allocation';
  const actorId = 'usr-bank-allocation';
  const bankId = 'bank-allocation';
  const ledgerId = 'ledger-allocation';
  const statementId = 'statement-allocation';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'allocation@example.test', 'hash', 'Allocation User', 'Active') ON CONFLICT DO NOTHING`, [actorId],
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-allocation', 'public-allocation', 'ALC', 'Allocation Test', 'IN', 'INR', '₹', $2)`, [orgId, actorId],
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status)
       VALUES ($1, $2, '1001', 'Bank Ledger', 'Asset', 'Bank', 'Active')`, [ledgerId, orgId],
    );
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active)
       VALUES ($1, $2, $3, 'Operating', '9876', 'Test Bank', 'INR', 'Active', TRUE)`, [bankId, orgId, ledgerId],
    );
    await db.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by)
       VALUES ('import-allocation', $1, $2, 'CSV', 'statement.csv', 'hash-allocation', 'INR', $3)`, [orgId, bankId, actorId],
    );
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
       VALUES ($1, $2, $3, 'import-allocation', '2026-09-15', 100, 'CREDIT', 'Customer receipt', 'INR', 'fingerprint-allocation')`,
      [statementId, orgId, bankId],
    );
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
       VALUES ('journal-allocation', $1, 'JE-ALLOC', '2026-09-14', 'Receipt', 'Posted')`, [orgId],
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('line-allocation', 'journal-allocation', $1, $2, 100, 0, 'Bank deposit'),
              ('line-allocation-2', 'journal-allocation', $1, $2, 59.75, 0, 'Second bank deposit')`, [orgId, ledgerId],
    );
  });

  it('allocates exact cents, recomputes partial/full status, and retains immutable unmatch history', async () => {
    const partial = await BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation', '40.25', actorId);
    expect(partial).toMatchObject({ amount: '40.25', statementStatus: 'PARTIALLY_MATCHED' });
    const full = await BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation-2', '59.75', actorId);
    expect(full.statementStatus).toBe('MATCHED');

    await BankMovementAllocationService.unmatch(orgId, partial.allocationId, actorId, 'Wrong transaction selected');
    const row = await db.query(
      `SELECT allocation_state, unmatched_by, unmatched_at, unmatch_reason FROM bank_reconciliation_matches WHERE id = $1`,
      [partial.allocationId],
    );
    expect(row.rows[0]).toMatchObject({ allocation_state: 'UNMATCHED', unmatched_by: actorId, unmatch_reason: 'Wrong transaction selected' });
    expect(row.rows[0].unmatched_at).toBeTruthy();
    const statement = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(statement.rows[0].reconciliation_status).toBe('PARTIALLY_MATCHED');
    await expect(BankMovementAllocationService.unmatch(orgId, partial.allocationId, actorId, 'Again')).rejects.toThrow('BANK_ALLOCATION_NOT_ACTIVE');
  });

  it('rejects over-allocation against either statement or posted book-line capacity', async () => {
    await BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation', '70.00', actorId);
    await expect(BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation-2', '30.01', actorId))
      .rejects.toThrow('BANK_STATEMENT_CAPACITY_EXCEEDED');
    await expect(BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation-2', '30.00', actorId))
      .resolves.toMatchObject({ statementStatus: 'MATCHED' });
  });

  it('fails closed when an account has an active unresolved legacy match', async () => {
    await db.query(
      `INSERT INTO bank_reconciliation_matches
        (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ('legacy-allocation', $1, $2, 'payment_received', 'legacy-document-id', 1, 'MATCHED')`, [orgId, statementId],
    );
    await expect(BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation', '1.00', actorId))
      .rejects.toThrow('BANK_LEGACY_ALLOCATION_UNRESOLVED');
  });

  it('rejects malformed decimal precision and a journal line on the wrong direction', async () => {
    await expect(BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation', '0.001', actorId))
      .rejects.toThrow('REQUESTED_INVALID_AMOUNT');
    await db.query(`UPDATE journal_lines SET debit = 0, credit = 100 WHERE id = 'line-allocation'`);
    await expect(BankMovementAllocationService.allocate(orgId, statementId, 'line-allocation', '1.00', actorId))
      .rejects.toThrow('BANK_BOOK_MOVEMENT_SIDE_INVALID');
  });
});
