import { db } from '../database/db';

export interface ARAgingReportResponse {
  organizationId: string;
  asOfDate: string;
  totalAgingAmount: number;
  totalSubledgerAmount: number;
  totalGLControlAmount: number;
  difference: number;
  isReconciled: boolean;
  rows: any[];
}

export class ARAgingReportService {
  public static async getARAgingReport(
    orgId: string,
    asOfDate: string = new Date().toISOString().split('T')[0]
  ): Promise<ARAgingReportResponse> {
    const invRes = await db.query(
      `SELECT i.id, i.customer_id, i.client_id, COALESCE(c.display_name, i.client_name, 'Customer') as name,
              i.invoice_number, i.due_date, i.balance_due
       FROM invoices i
       LEFT JOIN customers c ON (i.customer_id = c.id OR i.client_id = c.id)
       WHERE i.organization_id = $1 AND i.balance_due > 0 AND UPPER(i.status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND i.issue_date <= $2`,
      [orgId, asOfDate]
    );

    let totalAgingAmount = 0;
    const rows = invRes.rows.map((inv: any) => {
      const bal = Number(inv.balance_due || 0);
      totalAgingAmount += bal;
      return {
        ...inv,
        balance_due: bal,
      };
    });

    totalAgingAmount = Math.round(totalAgingAmount * 100) / 100;

    // GL Control Account balance for AR (code 1100)
    const glRes = await db.query(
      `SELECT 
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
       FROM accounts a
       JOIN journal_lines jl ON a.id = jl.account_id
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE a.organization_id = $1 AND a.code = '1100' AND UPPER(je.status) = 'POSTED' AND je.date <= $2`,
      [orgId, asOfDate]
    );

    const glDebit = Number(glRes.rows[0]?.total_debit || 0);
    const glCredit = Number(glRes.rows[0]?.total_credit || 0);
    const totalGLControlAmount = Math.round((glDebit - glCredit) * 100) / 100;

    const diff = Math.abs(Math.round((totalAgingAmount - totalGLControlAmount) * 100) / 100);

    return {
      organizationId: orgId,
      asOfDate,
      totalAgingAmount,
      totalSubledgerAmount: totalAgingAmount,
      totalGLControlAmount,
      difference: diff,
      isReconciled: diff === 0,
      rows,
    };
  }
}
