import { Router } from 'express';
import { Stage6Controller } from '../controllers/Stage6Controller';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';

const router = Router();

// ==========================================
// 1. Document Inbox & OCR
// ==========================================
router.get(['/inbox', '/documents/inbox'], requirePermission(['purchases.view', 'invoices.view']), Stage6Controller.listDocuments);
router.post(['/inbox', '/inbox/upload', '/documents/inbox', '/documents/inbox/upload'], requirePermission(['purchases.create', 'invoices.create']), Stage6Controller.uploadDocument);
router.get(['/inbox/:id', '/documents/inbox/:id'], requirePermission(['purchases.view', 'invoices.view']), Stage6Controller.getDocument);
router.delete(['/inbox/:id', '/documents/inbox/:id'], requirePermission(['purchases.edit', 'invoices.edit']), Stage6Controller.deleteDocument);
router.post(['/inbox/:id/ocr', '/documents/inbox/:id/ocr'], requirePermission(['purchases.create', 'purchases.edit']), Stage6Controller.processOcr);
router.post(['/inbox/:id/convert-bill', '/documents/inbox/:id/convert-bill'], requirePermission('purchases.create'), Stage6Controller.convertToBill);
router.post(['/inbox/:id/convert-expense', '/documents/inbox/:id/convert-expense'], requirePermission('purchases.create'), Stage6Controller.convertToExpense);

// ==========================================
// 2. Customer Portal Management (Internal)
// ==========================================
router.post('/portal/tokens', requirePermission('invoices.view'), Stage6Controller.generatePortalToken);
router.delete('/portal/tokens/:customerId', requirePermission('invoices.edit'), Stage6Controller.revokePortalTokens);

// ==========================================
// 3. Data Migration & Opening Balances
// ==========================================
router.post('/migration/opening-balances/preview', requirePermission(['accounting.post', 'settings.manage_accounts']), Stage6Controller.previewOpeningBalances);
router.post(['/migration/opening-balances', '/migration/opening-balances/post'], requirePermission(['accounting.post', 'settings.manage_accounts']), Stage6Controller.postOpeningBalances);
router.post(['/migration/master-data', '/migration/import'], requirePermission(['accounting.post', 'settings.manage_accounts']), Stage6Controller.importMasterData);

// ==========================================
// 4. Saved Views
// ==========================================
router.get('/saved-views', requirePermission(['invoices.view', 'purchases.view', 'reports.view']), Stage6Controller.listViews);
router.post('/saved-views', requirePermission(['invoices.view', 'purchases.view', 'reports.view']), Stage6Controller.createView);
router.delete('/saved-views/:id', requirePermission(['invoices.view', 'purchases.view', 'reports.view']), Stage6Controller.deleteView);

export default protectAsyncRoutes(router);
