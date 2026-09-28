import { db } from '../database/db';

export interface BankBookMovementFilters {
  search?: string;
  limit: number;
  offset: number;
}

export interface BankBookMovement {
  id: string;
  journalEntryId: string;
  entryNumber: string;
  date: string;
  reference: string | null;
  description: string | null;
  lineDescription: string | null;
  debit: number;
  credit: number;
  direction: 'INFLOW' | 'OUTFLOW';
  amount: number;
  currency: string;
  isReversal: boolean;
  reversalOfJournalId: string | null;
}

export interface BankBookMovementPage {
  movements: BankBookMovement[];
  currency: string;
  total: number;
  inflowTotal: number;
  outflowTotal: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface BankBookMovementSuggestion {
  movementId: string;
  journalEntryId: string;
  entryNumber: string;
  date: string;
  amount: number;
  direction: 'INFLOW' | 'OUTFLOW';
  reference: string | null;
  description: string | null;
  confidenceScore: number;
  reasons: string[];
  readonlyOnly: true;
}

/** Read-only view over posted ledger lines for the bank account's explicit ledger link. */
export class BankBookMovementService {
  public static async suggestForStatementTransaction(
    organizationId: string,
    statementTransactionId: string
  ): Promise<BankBookMovementSuggestion[]> {
    const statementResult = await db.query(
      `SELECT st.id, st.bank_account_id, st.transaction_date, st.amount, st.direction,
              COALESCE(statement_alloc.allocated_amount, 0) AS allocated_amount,
              st.narration, st.reference, st.utr, st.rrn, st.upi_reference, st.currency AS statement_currency,
              ba.ledger_account_id, ba.currency AS bank_currency,
              a.currency_code AS account_currency, o.base_currency
         FROM bank_statement_transactions st
         JOIN bank_accounts ba ON ba.id = st.bank_account_id AND ba.organization_id = st.organization_id
         LEFT JOIN accounts a ON a.id = ba.ledger_account_id AND a.organization_id = ba.organization_id
         JOIN organizations o ON o.id = ba.organization_id
         LEFT JOIN (
           SELECT organization_id, statement_transaction_id, SUM(matched_amount) AS allocated_amount
             FROM bank_reconciliation_matches
            WHERE allocation_state = 'ACTIVE' AND identity_state = 'VERIFIED'
            GROUP BY organization_id, statement_transaction_id
         ) statement_alloc ON statement_alloc.organization_id = st.organization_id
                          AND statement_alloc.statement_transaction_id = st.id
        WHERE st.id = $1 AND st.organization_id = $2
          AND COALESCE(ba.is_active, FALSE) = TRUE
          AND COALESCE(ba.is_archived, FALSE) = FALSE
          AND UPPER(COALESCE(ba.status, '')) = 'ACTIVE'`,
      [statementTransactionId, organizationId]
    );
    if (!statementResult.rows.length) throw new Error('BANK_STATEMENT_TRANSACTION_NOT_FOUND');
    const statement = statementResult.rows[0];
    if (!statement.ledger_account_id) throw new Error('BANK_LEDGER_ACCOUNT_NOT_LINKED');

    const bankCurrency = String(statement.bank_currency || '').toUpperCase();
    const statementCurrency = String(statement.statement_currency || '').toUpperCase();
    const baseCurrency = String(statement.base_currency || '').toUpperCase();
    const accountCurrency = statement.account_currency ? String(statement.account_currency).toUpperCase() : null;
    const ledgerCurrency = accountCurrency || baseCurrency;
    const validCurrency = (code: string) => /^[A-Z]{3}$/.test(code);
    // The ledger has no per-line currency field. FirmBooks posts base-currency
    // amounts; use an explicit account currency when present, otherwise the
    // tenant's enforced base currency is the only available evidence.
    if (!validCurrency(bankCurrency) || !validCurrency(statementCurrency) ||
        !validCurrency(baseCurrency) || !validCurrency(ledgerCurrency) ||
        bankCurrency !== statementCurrency || bankCurrency !== baseCurrency ||
        (accountCurrency !== null && accountCurrency !== baseCurrency)) {
      throw new Error('BANK_CURRENCY_UNSUPPORTED');
    }

    const statementAmountCents = Math.round((Math.abs(Number(statement.amount || 0)) - Number(statement.allocated_amount || 0)) * 100);
    const statementAmount = statementAmountCents > 0 ? statementAmountCents / 100 : 0;
    if (!Number.isFinite(statementAmount) || statementAmount <= 0) return [];
    const isInflow = String(statement.direction).toUpperCase() === 'CREDIT';
    const side = isInflow ? 'debit' : 'credit';
    const txDate = statement.transaction_date instanceof Date
      ? statement.transaction_date.toISOString().slice(0, 10)
      : String(statement.transaction_date).slice(0, 10);
    const txDateObject = new Date(`${txDate}T00:00:00.000Z`);
    const dateBound = (days: number) => {
      const bound = new Date(txDateObject);
      bound.setUTCDate(bound.getUTCDate() + days);
      return bound.toISOString().slice(0, 10);
    };
    const txText = [statement.narration, statement.reference, statement.utr, statement.rrn, statement.upi_reference]
      .filter(Boolean).join(' ').toUpperCase();
    const genericNarrationWords = new Set(['PAYMENT', 'SUPPLIER', 'CUSTOMER', 'INVOICE', 'TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'REFUND']);
    const narrationWords = txText.match(/[A-Z0-9][A-Z0-9/-]{2,}/g) || [];
    const narrationReferences: string[] = [];
    for (let start = 0; start < narrationWords.length; start += 1) {
      for (let width = 2; width <= 4 && start + width <= narrationWords.length; width += 1) {
        const phrase = narrationWords.slice(start, start + width).join(' ');
        if ((/\d/.test(phrase) || phrase.length >= 10) && !phrase.split(' ').every((word) => genericNarrationWords.has(word))) {
          narrationReferences.push(phrase);
        }
      }
    }
    const explicitReferences = [statement.reference, statement.utr, statement.rrn, statement.upi_reference]
      .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value: string) => value.trim().toUpperCase());
    const referenceTokens = Array.from(new Set([...explicitReferences, ...narrationWords, ...narrationReferences]))
      .filter((token) => !genericNarrationWords.has(token))
      .slice(0, 40);
    const rawReferenceSql = referenceTokens.length
      ? `UPPER(reference) IN (${referenceTokens.map((_, index) => `$${index + 7}`).join(', ')})`
      : 'FALSE';
    const candidateParams = [statement.bank_account_id, organizationId, statement.ledger_account_id,
      statementAmount, dateBound(-14), dateBound(14), ...referenceTokens];
    const candidateResult = await db.query(
      `WITH active_line_allocations AS (
         SELECT journal_line_id, SUM(matched_amount) AS allocated_amount
           FROM bank_reconciliation_matches
          WHERE organization_id = $2 AND allocation_state = 'ACTIVE' AND identity_state = 'VERIFIED'
          GROUP BY journal_line_id
       ), eligible_movements AS (
         SELECT jl.id AS movement_id, je.id AS journal_entry_id, je.entry_number,
                je.date AS entry_date, je.reference, je.description AS entry_description,
                jl.description AS line_description,
                GREATEST(COALESCE(jl.${side}, 0) - COALESCE(alloc.allocated_amount, 0), 0) AS available_amount,
                je.reversal_of_journal_id
           FROM bank_accounts ba
           JOIN journal_lines jl ON jl.account_id = ba.ledger_account_id
           JOIN journal_entries je ON je.id = jl.journal_entry_id
           LEFT JOIN journal_entries reversal
             ON reversal.organization_id = $2 AND reversal.reversal_of_journal_id = je.id
            AND UPPER(reversal.status) = 'POSTED'
           LEFT JOIN active_line_allocations alloc ON alloc.journal_line_id = jl.id
          WHERE ba.id = $1 AND ba.organization_id = $2 AND ba.ledger_account_id = $3
            AND COALESCE(ba.is_active, FALSE) = TRUE AND COALESCE(ba.is_archived, FALSE) = FALSE
            AND UPPER(COALESCE(ba.status, '')) = 'ACTIVE'
            AND je.organization_id = $2 AND COALESCE(jl.organization_id, je.organization_id) = $2
            AND UPPER(je.status) = 'POSTED'
            AND je.reversal_of_journal_id IS NULL
            AND ((COALESCE(jl.debit, 0) > 0 AND COALESCE(jl.credit, 0) = 0)
              OR (COALESCE(jl.credit, 0) > 0 AND COALESCE(jl.debit, 0) = 0))
            AND GREATEST(COALESCE(jl.${side}, 0) - COALESCE(alloc.allocated_amount, 0), 0) > 0
            AND reversal.id IS NULL
       ), selected_movements AS (
         SELECT * FROM (
           SELECT * FROM eligible_movements
            WHERE entry_date BETWEEN $5::date AND $6::date
            ORDER BY entry_date DESC, journal_entry_id DESC, movement_id DESC
            LIMIT 250
         ) recent_movements
         UNION
         SELECT * FROM eligible_movements
          WHERE COALESCE(reference, '') <> ''
            AND (${rawReferenceSql})
       )
       SELECT * FROM selected_movements
        ORDER BY entry_date DESC, journal_entry_id DESC, movement_id DESC`,
      candidateParams
    );

    const txDateTime = new Date(txDate).getTime();
    return candidateResult.rows.map((row: any) => {
      const movementDate = row.entry_date instanceof Date ? row.entry_date.toISOString().slice(0, 10) : String(row.entry_date).slice(0, 10);
    const movementAmount = Number(row.available_amount || 0);
      const days = Math.abs(txDateTime - new Date(movementDate).getTime()) / 86_400_000;
      const candidateReference = String(row.reference || '').trim();
      const refMatch = Boolean(candidateReference && txText.includes(candidateReference.toUpperCase()));
      const reasons: string[] = [];
      let score = 0;
      if (movementAmount === statementAmount) {
        score += 50;
        reasons.push('Exact amount');
      } else if (Math.abs(movementAmount - statementAmount) <= Math.max(statementAmount, movementAmount) * 0.1) {
        score += 30;
        reasons.push('Similar amount');
      } else {
        reasons.push('Amount differs; verify split or combined transactions');
      }
      if (days <= 1) { score += 30; reasons.push('Within one day'); }
      else if (days <= 5) { score += 20; reasons.push('Within five days'); }
      else if (days <= 14) { score += 10; reasons.push('Within fourteen days'); }
      if (refMatch) { score += 40; reasons.push('Reference appears in statement'); }
      return {
        movementId: row.movement_id,
        journalEntryId: row.journal_entry_id,
        entryNumber: row.entry_number,
        date: movementDate,
        amount: movementAmount,
        direction: (isInflow ? 'INFLOW' : 'OUTFLOW') as 'INFLOW' | 'OUTFLOW',
        reference: row.reference || null,
        description: row.line_description || row.entry_description || null,
        confidenceScore: Math.min(score, 100),
        reasons,
        readonlyOnly: true as const,
      };
    }).filter((candidate) => {
      const days = Math.abs(txDateTime - new Date(candidate.date).getTime()) / 86_400_000;
      return days <= 14 || candidate.reasons.includes('Reference appears in statement');
    }).sort((a, b) => b.confidenceScore - a.confidenceScore || b.date.localeCompare(a.date)).slice(0, 10);
  }

  public static async list(
    organizationId: string,
    bankAccountId: string,
    filters: BankBookMovementFilters
  ): Promise<BankBookMovementPage> {
    const accountResult = await db.query(
      `SELECT ba.ledger_account_id, ba.currency, a.currency_code AS account_currency, o.base_currency
         FROM bank_accounts ba
         LEFT JOIN accounts a ON a.id = ba.ledger_account_id AND a.organization_id = ba.organization_id
         JOIN organizations o ON o.id = ba.organization_id
        WHERE ba.id = $1 AND ba.organization_id = $2
          AND COALESCE(ba.is_active, FALSE) = TRUE
          AND COALESCE(ba.is_archived, FALSE) = FALSE
          AND UPPER(COALESCE(ba.status, '')) = 'ACTIVE'`,
      [bankAccountId, organizationId]
    );
    if (!accountResult.rows.length) throw new Error('BANK_ACCOUNT_NOT_FOUND');
    const linkedLedgerAccountId = accountResult.rows[0].ledger_account_id;
    if (!linkedLedgerAccountId) throw new Error('BANK_LEDGER_ACCOUNT_NOT_LINKED');
    const baseCurrency = String(accountResult.rows[0].base_currency || '').toUpperCase();
    const explicitAccountCurrency = accountResult.rows[0].account_currency
      ? String(accountResult.rows[0].account_currency).toUpperCase()
      : null;
    if (!/^[A-Z]{3}$/.test(baseCurrency) ||
        (explicitAccountCurrency !== null &&
          (!/^[A-Z]{3}$/.test(explicitAccountCurrency) || explicitAccountCurrency !== baseCurrency))) {
      throw new Error('BANK_CURRENCY_UNSUPPORTED');
    }
    const verifiedLedgerCurrency = explicitAccountCurrency || baseCurrency;

    const search = filters.search?.trim();
    const params: unknown[] = [organizationId, bankAccountId, linkedLedgerAccountId];
    const searchClause = search
      ? ` AND (
            je.entry_number ILIKE $4 OR COALESCE(je.reference, '') ILIKE $4 OR
            COALESCE(je.description, '') ILIKE $4 OR COALESCE(jl.description, '') ILIKE $4
          )`
      : '';
    if (search) params.push(`%${search}%`);
    const filterSql = `ba.id = $2 AND ba.organization_id = $1 AND ba.ledger_account_id = $3
      AND je.organization_id = $1 AND COALESCE(jl.organization_id, je.organization_id) = $1
      AND jl.account_id = ba.ledger_account_id AND UPPER(je.status) = 'POSTED'
      AND ((COALESCE(jl.debit, 0) > 0 AND COALESCE(jl.credit, 0) = 0)
        OR (COALESCE(jl.credit, 0) > 0 AND COALESCE(jl.debit, 0) = 0))${searchClause}`;

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(jl.debit), 0) AS inflow_total,
              COALESCE(SUM(jl.credit), 0) AS outflow_total
         FROM bank_accounts ba
         JOIN journal_lines jl ON jl.account_id = ba.ledger_account_id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE ${filterSql}`,
      params
    );

    const pageParams = [...params, filters.limit, filters.offset];
    const pageResult = await db.query(
      `SELECT jl.id AS movement_id, je.id AS journal_entry_id, je.entry_number,
              je.date, je.reference, je.description AS entry_description,
              jl.description AS line_description, jl.debit, jl.credit,
              je.reversal_of_journal_id
         FROM bank_accounts ba
         JOIN journal_lines jl ON jl.account_id = ba.ledger_account_id
         JOIN journal_entries je ON je.id = jl.journal_entry_id
        WHERE ${filterSql}
        ORDER BY je.date DESC, je.created_at DESC, je.id DESC, jl.id DESC
        LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
      pageParams
    );

    const totals = countResult.rows[0] || {};
    const movements = pageResult.rows.map((row: any): BankBookMovement => {
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      const isInflow = debit > 0;
      return {
        id: row.movement_id,
        journalEntryId: row.journal_entry_id,
        entryNumber: row.entry_number,
        date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10),
        reference: row.reference || null,
        description: row.entry_description || null,
        lineDescription: row.line_description || null,
        debit,
        credit,
        direction: isInflow ? 'INFLOW' : 'OUTFLOW',
        amount: isInflow ? debit : credit,
        currency: verifiedLedgerCurrency,
        isReversal: Boolean(row.reversal_of_journal_id),
        reversalOfJournalId: row.reversal_of_journal_id || null,
      };
    });

    const total = Number(totals.total || 0);
    return {
      movements,
      currency: verifiedLedgerCurrency,
      total,
      inflowTotal: Number(totals.inflow_total || 0),
      outflowTotal: Number(totals.outflow_total || 0),
      limit: filters.limit,
      offset: filters.offset,
      hasMore: filters.offset + movements.length < total,
    };
  }
}
