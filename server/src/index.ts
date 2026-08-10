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
import { MigrationRunner } from './database/migrationRunner';
import { SeedDataRunner } from './database/seedData';

import phase8Routes from './routes/phase8.routes';
import { Phase8Controller } from './controllers/Phase8Controller';

const app = express();
app.use(express.json());

export async function initDatabase(): Promise<void> {
  try {
    await MigrationRunner.runMigrations();
    await SeedDataRunner.seedDefaults();
  } catch (err) {
    console.error('[Database Init Fatal Error]', err);
    throw err;
  }
}

// Auto-run for test/server environment if not in isolated unit test runner
if (process.env.VITEST !== 'true' && process.env.NODE_ENV !== 'production') {
  initDatabase().catch((err) => {
    console.error('[Database Init Warning]', err);
  });
}

// Auth Routes (unprotected for login/register, protected internally)
app.use('/api/v1/auth', authRoutes);

// Public Customer Quotation Portal (Unprotected by design for external clients)
app.get('/api/v1/public/quotation/:token', Phase8Controller.getPublicQuotation);
app.post('/api/v1/public/quotation/:token/respond', Phase8Controller.respondPublicQuotation);

// Apply global security & tenant isolation middleware to all other /api/v1 routes
app.use('/api/v1/organizations', authMiddleware, organizationIsolationMiddleware, organizationRoutes);
app.use('/api/v1/finance', authMiddleware, organizationIsolationMiddleware, financeRoutes);
app.use('/api/v1/banking', authMiddleware, organizationIsolationMiddleware, bankingRoutes);
app.use('/api/v1/security', authMiddleware, organizationIsolationMiddleware, securityRoutes);
app.use('/api/v1', authMiddleware, organizationIsolationMiddleware, phase8Routes);
app.use('/api/v1', authMiddleware, organizationIsolationMiddleware, financeRoutes);

app.get('/api/v1/health', authMiddleware, organizationIsolationMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    organizationId: req.organizationId,
    authContext: req.auth,
  });
});

export default app;
