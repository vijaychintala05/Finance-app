import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankLegacyAllocationVerificationService } from '../banking/BankLegacyAllocationVerificationService';
import { BankReconciliationService } from '../banking/BankReconciliationService';

describe('BankLegacyAllocationVerificationService', () => {
  const orgId = 'org-legacy-verify';
  const actorId = 'usr-legacy-verify';
  const bankId = 'bank-legacy-verify';
  const ledgerId = 'ledger-legacy-verify';
  const statementId = 'statement-legacy-verify';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(`INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, 'legacy@test', 'hash', 'Legacy User', 'Active')`, [actorId]);
    await db.query(`INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
      VALUES ($1, 'uuid-legacy', 'public-legacy', 'LG', 'Legacy', 'IN', 'INR', '₹', $2)`, [orgId, actorId]);
    await db.query(`INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status, currency_code)
      VALUES ($1, $2, '1001', 'Bank ledger', 'Asset', 'Bank', 'Active', 'INR')`, [ledgerId, orgId]);
    await db.query(`INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status, currency_code)
      VALUES ('contra-legacy', $1, '4001', 'Receipt offset', 'Income', 'Other', 'Active', 'INR')`, [orgId]);
    await db.query(`INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active)
      VALUES ($1, $2, $3, 'Operating', '1234', 'Test Bank', 'INR', 'Active', TRUE)`, [bankId, orgId, ledgerId]);
    await db.query(`INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, status)
      VALUES ('import-legacy', $1, $2, 'CSV', 'statement.csv', 'legacy-hash', 'INR', $3, 'COMPLETED')`, [orgId, bankId, actorId]);
    await db.query(`INSERT INTO bank_statement_transactions (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
      VALUES ($1, $2, $3, 'import-legacy', '2026-09-15', 100, 'CREDIT', 'Deposit', 'INR', 'legacy-fingerprint')`, [statementId, orgId, bankId]);
    await db.query(`INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
      VALUES ('journal-legacy', $1, 'JE-LEGACY', '2026-09-14', 'Receipt', 'Posted')`, [orgId]);
    await db.query(`INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
      VALUES ('line-legacy', 'journal-legacy', $1, $2, 100, 0, 'Bank side'),
             ('line-legacy-offset', 'journal-legacy', $1, 'contra-legacy', 0, 100, 'Receipt offset')`, [orgId, ledgerId]);
    await db.query(`INSERT INTO bank_reconciliation_matches
      (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
      VALUES ('legacy-match', $1, $2, 'journal', 'journal-legacy', 100, 'MATCHED')`, [orgId, statementId]);
  });

  it('verifies a uniquely provable match in place and atomically records status and audit', async () => {
    const candidate = await BankLegacyAllocationVerificationService.getCandidate(orgId, statementId, 'legacy-match');
    expect(candidate).toMatchObject({ matchId: 'legacy-match', journalLineId: 'line-legacy', entryNumber: 'JE-LEGACY' });
    await BankLegacyAllocationVerificationService.verify(orgId, statementId, 'legacy-match', 'line-legacy', 'Confirmed against the posted receipt', actorId);
    const saved = await db.query(`SELECT allocation_state, identity_state, creation_origin, journal_line_id FROM bank_reconciliation_matches WHERE id = 'legacy-match'`);
    expect(saved.rows[0]).toMatchObject({ allocation_state: 'ACTIVE', identity_state: 'VERIFIED', creation_origin: 'LEGACY_VERIFIED', journal_line_id: 'line-legacy' });
    const status = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(status.rows[0].reconciliation_status).toBe('MATCHED');
    const audit = await db.query(`SELECT action FROM audit_logs WHERE entity_id = 'legacy-match'`);
    expect(audit.rows.map((row: any) => row.action)).toContain('BANK_LEGACY_ALLOCATION_VERIFIED');
  });

  it('keeps unsupported invoice matches unresolved', async () => {
    await db.query(`UPDATE bank_reconciliation_matches SET accounting_transaction_type = 'invoice' WHERE id = 'legacy-match'`);
    await expect(BankLegacyAllocationVerificationService.getCandidate(orgId, statementId, 'legacy-match')).rejects.toThrow('BANK_LEGACY_MATCH_SOURCE_UNSUPPORTED');
  });

  it('rejects a locked accounting period without changing the legacy match', async () => {
    await db.query(`INSERT INTO period_locks (id, organization_id, year, month, is_locked, status) VALUES ('period-legacy', $1, 2026, 9, TRUE, 'Active')`, [orgId]);
    await expect(BankLegacyAllocationVerificationService.verify(orgId, statementId, 'legacy-match', 'line-legacy', 'Confirmed against posted receipt', actorId))
      .rejects.toThrow('BANK_BOOK_MOVEMENT_PERIOD_LOCKED');
    const match = await db.query(`SELECT allocation_state, identity_state FROM bank_reconciliation_matches WHERE id = 'legacy-match'`);
    expect(match.rows[0]).toMatchObject({ allocation_state: 'LEGACY', identity_state: 'LEGACY_UNRESOLVED' });
    const audit = await db.query(`SELECT id FROM audit_logs WHERE entity_id = 'legacy-match'`);
    expect(audit.rows).toHaveLength(0);
  });

  it('preserves statement-created ownership when legacy evidence proves CREATE_FROM_BANK', async () => {
    await db.query(`UPDATE bank_reconciliation_matches SET accounting_transaction_type = 'journal',
      match_reasons = '[{"code":"CREATE_FROM_BANK"}]' WHERE id = 'legacy-match'`);
    const candidate = await BankLegacyAllocationVerificationService.getCandidate(orgId, statementId, 'legacy-match');
    expect(candidate.creationOrigin).toBe('STATEMENT_CREATION');
    await BankLegacyAllocationVerificationService.verify(orgId, statementId, 'legacy-match', 'line-legacy', 'Confirmed against posted receipt', actorId);
    const saved = await db.query(`SELECT creation_origin FROM bank_reconciliation_matches WHERE id = 'legacy-match'`);
    expect(saved.rows[0].creation_origin).toBe('STATEMENT_CREATION');
    const reversed = await BankReconciliationService.reverseTransactionCreatedFromStatement(orgId, statementId, actorId, 'Original statement categorization was incorrect');
    expect(reversed.reversalJournalEntryId).toBeTruthy();
    const match = await db.query(`SELECT status, allocation_state, creation_origin FROM bank_reconciliation_matches WHERE id = 'legacy-match'`);
    expect(match.rows[0]).toMatchObject({ status: 'REVERSED', allocation_state: 'REVERSED', creation_origin: 'STATEMENT_CREATION' });
    const statement = await db.query(`SELECT reconciliation_status FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(statement.rows[0].reconciliation_status).toBe('UNMATCHED');
    const reversal = await db.query(`SELECT reversal_of_journal_id, status FROM journal_entries WHERE id = $1`, [reversed.reversalJournalEntryId]);
    expect(reversal.rows[0]).toMatchObject({ reversal_of_journal_id: 'journal-legacy', status: 'Posted' });
  });

  it('refuses to verify legacy amounts whose aggregate exceeds statement capacity', async () => {
    await db.query(`UPDATE bank_reconciliation_matches SET matched_amount = 60 WHERE id = 'legacy-match'`);
    await db.query(`INSERT INTO bank_reconciliation_matches
      (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
      VALUES ('legacy-match-2', $1, $2, 'journal', 'journal-legacy', 60, 'MATCHED')`, [orgId, statementId]);
    await expect(BankLegacyAllocationVerificationService.getCandidate(orgId, statementId, 'legacy-match'))
      .rejects.toThrow('BANK_STATEMENT_CAPACITY_EXCEEDED');
  });
});
