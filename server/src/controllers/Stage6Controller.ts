import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import { DocumentInboxService } from '../services/DocumentInboxService';
import { DocumentOcrService } from '../services/DocumentOcrService';
import { CustomerPortalService } from '../services/CustomerPortalService';
import { DataMigrationService } from '../services/DataMigrationService';
import { SavedViewsService } from '../services/SavedViewsService';

export class Stage6Controller {
  // ==========================================
  // DOCUMENT INBOX & OCR
  // ==========================================

  public static async uploadDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const { filename, fileUrl, mimeType, fileSize, ocrData } = req.body;

      const doc = await DocumentInboxService.uploadDocument(orgId, {
        filename,
        fileUrl,
        mimeType,
        fileSize,
        uploadedBy: userId,
        ocrData,
      });

      res.status(201).json({ document: doc });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to upload document' });
    }
  }

  public static async listDocuments(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { status, search, linkedType, limit, offset } = req.query;

      const result = await DocumentInboxService.listDocuments(orgId, {
        status: status as string,
        search: search as string,
        linkedType: linkedType as string,
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list documents' });
    }
  }

  public static async getDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const doc = await DocumentInboxService.getDocument(orgId, req.params.id);
      res.json({ document: doc });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  }

  public static async deleteDocument(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const result = await DocumentInboxService.deleteDocument(orgId, req.params.id);
      res.json(result);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  }

  public static async processOcr(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { rawText } = req.body;
      const parsedData = await DocumentOcrService.processDocument(orgId, req.params.id, rawText);
      res.json({ ocrData: parsedData });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to process document OCR' });
    }
  }

  public static async convertToBill(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const bill = await DocumentOcrService.convertToDraftBill(orgId, req.params.id, req.body, userId);
      res.status(201).json({ bill });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to convert document to bill' });
    }
  }

  public static async convertToExpense(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const expense = await DocumentOcrService.convertToDraftExpense(orgId, req.params.id, req.body, userId);
      res.status(201).json({ expense });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to convert document to expense' });
    }
  }

  // ==========================================
  // CUSTOMER PORTAL
  // ==========================================

  public static async generatePortalToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { customerId, expiresInDays } = req.body;
      const result = await CustomerPortalService.generatePortalToken(orgId, customerId, expiresInDays);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to generate portal token' });
    }
  }

  public static async revokePortalTokens(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const result = await CustomerPortalService.revokePortalTokens(orgId, req.params.customerId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to revoke portal tokens' });
    }
  }

  public static async getPublicPortalContext(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const context = await CustomerPortalService.getPortalContext(token);
      res.json({ context });
    } catch (err: any) {
      const status = err.message.includes('expired') || err.message.includes('Invalid') ? 404 : 500;
      res.status(status).json({ error: err.message || 'Failed to load customer portal' });
    }
  }

  public static async getPublicPortalStatement(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { fromDate, toDate } = req.query;
      const statement = await CustomerPortalService.getPortalStatement(token, fromDate as string, toDate as string);
      res.json({ statement });
    } catch (err: any) {
      const status = err.message.includes('expired') || err.message.includes('Invalid') ? 404 : 500;
      res.status(status).json({ error: err.message || 'Failed to load portal statement' });
    }
  }

  public static async createPublicPortalCheckoutSession(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;
      const { invoiceId, amount, gateway, idempotencyKey } = req.body;
      const session = await CustomerPortalService.createPortalCheckoutSession(token, {
        invoiceId,
        amount: Number(amount),
        gateway,
        idempotencyKey,
      });
      res.status(201).json({ session });
    } catch (err: any) {
      const status = err.message.includes('expired') || err.message.includes('Invalid') ? 404 : 400;
      res.status(status).json({ error: err.message || 'Failed to create checkout session' });
    }
  }

  public static async getPublicPortalPaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { token, reference } = req.params;
      const status = await CustomerPortalService.getPortalPaymentStatus(token, reference);
      res.json({ paymentStatus: status });
    } catch (err: any) {
      const status = err.message.includes('expired') || err.message.includes('Invalid') ? 404 : 400;
      res.status(status).json({ error: err.message || 'Failed to fetch payment status' });
    }
  }

  public static async processPublicPortalPayment(_req: Request, res: Response): Promise<void> {
    res.status(501).json({
      error: 'Public /pay endpoint is permanently disabled. Payments must be processed through certified provider hosted checkout and confirmed solely via signed webhooks.',
      code: 'PUBLIC_PAYMENTS_DISABLED',
    });
  }

  // ==========================================
  // DATA MIGRATION & OPENING BALANCES
  // ==========================================

  public static async previewOpeningBalances(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { lines } = req.body;
      const preview = await DataMigrationService.previewOpeningBalances(orgId, lines);
      res.json({ preview });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to preview opening balances' });
    }
  }

  public static async postOpeningBalances(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const { asOfDate, lines, autoBalanceWithEquity } = req.body;

      const result = await DataMigrationService.postOpeningBalances(
        orgId,
        { asOfDate, lines, autoBalanceWithEquity },
        userId
      );

      res.status(201).json(result);
    } catch (err: any) {
      const status = err.message.includes('OUT_OF_BALANCE') || err.message.includes('VALIDATION_FAILED') ? 400 : 500;
      res.status(status).json({ error: err.message || 'Failed to post opening balances' });
    }
  }

  public static async importMasterData(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const { type, records } = req.body;
      const result = await DataMigrationService.importMasterData(orgId, type, records);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to import master data' });
    }
  }

  // ==========================================
  // SAVED VIEWS
  // ==========================================

  public static async listViews(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const { entityType } = req.query;
      const views = await SavedViewsService.listViews(orgId, userId, entityType as string);
      res.json({ views });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list saved views' });
    }
  }

  public static async createView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      const view = await SavedViewsService.createView(orgId, userId, req.body);
      res.status(201).json({ view });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to create saved view' });
    }
  }

  public static async deleteView(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const orgId = req.auth!.organizationId;
      const userId = req.auth!.userId;
      await SavedViewsService.deleteView(orgId, userId, req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  }
}
