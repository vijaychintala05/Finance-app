import { db } from '../database/db';

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
  closingBalance: number;
  transactions: StatementLine[];
}

export class CustomerStatementService {
  public static async getCustomerStatement(
    orgId: string,
    customerId: string,
    fromDate: string,
    toDate: string
  ): Promise<CustomerStatementResponse> {
    const [
      custRes,
      clientRes,
      invOpen,
      payOpen,
      cnOpen,
      refOpen,
      woOpen,
      invoices,
      payments,
      creditNotes,
      refunds,
      writeOffs,
    ] = await Promise.all([
      db.query(`SELECT id, display_name, legal_name FROM customers WHERE organization_id = $1 AND (id = $2 OR customer_id = $2)`, [orgId, customerId]),
      db.query(`SELECT id, name, company_name FROM clients WHERE organization_id = $1 AND id = $2`, [orgId, customerId]),
      db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2) AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED') AND issue_date < $3`, [orgId, customerId, fromDate]),
      db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments_received WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) NOT IN ('DRAFT', 'SUBMITTED', 'REVERSED', 'VOID', 'VOIDED') AND payment_date < $3`, [orgId, customerId, fromDate]),
      db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM credit_notes WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'REVERSED') AND date < $3`, [orgId, customerId, fromDate]),
      db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM customer_refunds WHERE organization_id = $1 AND customer_id = $2 AND UPPER(status) NOT IN ('REVERSED', 'VOID') AND refund_date < $3`, [orgId, customerId, fromDate]),
      db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM ar_write_offs WHERE organization_id = $1 AND customer_id = $2 AND write_off_date < $3`, [orgId, customerId, fromDate]),
      db.query(`SELECT id, invoice_number as number, issue_date as date, total_amount as amount, notes FROM invoices WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2) AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED') AND issue_date >= $3 AND issue_date <= $4`, [orgId, customerId, fromDate, toDate]),
      db.query(`SELECT id, payment_number as number, payment_date as date, amount, reference FROM payments_received WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) NOT IN ('DRAFT', 'SUBMITTED', 'REVERSED', 'VOID', 'VOIDED') AND payment_date >= $3 AND payment_date <= $4`, [orgId, customerId, fromDate, toDate]),
      db.query(`SELECT id, credit_note_number as number, date, total_amount as amount, reason FROM credit_notes WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'REVERSED') AND date >= $3 AND date <= $4`, [orgId, customerId, fromDate, toDate]),
      db.query(`SELECT id, refund_number as number, refund_date as date, amount, reference FROM customer_refunds WHERE organization_id = $1 AND customer_id = $2 AND UPPER(status) NOT IN ('REVERSED', 'VOID') AND refund_date >= $3 AND refund_date <= $4`, [orgId, customerId, fromDate, toDate]),
      db.query(`SELECT id, id as number, write_off_date as date, amount, reason FROM ar_write_offs WHERE organization_id = $1 AND customer_id = $2 AND write_off_date >= $3 AND write_off_date <= $4`, [orgId, customerId, fromDate, toDate]),
    ]);

    const customerName =
      custRes.rows[0]?.display_name ||
      custRes.rows[0]?.legal_name ||
      clientRes.rows[0]?.name ||
      clientRes.rows[0]?.company_name ||
      'Customer';

    // Opening balance: (Invoices + Refunds) - (Payments + Credit Notes + Write-Offs)
    const openingBalance =
      Number(invOpen.rows[0]?.total || 0) +
      Number(refOpen.rows[0]?.total || 0) -
      Number(payOpen.rows[0]?.total || 0) -
      Number(cnOpen.rows[0]?.total || 0) -
      Number(woOpen.rows[0]?.total || 0);

    const rawTxns: { date: string; type: string; reference: string; debit: number; credit: number }[] = [];

    let totalInvoices = 0;
    let totalPayments = 0;
    let totalCredits = 0;
    let totalRefunds = 0;
    let totalWriteOffs = 0;

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
      closingBalance,
      transactions,
    };
  }
}
