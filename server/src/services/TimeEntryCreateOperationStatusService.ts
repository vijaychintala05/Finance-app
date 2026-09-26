import { db } from '../database/db';
import { RbacService } from '../auth/RbacService';

const CREATE_PERMISSIONS = ['projects.time_entries', 'invoices.create'] as const;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export type TimeEntryCreateOperationStatus =
  | { state: 'UNKNOWN' | 'PROCESSING' }
  | { state: 'COMPLETED'; responseStatus: 201; entryId: string };

function parseRequiredPermissions(value: unknown): string[] | null {
  try {
    const permissions = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(permissions) || permissions.length === 0 || permissions.some((item) => typeof item !== 'string')) return null;
    const expected = [...CREATE_PERMISSIONS].sort();
    if (permissions.length !== expected.length || [...permissions].sort().some((permission, index) => permission !== expected[index])) return null;
    return permissions;
  } catch {
    return null;
  }
}

export async function getTimeEntryCreateOperationStatus(input: {
  organizationId: string;
  userId: string;
  role: string;
  idempotencyKey: string;
}): Promise<TimeEntryCreateOperationStatus> {
  const unknown: TimeEntryCreateOperationStatus = { state: 'UNKNOWN' };
  if (!KEY_PATTERN.test(input.idempotencyKey)) return unknown;
  const result = await db.query(
    `SELECT state, response_status, response_body, user_id, required_permissions, method, path, expires_at
       FROM api_idempotency_keys
      WHERE organization_id = $1 AND idempotency_key = $2
      LIMIT 1`,
    [input.organizationId, input.idempotencyKey]
  );
  const record = result.rows[0];
  if (!record || record.user_id !== input.userId || record.method !== 'POST' || record.path !== '/time-entries') return unknown;
  const expiresAt = new Date(record.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return unknown;
  const permissions = parseRequiredPermissions(record.required_permissions);
  if (!permissions) return unknown;
  const grants = await Promise.all(permissions.map((permission) =>
    RbacService.hasPermissionAsync(input.organizationId, input.role, permission, true)
  ));
  if (!grants.some(Boolean)) return unknown;
  if (record.state !== 'COMPLETED' || Number(record.response_status) !== 201) return unknown;
  let body = record.response_body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return unknown; }
  }
  const entryId = body && typeof body === 'object' ? (body as Record<string, unknown>).id : null;
  if (typeof entryId !== 'string' || !entryId.trim()) return unknown;
  return { state: 'COMPLETED', responseStatus: 201, entryId };
}
