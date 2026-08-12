import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import crypto from 'crypto';
import { newId } from '../utils/ids';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { RbacService, UserRole } from '../auth/RbacService';

export class OrganizationController {
  public static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name, industry, country, baseCurrency, currencySymbol } = req.body;
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const normalizedName = typeof name === 'string' ? name.trim() : '';
      const normalizedCurrency = typeof baseCurrency === 'string' ? baseCurrency.trim().toUpperCase() : '';
      const normalizedCountry = typeof country === 'string' ? country.trim() : '';
      const normalizedCurrencySymbol = typeof currencySymbol === 'string' && currencySymbol.trim()
        ? currencySymbol.trim()
        : normalizedCurrency;
      if (normalizedName.length < 2 || normalizedName.length > 120 || normalizedCountry.length < 2 || normalizedCountry.length > 120 || !/^[A-Z]{3}$/.test(normalizedCurrency)) {
        res.status(400).json({ error: 'Organization name, country, and a three-letter base currency are required' });
        return;
      }
      if ((typeof industry === 'string' && industry.length > 120) || (typeof country === 'string' && country.length > 120) || (typeof currencySymbol === 'string' && currencySymbol.length > 8)) {
        res.status(400).json({ error: 'Organization metadata exceeds the allowed length' });
        return;
      }

      const orgId = `org-${crypto.randomBytes(12).toString('hex')}`;
      const uuid = crypto.randomUUID();
      const publicOrgId = `PUB-${crypto.randomBytes(10).toString('hex')}`;
      const orgCode = `ORG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
      await db.transaction(async (client) => {
        await client.query(
          `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, currency_symbol, owner_user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [orgId, uuid, publicOrgId, orgCode, normalizedName, industry || 'General', normalizedCountry, normalizedCurrency, normalizedCurrencySymbol, req.user!.userId]
        );
        await client.query(
          'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
          [newId('mem'), orgId, req.user!.userId, 'Owner']
        );
        await OrganizationProvisioningService.provisionDefaultChart(client, orgId);
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'ORGANIZATION_CREATED', 'Organization', $2, $4)`,
          [newId('aud'), orgId, req.user!.userId, JSON.stringify({ name: normalizedName, orgCode, country: normalizedCountry, baseCurrency: normalizedCurrency })]
        );
      });

      res.status(201).json({
        id: orgId,
        uuid,
        publicOrgId,
        orgCode,
        name: normalizedName,
        industry: industry || 'General',
        country: normalizedCountry,
        baseCurrency: normalizedCurrency,
        currencySymbol: normalizedCurrencySymbol,
        ownerUserId: req.user.userId,
        status: 'Active',
        role: 'Owner',
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
        `SELECT o.id, o.uuid, o.public_org_id, o.org_code, o.name, o.industry, o.country,
                o.base_currency, o.currency_symbol, o.owner_user_id, o.status, o.created_at, om.role
         FROM organizations o
         JOIN organization_members om ON o.id = om.organization_id
         WHERE om.user_id = $1
         ORDER BY o.created_at, o.id`,
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

      if (memberRes.rows.length === 0) {
        res.status(403).json({ error: 'Forbidden: You are not a member of this organization' });
        return;
      }

      const role = memberRes.rows[0].role;

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
      if (!orgId || orgId !== req.auth?.organizationId) {
        res.status(403).json({ error: 'Organization path does not match the authorized tenant context' });
        return;
      }
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
      if (!orgId || orgId !== req.auth?.organizationId) {
        res.status(403).json({ error: 'Organization path does not match the authorized tenant context' });
        return;
      }
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const role = req.body?.role as UserRole;
      if (!email || !RbacService.getAllRoles().some((entry) => entry.role === role) || role === 'Owner') {
        res.status(400).json({ error: 'A valid email and non-owner role are required' });
        return;
      }

      const userRes = await db.query("SELECT id, full_name FROM users WHERE email = $1 AND status = 'Active'", [email]);
      let targetUserId = '';

      if (userRes.rows.length === 0) {
        res.status(404).json({ error: 'User must register before being added to an organization' });
        return;
      } else {
        targetUserId = userRes.rows[0].id;
      }

      await db.transaction(async (client) => {
        await client.query(
          'INSERT INTO organization_members (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
          [newId('mem'), orgId, targetUserId, role]
        );
        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'ORGANIZATION_MEMBER_ADDED', 'OrganizationMember', $4, $5)`,
          [newId('aud'), orgId, req.auth!.userId, targetUserId, JSON.stringify({ email, role })]
        );
      });

      res.status(201).json({ message: 'Member added successfully', userId: targetUserId, email, role });
    } catch (err: any) {
      if (err?.code === '23505' || String(err?.message).includes('duplicate key')) {
        res.status(409).json({ error: 'User is already a member of this organization' });
        return;
      }
      res.status(500).json({ error: 'Failed to add member' });
    }
  }
}
