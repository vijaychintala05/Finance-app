import { Request, Response, NextFunction } from 'express';
import { JwtAuth } from '../auth/jwt';
import { db } from '../database/db';
import { RbacService, PermissionCode } from '../auth/RbacService';

export interface AuthenticatedContext {
  userId: string;
  email: string;
  organizationId: string;
  role: string;
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
  auth?: AuthenticatedContext;
  organizationId?: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = JwtAuth.verifyToken(token);
    if (decoded) {
      req.user = decoded;
      return next();
    }
  }

  // In production, reject missing or invalid credentials immediately
  if (process.env.NODE_ENV === 'production') {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return;
  }

  // Dev mode fallback header ONLY permitted when NODE_ENV !== 'production'
  const devUserId = (req.headers['x-user-id'] as string) || 'usr-identity-101';
  const devEmail = (req.headers['x-user-email'] as string) || 's.jenkins@apexgrowth.com';

  req.user = {
    userId: devUserId,
    email: devEmail,
  };

  next();
};

export const organizationIsolationMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return;
  }

  // 1. Resolve requested organization ID
  let requestedOrgId =
    (req.headers['x-organization-id'] as string) ||
    (req.query.organizationId as string) ||
    (req.body && req.body.organizationId);

  // If no org ID specified, look up user's primary/first organization
  if (!requestedOrgId) {
    const userOrgsRes = await db.query(
      'SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1',
      [req.user.userId]
    );

    if (userOrgsRes.rows.length > 0) {
      requestedOrgId = userOrgsRes.rows[0].organization_id || userOrgsRes.rows[0].organizationId;
    } else if (process.env.NODE_ENV !== 'production') {
      // Fallback to default organization in non-production only
      requestedOrgId = 'ORG-2026-PRIMARY';
    } else {
      res.status(400).json({ error: 'Bad Request: No organization context provided or available for user' });
      return;
    }
  }

  // 2. VERIFY USER MEMBERSHIP & TENANT ISOLATION
  const membershipRes = await db.query(
    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
    [requestedOrgId, req.user.userId]
  );

  let userRole = 'Super Admin';
  if (membershipRes.rows.length === 0) {
    // Check if user is organization owner
    const orgRes = await db.query(
      'SELECT id, owner_user_id FROM organizations WHERE id = $1',
      [requestedOrgId]
    );

    if (orgRes.rows.length > 0 && orgRes.rows[0].owner_user_id === req.user.userId) {
      userRole = 'Owner';
    } else if (process.env.NODE_ENV !== 'production' && requestedOrgId === 'ORG-2026-PRIMARY') {
      // Auto-grant access to primary default org in dev mode
      userRole = 'Super Admin';
    } else {
      res.status(403).json({
        error: 'Forbidden: You do not have access to the requested organization.',
        requestedOrganizationId: requestedOrgId,
      });
      return;
    }
  } else {
    userRole = membershipRes.rows[0].role;
  }

  // 3. Resolve permissions for role via RbacService
  const permissionsList = RbacService.getPermissionsForRole(userRole);

  req.auth = {
    userId: req.user.userId,
    email: req.user.email,
    organizationId: requestedOrgId,
    role: userRole,
    permissions: permissionsList,
  };

  req.organizationId = requestedOrgId;
  next();
};

export const requirePermission = (permissionCode: string | string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (req.auth.role === 'Super Admin' || req.auth.role === 'Owner') {
      return next();
    }

    const codes = Array.isArray(permissionCode) ? permissionCode : [permissionCode];

    const hasAny = codes.some((code) => {
      const normalizedCode = code.includes('.')
        ? (code.endsWith('s') ? code : code.replace(/^([a-z]+)\.(.+)$/, '$1s.$2'))
        : code;

      return (
        req.auth!.permissions.includes(code as PermissionCode) ||
        req.auth!.permissions.includes(normalizedCode as PermissionCode) ||
        RbacService.hasPermission(req.auth!.role, code as PermissionCode) ||
        RbacService.hasPermission(req.auth!.role, normalizedCode as PermissionCode)
      );
    });

    if (!hasAny) {
      res.status(403).json({
        error: `Forbidden: Missing required permission [${Array.isArray(permissionCode) ? permissionCode.join(', ') : permissionCode}] for role [${req.auth.role}]`,
      });
      return;
    }

    next();
  };
};

