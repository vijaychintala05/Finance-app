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
    const custRes = await db.query(
      `SELECT id, display_name, legal_name FROM customers WHERE organization_id = $1 AND (id = $2 OR customer_id = $2)`,
      [orgId, customerId]
    );
    const clientRes = await db.query(
      `SELECT id, name, company_name FROM clients WHERE organization_id = $1 AND id = $2`,
      [orgId, customerId]
    );

    const customerName =
      custRes.rows[0]?.display_name ||
      custRes.rows[0]?.legal_name ||
      clientRes.rows[0]?.name ||
      clientRes.rows[0]?.company_name ||
      'Customer';

    // 1. Opening balance before fromDate
    const invOpen = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2) AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND issue_date < $3`,
      [orgId, customerId, fromDate]
    );
    const payOpen = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments_received WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) <> 'REVERSED' AND payment_date < $3`,
      [orgId, customerId, fromDate]
    );

    const openingBalance =
      Number(invOpen.rows[0]?.total || 0) -
      Number(payOpen.rows[0]?.total || 0);

    // 2. In-range transactions
    const invoices = await db.query(
      `SELECT id, invoice_number as number, issue_date as date, total_amount as amount, notes FROM invoices WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2) AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT') AND issue_date >= $3 AND issue_date <= $4`,
      [orgId, customerId, fromDate, toDate]
    );

    const payments = await db.query(
      `SELECT id, payment_number as number, payment_date as date, amount, reference FROM payments_received WHERE organization_id = $1 AND client_id = $2 AND UPPER(status) <> 'REVERSED' AND payment_date >= $3 AND payment_date <= $4`,
      [orgId, customerId, fromDate, toDate]
    );

    const rawTxns: { date: string; type: string; reference: string; debit: number; credit: number }[] = [];

    let totalInvoices = 0;
    let totalPayments = 0;
    let totalCredits = 0;

    for (const inv of invoices.rows) {
      const amt = Math.round(Number(inv.amount || 0) * 100) / 100;
      totalInvoices += amt;
      rawTxns.push({
        date: inv.date,
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
        date: pmt.date,
        type: 'Payment Received',
        reference: pmt.number || 'PAY',
        debit: 0,
        credit: amt,
      });
    }

    rawTxns.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

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
      closingBalance,
      transactions,
    };
  }
}
