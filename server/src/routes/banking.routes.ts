import { Router } from 'express';
import { BankingController } from '../controllers/bankingController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';
import { BankFeedSyncService } from '../banking/BankFeedSyncService';

const router = Router();

// Accounts
router.get('/accounts', requirePermission('banking.view'), BankingController.getAccounts);
router.post('/accounts', requirePermission('settings.manage_accounts'), BankingController.createAccount);
router.delete('/accounts/:accountId', requirePermission(['settings.manage_accounts', 'accounts.delete']), BankingController.deleteAccount);

// Statement Imports
router.post('/accounts/:accountId/statements/import', requirePermission('banking.import'), requireTrustedFinanceFeature('bank-statement-import'), BankingController.importStatement);
router.post('/imports', requirePermission('banking.import'), requireTrustedFinanceFeature('bank-statement-import'), BankingController.importStatement);
router.get('/imports', requirePermission('banking.view'), BankingController.getImports);

// Statement Transactions
router.get('/accounts/:accountId/transactions', requirePermission('banking.view'), BankingController.getTransactions);
router.get('/transactions', requirePermission('banking.view'), BankingController.getTransactions);

// Matching Engine & Suggestions
router.post('/reconciliation/match', requirePermission('banking.reconcile'), requireTrustedFinanceFeature('bank-reconciliation'), BankingController.matchTransaction);
router.post('/matches/suggestions', requirePermission('banking.view'), BankingController.getSuggestions);
router.post('/matches', requirePermission('banking.reconcile'), requireTrustedFinanceFeature('bank-reconciliation'), BankingController.matchTransaction);
router.delete('/matches/:matchId', requirePermission('banking.unreconcile'), requireTrustedFinanceFeature('bank-reconciliation'), BankingController.unmatchTransaction);

// Rules
router.get('/rules', requirePermission('banking.view'), BankingController.getRules);
router.post('/rules', requirePermission('banking.rules.manage'), requireTrustedFinanceFeature('bank-rules'), BankingController.createRule);
router.delete('/rules/:ruleId', requirePermission('banking.rules.manage'), requireTrustedFinanceFeature('bank-rules'), BankingController.deleteRule);

// Reconciliation Session
router.get('/reconciliation/summary', requirePermission('banking.view'), BankingController.getSummary);
router.post('/reconciliation/complete', requirePermission('banking.reconcile'), requireTrustedFinanceFeature('bank-reconciliation'), BankingController.completeSession);

// Bank Feeds (Sync, Connect, Status)
router.post('/feeds/connect', requirePermission('banking.rules.manage'), async (req: any, res: any) => {
  const conn = await BankFeedSyncService.connectFeed(req.organizationId!, req.body.bankAccountId, req.body.provider, req.body.credentials);
  res.status(201).json(conn);
});
router.get('/feeds/:bankAccountId', requirePermission('banking.view'), async (req: any, res: any) => {
  const conn = await BankFeedSyncService.getFeedConnection(req.organizationId!, req.params.bankAccountId);
  res.json({ connection: conn });
});
router.post('/feeds/:bankAccountId/sync', requirePermission('banking.import'), async (req: any, res: any) => {
  const result = await BankFeedSyncService.syncFeed(req.organizationId!, req.params.bankAccountId, req.body?.provider);
  res.json(result);
});

export default protectAsyncRoutes(router);
