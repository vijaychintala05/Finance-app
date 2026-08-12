import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Authenticated financial master-data lifecycle', () => {
  test('customer creation survives a full browser reload', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const contactName = `Treasury Owner ${suffix}`;
    const companyName = `Persistent Customer ${suffix}`;
    const email = `billing-${Date.now()}@customer.test`;

    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.getByRole('button', { name: 'New Customer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add New Client' })).toBeVisible();
    await page.getByPlaceholder('e.g. John Smith').fill(contactName);
    await page.getByPlaceholder('e.g. AcroTech Solutions Inc.').fill(companyName);
    await page.getByPlaceholder('billing@company.com').fill(email);
    const [createClientResponse] = await Promise.all([
      page.waitForResponse(response =>
        response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith('/api/v1/finance/clients')),
      page.getByRole('button', { name: 'Save Client' }).click(),
    ]);
    expect(
      createClientResponse.status(),
      `Customer creation failed: ${await createClientResponse.text()}`,
    ).toBe(201);

    const visibleCustomer = () => testInfo.project.name.includes('mobile')
      ? page.locator('div.block.lg\\:hidden').getByText(companyName, { exact: true }).filter({ visible: true })
      : page.getByRole('row').filter({ hasText: companyName });
    await expect(visibleCustomer()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: '+ New', exact: true })).toBeVisible({ timeout: 15_000 });

    // Navigate back to Customers after reload and prove the record came from
    // the API-backed database rather than transient React/browser state.
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.getByRole('button', { name: 'New Customer', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(visibleCustomer()).toBeVisible();
    await expect(page.getByText(contactName, { exact: true }).filter({ visible: true })).toBeVisible();
  });
});
