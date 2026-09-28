import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankStatementReviewService } from '../banking/BankStatementReviewService';
import { BankMovementAllocationService } from '../banking/BankMovementAllocationService';
import { BankStatementEntryCreationService } from '../banking/BankStatementEntryCreationService';
import { BankReconciliationProjectionService } from '../banking/BankReconciliationProjectionService';
import { BankReconciliationService } from '../banking/BankReconciliationService';

describe('BankStatementReviewService', () => {
  const orgId = 'org-statement-review';
  const actorId = 'usr-statement-review';
  const bankId = 'bank-statement-review';
  const bankLedgerId = 'ledger-bank-review';
  const statementId = 'statement-review';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'statement-review@example.test', 'hash', 'Statement Reviewer', 'Active')`, [actorId],
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-statement-review', 'public-statement-review', 'SR', 'Review Test', 'IN', 'INR', '₹', $2)`, [orgId, actorId],
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status, currency_code)
       VALUES ($1, $2, '1001', 'Bank Ledger', 'Asset', 'Bank', 'Active', 'INR')`, [bankLedgerId, orgId],
    );
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active)
       VALUES ($1, $2, $3, 'Operating', '9876', 'Test Bank', 'INR', 'Active', TRUE)`, [bankId, orgId, bankLedgerId],
    );
    await db.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, statement_from, statement_to, closing_balance, status)
       VALUES ('import-statement-review', $1, $2, 'CSV', 'statement.csv', 'review-hash', 'INR', $3, '2026-09-01', '2026-09-30', 0, 'COMPLETED')`, [orgId, bankId, actorId],
    );
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, reference, currency, fingerprint, reconciliation_status)
       VALUES ($1, $2, $3, 'import-statement-review', '2026-09-15', 125.50, 'DEBIT', 'Monthly bank charges', 'REF-125', 'INR', 'fingerprint-review', 'TO_REVIEW')`,
      [statementId, orgId, bankId],
    );
  });

  it('accepts a reviewed imported line and atomically records reviewer provenance and audit evidence', async () => {
    const receipt = await BankStatementReviewService.review(orgId, statementId, 'ACCEPT', [], actorId);
    expect(receipt).toMatchObject({ statementTransactionId: statementId, decision: 'ACCEPT', status: 'UNMATCHED', candidateIds: [] });
    const saved = await db.query(
      `SELECT reconciliation_status, is_ignored, review_decision, reviewed_by, reviewed_at, review_duplicate_candidates
         FROM bank_statement_transactions WHERE organization_id = $1 AND id = $2`, [orgId, statementId],
    );
    expect(saved.rows[0]).toMatchObject({ reconciliation_status: 'UNMATCHED', is_ignored: false, review_decision: 'ACCEPT', reviewed_by: actorId, review_duplicate_candidates: [] });
    expect(saved.rows[0].reviewed_at).toBeTruthy();
    const audit = await db.query(
      `SELECT action, user_id, after_state FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`, [orgId, statementId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({ action: 'BANK_STATEMENT_LINE_REVIEWED', user_id: actorId });
  });

  it('requires the user to acknowledge server-derived similar lines before keeping a possible duplicate', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ('nearby-review-candidate', $1, $2, 'import-statement-review', '2026-09-14', 125.50, 'DEBIT', 'Earlier service fee', 'INR', 'fingerprint-candidate', 'MATCHED')`, [orgId, bankId],
    );
    await db.query(`UPDATE bank_statement_transactions SET reconciliation_status = 'POSSIBLE_DUPLICATE' WHERE id = $1`, [statementId]);
    const candidates = await BankStatementReviewService.getPossibleDuplicates(orgId, statementId);
    expect(candidates.map((candidate) => candidate.id)).toEqual(['nearby-review-candidate']);
    await expect(BankStatementReviewService.review(orgId, statementId, 'KEEP_AS_NEW', [], actorId))
      .rejects.toThrow('BANK_STATEMENT_DUPLICATE_ACK_REQUIRED');
    const kept = await BankStatementReviewService.review(orgId, statementId, 'KEEP_AS_NEW', ['nearby-review-candidate'], actorId);
    expect(kept).toMatchObject({ decision: 'KEEP_AS_NEW', status: 'UNMATCHED', candidateIds: ['nearby-review-candidate'] });
    const saved = await db.query(`SELECT review_decision, review_duplicate_candidates FROM bank_statement_transactions WHERE id = $1`, [statementId]);
    expect(saved.rows[0]).toMatchObject({ review_decision: 'KEEP_AS_NEW', review_duplicate_candidates: ['nearby-review-candidate'] });
  });

  it('records an explicit duplicate disposition with exact bank evidence and actor audit', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, reference, currency, fingerprint, reconciliation_status)
       VALUES ('duplicate-review-target', $1, $2, 'import-statement-review', '2026-09-14', 125.50, 'DEBIT', 'Monthly bank charges', 'REF-125', 'INR', 'fingerprint-target', 'MATCHED')`, [orgId, bankId],
    );
    await db.query(`UPDATE bank_statement_transactions SET reconciliation_status = 'POSSIBLE_DUPLICATE' WHERE id = $1`, [statementId]);
    const disposition = await BankStatementReviewService.confirmDuplicate(
      orgId, statementId, 'duplicate-review-target', 'Same reference and amount in overlapping imports', actorId,
    );
    expect(disposition).toMatchObject({ statementTransactionId: statementId, targetStatementTransactionId: 'duplicate-review-target', status: 'CONFIRMED_DUPLICATE' });
    const saved = await db.query(
      `SELECT kind, target_statement_transaction_id, reason, decided_by, evidence FROM bank_statement_line_dispositions WHERE organization_id = $1 AND id = $2`,
      [orgId, disposition.dispositionId],
    );
    expect(saved.rows[0]).toMatchObject({ kind: 'CONFIRMED_DUPLICATE', target_statement_transaction_id: 'duplicate-review-target', decided_by: actorId });
    expect(saved.rows[0].evidence.source.reference).toBe('REF-125');
    const audited = await db.query(`SELECT action, user_id FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`, [orgId, statementId]);
    expect(audited.rows).toContainEqual(expect.objectContaining({ action: 'BANK_STATEMENT_DUPLICATE_CONFIRMED', user_id: actorId }));
    const projection = await BankReconciliationProjectionService.getProjection(orgId, '2026-09-30');
    expect(projection.accounts[0]?.statementUnresolvedCount).toBe(2);
  });

  it('blocks allocation and new-entry posting for a line with an active duplicate disposition', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ('duplicate-write-target', $1, $2, 'import-statement-review', '2026-09-14', 125.50, 'DEBIT', 'Monthly bank charges', 'INR', 'fingerprint-write-target', 'MATCHED')`, [orgId, bankId],
    );
    await db.query(`UPDATE bank_statement_transactions SET reconciliation_status = 'POSSIBLE_DUPLICATE' WHERE id = $1`, [statementId]);
    await BankStatementReviewService.confirmDuplicate(orgId, statementId, 'duplicate-write-target', 'Same reference and amount in overlapping imports', actorId);
    await expect(BankMovementAllocationService.allocate(orgId, statementId, 'any-journal-line', '125.50', actorId))
      .rejects.toThrow('BANK_STATEMENT_DISPOSITION_ACTIVE');
    await expect(BankStatementEntryCreationService.create(orgId, statementId, 'any-counter-account', actorId, '125.50', 'bank-entry-op-123'))
      .rejects.toThrow('BANK_STATEMENT_DISPOSITION_ACTIVE');
  });

  it('audits duplicate revocation and returns the imported line to review', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ('duplicate-revoke-target', $1, $2, 'import-statement-review', '2026-09-14', 125.50, 'DEBIT', 'Monthly bank charges', 'INR', 'fingerprint-revoke-target', 'MATCHED')`, [orgId, bankId],
    );
    await db.query(`UPDATE bank_statement_transactions SET reconciliation_status = 'POSSIBLE_DUPLICATE' WHERE id = $1`, [statementId]);
    const confirmed = await BankStatementReviewService.confirmDuplicate(orgId, statementId, 'duplicate-revoke-target', 'Same reference and amount in overlapping imports', actorId);
    const revoked = await BankStatementReviewService.revokeDuplicate(orgId, statementId, 'A second bank reference proves these were separate payments', actorId);
    expect(revoked).toMatchObject({ dispositionId: confirmed.dispositionId, statementTransactionId: statementId, status: 'POSSIBLE_DUPLICATE' });
    const saved = await db.query(`SELECT revoked_by, revocation_reason, revoked_at FROM bank_statement_line_dispositions WHERE organization_id = $1 AND id = $2`, [orgId, confirmed.dispositionId]);
    expect(saved.rows[0]).toMatchObject({ revoked_by: actorId, revocation_reason: 'A second bank reference proves these were separate payments' });
    expect(saved.rows[0].revoked_at).toBeTruthy();
    const transaction = await db.query(`SELECT reconciliation_status, review_decision FROM bank_statement_transactions WHERE organization_id = $1 AND id = $2`, [orgId, statementId]);
    expect(transaction.rows[0]).toMatchObject({ reconciliation_status: 'POSSIBLE_DUPLICATE', review_decision: 'REVOKE_DUPLICATE' });
    const audit = await db.query(`SELECT action FROM audit_logs WHERE organization_id = $1 AND entity_id = $2`, [orgId, statementId]);
    expect(audit.rows.map((row: any) => row.action)).toContain('BANK_STATEMENT_DUPLICATE_REVOKED');
  });

  it('blocks close when a duplicate status has only revoked disposition evidence', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ('duplicate-missing-proof-target', $1, $2, 'import-statement-review', '2026-09-14', 125.50, 'DEBIT', 'Monthly bank charges', 'INR', 'fingerprint-missing-proof-target', 'MATCHED')`, [orgId, bankId],
    );
    await db.query(`UPDATE bank_statement_transactions SET reconciliation_status = 'POSSIBLE_DUPLICATE' WHERE id = $1`, [statementId]);
    await BankStatementReviewService.confirmDuplicate(orgId, statementId, 'duplicate-missing-proof-target', 'Same reference and amount in overlapping imports', actorId);
    await BankStatementReviewService.revokeDuplicate(orgId, statementId, 'A second bank reference proves these were separate payments', actorId);
    await db.query(`UPDATE bank_statement_transactions SET reconciliation_status = 'CONFIRMED_DUPLICATE' WHERE id = $1`, [statementId]);
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status, currency_code)
       VALUES ('expense-bank-review', $1, '6001', 'Bank Charges', 'Expense', 'Operating Expense', 'Active', 'INR')`, [orgId],
    );
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, description, status)
       VALUES ('journal-bank-review-target', $1, 'JE-REVIEW-TARGET', '2026-09-15', 'Bank charge', 'Posted')`, [orgId],
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('line-bank-review-expense', 'journal-bank-review-target', $1, 'expense-bank-review', 125.50, 0, 'Bank charge'),
              ('line-bank-review-bank', 'journal-bank-review-target', $1, $2, 0, 125.50, 'Bank charge')`, [orgId, bankLedgerId],
    );
    await db.query(
      `INSERT INTO bank_reconciliation_matches
        (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount,
         match_confidence, match_reasons, matched_by, status, bank_account_id, ledger_account_id, journal_entry_id, journal_line_id,
         identity_state, identity_reason, creation_origin, allocation_state)
       VALUES ('allocation-bank-review-target', $1, 'duplicate-missing-proof-target', 'canonical_journal_line', 'allocation-bank-review-target',
         125.50, 100, '{}', $2, 'MATCHED', $3, $4, 'journal-bank-review-target', 'line-bank-review-bank',
         'VERIFIED', NULL, 'CANONICAL_ALLOCATION', 'ACTIVE')`, [orgId, actorId, bankId, bankLedgerId],
    );
    await db.query(`UPDATE bank_statement_imports SET closing_balance_verified = TRUE, balance_discrepancy = 0, closing_balance = -125.50 WHERE organization_id = $1 AND id = 'import-statement-review'`, [orgId]);
    await expect(BankReconciliationService.completeReconciliationSession(orgId, bankId, '2026-09-30', -125.50, -125.50, [], actorId))
      .rejects.toThrow('BANK_RECONCILIATION_HAS_UNRESOLVED_LINES');
    const sessions = await db.query(`SELECT id FROM bank_reconciliation_sessions WHERE organization_id = $1 AND bank_account_id = $2`, [orgId, bankId]);
    expect(sessions.rows).toHaveLength(0);
  });

  it('does not accept ignored, already allocated, or cutoff-closed statement rows', async () => {
    await db.query(`UPDATE bank_statement_transactions SET is_ignored = TRUE, reconciliation_status = 'IGNORED' WHERE id = $1`, [statementId]);
    await expect(BankStatementReviewService.review(orgId, statementId, 'ACCEPT', [], actorId)).rejects.toThrow('BANK_STATEMENT_IGNORED');
    await db.query(`UPDATE bank_statement_transactions SET is_ignored = FALSE, reconciliation_status = 'TO_REVIEW' WHERE id = $1`, [statementId]);
    await db.query(`UPDATE bank_accounts SET reconciled_through_date = '2026-09-15' WHERE id = $1`, [bankId]);
    await expect(BankStatementReviewService.review(orgId, statementId, 'ACCEPT', [], actorId)).rejects.toThrow('BANK_RECONCILIATION_COMPLETED');
  });
});
