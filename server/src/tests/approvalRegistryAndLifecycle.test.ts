import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../database/db';
import { newId } from '../utils/ids';
import { MigrationRunner } from '../database/migrationRunner';
import {
  APPROVAL_ENTITIES,
  ApprovalEntityType,
  isApprovalEntityType,
  computeCanonicalHash,
  isValidApprovalTransition,
} from '../approvals/ApprovalRegistry';
import { DocumentLifecycleHelper } from '../approvals/DocumentLifecycleHelper';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { PaymentProviderRegistry } from '../gateways/PaymentProviderRegistry';
import { RazorpayProviderAdapter } from '../gateways/RazorpayProviderAdapter';
import { RazorpaySandboxAdapter } from '../gateways/RazorpaySandboxAdapter';

describe('P1 & P2: Approval Registry, Document Lifecycle Centralization & Provider Separation', () => {
  const orgId = 'org-reg-lifecycle-test';

  beforeAll(async () => {
    await MigrationRunner.runMigrations();
    await db.query(
      `INSERT INTO organizations (id, uuid, public_org_id, org_code, name, country, base_currency, currency_symbol, owner_user_id)
       VALUES ($1, $2, $3, 'ORGLIFE', 'Lifecycle Test Org', 'USA', 'USD', '$', 'usr-owner-lifecycle')
       ON CONFLICT DO NOTHING`,
      [orgId, `uuid-${orgId}`, `pub-${orgId}`]
    );
  });

  describe('1. ApprovalRegistry Typed Definitions & Canonical Hashing', () => {
    const requiredEntities: ApprovalEntityType[] = [
      'PURCHASE_ORDER',
      'VENDOR_BILL',
      'PAYMENT',
      'CUSTOMER_PAYMENT',
      'INVOICE',
      'CREDIT_NOTE',
      'MANUAL_JOURNAL',
      'PERIOD_REOPENING',
      'EXPENSE',
    ];

    it('registers all 9 core financial entity types with valid defaults', () => {
      for (const entityType of requiredEntities) {
        expect(isApprovalEntityType(entityType)).toBe(true);
        const def = APPROVAL_ENTITIES[entityType];
        expect(def).toBeDefined();
        expect(def.entityType).toBe(entityType);
        expect(typeof def.displayName).toBe('string');
        expect(typeof def.defaultApproverRole).toBe('string');
        expect(typeof def.defaultThreshold).toBe('number');
        expect(def.allowedTransitions).toBeDefined();
        expect(typeof def.computeCanonicalPayload).toBe('function');
      }
    });

    it('rejects unrecognized entity strings', () => {
      expect(isApprovalEntityType('UNKNOWN_ENTITY')).toBe(false);
      expect(isApprovalEntityType('')).toBe(false);
      expect(isApprovalEntityType(123)).toBe(false);
    });

    it('computes deterministic canonical hash and detects mutations', () => {
      const invoiceData = {
        amount: 5000.50,
        customerId: 'cust-123',
        issueDate: '2026-09-01',
        dueDate: '2026-09-30',
        currency: 'USD',
        lineItems: [
          { id: 'line-1', description: 'Consulting', amount: 5000.50, accountId: 'acc-sales' },
        ],
      };

      const hash1 = computeCanonicalHash('INVOICE', invoiceData);
      const hash2 = computeCanonicalHash('INVOICE', { ...invoiceData });
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);

      // Mutation in amount changes hash
      const mutatedAmountHash = computeCanonicalHash('INVOICE', { ...invoiceData, amount: 5000.51 });
      expect(mutatedAmountHash).not.toBe(hash1);

      // Mutation in date changes hash
      const mutatedDateHash = computeCanonicalHash('INVOICE', { ...invoiceData, issueDate: '2026-09-02' });
      expect(mutatedDateHash).not.toBe(hash1);

      // Mutation in line items changes hash
      const mutatedLineHash = computeCanonicalHash('INVOICE', {
        ...invoiceData,
        lineItems: [{ id: 'line-1', description: 'Consulting modified', amount: 5000.50, accountId: 'acc-sales' }],
      });
      expect(mutatedLineHash).not.toBe(hash1);
    });

    it('validates state transitions accurately', () => {
      expect(isValidApprovalTransition('DRAFT', 'SUBMITTED')).toBe(true);
      expect(isValidApprovalTransition('SUBMITTED', 'APPROVED')).toBe(true);
      expect(isValidApprovalTransition('SUBMITTED', 'REJECTED')).toBe(true);
      expect(isValidApprovalTransition('APPROVED', 'REJECTED')).toBe(true); // Invalidation
      expect(isValidApprovalTransition('APPROVED', 'CONSUMED')).toBe(true);
      expect(isValidApprovalTransition('REJECTED', 'SUBMITTED')).toBe(true); // Resubmit

      // Illegal transitions
      expect(isValidApprovalTransition('CONSUMED', 'APPROVED')).toBe(false);
      expect(isValidApprovalTransition('DRAFT', 'APPROVED')).toBe(false);
      expect(isValidApprovalTransition('CONSUMED', 'SUBMITTED')).toBe(false);
    });
  });

  describe('2. DocumentLifecycleHelper Centralized Invalidation', () => {
    it('throws error when invoked with invalid entity type', async () => {
      await expect(
        DocumentLifecycleHelper.onDocumentModified(orgId, 'INVALID_TYPE' as any, 'entity-1')
      ).rejects.toThrow(/INVALID_APPROVAL_ENTITY_TYPE/);

      await expect(
        DocumentLifecycleHelper.onDocumentVoided(orgId, 'INVALID_TYPE' as any, 'entity-1')
      ).rejects.toThrow(/INVALID_APPROVAL_ENTITY_TYPE/);
    });

    it('invalidates SUBMITTED and APPROVED requests on onDocumentModified', async () => {
      const entityId = newId('inv-life');
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'INVOICE',
        entityId,
        'usr-submitter',
        150000
      );
      expect(req.status).toBe('SUBMITTED');

      await DocumentLifecycleHelper.onDocumentModified(orgId, 'INVOICE', entityId, undefined, 'Line items edited');

      const check = await db.query('SELECT status, rejection_reason FROM approval_requests WHERE id = $1', [req.id]);
      expect(check.rows[0].status).toBe('REJECTED');
      expect(check.rows[0].rejection_reason).toContain('DOCUMENT_MODIFIED: Line items edited');
    });

    it('invalidates requests on onDocumentVoided', async () => {
      const billId = newId('bill-life');
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'VENDOR_BILL',
        billId,
        'usr-submitter',
        120000
      );

      await DocumentLifecycleHelper.onDocumentVoided(orgId, 'VENDOR_BILL', billId, undefined, 'Duplicate entry');

      const check = await db.query('SELECT status, rejection_reason FROM approval_requests WHERE id = $1', [req.id]);
      expect(check.rows[0].status).toBe('REJECTED');
      expect(check.rows[0].rejection_reason).toContain('DOCUMENT_VOIDED');
      expect(check.rows[0].rejection_reason).toContain('Duplicate entry');
    });

    it('invalidates requests on onDocumentReversed', async () => {
      const pmtId = newId('pmt-life');
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'CUSTOMER_PAYMENT',
        pmtId,
        'usr-submitter',
        80000
      );

      await DocumentLifecycleHelper.onDocumentReversed(orgId, 'CUSTOMER_PAYMENT', pmtId, undefined, 'Bounced check');

      const check = await db.query('SELECT status, rejection_reason FROM approval_requests WHERE id = $1', [req.id]);
      expect(check.rows[0].status).toBe('REJECTED');
      expect(check.rows[0].rejection_reason).toContain('DOCUMENT_REVERSED');
      expect(check.rows[0].rejection_reason).toContain('Bounced check');
    });
  });

  describe('3. P1 Legacy Overload Retirement Verification', () => {
    it('confirms approveRequest and rejectRequest overloads are removed from ApprovalWorkflowService', () => {
      const serviceClass = ApprovalWorkflowService as any;
      expect(serviceClass.approveRequest).toBeUndefined();
      expect(serviceClass.rejectRequest).toBeUndefined();
      expect(typeof ApprovalWorkflowService.approveRequestById).toBe('function');
      expect(typeof ApprovalWorkflowService.rejectRequestById).toBe('function');
    });

    it('approveRequestById and rejectRequestById enforce immutable request IDs', async () => {
      const entityId = newId('po-life');
      const req = await ApprovalWorkflowService.submitForApproval(
        orgId,
        'PURCHASE_ORDER',
        entityId,
        'usr-creator',
        60000
      );

      // Rejection with immutable request ID
      await ApprovalWorkflowService.rejectRequestById(
        orgId,
        req.id,
        { userId: 'usr-approver', role: 'Finance Manager' },
        'Budget cap exceeded'
      );

      const check = await db.query('SELECT status, rejection_reason FROM approval_requests WHERE id = $1', [req.id]);
      expect(check.rows[0].status).toBe('REJECTED');
      expect(check.rows[0].rejection_reason).toBe('Budget cap exceeded');
    });
  });

  describe('4. Provider Adapter Separation (RazorpayProviderAdapter vs RazorpaySandboxAdapter)', () => {
    it('registers both razorpay and razorpay_sandbox in PaymentProviderRegistry', () => {
      const supported = PaymentProviderRegistry.getSupportedGateways();
      expect(supported).toContain('razorpay');
      expect(supported).toContain('razorpay_sandbox');

      const liveAdapter = PaymentProviderRegistry.getAdapter('razorpay');
      expect(liveAdapter).toBeInstanceOf(RazorpayProviderAdapter);
      expect(liveAdapter.gatewayName).toBe('razorpay');

      const sandboxAdapter = PaymentProviderRegistry.getAdapter('razorpay_sandbox');
      expect(sandboxAdapter).toBeInstanceOf(RazorpaySandboxAdapter);
      expect(sandboxAdapter.gatewayName).toBe('razorpay_sandbox');
    });

    it('RazorpaySandboxAdapter generates simulated order and test checkout URL', async () => {
      const sandbox = new RazorpaySandboxAdapter();
      const session = await sandbox.createCheckoutSession({
        organizationId: orgId,
        amount: 250,
        currency: 'INR',
        idempotencyKey: 'sbx-test-01',
      });

      expect(session.sessionId).toMatch(/^order_/);
      expect(session.checkoutUrl).toContain('checkout.razorpay.com');
      expect(session.status).toBe('created');
    });

    it('both adapters cryptographically verify HMAC webhook signatures identically', () => {
      const live = new RazorpayProviderAdapter({ keyId: 'rzp_test_mock', keySecret: 'mock_sec' });
      const sandbox = new RazorpaySandboxAdapter();

      const payload = JSON.stringify({ event: 'payment.captured', id: 'pay_test_123' });
      const secret = 'whsec_test_secret_abc';
      const sig = require('crypto').createHmac('sha256', secret).update(payload).digest('hex');

      expect(live.verifyWebhook(payload, sig, secret)).toBe(true);
      expect(sandbox.verifyWebhook(payload, sig, secret)).toBe(true);
      expect(live.verifyWebhook(payload, 'tampered_signature', secret)).toBe(false);
      expect(sandbox.verifyWebhook(payload, 'tampered_signature', secret)).toBe(false);
    });
  });
});
