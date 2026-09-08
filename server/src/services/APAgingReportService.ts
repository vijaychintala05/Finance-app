import { db } from '../database/db';
import { centsToSafeNumber, databaseMoneyToCents } from '../utils/money';

export interface APAgingRow {
  id: string;
  bill_number: string;
  vendor_id?: string;
  name: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  paid_amount_as_of: number;
  balance_due: number;
  days_overdue: number;
  bucket: 'current' | '1_30' | '31_60' | '61_90' | '90_plus';
}

export interface APAgingReportResponse {
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
  rows: APAgingRow[];
}

export class APAgingReportService {
  public static async getAPAgingReport(
    orgId: string,
    asOfDate: string = new Date().toISOString().split('T')[0]
  ): Promise<APAgingReportResponse> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) throw new Error('Invalid accounts payable aging date');

    // Retrospective historical calculation:
    // Reconstruct bill open balance as of asOfDate by querying payments/debits effective on or before asOfDate.
    const billsRes = await db.query(
      `SELECT 
        b.id, b.bill_number, b.vendor_id,
        COALESCE(v.name, v.company_name, b.vendor_name, 'Vendor') as name,
        b.bill_date, b.due_date, b.total_amount, b.balance_due, b.status, b.reversed_at,
        COALESCE(pmt.total_paid, 0) as paid_as_of,
        COALESCE(dn.total_debited, 0) as debited_as_of,
        COALESCE(adv.total_advance, 0) as advance_as_of,
        COALESCE(wo.total_written_off, 0) as written_off_as_of
       FROM bills b
       LEFT JOIN vendors v ON b.vendor_id = v.id
       LEFT JOIN (
         SELECT pma.bill_id, SUM(pma.amount) as total_paid
         FROM payment_made_allocations pma
         JOIN payments_made pm ON pm.id = pma.payment_id
         WHERE pm.organization_id = $1 AND pm.payment_date <= $2 
           AND UPPER(pm.status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'CANCELLED', 'REVERSED')
         GROUP BY pma.bill_id
       ) pmt ON pmt.bill_id = b.id
       LEFT JOIN (
         SELECT dna.bill_id, SUM(dna.amount_applied) as total_debited
         FROM debit_note_applications dna
         WHERE dna.organization_id = $1 AND dna.applied_date <= $2 
           AND UPPER(dna.status) NOT IN ('REVERSED', 'VOID')
         GROUP BY dna.bill_id
       ) dn ON dn.bill_id = b.id
       LEFT JOIN (
         SELECT vaa.bill_id, SUM(vaa.amount_applied) as total_advance
         FROM vendor_advance_applications vaa
         WHERE vaa.organization_id = $1 AND vaa.applied_date <= $2 
           AND UPPER(vaa.status) NOT IN ('REVERSED', 'VOID')
         GROUP BY vaa.bill_id
       ) adv ON adv.bill_id = b.id
       LEFT JOIN (
         SELECT wo.bill_id, SUM(wo.amount) as total_written_off
         FROM ap_write_offs wo
         WHERE wo.organization_id = $1 AND wo.write_off_date <= $2
         GROUP BY wo.bill_id
       ) wo ON wo.bill_id = b.id
       WHERE b.organization_id = $1 
         AND b.bill_date <= $2 
         AND UPPER(b.status) NOT IN ('DRAFT', 'SUBMITTED')`,
      [orgId, asOfDate]
    );

    let totalAgingCents = 0n;
    let currentCents = 0n;
    let days1_30Cents = 0n;
    let days31_60Cents = 0n;
    let days61_90Cents = 0n;
    let days90PlusCents = 0n;

    const asOfTime = new Date(asOfDate).getTime();
    const rows: APAgingRow[] = [];

    for (const b of billsRes.rows) {
      if (b.reversed_at) {
        const revDate = typeof b.reversed_at === 'string'
          ? b.reversed_at.slice(0, 10)
          : new Date(b.reversed_at).toISOString().slice(0, 10);
        if (revDate <= asOfDate) continue;
      } else if (UPPER(b.status) === 'VOID' || UPPER(b.status) === 'VOIDED') {
        continue;
      }

      const totalCents = databaseMoneyToCents(b.total_amount, `Total amount for ${b.bill_number}`);
      const paidCents = databaseMoneyToCents(b.paid_as_of, `Paid for ${b.bill_number}`);
      const debitedCents = databaseMoneyToCents(b.debited_as_of, `Debited for ${b.bill_number}`);
      const advanceCents = databaseMoneyToCents(b.advance_as_of, `Advance for ${b.bill_number}`);
      const writtenOffCents = databaseMoneyToCents(b.written_off_as_of, `Written off for ${b.bill_number}`);

      let settledCents = paidCents + debitedCents + advanceCents + writtenOffCents;
      const today = new Date().toISOString().slice(0, 10);
      const isHistorical = asOfDate < today;
      if (!isHistorical && settledCents === 0n && b.balance_due !== undefined && b.balance_due !== null) {
        const balDueCents = databaseMoneyToCents(b.balance_due, `Balance due for ${b.bill_number}`);
        if (balDueCents < totalCents) {
          settledCents = totalCents - balDueCents;
        }
      }
      if (settledCents >= totalCents) {
        continue;
      }

      const balanceCents = totalCents - settledCents;
      const bal = centsToSafeNumber(balanceCents, `Payable balance for ${b.bill_number}`);
      if (bal <= 0) continue;

      totalAgingCents += balanceCents;

      const dueDateStr = b.due_date instanceof Date
        ? b.due_date.toISOString().slice(0, 10)
        : (typeof b.due_date === 'string' ? b.due_date.slice(0, 10) : (b.bill_date instanceof Date ? b.bill_date.toISOString().slice(0, 10) : String(b.bill_date).slice(0, 10)));
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
        id: b.id,
        bill_number: b.bill_number,
        vendor_id: b.vendor_id,
        name: b.name,
        bill_date: String(b.bill_date).slice(0, 10),
        due_date: dueDateStr,
        total_amount: centsToSafeNumber(totalCents, `Total for ${b.bill_number}`),
        paid_amount_as_of: centsToSafeNumber(settledCents, `Settled for ${b.bill_number}`),
        balance_due: bal,
        days_overdue: daysOverdue,
        bucket,
      });
    }

    const totalAgingAmount = centsToSafeNumber(totalAgingCents, 'Accounts payable subledger total');

    // GL Control Account balance for AP (code 2000 or system_role AP_CONTROL / ACCOUNTS_PAYABLE)
    const glRes = await db.query(
      `SELECT 
        COALESCE(SUM(jl.debit), 0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit
       FROM accounts a
       JOIN journal_lines jl ON a.id = jl.account_id
       JOIN journal_entries je ON jl.journal_entry_id = je.id
       WHERE a.organization_id = $1 
         AND (a.code = '2000' OR a.system_role = 'AP_CONTROL' OR a.system_role = 'ACCOUNTS_PAYABLE')
         AND UPPER(je.status) = 'POSTED' 
         AND je.date <= $2`,
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
      buckets: {
        current: centsToSafeNumber(currentCents, 'AP Current'),
        days1_30: centsToSafeNumber(days1_30Cents, 'AP 1-30'),
        days31_60: centsToSafeNumber(days31_60Cents, 'AP 31-60'),
        days61_90: centsToSafeNumber(days61_90Cents, 'AP 61-90'),
        days90Plus: centsToSafeNumber(days90PlusCents, 'AP 90+'),
      },
      rows,
    };
  }
}

function UPPER(val: any): string {
  return String(val || '').toUpperCase();
}
