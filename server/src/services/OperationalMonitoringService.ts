import { db, type DbQueryClient } from '../database/db';
import { CURRENT_SCHEMA_VERSION, MigrationRunner } from '../database/migrationRunner';

export interface SystemHealthOverview {
  status: 'UP' | 'DOWN' | 'DEGRADED';
  timestamp: string;
  uptimeSeconds: number;
  memoryUsageMb: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  database: {
    connected: boolean;
    isMemoryMode: boolean;
    schemaVersion: string;
    isSchemaCurrent: boolean;
  };
}

export interface JobWorkerHealth {
  pendingJobs: number;
  processingJobs: number;
  completedJobs24h: number;
  deadLetterJobs: number;
  oldestPendingJobAgeSeconds: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

export interface ReconciliationExceptionSummary {
  unreconciledTransactionCount: number;
  unreconciledTotalAmount: number;
  unbalancedJournalCount: number;
  suspenseAccountBalance: number;
  status: 'RECONCILED' | 'EXCEPTIONS_PENDING' | 'CRITICAL_DISCREPANCY';
}

export interface IntegrationHealthSummary {
  webhooks: {
    totalReceived24h: number;
    processed24h: number;
    ignored24h: number;
    failed24h: number;
  };
  emailOutbox: {
    pending: number;
    sent24h: number;
    failed: number;
  };
  bankFeeds: {
    activeFeeds: number;
    errorFeeds: number;
  };
  status: 'HEALTHY' | 'DEGRADED' | 'FAILING';
}

export interface OperationalReport {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  generatedAt: string;
  organizationId: string;
  system: SystemHealthOverview;
  jobs: JobWorkerHealth;
  reconciliation: ReconciliationExceptionSummary;
  integrations: IntegrationHealthSummary;
  activeAlerts: Array<{
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    domain: 'DATABASE' | 'JOBS' | 'RECONCILIATION' | 'INTEGRATION';
    message: string;
  }>;
}

export class OperationalMonitoringService {
  private static startTime = Date.now();

  /**
   * Evaluates core runtime, memory, and database connectivity health.
   */
  public static async getSystemHealthOverview(clientOrDb?: DbQueryClient): Promise<SystemHealthOverview> {
    const mem = process.memoryUsage();
    const dbHealth = await db.checkHealth();
    const isCurrent = dbHealth.isConnected ? await MigrationRunner.isCurrent() : false;

    const connected = dbHealth.isConnected;
    let status: 'UP' | 'DOWN' | 'DEGRADED' = 'UP';
    if (!connected) {
      status = 'DOWN';
    } else if (!isCurrent) {
      status = 'DEGRADED';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsageMb: {
        heapUsed: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotal: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
        rss: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      },
      database: {
        connected,
        isMemoryMode: dbHealth.isMemoryMode,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        isSchemaCurrent: isCurrent,
      },
    };
  }

  /**
   * Tracks background job execution, queue lag, and dead-letter count.
   */
  public static async getJobWorkerHealth(orgId?: string, clientOrDb?: DbQueryClient): Promise<JobWorkerHealth> {
    const client = clientOrDb || db;
    const orgClause = orgId ? `WHERE organization_id = $1` : '';
    const params = orgId ? [orgId] : [];

    try {
      const jobsRes = await client.query(
        `SELECT id, status, created_at, updated_at FROM background_jobs ${orgClause}`,
        params
      );

      const rows = jobsRes.rows || [];
      const nowMs = Date.now();
      const cutoff24h = nowMs - 24 * 3600 * 1000;

      let pendingJobs = 0;
      let processingJobs = 0;
      let completedJobs24h = 0;
      let deadLetterJobs = 0;
      let oldestPendingDate: number | null = null;

      for (const row of rows) {
        if (row.status === 'PENDING') {
          pendingJobs++;
          const ct = new Date(row.created_at).getTime();
          if (oldestPendingDate === null || ct < oldestPendingDate) {
            oldestPendingDate = ct;
          }
        } else if (row.status === 'PROCESSING') {
          processingJobs++;
        } else if (row.status === 'COMPLETED') {
          const ut = new Date(row.updated_at || row.created_at).getTime();
          if (ut >= cutoff24h) completedJobs24h++;
        } else if (row.status === 'DEAD_LETTER') {
          deadLetterJobs++;
        }
      }

      let oldestPendingJobAgeSeconds = 0;
      if (oldestPendingDate !== null) {
        oldestPendingJobAgeSeconds = Math.max(0, Math.floor((nowMs - oldestPendingDate) / 1000));
      }

      let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
      if (deadLetterJobs > 0 || oldestPendingJobAgeSeconds > 1800) {
        status = 'CRITICAL';
      } else if (pendingJobs > 100 || oldestPendingJobAgeSeconds > 300) {
        status = 'WARNING';
      }

      return {
        pendingJobs,
        processingJobs,
        completedJobs24h,
        deadLetterJobs,
        oldestPendingJobAgeSeconds,
        status,
      };
    } catch {
      return {
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs24h: 0,
        deadLetterJobs: 0,
        oldestPendingJobAgeSeconds: 0,
        status: 'WARNING',
      };
    }
  }

  /**
   * Audits reconciliation exceptions, unreconciled statement transactions, and GL imbalances.
   */
  public static async getReconciliationExceptions(orgId: string, clientOrDb?: DbQueryClient): Promise<ReconciliationExceptionSummary> {
    const client = clientOrDb || db;

    // 1. Unreconciled bank statement transactions
    let unreconciledTransactionCount = 0;
    let unreconciledTotalAmount = 0;
    try {
      const txRes = await client.query(
        `SELECT amount, reconciliation_status FROM bank_statement_transactions WHERE organization_id = $1`,
        [orgId]
      );
      for (const r of txRes.rows || []) {
        if (!r.reconciliation_status || r.reconciliation_status === 'UNRECONCILED') {
          unreconciledTransactionCount++;
          unreconciledTotalAmount += Math.abs(Number(r.amount || 0));
        }
      }
    } catch {
      // Table may not have statement transactions yet
    }

    // 2. Unbalanced journal entries verification
    let unbalancedJournalCount = 0;
    try {
      const jeRes = await client.query(
        `SELECT je.id, COALESCE(SUM(jl.debit), 0) as debits, COALESCE(SUM(jl.credit), 0) as credits
         FROM journal_entries je
         JOIN journal_lines jl ON jl.journal_entry_id = je.id
         WHERE je.organization_id = $1
         GROUP BY je.id`,
        [orgId]
      );
      for (const row of jeRes.rows || []) {
        if (Math.abs(Number(row.debits) - Number(row.credits)) > 0.005) {
          unbalancedJournalCount++;
        }
      }
    } catch {
      // Ignore if table empty
    }

    // 3. Suspense account balance check (Code 9999 or Suspense accounts)
    let suspenseAccountBalance = 0;
    try {
      const susRes = await client.query(
        `SELECT balance FROM accounts
         WHERE organization_id = $1 AND (code = '9999' OR LOWER(name) LIKE '%suspense%')
         LIMIT 1`,
        [orgId]
      );
      if (susRes.rows.length > 0) {
        suspenseAccountBalance = Math.abs(Number(susRes.rows[0].balance || 0));
      }
    } catch {
      // No suspense account found
    }

    let status: 'RECONCILED' | 'EXCEPTIONS_PENDING' | 'CRITICAL_DISCREPANCY' = 'RECONCILED';
    if (unbalancedJournalCount > 0) {
      status = 'CRITICAL_DISCREPANCY';
    } else if (unreconciledTransactionCount > 0 || suspenseAccountBalance > 0.01) {
      status = 'EXCEPTIONS_PENDING';
    }

    return {
      unreconciledTransactionCount,
      unreconciledTotalAmount,
      unbalancedJournalCount,
      suspenseAccountBalance,
      status,
    };
  }

  /**
   * Tracks payment gateway webhook events, bank feeds, and email outbox delivery.
   */
  public static async getIntegrationHealth(orgId?: string, clientOrDb?: DbQueryClient): Promise<IntegrationHealthSummary> {
    const client = clientOrDb || db;
    const orgClause = orgId ? `WHERE organization_id = $1` : '';
    const params = orgId ? [orgId] : [];

    // Gateway Webhook events in last 24 hours
    let totalReceived24h = 0;
    let processed24h = 0;
    let ignored24h = 0;
    let failed24h = 0;

    try {
      const gwRes = await client.query(
        `SELECT id, status, created_at FROM payment_gateway_events ${orgClause}`,
        params
      );
      const cutoff24h = Date.now() - 24 * 3600 * 1000;
      for (const r of gwRes.rows || []) {
        const ct = new Date(r.created_at).getTime();
        if (ct >= cutoff24h) {
          totalReceived24h++;
          if (r.status === 'PROCESSED') processed24h++;
          else if (r.status === 'IGNORED') ignored24h++;
          else if (r.status === 'FAILED') failed24h++;
        }
      }
    } catch {
      // Table may be empty
    }

    // Email Outbox stats
    let emailPending = 0;
    let emailSent24h = 0;
    let emailFailed = 0;

    try {
      const emailRes = await client.query(
        `SELECT id, status, sent_at FROM email_outbox ${orgClause}`,
        params
      );
      const cutoff24h = Date.now() - 24 * 3600 * 1000;
      for (const r of emailRes.rows || []) {
        if (r.status === 'PENDING') emailPending++;
        else if (r.status === 'FAILED') emailFailed++;
        else if (r.status === 'SENT') {
          const st = new Date(r.sent_at || 0).getTime();
          if (st >= cutoff24h) emailSent24h++;
        }
      }
    } catch {
      // Table may be empty
    }

    // Bank Feeds stats
    let activeFeeds = 0;
    let errorFeeds = 0;

    try {
      const feedRes = await client.query(
        `SELECT id, status FROM bank_feed_connections ${orgClause}`,
        params
      );
      for (const r of feedRes.rows || []) {
        if (r.status === 'CONNECTED') activeFeeds++;
        else if (r.status === 'ERROR') errorFeeds++;
      }
    } catch {
      // Table may be empty
    }

    let status: 'HEALTHY' | 'DEGRADED' | 'FAILING' = 'HEALTHY';
    if (failed24h > 5 || emailFailed > 5 || errorFeeds > 0) {
      status = 'FAILING';
    } else if (failed24h > 0 || emailPending > 20) {
      status = 'DEGRADED';
    }

    return {
      webhooks: {
        totalReceived24h,
        processed24h,
        ignored24h,
        failed24h,
      },
      emailOutbox: {
        pending: emailPending,
        sent24h: emailSent24h,
        failed: emailFailed,
      },
      bankFeeds: {
        activeFeeds,
        errorFeeds,
      },
      status,
    };
  }

  /**
   * Generates the comprehensive operational report with active actionable alerts.
   */
  public static async getFullOperationalReport(orgId: string, clientOrDb?: DbQueryClient): Promise<OperationalReport> {
    const [system, jobs, reconciliation, integrations] = await Promise.all([
      this.getSystemHealthOverview(clientOrDb),
      this.getJobWorkerHealth(orgId, clientOrDb),
      this.getReconciliationExceptions(orgId, clientOrDb),
      this.getIntegrationHealth(orgId, clientOrDb),
    ]);

    const activeAlerts: OperationalReport['activeAlerts'] = [];

    if (system.status !== 'UP') {
      activeAlerts.push({
        severity: 'CRITICAL',
        domain: 'DATABASE',
        message: 'Database connection or schema version mismatch detected.',
      });
    }

    if (jobs.deadLetterJobs > 0) {
      activeAlerts.push({
        severity: 'CRITICAL',
        domain: 'JOBS',
        message: `${jobs.deadLetterJobs} background job(s) in DEAD_LETTER queue require operator inspection.`,
      });
    }

    if (reconciliation.unbalancedJournalCount > 0) {
      activeAlerts.push({
        severity: 'CRITICAL',
        domain: 'RECONCILIATION',
        message: `CRITICAL: ${reconciliation.unbalancedJournalCount} journal entry/entries have debit/credit imbalances.`,
      });
    }

    if (reconciliation.suspenseAccountBalance > 0.01) {
      activeAlerts.push({
        severity: 'WARNING',
        domain: 'RECONCILIATION',
        message: `Suspense account has an unresolved balance of ${reconciliation.suspenseAccountBalance}.`,
      });
    }

    if (integrations.webhooks.failed24h > 0) {
      activeAlerts.push({
        severity: 'WARNING',
        domain: 'INTEGRATION',
        message: `${integrations.webhooks.failed24h} payment gateway webhook(s) failed in the last 24 hours.`,
      });
    }

    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' = 'HEALTHY';
    if (activeAlerts.some((a) => a.severity === 'CRITICAL')) {
      overallStatus = 'CRITICAL';
    } else if (activeAlerts.some((a) => a.severity === 'WARNING')) {
      overallStatus = 'DEGRADED';
    }

    return {
      overallStatus,
      generatedAt: new Date().toISOString(),
      organizationId: orgId,
      system,
      jobs,
      reconciliation,
      integrations,
      activeAlerts,
    };
  }
}
