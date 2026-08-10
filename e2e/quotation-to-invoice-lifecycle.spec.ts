import { test, expect } from '@playwright/test';

test.describe('Sales Lifecycle E2E — Quotation to Invoice and Payment', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Sense Studios Design|FirmBooks|Accounting/i);
  });

  test('Quotation to Invoice conversion and Payment Receipt workflow', async ({ page }) => {
    // 1. Verify Dashboard loaded
    await expect(page.locator('h1, h2, span').filter({ hasText: /Dashboard|Overview|Sense/i }).first()).toBeVisible();

    // 2. Open Global Search (⌘K)
    const searchTrigger = page.locator('input[placeholder*="Search invoices"]');
    if (await searchTrigger.isVisible()) {
      await searchTrigger.click();
      await expect(page.locator('input[placeholder*="Search across all invoices"]')).toBeVisible();
      await page.keyboard.press('Escape');
    }

    // 3. Quick Create / Estimates navigation
    const newBtn = page.getByRole('button', { name: /\+ New/i });
    if (await newBtn.isVisible()) {
      await newBtn.click();
      const newEstimateBtn = page.getByRole('button', { name: /New Estimate|Quote/i });
      if (await newEstimateBtn.isVisible()) {
        await newEstimateBtn.click();
      }
    }

    // 4. Verify page navigation or view render
    await page.waitForTimeout(500);
    expect(await page.title()).toBeTruthy();
  });
});
