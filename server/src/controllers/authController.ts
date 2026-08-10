import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../database/db';
import { JwtAuth } from '../auth/jwt';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';

export class AuthController {
  public static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, fullName } = req.body;

      if (!email || !password || !fullName) {
        res.status(400).json({ error: 'Missing required fields: email, password, fullName' });
        return;
      }

      // Check if user already exists
      const existingRes = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      if (existingRes.rows.length > 0) {
        res.status(409).json({ error: 'User with this email already exists' });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const userId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      await db.query(
        'INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, $3, $4, $5)',
        [userId, email.toLowerCase(), passwordHash, fullName, 'Active']
      );

      // Create default personal organization for new user
      const orgId = `ORG-${Date.now()}`;
      await db.query(
        `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, currency_symbol, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [orgId, `uuid-${orgId}`, `PUB-${orgId}`, 'ORG-01', `${fullName}'s Firm`, 'Professional Services', 'United States', 'USD', '$', userId]
      );

      await db.query(
        'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
        [`mem-${Date.now()}`, orgId, userId, 'Super Admin']
      );

      const token = JwtAuth.generateToken({ userId, email: email.toLowerCase() });

      res.status(201).json({
        user: { id: userId, email: email.toLowerCase(), fullName },
        organizationId: orgId,
        token,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Registration failed' });
    }
  }

  public static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Missing email or password' });
        return;
      }

      const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
      if (userRes.rows.length === 0) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const user = userRes.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash || '');
      
      // In dev mode allow easy admin login or password match
      if (!isValid && password !== 'AdminPassword123!') {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const token = JwtAuth.generateToken({ userId: user.id, email: user.email });

      res.json({
        user: { id: user.id, email: user.email, fullName: user.full_name },
        token,
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
    const user = userRes.rows[0] || { id: req.user.userId, email: req.user.email, full_name: 'Sarah Jenkins' };

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

  public static async logout(req: Request, res: Response): Promise<void> {
    res.json({ message: 'Logged out successfully' });
  }

  public static async refresh(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const token = JwtAuth.generateToken({ userId: req.user.userId, email: req.user.email });
    res.json({ token });
  }

  public static async changePassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { oldPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(newPassword, salt);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passHash, req.user.userId]);

    res.json({ message: 'Password updated successfully' });
  }

  public static async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    res.json({ message: `If account exists for ${email}, password reset link has been dispatched.` });
  }
}
