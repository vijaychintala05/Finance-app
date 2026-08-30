import { describe, it, expect } from 'vitest';
import { SalesService } from '../services/salesService';
import { PurchasesService } from '../services/purchasesService';

describe('Financial Calculations Engine', () => {
  it('1. Correctly calculates subtotal, tax total, and total amount for invoice line items', () => {
    const items = [
      { description: 'Web Design', accountId: 'acc-1', quantity: 10, unitPrice: 150, taxRate: 10 },
      { description: 'Hosting Annual', accountId: 'acc-2', quantity: 1, unitPrice: 500, taxRate: 18 },
    ];

    const totals = SalesService.calculateTotals(items, 50); // $50 discount

    expect(totals.subtotal).toBe(2000); // (10*150) + (1*500) = 1500 + 500
    expect(totals.taxTotal).toBe(240); // (1500*0.10) + (500*0.18) = 150 + 90 = 240
    expect(totals.totalAmount).toBe(2190); // 2000 + 240 - 50 = 2190
  });

  it('2. Prevents total amount from going below zero when discount exceeds sum', () => {
    const items = [
      { description: 'Consulting', accountId: 'acc-1', quantity: 1, unitPrice: 100, taxRate: 0 },
    ];

    const totals = SalesService.calculateTotals(items, 150);
    expect(totals.totalAmount).toBe(0);
  });

  it('3. Handles fractional cent rounding accurately without precision drift', () => {
    const items = [
      { description: 'Micro service fee', accountId: 'acc-1', quantity: 3, unitPrice: 33.333, taxRate: 8.875 },
    ];

    const totals = SalesService.calculateTotals(items);
    expect(totals.subtotal).toBe(100);
    expect(totals.taxTotal).toBe(8.88);
    expect(totals.totalAmount).toBe(108.88);
  });

  it('4. Correctly computes multi-tier GST rates (0%, 5%, 12%, 18%, 28%)', () => {
    const items = [
      { description: 'Essential Food (0%)', quantity: 2, unitPrice: 50, taxRate: 0 },
      { description: 'Standard Goods (5%)', quantity: 4, unitPrice: 100, taxRate: 5 },
      { description: 'Processed Items (12%)', quantity: 1, unitPrice: 200, taxRate: 12 },
      { description: 'Standard Services (18%)', quantity: 2, unitPrice: 300, taxRate: 18 },
      { description: 'Luxury Goods (28%)', quantity: 1, unitPrice: 1000, taxRate: 28 },
    ];

    const totals = SalesService.calculateTotals(items);
    // Subtotal: (2*50)+(4*100)+(1*200)+(2*300)+(1*1000) = 100 + 400 + 200 + 600 + 1000 = 2300
    expect(totals.subtotal).toBe(2300);
    // Tax: 0 + (400*0.05=20) + (200*0.12=24) + (600*0.18=108) + (1000*0.28=280) = 432
    expect(totals.taxTotal).toBe(432);
    expect(totals.totalAmount).toBe(2732);
  });

  it('5. Handles zero-quantity and zero-price line items safely without NaN', () => {
    const items = [
      { description: 'Free Sample', quantity: 10, unitPrice: 0, taxRate: 18 },
      { description: 'Unused Line', quantity: 0, unitPrice: 500, taxRate: 18 },
    ];

    const totals = SalesService.calculateTotals(items);
    expect(totals.subtotal).toBe(0);
    expect(totals.taxTotal).toBe(0);
    expect(totals.totalAmount).toBe(0);
  });

  it('6. computeInvoiceStatusAndBalance correctly computes Paid, Partially Paid, and Sent status', () => {
    expect(SalesService.computeInvoiceStatusAndBalance(1000, 0)).toEqual({
      balanceDue: 1000,
      status: 'Sent',
    });

    expect(SalesService.computeInvoiceStatusAndBalance(1000, 400)).toEqual({
      balanceDue: 600,
      status: 'Partially Paid',
    });

    expect(SalesService.computeInvoiceStatusAndBalance(1000, 1000)).toEqual({
      balanceDue: 0,
      status: 'Paid',
    });

    expect(SalesService.computeInvoiceStatusAndBalance(1000, 1200)).toEqual({
      balanceDue: 0,
      status: 'Paid',
    });
  });

  it('7. applyCreditNoteToInvoice updates remaining balance and credit note', () => {
    const mockInvoice: any = {
      id: 'inv-1',
      totalAmount: 1000,
      paidAmount: 0,
      balanceDue: 1000,
      status: 'Sent',
    };

    const result = SalesService.applyCreditNoteToInvoice(mockInvoice, 300);
    expect(result.updatedInvoice.paidAmount).toBe(300);
    expect(result.updatedInvoice.balanceDue).toBe(700);
    expect(result.updatedInvoice.status).toBe('Partially Paid');
    expect(result.remainingCredit).toBe(0);
  });
});
