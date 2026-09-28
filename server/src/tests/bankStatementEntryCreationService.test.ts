import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankStatementEntryCreationService } from '../banking/BankStatementEntryCreationService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { BankMovementAllocationService } from '../banking/BankMovementAllocationService';
import { RoutePermissionRegistry } from '../auth/RoutePermissionRegistry';

describe('BankStatementEntryCreationService (disabled prototype)', () => {
  const orgId = 'org-statement-create';
  const actorId = 'usr-statement-create';
  const bankId = 'bank-statement-create';
  const bankLedgerId = 'ledger-bank-statement-create';
  const counterId = 'expense-bank-statement-create';
  const statementId = 'statement-create';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'statement-create@example.test', 'hash', 'Statement User', 'Active')`, [actorId],
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-statement-create', 'public-statement-create', 'SC', 'Statement Test', 'IN', 'INR', '₹', $2)`, [orgId, actorId],
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status, currency_code)
       VALUES ($1, $3, '1001', 'Bank Ledger', 'Asset', 'Bank', 'Active', 'INR'),
              ($2, $3, '6001', 'Bank Charges', 'Expense', 'Operating Expense', 'Active', 'INR')`, [bankLedgerId, counterId, orgId],
    );
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active, current_balance)
       VALUES ($1, $2, $3, 'Operating', '9876', 'Test Bank', 'INR', 'Active', TRUE, 0)`, [bankId, orgId, bankLedgerId],
    );
    await db.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, statement_from, statement_to, closing_balance, closing_balance_verified, balance_discrepancy, status)
       VALUES ('import-statement-create', $1, $2, 'CSV', 'statement.csv', 'hash-statement-create', 'INR', $3, '2026-09-01', '2026-09-15', 0, TRUE, 0, 'COMPLETED')`, [orgId, bankId, actorId],
    );
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
       VALUES ($1, $2, $3, 'import-statement-create', '2026-09-15', 125.50, 'DEBIT', 'Monthly bank charges', 'INR', 'fingerprint-statement-create')`,
      [statementId, orgId, bankId],
    );
  });

  it('posts once, links the exact bank journal line, and updates balances only through ServerPostingEngine', async () => {
    const created = await BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123');
    expect(created).toMatchObject({ amount: '125.50', statementStatus: 'MATCHED' });
    const balances = await db.query(
      `SELECT ba.current_balance::text AS bank_balance, bank.balance::text AS ledger_balance,
              expense.balance::text AS expense_balance
         FROM bank_accounts ba JOIN accounts bank ON bank.id = ba.ledger_account_id
         JOIN accounts expense ON expense.id = $2 WHERE ba.id = $1`, [bankId, counterId],
    );
    expect(Number(balances.rows[0].bank_balance)).toBeCloseTo(-125.5, 2);
    expect(Number(balances.rows[0].ledger_balance)).toBeCloseTo(-125.5, 2);
    expect(Number(balances.rows[0].expense_balance)).toBeCloseTo(125.5, 2);
    const link = await db.query(
      `SELECT m.creation_origin, m.allocation_state, m.journal_line_id,
              jl.account_id, jl.credit::text AS credit
         FROM bank_reconciliation_matches m JOIN journal_lines jl ON jl.id = m.journal_line_id
        WHERE m.id = $1`, [created.allocationId],
    );
    expect(link.rows[0]).toMatchObject({ creation_origin: 'STATEMENT_CREATION', allocation_state: 'ACTIVE', account_id: bankLedgerId, credit: '125.5' });
    const status = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(status.rows[0].reconciliation_status).toBe('MATCHED');
    await expect(BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123'))
      .rejects.toThrow('BANK_STATEMENT_ALREADY_PROCESSED');
    const count = await db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE organization_id = $1`, [orgId]);
    expect(count.rows[0].count).toBe(1);
  });

  it('creates only the unallocated remainder and restores partial status when that entry is reversed', async () => {
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
       VALUES ('prior-remainder-journal', $1, 'JE-PRIOR-REMAINDER', '2026-09-14', 'Existing bank payment', 'Posted')`, [orgId],
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('prior-bank-line', 'prior-remainder-journal', $1, $2, 0, 40.25, 'Existing bank payment'),
              ('prior-expense-line', 'prior-remainder-journal', $1, $3, 40.25, 0, 'Existing bank payment')`,
      [orgId, bankLedgerId, counterId],
    );
    const existing = await BankMovementAllocationService.allocate(orgId, statementId, 'prior-bank-line', '40.25', actorId);
    expect(existing.statementStatus).toBe('PARTIALLY_MATCHED');

    const created = await BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '85.25', 'bank-entry-op-123');
    expect(created).toMatchObject({ amount: '85.25', statementStatus: 'MATCHED' });
    const allocations = await db.query(
      `SELECT matched_amount::text AS amount, allocation_state, creation_origin
         FROM bank_reconciliation_matches WHERE organization_id = $1 AND statement_transaction_id = $2
        ORDER BY matched_at, id`, [orgId, statementId],
    );
    expect(allocations.rows).toHaveLength(2);
    expect(allocations.rows.map((row: any) => Number(row.amount)).reduce((sum: number, value: number) => sum + value, 0)).toBeCloseTo(125.5, 2);
    expect(allocations.rows.find((row: any) => row.creation_origin === 'STATEMENT_CREATION')?.amount).toBe('85.25');
    const receipt = await BankMovementAllocationService.getStatementReceipt(orgId, statementId);
    expect(receipt.allocations.find((allocation) => allocation.creationOrigin === 'STATEMENT_CREATION')?.creationOperationId).toBe('bank-entry-op-123');

    await BankReconciliationService.reverseTransactionCreatedFromStatement(
      orgId, statementId, actorId, 'Created amount must be entered as separate bank evidence',
    );
    const statement = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(statement.rows[0].reconciliation_status).toBe('PARTIALLY_MATCHED');
  });

  it('reverses the selected created entry when a statement line has multiple active created entries', async () => {
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
       VALUES ('prior-multi-create-journal', $1, 'JE-PRIOR-MULTI', '2026-09-14', 'Existing bank payment', 'Posted')`, [orgId],
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('prior-multi-create-bank-line', 'prior-multi-create-journal', $1, $2, 0, 40, 'Existing bank payment'),
              ('prior-multi-create-expense-line', 'prior-multi-create-journal', $1, $3, 40, 0, 'Existing bank payment')`,
      [orgId, bankLedgerId, counterId],
    );
    const priorAllocation = await BankMovementAllocationService.allocate(orgId, statementId, 'prior-multi-create-bank-line', '40.00', actorId);
    const firstCreated = await BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '85.50', 'bank-entry-op-first');
    expect(firstCreated.amount).toBe('85.50');

    await BankMovementAllocationService.unmatch(orgId, priorAllocation.allocationId, actorId, 'Recorded payment linked separately');
    const secondCreated = await BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '40.00', 'bank-entry-op-second');
    expect(secondCreated.amount).toBe('40.00');
    const beforeReverse = await db.query(
      `SELECT id, journal_entry_id, allocation_state FROM bank_reconciliation_matches
        WHERE organization_id = $1 AND statement_transaction_id = $2 AND creation_origin = 'STATEMENT_CREATION'
        ORDER BY id`, [orgId, statementId],
    );
    expect(beforeReverse.rows.filter((row: any) => row.allocation_state === 'ACTIVE')).toHaveLength(2);
    await expect(BankReconciliationService.reverseTransactionCreatedFromStatement(
      orgId, statementId, actorId, 'Ambiguous reversal requires selecting a specific entry',
    )).rejects.toThrow('CREATED_BANK_TRANSACTION_AMBIGUOUS');

    const reversed = await BankReconciliationService.reverseTransactionCreatedFromStatement(
      orgId, statementId, actorId, 'Reverse the selected second created transaction', secondCreated.allocationId,
    );
    expect(reversed.reversalJournalEntryId).toBeTruthy();
    const afterReverse = await db.query(
      `SELECT id, journal_entry_id, allocation_state FROM bank_reconciliation_matches
        WHERE organization_id = $1 AND statement_transaction_id = $2 AND creation_origin = 'STATEMENT_CREATION'
        ORDER BY id`, [orgId, statementId],
    );
    expect(afterReverse.rows.find((row: any) => row.id === secondCreated.allocationId)?.allocation_state).toBe('REVERSED');
    expect(afterReverse.rows.find((row: any) => row.id === firstCreated.allocationId)?.allocation_state).toBe('ACTIVE');
    expect(afterReverse.rows.find((row: any) => row.id === firstCreated.allocationId)?.journal_entry_id).not.toBe(reversed.reversalJournalEntryId);
  });

  it('rolls back the journal, allocation, state, sequence, and balance changes when audit insertion fails', async () => {
    await db.query(`ALTER TABLE audit_logs ADD CONSTRAINT test_reject_statement_entry_audit CHECK (action <> 'BANK_STATEMENT_ENTRY_CREATED')`);
    await expect(BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123')).rejects.toThrow();
    const results = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE organization_id = $1`, [orgId]),
      db.query(`SELECT COUNT(*)::int AS count FROM bank_reconciliation_matches WHERE organization_id = $1`, [orgId]),
      db.query(`SELECT current_balance::text FROM bank_accounts WHERE id = $1`, [bankId]),
      db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]),
      db.query(`SELECT next_number FROM document_sequences WHERE organization_id = $1 AND document_type = 'JOURNAL'`, [orgId]),
    ]);
    expect(results[0].rows[0].count).toBe(0);
    expect(results[1].rows[0].count).toBe(0);
    expect(Number(results[2].rows[0].current_balance)).toBe(0);
    expect(results[3].rows[0].reconciliation_status).toBe('UNMATCHED');
    expect(results[4].rows).toHaveLength(0);
  });

  it('rejects a stale expected remainder before creating any financial writes', async () => {
    await expect(BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.49', 'bank-entry-op-123'))
      .rejects.toThrow('BANK_STATEMENT_REMAINDER_CHANGED');
    const results = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE organization_id = $1`, [orgId]),
      db.query(`SELECT COUNT(*)::int AS count FROM bank_reconciliation_matches WHERE organization_id = $1`, [orgId]),
      db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]),
    ]);
    expect(results[0].rows[0].count).toBe(0);
    expect(results[1].rows[0].count).toBe(0);
    expect(results[2].rows[0].reconciliation_status).toBe('UNMATCHED');
  });

  it('rejects non-category targets and unsupported currencies before posting', async () => {
    await db.query(`UPDATE accounts SET type = 'Asset' WHERE id = $1`, [counterId]);
    await expect(BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123'))
      .rejects.toThrow('BANK_COUNTER_ACCOUNT_NOT_ALLOWED');
    const count = await db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE organization_id = $1`, [orgId]);
    expect(count.rows[0].count).toBe(0);
  });

  it('blocks create-missing when a legacy match elsewhere on the bank account has unknown identity', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
       VALUES ('legacy-other-statement', $1, $2, 'import-statement-create', '2026-09-14', 10, 'DEBIT', 'Old line', 'INR', 'legacy-other-fingerprint')`,
      [orgId, bankId],
    );
    await db.query(
      `INSERT INTO bank_reconciliation_matches
        (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ('legacy-unknown-match', $1, 'legacy-other-statement', 'EXPENSE', 'legacy-expense-id', 10, 'MATCHED')`,
      [orgId],
    );
    await expect(BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123'))
      .rejects.toThrow('BANK_LEGACY_ALLOCATION_UNRESOLVED');
    const entries = await db.query(`SELECT COUNT(*)::int AS count FROM journal_entries WHERE organization_id = $1`, [orgId]);
    expect(entries.rows[0].count).toBe(0);
  });

  it('prevents ignore and legacy unmatch from invalidating a canonical statement allocation', async () => {
    const created = await BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123');
    await expect(BankReconciliationService.ignoreTransaction(orgId, statementId, true, actorId))
      .rejects.toThrow('BANK_CANONICAL_ALLOCATION_REQUIRES_AUDITED_UNMATCH');
    await expect(BankReconciliationService.unmatchTransaction(orgId, created.allocationId, actorId))
      .rejects.toThrow('BANK_CANONICAL_ALLOCATION_REQUIRES_AUDITED_UNMATCH');
    const status = await db.query(`SELECT reconciliation_status, is_ignored FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(status.rows[0]).toMatchObject({ reconciliation_status: 'MATCHED', is_ignored: false });
  });

  it('does not close unresolved lines and closes only after exact verified allocation and cutoff balance agree', async () => {
    await expect(BankReconciliationService.completeReconciliationSession(orgId, bankId, '2026-09-15', 0, undefined, [], actorId))
      .rejects.toThrow('BANK_RECONCILIATION_HAS_UNRESOLVED_LINES');
    await BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123');
    await db.query(`UPDATE bank_statement_imports SET closing_balance_verified = FALSE WHERE id = 'import-statement-create'`);
    await expect(BankReconciliationService.completeReconciliationSession(orgId, bankId, '2026-09-15', 0, undefined, [], actorId))
      .rejects.toThrow('BANK_STATEMENT_CLOSING_BALANCE_UNVERIFIED');
    await db.query(`UPDATE bank_statement_imports SET closing_balance_verified = TRUE WHERE id = 'import-statement-create'`);
    await expect(BankReconciliationService.completeReconciliationSession(orgId, bankId, '2026-09-15', -120, undefined, [], actorId))
      .rejects.toThrow('BANK_STATEMENT_CLOSING_BALANCE_MISMATCH');
    await db.query(`UPDATE bank_statement_imports SET closing_balance = -125.50 WHERE id = 'import-statement-create'`);
    await db.query(`UPDATE bank_statement_imports SET balance_discrepancy = 1.00 WHERE id = 'import-statement-create'`);
    await expect(BankReconciliationService.completeReconciliationSession(orgId, bankId, '2026-09-15', -125.5, undefined, [], actorId))
      .rejects.toThrow('BANK_STATEMENT_CONTROL_TOTAL_MISMATCH');
    await db.query(`UPDATE bank_statement_imports SET balance_discrepancy = 0 WHERE id = 'import-statement-create'`);
    const session = await BankReconciliationService.completeReconciliationSession(orgId, bankId, '2026-09-15', -125.5, undefined, [], actorId);
    expect(session).toMatchObject({ status: 'COMPLETED', difference: 0, ledgerBalance: -125.5 });
    const line = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(line.rows[0].reconciliation_status).toBe('RECONCILED');
    await db.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, statement_from, statement_to, closing_balance, closing_balance_verified, balance_discrepancy, status)
       VALUES ('import-statement-create-later', $1, $2, 'CSV', 'later.csv', 'hash-statement-create-later', 'INR', $3, '2026-09-16', '2026-09-30', -125.50, TRUE, 0, 'COMPLETED')`,
      [orgId, bankId, actorId],
    );
    await BankReconciliationService.completeReconciliationSession(orgId, bankId, '2026-09-30', -125.5, undefined, [], actorId);
    await BankReconciliationService.reopenReconciliation(orgId, bankId, actorId);
    const reopened = await db.query(`SELECT statement_end_date, status FROM bank_reconciliation_sessions WHERE organization_id = $1 AND bank_account_id = $2 ORDER BY statement_end_date`, [orgId, bankId]);
    expect(reopened.rows.map((row: any) => row.status)).toEqual(['COMPLETED', 'REOPENED']);
    const cutoff = await db.query(`SELECT reconciled_through_date FROM bank_accounts WHERE organization_id = $1 AND id = $2`, [orgId, bankId]);
    expect(new Date(cutoff.rows[0].reconciled_through_date).toISOString().slice(0, 10)).toBe('2026-09-15');
    const preserved = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(preserved.rows[0].reconciliation_status).toBe('RECONCILED');
  });

  it('reverses a statement-created journal through the linked allocation lifecycle', async () => {
    const created = await BankStatementEntryCreationService.create(orgId, statementId, counterId, actorId, '125.50', 'bank-entry-op-123');
    const reversed = await BankReconciliationService.reverseTransactionCreatedFromStatement(
      orgId, statementId, actorId, 'Imported statement line was categorized incorrectly',
    );
    const allocation = await db.query(
      `SELECT status, allocation_state, creation_origin FROM bank_reconciliation_matches WHERE id = $1`, [created.allocationId],
    );
    expect(reversed.reversalJournalEntryId).toBeTruthy();
    expect(allocation.rows[0]).toMatchObject({ status: 'REVERSED', allocation_state: 'REVERSED', creation_origin: 'STATEMENT_CREATION' });
    const line = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(line.rows[0].reconciliation_status).toBe('UNMATCHED');
  });

  it('registers reconcile permission metadata for idempotent create-missing requests', () => {
    expect(RoutePermissionRegistry.getRequiredPermissions('POST', `/api/v1/banking/transactions/${statementId}/create-missing-entry`))
      .toEqual(['banking.reconcile']);
  });
});
