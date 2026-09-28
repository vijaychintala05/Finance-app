import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';

const CENTS = 100n;
const DECIMAL_AMOUNT = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;

function toCents(value: unknown, label: string): bigint {
  const text = typeof value === 'number' ? String(value) : String(value ?? '');
  if (!DECIMAL_AMOUNT.test(text)) throw new Error(`${label}_INVALID_AMOUNT`);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * CENTS + BigInt((fraction + '00').slice(0, 2));
}

function fromCents(value: bigint): string {
  return `${value / CENTS}.${String(value % CENTS).padStart(2, '0')}`;
}

async function acquireFinancialLock(client: DbQueryClient, organizationId: string): Promise<void> {
  // The HTTP idempotency transaction acquires this before its own row locks;
  // this repeat is harmless and also protects direct service invocations.
  if (!db.isMemoryMode()) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [organizationId, 'bank-movement-allocations']);
  }
}

async function assertNoUnresolvedLegacyMatches(
  client: DbQueryClient,
  organizationId: string,
  bankAccountId: string,
): Promise<void> {
  const unresolved = await client.query(
    `SELECT m.id
       FROM bank_reconciliation_matches m
       JOIN bank_statement_transactions st
         ON st.id = m.statement_transaction_id AND st.organization_id = m.organization_id
      WHERE m.organization_id = $1 AND st.bank_account_id = $2
        AND m.allocation_state = 'LEGACY'
        AND COALESCE(m.status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')
      LIMIT 1`,
    [organizationId, bankAccountId],
  );
  if (unresolved.rows.length) throw new Error('BANK_LEGACY_ALLOCATION_UNRESOLVED');
}

async function assertNotCompleted(
  client: DbQueryClient,
  organizationId: string,
  bankAccountId: string,
  statementDate: string,
): Promise<void> {
  const session = await client.query(
    `SELECT id FROM bank_reconciliation_sessions
      WHERE organization_id = $1 AND bank_account_id = $2
        AND statement_end_date >= $3 AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'RECONCILED')
      LIMIT 1`,
    [organizationId, bankAccountId, statementDate],
  );
  if (session.rows.length) throw new Error('BANK_RECONCILIATION_COMPLETED');
}

export async function recomputeStatementStatus(
  client: DbQueryClient,
  organizationId: string,
  statementTransactionId: string,
  statementAmountCents: bigint,
): Promise<string> {
  const result = await client.query(
    `SELECT COALESCE(SUM(m.matched_amount), 0)::text AS allocated
       FROM bank_reconciliation_matches m
      WHERE m.organization_id = $1 AND m.statement_transaction_id = $2
        AND m.allocation_state = 'ACTIVE' AND m.identity_state = 'VERIFIED'`,
    [organizationId, statementTransactionId],
  );
  const allocated = toCents(result.rows[0]?.allocated ?? '0', 'ALLOCATED');
  if (allocated > statementAmountCents) throw new Error('BANK_STATEMENT_CAPACITY_EXCEEDED');
  const status = allocated === 0n ? 'UNMATCHED' : allocated === statementAmountCents ? 'MATCHED' : 'PARTIALLY_MATCHED';
  await client.query(
    `UPDATE bank_statement_transactions SET reconciliation_status = $1 WHERE organization_id = $2 AND id = $3`,
    [status, organizationId, statementTransactionId],
  );
  return status;
}

export interface BankMovementAllocationResult {
  allocationId: string;
  statementTransactionId: string;
  journalLineId: string;
  journalEntryId: string;
  amount: string;
  statementStatus: string;
}

export interface BankStatementCanonicalReceipt {
  statementTransactionId: string;
  statementStatus: string;
  reviewDecision: string | null;
  allocations: Array<{
    allocationId: string;
    journalLineId: string | null;
    journalEntryId: string | null;
    entryNumber: string | null;
    reversalJournalEntryId: string | null;
    reversalEntryNumber: string | null;
    amount: string;
    allocationState: string;
    identityState: string;
    creationOrigin: string;
    creationOperationId: string | null;
  }>;
  legacyMatches: Array<{ matchId: string; sourceType: string; sourceId: string; amount: string; status: string }>;
}

/** Canonical write path. It never calls or aliases into document-level matching. */
export class BankMovementAllocationService {
  public static async getStatementReceipt(organizationId: string, statementTransactionId: string): Promise<BankStatementCanonicalReceipt> {
    const result = await db.query(
      `SELECT st.id, st.reconciliation_status, st.review_decision,
              m.id AS allocation_id, m.journal_line_id, m.journal_entry_id, je.entry_number,
              m.matched_amount, m.allocation_state, m.identity_state, m.creation_origin, m.match_reasons,
              reversal.id AS reversal_journal_entry_id, reversal.entry_number AS reversal_entry_number
         FROM bank_statement_transactions st
         LEFT JOIN bank_reconciliation_matches m
           ON m.organization_id = st.organization_id AND m.statement_transaction_id = st.id
          AND m.identity_state = 'VERIFIED' AND m.allocation_state IN ('ACTIVE', 'UNMATCHED', 'REVERSED')
         LEFT JOIN journal_entries je ON je.organization_id = m.organization_id AND je.id = m.journal_entry_id
         LEFT JOIN journal_entries reversal ON reversal.organization_id = m.organization_id
          AND reversal.reversal_of_journal_id = m.journal_entry_id AND UPPER(reversal.status) = 'POSTED'
        WHERE st.organization_id = $1 AND st.id = $2
        ORDER BY m.matched_at, m.id`,
      [organizationId, statementTransactionId],
    );
    if (!result.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
    const row = result.rows[0];
    const legacy = await db.query(
      `SELECT id, accounting_transaction_type, accounting_transaction_id, matched_amount, status
         FROM bank_reconciliation_matches WHERE organization_id = $1 AND statement_transaction_id = $2
          AND allocation_state = 'LEGACY' AND COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED') ORDER BY id`,
      [organizationId, statementTransactionId],
    );
    return {
      statementTransactionId: String(row.id),
      statementStatus: String(row.reconciliation_status || ''),
      reviewDecision: row.review_decision == null ? null : String(row.review_decision),
      allocations: result.rows.filter((allocation: any) => allocation.allocation_id).map((allocation: any) => ({
        allocationId: String(allocation.allocation_id),
        journalLineId: allocation.journal_line_id == null ? null : String(allocation.journal_line_id),
        journalEntryId: allocation.journal_entry_id == null ? null : String(allocation.journal_entry_id),
        entryNumber: allocation.entry_number == null ? null : String(allocation.entry_number),
        reversalJournalEntryId: allocation.reversal_journal_entry_id == null ? null : String(allocation.reversal_journal_entry_id),
        reversalEntryNumber: allocation.reversal_entry_number == null ? null : String(allocation.reversal_entry_number),
        amount: String(allocation.matched_amount),
        allocationState: String(allocation.allocation_state),
        identityState: String(allocation.identity_state),
        creationOrigin: String(allocation.creation_origin || ''),
        creationOperationId: (() => {
          try {
            const reasons = typeof allocation.match_reasons === 'string' ? JSON.parse(allocation.match_reasons) : allocation.match_reasons;
            const operationId = !Array.isArray(reasons) ? reasons?.creationOperationId : null;
            return typeof operationId === 'string' ? operationId : null;
          } catch { return null; }
        })(),
      })),
      legacyMatches: legacy.rows.map((match: any) => ({ matchId: String(match.id), sourceType: String(match.accounting_transaction_type),
        sourceId: String(match.accounting_transaction_id), amount: String(match.matched_amount), status: String(match.status || '') })),
    };
  }

  public static async allocate(
    organizationId: string,
    statementTransactionId: string,
    journalLineId: string,
    amount: unknown,
    actorId: string,
  ): Promise<BankMovementAllocationResult> {
    const requestedCents = toCents(amount, 'REQUESTED');
    if (requestedCents <= 0n) throw new Error('REQUESTED_INVALID_AMOUNT');
    if (!actorId) throw new Error('BANK_ALLOCATION_ACTOR_REQUIRED');

    return db.transaction(async (client) => {
      await acquireFinancialLock(client, organizationId);

      const statementResult = await client.query(
        `SELECT st.*, ba.ledger_account_id, ba.currency AS bank_currency,
                ba.is_active, ba.is_archived, ba.status AS bank_status,
                a.currency_code AS ledger_currency, o.base_currency
           FROM bank_statement_transactions st
           JOIN bank_accounts ba ON ba.id = st.bank_account_id AND ba.organization_id = st.organization_id
           JOIN organizations o ON o.id = st.organization_id
           LEFT JOIN accounts a ON a.id = ba.ledger_account_id AND a.organization_id = ba.organization_id
          WHERE st.organization_id = $1 AND st.id = $2
          ${db.isMemoryMode() ? '' : 'FOR UPDATE OF st, ba'}`,
        [organizationId, statementTransactionId],
      );
      if (!statementResult.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      const statement = statementResult.rows[0];
      const activeDisposition = await client.query(
        `SELECT id FROM bank_statement_line_dispositions WHERE organization_id = $1 AND statement_transaction_id = $2 AND revoked_at IS NULL LIMIT 1`,
        [organizationId, statementTransactionId],
      );
      if (activeDisposition.rows.length || ['CONFIRMED_DUPLICATE', 'PROVEN_ARTIFACT'].includes(String(statement.reconciliation_status || '').toUpperCase())) {
        throw new Error('BANK_STATEMENT_DISPOSITION_ACTIVE');
      }
      const importState = await client.query(
        `SELECT status FROM bank_statement_imports WHERE organization_id = $1 AND id = $2`,
        [organizationId, statement.statement_import_id],
      );
      if (!importState.rows.length || String(importState.rows[0].status || '').toUpperCase() !== 'COMPLETED') {
        throw new Error('BANK_STATEMENT_IMPORT_NOT_COMPLETE');
      }
      if (!statement.ledger_account_id) throw new Error('BANK_LEDGER_ACCOUNT_NOT_LINKED');
      const profiles = await client.query(
        `SELECT id FROM bank_accounts WHERE organization_id = $1 AND ledger_account_id = $2
          AND is_active = TRUE AND UPPER(COALESCE(status, '')) = 'ACTIVE' AND COALESCE(is_archived, FALSE) = FALSE LIMIT 2`,
        [organizationId, statement.ledger_account_id],
      );
      if (profiles.rows.length > 1) throw new Error('BANK_LEDGER_PROFILE_AMBIGUOUS');
      if (statement.is_active !== true || statement.is_archived === true || String(statement.bank_status).toUpperCase() !== 'ACTIVE') {
        throw new Error('BANK_ACCOUNT_INACTIVE');
      }
      const statementCents = toCents(statement.amount, 'STATEMENT');
      if (statementCents <= 0n) throw new Error('BANK_STATEMENT_INVALID_AMOUNT');
      const statementCurrency = String(statement.currency || '').toUpperCase();
      const bankCurrency = String(statement.bank_currency || '').toUpperCase();
      const ledgerCurrency = String(statement.ledger_currency || statement.base_currency || '').toUpperCase();
      if (!/^[A-Z]{3}$/.test(statementCurrency) || statementCurrency !== bankCurrency || statementCurrency !== ledgerCurrency ||
          (statement.ledger_currency && String(statement.ledger_currency).toUpperCase() !== String(statement.base_currency).toUpperCase())) {
        throw new Error('BANK_CURRENCY_UNSUPPORTED');
      }
      if (String(statement.reconciliation_status).toUpperCase() === 'RECONCILED') throw new Error('BANK_RECONCILIATION_COMPLETED');
      if (statement.is_ignored === true || ['IGNORED', 'NEEDS_REVIEW', 'POSSIBLE_DUPLICATE', 'TO_REVIEW', 'RECOGNIZED', 'CONFIRMED_DUPLICATE', 'PROVEN_ARTIFACT'].includes(String(statement.reconciliation_status).toUpperCase())) {
        throw new Error('BANK_STATEMENT_REVIEW_REQUIRED');
      }
      await assertNotCompleted(client, organizationId, statement.bank_account_id, statement.transaction_date);
      await assertNoUnresolvedLegacyMatches(client, organizationId, statement.bank_account_id);

      const existingSameAccount = await client.query(
        `SELECT id FROM bank_reconciliation_matches
          WHERE organization_id = $1 AND bank_account_id = $2 AND allocation_state = 'LEGACY'
            AND COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED') LIMIT 1`,
        [organizationId, statement.bank_account_id],
      );
      if (existingSameAccount.rows.length) throw new Error('BANK_LEGACY_ALLOCATION_UNRESOLVED');

      const isInflow = String(statement.direction).toUpperCase() === 'CREDIT';
      if (!isInflow && String(statement.direction).toUpperCase() !== 'DEBIT') throw new Error('BANK_STATEMENT_DIRECTION_INVALID');
      const bookSide = isInflow ? 'debit' : 'credit';
      const lineResult = await client.query(
        `SELECT jl.id, jl.journal_entry_id, jl.organization_id AS line_organization_id,
                jl.account_id, jl.debit::text AS debit, jl.credit::text AS credit,
                je.date AS journal_date, je.status AS journal_status,
                je.reversal_of_journal_id
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = $1
          WHERE jl.id = $2 AND (jl.organization_id = $1 OR jl.organization_id IS NULL)
            AND jl.account_id = $3
          ${db.isMemoryMode() ? '' : 'FOR UPDATE OF je, jl'}`,
        [organizationId, journalLineId, statement.ledger_account_id],
      );
      if (!lineResult.rows.length) throw new Error('BANK_BOOK_MOVEMENT_NOT_FOUND');
      const line = lineResult.rows[0];
      if (String(line.journal_status).toUpperCase() !== 'POSTED') throw new Error('BANK_BOOK_MOVEMENT_NOT_POSTED');
      if (line.reversal_of_journal_id) throw new Error('BANK_BOOK_MOVEMENT_REVERSAL_UNSUPPORTED');
      const oppositeReversal = await client.query(
        `SELECT id FROM journal_entries WHERE organization_id = $1 AND reversal_of_journal_id = $2 LIMIT 1`,
        [organizationId, line.journal_entry_id],
      );
      if (oppositeReversal.rows.length) throw new Error('BANK_BOOK_MOVEMENT_REVERSAL_UNSUPPORTED');
      const debitCents = toCents(line.debit ?? '0', 'BOOK');
      const creditCents = toCents(line.credit ?? '0', 'BOOK');
      const sideCents = bookSide === 'debit' ? debitCents : creditCents;
      const otherSideCents = bookSide === 'debit' ? creditCents : debitCents;
      if (sideCents <= 0n || otherSideCents !== 0n) throw new Error('BANK_BOOK_MOVEMENT_SIDE_INVALID');
      const journalDate = line.journal_date instanceof Date
        ? line.journal_date.toISOString().slice(0, 10)
        : String(line.journal_date).slice(0, 10);
      const periodLock = await client.query(
        `SELECT id FROM period_locks
          WHERE organization_id = $1 AND COALESCE(is_locked, FALSE) = TRUE
            AND ((year = EXTRACT(YEAR FROM $2::date)::int AND month = EXTRACT(MONTH FROM $2::date)::int)
              OR (lock_date IS NOT NULL AND lock_date >= $2::date AND COALESCE(status, 'Active') = 'Active'))
          LIMIT 1`,
        [organizationId, journalDate],
      );
      if (periodLock.rows.length) throw new Error('BANK_BOOK_MOVEMENT_PERIOD_LOCKED');

      // Complete the historical nullable tenant key using the already-proved
      // tenant-owned journal before inserting the composite allocation FK.
      if (!line.line_organization_id) {
        await client.query(
          `UPDATE journal_lines SET organization_id = $1 WHERE id = $2 AND organization_id IS NULL`,
          [organizationId, journalLineId],
        );
      }

      // Statement allocation capacity is guarded by the transaction lock; book-line capacity
      // is likewise accumulated under that lock across all statement lines.
      const capacities = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN statement_transaction_id = $2 THEN matched_amount ELSE 0 END), 0)::text AS statement_used,
           COALESCE(SUM(CASE WHEN journal_line_id = $3 THEN matched_amount ELSE 0 END), 0)::text AS book_used
         FROM bank_reconciliation_matches
        WHERE organization_id = $1 AND allocation_state = 'ACTIVE' AND identity_state = 'VERIFIED'`,
        [organizationId, statementTransactionId, journalLineId],
      );
      const statementUsed = toCents(capacities.rows[0]?.statement_used ?? '0', 'ALLOCATED');
      const bookUsed = toCents(capacities.rows[0]?.book_used ?? '0', 'ALLOCATED');
      if (statementUsed + requestedCents > statementCents) throw new Error('BANK_STATEMENT_CAPACITY_EXCEEDED');
      if (bookUsed + requestedCents > sideCents) throw new Error('BANK_BOOK_CAPACITY_EXCEEDED');

      const allocationId = newId('bankalloc');
      const allocationAmount = fromCents(requestedCents);
      await client.query(
        `INSERT INTO bank_reconciliation_matches
          (id, organization_id, statement_transaction_id, accounting_transaction_type,
           accounting_transaction_id, matched_amount, match_confidence, match_reasons,
           matched_by, matched_at, status, bank_account_id, ledger_account_id,
           journal_entry_id, journal_line_id, identity_state, identity_reason,
           creation_origin, allocation_state)
         VALUES ($1, $2, $3, 'canonical_journal_line', $11, $5, 100,
           $6::jsonb, $7, CURRENT_TIMESTAMP, 'MATCHED', $8, $9, $10, $4,
           'VERIFIED', NULL, 'CANONICAL_ALLOCATION', 'ACTIVE')`,
        [allocationId, organizationId, statementTransactionId, journalLineId, allocationAmount,
          JSON.stringify({ source: 'canonical-bank-movement-allocation' }), actorId,
          statement.bank_account_id, statement.ledger_account_id, line.journal_entry_id, allocationId],
      );
      const statementStatus = await recomputeStatementStatus(client, organizationId, statementTransactionId, statementCents);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, 'BANK_MOVEMENT_ALLOCATED', 'BankReconciliationAllocation', $4, $5::jsonb)`,
        [newId('aud'), organizationId, actorId, allocationId,
          JSON.stringify({ statementTransactionId, journalEntryId: line.journal_entry_id, journalLineId, amount: allocationAmount, statementStatus })],
      );
      return { allocationId, statementTransactionId, journalLineId, journalEntryId: line.journal_entry_id, amount: allocationAmount, statementStatus };
    }, { organizationId });
  }

  public static async unmatch(
    organizationId: string,
    allocationId: string,
    actorId: string,
    reason: string,
  ): Promise<{ allocationId: string; statementStatus: string }> {
    const cleanReason = String(reason || '').trim();
    if (!actorId) throw new Error('BANK_ALLOCATION_ACTOR_REQUIRED');
    if (cleanReason.length < 3 || cleanReason.length > 500) throw new Error('BANK_ALLOCATION_UNMATCH_REASON_REQUIRED');
    return db.transaction(async (client) => {
      await acquireFinancialLock(client, organizationId);
      const identity = await client.query(
        `SELECT statement_transaction_id FROM bank_reconciliation_matches
          WHERE organization_id = $1 AND id = $2 AND creation_origin IN ('CANONICAL_ALLOCATION', 'LEGACY_VERIFIED')`,
        [organizationId, allocationId],
      );
      if (!identity.rows.length) throw new Error('BANK_ALLOCATION_NOT_FOUND');
      const statementTransactionId = String(identity.rows[0].statement_transaction_id);
      const statementResult = await client.query(
        `SELECT st.*, ba.id AS bank_account_id
           FROM bank_statement_transactions st
           JOIN bank_accounts ba ON ba.id = st.bank_account_id AND ba.organization_id = st.organization_id
          WHERE st.organization_id = $1 AND st.id = $2 ${db.isMemoryMode() ? '' : 'FOR UPDATE OF st, ba'}`,
        [organizationId, statementTransactionId],
      );
      if (!statementResult.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      const statement = statementResult.rows[0];
      if (String(statement.reconciliation_status).toUpperCase() === 'RECONCILED') throw new Error('BANK_RECONCILIATION_COMPLETED');
      await assertNotCompleted(client, organizationId, statement.bank_account_id, statement.transaction_date);
      const allocation = await client.query(
        `SELECT journal_entry_id, journal_line_id, matched_amount, allocation_state, identity_state
           FROM bank_reconciliation_matches WHERE organization_id = $1 AND id = $2 ${db.isMemoryMode() ? '' : 'FOR UPDATE'}`,
        [organizationId, allocationId],
      );
      if (!allocation.rows.length || allocation.rows[0].allocation_state !== 'ACTIVE' || allocation.rows[0].identity_state !== 'VERIFIED') {
        throw new Error('BANK_ALLOCATION_NOT_ACTIVE');
      }
      await client.query(
        `SELECT jl.id FROM journal_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = $1
          WHERE jl.id = $2 ${db.isMemoryMode() ? '' : 'FOR UPDATE OF je, jl'}`,
        [organizationId, allocation.rows[0].journal_line_id],
      );
      const statementCents = toCents(statement.amount, 'STATEMENT');
      await client.query(
        `UPDATE bank_reconciliation_matches
            SET allocation_state = 'UNMATCHED', unmatched_by = $1, unmatched_at = CURRENT_TIMESTAMP,
                unmatch_reason = $2, status = 'UNMATCHED'
          WHERE organization_id = $3 AND id = $4 AND allocation_state = 'ACTIVE'`,
        [actorId, cleanReason, organizationId, allocationId],
      );
      const statementStatus = await recomputeStatementStatus(client, organizationId, statementTransactionId, statementCents);
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, 'BANK_MOVEMENT_UNMATCHED', 'BankReconciliationAllocation', $4, $5::jsonb)`,
        [newId('aud'), organizationId, actorId, allocationId,
          JSON.stringify({ statementTransactionId, journalEntryId: allocation.rows[0].journal_entry_id,
            journalLineId: allocation.rows[0].journal_line_id, amount: allocation.rows[0].matched_amount,
            reason: cleanReason, statementStatus })],
      );
      return { allocationId, statementStatus };
    }, { organizationId });
  }
}
