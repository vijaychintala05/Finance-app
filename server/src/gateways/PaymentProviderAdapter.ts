export interface CreateCheckoutSessionParams {
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  amount: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}

export interface CheckoutSessionResult {
  sessionId: string;
  providerReference: string;
  checkoutUrl: string;
  clientSecret?: string;
  expiresAt: Date;
  status: 'created' | 'pending';
}

export interface RefundParams {
  organizationId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  reason?: string;
  idempotencyKey?: string;
}

export interface RefundResult {
  refundId: string;
  amount: number;
  currency: string;
  status: 'succeeded' | 'pending' | 'failed';
}

export interface DisputeResult {
  disputeId: string;
  paymentReference: string;
  amount: number;
  currency: string;
  status: 'needs_response' | 'under_review' | 'won' | 'lost' | 'closed';
  reason?: string;
}

export interface SettlementResult {
  settlementId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed';
  destinationBankAccountId?: string;
}

/**
 * Enterprise Provider Adapter Contract for gateway-specific operations.
 * Isolates all processor interactions from internal accounting posting.
 */
export interface PaymentProviderAdapter {
  readonly gatewayName: string;

  /**
   * Generates a processor-hosted checkout session or payment intent.
   * Does NOT receive or process raw PAN/CVC/bank credentials.
   */
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult>;

  /**
   * Cryptographically verifies the incoming webhook authenticity.
   */
  verifyWebhook(rawBody: string, signature: string, secret: string): boolean;

  /**
   * Requests a refund from the processor.
   */
  createRefund(params: RefundParams): Promise<RefundResult>;

  /**
   * Queries dispute details from the gateway.
   */
  getDispute(disputeId: string): Promise<DisputeResult | null>;

  /**
   * Queries payout / settlement status from the gateway.
   */
  getSettlement(settlementId: string): Promise<SettlementResult | null>;
}
