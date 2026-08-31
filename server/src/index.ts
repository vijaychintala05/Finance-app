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
import recurringRoutes from './routes/recurring.routes';
import recoveryRoutes from './routes/recovery.routes';
import { identityRouter } from './routes/identity.routes';
import phase8Routes from './routes/phase8.routes';
import { Phase8Controller } from './controllers/Phase8Controller';
import { EmailOutboxService } from './services/EmailOutboxService';

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

// Apply global security & tenant isolation middleware to all other /api/v1 routes
app.use('/api/v1/organizations', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, organizationRoutes);
app.use('/api/v1/finance', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, financeRoutes);
app.use('/api/v1/banking', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, bankingRoutes);
app.use('/api/v1/security', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, securityRoutes);
app.use('/api/v1/point1', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, point1Routes);
app.use('/api/v1/recurring', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, recurringRoutes);
app.use('/api/v1/recovery', authMiddleware, organizationIsolationMiddleware, idempotencyMiddleware, recoveryRoutes);
app.use(
  '/api/v1/access',
  authMiddleware,
  organizationIsolationMiddleware,
  idempotencyMiddleware,
  requireTrustedFinanceFeature('team-access'),
  createMembershipManagementRouter()
);
// Backward-compatible v1 finance aliases. New clients should use /api/v1/finance;
// both routers share one security/idempotency boundary so an alias request can
// never be registered twice as its own in-flight duplicate.
app.use(
  '/api/v1',
  authMiddleware,
  organizationIsolationMiddleware,
  idempotencyMiddleware,
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

app.use('/api', domainErrorMiddleware);

export default app;
