import { Router } from 'express';
import { BankingController } from '../controllers/bankingController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';

const router = Router();

// Accounts
router.get('/accounts', requirePermission('bank.statement.view'), BankingController.getAccounts);
router.post('/accounts', requirePermission('settings.manage'), BankingController.createAccount);

// Statement Imports
router.post('/accounts/:accountId/statements/import', requirePermission('bank.statement.import'), BankingController.importStatement);
router.post('/imports', requirePermission('bank.statement.import'), BankingController.importStatement);
router.get('/imports', requirePermission('bank.statement.view'), BankingController.getImports);

// Statement Transactions
router.get('/accounts/:accountId/transactions', requirePermission('bank.statement.view'), BankingController.getTransactions);
router.get('/transactions', requirePermission('bank.statement.view'), BankingController.getTransactions);

// Matching Engine & Suggestions
router.post('/reconciliation/match', requirePermission('bank.reconcile'), BankingController.matchTransaction);
router.post('/matches/suggestions', requirePermission('bank.statement.view'), BankingController.getSuggestions);
router.post('/matches', requirePermission('bank.reconcile'), BankingController.matchTransaction);
router.delete('/matches/:matchId', requirePermission('bank.reconcile.undo'), BankingController.unmatchTransaction);

// Rules
router.get('/rules', requirePermission('bank.statement.view'), BankingController.getRules);
router.post('/rules', requirePermission('bank.rule.create'), BankingController.createRule);
router.delete('/rules/:ruleId', requirePermission('bank.rule.manage'), BankingController.deleteRule);

// Reconciliation Session
router.get('/reconciliation/summary', requirePermission('bank.statement.view'), BankingController.getSummary);
router.post('/reconciliation/complete', requirePermission('bank.reconcile'), BankingController.completeSession);

export default router;
