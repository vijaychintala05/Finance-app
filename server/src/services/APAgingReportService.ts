import { db } from '../database/db';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('Invalid accounts payable aging date');
    const billsRes = await db.query(
      `SELECT b.id, b.vendor_id, COALESCE(v.name, v.company_name, b.vendor_name, 'Vendor') as name,
              b.bill_number, b.due_date, b.balance_due
       FROM bills b
       LEFT JOIN vendors v ON b.vendor_id = v.id
       WHERE b.organization_id = $1 AND b.balance_due > 0 AND UPPER(b.status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND b.bill_date <= $2`,
      [orgId, asOfDate]
    );

    let totalAgingCents = 0n;
    const rows = billsRes.rows.map((b: any) => {
      const balanceCents = databaseMoneyToCents(b.balance_due, `Payable balance for ${b.bill_number}`);
      const bal = centsToSafeNumber(balanceCents, `Payable balance for ${b.bill_number}`);
      totalAgingCents += balanceCents;
      return {
        ...b,
        balance_due: bal,
      };
    });

    const totalAgingAmount = centsToSafeNumber(totalAgingCents, 'Accounts payable subledger total');

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

    const glCents = databaseMoneyToCents(glRes.rows[0]?.total_credit, 'Accounts payable control credit') - databaseMoneyToCents(glRes.rows[0]?.total_debit, 'Accounts payable control debit');
    const totalGLControlAmount = centsToSafeNumber(glCents, 'Accounts payable control total');
    const differenceCents = totalAgingCents >= glCents ? totalAgingCents - glCents : glCents - totalAgingCents;
    const diff = centsToSafeNumber(differenceCents, 'Accounts payable reconciliation difference');

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
