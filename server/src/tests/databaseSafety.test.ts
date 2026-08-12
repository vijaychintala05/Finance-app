import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../database/db';
import { MigrationRunner } from '../database/migrationRunner';
import { initDatabase } from '../index';

describe('Phase 8.1 — Production Database Safety Audit & Hardening Regression Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    db.resetPool();
  });

  it('1. NODE_ENV=test permits pg-mem', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.DATABASE_URL;

    expect(db.isMemoryAllowed()).toBe(true);

    db.resetPool();
    const result = await db.query('SELECT 1 as val');
    expect(result).toBeDefined();
    expect(result.rows).toBeDefined();
  });

  it('2. Explicit non-production memory mode permits pg-mem', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_MODE = 'memory';
    delete process.env.DATABASE_URL;

    expect(db.isMemoryAllowed()).toBe(true);

    process.env.DATABASE_MODE = undefined;
    process.env.USE_PG_MEM = 'true';
    expect(db.isMemoryAllowed()).toBe(true);

    db.resetPool();
    const result = await db.query('SELECT 1 as val');
    expect(result).toBeDefined();
  });

  it('3. Production missing DATABASE_URL rejects initialization and queries', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.USE_PG_MEM;
    delete process.env.DATABASE_MODE;
    delete process.env.ALLOW_PROD_MEMORY;
    delete process.env.VITEST;

    expect(db.isMemoryAllowed()).toBe(false);

    db.resetPool();
    await expect(db.query('SELECT 1')).rejects.toThrow(/Database connection unavailable/);
  });

  it('4. Production cannot use pg-mem even if USE_PG_MEM=true accidentally exists', async () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_PG_MEM = 'true';
    process.env.DATABASE_MODE = 'memory';
    process.env.ALLOW_PROD_MEMORY = 'true';
    delete process.env.DATABASE_URL;
    delete process.env.VITEST;

    // Must strictly be false in production regardless of flags
    expect(db.isMemoryAllowed()).toBe(false);

    db.resetPool();
    await expect(db.query('SELECT 1')).rejects.toThrow(/Database connection unavailable/);
  });

  it('5. Production PostgreSQL connection failure propagates as an error without fallback', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://invalid_user:invalid_pass@127.0.0.1:54329/nonexistent_db';
    delete process.env.USE_PG_MEM;
    delete process.env.DATABASE_MODE;
    delete process.env.VITEST;

    db.resetPool();

    await expect(db.query('SELECT 1')).rejects.toThrow();
    // Verify health check also reports disconnected
    const health = await db.checkHealth();
    expect(health.isConnected).toBe(false);
    expect(health.isMemoryMode).toBe(false);
  });

  it('6. Migration initialization failure propagates and prevents successful startup', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.USE_PG_MEM;
    delete process.env.DATABASE_MODE;
    delete process.env.VITEST;

    db.resetPool();

    // MigrationRunner must throw in production if database is unavailable
    await expect(MigrationRunner.runMigrations()).rejects.toThrow();

    // initDatabase must re-throw in production to prevent startup
    await expect(initDatabase()).rejects.toThrow();
  });

  it('7. Database operation errors are not silently swallowed', async () => {
    process.env.NODE_ENV = 'test';
    db.resetPool();

    // Syntax or unhandled query error in memory pool should throw properly
    await expect(
      db.query('SELECT * FROM non_existent_table_xyz_123 WHERE id = $1', ['abc'])
    ).rejects.toThrow();
  });
});
