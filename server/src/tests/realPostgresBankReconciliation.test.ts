import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import app from '../index';
import { JwtAuth } from '../auth/jwt';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { BankMovementAllocationService } from '../banking/BankMovementAllocationService';
import { BankLegacyAllocationVerificationService } from '../banking/BankLegacyAllocationVerificationService';
import { BankStatementEntryCreationService } from '../banking/BankStatementEntryCreationService';
import { BankReconciliationService } from '../banking/BankReconciliationService';
import { BankReconciliationProjectionService } from '../banking/BankReconciliationProjectionService';

const { Client } = pg;
const runAgainstPostgres = process.env.REQUIRE_REAL_POSTGRES === 'true';
const postgresDescribe = runAgainstPostgres ? describe : describe.skip;
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const organizationId = `org_bank_pg_${suffix}`;
const actorId = `usr_bank_pg_${suffix}`;
const bankLedgerId = `acc_bank_pg_${suffix}`;
const expenseId = `acc_expense_pg_${suffix}`;
const bankAccountId = `bank_profile_pg_${suffix}`;
const importId = `bank_import_pg_${suffix}`;
const statementId = `bank_statement_pg_${suffix}`;

postgresDescribe('Real PostgreSQL bank statement reconciliation qualification', () => {
  let client: pg.Client;

  beforeAll(async () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
    db.resetPool();
    expect(db.isMemoryMode()).toBe(false);
    await MigrationRunner.runMigrations();
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, $2, 'qualification-hash', 'Bank Qualification Owner', 'Active')`,
      [actorId, `${actorId}@firmbooks.test`],
    );
    await client.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, 'BPG', 'PostgreSQL Bank Reconciliation Qualification', 'IN', 'INR', '₹', $4)`,
      [organizationId, `uuid-${organizationId}`, `pub-${organizationId}`, actorId],
    );
    await client.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, status)
       VALUES ($1, $2, $3, 'Owner', 'Active')`,
      [`member-${suffix}`, organizationId, actorId],
    );
    await client.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status, allow_direct_posting, currency_code)
       VALUES ($1, $3, '1010', 'Qualification Bank', 'Asset', 'Bank', 0, 'Active', TRUE, 'INR'),
              ($2, $3, '6001', 'Qualification Expense', 'Expense', 'Operating Expense', 0, 'Active', TRUE, 'INR')`,
      [bankLedgerId, expenseId, organizationId],
    );
    await client.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active)
       VALUES ($1, $2, $3, 'Qualification Account', 'PG-001', 'Qualification Bank', 'INR', 'Active', TRUE)`,
      [bankAccountId, organizationId, bankLedgerId],
    );
    await client.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, status)
       VALUES ($1, $2, $3, 'CSV', 'qualification.csv', $4, 'INR', $5, 'COMPLETED')`,
      [importId, organizationId, bankAccountId, `hash-${suffix}`, actorId],
    );
    await client.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ($1, $2, $3, $4, '2026-09-15', 125.50, 'DEBIT', 'Qualification bank payment', 'INR', $5, 'UNMATCHED')`,
      [statementId, organizationId, bankAccountId, importId, `fingerprint-${suffix}`],
    );
  }, 60_000);

  afterAll(async () => {
    await client?.end();
  });

  it('posts only the exact remainder, persists its operation receipt, and reverses back to partial status', async () => {
    const prior = await db.transaction((tx) => ServerPostingEngine.postEntry({
      organizationId,
      entryNumber: `BANK-PG-PRIOR-${suffix}`,
      date: '2026-09-14',
      description: 'Previously recorded bank payment',
      lines: [
        { accountId: expenseId, debit: 40.25, credit: 0, description: 'Existing payment' },
        { accountId: bankLedgerId, debit: 0, credit: 40.25, description: 'Existing payment' },
      ],
    }, tx), { organizationId });
    const bankLine = await client.query(
      `SELECT id FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2 AND account_id = $3 AND credit = 40.25 AND debit = 0`,
      [organizationId, prior.entryId, bankLedgerId],
    );
    expect(bankLine.rows).toHaveLength(1);
    const partial = await BankMovementAllocationService.allocate(organizationId, statementId, String(bankLine.rows[0].id), '40.25', actorId);
    expect(partial.statementStatus).toBe('PARTIALLY_MATCHED');

    const operationId = `bankentry-${suffix}`;
    const created = await BankStatementEntryCreationService.create(
      organizationId, statementId, expenseId, actorId, '85.25', operationId,
    );
    expect(created).toMatchObject({ amount: '85.25', statementStatus: 'MATCHED', creationOperationId: operationId });
    const allocations = await client.query(
      `SELECT matched_amount::text AS amount, allocation_state, identity_state, creation_origin, match_reasons
         FROM bank_reconciliation_matches WHERE organization_id = $1 AND statement_transaction_id = $2
        ORDER BY id`, [organizationId, statementId],
    );
    expect(allocations.rows).toHaveLength(2);
    expect(allocations.rows.every((row) => row.allocation_state === 'ACTIVE' && row.identity_state === 'VERIFIED')).toBe(true);
    expect(allocations.rows.reduce((sum, row) => sum + Number(row.amount), 0)).toBeCloseTo(125.5, 2);
    const createdAllocation = allocations.rows.find((row) => row.creation_origin === 'STATEMENT_CREATION');
    expect(createdAllocation?.amount).toBe('85.25');
    expect(createdAllocation?.match_reasons.creationOperationId).toBe(operationId);

    const receipt = await BankMovementAllocationService.getStatementReceipt(organizationId, statementId);
    expect(receipt.allocations.find((allocation) => allocation.allocationId === created.allocationId)?.creationOperationId).toBe(operationId);

    await client.query(
      `UPDATE bank_statement_imports SET statement_from = '2026-09-15', statement_to = '2026-09-15',
         closing_balance = -125.50, closing_balance_verified = TRUE, balance_discrepancy = 0
       WHERE organization_id = $1 AND id = $2`, [organizationId, importId],
    );
    const duplicateStatementId = `${statementId}-duplicate`;
    await client.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ($1, $2, $3, $4, '2026-09-15', 125.50, 'DEBIT', 'Duplicate imported line', 'INR', $5, 'CONFIRMED_DUPLICATE')`,
      [duplicateStatementId, organizationId, bankAccountId, importId, `fingerprint-duplicate-${suffix}`],
    );
    const dispositionId = `disp_bank_pg_${suffix}`;
    await client.query(
      `INSERT INTO bank_statement_line_dispositions
        (id, organization_id, bank_account_id, statement_transaction_id, kind, target_statement_transaction_id, reason, evidence, decided_by)
       VALUES ($1, $2, $3, $4, 'CONFIRMED_DUPLICATE', $5, 'Same transaction appears in overlapping report', '{}'::jsonb, $6)`,
      [dispositionId, organizationId, bankAccountId, duplicateStatementId, statementId, actorId],
    );
    const token = JwtAuth.generateToken({ userId: actorId, email: `${actorId}@firmbooks.test` });
    const authHeaders = { Authorization: `Bearer ${token}`, 'X-Organization-ID': organizationId };
    const completeEndpoint = '/api/v1/banking/reconciliation/complete';
    const completeBody = { bankAccountId, statementEndDate: '2026-09-15', statementClosingBalance: -125.50 };
    const completeKey = `bank-close-${suffix}`;
    const completed = await request(app).post(completeEndpoint).set({ ...authHeaders, 'Idempotency-Key': completeKey }).send(completeBody);
    expect(completed.status).toBe(200);
    const completeReplay = await request(app).post(completeEndpoint).set({ ...authHeaders, 'Idempotency-Key': completeKey }).send(completeBody);
    expect(completeReplay.status).toBe(200);
    expect(completeReplay.body).toEqual(completed.body);
    const session = completed.body.data;
    expect(session.status).toBe('COMPLETED');
    const snapshot = await client.query(
      `SELECT statement_transaction_id, resolution_kind, disposition_id, target_statement_transaction_id
         FROM bank_reconciliation_session_items WHERE organization_id = $1 AND session_id = $2`, [organizationId, session.id],
    );
    expect(snapshot.rows).toHaveLength(2);
    expect(snapshot.rows.find((row) => row.statement_transaction_id === duplicateStatementId)).toMatchObject({
      resolution_kind: 'CONFIRMED_DUPLICATE', disposition_id: dispositionId, target_statement_transaction_id: statementId,
    });
    const projection = await BankReconciliationProjectionService.getProjection(organizationId, '2026-09-30');
    expect(projection.hasStatement).toBe(true);
    expect(projection.statementTransactionCount).toBe(2);
    expect(projection.statementUnresolvedCount).toBe(0);
    const reopenEndpoint = '/api/v1/banking/reconciliation/reopen';
    const reopenBody = { bankAccountId };
    const reopenKey = `bank-reopen-${suffix}`;
    const reopened = await request(app).post(reopenEndpoint).set({ ...authHeaders, 'Idempotency-Key': reopenKey }).send(reopenBody);
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.reopened).toBe(true);
    const reopenReplay = await request(app).post(reopenEndpoint).set({ ...authHeaders, 'Idempotency-Key': reopenKey }).send(reopenBody);
    expect(reopenReplay.status).toBe(200);
    expect(reopenReplay.body).toEqual(reopened.body);
    const reopenedProjection = await BankReconciliationProjectionService.getProjection(organizationId, '2026-09-30');
    expect(reopenedProjection.statementUnresolvedCount).toBe(1);

    await BankReconciliationService.reverseTransactionCreatedFromStatement(
      organizationId, statementId, actorId, 'PostgreSQL qualification reversal', created.allocationId,
    );
    const stateAfterReversal = await client.query(
      `SELECT st.reconciliation_status, SUM(m.matched_amount)::text AS active_allocated
         FROM bank_statement_transactions st JOIN bank_reconciliation_matches m
           ON m.organization_id = st.organization_id AND m.statement_transaction_id = st.id
          AND m.allocation_state = 'ACTIVE' AND m.identity_state = 'VERIFIED'
        WHERE st.organization_id = $1 AND st.id = $2 GROUP BY st.reconciliation_status`,
      [organizationId, statementId],
    );
    expect(stateAfterReversal.rows[0]).toMatchObject({ reconciliation_status: 'PARTIALLY_MATCHED', active_allocated: '40.25' });
  }, 60_000);

  it('replays an authorized committed HTTP review and denies replay after permission revocation', async () => {
    const reviewId = `${statementId}-http-review`;
    await client.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ($1, $2, $3, $4, '2026-09-16', 7.50, 'DEBIT', 'HTTP replay qualification', 'INR', $5, 'TO_REVIEW')`,
      [reviewId, organizationId, bankAccountId, importId, `fingerprint-http-${suffix}`],
    );
    const token = JwtAuth.generateToken({ userId: actorId, email: `${actorId}@firmbooks.test` });
    const key = `bank-review-${suffix}`;
    const endpoint = `/api/v1/banking/transactions/${reviewId}/review`;
    const headers = { Authorization: `Bearer ${token}`, 'X-Organization-ID': organizationId, 'Idempotency-Key': key };
    const body = { decision: 'ACCEPT', acknowledgedCandidateIds: [] };

    const first = await request(app).post(endpoint).set(headers).send(body);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ statementTransactionId: reviewId, decision: 'ACCEPT', status: 'UNMATCHED' });
    const replay = await request(app).post(endpoint).set(headers).send(body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    const persisted = await client.query(
      `SELECT required_permissions, state FROM api_idempotency_keys WHERE organization_id = $1 AND idempotency_key = $2`,
      [organizationId, key],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(JSON.parse(persisted.rows[0].required_permissions)).toEqual(['banking.reconcile']);
    expect(persisted.rows[0].state).toBe('COMPLETED');

    await client.query(`UPDATE organization_members SET role = 'Viewer' WHERE organization_id = $1 AND user_id = $2`, [organizationId, actorId]);
    const deniedReplay = await request(app).post(endpoint).set(headers).send(body);
    expect(deniedReplay.status).toBe(403);
    expect(deniedReplay.body.error).toContain('banking.reconcile');
  }, 60_000);

  it('replays committed statement import confirmation and denies replay after import permission revocation', async () => {
    await client.query(`UPDATE organization_members SET role = 'Owner' WHERE organization_id = $1 AND user_id = $2`, [organizationId, actorId]);
    const token = JwtAuth.generateToken({ userId: actorId, email: `${actorId}@firmbooks.test` });
    const endpoint = '/api/v1/banking/imports/confirm';
    const headers = { Authorization: `Bearer ${token}`, 'X-Organization-ID': organizationId };
    const body = {
      fileContent: 'Date,Description,Debit,Credit\n2026-10-10,HTTP import replay qualification,5.00,\n',
      filename: `http-import-${suffix}.csv`, mode: 'USE_EXISTING', bankAccountId,
    };
    const key = `bank-import-${suffix}`;
    const first = await request(app).post(endpoint).set({ ...headers, 'Idempotency-Key': key }).send(body);
    expect(first.status).toBe(201);
    expect(first.body.data.newTransactionsCount).toBe(1);
    const replay = await request(app).post(endpoint).set({ ...headers, 'Idempotency-Key': key }).send(body);
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    const persisted = await client.query(
      `SELECT required_permissions, state FROM api_idempotency_keys WHERE organization_id = $1 AND idempotency_key = $2`,
      [organizationId, key],
    );
    expect(JSON.parse(persisted.rows[0].required_permissions)).toEqual(['banking.import']);
    expect(persisted.rows[0].state).toBe('COMPLETED');

    await client.query(`UPDATE organization_members SET role = 'Viewer' WHERE organization_id = $1 AND user_id = $2`, [organizationId, actorId]);
    const deniedReplay = await request(app).post(endpoint).set({ ...headers, 'Idempotency-Key': key }).send(body);
    expect(deniedReplay.status).toBe(403);
    expect(deniedReplay.body.error).toContain('banking.import');
  }, 60_000);

  it('verifies a legacy match against the exact posted bank journal line in PostgreSQL', async () => {
    const legacyImportId = `${importId}-legacy`;
    const legacyStatementId = `${statementId}-legacy`;
    const legacyMatchId = `legacy_match_${suffix}`;
    await client.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, status)
       VALUES ($1, $2, $3, 'CSV', 'legacy.csv', $4, 'INR', $5, 'COMPLETED')`,
      [legacyImportId, organizationId, bankAccountId, `hash-legacy-${suffix}`, actorId],
    );
    await client.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ($1, $2, $3, $4, '2026-09-20', 10.00, 'DEBIT', 'Legacy bank charge', 'INR', $5, 'UNMATCHED')`,
      [legacyStatementId, organizationId, bankAccountId, legacyImportId, `fingerprint-legacy-${suffix}`],
    );
    const journal = await db.transaction((tx) => ServerPostingEngine.postEntry({
      organizationId,
      entryNumber: `BANK-PG-LEGACY-${suffix}`,
      date: '2026-09-19',
      description: 'Legacy posted bank charge',
      lines: [
        { accountId: expenseId, debit: 10, credit: 0, description: 'Legacy charge' },
        { accountId: bankLedgerId, debit: 0, credit: 10, description: 'Legacy charge' },
      ],
    }, tx), { organizationId });
    const line = await client.query(
      `SELECT id FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2 AND account_id = $3 AND credit = 10 AND debit = 0`,
      [organizationId, journal.entryId, bankLedgerId],
    );
    expect(line.rows).toHaveLength(1);
    await client.query(
      `INSERT INTO bank_reconciliation_matches
        (id, organization_id, statement_transaction_id, accounting_transaction_type, accounting_transaction_id, matched_amount, status)
       VALUES ($1, $2, $3, 'journal', $4, 10.00, 'MATCHED')`,
      [legacyMatchId, organizationId, legacyStatementId, journal.entryId],
    );
    const verified = await BankLegacyAllocationVerificationService.verify(
      organizationId, legacyStatementId, legacyMatchId, String(line.rows[0].id),
      'Verified against posted journal and exact bank line', actorId,
    );
    expect(verified.journalEntryId).toBe(journal.entryId);
    const state = await client.query(
      `SELECT identity_state, allocation_state, creation_origin FROM bank_reconciliation_matches WHERE organization_id = $1 AND id = $2`,
      [organizationId, legacyMatchId],
    );
    expect(state.rows[0]).toMatchObject({ identity_state: 'VERIFIED', allocation_state: 'ACTIVE', creation_origin: 'LEGACY_VERIFIED' });
  }, 60_000);

  it('serializes statement creation against close so the cutoff cannot commit unresolved money', async () => {
    const isolatedLedgerId = `acc_close_bank_${suffix}`;
    const isolatedBankId = `bank_close_profile_${suffix}`;
    await client.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, status, allow_direct_posting, currency_code)
       VALUES ($1, $2, '1110', 'Close Race Bank', 'Asset', 'Bank', 0, 'Active', TRUE, 'INR')`, [isolatedLedgerId, organizationId],
    );
    await client.query(
      `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, currency, status, is_active)
       VALUES ($1, $2, $3, 'Close Race Account', 'PG-CLOSE', 'Qualification Bank', 'INR', 'Active', TRUE)`,
      [isolatedBankId, organizationId, isolatedLedgerId],
    );
    const imported = await BankReconciliationService.importStatement(
      organizationId, isolatedBankId, `close-race-${suffix}.csv`,
      'Opening Balance: 0\nClosing Balance: -10\nDate,Description,Debit,Credit\n2026-10-15,Close race charge,10,',
      'CSV', undefined, actorId,
    );
    expect(imported.newTransactionsCount).toBe(1);
    expect(imported.import.closingBalanceVerified).toBe(true);
    expect(imported.discrepancy).toBe(0);
    const importedStatement = await client.query(
      `SELECT id FROM bank_statement_transactions WHERE organization_id = $1 AND statement_import_id = $2`,
      [organizationId, imported.import.id],
    );
    expect(importedStatement.rows).toHaveLength(1);
    const realStatementId = String(importedStatement.rows[0].id);
    const outcomes = await Promise.allSettled([
      BankStatementEntryCreationService.create(organizationId, realStatementId, expenseId, actorId, '10.00', `bankentry-close-${suffix}`),
      BankReconciliationService.completeReconciliationSession(organizationId, isolatedBankId, '2026-10-15', -10, undefined, [], actorId),
    ]);
    expect(outcomes[0].status).toBe('fulfilled');
    if (outcomes[1].status === 'rejected') {
      expect(String(outcomes[1].reason)).toContain('BANK_RECONCILIATION_HAS_UNRESOLVED_LINES');
    } else {
      expect(outcomes[1].value.status).toBe('COMPLETED');
    }
    const persisted = await client.query(
      `SELECT st.reconciliation_status, COUNT(DISTINCT je.id)::int AS journals
         FROM bank_statement_transactions st
         LEFT JOIN bank_reconciliation_matches m ON m.organization_id = st.organization_id AND m.statement_transaction_id = st.id
         LEFT JOIN journal_entries je ON je.organization_id = m.organization_id AND je.id = m.journal_entry_id
        WHERE st.organization_id = $1 AND st.id = $2 GROUP BY st.reconciliation_status`, [organizationId, realStatementId],
    );
    expect(persisted.rows[0].reconciliation_status === 'MATCHED' || persisted.rows[0].reconciliation_status === 'RECONCILED').toBe(true);
    expect(persisted.rows[0].journals).toBe(1);
  }, 60_000);

  it('serializes matching against reversal without exceeding the bank statement amount', async () => {
    const raceImportId = `${importId}-reverse-race`;
    const raceStatementId = `${statementId}-reverse-race`;
    await client.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, status)
       VALUES ($1, $2, $3, 'CSV', 'reverse-race.csv', $4, 'INR', $5, 'COMPLETED')`,
      [raceImportId, organizationId, bankAccountId, `hash-reverse-race-${suffix}`, actorId],
    );
    await client.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ($1, $2, $3, $4, '2026-10-20', 100, 'DEBIT', 'Allocation reverse race', 'INR', $5, 'UNMATCHED')`,
      [raceStatementId, organizationId, bankAccountId, raceImportId, `fingerprint-reverse-race-${suffix}`],
    );
    const external = await db.transaction((tx) => ServerPostingEngine.postEntry({
      organizationId,
      entryNumber: `BANK-PG-REVERSE-RACE-${suffix}`,
      date: '2026-10-19',
      description: 'Previously posted match candidate',
      lines: [
        { accountId: expenseId, debit: 100, credit: 0, description: 'Previously posted match candidate' },
        { accountId: bankLedgerId, debit: 0, credit: 100, description: 'Previously posted match candidate' },
      ],
    }, tx), { organizationId });
    const externalLine = await client.query(
      `SELECT id FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2 AND account_id = $3 AND credit = 100 AND debit = 0`,
      [organizationId, external.entryId, bankLedgerId],
    );
    expect(externalLine.rows).toHaveLength(1);
    const created = await BankStatementEntryCreationService.create(
      organizationId, raceStatementId, expenseId, actorId, '100.00', `bankentry-reverse-race-${suffix}`,
    );
    const outcomes = await Promise.allSettled([
      BankReconciliationService.reverseTransactionCreatedFromStatement(
        organizationId, raceStatementId, actorId, 'Race qualification reversal', created.allocationId,
      ),
      BankMovementAllocationService.allocate(organizationId, raceStatementId, String(externalLine.rows[0].id), '100.00', actorId),
    ]);
    expect(outcomes[0].status).toBe('fulfilled');
    const aggregate = await client.query(
      `SELECT st.amount::text AS amount, st.reconciliation_status,
              COALESCE(SUM(m.matched_amount) FILTER (WHERE m.allocation_state = 'ACTIVE' AND m.identity_state = 'VERIFIED'), 0)::text AS allocated
         FROM bank_statement_transactions st LEFT JOIN bank_reconciliation_matches m
           ON m.organization_id = st.organization_id AND m.statement_transaction_id = st.id
        WHERE st.organization_id = $1 AND st.id = $2 GROUP BY st.amount, st.reconciliation_status`,
      [organizationId, raceStatementId],
    );
    expect(Number(aggregate.rows[0].allocated)).toBeLessThanOrEqual(Number(aggregate.rows[0].amount));
    expect(['UNMATCHED', 'MATCHED']).toContain(aggregate.rows[0].reconciliation_status);
    const createdState = await client.query(
      `SELECT allocation_state FROM bank_reconciliation_matches WHERE organization_id = $1 AND id = $2`,
      [organizationId, created.allocationId],
    );
    expect(createdState.rows[0].allocation_state).toBe('REVERSED');
  }, 60_000);

  it('serializes allocation against create-missing so concurrent writes cannot exceed statement cents', async () => {
    const concurrentStatementId = `${statementId}-concurrent`;
    const concurrentImportId = `${importId}-concurrent`;
    await client.query(
      `INSERT INTO bank_statement_imports (id, organization_id, bank_account_id, source_format, original_filename, file_hash, currency, imported_by, status)
       VALUES ($1, $2, $3, 'CSV', 'concurrent.csv', $4, 'INR', $5, 'COMPLETED')`,
      [concurrentImportId, organizationId, bankAccountId, `hash-concurrent-${suffix}`, actorId],
    );
    await client.query(
      `INSERT INTO bank_statement_transactions
        (id, organization_id, bank_account_id, statement_import_id, transaction_date, amount, direction, narration, currency, fingerprint, reconciliation_status)
       VALUES ($1, $2, $3, $4, '2026-09-16', 100.00, 'DEBIT', 'Concurrent qualification payment', 'INR', $5, 'UNMATCHED')`,
      [concurrentStatementId, organizationId, bankAccountId, concurrentImportId, `fingerprint-concurrent-${suffix}`],
    );
    const prior = await db.transaction((tx) => ServerPostingEngine.postEntry({
      organizationId,
      entryNumber: `BANK-PG-CONCURRENT-${suffix}`,
      date: '2026-09-16',
      description: 'Concurrent existing payment',
      lines: [
        { accountId: expenseId, debit: 30, credit: 0, description: 'Concurrent existing payment' },
        { accountId: bankLedgerId, debit: 0, credit: 30, description: 'Concurrent existing payment' },
      ],
    }, tx), { organizationId });
    const line = await client.query(
      `SELECT id FROM journal_lines WHERE organization_id = $1 AND journal_entry_id = $2 AND account_id = $3 AND credit = 30 AND debit = 0`,
      [organizationId, prior.entryId, bankLedgerId],
    );
    expect(line.rows).toHaveLength(1);

    const outcomes = await Promise.allSettled([
      BankMovementAllocationService.allocate(organizationId, concurrentStatementId, String(line.rows[0].id), '30.00', actorId),
      BankStatementEntryCreationService.create(
        organizationId, concurrentStatementId, expenseId, actorId, '100.00', `bankentry-${suffix}-race`,
      ),
    ]);
    const created = outcomes.filter((outcome) => outcome.status === 'fulfilled');
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(created.length).toBe(1);
    expect(rejected.length).toBe(1);
    const row = await client.query(
      `SELECT st.amount::text AS amount, st.reconciliation_status,
              COALESCE(SUM(m.matched_amount) FILTER (WHERE m.allocation_state = 'ACTIVE' AND m.identity_state = 'VERIFIED'), 0)::text AS allocated
         FROM bank_statement_transactions st LEFT JOIN bank_reconciliation_matches m
           ON m.organization_id = st.organization_id AND m.statement_transaction_id = st.id
        WHERE st.organization_id = $1 AND st.id = $2 GROUP BY st.amount, st.reconciliation_status`,
      [organizationId, concurrentStatementId],
    );
    expect(Number(row.rows[0].allocated)).toBeLessThanOrEqual(Number(row.rows[0].amount));
    expect(['PARTIALLY_MATCHED', 'MATCHED']).toContain(row.rows[0].reconciliation_status);
  }, 60_000);
});
