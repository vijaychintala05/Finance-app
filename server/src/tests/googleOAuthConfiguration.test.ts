import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleOAuthService, GoogleOAuthConfigurationError } from '../auth/GoogleOAuthService';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Google OAuth configuration', () => {
  it.each(['development', 'test', 'production'])('fails closed without credentials in %s', async mode => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    await expect(GoogleOAuthService.getOAuthUrl('http://localhost:3000/api/v1/identity/google/callback')).rejects.toBeInstanceOf(GoogleOAuthConfigurationError);
    await expect(GoogleOAuthService.exchangeCodeForProfile('mock-email:owner@example.com', 'http://localhost:3000')).rejects.toBeInstanceOf(GoogleOAuthConfigurationError);
  });

  it('rejects the old placeholder client ID even with a secret', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', 'mock-google-client-id.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    await expect(GoogleOAuthService.getOAuthUrl('http://localhost:3000')).rejects.toBeInstanceOf(GoogleOAuthConfigurationError);
  });

  it.each(['development', 'test', 'production'])('requires Google verification for mock-looking codes in %s', async mode => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('invalid_grant', { status: 400 }));
    await expect(GoogleOAuthService.exchangeCodeForProfile('mock-email:owner@example.com', 'http://localhost:3000')).rejects.toThrow('GOOGLE_TOKEN_EXCHANGE_FAILED');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
