import { describe, it, expect } from 'vitest';
import { AccountingService } from '../services/accountingService';
import { PeriodLock } from '../types';

describe('Accounting & Journal Posting Validation', () => {
  it('validates that debits must equal credits in a journal entry', () => {
    const balancedEntry = {
      lines: [
        { id: '1', accountId: '1', accountCode: '1000', accountName: 'Cash', debit: 500, credit: 0 },
        { id: '2', accountId: '2', accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 500 },
      ],
    };

    const validation = AccountingService.validateJournalEntry(balancedEntry);
    expect(validation.isValid).toBe(true);
  });

  it('rejects an unbalanced journal entry', () => {
    const unbalancedEntry = {
      lines: [
        { id: '1', accountId: '1', accountCode: '1000', accountName: 'Cash', debit: 500, credit: 0 },
        { id: '2', accountId: '2', accountCode: '4000', accountName: 'Revenue', debit: 0, credit: 450 },
      ],
    };

    const validation = AccountingService.validateJournalEntry(unbalancedEntry);
    expect(validation.isValid).toBe(false);
    expect(validation.error).toContain('Total Debits (500.00) must equal Total Credits (450.00)');
  });

  it('correctly identifies locked transaction dates', () => {
    const locks: PeriodLock[] = [
      {
        id: 'lock-1',
        lockDate: '2025-12-31',
        region: 'Global',
        lockedBy: 'Admin',
        lockedAt: '2026-01-01',
        reason: 'Year end close',
        status: 'Active',
      },
    ];

    expect(AccountingService.isPeriodLocked('2025-06-15', locks)).toBe(true);
    expect(AccountingService.isPeriodLocked('2025-12-31', locks)).toBe(true);
    expect(AccountingService.isPeriodLocked('2026-01-15', locks)).toBe(false);
  });
});
