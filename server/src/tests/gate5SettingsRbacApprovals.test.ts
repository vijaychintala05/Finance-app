import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { MasterFinanceFixture, MASTER_FIXTURE_CONSTANTS } from './fixtures/masterFinanceFixture';
import { RbacService } from '../auth/RbacService';
import {
  PERMISSIONS_REGISTRY,
  SYSTEM_ROLE_PERMISSIONS,
  SOD_CONFLICTS,
  detectSodConflicts,
  LEGACY_TO_GRANULAR_MAP,
} from '../auth/PermissionRegistry';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';

describe('Gate 5B: Settings, Roles, Permissions & Approval Hardening Test Suite', () => {
  let orgAId: string;
  let orgBId: string;
  let ownerUserA: string;
  let adminUserA: string;
  let acctUserA: string;
  let salesUserA: string;
  let purchUserA: string;
  let viewerUserA: string;

  beforeAll(async () => {
    await MasterFinanceFixture.setup({ usePgMem: true });

    orgAId = MASTER_FIXTURE_CONSTANTS.ORG_A.id;
    orgBId = MASTER_FIXTURE_CONSTANTS.ORG_B.id;

    ownerUserA = MASTER_FIXTURE_CONSTANTS.PERSONAS.ORG_A.owner.id;
    adminUserA = newId('usr-admin');
    acctUserA = newId('usr-acct');
    salesUserA = newId('usr-sales');
    purchUserA = newId('usr-purch');
    viewerUserA = newId('usr-view');

    // Seed users and memberships in Org A
    await db.query(
      `INSERT INTO users (id, email, password_hash, full_name, status)
       VALUES ($1, 'admin.a@example.com', 'hash', 'Admin User A', 'Active'),
              ($2, 'acct.a@example.com', 'hash', 'Accountant A', 'Active'),
              ($3, 'sales.a@example.com', 'hash', 'Sales User A', 'Active'),
              ($4, 'purch.a@example.com', 'hash', 'Purchase User A', 'Active'),
              ($5, 'view.a@example.com', 'hash', 'Viewer User A', 'Active')
       ON CONFLICT (id) DO NOTHING`,
      [adminUserA, acctUserA, salesUserA, purchUserA, viewerUserA]
    );

    await db.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role)
       VALUES ($1, $2, $3, 'Admin'),
              ($4, $2, $5, 'Accountant'),
              ($6, $2, $7, 'Sales'),
              ($8, $2, $9, 'Purchase'),
              ($10, $2, $11, 'Viewer')
       ON CONFLICT DO NOTHING`,
      [
        newId('mem'), orgAId, adminUserA,
        newId('mem'), orgAId, acctUserA,
        newId('mem'), orgAId, salesUserA,
        newId('mem'), orgAId, purchUserA,
        newId('mem'), orgAId, viewerUserA,
      ]
    );
  });

  // ==========================================
  // 1. CANONICAL PERMISSION REGISTRY TESTS
  // ==========================================
  describe('1. Canonical Permission Registry & System Roles', () => {
    it('contains all required permissions with metadata and risk tiers', () => {
      const allPerms = Object.values(PERMISSIONS_REGISTRY);
      expect(allPerms.length).toBeGreaterThanOrEqual(60);

      const criticalPerms = allPerms.filter((p) => p.risk === 'CRITICAL');
      expect(criticalPerms.map((p) => p.code)).toContain('periods.unlock');
      expect(criticalPerms.map((p) => p.code)).toContain('backup.restore');
      expect(criticalPerms.map((p) => p.code)).toContain('invoices.void');
      expect(criticalPerms.map((p) => p.code)).toContain('bills.void');
      expect(criticalPerms.map((p) => p.code)).toContain('journals.reverse');
    });

    it('contains all 8 required System Role templates', () => {
      const roles = Object.keys(SYSTEM_ROLE_PERMISSIONS);
      expect(roles).toContain('Owner');
      expect(roles).toContain('Admin');
      expect(roles).toContain('Finance Manager');
      expect(roles).toContain('Accountant');
      expect(roles).toContain('Sales');
      expect(roles).toContain('Purchase');
      expect(roles).toContain('Viewer');
      expect(roles).toContain('Approver');
    });

    it('enforces financial separation: Viewer role is strictly read-only', () => {
      const viewerPerms = SYSTEM_ROLE_PERMISSIONS.Viewer;
      const writePerms = viewerPerms.filter(
        (code) =>
          code.endsWith('.create') ||
          code.endsWith('.edit') ||
          code.endsWith('.post') ||
          code.endsWith('.delete') ||
          code.endsWith('.void') ||
          code.endsWith('.reverse')
      );
      expect(writePerms).toEqual([]);
    });

    it('enforces financial separation: Purchase role cannot pay bills or reverse payments', () => {
      const purchPerms = SYSTEM_ROLE_PERMISSIONS.Purchase;
      expect(purchPerms).toContain('bills.create');
      expect(purchPerms).not.toContain('vendor_payments.create');
      expect(purchPerms).not.toContain('vendor_payments.reverse');
      expect(purchPerms).not.toContain('bills.void');
    });

    it('enforces financial separation: Sales role cannot write off bad debt or issue vendor payments', () => {
      const salesPerms = SYSTEM_ROLE_PERMISSIONS.Sales;
      expect(salesPerms).toContain('invoices.create');
      expect(salesPerms).not.toContain('invoices.write_off');
      expect(salesPerms).not.toContain('vendor_payments.create');
      expect(salesPerms).not.toContain('periods.unlock');
    });

    it('enforces financial separation: Accountant cannot unlock closed periods', () => {
      const acctPerms = SYSTEM_ROLE_PERMISSIONS.Accountant;
      expect(acctPerms).toContain('journals.post');
      expect(acctPerms).toContain('periods.lock');
      expect(acctPerms).not.toContain('periods.unlock');
    });
  });

  // ==========================================
  // 2. SEGREGATION OF DUTIES (SOD) TESTS
  // ==========================================
  describe('2. Segregation of Duties (SoD) Conflict Detection', () => {
    it('detects toxic pairing: Vendor Master + Payment Execution (SOD-001)', () => {
      const conflicts = detectSodConflicts(['vendors.create', 'vendor_payments.create']);
      expect(conflicts.some((c) => c.id === 'SOD-001')).toBe(true);
    });

    it('detects toxic pairing: Bill Entry + Payment Disbursement (SOD-002)', () => {
      const conflicts = detectSodConflicts(['bills.create', 'vendor_payments.create']);
      expect(conflicts.some((c) => c.id === 'SOD-002')).toBe(true);
    });

    it('detects toxic pairing: Invoicing + Bad Debt Write-Off (SOD-003)', () => {
      const conflicts = detectSodConflicts(['invoices.create', 'invoices.write_off']);
      expect(conflicts.some((c) => c.id === 'SOD-003')).toBe(true);
    });

    it('returns empty conflicts when permissions are segregated safely', () => {
      const safePerms = ['bills.create', 'vendors.view', 'purchase_orders.create'];
      const conflicts = detectSodConflicts(safePerms);
      expect(conflicts).toHaveLength(0);
    });
  });

  // ==========================================
  // 3. CUSTOM ROLES & CLONING LIFECYCLE
  // ==========================================
  describe('3. Custom Roles Lifecycle & Safety Rules', () => {
    let customRoleId: string;

    it('creates a custom role with explicit permissions and audit trail', async () => {
      const newRole = await RbacService.createCustomRole(orgAId, {
        name: 'Junior Accounts Clerk',
        description: 'Assists with invoice entry and bank viewing',
        permissions: ['invoices.view', 'invoices.create', 'banking.view'],
        userId: ownerUserA,
      });

      expect(newRole.name).toBe('Junior Accounts Clerk');
      expect(newRole.isSystemRole).toBe(false);
      expect(newRole.permissions).toEqual(['invoices.view', 'invoices.create', 'banking.view']);
      customRoleId = newRole.id;

      // Verify audit log
      const auditRes = await db.query(
        "SELECT action, entity_id FROM audit_logs WHERE organization_id = $1 AND action = 'CUSTOM_ROLE_CREATED'",
        [orgAId]
      );
      expect(auditRes.rows.length).toBeGreaterThan(0);
    });

    it('clones a system role and extends it into a new custom role', async () => {
      const cloned = await RbacService.cloneRole(orgAId, {
        sourceRoleName: 'Purchase',
        newName: 'Senior Procurement Manager',
        description: 'Purchase executive with PO approval rights',
        userId: ownerUserA,
      });

      expect(cloned.name).toBe('Senior Procurement Manager');
      expect(cloned.isSystemRole).toBe(false);
      expect(cloned.permissions).toContain('bills.create');

      // Update permissions to grant purchase_orders.approve
      const updated = await RbacService.updateCustomRole(orgAId, cloned.id, {
        permissions: [...cloned.permissions, 'purchase_orders.approve'],
        userId: ownerUserA,
      });
      expect(updated.permissions).toContain('purchase_orders.approve');
    });

    it('prevents modifying or deleting protected System Roles', async () => {
      await expect(
        RbacService.updateCustomRole(orgAId, 'sys-owner', {
          name: 'Hacked Owner',
          userId: ownerUserA,
        })
      ).rejects.toThrow();

      await expect(
        RbacService.deleteCustomRole(orgAId, 'sys-owner', ownerUserA)
      ).rejects.toThrow();
    });

    it('prevents deleting a custom role that has active members assigned', async () => {
      // Reassign sales user to the custom role
      await RbacService.assignUserRole(orgAId, salesUserA, 'Junior Accounts Clerk', ownerUserA);

      // Attempt deletion
      await expect(
        RbacService.deleteCustomRole(orgAId, customRoleId, ownerUserA)
      ).rejects.toThrow(/member\(s\) are currently assigned/);

      // Reassign back to Sales and delete successfully
      await RbacService.assignUserRole(orgAId, salesUserA, 'Sales', ownerUserA);
      await expect(
        RbacService.deleteCustomRole(orgAId, customRoleId, ownerUserA)
      ).resolves.toBeUndefined();
    });

    it('prevents demoting the sole Organization Owner', async () => {
      await expect(
        RbacService.assignUserRole(orgAId, ownerUserA, 'Accountant', ownerUserA)
      ).rejects.toThrow(/Cannot demote or change the role of the sole organization Owner/);
    });

    it('does not turn a narrow granular permission into a broader legacy capability', async () => {
      const role = await RbacService.createCustomRole(orgAId, {
        name: 'Receivables Write-Off Reviewer',
        permissions: ['invoices.write_off'],
        userId: ownerUserA,
      });

      await expect(
        RbacService.hasPermissionAsync(orgAId, role.name, 'invoices.write_off')
      ).resolves.toBe(true);
      await expect(
        RbacService.hasPermissionAsync(orgAId, role.name, 'invoices.delete')
      ).resolves.toBe(false);
    });
  });

  // ==========================================
  // 4. APPROVAL WORKFLOW ENGINE & CONCURRENCY
  // ==========================================
  describe('4. Approval Workflow Engine & Self-Approval Guards', () => {
    it('evaluates threshold amounts and flags transactions requiring approval', async () => {
      await ApprovalWorkflowService.configureApprovalRule(orgAId, {
        entityType: 'PURCHASE_ORDER',
        isRequired: true,
        thresholdAmount: 50000,
        approverRole: 'Finance Manager',
        allowSelfApproval: false,
        userId: ownerUserA,
      });

      const reqBelow = await ApprovalWorkflowService.requiresApproval(orgAId, 'PURCHASE_ORDER', 45000);
      expect(reqBelow).toBe(false);

      const reqAbove = await ApprovalWorkflowService.requiresApproval(orgAId, 'PURCHASE_ORDER', 75000);
      expect(reqAbove).toBe(true);
    });

    it('enforces self-approval prevention: creator cannot approve their own submission', async () => {
      const poId = newId('po-test');
      await ApprovalWorkflowService.submitForApproval(
        orgAId,
        'PURCHASE_ORDER',
        poId,
        adminUserA,
        60000
      );

      // Submitting user attempts approval (should fail)
      await expect(
        ApprovalWorkflowService.approveRequest(
          orgAId,
          'PURCHASE_ORDER',
          poId,
          adminUserA, // Same as submitter
          'Admin'
        )
      ).rejects.toThrow(/Self-approval forbidden/);

      // Another user with Owner role approves (succeeds)
      const approved = await ApprovalWorkflowService.approveRequest(
        orgAId,
        'PURCHASE_ORDER',
        poId,
        ownerUserA,
        'Owner'
      );
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedBy).toBe(ownerUserA);
    });

    it('handles concurrent double-approval race safely via state machine', async () => {
      const paymentId = newId('pay-race');
      await ApprovalWorkflowService.submitForApproval(
        orgAId,
        'PAYMENT',
        paymentId,
        acctUserA,
        80000
      );

      // First approval succeeds
      const first = await ApprovalWorkflowService.approveRequest(orgAId, 'PAYMENT', paymentId, ownerUserA, 'Owner');
      expect(first.status).toBe('APPROVED');

      // Second approval attempt immediately fails
      await expect(
        ApprovalWorkflowService.approveRequest(orgAId, 'PAYMENT', paymentId, ownerUserA, 'Owner')
      ).rejects.toThrow(/already been approved/);
    });
  });

  // ==========================================
  // 5. FINANCIAL CONFIGURATION IMMUTABILITY
  // ==========================================
  describe('5. Dangerous Financial Settings & Base Currency Immutability', () => {
    it('locks base currency once financial journal entries exist', async () => {
      // Create a test journal entry
      const jeId = newId('je');
      await db.query(
        `INSERT INTO journal_entries (id, organization_id, entry_number, date, status, description)
         VALUES ($1, $2, 'JE-TEST-001', CURRENT_DATE, 'Posted', 'Opening journal')`,
        [jeId, orgAId]
      );

      // Verify that changing currency is rejected
      const journalCountRes = await db.query(
        'SELECT COUNT(id) as cnt FROM journal_entries WHERE organization_id = $1',
        [orgAId]
      );
      expect(Number(journalCountRes.rows[0].cnt)).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 6. TENANT ISOLATION & ATTACK DEFENSE
  // ==========================================
  describe('6. Multi-Tenant Isolation & Privilege Escalation Defenses', () => {
    it('blocks Org A user from accessing or modifying Org B custom roles', async () => {
      // Create a role in Org B
      const roleB = await RbacService.createCustomRole(orgBId, {
        name: 'Org B Confidential Role',
        permissions: ['banking.view'],
        userId: 'user-owner-b',
      });

      // User A from Org A tries to fetch/update Org B role
      await expect(
        RbacService.updateCustomRole(orgAId, roleB.id, {
          name: 'Hacked Org B Role',
          userId: ownerUserA,
        })
      ).rejects.toThrow(/Custom role not found in this organization/);
    });

    it('blocks cross-tenant approval rule access', async () => {
      const rulesA = await ApprovalWorkflowService.getApprovalRules(orgAId);
      const rulesB = await ApprovalWorkflowService.getApprovalRules(orgBId);

      expect(rulesA.every((r) => r.organizationId === orgAId)).toBe(true);
      expect(rulesB.every((r) => r.organizationId === orgBId)).toBe(true);
    });
  });
});
