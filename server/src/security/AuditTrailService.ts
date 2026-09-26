import crypto from 'node:crypto';
import { db } from '../database/db';
import type { DbQueryClient } from '../database/db';
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

function canonicalJson(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '';
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function normalizeCanonicalJson(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') {
    try { return canonicalJson(JSON.parse(value)); } catch { return value.trim(); }
  }
  return canonicalJson(value);
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
  const parsedMetadata = typeof metadata === 'string' ? (() => { try { return JSON.parse(metadata); } catch { return null; } })() : metadata;
  const normalize = parsedMetadata?.__hashAlgorithm === 'canonical-json-v1' ? normalizeCanonicalJson : normalizeJson;
  const normBefore = normalize(beforeState);
  const normAfter = normalize(afterState);
  const normMeta = normalize(metadata);
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

export type AuditBatchEntry = Pick<AuditLogParams, 'userId' | 'action' | 'entityType' | 'entityId' | 'beforeState' | 'afterState' | 'metadata'>;

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
  private static orgMutexes: Map<string, Promise<void>> = new Map();

  private static async runWithOrgMutex<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    const prev = AuditTrailService.orgMutexes.get(orgId) || Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((res) => { release = res; });
    AuditTrailService.orgMutexes.set(orgId, prev.then(() => next));
    try {
      await prev;
      return await fn();
    } finally {
      release();
    }
  }

  public static async logAction(params: AuditLogParams, options?: { strict?: boolean }): Promise<AuditLogEntry> {
    return AuditTrailService.runWithOrgMutex(params.organizationId, async () => {
      return db.transaction(async (tx) => {
        if (!db.isMemoryMode()) {
          try {
            await tx.query(`SELECT pg_advisory_xact_lock(hashtext('audit_' || $1))`, [params.organizationId]);
          } catch (error) {
            if (options?.strict) throw error;
            // Ignore advisory lock errors in non-standard PG wrappers
          }
        }
        const logId = newId('aud');
        const timestampResult = await tx.query(`SELECT MAX(timestamp) AS latest_timestamp FROM audit_logs WHERE organization_id = $1`, [params.organizationId]);
        const latestTimestamp = timestampResult.rows[0]?.latest_timestamp ? new Date(timestampResult.rows[0].latest_timestamp).getTime() : 0;
        const now = new Date(Math.max(Date.now(), latestTimestamp + 1)).toISOString();

        const beforeStateJson = params.beforeState ? JSON.stringify(params.beforeState) : null;
        const afterStateJson = params.afterState ? JSON.stringify(params.afterState) : null;
        const metadataJson = JSON.stringify({
          ipAddress: params.ipAddress || '127.0.0.1',
          userAgent: params.userAgent || 'FirmBooks/1.0',
          ...(params.metadata || {}),
          __hashAlgorithm: 'canonical-json-v1',
        });

        let previousHash = GENESIS_HASH;
        try {
          const latest = await tx.query(
            `SELECT current_hash FROM audit_logs WHERE organization_id = $1 AND current_hash IS NOT NULL ORDER BY timestamp DESC, id DESC LIMIT 1`,
            [params.organizationId]
          );
          if (latest.rows.length > 0 && latest.rows[0].current_hash) {
            previousHash = latest.rows[0].current_hash;
          }
        } catch (error) {
          if (options?.strict) throw error;
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

        await tx.query(
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
      });
    });
  }


  /** Append a group of audit events to an existing transaction with one mutex and advisory lock. */
  public static async appendBatchInTransaction(
    client: DbQueryClient,
    organizationId: string,
    entries: AuditBatchEntry[],
    options?: { strict?: boolean }
  ): Promise<AuditLogEntry[]> {
    if (entries.length === 0) return [];
    return AuditTrailService.runWithOrgMutex(organizationId, async () => {
      if (!db.isMemoryMode()) {
        try {
          await client.query(`SELECT pg_advisory_xact_lock(hashtext('audit_' || $1))`, [organizationId]);
        } catch (error) {
          if (options?.strict) throw error;
        }
      }
      const headResult = await client.query(
        `SELECT * FROM audit_logs WHERE organization_id = $1 AND current_hash IS NOT NULL ORDER BY timestamp DESC, id DESC LIMIT 1`,
        [organizationId]
      );
      let previousHash = GENESIS_HASH;
      const head = headResult.rows[0];
      if (head) {
        const storedPreviousHash = head.previous_hash || head.previousHash;
        const storedCurrentHash = head.current_hash || head.currentHash;
        const recomputed = calculateAuditEntryHash(
          storedPreviousHash, head.id, head.organization_id || head.organizationId, head.user_id || head.userId,
          head.action, head.entity_type || head.entityType, head.entity_id || head.entityId, head.timestamp,
          head.before_state ?? head.beforeState, head.after_state ?? head.afterState, head.metadata
        );
        if (!storedPreviousHash || !storedCurrentHash || recomputed !== storedCurrentHash) {
          throw new Error('Cannot append audit evidence because the latest hashed audit entry is invalid');
        }
        previousHash = storedCurrentHash;
      }
      const timestampResult = await client.query(
        `SELECT MAX(timestamp) AS latest_timestamp FROM audit_logs WHERE organization_id = $1`,
        [organizationId]
      );
      const latestValue = timestampResult.rows[0]?.latest_timestamp;
      let nextTimestamp = latestValue ? new Date(latestValue).getTime() : 0;
      nextTimestamp = Math.max(Date.now(), nextTimestamp + 1);
      const appended: AuditLogEntry[] = [];
      for (const entry of entries) {
        const id = newId('aud');
        const timestamp = new Date(nextTimestamp).toISOString();
        nextTimestamp += 1;
        const beforeStateJson = entry.beforeState === undefined ? null : JSON.stringify(entry.beforeState);
        const afterStateJson = entry.afterState === undefined ? null : JSON.stringify(entry.afterState);
        const metadata = { ...(entry.metadata || {}), __hashAlgorithm: 'canonical-json-v1' };
        const metadataJson = JSON.stringify(metadata);
        const currentHash = calculateAuditEntryHash(
          previousHash, id, organizationId, entry.userId, entry.action, entry.entityType, entry.entityId,
          timestamp, beforeStateJson, afterStateJson, metadataJson
        );
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, timestamp, before_state, after_state, metadata, previous_hash, current_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [id, organizationId, entry.userId, entry.action, entry.entityType, entry.entityId, timestamp, beforeStateJson, afterStateJson, metadataJson, previousHash, currentHash]
        );
        appended.push({
          id, organizationId, userId: entry.userId, action: entry.action, entityType: entry.entityType,
          entityId: entry.entityId, timestamp,
          beforeState: entry.beforeState ?? null, afterState: entry.afterState ?? null, metadata, previousHash, currentHash,
        });
        previousHash = currentHash;
      }
      return appended;
    });
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

      if (!rowPrevHash || rowPrevHash !== expectedPrevHash) {
        return { isValid: false, verifiedCount: i, brokenAtLogId: row.id };
      }
      if (!rowCurrHash) {
        return { isValid: false, verifiedCount: i, brokenAtLogId: row.id };
      }
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
    return { isValid: true, verifiedCount: res.rows.length };
  }

  public static async verifyImmutability(organizationId: string, logId: string): Promise<void> {
    // Audit logs are strictly immutable and cannot be deleted or mutated
    throw new Error('Audit log records are immutable and cannot be edited, updated or deleted.');
  }
}
