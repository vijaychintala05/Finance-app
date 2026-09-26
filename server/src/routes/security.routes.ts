import { Router } from 'express';
import { SecurityController } from '../controllers/securityController';
import { AuthenticatedRequest, requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';
import { getInvoiceVoidOperationStatus } from '../services/InvoiceVoidOperationStatusService';

const router = Router();

function decodeOperationReason(encoded: string): string {
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) return '';
  try {
    const standard = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(standard + '='.repeat((4 - standard.length % 4) % 4), 'base64').toString('utf8');
    return Buffer.from(decoded, 'utf8').toString('base64url') === encoded ? decoded : '';
  } catch {
    return '';
  }
}

// Roles & Permissions
router.get('/roles', requirePermission(['roles.view', 'settings.manage_users']), SecurityController.listRoles);
router.post('/roles', requirePermission(['roles.manage', 'settings.manage_users']), SecurityController.createRole);
router.post('/roles/clone', requirePermission(['roles.manage', 'settings.manage_users']), SecurityController.cloneRole);
router.put('/roles/:id', requirePermission(['roles.manage', 'settings.manage_users']), SecurityController.updateRole);
router.delete('/roles/:id', requirePermission(['roles.manage', 'settings.manage_users']), SecurityController.deleteRole);
router.patch('/members/:userId/role', requirePermission(['roles.manage', 'settings.manage_users']), SecurityController.reassignMemberRole);
router.get('/permissions', requirePermission(['roles.view', 'settings.manage_users']), SecurityController.listPermissions);
router.post('/sod-conflicts', requirePermission(['roles.view', 'settings.manage_users']), SecurityController.checkSodConflicts);

// Audit Trail
router.get('/audit-logs', requirePermission(['audit.view', 'reports.audit']), SecurityController.getAuditLogs);

// Approval Workflows
router.get('/approvals/rules', requirePermission(['approvals.manage', 'settings.approvals']), SecurityController.getApprovalRules);
router.post('/approvals/rules', requirePermission(['approvals.manage', 'settings.approvals']), SecurityController.configureApprovalRule);
router.get('/approvals/requests', requirePermission(['approvals.manage', 'settings.approvals', 'purchase_orders.approve', 'expenses.approve']), SecurityController.listApprovalRequests);
router.post('/approvals/request', requirePermission(['accounting.post', 'purchase_orders.submit', 'expenses.submit', 'invoices.create', 'purchases.create']), SecurityController.submitApprovalRequest);
router.post('/approvals/approve', requirePermission(['approvals.manage', 'settings.approvals', 'purchase_orders.approve', 'expenses.approve']), SecurityController.approveRequest);
router.post('/approvals/reject', requirePermission(['approvals.manage', 'settings.approvals', 'purchase_orders.approve', 'expenses.approve']), SecurityController.rejectRequest);
router.post('/approvals/:approvalRequestId/approve', requirePermission(['approvals.manage', 'settings.approvals', 'purchase_orders.approve', 'expenses.approve']), SecurityController.approveRequest);
router.post('/approvals/:approvalRequestId/reject', requirePermission(['approvals.manage', 'settings.approvals', 'purchase_orders.approve', 'expenses.approve']), SecurityController.rejectRequest);

// Backups & Restores
router.post('/backup', requirePermission(['backup.create', 'settings.backup']), requireTrustedFinanceFeature('application-backup'), SecurityController.createBackup);
router.post('/approvals/:approvalRequestId/reject', requirePermission(['approvals.manage', 'settings.approvals', 'purchase_orders.approve', 'expenses.approve']), SecurityController.rejectRequest);

// Backups & Restores
router.post('/backup', requirePermission(['backup.create', 'settings.backup']), requireTrustedFinanceFeature('application-backup'), SecurityController.createBackup);
router.get('/backups', requirePermission(['backup.view', 'settings.backup']), requireTrustedFinanceFeature('application-backup'), SecurityController.listBackups);
router.post('/restore', requirePermission('backup.restore'), SecurityController.restoreBackup);

// Data Export Bundle
router.get('/export', requirePermission('reports.export'), requireTrustedFinanceFeature('data-export'), SecurityController.exportBundle);

// Safe Destructive Financial Actions
router.get('/void-invoice/:invoiceId/operation-status', requirePermission(['invoices.void', 'invoices.delete']), async (req: AuthenticatedRequest, res) => {
  try {
    const status = await getInvoiceVoidOperationStatus({
      organizationId: req.auth!.organizationId,
      userId: req.auth!.userId,
      role: req.auth!.role,
      invoiceId: req.params.invoiceId,
      idempotencyKey: req.header('idempotency-key') || '',
      reason: decodeOperationReason(req.header('x-operation-reason-base64') || ''),
    });
    res.json(status);
  } catch (error) {
    console.error('INVOICE_VOID_OPERATION_STATUS_ERROR:', error);
    res.status(503).json({ error: 'Invoice void status is temporarily unavailable' });
  }
});
router.post('/void-invoice', requirePermission(['invoices.void', 'invoices.delete']), SecurityController.voidInvoice);
router.post('/reverse-payment', requirePermission(['customer_payments.reverse', 'invoices.receive_payment']), SecurityController.reversePayment);

export default protectAsyncRoutes(router);
