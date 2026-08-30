import { describe, it, expect } from 'vitest';
import { SalesService } from '../services/salesService';
import { PurchasesService } from '../services/purchasesService';

describe('Payment Allocation & Status Engine', () => {
  it('1. updates invoice status to Paid when balance due reaches zero', () => {
    const totalAmount = 1000;
    const paidAmount = 1000;

    const result = SalesService.computeInvoiceStatusAndBalance(totalAmount, paidAmount);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe('Paid');
  });

  it('2. updates invoice status to Partially Paid when payment is partial', () => {
    const totalAmount = 1000;
    const paidAmount = 400;

    const result = SalesService.computeInvoiceStatusAndBalance(totalAmount, paidAmount);
    expect(result.balanceDue).toBe(600);
    expect(result.status).toBe('Partially Paid');
  });

  it('3. updates bill status to Paid when bill is fully paid', () => {
    const totalAmount = 2500;
    const paidAmount = 2500;

    const result = PurchasesService.computeBillStatusAndBalance(totalAmount, paidAmount);
    expect(result.balanceDue).toBe(0);
    expect(result.status).toBe('Paid');
  });

  it('4. updates bill status to Partially Paid and computes correct remaining balance', () => {
    const totalAmount = 2500;
    const paidAmount = 1000;

    const result = PurchasesService.computeBillStatusAndBalance(totalAmount, paidAmount);
    expect(result.balanceDue).toBe(1500);
    expect(result.status).toBe('Partially Paid');
  });

  it('5. handles over-payment safely without negative balance due', () => {
    const totalAmount = 1000;
    const paidAmount = 1500; // over-paid

    const invoiceResult = SalesService.computeInvoiceStatusAndBalance(totalAmount, paidAmount);
    expect(invoiceResult.balanceDue).toBe(0);
    expect(invoiceResult.status).toBe('Paid');

    const billResult = PurchasesService.computeBillStatusAndBalance(totalAmount, paidAmount);
    expect(billResult.balanceDue).toBe(0);
    expect(billResult.status).toBe('Paid');
  });

  it('6. applyVendorCreditToBill updates bill amountPaid and computes remaining vendor credit', () => {
    const mockBill: any = {
      id: 'bill-1',
      totalAmount: 1200,
      amountPaid: 200,
      status: 'Partially Paid',
    };

    // Current balance due = 1000, applying $400 vendor credit
    const result = PurchasesService.applyVendorCreditToBill(mockBill, 400, 1000);
    expect(result.updatedBill.amountPaid).toBe(600);
    expect(result.updatedBill.status).toBe('Partially Paid');
    expect(result.remainingCredit).toBe(0);
  });

  it('7. applyVendorCreditToBill marks bill Paid when credit covers entire remaining balance', () => {
    const mockBill: any = {
      id: 'bill-1',
      totalAmount: 500,
      amountPaid: 0,
      status: 'Unpaid',
    };

    // Applying $600 vendor credit to $500 bill
    const result = PurchasesService.applyVendorCreditToBill(mockBill, 600, 500);
    expect(result.updatedBill.amountPaid).toBe(500);
    expect(result.updatedBill.status).toBe('Paid');
    expect(result.remainingCredit).toBe(100); // $100 unused credit remaining
  });
});
