import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({ query: vi.fn() }));
const rbacMock = vi.hoisted(() => ({ hasPermissionAsync: vi.fn() }));
vi.mock('../database/db', () => ({ db: dbMock }));
vi.mock('../auth/RbacService', () => ({ RbacService: rbacMock }));

import { getTimeEntryCreateOperationStatus } from '../services/TimeEntryCreateOperationStatusService';

describe('time-entry create operation status', () => {
  const input = { organizationId: 'org-1', userId: 'user-1', role: 'Accountant', idempotencyKey: 'operation-key-123456789' };
  const record = (overrides: Record<string, unknown> = {}) => ({
    state: 'COMPLETED', response_status: 201, response_body: { id: 'time-1' }, user_id: 'user-1',
    required_permissions: ['projects.time_entries', 'invoices.create'], method: 'POST', path: '/time-entries', expires_at: new Date(Date.now() + 60_000).toISOString(), ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.query.mockResolvedValue({ rows: [record()] });
    rbacMock.hasPermissionAsync.mockResolvedValue(false).mockResolvedValueOnce(true);
  });

  it('returns only the committed entry ID for the same user, tenant, route, key, and current create permission', async () => {
    await expect(getTimeEntryCreateOperationStatus(input)).resolves.toEqual({ state: 'COMPLETED', responseStatus: 201, entryId: 'time-1' });
    expect(dbMock.query.mock.calls[0][1]).toEqual(['org-1', input.idempotencyKey]);
    expect(dbMock.query.mock.calls[0][0]).toContain('expires_at');
  });

  it.each([
    ['other user', { user_id: 'user-2' }],
    ['wrong route', { path: '/invoices' }],
    ['wrong method', { method: 'PUT' }],
    ['pending operation', { state: 'PROCESSING' }],
    ['malformed completed response', { response_body: { success: true } }],
    ['non-create response', { response_status: 422 }],
    ['legacy permissions', { required_permissions: null }],
    ['malformed permissions', { required_permissions: '{invalid' }],
    ['unrelated permissions', { required_permissions: ['projects.view'] }],
  ])('returns UNKNOWN for %s', async (_name, overrides) => {
    dbMock.query.mockResolvedValue({ rows: [record(overrides)] });
    await expect(getTimeEntryCreateOperationStatus(input)).resolves.toEqual({ state: 'UNKNOWN' });
  });

  it('returns UNKNOWN when the caller no longer has either create permission', async () => {
    rbacMock.hasPermissionAsync.mockReset().mockResolvedValue(false);
    await expect(getTimeEntryCreateOperationStatus(input)).resolves.toEqual({ state: 'UNKNOWN' });
  });

  it('returns UNKNOWN for expired or absent records without exposing whether the key existed', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [record({ expires_at: new Date(Date.now() - 60_000).toISOString() })] });
    await expect(getTimeEntryCreateOperationStatus(input)).resolves.toEqual({ state: 'UNKNOWN' });
    dbMock.query.mockResolvedValueOnce({ rows: [] });
    await expect(getTimeEntryCreateOperationStatus(input)).resolves.toEqual({ state: 'UNKNOWN' });
  });

  it('uses OR semantics for the original create permissions', async () => {
    rbacMock.hasPermissionAsync.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(getTimeEntryCreateOperationStatus(input)).resolves.toMatchObject({ state: 'COMPLETED', entryId: 'time-1' });
  });
});
