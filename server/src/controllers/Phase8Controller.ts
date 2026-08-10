import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import { ItemMasterService } from '../services/ItemMasterService';
import { QuotationEngine } from '../sales/QuotationEngine';
import { DocumentNumberingEngine } from '../services/DocumentNumberingEngine';
import { GlobalSearchService } from '../services/GlobalSearchService';
import { DashboardSummaryService } from '../services/DashboardSummaryService';

export class Phase8Controller {
  // --- ITEMS API ---
  public static async getItems(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { search, includeInactive } = req.query;
      const items = await ItemMasterService.listItems(orgId, search as string, includeInactive === 'true');
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list items' });
    }
  }

  public static async createItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const item = await ItemMasterService.createItem(orgId, req.body);
      res.status(201).json({ item });
    } catch (err: any) {
      const msg = err.message || 'Failed to create item';
      const status = msg.includes('required') || msg.includes('exists') || msg.includes('non-negative') || msg.includes('between') || msg.includes('cannot be empty') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  }

  public static async getItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const item = await ItemMasterService.getItem(orgId, req.params.id);
      res.json({ item });
    } catch (err: any) {
      res.status(404).json({ error: err.message || 'Item not found' });
    }
  }

  public static async updateItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const item = await ItemMasterService.updateItem(orgId, req.params.id, req.body);
      res.json({ item });
    } catch (err: any) {
      const msg = err.message || 'Failed to update item';
      const status = msg.includes('not found') ? 404 : msg.includes('required') || msg.includes('exists') || msg.includes('non-negative') || msg.includes('between') || msg.includes('cannot be empty') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  }

  public static async deleteItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const result = await ItemMasterService.deleteItem(orgId, req.params.id);
      res.json(result);
    } catch (err: any) {
      const msg = err.message || 'Failed to delete item';
      const status = msg.includes('not found') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  }

  // --- QUOTATION CRUD API ---
  public static async getQuotations(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { search, status } = req.query;
      const quotations = await QuotationEngine.listQuotations(orgId, {
        search: search as string,
        status: status as string,
      });
      res.json({ quotations });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list quotations' });
    }
  }

  public static async createQuotation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const createdBy = (req as any).user?.name || req.auth?.userId || 'User';
      const quotation = await QuotationEngine.createQuotation(orgId, req.body, createdBy);
      res.status(201).json({ quotation });
    } catch (err: any) {
      const msg = err.message || 'Failed to create quotation';
      const isValidation = msg.includes('required') || msg.includes('cannot exceed') || msg.includes('must be') || msg.includes('inactive') || msg.includes('not found') || msg.includes('does not belong') || msg.includes('cannot precede') || msg.includes('invalid');
      const status = isValidation ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  }

  public static async getQuotation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const quotation = await QuotationEngine.getQuotation(orgId, req.params.id);
      res.json({ quotation });
    } catch (err: any) {
      const msg = err.message || 'Quotation not found';
      const status = msg.includes('not found') ? 404 : 500;
      res.status(status).json({ error: msg });
    }
  }

  public static async updateQuotation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const createdBy = (req as any).user?.name || req.auth?.userId || 'User';
      const quotation = await QuotationEngine.reviseQuotation(
        orgId,
        req.params.id,
        req.body,
        req.body.changeSummary || 'Updated quotation',
        createdBy
      );
      res.json({ quotation });
    } catch (err: any) {
      const msg = err.message || 'Failed to update quotation';
      let status = 500;
      if (msg.startsWith('Quotation ') && msg.includes('not found')) {
        status = 404;
      } else if (
        msg.includes('required') || msg.includes('cannot exceed') || msg.includes('must be') ||
        msg.includes('inactive') || msg.includes('not found') || msg.includes('does not belong') ||
        msg.includes('cannot precede') || msg.includes('invalid')
      ) {
        status = 400;
      }
      res.status(status).json({ error: msg });
    }
  }

  // --- QUOTATION TEMPLATES & REVISIONS API ---
  public static async getTemplates(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const templates = await QuotationEngine.getTemplates(orgId);
      res.json({ templates });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async saveTemplate(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const template = await QuotationEngine.saveTemplate(orgId, req.body);
      res.json({ template });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getQuotationRevisions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const revisions = await QuotationEngine.getQuotationRevisions(orgId, req.params.id);
      res.json({ revisions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async convertQuotationToSO(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const salesOrder = await QuotationEngine.convertToSalesOrder(orgId, req.params.id);
      res.json({ salesOrder });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async convertQuotationToInvoice(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const invoice = await QuotationEngine.convertToInvoice(orgId, req.params.id);
      res.json({ invoice });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- PUBLIC CUSTOMER PORTAL API (UNPROTECTED) ---
  public static async getPublicQuotation(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const quotation = await QuotationEngine.getPublicQuotationByToken(token);
      res.json({ quotation });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  public static async respondPublicQuotation(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { status, notes } = req.body;
      if (!['ACCEPTED', 'DECLINED', 'REVISION_REQUESTED'].includes(status)) {
        res.status(400).json({ error: 'Invalid response status' });
        return;
      }
      const result = await QuotationEngine.updatePublicStatus(token, status, notes);
      res.json({ result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- DOCUMENT NUMBERING API ---
  public static async getNextDocumentNumber(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { type, date, prefix } = req.query;
      if (!type) {
        res.status(400).json({ error: 'Type query param is required' });
        return;
      }
      const nextNumber = await DocumentNumberingEngine.getNextNumber(
        orgId,
        type as string,
        date as string,
        prefix as string
      );
      res.json({ documentNumber: nextNumber });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async configureNumberingSequence(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const config = await DocumentNumberingEngine.configureSequence(orgId, req.body);
      res.json({ config });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  // --- GLOBAL SEARCH API ---
  public static async globalSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { q } = req.query;
      const results = await GlobalSearchService.search(orgId, (q as string) || '', req.auth?.permissions);
      res.json({ results });
    } catch (err: any) {
      console.error('[GlobalSearch Error]:', err?.stack || err?.message || err);
      res.status(500).json({ error: err.message });
    }
  }

  // --- DASHBOARD SUMMARY API ---
  public static async getDashboardSummary(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const summary = await DashboardSummaryService.getSummary(orgId);
      res.json({ summary });
    } catch (err: any) {
      console.error('[DashboardSummary Error]:', err?.stack || err?.message || err);
      res.status(500).json({ error: err.message });
    }
  }
}
