import { NextFunction, Request, Response } from 'express';
import {
  CERTIFIED_OPTIONAL_FINANCE_CAPABILITY_KEYS,
  FINANCE_CAPABILITY_IMPLICATIONS,
  type FinanceCapabilityKey,
} from '../../../src/capabilities/financeCapabilityRegistry';

// An optional feature must first be certified in the shared registry by code review; an
// environment variable can then enable that reviewed implementation for a deployment.
// Configuration alone can never promote prototype code into the trusted surface.
export const CERTIFIED_OPTIONAL_FEATURES: ReadonlySet<string> = CERTIFIED_OPTIONAL_FINANCE_CAPABILITY_KEYS;

function enabledFeatures(): Set<string> {
  const configured = process.env.TRUSTED_FINANCE_FEATURES
    ?? (process.env.NODE_ENV === 'production' ? '' : Array.from(CERTIFIED_OPTIONAL_FEATURES).join(','));
  const enabled = new Set(
    configured
      .split(',')
      .map((feature) => feature.trim())
      .filter((feature) => CERTIFIED_OPTIONAL_FEATURES.has(feature))
  );
  for (const [umbrella, impliedFeatures] of FINANCE_CAPABILITY_IMPLICATIONS) {
    if (!enabled.has(umbrella)) continue;
    for (const feature of impliedFeatures) enabled.add(feature);
  }
  return enabled;
}

export function isFeatureEnabled(feature: FinanceCapabilityKey): boolean {
  return enabledFeatures().has(feature);
}

/**
 * Fail closed for workflows that exist in the prototype but have not yet been
 * converted to a single database transaction with an inseparable audit record.
 */
export function requireTrustedFinanceFeature(feature: FinanceCapabilityKey) {
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
