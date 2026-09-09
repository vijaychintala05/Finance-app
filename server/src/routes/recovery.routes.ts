import { Router, type RequestHandler } from 'express';
import { CURRENT_SCHEMA_VERSION } from '../database/migrationRunner';
import { requireOwnerOrSuperAdmin, requirePermission } from '../middleware/organizationIsolation.middleware';
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
function getApi(): RecoveryApi {
  if (!api) {
    api = new RecoveryApi(new RecoveryArtifactService({
      repository: new SqlRecoveryRepository(),
      keyring: recoveryKeyringFromEnvironment(),
      stager: new SqlRecoveryStager(),
      reconcilers: [new RecoveryRowCountReconciler(), new RecoveryAccountingReconciler()],
      promoter: new SqlRecoveryPromoter(),
      ownerAuthorizer: new SqlOwnerAuthorizer(),
      schemaVersion: CURRENT_SCHEMA_VERSION,
    }));
  }
  return api;
}
const configured = (handler: keyof RecoveryApi): RequestHandler => (req, res, next) => {
  try {
    const recoveryApi = getApi();
    void Promise.resolve(recoveryApi[handler](req, res)).catch(next);
  } catch (err: any) {
    console.error('[RecoveryApi] Failed to initialize RecoveryApi:', err?.message || err);
    res.status(503).json({ error: 'Recovery encryption keys are not configured.' });
  }
};
const ownerRecovery = [requireOwnerOrSuperAdmin, requirePermission('settings.backup'), requireTrustedFinanceFeature('recovery-center')];

router.get('/artifacts', ...ownerRecovery, configured('listArtifacts'));
router.post('/artifacts', ...ownerRecovery, configured('createArtifact'));
router.get('/artifacts/:artifactId/download', ...ownerRecovery, configured('downloadArtifact'));
router.post('/artifacts/:artifactId/stage', ...ownerRecovery, configured('stageRestore'));
router.get('/jobs', ...ownerRecovery, configured('listJobs'));
router.post('/jobs/:jobId/promote', ...ownerRecovery, configured('promoteRestore'));
router.post('/jobs/:jobId/rollback', ...ownerRecovery, configured('rollbackRestore'));
router.get('/maintenance/status', ...ownerRecovery, configured('getMaintenanceStatus'));
router.post('/maintenance/lock', ...ownerRecovery, configured('lockMaintenance'));
router.post('/maintenance/unlock', ...ownerRecovery, configured('unlockMaintenance'));

export default protectAsyncRoutes(router);
