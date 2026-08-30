const DEVELOPMENT_JWT_SECRET = 'development-only-secret-never-use-in-production-2026';
const DEVELOPMENT_AUTH_ENCRYPTION_KEY = 'development-only-auth-key-never-use-in-production-32!';

export function isProduction(): boolean {
  // Production safety must depend on deployment mode alone. Test-runner flags
  // are ordinary environment variables and cannot weaken runtime controls.
  return process.env.NODE_ENV === 'production';
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    if (isProduction()) {
      throw new Error('JWT_SECRET is required in production');
    }
    return DEVELOPMENT_JWT_SECRET;
  }

  if (isProduction() && secret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in production');
  }

  return secret;
}

export function getAuthEncryptionKey(): string {
  const key = process.env.AUTH_ENCRYPTION_KEY?.trim();

  if (!key) {
    if (isProduction()) {
      throw new Error('AUTH_ENCRYPTION_KEY is required in production');
    }
    return DEVELOPMENT_AUTH_ENCRYPTION_KEY;
  }

  if (isProduction() && key.length < 32) {
    throw new Error('AUTH_ENCRYPTION_KEY must contain at least 32 characters in production');
  }

  return key;
}

export function assertProductionConfiguration(): void {
  if (!isProduction()) return;

  getJwtSecret();
  getAuthEncryptionKey();
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required in production');
  }
}
