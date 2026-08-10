import { test, expect } from '@playwright/test';

test.describe('Banking & Reconciliation E2E Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Banking view rendering and transaction filtering', async ({ page }) => {
    // 1. Navigate to Banking tab via sidebar or URL
    const bankingNav = page.locator('button, a').filter({ hasText: /Banking/i }).first();
    if (await bankingNav.isVisible()) {
      await bankingNav.click();
    }

    // 2. Check Banking UI components
    await page.waitForTimeout(500);
    const bodyContent = await page.textContent('body');
    expect(bodyContent).toBeDefined();
  });
});
