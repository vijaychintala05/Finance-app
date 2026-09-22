import {
  CERTIFIED_OPTIONAL_FINANCE_CAPABILITY_KEYS,
  CORE_FINANCE_CAPABILITY_KEYS,
  FINANCE_CAPABILITY_BY_KEY,
  PUBLISHED_FINANCE_CAPABILITY_KEYS,
  REQUIRED_PRODUCTION_FINANCE_CAPABILITY_KEYS,
  type FinanceCapabilityKey,
} from '../../../src/capabilities/financeCapabilityRegistry';
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

export const POINT1_CAPABILITY_KEYS = PUBLISHED_FINANCE_CAPABILITY_KEYS;

function deploymentEnabled(): Set<string> {
  const configured = process.env.TRUSTED_FINANCE_FEATURES
    ?? (process.env.NODE_ENV === 'production' ? '' : Array.from(CERTIFIED_OPTIONAL_FINANCE_CAPABILITY_KEYS).join(','));
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
    const definition = FINANCE_CAPABILITY_BY_KEY.get(key);
    if (!definition) throw new Error(`Capability registry is missing published key: ${key}`);
    if (CORE_FINANCE_CAPABILITY_KEYS.has(key)) {
      return { key, label: definition.label, state: 'enabled', certified: true };
    }

    const certified = CERTIFIED_OPTIONAL_FINANCE_CAPABILITY_KEYS.has(key);
    const enabled = certified && deployed.has(key);
    if (enabled) return { key, label: definition.label, state: 'enabled', certified: true };
    if (certified) {
      const recoveryNeedsKeys = key === 'recovery-center' && !isRecoveryConfigured();
      return {
        key,
        label: definition.label,
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
      label: definition.label,
      state: 'unavailable',
      certified: false,
      reason: 'This workflow has not completed Point-1 certification.',
      prerequisite: 'Complete its PostgreSQL, reversal, reconciliation, and browser release gates.',
    };
  });
}

export function isSourceCertifiedCapability(key: string): boolean {
  return CORE_FINANCE_CAPABILITY_KEYS.has(key as FinanceCapabilityKey)
    || CERTIFIED_OPTIONAL_FINANCE_CAPABILITY_KEYS.has(key as FinanceCapabilityKey);
}

export const REQUIRED_PRODUCTION_CAPABILITY_KEYS: readonly string[] = REQUIRED_PRODUCTION_FINANCE_CAPABILITY_KEYS;

export function assertProductionFinanceCapabilities(): void {
  const capabilities = getFinanceCapabilities();
  const capMap = new Map(capabilities.map((c) => [c.key, c]));

  const missingOrDisabled: string[] = [];

  for (const requiredKey of REQUIRED_PRODUCTION_CAPABILITY_KEYS) {
    const cap = capMap.get(requiredKey);
    if (!cap || cap.state !== 'enabled') {
      const state = cap?.state || 'missing';
      const reason = cap?.reason ? ` (${cap.reason})` : '';
      missingOrDisabled.push(`${requiredKey} is ${state}${reason}`);
    }
  }

  if (missingOrDisabled.length > 0) {
    throw new Error(
      `RELEASE_CHECK_FAILED: Required finance capabilities are disabled in production: ${missingOrDisabled.join('; ')}`
    );
  }
}
