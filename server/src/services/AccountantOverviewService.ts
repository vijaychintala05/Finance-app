import { db } from '../database/db';
import { AccountingIntegrityService } from './AccountingIntegrityService';

export interface AccountantOverviewResponse {
  currentPeriod: string;
  accountingHealth: {
    passedCount: number;
    totalCount: number;
    isHealthy: boolean;
  };
  trialBalanceStatus: string;
  accountsReceivable: number;
  accountsPayable: number;
  unreconciledBankCount: number;
  gstLiability: number;
  gstInputCredit: number;
  gstNetPosition: number;
  pendingJournalsCount: number;
  periodCloseStatus: string;
}

export class AccountantOverviewService {
  public static async getOverview(orgId: string): Promise<AccountantOverviewResponse> {
    // 1. Accounting Health
    const integrity = await AccountingIntegrityService.verifyOrganizationIntegrity(orgId);
    let passed = 0;
    let total = 7;

    if (integrity.checks.journal.isBalanced) passed++;
    if (integrity.checks.trialBalance.isBalanced) passed++;
    if (integrity.checks.accountsReceivable.isBalanced) passed++;
    if (integrity.checks.accountsPayable.isBalanced) passed++;
    if (integrity.checks.banking.isBalanced) passed++;
    if (integrity.checks.gst.isBalanced) passed++;
    if (integrity.checks.accountBalanceCache.isBalanced) passed++;

    // 2. AR / AP Totals from subledger/GL queries
    const arRes = await db.query(
      `SELECT COALESCE(SUM(balance_due), 0) as total
         FROM invoices
        WHERE organization_id = $1
          AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
      [orgId]
    );
    const apRes = await db.query(
      `SELECT COALESCE(SUM(balance_due), 0) as total
         FROM bills
        WHERE organization_id = $1
          AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'PAID')`,
      [orgId]
    );
    const arBal = Number(arRes.rows[0]?.total || 0);
    const apBal = Number(apRes.rows[0]?.total || 0);

    // 3. Unreconciled Bank Count
    const bankUnmatchedRes = await db.query(
      `SELECT COUNT(*) FROM bank_statement_transactions WHERE organization_id = $1 AND reconciliation_status = 'UNMATCHED'`,
      [orgId]
    );
    const unreconciledBankCount = parseInt(bankUnmatchedRes.rows[0]?.count || '0');

    // 4. Pending Draft / Submitted Journals
    const pendingJournalsRes = await db.query(
      `SELECT COUNT(*) FROM journal_entries WHERE organization_id = $1 AND UPPER(status) IN ('DRAFT', 'SUBMITTED', 'PENDING')`,
      [orgId]
    );
    const pendingJournalsCount = parseInt(pendingJournalsRes.rows[0]?.count || '0');

    // 5. GST Net Position
    const gstRes = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN code IN ('2210', '2220', '2230') THEN balance ELSE 0 END), 0) as output_gst,
        COALESCE(SUM(CASE WHEN code IN ('1410', '1420', '1430') THEN balance ELSE 0 END), 0) as input_gst
       FROM accounts
       WHERE organization_id = $1 AND status = 'Active'`,
      [orgId]
    );
    const gstLiability = Number(gstRes.rows[0]?.output_gst || 0);
    const gstInputCredit = Number(gstRes.rows[0]?.input_gst || 0);
    const gstNetPosition = Math.round((gstLiability - gstInputCredit) * 100) / 100;

    // 6. Period close status
    const closeRes = await db.query(
      `SELECT status, period_key FROM accounting_period_closes WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [orgId]
    );
    const periodCloseStatus = closeRes.rows[0] ? `${closeRes.rows[0].period_key} — ${closeRes.rows[0].status}` : 'Current Period — OPEN';

    return {
      currentPeriod: '01-Apr-2026 → 31-Mar-2027',
      accountingHealth: {
        passedCount: passed,
        totalCount: total,
        isHealthy: passed === total,
      },
      trialBalanceStatus: integrity.checks.trialBalance.isBalanced ? 'Balanced' : `Unbalanced (${integrity.checks.trialBalance.difference})`,
      accountsReceivable: arBal,
      accountsPayable: apBal,
      unreconciledBankCount,
      gstLiability,
      gstInputCredit,
      gstNetPosition,
      pendingJournalsCount,
      periodCloseStatus,
    };
  }
}
