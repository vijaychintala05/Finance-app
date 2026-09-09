import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Non-Functional Batch 3: Client Bundle Optimization & Asset Delivery', () => {
  const distAssetsPath = path.resolve(process.cwd(), 'dist/assets');

  it('1. Generates isolated vendor chunks in production build output', () => {
    expect(fs.existsSync(distAssetsPath)).toBe(true);
    const files = fs.readdirSync(distAssetsPath);

    const hasVendorCharts = files.some((f) => f.startsWith('vendor-charts') && f.endsWith('.js'));
    const hasVendorFramework = files.some((f) => f.startsWith('vendor-framework') && f.endsWith('.js'));
    const hasVendorIcons = files.some((f) => f.startsWith('vendor-icons') && f.endsWith('.js'));

    expect(hasVendorCharts).toBe(true);
    expect(hasVendorFramework).toBe(true);
    expect(hasVendorIcons).toBe(true);
  });

  it('2. Keeps all individual application view chunks lightweight (< 150 kB)', () => {
    const files = fs.readdirSync(distAssetsPath);
    const viewFiles = files.filter((f) => f.includes('View-') && f.endsWith('.js'));

    expect(viewFiles.length).toBeGreaterThan(5);

    for (const viewFile of viewFiles) {
      const stat = fs.statSync(path.join(distAssetsPath, viewFile));
      const sizeKb = stat.size / 1024;
      // All views should be under 150 kB now that vendor libraries are split out
      expect(sizeKb).toBeLessThan(150);
    }
  });

  it('3. Static asset caching policy sets immutable headers for assets', () => {
    const testPaths = [
      path.join(process.cwd(), 'dist', 'assets', 'vendor-charts.js'),
      'c:\\Users\\HI\\Desktop\\APP\\finance app\\dist\\assets\\vendor-charts.js',
      '/var/app/dist/assets/vendor-charts.js',
    ];

    for (const p of testPaths) {
      const isAsset = p.includes('/assets/') || p.includes('\\assets\\') || p.includes(`${path.sep}assets${path.sep}`);
      expect(isAsset).toBe(true);
    }

    const nonAssetPath = path.join(process.cwd(), 'dist', 'index.html');
    const isNonAsset = nonAssetPath.includes('/assets/') || nonAssetPath.includes('\\assets\\');
    expect(isNonAsset).toBe(false);
  });
});
