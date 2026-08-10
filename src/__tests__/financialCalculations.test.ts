import { describe, it, expect } from 'vitest';
import { SalesService } from '../services/salesService';
import { PurchasesService } from '../services/purchasesService';

describe('Financial Calculations Engine', () => {
  it('correctly calculates subtotal, tax total, and total amount for invoice line items', () => {
    const items = [
      { description: 'Web Design', accountId: 'acc-1', quantity: 10, unitPrice: 150, taxRate: 10 },
      { description: 'Hosting Annual', accountId: 'acc-2', quantity: 1, unitPrice: 500, taxRate: 18 },
    ];

    const totals = SalesService.calculateTotals(items, 50); // $50 discount

    expect(totals.subtotal).toBe(2000); // (10*150) + (1*500) = 1500 + 500
    expect(totals.taxTotal).toBe(240); // (1500*0.10) + (500*0.18) = 150 + 90 = 240
    expect(totals.totalAmount).toBe(2190); // 2000 + 240 - 50 = 2190
  });

  it('prevents total amount from going below zero when discount exceeds sum', () => {
    const items = [
      { description: 'Consulting', accountId: 'acc-1', quantity: 1, unitPrice: 100, taxRate: 0 },
    ];

    const totals = SalesService.calculateTotals(items, 150);
    expect(totals.totalAmount).toBe(0);
  });

  it('handles fractional cent rounding accurately without precision drift', () => {
    const items = [
      { description: 'Micro service fee', accountId: 'acc-1', quantity: 3, unitPrice: 33.333, taxRate: 8.875 },
    ];

    const totals = SalesService.calculateTotals(items);
    expect(totals.subtotal).toBe(100);
    expect(totals.taxTotal).toBe(8.88);
    expect(totals.totalAmount).toBe(108.88);
  });
});
