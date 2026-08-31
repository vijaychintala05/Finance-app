import crypto from 'node:crypto';
import { db } from '../database/db';
import { newId } from '../utils/ids';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function normalizeJson(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'string') {
    try {
      return JSON.stringify(JSON.parse(val));
    } catch {
      return val.trim();
    }
  }
  return JSON.stringify(val);
}

function normalizeTimestamp(ts: any): string {
  if (!ts) return new Date(0).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  try {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  } catch {
    // Fall through
  }
  return String(ts);
}

export function calculateAuditEntryHash(
  previousHash: string,
  logId: string,
  organizationId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  timestamp: any,
  beforeState: any,
  afterState: any,
  metadata: any
): string {
  const normTs = normalizeTimestamp(timestamp);
  const normBefore = normalizeJson(beforeState);
  const normAfter = normalizeJson(afterState);
  const normMeta = normalizeJson(metadata);
  const payload = `${previousHash}|${logId}|${organizationId}|${userId}|${action}|${entityType}|${entityId}|${normTs}|${normBefore}|${normAfter}|${normMeta}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export interface AuditLogParams {
  organizationId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: any;
  afterState?: any;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  beforeState: any;
  afterState: any;
  metadata: any;
  previousHash?: string;
  currentHash?: string;
}

export class AuditTrailService {
  public static async logAction(params: AuditLogParams): Promise<AuditLogEntry> {
    const logId = newId('aud');
    const now = new Date().toISOString();

    const beforeStateJson = params.beforeState ? JSON.stringify(params.beforeState) : null;
    const afterStateJson = params.afterState ? JSON.stringify(params.afterState) : null;
    const metadataJson = JSON.stringify({
      ipAddress: params.ipAddress || '127.0.0.1',
      userAgent: params.userAgent || 'FirmBooks/1.0',
      ...(params.metadata || {}),
    });

    let previousHash = GENESIS_HASH;
    try {
      const latest = await db.query(
        `SELECT current_hash FROM audit_logs WHERE organization_id = $1 AND current_hash IS NOT NULL ORDER BY timestamp DESC, id DESC LIMIT 1`,
        [params.organizationId]
      );
      if (latest.rows.length > 0 && latest.rows[0].current_hash) {
        previousHash = latest.rows[0].current_hash;
      }
    } catch {
      // Fallback to genesis hash if query fails or table is fresh
    }

    const currentHash = calculateAuditEntryHash(
      previousHash,
      logId,
      params.organizationId,
      params.userId,
      params.action,
      params.entityType,
      params.entityId,
      now,
      beforeStateJson,
      afterStateJson,
      metadataJson
    );

    await db.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, timestamp, before_state, after_state, metadata, previous_hash, current_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        logId,
        params.organizationId,
        params.userId,
        params.action,
        params.entityType,
        params.entityId,
        now,
        beforeStateJson,
        afterStateJson,
        metadataJson,
        previousHash,
        currentHash,
      ]
    );

    return {
      id: logId,
      organizationId: params.organizationId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      timestamp: now,
      beforeState: params.beforeState || null,
      afterState: params.afterState || null,
      metadata: params.metadata || {},
      previousHash,
      currentHash,
    };
  }

  public static async getAuditLogs(
    organizationId: string,
    filters?: {
      entityType?: string;
      entityId?: string;
      userId?: string;
      action?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ): Promise<AuditLogEntry[]> {
    let sql = 'SELECT * FROM audit_logs WHERE organization_id = $1';
    const params: any[] = [organizationId];
    let pIdx = 2;

    if (filters?.entityType) {
      sql += ` AND entity_type = $${pIdx++}`;
      params.push(filters.entityType);
    }
    if (filters?.entityId) {
      sql += ` AND entity_id = $${pIdx++}`;
      params.push(filters.entityId);
    }
    if (filters?.userId) {
      sql += ` AND user_id = $${pIdx++}`;
      params.push(filters.userId);
    }
    if (filters?.action) {
      sql += ` AND action = $${pIdx++}`;
      params.push(filters.action);
    }
    if (filters?.startDate) {
      sql += ` AND timestamp >= $${pIdx++}`;
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      sql += ` AND timestamp <= $${pIdx++}`;
      params.push(filters.endDate);
    }

    sql += ' ORDER BY timestamp DESC, id DESC';
    const limit = filters?.limit || 100;
    sql += ` LIMIT $${pIdx++}`;
    params.push(limit);

    const res = await db.query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id || row.organizationId,
      userId: row.user_id || row.userId,
      action: row.action,
      entityType: row.entity_type || row.entityType,
      entityId: row.entity_id || row.entityId,
      timestamp: normalizeTimestamp(row.timestamp),
      beforeState: typeof row.before_state === 'string' ? JSON.parse(row.before_state) : row.before_state,
      afterState: typeof row.after_state === 'string' ? JSON.parse(row.after_state) : row.after_state,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      previousHash: row.previous_hash || row.previousHash,
      currentHash: row.current_hash || row.currentHash,
    }));
  }

  public static async verifyHashChain(organizationId: string): Promise<{ isValid: boolean; verifiedCount: number; brokenAtLogId?: string }> {
    const res = await db.query(
      `SELECT * FROM audit_logs WHERE organization_id = $1 ORDER BY timestamp ASC, id ASC`,
      [organizationId]
    );
    let expectedPrevHash = GENESIS_HASH;
    for (let i = 0; i < res.rows.length; i++) {
      const row = res.rows[i];
      const rowPrevHash = row.previous_hash || row.previousHash;
      const rowCurrHash = row.current_hash || row.currentHash;

      if (rowPrevHash && rowPrevHash !== expectedPrevHash) {
        return { isValid: false, verifiedCount: i, brokenAtLogId: row.id };
      }
      if (rowCurrHash) {
        const calculated = calculateAuditEntryHash(
          rowPrevHash || expectedPrevHash,
          row.id,
          row.organization_id || row.organizationId,
          row.user_id || row.userId,
          row.action,
          row.entity_type || row.entityType,
          row.entity_id || row.entityId,
          row.timestamp,
          row.before_state || row.beforeState,
          row.after_state || row.afterState,
          row.metadata
        );
        if (calculated !== rowCurrHash) {
          return { isValid: false, verifiedCount: i, brokenAtLogId: row.id };
        }
        expectedPrevHash = rowCurrHash;
      }
    }
    return { isValid: true, verifiedCount: res.rows.length };
  }

  public static async verifyImmutability(organizationId: string, logId: string): Promise<void> {
    // Audit logs are strictly immutable and cannot be deleted or mutated
    throw new Error('Audit log records are immutable and cannot be edited, updated or deleted.');
  }
}
