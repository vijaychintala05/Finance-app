import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { SecurityController } from '../controllers/securityController';
import { TENANT_SCOPED_TABLES } from '../database/enterpriseHardeningSchema';
import { POINT1_RECOVERY_SCHEMA } from '../recovery/schema';
import { MockGatewayAdapter } from '../gateways/MockGatewayAdapter';
import { RazorpayProviderAdapter } from '../gateways/RazorpayProviderAdapter';

describe('Release containment and provider-boundary qualification', () => {
  beforeAll(async () => {
    db.initPgMem();
    await MigrationRunner.runMigrations();
  });

  it('rejects public payment attempts before token or accounting processing when no verified provider event exists', async () => {
    const response = await request(app)
      .post('/api/v1/public/portal/nonexistent-token/pay')
      .send({ invoiceId: 'inv-unverified', amount: 100 });

    expect(response.status).toBe(501);
    expect(response.body).toMatchObject({ code: 'PUBLIC_PAYMENTS_DISABLED' });
  });

  it('does not render raw card, CVC, ACH, or UPI collection controls in the public portal', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/portal/CustomerPortalView.tsx'),
      'utf8',
    );

    expect(source).not.toContain('Card Number');
    expect(source).not.toContain('placeholder="CVC"');
    expect(source).not.toContain('Bank Routing / Account #');
    expect(source).not.toContain('VPA / UPI ID');
    expect(source).not.toContain('/api/v1/public/portal/${encodeURIComponent(activeToken)}/pay`');
  });

  it('decommissions the legacy destructive restore endpoint in favor of Recovery Center staging', async () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await SecurityController.restoreBackup({
      organizationId: 'org-recovery-containment',
      auth: { userId: 'usr-owner', role: 'Owner' },
      body: { backupId: 'bkp-legacy' },
    } as any, response);

    expect(response.status).toHaveBeenCalledWith(410);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'LEGACY_RESTORE_DISABLED',
      recoveryCenterPath: '/api/v1/recovery',
    }));
  });

  it('keeps payment intents inside tenant isolation and Recovery Center artifacts', () => {
    expect(TENANT_SCOPED_TABLES).toContain('payment_intents');
    expect(POINT1_RECOVERY_SCHEMA.some((entry) => entry.name === 'payment_intents')).toBe(true);
  });

  it('uses provider contracts that require hosted checkout and signed webhook verification', async () => {
    const mock = new MockGatewayAdapter();
    const checkout = await mock.createCheckoutSession({
      organizationId: 'org-gateway-boundary',
      invoiceId: 'inv-gateway-boundary',
      invoiceNumber: 'INV-BOUNDARY-001',
      customerId: 'cust-gateway-boundary',
      customerName: 'Hosted Checkout Customer',
      amount: 125,
      currency: 'USD',
      successUrl: 'https://app.example.test/success',
      cancelUrl: 'https://app.example.test/cancel',
      idempotencyKey: 'gateway-boundary-key',
    });
    expect(checkout.checkoutUrl).toMatch(/^https:\/\/checkout\./);
    expect(checkout.providerReference).toBeTruthy();

    const razorpay = new RazorpayProviderAdapter();
    const rawBody = '{"id":"evt_gateway_boundary"}';
    const secret = 'whsec_gateway_boundary';
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    expect(razorpay.verifyWebhook(rawBody, signature, secret)).toBe(true);
    expect(razorpay.verifyWebhook(rawBody, 'bad-signature', secret)).toBe(false);
  });
});
