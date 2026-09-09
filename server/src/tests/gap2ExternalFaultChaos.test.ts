import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { PaymentGatewayService, WebhookEventInput } from '../services/PaymentGatewayService';

describe('Gap 2: External Webhook & Fault Chaos / Idempotency', () => {
  const ORG_ID = 'org-gap2-chaos';
  const SECRET = 'whsec_test_secret_key_1234567890';

  beforeEach(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();

    const userId = 'usr-gap2-admin';
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'gap2@admin.test', 'hashed_pass', 'Gap 2 Admin', 'Active')
       ON CONFLICT DO NOTHING`,
      [userId]
    );

    // Seed organization
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, 'uuid-gap2', 'pub-gap2', 'GAP2', 'Chaos Org', 'IN', 'INR', '₹', $2)
       ON CONFLICT DO NOTHING`,
      [ORG_ID, userId]
    );
  });

  it('1. Rejects tampered payloads, expired timestamps, and invalid HMAC signatures', () => {
    const rawBody = JSON.stringify({ event: 'charge.succeeded', id: 'evt_001', amount: 5000 });
    const now = Math.floor(Date.now() / 1000);

    // Compute valid Stripe-style signature
    const validPayload = `${now}.${rawBody}`;
    const validHmac = crypto.createHmac('sha256', SECRET).update(validPayload).digest('hex');
    const validHeader = `t=${now},v1=${validHmac}`;

    // A. Valid signature passes
    expect(PaymentGatewayService.verifyWebhookSignature(rawBody, validHeader, SECRET)).toBe(true);

    // B. Tampered rawBody fails
    const tamperedBody = JSON.stringify({ event: 'charge.succeeded', id: 'evt_001', amount: 999999 });
    expect(PaymentGatewayService.verifyWebhookSignature(tamperedBody, validHeader, SECRET)).toBe(false);

    // C. Tampered signature fails
    const tamperedHeader = `t=${now},v1=deadbeef00112233445566778899aabbccddeeff`;
    expect(PaymentGatewayService.verifyWebhookSignature(rawBody, tamperedHeader, SECRET)).toBe(false);

    // D. Expired timestamp (> 300s in past) fails
    const oldTimestamp = now - 350;
    const oldPayload = `${oldTimestamp}.${rawBody}`;
    const oldHmac = crypto.createHmac('sha256', SECRET).update(oldPayload).digest('hex');
    const expiredHeader = `t=${oldTimestamp},v1=${oldHmac}`;
    expect(PaymentGatewayService.verifyWebhookSignature(rawBody, expiredHeader, SECRET)).toBe(false);

    // E. Wrong secret fails
    expect(PaymentGatewayService.verifyWebhookSignature(rawBody, validHeader, 'wrong_secret')).toBe(false);
  });

  it('2. Atomically guarantees idempotency under concurrent duplicate webhook replays', async () => {
    const eventId = 'evt_replay_race_001';
    const payload = {
      id: eventId,
      currency: 'INR',
      amount: 10000,
    };
    const rawBody = JSON.stringify(payload);

    // Pre-seed an event that has already been processed and posted
    await db.query(
      `INSERT INTO payment_gateway_events (id, organization_id, gateway, event_id, event_type, payload, status, payment_id, settlement_reference)
       VALUES ('pge_seed_001', $1, 'mock', $2, 'charge.succeeded', $3, 'PROCESSED', 'pmt_seed_001', 'GW-MOCK-SEED')`,
      [ORG_ID, eventId, JSON.stringify(payload)]
    );

    // Fire 5 concurrent webhook delivery attempts for this already processed event
    const attempts = Array.from({ length: 5 }).map(async () => {
      const input: WebhookEventInput = {
        organizationId: ORG_ID,
        gateway: 'mock',
        eventId,
        eventType: 'charge.succeeded',
        payload,
        rawBody,
      };
      return PaymentGatewayService.processWebhook(input);
    });

    const results = await Promise.all(attempts);

    // All 5 duplicate deliveries must be recognized as ALREADY_PROCESSED with the original paymentId
    for (const result of results) {
      expect(result.status).toBe('ALREADY_PROCESSED');
      expect(result.paymentId).toBe('pmt_seed_001');
      expect(result.settlementReference).toBe('GW-MOCK-SEED');
    }

    // Verify database still has exactly 1 event record and no duplicate rows were inserted
    const rows = await db.query(
      `SELECT COUNT(*) AS total FROM payment_gateway_events WHERE organization_id = $1 AND event_id = $2`,
      [ORG_ID, eventId]
    );
    expect(Number(rows.rows[0].total)).toBe(1);
  });

  it('3. Rejects webhook processing when signature is missing on real gateways', async () => {
    const input: WebhookEventInput = {
      organizationId: ORG_ID,
      gateway: 'stripe',
      eventId: 'evt_stripe_unsigned',
      eventType: 'payment_intent.succeeded',
      payload: { id: 'pi_test' },
      rawBody: '{"id":"pi_test"}',
      // signature missing!
    };

    await expect(PaymentGatewayService.processWebhook(input)).rejects.toThrow(
      /MISSING_WEBHOOK_SIGNATURE/i
    );
  });

  it('4. Rejects webhook processing when signature verification fails', async () => {
    const input: WebhookEventInput = {
      organizationId: ORG_ID,
      gateway: 'razorpay',
      eventId: 'evt_razorpay_bad_sig',
      eventType: 'order.paid',
      payload: { id: 'order_test' },
      rawBody: '{"id":"order_test"}',
      signature: 'bad_signature_hash',
      webhookSecret: 'test_razorpay_secret',
    };

    await expect(PaymentGatewayService.processWebhook(input)).rejects.toThrow(
      /INVALID_WEBHOOK_SIGNATURE/i
    );
  });
});
