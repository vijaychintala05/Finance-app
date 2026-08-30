import { db, DbQueryClient } from '../database/db';
import { isIsoCalendarDate } from '../utils/date';
import { newId } from '../utils/ids';
import { AccountingIntegrityService } from './AccountingIntegrityService';

export interface CloseCheckItem {
  code: string;
  title: string;
  severity: 'BLOCKING' | 'WARNING' | 'INFO';
  passed: boolean;
  message: string;
}

export interface PeriodCloseStatusResponse {
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  status: 'OPEN' | 'IN_REVIEW' | 'READY_TO_CLOSE' | 'CLOSED' | 'REOPENED';
  checks: CloseCheckItem[];
  canClose: boolean;
  blockingFailuresCount: number;
  warningsCount: number;
}

export interface CloseReviewTask {
  code: string;
  title: string;
  completed: boolean;
}

export interface PeriodCloseWorkspace extends PeriodCloseStatusResponse {
  review: { status: 'DRAFT' | 'IN_REVIEW' | 'READY_TO_CLOSE'; tasks: CloseReviewTask[]; note: string; updatedAt?: string } | null;
  events: Array<{ id: string; eventType: string; eventAt: string; reason: string; actorId: string }>;
}

const REVIEW_TASKS: Array<Pick<CloseReviewTask, 'code' | 'title'>> = [
  { code: 'REVIEW_TRIAL_BALANCE', title: 'Review trial balance and unusual balances' },
  { code: 'REVIEW_AR_AGING', title: 'Review receivables aging and exceptions' },
  { code: 'REVIEW_AP_AGING', title: 'Review payables aging and exceptions' },
  { code: 'REVIEW_BANK_RECON', title: 'Review bank reconciliation exceptions' },
];

function parseReview(value: unknown): { tasks: CloseReviewTask[]; note: string; updatedAt?: string } {
  let parsed: any = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { parsed = {}; }
  }
  const completed = new Set(Array.isArray(parsed?.tasks) ? parsed.tasks.filter((task: any) => task?.completed).map((task: any) => task.code) : []);
  return {
    tasks: REVIEW_TASKS.map((task) => ({ ...task, completed: completed.has(task.code) })),
    note: typeof parsed?.note === 'string' ? parsed.note : '',
    updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : undefined,
  };
}

function validatePeriodIdentity(periodKey: string, periodStart: string, periodEnd: string): void {
  if (!/^\d{4}-\d{2}$/.test(periodKey) || !isIsoCalendarDate(periodStart) || !isIsoCalendarDate(periodEnd)) {
    throw new Error('PERIOD_CLOSE_INPUT_INVALID: Period key and dates must use YYYY-MM and YYYY-MM-DD formats');
  }
  if (periodStart > periodEnd || periodStart.slice(0, 7) !== periodKey || periodEnd.slice(0, 7) !== periodKey) {
    throw new Error('PERIOD_CLOSE_RANGE_INVALID: Start and end dates must be ordered and belong to the requested period');
  }
}

const dbDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

async function validateWithClient(
  orgId: string, periodKey: string, periodStart: string, periodEnd: string, client: DbQueryClient
): Promise<PeriodCloseStatusResponse> {
  const checks: CloseCheckItem[] = [];
  // AccountingIntegrityService uses db.query; db.transaction propagates this client through AsyncLocalStorage.
  const integrity = await AccountingIntegrityService.verifyOrganizationIntegrity(orgId);
  checks.push({
    code: 'TRIAL_BALANCE', title: 'Trial Balance Equation', severity: 'BLOCKING',
    passed: integrity.checks.trialBalance.isBalanced,
    message: integrity.checks.trialBalance.isBalanced ? 'Trial Balance is balanced (Total Debit = Total Credit).'
      : `Trial Balance is unbalanced by ${integrity.checks.trialBalance.difference}.`,
  });
  checks.push({
    code: 'AR_RECONCILIATION', title: 'Accounts Receivable Subledger Integrity', severity: 'BLOCKING',
    passed: integrity.checks.accountsReceivable.isBalanced,
    message: integrity.checks.accountsReceivable.isBalanced ? 'AR Subledger equals AR Control Account GL balance.'
      : `AR Subledger mismatch: difference of ${integrity.checks.accountsReceivable.difference}.`,
  });
  checks.push({
    code: 'AP_RECONCILIATION', title: 'Accounts Payable Subledger Integrity', severity: 'BLOCKING',
    passed: integrity.checks.accountsPayable.isBalanced,
    message: integrity.checks.accountsPayable.isBalanced ? 'AP Subledger equals AP Control Account GL balance.'
      : `AP Subledger mismatch: difference of ${integrity.checks.accountsPayable.difference}.`,
  });
  const drafts = await client.query(
    `SELECT COUNT(*) FROM journal_entries WHERE organization_id=$1 AND UPPER(status)='DRAFT' AND date >= $2 AND date <= $3`,
    [orgId, periodStart, periodEnd]
  );
  const draftCount = Number.parseInt(drafts.rows[0]?.count || '0', 10);
  checks.push({ code: 'DRAFT_JOURNALS', title: 'Unposted Draft Journals', severity: 'WARNING', passed: draftCount === 0,
    message: draftCount === 0 ? 'No draft journals in period.' : `${draftCount} draft journals remain unposted in this period.` });
  const unmatched = await client.query(
    `SELECT COUNT(*) FROM bank_statement_transactions WHERE organization_id=$1 AND reconciliation_status='UNMATCHED'
      AND transaction_date >= $2 AND transaction_date <= $3`, [orgId, periodStart, periodEnd]
  );
  const unmatchedCount = Number.parseInt(unmatched.rows[0]?.count || '0', 10);
  checks.push({ code: 'BANK_RECONCILIATION', title: 'Bank Statement Reconciliation', severity: 'WARNING', passed: unmatchedCount === 0,
    message: unmatchedCount === 0 ? 'All bank statement transactions reconciled.' : `${unmatchedCount} bank transactions remain unmatched.` });
  const close = await client.query(
    'SELECT status FROM accounting_period_closes WHERE organization_id=$1 AND period_key=$2', [orgId, periodKey]
  );
  const blockingFailuresCount = checks.filter((check) => check.severity === 'BLOCKING' && !check.passed).length;
  const warningsCount = checks.filter((check) => check.severity === 'WARNING' && !check.passed).length;
  return { periodKey, periodStart, periodEnd, status: close.rows[0]?.status || 'OPEN', checks,
    canClose: blockingFailuresCount === 0, blockingFailuresCount, warningsCount };
}

export class PeriodCloseService {
  public static async validatePeriodClose(orgId: string, periodKey: string, periodStart: string, periodEnd: string): Promise<PeriodCloseStatusResponse> {
    validatePeriodIdentity(periodKey, periodStart, periodEnd);
    return validateWithClient(orgId, periodKey, periodStart, periodEnd, db);
  }

  public static async getWorkspace(orgId: string, periodKey: string, periodStart: string, periodEnd: string): Promise<PeriodCloseWorkspace> {
    const status = await this.validatePeriodClose(orgId, periodKey, periodStart, periodEnd);
    const [reviewResult, eventResult] = await Promise.all([
      db.query(`SELECT status, checklist_data FROM period_close_checklists WHERE organization_id=$1 AND period_key=$2`, [orgId, periodKey]),
      db.query(`SELECT id, event_type, event_at, reason, actor_id FROM accounting_period_close_events WHERE organization_id=$1 AND period_key=$2 ORDER BY event_at DESC, id DESC`, [orgId, periodKey]),
    ]);
    const reviewRow = reviewResult.rows[0];
    return {
      ...status,
      review: reviewRow ? { status: reviewRow.status, ...parseReview(reviewRow.checklist_data) } : null,
      events: eventResult.rows.map((row: any) => ({ id: row.id, eventType: row.event_type, eventAt: row.event_at, reason: row.reason, actorId: row.actor_id })),
    };
  }

  public static async saveReview(orgId: string, userId: string, periodKey: string, periodStart: string, periodEnd: string,
    tasks: CloseReviewTask[], note: string): Promise<PeriodCloseWorkspace> {
    validatePeriodIdentity(periodKey, periodStart, periodEnd);
    if (!Array.isArray(tasks) || tasks.some((task) => !REVIEW_TASKS.some((required) => required.code === task.code) || typeof task.completed !== 'boolean')) {
      throw new Error('PERIOD_CLOSE_REVIEW_INVALID: Review tasks are invalid');
    }
    const trimmedNote = String(note || '').trim();
    if (trimmedNote.length > 2000) throw new Error('PERIOD_CLOSE_REVIEW_NOTE_INVALID: Review note cannot exceed 2000 characters');
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO accounting_period_closes (id, organization_id, period_key, period_start, period_end, status)
         VALUES ($1,$2,$3,$4,$5,'OPEN') ON CONFLICT (organization_id, period_key) DO NOTHING`,
        [newId('apc'), orgId, periodKey, periodStart, periodEnd]
      );
      const close = await tx.query(`SELECT * FROM accounting_period_closes WHERE organization_id=$1 AND period_key=$2 FOR UPDATE`, [orgId, periodKey]);
      if (close.rows.length !== 1 || dbDate(close.rows[0].period_start) !== periodStart || dbDate(close.rows[0].period_end) !== periodEnd) {
        throw new Error('PERIOD_CLOSE_RANGE_CONFLICT: Existing close record uses a different date range');
      }
      if (close.rows[0].status === 'CLOSED') throw new Error('PERIOD_CLOSE_REVIEW_LOCKED: A closed period cannot be edited; reopen it first');
      const validation = await validateWithClient(orgId, periodKey, periodStart, periodEnd, tx);
      const normalized = parseReview({ tasks, note: trimmedNote, updatedAt: new Date().toISOString() });
      const allComplete = normalized.tasks.every((task) => task.completed);
      const reviewStatus = allComplete && validation.canClose ? 'READY_TO_CLOSE' : 'IN_REVIEW';
      await tx.query(
        `INSERT INTO period_close_checklists (id, organization_id, period_key, status, checklist_data, closed_by, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)
         ON CONFLICT (organization_id, period_key) DO UPDATE SET status=$4, checklist_data=$5, closed_by=$6, closed_at=CURRENT_TIMESTAMP`,
        [newId('pcl'), orgId, periodKey, reviewStatus, JSON.stringify(normalized), userId]
      );
      await tx.query(`UPDATE accounting_period_closes SET status=$1 WHERE organization_id=$2 AND period_key=$3 AND status IN ('OPEN','IN_REVIEW','READY_TO_CLOSE','REOPENED')`, [reviewStatus, orgId, periodKey]);
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
         VALUES ($1,$2,$3,'ACCOUNTING_PERIOD_REVIEW_UPDATED','AccountingPeriodClose',$4,$5)`,
        [newId('aud'), orgId, userId, close.rows[0].id, JSON.stringify({ periodKey, reviewStatus, completedCount: normalized.tasks.filter((task) => task.completed).length })]
      );
    });
    return this.getWorkspace(orgId, periodKey, periodStart, periodEnd);
  }

  public static async closePeriod(orgId: string, userId: string, periodKey: string, periodStart: string,
    periodEnd: string): Promise<{ success: boolean; periodKey: string }> {
    validatePeriodIdentity(periodKey, periodStart, periodEnd);
    return db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO accounting_period_closes
          (id, organization_id, period_key, period_start, period_end, status)
         VALUES ($1,$2,$3,$4,$5,'OPEN') ON CONFLICT (organization_id, period_key) DO NOTHING`,
        [newId('apc'), orgId, periodKey, periodStart, periodEnd]
      );
      const closeRes = await tx.query(
        'SELECT * FROM accounting_period_closes WHERE organization_id=$1 AND period_key=$2 FOR UPDATE', [orgId, periodKey]
      );
      if (closeRes.rows.length !== 1) throw new Error('PERIOD_CLOSE_STATE_INVALID: Close record could not be locked');
      const before = closeRes.rows[0];
      if (dbDate(before.period_start) !== periodStart || dbDate(before.period_end) !== periodEnd) {
        throw new Error('PERIOD_CLOSE_RANGE_CONFLICT: Existing close record uses a different date range');
      }
      if (before.status === 'CLOSED') return { success: true, periodKey };
      if (!['OPEN', 'IN_REVIEW', 'READY_TO_CLOSE', 'REOPENED'].includes(before.status)) {
        throw new Error(`PERIOD_CLOSE_STATE_INVALID: Period in ${before.status} state cannot be closed`);
      }

      const existingLocks = await tx.query(
        `SELECT * FROM period_locks WHERE organization_id=$1 AND period_name=$2 ORDER BY id FOR UPDATE`, [orgId, periodKey]
      );
      if (existingLocks.rows.length > 1) throw new Error('PERIOD_LOCK_DUPLICATE: Multiple period lock records exist');
      if (existingLocks.rows.length === 0) {
        await tx.query(
          `INSERT INTO period_locks (id, organization_id, period_name, is_locked, lock_date, locked_by, locked_at, reason, status)
           VALUES ($1,$2,$3,TRUE,$4,$5,CURRENT_TIMESTAMP,$6,'Active')`,
          [newId('pl'), orgId, periodKey, periodEnd, userId, `Period close for ${periodKey}`]
        );
      } else {
        const lockUpdate = await tx.query(
          `UPDATE period_locks SET is_locked=TRUE, lock_date=$1, locked_by=$2, locked_at=CURRENT_TIMESTAMP,
            reason=$3, status='Active' WHERE organization_id=$4 AND id=$5`,
          [periodEnd, userId, `Period close for ${periodKey}`, orgId, existingLocks.rows[0].id]
        );
        if (lockUpdate.rowCount !== 1) throw new Error('PERIOD_LOCK_CONFLICT: Period lock state changed');
      }

      // Lock existing period journals in deterministic order before computing final evidence.
      await tx.query(
        `SELECT id FROM journal_entries WHERE organization_id=$1 AND date >= $2 AND date <= $3 ORDER BY id FOR UPDATE`,
        [orgId, periodStart, periodEnd]
      );
      const validation = await validateWithClient(orgId, periodKey, periodStart, periodEnd, tx);
      if (!validation.canClose) {
        throw new Error(`PERIOD_CLOSE_BLOCKED: Cannot close period ${periodKey} due to ${validation.blockingFailuresCount} blocking integrity failures.`);
      }
      const review = await tx.query(`SELECT status FROM period_close_checklists WHERE organization_id=$1 AND period_key=$2 FOR UPDATE`, [orgId, periodKey]);
      if (review.rows.length === 1 && review.rows[0].status !== 'READY_TO_CLOSE') {
        throw new Error('PERIOD_CLOSE_REVIEW_INCOMPLETE: Complete the saved month-end review before closing this period');
      }
      const closeUpdate = await tx.query(
        `UPDATE accounting_period_closes SET status='CLOSED', closed_by=$1, closed_at=CURRENT_TIMESTAMP,
          reopened_by=NULL, reopened_at=NULL, reopen_reason=NULL, checklist_summary=$2, close_evidence=$3
          WHERE organization_id=$4 AND period_key=$5 AND status=$6`,
        [userId, JSON.stringify(validation.checks), JSON.stringify({ validation, reviewStatus: review.rows[0]?.status || 'NOT_STARTED' }), orgId, periodKey, before.status]
      );
      if (closeUpdate.rowCount !== 1) throw new Error('PERIOD_CLOSE_CONFLICT: Period state changed during close');
      const eventId = newId('pcevt');
      await tx.query(
        `INSERT INTO accounting_period_close_events
          (id, organization_id, period_key, event_type, event_at, actor_id, reason, evidence)
         VALUES ($1,$2,$3,'CLOSED',CURRENT_TIMESTAMP,$4,$5,$6)`,
        [eventId, orgId, periodKey, userId, `Period close for ${periodKey}`, JSON.stringify(validation)]
      );
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1,$2,$3,'ACCOUNTING_PERIOD_CLOSED','AccountingPeriodClose',$4,$5,$6)`,
        [newId('aud'), orgId, userId, before.id, JSON.stringify({ status: before.status }),
          JSON.stringify({ status: 'CLOSED', periodKey, eventId, warningsCount: validation.warningsCount })]
      );
      return { success: true, periodKey };
    });
  }

  public static async reopenPeriod(orgId: string, userId: string, periodKey: string,
    reason: string): Promise<{ success: boolean; periodKey: string }> {
    const why = String(reason || '').trim();
    if (why.length < 5 || why.length > 1000) {
      throw new Error('PERIOD_REOPEN_REASON_REQUIRED: A reason containing 5-1000 characters is required');
    }
    return db.transaction(async (tx) => {
      const closeRes = await tx.query(
        'SELECT * FROM accounting_period_closes WHERE organization_id=$1 AND period_key=$2 FOR UPDATE', [orgId, periodKey]
      );
      if (closeRes.rows.length !== 1) throw new Error('PERIOD_CLOSE_NOT_FOUND: Closed period does not exist');
      const close = closeRes.rows[0];
      if (close.status !== 'CLOSED') throw new Error(`PERIOD_NOT_CLOSED: Period in ${close.status} state cannot be reopened`);
      const locks = await tx.query(
        `SELECT * FROM period_locks WHERE organization_id=$1 AND period_name=$2 ORDER BY id FOR UPDATE`, [orgId, periodKey]
      );
      if (locks.rows.length !== 1 || !locks.rows[0].is_locked || locks.rows[0].status !== 'Active') {
        throw new Error('PERIOD_LOCK_STATE_INVALID: Closed period must have one active lock');
      }
      const lockUpdate = await tx.query(
        `UPDATE period_locks SET is_locked=FALSE, status='Inactive', reason=$1
          WHERE organization_id=$2 AND id=$3 AND is_locked=TRUE AND status='Active'`,
        [`Reopened: ${why}`, orgId, locks.rows[0].id]
      );
      if (lockUpdate.rowCount !== 1) throw new Error('PERIOD_REOPEN_CONFLICT: Period lock state changed');
      const closeUpdate = await tx.query(
        `UPDATE accounting_period_closes SET status='REOPENED', reopened_by=$1, reopened_at=CURRENT_TIMESTAMP, reopen_reason=$2
          WHERE organization_id=$3 AND id=$4 AND status='CLOSED'`, [userId, why, orgId, close.id]
      );
      if (closeUpdate.rowCount !== 1) throw new Error('PERIOD_REOPEN_CONFLICT: Period close state changed');
      const eventId = newId('pcevt');
      await tx.query(
        `INSERT INTO accounting_period_close_events
          (id, organization_id, period_key, event_type, event_at, actor_id, reason, evidence)
         VALUES ($1,$2,$3,'REOPENED',CURRENT_TIMESTAMP,$4,$5,$6)`,
        [eventId, orgId, periodKey, userId, why, JSON.stringify({ priorCloseEventAt: close.closed_at, priorClosedBy: close.closed_by })]
      );
      await tx.query(
        `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, before_state, after_state)
         VALUES ($1,$2,$3,'ACCOUNTING_PERIOD_REOPENED','AccountingPeriodClose',$4,$5,$6)`,
        [newId('aud'), orgId, userId, close.id, JSON.stringify({ status: 'CLOSED' }), JSON.stringify({ status: 'REOPENED', periodKey, eventId, reason: why })]
      );
      return { success: true, periodKey };
    });
  }
}
