import { Router } from 'express';
import { db } from '../database/db';
import { requirePermission, type AuthenticatedRequest } from '../middleware/organizationIsolation.middleware';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { RecurringTransactionService } from '../recurring';
import { SalesEngine } from '../sales/SalesEngine';
import { PurchasesEngine } from '../purchases/PurchasesEngine';
import { ExpensePostingService } from '../services/ExpensePostingService';

const router = Router();
router.use(requireTrustedFinanceFeature('recurring-transactions'));

function service(userId: string) {
  return new RecurringTransactionService({
    creators: {
      INVOICE: async (context) => {
        const invoice = await SalesEngine.createAndPostInvoice(context.organizationId, {
          ...(context.template as any),
          issueDate: context.scheduledFor,
          dueDate: (context.template as any).dueDate || context.scheduledFor,
          createdBy: userId,
        }, context.client);
        await context.client.query(
          'UPDATE invoices SET source_occurrence_key = $1 WHERE organization_id = $2 AND id = $3',
          [context.occurrenceKey, context.organizationId, invoice.id]
        );
        return { documentId: invoice.id, documentType: 'INVOICE' };
      },
      BILL: async (context) => {
        const bill = await PurchasesEngine.createAndPostBill(context.organizationId, {
          ...(context.template as any),
          billDate: context.scheduledFor,
          dueDate: (context.template as any).dueDate || context.scheduledFor,
        }, context.client);
        await context.client.query(
          'UPDATE bills SET source_occurrence_key = $1 WHERE organization_id = $2 AND id = $3',
          [context.occurrenceKey, context.organizationId, bill.id]
        );
        return { documentId: bill.id, documentType: 'BILL' };
      },
      EXPENSE: async (context) => {
        const expense = await ExpensePostingService.createAndPost(context.organizationId, userId, {
          ...(context.template as any),
          date: context.scheduledFor,
          sourceOccurrenceKey: context.occurrenceKey,
        }, context.client);
        return { documentId: expense.id, documentType: 'EXPENSE' };
      },
    },
  });
}

router.get('/profiles', requirePermission(['invoices.view', 'purchases.view', 'expenses.view']), async (req: AuthenticatedRequest, res) => {
  const result = await db.query(
    'SELECT * FROM recurring_transaction_profiles WHERE organization_id = $1 ORDER BY created_at DESC',
    [req.auth!.organizationId]
  );
  res.json(result.rows);
});
router.post('/profiles', requirePermission(['invoices.create', 'purchases.create', 'expenses.create']), async (req: AuthenticatedRequest, res) => {
  const profile = await service(req.auth!.userId).createProfile({
    ...req.body,
    organizationId: req.auth!.organizationId,
    createdBy: req.auth!.userId,
  });
  res.status(201).json(profile);
});
router.post('/profiles/:id/pause', requirePermission(['invoices.edit', 'purchases.create', 'expenses.create']), async (req: AuthenticatedRequest, res) => {
  res.json(await service(req.auth!.userId).pauseProfile(req.auth!.organizationId, req.params.id));
});
router.post('/profiles/:id/resume', requirePermission(['invoices.edit', 'purchases.create', 'expenses.create']), async (req: AuthenticatedRequest, res) => {
  res.json(await service(req.auth!.userId).resumeProfile(req.auth!.organizationId, req.params.id));
});
router.get('/occurrences', requirePermission(['invoices.view', 'purchases.view', 'expenses.view']), async (req: AuthenticatedRequest, res) => {
  const result = await db.query(
    'SELECT * FROM recurring_transaction_occurrences WHERE organization_id = $1 ORDER BY scheduled_for DESC, id DESC LIMIT 500',
    [req.auth!.organizationId]
  );
  res.json(result.rows);
});
router.post('/run', requirePermission('accounting.post'), async (req: AuthenticatedRequest, res) => {
  const runtime = service(req.auth!.userId);
  const asOfDate = String(req.body?.asOfDate || new Date().toISOString().slice(0, 10));
  const materialized = await runtime.materializeDueOccurrences({ asOfDate, organizationId: req.auth!.organizationId });
  const claims = await runtime.claimDueOccurrences({
    organizationId: req.auth!.organizationId,
    workerId: `manual:${req.auth!.userId}`,
    limit: Math.min(Number(req.body?.limit || 25), 100),
  });
  const completed = [];
  for (const claim of claims) completed.push(await runtime.executeClaim(claim));
  res.json({ materialized, claimed: claims.length, completed });
});

export default protectAsyncRoutes(router);
