import { db } from '../database/db';
import { AuditTrailService } from '../security/AuditTrailService';
import { RbacService } from '../auth/RbacService';
import { newId } from '../utils/ids';

export type ApprovalEntityType =
  | 'PURCHASE_ORDER'
  | 'VENDOR_BILL'
  | 'PAYMENT'
  | 'CREDIT_NOTE'
  | 'MANUAL_JOURNAL'
  | 'PERIOD_REOPENING';

export interface ApprovalRule {
  id: string;
  organizationId: string;
  entityType: ApprovalEntityType;
  isRequired: boolean;
  thresholdAmount?: number;
  approverRole: string;
}

export interface ApprovalRequest {
  id: string;
  organizationId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  submittedBy: string;
  submittedAt: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  amount?: number;
}

export class ApprovalWorkflowService {
  public static async getApprovalRules(organizationId: string): Promise<ApprovalRule[]> {
    const res = await db.query(
      'SELECT * FROM approval_rules WHERE organization_id = $1',
      [organizationId]
    );

    if (res.rows.length === 0) {
      // Default configurations (disabled by default for small businesses)
      return [
        { id: 'rule-po', organizationId, entityType: 'PURCHASE_ORDER', isRequired: false, approverRole: 'Admin' },
        { id: 'rule-bill', organizationId, entityType: 'VENDOR_BILL', isRequired: false, approverRole: 'Admin' },
        { id: 'rule-pay', organizationId, entityType: 'PAYMENT', isRequired: false, thresholdAmount: 50000, approverRole: 'Admin' },
        { id: 'rule-cn', organizationId, entityType: 'CREDIT_NOTE', isRequired: false, approverRole: 'Admin' },
        { id: 'rule-mj', organizationId, entityType: 'MANUAL_JOURNAL', isRequired: false, approverRole: 'Accountant' },
        { id: 'rule-pr', organizationId, entityType: 'PERIOD_REOPENING', isRequired: true, approverRole: 'Owner' },
      ];
    }

    return res.rows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id || r.organizationId,
      entityType: r.entity_type || r.entityType,
      isRequired: Boolean(r.is_required ?? r.isRequired),
      thresholdAmount: r.threshold_amount ? Number(r.threshold_amount) : undefined,
      approverRole: r.approver_role || r.approverRole || 'Admin',
    }));
  }

  public static async configureApprovalRule(
    organizationId: string,
    params: {
      entityType: ApprovalEntityType;
      isRequired: boolean;
      thresholdAmount?: number;
      approverRole?: string;
      userId: string;
    }
  ): Promise<ApprovalRule> {
    const existing = await db.query(
      'SELECT id FROM approval_rules WHERE organization_id = $1 AND entity_type = $2',
      [organizationId, params.entityType]
    );

    const ruleId = existing.rows.length > 0 ? existing.rows[0].id : newId('appr-rule');
    const role = params.approverRole || 'Admin';

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE approval_rules
         SET is_required = $1, threshold_amount = $2, approver_role = $3
         WHERE id = $4 AND organization_id = $5`,
        [params.isRequired, params.thresholdAmount || null, role, ruleId, organizationId]
      );
    } else {
      await db.query(
        `INSERT INTO approval_rules (id, organization_id, entity_type, is_required, threshold_amount, approver_role)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ruleId, organizationId, params.entityType, params.isRequired, params.thresholdAmount || null, role]
      );
    }

    await AuditTrailService.logAction({
      organizationId,
      userId: params.userId,
      action: 'APPROVAL_RULE_CONFIGURED',
      entityType: 'APPROVAL_RULE',
      entityId: ruleId,
      afterState: { entityType: params.entityType, isRequired: params.isRequired, thresholdAmount: params.thresholdAmount },
    });

    return {
      id: ruleId,
      organizationId,
      entityType: params.entityType,
      isRequired: params.isRequired,
      thresholdAmount: params.thresholdAmount,
      approverRole: role,
    };
  }

  public static async requiresApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    amount?: number
  ): Promise<boolean> {
    const rules = await this.getApprovalRules(organizationId);
    const rule = rules.find((r) => r.entityType === entityType);

    if (!rule || !rule.isRequired) {
      return false;
    }

    if (rule.thresholdAmount && amount !== undefined) {
      return amount >= rule.thresholdAmount;
    }

    return true;
  }

  public static async submitForApproval(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    submittedBy: string,
    amount?: number
  ): Promise<ApprovalRequest> {
    const id = newId('req');
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO approval_requests (id, organization_id, entity_type, entity_id, submitted_by, submitted_at, status, amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, organizationId, entityType, entityId, submittedBy, now, 'SUBMITTED', amount || null]
    );

    await AuditTrailService.logAction({
      organizationId,
      userId: submittedBy,
      action: 'APPROVAL_REQUESTED',
      entityType,
      entityId,
      afterState: { requestId: id, status: 'SUBMITTED', amount },
    });

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
    // Permission check
    const rules = await this.getApprovalRules(organizationId);
    const rule = rules.find((r) => r.entityType === entityType);
    const requiredRole = rule?.approverRole || 'Admin';

    if (userRole !== 'Owner' && userRole !== 'Super Admin' && userRole !== 'Admin' && userRole !== requiredRole) {
      throw new Error(`User with role '${userRole}' is not authorized to approve ${entityType}. Required role: ${requiredRole}`);
    }

    const reqRes = await db.query(
      `SELECT * FROM approval_requests
       WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'SUBMITTED'`,
      [organizationId, entityType, entityId]
    );

    const now = new Date().toISOString();
    let requestId = reqRes.rows.length > 0 ? reqRes.rows[0].id : `req-auto-${Date.now()}`;

    if (reqRes.rows.length > 0) {
      await db.query(
        `UPDATE approval_requests
         SET status = 'APPROVED', approved_by = $1, approved_at = $2
         WHERE id = $3 AND organization_id = $4`,
        [approvedBy, now, requestId, organizationId]
      );
    } else {
      await db.query(
        `INSERT INTO approval_requests (id, organization_id, entity_type, entity_id, submitted_by, submitted_at, status, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [requestId, organizationId, entityType, entityId, approvedBy, now, 'APPROVED', approvedBy, now]
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
      submittedBy: reqRes.rows[0]?.submitted_by || approvedBy,
      submittedAt: reqRes.rows[0]?.submitted_at || now,
      status: 'APPROVED',
      approvedBy,
      approvedAt: now,
    };
  }

  public static async rejectRequest(
    organizationId: string,
    entityType: ApprovalEntityType,
    entityId: string,
    rejectedBy: string,
    reason: string
  ): Promise<void> {
    const now = new Date().toISOString();
    await db.query(
      `UPDATE approval_requests
       SET status = 'REJECTED', rejection_reason = $1
       WHERE organization_id = $2 AND entity_type = $3 AND entity_id = $4 AND status = 'SUBMITTED'`,
      [reason, organizationId, entityType, entityId]
    );

    await AuditTrailService.logAction({
      organizationId,
      userId: rejectedBy,
      action: 'APPROVAL_REJECTED',
      entityType,
      entityId,
      afterState: { status: 'REJECTED', reason },
    });
  }
}
