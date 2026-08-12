import { db } from '../database/db';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('Invalid accounts receivable aging date');
    const today = new Date().toISOString().split('T')[0];
    if (asOfDate !== today) throw new Error('Historical accounts receivable reconstruction is not implemented; use the current date');
    const invRes = await db.query(
      `SELECT i.id, i.customer_id, i.client_id, COALESCE(c.display_name, i.client_name, 'Customer') as name,
              i.invoice_number, i.due_date, i.balance_due
       FROM invoices i
       LEFT JOIN customers c ON (i.customer_id = c.id OR i.client_id = c.id)
       WHERE i.organization_id = $1 AND i.balance_due > 0 AND UPPER(i.status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND i.issue_date <= $2`,
      [orgId, asOfDate]
    );

    let totalAgingCents = 0n;
    const rows = invRes.rows.map((inv: any) => {
      const balanceCents = databaseMoneyToCents(inv.balance_due, `Receivable balance for ${inv.invoice_number}`);
      const bal = centsToSafeNumber(balanceCents, `Receivable balance for ${inv.invoice_number}`);
      totalAgingCents += balanceCents;
      return {
        ...inv,
        balance_due: bal,
      };
    });

    const totalAgingAmount = centsToSafeNumber(totalAgingCents, 'Accounts receivable subledger total');

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

    const glCents = databaseMoneyToCents(glRes.rows[0]?.total_debit, 'Accounts receivable control debit') - databaseMoneyToCents(glRes.rows[0]?.total_credit, 'Accounts receivable control credit');
    const totalGLControlAmount = centsToSafeNumber(glCents, 'Accounts receivable control total');
    const differenceCents = totalAgingCents >= glCents ? totalAgingCents - glCents : glCents - totalAgingCents;
    const diff = centsToSafeNumber(differenceCents, 'Accounts receivable reconciliation difference');

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
