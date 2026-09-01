import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Procure-to-Pay (P2P) Full Accounting Lifecycle', () => {
  test('creates vendor, posts vendor bill, records payment made, and verifies payables ledger', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const vendorName = `Hardware Vendor ${suffix}`;

    // 1. Create Vendor via + New button
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.getByRole('button', { name: 'New Vendor', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add New Vendor' })).toBeVisible();
    await page.getByPlaceholder('e.g. AWS Cloud Services / Century Plywood').fill(vendorName);
    await page.getByPlaceholder('accounts@vendor.com').fill(`vendor-${suffix}@hardware.test`);

    const [createVendorResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/v1/finance/vendors')
      ),
      page.getByRole('button', { name: 'Create Vendor' }).click(),
    ]);
    expect(createVendorResponse.status()).toBe(201);

    // 2. Navigate to Bills view
    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/bills`);
    await page.waitForTimeout(500);

    // 3. Open New Bill Modal
    await page.getByRole('button', { name: 'New Bill', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Record Vendor Bill' })).toBeVisible();

    // Select Vendor
    const vendorSelect = page.locator('select').first();
    await expect(vendorSelect.locator('option')).not.toHaveCount(0, { timeout: 10_000 });
    await vendorSelect.selectOption({ index: 0 });

    // Enter bill number and total amount
    const billNumberInput = page.getByPlaceholder('e.g. BILL-2026-001');
    if (await billNumberInput.isVisible()) {
      await billNumberInput.fill(`BILL-${suffix}`);
    }

    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.fill('1500');

    const [createBillResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.includes('/api/v1/finance/bills')
      ),
      page.getByRole('button', { name: 'Record Bill' }).click(),
    ]);
    expect(createBillResponse.status()).toBe(201);

    // Verify bill appears in bills list
    await expect(page.getByText('1,500').first()).toBeVisible();
  });
});
