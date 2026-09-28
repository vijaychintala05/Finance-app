import { describe, expect, it } from 'vitest';
import { classifyStatementLineStatus } from '../banking/BankReconciliationProjectionService';

describe('bank reconciliation read-model classification', () => {
  it('keeps unimported and suggested lines unresolved', () => {
    expect(classifyStatementLineStatus('UNMATCHED')).toBe('UNRESOLVED');
    expect(classifyStatementLineStatus('SUGGESTED')).toBe('UNRESOLVED');
    expect(classifyStatementLineStatus('RECOGNIZED')).toBe('UNRESOLVED');
    expect(classifyStatementLineStatus('PARTIALLY_MATCHED')).toBe('UNRESOLVED');
  });

  it('does not trust legacy stored match or categorization statuses as full allocations', () => {
    expect(classifyStatementLineStatus('MATCHED')).toBe('LEGACY_REVIEW_REQUIRED');
    expect(classifyStatementLineStatus('CATEGORIZED')).toBe('LEGACY_REVIEW_REQUIRED');
    expect(classifyStatementLineStatus('RECONCILED')).toBe('LEGACY_REVIEW_REQUIRED');
    expect(classifyStatementLineStatus('MATCHED', false, '100.00', '99.99', 0)).toBe('LEGACY_REVIEW_REQUIRED');
    expect(classifyStatementLineStatus('MATCHED', false, '100.00', '100.00', 1)).toBe('LEGACY_REVIEW_REQUIRED');
    expect(classifyStatementLineStatus('MATCHED', false, '100.00', '100.00', 0)).toBe('RESOLVED');
    expect(classifyStatementLineStatus('CATEGORIZED', false, '100.00', '100.00', 0)).toBe('RESOLVED');
    expect(classifyStatementLineStatus('RECONCILED', false, '100.00', '100.00', 0)).toBe('RESOLVED');
    // Reconciled status additionally requires session evidence, which the legacy schema cannot prove.
    expect(classifyStatementLineStatus('RECONCILED', false)).toBe('LEGACY_REVIEW_REQUIRED');
  });

  it('keeps ignored and exception statuses visible for review', () => {
    expect(classifyStatementLineStatus('IGNORED')).toBe('REVIEW');
    expect(classifyStatementLineStatus('TO_REVIEW')).toBe('REVIEW');
    expect(classifyStatementLineStatus('POSSIBLE_DUPLICATE')).toBe('REVIEW');
    expect(classifyStatementLineStatus('NEEDS_REVIEW')).toBe('REVIEW');
    expect(classifyStatementLineStatus('UNMATCHED', true)).toBe('REVIEW');
    expect(classifyStatementLineStatus('FUTURE_STATUS')).toBe('REVIEW');
  });

  it('resolves a confirmed duplicate only when a completed close snapshot proves it was validated', () => {
    expect(classifyStatementLineStatus('CONFIRMED_DUPLICATE')).toBe('REVIEW');
    expect(classifyStatementLineStatus('CONFIRMED_DUPLICATE', false, undefined, undefined, undefined, false)).toBe('REVIEW');
    expect(classifyStatementLineStatus('CONFIRMED_DUPLICATE', false, undefined, undefined, undefined, true)).toBe('RESOLVED');
  });
});
