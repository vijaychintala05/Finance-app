import { db } from '../database/db';
import { AuditTrailService } from '../security/AuditTrailService';
import { RbacService } from '../auth/RbacService';
import { newId } from '../utils/ids';

export type ApprovalEntityType =
  | 'PURCHASE_ORDER'
  | 'VENDOR_BILL'
  | 'PAYMENT'
  | 'CUSTOMER_PAYMENT'
  | 'INVOICE'
  | 'CREDIT_NOTE'
  | 'MANUAL_JOURNAL'
  | 'PERIOD_REOPENING'
  | 'EXPENSE';

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
}

export class ApprovalWorkflowService {
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
      // Default configurations (disabled by default for small businesses)
      return [
        { id: 'rule-po', organizationId, entityType: 'PURCHASE_ORDER', isRequired: false, thresholdAmount: 50000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-inv', organizationId, entityType: 'INVOICE', isRequired: false, thresholdAmount: 100000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-cust-pay', organizationId, entityType: 'CUSTOMER_PAYMENT', isRequired: false, thresholdAmount: 50000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-bill', organizationId, entityType: 'VENDOR_BILL', isRequired: false, thresholdAmount: 100000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-pay', organizationId, entityType: 'PAYMENT', isRequired: false, thresholdAmount: 50000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-cn', organizationId, entityType: 'CREDIT_NOTE', isRequired: false, thresholdAmount: 25000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-mj', organizationId, entityType: 'MANUAL_JOURNAL', isRequired: false, thresholdAmount: 100000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-exp', organizationId, entityType: 'EXPENSE', isRequired: false, thresholdAmount: 10000, approverRole: 'Finance Manager', allowSelfApproval: false },
        { id: 'rule-pr', organizationId, entityType: 'PERIOD_REOPENING', isRequired: true, approverRole: 'Owner', allowSelfApproval: false },
      ];
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

  public static async submitForApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    submittedBy: string,
    amount?: number,
    transactionClient?: { query: (text: string, params?: any[]) => Promise<any> }
  ): Promise<ApprovalRequest> {
    const q = transactionClient || db;
    const id = newId('req');
    const now = new Date().toISOString();

    await q.query(
      `INSERT INTO approval_requests (id, organization_id, entity_type, entity_id, submitted_by, submitted_at, status, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, organizationId, entityType, entityId, submittedBy, now, 'SUBMITTED', amount || null]
    );

    await q.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, timestamp, after_state)
       VALUES ($1, $2, $3, 'APPROVAL_REQUESTED', $4, $5, $6, $7)`,
      [newId('aud'), organizationId, submittedBy, entityType, entityId, now, JSON.stringify({ requestId: id, status: 'SUBMITTED', amount })]
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
    };
  }

  public static async approveRequest(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    approvedBy: string,
    userRole: string
  ): Promise<ApprovalRequest> {
    const rules = await this.getApprovalRules(organizationId);
    const rule = rules.find((r) => r.entityType === entityType);
    const requiredRole = rule?.approverRole || 'Finance Manager';
    const allowSelfApproval = rule?.allowSelfApproval ?? false;

    // Verify role eligibility
    const isOwner = userRole === 'Owner' || userRole === 'Super Admin';
    const isAdmin = userRole === 'Admin';
    const isAuthorizedRole = userRole === requiredRole;

    if (!isOwner && !isAdmin && !isAuthorizedRole) {
      throw new Error(
        `User with role '${userRole}' is not authorized to approve ${entityType}. Required role: ${requiredRole}`
      );
    }

    return await db.transaction(async (client) => {
      // Row lock to prevent concurrent double-approvals
      const reqRes = await client.query(
        `SELECT * FROM approval_requests
          WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
          ORDER BY submitted_at DESC
          LIMIT 1
          FOR UPDATE`,
        [organizationId, entityType, entityId]
      );

      const now = new Date().toISOString();
      let requestId = reqRes.rows.length > 0 ? reqRes.rows[0].id : newId('req-auto');
      const submittedBy = reqRes.rows[0]?.submitted_by || approvedBy;
      const currentStatus = reqRes.rows[0]?.status;

      if (currentStatus === 'APPROVED') {
        throw new Error('Approval request has already been approved.');
      }
      if (currentStatus === 'REJECTED') {
        throw new Error('Cannot approve a request that has already been rejected.');
      }

      // Self-Approval Prevention Check: Strict enforcement even for Organization Owner
      if (!allowSelfApproval && submittedBy === approvedBy) {
        throw new Error(
          `Self-approval forbidden: Submitting user '${approvedBy}' cannot approve their own ${entityType}. Another qualified approver is required.`
        );
      }

      if (reqRes.rows.length > 0) {
        await client.query(
          `UPDATE approval_requests
              SET status = 'APPROVED', approved_by = $1, approved_at = $2
            WHERE id = $3 AND organization_id = $4`,
          [approvedBy, now, requestId, organizationId]
        );
      } else {
        await client.query(
          `INSERT INTO approval_requests (id, organization_id, entity_type, entity_id, submitted_by, submitted_at, status, approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [requestId, organizationId, entityType, entityId, submittedBy, now, 'APPROVED', approvedBy, now]
        );
      }

      await AuditTrailService.logAction({
        organizationId,
        userId: approvedBy,
        action: 'APPROVAL_GRANTED',
        entityType,
        entityId,
        afterState: { requestId, status: 'APPROVED', approvedBy },
      });

      return {
        id: requestId,
        organizationId,
        entityType,
        entityId,
        submittedBy,
        submittedAt: reqRes.rows[0]?.submitted_at || now,
        status: 'APPROVED',
        approvedBy,
        approvedAt: now,
      };
    });
  }

  public static async rejectRequest(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    rejectedBy: string,
    reason: string,
    userRole?: string
  ): Promise<void> {
    if (userRole) {
      const rules = await this.getApprovalRules(organizationId);
      const rule = rules.find((r) => r.entityType === entityType);
      const requiredRole = rule?.approverRole || 'Finance Manager';
      const isOwner = userRole === 'Owner' || userRole === 'Super Admin';
      const isAdmin = userRole === 'Admin';
      const isAuthorizedRole = userRole === requiredRole;
      if (!isOwner && !isAdmin && !isAuthorizedRole) {
        throw new Error(
          `User with role '${userRole}' is not authorized to reject ${entityType}. Required role: ${requiredRole}`
        );
      }
    }

    const now = new Date().toISOString();

    await db.transaction(async (client) => {
      const reqRes = await client.query(
        `SELECT * FROM approval_requests
          WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
          ORDER BY submitted_at DESC
          LIMIT 1
          FOR UPDATE`,
        [organizationId, entityType, entityId]
      );

      if (reqRes.rows.length > 0 && reqRes.rows[0].status === 'APPROVED') {
        throw new Error('Cannot reject a request that has already been approved.');
      }

      await client.query(
        `UPDATE approval_requests
            SET status = 'REJECTED', rejection_reason = $1
          WHERE organization_id = $2 AND entity_type = $3 AND entity_id = $4 AND status = 'SUBMITTED'`,
        [reason, organizationId, entityType, entityId]
      );
    });

    await AuditTrailService.logAction({
      organizationId,
      userId: rejectedBy,
      action: 'APPROVAL_REJECTED',
      entityType,
      entityId,
      afterState: { status: 'REJECTED', reason },
    });
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
      submittedAt: r.submitted_at,
      status: r.status,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
      rejectionReason: r.rejection_reason,
      amount: r.amount ? Number(r.amount) : undefined,
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
      submittedAt: r.submitted_at,
      status: r.status,
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
      rejectionReason: r.rejection_reason,
      amount: r.amount ? Number(r.amount) : undefined,
    };
  }

  public static async consumeApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    client: { query: (text: string, params?: any[]) => Promise<any> }
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

    await client.query(
      `UPDATE approval_requests
          SET status = 'CONSUMED'
        WHERE id = $1 AND organization_id = $2`,
      [reqRes.rows[0].id, organizationId]
    );

    const r = reqRes.rows[0];
    return {
      id: r.id,
      organizationId: r.organization_id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      submittedBy: r.submitted_by,
      submittedAt: r.submitted_at,
      status: 'CONSUMED',
      approvedBy: r.approved_by,
      approvedAt: r.approved_at,
      rejectionReason: r.rejection_reason,
      amount: r.amount ? Number(r.amount) : undefined,
    };
  }
}
