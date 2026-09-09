import { defineConfig, devices } from '@playwright/test';

// Local browser work remains zero-setup, while CI supplies DATABASE_URL and
// exercises the same PostgreSQL-backed server used by the release image.
const useMemoryDatabase = !process.env.DATABASE_URL || process.env.USE_PG_MEM === 'true';

export default defineConfig({
  testDir: './e2e',
  timeout: 60 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://127.0.0.1:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 375, height: 667 },
      },
    },
  ],
  webServer: {
    command: 'npx tsx server.ts',
    env: {
      ...process.env,
      PORT: '3100',
      NODE_ENV: 'test',
      ...(useMemoryDatabase
        ? { DATABASE_MODE: 'memory', USE_PG_MEM: 'true' }
        : { DATABASE_MODE: 'postgres', USE_PG_MEM: 'false' }),
      DISABLE_HMR: 'true',
      JWT_SECRET: 'e2e-isolated-test-jwt-secret-do-not-use-in-production-12345',
    },
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
