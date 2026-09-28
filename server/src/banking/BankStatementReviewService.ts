import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { databaseMoneyToCents } from '../utils/money';

export type StatementReviewDecision = 'ACCEPT' | 'KEEP_AS_NEW';

export interface PossibleDuplicateCandidate {
  id: string;
  transactionDate: string;
  amount: string;
  direction: string;
  narration: string;
  reference: string | null;
  reconciliationStatus: string;
  currency: string;
  runningBalance: string | null;
  fingerprint: string;
  importId: string;
}

async function takeAllocationLock(client: DbQueryClient, organizationId: string): Promise<void> {
  if (!db.isMemoryMode()) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [organizationId, 'bank-movement-allocations']);
  }
}

async function getCandidates(
  client: DbQueryClient,
  organizationId: string,
  statementTransactionId: string,
): Promise<PossibleDuplicateCandidate[]> {
  const sourceResult = await client.query(
    `SELECT bank_account_id, transaction_date, amount, direction FROM bank_statement_transactions WHERE organization_id = $1 AND id = $2`,
    [organizationId, statementTransactionId],
  );
  if (!sourceResult.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
  const source = sourceResult.rows[0];
  const result = await client.query(
    `SELECT stc.id, stc.transaction_date, stc.amount, stc.direction,
            stc.narration, stc.reference, stc.reconciliation_status,
            stc.currency, stc.running_balance, stc.fingerprint,
            stc.statement_import_id
       FROM bank_statement_transactions stc
      JOIN bank_statement_imports imp ON imp.organization_id = $1
        AND imp.id = stc.statement_import_id AND UPPER(COALESCE(imp.status, '')) = 'COMPLETED'
      LEFT JOIN bank_statement_line_dispositions d ON d.organization_id = $1
        AND d.statement_transaction_id = stc.id AND d.revoked_at IS NULL
      WHERE stc.organization_id = $1 AND stc.bank_account_id = $3 AND stc.id <> $2
        AND stc.amount = $4 AND stc.direction = $5
        AND stc.transaction_date BETWEEN $6::date - INTERVAL '3 days' AND $6::date + INTERVAL '3 days'
        AND UPPER(COALESCE(stc.reconciliation_status, '')) NOT IN ('IGNORED','POSSIBLE_DUPLICATE','CONFIRMED_DUPLICATE','PROVEN_ARTIFACT')
        AND COALESCE(stc.is_ignored, FALSE) = FALSE AND d.id IS NULL
      ORDER BY stc.transaction_date, stc.id
      LIMIT 26`,
    [organizationId, statementTransactionId, source.bank_account_id, source.amount, source.direction, dateKey(source.transaction_date)],
  );
  if (result.rows.length > 25) throw new Error('BANK_STATEMENT_DUPLICATE_CANDIDATES_TOO_MANY');
  return result.rows.map((row: any) => ({
    id: String(row.id),
    transactionDate: row.transaction_date instanceof Date ? row.transaction_date.toISOString().slice(0, 10) : String(row.transaction_date).slice(0, 10),
    amount: String(row.amount),
    direction: String(row.direction),
    narration: String(row.narration || ''),
    reference: row.reference == null ? null : String(row.reference),
    reconciliationStatus: String(row.reconciliation_status || ''),
    currency: String(row.currency || '').toUpperCase(),
    runningBalance: row.running_balance == null ? null : String(row.running_balance),
    fingerprint: String(row.fingerprint || ''),
    importId: String(row.statement_import_id || ''),
  }));
}

function dateKey(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

export class BankStatementReviewService {
  public static async getPossibleDuplicates(organizationId: string, statementTransactionId: string): Promise<PossibleDuplicateCandidate[]> {
    return db.transaction(async (client) => {
      const source = await client.query(
        `SELECT id, reconciliation_status FROM bank_statement_transactions WHERE organization_id = $1 AND id = $2`,
        [organizationId, statementTransactionId],
      );
      if (!source.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      if (String(source.rows[0].reconciliation_status || '').toUpperCase() !== 'POSSIBLE_DUPLICATE') throw new Error('BANK_STATEMENT_REVIEW_STATE_INVALID');
      return getCandidates(client, organizationId, statementTransactionId);
    }, { organizationId });
  }

  public static async confirmDuplicate(
    organizationId: string,
    statementTransactionId: string,
    targetStatementTransactionId: string,
    reasonValue: string,
    actorId: string,
  ): Promise<{ dispositionId: string; statementTransactionId: string; targetStatementTransactionId: string; status: 'CONFIRMED_DUPLICATE' }> {
    const reason = String(reasonValue || '').trim();
    if (!actorId) throw new Error('BANK_STATEMENT_REVIEW_ACTOR_REQUIRED');
    if (statementTransactionId === targetStatementTransactionId) throw new Error('BANK_STATEMENT_DUPLICATE_TARGET_INVALID');
    if (reason.length < 10 || reason.length > 1000) throw new Error('BANK_STATEMENT_DISPOSITION_REASON_INVALID');
    return db.transaction(async (client) => {
      await takeAllocationLock(client, organizationId);
      const lockedRows = await client.query(
        `SELECT id FROM bank_statement_transactions WHERE organization_id = $1 AND id IN ($2, $3)
          ORDER BY id ${db.isMemoryMode() ? '' : 'FOR UPDATE'}`,
        [organizationId, statementTransactionId, targetStatementTransactionId],
      );
      if (lockedRows.rows.length !== 2) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      const lines = await client.query(
        `SELECT st.id, st.bank_account_id, st.statement_import_id, st.transaction_date, st.amount,
                st.direction, st.currency, st.running_balance, st.narration, st.reference,
                st.utr, st.rrn, st.upi_reference, st.cheque_number, st.fingerprint,
                st.reconciliation_status, st.is_ignored, bi.status AS import_status,
                ba.reconciled_through_date
           FROM bank_statement_transactions st
           JOIN bank_statement_imports bi ON bi.organization_id = st.organization_id AND bi.id = st.statement_import_id
           JOIN bank_accounts ba ON ba.organization_id = st.organization_id AND ba.id = st.bank_account_id
          WHERE st.organization_id = $1 AND st.id IN ($2, $3)
          ORDER BY st.id`,
        [organizationId, statementTransactionId, targetStatementTransactionId],
      );
      const source = lines.rows.find((row: any) => String(row.id) === statementTransactionId);
      const target = lines.rows.find((row: any) => String(row.id) === targetStatementTransactionId);
      if (!source || !target) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      if (String(source.reconciliation_status || '').toUpperCase() !== 'POSSIBLE_DUPLICATE' || source.is_ignored === true) throw new Error('BANK_STATEMENT_REVIEW_STATE_INVALID');
      if (String(source.import_status || '').toUpperCase() !== 'COMPLETED' || String(target.import_status || '').toUpperCase() !== 'COMPLETED') throw new Error('BANK_STATEMENT_IMPORT_NOT_COMPLETE');
      if (source.bank_account_id !== target.bank_account_id || String(source.direction).toUpperCase() !== String(target.direction).toUpperCase() ||
          String(source.currency || '').toUpperCase() !== String(target.currency || '').toUpperCase() ||
          databaseMoneyToCents(source.amount, 'STATEMENT') !== databaseMoneyToCents(target.amount, 'STATEMENT')) throw new Error('BANK_STATEMENT_DUPLICATE_TARGET_INVALID');
      if (['IGNORED', 'POSSIBLE_DUPLICATE', 'CONFIRMED_DUPLICATE', 'PROVEN_ARTIFACT'].includes(String(target.reconciliation_status || '').toUpperCase()) || target.is_ignored === true) {
        throw new Error('BANK_STATEMENT_DUPLICATE_TARGET_INVALID');
      }
      const sourceDate = dateKey(source.transaction_date);
      const targetDate = dateKey(target.transaction_date);
      if (Math.abs(Date.parse(`${sourceDate}T00:00:00Z`) - Date.parse(`${targetDate}T00:00:00Z`)) > 3 * 86400000) throw new Error('BANK_STATEMENT_DUPLICATE_TARGET_INVALID');
      const cutoff = source.reconciled_through_date == null ? null : dateKey(source.reconciled_through_date);
      if (cutoff && sourceDate <= cutoff) throw new Error('BANK_RECONCILIATION_COMPLETED');
      const completed = await client.query(
        `SELECT id FROM bank_reconciliation_sessions WHERE organization_id = $1 AND bank_account_id = $2
          AND statement_end_date >= $3 AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'RECONCILED') LIMIT 1`,
        [organizationId, source.bank_account_id, source.transaction_date],
      );
      if (completed.rows.length) throw new Error('BANK_RECONCILIATION_COMPLETED');
      const existing = await client.query(
        `SELECT id FROM bank_reconciliation_matches WHERE organization_id = $1 AND statement_transaction_id = $2
          AND (allocation_state = 'ACTIVE' OR (allocation_state = 'LEGACY' AND COALESCE(status, '') NOT IN ('REJECTED','REVERSED','UNMATCHED'))) LIMIT 1`,
        [organizationId, statementTransactionId],
      );
      if (existing.rows.length) throw new Error('BANK_STATEMENT_ALREADY_ALLOCATED');
      const hasDependents = await client.query(
        `SELECT id FROM bank_statement_line_dispositions WHERE organization_id = $1
          AND target_statement_transaction_id = $2 AND kind = 'CONFIRMED_DUPLICATE' AND revoked_at IS NULL LIMIT 1`,
        [organizationId, statementTransactionId],
      );
      if (hasDependents.rows.length) throw new Error('BANK_STATEMENT_DUPLICATE_HAS_DEPENDENTS');
      const targetDisposition = await client.query(
        `SELECT id FROM bank_statement_line_dispositions WHERE organization_id = $1
          AND statement_transaction_id = $2 AND revoked_at IS NULL LIMIT 1`,
        [organizationId, targetStatementTransactionId],
      );
      if (targetDisposition.rows.length) throw new Error('BANK_STATEMENT_DUPLICATE_TARGET_INVALID');
      const candidates = await getCandidates(client, organizationId, statementTransactionId);
      if (!candidates.some((candidate) => candidate.id === targetStatementTransactionId)) throw new Error('BANK_STATEMENT_DUPLICATE_TARGET_CHANGED');
      const dispositionId = newId('bsd');
      const evidence = {
        comparedAt: new Date().toISOString(),
        source: { id: source.id, importId: source.statement_import_id, date: sourceDate, amount: String(source.amount), direction: source.direction, currency: source.currency, runningBalance: source.running_balance, narration: source.narration, reference: source.reference, utr: source.utr, rrn: source.rrn, upiReference: source.upi_reference, chequeNumber: source.cheque_number, fingerprint: source.fingerprint },
        target: { id: target.id, importId: target.statement_import_id, date: targetDate, amount: String(target.amount), direction: target.direction, currency: target.currency, runningBalance: target.running_balance, narration: target.narration, reference: target.reference, utr: target.utr, rrn: target.rrn, upiReference: target.upi_reference, chequeNumber: target.cheque_number, fingerprint: target.fingerprint },
      };
      await client.query(
        `INSERT INTO bank_statement_line_dispositions
          (id, organization_id, bank_account_id, statement_transaction_id, kind, target_statement_transaction_id, reason, evidence, decided_by)
         VALUES ($1, $2, $3, $4, 'CONFIRMED_DUPLICATE', $5, $6, $7::jsonb, $8)`,
        [dispositionId, organizationId, source.bank_account_id, statementTransactionId, targetStatementTransactionId, reason, JSON.stringify(evidence), actorId],
      );
      await client.query(
        `UPDATE bank_statement_transactions SET reconciliation_status = 'CONFIRMED_DUPLICATE', is_ignored = FALSE,
                review_decision = 'CONFIRMED_DUPLICATE', reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP
          WHERE organization_id = $2 AND id = $3`,
        [actorId, organizationId, statementTransactionId],
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'BANK_STATEMENT_DUPLICATE_CONFIRMED', 'BankStatementTransaction', $4, $5::jsonb, $6::jsonb)`,
        [newId('aud'), organizationId, actorId, statementTransactionId,
          JSON.stringify({ status: source.reconciliation_status, targetStatementTransactionId }),
          JSON.stringify({ status: 'CONFIRMED_DUPLICATE', dispositionId, targetStatementTransactionId, reason, evidence })],
      );
      return { dispositionId, statementTransactionId, targetStatementTransactionId, status: 'CONFIRMED_DUPLICATE' };
    }, { organizationId });
  }

  public static async revokeDuplicate(
    organizationId: string,
    statementTransactionId: string,
    reasonValue: string,
    actorId: string,
  ): Promise<{ dispositionId: string; statementTransactionId: string; status: 'POSSIBLE_DUPLICATE' }> {
    const reason = String(reasonValue || '').trim();
    if (!actorId) throw new Error('BANK_STATEMENT_REVIEW_ACTOR_REQUIRED');
    if (reason.length < 10 || reason.length > 1000) throw new Error('BANK_STATEMENT_DISPOSITION_REASON_INVALID');
    return db.transaction(async (client) => {
      await takeAllocationLock(client, organizationId);
      const lineResult = await client.query(
        `SELECT st.id, st.bank_account_id, st.transaction_date, st.reconciliation_status, ba.reconciled_through_date
           FROM bank_statement_transactions st JOIN bank_accounts ba ON ba.organization_id = st.organization_id AND ba.id = st.bank_account_id
          WHERE st.organization_id = $1 AND st.id = $2 ${db.isMemoryMode() ? '' : 'FOR UPDATE OF st, ba'}`,
        [organizationId, statementTransactionId],
      );
      if (!lineResult.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      const line = lineResult.rows[0];
      if (String(line.reconciliation_status || '').toUpperCase() !== 'CONFIRMED_DUPLICATE') throw new Error('BANK_STATEMENT_REVIEW_STATE_INVALID');
      const cutoff = line.reconciled_through_date == null ? null : dateKey(line.reconciled_through_date);
      if (cutoff && dateKey(line.transaction_date) <= cutoff) throw new Error('BANK_RECONCILIATION_COMPLETED');
      const completed = await client.query(
        `SELECT id FROM bank_reconciliation_sessions WHERE organization_id = $1 AND bank_account_id = $2
          AND statement_end_date >= $3 AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'RECONCILED') LIMIT 1`,
        [organizationId, line.bank_account_id, line.transaction_date],
      );
      if (completed.rows.length) throw new Error('BANK_RECONCILIATION_COMPLETED');
      const disposition = await client.query(
        `SELECT id, target_statement_transaction_id, reason FROM bank_statement_line_dispositions
          WHERE organization_id = $1 AND statement_transaction_id = $2 AND kind = 'CONFIRMED_DUPLICATE' AND revoked_at IS NULL
          ${db.isMemoryMode() ? '' : 'FOR UPDATE'}`,
        [organizationId, statementTransactionId],
      );
      if (!disposition.rows.length) throw new Error('BANK_STATEMENT_DISPOSITION_NOT_FOUND');
      const id = String(disposition.rows[0].id);
      await client.query(
        `UPDATE bank_statement_line_dispositions SET revoked_by = $1, revoked_at = CURRENT_TIMESTAMP, revocation_reason = $2
          WHERE organization_id = $3 AND id = $4 AND revoked_at IS NULL`,
        [actorId, reason, organizationId, id],
      );
      await client.query(
        `UPDATE bank_statement_transactions SET reconciliation_status = 'POSSIBLE_DUPLICATE', review_decision = 'REVOKE_DUPLICATE',
                reviewed_by = $1, reviewed_at = CURRENT_TIMESTAMP WHERE organization_id = $2 AND id = $3`,
        [actorId, organizationId, statementTransactionId],
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'BANK_STATEMENT_DUPLICATE_REVOKED', 'BankStatementTransaction', $4, $5::jsonb, $6::jsonb)`,
        [newId('aud'), organizationId, actorId, statementTransactionId,
          JSON.stringify({ dispositionId: id, targetStatementTransactionId: disposition.rows[0].target_statement_transaction_id, reason: disposition.rows[0].reason }),
          JSON.stringify({ status: 'POSSIBLE_DUPLICATE', revocationReason: reason })],
      );
      return { dispositionId: id, statementTransactionId, status: 'POSSIBLE_DUPLICATE' };
    }, { organizationId });
  }

  public static async review(
    organizationId: string,
    statementTransactionId: string,
    decision: StatementReviewDecision,
    acknowledgedCandidateIds: string[],
    actorId: string,
  ): Promise<{ statementTransactionId: string; decision: StatementReviewDecision; status: 'UNMATCHED'; candidateIds: string[] }> {
    if (!actorId) throw new Error('BANK_STATEMENT_REVIEW_ACTOR_REQUIRED');
    if (!['ACCEPT', 'KEEP_AS_NEW'].includes(decision)) throw new Error('BANK_STATEMENT_REVIEW_DECISION_INVALID');
    if (!Array.isArray(acknowledgedCandidateIds) || acknowledgedCandidateIds.length > 25 || acknowledgedCandidateIds.some((id) => typeof id !== 'string' || id.length > 64)) {
      throw new Error('BANK_STATEMENT_REVIEW_CANDIDATES_INVALID');
    }

    return db.transaction(async (client) => {
      // The middleware acquires this before its idempotency row; repeat here for
      // direct service callers and to serialize against imports, allocations,
      // posting cutoffs, and period close.
      await takeAllocationLock(client, organizationId);
      const locked = await client.query(
        `SELECT st.id, st.bank_account_id, st.statement_import_id, st.transaction_date, st.amount,
                st.direction, st.fingerprint, st.reconciliation_status, st.is_ignored,
                st.review_decision, bi.status AS import_status, ba.is_active, ba.is_archived,
                ba.status AS bank_status, ba.reconciled_through_date
           FROM bank_statement_transactions st
           JOIN bank_statement_imports bi ON bi.id = st.statement_import_id AND bi.organization_id = st.organization_id
           JOIN bank_accounts ba ON ba.id = st.bank_account_id AND ba.organization_id = st.organization_id
          WHERE st.organization_id = $1 AND st.id = $2
          ${db.isMemoryMode() ? '' : 'FOR UPDATE OF st, bi, ba'}`,
        [organizationId, statementTransactionId],
      );
      if (!locked.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      const statement = locked.rows[0];
      const currentStatus = String(statement.reconciliation_status || '').toUpperCase();
      if (String(statement.import_status || '').toUpperCase() !== 'COMPLETED') throw new Error('BANK_STATEMENT_IMPORT_NOT_COMPLETE');
      if (statement.is_active !== true || statement.is_archived === true || String(statement.bank_status || '').toUpperCase() !== 'ACTIVE') {
        throw new Error('BANK_ACCOUNT_INACTIVE');
      }
      if (statement.is_ignored === true || currentStatus === 'IGNORED') throw new Error('BANK_STATEMENT_IGNORED');
      if (statement.reconciled_through_date && dateKey(statement.transaction_date) <= dateKey(statement.reconciled_through_date)) {
        throw new Error('BANK_RECONCILIATION_COMPLETED');
      }
      const completed = await client.query(
        `SELECT id FROM bank_reconciliation_sessions
          WHERE organization_id = $1 AND bank_account_id = $2 AND statement_end_date >= $3
            AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'RECONCILED') LIMIT 1`,
        [organizationId, statement.bank_account_id, statement.transaction_date],
      );
      if (completed.rows.length) throw new Error('BANK_RECONCILIATION_COMPLETED');
      const allocations = await client.query(
        `SELECT id FROM bank_reconciliation_matches WHERE organization_id = $1 AND statement_transaction_id = $2
          AND (allocation_state = 'ACTIVE' OR (allocation_state = 'LEGACY' AND COALESCE(status, '') NOT IN ('REJECTED','REVERSED','UNMATCHED')))
          LIMIT 1`,
        [organizationId, statementTransactionId],
      );
      if (allocations.rows.length) throw new Error('BANK_STATEMENT_ALREADY_ALLOCATED');

      const candidates = decision === 'KEEP_AS_NEW'
        ? await getCandidates(client, organizationId, statementTransactionId)
        : [];
      const candidateIds = candidates.map((candidate) => candidate.id).sort();
      const acknowledged = [...new Set(acknowledgedCandidateIds)].sort();
      if (decision === 'KEEP_AS_NEW') {
        if (currentStatus !== 'POSSIBLE_DUPLICATE') throw new Error('BANK_STATEMENT_REVIEW_STATE_INVALID');
        if (candidateIds.length === 0 || JSON.stringify(candidateIds) !== JSON.stringify(acknowledged)) {
          throw new Error('BANK_STATEMENT_DUPLICATE_ACK_REQUIRED');
        }
      } else if (!['TO_REVIEW', 'RECOGNIZED'].includes(currentStatus)) {
        throw new Error('BANK_STATEMENT_REVIEW_STATE_INVALID');
      }

      await client.query(
        `UPDATE bank_statement_transactions
            SET reconciliation_status = 'UNMATCHED', is_ignored = FALSE,
                review_decision = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP,
                review_duplicate_candidates = $3::jsonb
          WHERE organization_id = $4 AND id = $5`,
        [decision, actorId, JSON.stringify(candidateIds), organizationId, statementTransactionId],
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1, $2, $3, 'BANK_STATEMENT_LINE_REVIEWED', 'BankStatementTransaction', $4, $5::jsonb)`,
        [newId('aud'), organizationId, actorId, statementTransactionId, JSON.stringify({
          before: { status: currentStatus, isIgnored: statement.is_ignored === true },
          after: { status: 'UNMATCHED', isIgnored: false, decision },
          bankAccountId: statement.bank_account_id,
          importId: statement.statement_import_id,
          transactionDate: statement.transaction_date,
          amount: statement.amount,
          direction: statement.direction,
          fingerprint: statement.fingerprint,
          candidateIds,
        })],
      );
      return { statementTransactionId, decision, status: 'UNMATCHED', candidateIds };
    }, { organizationId });
  }
}
