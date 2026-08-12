export const SUPPORTED_BASE_CURRENCIES = [
  'AED', 'AUD', 'CAD', 'EUR', 'GBP', 'INR', 'SGD', 'USD',
] as const;

const supportedCurrencySet = new Set<string>(SUPPORTED_BASE_CURRENCIES);

export function normalizeSupportedBaseCurrency(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return supportedCurrencySet.has(normalized) ? normalized : null;
}
