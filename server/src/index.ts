import express from 'express';
import {
  authMiddleware,
  organizationIsolationMiddleware,
  AuthenticatedRequest,
} from './middleware/organizationIsolation.middleware';
import authRoutes from './routes/auth.routes';
import organizationRoutes from './routes/organization.routes';
import financeRoutes from './routes/finance.routes';
import bankingRoutes from './routes/banking.routes';
import securityRoutes from './routes/security.routes';
import { CURRENT_SCHEMA_VERSION, MigrationRunner } from './database/migrationRunner';
import { assertProductionConfiguration, isProduction } from './config/environment';
import { requestSecurityMiddleware } from './middleware/httpSecurity.middleware';
import { idempotencyMiddleware } from './middleware/idempotency.middleware';
import { persistentRateLimit } from './middleware/rateLimit.middleware';
import { db } from './database/db';
import point1Routes from './routes/point1.routes';
import { domainErrorMiddleware } from './middleware/domainError.middleware';
import { createInvitationAcceptanceRouter, createMembershipManagementRouter } from './access/MembershipRouter';
import { requireTrustedFinanceFeature } from './middleware/trustedFeature.middleware';
import { tenantRecoveryLockMiddleware } from './middleware/tenantRecoveryLock.middleware';
import recurringRoutes from './routes/recurring.routes';
import recoveryRoutes from './routes/recovery.routes';
import { identityRouter } from './routes/identity.routes';
import phase8Routes from './routes/phase8.routes';
import stage6Routes from './routes/stage6.routes';
import { Phase8Controller } from './controllers/Phase8Controller';
import { Stage6Controller } from './controllers/Stage6Controller';
import { EmailOutboxService } from './services/EmailOutboxService';
import { JobSchedulerService } from './jobs/JobSchedulerService';
import { PaymentGatewayService } from './services/PaymentGatewayService';
import { OperationalMonitoringService } from './services/OperationalMonitoringService';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use('/api', requestSecurityMiddleware);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '4mb', strict: true }));

app.get('/api/healthz', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/readyz', async (_req, res) => {
  try {
    const health = await db.checkHealth();
    const schemaCurrent = health.isConnected && await MigrationRunner.isCurrent();
    const ready = health.isConnected && schemaCurrent && (!isProduction() || !health.isMemoryMode);
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'unavailable',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      schemaCurrent,
    });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});

export async function initDatabase(): Promise<void> {
  try {
    assertProductionConfiguration();
    if (isProduction()) {
      await db.transaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('firmbooks-schema-migrations'))");
        await MigrationRunner.runMigrations(client);
      });
    } else {
      await MigrationRunner.runMigrations();
    }
    EmailOutboxService.startOutboxWorker();
    JobSchedulerService.startWorkerLoop();
  } catch (err) {
    console.error('[Database Init Fatal Error]', err);
    throw err;
  }
}

// Auth & Identity Routes (unprotected for login/register, protected internally)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/identity', identityRouter);
app.use('/api/v1/access', requireTrustedFinanceFeature('team-access'), createInvitationAcceptanceRouter());

// Public Customer Quotation Portal (Unprotected by design for external clients)
app.get('/api/v1/public/quotation/:token', persistentRateLimit('quotation-view', 60, 60), Phase8Controller.getPublicQuotation);
app.post('/api/v1/public/quotation/:token/respond', persistentRateLimit('quotation-response', 10, 60), Phase8Controller.respondPublicQuotation);

// Public Customer Self-Service Portal
app.get('/api/v1/public/portal/:token', persistentRateLimit('portal-view', 60, 60), Stage6Controller.getPublicPortalContext);
app.get('/api/v1/public/portal/:token/statement', persistentRateLimit('portal-statement', 30, 60), Stage6Controller.getPublicPortalStatement);
app.post('/api/v1/public/portal/:token/pay', persistentRateLimit('portal-payment', 20, 60), Stage6Controller.processPublicPortalPayment);

// Public Payment Gateway Webhooks
app.post('/api/v1/public/webhooks/gateway/:gateway', persistentRateLimit('gateway-webhook', 120, 60), async (req, res, next) => {
  try {
    const gateway = req.params.gateway;
    const signature = (req.headers['stripe-signature'] || req.headers['x-razorpay-signature'] || req.headers['x-signature'] || req.headers['signature']) as string | undefined;
    const rawBody = typeof (req as any).rawBody === 'string' ? (req as any).rawBody : JSON.stringify(req.body);

    if (isProduction() && gateway === 'mock') {
      res.status(403).json({ error: 'MOCK_GATEWAY_FORBIDDEN: Mock payment gateway is disabled in production environments' });
      return;
    }

    if (gateway !== 'mock' && !signature) {
      res.status(400).json({ error: `MISSING_WEBHOOK_SIGNATURE: Signature required for gateway '${gateway}'` });
      return;
    }

    const orgId = (req.query.orgId || req.headers['x-organization-id'] || req.body?.organizationId || req.body?.data?.object?.metadata?.organizationId) as string;
    if (!orgId || orgId === 'org-default') {
      res.status(400).json({ error: 'ORGANIZATION_ID_REQUIRED: Valid organizationId must be provided in query, header, or metadata' });
      return;
    }
    const eventId = req.body?.id || req.body?.event_id || req.headers['x-event-id'] || `evt-${Date.now()}`;
    const eventType = req.body?.type || req.body?.event || 'payment.succeeded';

    const result = await PaymentGatewayService.processWebhook({
      organizationId: orgId,
      gateway,
      eventId: String(eventId),
      eventType: String(eventType),
      payload: req.body,
      rawBody,
      signature,
    });

    res.json(result);
  } catch (err: any) {
    if (err?.message?.includes('SIGNATURE') || err?.message?.includes('GATEWAY_SECRET')) {
      res.status(400).json({ error: err.message });
    } else {
      next(err);
    }
  }
});

// Apply global security, tenant isolation & recovery mutation lock middleware to all business routes
app.use('/api/v1/organizations', authMiddleware, organizationIsolationMiddleware, tenantRecoveryLockMiddleware, idempotencyMiddleware, organizationRoutes);
app.use('/api/v1/finance', authMiddleware, organizationIsolationMiddleware, tenantRecoveryLockMiddleware, idempotencyMiddleware, financeRoutes);
app.use('/api/v1/banking', authMiddleware, organizationIsolationMiddleware, tenantRecoveryLockMiddleware, idempotencyMiddleware, bankingRoutes);
app.use('/api/v1/security', authMiddleware, organizationIsolationMiddleware, tenantRecoveryLockMiddleware, idempotencyMiddleware, securityRoutes);
app.use('/api/v1/point1', authMiddleware, organizationIsolationMiddleware, tenantRecoveryLockMiddleware, idempotencyMiddleware, point1Routes);
app.use('/api/v1/recurring', authMiddleware, organizationIsolationMiddleware, tenantRecoveryLockMiddleware, idempotencyMiddleware, recurringRoutes);
app.use('/api/v1/recovery', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, recoveryRoutes);
app.use(
  '/api/v1/access',
  authMiddleware,
  organizationIsolationMiddleware,
  tenantRecoveryLockMiddleware,
  idempotencyMiddleware,
  requireTrustedFinanceFeature('team-access'),
  createMembershipManagementRouter()
);
app.use(
  '/api/v1/stage6',
  authMiddleware,
  organizationIsolationMiddleware,
  tenantRecoveryLockMiddleware,
  idempotencyMiddleware,
  stage6Routes
);
// Backward-compatible v1 finance aliases. New clients should use /api/v1/finance;
// both routers share one security/idempotency boundary so an alias request can
// never be registered twice as its own in-flight duplicate.
app.use(
  '/api/v1',
  authMiddleware,
  organizationIsolationMiddleware,
  tenantRecoveryLockMiddleware,
  idempotencyMiddleware,
  stage6Routes,
  phase8Routes,
  financeRoutes
);

app.get('/api/v1/health', authMiddleware, organizationIsolationMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    organizationId: req.organizationId,
  });
});

app.get('/api/v1/operational/monitoring', authMiddleware, organizationIsolationMiddleware, async (req: AuthenticatedRequest, res, next) => {
  try {
    const report = await OperationalMonitoringService.getFullOperationalReport(req.organizationId!);
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

app.use('/api', domainErrorMiddleware);

export default app;
