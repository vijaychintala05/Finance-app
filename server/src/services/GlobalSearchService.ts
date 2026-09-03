import { db } from '../database/db';

export interface SearchResultItem {
  id: string;
  category:
    | 'Invoice'
    | 'Quotation'
    | 'Sales Order'
    | 'Customer'
    | 'Vendor'
    | 'Vendor Bill'
    | 'Purchase Order'
    | 'Payment Received'
    | 'Payment Made'
    | 'Bank Transaction'
    | 'Account'
    | 'Credit Note'
    | 'Vendor Credit';
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
    const sanitized = (queryStr || '').trim().slice(0, 100);
    if (!sanitized || sanitized.length < 2) return [];

    const q = `%${sanitized.toLowerCase()}%`;
    const numQ = Number(sanitized.replace(/[^0-9.]/g, '')) || -999999;

    // Strict VIEW permission gating
    const hasSalesPerm =
      !permissions ||
      permissions.includes('invoices.view') ||
      permissions.includes('invoice.view') ||
      permissions.includes('admin') ||
      permissions.includes('Super Admin') ||
      permissions.includes('Owner') ||
      permissions.includes('*');

    const hasPurchasesPerm =
      !permissions ||
      permissions.includes('purchases.view') ||
      permissions.includes('bill.view') ||
      permissions.includes('admin') ||
      permissions.includes('Super Admin') ||
      permissions.includes('Owner') ||
      permissions.includes('*');

    const hasBankPerm =
      !permissions ||
      permissions.includes('banking.view') ||
      permissions.includes('banking.reconcile') ||
      permissions.includes('bank.reconcile') ||
      permissions.includes('admin') ||
      permissions.includes('Super Admin') ||
      permissions.includes('Owner') ||
      permissions.includes('*');

    const hasAccountingPerm =
      !permissions ||
      permissions.includes('reports.view') ||
      permissions.includes('accounting.post') ||
      permissions.includes('settings.manage_taxes') ||
      permissions.includes('admin') ||
      permissions.includes('Super Admin') ||
      permissions.includes('Owner') ||
      permissions.includes('*');

    type SearchProjection = {
      title: string;
      party?: string;
      amount?: string;
      status?: string;
      date?: string;
      detailOne?: string;
      detailTwo?: string;
      detailThree?: string;
      accountType?: string;
      accountSubType?: string;
    };
    const noText = 'CAST(NULL AS TEXT)';
    const noNumber = 'CAST(NULL AS NUMERIC)';
    const noDate = 'CAST(NULL AS DATE)';
    const clause = (kind: string, table: string, match: string, projection: SearchProjection) => `
      SELECT '${kind}' AS result_kind, id,
        ${projection.title} AS title,
        ${projection.party || noText} AS party_name,
        ${projection.amount || noNumber} AS amount,
        ${projection.status || noText} AS status,
        ${projection.date || noDate} AS document_date,
        ${projection.detailOne || noText} AS detail_one,
        ${projection.detailTwo || noText} AS detail_two,
        ${projection.detailThree || noText} AS detail_three,
        ${projection.accountType || noText} AS account_type,
        ${projection.accountSubType || noText} AS account_sub_type
      FROM ${table}
      WHERE organization_id = $1 AND (${match})
      LIMIT 10`;
    const clauses = [
      ...(hasSalesPerm ? [
        clause('invoice', 'invoices', 'LOWER(invoice_number) LIKE $2 OR LOWER(client_name) LIKE $2 OR total_amount = $3', { title: 'invoice_number', party: 'client_name', amount: 'total_amount', status: 'status', date: 'issue_date' }),
        clause('estimate', 'estimates', 'LOWER(estimate_number) LIKE $2 OR LOWER(client_name) LIKE $2 OR total_amount = $3', { title: 'estimate_number', party: 'client_name', amount: 'total_amount', status: 'status', date: 'issue_date' }),
        clause('sales-order', 'sales_orders', 'LOWER(sales_order_number) LIKE $2 OR LOWER(customer_name) LIKE $2 OR total_amount = $3', { title: 'sales_order_number', party: 'customer_name', amount: 'total_amount', status: 'status', date: 'order_date' }),
        clause('customer', 'customers', 'LOWER(display_name) LIKE $2 OR LOWER(legal_name) LIKE $2 OR LOWER(email) LIKE $2 OR LOWER(gstin) LIKE $2 OR LOWER(phone) LIKE $2', { title: 'display_name', detailOne: 'email', detailTwo: 'phone', detailThree: 'gstin' }),
        clause('payment-received', 'payments_received', 'LOWER(payment_number) LIKE $2 OR LOWER(client_name) LIKE $2 OR LOWER(reference) LIKE $2 OR amount = $3', { title: 'payment_number', party: 'client_name', amount: 'amount', detailOne: 'payment_mode', detailTwo: 'reference', date: 'payment_date' }),
        clause('credit-note', 'credit_notes', 'LOWER(credit_note_number) LIKE $2 OR LOWER(client_name) LIKE $2 OR total_amount = $3', { title: 'credit_note_number', party: 'client_name', amount: 'total_amount', status: 'status', date: 'date' }),
      ] : []),
      ...(hasPurchasesPerm ? [
        clause('vendor', 'vendors', "LOWER(name) LIKE $2 OR LOWER(company_name) LIKE $2 OR LOWER(email) LIKE $2 OR LOWER(phone) LIKE $2 OR LOWER(COALESCE(tax_id, '')) LIKE $2", { title: 'name', detailOne: 'company_name', detailTwo: 'email', detailThree: 'tax_id' }),
        clause('bill', 'bills', 'LOWER(bill_number) LIKE $2 OR LOWER(vendor_name) LIKE $2 OR total_amount = $3', { title: 'bill_number', party: 'vendor_name', amount: 'total_amount', status: 'status', date: 'bill_date' }),
        clause('purchase-order', 'purchase_orders', 'LOWER(purchase_order_number) LIKE $2 OR LOWER(vendor_name) LIKE $2 OR total_amount = $3', { title: 'purchase_order_number', party: 'vendor_name', amount: 'total_amount', status: 'status', date: 'order_date' }),
        clause('payment-made', 'payments_made', 'LOWER(payment_number) LIKE $2 OR LOWER(vendor_name) LIKE $2 OR LOWER(reference) LIKE $2 OR amount = $3', { title: 'payment_number', party: 'vendor_name', amount: 'amount', detailOne: 'payment_mode', detailTwo: 'reference', date: 'payment_date' }),
        clause('vendor-credit', 'vendor_credits', 'LOWER(credit_number) LIKE $2 OR LOWER(vendor_name) LIKE $2 OR total_amount = $3', { title: 'credit_number', party: 'vendor_name', amount: 'total_amount', status: 'status', date: 'date' }),
      ] : []),
      ...(hasBankPerm ? [clause('bank-transaction', 'bank_statement_transactions', 'LOWER(narration) LIKE $2 OR LOWER(reference) LIKE $2 OR amount = $3', { title: 'narration', amount: 'amount', detailOne: 'reference', detailTwo: 'direction', detailThree: 'reconciliation_status', date: 'transaction_date' })] : []),
      ...(hasAccountingPerm ? [clause('account', 'accounts', 'LOWER(code) LIKE $2 OR LOWER(name) LIKE $2', { title: 'code', party: 'name', accountType: 'type', accountSubType: 'sub_type' })] : []),
    ];
    const searchRows = clauses.length > 0
      ? (await db.query(clauses.join(' UNION ALL '), [organizationId, q, numQ])).rows
      : [];
    const rowsFor = (kind: string) => searchRows.filter((row: any) => row.result_kind === kind);
    const invRes = { rows: rowsFor('invoice').map((row: any) => ({ ...row, invoice_number: row.title, client_name: row.party_name, total_amount: row.amount, issue_date: row.document_date })) };
    const estRes = { rows: rowsFor('estimate').map((row: any) => ({ ...row, estimate_number: row.title, client_name: row.party_name, total_amount: row.amount, issue_date: row.document_date })) };
    const soRes = { rows: rowsFor('sales-order').map((row: any) => ({ ...row, sales_order_number: row.title, customer_name: row.party_name, total_amount: row.amount, order_date: row.document_date })) };
    const custRes = { rows: rowsFor('customer').map((row: any) => ({ ...row, display_name: row.title, email: row.detail_one, phone: row.detail_two, gstin: row.detail_three })) };
    const vendRes = { rows: rowsFor('vendor').map((row: any) => ({ ...row, name: row.title, company_name: row.detail_one, email: row.detail_two, tax_id: row.detail_three })) };
    const billRes = { rows: rowsFor('bill').map((row: any) => ({ ...row, bill_number: row.title, vendor_name: row.party_name, total_amount: row.amount, bill_date: row.document_date })) };
    const poRes = { rows: rowsFor('purchase-order').map((row: any) => ({ ...row, po_number: row.title, vendor_name: row.party_name, total_amount: row.amount, po_date: row.document_date })) };
    const payRecRes = { rows: rowsFor('payment-received').map((row: any) => ({ ...row, payment_number: row.title, client_name: row.party_name, payment_mode: row.detail_one, reference: row.detail_two, payment_date: row.document_date })) };
    const payMadeRes = { rows: rowsFor('payment-made').map((row: any) => ({ ...row, payment_number: row.title, vendor_name: row.party_name, payment_mode: row.detail_one, reference: row.detail_two, payment_date: row.document_date })) };
    const bankTxRes = { rows: rowsFor('bank-transaction').map((row: any) => ({ ...row, narration: row.title, reference: row.detail_one, direction: row.detail_two, reconciliation_status: row.detail_three, transaction_date: row.document_date })) };
    const accRes = { rows: rowsFor('account').map((row: any) => ({ ...row, code: row.title, name: row.party_name, type: row.account_type, sub_type: row.account_sub_type })) };
    const cnRes = { rows: rowsFor('credit-note').map((row: any) => ({ ...row, credit_note_number: row.title, client_name: row.party_name, total_amount: row.amount, date: row.document_date })) };
    const vcRes = { rows: rowsFor('vendor-credit').map((row: any) => ({ ...row, credit_number: row.title, vendor_name: row.party_name, total_amount: row.amount, date: row.document_date })) };

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
        subtitle: `${r.email || r.phone || 'Vendor Record'}${r.tax_id ? ' • Tax ID: ' + r.tax_id : ''}`,
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
        subtitle: `${r.client_name || 'Customer'} • ₹${Number(r.amount).toLocaleString('en-IN')} (${r.payment_mode || 'Cash'})`,
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
        subtitle: `${r.vendor_name || 'Vendor'} • ₹${Number(r.amount).toLocaleString('en-IN')} (${r.payment_mode || 'Cash'})`,
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

    for (const r of accRes.rows) {
      results.push({
        id: r.id,
        category: 'Account',
        title: `${r.code} - ${r.name}`,
        subtitle: `${r.type}${r.sub_type ? ' • ' + r.sub_type : ''}`,
        linkRoute: `/accounting/coa?id=${r.id}`,
      });
    }

    for (const r of cnRes.rows) {
      results.push({
        id: r.id,
        category: 'Credit Note',
        title: r.credit_note_number,
        subtitle: `${r.client_name} • ₹${Number(r.total_amount).toLocaleString('en-IN')}`,
        status: r.status,
        amount: Number(r.total_amount),
        date: r.date,
        linkRoute: `/sales/credit_notes?id=${r.id}`,
      });
    }

    for (const r of vcRes.rows) {
      results.push({
        id: r.id,
        category: 'Vendor Credit',
        title: r.credit_number,
        subtitle: `${r.vendor_name} • ₹${Number(r.total_amount).toLocaleString('en-IN')}`,
        status: r.status,
        amount: Number(r.total_amount),
        date: r.date,
        linkRoute: `/purchases/vendor_credits?id=${r.id}`,
      });
    }

    return results;
  }
}
