import { db } from '../database/db';

export interface DashboardSummaryData {
  receivables: number;
  payables: number;
  bankBalance: number;
  salesThisMonth: number;
  outstandingInvoicesCount: number;
  overdueInvoicesCount: number;
  upcomingBillsCount: number;
  bankReconciliationAttentionCount: number;
  quotationsAwaitingResponseCount: number;
  recentTransactions: any[];
}

export class DashboardSummaryService {
  public static async getSummary(organizationId: string): Promise<DashboardSummaryData> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${year}-${month}-01`;
    const endOfMonth = `${year}-${month}-31`;
    const todayStr = now.toISOString().split('T')[0];

    const [
      receivablesRes,
      payablesRes,
      bankBalRes,
      salesMonthRes,
      outInvRes,
      overdueInvRes,
      upBillsRes,
      unmatchedBankRes,
      pendingEstRes,
      recentTxRes,
    ] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE organization_id = $1 AND status != 'VOIDED'`,
        [organizationId]
      ),
      db.query(
        `SELECT COALESCE(SUM(total_amount - amount_paid), 0) as total FROM bills WHERE organization_id = $1 AND status != 'PAID' AND status != 'VOID' AND status != 'VOIDED'`,
        [organizationId]
      ),
      db.query(
        `SELECT COALESCE(SUM(current_balance), 0) as total FROM bank_accounts WHERE organization_id = $1 AND is_active = TRUE`,
        [organizationId]
      ),
      db.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE organization_id = $1 AND status != 'VOID' AND status != 'VOIDED' AND issue_date >= $2 AND issue_date <= $3`,
        [organizationId, startOfMonth, endOfMonth]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1 AND status != 'VOIDED' AND balance_due > 0`,
        [organizationId]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1 AND status != 'VOIDED' AND balance_due > 0 AND due_date < $2`,
        [organizationId, todayStr]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM bills WHERE organization_id = $1 AND status != 'PAID' AND status != 'VOID' AND status != 'VOIDED' AND (total_amount - amount_paid) > 0`,
        [organizationId]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM bank_statement_transactions WHERE organization_id = $1 AND reconciliation_status = 'UNMATCHED'`,
        [organizationId]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM estimates WHERE organization_id = $1 AND status IN ('SENT', 'VIEWED', 'DRAFT')`,
        [organizationId]
      ),
      db.query(
        `SELECT 'Invoice' as type, invoice_number as doc_num, client_name as party_name, total_amount as amount, status, issue_date as doc_date
         FROM invoices WHERE organization_id = $1
         UNION ALL
         SELECT 'Bill' as type, bill_number as doc_num, vendor_name as party_name, total_amount as amount, status, bill_date as doc_date
         FROM bills WHERE organization_id = $1
         ORDER BY doc_date DESC LIMIT 5`,
        [organizationId]
      ),
    ]);

    let calculatedBankBal = Number(bankBalRes.rows[0]?.total || 0);
    // Fallback to ledger accounts if bank_accounts table is empty
    if (calculatedBankBal === 0) {
      const ledgerBankRes = await db.query(
        `SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE organization_id = $1 AND type = 'Asset' AND sub_type IN ('Bank', 'Cash')`,
        [organizationId]
      );
      calculatedBankBal = Number(ledgerBankRes.rows[0]?.total || 0);
    }

    return {
      receivables: Number(receivablesRes.rows[0]?.total || 0),
      payables: Number(payablesRes.rows[0]?.total || 0),
      bankBalance: calculatedBankBal,
      salesThisMonth: Number(salesMonthRes.rows[0]?.total || 0),
      outstandingInvoicesCount: Number(outInvRes.rows[0]?.cnt || 0),
      overdueInvoicesCount: Number(overdueInvRes.rows[0]?.cnt || 0),
      upcomingBillsCount: Number(upBillsRes.rows[0]?.cnt || 0),
      bankReconciliationAttentionCount: Number(unmatchedBankRes.rows[0]?.cnt || 0),
      quotationsAwaitingResponseCount: Number(pendingEstRes.rows[0]?.cnt || 0),
      recentTransactions: recentTxRes.rows.map((r) => ({
        type: r.type,
        documentNumber: r.doc_num,
        partyName: r.party_name,
        amount: Number(r.amount || 0),
        status: r.status,
        date: r.doc_date,
      })),
    };
  }
}
