// Read-only form-opening audit for the local zero-auth demo server.
import { chromium } from '@playwright/test';

const baseUrl = process.env.MOBILE_AUDIT_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, serviceWorkers: 'block' });
const forms = [
  ['clients', 'Add Client'],
  ['vendors', 'Add Vendor'],
  ['invoices', 'New Invoice'],
  ['expenses', 'Record Expense'],
  ['bills', 'New Bill'],
  ['purchase_orders', 'New Purchase Order'],
  ['estimates', 'New Quote'],
  ['journals', 'New Journal Entry'],
  ['banking', 'Record Transaction'],
];

try {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /Enter as Developer Admin/ }).click();
  await page.getByRole('heading', { name: 'Financial Command Center' }).waitFor({ state: 'visible' });
  const results = [];
  for (const [index, [route, action]] of forms.entries()) {
    await page.goto(`${baseUrl}/?mobile_forms=${index}#/${route}`);
    const trigger = page.getByRole('button', { name: action, exact: true }).first();
    try {
      await trigger.waitFor({ state: 'visible', timeout: 12000 });
      if (!(await trigger.isEnabled())) {
        results.push({ route, action, status: 'disabled by prerequisite' });
        continue;
      }
      await trigger.click();
      await page.waitForTimeout(200);
      const result = await page.evaluate(() => {
        const viewport = document.documentElement.clientWidth;
        const overlays = [...document.querySelectorAll('.fixed.inset-0')]
          .filter((element) => getComputedStyle(element).display !== 'none');
        const overlay = overlays.at(-1);
        const controls = overlay ? [...overlay.querySelectorAll('input,select,textarea,button')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && (rect.left < 0 || rect.right > viewport + 2);
          }) : [];
        return {
          overlayVisible: !!overlay,
          documentWidth: document.documentElement.scrollWidth,
          viewport,
          controlCount: overlay?.querySelectorAll('input,select,textarea,button').length || 0,
          clippedControls: controls.length,
          formTitle: overlay?.querySelector('h1,h2,h3')?.textContent?.trim() || '',
        };
      });
      results.push({ route, action, ...result });
    } catch (error) {
      results.push({ route, action, status: 'could not open', error: String(error).slice(0, 180) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter((result) =>
    result.status === 'could not open' ||
    (result.status !== 'disabled by prerequisite' && (!result.overlayVisible || result.clippedControls > 0 || result.documentWidth > result.viewport + 2))
  );
  if (failures.length > 0) throw new Error(`Mobile form audit failed: ${failures.map((item) => item.route).join(', ')}`);
} finally {
  await browser.close();
}
