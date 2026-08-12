import { Invoice, InvoiceItem, Estimate, SalesOrder, CreditNote } from '../types';

export class SalesService {
  /**
   * Calculates subtotal, tax total, and total amount for invoice/estimate items
   */
  static calculateTotals(
    items: any[],
    discount: number = 0
  ): { subtotal: number; taxTotal: number; totalAmount: number } {
    let subtotal = 0;
    let taxTotal = 0;

    (items || []).forEach((item: any) => {
      const price = Number(item.unitPrice ?? item.rate ?? item.unit_price ?? 0);
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const tax = Number(item.taxRate ?? item.tax_rate ?? 0);
      const lineSubtotal = Math.round((qty * price) * 100) / 100;
      const lineTax = Math.round((lineSubtotal * (tax / 100)) * 100) / 100;
      subtotal += lineSubtotal;
      taxTotal += lineTax;
    });

    const totalAmount = Math.max(0, Math.round((subtotal + taxTotal - discount) * 100) / 100);

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      totalAmount,
    };
  }

  /**
   * Computes payment status and balance due for an invoice
   */
  static computeInvoiceStatusAndBalance(
    totalAmount: number,
    paidAmount: number
  ): { balanceDue: number; status: Invoice['status'] } {
    const safePaid = Math.max(0, paidAmount);
    const balanceDue = Math.max(0, Math.round((totalAmount - safePaid) * 100) / 100);

    let status: string = 'Draft';
    if (balanceDue === 0 && totalAmount > 0) {
      status = 'Paid';
    } else if (safePaid > 0 && balanceDue > 0) {
      status = 'Partially Paid';
    } else if (safePaid === 0) {
      status = 'Sent';
    }

    return { balanceDue, status: status as any };
  }

  /**
   * Applies a credit note against an open invoice balance
   */
  static applyCreditNoteToInvoice(
    invoice: Invoice,
    creditNoteAmount: number
  ): { updatedInvoice: Invoice; remainingCredit: number } {
    const applicableCredit = Math.min(invoice.balanceDue, creditNoteAmount);
    const newPaidAmount = invoice.paidAmount + applicableCredit;
    const { balanceDue, status } = this.computeInvoiceStatusAndBalance(
      invoice.totalAmount,
      newPaidAmount
    );

    return {
      updatedInvoice: {
        ...invoice,
        paidAmount: newPaidAmount,
        balanceDue,
        status,
      },
      remainingCredit: Math.round((creditNoteAmount - applicableCredit) * 100) / 100,
    };
  }
}
