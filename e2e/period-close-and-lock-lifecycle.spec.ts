import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Period Close & Accounting Lock Lifecycle', () => {
  test('persists accountable month-end review evidence across a browser reload', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);

    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/period_close`);
    await page.waitForTimeout(500);

    // Verify workspace header is rendered
    await expect(page.getByRole('heading', { name: 'Month-End Close' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('System Checks')).toBeVisible({ timeout: 15_000 });

    // Persist a review note through the audited server workflow.
    await expect(page.getByText('Reviewer Checklist')).toBeVisible();
    const reviewNote = `PostgreSQL close review ${Date.now()}`;
    await page.getByPlaceholder('Close review notes and exceptions').fill(reviewNote);
    const [saveResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith('/api/v1/finance/period-close/review')),
      page.getByRole('button', { name: 'Save review' }).click(),
    ]);
    expect(saveResponse.ok()).toBe(true);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(4);

    await page.reload();
    await expect(page.getByPlaceholder('Close review notes and exceptions')).toHaveValue(reviewNote, { timeout: 15_000 });
    await expect(page.getByText('IN REVIEW')).toBeVisible();
  });
});
