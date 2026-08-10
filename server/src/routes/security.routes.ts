import { Router } from 'express';
import { SecurityController } from '../controllers/securityController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';

const router = Router();

// Roles & Permissions
router.get('/roles', requirePermission('settings.manage_users'), SecurityController.listRoles);

// Audit Trail
router.get('/audit-logs', SecurityController.getAuditLogs);

// Approval Workflows
router.get('/approvals/rules', SecurityController.getApprovalRules);
router.post('/approvals/rules', requirePermission('settings.approvals'), SecurityController.configureApprovalRule);
router.post('/approvals/request', SecurityController.submitApprovalRequest);
router.post('/approvals/approve', SecurityController.approveRequest);
router.post('/approvals/reject', SecurityController.rejectRequest);

// Backups & Restores
router.post('/backup', requirePermission('settings.backup'), SecurityController.createBackup);
router.get('/backups', requirePermission('settings.backup'), SecurityController.listBackups);
router.post('/restore', requirePermission('settings.backup'), SecurityController.restoreBackup);

// Data Export Bundle
router.get('/export', requirePermission('reports.export'), SecurityController.exportBundle);

// Safe Destructive Financial Actions
router.post('/void-invoice', requirePermission('invoices.delete'), SecurityController.voidInvoice);
router.post('/reverse-payment', requirePermission('purchases.delete'), SecurityController.reversePayment);
router.post('/reverse-journal', requirePermission('settings.close_period'), SecurityController.reverseJournal);

export default router;
