import { expect, Page, TestInfo } from '@playwright/test';

export async function registerTenant(page: Page, testInfo: TestInfo): Promise<{ email: string; organizationName: string }> {
  const unique = `${testInfo.project.name}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase();
  const email = `e2e-${unique}@firmbooks.test`;
  const organizationName = `Reliability ${testInfo.project.name} ${Date.now()}`;

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByRole('button', { name: 'Create a new firm' }).click();
  await page.getByPlaceholder('Full name').fill('E2E Reliability Owner');
  await page.getByPlaceholder('Organization name').fill(organizationName);
  await page.getByPlaceholder('Country of registration').fill('India');
  await page.getByRole('combobox').selectOption('INR');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill('E2E-Secure-Password-123!');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('button', { name: '+ New', exact: true })).toBeVisible({ timeout: 15_000 });
  return { email, organizationName };
}

export async function readSession(page: Page): Promise<{ token: string; organizationId: string }> {
  const session = await page.evaluate(() => ({
    token: localStorage.getItem('auth_token') || '',
    organizationId: localStorage.getItem('active_organization_id') || '',
  }));
  expect(session.token).not.toBe('');
  expect(session.organizationId).not.toBe('');
  return session;
}
