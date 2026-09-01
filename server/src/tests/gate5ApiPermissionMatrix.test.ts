import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { JwtAuth } from '../auth/jwt';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import financeRoutes from '../routes/finance.routes';
import securityRoutes from '../routes/security.routes';
import organizationRoutes from '../routes/organization.routes';
import { authMiddleware, organizationIsolationMiddleware } from '../middleware/organizationIsolation.middleware';
import { SecurityController } from '../controllers/securityController';

describe('Gate 5B: API Permission Matrix & Privilege Escalation Defense Tests', () => {
  let app: Express;
  let orgAId: string;
  let orgBId: string;

  let ownerTokenA: string;
  let adminTokenA: string;
  let acctTokenA: string;
  let salesTokenA: string;
  let purchTokenA: string;
  let viewerTokenA: string;
  let ownerTokenB: string;

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });

    orgAId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
    orgBId = MASTER_FIXTURE_CONSTANTS.ORG_B.id;

    const ownerUserA = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;
    const adminUserA = newId('usr-admin');
    const acctUserA = newId('usr-acct');
    const salesUserA = newId('usr-sales');
    const purchUserA = newId('usr-purch');
    const viewerUserA = newId('usr-view');
    const ownerUserB = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_B.owner.id;

    // Seed users
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'admin.a@example.com', 'hash', 'Admin A', 'Active'),
              ($2, 'acct.a@example.com', 'hash', 'Accountant A', 'Active'),
              ($3, 'sales.a@example.com', 'hash', 'Sales A', 'Active'),
              ($4, 'purch.a@example.com', 'hash', 'Purch A', 'Active'),
              ($5, 'view.a@example.com', 'hash', 'Viewer A', 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [adminUserA, acctUserA, salesUserA, purchUserA, viewerUserA]
    );

    // Seed organization memberships with unique SQL parameter placeholders
    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, 'Admin'),
              ($4, $5, $6, 'Accountant'),
              ($7, $8, $9, 'Sales'),
              ($10, $11, $12, 'Purchase'),
              ($13, $14, $15, 'Viewer')
       ON CONFLICT DO NOTHING`,
      [
        newId('mem'), orgAId, adminUserA,
        newId('mem'), orgAId, acctUserA,
        newId('mem'), orgAId, salesUserA,
        newId('mem'), orgAId, purchUserA,
        newId('mem'), orgAId, viewerUserA,
      ]
    );

    // Generate JWT tokens
    ownerTokenA = JwtAuth.generateToken({ userId: ownerUserA, email: 'owner@acme-test.com' });
    adminTokenA = JwtAuth.generateToken({ userId: adminUserA, email: 'admin.a@example.com' });
    acctTokenA = JwtAuth.generateToken({ userId: acctUserA, email: 'acct.a@example.com' });
    salesTokenA = JwtAuth.generateToken({ userId: salesUserA, email: 'sales.a@example.com' });
    purchTokenA = JwtAuth.generateToken({ userId: purchUserA, email: 'purch.a@example.com' });
    viewerTokenA = JwtAuth.generateToken({ userId: viewerUserA, email: 'view.a@example.com' });
    ownerTokenB = JwtAuth.generateToken({ userId: ownerUserB, email: 'owner@isolation-test.com' });

    // Build Express App
    app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(organizationIsolationMiddleware);
    app.use('/api/v1/finance', financeRoutes);
    app.use('/api/v1/security', securityRoutes);
    app.use('/organizations', organizationRoutes);
  });

  // ==========================================
  // 1. SALES PERMISSIONS DIRECT ENFORCEMENT
  // ==========================================
  describe('1. Sales Permissions Direct API Enforcement', () => {
    it('allows Sales user to create customers and quotes', async () => {
      const res = await request(app)
        .post('/api/v1/finance/customers')
        .set('Authorization', `Bearer ${salesTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          name: 'Acme Test Customer 1',
          email: 'cust1@example.com',
        });

      expect(res.status).toBe(201);
    });

    it('rejects Purchase user from creating sales invoices (403)', async () => {
      const res = await request(app)
        .post('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${purchTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          customerId: 'cust-1',
          lineItems: [],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/);
    });

    it('rejects Viewer from creating sales quotes or customers (403)', async () => {
      const res = await request(app)
        .post('/api/v1/finance/customers')
        .set('Authorization', `Bearer ${viewerTokenA}`)
        .set('x-organization-id', orgAId)
        .send({ name: 'Hacked Customer' });

      expect(res.status).toBe(403);
    });

    it('rejects Sales user from executing bad debt write-offs (403)', async () => {
      const res = await request(app)
        .post('/api/v1/finance/write-offs')
        .set('Authorization', `Bearer ${salesTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          invoiceId: 'inv-123',
          amount: 5000,
          reason: 'Uncollectible',
        });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 2. PURCHASES PERMISSIONS DIRECT ENFORCEMENT
  // ==========================================
  describe('2. Purchase Permissions Direct API Enforcement', () => {
    it('allows Purchase user to create suppliers and vendor bills', async () => {
      const res = await request(app)
        .post('/api/v1/finance/vendors')
        .set('Authorization', `Bearer ${purchTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          name: 'Standard Raw Materials Supplier',
          email: 'supplier@example.com',
        });

      expect(res.status).toBe(201);
    });

    it('rejects Purchase user from executing vendor disbursement payments (403)', async () => {
      const res = await request(app)
        .post('/api/v1/finance/vendor-payments')
        .set('Authorization', `Bearer ${purchTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          vendorId: 'vend-1',
          amount: 10000,
          paymentDate: '2026-05-01',
        });

      expect(res.status).toBe(403);
    });

    it('rejects Sales user from creating vendor bills (403)', async () => {
      const res = await request(app)
        .post('/api/v1/finance/bills')
        .set('Authorization', `Bearer ${salesTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          vendorId: 'vend-1',
          billNumber: 'BILL-001',
        });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 3. ACCOUNTING & GENERAL LEDGER PERMISSIONS
  // ==========================================
  describe('3. Accounting & Period Control Enforcement', () => {
    it('allows Accountant to post manual journal entries', async () => {
      const acc1 = `acc-${orgAId}-1000`;
      const acc2 = `acc-${orgAId}-4000`;

      const res = await request(app)
        .post('/api/v1/finance/journals')
        .set('Authorization', `Bearer ${acctTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          date: '2026-05-01',
          reference: 'ADJ-001',
          description: 'Office supplies adjustment',
          lines: [
            { accountId: acc1, debit: 500, credit: 0 },
            { accountId: acc2, debit: 0, credit: 500 },
          ],
        });

      expect(res.status).toBe(201);
    });

    it('rejects Accountant from reopening closed accounting periods (403 - Owner Only)', async () => {
      const res = await request(app)
        .post('/api/v1/finance/period-close/reopen')
        .set('Authorization', `Bearer ${acctTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          periodYear: 2026,
          periodMonth: 4,
          reason: 'Correction required',
        });

      expect(res.status).toBe(403);
    });

    it('rejects Admin from executing disaster recovery database restore (403 - Owner Only)', async () => {
      const res = await request(app)
        .post('/api/v1/security/restore')
        .set('Authorization', `Bearer ${adminTokenA}`)
        .set('x-organization-id', orgAId)
        .send({
          backupPayload: 'tampered-data',
        });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 4. CROSS-TENANT ISOLATION ATTACK DEFENSE
  // ==========================================
  describe('4. Cross-Tenant API Attack Defense', () => {
    it('rejects Org A user attempting to read Org B transactions (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${salesTokenA}`)
        .set('x-organization-id', orgBId); // Attack: User A targets Org B

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/);
    });

    it('rejects Org B Owner attempting to create custom role in Org A (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/security/roles')
        .set('Authorization', `Bearer ${ownerTokenB}`)
        .set('x-organization-id', orgAId)
        .send({
          name: 'Hacked Cross-Tenant Role',
          permissions: ['invoices.create'],
        });

      expect(res.status).toBe(403);
    });
  });

  describe('5. Custom Role Permission Resolution', () => {
    it('loads a newly assigned custom role from the organization database on API requests', async () => {
      const customRoleId = newId('role');
      const customUserId = newId('usr-custom');
      const customRoleName = `Receivables Reader ${customRoleId.slice(-6)}`;
      const customEmail = `${customUserId}@example.com`;

      await db.query(
        `INSERT INTO users (id, email, password_hash, full_name, status)
         VALUES ($1, $2, 'hash', 'Custom Role User', 'Active')`,
        [customUserId, customEmail]
      );
      await db.query(
        `INSERT INTO roles (id, organization_id, name, description, is_system_role)
         VALUES ($1, $2, $3, 'Can read receivables', FALSE)`,
        [customRoleId, orgAId, customRoleName]
      );
      await db.query(
        `INSERT INTO role_permissions (role_id, permission_code)
         VALUES ($1, 'invoices.view')`,
        [customRoleId]
      );
      await db.query(
        `INSERT INTO organization_members (id, organization_id, user_id, role)
         VALUES ($1, $2, $3, $4)`,
        [newId('mem'), orgAId, customUserId, customRoleName]
      );

      const customToken = JwtAuth.generateToken({ userId: customUserId, email: customEmail });
      const res = await request(app)
        .get('/api/v1/finance/invoices')
        .set('Authorization', `Bearer ${customToken}`)
        .set('x-organization-id', orgAId);

      expect(res.status).toBe(200);
    });
  });

  describe('6. Restore Payload Trust Boundary', () => {
    it('rejects a client-supplied restore payload instead of deleting data from untrusted input', async () => {
      const controllerApp = express();
      controllerApp.use(express.json());
      controllerApp.post('/restore', (req, res) => {
        (req as any).organizationId = orgAId;
        (req as any).auth = { userId: MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id, role: 'Owner' };
        return SecurityController.restoreBackup(req as any, res);
      });

      const res = await request(controllerApp)
        .post('/restore')
        .send({ backupPayload: { metadata: {}, data: {} } });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/backupId/);
    });
  });
});
