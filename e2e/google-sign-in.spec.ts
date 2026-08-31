import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('keeps Google configuration and connection errors on the sign-in page', async ({ page }) => {
  await page.goto(process.env.GOOGLE_PREVIEW_URL || '/');
  await page.route('**/api/v1/identity/google/auth-url?*', route => route.fulfill({
    status: 503,
    json: { error: 'Google sign-in is not configured for this server. Use email and password, or ask the administrator to configure Google sign-in.' },
  }));
  const signIn = page.getByRole('button', { name: 'Sign in with Google', exact: true });
  const initialUrl = page.url();
  await signIn.click();
  await expect(page.getByRole('alert')).toContainText('Google sign-in is not configured');
  await expect(signIn).toBeEnabled();
  expect(page.url()).toBe(initialUrl);
  await expect(page.getByPlaceholder('Password', { exact: true })).toBeVisible();

  await page.unroute('**/api/v1/identity/google/auth-url?*');
  await page.route('**/api/v1/identity/google/auth-url?*', route => route.abort());
  await signIn.click();
  await expect(page.getByRole('alert')).toContainText('Unable to connect to Google sign-in');
  await expect(signIn).toBeEnabled();
  expect(page.url()).toBe(initialUrl);
});
