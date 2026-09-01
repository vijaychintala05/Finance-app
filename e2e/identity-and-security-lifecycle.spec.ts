import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Self-Hosted FirmBooks Identity & Security Lifecycle', () => {
  test('authenticates via opaque session, accesses security center, and navigates active devices', async ({ page }, testInfo) => {
    await registerTenant(page, testInfo);

    // Navigate to Security Center view via hash routing
    await page.goto('/#/security_center');

    // Verify Identity & Security Center header
    await expect(page.getByText('Identity & Security Center')).toBeVisible();
    await expect(page.getByText('Tailscale Private HTTPS')).toBeVisible();

    // Verify Active Devices card is visible
    await expect(page.getByText('Active Devices & Opaque Sessions')).toBeVisible();

    // Verify Invite Team Member card is visible
    await expect(page.getByText('Invite Team Member')).toBeVisible();

    // Verify Two-Factor Authentication card is visible
    await expect(page.getByText('Two-Factor Authentication')).toBeVisible();

    // Open MFA setup modal
    const setupMfaButton = page.getByRole('button', { name: /Setup Two-Factor Auth|Reconfigure 2FA/i });
    if (await setupMfaButton.isVisible()) {
      await setupMfaButton.click();
      await expect(page.getByText('Setup Two-Factor Authentication')).toBeVisible();
      await expect(page.getByText('Enter 6-digit Authenticator Code:')).toBeVisible();

      // Close modal
      const closeButton = page.locator('button:has(svg.lucide-x)');
      if (await closeButton.isVisible()) {
        await closeButton.click();
      }
    }
  });
});
