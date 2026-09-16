// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('mobile viewport stability', () => {
  it('keeps editable controls at the mobile no-auto-zoom threshold', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

    expect(css).toMatch(/@media\s*\(max-width:\s*767px\)/);
    expect(css).toMatch(/input:not\(\[type="checkbox"\]\).*select,\s*textarea\s*\{[^}]*font-size:\s*16px\s*!important/s);
    expect(css).toContain('-webkit-text-size-adjust: 100%');
    expect(css).not.toMatch(/user-scalable\s*=\s*["']?no/i);
  });
});
