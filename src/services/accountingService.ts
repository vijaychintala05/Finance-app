import { Account, JournalEntry, PeriodLock } from '../types';

export class AccountingService {
  /**
   * Validates if a journal entry balances (Debit === Credit)
   */
  static validateJournalEntry(entry: Partial<JournalEntry>): { isValid: boolean; error?: string } {
    if (!entry.lines || entry.lines.length < 2) {
      return { isValid: false, error: 'A journal entry must contain at least two line items.' };
    }

    const totalDebit = entry.lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const totalCredit = entry.lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);

    // Minor unit tolerance check for precision rounding
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return {
        isValid: false,
        error: `Total Debits (${totalDebit.toFixed(2)}) must equal Total Credits (${totalCredit.toFixed(2)}).`,
      };
    }

    return { isValid: true };
  }

  /**
   * Checks if an accounting period is locked for a given transaction date
   */
  static isPeriodLocked(transactionDate: string, periodLocks: PeriodLock[]): boolean {
    if (!transactionDate) return false;
    const activeLocks = periodLocks.filter((p) => p.status === 'Active');
    return activeLocks.some((lock) => {
      return new Date(transactionDate) <= new Date(lock.lockDate);
    });
  }

  /**
   * Safely calculates trial balance sums from accounts list
   */
  static calculateTrialBalance(accounts: Account[]): {
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  } {
    let totalDebits = 0;
    let totalCredits = 0;

    accounts.forEach((acc) => {
      const balance = Math.abs(acc.balance);
      if (acc.type === 'Asset' || acc.type === 'Expense' || acc.type === 'Cost of Goods Sold') {
        totalDebits += balance;
      } else {
        totalCredits += balance;
      }
    });

    return {
      totalDebits,
      totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
    };
  }
}
