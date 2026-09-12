const INTERNAL_EXPENSE_JOURNAL_PATTERN = /^JRN-EXP-exp-[0-9a-f-]+$/i;

export function isInternalExpenseJournalNumber(entryNumber?: string): boolean {
  return Boolean(entryNumber && INTERNAL_EXPENSE_JOURNAL_PATTERN.test(entryNumber));
}

export function displayJournalNumber(entryNumber?: string, reference?: string): string {
  if (isInternalExpenseJournalNumber(entryNumber)) return reference || 'Expense posting';
  return entryNumber || reference || 'Journal';
}
