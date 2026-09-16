import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CERTIFIED_OPTIONAL_FEATURES, requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';
import { Request, Response } from 'express';
import { getFinanceCapabilities } from '../capabilities/financeCapabilities';

describe('trustedFeature.middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(['vendor-settlements', 'vendor-credits'])('honors the published payables capability for %s routes in production', (feature) => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_FINANCE_FEATURES = 'period-close,payables-settlement';
    expect(getFinanceCapabilities().find((item) => item.key === 'payables-settlement')?.state).toBe('enabled');
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();
    requireTrustedFinanceFeature(feature)({} as Request, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(['', 'period-close', 'vendor-credits'])('does not enable vendor payments for unrelated configuration: %s', (configured) => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_FINANCE_FEATURES = configured;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();
    requireTrustedFinanceFeature('vendor-settlements')({} as Request, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it.each(['payable-write-offs', 'cash-flow-classification'])('does not expand the payables capability to %s', (feature) => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_FINANCE_FEATURES = 'payables-settlement';
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();
    requireTrustedFinanceFeature(feature)({} as Request, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('certifies accountant-overview and delivery-challans in CERTIFIED_OPTIONAL_FEATURES', () => {
    expect(CERTIFIED_OPTIONAL_FEATURES.has('accountant-overview')).toBe(true);
    expect(CERTIFIED_OPTIONAL_FEATURES.has('delivery-challans')).toBe(true);
  });

  it('allows execution when feature is enabled in non-production mode', () => {
    delete process.env.TRUSTED_FINANCE_FEATURES;
    process.env.NODE_ENV = 'development';

    const middleware = requireTrustedFinanceFeature('accountant-overview');
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('fails closed with HTTP 503 when feature is disabled in production', () => {
    delete process.env.TRUSTED_FINANCE_FEATURES;
    process.env.NODE_ENV = 'production';

    const middleware = requireTrustedFinanceFeature('delivery-challans');
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'delivery-challans',
      })
    );
  });

  it('allows execution when feature is explicitly declared in TRUSTED_FINANCE_FEATURES in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_FINANCE_FEATURES = 'delivery-challans,accountant-overview';

    const middleware = requireTrustedFinanceFeature('delivery-challans');
    const req = {} as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
