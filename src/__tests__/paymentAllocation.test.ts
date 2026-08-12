import { describe, it, expect } from 'vitest';
import { SalesService } from '../services/salesService';
import { PurchasesService } from '../services/purchasesService';

describe('Payment Allocation & Status Engine', () => {
  it('updates invoice status to Paid when balance due reaches zero', () => {
    const totalAmount = 1000;
    const paidAmount = 1000;

    const result = SalesService.computeInvoiceStatusAndBalance(totalAmount, paidAmount);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe('Paid');
  });

  it('updates invoice status to Partially Paid when payment is partial', () => {
    const totalAmount = 1000;
    const paidAmount = 400;

    const result = SalesService.computeInvoiceStatusAndBalance(totalAmount, paidAmount);
    expect(result.balanceDue).toBe(600);
    expect(result.status).toBe('Partially Paid');
  });

  it('updates bill status to Paid when bill is fully paid', () => {
    const totalAmount = 2500;
    const paidAmount = 2500;

    const result = PurchasesService.computeBillStatusAndBalance(totalAmount, paidAmount);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe('Paid');
  });
});
