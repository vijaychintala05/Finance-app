import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3100',
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
      DATABASE_MODE: 'memory',
      USE_PG_MEM: 'true',
      DISABLE_HMR: 'true',
      JWT_SECRET: 'e2e-isolated-test-jwt-secret-do-not-use-in-production-12345',
    },
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120 * 1000,
  },
});
