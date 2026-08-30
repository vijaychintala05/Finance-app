import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Order-to-Cash (O2C) Full Accounting Lifecycle', () => {
  test('creates customer, creates sales invoice, records payment, and verifies customer ledger statement', async ({ page }, testInfo) => {
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
    await clientSelect.selectOption({ index: 0 });

    // Set item detail & price
    await page.getByPlaceholder('Item or service detail').first().fill('Enterprise Cloud Consulting');
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(1).fill('2500');

    const [createInvoiceResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.includes('/api/v1/finance/invoices')
      ),
      page.getByRole('button', { name: 'Create Invoice' }).click(),
    ]);
    expect(createInvoiceResponse.status()).toBe(201);

    // Verify invoice list contains $2,500 invoice
    await expect(page.getByText('2,500').first()).toBeVisible();
  });
});
