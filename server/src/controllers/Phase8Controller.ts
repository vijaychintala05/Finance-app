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
      const { search } = req.query;
      const items = await ItemMasterService.listItems(orgId, search as string);
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async createItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const item = await ItemMasterService.createItem(orgId, req.body);
      res.status(201).json({ item });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async getItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const item = await ItemMasterService.getItem(orgId, req.params.id);
      res.json({ item });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  }

  public static async updateItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const item = await ItemMasterService.updateItem(orgId, req.params.id, req.body);
      res.json({ item });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  public static async deleteItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      await ItemMasterService.deleteItem(orgId, req.params.id);
      res.json({ success: true, message: `Item ${req.params.id} deleted` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      const results = await GlobalSearchService.search(orgId, (q as string) || '');
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
