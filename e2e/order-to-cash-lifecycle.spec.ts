import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Order-to-Cash (O2C) Full Accounting Lifecycle', () => {
  test('creates a customer, posts an invoice, and preserves an audited void across reload', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const companyName = `Global Enterprise ${suffix}`;
    const contactName = `Accountant ${suffix}`;

    // 1. Create Customer
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.getByRole('button', { name: 'New Customer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add New Client' })).toBeVisible();
    await page.getByPlaceholder('e.g. John Smith').fill(contactName);
    await page.getByPlaceholder('e.g. AcroTech Solutions Inc.').fill(companyName);
    await page.getByPlaceholder('billing@company.com').fill(`finance-${suffix}@global.test`);

    const [createClientResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/v1/finance/clients')
      ),
      page.getByRole('button', { name: 'Save Client' }).click(),
    ]);
    expect(createClientResponse.status()).toBe(201);

    // 2. Navigate to Invoices
    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/invoices`);
    await page.waitForTimeout(500);

    // 3. Open Invoice Modal
    await page.getByRole('button', { name: 'New Invoice', exact: true }).first().click();
    await expect(page.getByText('Create New Sales Invoice')).toBeVisible();

    // Select Client
    const clientSelect = page.locator('select').first();
    await expect(clientSelect.locator('option')).not.toHaveCount(0, { timeout: 10_000 });
    await clientSelect.selectOption({ label: `${companyName} (${contactName})` });

    // Set item detail & price
    await page.locator('input[placeholder="Item or service detail"]:visible').fill('Enterprise Cloud Consulting');
    const numberInputs = page.locator('input[type="number"]:visible');
    await numberInputs.nth(testInfo.project.name.includes('mobile') ? 2 : 1).fill('2500');

    const [createInvoiceResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.includes('/api/v1/finance/invoices')
      ),
      page.locator('form').getByRole('button', { name: 'Create Invoice' }).click(),
    ]);
    await expect(page.getByText('Create New Sales Invoice')).toBeHidden({ timeout: 10_000 });

    // Verify invoice list contains $2,500 invoice
    await expect(page.getByText('2,500').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });

    // 4. Void through the reason-required in-app correction workflow.
    await page.getByText(companyName, { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('TAX INVOICE')).toBeVisible();
    await page.getByTitle('More actions').click();
    await page.getByText('Void Invoice', { exact: true }).click();
    const voidDialog = page.getByRole('dialog', { name: /void invoice .*\?/i });
    await expect(voidDialog).toBeVisible();
    await expect(voidDialog.getByText(/does not delete history/i)).toBeVisible();
    await voidDialog.getByLabel('Reason for voiding').fill('Duplicate invoice raised during release qualification');

    const [voidResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/security/void-invoice')),
      voidDialog.getByRole('button', { name: 'Void with reversal' }).click(),
    ]);
    expect(voidResponse.ok()).toBe(true);
    await expect(page.getByText(/original remains in history/i)).toBeVisible({ timeout: 15_000 });

    // 5. Reload to prove the void status and reversal-backed correction persist.
    await page.reload();
    await expect(page.getByText(companyName, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Void', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });
});
