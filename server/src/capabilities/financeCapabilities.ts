import { CERTIFIED_OPTIONAL_FEATURES } from '../middleware/trustedFeature.middleware';
import { isRecoveryConfigured } from '../recovery/ProductionRecoveryAdapters';

export type CapabilityState = 'enabled' | 'disabled' | 'unavailable';

export interface FinanceCapability {
  key: string;
  label: string;
  state: CapabilityState;
  certified: boolean;
  reason?: string;
  prerequisite?: string;
}

const CORE_ENABLED = new Set([
  'customer-payments',
  'invoice-posting',
  'bill-posting',
  'expense-posting',
  'manual-journals',
  'period-locks',
]);

const LABELS: Record<string, string> = {
  'customer-payments': 'Customer payments',
  'invoice-posting': 'Invoice posting',
  'bill-posting': 'Bill posting',
  'expense-posting': 'Expense posting',
  'manual-journals': 'Manual journals',
  'period-locks': 'Period locks',
  'bank-account-management': 'Bank account management',
  'bank-statement-import': 'Bank statement import',
  'bank-reconciliation': 'Bank reconciliation',
  'receivables-corrections': 'Credits, advances and refunds',
  'payables-settlement': 'Vendor payments, credits and advances',
  'recurring-transactions': 'Recurring transactions',
  'fixed-assets': 'Fixed assets',
  'period-close': 'Period close and reopen',
  'team-access': 'Team and accountant access',
  'recovery-center': 'Recovery and organization export',
};

export const POINT1_CAPABILITY_KEYS = Object.freeze(Object.keys(LABELS));

function deploymentEnabled(): Set<string> {
  const configured = process.env.TRUSTED_FINANCE_FEATURES
    ?? (process.env.NODE_ENV === 'production' ? '' : Array.from(CERTIFIED_OPTIONAL_FEATURES).join(','));
  const enabled = new Set(
    configured
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (!isRecoveryConfigured()) enabled.delete('recovery-center');
  return enabled;
}

export function getFinanceCapabilities(): FinanceCapability[] {
  const deployed = deploymentEnabled();
  return POINT1_CAPABILITY_KEYS.map((key) => {
    if (CORE_ENABLED.has(key)) {
      return { key, label: LABELS[key], state: 'enabled', certified: true };
    }

    const certified = CERTIFIED_OPTIONAL_FEATURES.has(key);
    const enabled = certified && deployed.has(key);
    if (enabled) return { key, label: LABELS[key], state: 'enabled', certified: true };
    if (certified) {
      const recoveryNeedsKeys = key === 'recovery-center' && !isRecoveryConfigured();
      return {
        key,
        label: LABELS[key],
        state: 'disabled',
        certified: true,
        reason: recoveryNeedsKeys ? 'Certified but recovery encryption keys are not configured.' : 'Certified but disabled for this deployment.',
        prerequisite: recoveryNeedsKeys
          ? 'Configure the active recovery key ID plus separate 32-byte encryption and HMAC keys.'
          : `Add ${key} to TRUSTED_FINANCE_FEATURES for this deployment.`,
      };
    }
    return {
      key,
      label: LABELS[key],
      state: 'unavailable',
      certified: false,
      reason: 'This workflow has not completed Point-1 certification.',
      prerequisite: 'Complete its PostgreSQL, reversal, reconciliation, and browser release gates.',
    };
  });
}

export function isSourceCertifiedCapability(key: string): boolean {
  return CORE_ENABLED.has(key) || CERTIFIED_OPTIONAL_FEATURES.has(key);
}
