import crypto from 'crypto';
import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { SalesEngine } from '../sales/SalesEngine';
import { ExpensePostingService } from './ExpensePostingService';
import { isProduction } from '../config/environment';

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
      const secret = webhookSecret || process.env[`${gateway.toUpperCase()}_WEBHOOK_SECRET`];
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

    // 2. Check for duplicate event
    const existing = await db.query(
      `SELECT * FROM payment_gateway_events
       WHERE organization_id = $1 AND gateway = $2 AND event_id = $3`,
      [organizationId, gateway, eventId]
    );

    if (existing.rows.length > 0) {
      const ev = existing.rows[0];
      if (ev.status === 'PROCESSED') {
        return {
          eventId,
          status: 'ALREADY_PROCESSED',
          settlementReference: ev.settlement_reference || undefined,
        };
      }
    } else {
      // Record initial RECEIVED state
      await db.query(
        `INSERT INTO payment_gateway_events (
           id, organization_id, gateway, event_id, event_type, payload, status
         ) VALUES ($1, $2, $3, $4, $5, $6, 'RECEIVED')`,
        [newId('pge'), organizationId, gateway, eventId, eventType, JSON.stringify(payload || {})]
      );
    }

    // 3. Process payment events
    const isPaymentSuccess = [
      'payment.succeeded',
      'payment_intent.succeeded',
      'charge.successful',
      'charge.succeeded',
      'order.paid',
      'payment.captured',
    ].includes(eventType.toLowerCase());

    if (!isPaymentSuccess) {
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
      const paymentDate = (data.paymentDate || data.created_at || new Date().toISOString()).slice(0, 10);
      const bankAccountId = data.bankAccountId || data.depositAccountId || '1010';
      const reference = data.id || eventId;
      const paymentMode = gateway.toUpperCase();

      let settlementRef = `GW-${gateway.toUpperCase()}-${reference}`;

      // Perform all financial settlements and event updates in a single atomic transaction
      return await db.transaction(async (txClient) => {
        let paymentId: string | undefined;
        let expenseId: string | undefined;

        // Resolve ledger account ID for bank and fee accounts
        let ledgerAccId = '1010';
        const bRes = await txClient.query(
          `SELECT ledger_account_id FROM bank_accounts WHERE organization_id = $1 AND id = $2`,
          [organizationId, bankAccountId]
        );
        if (bRes.rows.length > 0 && bRes.rows[0].ledger_account_id) {
          ledgerAccId = bRes.rows[0].ledger_account_id;
        } else {
          const accRes = await txClient.query(
            `SELECT id FROM accounts WHERE organization_id = $1 AND (id = $2 OR code = $2)`,
            [organizationId, bankAccountId]
          );
          if (accRes.rows.length > 0) ledgerAccId = accRes.rows[0].id;
        }

        // Resolve fee expense account (e.g. 6120, 6000, or any active Expense account)
        let feeAccountId = '6000';
        const fRes = await txClient.query(
          `SELECT id FROM accounts WHERE organization_id = $1 AND (code = '6120' OR code = '6000' OR type = 'Expense') AND status = 'Active' LIMIT 1`,
          [organizationId]
        );
        if (fRes.rows.length > 0) feeAccountId = fRes.rows[0].id;

        if (invoiceId && grossAmount > 0) {
          // Record Customer Payment allocated to invoice
          const pmtRes = await SalesEngine.recordCustomerPayment(
            organizationId,
            {
              invoiceId,
              amount: grossAmount,
              paymentDate,
              paymentMode,
              depositAccountId: ledgerAccId,
              reference: settlementRef,
              notes: `Automated settlement via ${gateway} (Event: ${eventId})`,
            },
            'gateway-system',
            txClient
          );
          paymentId = pmtRes.id || pmtRes.paymentId;

          // If gateway fee charged, record gateway processing fee expense
          if (fee > 0) {
            const feeExp = await ExpensePostingService.createAndPost(
              organizationId,
              'gateway-system',
              {
                expenseAccountId: feeAccountId,
                paidFromAccountId: ledgerAccId,
                vendorName: `${gateway.toUpperCase()} Fees`,
                date: paymentDate,
                amount: fee,
                description: `Merchant processing fee for payment ${reference}`,
              },
              txClient
            );
            expenseId = feeExp.id;
          }
        }

        // Mark event as PROCESSED
        await txClient.query(
          `UPDATE payment_gateway_events
           SET status = 'PROCESSED',
               processed_at = CURRENT_TIMESTAMP,
               settlement_reference = $1,
               error_message = NULL
           WHERE organization_id = $2 AND gateway = $3 AND event_id = $4`,
          [settlementRef, organizationId, gateway, eventId]
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
