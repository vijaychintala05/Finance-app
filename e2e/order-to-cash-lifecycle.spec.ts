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
    await page.getByPlaceholder('e.g. John Smith').fill(companyName);
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
    await clientSelect.selectOption({ label: `${companyName} (${companyName})` });

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
    // Invoice creation opens its detail preview; close it to reach the saved receipt action.
    await page.getByTitle('Close window').click();
    let originalJournalRequestUrl = '';
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname.endsWith('/journal')) originalJournalRequestUrl = url.href;
    });
    const originalJournalButton = page.getByRole('button', { name: 'View original posting journal' });
    await expect(originalJournalButton).toBeEnabled();
    await originalJournalButton.click();
    await expect(page.getByText('Original Posting Journal', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Verified journal .* for invoice/)).toBeVisible();
    expect(new URL(originalJournalRequestUrl).searchParams.has('journalEntryId')).toBe(true);
    await page.getByRole('button', { name: 'Close journal drill-down' }).click();
    await page.getByTitle('Close window').click();

    // Verify invoice list contains $2,500 invoice
    await expect(page.getByText('2,500').filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });

    // 4. Open the invoice from a filtered report and restore its exact report context.
    await page.goto(`${baseUrl}#/reports?report=invoice_details&from=2026-01-01&to=2026-12-31`);
    await expect(page.locator('h1').filter({ hasText: 'Invoice Details' })).toBeVisible({ timeout: 15_000 });
    const reportSearch = page.getByPlaceholder('Search this report');
    await reportSearch.fill(companyName);
    const sourceRow = page.getByRole('row').filter({ hasText: companyName });
    await expect(sourceRow).toBeVisible();
    await sourceRow.getByRole('button').click();
    await expect(page.getByText('TAX INVOICE', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to originating report' })).toBeVisible();
    expect(page.url()).toContain('back=');

    await page.goBack();
    await expect(page.locator('h1').filter({ hasText: 'Invoice Details' })).toBeVisible();
    await expect(page.getByPlaceholder('Search this report')).toHaveValue(companyName);
    await expect(page.locator('[data-report-focus="true"]')).toHaveCount(1);
    await page.goForward();
    await expect(page.getByText('TAX INVOICE', { exact: true })).toBeVisible();
    await page.getByTitle('Close window').click();
    expect(page.url()).not.toContain('id=');
    expect(page.url()).toContain('back=');
    await page.getByRole('button', { name: 'Back to originating report' }).click();
    await expect(page.locator('h1').filter({ hasText: 'Invoice Details' })).toBeVisible();
    await expect(page.locator('[data-report-focus="true"]')).toHaveCount(1);

    // 5. Void through the reason-required in-app correction workflow.
    await page.goto(`${baseUrl}#/invoices`);
    await expect(page.getByText(companyName, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    if (!await page.getByText('TAX INVOICE', { exact: true }).isVisible()) {
      await page.getByText(companyName, { exact: true }).filter({ visible: true }).first().click();
    }
    await expect(page.getByText('TAX INVOICE', { exact: true })).toBeVisible();
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
    await expect(page.getByText(/reversal journal/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Void', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByTitle('More actions')).toHaveCount(0);
    await expect(page.getByText('Void Invoice', { exact: true })).toHaveCount(0);

    // 5. Reload to prove the void status and reversal-backed correction persist.
    await page.reload();
    await expect(page.getByText(companyName, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Void', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });
});
