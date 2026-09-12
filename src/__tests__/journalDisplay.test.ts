import { describe, expect, it } from 'vitest';
import { displayJournalNumber, isInternalExpenseJournalNumber } from '../utils/journalDisplay';

describe('journalDisplay', () => {
  it('replaces a legacy internal expense journal identifier with its expense reference', () => {
    const internalNumber = 'JRN-EXP-exp-09e19f15-909c-419c-b35c-e4eb20ba9605';

    expect(isInternalExpenseJournalNumber(internalNumber)).toBe(true);
    expect(displayJournalNumber(internalNumber, 'EXP-2026-014')).toBe('EXP-2026-014');
  });

  it('preserves normal journal numbers', () => {
    expect(isInternalExpenseJournalNumber('JRN-EXP-2026-014')).toBe(false);
    expect(displayJournalNumber('JRN-EXP-2026-014', 'EXP-2026-014')).toBe('JRN-EXP-2026-014');
  });
});
