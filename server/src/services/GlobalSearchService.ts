import { db } from '../database/db';

export interface SearchResultItem {
  id: string;
  category: 'Invoice' | 'Quotation' | 'Sales Order' | 'Customer' | 'Vendor' | 'Vendor Bill' | 'Purchase Order' | 'Payment Received' | 'Payment Made' | 'Bank Transaction';
  title: string;
  subtitle: string;
  status?: string;
  amount?: number;
  date?: string;
  linkRoute: string;
}

export class GlobalSearchService {
  public static async search(
    organizationId: string,
    queryStr: string,
    permissions?: string[]
  ): Promise<SearchResultItem[]> {
    if (!queryStr || queryStr.trim().length < 2) return [];

    const q = `%${queryStr.trim().toLowerCase()}%`;
    const numQ = Number(queryStr.replace(/[^0-9.]/g, '')) || -999999;

    const hasSalesPerm =
      !permissions ||
      permissions.includes('invoices.view') ||
      permissions.includes('invoice.view') ||
      permissions.includes('invoices.create') ||
      permissions.includes('invoice.create') ||
      permissions.includes('admin') ||
      permissions.includes('*');

    const hasPurchasesPerm =
      !permissions ||
      permissions.includes('purchases.view') ||
      permissions.includes('bill.view') ||
      permissions.includes('purchases.create') ||
      permissions.includes('bill.create') ||
      permissions.includes('admin') ||
      permissions.includes('*');

    const hasBankPerm =
      !permissions ||
      permissions.includes('banking.view') ||
      permissions.includes('banking.reconcile') ||
      permissions.includes('bank.reconcile') ||
      permissions.includes('admin') ||
      permissions.includes('*');

    const [
      invRes,
      estRes,
      soRes,
      custRes,
      vendRes,
      billRes,
      poRes,
      payRecRes,
      payMadeRes,
      bankTxRes,
    ] = await Promise.all([
      hasSalesPerm
        ? db.query(
            `SELECT id, invoice_number, client_name, total_amount, status, issue_date FROM invoices
             WHERE organization_id = $1 AND (LOWER(invoice_number) LIKE $2 OR LOWER(client_name) LIKE $2 OR total_amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasSalesPerm
        ? db.query(
            `SELECT id, estimate_number, client_name, total_amount, status, issue_date FROM estimates
             WHERE organization_id = $1 AND (LOWER(estimate_number) LIKE $2 OR LOWER(client_name) LIKE $2 OR total_amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasSalesPerm
        ? db.query(
            `SELECT id, sales_order_number, customer_name, total_amount, status, order_date FROM sales_orders
             WHERE organization_id = $1 AND (LOWER(sales_order_number) LIKE $2 OR LOWER(customer_name) LIKE $2 OR total_amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasSalesPerm
        ? db.query(
            `SELECT id, display_name, legal_name, email, gstin, phone FROM customers
             WHERE organization_id = $1 AND (LOWER(display_name) LIKE $2 OR LOWER(legal_name) LIKE $2 OR LOWER(email) LIKE $2 OR LOWER(gstin) LIKE $2 OR LOWER(phone) LIKE $2) LIMIT 10`,
            [organizationId, q]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasPurchasesPerm
        ? db.query(
            `SELECT id, name, company_name, email, phone FROM vendors
             WHERE organization_id = $1 AND (LOWER(name) LIKE $2 OR LOWER(company_name) LIKE $2 OR LOWER(email) LIKE $2 OR LOWER(phone) LIKE $2) LIMIT 10`,
            [organizationId, q]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasPurchasesPerm
        ? db.query(
            `SELECT id, bill_number, vendor_name, total_amount, status, bill_date FROM bills
             WHERE organization_id = $1 AND (LOWER(bill_number) LIKE $2 OR LOWER(vendor_name) LIKE $2 OR total_amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasPurchasesPerm
        ? db.query(
            `SELECT id, purchase_order_number as po_number, vendor_name, total_amount, status, order_date as po_date FROM purchase_orders
             WHERE organization_id = $1 AND (LOWER(purchase_order_number) LIKE $2 OR LOWER(vendor_name) LIKE $2 OR total_amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasSalesPerm
        ? db.query(
            `SELECT id, payment_number, client_name, amount, payment_mode, reference, payment_date FROM payments_received
             WHERE organization_id = $1 AND (LOWER(payment_number) LIKE $2 OR LOWER(client_name) LIKE $2 OR LOWER(reference) LIKE $2 OR amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasPurchasesPerm
        ? db.query(
            `SELECT id, payment_number, vendor_name, amount, payment_mode, reference, payment_date FROM payments_made
             WHERE organization_id = $1 AND (LOWER(payment_number) LIKE $2 OR LOWER(vendor_name) LIKE $2 OR LOWER(reference) LIKE $2 OR amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
      hasBankPerm
        ? db.query(
            `SELECT id, narration, reference, amount, direction, reconciliation_status, transaction_date FROM bank_statement_transactions
             WHERE organization_id = $1 AND (LOWER(narration) LIKE $2 OR LOWER(reference) LIKE $2 OR amount = $3) LIMIT 10`,
            [organizationId, q, numQ]
          )
        : Promise.resolve({ rows: [], rowCount: 0 }),
    ]);

    const results: SearchResultItem[] = [];

    for (const r of invRes.rows) {
      results.push({
        id: r.id,
        category: 'Invoice',
        title: r.invoice_number,
        subtitle: `${r.client_name} • ₹${Number(r.total_amount).toLocaleString('en-IN')}`,
        status: r.status,
        amount: Number(r.total_amount),
        date: r.issue_date,
        linkRoute: `/sales/invoices?id=${r.id}`,
      });
    }

    for (const r of estRes.rows) {
      results.push({
        id: r.id,
        category: 'Quotation',
        title: r.estimate_number,
        subtitle: `${r.client_name} • ₹${Number(r.total_amount).toLocaleString('en-IN')}`,
        status: r.status,
        amount: Number(r.total_amount),
        date: r.issue_date,
        linkRoute: `/sales/estimates?id=${r.id}`,
      });
    }

    for (const r of soRes.rows) {
      results.push({
        id: r.id,
        category: 'Sales Order',
        title: r.sales_order_number,
        subtitle: `${r.customer_name} • ₹${Number(r.total_amount).toLocaleString('en-IN')}`,
        status: r.status,
        amount: Number(r.total_amount),
        date: r.order_date,
        linkRoute: `/sales/orders?id=${r.id}`,
      });
    }

    for (const r of custRes.rows) {
      results.push({
        id: r.id,
        category: 'Customer',
        title: r.display_name,
        subtitle: `${r.email || r.phone || 'Customer Record'}${r.gstin ? ' • GSTIN: ' + r.gstin : ''}`,
        linkRoute: `/clients?id=${r.id}`,
      });
    }

    for (const r of vendRes.rows) {
      results.push({
        id: r.id,
        category: 'Vendor',
        title: r.name || r.company_name || 'Vendor',
        subtitle: `${r.email || r.phone || 'Vendor Record'}`,
        linkRoute: `/purchases/vendors?id=${r.id}`,
      });
    }

    for (const r of billRes.rows) {
      results.push({
        id: r.id,
        category: 'Vendor Bill',
        title: r.bill_number || r.vendor_invoice_number || 'Bill',
        subtitle: `${r.vendor_name} • ₹${Number(r.total_amount).toLocaleString('en-IN')}`,
        status: r.status,
        amount: Number(r.total_amount),
        date: r.bill_date,
        linkRoute: `/purchases/bills?id=${r.id}`,
      });
    }

    for (const r of poRes.rows) {
      results.push({
        id: r.id,
        category: 'Purchase Order',
        title: r.po_number,
        subtitle: `${r.vendor_name} • ₹${Number(r.total_amount).toLocaleString('en-IN')}`,
        status: r.status,
        amount: Number(r.total_amount),
        date: r.po_date,
        linkRoute: `/purchases/orders?id=${r.id}`,
      });
    }

    for (const r of payRecRes.rows) {
      results.push({
        id: r.id,
        category: 'Payment Received',
        title: r.payment_number || 'Customer Payment',
        subtitle: `${r.client_name || r.customer_name || 'Customer'} • ₹${Number(r.amount).toLocaleString('en-IN')} (${r.payment_mode || 'Cash'})`,
        amount: Number(r.amount),
        date: r.payment_date,
        linkRoute: `/sales/payments?id=${r.id}`,
      });
    }

    for (const r of payMadeRes.rows) {
      results.push({
        id: r.id,
        category: 'Payment Made',
        title: r.payment_number || 'Vendor Payment',
        subtitle: `${r.vendor_name} • ₹${Number(r.amount).toLocaleString('en-IN')} (${r.payment_mode || 'Cash'})`,
        amount: Number(r.amount),
        date: r.payment_date,
        linkRoute: `/purchases/payments?id=${r.id}`,
      });
    }

    for (const r of bankTxRes.rows) {
      results.push({
        id: r.id,
        category: 'Bank Transaction',
        title: r.narration,
        subtitle: `Ref: ${r.reference || 'N/A'} • ₹${Number(r.amount).toLocaleString('en-IN')} (${r.direction})`,
        status: r.reconciliation_status,
        amount: Number(r.amount),
        date: r.transaction_date,
        linkRoute: `/banking/reconciliation?tx=${r.id}`,
      });
    }

    return results;
  }
}
