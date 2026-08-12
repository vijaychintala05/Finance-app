import { describe, it, expect } from 'vitest';
import { SalesService } from '../services/salesService';
import { PurchasesService } from '../services/purchasesService';
import { Invoice, Bill } from '../types';

describe('Credit Notes & Vendor Credits Engine', () => {
  it('applies a credit note against an open invoice and updates balance due', () => {
    const mockInvoice: Invoice = {
      id: 'inv-1',
      invoiceNumber: 'INV-101',
      clientId: 'c-1',
      clientName: 'Acme Corp',
      clientEmail: 'acme@test.com',
      issueDate: '2026-01-01',
      dueDate: '2026-01-31',
      items: [],
      subtotal: 1000,
      taxTotal: 0,
      discount: 0,
      totalAmount: 1000,
      paidAmount: 200,
      balanceDue: 800,
      status: 'Partially Paid',
      createdAt: '2026-01-01',
    };

    const { updatedInvoice, remainingCredit } = SalesService.applyCreditNoteToInvoice(
      mockInvoice,
      300
    );

    expect(updatedInvoice.paidAmount).toBe(500);
    expect(updatedInvoice.balanceDue).toBe(500);
    expect(updatedInvoice.status).toBe('Partially Paid');
    expect(remainingCredit).toBe(0);
  });

  it('applies a vendor credit against a bill balance', () => {
    const mockBill: Bill = {
      id: 'bill-1',
      billNumber: 'BILL-501',
      vendorName: 'AWS Services',
      billDate: '2026-01-01',
      dueDate: '2026-01-31',
      totalAmount: 500,
      amountPaid: 0,
      status: 'Unpaid',
      notes: '',
    };

    const { updatedBill, remainingCredit } = PurchasesService.applyVendorCreditToBill(
      mockBill,
      500,
      500
    );

    expect(updatedBill.amountPaid).toBe(500);
    expect(updatedBill.status).toBe('Paid');
    expect(remainingCredit).toBe(0);
  });
});
