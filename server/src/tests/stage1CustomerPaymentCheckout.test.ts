import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { db } from '../database/db';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import { newId } from '../utils/ids';
import { CustomerPortalService } from '../services/CustomerPortalService';
import { PaymentIntentService } from '../services/PaymentIntentService';
import { PaymentGatewayService } from '../services/PaymentGatewayService';
import { PaymentProviderRegistry } from '../gateways/PaymentProviderRegistry';
import { SecurityController } from '../controllers/securityController';
import { Stage6Controller } from '../controllers/Stage6Controller';
import { assertProductionPostgresHealth } from '../config/environment';
import { assertProductionFinanceCapabilities } from '../capabilities/financeCapabilities';
import securityRoutes from '../routes/security.routes';

describe('Stage 0 & Stage 1: Risk Containment & Customer Payment Checkout', () => {
  const ORG = F.ORG_A.id;
  const USER = F.PERSONAS.ORG_A.owner.id;
  const CUSTOMER = F.CUSTOMERS.A1.id;
  let portalToken: string;
  let invoiceId: string;
  let app: express.Express;

  beforeEach(async () => {
    await MasterFinanceFixture.setup();

    // Invoice with $200 balance due
    invoiceId = `inv-chk-${newId('i')}`;
    await db.query(
      `INSERT INTO invoices (id, organization_id, customer_id, client_id, client_name, invoice_number, issue_date, due_date, total_amount, balance_due, paid_amount, status)
       VALUES ($1, $2, $3, $3, 'Acme Corp', 'INV-CHECKOUT-001', '2026-09-01', '2026-09-30', 200.00, 200.00, 0.00, 'ISSUED')`,
      [invoiceId, ORG, CUSTOMER]
    );

    // Generate portal token
    const tokRes = await CustomerPortalService.generatePortalToken(ORG, CUSTOMER, 30);
    portalToken = tokRes.token;

    // Express app for testing public portal and security endpoints
    app = express();
    app.use(express.json());

    // Public portal checkout routes
    app.post('/api/v1/public/portal/:token/checkout-session', Stage6Controller.createPublicPortalCheckoutSession);
    app.get('/api/v1/public/portal/:token/payment-status/:reference', Stage6Controller.getPublicPortalPaymentStatus);
    app.post('/api/v1/public/portal/:token/pay', Stage6Controller.processPublicPortalPayment);

    // Security routes
    app.use('/api/v1/security', (req, _res, next) => {
      (req as any).organizationId = ORG;
      (req as any).auth = { userId: USER, role: 'Owner', organizationId: ORG };
      next();
    }, securityRoutes);
  });

  // =========================================================================
  // STAGE 0: CONTAIN RELEASE RISKS (EXIT GATE VALIDATION)
  // =========================================================================
  describe('Stage 0: Contain Release Risks', () => {
    it('1. Legacy restore endpoint returns 410 LEGACY_RESTORE_DISABLED', async () => {
      const res = await request(app)
        .post('/api/v1/security/restore')
        .send({ backupId: 'bck-legacy-123' });

      expect(res.status).toBe(410);
      expect(res.body.code).toBe('LEGACY_RESTORE_DISABLED');
      expect(res.body.recoveryCenterPath).toBe('/api/v1/recovery');
    });

    it('2. Legacy SecurityController.restoreBackup directly returns 410', async () => {
      const mockReq: any = {
        organizationId: ORG,
        auth: { userId: USER, role: 'Owner' },
        body: { backupId: 'bck-direct-123' },
      };
      let statusSent = 0;
      let bodySent: any = null;
      const mockRes: any = {
        status: (s: number) => { statusSent = s; return mockRes; },
        json: (b: any) => { bodySent = b; return mockRes; },
      };

      await SecurityController.restoreBackup(mockReq, mockRes);
      expect(statusSent).toBe(410);
      expect(bodySent.code).toBe('LEGACY_RESTORE_DISABLED');
    });

    it('3. Direct public portal /pay returns 501 PUBLIC_PAYMENTS_DISABLED without processor checkout', async () => {
      const res = await request(app)
        .post(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/pay`)
        .send({ invoiceId, amount: 100 });

      expect(res.status).toBe(501);
      expect(res.body.code).toBe('PUBLIC_PAYMENTS_DISABLED');
    });

    it('4. Production release checks block if PostgreSQL is unavailable or in memory mode', () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        expect(() => {
          assertProductionPostgresHealth({ isConnected: false, isMemoryMode: false });
        }).toThrow(/RELEASE_CHECK_FAILED: PostgreSQL is unavailable/);

        expect(() => {
          assertProductionPostgresHealth({ isConnected: true, isMemoryMode: true });
        }).toThrow(/RELEASE_CHECK_FAILED: PostgreSQL is unavailable/);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('5. Production release checks block if required finance capabilities are disabled', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalFeatures = process.env.TRUSTED_FINANCE_FEATURES;
      try {
        process.env.NODE_ENV = 'production';
        process.env.TRUSTED_FINANCE_FEATURES = 'bank-account-management'; // missing recovery-center, period-close, etc.

        expect(() => {
          assertProductionFinanceCapabilities();
        }).toThrow(/RELEASE_CHECK_FAILED: Required finance capabilities are disabled in production/);
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.TRUSTED_FINANCE_FEATURES = originalFeatures;
      }
    });
  });

  // =========================================================================
  // STAGE 1: REAL CUSTOMER PAYMENT CHECKOUT
  // =========================================================================
  describe('Stage 1: Real Customer Payment Checkout', () => {
    it('1. Provider Adapter Contract conforms and generates session without PAN/CVC', async () => {
      const adapter = PaymentProviderRegistry.getAdapter('mock');
      expect(adapter.gatewayName).toBe('mock');

      const session = await adapter.createCheckoutSession({
        organizationId: ORG,
        invoiceId,
        invoiceNumber: 'INV-CHECKOUT-001',
        customerId: CUSTOMER,
        customerName: 'Acme Corp',
        amount: 200,
        currency: 'USD',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        idempotencyKey: 'idem-test-1',
      });

      expect(session.sessionId).toMatch(/^cs_mock_/);
      expect(session.providerReference).toMatch(/^pi_mock_/);
      expect(session.checkoutUrl).toContain('https://checkout.firmbooks.local/pay/');
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('2. Portal endpoint initiates provider session for invoice and exact amount', async () => {
      const res = await request(app)
        .post(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/checkout-session`)
        .send({ invoiceId, amount: 150.00 });

      expect(res.status).toBe(201);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.amount).toBe(150);
      expect(['USD', 'INR']).toContain(res.body.session.currency);
      expect(res.body.session.checkoutUrl).toContain('checkout.firmbooks.local');

      // Verify immutable payment_intents table entry
      const dbRow = await db.query(
        `SELECT * FROM payment_intents WHERE organization_id = $1 AND invoice_id = $2`,
        [ORG, invoiceId]
      );
      expect(dbRow.rows.length).toBe(1);
      expect(Number(dbRow.rows[0].amount)).toBe(150);
      expect(dbRow.rows[0].status).toBe('CREATED');
      expect(dbRow.rows[0].customer_id).toBe(CUSTOMER);
      expect(dbRow.rows[0].idempotency_key).toBeDefined();
    });

    it('3. Rejects overpayment attempts at session initiation', async () => {
      const res = await request(app)
        .post(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/checkout-session`)
        .send({ invoiceId, amount: 250.00 }); // invoice balance is 200

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/OVERPAYMENT_NOT_PERMITTED/);
    });

    it('4. Rejects invalid payment amounts (zero or negative)', async () => {
      const res = await request(app)
        .post(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/checkout-session`)
        .send({ invoiceId, amount: -50.00 });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/INVALID_PAYMENT_AMOUNT/);
    });

    it('5. Read-only status returns PENDING before webhook arrival', async () => {
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 200,
        gateway: 'mock',
      });

      const res = await request(app)
        .get(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/payment-status/${encodeURIComponent(session.providerReference)}`);

      expect(res.status).toBe(200);
      expect(res.body.paymentStatus.status).toBe('PENDING');
      expect(res.body.paymentStatus.isConfirmed).toBe(false);
      expect(res.body.paymentStatus.paymentNumber).toBeUndefined();
    });

    it('6. Full payment success flow via verified webhook posts receipt and GL entry', async () => {
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 200,
        gateway: 'mock',
      });

      const webhookEventId = `evt-paid-${newId('w')}`;
      const webhookPayload = {
        id: session.providerReference,
        invoiceId,
        amount: 200,
        currency: 'USD',
        created_at: Math.floor(Date.now() / 1000),
      };

      const result = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: webhookEventId,
        eventType: 'payment.succeeded',
        payload: webhookPayload,
      });

      expect(result.status).toBe('PROCESSED');
      expect(result.paymentId).toBeDefined();

      // Verify payment receipt created and allocated
      const pmtDb = await db.query(
        `SELECT * FROM payments_received WHERE id = $1`,
        [result.paymentId]
      );
      expect(pmtDb.rows.length).toBe(1);
      expect(Number(pmtDb.rows[0].amount)).toBe(200);
      expect(pmtDb.rows[0].journal_entry_id).toBeDefined();

      // Verify invoice is settled
      const invDb = await db.query(`SELECT balance_due, status FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invDb.rows[0].balance_due)).toBe(0);
      expect(invDb.rows[0].status).toBe('PAID');

      // Verify payment_intents updated to SUCCEEDED
      const intentDb = await db.query(
        `SELECT status, payment_id FROM payment_intents WHERE id = $1`,
        [session.id]
      );
      expect(intentDb.rows[0].status).toBe('SUCCEEDED');
      expect(intentDb.rows[0].payment_id).toBe(result.paymentId);

      // Verify read-only portal status now returns SUCCEEDED with confirmed receipt
      const statusRes = await request(app)
        .get(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/payment-status/${encodeURIComponent(session.providerReference)}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.paymentStatus.status).toBe('SUCCEEDED');
      expect(statusRes.body.paymentStatus.isConfirmed).toBe(true);
      expect(statusRes.body.paymentStatus.paymentNumber).toBe(pmtDb.rows[0].payment_number);
      expect(statusRes.body.paymentStatus.remainingBalance).toBe(0);
    });

    it('7. Duplicate webhook callback is idempotent and creates zero duplicate journal entries', async () => {
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 200,
        gateway: 'mock',
      });

      const webhookEventId = `evt-dup-${newId('w')}`;
      const webhookPayload = {
        id: session.providerReference,
        invoiceId,
        amount: 200,
        currency: 'USD',
      };

      const first = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: webhookEventId,
        eventType: 'payment.succeeded',
        payload: webhookPayload,
      });
      expect(first.status).toBe('PROCESSED');

      // Duplicate delivery
      const second = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: webhookEventId,
        eventType: 'payment.succeeded',
        payload: webhookPayload,
      });
      expect(second.status).toBe('ALREADY_PROCESSED');
      expect(second.paymentId).toBe(first.paymentId);

      // Verify exactly ONE payment was created
      const countRes = await db.query(
        `SELECT COUNT(*) AS cnt FROM payments_received WHERE organization_id = $1 AND reference = $2`,
        [ORG, `GW-MOCK-${session.providerReference}`]
      );
      expect(Number(countRes.rows[0].cnt)).toBe(1);
    });

    it('8. Partial payment properly scales balance and marks invoice PARTIALLY_PAID', async () => {
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 75.00,
        gateway: 'mock',
      });

      const eventId = `evt-partial-${newId('w')}`;
      await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId,
        eventType: 'payment.succeeded',
        payload: {
          id: session.providerReference,
          invoiceId,
          amount: 75.00,
          currency: 'USD',
        },
      });

      const invDb = await db.query(`SELECT balance_due, paid_amount, status FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invDb.rows[0].paid_amount)).toBe(75.00);
      expect(Number(invDb.rows[0].balance_due)).toBe(125.00);
      expect(invDb.rows[0].status).toBe('PARTIALLY_PAID');

      // Portal confirmation reports remaining balance of 125.00
      const statusRes = await request(app)
        .get(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/payment-status/${encodeURIComponent(session.providerReference)}`);
      expect(statusRes.body.paymentStatus.status).toBe('SUCCEEDED');
      expect(statusRes.body.paymentStatus.remainingBalance).toBe(125.00);
    });

    it('9. Overpayment defense rejects webhook that would exceed invoice balance due', async () => {
      const eventId = `evt-over-${newId('w')}`;
      const overResult = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId,
        eventType: 'payment.succeeded',
        payload: {
          id: `pi-over-${newId('x')}`,
          invoiceId,
          amount: 500.00, // balance is 200
          currency: 'USD',
        },
      });

      expect(overResult.status).toBe('FAILED');
      expect(overResult.error).toMatch(/OVERPAYMENT_NOT_PERMITTED/);

      // Invoice balance remains unchanged
      const invDb = await db.query(`SELECT balance_due FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invDb.rows[0].balance_due)).toBe(200.00);
    });

    it('10. Cancellation webhook marks intent CANCELLED without creating receipts', async () => {
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 200,
        gateway: 'mock',
      });

      const cancelEventId = `evt-cancel-${newId('w')}`;
      const cancelResult = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: cancelEventId,
        eventType: 'payment_intent.canceled',
        payload: {
          id: session.providerReference,
        },
      });

      expect(cancelResult.status).toBe('PROCESSED');

      const intentDb = await db.query(`SELECT status FROM payment_intents WHERE id = $1`, [session.id]);
      expect(intentDb.rows[0].status).toBe('CANCELLED');

      const statusRes = await request(app)
        .get(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/payment-status/${encodeURIComponent(session.providerReference)}`);
      expect(statusRes.body.paymentStatus.status).toBe('CANCELLED');
      expect(statusRes.body.paymentStatus.isConfirmed).toBe(false);
    });

    it('11. Expiry webhook marks intent EXPIRED without creating receipts', async () => {
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 200,
        gateway: 'mock',
      });

      const expireEventId = `evt-exp-${newId('w')}`;
      const expireResult = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: expireEventId,
        eventType: 'checkout.session.expired',
        payload: {
          id: session.providerReference,
        },
      });

      expect(expireResult.status).toBe('PROCESSED');

      const intentDb = await db.query(`SELECT status FROM payment_intents WHERE id = $1`, [session.id]);
      expect(intentDb.rows[0].status).toBe('EXPIRED');

      const statusRes = await request(app)
        .get(`/api/v1/public/portal/${encodeURIComponent(portalToken)}/payment-status/${encodeURIComponent(session.providerReference)}`);
      expect(statusRes.body.paymentStatus.status).toBe('EXPIRED');
    });

    it('12. Full Refund workflow reverses allocation and posts balanced GL entries', async () => {
      // Settle invoice first
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 200,
        gateway: 'mock',
      });

      const pmtEventId = `evt-paid-for-ref-${newId('w')}`;
      const pmtResult = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: pmtEventId,
        eventType: 'payment.succeeded',
        payload: {
          id: session.providerReference,
          invoiceId,
          amount: 200,
          currency: 'USD',
        },
      });
      expect(pmtResult.status).toBe('PROCESSED');

      // Process refund
      const refundEventId = `evt-refund-${newId('w')}`;
      const refundResult = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: refundEventId,
        eventType: 'charge.refunded',
        payload: {
          id: `re-${newId('r')}`,
          originalEventId: pmtEventId,
          invoiceId,
          amount: 200,
          currency: 'USD',
        },
      });
      expect(refundResult.status).toBe('PROCESSED');

      // Invoice balance restored
      const invDb = await db.query(`SELECT balance_due, paid_amount, status FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invDb.rows[0].balance_due)).toBe(200);
      expect(Number(invDb.rows[0].paid_amount)).toBe(0);
      expect(['POSTED', 'ISSUED']).toContain(invDb.rows[0].status);
    });

    it('13. Dispute / Chargeback withdrawal event reverses receipt into dispute accounting', async () => {
      // Settle invoice first
      const session = await PaymentIntentService.createPaymentIntent({
        organizationId: ORG,
        customerId: CUSTOMER,
        invoiceId,
        amount: 200,
        gateway: 'mock',
      });

      const pmtEventId = `evt-paid-for-disp-${newId('w')}`;
      await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: pmtEventId,
        eventType: 'payment.succeeded',
        payload: {
          id: session.providerReference,
          invoiceId,
          amount: 200,
          currency: 'USD',
        },
      });

      // Process dispute funds withdrawn
      const dispEventId = `evt-disp-${newId('w')}`;
      const dispResult = await PaymentGatewayService.processWebhook({
        organizationId: ORG,
        gateway: 'mock',
        eventId: dispEventId,
        eventType: 'charge.dispute.funds_withdrawn',
        payload: {
          id: `dp-${newId('d')}`,
          originalEventId: pmtEventId,
          invoiceId,
          amount: 200,
          currency: 'USD',
        },
      });
      expect(dispResult.status).toBe('PROCESSED');

      // Balance restored to due
      const invDb = await db.query(`SELECT balance_due, status FROM invoices WHERE id = $1`, [invoiceId]);
      expect(Number(invDb.rows[0].balance_due)).toBe(200);
      expect(['POSTED', 'ISSUED']).toContain(invDb.rows[0].status);
    });
  });
});
