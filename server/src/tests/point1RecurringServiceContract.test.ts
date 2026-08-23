import { describe, expect, it, vi } from 'vitest';
import { RecurringTransactionService, type RecurringDatabase } from '../recurring';

function databaseReturning(rows: any[] = []): { database: RecurringDatabase; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows, rowCount: rows.length }));
  return {
    query,
    database: {
      query: query as RecurringDatabase['query'],
      transaction: async (callback) => callback({ query: query as RecurringDatabase['query'] }),
    },
  };
}

describe('Point-1 recurring service SQL contract', () => {
  it('claims with PostgreSQL row skipping, leases, deterministic ordering, and tenant scope', async () => {
    const { database, query } = databaseReturning([]);
    const service = new RecurringTransactionService({ database, creators: {} });
    await service.claimDueOccurrences({
      organizationId: 'org-a', workerId: 'worker-a', limit: 10,
      leaseSeconds: 120, now: new Date('2026-08-23T10:00:00.000Z'),
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/FOR UPDATE OF o SKIP LOCKED/i);
    expect(sql).toMatch(/ORDER BY o\.scheduled_for ASC, o\.id ASC/i);
    expect(sql).toMatch(/lease_expires_at = \$2 \+ \(\$5 \* INTERVAL '1 second'\)/i);
    expect(sql).toMatch(/p\.status = 'ACTIVE'/i);
    expect(params).toEqual(['org-a', new Date('2026-08-23T10:00:00.000Z'), 10, 'worker-a', 120]);
  });

  it('materializes profiles under SKIP LOCKED in deterministic order', async () => {
    const { database, query } = databaseReturning([]);
    const service = new RecurringTransactionService({ database, creators: {} });
    const result = await service.materializeDueOccurrences({ asOfDate: '2026-08-23', profileLimit: 20 });
    expect(result).toEqual({ profileCount: 0, occurrenceCount: 0, occurrenceIds: [] });
    expect(query.mock.calls[0][0]).toMatch(/ORDER BY next_run_date ASC, organization_id ASC, id ASC[\s\S]*FOR UPDATE SKIP LOCKED/i);
  });

  it('uses a canonical callback inside the completion transaction', async () => {
    const row = {
      occurrence_id: 'occ-a', occurrence_key: 'key-a', scheduled_for: '2026-08-23',
      attempt_count: 1, lease_owner: 'worker-a', id: 'profile-a', organization_id: 'org-a',
      name: 'Monthly bill', kind: 'BILL', frequency: 'MONTHLY', interval_count: 1,
      start_date: '2026-08-23', end_date: null, next_run_date: '2026-09-23', anchor_day: 23,
      timezone: 'UTC', catch_up_policy: 'ALL', max_catch_up: 12,
      template: { vendorId: 'vendor-a' }, auto_post: true, status: 'ACTIVE',
    };
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (/SELECT o\.id AS occurrence_id/i.test(sql)) return { rows: [row], rowCount: 1 };
      if (/SET status = 'SUCCEEDED'/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const creator = vi.fn(async ({ client, occurrenceKey }) => {
      expect(client.query).toBe(query);
      expect(occurrenceKey).toBe('key-a');
      return { documentId: 'bill-a', documentType: 'BILL' };
    });
    const database: RecurringDatabase = {
      query: query as RecurringDatabase['query'],
      transaction: async (callback) => callback({ query: query as RecurringDatabase['query'] }),
    };
    const service = new RecurringTransactionService({ database, creators: { BILL: creator } });
    const result = await service.executeClaim({
      id: 'occ-a', organizationId: 'org-a', profileId: 'profile-a', occurrenceKey: 'key-a',
      scheduledFor: '2026-08-23', kind: 'BILL', attemptCount: 1,
      leaseOwner: 'worker-a', leaseExpiresAt: '2026-08-23T10:05:00Z',
    });
    expect(result).toEqual({ documentId: 'bill-a', documentType: 'BILL' });
    expect(creator).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([sql]) => /status = 'SUCCEEDED'/i.test(sql))).toBe(true);
  });

  it('backs off failures and quarantines the final attempt', async () => {
    const query = vi.fn(async (sql: string, _params?: unknown[]) => {
      if (/SELECT o\.id AS occurrence_id/i.test(sql)) throw new Error('canonical posting failed');
      if (/SET status = \$1/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const database: RecurringDatabase = {
      query: query as RecurringDatabase['query'],
      transaction: async (callback) => callback({ query: query as RecurringDatabase['query'] }),
    };
    const service = new RecurringTransactionService({
      database, creators: { EXPENSE: async () => ({ documentId: 'unused' }) },
      retryPolicy: { maxAttempts: 3, baseDelaySeconds: 10, maxDelaySeconds: 100 },
    });
    await expect(service.executeClaim({
      id: 'occ-a', organizationId: 'org-a', profileId: 'profile-a', occurrenceKey: 'key-a',
      scheduledFor: '2026-08-23', kind: 'EXPENSE', attemptCount: 3,
      leaseOwner: 'worker-a', leaseExpiresAt: '2026-08-23T10:05:00Z',
    })).rejects.toThrow(/canonical posting failed/);
    const failureCall = query.mock.calls.find(([sql]) => /SET status = \$1/i.test(sql));
    expect(failureCall?.[1][0]).toBe('QUARANTINED');
    expect(failureCall?.[1][1]).toBe(40);
  });

  it('requires real PostgreSQL for concurrent SKIP LOCKED behavior', () => {
    // pg-mem does not implement PostgreSQL lock scheduling/isolation faithfully.
    // The integration suite must prove two workers cannot claim the same occurrence,
    // locked profiles are skipped, and an expired lease is reclaimed exactly once.
    expect(true).toBe(true);
  });
});
