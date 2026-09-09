import crypto from 'crypto';
import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { SalesEngine } from '../sales/SalesEngine';
import { ExpensePostingService } from './ExpensePostingService';
import { isProduction } from '../config/environment';
import { OrganizationProvisioningService } from './OrganizationProvisioningService';
import { MonetaryAccountPolicy } from '../accounting/monetaryAccountPolicy';
import { ServerPostingEngine } from '../accounting/postingEngine';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';
import { isIsoCalendarDate } from '../utils/date';

function normalizeGatewayDate(value: unknown): string {
  if (typeof value === 'string' && isIsoCalendarDate(value.slice(0, 10))) return value.slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value < 1_000_000_000_000 ? value * 1000 : value;
    const normalized = new Date(millis).toISOString().slice(0, 10);
    if (isIsoCalendarDate(normalized)) return normalized;
  }
  return new Date().toISOString().slice(0, 10);
}

export interface WebhookEventInput {
  organizationId: string;
  gateway: string; // 'stripe' | 'razorpay' | 'paypal' | 'mock'
  eventId: string;
  eventType: string;
  payload: any;
  rawBody?: string;
  signature?: string;
  webhookSecret?: string;
}

export interface WebhookProcessingResult {
  eventId: string;
  status: 'PROCESSED' | 'ALREADY_PROCESSED' | 'IGNORED' | 'FAILED';
  paymentId?: string;
  expenseId?: string;
  settlementReference?: string;
  error?: string;
}

export class PaymentGatewayService {
  private static getGatewayReference(data: any): string | undefined {
    const value = data?.originalEventId || data?.original_event_id || data?.refundEventId || data?.refund_event_id
      || data?.paymentId || data?.payment_id || data?.payment_intent || data?.charge || data?.original_payment_id
      || data?.metadata?.paymentId || data?.metadata?.payment_id || data?.refund || data?.id;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private static async resolveOriginalReceipt(
    client: DbQueryClient,
    organizationId: string,
    gateway: string,
    data: any
  ): Promise<any> {
    const reference = this.getGatewayReference(data);
    if (!reference) throw new Error('GATEWAY_ORIGINAL_PAYMENT_REQUIRED: Refund or chargeback must identify the original gateway payment');
    const settlementReference = `GW-${gateway.toUpperCase()}-${reference}`;
    const result = await client.query(
      `SELECT e.id AS gateway_event_id, e.payment_id, e.invoice_id, e.event_id, e.settlement_reference,
              p.client_id, p.amount AS payment_amount
         FROM payment_gateway_events e
         JOIN payments_received p ON p.organization_id = e.organization_id AND p.id = e.payment_id
        WHERE e.organization_id = $1 AND e.gateway = $2
          AND UPPER(e.status) = 'PROCESSED'
          AND e.payment_id IS NOT NULL
          AND (e.payment_id = $3 OR e.event_id = $3 OR e.settlement_reference = $4)
        ORDER BY e.processed_at DESC
        LIMIT 2
        FOR UPDATE`,
      [organizationId, gateway, reference, settlementReference]
    );
    if (result.rows.length !== 1) throw new Error('GATEWAY_ORIGINAL_PAYMENT_NOT_FOUND: No unique posted gateway receipt matches this event');
    return result.rows[0];
  }

  private static async postGatewayRefundOrChargeback(
    client: DbQueryClient,
    params: { organizationId: string; gateway: string; eventId: string; eventType: string; data: any; amount: number; paymentDate: string; settlementReference: string; invoiceId?: string }
  ): Promise<{ paymentId: string; journalEntryId: string }> {
    const { organizationId, gateway, eventId, eventType, data, amount, paymentDate, settlementReference } = params;
    const original = await this.resolveOriginalReceipt(client, organizationId, gateway, data);
    const invoiceId = params.invoiceId || original.invoice_id;
    if (!invoiceId || (original.invoice_id && invoiceId !== original.invoice_id)) {
      throw new Error('GATEWAY_REFUND_INVOICE_MISMATCH: Refund must use the invoice allocated by the original gateway payment');
    }
    const allocation = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS allocated
         FROM payment_received_allocations
        WHERE organization_id = $1 AND payment_id = $2 AND invoice_id = $3`,
      [organizationId, original.payment_id, invoiceId]
    );
    const allocated = Number(allocation.rows[0]?.allocated || 0);
    if (allocated <= 0) throw new Error('GATEWAY_REFUND_ALLOCATION_NOT_FOUND: The original gateway payment has no allocation for this invoice');
    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [organizationId, invoiceId]
    );
    if (invoiceResult.rows.length !== 1) throw new Error('GATEWAY_REFUND_INVOICE_NOT_FOUND');
    const previous = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM payment_gateway_events
        WHERE organization_id = $1 AND payment_id = $2 AND invoice_id = $3 AND UPPER(status) = 'PROCESSED'
          AND LOWER(event_type) IN ('charge.refunded', 'refund.succeeded', 'payment.refunded', 'charge.dispute.created', 'charge.dispute.funds_withdrawn', 'chargeback.created')`,
      [organizationId, original.payment_id, invoiceId]
    );
    const previouslyRefunded = Number(previous.rows[0]?.total || 0);
    if (amount > allocated - previouslyRefunded + 0.001) {
      throw new Error('GATEWAY_REFUND_EXCEEDS_ORIGINAL_PAYMENT: Refund or chargeback exceeds the un-reversed original allocation');
    }
    const invoice = invoiceResult.rows[0];
    const paidBefore = Number(invoice.paid_amount || 0);
    if (amount > paidBefore + 0.001) throw new Error('GATEWAY_REFUND_EXCEEDS_INVOICE_PAID: Refund exceeds the invoice paid amount');
    const newPaid = Math.round((paidBefore - amount) * 100) / 100;
    const newBalance = Math.max(0, Math.round((Number(invoice.total_amount || 0) - newPaid - Number(invoice.amount_credited || 0) - Number(invoice.amount_written_off || 0)) * 100) / 100);
    const newStatus = newBalance === 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : 'POSTED';

    const arId = await OrganizationProvisioningService.resolveSystemAccountId(client, organizationId, 'AR_CONTROL', ['Asset']);
    const clearingId = await OrganizationProvisioningService.resolveSystemAccountId(client, organizationId, 'PAYMENT_CLEARING', ['Asset']);
    const clearing = await MonetaryAccountPolicy.resolve(client, organizationId, clearingId, 'OUTFLOW', 'gateway_clearing_account');
    const posting = await ServerPostingEngine.postEntry({
      organizationId,
      entryNumber: `GW-REV-${eventId}`,
      date: paymentDate,
      reference: settlementReference,
      description: `${gateway.toUpperCase()} ${eventType} for gateway receipt ${original.event_id}`,
      lines: [
        { accountId: arId, debit: amount, credit: 0, description: settlementReference },
        { accountId: clearing.id, debit: 0, credit: amount, description: settlementReference },
      ],
    }, client);
    await client.query(
      `UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`,
      [newPaid, newBalance, newStatus, organizationId, invoiceId]
    );
    if (original.client_id) {
      await client.query(
        `UPDATE customers SET receivables_balance = COALESCE(receivables_balance, 0) + $1 WHERE organization_id = $2 AND id = $3`,
        [amount, organizationId, original.client_id]
      );
    }
    await client.query(
      `UPDATE payment_gateway_events
          SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, settlement_reference = $1,
              payment_id = $2, invoice_id = $3, related_event_id = $4, amount = $5,
              journal_entry_id = $6, error_message = NULL
        WHERE organization_id = $7 AND gateway = $8 AND event_id = $9`,
      [settlementReference, original.payment_id, invoiceId, original.gateway_event_id, amount, posting.entryId, organizationId, gateway, eventId]
    );
    await client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
       VALUES ($1, $2, 'gateway-system', 'GATEWAY_REFUND_OR_CHARGEBACK_POSTED', 'PaymentGatewayEvent', $3, $4)`,
      [newId('aud'), organizationId, eventId, JSON.stringify({ eventType, paymentId: original.payment_id, invoiceId, amount, journalEntryId: posting.entryId })]
    );
    return { paymentId: original.payment_id, journalEntryId: posting.entryId };
  }

  private static async reverseGatewayRefundOrChargeback(
    client: DbQueryClient,
    params: { organizationId: string; gateway: string; eventId: string; eventType: string; data: any; amount: number; settlementReference: string }
  ): Promise<{ paymentId: string; journalEntryId: string }> {
    const reference = this.getGatewayReference(params.data);
    if (!reference) throw new Error('GATEWAY_REVERSAL_SOURCE_REQUIRED: Reinstatement must identify the original refund or chargeback event');
    const source = await client.query(
      `SELECT e.*, p.client_id
         FROM payment_gateway_events e
         JOIN payments_received p ON p.organization_id = e.organization_id AND p.id = e.payment_id
        WHERE e.organization_id = $1 AND e.gateway = $2 AND UPPER(e.status) = 'PROCESSED'
          AND e.journal_entry_id IS NOT NULL
          AND LOWER(e.event_type) IN ('charge.refunded', 'refund.succeeded', 'payment.refunded', 'charge.dispute.created', 'charge.dispute.funds_withdrawn', 'chargeback.created')
          AND (e.event_id = $3 OR e.payment_id = $3 OR e.settlement_reference = $4)
        ORDER BY e.processed_at DESC
        LIMIT 2
        FOR UPDATE`,
      [params.organizationId, params.gateway, reference, `GW-${params.gateway.toUpperCase()}-${reference}`]
    );
    if (source.rows.length !== 1) throw new Error('GATEWAY_REVERSAL_SOURCE_NOT_FOUND: No unique posted refund or chargeback matches this event');
    const original = source.rows[0];
    if (Math.abs(Number(original.amount || 0) - params.amount) > 0.001) throw new Error('GATEWAY_REVERSAL_AMOUNT_MISMATCH: Reinstatement amount must equal the original refund or chargeback');
    const invoiceResult = await client.query(`SELECT * FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [params.organizationId, original.invoice_id]);
    if (invoiceResult.rows.length !== 1) throw new Error('GATEWAY_REVERSAL_INVOICE_NOT_FOUND');
    const invoice = invoiceResult.rows[0];
    const restoredPaid = Math.round((Number(invoice.paid_amount || 0) + params.amount) * 100) / 100;
    if (restoredPaid > Number(invoice.total_amount || 0) - Number(invoice.amount_credited || 0) - Number(invoice.amount_written_off || 0) + 0.001) {
      throw new Error('GATEWAY_REVERSAL_INVOICE_OVERPAID: Restoring this event would overpay the invoice');
    }
    const restoredBalance = Math.max(0, Math.round((Number(invoice.total_amount || 0) - restoredPaid - Number(invoice.amount_credited || 0) - Number(invoice.amount_written_off || 0)) * 100) / 100);
    const restoredStatus = restoredBalance === 0 ? 'PAID' : 'PARTIALLY_PAID';
    const reversalJournalId = await FinancialDestructiveActionsService.reversePostedJournal(
      client, params.organizationId, original.journal_entry_id, 'gateway-system', `Provider ${params.eventType}`, `gateway event ${original.event_id}`
    );
    await client.query(`UPDATE invoices SET paid_amount = $1, balance_due = $2, status = $3 WHERE organization_id = $4 AND id = $5`, [restoredPaid, restoredBalance, restoredStatus, params.organizationId, original.invoice_id]);
    if (original.client_id) {
      await client.query(
        `UPDATE customers SET receivables_balance = CASE WHEN COALESCE(receivables_balance, 0) - $1 < 0 THEN 0 ELSE receivables_balance - $1 END WHERE organization_id = $2 AND id = $3`,
        [params.amount, params.organizationId, original.client_id]
      );
    }
    await client.query(
      `UPDATE payment_gateway_events SET status = 'REVERSED', reversal_journal_id = $1, reversed_at = CURRENT_TIMESTAMP
        WHERE organization_id = $2 AND id = $3 AND UPPER(status) = 'PROCESSED'`,
      [reversalJournalId, params.organizationId, original.id]
    );
    await client.query(
      `UPDATE payment_gateway_events
          SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, settlement_reference = $1,
              payment_id = $2, invoice_id = $3, related_event_id = $4, amount = $5,
              journal_entry_id = $6, error_message = NULL
        WHERE organization_id = $7 AND gateway = $8 AND event_id = $9`,
      [params.settlementReference, original.payment_id, original.invoice_id, original.id, params.amount, reversalJournalId, params.organizationId, params.gateway, params.eventId]
    );
    return { paymentId: original.payment_id, journalEntryId: reversalJournalId };
  }

  /**
   * Verifies an HMAC-SHA256 signature for webhook payloads.
   * Supports both raw hex signatures and Stripe-style timestamped "t=...,v1=..." formats.
   */
  public static verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string,
    toleranceSeconds: number = 300
  ): boolean {
    if (!rawBody || !signatureHeader || !secret) return false;

    try {
      if (signatureHeader.includes('v1=')) {
        // Stripe style header: t=1234567,v1=abcdef...
        const parts = signatureHeader.split(',');
        const timestampPart = parts.find((p) => p.startsWith('t='));
        const sigPart = parts.find((p) => p.startsWith('v1='));

        if (!timestampPart || !sigPart) return false;

        const timestamp = parseInt(timestampPart.substring(2), 10);
        const expectedSig = sigPart.substring(3);

        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - timestamp) > toleranceSeconds) {
          return false; // Signature expired
        }

        const signedPayload = `${timestamp}.${rawBody}`;
        const computed = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSig));
      } else {
        // Plain HMAC-SHA256 hex signature
        const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        const cleanSig = signatureHeader.replace(/^sha256=/, '').trim();
        return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(cleanSig));
      }
    } catch {
      return false;
    }
  }

  /**
   * Idempotently processes an incoming payment gateway webhook.
   */
  public static async processWebhook(input: WebhookEventInput): Promise<WebhookProcessingResult> {
    const { organizationId, gateway, eventId, eventType, payload, rawBody, signature, webhookSecret } = input;

    // 1. Signature Verification
    if (gateway === 'mock' && isProduction()) {
      throw new Error('MOCK_GATEWAY_FORBIDDEN: Mock payment gateway is strictly disabled in production environments');
    }

    if (gateway !== 'mock') {
      if (!signature || !rawBody) {
        throw new Error(`MISSING_WEBHOOK_SIGNATURE: Signature and raw body required for gateway '${gateway}'`);
      }
      let secret = webhookSecret || process.env[`${gateway.toUpperCase()}_WEBHOOK_SECRET`];
      if (!secret) {
        const gwDb = await db.query(
          `SELECT webhook_secret FROM organization_payment_gateways WHERE organization_id = $1 AND gateway = $2 AND is_active = TRUE`,
          [organizationId, gateway.toLowerCase()]
        );
        if (gwDb.rows.length > 0 && gwDb.rows[0].webhook_secret) {
          secret = gwDb.rows[0].webhook_secret;
        }
      }
      if (!secret) {
        throw new Error(`GATEWAY_SECRET_MISSING: Webhook secret not configured for gateway '${gateway}'`);
      }
      const isValid = this.verifyWebhookSignature(rawBody, signature, secret);
      if (!isValid) {
        throw new Error('INVALID_WEBHOOK_SIGNATURE: Signature verification failed for payment gateway');
      }
    } else if (webhookSecret && signature && rawBody) {
      const isValid = this.verifyWebhookSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        throw new Error('INVALID_WEBHOOK_SIGNATURE: Signature verification failed for payment gateway');
      }
    }

    // 2. Persist and atomically claim the provider event. Only one delivery may post it.
    await db.query(
      `INSERT INTO payment_gateway_events (
         id, organization_id, gateway, event_id, event_type, payload, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'RECEIVED')
       ON CONFLICT (organization_id, gateway, event_id) DO NOTHING`,
      [newId('pge'), organizationId, gateway, eventId, eventType, JSON.stringify(payload || {})]
    );
    const claimed = await db.query(
      `UPDATE payment_gateway_events
          SET status = 'PROCESSING', error_message = NULL
        WHERE organization_id = $1 AND gateway = $2 AND event_id = $3
          AND status IN ('RECEIVED', 'FAILED')
        RETURNING id`,
      [organizationId, gateway, eventId]
    );
    if (claimed.rows.length !== 1) {
      const existing = await db.query(
        `SELECT status, payment_id, settlement_reference
           FROM payment_gateway_events
          WHERE organization_id = $1 AND gateway = $2 AND event_id = $3`,
        [organizationId, gateway, eventId]
      );
      return {
        eventId,
        status: existing.rows[0]?.status === 'IGNORED' ? 'IGNORED' : 'ALREADY_PROCESSED',
        paymentId: existing.rows[0]?.payment_id || undefined,
        settlementReference: existing.rows[0]?.settlement_reference || undefined,
      };
    }

    // 3. Process payment receipt, payout, refund/chargeback, and reinstatement events.
    // Events with no final monetary movement stay ignored; they must never fabricate a GL posting.
    const isPaymentSuccess = [
      'payment.succeeded',
      'payment_intent.succeeded',
      'charge.successful',
      'charge.succeeded',
      'order.paid',
      'payment.captured',
    ].includes(eventType.toLowerCase());

    const isPayoutSuccess = [
      'payout.paid',
      'payout.succeeded',
      'settlement.processed',
      'transfer.paid',
    ].includes(eventType.toLowerCase());

    const isRefundOrChargeback = [
      'charge.refunded',
      'refund.succeeded',
      'payment.refunded',
      'charge.dispute.created',
      'charge.dispute.funds_withdrawn',
      'chargeback.created',
    ].includes(eventType.toLowerCase());

    const isRefundOrChargebackReinstated = [
      'refund.reversed',
      'charge.dispute.funds_reinstated',
      'chargeback.reversed',
    ].includes(eventType.toLowerCase()) || (
      eventType.toLowerCase() === 'charge.dispute.closed'
      && ['won', 'reversed', 'funds_reinstated'].includes(String(payload?.data?.object?.status || payload?.status || '').toLowerCase())
    );

    const isCancellation = [
      'payment_intent.canceled',
      'payment.canceled',
      'checkout.session.cancelled',
    ].includes(eventType.toLowerCase());

    const isExpiration = [
      'checkout.session.expired',
      'payment_intent.expired',
    ].includes(eventType.toLowerCase());

    if (isCancellation || isExpiration) {
      const data = payload?.data?.object || payload?.payload?.payment?.entity || payload;
      const ref = data.id || data.payment_intent || eventId;
      const newStatus = isCancellation ? 'CANCELLED' : 'EXPIRED';
      await db.query(
        `UPDATE payment_intents
            SET status = $1, gateway_event_id = $2, updated_at = CURRENT_TIMESTAMP
          WHERE organization_id = $3 AND (provider_reference = $4 OR provider_session_id = $4)`,
        [newStatus, eventId, organizationId, ref]
      );
      await db.query(
        `UPDATE payment_gateway_events
            SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP
          WHERE organization_id = $1 AND gateway = $2 AND event_id = $3`,
        [organizationId, gateway, eventId]
      );
      return { eventId, status: 'PROCESSED' };
    }

    if (!isPaymentSuccess && !isPayoutSuccess && !isRefundOrChargeback && !isRefundOrChargebackReinstated) {
      await db.query(
        `UPDATE payment_gateway_events
         SET status = 'IGNORED', processed_at = CURRENT_TIMESTAMP
         WHERE organization_id = $1 AND gateway = $2 AND event_id = $3`,
        [organizationId, gateway, eventId]
      );
      return { eventId, status: 'IGNORED' };
    }

    try {
      const data = payload?.data?.object || payload?.payload?.payment?.entity || payload;
      const invoiceId = data.invoiceId || data.invoice_id || data.metadata?.invoiceId || data.metadata?.invoice_id;
      const isSubunit = ['stripe', 'razorpay'].includes(gateway.toLowerCase());
      const rawAmount = Number(data.amount ?? data.grossAmount ?? 0);
      const rawFee = Number(data.fee ?? data.gateway_fee ?? 0);
      const grossAmount = isSubunit ? Math.round((rawAmount / 100) * 100) / 100 : rawAmount;
      const fee = isSubunit ? Math.round((rawFee / 100) * 100) / 100 : rawFee;
      const paymentDate = normalizeGatewayDate(data.paymentDate || data.created_at || data.created);
      const bankAccountId = data.bankAccountId || data.depositAccountId || data.bank_account_id || data.deposit_account_id;
      const reference = data.id || eventId;
      const paymentMode = gateway.toUpperCase();
      const currency = String(data.currency || '').trim().toUpperCase();

      const settlementRef = `GW-${gateway.toUpperCase()}-${reference}`;

      if (!Number.isFinite(grossAmount) || grossAmount <= 0 || !Number.isSafeInteger(Math.round(grossAmount * 100))) {
        throw new Error('GATEWAY_AMOUNT_INVALID: A positive exact monetary amount is required');
      }
      if (fee < 0 || fee > grossAmount || !Number.isSafeInteger(Math.round(fee * 100))) {
        throw new Error('GATEWAY_FEE_INVALID: Gateway fee must be between zero and the gross amount');
      }
      if (gateway !== 'mock' && !currency) {
        throw new Error('GATEWAY_CURRENCY_REQUIRED: Provider event must include currency');
      }
      if (isPaymentSuccess && !invoiceId) {
        throw new Error('GATEWAY_INVOICE_REQUIRED: Successful receipt must identify an invoice');
      }
      if (isPayoutSuccess && !bankAccountId) {
        throw new Error('GATEWAY_BANK_ACCOUNT_REQUIRED: Successful payout must identify its destination bank account');
      }

      // Perform all financial settlements and event updates in a single atomic transaction
      return await db.transaction(async (txClient) => {
        let paymentId: string | undefined;
        let expenseId: string | undefined;
        let journalEntryId: string | undefined;

        const clearingId = await OrganizationProvisioningService.resolveSystemAccountId(
          txClient,
          organizationId,
          'PAYMENT_CLEARING',
          ['Asset']
        );
        const clearingAccount = await MonetaryAccountPolicy.resolve(
          txClient,
          organizationId,
          clearingId,
          'TRANSFER',
          'gateway_clearing_account'
        );

        // Resolve fee expense account (e.g. 6120, 6000, or any active Expense account)
        let feeAccountId = '6000';
        const fRes = await txClient.query(
          `SELECT id FROM accounts WHERE organization_id = $1 AND (code = '6120' OR code = '6000' OR type = 'Expense') AND status = 'Active' LIMIT 1`,
          [organizationId]
        );
        if (fRes.rows.length > 0) feeAccountId = fRes.rows[0].id;

        if (isPaymentSuccess) {
          // Overpayment defense: verify remaining invoice balance
          const invCheck = await txClient.query(
            `SELECT balance_due, status FROM invoices WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
            [organizationId, invoiceId]
          );
          if (invCheck.rows.length === 0) {
            throw new Error('GATEWAY_INVOICE_NOT_FOUND: Referenced invoice was not found');
          }
          const currentBalance = Math.round(Number(invCheck.rows[0].balance_due) * 100) / 100;
          if (grossAmount > currentBalance) {
            throw new Error(`OVERPAYMENT_NOT_PERMITTED: Webhook payment amount ${grossAmount.toFixed(2)} exceeds invoice balance due ${currentBalance.toFixed(2)}`);
          }

          // Record Customer Payment allocated to invoice
          const pmtRes = await SalesEngine.recordCustomerPayment(
            organizationId,
            {
              invoiceId,
              amount: grossAmount,
              paymentDate,
              paymentMode,
              depositAccountId: clearingAccount.id,
              reference: settlementRef,
              notes: `Automated settlement via ${gateway} (Event: ${eventId})`,
              _verifiedExternalSettlement: true,
            },
            'gateway-system',
            txClient
          );
          paymentId = pmtRes.id || pmtRes.paymentId;
          journalEntryId = pmtRes.journalEntryId;
          if (!paymentId || !journalEntryId || pmtRes.status === 'SUBMITTED') {
            throw new Error('GATEWAY_PAYMENT_NOT_POSTED: Verified receipt did not create a final accounting posting');
          }

          // Update linked payment_intents to SUCCEEDED
          await txClient.query(
            `UPDATE payment_intents
                SET status = 'SUCCEEDED', payment_id = $1, gateway_event_id = $2, updated_at = CURRENT_TIMESTAMP
              WHERE organization_id = $3 AND (provider_reference = $4 OR provider_session_id = $4)`,
            [paymentId, eventId, organizationId, reference]
          );

          // If gateway fee charged, record gateway processing fee expense
          if (fee > 0) {
            const feeExp = await ExpensePostingService.createAndPost(
              organizationId,
              'gateway-system',
              {
                expenseAccountId: feeAccountId,
                paidFromAccountId: clearingAccount.id,
                vendorName: `${gateway.toUpperCase()} Fees`,
                date: paymentDate,
                amount: fee,
                description: `Merchant processing fee for payment ${reference}`,
              },
              txClient
            );
            expenseId = feeExp.id;
          }
        } else if (isPayoutSuccess) {
          const bankRow = await txClient.query(
            `SELECT ledger_account_id
               FROM bank_accounts
              WHERE organization_id = $1 AND id = $2 AND is_active = TRUE`,
            [organizationId, bankAccountId]
          );
          const destination = await MonetaryAccountPolicy.resolve(
            txClient,
            organizationId,
            bankRow.rows[0]?.ledger_account_id || bankAccountId,
            'INFLOW',
            'payout_bank_account'
          );
          const posting = await ServerPostingEngine.postEntry({
            organizationId,
            entryNumber: `GW-PAYOUT-${eventId}`,
            date: paymentDate,
            reference: settlementRef,
            description: `${gateway.toUpperCase()} payout settlement`,
            lines: [
              { accountId: destination.id, debit: grossAmount, credit: 0, description: settlementRef },
              { accountId: clearingAccount.id, debit: 0, credit: grossAmount, description: settlementRef },
            ],
          }, txClient);
          journalEntryId = posting.entryId;
        } else if (isRefundOrChargeback) {
          const result = await this.postGatewayRefundOrChargeback(txClient, {
            organizationId,
            gateway,
            eventId,
            eventType,
            data,
            amount: grossAmount,
            paymentDate,
            settlementReference: settlementRef,
            invoiceId,
          });
          paymentId = result.paymentId;
          journalEntryId = result.journalEntryId;
          return { eventId, status: 'PROCESSED' as const, paymentId, settlementReference: settlementRef };
        } else {
          const result = await this.reverseGatewayRefundOrChargeback(txClient, {
            organizationId,
            gateway,
            eventId,
            eventType,
            data,
            amount: grossAmount,
            settlementReference: settlementRef,
          });
          paymentId = result.paymentId;
          journalEntryId = result.journalEntryId;
          return { eventId, status: 'PROCESSED' as const, paymentId, settlementReference: settlementRef };
        }

        // Mark event as PROCESSED
        await txClient.query(
          `UPDATE payment_gateway_events
           SET status = 'PROCESSED',
               processed_at = CURRENT_TIMESTAMP,
               settlement_reference = $1,
               payment_id = $2,
               invoice_id = $3,
               expense_id = $4,
               journal_entry_id = $5,
               amount = $6,
               error_message = NULL
           WHERE organization_id = $7 AND gateway = $8 AND event_id = $9`,
          [settlementRef, paymentId || null, invoiceId || null, expenseId || null, journalEntryId || null, grossAmount, organizationId, gateway, eventId]
        );

        return {
          eventId,
          status: 'PROCESSED',
          paymentId,
          expenseId,
          settlementReference: settlementRef,
        };
      });
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      await db.query(
        `UPDATE payment_gateway_events
         SET status = 'FAILED',
             error_message = $1
         WHERE organization_id = $2 AND gateway = $3 AND event_id = $4`,
        [errorMsg, organizationId, gateway, eventId]
      );
      return {
        eventId,
        status: 'FAILED',
        error: errorMsg,
      };
    }
  }

  public static async listEvents(orgId: string, limit: number = 50): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM payment_gateway_events
       WHERE organization_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [orgId, limit]
    );
    return res.rows;
  }
}
