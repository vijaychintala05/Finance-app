import { db, type DbQueryClient } from '../database/db';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { newId } from '../utils/ids';

const AMOUNT = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;

function amountCents(value: unknown, name: string): bigint {
  const valueText = String(value ?? '');
  if (!AMOUNT.test(valueText)) throw new Error(`${name}_INVALID_AMOUNT`);
  const [whole, fraction = ''] = valueText.split('.');
  return BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
}

function decimal(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

async function takeBankAllocationLock(client: DbQueryClient, organizationId: string): Promise<void> {
  if (!db.isMemoryMode()) {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [organizationId, 'bank-movement-allocations']);
  }
}

async function assertNoUnresolvedLegacyMatches(client: DbQueryClient, organizationId: string, bankAccountId: string): Promise<void> {
  const unresolved = await client.query(
    `SELECT m.id FROM bank_reconciliation_matches m
       JOIN bank_statement_transactions st
         ON st.id = m.statement_transaction_id AND st.organization_id = m.organization_id
      WHERE m.organization_id = $1 AND st.bank_account_id = $2
        AND m.allocation_state = 'LEGACY'
        AND COALESCE(m.status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED') LIMIT 1`,
    [organizationId, bankAccountId],
  );
  if (unresolved.rows.length) throw new Error('BANK_LEGACY_ALLOCATION_UNRESOLVED');
}

export interface CreatedStatementEntry {
  journalEntryId: string;
  journalLineId: string;
  allocationId: string;
  amount: string;
  statementStatus: 'MATCHED';
}

/**
 * Fail-closed prototype for creating one simple two-line journal from a fully
 * unallocated imported statement transaction. The route remains capability
 * gated; this method deliberately has no client-supplied lifecycle origin.
 */
export class BankStatementEntryCreationService {
  public static async create(
    organizationId: string,
    statementTransactionId: string,
    counterAccountId: string,
    actorId: string,
    description?: string,
  ): Promise<CreatedStatementEntry> {
    if (!actorId) throw new Error('BANK_ENTRY_CREATOR_REQUIRED');
    if (!counterAccountId || counterAccountId.length > 64) throw new Error('BANK_COUNTER_ACCOUNT_INVALID');
    const cleanDescription = String(description || '').trim().slice(0, 500);

    return db.transaction(async (client) => {
      // Must precede the statement, account, journal, and allocation row locks.
      await takeBankAllocationLock(client, organizationId);

      const statementResult = await client.query(
        `SELECT st.*, ba.ledger_account_id, ba.currency AS bank_currency,
                ba.status AS bank_status, ba.is_active AS bank_is_active,
                COALESCE(ba.is_archived, FALSE) AS bank_is_archived,
                bank_ledger.status AS bank_ledger_status,
                bank_ledger.is_locked AS bank_ledger_locked,
                bank_ledger.allow_direct_posting AS bank_ledger_direct,
                bank_ledger.currency_code AS bank_ledger_currency,
                o.base_currency
           FROM bank_statement_transactions st
           JOIN bank_accounts ba ON ba.id = st.bank_account_id AND ba.organization_id = st.organization_id
           JOIN organizations o ON o.id = st.organization_id
           LEFT JOIN accounts bank_ledger ON bank_ledger.id = ba.ledger_account_id AND bank_ledger.organization_id = ba.organization_id
          WHERE st.organization_id = $1 AND st.id = $2
          ${db.isMemoryMode() ? '' : 'FOR UPDATE OF st, ba'}`,
        [organizationId, statementTransactionId],
      );
      if (!statementResult.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
      const statement = statementResult.rows[0];
      if (!statement.ledger_account_id) throw new Error('BANK_LEDGER_ACCOUNT_NOT_LINKED');
      const profiles = await client.query(
        `SELECT id FROM bank_accounts WHERE organization_id = $1 AND ledger_account_id = $2
          AND is_active = TRUE AND UPPER(COALESCE(status, '')) = 'ACTIVE' AND COALESCE(is_archived, FALSE) = FALSE LIMIT 2`,
        [organizationId, statement.ledger_account_id],
      );
      if (profiles.rows.length > 1) throw new Error('BANK_LEDGER_PROFILE_AMBIGUOUS');
      if (statement.bank_is_active !== true || statement.bank_is_archived === true || String(statement.bank_status).toUpperCase() !== 'ACTIVE') {
        throw new Error('BANK_ACCOUNT_INACTIVE');
      }
      if (!statement.bank_ledger_status || String(statement.bank_ledger_status).toUpperCase() !== 'ACTIVE' ||
          statement.bank_ledger_locked === true || statement.bank_ledger_direct === false) {
        throw new Error('BANK_LEDGER_ACCOUNT_UNAVAILABLE');
      }
      const amount = amountCents(statement.amount, 'BANK_STATEMENT');
      if (amount <= 0n) throw new Error('BANK_STATEMENT_INVALID_AMOUNT');
      const currency = String(statement.currency || '').toUpperCase();
      const baseCurrency = String(statement.base_currency || '').toUpperCase();
      const ledgerCurrency = String(statement.bank_ledger_currency || baseCurrency).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency) || currency !== String(statement.bank_currency || '').toUpperCase() ||
          currency !== ledgerCurrency || currency !== baseCurrency) throw new Error('BANK_CURRENCY_UNSUPPORTED');
      if (!['DEBIT', 'CREDIT'].includes(String(statement.direction).toUpperCase())) throw new Error('BANK_STATEMENT_DIRECTION_INVALID');
      if (['MATCHED', 'CATEGORIZED', 'RECONCILED', 'PARTIALLY_MATCHED'].includes(String(statement.reconciliation_status).toUpperCase())) {
        throw new Error('BANK_STATEMENT_ALREADY_PROCESSED');
      }
      if (statement.is_ignored === true || ['IGNORED', 'NEEDS_REVIEW', 'POSSIBLE_DUPLICATE', 'TO_REVIEW'].includes(String(statement.reconciliation_status).toUpperCase())) {
        throw new Error('BANK_STATEMENT_REVIEW_REQUIRED');
      }
      await assertNoUnresolvedLegacyMatches(client, organizationId, statement.bank_account_id);

      const completion = await client.query(
        `SELECT id FROM bank_reconciliation_sessions
          WHERE organization_id = $1 AND bank_account_id = $2 AND statement_end_date >= $3
            AND UPPER(COALESCE(status, '')) IN ('COMPLETED', 'RECONCILED') LIMIT 1`,
        [organizationId, statement.bank_account_id, statement.transaction_date],
      );
      if (completion.rows.length) throw new Error('BANK_RECONCILIATION_COMPLETED');

      // Existing canonical allocations and unresolved document-level aliases both
      // consume the statement line. Do not silently make a duplicate journal.
      const matches = await client.query(
        `SELECT id FROM bank_reconciliation_matches
          WHERE organization_id = $1 AND statement_transaction_id = $2
            AND (allocation_state = 'ACTIVE' OR
                 (allocation_state = 'LEGACY' AND COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')))
          LIMIT 1`,
        [organizationId, statementTransactionId],
      );
      if (matches.rows.length) throw new Error('BANK_STATEMENT_ALREADY_ALLOCATED');

      const counterAccount = await client.query(
        `SELECT id, type, status, is_locked, is_system_account, allow_direct_posting, archived_at,
                system_role, currency_code
           FROM accounts
          WHERE organization_id = $1 AND id = $2
          ${db.isMemoryMode() ? '' : 'FOR UPDATE'}`,
        [organizationId, counterAccountId],
      );
      if (!counterAccount.rows.length) throw new Error('BANK_COUNTER_ACCOUNT_NOT_FOUND');
      const account = counterAccount.rows[0];
      const allowedTypes = new Set(['EXPENSE', 'INCOME', 'OTHER INCOME', 'COST OF GOODS SOLD']);
      if (String(account.status).toUpperCase() !== 'ACTIVE' || account.is_locked === true || account.is_system_account === true ||
          account.allow_direct_posting === false || account.archived_at || account.system_role ||
          !allowedTypes.has(String(account.type || '').toUpperCase())) throw new Error('BANK_COUNTER_ACCOUNT_NOT_ALLOWED');
      if (counterAccountId === statement.ledger_account_id) throw new Error('BANK_COUNTER_ACCOUNT_NOT_ALLOWED');
      if (account.currency_code && String(account.currency_code).toUpperCase() !== currency) throw new Error('BANK_CURRENCY_UNSUPPORTED');

      const date = statement.transaction_date instanceof Date
        ? statement.transaction_date.toISOString().slice(0, 10)
        : String(statement.transaction_date).slice(0, 10);
      const entryNumber = await DocumentNumberingEngine.getNextNumber(organizationId, 'JOURNAL', date, undefined, client);
      const reference = String(statement.reference || statement.utr || '').slice(0, 255);
      const memo = cleanDescription || String(statement.narration || '').slice(0, 500);
      const outflow = String(statement.direction).toUpperCase() === 'DEBIT';
      const posting = await ServerPostingEngine.postEntry({
        organizationId,
        entryNumber,
        date,
        reference,
        description: `[Created from imported bank statement] ${memo}`,
        lines: outflow
          ? [
              { accountId: counterAccountId, debit: Number(decimal(amount)), credit: 0, description: memo },
              { accountId: statement.ledger_account_id, debit: 0, credit: Number(decimal(amount)), description: memo },
            ]
          : [
              { accountId: statement.ledger_account_id, debit: Number(decimal(amount)), credit: 0, description: memo },
              { accountId: counterAccountId, debit: 0, credit: Number(decimal(amount)), description: memo },
            ],
      }, client);

      const bankLine = await client.query(
        `SELECT jl.id
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = $1
          WHERE jl.organization_id = $1 AND jl.journal_entry_id = $2 AND jl.account_id = $3
            AND je.status = 'Posted'
            AND (($4 = 'DEBIT' AND jl.credit = $5 AND jl.debit = 0)
              OR ($4 = 'CREDIT' AND jl.debit = $5 AND jl.credit = 0))`,
        [organizationId, posting.entryId, statement.ledger_account_id, String(statement.direction).toUpperCase(), decimal(amount)],
      );
      if (bankLine.rows.length !== 1) throw new Error('BANK_CREATED_JOURNAL_LINE_NOT_UNIQUE');

      const allocationId = newId('bankalloc');
      await client.query(
        `INSERT INTO bank_reconciliation_matches
          (id, organization_id, statement_transaction_id, accounting_transaction_type,
           accounting_transaction_id, matched_amount, match_confidence, match_reasons,
           matched_by, matched_at, status, bank_account_id, ledger_account_id,
           journal_entry_id, journal_line_id, identity_state, identity_reason,
           creation_origin, allocation_state)
         VALUES ($1, $2, $3, 'canonical_journal_line', $4, $5, 100, $6::jsonb,
           $7, CURRENT_TIMESTAMP, 'MATCHED', $8, $9, $10, $4,
           'VERIFIED', NULL, 'STATEMENT_CREATION', 'ACTIVE')`,
        [allocationId, organizationId, statementTransactionId, bankLine.rows[0].id, decimal(amount),
          JSON.stringify({ source: 'server-created-statement-entry' }), actorId,
          statement.bank_account_id, statement.ledger_account_id, posting.entryId],
      );
      await client.query(
        `UPDATE bank_statement_transactions SET reconciliation_status = 'MATCHED'
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, statementTransactionId],
      );
      await client.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, 'BANK_STATEMENT_ENTRY_CREATED', 'BankStatementTransaction', $4, $5::jsonb)`,
        [newId('aud'), organizationId, actorId, statementTransactionId,
          JSON.stringify({ journalEntryId: posting.entryId, journalLineId: bankLine.rows[0].id,
            allocationId, counterAccountId, amount: decimal(amount), currency })],
      );
      return { journalEntryId: posting.entryId, journalLineId: bankLine.rows[0].id,
        allocationId, amount: decimal(amount), statementStatus: 'MATCHED' };
    }, { organizationId });
  }
}
