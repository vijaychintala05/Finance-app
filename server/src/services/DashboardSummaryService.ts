import { db } from '../database/db';
import { databaseMoney } from '../utils/money';

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
    const nextMonth = new Date(year, now.getMonth() + 1, 1);
    const nextMonthStart = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
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
        `SELECT COALESCE(SUM(balance_due), 0) as total FROM invoices WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')`,
        [organizationId]
      ),
      db.query(
        `SELECT COALESCE(SUM(balance_due), 0) as total FROM bills WHERE organization_id = $1 AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT')`,
        [organizationId]
      ),
      db.query(
        `SELECT COALESCE(SUM(CASE WHEN UPPER(a.type) = 'ASSET' THEN jl.debit - jl.credit ELSE jl.credit - jl.debit END), 0) as total
           FROM accounts a
           JOIN journal_lines jl ON jl.account_id = a.id
           JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'
          WHERE a.organization_id = $1 AND UPPER(a.type) = 'ASSET' AND (UPPER(a.sub_type) IN ('BANK', 'CASH', 'CASH & BANK') OR UPPER(a.name) LIKE '%BANK%' OR UPPER(a.name) LIKE '%CASH%')`,
        [organizationId]
      ),
      db.query(
        `SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as total
           FROM accounts a
           JOIN journal_lines jl ON jl.account_id = a.id
           JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.organization_id = a.organization_id AND UPPER(je.status) = 'POSTED'
          WHERE a.organization_id = $1 AND UPPER(a.type) IN ('INCOME', 'REVENUE', 'OTHER INCOME') AND je.date >= $2 AND je.date < $3`,
        [organizationId, startOfMonth, nextMonthStart]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND balance_due > 0`,
        [organizationId]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM invoices WHERE organization_id = $1 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND balance_due > 0 AND due_date < $2`,
        [organizationId, todayStr]
      ),
      db.query(
        `SELECT COUNT(*) as cnt FROM bills WHERE organization_id = $1 AND UPPER(status) NOT IN ('PAID', 'VOID', 'VOIDED', 'DRAFT') AND balance_due > 0`,
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

    const calculatedBankBal = databaseMoney(bankBalRes.rows[0]?.total, 'Dashboard bank balance');

    return {
      receivables: databaseMoney(receivablesRes.rows[0]?.total, 'Dashboard receivables'),
      payables: databaseMoney(payablesRes.rows[0]?.total, 'Dashboard payables'),
      bankBalance: calculatedBankBal,
      salesThisMonth: databaseMoney(salesMonthRes.rows[0]?.total, 'Dashboard monthly revenue'),
      outstandingInvoicesCount: Number(outInvRes.rows[0]?.cnt || 0),
      overdueInvoicesCount: Number(overdueInvRes.rows[0]?.cnt || 0),
      upcomingBillsCount: Number(upBillsRes.rows[0]?.cnt || 0),
      bankReconciliationAttentionCount: Number(unmatchedBankRes.rows[0]?.cnt || 0),
      quotationsAwaitingResponseCount: Number(pendingEstRes.rows[0]?.cnt || 0),
      recentTransactions: recentTxRes.rows.map((r) => ({
        type: r.type,
        documentNumber: r.doc_num,
        partyName: r.party_name,
        amount: databaseMoney(r.amount, `Dashboard amount for ${r.doc_num}`),
        status: r.status,
        date: r.doc_date,
      })),
    };
  }
}
