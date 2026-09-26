import { test, expect } from '@playwright/test';
import { registerTenant } from './helpers';

test.describe('Dashboard action-first attention queue', () => {
  test.use({ serviceWorkers: 'block' });
  test('shows server attention before mobile financial summaries', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await registerTenant(page, testInfo);
    await page.route('**/api/v1/dashboard*', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const body = await response.json();
      body.dashboard.commandCenter.attention = [{
        id: 'overdue-receivables',
        severity: 'critical',
        label: 'Overdue customer invoices',
        count: 1,
        amount: 125,
        destination: 'invoices',
      }];
      await route.fulfill({ response, json: body });
    });
    await page.getByRole('button', { name: 'Refresh dashboard metrics' }).click();

    if (testInfo.project.name.includes('mobile')) {
      const overview = page.getByTestId('mobile-dashboard-overview');
      const attention = overview.getByTestId('mobile-dashboard-attention');
      const metrics = overview.getByTestId('mobile-dashboard-primary-metrics');
      await expect(attention).toBeVisible();
      await expect(attention.getByText('Overdue customer invoices')).toBeVisible();
      await expect(attention.getByRole('button', { name: 'Review Overdue customer invoices' })).toBeVisible();
      const orderIsActionFirst = await attention.evaluate((node, metricNode) =>
        Boolean(node.compareDocumentPosition(metricNode as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await metrics.elementHandle());
      expect(orderIsActionFirst).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } else {
      await expect(page.getByRole('heading', { name: 'Needs Attention' })).toBeVisible();
      await expect(page.getByText('Overdue customer invoices').last()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Take Action' }).first()).toBeVisible();
    }
  });
});