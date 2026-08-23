import { Request, Response, NextFunction } from 'express';
import { JwtAuth } from '../auth/jwt';
import { db } from '../database/db';
import { RbacService, PermissionCode } from '../auth/RbacService';
import { SessionSecurity } from '../auth/SessionSecurity';

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
  const cookieToken = req.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('firmbooks_session='))
    ?.slice('firmbooks_session='.length);

  if ((authHeader && authHeader.startsWith('Bearer ')) || cookieToken) {
    // The browser's HttpOnly cookie is authoritative when both mechanisms are
    // present. This prevents stale development storage from overriding a valid
    // production session; API clients without cookies continue to use Bearer.
    const token = cookieToken || authHeader!.substring(7);
    const decoded = JwtAuth.verifyToken(token);
    if (decoded) {
      if (!decoded.iat || (await SessionSecurity.isTokenRevoked(decoded.userId, decoded.iat))) {
        res.status(401).json({ error: 'Unauthorized: Token has been revoked' });
        return;
      }
      const userResult = await db.query('SELECT email, status FROM users WHERE id = $1', [decoded.userId]);
      if (userResult.rows.length !== 1 || userResult.rows[0].status !== 'Active') {
        res.status(401).json({ error: 'Unauthorized: User account is unavailable or inactive' });
        return;
      }
      req.user = { userId: decoded.userId, email: userResult.rows[0].email };
      return next();
    }
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }

  res.status(401).json({ error: 'Unauthorized: Authentication required' });
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
      `SELECT organization_id FROM organization_members
        WHERE user_id = $1 AND COALESCE(status, 'Active') = 'Active'
        ORDER BY joined_at ASC LIMIT 1`,
      [req.user.userId]
    );

    if (userOrgsRes.rows.length > 0) {
      requestedOrgId = userOrgsRes.rows[0].organization_id || userOrgsRes.rows[0].organizationId;
    } else {
      res.status(400).json({ error: 'Bad Request: No organization context provided or available for user' });
      return;
    }
  }

  // 2. VERIFY USER MEMBERSHIP & TENANT ISOLATION
  const membershipRes = await db.query(
    `SELECT role, access_version, access_invalidated_at
       FROM organization_members
      WHERE organization_id = $1 AND user_id = $2
        AND COALESCE(status, 'Active') = 'Active'`,
    [requestedOrgId, req.user.userId]
  );

  let userRole: string;
  if (membershipRes.rows.length === 0) {
    res.status(403).json({ error: 'Forbidden: You do not have access to the requested organization.' });
    return;
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

export const requirePermission = (permissionCode: PermissionCode | PermissionCode[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    const codes = Array.isArray(permissionCode) ? permissionCode : [permissionCode];
    const hasAny = codes.some((code) => req.auth!.permissions.includes(code));

    if (!hasAny) {
      res.status(403).json({
        error: `Forbidden: Missing required permission [${Array.isArray(permissionCode) ? permissionCode.join(', ') : permissionCode}] for role [${req.auth.role}]`,
      });
      return;
    }

    next();
  };
};
