import { db, type DbQueryClient } from '../database/db';
import { databaseMoneyToCents } from '../utils/money';
import { newId } from '../utils/ids';

export interface LegacyAllocationCandidate {
  matchId: string;
  statementTransactionId: string;
  journalEntryId: string;
  journalLineId: string;
  entryNumber: string;
  journalDate: string;
  matchedAmount: string;
  lineCapacity: string;
  sourceType: string;
  sourceId: string;
  creationOrigin: 'LEGACY_VERIFIED' | 'STATEMENT_CREATION';
}

const SOURCE_JOURNAL_QUERIES: Record<string, string> = {
  payment_received: 'SELECT journal_entry_id FROM payments_received WHERE organization_id = $1 AND id = $2',
  payment_made: 'SELECT journal_entry_id FROM payments_made WHERE organization_id = $1 AND id = $2',
  expense: 'SELECT journal_entry_id FROM expenses WHERE organization_id = $1 AND id = $2',
  customer_refund: 'SELECT journal_entry_id FROM customer_refunds WHERE organization_id = $1 AND id = $2',
  vendor_refund: 'SELECT journal_entry_id FROM vendor_refunds WHERE organization_id = $1 AND id = $2',
  transfer: "SELECT journal_entry_id FROM bank_transfers WHERE organization_id = $1 AND id = $2 AND UPPER(COALESCE(status, '')) = 'POSTED'",
  journal: 'SELECT id AS journal_entry_id FROM journal_entries WHERE organization_id = $1 AND id = $2',
};

async function acquireLock(client: DbQueryClient, organizationId: string): Promise<void> {
  if (!db.isMemoryMode()) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [organizationId, 'bank-movement-allocations']);
  }
}

function dateOnly(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
}

async function resolveSourceJournal(client: DbQueryClient, organizationId: string, match: any): Promise<string> {
  const type = String(match.accounting_transaction_type || '').toLowerCase();
  const query = SOURCE_JOURNAL_QUERIES[type];
  if (!query) throw new Error('BANK_LEGACY_MATCH_SOURCE_UNSUPPORTED');
  const result = await client.query(query, [organizationId, match.accounting_transaction_id]);
  if (result.rows.length !== 1 || !result.rows[0].journal_entry_id) throw new Error('BANK_LEGACY_MATCH_SOURCE_UNVERIFIABLE');
  return String(result.rows[0].journal_entry_id);
}

async function deriveCandidate(
  client: DbQueryClient,
  organizationId: string,
  statementTransactionId: string,
  matchId: string,
): Promise<LegacyAllocationCandidate> {
  const matchResult = await client.query(
    `SELECT m.id, m.statement_transaction_id, m.accounting_transaction_type, m.accounting_transaction_id,
            m.matched_amount, m.allocation_state, m.identity_state, m.status, m.match_reasons,
            st.bank_account_id, st.transaction_date, st.amount AS statement_amount, st.direction, st.currency,
            ba.ledger_account_id, ba.currency AS bank_currency, a.currency_code AS ledger_currency, o.base_currency,
            bi.status AS import_status, st.is_ignored, st.reconciliation_status, st.statement_import_id,
            ba.is_active AS bank_is_active, ba.is_archived AS bank_is_archived, ba.status AS bank_status,
            ba.reconciled_through_date
       FROM bank_reconciliation_matches m
       JOIN bank_statement_transactions st ON st.organization_id = m.organization_id AND st.id = m.statement_transaction_id
       JOIN bank_accounts ba ON ba.organization_id = st.organization_id AND ba.id = st.bank_account_id
       JOIN organizations o ON o.id = st.organization_id
       LEFT JOIN accounts a ON a.organization_id = ba.organization_id AND a.id = ba.ledger_account_id
       JOIN bank_statement_imports bi ON bi.organization_id = st.organization_id AND bi.id = st.statement_import_id
      WHERE m.organization_id = $1 AND st.id = $2 AND m.id = $3`,
    [organizationId, statementTransactionId, matchId],
  );
  if (!matchResult.rows.length) throw new Error('BANK_LEGACY_MATCH_NOT_FOUND');
  const match = matchResult.rows[0];
  if (match.allocation_state !== 'LEGACY' || match.identity_state !== 'LEGACY_UNRESOLVED' ||
      ['REJECTED', 'REVERSED', 'UNMATCHED'].includes(String(match.status || '').toUpperCase())) {
    throw new Error('BANK_LEGACY_MATCH_STATE_INVALID');
  }
  if (String(match.import_status || '').toUpperCase() !== 'COMPLETED') throw new Error('BANK_STATEMENT_IMPORT_NOT_COMPLETE');
  if (match.is_ignored === true || ['RECONCILED', 'CONFIRMED_DUPLICATE', 'PROVEN_ARTIFACT', 'IGNORED'].includes(String(match.reconciliation_status || '').toUpperCase())) {
    throw new Error('BANK_STATEMENT_REVIEW_REQUIRED');
  }
  if (match.bank_is_active !== true || match.bank_is_archived === true || String(match.bank_status || '').toUpperCase() !== 'ACTIVE') {
    throw new Error('BANK_ACCOUNT_INACTIVE');
  }
  const sharedProfiles = await client.query(
    `SELECT id FROM bank_accounts WHERE organization_id = $1 AND ledger_account_id = $2
      AND is_active = TRUE AND UPPER(COALESCE(status, '')) = 'ACTIVE' AND COALESCE(is_archived, FALSE) = FALSE LIMIT 2`,
    [organizationId, match.ledger_account_id],
  );
  if (sharedProfiles.rows.length > 1) throw new Error('BANK_LEDGER_PROFILE_AMBIGUOUS');
  if (match.reconciled_through_date && dateOnly(match.transaction_date) <= dateOnly(match.reconciled_through_date)) {
    throw new Error('BANK_RECONCILIATION_COMPLETED');
  }
  if (!match.ledger_account_id) throw new Error('BANK_LEDGER_ACCOUNT_NOT_LINKED');
  const currency = String(match.currency || '').toUpperCase();
  if (!currency || currency !== String(match.bank_currency || '').toUpperCase() ||
      currency !== String(match.ledger_currency || match.base_currency || '').toUpperCase() ||
      currency !== String(match.base_currency || '').toUpperCase()) throw new Error('BANK_CURRENCY_UNSUPPORTED');
  const amountCents = databaseMoneyToCents(match.matched_amount, 'legacyMatchAmount');
  if (amountCents <= 0n || amountCents > databaseMoneyToCents(match.statement_amount, 'statementAmount')) {
    throw new Error('BANK_LEGACY_MATCH_AMOUNT_INVALID');
  }
  const disposition = await client.query(
    `SELECT id FROM bank_statement_line_dispositions WHERE organization_id = $1 AND statement_transaction_id = $2 AND revoked_at IS NULL LIMIT 1`,
    [organizationId, statementTransactionId],
  );
  if (disposition.rows.length) throw new Error('BANK_STATEMENT_DISPOSITION_ACTIVE');
  const closed = await client.query(
    `SELECT id FROM bank_reconciliation_sessions WHERE organization_id = $1 AND bank_account_id = $2
       AND statement_end_date >= $3 AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'RECONCILED') LIMIT 1`,
    [organizationId, match.bank_account_id, dateOnly(match.transaction_date)],
  );
  if (closed.rows.length) throw new Error('BANK_RECONCILIATION_COMPLETED');
  const journalEntryId = await resolveSourceJournal(client, organizationId, match);
  const entry = await client.query(
    `SELECT id, date, entry_number, reversal_of_journal_id, reversed_by_journal_id FROM journal_entries
      WHERE organization_id = $1 AND id = $2 AND UPPER(COALESCE(status, '')) = 'POSTED'`,
    [organizationId, journalEntryId],
  );
  if (entry.rows.length !== 1 || dateOnly(entry.rows[0].date) > dateOnly(match.transaction_date) ||
      entry.rows[0].reversal_of_journal_id || entry.rows[0].reversed_by_journal_id) {
    throw new Error('BANK_LEGACY_MATCH_JOURNAL_INVALID');
  }
  const periodLock = await client.query(
    `SELECT id FROM period_locks WHERE organization_id = $1 AND COALESCE(is_locked, FALSE) = TRUE
      AND ((year = EXTRACT(YEAR FROM $2::date)::int AND month = EXTRACT(MONTH FROM $2::date)::int)
        OR (lock_date IS NOT NULL AND lock_date >= $2::date AND COALESCE(status, 'Active') = 'Active')) LIMIT 1`,
    [organizationId, dateOnly(entry.rows[0].date)],
  );
  if (periodLock.rows.length) throw new Error('BANK_BOOK_MOVEMENT_PERIOD_LOCKED');
  const side = String(match.direction).toUpperCase() === 'CREDIT' ? 'debit' : String(match.direction).toUpperCase() === 'DEBIT' ? 'credit' : null;
  if (!side) throw new Error('BANK_STATEMENT_DIRECTION_INVALID');
  const statementUsed = await client.query(
    `SELECT COALESCE(SUM(matched_amount), 0)::text AS total FROM bank_reconciliation_matches
      WHERE organization_id = $1 AND statement_transaction_id = $2
        AND (allocation_state = 'ACTIVE' OR (allocation_state = 'LEGACY' AND COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')))`,
    [organizationId, statementTransactionId],
  );
  if (databaseMoneyToCents(statementUsed.rows[0]?.total || '0', 'statementAllocated') >
      databaseMoneyToCents(match.statement_amount, 'statementAmount')) throw new Error('BANK_STATEMENT_CAPACITY_EXCEEDED');
  const siblingMatches = await client.query(
    `SELECT id FROM bank_reconciliation_matches
      WHERE organization_id = $1 AND accounting_transaction_type = $2 AND accounting_transaction_id = $3
        AND allocation_state = 'LEGACY' AND COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')`,
    [organizationId, match.accounting_transaction_type, match.accounting_transaction_id],
  );
  // A document may have multiple bank-side legs (notably transfers). Refuse to
  // infer shared capacity until every legacy leg has independent evidence.
  if (siblingMatches.rows.length !== 1 || String(siblingMatches.rows[0].id) !== matchId) throw new Error('BANK_LEGACY_MATCH_AMBIGUOUS');
  const candidates = await client.query(
    `SELECT jl.id AS journal_line_id, jl.debit::text AS debit, jl.credit::text AS credit,
            COALESCE(cap.used, 0)::text AS used
      FROM journal_lines jl JOIN journal_entries je ON je.organization_id = jl.organization_id AND je.id = jl.journal_entry_id
      LEFT JOIN (SELECT organization_id, journal_line_id, SUM(matched_amount) AS used
                    FROM bank_reconciliation_matches WHERE organization_id = $1 AND allocation_state = 'ACTIVE'
                    GROUP BY organization_id, journal_line_id) cap
         ON cap.organization_id = $1 AND cap.journal_line_id = jl.id
      WHERE jl.organization_id = $1 AND jl.journal_entry_id = $2 AND jl.account_id = $3
        AND UPPER(COALESCE(je.status, '')) = 'POSTED' AND je.reversal_of_journal_id IS NULL
        AND je.reversed_by_journal_id IS NULL
        AND CASE WHEN $4 = 'debit' THEN jl.debit > 0 AND COALESCE(jl.credit, 0) = 0
                 ELSE jl.credit > 0 AND COALESCE(jl.debit, 0) = 0 END
        AND COALESCE(cap.used, 0)::numeric + $5::numeric <= CASE WHEN $4 = 'debit' THEN jl.debit ELSE jl.credit END
      ORDER BY jl.id ${db.isMemoryMode() ? '' : 'FOR UPDATE OF je, jl'}`,
    [organizationId, journalEntryId, match.ledger_account_id, side, String(match.matched_amount)],
  );
  if (candidates.rows.length !== 1) throw new Error(candidates.rows.length ? 'BANK_LEGACY_MATCH_AMBIGUOUS' : 'BANK_LEGACY_MATCH_NOT_VERIFIABLE');
  const line = candidates.rows[0];
  const lineAmount = databaseMoneyToCents(side === 'debit' ? line.debit : line.credit, 'journalLineAmount');
  const reasons = typeof match.match_reasons === 'string' ? JSON.parse(match.match_reasons || '[]') : (match.match_reasons || []);
  const creationOrigin = String(match.accounting_transaction_type).toLowerCase() === 'journal' &&
    Array.isArray(reasons) && reasons.some((item: any) => item?.code === 'CREATE_FROM_BANK')
    ? 'STATEMENT_CREATION' : 'LEGACY_VERIFIED';
  return {
    matchId,
    statementTransactionId,
    journalEntryId,
    journalLineId: String(line.journal_line_id),
    entryNumber: String(entry.rows[0].entry_number || journalEntryId),
    journalDate: dateOnly(entry.rows[0].date),
    matchedAmount: String(match.matched_amount),
    lineCapacity: `${lineAmount / 100n}.${String(lineAmount % 100n).padStart(2, '0')}`,
    sourceType: String(match.accounting_transaction_type),
    sourceId: String(match.accounting_transaction_id),
    creationOrigin,
  };
}

export class BankLegacyAllocationVerificationService {
  public static async getCandidate(organizationId: string, statementTransactionId: string, matchId: string): Promise<LegacyAllocationCandidate> {
    return db.transaction((client) => deriveCandidate(client, organizationId, statementTransactionId, matchId), { organizationId });
  }

  public static async verify(
    organizationId: string,
    statementTransactionId: string,
    matchId: string,
    expectedJournalLineId: string,
    reasonValue: string,
    actorId: string,
  ): Promise<LegacyAllocationCandidate> {
    const reason = String(reasonValue || '').trim();
    if (!actorId) throw new Error('BANK_LEGACY_MATCH_ACTOR_REQUIRED');
    if (reason.length < 10 || reason.length > 1000) throw new Error('BANK_LEGACY_MATCH_REASON_INVALID');
    return db.transaction(async (client) => {
      await acquireLock(client, organizationId);
      const locked = await client.query(
        `SELECT m.id, st.bank_account_id, ba.ledger_account_id FROM bank_reconciliation_matches m
           JOIN bank_statement_transactions st ON st.organization_id = m.organization_id AND st.id = m.statement_transaction_id
           JOIN bank_accounts ba ON ba.organization_id = st.organization_id AND ba.id = st.bank_account_id
          WHERE m.organization_id = $1 AND st.id = $2 AND m.id = $3 ${db.isMemoryMode() ? '' : 'FOR UPDATE OF m, st, ba'}`,
        [organizationId, statementTransactionId, matchId],
      );
      if (!locked.rows.length) throw new Error('BANK_LEGACY_MATCH_NOT_FOUND');
      const candidate = await deriveCandidate(client, organizationId, statementTransactionId, matchId);
      if (candidate.journalLineId !== expectedJournalLineId) throw new Error('BANK_LEGACY_MATCH_CANDIDATE_CHANGED');
      const updated = await client.query(
        `UPDATE bank_reconciliation_matches
            SET bank_account_id = $1, ledger_account_id = $2, journal_entry_id = $3, journal_line_id = $4,
                identity_state = 'VERIFIED', identity_reason = $5, creation_origin = $6, allocation_state = 'ACTIVE'
          WHERE organization_id = $7 AND id = $8 AND allocation_state = 'LEGACY' AND identity_state = 'LEGACY_UNRESOLVED'`,
        [
          locked.rows[0].bank_account_id, locked.rows[0].ledger_account_id,
          candidate.journalEntryId, candidate.journalLineId, reason, candidate.creationOrigin, organizationId, matchId,
        ],
      );
      if (updated.rowCount !== 1) throw new Error('BANK_LEGACY_MATCH_STATE_INVALID');
      const capacity = await client.query(
        `SELECT st.amount::text AS statement_amount, COALESCE(SUM(m.matched_amount), 0)::text AS allocated
           FROM bank_statement_transactions st LEFT JOIN bank_reconciliation_matches m
             ON m.organization_id = st.organization_id AND m.statement_transaction_id = st.id
            AND m.allocation_state = 'ACTIVE' AND m.identity_state = 'VERIFIED'
          WHERE st.organization_id = $1 AND st.id = $2 GROUP BY st.amount`,
        [organizationId, statementTransactionId],
      );
      const allocatedCents = databaseMoneyToCents(capacity.rows[0]?.allocated || '0', 'statementAllocated');
      const statementCents = databaseMoneyToCents(capacity.rows[0]?.statement_amount || '0', 'statementAmount');
      if (allocatedCents > statementCents) throw new Error('BANK_STATEMENT_CAPACITY_EXCEEDED');
      const status = allocatedCents === 0n ? 'UNMATCHED' : allocatedCents === statementCents ? 'MATCHED' : 'PARTIALLY_MATCHED';
      await client.query(`UPDATE bank_statement_transactions SET reconciliation_status = $1 WHERE organization_id = $2 AND id = $3`,
        [status, organizationId, statementTransactionId]);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1, $2, $3, 'BANK_LEGACY_ALLOCATION_VERIFIED', 'BankReconciliationAllocation', $4, $5::jsonb, $6::jsonb)`,
        [newId('aud'), organizationId, actorId, matchId,
          JSON.stringify({ allocationState: 'LEGACY', identityState: 'LEGACY_UNRESOLVED', sourceType: candidate.sourceType, sourceId: candidate.sourceId }),
          JSON.stringify({ allocationState: 'ACTIVE', identityState: 'VERIFIED', creationOrigin: candidate.creationOrigin,
            statementTransactionId, journalEntryId: candidate.journalEntryId, journalLineId: candidate.journalLineId,
            matchedAmount: candidate.matchedAmount, statementStatus: status, reason })],
      );
      return candidate;
    }, { organizationId });
  }
}
