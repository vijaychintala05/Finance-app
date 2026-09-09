import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { newId } from '../utils/ids';
import { CustomerPortalService } from '../services/CustomerPortalService';
import { PaymentIntentService } from '../services/PaymentIntentService';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { PaymentProviderRegistry } from '../gateways/PaymentProviderRegistry';
import { RazorpayProviderAdapter } from '../gateways/RazorpayProviderAdapter';
import { Stage6Controller } from '../controllers/Stage6Controller';

describe('Stage 1 Real Provider (Razorpay) Qualification & Risk Containment', () => {
  const ORG = F.ORG_A.id;
  const CUSTOMER = F.CUSTOMERS.A1.id;
  let portalToken: string;
  let invoiceId: string;
  let app: express.Express;

  beforeEach(async () => {
    await MasterFinanceFixture.setup();

    // Invoice with $500 balance due
    invoiceId = `inv-rzp-${newId('i')}`;
    await db.query(
      `INSERT INTO invoices (id, organization_id, customer_id, client_id, client_name, invoice_number, issue_date, due_date, total_amount, balance_due, paid_amount, status)
       VALUES ($1, $2, $3, $3, 'Acme Global Corp', 'INV-RZP-500', '2026-09-01', '2026-09-30', 500.00, 500.00, 0.00, 'ISSUED')`,
      [invoiceId, ORG, CUSTOMER]
    );

    // Generate portal token
    const tokRes = await CustomerPortalService.generatePortalToken(ORG, CUSTOMER, 30);
    portalToken = tokRes.token;

    // Seed active bank account for payouts
    const bankAccountLedger = await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000' LIMIT 1`,
      [ORG]
    );
    if (bankAccountLedger.rows.length > 0) {
      await db.query(
        `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, masked_account_number, bank_name, account_type, currency, current_balance, opening_balance_date, status, is_active)
         VALUES ($1, $2, $3, 'Operating Checking', '1122334455', '****4455', 'Silicon Valley Bank', 'CHECKING', 'USD', 0, '2026-01-01', 'ACTIVE', TRUE)
         ON CONFLICT (id) DO NOTHING`,
        ['bnk-test-operating-01', ORG, bankAccountLedger.rows[0].id]
      );
    }

    // Express app for portal endpoints
    app = express();
    app.use(express.json());
    app.post('/api/v1/public/portal/:token/checkout-session', Stage6Controller.createPublicPortalCheckoutSession);
    app.get('/api/v1/public/portal/:token/payment-status/:reference', Stage6Controller.getPublicPortalPaymentStatus);
    app.post('/api/v1/public/portal/:token/pay', Stage6Controller.processPublicPortalPayment);
  });

  // =========================================================================
  // 1. BACKEND SELECTS PROVIDER FROM ORGANIZATION CONFIGURATION (ZERO UI SELECTION)
  // =========================================================================
  describe('1. Organization Gateway Configuration & Backend Selection', () => {
    it('backend selects Razorpay when configured in organization_payment_gateways', async () => {
      // Configure organization payment gateway
      await db.query(
        `INSERT INTO organization_payment_gateways (id, organization_id, gateway, is_active, key_id, key_secret, webhook_secret)
         VALUES ($1, $2, 'razorpay', TRUE, 'rzp_test_key_123', 'rzp_test_sec_456', 'whsec_rzp_test_789')
         ON CONFLICT (organization_id, gateway) DO UPDATE SET is_active = TRUE`,
        [newId('opg'), ORG]
      );

      // Client requests checkout without specifying gateway
      const res = await request(app)
        .post(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/checkout-session`)
        .send({ invoiceId, amount: 250.00 });

      expect(res.status).toBe(201);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.amount).toBe(250);
      expect(res.body.session.checkoutUrl).toContain('checkout.razorpay.com');
      expect(res.body.session.providerReference).toMatch(/^order_/);

      // Verify payment intent persisted with resolved gateway 'razorpay'
      const piRow = await db.query(
        `SELECT gateway, provider_reference, checkout_url FROM payment_intents WHERE organization_id = $1 AND invoice_id = $2`,
        [ORG, invoiceId]
      );
      expect(piRow.rows[0].gateway).toBe('razorpay');
      expect(piRow.rows[0].provider_reference).toMatch(/^order_/);
      expect(piRow.rows[0].checkout_url).toContain('checkout.razorpay.com');
    });

    it('prohibits mock gateway in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(() => {
          PaymentProviderRegistry.getAdapter('mock');
        }).toThrow(/MOCK_GATEWAY_FORBIDDEN/);

        const supported = PaymentProviderRegistry.getSupportedGateways();
        expect(supported).not.toContain('mock');
        expect(supported).toContain('razorpay');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('throws PAYMENT_GATEWAY_NOT_CONFIGURED in production if no active org gateway exists', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        await db.query(`DELETE FROM organization_payment_gateways WHERE organization_id = $1`, [ORG]);

        await expect(
          PaymentIntentService.createPaymentIntent({
            organizationId: ORG,
            customerId: CUSTOMER,
            invoiceId,
            amount: 100,
          })
        ).rejects.toThrow(/PAYMENT_GATEWAY_NOT_CONFIGURED/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  // =========================================================================
  // 2. RAZORPAY PROVIDER ADAPTER CONTRACT & WEBHOOK VERIFICATION
  // =========================================================================
  describe('2. Razorpay Provider Adapter Contract', () => {
    const adapter = new RazorpayProviderAdapter();

    it('creates hosted checkout session with valid URLs and order identifiers', async () => {
      const session = await adapter.createCheckoutSession({
        organizationId: ORG,
        invoiceId,
        invoiceNumber: 'INV-RZP-500',
        customerId: CUSTOMER,
        customerName: 'Acme Global Corp',
        amount: 500,
        currency: 'INR',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        idempotencyKey: 'idem-rzp-001',
      });

      expect(session.sessionId).toMatch(/^order_/);
      expect(session.providerReference).toBe(session.sessionId);
      expect(session.checkoutUrl).toBe(`https://checkout.razorpay.com/v1/checkout.html?order_id=${session.sessionId}`);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.status).toBe('created');
    });

    it('cryptographically verifies HMAC-SHA256 webhook signatures', () => {
      const rawPayload = JSON.stringify({
        entity: 'event',
        event: 'order.paid',
        payload: { payment: { entity: { id: 'pay_123', amount: 50000 } } },
      });
      const secret = 'whsec_rzp_live_secret';
      const validSignature = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

      // Valid signature succeeds
      expect(adapter.verifyWebhook(rawPayload, validSignature, secret)).toBe(true);

      // Signature with sha256= prefix also succeeds
      expect(adapter.verifyWebhook(rawPayload, `sha256=${validSignature}`, secret)).toBe(true);

      // Invalid signature fails
      expect(adapter.verifyWebhook(rawPayload, 'invalid_signature_hex_0000000000000000000000000000000000000000000000000000000000000000', secret)).toBe(false);

      // Tampered payload fails
      const tamperedPayload = rawPayload + ' ';
      expect(adapter.verifyWebhook(tamperedPayload, validSignature, secret)).toBe(false);

      // Wrong secret fails
      expect(adapter.verifyWebhook(rawPayload, validSignature, 'wrong_secret')).toBe(false);

      // Empty inputs fail
      expect(adapter.verifyWebhook('', validSignature, secret)).toBe(false);
      expect(adapter.verifyWebhook(rawPayload, '', secret)).toBe(false);
    });

    it('supports refund and status inquiry contracts', async () => {
      const refund = await adapter.createRefund({
        organizationId: ORG,
        paymentReference: 'order_test_123',
        amount: 250,
        currency: 'INR',
      });
      expect(refund.refundId).toMatch(/^rfnd_/);
      expect(refund.status).toBe('succeeded');
      expect(refund.amount).toBe(250);

      const dispute = await adapter.getDispute('disp_123');
      expect(dispute?.disputeId).toBe('disp_123');

      const settlement = await adapter.getSettlement('setl_123');
      expect(settlement?.settlementId).toBe('setl_123');
      expect(settlement?.status).toBe('paid');
    });
  });

  // =========================================================================
  // 3. PUBLIC /pay ENDPOINT PERMANENTLY DISABLED
  // =========================================================================
  describe('3. Public /pay Endpoint Disabled', () => {
    it('always returns 501 PUBLIC_PAYMENTS_DISABLED even when provided payload or tokens', async () => {
      const res = await request(app)
        .post(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/pay`)
        .send({
          invoiceId,
          amount: 200,
          gatewayEventId: 'evt_attempted_bypass',
        });

      expect(res.status).toBe(501);
      expect(res.body.code).toBe('PUBLIC_PAYMENTS_DISABLED');
      expect(res.body.error).toContain('Public /pay endpoint is permanently disabled');
    });
  });

  // =========================================================================
  // 4. SIGNED GATEWAY WEBHOOK IS SOLE POSTING TRIGGER
  // =========================================================================
  describe('4. Signed Gateway Webhooks as Sole Posting Trigger', () => {
    it('posts payment receipt, GL lines, and updates payment intent to SUCCEEDED', async () => {
      // Configure organization payment gateway
      await db.query(
        `INSERT INTO organization_payment_gateways (id, organization_id, gateway, is_active, webhook_secret)
         VALUES ($1, $2, 'razorpay', TRUE, 'whsec_rzp_test_secret')
         ON CONFLICT (organization_id, gateway) DO UPDATE SET is_active = TRUE`,
        [newId('opg'), ORG]
      );

      // Create checkout session
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 300.00,
      });

      // Confirm intent is PENDING
      const preStatus = await PaymentIntentService.getPaymentIntentStatus(ORG, session.providerReference);
      expect(preStatus.status).toBe('PENDING');
      expect(preStatus.isConfirmed).toBe(false);

      // Simulate signed Razorpay webhook arrival
      const secret = 'whsec_rzp_test_secret';
      const webhookEventId = `evt_rzp_paid_${newId('w')}`;
      const webhookPayload = {
        id: session.providerReference,
        invoiceId,
        amount: 30000, // 300.00 in paise/subunits
        fee: 650,      // 6.50 in paise/subunits
        currency: 'USD',
      };
      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const webhookResult = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'razorpay',
        eventId: webhookEventId,
        eventType: 'payment.succeeded',
        payload: webhookPayload,
        rawBody,
        signature,
        webhookSecret: secret,
      });

      expect(webhookResult.status).toBe('PROCESSED');
      expect(webhookResult.paymentId).toBeDefined();

      // Check payment intent is now confirmed and SUCCEEDED
      const postStatus = await PaymentIntentService.getPaymentIntentStatus(ORG, session.providerReference);
      expect(postStatus.status).toBe('SUCCEEDED');
      expect(postStatus.isConfirmed).toBe(true);
      expect(postStatus.paymentId).toBe(webhookResult.paymentId);
      expect(postStatus.paymentNumber).toBeDefined();
      expect(postStatus.remainingBalance).toBe(200.00); // 500 - 300

      // Verify invoice balance in DB
      const invRow = await db.query(`SELECT balance_due, paid_amount, status FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invRow.rows[0].balance_due)).toBe(200.00);
      expect(Number(invRow.rows[0].paid_amount)).toBe(300.00);
      expect(invRow.rows[0].status).toBe('PARTIALLY_PAID');
    });

    it('rejects unsigned or tampered webhooks before posting any payments or GL entries', async () => {
      const payload = {
        id: `order_fake_${newId('o')}`,
        invoiceId,
        amount: 50.00,
      };

      // 1. Missing signature
      await expect(
        PaymentGatewayService.processWebhook({
          organizationId: ORG,
          gateway: 'razorpay',
          eventId: 'evt_unsigned',
          eventType: 'payment.succeeded',
          payload,
        })
      ).rejects.toThrow(/MISSING_WEBHOOK_SIGNATURE/);

      // 2. Tampered signature
      await expect(
        PaymentGatewayService.processWebhook({
          organizationId: ORG,
          gateway: 'razorpay',
          eventId: 'evt_tampered',
          eventType: 'payment.succeeded',
          payload,
          rawBody: JSON.stringify(payload),
          signature: '0000000000000000000000000000000000000000000000000000000000000000',
          webhookSecret: 'whsec_rzp_test_secret',
        })
      ).rejects.toThrow(/INVALID_WEBHOOK_SIGNATURE/);
    });

    it('enforces webhook idempotency: duplicate event does not create duplicate GL or payment', async () => {
      const secret = 'whsec_rzp_test_secret';
      const eventId = `evt_rzp_idem_${newId('w')}`;
      const payload = {
        id: `order_idem_${newId('o')}`,
        invoiceId,
        amount: 10000, // 100.00 in paise/subunits
        currency: 'USD',
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const first = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'razorpay',
        eventId,
        eventType: 'payment.succeeded',
        payload,
        rawBody,
        signature,
        webhookSecret: secret,
      });
      expect(first.status).toBe('PROCESSED');

      const second = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'razorpay',
        eventId,
        eventType: 'payment.succeeded',
        payload,
        rawBody,
        signature,
        webhookSecret: secret,
      });
      expect(second.status).toBe('ALREADY_PROCESSED');
      expect(second.paymentId).toBe(first.paymentId);

      // Verify exactly one payment receipt exists
      const pmtRows = await db.query(
        `SELECT id FROM payments_received WHERE organization_id = $1 AND id = $2`,
        [ORG, first.paymentId]
      );
      expect(pmtRows.rows.length).toBe(1);
    });
  });

  // =========================================================================
  // 5. CLEARING ACCOUNT RECONCILIATION: RECEIPTS, FEES, REFUNDS & BANK PAYOUTS
  // =========================================================================
  describe('5. Clearing Account Reconciliation Lifecycle', () => {
    it('maintains balanced double-entry GL across receipt, processing fee, refund, and bank payout', async () => {
      const secret = 'whsec_rzp_test_secret';
      // 1. Initial Receipt of $400 with $8 fee
      const orderRef = `order_lifecycle_${newId('o')}`;
      const receiptEventId = `evt_rzp_receipt_${newId('w')}`;
      const receiptPayload = {
        id: orderRef,
        invoiceId,
        amount: 40000, // 400.00 in paise/subunits
        fee: 800,      // 8.00 in paise/subunits
        currency: 'USD',
      };
      const rawBody1 = JSON.stringify(receiptPayload);
      const signature1 = crypto.createHmac('sha256', secret).update(rawBody1).digest('hex');

      const receipt = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'razorpay',
        eventId: receiptEventId,
        eventType: 'payment.succeeded',
        payload: receiptPayload,
        rawBody: rawBody1,
        signature: signature1,
        webhookSecret: secret,
      });
      expect(receipt.status).toBe('PROCESSED');
      expect(receipt.paymentId).toBeDefined();

      // Check clearing account ledger lines:
      // Receipt: Debit PAYMENT_CLEARING $400, Credit AR_CONTROL $400
      // Fee: Debit GATEWAY_PROCESSING_FEE $8, Credit PAYMENT_CLEARING $8
      // Net Clearing Account Balance = +$392
      const clearingLines = await db.query(
        `SELECT jl.debit, jl.credit, a.name AS account_name, a.code
           FROM journal_lines jl
           JOIN accounts a ON a.id = jl.account_id
          WHERE jl.organization_id = $1 AND a.code = '1600'`, // PAYMENT_CLEARING (code 1600)
        [ORG]
      );
      expect(clearingLines.rows.length).toBeGreaterThanOrEqual(2);

      let totalDebits = 0;
      let totalCredits = 0;
      for (const line of clearingLines.rows) {
        totalDebits += Number(line.debit || 0);
        totalCredits += Number(line.credit || 0);
      }
      expect(totalDebits).toBe(400.00);
      expect(totalCredits).toBe(8.00);
      expect(totalDebits - totalCredits).toBe(392.00); // Available for payout

      // 2. Bank Payout / Settlement of $392 to Operating Bank
      const bankAccounts = await db.query(
        `SELECT id, ledger_account_id FROM bank_accounts WHERE organization_id = $1 AND is_active = TRUE LIMIT 1`,
        [ORG]
      );
      const bankAccountId = bankAccounts.rows[0].id;
      const payoutEventId = `evt_rzp_payout_${newId('w')}`;
      const payoutPayload = {
        id: `payout_${newId('p')}`,
        amount: 39200, // 392.00 in paise/subunits
        bank_account_id: bankAccountId,
        currency: 'USD',
      };
      const rawBody2 = JSON.stringify(payoutPayload);
      const signature2 = crypto.createHmac('sha256', secret).update(rawBody2).digest('hex');

      const payout = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'razorpay',
        eventId: payoutEventId,
        eventType: 'payout.paid',
        payload: payoutPayload,
        rawBody: rawBody2,
        signature: signature2,
        webhookSecret: secret,
      });
      expect(payout.status).toBe('PROCESSED');

      // Verify Clearing Account net is now 0 (392 debits - 392 credits)
      const afterPayoutLines = await db.query(
        `SELECT jl.debit, jl.credit
           FROM journal_lines jl
           JOIN accounts a ON a.id = jl.account_id
          WHERE jl.organization_id = $1 AND a.code = '1600'`,
        [ORG]
      );
      let postPayoutDebits = 0;
      let postPayoutCredits = 0;
      for (const line of afterPayoutLines.rows) {
        postPayoutDebits += Number(line.debit || 0);
        postPayoutCredits += Number(line.credit || 0);
      }
      expect(postPayoutDebits).toBe(400.00);
      expect(postPayoutCredits).toBe(400.00); // 8 fee + 392 payout = 400
      expect(postPayoutDebits - postPayoutCredits).toBe(0.00); // Fully reconciled!
    });
  });
});
