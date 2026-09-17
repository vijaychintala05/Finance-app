// Run against an isolated local development server: node scripts/audit-mobile-ui.mjs
// This is a read-only visual-layout audit; it does not create financial records.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const routes = [...new Set([...source.matchAll(/case '([^']+)':/g)].map((match) => match[1]))];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const baseUrl = process.env.MOBILE_AUDIT_URL || 'http://localhost:3000';
const screenshotDir = process.env.MOBILE_AUDIT_SCREENSHOTS;
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });

try {
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /Enter as Developer Admin/ }).click();
  await page.getByRole('heading', { name: 'Financial Command Center' }).waitFor({ state: 'visible', timeout: 15000 });
  const results = [];
  for (const [index, route] of routes.entries()) {
    // The query makes each navigation a fresh document, so lazy views cannot
    // be mistaken for the preceding page while the next module loads.
    await page.goto(`${baseUrl}/?mobile_audit=${index}#/${route}`);
    await page.locator('main').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => {
      const text = document.querySelector('main')?.textContent?.trim() || '';
      return text.length > 20 && !text.includes('Loading workspace…') && !text.includes('Checking availability');
    }, undefined, { timeout: 15000 });
    if (route === 'dashboard') {
      await page.waitForFunction(() => {
        const text = document.querySelector('main')?.textContent || '';
        return text.includes('Cash Flow') || text.includes('Needs your attention') || text.includes('Live Financial Totals Unavailable');
      }, undefined, { timeout: 15000 });
    }
    const result = await page.evaluate(() => {
      const main = document.querySelector('main');
      const heading = main?.querySelector('h1,h2,h3')?.textContent?.trim() || '';
      const viewport = document.documentElement.clientWidth;
      const overflowing = [...document.querySelectorAll('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.position === 'fixed' || rect.right <= viewport + 2 || rect.width >= 2000) return false;
          if (element.closest('table.mobile-record-table thead')) return false;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(parent).overflowX)) return false;
          }
          return true;
        })
        .slice(0, 4)
        .map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 45)}`);
      return {
        heading,
        textLength: main?.textContent?.trim().length || 0,
        viewport,
        documentWidth: document.documentElement.scrollWidth,
        tables: main?.querySelectorAll('table').length || 0,
        mobileCardTables: main?.querySelectorAll('table.mobile-record-table').length || 0,
        recordRows: main?.querySelectorAll('table.mobile-record-table tbody tr:not(:has(td[colspan]))').length || 0,
        unlabeledCells: main?.querySelectorAll('table.mobile-record-table tbody td:not([colspan]):not([data-mobile-label])').length || 0,
        overflowing,
      };
    });
    results.push({ route, ...result });
    if (screenshotDir && ['dashboard', 'invoices', 'bills', 'banking', 'vendors', 'reports', 'settings'].includes(route)) {
      await page.screenshot({ path: `${screenshotDir}/${route}.png` });
      if (result.recordRows > 0) {
        await page.locator('table.mobile-record-table tbody tr').first().scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${screenshotDir}/${route}-record.png` });
      }
    }
  }

  await page.goto(`${baseUrl}/?mobile_audit=menu#/dashboard`);
  await page.getByRole('button', { name: 'Open more menu' }).click();
  await page.getByRole('dialog', { name: 'All modules' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Banking & Cash' }).click();
  const reconciliationReachable = await page.getByRole('button', { name: 'Bank Reconciliation' }).isVisible();
  results.push({ route: 'mobile-more-menu', heading: 'All modules', reconciliationReachable });
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/more-menu.png` });
  await page.getByRole('button', { name: 'Close mobile navigation' }).click();

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${baseUrl}/?mobile_audit=desktop#/bills`);
  await page.locator('table.mobile-record-table').waitFor({ state: 'visible' });
  const desktop = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    tableDisplay: getComputedStyle(document.querySelector('table.mobile-record-table')).display,
    headerDisplay: getComputedStyle(document.querySelector('table.mobile-record-table thead')).display,
  }));
  results.push({ route: 'desktop-bills', heading: 'Desktop table preserved', ...desktop });
  if (screenshotDir) await page.screenshot({ path: `${screenshotDir}/desktop-bills.png` });
  console.log(JSON.stringify(results, null, 2));
  const failures = results.filter((result) =>
    (result.route === 'mobile-more-menu' && !result.reconciliationReachable) ||
    (result.route === 'desktop-bills' && (result.tableDisplay !== 'table' || result.headerDisplay !== 'table-header-group')) ||
    (result.viewport === 390 && (result.documentWidth > result.viewport + 2 || result.unlabeledCells > 0 || result.overflowing?.length > 0))
  );
  if (failures.length > 0) throw new Error(`Mobile UI audit failed: ${failures.map((item) => item.route).join(', ')}`);
} finally {
  await browser.close();
}
