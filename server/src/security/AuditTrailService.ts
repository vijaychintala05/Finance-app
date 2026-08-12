import { db } from '../database/db';
import { newId } from '../utils/ids';

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

    await db.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, timestamp, before_state, after_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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

    sql += ' ORDER BY timestamp DESC';
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
      timestamp: row.timestamp,
      beforeState: typeof row.before_state === 'string' ? JSON.parse(row.before_state) : row.before_state,
      afterState: typeof row.after_state === 'string' ? JSON.parse(row.after_state) : row.after_state,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    }));
  }

  public static async verifyImmutability(organizationId: string, logId: string): Promise<void> {
    // Audit logs are strictly immutable and cannot be deleted or mutated
    throw new Error('Audit log records are immutable and cannot be edited, updated or deleted.');
  }
}
