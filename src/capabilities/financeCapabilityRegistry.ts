/**
 * Canonical source-of-truth for finance workflow availability.
 *
 * Keep this module free of browser and server dependencies: it is consumed by
 * the API, route guards, navigation and contract tests. A feature may only move
 * from `prototype` to `certified-optional` through a reviewed source change;
 * deployment configuration can enable certified features but cannot certify
 * prototype code.
 */
export type FinanceCapabilityTier = 'core' | 'certified-optional' | 'prototype';

export interface FinanceCapabilityDefinition {
  key: string;
  label: string;
  tier: FinanceCapabilityTier;
  /** Published by GET /api/v1/point1/capabilities and available for UI gating. */
  published: boolean;
  /** Production boot must fail when this published capability is not enabled. */
  productionRequired?: boolean;
  /** Enabling this umbrella capability enables these granular route guards. */
  implies?: readonly string[];
}

export const FINANCE_CAPABILITY_DEFINITIONS = Object.freeze([
  { key: 'customer-payments', label: 'Customer payments', tier: 'core', published: true, productionRequired: true },
  { key: 'invoice-posting', label: 'Invoice posting', tier: 'core', published: true, productionRequired: true },
  { key: 'bill-posting', label: 'Bill posting', tier: 'core', published: true, productionRequired: true },
  { key: 'expense-posting', label: 'Expense posting', tier: 'core', published: true, productionRequired: true },
  { key: 'manual-journals', label: 'Manual journals', tier: 'core', published: true, productionRequired: true },
  { key: 'period-locks', label: 'Period locks', tier: 'core', published: true, productionRequired: true },
  { key: 'bank-account-management', label: 'Bank account management', tier: 'core', published: true, productionRequired: true },

  { key: 'bank-statement-import', label: 'Bank statement import', tier: 'certified-optional', published: true },
  { key: 'bank-reconciliation', label: 'Bank reconciliation', tier: 'certified-optional', published: true },
  { key: 'recurring-transactions', label: 'Recurring transactions', tier: 'certified-optional', published: true },
  { key: 'fixed-assets', label: 'Fixed assets', tier: 'certified-optional', published: true },
  { key: 'period-close', label: 'Period close and reopen', tier: 'certified-optional', published: true, productionRequired: true },
  { key: 'team-access', label: 'Team and accountant access', tier: 'certified-optional', published: true },
  {
    key: 'receivables-corrections',
    label: 'Credits, advances and refunds',
    tier: 'certified-optional',
    published: true,
    implies: ['customer-advance-application', 'credit-notes', 'customer-refunds'],
  },
  { key: 'customer-advance-application', label: 'Customer advance application', tier: 'certified-optional', published: false },
  { key: 'credit-notes', label: 'Credit notes', tier: 'certified-optional', published: false },
  { key: 'customer-refunds', label: 'Customer refunds', tier: 'certified-optional', published: false },
  { key: 'receivable-write-offs', label: 'Receivable write-offs', tier: 'certified-optional', published: true },
  {
    key: 'payables-settlement',
    label: 'Vendor payments, credits and advances',
    tier: 'certified-optional',
    published: true,
    implies: ['vendor-settlements', 'vendor-credits'],
  },
  { key: 'vendor-settlements', label: 'Vendor settlements', tier: 'certified-optional', published: false },
  { key: 'vendor-credits', label: 'Vendor credits', tier: 'certified-optional', published: false },
  { key: 'payable-write-offs', label: 'Payable write-offs', tier: 'certified-optional', published: true },
  { key: 'recovery-center', label: 'Recovery and organization export', tier: 'certified-optional', published: true, productionRequired: true },
  { key: 'customer-statements', label: 'Customer statements', tier: 'certified-optional', published: false },
  { key: 'vendor-statements', label: 'Vendor statements', tier: 'certified-optional', published: false },
  { key: 'accountant-overview', label: 'Accountant overview', tier: 'certified-optional', published: false },
  { key: 'delivery-challans', label: 'Delivery challans', tier: 'certified-optional', published: true },
  { key: 'cash-flow-classification', label: 'Cash-flow classification', tier: 'certified-optional', published: false },

  // Known route-guarded workflows that intentionally remain fail-closed.
  { key: 'bank-rules', label: 'Bank rules', tier: 'prototype', published: false },
  { key: 'budget-reporting', label: 'Budget reporting', tier: 'prototype', published: false },
  { key: 'cash-flow-forecasting', label: 'Cash-flow forecasting', tier: 'prototype', published: false },
  { key: 'recurring-journal-generation', label: 'Recurring journal generation', tier: 'prototype', published: false },
  { key: 'application-backup', label: 'Application backup', tier: 'prototype', published: false },
  { key: 'data-export', label: 'Data export', tier: 'prototype', published: false },
] as const satisfies readonly FinanceCapabilityDefinition[]);

export type FinanceCapabilityKey = (typeof FINANCE_CAPABILITY_DEFINITIONS)[number]['key'];

export const FINANCE_CAPABILITY_BY_KEY: ReadonlyMap<FinanceCapabilityKey, FinanceCapabilityDefinition> =
  new Map(FINANCE_CAPABILITY_DEFINITIONS.map((definition) => [definition.key, definition]));

export const CORE_FINANCE_CAPABILITY_KEYS: ReadonlySet<FinanceCapabilityKey> = new Set(
  FINANCE_CAPABILITY_DEFINITIONS.filter((definition) => definition.tier === 'core').map((definition) => definition.key)
);

export const CERTIFIED_OPTIONAL_FINANCE_CAPABILITY_KEYS: ReadonlySet<FinanceCapabilityKey> = new Set(
  FINANCE_CAPABILITY_DEFINITIONS
    .filter((definition) => definition.tier === 'certified-optional')
    .map((definition) => definition.key)
);

export const PUBLISHED_FINANCE_CAPABILITY_KEYS = Object.freeze(
  FINANCE_CAPABILITY_DEFINITIONS.filter((definition) => definition.published).map((definition) => definition.key)
);

export const REQUIRED_PRODUCTION_FINANCE_CAPABILITY_KEYS = Object.freeze(
  FINANCE_CAPABILITY_DEFINITIONS
    .filter((definition) => 'productionRequired' in definition && definition.productionRequired)
    .map((definition) => definition.key)
);

export const FINANCE_CAPABILITY_IMPLICATIONS: ReadonlyMap<FinanceCapabilityKey, readonly FinanceCapabilityKey[]> =
  new Map(
    FINANCE_CAPABILITY_DEFINITIONS
      .flatMap((definition) => (
        'implies' in definition
          ? [[definition.key, definition.implies as readonly FinanceCapabilityKey[]] as const]
          : []
      ))
  );

/** The single client route-to-capability ownership map used by deep links and navigation. */
export const FINANCE_TAB_CAPABILITY_REQUIREMENTS = Object.freeze({
  bank_reconciliation: 'bank-reconciliation',
  delivery_challans: 'delivery-challans',
  recurring_invoices: 'recurring-transactions',
  recurring_bills: 'recurring-transactions',
  recurring_expenses: 'recurring-transactions',
  credit_notes: 'receivables-corrections',
  payments_made: 'payables-settlement',
  vendor_credits: 'payables-settlement',
  fixed_assets: 'fixed-assets',
  period_close: 'period-close',
  team_access: 'team-access',
  recovery_center: 'recovery-center',
} as const satisfies Readonly<Record<string, FinanceCapabilityKey>>);

export function getRequiredFinanceCapability(tab: string): FinanceCapabilityKey | undefined {
  return (FINANCE_TAB_CAPABILITY_REQUIREMENTS as Readonly<Record<string, FinanceCapabilityKey>>)[tab];
}

export function isKnownFinanceCapability(key: string): key is FinanceCapabilityKey {
  return FINANCE_CAPABILITY_BY_KEY.has(key as FinanceCapabilityKey);
}
