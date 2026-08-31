import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('V1 settings and PWA shell', () => {
  // Keep API failure/permission fixtures visible to Playwright's route handlers.
  test.use({ serviceWorkers: 'block' });
  test('shows only implemented settings and exposes install metadata', async ({ page, request }, testInfo) => {
    await registerTenant(page, testInfo);

    const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
    if (testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    }
    await settingsButton.click();
    if (testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
    }
    await expect(page.getByRole('heading', { name: 'All Settings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Identity & Password/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Workspace Governance/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Security & Audit Logs/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Display Preferences/ })).toBeVisible();
    await expect(page.getByText('Custom Domain', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Automation', { exact: true })).toHaveCount(0);

    const workspace = page.locator('.settings-workspace');
    await expect(workspace.locator('.settings-category')).toHaveCount(4);
    await page.screenshot({ path: testInfo.outputPath('settings-overview.png'), fullPage: true });
    expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);

    await page.getByRole('searchbox', { name: 'Search settings' }).fill('GST');
    await expect(page.getByRole('status', { name: '' }).filter({ hasText: '1 setting' })).toBeVisible();
    await workspace.getByRole('button', { name: /Taxes & Address/ }).click();
    await expect(page.getByLabel('GSTIN / VAT Number')).toBeVisible();
    await expect(page.getByLabel('Organization Display Name *')).toBeHidden();

    await page.getByLabel('City', { exact: true }).fill('Pune');
    // Searching from a form must preserve its draft.
    await page.getByRole('searchbox', { name: 'Search settings' }).fill('not-a-real-setting');
    await expect(page.getByRole('heading', { name: 'No settings found' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).first().click();
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('Pune');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Back to all settings' }).click();
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('Pune');
    await page.route('**/api/v1/organizations/current', async route => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({ status: 503, json: { error: 'Settings temporarily unavailable' } });
      } else await route.continue();
    });
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Settings temporarily unavailable');
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('Pune');
    await expect(page.getByText('Changes saved.', { exact: true })).toHaveCount(0);
    await page.unroute('**/api/v1/organizations/current');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('settings-tax-form.png'), fullPage: true });
    expect(await workspace.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: 'Back to all settings' }).click();
    await workspace.getByRole('button', { name: /Taxes & Address/ }).click();
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('Pune');
    await page.getByRole('button', { name: 'Back to all settings' }).click();
    await workspace.getByRole('button', { name: /Invoicing & Fiscal Defaults/ }).click();
    await expect(page.getByLabel('Default Payment Terms', { exact: true })).toBeVisible();
    await page.getByLabel('Default Payment Terms', { exact: true }).selectOption('Net 45');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.getByLabel('Default Payment Terms', { exact: true })).toHaveValue('Net 30');
    await page.screenshot({ path: testInfo.outputPath('settings-invoicing.png'), fullPage: true });
    if (!testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: 'Toggle Light / Dark Mode' }).click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await page.screenshot({ path: testInfo.outputPath('settings-dark.png'), fullPage: true });
      await page.getByRole('button', { name: 'Toggle Light / Dark Mode' }).click();
    }
    await page.getByRole('button', { name: 'Back to all settings' }).click();
    await workspace.getByRole('button', { name: /Organization Profile/ }).click();
    await page.getByLabel('Organization Display Name *').fill('Northstar Studio');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await expect(page.locator('.settings-org')).toHaveText('Northstar Studio');
    await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('settings-profile.png'), fullPage: true });

    await page.getByRole('button', { name: 'Back to all settings' }).click();
    await page.route('**/api/v1/auth/me', async route => {
      const response = await route.fetch();
      const body = await response.json();
      body.organizations = body.organizations.map((org: { id: string; role: string }) => ({ ...org, role: 'Viewer' }));
      await route.fulfill({ response, json: body });
    });
    await workspace.getByRole('button', { name: /Bank Details/ }).click();
    await expect(page.getByLabel('Beneficiary Bank Name')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save Changes', exact: true })).toHaveCount(0);
    await expect(page.getByText(/viewing organization settings in read-only mode/)).toBeVisible();

    const manifestResponse = await request.get('/manifest.webmanifest');
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({ name: 'FirmBooks Finance', display: 'standalone', start_url: '/' });
    expect(manifest.icons).toHaveLength(2);

    const serviceWorkerResponse = await request.get('/sw.js');
    expect(serviceWorkerResponse.ok()).toBe(true);
    expect(await serviceWorkerResponse.text()).toContain("url.pathname.startsWith('/api/')");
  });
});
