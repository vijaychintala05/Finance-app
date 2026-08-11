import { Router } from 'express';
import { Phase8Controller } from '../controllers/Phase8Controller';
import { requirePermission } from '../middleware/organizationIsolation.middleware';

const router = Router();

// Master Items API
router.get('/items', requirePermission(['invoices.view', 'purchases.view']), Phase8Controller.getItems);
router.post('/items', requirePermission(['invoices.create', 'purchases.create']), Phase8Controller.createItem);
router.get('/items/:id', requirePermission(['invoices.view', 'purchases.view']), Phase8Controller.getItem);
router.put('/items/:id', requirePermission(['invoices.edit', 'purchases.edit']), Phase8Controller.updateItem);
router.delete('/items/:id', requirePermission(['invoices.delete', 'purchases.delete']), Phase8Controller.deleteItem);

// Quotation API — Static routes MUST come before parametric /quotations/:id routes
router.get('/quotations', requirePermission('invoices.view'), Phase8Controller.getQuotations);
router.post('/quotations', requirePermission('invoices.create'), Phase8Controller.createQuotation);
router.get('/quotations/templates', requirePermission('invoices.view'), Phase8Controller.getTemplates);
router.post('/quotations/templates', requirePermission('invoices.edit'), Phase8Controller.saveTemplate);
router.get('/quotations/:id', requirePermission('invoices.view'), Phase8Controller.getQuotation);
router.put('/quotations/:id', requirePermission('invoices.edit'), Phase8Controller.updateQuotation);
router.patch('/quotations/:id', requirePermission('invoices.edit'), Phase8Controller.updateQuotation);
router.get('/quotations/:id/pdf', requirePermission('invoices.view'), Phase8Controller.getQuotationPdf);
router.get('/quotations/:id/revisions/:revisionNumber/pdf', requirePermission('invoices.view'), Phase8Controller.getQuotationPdf);
router.get('/quotations/:id/revisions', requirePermission('invoices.view'), Phase8Controller.getQuotationRevisions);
router.post('/quotations/:id/convert-so', requirePermission('invoices.create'), Phase8Controller.convertQuotationToSO);
router.post('/quotations/:id/convert-inv', requirePermission('invoices.create'), Phase8Controller.convertQuotationToInvoice);

// Document Numbering API
router.get('/document-numbering/next', Phase8Controller.getNextDocumentNumber);
router.post('/document-numbering/configure', Phase8Controller.configureNumberingSequence);

// Global Search API
router.get('/search', Phase8Controller.globalSearch);

// Real Data Dashboard Summary
router.get('/dashboard-summary', Phase8Controller.getDashboardSummary);

export default router;
