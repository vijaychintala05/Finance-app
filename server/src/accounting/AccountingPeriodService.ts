import { db } from '../database/db';
import { AuditTrailService } from '../security/AuditTrailService';

export interface PeriodLock {
  id: string;
  organizationId: string;
  year: number;
  month: number;
  periodName: string;
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
}

export class AccountingPeriodService {
  public static async isPeriodLocked(organizationId: string, dateStr: string): Promise<boolean> {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    const res = await db.query(
      `SELECT is_locked FROM period_locks
       WHERE organization_id = $1 AND year = $2 AND month = $3`,
      [organizationId, year, month]
    );

    if (res.rows.length === 0) return false;
    return Boolean(res.rows[0].is_locked || res.rows[0].isLocked);
  }

  public static async lockPeriod(
    organizationId: string,
    year: number,
    month: number,
    userId: string
  ): Promise<PeriodLock> {
    const lockId = `lock-${organizationId}-${year}-${month}`;
    const now = new Date().toISOString();
    const periodName = `${year}-${String(month).padStart(2, '0')}`;

    const existing = await db.query(
      `SELECT id FROM period_locks WHERE organization_id = $1 AND year = $2 AND month = $3`,
      [organizationId, year, month]
    );

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE period_locks
         SET is_locked = TRUE, locked_by = $1, locked_at = $2
         WHERE organization_id = $3 AND year = $4 AND month = $5`,
        [userId, now, organizationId, year, month]
      );
    } else {
      await db.query(
        `INSERT INTO period_locks (id, organization_id, year, month, period_name, is_locked, locked_by, locked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [lockId, organizationId, year, month, periodName, true, userId, now]
      );
    }

    await AuditTrailService.logAction({
      organizationId,
      userId,
      action: 'ACCOUNTING_PERIOD_LOCKED',
      entityType: 'PERIOD_LOCK',
      entityId: lockId,
      afterState: { year, month, periodName, isLocked: true },
    });

    return {
      id: lockId,
      organizationId,
      year,
      month,
      periodName,
      isLocked: true,
      lockedBy: userId,
      lockedAt: now,
    };
  }

  public static async unlockPeriod(
    organizationId: string,
    year: number,
    month: number,
    userId: string
  ): Promise<PeriodLock> {
    const lockId = `lock-${organizationId}-${year}-${month}`;
    const periodName = `${year}-${String(month).padStart(2, '0')}`;

    await db.query(
      `UPDATE period_locks
       SET is_locked = FALSE
       WHERE organization_id = $1 AND year = $2 AND month = $3`,
      [organizationId, year, month]
    );

    await AuditTrailService.logAction({
      organizationId,
      userId,
      action: 'ACCOUNTING_PERIOD_UNLOCKED',
      entityType: 'PERIOD_LOCK',
      entityId: lockId,
      afterState: { year, month, periodName, isLocked: false },
    });

    return {
      id: lockId,
      organizationId,
      year,
      month,
      periodName,
      isLocked: false,
    };
  }

  public static async listPeriodLocks(organizationId: string): Promise<PeriodLock[]> {
    const res = await db.query(
      `SELECT * FROM period_locks WHERE organization_id = $1 ORDER BY year DESC, month DESC`,
      [organizationId]
    );

    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id || r.organizationId,
      year: Number(r.year),
      month: Number(r.month),
      periodName: r.period_name || r.periodName,
      isLocked: Boolean(r.is_locked ?? r.isLocked),
      lockedBy: r.locked_by || r.lockedBy,
      lockedAt: r.locked_at || r.lockedAt,
    }));
  }
}
