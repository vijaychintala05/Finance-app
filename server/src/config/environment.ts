const DEVELOPMENT_JWT_SECRET = 'development-only-secret-never-use-in-production-2026';

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

export function assertProductionConfiguration(): void {
  if (!isProduction()) return;

  getJwtSecret();
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required in production');
  }
}
