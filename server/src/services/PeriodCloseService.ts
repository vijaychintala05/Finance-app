import { db } from '../database/db';
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

export class PeriodCloseService {
  public static async validatePeriodClose(
    orgId: string,
    periodKey: string,
    periodStart: string,
    periodEnd: string
  ): Promise<PeriodCloseStatusResponse> {
    const checks: CloseCheckItem[] = [];

    // 1. Run Accounting Integrity Checks
    const integrity = await AccountingIntegrityService.verifyOrganizationIntegrity(orgId);

    checks.push({
      code: 'TRIAL_BALANCE',
      title: 'Trial Balance Equation',
      severity: 'BLOCKING',
      passed: integrity.checks.trialBalance.isBalanced,
      message: integrity.checks.trialBalance.isBalanced
        ? 'Trial Balance is balanced (Total Debit = Total Credit).'
        : `Trial Balance is unbalanced by ${integrity.checks.trialBalance.difference}.`,
    });

    checks.push({
      code: 'AR_RECONCILIATION',
      title: 'Accounts Receivable Subledger Integrity',
      severity: 'BLOCKING',
      passed: integrity.checks.accountsReceivable.isBalanced,
      message: integrity.checks.accountsReceivable.isBalanced
        ? 'AR Subledger equals AR Control Account GL balance.'
        : `AR Subledger mismatch: difference of ${integrity.checks.accountsReceivable.difference}.`,
    });

    checks.push({
      code: 'AP_RECONCILIATION',
      title: 'Accounts Payable Subledger Integrity',
      severity: 'BLOCKING',
      passed: integrity.checks.accountsPayable.isBalanced,
      message: integrity.checks.accountsPayable.isBalanced
        ? 'AP Subledger equals AP Control Account GL balance.'
        : `AP Subledger mismatch: difference of ${integrity.checks.accountsPayable.difference}.`,
    });

    // 2. Draft Journals Check
    const draftJournalsRes = await db.query(
      `SELECT COUNT(*) FROM journal_entries WHERE organization_id = $1 AND UPPER(status) = 'DRAFT' AND date >= $2 AND date <= $3`,
      [orgId, periodStart, periodEnd]
    );
    const draftCount = parseInt(draftJournalsRes.rows[0]?.count || '0');
    checks.push({
      code: 'DRAFT_JOURNALS',
      title: 'Unposted Draft Journals',
      severity: 'WARNING',
      passed: draftCount === 0,
      message: draftCount === 0 ? 'No draft journals in period.' : `${draftCount} draft journals remain unposted in this period.`,
    });

    // 3. Unreconciled Bank Transactions Check
    const bankUnmatchedRes = await db.query(
      `SELECT COUNT(*) FROM bank_statement_transactions WHERE organization_id = $1 AND reconciliation_status = 'UNMATCHED' AND transaction_date >= $2 AND transaction_date <= $3`,
      [orgId, periodStart, periodEnd]
    );
    const bankUnmatchedCount = parseInt(bankUnmatchedRes.rows[0]?.count || '0');
    checks.push({
      code: 'BANK_RECONCILIATION',
      title: 'Bank Statement Reconciliation',
      severity: 'WARNING',
      passed: bankUnmatchedCount === 0,
      message: bankUnmatchedCount === 0 ? 'All bank statement transactions reconciled.' : `${bankUnmatchedCount} bank transactions remain unmatched.`,
    });

    const blockingFailuresCount = checks.filter((c) => c.severity === 'BLOCKING' && !c.passed).length;
    const warningsCount = checks.filter((c) => c.severity === 'WARNING' && !c.passed).length;
    const canClose = blockingFailuresCount === 0;

    // Fetch existing close record if any
    const existingClose = await db.query(
      `SELECT status FROM accounting_period_closes WHERE organization_id = $1 AND period_key = $2`,
      [orgId, periodKey]
    );
    const currentStatus = (existingClose.rows[0]?.status as any) || 'OPEN';

    return {
      periodKey,
      periodStart,
      periodEnd,
      status: currentStatus,
      checks,
      canClose,
      blockingFailuresCount,
      warningsCount,
    };
  }

  public static async closePeriod(
    orgId: string,
    userId: string,
    periodKey: string,
    periodStart: string,
    periodEnd: string
  ): Promise<{ success: boolean; periodKey: string }> {
    const val = await this.validatePeriodClose(orgId, periodKey, periodStart, periodEnd);
    if (!val.canClose) {
      throw new Error(`PERIOD_CLOSE_BLOCKED: Cannot close period ${periodKey} due to ${val.blockingFailuresCount} blocking integrity failures.`);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    await db.transaction(async (tx) => {
      // 1. Create/Update accounting_period_closes
      await tx.query(
        `INSERT INTO accounting_period_closes (id, organization_id, period_key, period_start, period_end, status, closed_by, closed_at, checklist_summary)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
         ON CONFLICT (organization_id, period_key)
         DO UPDATE SET status = 'CLOSED', closed_by = $7, closed_at = NOW(), checklist_summary = $8`,
        [
          `apc-${Date.now()}`,
          orgId,
          periodKey,
          periodStart,
          periodEnd,
          'CLOSED',
          userId,
          JSON.stringify(val.checks),
        ]
      );

      // 2. Lock period in period_locks
      await tx.query(
        `INSERT INTO period_locks (id, organization_id, period_name, is_locked, lock_date, locked_by, locked_at, reason, status)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)`,
        [
          `pl-${Date.now()}`,
          orgId,
          periodKey,
          true,
          periodEnd,
          userId,
          `Period Close for ${periodKey}`,
          'Active',
        ]
      );
    });

    return { success: true, periodKey };
  }

  public static async reopenPeriod(
    orgId: string,
    userId: string,
    periodKey: string,
    reason: string
  ): Promise<{ success: boolean; periodKey: string }> {
    if (!reason || reason.trim().length < 5) {
      throw new Error('PERIOD_REOPEN_REASON_REQUIRED: A detailed reason (at least 5 characters) is required to reopen a closed period.');
    }

    await db.transaction(async (tx) => {
      await tx.query(
        `UPDATE accounting_period_closes
         SET status = 'REOPENED', reopened_by = $1, reopened_at = NOW(), reopen_reason = $2
         WHERE organization_id = $3 AND period_key = $4`,
        [userId, reason, orgId, periodKey]
      );

      await tx.query(
        `UPDATE period_locks
         SET is_locked = FALSE, status = 'Inactive', reason = $1
         WHERE organization_id = $2 AND period_name = $3`,
        [`Reopened: ${reason}`, orgId, periodKey]
      );
    });

    return { success: true, periodKey };
  }
}
