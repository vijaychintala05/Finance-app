import { Response } from 'express';
import { db } from '../database/db';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import crypto from 'crypto';
import { newId } from '../utils/ids';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';
import { RbacService, UserRole } from '../auth/RbacService';
import { normalizeSupportedBaseCurrency } from '../utils/currency';

export class OrganizationController {
  public static async getCurrent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId || req.auth?.organizationId;
      if (!orgId) {
        res.status(401).json({ error: 'Unauthorized: No active organization context' });
        return;
      }

      const orgRes = await db.query(
        `SELECT id, uuid, public_org_id as "publicOrgId", org_code as "orgCode", name, industry, country,
                base_currency as "baseCurrency", currency_symbol as "currencySymbol", owner_user_id as "ownerUserId",
                status, created_at as "createdAt"
         FROM organizations
         WHERE id = $1`,
        [orgId]
      );

      if (orgRes.rows.length === 0) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }

      const profileRes = await db.query(
        `SELECT legal_name as "legalName", trade_name as "tradeName", tax_id as "taxId", gstin, pan,
                address_line1 as "addressLine1", address_line2 as "addressLine2", city, state, postal_code as "postalCode",
                country, phone, email, website, fiscal_year_start as "fiscalYearStart",
                default_payment_terms as "defaultPaymentTerms", invoice_prefix as "invoicePrefix",
                estimate_prefix as "estimatePrefix", po_prefix as "poPrefix", bill_prefix as "billPrefix",
                logo_url as "logoUrl", invoice_notes as "invoiceNotes", bank_name as "bankName",
                bank_account_number as "bankAccountNumber", bank_ifsc_swift as "bankIfscSwift",
                updated_at as "updatedAt"
         FROM organization_profiles
         WHERE organization_id = $1`,
        [orgId]
      );

      const org = orgRes.rows[0];
      const profile = profileRes.rows[0] || {};

      res.json({
        ...org,
        profile: {
          legalName: profile.legalName || org.name,
          tradeName: profile.tradeName || org.name,
          taxId: profile.taxId || '',
          gstin: profile.gstin || '',
          pan: profile.pan || '',
          addressLine1: profile.addressLine1 || '',
          addressLine2: profile.addressLine2 || '',
          city: profile.city || '',
          state: profile.state || '',
          postalCode: profile.postalCode || '',
          country: profile.country || org.country,
          phone: profile.phone || '',
          email: profile.email || '',
          website: profile.website || '',
          fiscalYearStart: profile.fiscalYearStart || 'April',
          defaultPaymentTerms: profile.defaultPaymentTerms || 'Net 30',
          invoicePrefix: profile.invoicePrefix || 'INV-',
          estimatePrefix: profile.estimatePrefix || 'EST-',
          poPrefix: profile.poPrefix || 'PO-',
          billPrefix: profile.billPrefix || 'BILL-',
          logoUrl: profile.logoUrl || '',
          invoiceNotes: profile.invoiceNotes || '',
          bankName: profile.bankName || '',
          bankAccountNumber: profile.bankAccountNumber || '',
          bankIfscSwift: profile.bankIfscSwift || '',
          updatedAt: profile.updatedAt || org.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch current organization details' });
    }
  }

  public static async updateCurrent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId || req.auth?.organizationId;
      const userId = req.auth?.userId || req.user?.userId;
      if (!orgId || !userId) {
        res.status(401).json({ error: 'Unauthorized: No active organization context' });
        return;
      }

      // Verify RBAC permissions (Owner or Admin)
      const memberRes = await db.query(
        'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
        [orgId, userId]
      );
      if (memberRes.rows.length === 0 || !['Owner', 'Admin'].includes(memberRes.rows[0].role)) {
        res.status(403).json({ error: 'Forbidden: Only Organization Owners and Admins can update organization settings' });
        return;
      }

      const {
        name,
        industry,
        legalName,
        tradeName,
        taxId,
        gstin,
        pan,
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        country,
        phone,
        email,
        website,
        fiscalYearStart,
        defaultPaymentTerms,
        invoicePrefix,
        estimatePrefix,
        poPrefix,
        billPrefix,
        logoUrl,
        invoiceNotes,
        bankName,
        bankAccountNumber,
        bankIfscSwift,
      } = req.body || {};

      const trimmedName = typeof name === 'string' ? name.trim() : undefined;
      if (trimmedName !== undefined && (trimmedName.length < 2 || trimmedName.length > 120)) {
        res.status(400).json({ error: 'Organization name must be between 2 and 120 characters' });
        return;
      }

      await db.transaction(async (client) => {
        if (trimmedName !== undefined || industry !== undefined) {
          await client.query(
            `UPDATE organizations
             SET name = COALESCE($1, name),
                 industry = COALESCE($2, industry)
             WHERE id = $3`,
            [trimmedName || null, industry || null, orgId]
          );
        }

        await client.query(
          `INSERT INTO organization_profiles (
            organization_id, legal_name, trade_name, tax_id, gstin, pan,
            address_line1, address_line2, city, state, postal_code, country,
            phone, email, website, fiscal_year_start, default_payment_terms,
            invoice_prefix, estimate_prefix, po_prefix, bill_prefix,
            logo_url, invoice_notes, bank_name, bank_account_number, bank_ifsc_swift,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, CURRENT_TIMESTAMP
          )
          ON CONFLICT (organization_id) DO UPDATE SET
            legal_name = EXCLUDED.legal_name,
            trade_name = EXCLUDED.trade_name,
            tax_id = EXCLUDED.tax_id,
            gstin = EXCLUDED.gstin,
            pan = EXCLUDED.pan,
            address_line1 = EXCLUDED.address_line1,
            address_line2 = EXCLUDED.address_line2,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            postal_code = EXCLUDED.postal_code,
            country = EXCLUDED.country,
            phone = EXCLUDED.phone,
            email = EXCLUDED.email,
            website = EXCLUDED.website,
            fiscal_year_start = EXCLUDED.fiscal_year_start,
            default_payment_terms = EXCLUDED.default_payment_terms,
            invoice_prefix = EXCLUDED.invoice_prefix,
            estimate_prefix = EXCLUDED.estimate_prefix,
            po_prefix = EXCLUDED.po_prefix,
            bill_prefix = EXCLUDED.bill_prefix,
            logo_url = EXCLUDED.logo_url,
            invoice_notes = EXCLUDED.invoice_notes,
            bank_name = EXCLUDED.bank_name,
            bank_account_number = EXCLUDED.bank_account_number,
            bank_ifsc_swift = EXCLUDED.bank_ifsc_swift,
            updated_at = CURRENT_TIMESTAMP`,
          [
            orgId,
            legalName || null,
            tradeName || null,
            taxId || null,
            gstin || null,
            pan || null,
            addressLine1 || null,
            addressLine2 || null,
            city || null,
            state || null,
            postalCode || null,
            country || null,
            phone || null,
            email || null,
            website || null,
            fiscalYearStart || 'April',
            defaultPaymentTerms || 'Net 30',
            invoicePrefix || 'INV-',
            estimatePrefix || 'EST-',
            poPrefix || 'PO-',
            billPrefix || 'BILL-',
            logoUrl || null,
            invoiceNotes || null,
            bankName || null,
            bankAccountNumber || null,
            bankIfscSwift || null,
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
           VALUES ($1, $2, $3, 'ORGANIZATION_PROFILE_UPDATED', 'Organization', $2, $4)`,
          [
            newId('aud'),
            orgId,
            userId,
            JSON.stringify({
              name: trimmedName,
              legalName,
              taxId,
              gstin,
              pan,
              fiscalYearStart,
              defaultPaymentTerms,
            }),
          ]
        );
      });

      // Return updated record
      await OrganizationController.getCurrent(req, res);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update organization profile' });
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { name, industry, country, baseCurrency, currencySymbol } = req.body;
      if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const normalizedName = typeof name === 'string' ? name.trim() : '';
      const normalizedCurrency = normalizeSupportedBaseCurrency(baseCurrency);
      const normalizedCountry = typeof country === 'string' ? country.trim() : '';
      const normalizedCurrencySymbol = typeof currencySymbol === 'string' && currencySymbol.trim()
        ? currencySymbol.trim()
        : normalizedCurrency || '';
      if (normalizedName.length < 2 || normalizedName.length > 120 || normalizedCountry.length < 2 || normalizedCountry.length > 120 || !normalizedCurrency) {
        res.status(400).json({ error: 'Organization name, country, and a supported two-decimal base currency are required' });
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
