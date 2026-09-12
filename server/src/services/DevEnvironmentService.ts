import crypto from 'crypto';
import { db } from '../database/db';
import { JwtAuth } from '../auth/jwt';
import { SessionService } from '../auth/SessionService';
import { OrganizationProvisioningService } from './OrganizationProvisioningService';
import { newId } from '../utils/ids';
import { SalesEngine } from '../sales/SalesEngine';

export interface DevUserPersona {
  id: string;
  email: string;
  fullName: string;
  role: 'Owner' | 'Admin' | 'Accountant' | 'Viewer';
}

export const DEV_ORG_ID = 'org-dev-test';
export const DEV_ORG_NAME = 'FirmBooks Demo Enterprise';

export const DEV_PERSONAS: Record<string, DevUserPersona> = {
  Owner: {
    id: 'usr-dev-admin',
    email: 'dev@firmbooks.local',
    fullName: 'Developer Admin',
    role: 'Owner',
  },
  Admin: {
    id: 'usr-dev-admin',
    email: 'dev@firmbooks.local',
    fullName: 'Developer Admin',
    role: 'Owner',
  },
  Accountant: {
    id: 'usr-dev-accountant',
    email: 'accountant@firmbooks.local',
    fullName: 'Dev Senior Accountant',
    role: 'Accountant',
  },
  Viewer: {
    id: 'usr-dev-viewer',
    email: 'viewer@firmbooks.local',
    fullName: 'Dev Compliance Auditor',
    role: 'Viewer',
  },
};

export class DevEnvironmentService {
  public static isDevAllowed(): boolean {
    return process.env.NODE_ENV !== 'production';
  }

  public static async ensureDevEnvironment(): Promise<void> {
    if (!this.isDevAllowed()) {
      return;
    }

    try {
      // 1. Ensure Dev Users Exist
      for (const persona of Object.values(DEV_PERSONAS)) {
        const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [persona.email]);
        if (existingUser.rows.length === 0) {
          await db.query(
            `INSERT INTO users (id, email, password_hash, full_name, status)
             VALUES ($1, $2, 'dev-local-hash', $3, 'Active')
             ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, status = 'Active'`,
            [persona.id, persona.email, persona.fullName]
          );
        }
      }

      // 2. Ensure Dev Organization Exists
      const existingOrg = await db.query('SELECT id FROM organizations WHERE id = $1', [DEV_ORG_ID]);
      if (existingOrg.rows.length === 0) {
        await db.query(
          `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, industry, country, base_currency, currency_symbol, owner_user_id, status)
           VALUES ($1, $2, $3, $4, $5, 'Technology & Professional Services', 'United States', 'USD', '$', $6, 'Active')
           ON CONFLICT (id) DO NOTHING`,
          [
            DEV_ORG_ID,
            'uuid-dev-test-enterprise',
            'PUB-DEV-TEST',
            'DEVTEST',
            DEV_ORG_NAME,
            DEV_PERSONAS.Owner.id,
          ]
        );
      }

      // 3. Ensure Organization Memberships
      for (const persona of [DEV_PERSONAS.Owner, DEV_PERSONAS.Accountant, DEV_PERSONAS.Viewer]) {
        const existingMem = await db.query(
          'SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
          [DEV_ORG_ID, persona.id]
        );
        if (existingMem.rows.length === 0) {
          await db.query(
            `INSERT INTO organization_members (id, organization_id, user_id, role, status)
             VALUES ($1, $2, $3, $4, 'Active')
             ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = 'Active'`,
            [`mem-${persona.id}-${DEV_ORG_ID}`, DEV_ORG_ID, persona.id, persona.role]
          );
        }
      }

      // 4. Ensure Organization Profile
      await db.query(
        `INSERT INTO organization_profiles (organization_id, legal_name, trade_name, address_line1, city, state, postal_code, country, email, fiscal_year_start, default_payment_terms, invoice_prefix)
         VALUES ($1, $2, 'FirmBooks Demo', '100 Silicon Ave, Suite 400', 'San Francisco', 'CA', '94107', 'United States', 'demo@firmbooks.local', 'January', 'Net 30', 'INV-')
         ON CONFLICT (organization_id) DO NOTHING`,
        [DEV_ORG_ID, DEV_ORG_NAME]
      );

      // 5. Provision Default Chart of Accounts
      await OrganizationProvisioningService.provisionDefaultChart(db, DEV_ORG_ID);

      // 6. Seed Realistic Demo Data
      await this.seedDemoData();
    } catch (err) {
      console.error('[DevEnvironmentService] Error ensuring dev environment:', err);
    }
  }

  public static async seedDemoData(): Promise<void> {
    if (!this.isDevAllowed()) {
      return;
    }

    // A. Seed Customers / Clients
    const customers = [
      { id: 'cust-dev-acme', name: 'Acme Global Technologies Inc.', email: 'billing@acmeglobal.com' },
      { id: 'cust-dev-starlight', name: 'Starlight Digital Media LLC', email: 'ap@starlightmedia.io' },
      { id: 'cust-dev-apex', name: 'Apex Logistics & Freight Corp', email: 'finance@apexlogistics.com' },
    ];

    for (const cust of customers) {
      await db.query(
        `INSERT INTO customers (id, organization_id, customer_id, display_name, legal_name, email, place_of_supply, gst_status, currency, receivables_balance, unused_credits)
         VALUES ($1, $2, $1, $3, $3, $4, 'CA', 'Unregistered', 'USD', 0.00, 0.00)
         ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email`,
        [cust.id, DEV_ORG_ID, cust.name, cust.email]
      );

      await db.query(
        `INSERT INTO clients (id, organization_id, name, company_name, email, currency)
         VALUES ($1, $2, $3, $3, $4, 'USD')
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
        [cust.id, DEV_ORG_ID, cust.name, cust.email]
      );
    }

    // B. Seed Vendors
    const vendors = [
      { id: 'vend-dev-aws', name: 'Amazon Web Services (AWS)', email: 'aws-receivables@amazon.com' },
      { id: 'vend-dev-wework', name: 'WeWork Global Workspaces', email: 'billing@wework.com' },
      { id: 'vend-dev-dell', name: 'Dell Technologies Inc.', email: 'commercial@dell.com' },
    ];

    for (const vend of vendors) {
      await db.query(
        `INSERT INTO vendors (id, organization_id, name, company_name, email, currency, payables_balance, advance_balance, unused_credits)
         VALUES ($1, $2, $3, $3, $4, 'USD', 0.00, 0.00, 0.00)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email`,
        [vend.id, DEV_ORG_ID, vend.name, vend.email]
      );
    }

    // C. Seed Bank Accounts
    const operatingAccountRes = await db.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1000' LIMIT 1`,
      [DEV_ORG_ID]
    );
    const ledgerBankId = operatingAccountRes.rows[0]?.id;

    if (ledgerBankId) {
      const bankAccounts = [
        {
          id: 'bnk-dev-svb',
          accountName: 'Silicon Valley Operating Checking',
          accountNumber: '****4920',
          bankName: 'Silicon Valley Bank',
          currentBalance: 148500.00,
        },
        {
          id: 'bnk-dev-chase',
          accountName: 'Chase Treasury Liquidity Reserve',
          accountNumber: '****8102',
          bankName: 'JPMorgan Chase',
          currentBalance: 320000.00,
        },
      ];

      for (const bnk of bankAccounts) {
        await db.query(
          `INSERT INTO bank_accounts (id, organization_id, ledger_account_id, account_name, account_number, bank_name, current_balance, status, is_active, currency)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Active', true, 'USD')
           ON CONFLICT (id) DO UPDATE SET current_balance = EXCLUDED.current_balance, is_active = true`,
          [bnk.id, DEV_ORG_ID, ledgerBankId, bnk.accountName, bnk.accountNumber, bnk.bankName, bnk.currentBalance]
        );
      }
    }

    // D. Seed Projects
    const projects = [
      { id: 'prj-dev-cloud', code: 'PRJ-101', name: 'Enterprise Cloud Migration & AI Setup', clientId: 'cust-dev-acme', budget: 85000, rate: 175 },
      { id: 'prj-dev-brand', code: 'PRJ-102', name: 'Global Brand Identity & UI Overhaul', clientId: 'cust-dev-starlight', budget: 45000, rate: 150 },
    ];

    for (const prj of projects) {
      await db.query(
        `INSERT INTO projects (id, organization_id, code, name, client_id, client_name, total_budget, hourly_rate, status)
         VALUES ($1, $2, $3, $4, $5, 'Client', $6, $7, 'Active')
         ON CONFLICT (id) DO UPDATE SET total_budget = EXCLUDED.total_budget, status = 'Active'`,
        [prj.id, DEV_ORG_ID, prj.code, prj.name, prj.clientId, prj.budget, prj.rate]
      );
    }

    // E. Seed Invoices (check if invoices already exist to prevent excessive duplicate insertion)
    const existingInvoices = await db.query(
      `SELECT count(*) as count FROM invoices WHERE organization_id = $1`,
      [DEV_ORG_ID]
    );

    if (Number(existingInvoices.rows[0]?.count || 0) === 0) {
      try {
        // Invoice 1: Paid Invoice
        await SalesEngine.createAndPostInvoice(DEV_ORG_ID, {
          customerId: 'cust-dev-acme',
          customerName: 'Acme Global Technologies Inc.',
          issueDate: new Date(Date.now() - 25 * 86400000).toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
          status: 'POSTED',
          lineItems: [
            {
              description: 'Phase 1: Architecture & Cloud Infrastructure Migration',
              quantity: 1,
              unitPrice: 15000,
              taxRate: 0,
              amount: 15000,
            },
            {
              description: 'Dedicated DevOps Engineering (40 Hours)',
              quantity: 40,
              unitPrice: 175,
              taxRate: 0,
              amount: 7000,
            },
          ],
          discount: 0,
          roundOff: 0,
          notes: 'Thank you for your business. Net 30 terms.',
        });

        // Invoice 2: Open / Sent Invoice
        await SalesEngine.createAndPostInvoice(DEV_ORG_ID, {
          customerId: 'cust-dev-starlight',
          customerName: 'Starlight Digital Media LLC',
          issueDate: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0],
          status: 'POSTED',
          lineItems: [
            {
              description: 'UI/UX Interactive Prototyping & Design Tokens',
              quantity: 1,
              unitPrice: 8500,
              taxRate: 0,
              amount: 8500,
            },
          ],
          discount: 0,
          roundOff: 0,
          notes: 'Please remit payment to Silicon Valley Bank checking account.',
        });
      } catch (invoiceErr) {
        console.warn('[DevEnvironmentService] Standard invoice seeding notice:', invoiceErr);
      }
    }
  }

  public static async devLogin(roleName: string = 'Owner'): Promise<{
    user: { id: string; email: string; fullName: string };
    organizationId: string;
    token: string;
    sessionId: string;
    sessionToken: string;
  }> {
    if (!this.isDevAllowed()) {
      throw new Error('DEV_AUTH_NOT_ALLOWED: Dev login is strictly prohibited in production.');
    }

    await this.ensureDevEnvironment();

    const persona = DEV_PERSONAS[roleName] || DEV_PERSONAS.Owner;
    const session = await SessionService.createSession(persona.id, {
      ipAddress: '127.0.0.1',
      userAgent: 'FirmBooks Local Dev Environment (Zero-Auth)',
    });

    const token = JwtAuth.generateToken({ userId: persona.id, email: persona.email });

    return {
      user: {
        id: persona.id,
        email: persona.email,
        fullName: persona.fullName,
      },
      organizationId: DEV_ORG_ID,
      token,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
    };
  }
}
