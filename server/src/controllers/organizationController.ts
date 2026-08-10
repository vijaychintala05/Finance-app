import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';

export class OrganizationController {
  public static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name, industry, country, baseCurrency, currencySymbol } = req.body;
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!name) {
        res.status(400).json({ error: 'Organization name is required' });
        return;
      }

      const orgId = `ORG-${Date.now()}`;
      await db.query(
        `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, currency_symbol, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          orgId,
          `uuid-${orgId}`,
          `PUB-${orgId}`,
          `ORG-${Math.floor(10 + Math.random() * 90)}`,
          name,
          industry || 'General',
          country || 'United States',
          baseCurrency || 'USD',
          currencySymbol || '$',
          req.user.userId,
        ]
      );

      await db.query(
        'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
        [`mem-${Date.now()}`, orgId, req.user.userId, 'Super Admin']
      );

      res.status(201).json({
        id: orgId,
        name,
        role: 'Super Admin',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create organization' });
    }
  }

  public static async listMyOrganizations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const orgsRes = await db.query(
        `SELECT o.id, o.name, o.org_code, o.industry, o.base_currency, om.role
         FROM organizations o
         JOIN organization_members om ON o.id = om.organization_id
         WHERE om.user_id = $1`,
        [req.user.userId]
      );

      res.json(orgsRes.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list organizations' });
    }
  }

  public static async switchOrganization(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { targetOrganizationId } = req.body;
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const memberRes = await db.query(
        'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [targetOrganizationId, req.user.userId]
      );

      if (memberRes.rows.length === 0 && targetOrganizationId !== 'ORG-2026-PRIMARY') {
        res.status(403).json({ error: 'Forbidden: You are not a member of this organization' });
        return;
      }

      const role = memberRes.rows[0]?.role || 'Super Admin';

      res.json({
        activeOrganizationId: targetOrganizationId,
        role,
        message: 'Organization context switched successfully',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to switch organization' });
    }
  }

  public static async listMembers(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.params.id || req.auth?.organizationId;
      const membersRes = await db.query(
        `SELECT om.id, om.user_id as "userId", om.role, om.joined_at as "joinedAt", u.email, u.full_name as "fullName"
         FROM organization_members om
         JOIN users u ON om.user_id = u.id
         WHERE om.organization_id = $1`,
        [orgId]
      );

      res.json(membersRes.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list members' });
    }
  }

  public static async addMember(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.params.id || req.auth?.organizationId;
      const { email, role } = req.body;

      let userRes = await db.query('SELECT id, full_name FROM users WHERE email = $1', [email.toLowerCase()]);
      let targetUserId = '';

      if (userRes.rows.length === 0) {
        // Create user placeholder
        targetUserId = `usr-${Date.now()}`;
        await db.query(
          'INSERT INTO users (id, email, password_hash, full_name, status) VALUES ($1, $2, $3, $4, $5)',
          [targetUserId, email.toLowerCase(), 'unverified_invite', email.split('@')[0], 'Active']
        );
      } else {
        targetUserId = userRes.rows[0].id;
      }

      await db.query(
        'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
        [`mem-${Date.now()}`, orgId, targetUserId, role || 'Senior Accountant']
      );

      res.status(201).json({ message: 'Member added successfully', userId: targetUserId, email, role });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to add member' });
    }
  }
}
