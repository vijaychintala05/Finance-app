import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DEAD_LETTER' | 'CANCELLED';

export interface BackgroundJob {
  id: string;
  organizationId: string;
  jobType: string;
  payload: any;
  status: JobStatus;
  attemptCount: number;
  maxRetries: number;
  backoffSeconds: number;
  nextAttemptAt: string;
  leaseOwner?: string | null;
  leaseExpiresAt?: string | null;
  idempotencyKey?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastError?: string | null;
  result?: any;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleJobOptions {
  idempotencyKey?: string;
  runAt?: string;
  maxRetries?: number;
  backoffSeconds?: number;
}

export class JobSchedulerService {
  public static async scheduleJob(
    orgId: string,
    jobType: string,
    payload: any,
    options: ScheduleJobOptions = {}
  ): Promise<BackgroundJob> {
    if (!orgId || !jobType) throw new Error('organizationId and jobType are required to schedule a job');

    // Idempotency check
    if (options.idempotencyKey) {
      const existing = await db.query(
        `SELECT * FROM background_jobs WHERE organization_id = $1 AND idempotency_key = $2`,
        [orgId, options.idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return this.mapRow(existing.rows[0]);
      }
    }

    const id = newId('job');
    const maxRetries = options.maxRetries ?? 5;
    const backoffSeconds = options.backoffSeconds ?? 60;
    const nextAttemptAt = options.runAt || new Date().toISOString();

    const querySql = options.idempotencyKey
      ? `INSERT INTO background_jobs (
           id, organization_id, job_type, payload, status,
           attempt_count, max_retries, backoff_seconds, next_attempt_at,
           idempotency_key
         ) VALUES ($1, $2, $3, $4, 'PENDING', 0, $5, $6, $7, $8)
         ON CONFLICT (organization_id, idempotency_key) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
         RETURNING *`
      : `INSERT INTO background_jobs (
           id, organization_id, job_type, payload, status,
           attempt_count, max_retries, backoff_seconds, next_attempt_at,
           idempotency_key
         ) VALUES ($1, $2, $3, $4, 'PENDING', 0, $5, $6, $7, $8)
         RETURNING *`;

    const insertRes = await db.query(querySql, [
      id,
      orgId,
      jobType,
      JSON.stringify(payload || {}),
      maxRetries,
      backoffSeconds,
      nextAttemptAt,
      options.idempotencyKey || null,
    ]);

    return this.mapRow(insertRes.rows[0]);
  }

  public static async claimJobs(
    workerId: string,
    limit: number = 10,
    leaseSeconds: number = 300,
    clientOrDb?: DbQueryClient
  ): Promise<BackgroundJob[]> {
    const now = new Date(Date.now() + 2000);
    const leaseExpiry = new Date(now.getTime() + leaseSeconds * 1000);

    const executeClaim = async (tx: DbQueryClient) => {
      const claimRes = await tx.query(
        `SELECT id FROM background_jobs
         WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
         ORDER BY next_attempt_at ASC
         LIMIT $2
         FOR UPDATE${!db.isMemoryMode() ? ' SKIP LOCKED' : ''}`,
        [now, limit]
      );

      if (claimRes.rows.length === 0) return [];

      const claimedIds = claimRes.rows.map((r: any) => r.id);
      const placeholders = claimedIds.map((_, i) => `$${i + 4}`).join(', ');

      const updateRes = await tx.query(
        `UPDATE background_jobs
         SET status = 'PROCESSING',
             lease_owner = $1,
             lease_expires_at = $2,
             started_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${placeholders})
           AND status = 'PENDING'
         RETURNING *`,
        [workerId, leaseExpiry, now, ...claimedIds]
      );

      return updateRes.rows.map((r: any) => this.mapRow(r));
    };

    if (clientOrDb) {
      return await executeClaim(clientOrDb);
    }
    return await db.transaction(async (txClient) => {
      return await executeClaim(txClient);
    });
  }

  public static async completeJob(
    jobId: string,
    workerId: string,
    result?: any,
    clientOrDb?: DbQueryClient
  ): Promise<void> {
    const client = clientOrDb || db;
    const now = new Date().toISOString();

    const jobRes = await client.query(
      `SELECT * FROM background_jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) return;
    const job = jobRes.rows[0];

    // Enforce lease ownership: a different worker cannot complete another worker's leased job
    if (job.lease_owner && job.lease_owner !== workerId) {
      return;
    }

    const durationMs = job.started_at
      ? Math.max(0, new Date(now).getTime() - new Date(job.started_at).getTime())
      : 0;

    await client.query(
      `UPDATE background_jobs
       SET status = 'COMPLETED',
           lease_owner = NULL,
           lease_expires_at = NULL,
           completed_at = $1,
           result = $2,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND (lease_owner = $4 OR lease_owner IS NULL)`,
      [now, JSON.stringify(result || {}), jobId, workerId]
    );

    await client.query(
      `INSERT INTO background_job_runs (
         id, job_id, organization_id, attempt_number, worker_id, status, duration_ms
       ) VALUES ($1, $2, $3, $4, $5, 'COMPLETED', $6)`,
      [newId('jrun'), jobId, job.organization_id, job.attempt_count + 1, workerId, durationMs]
    );
  }

  public static async failJob(
    jobId: string,
    workerId: string,
    error: string,
    clientOrDb?: DbQueryClient
  ): Promise<void> {
    const client = clientOrDb || db;
    const now = new Date().toISOString();

    const jobRes = await client.query(
      `SELECT * FROM background_jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) return;
    const job = jobRes.rows[0];

    const attempts = Number(job.attempt_count || 0) + 1;
    const maxRetries = Number(job.max_retries || 5);
    const backoffSeconds = Number(job.backoff_seconds || 60);

    const isDeadLetter = attempts >= maxRetries;
    const nextStatus: JobStatus = isDeadLetter ? 'DEAD_LETTER' : 'PENDING';

    // Exponential backoff
    const delaySec = backoffSeconds * Math.pow(2, attempts - 1);
    const nextAttemptAt = new Date(Date.now() + delaySec * 1000).toISOString();

    const durationMs = job.started_at
      ? Math.max(0, new Date(now).getTime() - new Date(job.started_at).getTime())
      : 0;

    await client.query(
      `UPDATE background_jobs
       SET status = $1,
           attempt_count = $2,
           next_attempt_at = $3,
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [nextStatus, attempts, nextAttemptAt, error, jobId]
    );

    await client.query(
      `INSERT INTO background_job_runs (
         id, job_id, organization_id, attempt_number, worker_id, status, error_message, duration_ms
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId('jrun'), jobId, job.organization_id, attempts, workerId, nextStatus, error, durationMs]
    );
  }

  public static async recoverExpiredLeases(workerId: string = 'recovery-daemon'): Promise<{ recoveredCount: number; deadLetterCount: number }> {
    const now = new Date(Date.now() + 2000);
    const expiredRes = await db.query(
      `SELECT * FROM background_jobs
       WHERE status = 'PROCESSING' AND (lease_expires_at IS NULL OR lease_expires_at <= $1)`,
      [now]
    );

    let recoveredCount = 0;
    let deadLetterCount = 0;

    for (const job of expiredRes.rows) {
      const attempts = Number(job.attempt_count || 0) + 1;
      const maxRetries = Number(job.max_retries || 5);

      if (attempts >= maxRetries) {
        await db.query(
          `UPDATE background_jobs
           SET status = 'DEAD_LETTER',
               attempt_count = $1,
               lease_owner = NULL,
               lease_expires_at = NULL,
               last_error = 'LEASE_EXPIRED_CRASH_RECOVERY: Worker lost lease after max attempts',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [attempts, job.id]
        );
        deadLetterCount++;
      } else {
        await db.query(
          `UPDATE background_jobs
           SET status = 'PENDING',
               attempt_count = $1,
               lease_owner = NULL,
               lease_expires_at = NULL,
               next_attempt_at = CURRENT_TIMESTAMP,
               last_error = 'LEASE_EXPIRED_CRASH_RECOVERY: Reclaimed for retry after crash',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [attempts, job.id]
        );
        recoveredCount++;
      }
    }

    return { recoveredCount, deadLetterCount };
  }

  public static async retryFailedJob(orgId: string, jobId: string): Promise<BackgroundJob> {
    const now = new Date().toISOString();
    const updateRes = await db.query(
      `UPDATE background_jobs
       SET status = 'PENDING',
           attempt_count = 0,
           next_attempt_at = $1,
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE organization_id = $2 AND id = $3 AND status IN ('DEAD_LETTER', 'FAILED')
       RETURNING *`,
      [now, orgId, jobId]
    );

    if (updateRes.rows.length === 0) {
      throw new Error(`Job ${jobId} not found in failed or dead-letter state`);
    }

    return this.mapRow(updateRes.rows[0]);
  }

  public static async getJob(orgId: string, jobId: string): Promise<BackgroundJob | null> {
    const res = await db.query(
      `SELECT * FROM background_jobs WHERE organization_id = $1 AND id = $2`,
      [orgId, jobId]
    );
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public static async listJobs(
    orgId: string,
    filter: { status?: JobStatus; jobType?: string; limit?: number } = {}
  ): Promise<BackgroundJob[]> {
    let sql = `SELECT * FROM background_jobs WHERE organization_id = $1`;
    const params: any[] = [orgId];

    if (filter.status) {
      params.push(filter.status);
      sql += ` AND status = $${params.length}`;
    }
    if (filter.jobType) {
      params.push(filter.jobType);
      sql += ` AND job_type = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(filter.limit || 50);

    const res = await db.query(sql, params);
    return res.rows.map((r: any) => this.mapRow(r));
  }

  public static async getJobRuns(orgId: string, jobId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT * FROM background_job_runs WHERE organization_id = $1 AND job_id = $2 ORDER BY created_at ASC`,
      [orgId, jobId]
    );
    return res.rows;
  }

  private static mapRow(row: any): BackgroundJob {
    return {
      id: row.id,
      organizationId: row.organization_id,
      jobType: row.job_type,
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload || {}),
      status: row.status,
      attemptCount: Number(row.attempt_count || 0),
      maxRetries: Number(row.max_retries || 5),
      backoffSeconds: Number(row.backoff_seconds || 60),
      nextAttemptAt: row.next_attempt_at instanceof Date ? row.next_attempt_at.toISOString() : String(row.next_attempt_at),
      leaseOwner: row.lease_owner || null,
      leaseExpiresAt: row.lease_expires_at ? (row.lease_expires_at instanceof Date ? row.lease_expires_at.toISOString() : String(row.lease_expires_at)) : null,
      idempotencyKey: row.idempotency_key || null,
      startedAt: row.started_at ? (row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at)) : null,
      completedAt: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : String(row.completed_at)) : null,
      lastError: row.last_error || null,
      result: row.result ? (typeof row.result === 'string' ? JSON.parse(row.result) : row.result) : undefined,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }

  private static workerTimer: NodeJS.Timeout | null = null;

  public static async processPendingJobs(workerId: string = 'runtime-worker'): Promise<number> {
    try {
      await this.recoverExpiredLeases(workerId);
      const jobs = await this.claimJobs(workerId, 5, 120);
      for (const job of jobs) {
        try {
          if (job.jobType === 'RECURRING_DOCUMENT_EXECUTION') {
            const { RecurringDocumentJobHandler } = await import('./RecurringDocumentJobHandler');
            const result = await RecurringDocumentJobHandler.processDue({
              asOfDate: job.payload?.asOfDate,
              organizationId: job.organizationId,
              workerId,
            });
            await this.completeJob(job.id, workerId, result);
          } else {
            await this.completeJob(job.id, workerId, { status: 'OK' });
          }
        } catch (err: any) {
          await this.failJob(job.id, workerId, err?.message || String(err));
        }
      }
      return jobs.length;
    } catch {
      return 0;
    }
  }

  public static startWorkerLoop(intervalMs: number = 30000): void {
    if (this.workerTimer) return;
    this.workerTimer = setInterval(() => {
      this.processPendingJobs().catch(() => {});
    }, intervalMs);
    if (this.workerTimer.unref) {
      this.workerTimer.unref();
    }
  }

  public static stopWorkerLoop(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }
}
