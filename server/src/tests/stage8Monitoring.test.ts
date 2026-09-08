import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../database/db';
import { OperationalMonitoringService } from '../services/OperationalMonitoringService';
import { JobSchedulerService } from '../jobs/JobSchedulerService';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS as F } from './fixtures/masterFinanceFixture';
import request from 'supertest';
import app from '../index';
import { JwtAuth } from '../auth/jwt';

const ORG = F.ORG_A.id;
const OWNER_ID = F.PERSONAS.ORG_A.owner.id;

describe('Stage 8: Operational Monitoring, Telemetry & Exception Alerting', () => {
  let authToken: string;

  beforeEach(async () => {
    await MasterFinanceFixture.setup();
    authToken = JwtAuth.generateToken({
      userId: OWNER_ID,
      email: F.PERSONAS.ORG_A.owner.email,
    });
  });

  it('1. Reports system health, runtime uptime, and memory metrics', async () => {
    const health = await OperationalMonitoringService.getSystemHealthOverview();
    expect(health.status).toBe('UP');
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(health.memoryUsageMb.heapUsed).toBeGreaterThan(0);
    expect(health.database.connected).toBe(true);
    expect(health.database.schemaVersion).toBeDefined();
    expect(health.database.isSchemaCurrent).toBe(true);
  });

  it('2. Monitors job worker health, queue latency, and triggers alert on DEAD_LETTER jobs', async () => {
    // Schedule jobs
    const job1 = await JobSchedulerService.scheduleJob(ORG, 'MONITOR_JOB_1', { data: 1 });
    const job2 = await JobSchedulerService.scheduleJob(ORG, 'MONITOR_JOB_2', { data: 2 });

    const initialHealth = await OperationalMonitoringService.getJobWorkerHealth(ORG);
    expect(initialHealth.pendingJobs).toBeGreaterThanOrEqual(2);
    expect(initialHealth.deadLetterJobs).toBe(0);
    expect(initialHealth.status).toBe('HEALTHY');

    // Simulate dead letter failure
    await db.query(
      `UPDATE background_jobs SET status = 'DEAD_LETTER', last_error = 'FATAL_TEST_ERROR' WHERE id = $1`,
      [job1.id]
    );

    const degradedHealth = await OperationalMonitoringService.getJobWorkerHealth(ORG);
    expect(degradedHealth.deadLetterJobs).toBeGreaterThanOrEqual(1);
    expect(degradedHealth.status).toBe('CRITICAL');

    // Verify report reflects active critical alert
    const report = await OperationalMonitoringService.getFullOperationalReport(ORG);
    expect(report.overallStatus).toBe('CRITICAL');
    expect(report.activeAlerts.some((a) => a.domain === 'JOBS' && a.severity === 'CRITICAL')).toBe(true);
  });

  it('3. Detects reconciliation exceptions and flags debit/credit imbalance anomalies', async () => {
    const reconBefore = await OperationalMonitoringService.getReconciliationExceptions(ORG);
    expect(reconBefore.unbalancedJournalCount).toBe(0);
    expect(reconBefore.status).toBe('RECONCILED');

    // Insert an unbalanced journal anomaly into DB to test detection
    const badJeId = `je-unbalanced-${Date.now()}`;
    await db.query(
      `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, created_at)
       VALUES ($1, $2, 'JE-ERR-999', '2026-03-01', 'POSTED', CURRENT_TIMESTAMP)`,
      [badJeId, ORG]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
       VALUES ('jl-bad-1', $1, $2, $3, 1000.00, 0.00)`,
      [badJeId, ORG, `acc-${ORG}-1010`]
    );
    await db.query(
      `INSERT INTO journal_lines (id, journal_entry_id, organization_id, account_id, debit, credit)
       VALUES ('jl-bad-2', $1, $2, $3, 0.00, 500.00)`,
      [badJeId, ORG, `acc-${ORG}-2000`]
    );

    const reconAfter = await OperationalMonitoringService.getReconciliationExceptions(ORG);
    expect(reconAfter.unbalancedJournalCount).toBe(1);
    expect(reconAfter.status).toBe('CRITICAL_DISCREPANCY');

    const fullReport = await OperationalMonitoringService.getFullOperationalReport(ORG);
    expect(fullReport.activeAlerts.some((a) => a.domain === 'RECONCILIATION' && a.severity === 'CRITICAL')).toBe(true);
  });

  it('4. Tracks payment gateway integration and webhook telemetry', async () => {
    // Insert sample webhook events
    await db.query(
      `INSERT INTO payment_gateway_events (id, organization_id, gateway, event_id, event_type, payload, status, created_at)
       VALUES ('pge-1', $1, 'stripe', 'evt-ok-1', 'payment.succeeded', '{}', 'PROCESSED', CURRENT_TIMESTAMP)`,
      [ORG]
    );
    await db.query(
      `INSERT INTO payment_gateway_events (id, organization_id, gateway, event_id, event_type, payload, status, created_at)
       VALUES ('pge-2', $1, 'stripe', 'evt-err-1', 'payment.failed', '{}', 'FAILED', CURRENT_TIMESTAMP)`,
      [ORG]
    );

    const intHealth = await OperationalMonitoringService.getIntegrationHealth(ORG);
    expect(intHealth.webhooks.totalReceived24h).toBeGreaterThanOrEqual(2);
    expect(intHealth.webhooks.processed24h).toBeGreaterThanOrEqual(1);
    expect(intHealth.webhooks.failed24h).toBeGreaterThanOrEqual(1);
  });

  it('5. Serves comprehensive operational monitoring report over authenticated HTTP API', async () => {
    const res = await request(app)
      .get('/api/v1/operational/monitoring')
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Organization-ID', ORG);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organizationId).toBe(ORG);
    expect(res.body.data.system.status).toBe('UP');
    expect(res.body.data.jobs).toBeDefined();
    expect(res.body.data.reconciliation).toBeDefined();
    expect(res.body.data.integrations).toBeDefined();
    expect(Array.isArray(res.body.data.activeAlerts)).toBe(true);
  });
});
