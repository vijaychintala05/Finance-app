import crypto from 'crypto';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { CustomerStatementService, CustomerStatementResponse } from './CustomerStatementService';
import { databaseMoney } from '../utils/money';
import { SalesEngine } from '../sales/SalesEngine';

export interface CustomerPortalInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  balanceDue: number;
  status: string;
}

export interface CustomerPortalPayment {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  reference: string | null;
}

export interface CustomerPortalContext {
  organization: {
    id: string;
    name: string;
    email?: string;
    currency: string;
  };
  customer: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  summary: {
    totalOutstanding: number;
    openInvoicesCount: number;
    overdueCount: number;
  };
  invoices: CustomerPortalInvoice[];
  recentPayments: CustomerPortalPayment[];
}

export class CustomerPortalService {
  /**
   * Generates or retrieves a secure customer portal access token.
   */
  public static hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generates or retrieves a secure customer portal access token.
   */
  public static async generatePortalToken(
    orgId: string,
    customerId: string,
    expiresInDays: number = 30
  ): Promise<{ token: string; expiresAt: string }> {
    if (!orgId || !customerId) {
      throw new Error('Organization ID and Customer ID are required');
    }

    const custRes = await db.query(
      `SELECT id, display_name as name, display_name FROM customers WHERE organization_id = $1 AND (id = $2 OR customer_id = $2)
       UNION
       SELECT id, name, company_name as display_name FROM clients WHERE organization_id = $1 AND id = $2`,
      [orgId, customerId]
    );

    if (custRes.rows.length === 0) {
      throw new Error('Customer does not exist in this organization');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = CustomerPortalService.hashToken(rawToken);
    const id = newId('cpt');
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const tokenPlaceholder = `cpt_${tokenHash.slice(0, 32)}_${id}`;

    try {
      await db.query(
        `INSERT INTO customer_portal_tokens (id, organization_id, customer_id, token, token_hash, is_active, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6, CURRENT_TIMESTAMP)`,
        [id, orgId, customerId, tokenPlaceholder, tokenHash, expiresAt]
      );
    } catch {
      await db.query(
        `INSERT INTO customer_portal_tokens (id, organization_id, customer_id, token, is_active, expires_at, created_at)
         VALUES ($1, $2, $3, $4, TRUE, $5, CURRENT_TIMESTAMP)`,
        [id, orgId, customerId, tokenHash, expiresAt]
      );
    }

    return { token: rawToken, expiresAt };
  }

  /**
   * Retrieves public customer portal data using access token.
   */
  public static async getPortalContext(token: string): Promise<CustomerPortalContext> {
    if (!token || typeof token !== 'string') {
      throw new Error('Valid portal access token is required');
    }

    const tokenHash = CustomerPortalService.hashToken(token);
    let tokenRes;
    try {
      tokenRes = await db.query(
        `SELECT organization_id, customer_id, expires_at, is_active
         FROM customer_portal_tokens
         WHERE (token_hash = $1 OR token = $1 OR token = $2) AND is_active = TRUE`,
        [tokenHash, token]
      );
    } catch {
      tokenRes = await db.query(
        `SELECT organization_id, customer_id, expires_at, is_active
         FROM customer_portal_tokens
         WHERE (token = $1 OR token = $2) AND is_active = TRUE`,
        [tokenHash, token]
      );
    }

    if (tokenRes.rows.length === 0) {
      throw new Error('Invalid or expired portal token');
    }

    const { organization_id: orgId, customer_id: customerId, expires_at: expiresAt } = tokenRes.rows[0];

    if (expiresAt && new Date(expiresAt) < new Date()) {
      throw new Error('Portal access token has expired');
    }

    // 1. Fetch organization details
    const orgRes = await db.query(
      `SELECT id, name, base_currency FROM organizations WHERE id = $1`,
      [orgId]
    );
    const org = orgRes.rows[0] || { id: orgId, name: 'Organization', base_currency: 'USD' };

    // 2. Fetch customer profile
    const custRes = await db.query(
      `SELECT id, display_name as name, email, phone FROM customers WHERE organization_id = $1 AND (id = $2 OR customer_id = $2)
       UNION
       SELECT id, name, email, phone FROM clients WHERE organization_id = $1 AND id = $2`,
      [orgId, customerId]
    );
    const customer = custRes.rows[0] || { id: customerId, name: 'Customer' };

    // 3. Fetch Invoices
    const invRes = await db.query(
      `SELECT id, invoice_number, issue_date, due_date, total_amount, balance_due, status
       FROM invoices
       WHERE organization_id = $1 AND (customer_id = $2 OR client_id = $2)
         AND UPPER(status) NOT IN ('VOID', 'VOIDED', 'DRAFT')
       ORDER BY issue_date DESC
       LIMIT 50`,
      [orgId, customerId]
    );

    const todayIso = new Date().toISOString().split('T')[0];
    let totalOutstanding = 0;
    let openCount = 0;
    let overdueCount = 0;

    const invoices: CustomerPortalInvoice[] = invRes.rows.map((row: any) => {
      const balance = databaseMoney(row.balance_due, 'Portal invoice balance');
      const total = databaseMoney(row.total_amount, 'Portal invoice total');
      const isDue = balance > 0;
      const dueDate = row.due_date ? String(row.due_date).split('T')[0] : '';

      if (isDue) {
        totalOutstanding += balance;
        openCount++;
        if (dueDate && dueDate < todayIso) {
          overdueCount++;
        }
      }

      return {
        id: row.id,
        invoiceNumber: row.invoice_number,
        issueDate: row.issue_date ? String(row.issue_date).split('T')[0] : '',
        dueDate,
        totalAmount: total,
        balanceDue: balance,
        status: row.status,
      };
    });

    // 4. Fetch Recent Payments Received
    const payRes = await db.query(
      `SELECT id, payment_number, payment_date, amount, reference
       FROM payments_received
       WHERE organization_id = $1 AND client_id = $2
         AND UPPER(status) NOT IN ('DRAFT', 'SUBMITTED', 'REVERSED', 'VOID', 'VOIDED')
       ORDER BY payment_date DESC
       LIMIT 10`,
      [orgId, customerId]
    );

    const recentPayments: CustomerPortalPayment[] = payRes.rows.map((row: any) => ({
      id: row.id,
      paymentNumber: row.payment_number || 'PMT',
      paymentDate: row.payment_date ? String(row.payment_date).split('T')[0] : '',
      amount: databaseMoney(row.amount, 'Portal payment amount'),
      reference: row.reference || null,
    }));

    return {
      organization: {
        id: org.id,
        name: org.name,
        email: org.email || undefined,
        currency: org.base_currency || 'USD',
      },
      customer: {
        id: customer.id,
        name: customer.name || 'Customer',
        email: customer.email || undefined,
        phone: customer.phone || undefined,
      },
      summary: {
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        openInvoicesCount: openCount,
        overdueCount,
      },
      invoices,
      recentPayments,
    };
  }

  /**
   * Retrieves statement for a customer via portal token.
   */
  public static async getPortalStatement(
    token: string,
    fromDate?: string,
    toDate?: string
  ): Promise<CustomerStatementResponse> {
    const tokenHash = CustomerPortalService.hashToken(token);
    let tokenRes;
    try {
      tokenRes = await db.query(
        `SELECT organization_id, customer_id, expires_at, is_active
         FROM customer_portal_tokens
         WHERE (token_hash = $1 OR token = $1 OR token = $2) AND is_active = TRUE`,
        [tokenHash, token]
      );
    } catch {
      tokenRes = await db.query(
        `SELECT organization_id, customer_id, expires_at, is_active
         FROM customer_portal_tokens
         WHERE (token = $1 OR token = $2) AND is_active = TRUE`,
        [tokenHash, token]
      );
    }

    if (tokenRes.rows.length === 0) {
      throw new Error('Invalid or expired portal token');
    }

    const { organization_id: orgId, customer_id: customerId, expires_at: expiresAt } = tokenRes.rows[0];

    if (expiresAt && new Date(expiresAt) < new Date()) {
      throw new Error('Portal access token has expired');
    }

    const now = new Date();
    const from = fromDate || new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const to = toDate || now.toISOString().split('T')[0];

    return CustomerStatementService.getCustomerStatement(orgId, customerId, from, to);
  }

  /**
   * Processes an online payment from the customer portal with balanced double-entry GL journal posting.
   */
  public static async processPortalPayment(
    token: string,
    payload: { invoiceId: string; amount: number; paymentMethod?: string; reference?: string; depositToAccountId?: string }
  ): Promise<{ success: boolean; paymentId: string; paymentNumber: string; remainingBalance: number }> {
    const tokenHash = CustomerPortalService.hashToken(token);
    let tokenRes;
    try {
      tokenRes = await db.query(
        `SELECT organization_id, customer_id, expires_at, is_active
         FROM customer_portal_tokens
         WHERE (token_hash = $1 OR token = $1 OR token = $2) AND is_active = TRUE`,
        [tokenHash, token]
      );
    } catch {
      tokenRes = await db.query(
        `SELECT organization_id, customer_id, expires_at, is_active
         FROM customer_portal_tokens
         WHERE (token = $1 OR token = $2) AND is_active = TRUE`,
        [tokenHash, token]
      );
    }

    if (tokenRes.rows.length === 0) {
      throw new Error('Invalid or expired portal token');
    }

    const { organization_id: orgId, customer_id: customerId, expires_at: expiresAt } = tokenRes.rows[0];
    if (expiresAt && new Date(expiresAt) < new Date()) {
      throw new Error('Portal token has expired');
    }

    const invRes = await db.query(
      `SELECT id, invoice_number, total_amount, balance_due, status
       FROM invoices
       WHERE organization_id = $1 AND id = $2 AND (customer_id = $3 OR client_id = $3)`,
      [orgId, payload.invoiceId, customerId]
    );

    if (invRes.rows.length === 0) {
      throw new Error('Invoice not found or does not belong to this customer');
    }

    const invoice = invRes.rows[0];
    const currentBalance = databaseMoney(invoice.balance_due, 'Current balance');
    const payAmount = databaseMoney(payload.amount, 'Payment amount');

    if (payAmount <= 0) {
      throw new Error('Payment amount must be greater than zero');
    }
    if (payAmount > currentBalance + 0.001) {
      throw new Error(`Payment amount cannot exceed invoice balance due of ${currentBalance}`);
    }

    const custRes = await db.query(
      `SELECT id, display_name as name FROM customers WHERE organization_id = $1 AND (id = $2 OR customer_id = $2)
       UNION
       SELECT id, name FROM clients WHERE organization_id = $1 AND id = $2
       LIMIT 1`,
      [orgId, customerId]
    );
    const clientName = custRes.rows[0]?.name || 'Customer';

    let depositAccountId = payload.depositToAccountId;
    if (!depositAccountId) {
      const accRes = await db.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND (type IN ('Asset', 'Bank', 'Cash') OR sub_type IN ('Bank', 'Cash')) ORDER BY id ASC LIMIT 1`,
        [orgId]
      );
      depositAccountId = accRes.rows[0]?.id || '1010';
    }

    const today = new Date().toISOString().split('T')[0];
    const payment = await SalesEngine.recordPayment(orgId, {
      customerId,
      customerName: clientName,
      invoiceId: payload.invoiceId,
      amount: payAmount,
      paymentDate: today,
      paymentMode: payload.paymentMethod || 'ONLINE',
      depositToAccountId: depositAccountId,
      reference: payload.reference || 'Online Portal Payment',
      notes: `Paid via Customer Portal for Invoice ${invoice.invoice_number}`,
      allocations: [
        {
          invoiceId: payload.invoiceId,
          amount: payAmount,
        },
      ],
    });

    const updatedInvRes = await db.query(
      `SELECT balance_due FROM invoices WHERE organization_id = $1 AND id = $2`,
      [orgId, payload.invoiceId]
    );
    const remainingBalance = updatedInvRes.rows[0]?.balance_due !== undefined
      ? Number(updatedInvRes.rows[0].balance_due)
      : Math.max(0, Math.round((currentBalance - payAmount) * 100) / 100);

    return {
      success: true,
      paymentId: payment.paymentId || payment.id,
      paymentNumber: payment.paymentNumber,
      remainingBalance,
    };
  }

  /**
   * Revokes customer portal token.
   */
  public static async revokePortalTokens(orgId: string, customerId: string): Promise<{ success: boolean }> {
    await db.query(
      `UPDATE customer_portal_tokens
       SET is_active = FALSE
       WHERE organization_id = $1 AND customer_id = $2`,
      [orgId, customerId]
    );
    return { success: true };
  }
}

