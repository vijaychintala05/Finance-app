import { Bill, Expense, VendorCredit } from '../types';

export class PurchasesService {
  /**
   * Computes outstanding balance and status for a Bill
   */
  static computeBillStatusAndBalance(
    totalAmount: number,
    amountPaid: number
  ): { balanceDue: number; status: Bill['status'] } {
    const safePaid = Math.max(0, amountPaid);
    const balanceDue = Math.max(0, Math.round((totalAmount - safePaid) * 100) / 100);

    let status: Bill['status'] = 'Unpaid';
    if (balanceDue === 0 && totalAmount > 0) {
      status = 'Paid';
    } else if (safePaid > 0 && balanceDue > 0) {
      status = 'Partially Paid';
    } else {
      status = 'Unpaid';
    }

    return { balanceDue, status };
  }

  /**
   * Applies vendor credit against a bill balance
   */
  static applyVendorCreditToBill(
    bill: Bill,
    creditAmount: number,
    currentBalanceDue: number
  ): { updatedBill: Bill; remainingCredit: number } {
    const applicableCredit = Math.min(currentBalanceDue, creditAmount);
    const newAmountPaid = bill.amountPaid + applicableCredit;
    const { status } = this.computeBillStatusAndBalance(bill.totalAmount, newAmountPaid);

    return {
      updatedBill: {
        ...bill,
        amountPaid: newAmountPaid,
        status,
      },
      remainingCredit: Math.round((creditAmount - applicableCredit) * 100) / 100,
    };
  }
}
