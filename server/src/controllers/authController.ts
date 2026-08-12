import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../database/db';
import { JwtAuth } from '../auth/jwt';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import { SessionSecurity } from '../auth/SessionSecurity';
import { newId } from '../utils/ids';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { normalizeSupportedBaseCurrency } from '../utils/currency';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function setAuthCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `firmbooks_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=900${secure}`);
}

export class AuthController {
  public static async register(req: Request, res: Response): Promise<void> {
    try {
      const email = normalizedEmail(req.body?.email);
      const password = req.body?.password;
      const fullName = typeof req.body?.fullName === 'string' ? req.body.fullName.trim() : '';
      const organizationName = typeof req.body?.organizationName === 'string'
        ? req.body.organizationName.trim()
        : `${fullName}'s Firm`;
      const countryInput = typeof req.body?.country === 'string' ? req.body.country.trim() : '';
      const currencyInput = typeof req.body?.baseCurrency === 'string' ? req.body.baseCurrency.trim().toUpperCase() : '';
      const country = countryInput || (process.env.NODE_ENV === 'test' ? 'Test Jurisdiction' : '');
      const baseCurrency = normalizeSupportedBaseCurrency(currencyInput || (process.env.NODE_ENV === 'test' ? 'USD' : ''));

      if (!EMAIL_PATTERN.test(email) || email.length > 320 || !password || !fullName || fullName.length > 255 || organizationName.length < 2 || organizationName.length > 120 || country.length < 2 || country.length > 100 || !baseCurrency) {
        res.status(400).json({ error: 'A valid email, password, full name, organization name, country, and supported two-decimal base currency are required' });
        return;
      }

      // Check if user already exists
      const existingRes = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingRes.rows.length > 0) {
        res.status(409).json({ error: 'User with this email already exists' });
        return;
      }

      const passwordHash = await SessionSecurity.hashPassword(password);
      const userId = newId('usr');
      const orgId = `org-${crypto.randomBytes(12).toString('hex')}`;
      const orgCode = `ORG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

      await db.transaction(async (client) => {
        await client.query(
          'INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, $3, $4, $5)',
          [userId, email, passwordHash, fullName, 'Active']
        );

        await client.query(
          `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, currency_symbol, owner_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [orgId, crypto.randomUUID(), `PUB-${crypto.randomBytes(10).toString('hex')}`, orgCode, organizationName, 'General Business', country, baseCurrency, baseCurrency, userId]
        );

        // Self-registration always creates an Owner. Roles for other users can only
        // be assigned through an authenticated, permission-checked invitation flow.
        await client.query(
          'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
          [newId('mem'), orgId, userId, 'Owner']
        );
        await OrganizationProvisioningService.provisionDefaultChart(client, orgId);
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'ORGANIZATION_REGISTERED', 'Organization', $2, $4)`,
          [newId('aud'), orgId, userId, JSON.stringify({ name: organizationName, orgCode, ownerUserId: userId, country, baseCurrency })]
        );
      });

      const token = JwtAuth.generateToken({ userId, email });
      setAuthCookie(res, token);

      res.status(201).json({
        user: { id: userId, email, fullName },
        organizationId: orgId,
        ...(process.env.NODE_ENV !== 'production' ? { token } : {}),
      });
    } catch (err: any) {
      if (err?.code === '23505' || String(err?.message).includes('duplicate key')) {
        res.status(409).json({ error: 'An account with that email already exists' });
        return;
      }
      res.status(500).json({ error: 'Registration failed' });
    }
  }

  public static async login(req: Request, res: Response): Promise<void> {
    try {
      const email = normalizedEmail(req.body?.email);
      const password = req.body?.password;
      const rateLimitKey = `${req.ip || 'unknown'}:${email || 'missing'}`;
      const rateLimit = await SessionSecurity.checkPersistentRateLimit(rateLimitKey);

      if (!rateLimit.allowed) {
        res.setHeader('Retry-After', String(rateLimit.lockoutSecondsRemaining));
        res.status(429).json({ error: 'Too many login attempts. Try again later.' });
        return;
      }

      if (!EMAIL_PATTERN.test(email) || !password) {
        res.status(400).json({ error: 'Missing email or password' });
        return;
      }

      const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        await SessionSecurity.recordPersistentFailure(rateLimitKey);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const user = userRes.rows[0];
      const isValid = await SessionSecurity.verifyPassword(password, user.password_hash || '');
      if (!isValid || user.status !== 'Active') {
        await SessionSecurity.recordPersistentFailure(rateLimitKey);
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      await SessionSecurity.clearPersistentRateLimit(rateLimitKey);

      const token = JwtAuth.generateToken({ userId: user.id, email: user.email });
      setAuthCookie(res, token);

      res.json({
        user: { id: user.id, email: user.email, fullName: user.full_name },
        ...(process.env.NODE_ENV !== 'production' ? { token } : {}),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Login failed' });
    }
  }

  public static async me(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userRes = await db.query('SELECT id, email, full_name, avatar_url, status FROM users WHERE id = $1', [req.user.userId]);
    if (userRes.rows.length !== 1 || userRes.rows[0].status !== 'Active') {
      res.status(401).json({ error: 'Authenticated user is unavailable or inactive' });
      return;
    }
    const user = userRes.rows[0];

    // Get user's organizations
    const orgsRes = await db.query(
      `SELECT o.id, o.name, o.org_code, om.role
       FROM organizations o
       JOIN organization_members om ON o.id = om.organization_id
       WHERE om.user_id = $1`,
      [req.user.userId]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        avatarUrl: user.avatar_url,
      },
      organizations: orgsRes.rows,
    });
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user) {
      await SessionSecurity.revokeAllUserTokens(req.user.userId);
    }
    res.setHeader('Set-Cookie', 'firmbooks_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');
    res.json({ message: 'Logged out successfully' });
  }

  public static async refresh(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = JwtAuth.generateToken({ userId: req.user.userId, email: req.user.email });
    setAuthCookie(res, token);
    res.json(process.env.NODE_ENV !== 'production' ? { token } : { refreshed: true });
  }

  public static async changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Current and new password are required' });
      return;
    }

    const userRes = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.userId]);
    const currentHash = userRes.rows[0]?.password_hash || userRes.rows[0]?.passwordHash;
    if (!currentHash || !(await SessionSecurity.verifyPassword(oldPassword, currentHash))) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    let passHash: string;
    try {
      passHash = await SessionSecurity.hashPassword(newPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
      return;
    }
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passHash, req.user.userId]);
    await SessionSecurity.revokeAllUserTokens(req.user.userId);

    res.json({ message: 'Password updated successfully' });
  }

  public static async forgotPassword(req: Request, res: Response): Promise<void> {
    res.status(503).json({
      error: 'Password recovery is unavailable until verified email delivery and one-time reset completion are configured.',
    });
  }
}
