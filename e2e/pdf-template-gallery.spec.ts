import { expect, test } from '@playwright/test';
import { registerTenant } from './helpers';

test('PDF template gallery displays server sample sheets', async ({ page }, testInfo) => {
  await registerTenant(page, testInfo);
  if (testInfo.project.name.includes('mobile')) {
    await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    const mobileNav = page.locator('div.fixed.inset-0.z-50.lg\\:hidden');
    const settingsActions = mobileNav.getByRole('button', { name: 'Settings', exact: true });
    await settingsActions.first().click();
    if (await mobileNav.isVisible().catch(() => false) && await settingsActions.count() > 1) await settingsActions.last().click();
  } else {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  }
  const sampleResponse = page.waitForResponse((response) => response.url().includes('/finance/documents/quotes/preview/pdf?templateId=proposal'));
  await page.getByRole('button', { name: /PDF & Document Templates/ }).click();
  const thumbnailHost = page.getByLabel('Standard Quote PDF thumbnail');
  await expect(async () => thumbnailHost.scrollIntoViewIfNeeded()).toPass({ timeout: 10_000 });
  const thumbnail = page.getByRole('img', { name: 'Standard Quote rendered PDF page' });
  await expect(thumbnail).toBeVisible({ timeout: 30_000 });
  const response = await sampleResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  const inkPixels = await thumbnail.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0 && (pixels[index] < 220 || pixels[index + 1] < 220 || pixels[index + 2] < 220)) count += 1;
    }
    return count;
  });
  expect(inkPixels).toBeGreaterThan(100);
  await thumbnail.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('pdf-template-gallery.png'), fullPage: true });
  await thumbnail.locator('..').screenshot({ path: testInfo.outputPath('pdf-template-card.png') });

  await page.getByRole('button', { name: 'Preview Standard Quote' }).click();
  const fullPage = page.getByRole('img', { name: 'Standard Quote rendered page 1' });
  await expect(fullPage).toBeVisible({ timeout: 30_000 });
  expect(await fullPage.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d');
    if (!context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > 0 && (pixels[index] < 220 || pixels[index + 1] < 220 || pixels[index + 2] < 220)) count += 1;
    }
    return count;
  })).toBeGreaterThan(100);
  await expect(page.getByRole('dialog', { name: 'Full Preview: Standard Quote' }).locator('iframe')).toHaveCount(0);
});

test('every registered PDF model exposes a readable server-rendered template card', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await registerTenant(page, testInfo);
  if (testInfo.project.name.includes('mobile')) {
    await page.getByRole('button', { name: 'Open Mobile Menu' }).click();
    const mobileNav = page.locator('div.fixed.inset-0.z-50.lg\\:hidden');
    const settingsActions = mobileNav.getByRole('button', { name: 'Settings', exact: true });
    await settingsActions.first().click();
    if (await mobileNav.isVisible().catch(() => false) && await settingsActions.count() > 1) await settingsActions.last().click();
  } else {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
  }
  await page.getByRole('button', { name: /PDF & Document Templates/ }).click();

  const categoryNav = page.getByRole('heading', { name: 'Templates', exact: true }).locator('..').locator('..').getByRole('navigation');
  const categories = [
    ['Quotes', 'Quote Templates'], ['Sales Orders', 'Sales Order Templates'],
    ['Delivery Challans', 'Delivery Challan Templates'], ['Invoices', 'Invoice Templates'],
    ['Credit Notes', 'Credit Note Templates'], ['Purchase Orders', 'Purchase Order Templates'],
    ['Payment Receipts', 'Payment Receipt Templates'], ['Customer Statements', 'Customer Statement Templates'],
    ['Bills', 'Bill Templates'], ['Expenses', 'Expense Templates'],
    ['Vendor Credits', 'Vendor Credit Templates'], ['Vendor Payments', 'Vendor Payment Templates'],
    ['Vendor Statements', 'Vendor Statement Templates'], ['Journals', 'Journal Templates'],
  ] as const;
  let renderedModels = 0;
  for (const [category, heading] of categories) {
    await categoryNav.getByRole('button', { name: new RegExp(`^${category}(?:\\s|$)`) }).click();
    const gallery = page.getByRole('heading', { name: heading, exact: true }).locator('..').locator('..');
    const cards = gallery.locator('article');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      await card.scrollIntoViewIfNeeded();
      const canvas = card.locator('canvas[role="img"]');
      await expect(canvas).toBeVisible({ timeout: 30_000 });
      const inkPixels = await canvas.evaluate((sheet: HTMLCanvasElement) => {
        const context = sheet.getContext('2d');
        if (!context) return 0;
        const pixels = context.getImageData(0, 0, sheet.width, sheet.height).data;
        let painted = 0;
        for (let pixel = 0; pixel < pixels.length; pixel += 4) {
          if (pixels[pixel + 3] > 0 && (pixels[pixel] < 220 || pixels[pixel + 1] < 220 || pixels[pixel + 2] < 220)) painted += 1;
        }
        return painted;
      });
      expect(inkPixels, `${category} model ${index + 1} card should show visible PDF content`).toBeGreaterThan(100);
      renderedModels += 1;
    }
  }
  expect(renderedModels).toBe(44);
});
