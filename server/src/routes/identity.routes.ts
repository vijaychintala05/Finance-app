import { Router, Response } from 'express';
import {
  authMiddleware,
  organizationIsolationMiddleware,
  requirePermission,
  AuthenticatedRequest,
} from '../middleware/organizationIsolation.middleware';
import { SessionService } from '../auth/SessionService';
import { MfaService } from '../auth/MfaService';
import { IdentityInviteService } from '../auth/IdentityInviteService';
import { PasswordRecoveryService } from '../auth/PasswordRecoveryService';
import { GoogleOAuthService, GoogleOAuthConfigurationError } from '../auth/GoogleOAuthService';
import { EmailOutboxService } from '../services/EmailOutboxService';
import { JwtAuth } from '../auth/jwt';
import { db } from '../database/db';
import { AuthController } from '../controllers/authController';

export const identityRouter = Router();

// -------------------------------------------------------------
// 1. SESSIONS API (User Device Management)
// -------------------------------------------------------------
identityRouter.get('/sessions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const currentSessionId = req.sessionId || '';
    const sessions = await SessionService.listUserSessions(userId);
    res.json({ currentSessionId, sessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

identityRouter.post('/sessions/:sessionId/revoke', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { sessionId } = req.params;
    const revoked = await SessionService.revokeSession(sessionId, userId);
    res.json({ success: revoked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

identityRouter.post('/sessions/revoke-others', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const currentSessionId = req.sessionId || '';
    const count = await SessionService.revokeAllOtherSessions(userId, currentSessionId);
    res.json({ success: true, revokedCount: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. INVITATIONS API (Tenant & RBAC Protected)
// -------------------------------------------------------------
identityRouter.post(
  '/invitations',
  authMiddleware,
  organizationIsolationMiddleware,
  requirePermission('settings.manage_users'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const inviterUserId = req.user!.userId;
      const callerRole = req.auth!.role;
      const organizationId = req.organizationId!;
      const { email, role } = req.body;

      if (!email) {
        res.status(400).json({ error: 'email is required' });
        return;
      }

      const targetRole = role || 'Staff';

      // Anti-Escalation Check:
      // Only an Owner can invite an Owner or Admin.
      // Admins can only invite Staff or Accountant.
      if (targetRole === 'Owner' && callerRole !== 'Owner') {
        res.status(403).json({ error: 'Forbidden: Only organization Owners can assign the Owner role.' });
        return;
      }
      if (targetRole === 'Admin' && callerRole !== 'Owner') {
        res.status(403).json({ error: 'Forbidden: Only organization Owners can assign the Admin role.' });
        return;
      }

      const result = await IdentityInviteService.issueInvitation(organizationId, inviterUserId, email, targetRole);
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

identityRouter.post(
  '/invitations/:inviteId/resend',
  authMiddleware,
  organizationIsolationMiddleware,
  requirePermission('settings.manage_users'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const inviterUserId = req.user!.userId;
      const { inviteId } = req.params;

      // Verify invitation belongs to the caller's organization
      const inviteCheck = await db.query(
        `SELECT organization_id FROM organization_invitations WHERE id = $1`,
        [inviteId]
      );
      if (inviteCheck.rows.length === 0 || inviteCheck.rows[0].organization_id !== req.organizationId) {
        res.status(404).json({ error: 'Invitation not found in this organization' });
        return;
      }

      const result = await IdentityInviteService.resendInvitation(inviteId, inviterUserId);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

identityRouter.post(
  '/invitations/:inviteId/revoke',
  authMiddleware,
  organizationIsolationMiddleware,
  requirePermission('settings.manage_users'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const revokerUserId = req.user!.userId;
      const { inviteId } = req.params;

      // Verify invitation belongs to the caller's organization
      const inviteCheck = await db.query(
        `SELECT organization_id FROM organization_invitations WHERE id = $1`,
        [inviteId]
      );
      if (inviteCheck.rows.length === 0 || inviteCheck.rows[0].organization_id !== req.organizationId) {
        res.status(404).json({ error: 'Invitation not found in this organization' });
        return;
      }

      const revoked = await IdentityInviteService.revokeInvitation(inviteId, revokerUserId);
      res.json({ success: revoked });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

identityRouter.post('/invitations/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token, password, fullName } = req.body;
    if (!token || !password || !fullName) {
      res.status(400).json({ error: 'token, password, and fullName are required' });
      return;
    }
    const metadata = {
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
      userAgent: req.headers['user-agent'],
    };
    const result = await IdentityInviteService.acceptInvitation(token, password, fullName, metadata);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. MFA / TOTP API
// -------------------------------------------------------------
identityRouter.post('/mfa/enroll', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const email = req.user!.email || 'user@firmbooks.local';
    const result = await MfaService.enrollMfa(userId, email);
    res.json(result);
  } catch (err: any) {
    res.status(err.message.startsWith('MFA_ALREADY_ENABLED') ? 409 : 500).json({ error: err.message });
  }
});

identityRouter.post('/mfa/confirm', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code } = req.body;
    const success = await MfaService.confirmEnrollment(userId, code);
    res.json({ success });
  } catch (err: any) {
    if (err.message === 'MFA_RATE_LIMITED') {
      res.setHeader('Retry-After', '900');
      res.status(429).json({ error: 'Too many verification attempts. Try again in 15 minutes.' });
      return;
    }
    res.status(400).json({ error: err.message });
  }
});

identityRouter.post('/mfa/challenge', AuthController.verifyMfaLogin);

identityRouter.get('/mfa/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const status = await MfaService.getMfaStatus(userId);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. PASSWORD RECOVERY API
// -------------------------------------------------------------
identityRouter.post('/recovery/request', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.body;
    const reqIp = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const result = await PasswordRecoveryService.requestPasswordReset(email, reqIp);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

identityRouter.post('/recovery/reset', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { token, newPassword } = req.body;
    const result = await PasswordRecoveryService.completePasswordReset(token, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. GOOGLE OAUTH LINKING & CALLBACK API
// -------------------------------------------------------------
identityRouter.get('/google/auth-url', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const redirectUri = (req.query.redirectUri as string) || 'http://localhost:3000/api/v1/identity/google/callback';
    const { url, state } = await GoogleOAuthService.getOAuthUrl(redirectUri);
    res.json({ url, state });
  } catch (err: any) {
    res.status(err instanceof GoogleOAuthConfigurationError ? 503 : 500).json({ error: err.message || 'Failed to generate Google OAuth URL' });
  }
});

identityRouter.get('/google/callback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const code = req.query.code as string;
    const state = req.query.state as string;
    const redirectUri = (req.query.redirectUri as string) || `${req.protocol}://${req.get('host')}/api/v1/identity/google/callback`;

    if (!code || !state) {
      res.status(400).json({ error: 'code and state parameters are required' });
      return;
    }

    const profile = await GoogleOAuthService.exchangeCodeForProfile(code, redirectUri, state);
    if (!profile.email_verified) {
      res.status(401).json({ error: 'Google email must be verified' });
      return;
    }
    const metadata = {
      ipAddress: req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
      userAgent: req.headers['user-agent'],
    };

    const authResult = await GoogleOAuthService.authenticateGoogleUser(profile.sub, profile.email, metadata);

    if (authResult.mfaRequired) {
      res.json({ mfaRequired: true, mfaTicket: authResult.mfaTicket });
      return;
    }

    const token = JwtAuth.generateToken({ userId: authResult.userId, email: authResult.email });
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `firmbooks_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=900${secure}`);

    const isDev = process.env.NODE_ENV !== 'production';

    res.json({
      success: true,
      user: { id: authResult.userId, email: authResult.email },
      ...(isDev ? { token, sessionId: authResult.sessionId, sessionToken: authResult.sessionToken } : {}),
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Google authentication failed' });
  }
});

identityRouter.post('/google/link', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const { code, redirectUri } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    const profile = await GoogleOAuthService.exchangeCodeForProfile(code, redirectUri || 'http://localhost:3000');
    const result = await GoogleOAuthService.linkGoogleIdentity(userId, profile.sub, profile.email);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to link Google identity' });
  }
});

// -------------------------------------------------------------
// 6. OWNER SECURITY CENTER METRICS & LOGS (Strictly Tenant-Isolated)
// -------------------------------------------------------------
identityRouter.get(
  '/outbox',
  authMiddleware,
  organizationIsolationMiddleware,
  requirePermission('settings.manage_users'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const emails = await EmailOutboxService.listOutbox(organizationId, 50);
      res.json(emails);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

identityRouter.get(
  '/security-events',
  authMiddleware,
  organizationIsolationMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organizationId = req.organizationId!;
      const callerRole = req.auth!.role;
      const userId = req.user!.userId;

      let resLogs;
      if (callerRole === 'Owner' || callerRole === 'Admin') {
        resLogs = await db.query(
          `SELECT id, organization_id, user_id, event_type, ip_address, user_agent, metadata, created_at
           FROM security_events
           WHERE organization_id = $1
           ORDER BY created_at DESC
           LIMIT 100`,
          [organizationId]
        );
      } else {
        resLogs = await db.query(
          `SELECT id, organization_id, user_id, event_type, ip_address, user_agent, metadata, created_at
           FROM security_events
           WHERE organization_id = $1 AND user_id = $2
           ORDER BY created_at DESC
           LIMIT 100`,
          [organizationId, userId]
        );
      }

      res.json(resLogs.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);
