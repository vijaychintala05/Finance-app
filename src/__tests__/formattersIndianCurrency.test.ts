import { describe, expect, it } from 'vitest';
import { formatCurrency } from '../utils/formatters';

describe('Indian currency formatting', () => {
  it('uses lakh and crore digit grouping for INR mobile and desktop amounts', () => {
    expect(formatCurrency(12334545, 'INR')).toBe('INR 1,23,34,545.00');
    expect(formatCurrency(12334545, '₹')).toBe('₹1,23,34,545.00');
  });

  it('preserves the sign and decimal precision in Indian currency amounts', () => {
    expect(formatCurrency(-1234567.8, 'INR')).toBe('-INR 12,34,567.80');
  });

  it('keeps international grouping for non-INR organizations', () => {
    expect(formatCurrency(12334545, '$')).toBe('$12,334,545.00');
  });
});
