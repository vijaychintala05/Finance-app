import { Router } from 'express';
import { Phase8Controller } from '../controllers/Phase8Controller';

const router = Router();

// Master Items API
router.get('/items', Phase8Controller.getItems);
router.post('/items', Phase8Controller.createItem);
router.get('/items/:id', Phase8Controller.getItem);
router.put('/items/:id', Phase8Controller.updateItem);
router.delete('/items/:id', Phase8Controller.deleteItem);

// Quotation Templates & Revisions & Conversions
router.get('/quotations/templates', Phase8Controller.getTemplates);
router.post('/quotations/templates', Phase8Controller.saveTemplate);
router.get('/quotations/:id/revisions', Phase8Controller.getQuotationRevisions);
router.post('/quotations/:id/convert-so', Phase8Controller.convertQuotationToSO);
router.post('/quotations/:id/convert-inv', Phase8Controller.convertQuotationToInvoice);

// Document Numbering API
router.get('/document-numbering/next', Phase8Controller.getNextDocumentNumber);
router.post('/document-numbering/configure', Phase8Controller.configureNumberingSequence);

// Global Search API
router.get('/search', Phase8Controller.globalSearch);

// Real Data Dashboard Summary
router.get('/dashboard-summary', Phase8Controller.getDashboardSummary);

export default router;
