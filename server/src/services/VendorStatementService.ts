import { db } from '../database/db';
import { StatementLine } from './CustomerStatementService';

export interface VendorStatementResponse {
  vendorId: string;
  vendorName: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalBills: number;
  totalPayments: number;
  totalDebits: number;
  closingBalance: number;
  transactions: StatementLine[];
}

export class VendorStatementService {
  public static async getVendorStatement(
    orgId: string,
    vendorId: string,
    fromDate: string,
    toDate: string
  ): Promise<VendorStatementResponse> {
    const [vRes, billsOpen, payOpen, vcOpen, bills, pays, vcs] = await Promise.all([
      db.query(`SELECT id, name, company_name FROM vendors WHERE organization_id = $1 AND (id = $2 OR vendor_id = $2)`, [orgId, vendorId]),
      db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM bills WHERE organization_id = $1 AND vendor_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED') AND bill_date < $3`, [orgId, vendorId, fromDate]),
      db.query(`SELECT COALESCE(SUM(amount), 0) as total FROM payments_made WHERE organization_id = $1 AND vendor_id = $2 AND UPPER(status) NOT IN ('DRAFT', 'SUBMITTED', 'REVERSED', 'VOID', 'VOIDED') AND payment_date < $3`, [orgId, vendorId, fromDate]),
      db.query(`SELECT COALESCE(SUM(total_amount), 0) as total FROM vendor_credits WHERE organization_id = $1 AND vendor_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'REVERSED') AND date < $3`, [orgId, vendorId, fromDate]),
      db.query(`SELECT id, bill_number, bill_date as date, total_amount as amount, notes FROM bills WHERE organization_id = $1 AND vendor_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED') AND bill_date >= $3 AND bill_date <= $4`, [orgId, vendorId, fromDate, toDate]),
      db.query(`SELECT id, payment_number, payment_date as date, amount, reference FROM payments_made WHERE organization_id = $1 AND vendor_id = $2 AND UPPER(status) NOT IN ('DRAFT', 'SUBMITTED', 'REVERSED', 'VOID', 'VOIDED') AND payment_date >= $3 AND payment_date <= $4`, [orgId, vendorId, fromDate, toDate]),
      db.query(`SELECT id, credit_number, date, total_amount as amount, reason FROM vendor_credits WHERE organization_id = $1 AND vendor_id = $2 AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT', 'SUBMITTED', 'REVERSED') AND date >= $3 AND date <= $4`, [orgId, vendorId, fromDate, toDate]),
    ]);

    const vendorName = vRes.rows[0]?.name || vRes.rows[0]?.company_name || 'Vendor';

    const openingBalance =
      Number(billsOpen.rows[0]?.total || 0) -
      Number(payOpen.rows[0]?.total || 0) -
      Number(vcOpen.rows[0]?.total || 0);

    let rawTxns: any[] = [];
    for (const r of bills.rows) {
      rawTxns.push({
        date: typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0],
        transactionType: 'Vendor Bill',
        transactionNumber: r.bill_number,
        description: r.notes || 'Vendor Bill',
        debit: 0,
        credit: Number(r.amount), // Payable increases with credit
      });
    }
    for (const r of pays.rows) {
      rawTxns.push({
        date: typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0],
        transactionType: 'Payment Made',
        transactionNumber: r.payment_number,
        description: r.reference ? `Ref: ${r.reference}` : 'Vendor Payment',
        debit: Number(r.amount), // Payable decreases with debit
        credit: 0,
      });
    }
    for (const r of vcs.rows) {
      rawTxns.push({
        date: typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0],
        transactionType: 'Debit Note / Credit',
        transactionNumber: r.credit_number,
        description: r.reason || 'Vendor Credit / Debit Note',
        debit: Number(r.amount),
        credit: 0,
      });
    }

    rawTxns.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    let currentBal = openingBalance;
    let totalBills = 0;
    let totalPayments = 0;
    let totalDebits = 0;

    const transactions: StatementLine[] = rawTxns.map((t) => {
      totalBills += t.credit;
      totalPayments += t.transactionType === 'Payment Made' ? t.debit : 0;
      totalDebits += t.transactionType === 'Debit Note / Credit' ? t.debit : 0;
      currentBal = currentBal + t.credit - t.debit;

      return {
        date: t.date,
        type: t.transactionType,
        reference: t.transactionNumber || t.description || 'REF',
        debit: Math.round(t.debit * 100) / 100,
        credit: Math.round(t.credit * 100) / 100,
        runningBalance: Math.round(currentBal * 100) / 100,
      };
    });

    return {
      vendorId,
      vendorName,
      fromDate,
      toDate,
      openingBalance: Math.round(openingBalance * 100) / 100,
      totalBills: Math.round(totalBills * 100) / 100,
      totalPayments: Math.round(totalPayments * 100) / 100,
      totalDebits: Math.round(totalDebits * 100) / 100,
      closingBalance: Math.round(currentBal * 100) / 100,
      transactions,
    };
  }
}
