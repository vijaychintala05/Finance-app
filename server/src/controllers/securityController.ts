import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import { RbacService } from '../auth/RbacService';
import { AuditTrailService } from '../security/AuditTrailService';
import { ApprovalWorkflowService } from '../approvals/ApprovalWorkflowService';
import { BackupRestoreService } from '../database/BackupRestoreService';
import { DataExportService } from '../services/DataExportService';
import { FinancialDestructiveActionsService } from '../accounting/FinancialDestructiveActionsService';

export class SecurityController {
  public static async listRoles(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const roles = RbacService.getAllRoles();
      res.json({ roles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getAuditLogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { entityType, entityId, userId, action, startDate, endDate, limit } = req.query;

      const logs = await AuditTrailService.getAuditLogs(orgId, {
        entityType: entityType as string,
        entityId: entityId as string,
        userId: userId as string,
        action: action as string,
        startDate: startDate as string,
        endDate: endDate as string,
        limit: limit ? Number(limit) : undefined,
      });

      res.json({ auditLogs: logs });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getApprovalRules(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const rules = await ApprovalWorkflowService.getApprovalRules(orgId);
      res.json({ rules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async configureApprovalRule(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { entityType, isRequired, thresholdAmount, approverRole } = req.body;

      if (!entityType) {
        res.status(400).json({ error: 'Missing entityType' });
        return;
      }

      const rule = await ApprovalWorkflowService.configureApprovalRule(orgId, {
        entityType,
        isRequired: Boolean(isRequired),
        thresholdAmount: thresholdAmount ? Number(thresholdAmount) : undefined,
        approverRole,
        userId: req.auth!.userId,
      });

      res.json({ rule });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async submitApprovalRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { entityType, entityId, amount } = req.body;

      if (!entityType || !entityId) {
        res.status(400).json({ error: 'Missing entityType or entityId' });
        return;
      }

      const request = await ApprovalWorkflowService.submitForApproval(
        orgId,
        entityType,
        entityId,
        req.auth!.userId,
        amount ? Number(amount) : undefined
      );

      res.status(201).json({ request });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async approveRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { entityType, entityId } = req.body;

      if (!entityType || !entityId) {
        res.status(400).json({ error: 'Missing entityType or entityId' });
        return;
      }

      const result = await ApprovalWorkflowService.approveRequest(
        orgId,
        entityType,
        entityId,
        req.auth!.userId,
        req.auth!.role
      );

      res.json({ request: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async rejectRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { entityType, entityId, reason } = req.body;

      if (!entityType || !entityId || !reason) {
        res.status(400).json({ error: 'Missing entityType, entityId or reason' });
        return;
      }

      await ApprovalWorkflowService.rejectRequest(
        orgId,
        entityType,
        entityId,
        req.auth!.userId,
        reason
      );

      res.json({ message: 'Request rejected successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createBackup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const backup = await BackupRestoreService.createBackup(orgId, req.auth!.userId);
      res.status(201).json({ backup });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async listBackups(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const backups = await BackupRestoreService.listBackups(orgId);
      res.json({ backups });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async restoreBackup(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { backupPayload } = req.body;

      if (!backupPayload) {
        res.status(400).json({ error: 'Missing backupPayload' });
        return;
      }

      const result = await BackupRestoreService.restoreBackup(orgId, backupPayload, req.auth!.userId);
      res.json({ result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async exportBundle(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const bundle = await DataExportService.exportOrganizationBundle(orgId, req.auth!.userId);
      res.json({ bundle });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async voidInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { invoiceId, reason } = req.body;

      if (!invoiceId || !reason) {
        res.status(400).json({ error: 'Missing invoiceId or reason' });
        return;
      }

      const result = await FinancialDestructiveActionsService.voidInvoice(
        orgId,
        invoiceId,
        req.auth!.userId,
        reason
      );

      res.json({ result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async reversePayment(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { paymentId, reason } = req.body;

      if (!paymentId || !reason) {
        res.status(400).json({ error: 'Missing paymentId or reason' });
        return;
      }

      const result = await FinancialDestructiveActionsService.reversePaymentReceived(
        orgId,
        paymentId,
        req.auth!.userId,
        reason
      );

      res.json({ result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static async reverseJournal(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.organizationId!;
      const { journalEntryId, reason } = req.body;

      if (!journalEntryId || !reason) {
        res.status(400).json({ error: 'Missing journalEntryId or reason' });
        return;
      }

      const result = await FinancialDestructiveActionsService.reverseJournalEntry(
        orgId,
        journalEntryId,
        req.auth!.userId,
        reason
      );

      res.json({ result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
