import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Period Close & Accounting Lock Lifecycle', () => {
  test('navigates to Month-End Close workspace, displays close checks and tasks', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);

    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/period-close`);
    await page.waitForTimeout(500);

    // Verify workspace header is rendered
    await expect(page.getByText('Month-End Close Workspace')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Pre-Close Integrity Checks')).toBeVisible();

    // Verify checklist / review tasks section
    await expect(page.getByText('Closing Tasks Checklist')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Review' })).toBeVisible();
  });
});
