import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ci = readFileSync('.github/workflows/ci.yaml', 'utf8');
const publish = readFileSync('.github/workflows/publish-container.yaml', 'utf8');
const playwright = readFileSync('playwright.config.ts', 'utf8');

describe('release browser qualification contract', () => {
  it('runs the full Playwright suite against PostgreSQL in CI', () => {
    expect(ci).toContain('name: PostgreSQL Playwright Browser Qualification');
    expect(ci).toContain('POSTGRES_DB: firmbooks_e2e');
    expect(ci).toContain('DATABASE_MODE: postgres');
    expect(ci).toContain('USE_PG_MEM: "false"');
    expect(ci).toContain('REQUIRE_REAL_POSTGRES_E2E: "true"');
    expect(ci).not.toMatch(/Run Playwright Browser Regression Specs[\s\S]*?DATABASE_MODE: memory/);
  });

  it('prevents production artifact verification from bypassing browser qualification', () => {
    expect(ci).toContain('needs: [static-analysis, test-suites, browser-qualification]');
  });

  it('tests critical user journeys against the built release container before publish', () => {
    expect(publish).toContain('Run critical browser journeys against the PostgreSQL release image');
    expect(publish).toContain('PLAYWRIGHT_SKIP_WEBSERVER: "true"');
    expect(publish).toContain('PLAYWRIGHT_TEST_BASE_URL: http://127.0.0.1:3000');
    for (const journey of [
      'order-to-cash-lifecycle.spec.ts',
      'procure-to-pay-lifecycle.spec.ts',
      'payment-allocation-workflow.spec.ts',
      'bank-reconciliation.spec.ts',
      'period-close-and-lock-lifecycle.spec.ts',
    ]) expect(publish).toContain(journey);
    expect(publish.indexOf('Run critical browser journeys')).toBeLessThan(publish.indexOf('Build and publish'));
  });

  it('requires O2C corrections, P2P settlement, and close review to survive reload', () => {
    const o2c = readFileSync('e2e/order-to-cash-lifecycle.spec.ts', 'utf8');
    const p2p = readFileSync('e2e/procure-to-pay-lifecycle.spec.ts', 'utf8');
    const close = readFileSync('e2e/period-close-and-lock-lifecycle.spec.ts', 'utf8');
    expect(o2c).toContain('/api/v1/security/void-invoice');
    expect(o2c).toContain('await page.reload()');
    expect(p2p).toContain('/api/v1/finance/vendor-payments');
    expect(p2p).toContain('await page.reload()');
    expect(close).toContain('/api/v1/finance/period-close/review');
    expect(close).toContain('await page.reload()');
  });

  it('fails closed when PostgreSQL qualification silently falls back to memory', () => {
    expect(playwright).toContain("process.env.REQUIRE_REAL_POSTGRES_E2E === 'true'");
    expect(playwright).toContain('Playwright PostgreSQL qualification requires DATABASE_URL');
    expect(playwright).toContain('useExternalServer ? undefined');
  });
});
