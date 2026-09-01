import type { Request, Response, NextFunction } from 'express';
import { TenantRecoveryLockService } from '../recovery/TenantRecoveryLockService';

export interface AuthenticatedRequestWithOrg extends Request {
  auth?: {
    userId: string;
    organizationId: string;
    role: string;
    permissions: string[];
  };
  organizationId?: string;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const tenantRecoveryLockMiddleware = async (
  req: AuthenticatedRequestWithOrg,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Only check mutation methods
  if (!MUTATION_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const organizationId = req.auth?.organizationId || req.organizationId;
  if (!organizationId) {
    return next();
  }

  // Bypass recovery center operations themselves so owners can stage, promote, or rollback
  const path = req.baseUrl || req.originalUrl || req.path || '';
  if (path.includes('/recovery')) {
    return next();
  }

  try {
    const lockInfo = await TenantRecoveryLockService.getLockInfo(organizationId);
    if (lockInfo.isLocked) {
      res.status(503).json({
        success: false,
        error: {
          code: 'TENANT_RECOVERY_LOCKED',
          message: `Organization is locked for disaster recovery / maintenance: "${lockInfo.reason || 'Active recovery'}". Financial mutations are blocked.`,
          details: { lockInfo },
        },
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
};
