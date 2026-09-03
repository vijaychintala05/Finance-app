import { Router } from 'express';
import { BankingController } from '../controllers/bankingController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';

const router = Router();

// Accounts
router.get('/accounts', requirePermission('banking.view'), BankingController.getAccounts);
router.post('/accounts', requirePermission('settings.manage_accounts'), BankingController.createAccount);

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

export default protectAsyncRoutes(router);
