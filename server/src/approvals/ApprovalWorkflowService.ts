import crypto from 'crypto';
import { db } from '../database/db';
import { AuditTrailService } from '../security/AuditTrailService';
import { newId } from '../utils/ids';

import {
  ApprovalEntityType,
  ApprovalStatus,
  APPROVAL_ENTITIES,
  computeCanonicalHash,
  isValidApprovalTransition,
} from './ApprovalRegistry';

export type { ApprovalEntityType, ApprovalStatus };

export interface ApprovalRule {
  id: string;
  organizationId: string;
  entityType: ApprovalEntityType;
  isRequired: boolean;
  thresholdAmount?: number;
  approverRole: string;
  allowSelfApproval?: boolean;
}

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  submittedBy: string;
  submittedAt: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONSUMED';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  amount?: number;
  documentHash?: string;
  documentVersion?: number;
}

export interface ApproverActor {
  userId: string;
  role: string;
  membership?: any;
}

export class ApprovalWorkflowService {
  public static computeDocumentHash(entityType: ApprovalEntityType, data: any): string {
    return computeCanonicalHash(entityType, data);
  }

  public static async getApprovalRules(
    organizationId: string,
    transactionClient?: { query: (text: string, params?: any[]) => Promise<any> }
  ): Promise<ApprovalRule[]> {
    const q = transactionClient || db;
    const res = await q.query(
      'SELECT * FROM approval_rules WHERE organization_id = $1',
      [organizationId]
    );

    if (res.rows.length === 0) {
      return Object.values(APPROVAL_ENTITIES).map((def) => ({
        id: def.defaultRuleId,
        organizationId,
        entityType: def.entityType,
        isRequired: def.isRequiredByDefault,
        thresholdAmount: def.defaultThreshold,
        approverRole: def.defaultApproverRole,
        allowSelfApproval: def.allowSelfApproval,
      }));
    }

    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id || r.organizationId,
      entityType: r.entity_type || r.entityType,
      isRequired: Boolean(r.is_required ?? r.isRequired),
      thresholdAmount: r.threshold_amount ? Number(r.threshold_amount) : undefined,
      approverRole: r.approver_role || r.approverRole || 'Finance Manager',
      allowSelfApproval: Boolean(r.allow_self_approval ?? false),
    }));
  }

  public static async configureApprovalRule(
    organizationId: string,
    params: {
      entityType: ApprovalEntityType;
      isRequired: boolean;
      thresholdAmount?: number;
      approverRole?: string;
      allowSelfApproval?: boolean;
      userId: string;
    }
  ): Promise<ApprovalRule> {
    const existing = await db.query(
      'SELECT id FROM approval_rules WHERE organization_id = $1 AND entity_type = $2',
      [organizationId, params.entityType]
    );

    const ruleId = existing.rows.length > 0 ? existing.rows[0].id : newId('appr-rule');
    const role = params.approverRole || 'Finance Manager';
    const selfApprove = Boolean(params.allowSelfApproval ?? false);

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE approval_rules
            SET is_required = $1, threshold_amount = $2, approver_role = $3, allow_self_approval = $4
          WHERE id = $5 AND organization_id = $6`,
        [params.isRequired, params.thresholdAmount || null, role, selfApprove, ruleId, organizationId]
      );
    } else {
      await db.query(
        `INSERT INTO approval_rules (id, organization_id, entity_type, is_required, threshold_amount, approver_role, allow_self_approval)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [ruleId, organizationId, params.entityType, params.isRequired, params.thresholdAmount || null, role, selfApprove]
      );
    }

    await AuditTrailService.logAction({
      organizationId,
      userId: params.userId,
      action: 'APPROVAL_RULE_CONFIGURED',
      entityType: 'APPROVAL_RULE',
      entityId: ruleId,
      afterState: { ...params, approverRole: role, allowSelfApproval: selfApprove },
    });

    return {
      id: ruleId,
      organizationId,
      entityType: params.entityType,
      isRequired: params.isRequired,
      thresholdAmount: params.thresholdAmount,
      approverRole: role,
      allowSelfApproval: selfApprove,
    };
  }

  public static async requiresApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    amount?: number,
    transactionClient?: { query: (text: string, params?: any[]) => Promise<any> }
  ): Promise<boolean> {
    const rules = await this.getApprovalRules(organizationId, transactionClient);
    const rule = rules.find((r) => r.entityType === entityType);

    if (!rule || !rule.isRequired) {
      return false;
    }

    if (rule.thresholdAmount !== undefined && amount !== undefined) {
      return amount >= rule.thresholdAmount;
    }

    return true;
  }

  /**
   * Resolves and locks the canonical document row inside an active transaction.
   */
  public static async lockAndResolveEntity(
    client: { query: (text: string, params?: any[]) => Promise<any> },
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string
  ): Promise<{ id: string; amount: number; createdBy?: string; status?: string; currentHash?: string } | null> {
    switch (entityType) {
      case 'INVOICE': {
        const res = await client.query(
          `SELECT id, organization_id, total_amount, status, client_id, issue_date, due_date
             FROM invoices
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, entityId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const linesRes = await client.query(
          `SELECT id, description, amount, quantity, unit_price, account_id FROM invoice_items WHERE organization_id = $1 AND invoice_id = $2`,
          [organizationId, entityId]
        ).catch(() => ({ rows: [] }));
        const amount = Number(row.total_amount);
        const currentHash = this.computeDocumentHash('INVOICE', {
          ...row,
          amount,
          lineItems: linesRes.rows,
        });
        return { id: row.id, amount, status: row.status, currentHash };
      }
      case 'VENDOR_BILL': {
        const res = await client.query(
          `SELECT id, organization_id, total_amount, status, vendor_id, bill_date, due_date
             FROM bills
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, entityId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const linesRes = await client.query(
          `SELECT id, description, amount, quantity, unit_price, account_id FROM bill_items WHERE organization_id = $1 AND bill_id = $2`,
          [organizationId, entityId]
        ).catch(() => ({ rows: [] }));
        const amount = Number(row.total_amount);
        const currentHash = this.computeDocumentHash('VENDOR_BILL', {
          ...row,
          amount,
          lineItems: linesRes.rows,
        });
        return { id: row.id, amount, status: row.status, currentHash };
      }
      case 'MANUAL_JOURNAL': {
        const res = await client.query(
          `SELECT id, organization_id, entry_number, date, status, description
             FROM journal_entries
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, entityId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const linesRes = await client.query(
          `SELECT id, description, debit, credit, account_id FROM journal_lines WHERE journal_entry_id = $1`,
          [entityId]
        ).catch(() => ({ rows: [] }));
        const totalDebit = linesRes.rows.reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
        const currentHash = this.computeDocumentHash('MANUAL_JOURNAL', {
          ...row,
          totalDebit,
          lines: linesRes.rows,
        });
        return { id: row.id, amount: totalDebit, status: row.status, currentHash };
      }
      case 'CUSTOMER_PAYMENT': {
        const res = await client.query(
          `SELECT id, organization_id, amount, status, client_id, payment_date, created_at
             FROM payments_received
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, entityId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const amount = Number(row.amount);
        const currentHash = this.computeDocumentHash('CUSTOMER_PAYMENT', { ...row, amount });
        return { id: row.id, amount, status: row.status, currentHash };
      }
      case 'PAYMENT': {
        const res = await client.query(
          `SELECT id, organization_id, amount, status, vendor_id, payment_date, created_at
             FROM payments_made
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, entityId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const amount = Number(row.amount);
        const currentHash = this.computeDocumentHash('PAYMENT', { ...row, amount });
        return { id: row.id, amount, status: row.status, currentHash };
      }
      case 'EXPENSE': {
        const res = await client.query(
          `SELECT id, organization_id, amount, status, expense_account_id, paid_from_account_id, date, created_at
             FROM expenses
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, entityId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const amount = Number(row.amount);
        const currentHash = this.computeDocumentHash('EXPENSE', { ...row, amount });
        return { id: row.id, amount, status: row.status, currentHash };
      }
      case 'PURCHASE_ORDER': {
        const res = await client.query(
          `SELECT id, organization_id, total_amount, status, vendor_id, order_date
             FROM purchase_orders
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE`,
          [organizationId, entityId]
        );
        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const amount = Number(row.total_amount);
        const currentHash = this.computeDocumentHash('PURCHASE_ORDER', { ...row, amount });
        return { id: row.id, amount, status: row.status, currentHash };
      }
      default: {
        return { id: entityId, amount: 0 };
      }
    }
  }

  public static async submitForApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    submittedBy: string,
    amount?: number,
    transactionClient?: { query: (text: string, params?: any[]) => Promise<any> },
    documentPayloadOrHash?: any
  ): Promise<ApprovalRequest> {
    const q = transactionClient || db;
    const id = newId('req');
    const now = new Date().toISOString();

    let docHash = '';
    if (typeof documentPayloadOrHash === 'string' && documentPayloadOrHash.length === 64) {
      docHash = documentPayloadOrHash;
    } else if (documentPayloadOrHash && typeof documentPayloadOrHash === 'object') {
      docHash = this.computeDocumentHash(entityType, documentPayloadOrHash);
    } else {
      try {
        const ent = await this.lockAndResolveEntity(q, organizationId, entityType, entityId);
        docHash = ent?.currentHash || '';
      } catch {
        docHash = '';
      }
    }

    await q.query(
      `INSERT INTO approval_requests (
         id, organization_id, entity_type, entity_id, submitted_by, submitted_at, status, amount, document_hash, document_version
       ) VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED', $7, $8, 1)`,
      [id, organizationId, entityType, entityId, submittedBy, now, amount || null, docHash || null]
    );

    await q.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, timestamp, after_state)
       VALUES ($1, $2, $3, 'APPROVAL_REQUESTED', $4, $5, $6, $7)`,
      [newId('aud'), organizationId, submittedBy, entityType, entityId, now, JSON.stringify({ requestId: id, status: 'SUBMITTED', amount, documentHash: docHash })]
    );

    return {
      id,
      organizationId,
      entityType,
      entityId,
      submittedBy,
      submittedAt: now,
      status: 'SUBMITTED',
      amount,
      documentHash: docHash || undefined,
      documentVersion: 1,
    };
  }

  /**
   * Approves a request by its immutable approvalRequestId inside a single locked transaction.
   * Resolves the request, entity, organization, amount, document revision, and approver role.
   * Zero auto-creation of APPROVED requests. Strictly rejects unsubmitted requests.
   */
  public static async approveRequestById(
    organizationId: string,
    approvalRequestId: string,
    actor: ApproverActor
  ): Promise<ApprovalRequest> {
    const { userId: approvedBy, role: userRole } = actor;

    return await db.transaction(async (client) => {
      // 1. Lock approval request
      const reqRes = await client.query(
        `SELECT * FROM approval_requests
          WHERE organization_id = $1 AND id = $2
          FOR UPDATE`,
        [organizationId, approvalRequestId]
      );

      if (reqRes.rows.length === 0) {
        throw new Error('APPROVAL_REQUEST_NOT_FOUND: A submitted approval request is required before approval.');
      }
      const req = reqRes.rows[0];
      const currentStatus = req.status;

      if (currentStatus === 'APPROVED') {
        throw new Error('Approval request has already been approved.');
      }
      if (currentStatus === 'REJECTED') {
        throw new Error('Cannot approve a request that has already been rejected.');
      }
      if (currentStatus !== 'SUBMITTED') {
        throw new Error(`APPROVAL_REQUEST_NOT_SUBMITTED: Cannot approve request with status '${currentStatus}'.`);
      }

      // 2. Lock and inspect target entity (if present in document table)
      const entity = await this.lockAndResolveEntity(client, organizationId, req.entity_type, req.entity_id);

      // 3. Verify amount & document revision
      if (entity && req.amount !== null && req.amount !== undefined && entity.amount !== undefined) {
        if (Math.abs(Number(req.amount) - Number(entity.amount)) > 0.01) {
          throw new Error(`DOCUMENT_AMOUNT_ALTERED: Entity amount (${entity.amount}) does not match submitted approval request amount (${req.amount})`);
        }
      }

      // 4. Verify document payload hash
      if (entity && req.document_hash && entity.currentHash) {
        if (req.document_hash !== entity.currentHash) {
          throw new Error('DOCUMENT_ALTERED_SINCE_SUBMISSION: Document has been modified since approval request submission.');
        }
      }

      // 5. Lock and resolve configured approval rule
      const rules = await this.getApprovalRules(organizationId, client);
      const rule = rules.find((r) => r.entityType === req.entity_type);
      const requiredRole = rule?.approverRole || 'Finance Manager';
      const allowSelfApproval = rule?.allowSelfApproval ?? false;

      // 6. Verify role eligibility: approver must strictly hold the configured approver role
      if (userRole !== requiredRole) {
        throw new Error(
          `User with role '${userRole}' is not authorized to approve ${req.entity_type}. Required role: ${requiredRole}`
        );
      }

      // 7. Separation of duties / self-approval forbidden
      if (!allowSelfApproval && (req.submitted_by === approvedBy || (entity && entity.createdBy === approvedBy))) {
        throw new Error(
          `Self-approval forbidden: Submitting user '${approvedBy}' cannot approve their own ${req.entity_type}. Another qualified approver is required.`
        );
      }

      const now = new Date().toISOString();
      const finalHash = entity?.currentHash || req.document_hash || null;

      await client.query(
        `UPDATE approval_requests
            SET status = 'APPROVED', approved_by = $1, approved_at = $2, document_hash = COALESCE($3, document_hash)
          WHERE id = $4 AND organization_id = $5 AND status = 'SUBMITTED'`,
        [approvedBy, now, finalHash, approvalRequestId, organizationId]
      );

      await AuditTrailService.logAction({
        organizationId,
        userId: approvedBy,
        action: 'APPROVAL_GRANTED',
        entityType: req.entity_type,
        entityId: req.entity_id,
        afterState: { requestId: approvalRequestId, status: 'APPROVED', approvedBy, documentHash: finalHash },
      });

      return {
        id: approvalRequestId,
        organizationId,
        entityType: req.entity_type,
        entityId: req.entity_id,
        submittedBy: req.submitted_by,
        submittedAt: req.submitted_at instanceof Date ? req.submitted_at.toISOString() : String(req.submitted_at),
        status: 'APPROVED',
        approvedBy,
        approvedAt: now,
        amount: req.amount ? Number(req.amount) : undefined,
        documentHash: finalHash || undefined,
      };
    });
  }

  /**
   * Rejects a request by its immutable approvalRequestId inside a single locked transaction.
   */
  public static async rejectRequestById(
    organizationId: string,
    approvalRequestId: string,
    actor: ApproverActor,
    reason: string
  ): Promise<void> {
    const { userId: rejectedBy, role: userRole } = actor;

    await db.transaction(async (client) => {
      const reqRes = await client.query(
        `SELECT * FROM approval_requests
          WHERE organization_id = $1 AND id = $2
          FOR UPDATE`,
        [organizationId, approvalRequestId]
      );

      if (reqRes.rows.length === 0) {
        throw new Error('APPROVAL_REQUEST_NOT_FOUND: A submitted approval request is required before rejection.');
      }
      const req = reqRes.rows[0];
      if (req.status === 'APPROVED') {
        throw new Error('Cannot reject a request that has already been approved.');
      }
      if (req.status !== 'SUBMITTED') {
        throw new Error(`APPROVAL_REQUEST_NOT_SUBMITTED: Cannot reject a request with status '${req.status}'.`);
      }

      const rules = await this.getApprovalRules(organizationId, client);
      const rule = rules.find((r) => r.entityType === req.entity_type);
      const requiredRole = rule?.approverRole || 'Finance Manager';
      // Verify role eligibility: approver must strictly hold the configured approver role
      if (userRole !== requiredRole) {
        throw new Error(
          `User with role '${userRole}' is not authorized to reject ${req.entity_type}. Required role: ${requiredRole}`
        );
      }

      await client.query(
        `UPDATE approval_requests
            SET status = 'REJECTED', rejection_reason = $1
          WHERE id = $2 AND organization_id = $3 AND status = 'SUBMITTED'`,
        [reason, approvalRequestId, organizationId]
      );

      await AuditTrailService.logAction({
        organizationId,
        userId: rejectedBy,
        action: 'APPROVAL_REJECTED',
        entityType: req.entity_type,
        entityId: req.entity_id,
        afterState: { requestId: approvalRequestId, status: 'REJECTED', reason },
      });
    });
  }


  /**
   * Invalidates active approval requests when a document is edited after submission.
   */
  public static async invalidateApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client?: { query: (text: string, params?: any[]) => Promise<any> },
    reason: string = 'DOCUMENT_MODIFIED: Document modified after submission/approval'
  ): Promise<void> {
    const q = client || db;
    await q.query(
      `UPDATE approval_requests
          SET status = 'REJECTED',
              rejection_reason = $1
        WHERE organization_id = $2
          AND entity_type = $3
          AND entity_id = $4
          AND status IN ('SUBMITTED', 'APPROVED')`,
      [reason, organizationId, entityType, entityId]
    );
  }

  public static async getApprovalRequests(
    organizationId: string,
    status?: 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  ): Promise<ApprovalRequest[]> {
    let query = 'SELECT * FROM approval_requests WHERE organization_id = $1';
    const params: any[] = [organizationId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }
    query += ' ORDER BY submitted_at DESC';

    const res = await db.query(query, params);
    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at),
      status: r.status,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at ? (r.approved_at instanceof Date ? r.approved_at.toISOString() : String(r.approved_at)) : undefined,
      rejectionReason: r.rejection_reason,
      amount: r.amount ? Number(r.amount) : undefined,
      documentHash: r.document_hash,
      documentVersion: r.document_version ? Number(r.document_version) : 1,
    }));
  }

  public static async getApprovalRequestByEntity(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client?: { query: (text: string, params?: any[]) => Promise<any> }
  ): Promise<ApprovalRequest | null> {
    const q = client || db;
    const res = await q.query(
      `SELECT * FROM approval_requests
        WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
        ORDER BY submitted_at DESC
        LIMIT 1`,
      [organizationId, entityType, entityId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at instanceof Date ? r.submitted_at.toISOString() : String(r.submitted_at),
      status: r.status,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at ? (r.approved_at instanceof Date ? r.approved_at.toISOString() : String(r.approved_at)) : undefined,
      rejectionReason: r.rejection_reason,
      amount: r.amount ? Number(r.amount) : undefined,
      documentHash: r.document_hash,
      documentVersion: r.document_version ? Number(r.document_version) : 1,
    };
  }

  /**
   * Consumes approval inside the canonical document posting transaction.
   * If currentEntity is provided, re-verifies document hash against approved hash.
   */
  public static async consumeApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client: { query: (text: string, params?: any[]) => Promise<any> },
    currentEntity?: any
  ): Promise<ApprovalRequest> {
    const reqRes = await client.query(
      `SELECT * FROM approval_requests
        WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
        ORDER BY submitted_at DESC
        LIMIT 1
        FOR UPDATE`,
      [organizationId, entityType, entityId]
    );

    if (reqRes.rows.length === 0 || reqRes.rows[0].status !== 'APPROVED') {
      throw new Error(`APPROVAL_REQUIRED: ${entityType} requires an approved authorization request before posting.`);
    }

    const row = reqRes.rows[0];

    // Verify document hash has not been altered after approval
    if (row.document_hash) {
      let currentHash: string | undefined;
      if (typeof currentEntity === 'string') {
        currentHash = currentEntity;
      } else {
        const ent = await this.lockAndResolveEntity(client, organizationId, entityType, entityId);
        currentHash = ent?.currentHash || (currentEntity ? this.computeDocumentHash(entityType, currentEntity) : undefined);
      }
      if (currentHash && currentHash !== row.document_hash) {
        throw new Error(`DOCUMENT_ALTERED_AFTER_APPROVAL: ${entityType} was modified after approval was granted; approval is invalid.`);
      }
    }

    await client.query(
      `UPDATE approval_requests
          SET status = 'CONSUMED'
        WHERE id = $1 AND organization_id = $2`,
      [row.id, organizationId]
    );

    return {
      id: row.id,
      organizationId: row.organization_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      submittedBy: row.submitted_by,
      submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : String(row.submitted_at),
      status: 'CONSUMED',
      approvedBy: row.approved_by,
      approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : String(row.approved_at),
      rejectionReason: row.rejection_reason,
      amount: row.amount ? Number(row.amount) : undefined,
      documentHash: row.document_hash,
    };
  }
}
