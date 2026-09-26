import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test('adapts report navigation to mobile and desktop layouts', async ({ page }, testInfo) => {
  await registerTenant(page, testInfo);
  const baseUrl = page.url().split('#')[0];
  await page.goto(`${baseUrl}#/reports`);

  await expect(page.getByRole('heading', { name: 'All Reports' })).toBeVisible();
  await expect(page.getByPlaceholder('Search report name or keyword...')).toBeVisible();

  if (testInfo.project.name.includes('mobile')) {
    const sectionPicker = page.getByRole('combobox', { name: 'Report section' });
    await expect(sectionPicker).toBeVisible();
    await expect(page.getByRole('button', { name: 'All Reports', exact: true })).toBeHidden();
    await sectionPicker.selectOption('Sales');
  } else {
    await expect(page.getByRole('combobox', { name: 'Report section' })).toBeHidden();
    await page.locator('aside').filter({ hasText: 'REPORT CATEGORY' }).getByRole('button', { name: /^Sales/ }).click();
  }

  await expect(page.getByRole('heading', { name: 'Sales Reports' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Sales by Customer report' })).toBeVisible();
});
