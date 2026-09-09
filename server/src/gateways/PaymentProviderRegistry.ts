import { PaymentProviderAdapter } from './PaymentProviderAdapter';
import { MockGatewayAdapter } from './MockGatewayAdapter';
import { RazorpayProviderAdapter } from './RazorpayProviderAdapter';
import { RazorpaySandboxAdapter } from './RazorpaySandboxAdapter';
import { isProduction } from '../config/environment';

export class PaymentProviderRegistry {
  private static adapters: Map<string, PaymentProviderAdapter> = new Map<string, PaymentProviderAdapter>([
    ['mock', new MockGatewayAdapter()],
    ['razorpay', new RazorpayProviderAdapter()],
    ['razorpay_sandbox', new RazorpaySandboxAdapter()],
  ]);

  public static registerAdapter(adapter: PaymentProviderAdapter): void {
    this.adapters.set(adapter.gatewayName.toLowerCase(), adapter);
  }

  public static getAdapter(gatewayName: string = 'mock'): PaymentProviderAdapter {
    const key = (gatewayName || 'mock').toLowerCase();

    if (key === 'mock' && isProduction()) {
      throw new Error('MOCK_GATEWAY_FORBIDDEN: Mock payment adapter is prohibited in production');
    }

    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new Error(`UNSUPPORTED_PAYMENT_GATEWAY: Gateway '${gatewayName}' is not registered or supported.`);
    }

    return adapter;
  }

  public static getSupportedGateways(): string[] {
    const list = Array.from(this.adapters.keys());
    if (isProduction()) {
      return list.filter((g) => g !== 'mock');
    }
    return list;
  }
}
