import { describe, expect, it } from 'vitest';
import { PRODUCTION_CONTENT_SECURITY_POLICY } from '../config/contentSecurityPolicy';

describe('production content security policy', () => {
  it('allows browser-local image object URLs used by receipt previews', () => {
    expect(PRODUCTION_CONTENT_SECURITY_POLICY).toContain("img-src 'self' data: blob: https:");
  });

  it('does not allow blob URLs to execute scripts or open connections', () => {
    expect(PRODUCTION_CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(PRODUCTION_CONTENT_SECURITY_POLICY).toContain("connect-src 'self'");
    expect(PRODUCTION_CONTENT_SECURITY_POLICY).not.toContain("script-src 'self' blob:");
    expect(PRODUCTION_CONTENT_SECURITY_POLICY).not.toContain("connect-src 'self' blob:");
  });
});
