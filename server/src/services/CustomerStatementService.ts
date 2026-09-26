import { db, type DbQueryClient } from '../database/db';

export interface StatementLine {
  date: string;
  type: string;
  reference: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface CustomerStatementResponse {
  customerId: string;
  customerName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalInvoices: number;
  totalPayments: number;
  totalCredits: number;
  totalRefunds: number;
  totalWriteOffs: number;
  totalAdvancesApplied?: number;
  closingBalance: number;
  transactions: StatementLine[];
}

export class CustomerStatementService {
  public static async getCustomerStatement(
    orgId: string,
    customerId: string,
    fromDate: string,
    toDate: string,
    queryClient: DbQueryClient = db,
  ): Promise<CustomerStatementResponse> {
    const [
      custRes,
      clientRes,
      invOpen,
      payOpen,
      cnOpen,
      refOpen,
      woOpen,
      advAppOpen,
      invoices,
      payments,
      creditNotes,
      refunds,
      writeOffs,
      advanceApplications,
    ] = await Promise.all([
      queryClient.query(`SELECT id, display_name, legal_name FROM customers WHERE organization_id = $1 AND (id = $2 OR customer_id = $2)`, [orgId, customerId]),
      queryClient.query(`SELECT id, name, company_name FROM clients WHERE organization_id = $1 AND id = $2`, [orgId, customerId]),
      queryClient.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2) AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED') AND issue_date < $3`, [orgId, customerId, fromDate]),
      queryClient.query(`SELECT COALESCE(SUM(
                  COALESCE(pra.allocated, pr.amount - COALESCE(pr.unallocated_amount, 0))
                ), 0) as total
                FROM payments_received pr
                LEFT JOIN (
                  SELECT payment_id, SUM(amount) as allocated
                  FROM payment_received_allocations
                  WHERE organization_id = $1
                  GROUP BY payment_id
                ) pra ON pra.payment_id = pr.id
                WHERE pr.organization_id = $1 AND pr.client_id = $2
                  AND UPPER(pr.status) NOT IN ('DRAFT', 'SUBMITTED', 'REVERSED', 'VOID', 'VOIDED')
                  AND pr.payment_date < $3`, [orgId, customerId, fromDate]),
      queryClient.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM credit_notes WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'REVERSED') AND date < $3`, [orgId, customerId, fromDate]),
      queryClient.query(`SELECT COALESCE(SUM(amount), 0) as total FROM customer_refunds WHERE organization_id = $1 AND customer_id = $2 AND UPPER(status) NOT IN ('REVERSED', 'VOID') AND refund_date < $3`, [orgId, customerId, fromDate]),
      queryClient.query(`SELECT COALESCE(SUM(amount), 0) as total FROM ar_write_offs WHERE organization_id = $1 AND customer_id = $2 AND write_off_date < $3`, [orgId, customerId, fromDate]),
      queryClient.query(`SELECT COALESCE(SUM(caa.amount_applied), 0) as total
                FROM customer_advance_applications caa
                JOIN customer_advances ca ON ca.id = caa.advance_id AND ca.organization_id = caa.organization_id
                LEFT JOIN invoices i ON i.id = caa.invoice_id AND i.organization_id = caa.organization_id
                WHERE caa.organization_id = $1
                  AND (ca.customer_id = $2 OR i.customer_id = $2 OR i.client_id = $2)
                  AND UPPER(COALESCE(caa.status, 'POSTED')) = 'POSTED'
                  AND caa.reversed_at IS NULL
                  AND caa.applied_date < $3`, [orgId, customerId, fromDate]),
      queryClient.query(`SELECT id, invoice_number as number, issue_date as date, total_amount as amount, notes FROM invoices WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2) AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED') AND issue_date >= $3 AND issue_date <= $4`, [orgId, customerId, fromDate, toDate]),
      queryClient.query(`SELECT pr.id, pr.payment_number as number, pr.payment_date as date,
                       COALESCE(pra.allocated, pr.amount - COALESCE(pr.unallocated_amount, 0)) as amount,
                       pr.reference
                FROM payments_received pr
                LEFT JOIN (
                  SELECT payment_id, SUM(amount) as allocated
                  FROM payment_received_allocations
                  WHERE organization_id = $1
                  GROUP BY payment_id
                ) pra ON pra.payment_id = pr.id
                WHERE pr.organization_id = $1 AND pr.client_id = $2
                  AND UPPER(pr.status) NOT IN ('DRAFT', 'SUBMITTED', 'REVERSED', 'VOID', 'VOIDED')
                  AND pr.payment_date >= $3 AND pr.payment_date <= $4`, [orgId, customerId, fromDate, toDate]),
      queryClient.query(`SELECT id, credit_note_number as number, date, total_amount as amount, reason FROM credit_notes WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'REVERSED') AND date >= $3 AND date <= $4`, [orgId, customerId, fromDate, toDate]),
      queryClient.query(`SELECT id, refund_number as number, refund_date as date, amount, reference FROM customer_refunds WHERE organization_id = $1 AND customer_id = $2 AND UPPER(status) NOT IN ('REVERSED', 'VOID') AND refund_date >= $3 AND refund_date <= $4`, [orgId, customerId, fromDate, toDate]),
      queryClient.query(`SELECT id, id as number, write_off_date as date, amount, reason FROM ar_write_offs WHERE organization_id = $1 AND customer_id = $2 AND write_off_date >= $3 AND write_off_date <= $4`, [orgId, customerId, fromDate, toDate]),
      queryClient.query(`SELECT caa.id, caa.amount_applied as amount, caa.applied_date as date, caa.advance_id, i.invoice_number
                FROM customer_advance_applications caa
                JOIN customer_advances ca ON ca.id = caa.advance_id AND ca.organization_id = caa.organization_id
                LEFT JOIN invoices i ON i.id = caa.invoice_id AND i.organization_id = caa.organization_id
                WHERE caa.organization_id = $1
                  AND (ca.customer_id = $2 OR i.customer_id = $2 OR i.client_id = $2)
                  AND UPPER(COALESCE(caa.status, 'POSTED')) = 'POSTED'
                  AND caa.reversed_at IS NULL
                  AND caa.applied_date >= $3 AND caa.applied_date <= $4`, [orgId, customerId, fromDate, toDate]),
    ]);

    if (!custRes.rows.length && !clientRes.rows.length) throw new Error('Customer not found');

    const customerName =
      custRes.rows[0]?.display_name ||
      custRes.rows[0]?.legal_name ||
      clientRes.rows[0]?.name ||
      clientRes.rows[0]?.company_name ||
      'Customer';

    // Opening balance: (Invoices + Refunds) - (Payments + Credit Notes + Write-Offs + Advances Applied)
    const openingBalance =
      Number(invOpen.rows[0]?.total || 0) +
      Number(refOpen.rows[0]?.total || 0) -
      Number(payOpen.rows[0]?.total || 0) -
      Number(cnOpen.rows[0]?.total || 0) -
      Number(woOpen.rows[0]?.total || 0) -
      Number(advAppOpen.rows[0]?.total || 0);

    const rawTxns: { date: string; type: string; reference: string; debit: number; credit: number }[] = [];

    let totalInvoices = 0;
    let totalPayments = 0;
    let totalCredits = 0;
    let totalRefunds = 0;
    let totalWriteOffs = 0;
    let totalAdvancesApplied = 0;

    const toIsoDate = (d: any): string => {
      if (!d) return '';
      if (typeof d === 'string') return d.split('T')[0];
      if (d instanceof Date) return d.toISOString().split('T')[0];
      return new Date(d).toISOString().split('T')[0];
    };

    for (const inv of invoices.rows) {
      const amt = Math.round(Number(inv.amount || 0) * 100) / 100;
      totalInvoices += amt;
      rawTxns.push({
        date: toIsoDate(inv.date),
        type: 'Invoice',
        reference: inv.number || 'INV',
        debit: amt,
        credit: 0,
      });
    }

    for (const pmt of payments.rows) {
      const amt = Math.round(Number(pmt.amount || 0) * 100) / 100;
      if (amt <= 0) continue;
      totalPayments += amt;
      rawTxns.push({
        date: toIsoDate(pmt.date),
        type: 'Payment Received',
        reference: pmt.number || 'PAY',
        debit: 0,
        credit: amt,
      });
    }

    for (const cn of creditNotes.rows) {
      const amt = Math.round(Number(cn.amount || 0) * 100) / 100;
      totalCredits += amt;
      rawTxns.push({
        date: toIsoDate(cn.date),
        type: 'Credit Note',
        reference: cn.number || 'CN',
        debit: 0,
        credit: amt,
      });
    }

    for (const ref of refunds.rows) {
      const amt = Math.round(Number(ref.amount || 0) * 100) / 100;
      totalRefunds += amt;
      rawTxns.push({
        date: toIsoDate(ref.date),
        type: 'Customer Refund',
        reference: ref.number || 'REFUND',
        debit: amt,
        credit: 0,
      });
    }

    for (const wo of writeOffs.rows) {
      const amt = Math.round(Number(wo.amount || 0) * 100) / 100;
      totalWriteOffs += amt;
      rawTxns.push({
        date: toIsoDate(wo.date),
        type: 'Write-Off',
        reference: `WO-${String(wo.number).slice(0, 8)}`,
        debit: 0,
        credit: amt,
      });
    }

    for (const advApp of advanceApplications.rows) {
      const amt = Math.round(Number(advApp.amount || 0) * 100) / 100;
      totalAdvancesApplied += amt;
      rawTxns.push({
        date: toIsoDate(advApp.date),
        type: 'Advance Applied',
        reference: advApp.invoice_number ? `ADV-APP (${advApp.invoice_number})` : `ADV-APP-${String(advApp.id).slice(0, 8)}`,
        debit: 0,
        credit: amt,
      });
    }

    rawTxns.sort((a, b) => a.date.localeCompare(b.date));

    let running = openingBalance;
    const transactions: StatementLine[] = [];

    for (const tx of rawTxns) {
      running += tx.debit - tx.credit;
      transactions.push({
        ...tx,
        runningBalance: Math.round(running * 100) / 100,
      });
    }

    const closingBalance = Math.round(running * 100) / 100;

    return {
      customerId,
      customerName,
      fromDate,
      toDate,
      openingBalance: Math.round(openingBalance * 100) / 100,
      totalInvoices: Math.round(totalInvoices * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      totalCredits: Math.round(totalCredits * 100) / 100,
      totalRefunds: Math.round(totalRefunds * 100) / 100,
      totalWriteOffs: Math.round(totalWriteOffs * 100) / 100,
      totalAdvancesApplied: Math.round(totalAdvancesApplied * 100) / 100,
      closingBalance,
      transactions,
    };
  }
}
