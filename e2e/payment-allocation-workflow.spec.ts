import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('End-to-End Payment Allocation, Relational Integrity & Ledger Verification', () => {
  test('complete invoice lifecycle: create invoice, unsaved guard, record payment, reload, verify ledger and reports', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const companyName = `Enterprise Client ${suffix}`;
    const contactName = `Director ${suffix}`;
    const today = new Date().toISOString().split('T')[0];

    // 1. Create Customer
    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.getByRole('button', { name: 'New Customer', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add New Client' })).toBeVisible();
    await page.getByPlaceholder('e.g. John Smith').fill(contactName);
    await page.getByPlaceholder('e.g. AcroTech Solutions Inc.').fill(companyName);
    await page.getByPlaceholder('billing@company.com').fill(`billing-${suffix}@acme.test`);

    const [createClientResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.endsWith('/api/v1/finance/clients')
      ),
      page.getByRole('button', { name: 'Save Client' }).click(),
    ]);
    expect(createClientResponse.status()).toBe(201);

    // 2. Navigate to Invoices view
    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/invoices`);
    await page.waitForTimeout(500);

    // Open Invoice Modal
    await page.getByRole('button', { name: 'New Invoice', exact: true }).first().click();
    await expect(page.getByText('Create New Sales Invoice')).toBeVisible();

    // Verify Unsaved Changes Guard
    await page.locator('input[placeholder="Item or service detail"]:visible').fill('Cloud Consulting');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep Editing' }).click();
    await expect(page.getByRole('heading', { name: 'Unsaved Changes' })).not.toBeVisible();

    // 3. Select Client, fill unit price and submit invoice
    const clientSelect = page.locator('select').first();
    await expect(clientSelect.locator('option')).not.toHaveCount(0, { timeout: 10_000 });
    await clientSelect.selectOption({ index: 0 });

    const numberInputs = page.locator('input[type="number"]:visible');
    await numberInputs.nth(testInfo.project.name.includes('mobile') ? 2 : 1).fill('500');

    const [createInvoiceResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.includes('/api/v1/finance/invoices')
      ),
      page.locator('form').getByRole('button', { name: 'Create Invoice' }).click(),
    ]);
    expect(createInvoiceResponse.status()).toBe(201);
    await expect(page.getByText('Cloud Consulting', { exact: false }).first()).toBeVisible({ timeout: 10_000 });

    // 4. Navigate to Payments Received
    await page.goto(`${baseUrl}#/payments_received`);
    await page.waitForTimeout(500);

    const recordPaymentBtn = page.getByRole('button', { name: 'Record payment', exact: false }).first();
    await expect(recordPaymentBtn).toBeEnabled({ timeout: 10_000 });
    await recordPaymentBtn.click();
    await expect(page.getByText('Record payment received')).toBeVisible();

    const form = page.locator('form');
    const invoiceSelect = form.locator('select').nth(0);
    const accountSelect = form.locator('select').nth(1);

    await expect(invoiceSelect.locator('option')).not.toHaveCount(1, { timeout: 10_000 });
    await expect(accountSelect.locator('option')).not.toHaveCount(1, { timeout: 10_000 });

    await invoiceSelect.selectOption({ index: 1 });
    await accountSelect.selectOption({ index: 1 });

    await form.locator('input[type="date"]').fill(today);
    await form.locator('input[type="number"]').fill('500');

    const [paymentResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/finance/payments-received')
      ),
      form.locator('button[type="submit"]').click(),
    ]);
    expect(paymentResponse.status()).toBe(201);

    // 5. Browser Page Reload to prove DB state persistence
    await page.reload();
    await expect(page.getByRole('button', { name: '+ New', exact: true })).toBeVisible({ timeout: 15_000 });

    // 6. Navigate to Invoices view and verify PAID status after reload
    await page.goto(`${baseUrl}#/invoices`);
    await page.waitForTimeout(500);
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible();

    // 7. Navigate to Reports view and verify General Ledger
    await page.goto(`${baseUrl}#/reports`);
    await page.waitForTimeout(500);
    await expect(page.getByText('All Reports', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Every listed report is generated', { exact: false })).toBeVisible({ timeout: 10_000 });

    // 8. Open General Ledger report and verify authoritative entries
    const glCard = page.getByText('General Ledger', { exact: true }).first();
    await expect(glCard).toBeVisible({ timeout: 10_000 });
    await glCard.click();

    // Verify GL report rendered with accounts and transactions
    await expect(page.getByText('Accounts Receivable', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('500.00', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  });
});
