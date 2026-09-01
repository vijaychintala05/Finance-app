import { test, expect } from '@playwright/test';
import { readSession, registerTenant } from './helpers';

test.describe('Banking tenant boundary', () => {
  test('banking view uses the authenticated tenant chart', async ({ page, request }, testInfo) => {
    await registerTenant(page, testInfo);

    if (testInfo.project.name.includes('mobile')) {
      await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    }
    await page.getByRole('button', { name: /^Banking & Cash/ }).filter({ visible: true }).click();
    await expect(page.getByRole('heading', { name: 'Banking & Cash Management' })).toBeVisible();
    await expect(page.getByText('Bank Balance', { exact: true })).toBeVisible();

    const session = await readSession(page);
    const response = await request.get(new URL('/api/v1/finance/accounts', page.url()).toString(), {
      headers: {
        Authorization: `Bearer ${session.token}`,
        'X-Organization-ID': session.organizationId,
      },
    });
    expect(response.ok()).toBe(true);
    const accounts = await response.json();
    expect(accounts.map((account: { code: string }) => account.code)).toEqual(expect.arrayContaining(['1000', '1100', '2000', '4000', '6000']));
    expect(accounts.every((account: { organization_id: string }) => account.organization_id === session.organizationId)).toBe(true);
  });
});
