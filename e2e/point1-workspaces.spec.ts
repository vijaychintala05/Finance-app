import { expect, test } from '@playwright/test';
import { registerTenant } from './helpers';

const workspaces = [
  ['credit_notes', 'Receivables corrections'],
  ['payments_made', 'Payables settlement'],
  ['recurring_invoices', 'Recurring Invoices'],
  ['fixed_assets', 'Fixed Assets'],
  ['period_close', 'Month-End Close'],
  ['team_access', 'Team Access'],
  ['recovery_center', 'Recovery Center'],
] as const;

test('Point-1 workspaces are enabled, responsive, and free of page overflow', async ({ page }, testInfo) => {
  await registerTenant(page, testInfo);
  const baseUrl = page.url().split('#')[0];

  for (const [route, heading] of workspaces) {
    await page.goto(`${baseUrl}#/${route}`);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('This workflow has not completed Point-1 certification.')).toHaveCount(0);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${route} should not create page-level horizontal overflow`).toBeLessThanOrEqual(1);
  }

  await page.goto(`${baseUrl}#/recovery_center`);
  await expect(page.getByRole('heading', { name: 'Recovery Center' })).toBeVisible();
  await page.getByRole('button', { name: 'Create encrypted export' }).click();
  await expect(page.getByText(/^rcv-art-/).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stage and validate' }).first().click();
  await expect(page.getByText('VALIDATED', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Promote restore' }).click();
  await page.getByLabel('Current owner password').fill('E2E-Secure-Password-123!');
  const confirmation = await page.locator('form code').textContent();
  await page.getByLabel('Type this confirmation exactly').fill(confirmation || '');
  await page.getByRole('button', { name: 'Promote recovery', exact: true }).click();
  await expect(page.getByText('PROMOTED', { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath('recovery-center.png'), fullPage: true });
  await page.goto(`${baseUrl}#/payments_made`);
  await expect(page.getByRole('heading', { name: 'Payables settlement' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('payables-settlement.png'), fullPage: true });
});
