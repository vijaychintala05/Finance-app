import { Router } from 'express';
import { SecurityController } from '../controllers/securityController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';

const router = Router();

// Roles & Permissions
router.get('/roles', requirePermission('settings.manage_users'), SecurityController.listRoles);

// Audit Trail
router.get('/audit-logs', requirePermission('audit.view'), SecurityController.getAuditLogs);

// Approval Workflows
router.get('/approvals/rules', requirePermission('settings.approvals'), SecurityController.getApprovalRules);
router.post('/approvals/rules', requirePermission('settings.approvals'), SecurityController.configureApprovalRule);
router.post('/approvals/request', requirePermission('accounting.post'), SecurityController.submitApprovalRequest);
router.post('/approvals/approve', requirePermission('settings.approvals'), SecurityController.approveRequest);
router.post('/approvals/reject', requirePermission('settings.approvals'), SecurityController.rejectRequest);

// Backups & Restores
router.post('/backup', requirePermission('settings.backup'), requireTrustedFinanceFeature('application-backup'), SecurityController.createBackup);
router.get('/backups', requirePermission('settings.backup'), requireTrustedFinanceFeature('application-backup'), SecurityController.listBackups);
router.post('/restore', requirePermission('settings.backup'), requireTrustedFinanceFeature('backup-restore'), SecurityController.restoreBackup);

// Data Export Bundle
router.get('/export', requirePermission('reports.export'), requireTrustedFinanceFeature('data-export'), SecurityController.exportBundle);

// Safe Destructive Financial Actions
router.post('/void-invoice', requirePermission('invoices.delete'), SecurityController.voidInvoice);
router.post('/reverse-payment', requirePermission('invoices.receive_payment'), SecurityController.reversePayment);
router.post('/reverse-journal', requirePermission('accounting.post'), requireTrustedFinanceFeature('legacy-journal-reversal'), SecurityController.reverseJournal);

export default protectAsyncRoutes(router);
