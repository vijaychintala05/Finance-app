import { describe, expect, it } from 'vitest';
import {
  FINANCE_NAVIGATION_SECTIONS,
  resolveFinanceNavigation,
} from './financeNavigation';

describe('finance navigation registry', () => {
  it('contains unique section and route identifiers', () => {
    const sectionIds = FINANCE_NAVIGATION_SECTIONS.map((section) => section.id);
    const routeIds = FINANCE_NAVIGATION_SECTIONS.flatMap((section) => section.subItems.map((item) => item.id));
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(new Set(routeIds).size).toBe(routeIds.length);
  });

  it('shows Items & Services only after view access is verified', () => {
    const hidden = resolveFinanceNavigation([]).flatMap((section) => section.subItems);
    const visible = resolveFinanceNavigation([], true).flatMap((section) => section.subItems);
    expect(hidden.some((item) => item.id === 'items')).toBe(false);
    expect(visible.filter((item) => item.id === 'items')).toHaveLength(1);
  });
  it('keeps gated modules visible with a disabled reason', () => {
    const sections = resolveFinanceNavigation([
      {
        key: 'bank-reconciliation',
        state: 'disabled',
        reason: 'Certified but disabled for this deployment.',
      },
    ]);
    const items = sections.flatMap((section) => section.subItems);
    expect(items.find((item) => item.id === 'bank_reconciliation')).toMatchObject({
      requiredCapability: 'bank-reconciliation',
      disabled: true,
      disabledReason: 'Certified but disabled for this deployment.',
    });
    expect(items.find((item) => item.id === 'invoices')).toMatchObject({ disabled: false });
  });

  it('unlocks every route owned by an enabled umbrella capability', () => {
    const sections = resolveFinanceNavigation([
      { key: 'recurring-transactions', state: 'enabled' },
      { key: 'payables-settlement', state: 'enabled' },
    ]);
    const items = sections.flatMap((section) => section.subItems);
    for (const route of ['recurring_invoices', 'recurring_bills', 'recurring_expenses', 'payments_made', 'vendor_credits']) {
      expect(items.find((item) => item.id === route)?.disabled).toBe(false);
    }
  });
});
