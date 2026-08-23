import { Router, type RequestHandler } from 'express';
import { CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';
import { RecoveryApi } from '../recovery/RecoveryApi';
import { RecoveryArtifactService } from '../recovery/RecoveryArtifactService';
import {
  recoveryKeyringFromEnvironment,
  RecoveryAccountingReconciler,
  RecoveryRowCountReconciler,
  SqlOwnerAuthorizer,
  SqlRecoveryPromoter,
  SqlRecoveryStager,
} from '../recovery/ProductionRecoveryAdapters';
import { SqlRecoveryRepository } from '../recovery/RecoveryRepository';
import { protectAsyncRoutes } from './asyncRouter';

const router = Router();
let api: RecoveryApi | null = null;
try {
  api = new RecoveryApi(new RecoveryArtifactService({
    repository: new SqlRecoveryRepository(),
    keyring: recoveryKeyringFromEnvironment(),
    stager: new SqlRecoveryStager(),
    reconcilers: [new RecoveryRowCountReconciler(), new RecoveryAccountingReconciler()],
    promoter: new SqlRecoveryPromoter(),
    ownerAuthorizer: new SqlOwnerAuthorizer(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  }));
} catch {
  // Production may deliberately leave recovery disabled. Routes fail closed
  // until both the deployment feature flag and encryption keys are present.
}
const configured = (handler: keyof RecoveryApi): RequestHandler => (req, res, next) => {
  if (!api) {
    res.status(503).json({ error: 'Recovery encryption keys are not configured.' });
    return;
  }
  void Promise.resolve(api[handler](req, res)).catch(next);
};
const ownerRecovery = [requirePermission('settings.backup'), requireTrustedFinanceFeature('recovery-center')];

router.get('/artifacts', ...ownerRecovery, configured('listArtifacts'));
router.post('/artifacts', ...ownerRecovery, configured('createArtifact'));
router.get('/artifacts/:artifactId/download', ...ownerRecovery, configured('downloadArtifact'));
router.post('/artifacts/:artifactId/stage', ...ownerRecovery, configured('stageRestore'));
router.get('/jobs', ...ownerRecovery, configured('listJobs'));
router.post('/jobs/:jobId/promote', ...ownerRecovery, configured('promoteRestore'));

export default protectAsyncRoutes(router);
