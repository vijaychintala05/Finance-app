import { db, type DbQueryClient } from '../database/db';

export type StatementLineClass = 'RESOLVED' | 'UNRESOLVED' | 'REVIEW' | 'LEGACY_REVIEW_REQUIRED';

export interface BankReconciliationAccountProjection {
  accountId: string;
  accountName: string;
  bankName: string;
  maskedAccountNumber: string | null;
  currency: string;
  ledgerAccountId: string | null;
  statementThrough: string | null;
  statementBalance: number | null;
  bookBalanceAtStatement: number | null;
  statementBookDifference: number | null;
  laterBookActivity: number | null;
  statementTransactionCount: number | null;
  statementUnresolvedCount: number | null;
  priorUnresolvedCount: number | null;
  statementResolvedCount: number | null;
  oldestUnresolvedDate: string | null;
  statementStatusCounts: Record<string, number> | null;
  bookOutstandingAmount: number | null;
  bookCoverageState: 'NO_STATEMENT' | 'UNLINKED_ACCOUNT' | 'CURRENCY_MISMATCH' | 'MISSING_STATEMENT_BALANCE' | 'LEGACY_REVIEW_REQUIRED';
}

export interface BankReconciliationProjection {
  asOfDate: string;
  accounts: BankReconciliationAccountProjection[];
  statementTransactionCount: number | null;
  statementUnresolvedCount: number | null;
  priorUnresolvedCount: number | null;
  oldestUnresolvedDate: string | null;
  hasStatement: boolean;
}

const money = (value: unknown): number => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const dateOnly = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

/**
 * The status is only a label in the legacy schema. A statement line is resolved
 * only when verified active movement allocations cover it exactly; historical
 * labels alone keep the line visible for review.
 */
export function classifyStatementLineStatus(statusValue: unknown, isIgnoredValue?: unknown, amountValue?: unknown, allocatedValue?: unknown, invalidAllocationsValue?: unknown, confirmedDuplicateValidated?: unknown): StatementLineClass {
  const status = String(statusValue || '').trim().toUpperCase();
  const isIgnored = isIgnoredValue === true || isIgnoredValue === 'true';
  if (isIgnored || status === 'IGNORED') return 'REVIEW';
  if (status === 'CONFIRMED_DUPLICATE') return confirmedDuplicateValidated === true || confirmedDuplicateValidated === 'true' ? 'RESOLVED' : 'REVIEW';
  if (status === 'MATCHED' || status === 'CATEGORIZED' || status === 'RECONCILED') {
    const amount = Number(amountValue);
    const allocated = Number(allocatedValue);
    const invalidAllocations = Number(invalidAllocationsValue || 0);
    if (Number.isFinite(amount) && amount > 0 && Number.isFinite(allocated) &&
        Math.abs(amount - allocated) < 0.005 && invalidAllocations === 0) return 'RESOLVED';
    return 'LEGACY_REVIEW_REQUIRED';
  }
  if (['MATCHED', 'CATEGORIZED', 'RECONCILED'].includes(status)) return 'LEGACY_REVIEW_REQUIRED';
  if (['NEEDS_REVIEW', 'POSSIBLE_DUPLICATE', 'TO_REVIEW'].includes(status)) return 'REVIEW';
  if (['UNMATCHED', 'PARTIALLY_MATCHED', 'SUGGESTED', 'RECOGNIZED', ''].includes(status)) return 'UNRESOLVED';
  return 'REVIEW';
}

export class BankReconciliationProjectionService {
  public static async getProjection(
    organizationId: string,
    asOfDate: string,
    client: DbQueryClient = db,
    transactionFromDate?: string,
  ): Promise<BankReconciliationProjection> {
    const [accountRows, statementRows, transactionRows, organizationRows] = await Promise.all([
      client.query(
        `SELECT id, account_name, bank_name, masked_account_number, currency, ledger_account_id
           FROM bank_accounts
          WHERE organization_id = $1
          ORDER BY account_name, id`, [organizationId],
      ),
      client.query(
        `SELECT bank_account_id, id AS import_id, statement_to, closing_balance AS statement_balance, currency
           FROM bank_statement_imports
          WHERE organization_id = $1 AND statement_to <= $2
            AND UPPER(COALESCE(status, 'COMPLETED')) NOT IN ('FAILED', 'CANCELLED', 'REJECTED')
          ORDER BY bank_account_id, statement_to DESC, imported_at DESC, id DESC`, [organizationId, asOfDate],
      ),
      client.query(
        `WITH duplicate_proofs AS (
          SELECT DISTINCT d.organization_id, d.statement_transaction_id
            FROM bank_statement_line_dispositions d
            JOIN bank_reconciliation_session_items si ON si.organization_id = d.organization_id
              AND si.statement_transaction_id = d.statement_transaction_id AND si.disposition_id = d.id
              AND si.resolution_kind = 'CONFIRMED_DUPLICATE'
            JOIN bank_reconciliation_session_items target_item ON target_item.organization_id = si.organization_id
              AND target_item.session_id = si.session_id AND target_item.statement_transaction_id = d.target_statement_transaction_id
              AND target_item.resolution_kind = 'ALLOCATED'
            JOIN bank_reconciliation_sessions rs ON rs.organization_id = si.organization_id AND rs.id = si.session_id
              AND UPPER(COALESCE(rs.status, '')) IN ('COMPLETED', 'RECONCILED')
           WHERE d.kind = 'CONFIRMED_DUPLICATE' AND d.revoked_at IS NULL
             AND si.statement_import_id IS NOT NULL AND si.target_statement_transaction_id = d.target_statement_transaction_id
             AND rs.bank_account_id = d.bank_account_id AND rs.statement_end_date <= $2
        )
        SELECT bst.bank_account_id, bst.reconciliation_status, bst.is_ignored,
                CASE WHEN $3::date IS NOT NULL AND bst.transaction_date < $3::date THEN TRUE ELSE FALSE END AS is_prior,
                bst.amount AS statement_amount, COALESCE(alloc.valid_amount, 0) AS valid_amount,
                COALESCE(alloc.invalid_count, 0) AS invalid_count,
                (dp.statement_transaction_id IS NOT NULL) AS duplicate_valid,
                COUNT(*) AS line_count, MIN(bst.transaction_date) AS oldest_date
           FROM bank_statement_transactions bst
           JOIN bank_statement_imports bi ON bi.organization_id = bst.organization_id
             AND bi.id = bst.statement_import_id
           LEFT JOIN (
             SELECT m.organization_id, m.statement_transaction_id,
                    SUM(CASE WHEN m.identity_state = 'VERIFIED'
                                  AND m.creation_origin IN ('CANONICAL_ALLOCATION', 'STATEMENT_CREATION', 'LEGACY_VERIFIED')
                                  AND m.bank_account_id = st.bank_account_id
                                  AND m.ledger_account_id = ba.ledger_account_id
                                  AND jl.account_id = ba.ledger_account_id
                                  AND UPPER(st.currency) = UPPER(ba.currency)
                                  AND UPPER(st.currency) = UPPER(o.base_currency)
                                  AND (linked_account.currency_code IS NULL OR UPPER(linked_account.currency_code) = UPPER(o.base_currency))
                                  AND m.journal_entry_id = jl.journal_entry_id
                                  AND m.journal_line_id = jl.id
                                  AND je.organization_id = m.organization_id
                                  AND UPPER(COALESCE(je.status, '')) = 'POSTED'
                                  AND je.date <= $2
                                  AND je.reversal_of_journal_id IS NULL
                                  AND rev.journal_entry_id IS NULL
                                  AND ((UPPER(st.direction) = 'CREDIT' AND jl.debit > 0 AND COALESCE(jl.credit, 0) = 0)
                                    OR (UPPER(st.direction) = 'DEBIT' AND jl.credit > 0 AND COALESCE(jl.debit, 0) = 0))
                             THEN m.matched_amount ELSE 0 END) AS valid_amount,
                    SUM(CASE WHEN m.identity_state = 'VERIFIED'
                                  AND m.creation_origin IN ('CANONICAL_ALLOCATION', 'STATEMENT_CREATION', 'LEGACY_VERIFIED')
                                  AND m.bank_account_id = st.bank_account_id
                                  AND m.ledger_account_id = ba.ledger_account_id
                                  AND jl.account_id = ba.ledger_account_id
                                  AND UPPER(st.currency) = UPPER(ba.currency)
                                  AND UPPER(st.currency) = UPPER(o.base_currency)
                                  AND (linked_account.currency_code IS NULL OR UPPER(linked_account.currency_code) = UPPER(o.base_currency))
                                  AND m.journal_entry_id = jl.journal_entry_id
                                  AND m.journal_line_id = jl.id
                                  AND je.organization_id = m.organization_id
                                  AND UPPER(COALESCE(je.status, '')) = 'POSTED'
                                  AND je.date <= $2
                                  AND je.reversal_of_journal_id IS NULL
                                  AND rev.journal_entry_id IS NULL
                                  AND ((UPPER(st.direction) = 'CREDIT' AND jl.debit > 0 AND COALESCE(jl.credit, 0) = 0)
                                    OR (UPPER(st.direction) = 'DEBIT' AND jl.credit > 0 AND COALESCE(jl.debit, 0) = 0))
                             THEN 0 ELSE 1 END) AS invalid_count
               FROM bank_reconciliation_matches m
               JOIN bank_statement_transactions st ON st.organization_id = m.organization_id AND st.id = m.statement_transaction_id
               JOIN bank_accounts ba ON ba.organization_id = st.organization_id AND ba.id = st.bank_account_id
               JOIN organizations o ON o.id = st.organization_id
               LEFT JOIN accounts linked_account ON linked_account.organization_id = ba.organization_id AND linked_account.id = ba.ledger_account_id
               LEFT JOIN journal_entries je ON je.organization_id = m.organization_id AND je.id = m.journal_entry_id
               LEFT JOIN journal_lines jl ON (jl.organization_id = m.organization_id OR jl.organization_id IS NULL) AND jl.id = m.journal_line_id
               LEFT JOIN (SELECT organization_id, reversal_of_journal_id, MIN(id) AS journal_entry_id
                            FROM journal_entries WHERE UPPER(COALESCE(status, '')) = 'POSTED'
                              AND reversal_of_journal_id IS NOT NULL
                            GROUP BY organization_id, reversal_of_journal_id) rev
                 ON rev.organization_id = m.organization_id AND rev.reversal_of_journal_id = je.id
              WHERE m.organization_id = $1 AND m.allocation_state = 'ACTIVE'
              GROUP BY m.organization_id, m.statement_transaction_id
           ) alloc ON alloc.organization_id = bst.organization_id AND alloc.statement_transaction_id = bst.id
          LEFT JOIN duplicate_proofs dp ON dp.organization_id = bst.organization_id AND dp.statement_transaction_id = bst.id
          WHERE bst.organization_id = $1 AND bst.transaction_date <= $2
            AND UPPER(COALESCE(bi.status, 'COMPLETED')) NOT IN ('FAILED', 'CANCELLED', 'REJECTED')
          GROUP BY bst.bank_account_id, bst.reconciliation_status, bst.is_ignored, bst.amount, alloc.valid_amount, alloc.invalid_count,
                   CASE WHEN $3::date IS NOT NULL AND bst.transaction_date < $3::date THEN TRUE ELSE FALSE END,
                   (dp.statement_transaction_id IS NOT NULL)`,
        [organizationId, asOfDate, transactionFromDate || null],
      ),
      client.query(`SELECT base_currency FROM organizations WHERE id = $1`, [organizationId]),
    ]);

    const latestByAccount = new Map<string, any>();
    for (const statement of statementRows.rows as any[]) {
      if (!latestByAccount.has(String(statement.bank_account_id))) latestByAccount.set(String(statement.bank_account_id), statement);
    }
    const baseCurrency = String((organizationRows.rows as any[])[0]?.base_currency || '').toUpperCase();
    const ledgerByAccount = new Map<string, { bookBalanceAtStatement: number; laterBookActivity: number; ledgerCurrency: string | null }>();
    await Promise.all((accountRows.rows as any[]).map(async (account) => {
      const statement = latestByAccount.get(String(account.id));
      if (!statement || !account.ledger_account_id) return;
      const ledgerResult = await client.query(
        `SELECT la.currency_code AS ledger_currency,
                COALESCE(SUM(CASE WHEN je.date <= $3 THEN jl.debit - jl.credit ELSE 0 END), 0) AS book_balance_at_statement,
                COALESCE(SUM(CASE WHEN je.date > $3 AND je.date <= $4 THEN jl.debit - jl.credit ELSE 0 END), 0) AS later_book_activity
           FROM accounts la
           LEFT JOIN journal_lines jl ON jl.account_id = la.id
             AND (jl.organization_id = la.organization_id OR jl.organization_id IS NULL)
           LEFT JOIN journal_entries je ON je.organization_id = la.organization_id AND je.id = jl.journal_entry_id
             AND UPPER(COALESCE(je.status, '')) = 'POSTED'
          WHERE la.organization_id = $1 AND la.id = $2
          GROUP BY la.id, la.currency_code`,
        [organizationId, account.ledger_account_id, statement.statement_to, asOfDate],
      );
      if (ledgerResult.rows[0]) ledgerByAccount.set(String(account.id), {
        bookBalanceAtStatement: money(ledgerResult.rows[0].book_balance_at_statement),
        laterBookActivity: money(ledgerResult.rows[0].later_book_activity),
        ledgerCurrency: ledgerResult.rows[0].ledger_currency ? String(ledgerResult.rows[0].ledger_currency).toUpperCase() : null,
      });
    }));

    const grouped = new Map<string, Array<{ status: string; ignored: unknown; count: number; oldest: string | null; isPrior: boolean; amount: unknown; allocated: unknown; invalidAllocations: unknown; duplicateValid: unknown }>>();
    for (const row of transactionRows.rows as any[]) {
      const items = grouped.get(String(row.bank_account_id)) || [];
      items.push({ status: String(row.reconciliation_status || ''), ignored: row.is_ignored, count: Number(row.line_count || 0), oldest: dateOnly(row.oldest_date), isPrior: row.is_prior === true || row.is_prior === 'true', amount: row.statement_amount, allocated: row.valid_amount, invalidAllocations: row.invalid_count, duplicateValid: row.duplicate_valid });
      grouped.set(String(row.bank_account_id), items);
    }

    const accounts = (accountRows.rows as any[]).map((account): BankReconciliationAccountProjection => {
      const latest = latestByAccount.get(String(account.id));
      const row = { ...account, ...latest, ...ledgerByAccount.get(String(account.id)), profileCurrency: account.currency, statementCurrency: latest?.currency };
      const statementThrough = dateOnly(row.statement_to);
      const hasStatement = Boolean(row.import_id && statementThrough);
      const sameCurrency = Boolean(baseCurrency) && [row.profileCurrency, row.statementCurrency, row.ledgerCurrency]
        .every((value) => String(value || '').toUpperCase() === baseCurrency);
      const linked = Boolean(row.ledger_account_id && row.bookBalanceAtStatement !== null && row.bookBalanceAtStatement !== undefined && sameCurrency);
      // Statement lines with an end date after the requested cutoff still belong
      // in transaction visibility when their transaction date is in range; they
      // cannot supply a closing-balance comparison at this earlier cutoff.
      const statusGroups = grouped.get(String(row.id)) || [];
      const statusCounts: Record<string, number> = {};
      let statementTransactionCount = 0;
      let statementUnresolvedCount = 0;
      let statementResolvedCount = 0;
      let priorUnresolvedCount = 0;
      let oldestUnresolvedDate: string | null = null;
      for (const group of statusGroups) {
        const status = String(group.status || 'UNKNOWN').toUpperCase();
        const lineClass = classifyStatementLineStatus(status, group.ignored, group.amount, group.allocated, group.invalidAllocations, group.duplicateValid);
        statusCounts[status] = (statusCounts[status] || 0) + group.count;
        statementTransactionCount += group.count;
        if (lineClass === 'RESOLVED') statementResolvedCount += group.count;
        else if (['UNRESOLVED', 'REVIEW', 'LEGACY_REVIEW_REQUIRED'].includes(lineClass)) {
          // No legacy status is classified as resolved absent an allocation proof.
          if (group.isPrior) priorUnresolvedCount += group.count;
          else statementUnresolvedCount += group.count;
          if (group.oldest && (!oldestUnresolvedDate || group.oldest < oldestUnresolvedDate)) oldestUnresolvedDate = group.oldest;
        }
      }
      const bookBalanceAtStatement = hasStatement && linked ? money(row.bookBalanceAtStatement) : null;
      const statementBalance = hasStatement && row.statement_balance !== null && row.statement_balance !== undefined
        ? money(row.statement_balance) : null;
      return {
        accountId: String(row.id), accountName: String(row.account_name || ''), bankName: String(row.bank_name || ''),
        maskedAccountNumber: row.masked_account_number ? String(row.masked_account_number) : null,
        currency: String(row.profileCurrency || ''),
        ledgerAccountId: row.ledger_account_id ? String(row.ledger_account_id) : null,
        statementThrough, statementBalance, bookBalanceAtStatement,
        statementBookDifference: statementBalance !== null && bookBalanceAtStatement !== null
          ? money(statementBalance - bookBalanceAtStatement) : null,
        laterBookActivity: hasStatement && linked ? money(row.laterBookActivity) : null,
        statementTransactionCount: hasStatement || statusGroups.length ? statementTransactionCount : null,
        statementUnresolvedCount: hasStatement || statusGroups.length ? statementUnresolvedCount : null,
        priorUnresolvedCount: hasStatement || statusGroups.length ? priorUnresolvedCount : null,
        statementResolvedCount: hasStatement || statusGroups.length ? statementResolvedCount : null,
        oldestUnresolvedDate: hasStatement || statusGroups.length ? oldestUnresolvedDate : null,
        statementStatusCounts: hasStatement || statusGroups.length ? statusCounts : null,
        bookOutstandingAmount: null,
        bookCoverageState: !hasStatement ? 'NO_STATEMENT' : row.statement_balance === null || row.statement_balance === undefined
          ? 'MISSING_STATEMENT_BALANCE' : !row.ledger_account_id ? 'UNLINKED_ACCOUNT' : !sameCurrency ? 'CURRENCY_MISMATCH' : 'LEGACY_REVIEW_REQUIRED',
      };
    });

    const withStatements = accounts.filter((account) => account.statementTransactionCount !== null);
    const unresolvedCount = withStatements.reduce((sum, account) => sum + (account.statementUnresolvedCount || 0), 0);
    const priorUnresolvedCount = withStatements.reduce((sum, account) => sum + (account.priorUnresolvedCount || 0), 0);
    const count = withStatements.reduce((sum, account) => sum + (account.statementTransactionCount || 0), 0);
    const oldest = withStatements.map((account) => account.oldestUnresolvedDate).filter((date): date is string => Boolean(date)).sort()[0] || null;
    return {
      asOfDate,
      accounts,
      statementTransactionCount: withStatements.length ? count : null,
      statementUnresolvedCount: withStatements.length ? unresolvedCount : null,
      priorUnresolvedCount: withStatements.length ? priorUnresolvedCount : null,
      oldestUnresolvedDate: oldest,
      hasStatement: accounts.some((account) => account.statementThrough !== null),
    };
  }
}
