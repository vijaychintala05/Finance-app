import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { newId } from '../utils/ids';

describe('Zoho-Style In-Place Expense Edit Flow', () => {
  beforeAll(async () => {
    await MigrationRunner.runMigrations();
  });

  async function createTenantFixture(label: string) {
    const registration = await request(app).post('/api/v1/auth/register').send({
      email: `${label}-${Date.now()}-${Math.random()}@example.com`,
      password: 'SecurePassword123!',
      fullName: 'Zoho Flow Officer',
      organizationName: `${label} Parity Organization`,
    });
    const orgId = registration.body.organizationId;
    const userId = registration.body.user.id;
    const auth = { Authorization: `Bearer ${registration.body.token}` };

    const accountsRes = await db.query(
      `SELECT id, code, name, system_role FROM accounts WHERE organization_id = $1`,
      [orgId]
    );

    const expenseAccount = accountsRes.rows.find((r) => r.code === '6000') || accountsRes.rows.find((r) => r.code.startsWith('6'));
    const bankAccount = accountsRes.rows.find((r) => r.code === '1000') || accountsRes.rows.find((r) => r.code.startsWith('10'));

    return {
      orgId,
      userId,
      auth,
      expenseAccountId: expenseAccount.id,
      bankAccountId: bankAccount.id,
    };
  }

  it('1. Updates expense in-place when edited, preserving ID, number, status, reversing journal and writing audit log', async () => {
    const f = await createTenantFixture('exp-zoho-edit');

    // Create original expense
    const createRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Original Vendor Ltd',
        date: '2026-08-15',
        amount: 500.0,
        description: 'Original office supplies',
      });

    expect(createRes.status).toBe(201);
    const originalExpenseId = createRes.body.id;
    const originalRefNumber = createRes.body.referenceNumber || createRes.body.expenseNumber;
    const originalJournalId = createRes.body.journalEntryId;
    expect(originalExpenseId).toBeTruthy();
    expect(originalJournalId).toBeTruthy();

    // Verify initial DB state
    const originalDb = await db.query(
      `SELECT id, expense_number, status, amount, journal_entry_id FROM expenses WHERE id = $1`,
      [originalExpenseId]
    );
    expect(originalDb.rows[0].status).toBe('POSTED');
    expect(Number(originalDb.rows[0].amount)).toBe(500.0);

    // Edit expense in-place via PUT /api/v1/finance/expenses/:id
    const editRes = await request(app)
      .put(`/api/v1/finance/expenses/${originalExpenseId}`)
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Updated Vendor Pvt Ltd',
        date: '2026-08-16',
        amount: 750.0,
        description: 'Updated office supplies and snacks',
        reason: 'Vendor corrected invoice amount to 750',
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);
    const updated = editRes.body.expense;

    // Must preserve identical ID and expense number, and status remains POSTED (not voided)
    expect(updated.id).toBe(originalExpenseId);
    expect(updated.expenseNumber || updated.referenceNumber).toBe(originalRefNumber);
    expect(updated.status).toBe('POSTED');
    expect(Number(updated.amount)).toBe(750.0);
    expect(updated.description).toBe('Updated office supplies and snacks');

    // Must have a new journal entry ID because financial amount changed
    expect(updated.journalEntryId).toBeTruthy();
    expect(updated.journalEntryId).not.toBe(originalJournalId);

    // Verify that NO duplicate expense was created
    const totalExpenses = await db.query(
      `SELECT count(*) FROM expenses WHERE organization_id = $1`,
      [f.orgId]
    );
    expect(Number(totalExpenses.rows[0].count)).toBe(1);

    // Verify old journal was reversed with link to reversal journal
    const oldJournal = await db.query(
      `SELECT reversed_by_journal_id, reversal_reason FROM journal_entries WHERE id = $1`,
      [originalJournalId]
    );
    expect(oldJournal.rows[0].reversed_by_journal_id).toBeTruthy();
    expect(oldJournal.rows[0].reversal_reason).toMatch(/corrected invoice amount/i);

    // Verify reversal journal links back
    const reversalJournal = await db.query(
      `SELECT reversal_of_journal_id FROM journal_entries WHERE id = $1`,
      [oldJournal.rows[0].reversed_by_journal_id]
    );
    expect(reversalJournal.rows[0].reversal_of_journal_id).toBe(originalJournalId);

    // Verify new journal is posted and balanced for 750
    const newJournalLines = await db.query(
      `SELECT debit, credit FROM journal_lines WHERE journal_entry_id = $1`,
      [updated.journalEntryId]
    );
    const totalDebit = newJournalLines.rows.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = newJournalLines.rows.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(750.0);
    expect(totalCredit).toBe(750.0);

    // Verify audit logs table contains EXPENSE_UPDATED
    const auditDb = await db.query(
      `SELECT action, entity_type, entity_id, before_state, after_state
       FROM audit_logs
       WHERE organization_id = $1 AND entity_id = $2 AND action = 'EXPENSE_UPDATED'`,
      [f.orgId, originalExpenseId]
    );
    expect(auditDb.rows.length).toBeGreaterThanOrEqual(1);
    const auditRecord = auditDb.rows[0];
    const afterState = typeof auditRecord.after_state === 'string' ? JSON.parse(auditRecord.after_state) : auditRecord.after_state;
    const beforeState = typeof auditRecord.before_state === 'string' ? JSON.parse(auditRecord.before_state) : auditRecord.before_state;
    expect(auditRecord.action).toBe('EXPENSE_UPDATED');
    expect(afterState.reason).toBe('Vendor corrected invoice amount to 750');
    expect(Number(beforeState.amount)).toBe(500.0);
    expect(Number(afterState.amount)).toBe(750.0);

    // Verify audit logs API returns history for this expense
    const historyRes = await request(app)
      .get(`/api/v1/finance/audit-logs?entityType=EXPENSE&entityId=${originalExpenseId}`)
      .set(f.auth);
    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
    const updateLog = historyRes.body.find((log: any) => log.action === 'EXPENSE_UPDATED');
    expect(updateLog).toBeTruthy();
    expect(updateLog.reason).toBe('Vendor corrected invoice amount to 750');
  });

  it('2. Editing non-financial field retains journal without unnecessary reversal', async () => {
    const f = await createTenantFixture('exp-non-fin-edit');

    const createRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Consulting Corp',
        date: '2026-08-18',
        amount: 1200.0,
        description: 'Initial draft note',
      });

    const expenseId = createRes.body.id;
    const initialJournalId = createRes.body.journalEntryId;

    // Update only description and vendor invoice number
    const editRes = await request(app)
      .put(`/api/v1/finance/expenses/${expenseId}`)
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Consulting Corp',
        vendorInvoiceNumber: 'INV-2026-009',
        date: '2026-08-18',
        amount: 1200.0,
        description: 'Finalized consulting note with deliverables',
        reason: 'Added invoice number and clarified description',
      });

    expect(editRes.status).toBe(200);
    const updated = editRes.body.expense;
    expect(updated.id).toBe(expenseId);
    // Journal entry ID should remain unchanged since financial amounts did not change
    expect(updated.journalEntryId).toBe(initialJournalId);
    expect(updated.vendorInvoiceNumber).toBe('INV-2026-009');

    // Journal should still be POSTED, not reversed
    const journalDb = await db.query(
      `SELECT status FROM journal_entries WHERE id = $1`,
      [initialJournalId]
    );
    expect(journalDb.rows[0].status).toBe('Posted');
  });

  it('3. Legacy correct endpoint delegates to in-place update and returns single authoritative record', async () => {
    const f = await createTenantFixture('exp-legacy-correct');

    const createRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Hardware Depot',
        date: '2026-08-20',
        amount: 300.0,
        description: 'Cables',
      });

    const expenseId = createRes.body.id;
    const initialJournalId = createRes.body.journalEntryId;

    const correctRes = await request(app)
      .post(`/api/v1/finance/expenses/${expenseId}/correct`)
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Hardware Depot',
        date: '2026-08-20',
        amount: 350.0,
        description: 'Cables & adaptors',
        reason: 'Added missing adaptors',
      });

    expect([200, 201]).toContain(correctRes.status);
    // Response replacement must be the same record ID
    expect(correctRes.body.replacement.id).toBe(expenseId);
    expect(Number(correctRes.body.replacement.amount)).toBe(350.0);
    expect(correctRes.body.replacement.status).toBe('POSTED');

    // Verify still only 1 expense in the organization
    const countRes = await db.query(
      `SELECT count(*) FROM expenses WHERE organization_id = $1`,
      [f.orgId]
    );
    expect(Number(countRes.rows[0].count)).toBe(1);
  });

  it('4. Blocks editing if the expense is actively matched to bank reconciliation', async () => {
    const f = await createTenantFixture('exp-reconciled-lock');

    const createRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Telecom Services',
        date: '2026-08-22',
        amount: 400.0,
        description: 'Internet bill',
      });

    const expenseId = createRes.body.id;

    // Insert a mock bank reconciliation match
    const statementLineId = newId();
    const reconMatchId = newId();
    await db.query(
      `INSERT INTO bank_reconciliation_matches
       (id, organization_id, statement_transaction_id, accounting_transaction_id, accounting_transaction_type, matched_amount, status)
       VALUES ($1, $2, $3, $4, 'EXPENSE', 400.0, 'CONFIRMED')`,
      [reconMatchId, f.orgId, statementLineId, expenseId]
    );

    // Attempting to edit financial fields should now be rejected
    const editRes = await request(app)
      .put(`/api/v1/finance/expenses/${expenseId}`)
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Telecom Services',
        date: '2026-08-22',
        amount: 450.0,
        description: 'Internet bill revised',
      });

    expect(editRes.status).toBe(422);
    expect(editRes.body.error).toMatch(/reconcil/i);

    // Amount must not have changed
    const dbRow = await db.query(`SELECT amount FROM expenses WHERE id = $1`, [expenseId]);
    expect(Number(dbRow.rows[0].amount)).toBe(400.0);
  });

  it('5. Supports arbitrary N consecutive edits on an expense, maintaining single-record persistence and complete chronological audit trail', async () => {
    const f = await createTenantFixture('exp-n-edits');

    // 1. Initial Creation
    const createRes = await request(app)
      .post('/api/v1/finance/expenses')
      .set(f.auth)
      .send({
        expenseAccountId: f.expenseAccountId,
        paidFromAccountId: f.bankAccountId,
        vendorName: 'Initial Supplier',
        date: '2026-08-01',
        amount: 500.0,
        description: 'Original expense record',
      });
    expect(createRes.status).toBe(201);
    const expenseId = createRes.body.id;
    const expenseNumber = createRes.body.referenceNumber || createRes.body.expenseNumber;
    let currentJournalId = createRes.body.journalEntryId;

    const edits = [
      {
        data: { amount: 650.0, reason: 'Edit 1: Price revised by vendor' },
        expectedAmount: 650.0,
        expectedReason: 'Edit 1: Price revised by vendor',
        isFinancial: true,
      },
      {
        data: { vendorInvoiceNumber: 'INV-VENDOR-001', reason: 'Edit 2: Attached vendor bill reference' },
        expectedAmount: 650.0,
        expectedReason: 'Edit 2: Attached vendor bill reference',
        isFinancial: false,
      },
      {
        data: { amount: 820.0, taxRate: 18.0, reason: 'Edit 3: Applied GST 18%' },
        expectedAmount: 820.0,
        expectedReason: 'Edit 3: Applied GST 18%',
        isFinancial: true,
      },
      {
        data: { description: 'Updated hardware tools and supplies', reason: 'Edit 4: Refined description' },
        expectedAmount: 820.0,
        expectedReason: 'Edit 4: Refined description',
        isFinancial: false,
      },
      {
        data: { amount: 1250.0, date: '2026-08-05', reason: 'Edit 5: Finalized approved bill amount' },
        expectedAmount: 1250.0,
        expectedReason: 'Edit 5: Finalized approved bill amount',
        isFinancial: true,
      },
    ];

    // Perform all N edits sequentially
    for (let i = 0; i < edits.length; i++) {
      const editStep = edits[i];
      const res = await request(app)
        .put(`/api/v1/finance/expenses/${expenseId}`)
        .set(f.auth)
        .send({
          expenseAccountId: f.expenseAccountId,
          paidFromAccountId: f.bankAccountId,
          vendorName: 'Initial Supplier',
          ...editStep.data,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.expense.id).toBe(expenseId);
      expect(res.body.expense.expenseNumber).toBe(expenseNumber);
      expect(Number(res.body.expense.amount)).toBe(editStep.expectedAmount);
      expect(res.body.expense.status).toBe('POSTED');

      if (editStep.isFinancial) {
        expect(res.body.expense.journalEntryId).not.toBe(currentJournalId);
        currentJournalId = res.body.expense.journalEntryId;
      }
    }

    // A. Verify that exactly ONE expense record exists in DB (no duplicates created)
    const countRes = await db.query(
      `SELECT count(*) FROM expenses WHERE organization_id = $1`,
      [f.orgId]
    );
    expect(Number(countRes.rows[0].count)).toBe(1);

    // B. Verify the final expense record in database
    const finalDb = await db.query(
      `SELECT * FROM expenses WHERE organization_id = $1 AND id = $2`,
      [f.orgId, expenseId]
    );
    expect(finalDb.rows.length).toBe(1);
    const finalExpense = finalDb.rows[0];
    expect(finalExpense.id).toBe(expenseId);
    expect(finalExpense.expense_number).toBe(expenseNumber);
    expect(Number(finalExpense.amount)).toBe(1250.0);
    expect(finalExpense.status).toBe('POSTED');
    expect(finalExpense.vendor_invoice_number).toBe('INV-VENDOR-001');

    // C. Verify all 6 audit entries exist in DB (1 creation + 5 edits)
    const auditDb = await db.query(
      `SELECT action, after_state, timestamp
       FROM audit_logs
       WHERE organization_id = $1 AND entity_id = $2
       ORDER BY timestamp ASC`,
      [f.orgId, expenseId]
    );
    expect(auditDb.rows.length).toBe(6);
    expect(auditDb.rows[0].action).toBe('EXPENSE_CREATED');
    for (let k = 1; k <= 5; k++) {
      expect(auditDb.rows[k].action).toBe('EXPENSE_UPDATED');
      const after = typeof auditDb.rows[k].after_state === 'string'
        ? JSON.parse(auditDb.rows[k].after_state)
        : auditDb.rows[k].after_state;
      expect(after.reason).toBe(edits[k - 1].expectedReason);
    }

    // D. Verify Audit Logs API returns all 6 events chronologically
    const historyRes = await request(app)
      .get(`/api/v1/finance/audit-logs?entityType=EXPENSE&entityId=${expenseId}`)
      .set(f.auth);
    expect(historyRes.status).toBe(200);
    expect(Array.isArray(historyRes.body)).toBe(true);
    expect(historyRes.body.length).toBe(6);

    // Verify each edit event in the API response contains the reason
    const editEvents = historyRes.body.filter((e: any) => e.action === 'EXPENSE_UPDATED');
    expect(editEvents.length).toBe(5);
    for (const edit of edits) {
      const found = editEvents.find((e: any) => e.reason === edit.expectedReason);
      expect(found).toBeTruthy();
    }
  });
});
