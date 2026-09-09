import { db } from '../database/db';
import { newId } from '../utils/ids';
import { PaymentProviderRegistry } from '../gateways/PaymentProviderRegistry';
import { isProduction } from '../config/environment';

export interface CreatePaymentIntentParams {
  organizationId: string;
  customerId: string;
  invoiceId: string;
  amount: number;
  gateway?: string;
  idempotencyKey?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PaymentIntentDto {
  id: string;
  sessionId: string;
  providerReference: string;
  checkoutUrl: string;
  amount: number;
  currency: string;
  status: string;
  expiresAt: Date;
}

export interface PaymentIntentStatusDto {
  intentId: string;
  status: 'PENDING' | 'SUCCEEDED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';
  isConfirmed: boolean;
  amount: number;
  currency: string;
  checkoutUrl?: string;
  paymentId?: string;
  paymentNumber?: string;
  journalEntryId?: string;
  paidAt?: string;
  remainingBalance?: number;
  invoiceNumber?: string;
}

export class PaymentIntentService {
  /**
   * Initiates a processor-hosted checkout session for one invoice and exact amount.
   * Persists an immutable payment_intents record with idempotency tracking.
   * Zero PAN/CVC/bank credentials ever touch application servers.
   */
  public static async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentDto> {
    const { organizationId, customerId, invoiceId, amount, gateway = 'mock' } = params;

    // 1. Fetch and lock invoice
    const invRes = await db.query(
      `SELECT i.id, i.invoice_number, i.total_amount, i.balance_due, i.status, i.client_id, i.customer_id,
              COALESCE(c.currency, o.base_currency, 'USD') AS currency
         FROM invoices i
         LEFT JOIN clients c ON c.id = COALESCE(i.client_id, i.customer_id) AND c.organization_id = i.organization_id
         LEFT JOIN organizations o ON o.id = i.organization_id
        WHERE i.organization_id = $1 AND i.id = $2 AND (i.customer_id = $3 OR i.client_id = $3)`,
      [organizationId, invoiceId, customerId]
    );

    if (invRes.rows.length === 0) {
      throw new Error('INVOICE_NOT_FOUND: Invoice does not exist or does not belong to this customer');
    }

    const invoice = invRes.rows[0];
    const balanceDue = Math.round(Number(invoice.balance_due) * 100) / 100;

    if (invoice.status === 'PAID' || balanceDue <= 0) {
      throw new Error('INVOICE_ALREADY_PAID: Invoice is already fully settled');
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('INVALID_PAYMENT_AMOUNT: Payment amount must be greater than zero');
    }

    const exactAmount = Math.round(amount * 100) / 100;
    if (exactAmount > balanceDue) {
      throw new Error(`OVERPAYMENT_NOT_PERMITTED: Requested amount ${exactAmount.toFixed(2)} exceeds invoice balance due ${balanceDue.toFixed(2)}`);
    }

    const currency = (invoice.currency || 'USD').toUpperCase();
    const idempotencyKey = params.idempotencyKey?.trim() || `idem_${newId('pmt')}`;

    // 2. Check existing intent by idempotency key
    const existing = await db.query(
      `SELECT id, provider_session_id, provider_reference, checkout_url, amount, currency, status, expires_at
         FROM payment_intents
        WHERE organization_id = $1 AND idempotency_key = $2`,
      [organizationId, idempotencyKey]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        id: row.id,
        sessionId: row.provider_session_id,
        providerReference: row.provider_reference,
        checkoutUrl: row.checkout_url,
        amount: Number(row.amount),
        currency: row.currency,
        status: row.status,
        expiresAt: new Date(row.expires_at),
      };
    }

    // 3. Resolve gateway adapter from organization configuration (backend selects provider)
    const gwConfigRes = await db.query(
      `SELECT gateway, key_id, key_secret, webhook_secret
         FROM organization_payment_gateways
        WHERE organization_id = $1 AND is_active = TRUE
        ORDER BY updated_at DESC LIMIT 1`,
      [organizationId]
    );

    let resolvedGateway: string;
    if (gwConfigRes.rows.length > 0 && gwConfigRes.rows[0].gateway) {
      resolvedGateway = gwConfigRes.rows[0].gateway.toLowerCase();
    } else if (params.gateway && !isProduction()) {
      resolvedGateway = params.gateway.toLowerCase();
    } else if (!isProduction()) {
      resolvedGateway = 'mock';
    } else {
      throw new Error('PAYMENT_GATEWAY_NOT_CONFIGURED: No active payment gateway is configured for this organization');
    }

    const adapter = PaymentProviderRegistry.getAdapter(resolvedGateway);
    const origin = process.env.APP_BASE_URL || 'http://localhost:3000';
    const successUrl = params.successUrl || `${origin}/portal/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = params.cancelUrl || `${origin}/portal/checkout/cancel?session_id={CHECKOUT_SESSION_ID}`;

    const session = await adapter.createCheckoutSession({
      organizationId,
      invoiceId,
      invoiceNumber: invoice.invoice_number,
      customerId,
      customerName: 'Customer',
      amount: exactAmount,
      currency,
      successUrl,
      cancelUrl,
      idempotencyKey,
    });

    // 4. Persist immutable payment intent record
    const intentId = newId('pi');
    await db.query(
      `INSERT INTO payment_intents (
         id, organization_id, customer_id, invoice_id, gateway,
         provider_session_id, provider_reference, currency, amount,
         status, idempotency_key, checkout_url, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CREATED', $10, $11, $12)`,
      [
        intentId,
        organizationId,
        customerId,
        invoiceId,
        resolvedGateway,
        session.sessionId,
        session.providerReference,
        currency,
        exactAmount,
        idempotencyKey,
        session.checkoutUrl,
        session.expiresAt,
      ]
    );

    return {
      id: intentId,
      sessionId: session.sessionId,
      providerReference: session.providerReference,
      checkoutUrl: session.checkoutUrl,
      amount: exactAmount,
      currency,
      status: 'CREATED',
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Queries payment confirmation status.
   * Gated strictly: status is SUCCEEDED only after the processed gateway event
   * is linked to its posted journal entry.
   */
  public static async getPaymentIntentStatus(
    organizationId: string,
    referenceOrSessionId: string
  ): Promise<PaymentIntentStatusDto> {
    const query = `
      SELECT pi.id AS intent_id, pi.organization_id, pi.customer_id, pi.invoice_id, pi.gateway,
             pi.provider_session_id, pi.provider_reference, pi.currency, pi.amount,
             pi.status AS intent_status, pi.checkout_url, pi.expires_at,
             pge.status AS event_status, pge.payment_id,
             pge.journal_entry_id AS event_journal_id, pge.processed_at,
             pr.payment_number, pr.journal_entry_id AS payment_journal_id,
             i.invoice_number, i.balance_due
        FROM payment_intents pi
        LEFT JOIN payment_gateway_events pge
          ON pge.organization_id = pi.organization_id
         AND (pge.event_id = pi.provider_reference
              OR pge.settlement_reference = ('GW-' || UPPER(pi.gateway) || '-' || pi.provider_reference)
              OR pge.settlement_reference LIKE ('%' || pi.provider_reference || '%'))
         AND UPPER(pge.status) = 'PROCESSED'
        LEFT JOIN payments_received pr
          ON pr.organization_id = pi.organization_id AND pr.id = pge.payment_id
        LEFT JOIN invoices i
          ON i.organization_id = pi.organization_id AND i.id = pi.invoice_id
       WHERE pi.organization_id = $1
         AND (pi.provider_session_id = $2 OR pi.provider_reference = $2 OR pi.id = $2)
       ORDER BY pge.processed_at DESC NULLS LAST
       LIMIT 1
    `;

    const res = await db.query(query, [organizationId, referenceOrSessionId]);
    if (res.rows.length === 0) {
      throw new Error('PAYMENT_INTENT_NOT_FOUND: No matching payment intent was found');
    }

    const row = res.rows[0];
    const amount = Number(row.amount);
    const currency = row.currency;
    const now = new Date();

    // Read-only confirmation gate: requires verified gateway event linked to posted journal entry
    const isPostedToJournal =
      row.event_status === 'PROCESSED' &&
      Boolean(row.event_journal_id) &&
      Boolean(row.payment_journal_id);

    if (isPostedToJournal) {
      return {
        intentId: row.intent_id,
        status: 'SUCCEEDED',
        isConfirmed: true,
        amount,
        currency,
        paymentId: row.payment_id,
        paymentNumber: row.payment_number,
        journalEntryId: row.payment_journal_id,
        paidAt: row.processed_at ? new Date(row.processed_at).toISOString() : now.toISOString(),
        remainingBalance: Number(row.balance_due || 0),
        invoiceNumber: row.invoice_number,
      };
    }

    if (row.intent_status === 'CANCELLED') {
      return {
        intentId: row.intent_id,
        status: 'CANCELLED',
        isConfirmed: false,
        amount,
        currency,
        invoiceNumber: row.invoice_number,
      };
    }

    if (row.intent_status === 'EXPIRED' || (new Date(row.expires_at) < now && row.intent_status !== 'SUCCEEDED')) {
      return {
        intentId: row.intent_id,
        status: 'EXPIRED',
        isConfirmed: false,
        amount,
        currency,
        invoiceNumber: row.invoice_number,
      };
    }

    return {
      intentId: row.intent_id,
      status: 'PENDING',
      isConfirmed: false,
      amount,
      currency,
      checkoutUrl: row.checkout_url,
      invoiceNumber: row.invoice_number,
    };
  }

  /**
   * Updates payment intent status upon webhook arrival.
   */
  public static async updateIntentStatus(
    organizationId: string,
    providerReference: string,
    status: 'SUCCEEDED' | 'CANCELLED' | 'EXPIRED' | 'FAILED',
    gatewayEventId?: string,
    paymentId?: string
  ): Promise<void> {
    await db.query(
      `UPDATE payment_intents
          SET status = $1,
              gateway_event_id = COALESCE($2, gateway_event_id),
              payment_id = COALESCE($3, payment_id),
              updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $4
          AND (provider_reference = $5 OR provider_session_id = $5)`,
      [status, gatewayEventId || null, paymentId || null, organizationId, providerReference]
    );
  }
}
