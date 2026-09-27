import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { BankBookMovementService } from '../banking/BankBookMovementService';

describe('BankBookMovementService', () => {
  const orgId = 'org-bank-book-movements';
  const otherOrgId = 'org-bank-book-movements-other';
  const bankAccountId = 'bank-book-movements-account';
  const ledgerAccountId = 'bank-book-movements-ledger';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ('usr-bank-book-movements', 'bank-book-movements@example.com', 'hash', 'Bank Tester', 'Active')
       ON CONFLICT DO NOTHING`
    );
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-bank-book-movements', 'pub-bank-book-movements', 'BBM', 'Bank Test', 'IN', 'INR', '₹', 'usr-bank-book-movements'),
              ($2, 'uuid-bank-book-movements-other', 'pub-bank-book-movements-other', 'BBMO', 'Other Bank Test', 'IN', 'INR', '₹', 'usr-bank-book-movements')
       ON CONFLICT DO NOTHING`,
      [orgId, otherOrgId]
    );
    await db.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, status)
       VALUES ($1, $2, '1001', 'Bank Ledger', 'Asset', 'Bank', 'Active')`,
      [ledgerAccountId, orgId]
    );
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active)
       VALUES ($1, $2, $3, 'Operating', '1234', 'Test Bank', 'INR', 'Active', TRUE)`,
      [bankAccountId, orgId, ledgerAccountId]
    );
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status, reversal_of_journal_id)
       VALUES ('je-book-credit', $1, 'JE-001', '2026-09-01', 'REF-1', 'Customer receipt', 'Posted', NULL),
              ('je-book-debit', $1, 'JE-002', '2026-09-02', 'REF-2', 'Vendor payment', 'Posted', NULL),
              ('je-book-draft', $1, 'JE-003', '2026-09-03', 'REF-3', 'Draft payment', 'Draft', NULL),
              ('je-book-reversal', $1, 'JE-004', '2026-09-04', 'REF-4', 'Reverse payment', 'Posted', 'je-book-debit'),
              ('je-book-other-tenant', $2, 'JE-005', '2026-09-05', 'REF-5', 'Other tenant', 'Posted', NULL)`,
      [orgId, otherOrgId]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('jl-book-credit', 'je-book-credit', NULL, $2, 125.00, 0, 'Customer deposit'),
              ('jl-book-debit', 'je-book-debit', $1, $2, 0, 40.00, 'Supplier payment'),
              ('jl-book-draft', 'je-book-draft', $1, $2, 0, 10.00, 'Draft line'),
              ('jl-book-reversal', 'je-book-reversal', $1, $2, 40.00, 0, 'Reversal line'),
              ('jl-book-malformed', 'je-book-credit', $1, $2, 1.00, 1.00, 'Malformed both-side line'),
              ('jl-book-other-tenant', $3, $1, $2, 900.00, 0, 'Cross tenant line')`,
      [orgId, ledgerAccountId, 'je-book-other-tenant']
    );
  });

  it('returns only tenant-scoped posted bank ledger lines and paginates/counts on the server', async () => {
    const firstPage = await BankBookMovementService.list(orgId, bankAccountId, { limit: 2, offset: 0 });
    expect(firstPage.total).toBe(3);
    expect(firstPage.movements).toHaveLength(2);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.inflowTotal).toBe(165);
    expect(firstPage.outflowTotal).toBe(40);
    expect(firstPage.currency).toBe('INR');
    expect(firstPage.movements[0]).toMatchObject({
      id: 'jl-book-reversal', direction: 'INFLOW', amount: 40, isReversal: true,
    });

    const secondPage = await BankBookMovementService.list(orgId, bankAccountId, { limit: 2, offset: 2 });
    expect(secondPage.movements).toHaveLength(1);
    expect(secondPage.hasMore).toBe(false);
  });

  it('applies search before calculating counts and totals', async () => {
    const result = await BankBookMovementService.list(orgId, bankAccountId, {
      search: 'supplier', limit: 25, offset: 0,
    });
    expect(result.total).toBe(1);
    expect(result.inflowTotal).toBe(0);
    expect(result.outflowTotal).toBe(40);
    expect(result.movements[0].id).toBe('jl-book-debit');
  });

  it('does not infer a ledger link when the bank profile is unlinked', async () => {
    await db.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active)
       VALUES ('bank-book-movements-unlinked', $1, NULL, 'Unlinked', '5678', 'Test Bank', 'INR', 'Active', TRUE)`,
      [orgId]
    );
    await expect(BankBookMovementService.list(orgId, 'bank-book-movements-unlinked', { limit: 25, offset: 0 }))
      .rejects.toThrow('BANK_LEDGER_ACCOUNT_NOT_LINKED');
  });

  it('returns read-only ledger-line suggestions using journal_lines.id', async () => {
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ('je-book-suggestion', $1, 'JE-SUGGESTION', '2026-09-02', 'REF-2', 'Supplier payment', 'Posted')`,
      [orgId]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('jl-book-suggestion', 'je-book-suggestion', $1, $2, 0, 40, 'Supplier payment')`,
      [orgId, ledgerAccountId]
    );
    await db.query(
      `INSERT INTO bank_statement_transactions
         (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, reference, currency, fingerprint)
       VALUES ('statement-book-suggestion', $1, $2, 'import-book-suggestion', '2026-09-02', 40, 'DEBIT', 'Supplier payment REF-2', 'REF-2', 'INR', 'fp-book-suggestion')`,
      [orgId, bankAccountId]
    );
    const suggestions = await BankBookMovementService.suggestForStatementTransaction(orgId, 'statement-book-suggestion');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      movementId: 'jl-book-suggestion',
      journalEntryId: 'je-book-suggestion',
      direction: 'OUTFLOW',
      amount: 40,
      confidenceScore: 100,
      readonlyOnly: true,
    });
  });

  it('matches historical references containing spaces as a normalized whole reference', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
         (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, reference, currency, fingerprint)
       VALUES ('statement-book-spaced-ref', $1, $2, 'import-book-spaced-ref', '2026-09-02', 40, 'DEBIT', 'Transfer', 'HISTORIC REF 77', 'INR', 'fp-book-spaced-ref')`,
      [orgId, bankAccountId]
    );
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ('je-book-spaced-ref', $1, 'JE-SPACED-REF', '2020-01-01', 'HISTORIC REF 77', 'Historical reference match', 'Posted')`,
      [orgId]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('jl-book-spaced-ref', 'je-book-spaced-ref', $1, $2, 0, 40, 'Historical reference match')`,
      [orgId, ledgerAccountId]
    );

    const suggestions = await BankBookMovementService.suggestForStatementTransaction(orgId, 'statement-book-spaced-ref');
    expect(suggestions.map((candidate) => candidate.movementId)).toContain('jl-book-spaced-ref');
  });

  it('rejects a linked ledger whose explicit currency differs from tenant base currency', async () => {
    await db.query(`UPDATE accounts SET currency_code = 'USD' WHERE organization_id = $1 AND id = $2`, [orgId, ledgerAccountId]);
    await expect(BankBookMovementService.list(orgId, bankAccountId, { limit: 25, offset: 0 }))
      .rejects.toThrow('BANK_CURRENCY_UNSUPPORTED');
  });

  it('applies date/reference eligibility before limiting and excludes reversed lines while preserving other lines in an ambiguously matched journal', async () => {
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ('je-suggestion-active', $1, 'JE-ACTIVE', '2026-09-02', 'REF-2', 'Current eligible', 'Posted')`,
      [orgId]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('jl-suggestion-active', 'je-suggestion-active', $1, $2, 0, 40, 'Current eligible')`,
      [orgId, ledgerAccountId]
    );
    await db.query(
      `INSERT INTO bank_statement_transactions
         (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, reference, currency, fingerprint)
       VALUES ('statement-book-history', $1, $2, 'import-book-history', '2026-09-02', 40, 'DEBIT', 'Payment REF-2 HIST-ELIGIBLE HIST-REVERSED HIST-MATCHED', 'REF-2', 'INR', 'fp-book-history')`,
      [orgId, bankAccountId]
    );
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status, reversal_of_journal_id)
       VALUES ('je-hist-eligible', $1, 'JE-HIST-ELIGIBLE', '2020-01-01', 'HIST-ELIGIBLE', 'Eligible historical', 'Posted', NULL),
              ('je-hist-reversed', $1, 'JE-HIST-REVERSED', '2020-01-01', 'HIST-REVERSED', 'Reversed original', 'Posted', NULL),
              ('je-hist-reversal', $1, 'JE-HIST-REVERSAL', '2020-01-02', 'REV-1', 'Reversal', 'Posted', 'je-hist-reversed'),
              ('je-hist-matched', $1, 'JE-HIST-MATCHED', '2020-01-01', 'HIST-MATCHED', 'Legacy matched', 'Posted', NULL)`,
      [orgId]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('jl-hist-eligible', 'je-hist-eligible', $1, $2, 0, 40, 'Eligible historical'),
              ('jl-hist-reversed', 'je-hist-reversed', $1, $2, 0, 40, 'Reversed original'),
              ('jl-hist-reversal', 'je-hist-reversal', $1, $2, 40, 0, 'Reversal'),
              ('jl-hist-matched', 'je-hist-matched', $1, $2, 0, 40, 'Legacy matched')`,
      [orgId, ledgerAccountId]
    );
    await db.query(
      `INSERT INTO bank_reconciliation_matches
         (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ('match-hist-legacy', $1, 'statement-book-history', 'journal', 'je-hist-matched', 40, 'MATCHED')`,
      [orgId]
    );
    for (let i = 0; i < 251; i += 1) {
      const entryId = `je-hist-noise-${i}`;
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
         VALUES ($1, $2, $3, '2026-09-02', $4, 'Date-window candidate', 'Posted')`,
        [entryId, orgId, `JE-N-${i}`, `NOISE-${i}`]
      );
      await db.query(
        `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
         VALUES ($1, $2, $3, $4, 0, 40)`,
        [`jl-hist-noise-${i}`, entryId, orgId, ledgerAccountId]
      );
    }

    const suggestions = await BankBookMovementService.suggestForStatementTransaction(orgId, 'statement-book-history');
    expect(suggestions.map((candidate) => candidate.movementId)).toContain('jl-hist-eligible');
    expect(suggestions.map((candidate) => candidate.movementId)).toContain('jl-suggestion-active');
    expect(suggestions.map((candidate) => candidate.movementId)).not.toContain('jl-hist-reversed');
    // The old document-level reference only names a journal, not the matched
    // line. Keep other candidate lines visible; write operations separately
    // fail closed while unresolved legacy identity exists.
    expect(suggestions.map((candidate) => candidate.movementId)).toContain('jl-hist-matched');
    expect(suggestions.map((candidate) => candidate.movementId)).not.toContain('jl-hist-reversal');
    expect(suggestions.length).toBeLessThanOrEqual(10);
  });

  it('filters canonical allocations per journal line and preserves an unallocated line in the same journal', async () => {
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, reference, description, status)
       VALUES ('je-multi-bank-lines', $1, 'JE-MULTI', '2026-09-02', 'MULTI-REF-19', 'Multi-line receipt', 'Posted')`, [orgId],
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit, description)
       VALUES ('jl-multi-consumed', 'je-multi-bank-lines', $1, $2, 0, 40, 'Already allocated line'),
              ('jl-multi-available', 'je-multi-bank-lines', $1, $2, 0, 40, 'Available line')`, [orgId, ledgerAccountId],
    );
    await db.query(
      `INSERT INTO bank_reconciliation_matches
         (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id,
          matched_amount, status, bank_account_id, ledger_account_id, journal_entry_id, journal_line_id,
          identity_state, creation_origin, allocation_state)
       VALUES ('allocation-multi-line', $1, 'old-statement-line', 'journal_line', 'jl-multi-consumed',
          40, 'MATCHED', $2, $3, 'je-multi-bank-lines', 'jl-multi-consumed',
          'VERIFIED', 'CANONICAL_ALLOCATION', 'ACTIVE')`, [orgId, bankAccountId, ledgerAccountId],
    );
    await db.query(
      `INSERT INTO bank_statement_transactions
         (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, reference, currency, fingerprint)
       VALUES ('statement-multi-bank-lines', $1, $2, 'import-multi-bank-lines', '2026-09-02', 40, 'DEBIT', 'Receipt MULTI-REF-19', 'MULTI-REF-19', 'INR', 'fp-multi-bank-lines')`,
      [orgId, bankAccountId],
    );
    const suggestions = await BankBookMovementService.suggestForStatementTransaction(orgId, 'statement-multi-bank-lines');
    expect(suggestions.map((candidate) => candidate.movementId)).not.toContain('jl-multi-consumed');
    expect(suggestions.map((candidate) => candidate.movementId)).toContain('jl-multi-available');
  });

  it('refuses to suggest when statement, bank, and ledger currency evidence disagree', async () => {
    await db.query(
      `INSERT INTO bank_statement_transactions
         (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint)
       VALUES ('statement-book-currency', $1, $2, 'import-book-currency', '2026-09-02', 40, 'DEBIT', 'Payment', 'USD', 'fp-book-currency')`,
      [orgId, bankAccountId]
    );
    await expect(BankBookMovementService.suggestForStatementTransaction(orgId, 'statement-book-currency'))
      .rejects.toThrow('BANK_CURRENCY_UNSUPPORTED');

    await db.query(`UPDATE accounts SET currency_code = 'USD' WHERE organization_id = $1 AND id = $2`, [orgId, ledgerAccountId]);
    await db.query(`UPDATE bank_statement_transactions SET currency = 'INR' WHERE organization_id = $1 AND id = $2`, [orgId, 'statement-book-currency']);
    await expect(BankBookMovementService.suggestForStatementTransaction(orgId, 'statement-book-currency'))
      .rejects.toThrow('BANK_CURRENCY_UNSUPPORTED');
  });
});
