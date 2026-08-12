import { Router } from 'express';
import { FinanceController } from '../controllers/financeController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';

const router = Router();

// Accountant Workspace Overview
router.get('/accountant/overview', requirePermission('audit.view'), requireTrustedFinanceFeature('accountant-overview'), FinanceController.getAccountantOverview);

// Accounts & Transactions
router.get('/accounts', requirePermission('accounting.view'), FinanceController.getAccounts);
router.post('/accounts', requirePermission('settings.manage_accounts'), FinanceController.createAccount);
router.get('/accounts/:id/transactions', requirePermission('accounting.view'), FinanceController.getAccountTransactions);

// Clients, Customers & Vendors
router.get('/clients', requirePermission(['invoices.view', 'purchases.view']), FinanceController.getClients);
router.post('/clients', requirePermission(['invoices.create', 'purchases.create']), FinanceController.createClient);
router.get('/customers', requirePermission(['invoices.view', 'purchases.view']), FinanceController.getCustomers);
router.post('/customers', requirePermission(['invoices.create', 'purchases.create']), FinanceController.createCustomer);
router.get('/customers/:id/summary', requirePermission(['invoices.view', 'purchases.view']), FinanceController.getCustomerSummary);
router.get('/vendors', requirePermission(['invoices.view', 'purchases.view']), FinanceController.getVendors);
router.post('/vendors', requirePermission(['invoices.create', 'purchases.create']), FinanceController.createVendor);

// Projects
router.get('/projects', requirePermission(['invoices.view', 'purchases.view']), FinanceController.getProjects);
router.post('/projects', requirePermission(['invoices.create', 'purchases.create']), FinanceController.createProject);

// Estimates
router.get('/estimates', requirePermission('invoices.view'), FinanceController.getEstimates);
router.post('/estimates', requirePermission('invoices.create'), FinanceController.createEstimate);
router.post('/estimates/:id/revise', requirePermission('invoices.edit'), FinanceController.reviseEstimate);

// Sales Orders
router.get('/sales-orders', requirePermission('invoices.view'), FinanceController.getSalesOrders);
router.post('/sales-orders', requirePermission('invoices.create'), FinanceController.createSalesOrder);

// Delivery Challans
router.get('/delivery-challans', requirePermission('invoices.view'), FinanceController.getDeliveryChallans);
router.post('/delivery-challans', requirePermission('invoices.create'), requireTrustedFinanceFeature('delivery-challans'), FinanceController.createDeliveryChallan);

// Invoices
router.get('/invoices', requirePermission('invoices.view'), FinanceController.getInvoices);
router.get('/invoices/:id', requirePermission('invoices.view'), FinanceController.getInvoice);
router.post('/invoices', requirePermission('invoices.create'), FinanceController.createInvoice);

// Payments Received & Advances
router.get('/payments-received', requirePermission('invoices.view'), FinanceController.getPaymentsReceived);
router.post('/payments-received', requirePermission('invoices.receive_payment'), FinanceController.recordPaymentReceived);
router.post('/customer-advances/apply', requirePermission('invoices.receive_payment'), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.applyCustomerAdvance);

// Credit Notes, Refunds & Write-Offs
router.get('/credit-notes', requirePermission('invoices.view'), FinanceController.getCreditNotes);
router.post('/credit-notes', requirePermission('invoices.create'), requireTrustedFinanceFeature('credit-notes'), FinanceController.createCreditNote);
router.post('/credit-notes/apply', requirePermission('invoices.edit'), requireTrustedFinanceFeature('credit-notes'), FinanceController.applyCreditNote);
router.post('/refunds', requirePermission('invoices.edit'), requireTrustedFinanceFeature('customer-refunds'), FinanceController.recordRefund);
router.post('/write-offs', requirePermission('invoices.delete'), requireTrustedFinanceFeature('receivable-write-offs'), FinanceController.recordWriteOff);

// AR Aging & Integrity Verifier
router.get('/ar-aging', requirePermission('reports.view'), FinanceController.getARAging);
router.get('/ar-integrity', requirePermission('audit.view'), FinanceController.getARIntegrity);
router.get('/integrity', requirePermission('audit.view'), FinanceController.getOrganizationIntegrity);

// Comprehensive Financial Reports & Statements
router.get('/reports/general-ledger', requirePermission('reports.view'), FinanceController.getGeneralLedgerReport);
router.get('/reports/trial-balance', requirePermission('reports.view'), FinanceController.getTrialBalance);
router.get('/reports/profit-loss', requirePermission('reports.view'), FinanceController.getProfitLoss);
router.get('/reports/balance-sheet', requirePermission('reports.view'), FinanceController.getBalanceSheet);
router.get('/reports/cash-flow', requirePermission('reports.view'), requireTrustedFinanceFeature('cash-flow-classification'), FinanceController.getCashFlow);
router.get('/reports/customer-statement/:customerId', requirePermission('reports.view'), requireTrustedFinanceFeature('customer-statements'), FinanceController.getCustomerStatement);
router.get('/reports/vendor-statement/:vendorId', requirePermission('reports.view'), requireTrustedFinanceFeature('vendor-statements'), FinanceController.getVendorStatement);
router.get('/reports/ar-aging', requirePermission('reports.view'), FinanceController.getARAging);
router.get('/reports/ap-aging', requirePermission('reports.view'), FinanceController.getAPAging);

// Manual & Recurring Journals
router.get('/journals', requirePermission('accounting.view'), FinanceController.getJournals);
router.post('/journals', requirePermission('accounting.post'), FinanceController.createJournal);
router.post('/journals/:id/reverse', requirePermission('accounting.post'), FinanceController.reverseJournal);
router.get('/recurring-journals', requirePermission('accounting.view'), FinanceController.getRecurringJournals);
router.post('/recurring-journals', requirePermission('accounting.post'), FinanceController.createRecurringJournal);
router.post('/recurring-journals/generate', requirePermission('accounting.post'), requireTrustedFinanceFeature('recurring-journal-generation'), FinanceController.generateDueRecurringJournals);

// Budgeting & Cash Forecasting
router.get('/budgets', requirePermission('reports.view'), FinanceController.getBudgets);
router.post('/budgets', requirePermission('settings.manage_budgets'), FinanceController.createBudget);
router.get('/reports/budget-vs-actual', requirePermission('reports.view'), requireTrustedFinanceFeature('budget-reporting'), FinanceController.getBudgetVsActual);
router.get('/cash-flow-forecast', requirePermission('reports.view'), requireTrustedFinanceFeature('cash-flow-forecasting'), FinanceController.getCashFlowForecast);

// Fixed Assets
router.get('/fixed-assets', requirePermission('accounting.view'), FinanceController.getFixedAssets);
router.post('/fixed-assets', requirePermission('accounting.post'), requireTrustedFinanceFeature('fixed-assets'), FinanceController.createFixedAsset);
router.post('/fixed-assets/:id/depreciate', requirePermission('accounting.post'), requireTrustedFinanceFeature('fixed-assets'), FinanceController.depreciateFixedAsset);
router.post('/fixed-assets/:id/dispose', requirePermission('accounting.post'), requireTrustedFinanceFeature('fixed-assets'), FinanceController.disposeFixedAsset);

// Period Close Workspace
router.get('/period-close/validate', requirePermission('accounting.view'), FinanceController.validatePeriodClose);
router.post('/period-close/close', requirePermission('settings.close_period'), requireTrustedFinanceFeature('period-close'), FinanceController.closePeriod);
router.post('/period-close/reopen', requirePermission('settings.close_period'), requireTrustedFinanceFeature('period-close'), FinanceController.reopenPeriod);

// Saved Reports
router.get('/saved-reports', requirePermission('reports.view'), FinanceController.getSavedReports);
router.post('/saved-reports', requirePermission('reports.view'), FinanceController.createSavedReport);
router.post('/saved-reports/:id/favorite', requirePermission('reports.view'), FinanceController.toggleFavoriteReport);

// Expenses
router.get('/expenses', requirePermission('expenses.view'), FinanceController.getExpenses);
router.post('/expenses', requirePermission('expenses.create'), FinanceController.createExpense);

// Bills
router.get('/bills', requirePermission('purchases.view'), FinanceController.getBills);
router.post('/bills', requirePermission('purchases.create'), FinanceController.createBill);

// Period Locks
router.get('/period-locks', requirePermission('accounting.view'), FinanceController.getPeriodLocks);
router.post('/period-locks', requirePermission('settings.close_period'), FinanceController.createPeriodLock);

// Audit Logs
router.get('/audit', requirePermission('audit.view'), FinanceController.getAuditLogs);

// Raw browser-state imports are intentionally not exposed in the live API. A
// financial migration must run through a validated, reconciling import job.

export default protectAsyncRoutes(router);
