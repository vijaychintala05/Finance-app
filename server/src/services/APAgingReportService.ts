import { db } from '../database/db';

export interface APAgingReportResponse {
  organizationId: string;
  asOfDate: string;
  totalAgingAmount: number;
  totalSubledgerAmount: number;
  totalGLControlAmount: number;
  difference: number;
  isReconciled: boolean;
  rows: any[];
}

export class APAgingReportService {
  public static async getAPAgingReport(
    orgId: string,
    asOfDate: string = new Date().toISOString().split('T')[0]
  ): Promise<APAgingReportResponse> {
    const billsRes = await db.query(
      `SELECT b.id, b.vendor_id, COALESCE(v.name, v.company_name, b.vendor_name, 'Vendor') as name,
              b.bill_number, b.due_date, b.balance_due
       FROM bills b
       LEFT JOIN vendors v ON b.vendor_id = v.id
       WHERE b.organization_id = $1 AND b.balance_due > 0 AND UPPER(b.status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND b.bill_date <= $2`,
      [orgId, asOfDate]
    );

    let totalAgingAmount = 0;
    const rows = billsRes.rows.map((b: any) => {
      const bal = Number(b.balance_due || 0);
      totalAgingAmount += bal;
      return {
        ...b,
        balance_due: bal,
      };
    });

    totalAgingAmount = Math.round(totalAgingAmount * 100) / 100;

    // GL Control Account balance for AP (code 2000)
    const glRes = await db.query(
      `SELECT 
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
       FROM accounts a
       JOIN journal_lines jl ON a.id = jl.account_id
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE a.organization_id = $1 AND a.code = '2000' AND UPPER(je.status) = 'POSTED' AND je.date <= $2`,
      [orgId, asOfDate]
    );

    const glDebit = Number(glRes.rows[0]?.total_debit || 0);
    const glCredit = Number(glRes.rows[0]?.total_credit || 0);
    const totalGLControlAmount = Math.round((glCredit - glDebit) * 100) / 100;

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
