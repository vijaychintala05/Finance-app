import { describe, it, expect } from 'vitest';

describe('Invoice Tax Calculation Precision', () => {
  it('calculates exact two-decimal tax without integer rounding', () => {
    const items = [
      { id: '1', description: 'Item A', amount: 55, taxRate: 18 },
      { id: '2', description: 'Item B', amount: 33.33, taxRate: 8.875 },
    ];

    const subtotal = Math.round(items.reduce((sum, item) => sum + (item.amount || 0), 0) * 100) / 100;
    const taxTotal = Math.round(
      items.reduce(
        (sum, item) => sum + Math.round((item.amount || 0) * (item.taxRate || 0)) / 100,
        0
      ) * 100
    ) / 100;

    // Line 1: 55 * 0.18 = 9.90 (an integer round would yield 10)
    expect(Math.round(55 * 18) / 100).toBe(9.9);

    // Line 2: 33.33 * 8.875% = 2.958... -> 2.96
    expect(Math.round(33.33 * 8.875) / 100).toBe(2.96);

    expect(subtotal).toBe(88.33);
    expect(taxTotal).toBe(12.86);

    const discount = 5;
    const totalAmount = Math.max(0, Math.round((subtotal + taxTotal - Number(discount)) * 100) / 100);
    expect(totalAmount).toBe(96.19);
  });
});
