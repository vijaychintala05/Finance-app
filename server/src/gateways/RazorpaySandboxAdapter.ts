import crypto from 'crypto';
import {
  PaymentProviderAdapter,
  CreateCheckoutSessionParams,
  CheckoutSessionResult,
  RefundParams,
  RefundResult,
  DisputeResult,
  SettlementResult,
} from './PaymentProviderAdapter';

/**
 * Explicit Sandbox & Simulation Gateway Adapter for Razorpay.
 * Used for offline development, local automated testing, and simulated sandboxes.
 * Generates deterministic mock orders and verifies cryptographic test webhook signatures.
 */
export class RazorpaySandboxAdapter implements PaymentProviderAdapter {
  public readonly gatewayName = 'razorpay_sandbox';

  public async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const orderId = `order_${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const checkoutUrl = `https://checkout.razorpay.com/v1/checkout.html?order_id=${orderId}`;

    return {
      sessionId: orderId,
      providerReference: orderId,
      checkoutUrl,
      clientSecret: `${orderId}_sec_${crypto.randomBytes(6).toString('hex')}`,
      expiresAt,
      status: 'created',
    };
  }

  public verifyWebhook(
    rawBody: string,
    signatureHeader: string,
    secret: string
  ): boolean {
    if (!rawBody || !signatureHeader || !secret) return false;

    try {
      const cleanSig = signatureHeader.replace(/^sha256=/, '').trim();
      const expectedSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      if (expectedSig.length !== cleanSig.length) {
        return false;
      }

      return crypto.timingSafeEqual(
        Buffer.from(expectedSig, 'utf8'),
        Buffer.from(cleanSig, 'utf8')
      );
    } catch {
      return false;
    }
  }

  public async createRefund(params: RefundParams): Promise<RefundResult> {
    const refundId = `rfnd_${crypto.randomBytes(8).toString('hex')}`;
    return {
      refundId,
      amount: params.amount,
      currency: params.currency || 'INR',
      status: 'succeeded',
    };
  }

  public async getDispute(disputeId: string): Promise<DisputeResult | null> {
    return {
      disputeId,
      paymentReference: `pay_rzp_${crypto.randomBytes(8).toString('hex')}`,
      amount: 0,
      currency: 'INR',
      status: 'under_review',
    };
  }

  public async getSettlement(settlementId: string): Promise<SettlementResult | null> {
    return {
      settlementId,
      amount: 0,
      currency: 'INR',
      status: 'paid',
    };
  }
}
