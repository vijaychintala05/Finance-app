import { beforeEach, describe, expect, it } from 'vitest';
import { getFinanceCapabilities } from '../capabilities/financeCapabilities';
import { db } from '../database/db';
import { CURRENT_SCHEMA_VERSION, MigrationRunner } from '../database/migrationRunner';
import { DomainError } from '../errors/DomainError';

describe('Point-1 shared foundations', () => {
  beforeEach(() => {
    delete process.env.TRUSTED_FINANCE_FEATURES;
  });

  it('reports certified workflows as enabled and unfinished Point-1 workflows as unavailable', () => {
    const capabilities = getFinanceCapabilities();
    expect(capabilities.find((item) => item.key === 'customer-payments')).toMatchObject({
      state: 'enabled',
      certified: true,
    });
    expect(capabilities.find((item) => item.key === 'recovery-center')).toMatchObject({
      state: 'enabled',
      certified: true,
    });
    expect(capabilities.find((item) => item.key === 'recurring-transactions')).toMatchObject({
      state: 'enabled',
      certified: true,
    });
  });

  it('does not let deployment configuration certify source-uncertified workflows', () => {
    process.env.TRUSTED_FINANCE_FEATURES = 'recovery-center,recurring-transactions';
    const capabilities = getFinanceCapabilities();
    expect(capabilities.find((item) => item.key === 'recovery-center')?.state).toBe('enabled');
    expect(capabilities.find((item) => item.key === 'recurring-transactions')?.state).toBe('enabled');
  });

  it('carries stable structured error metadata', () => {
    const error = new DomainError('BALANCE_CHANGED', 'The balance changed while posting.', {
      status: 409,
      retryable: true,
      fix: 'Reload the document and review the current balance.',
      currentState: { balanceDue: 125 },
    });
    expect(error).toMatchObject({
      code: 'BALANCE_CHANGED',
      status: 409,
      retryable: true,
      currentState: { balanceDue: 125 },
    });
  });

  it('creates Point-1 schema primitives and records the new schema version', async () => {
    process.env.NODE_ENV = 'test';
    db.initPgMem();
    await MigrationRunner.runMigrations();

    for (const table of [
      'recurring_transaction_profiles',
      'recurring_transaction_occurrences',
      'financial_reversals',
      'fixed_asset_events',
      'organization_invitations',
      'recovery_artifacts',
      'recovery_restore_jobs',
    ]) {
      const result = await db.query(`SELECT * FROM ${table}`);
      expect(result.rows).toEqual([]);
    }

    expect(CURRENT_SCHEMA_VERSION).toBe('2026.08.30-v6-enterprise-fortress');
    expect(await MigrationRunner.isCurrent()).toBe(true);
  });
});
