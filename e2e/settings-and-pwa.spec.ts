import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('V1 settings and PWA shell', () => {
  test('shows only implemented settings and exposes install metadata', async ({ page, request }, testInfo) => {
    await registerTenant(page, testInfo);

    const settingsButton = page.getByRole('button', { name: 'Settings', exact: true });
    if (testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    }
    await settingsButton.click();
    await expect(page.getByRole('heading', { name: 'FirmBooks v1 settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Identity & Password/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Workspace Governance/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Security & Audit Logs/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Display Preferences/ })).toBeVisible();
    await expect(page.getByText('Custom Domain', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Automation', { exact: true })).toHaveCount(0);

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
