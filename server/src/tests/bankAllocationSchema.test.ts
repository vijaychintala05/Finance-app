import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, type DbQueryClient } from '../database/db';
import { applyBankAllocationSchema } from '../database/bankAllocationSchema';

describe('bank allocation additive schema migration', () => {
  afterEach(() => vi.restoreAllMocks());

  it('backfills journal-line tenancy only from the owning journal before building tenant references', async () => {
    vi.spyOn(db, 'isMemoryMode').mockReturnValue(false);
    const statements: string[] = [];
    const client: DbQueryClient = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM pg_indexes')) {
          return { rows: [{ indexdef: "CREATE UNIQUE INDEX ... WHERE COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await applyBankAllocationSchema(client);

    const crossTenantGuard = statements.findIndex((sql) => sql.includes('BANK_ALLOCATION_CROSS_TENANT_JOURNAL_LINE'));
    const backfill = statements.findIndex((sql) => sql.includes('UPDATE journal_lines jl SET organization_id = je.organization_id'));
    const lineKeyIndex = statements.findIndex((sql) => sql.includes('uk_bank_alloc_journal_line_org_id'));
    expect(crossTenantGuard).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(crossTenantGuard);
    expect(lineKeyIndex).toBeGreaterThan(backfill);
    expect(statements[backfill]).toContain('je.id = jl.journal_entry_id');
    expect(statements[backfill]).toContain('jl.organization_id IS NULL');
  });

  it('adds tenant-composite references and warns on duplicate bank profiles without remapping them', async () => {
    vi.spyOn(db, 'isMemoryMode').mockReturnValue(false);
    const statements: string[] = [];
    const client: DbQueryClient = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM pg_indexes')) {
          return { rows: [{ indexdef: "CREATE UNIQUE INDEX ... WHERE COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await applyBankAllocationSchema(client);
    const pgMigration = statements.find((sql) => sql.includes('fk_bank_alloc_statement_org')) || '';
    for (const name of [
      'fk_bank_alloc_statement_org',
      'fk_bank_alloc_statement_profile',
      'fk_bank_alloc_bank_account_org',
      'fk_bank_alloc_bank_account_ledger',
      'fk_bank_alloc_ledger_account_org',
      'fk_bank_alloc_journal_entry_org',
      'fk_bank_alloc_journal_line_org',
      'fk_bank_alloc_journal_entry_line',
    ]) expect(pgMigration).toContain(name);
    expect(pgMigration.match(/NOT VALID/g)).toHaveLength(8);

    const duplicateDetector = statements.find((sql) => sql.includes('BANK_ALLOCATION_DUPLICATE_BANK_PROFILE')) || '';
    expect(duplicateDetector).toContain('GROUP BY organization_id, ledger_account_id');
    expect(duplicateDetector).toContain('RAISE WARNING');
    expect(duplicateDetector).not.toMatch(/UPDATE\s+bank_accounts|DELETE\s+FROM\s+bank_accounts/i);
  });

  it('requires canonical allocations to reference a tenant-owned journal line', async () => {
    vi.spyOn(db, 'isMemoryMode').mockReturnValue(false);
    const statements: string[] = [];
    const client: DbQueryClient = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM pg_indexes')) {
          return { rows: [{ indexdef: "CREATE UNIQUE INDEX ... WHERE COALESCE(status, '') NOT IN ('REJECTED', 'REVERSED', 'UNMATCHED')" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
    };

    await applyBankAllocationSchema(client);
    const pgMigration = statements.find((sql) => sql.includes('BANK_ALLOCATION_CANONICAL_TENANT_REFERENCE_PREFLIGHT_FAILED')) || '';
    expect(pgMigration).toContain('jl.organization_id IS NULL');
    expect(pgMigration).toContain('st.id IS NULL OR ba.id IS NULL OR a.id IS NULL OR je.id IS NULL');
    expect(pgMigration).toContain('jl.organization_id = m.organization_id');
    expect(pgMigration).toContain("m.allocation_state = 'ACTIVE' AND m.identity_state = 'VERIFIED'");
    for (const name of [
      'uk_bank_alloc_statement_org_id',
      'uk_bank_alloc_statement_profile',
      'uk_bank_alloc_bank_account_org_id',
      'uk_bank_alloc_bank_account_ledger',
      'uk_bank_alloc_ledger_account_org_id',
      'uk_bank_alloc_journal_entry_org_id',
      'uk_bank_alloc_journal_line_org_id',
      'uk_bank_alloc_journal_line_entry',
    ]) expect(statements.some((sql) => sql.includes(name))).toBe(true);
  });
});
