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

export class MockGatewayAdapter implements PaymentProviderAdapter {
  public readonly gatewayName = 'mock';

  public async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const sessionId = `cs_mock_${randomSuffix}`;
    const providerReference = `pi_mock_${randomSuffix}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

    const checkoutUrl = `https://checkout.firmbooks.local/pay/${sessionId}?inv=${encodeURIComponent(params.invoiceNumber)}&amt=${params.amount}&cur=${params.currency}`;

    return {
      sessionId,
      providerReference,
      checkoutUrl,
      clientSecret: `mock_secret_${randomSuffix}`,
      expiresAt,
      status: 'created',
    };
  }

  public verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
    if (!rawBody || !signature || !secret) return false;
    try {
      const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      const cleanSig = signature.replace(/^sha256=/, '').trim();
      return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(cleanSig));
    } catch {
      return false;
    }
  }

  public async createRefund(params: RefundParams): Promise<RefundResult> {
    const refundId = `re_mock_${crypto.randomBytes(8).toString('hex')}`;
    return {
      refundId,
      amount: params.amount,
      currency: params.currency,
      status: 'succeeded',
    };
  }

  public async getDispute(disputeId: string): Promise<DisputeResult | null> {
    return {
      disputeId,
      paymentReference: `pi_mock_ref`,
      amount: 100,
      currency: 'USD',
      status: 'under_review',
      reason: 'fraudulent',
    };
  }

  public async getSettlement(settlementId: string): Promise<SettlementResult | null> {
    return {
      settlementId,
      amount: 500,
      currency: 'USD',
      status: 'paid',
    };
  }
}
