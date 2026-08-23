import { describe, expect, it } from 'vitest';
import type { DbQueryClient, DbQueryResult } from '../database/db';
import { AccessLifecycleError } from '../access/MembershipContracts';
import {
  hashToken,
  MembershipLifecycleService,
  type TransactionRunner,
} from '../access/MembershipLifecycleService';

type QueryResolver = (sql: string, params: any[]) => DbQueryResult;

class RecordingDatabase implements TransactionRunner {
  public committedQueries: { sql: string; params: any[] }[] = [];

  public constructor(private readonly resolver: QueryResolver) {}

  public async transaction<T>(callback: (client: DbQueryClient) => Promise<T>): Promise<T> {
    const pending: { sql: string; params: any[] }[] = [];
    const client: DbQueryClient = {
      query: async <R>(sql: string, params: any[] = []) => {
        pending.push({ sql: compact(sql), params });
        return this.resolver(compact(sql), params) as DbQueryResult<R>;
      },
    };
    const result = await callback(client);
    this.committedQueries.push(...pending);
    return result;
  }
}

const ACTOR = { userId: 'usr-owner', organizationId: 'org-a', email: 'owner@example.test' };
const NOW = new Date('2026-08-23T10:00:00.000Z');

describe('Point-1 membership lifecycle service', () => {
  it('stores only a SHA-256 invitation hash and returns the raw token once', async () => {
    const rawBytes = Buffer.alloc(32, 7);
    const database = new RecordingDatabase((sql) => {
      if (sql.includes("status = 'Active'") && sql.includes('user_id = $2')) return rows([{ id: 'mem-owner' }]);
      return rows([]);
    });
    const service = new MembershipLifecycleService(database, () => NOW, () => rawBytes);

    const invitation = await service.issueInvitation({
      actor: ACTOR,
      email: '  Accountant@Example.Test ',
      role: 'Accountant',
      expiresInHours: 24,
    });

    const rawToken = rawBytes.toString('base64url');
    const insert = database.committedQueries.find((query) => query.sql.includes('INSERT INTO organization_invitations'));
    expect(invitation.token).toBe(rawToken);
    expect(invitation.email).toBe('accountant@example.test');
    expect(insert?.params[4]).toBe(hashToken(rawToken));
    expect(insert?.params).not.toContain(rawToken);
    expect(JSON.stringify(invitation)).not.toContain(hashToken(rawToken));
    expect(database.committedQueries.some((query) => query.sql.includes('INSERT INTO audit_logs'))).toBe(true);
  });

  it('never selects token_hash while listing invitations', async () => {
    const database = new RecordingDatabase((sql) => {
      if (sql.includes("status = 'Active'") && sql.includes('user_id = $2')) return rows([{ id: 'mem-owner' }]);
      if (sql.includes('FROM organization_invitations')) {
        return rows([{
          id: 'inv-1', organization_id: 'org-a', email: 'a@example.test', role: 'Accountant',
          expires_at: '2026-08-24T10:00:00.000Z', accepted_at: null, accepted_by_user_id: null,
          revoked_at: null, invited_by_user_id: 'usr-owner', created_at: NOW.toISOString(),
        }]);
      }
      return rows([]);
    });
    const service = new MembershipLifecycleService(database, () => NOW);

    const result = await service.listInvitations(ACTOR);

    const listQuery = database.committedQueries.find((query) => query.sql.includes('FROM organization_invitations'))!;
    expect(listQuery.sql).not.toContain('token_hash');
    expect(result).toEqual([expect.objectContaining({ id: 'inv-1', status: 'Pending' })]);
    expect(JSON.stringify(result)).not.toContain('token');
  });

  it('accepts an invitation only for the exact authenticated and persisted email', async () => {
    const token = 'a'.repeat(48);
    const database = new RecordingDatabase((sql) => {
      if (sql.includes('WHERE token_hash = $1')) return rows([invitationRow()]);
      if (sql.startsWith('SELECT id, email, status FROM users')) {
        return rows([{ id: 'usr-invitee', email: 'accountant@example.test', status: 'Active' }]);
      }
      if (sql.includes('SELECT id FROM organization_members')) return rows([]);
      if (sql.startsWith('UPDATE organization_invitations')) return affected(1);
      return affected(1);
    });
    const service = new MembershipLifecycleService(database, () => NOW);

    const membership = await service.acceptInvitation({
      token,
      userId: 'usr-invitee',
      authenticatedEmail: 'ACCOUNTANT@example.test',
    });

    expect(membership).toEqual(expect.objectContaining({
      organizationId: 'org-a', userId: 'usr-invitee', role: 'Accountant', status: 'Active', accessVersion: 1,
    }));
    expect(database.committedQueries.find((query) => query.sql.includes('WHERE token_hash = $1'))?.params).toEqual([hashToken(token)]);
    expect(database.committedQueries.some((query) => query.sql.includes('accepted_at IS NULL AND revoked_at IS NULL'))).toBe(true);
  });

  it('rejects email mismatch without committing a membership or audit row', async () => {
    const database = new RecordingDatabase((sql) => {
      if (sql.includes('WHERE token_hash = $1')) return rows([invitationRow()]);
      if (sql.startsWith('SELECT id, email, status FROM users')) {
        return rows([{ id: 'usr-invitee', email: 'different@example.test', status: 'Active' }]);
      }
      return affected(1);
    });
    const service = new MembershipLifecycleService(database, () => NOW);

    await expect(service.acceptInvitation({
      token: 'b'.repeat(48),
      userId: 'usr-invitee',
      authenticatedEmail: 'different@example.test',
    })).rejects.toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH', httpStatus: 403 });
    expect(database.committedQueries).toEqual([]);
  });

  it('protects the last active owner from role change', async () => {
    const database = new RecordingDatabase((sql) => {
      if (sql.includes("status = 'Active'") && sql.includes('user_id = $2')) return rows([{ id: 'mem-owner' }]);
      if (sql.includes('WHERE id = $1 AND organization_id = $2')) return rows([membershipRow('Owner', 2)]);
      if (sql.startsWith('SELECT COUNT(*) AS count')) return rows([{ count: '0' }]);
      return affected(1);
    });
    const service = new MembershipLifecycleService(database, () => NOW);

    await expect(service.changeMembershipRole(ACTOR, 'mem-target', 'Admin')).rejects.toMatchObject({
      code: 'LAST_OWNER_PROTECTED',
      httpStatus: 409,
    });
    expect(database.committedQueries).toEqual([]);
  });

  it('increments access version, revokes current tokens, and audits a role change atomically', async () => {
    const database = new RecordingDatabase((sql) => {
      if (sql.includes("status = 'Active'") && sql.includes('user_id = $2')) return rows([{ id: 'mem-owner' }]);
      if (sql.startsWith('SELECT id, organization_id, user_id, role')) return rows([membershipRow('Accountant', 3)]);
      if (sql.startsWith('UPDATE organization_members')) return rows([membershipRow('Viewer', 4, NOW.toISOString())]);
      return affected(1);
    });
    const service = new MembershipLifecycleService(database, () => NOW);

    const result = await service.changeMembershipRole(ACTOR, 'mem-target', 'Viewer');

    expect(result.accessVersion).toBe(4);
    expect(result.sessionInvalidation).toEqual(expect.objectContaining({
      reason: 'ROLE_CHANGED', compatibilityMode: 'GLOBAL_TOKEN_REVOCATION', invalidatedAt: NOW.toISOString(),
    }));
    expect(database.committedQueries.some((query) => query.sql.includes('INSERT INTO revoked_tokens'))).toBe(true);
    expect(database.committedQueries.some((query) => query.sql.includes('ORGANIZATION_MEMBER_ROLE_CHANGED'))).toBe(false);
    const audit = database.committedQueries.find((query) => query.sql.includes('INSERT INTO audit_logs'));
    expect(audit?.params).toContain('ORGANIZATION_MEMBER_ROLE_CHANGED');
  });

  it('rolls back the mutation and invalidation when the audit insert fails', async () => {
    const database = new RecordingDatabase((sql) => {
      if (sql.includes("status = 'Active'") && sql.includes('user_id = $2')) return rows([{ id: 'mem-owner' }]);
      if (sql.startsWith('SELECT id, organization_id, user_id, role')) return rows([membershipRow('Viewer', 1)]);
      if (sql.startsWith('UPDATE organization_members')) return rows([membershipRow('Viewer', 2, NOW.toISOString(), 'Revoked')]);
      if (sql.includes('INSERT INTO audit_logs')) throw new Error('audit unavailable');
      return affected(1);
    });
    const service = new MembershipLifecycleService(database, () => NOW);

    await expect(service.revokeMembership(ACTOR, 'mem-target')).rejects.toThrow('audit unavailable');
    expect(database.committedQueries).toEqual([]);
  });
});

function invitationRow() {
  return {
    id: 'inv-1', organization_id: 'org-a', email: 'accountant@example.test', role: 'Accountant',
    expires_at: '2026-08-24T10:00:00.000Z', accepted_at: null, accepted_by_user_id: null,
    revoked_at: null, invited_by_user_id: 'usr-owner', created_at: NOW.toISOString(),
  };
}

function membershipRow(
  role: 'Owner' | 'Admin' | 'Accountant' | 'Sales' | 'Purchase' | 'Viewer',
  version: number,
  invalidatedAt: string | null = null,
  status: 'Active' | 'Revoked' = 'Active',
) {
  return {
    id: 'mem-target', organization_id: 'org-a', user_id: 'usr-target', role, status,
    access_version: version, access_invalidated_at: invalidatedAt,
  };
}

function rows<T>(values: T[]): DbQueryResult<T> {
  return { rows: values, rowCount: values.length };
}

function affected(rowCount: number): DbQueryResult {
  return { rows: [], rowCount };
}

function compact(sql: string): string {
  return sql.trim().replace(/\s+/g, ' ');
}
