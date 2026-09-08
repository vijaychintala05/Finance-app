import { db } from '../database/db';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

export interface ARAgingRow {
  id: string;
  invoice_number: string;
  customer_id?: string;
  client_id?: string;
  name: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  paid_amount_as_of: number;
  balance_due: number;
  days_overdue: number;
  bucket: 'current' | '1_30' | '31_60' | '61_90' | '90_plus';
}

export interface ARAgingReportResponse {
  organizationId: string;
  asOfDate: string;
  totalAgingAmount: number;
  totalSubledgerAmount: number;
  totalGLControlAmount: number;
  difference: number;
  isReconciled: boolean;
  buckets: {
    current: number;
    days1_30: number;
    days31_60: number;
    days61_90: number;
    days90Plus: number;
  };
  rows: ARAgingRow[];
}

export class ARAgingReportService {
  public static async getARAgingReport(
    orgId: string,
    asOfDate: string = new Date().toISOString().split('T')[0]
  ): Promise<ARAgingReportResponse> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('Invalid accounts receivable aging date');

    // Retrospective historical calculation:
    // Reconstruct invoice open balance as of asOfDate by querying settlements/credits effective on or before asOfDate.
    const invRes = await db.query(
      `SELECT 
        i.id, i.invoice_number, i.customer_id, i.client_id,
        COALESCE(c.display_name, c.legal_name, i.client_name, 'Customer') as name,
        i.issue_date, i.due_date, i.total_amount, i.balance_due, i.status, i.reversed_at,
        COALESCE(pmt.total_paid, 0) as paid_as_of,
        COALESCE(cn.total_credited, 0) as credited_as_of,
        COALESCE(adv.total_advance, 0) as advance_as_of,
        COALESCE(wo.total_written_off, 0) as written_off_as_of
       FROM invoices i
       LEFT JOIN customers c ON (i.customer_id = c.id OR i.client_id = c.id)
       LEFT JOIN (
         SELECT pra.invoice_id, SUM(pra.amount) as total_paid
         FROM payment_received_allocations pra
         JOIN payments_received pr ON pr.id = pra.payment_id
         WHERE pr.organization_id = $1 AND pr.payment_date <= $2 
           AND UPPER(pr.status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'CANCELLED', 'REVERSED')
         GROUP BY pra.invoice_id
       ) pmt ON pmt.invoice_id = i.id
       LEFT JOIN (
         SELECT cna.invoice_id, SUM(cna.amount_applied) as total_credited
         FROM credit_note_applications cna
         WHERE cna.organization_id = $1 AND cna.applied_date <= $2 
           AND UPPER(cna.status) NOT IN ('REVERSED', 'VOID')
         GROUP BY cna.invoice_id
       ) cn ON cn.invoice_id = i.id
       LEFT JOIN (
         SELECT caa.invoice_id, SUM(caa.amount_applied) as total_advance
         FROM customer_advance_applications caa
         WHERE caa.organization_id = $1 AND caa.applied_date <= $2 
           AND UPPER(caa.status) NOT IN ('REVERSED', 'VOID')
         GROUP BY caa.invoice_id
       ) adv ON adv.invoice_id = i.id
       LEFT JOIN (
         SELECT wo.invoice_id, SUM(wo.amount) as total_written_off
         FROM ar_write_offs wo
         WHERE wo.organization_id = $1 AND wo.write_off_date <= $2
         GROUP BY wo.invoice_id
       ) wo ON wo.invoice_id = i.id
       WHERE i.organization_id = $1 
         AND i.issue_date <= $2 
         AND UPPER(i.status) NOT IN ('DRAFT', 'SUBMITTED')`,
      [orgId, asOfDate]
    );

    let totalAgingCents = 0n;
    let currentCents = 0n;
    let days1_30Cents = 0n;
    let days31_60Cents = 0n;
    let days61_90Cents = 0n;
    let days90PlusCents = 0n;

    const asOfTime = new Date(asOfDate).getTime();
    const rows: ARAgingRow[] = [];

    for (const inv of invRes.rows) {
      // Exclude invoices reversed on or before asOfDate
      if (inv.reversed_at) {
        const revDate = typeof inv.reversed_at === 'string'
          ? inv.reversed_at.slice(0, 10)
          : new Date(inv.reversed_at).toISOString().slice(0, 10);
        if (revDate <= asOfDate) continue;
      } else if (UPPER(inv.status) === 'VOID' || UPPER(inv.status) === 'VOIDED') {
        continue;
      }

      const totalCents = databaseMoneyToCents(inv.total_amount, `Total amount for ${inv.invoice_number}`);
      const paidCents = databaseMoneyToCents(inv.paid_as_of, `Paid for ${inv.invoice_number}`);
      const creditedCents = databaseMoneyToCents(inv.credited_as_of, `Credited for ${inv.invoice_number}`);
      const advanceCents = databaseMoneyToCents(inv.advance_as_of, `Advance for ${inv.invoice_number}`);
      const writtenOffCents = databaseMoneyToCents(inv.written_off_as_of, `Written off for ${inv.invoice_number}`);

      let settledCents = paidCents + creditedCents + advanceCents + writtenOffCents;
      const today = new Date().toISOString().slice(0, 10);
      const isHistorical = asOfDate < today;
      if (!isHistorical && settledCents === 0n && inv.balance_due !== undefined && inv.balance_due !== null) {
        const balDueCents = databaseMoneyToCents(inv.balance_due, `Balance due for ${inv.invoice_number}`);
        if (balDueCents < totalCents) {
          settledCents = totalCents - balDueCents;
        }
      }
      if (settledCents >= totalCents) {
        // Fully settled on or before asOfDate
        continue;
      }

      const balanceCents = totalCents - settledCents;
      const bal = centsToSafeNumber(balanceCents, `Receivable balance for ${inv.invoice_number}`);
      if (bal <= 0) continue;

      totalAgingCents += balanceCents;

      // Overdue calculation based on due_date (or issue_date if due_date missing)
      const dueDateStr = inv.due_date instanceof Date
        ? inv.due_date.toISOString().slice(0, 10)
        : (typeof inv.due_date === 'string' ? inv.due_date.slice(0, 10) : (inv.issue_date instanceof Date ? inv.issue_date.toISOString().slice(0, 10) : String(inv.issue_date).slice(0, 10)));
      const dueTime = new Date(dueDateStr).getTime();
      const daysOverdue = Math.max(0, Math.floor((asOfTime - dueTime) / (1000 * 60 * 60 * 24)));

      let bucket: 'current' | '1_30' | '31_60' | '61_90' | '90_plus' = 'current';
      if (daysOverdue === 0) {
        bucket = 'current';
        currentCents += balanceCents;
      } else if (daysOverdue <= 30) {
        bucket = '1_30';
        days1_30Cents += balanceCents;
      } else if (daysOverdue <= 60) {
        bucket = '31_60';
        days31_60Cents += balanceCents;
      } else if (daysOverdue <= 90) {
        bucket = '61_90';
        days61_90Cents += balanceCents;
      } else {
        bucket = '90_plus';
        days90PlusCents += balanceCents;
      }

      rows.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_id: inv.customer_id,
        client_id: inv.client_id,
        name: inv.name,
        issue_date: String(inv.issue_date).slice(0, 10),
        due_date: dueDateStr,
        total_amount: centsToSafeNumber(totalCents, `Total for ${inv.invoice_number}`),
        paid_amount_as_of: centsToSafeNumber(settledCents, `Settled for ${inv.invoice_number}`),
        balance_due: bal,
        days_overdue: daysOverdue,
        bucket,
      });
    }

    const totalAgingAmount = centsToSafeNumber(totalAgingCents, 'Accounts receivable subledger total');

    // GL Control Account balance for AR (code 1100 or system_role AR_CONTROL / ACCOUNTS_RECEIVABLE)
    const glRes = await db.query(
      `SELECT 
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
       FROM accounts a
       JOIN journal_lines jl ON a.id = jl.account_id
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE a.organization_id = $1 
         AND (a.code = '1100' OR a.system_role = 'AR_CONTROL' OR a.system_role = 'ACCOUNTS_RECEIVABLE')
         AND UPPER(je.status) = 'POSTED' 
         AND je.date <= $2`,
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
      buckets: {
        current: centsToSafeNumber(currentCents, 'AR Current'),
        days1_30: centsToSafeNumber(days1_30Cents, 'AR 1-30'),
        days31_60: centsToSafeNumber(days31_60Cents, 'AR 31-60'),
        days61_90: centsToSafeNumber(days61_90Cents, 'AR 61-90'),
        days90Plus: centsToSafeNumber(days90PlusCents, 'AR 90+'),
      },
      rows,
    };
  }
}

function UPPER(val: any): string {
  return String(val || '').toUpperCase();
}
