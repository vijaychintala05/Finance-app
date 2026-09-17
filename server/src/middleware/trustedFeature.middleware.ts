import { NextFunction, Request, Response } from 'express';

// An optional feature must first be added here by code review; an environment variable can then
// enable that reviewed implementation for a deployment. Configuration alone
// can never promote prototype code into the trusted surface.
export const CERTIFIED_OPTIONAL_FEATURES = new Set<string>([
  'bank-account-management',
  'bank-statement-import',
  'bank-reconciliation',
  'recurring-transactions',
  'fixed-assets',
  'period-close',
  'team-access',
  'receivables-corrections',
  'customer-advance-application',
  'credit-notes',
  'customer-refunds',
  'receivable-write-offs',
  'payables-settlement',
  'vendor-settlements',
  'vendor-credits',
  'payable-write-offs',
  'recovery-center',
  'customer-statements',
  'vendor-statements',
  'accountant-overview',
  'delivery-challans',
  'cash-flow-classification',
]);

function enabledFeatures(): Set<string> {
  const configured = process.env.TRUSTED_FINANCE_FEATURES
    ?? (process.env.NODE_ENV === 'production' ? '' : Array.from(CERTIFIED_OPTIONAL_FEATURES).join(','));
  const enabled = new Set(
    configured
      .split(',')
      .map((feature) => feature.trim())
      .filter((feature) => CERTIFIED_OPTIONAL_FEATURES.has(feature))
  );
  // The capability API, navigation and existing deployments publish this
  // umbrella as "Vendor payments, credits and advances". Honor it for the
  // granular route guards too; otherwise the UI advertises a blocked workflow.
  // Keep write-offs and all other optional workflows separately gated.
  if (enabled.has('payables-settlement')) {
    for (const feature of ['vendor-settlements', 'vendor-credits']) {
      if (CERTIFIED_OPTIONAL_FEATURES.has(feature)) enabled.add(feature);
    }
  }
  return enabled;
}

export function isFeatureEnabled(feature: string): boolean {
  return enabledFeatures().has(feature);
}

/**
 * Fail closed for workflows that exist in the prototype but have not yet been
 * converted to a single database transaction with an inseparable audit record.
 */
export function requireTrustedFinanceFeature(feature: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (enabledFeatures().has(feature)) {
      next();
      return;
    }
    res.status(503).json({
      error: 'This financial workflow is unavailable until its atomic posting and reversal controls are enabled.',
      feature,
    });
  };
}
