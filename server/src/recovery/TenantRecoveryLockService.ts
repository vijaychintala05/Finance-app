import { db, type DbQueryClient } from '../database/db';
import { RecoveryError } from './errors';

export interface TenantRecoveryLockInfo {
  isLocked: boolean;
  jobId?: string;
  state?: string;
  reason?: string;
  lockedBy?: string;
  lockedAt?: string;
}

export class TenantRecoveryLockService {
  public static async acquireLock(
    organizationId: string,
    jobId: string | null,
    reason: string,
    lockedBy: string,
    client?: DbQueryClient
  ): Promise<void> {
    const dbClient = client || db;
    await dbClient.query(
      `INSERT INTO tenant_recovery_locks (organization_id, job_id, state, reason, locked_by, locked_at)
       VALUES ($1, $2, 'RECOVERY_IN_PROGRESS', $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (organization_id) DO UPDATE
       SET job_id = EXCLUDED.job_id,
           state = 'RECOVERY_IN_PROGRESS',
           reason = EXCLUDED.reason,
           locked_by = EXCLUDED.locked_by,
           locked_at = CURRENT_TIMESTAMP`,
      [organizationId, jobId, reason, lockedBy]
    );
  }

  public static async releaseLock(
    organizationId: string,
    client?: DbQueryClient
  ): Promise<void> {
    const dbClient = client || db;
    await dbClient.query(
      'DELETE FROM tenant_recovery_locks WHERE organization_id = $1',
      [organizationId]
    );
  }

  public static async isLocked(
    organizationId: string,
    client?: DbQueryClient
  ): Promise<boolean> {
    const dbClient = client || db;
    const result = await dbClient.query(
      'SELECT 1 FROM tenant_recovery_locks WHERE organization_id = $1',
      [organizationId]
    );
    return result.rows.length > 0;
  }

  public static async getLockInfo(
    organizationId: string,
    client?: DbQueryClient
  ): Promise<TenantRecoveryLockInfo> {
    const dbClient = client || db;
    const result = await dbClient.query(
      'SELECT job_id, state, reason, locked_by, locked_at FROM tenant_recovery_locks WHERE organization_id = $1',
      [organizationId]
    );
    if (result.rows.length === 0) {
      return { isLocked: false };
    }
    const row = result.rows[0];
    return {
      isLocked: true,
      jobId: row.job_id,
      state: row.state,
      reason: row.reason,
      lockedBy: row.locked_by,
      lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : undefined,
    };
  }

  public static async assertNotLocked(
    organizationId: string,
    client?: DbQueryClient
  ): Promise<void> {
    const info = await this.getLockInfo(organizationId, client);
    if (info.isLocked) {
      throw new RecoveryError(
        'TENANT_RECOVERY_LOCKED',
        `Organization is locked for maintenance / disaster recovery: "${info.reason || 'Recovery in progress'}". Financial mutations are temporarily disabled.`,
        503,
        { lockInfo: info }
      );
    }
  }
}
