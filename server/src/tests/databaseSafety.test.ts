import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../database/db';

describe('Database Safety & Environment Hardening Regression Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    db.resetPool();
  });

  it('1. Prohibits automatic pg-mem activation in production when DATABASE_URL is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.USE_PG_MEM;
    delete process.env.DATABASE_MODE;
    delete process.env.ALLOW_PROD_MEMORY;

    expect(db.isMemoryAllowed()).toBe(false);
  });

  it('2. Permits pg-mem in development/test or when explicitly enabled', () => {
    process.env.NODE_ENV = 'test';
    expect(db.isMemoryAllowed()).toBe(true);

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_MODE = 'memory';
    expect(db.isMemoryAllowed()).toBe(true);
  });

  it('3. Fails safely on query in production when database connection is not available and memory mode is disabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.USE_PG_MEM;
    delete process.env.DATABASE_MODE;
    delete process.env.ALLOW_PROD_MEMORY;
    delete process.env.VITEST;

    db.resetPool();

    await expect(db.query('SELECT 1')).rejects.toThrow(/Database connection unavailable/);
  });
});
