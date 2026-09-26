import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Vendor document lifecycle', () => {
  test('uploads, reloads, and archives a vendor document', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);
    const suffix = `${testInfo.project.name}-${Date.now()}`;
    const vendorName = `Document Vendor ${suffix}`;
    const fileName = `contract-${suffix}.pdf`;

    await page.getByRole('button', { name: '+ New', exact: true }).click();
    await page.getByRole('button', { name: 'New Vendor', exact: true }).click();
    const vendorDialog = page.getByRole('form', { name: 'Create vendor' });
    await expect(vendorDialog).toBeVisible();
    await vendorDialog.getByLabel('Display name').fill(vendorName);
    await vendorDialog.getByLabel('Email').fill(`vendor-${suffix}@documents.test`);

    const [createVendorResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/finance/vendors')),
      vendorDialog.getByRole('button', { name: 'Create vendor' }).click(),
    ]);
    expect(createVendorResponse.status()).toBe(201);
    const createdVendor = await createVendorResponse.json();

    const baseUrl = page.url().split('#')[0];
    await page.goto(`${baseUrl}#/vendors`);
    await page.getByText(vendorName, { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('Vendor Documents & Contracts')).toBeVisible();

    const uploadInput = page.locator('input[type="file"]');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');
    const [uploadResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/api/v1/finance/vendors/${createdVendor.id}/attachments`)),
      uploadInput.setInputFiles({ name: fileName, mimeType: 'application/pdf', buffer: pdf }),
    ]);
    expect(uploadResponse.status()).toBe(201);
    const uploaded = await uploadResponse.json();
    const attachmentId = uploaded.attachments[0].id as string;
    await expect(page.getByText(fileName, { exact: true })).toBeVisible();

    await page.reload();
    await page.getByText(vendorName, { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText(fileName, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Remove ${fileName}` }).click();
    const archiveDialog = page.getByRole('alertdialog', { name: 'Remove vendor document?' });
    await expect(archiveDialog).toBeVisible();
    await expect(archiveDialog).toContainText('audit history is retained');
    const [archiveResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith(`/api/v1/finance/vendors/${createdVendor.id}/attachments/${attachmentId}`)),
      archiveDialog.getByRole('button', { name: 'Remove document' }).click(),
    ]);
    expect(archiveResponse.ok()).toBe(true);
    await expect(page.getByRole('status')).toContainText(fileName);
    await expect(page.getByRole('status')).toContainText(/request id/i);

    await page.reload();
    await page.getByText(vendorName, { exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText('No documents uploaded for this vendor yet.')).toBeVisible();
  });
});
