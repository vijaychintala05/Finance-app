import { describe, expect, it } from 'vitest';
import { formatCurrency, formatIndianNumber, formatNumber } from '../utils/formatters';

describe('Indian currency formatting', () => {
  it('uses lakh and crore digit grouping for INR mobile and desktop amounts', () => {
    expect(formatCurrency(12334545, 'INR')).toBe('INR 1,23,34,545.00');
    expect(formatCurrency(12334545, '₹')).toBe('₹1,23,34,545.00');
  });

  it('matches Zoho Books grouping: ones, tens, hundreds, then thousands, then lakhs, then crores', () => {
    // Single, double, and triple digits (no commas)
    expect(formatIndianNumber(5)).toBe('5.00');
    expect(formatIndianNumber(50)).toBe('50.00');
    expect(formatIndianNumber(500)).toBe('500.00');

    // Thousands (first comma after 3 digits)
    expect(formatIndianNumber(1000)).toBe('1,000.00');
    expect(formatIndianNumber(10000)).toBe('10,000.00');

    // Lakhs (next comma after 2 digits)
    expect(formatIndianNumber(100000)).toBe('1,00,000.00');
    expect(formatIndianNumber(1000000)).toBe('10,00,000.00');

    // Crores (next comma after 2 digits)
    expect(formatIndianNumber(10000000)).toBe('1,00,00,000.00');
    expect(formatIndianNumber(100000000)).toBe('10,00,00,000.00');

    // 100 Crores / Arab
    expect(formatIndianNumber(1000000000)).toBe('1,00,00,00,000.00');

    // Arbitrary full number
    expect(formatIndianNumber(123456789)).toBe('12,34,56,789.00');
  });

  it('preserves the sign and decimal precision in Indian currency amounts', () => {
    expect(formatCurrency(-1234567.8, 'INR')).toBe('-INR 12,34,567.80');
    expect(formatCurrency(-1234567.8, '₹')).toBe('-₹12,34,567.80');
  });

  it('defaults to Indian grouping when no symbol is provided in FirmBooks', () => {
    expect(formatCurrency(1234567)).toBe('12,34,567.00');
    expect(formatCurrency(1234567, '')).toBe('12,34,567.00');
  });

  it('supports Rs. and Rs currency prefix with Indian grouping', () => {
    expect(formatCurrency(1234567, 'Rs.')).toBe('Rs. 12,34,567.00');
    expect(formatCurrency(1234567, 'Rs')).toBe('Rs 12,34,567.00');
  });

  it('formatNumber helper formats plain numbers with Indian grouping', () => {
    expect(formatNumber(1234567.5, 2)).toBe('12,34,567.50');
    expect(formatNumber(1234567, 0)).toBe('12,34,567');
  });

  it('keeps international grouping for non-INR organizations', () => {
    expect(formatCurrency(12334545, '$')).toBe('$12,334,545.00');
    expect(formatCurrency(12334545, 'USD')).toBe('USD 12,334,545.00');
    expect(formatCurrency(12334545, 'EUR')).toBe('EUR 12,334,545.00');
    expect(formatCurrency(12334545, '€')).toBe('€12,334,545.00');
  });
});
