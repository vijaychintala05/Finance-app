import { Router } from 'express';
import { FinanceController } from '../controllers/financeController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';

const router = Router();

// Accountant Workspace Overview
router.get('/accountant/overview', requirePermission('audit.view'), FinanceController.getAccountantOverview);

// Accounts & Transactions
router.get('/accounts', FinanceController.getAccounts);
router.post('/accounts', requirePermission('settings.manage'), FinanceController.createAccount);
router.get('/accounts/:id/transactions', FinanceController.getAccountTransactions);

// Clients, Customers & Vendors
router.get('/clients', FinanceController.getClients);
router.post('/clients', FinanceController.createClient);
router.get('/customers', FinanceController.getCustomers);
router.post('/customers', FinanceController.createCustomer);
router.get('/customers/:id/summary', FinanceController.getCustomerSummary);
router.get('/vendors', FinanceController.getVendors);
router.post('/vendors', FinanceController.createVendor);

// Estimates
router.get('/estimates', FinanceController.getEstimates);
router.post('/estimates', requirePermission('invoice.create'), FinanceController.createEstimate);
router.post('/estimates/:id/revise', requirePermission('invoice.create'), FinanceController.reviseEstimate);

// Sales Orders
router.get('/sales-orders', FinanceController.getSalesOrders);
router.post('/sales-orders', requirePermission('invoice.create'), FinanceController.createSalesOrder);

// Delivery Challans
router.get('/delivery-challans', FinanceController.getDeliveryChallans);
router.post('/delivery-challans', requirePermission('invoice.create'), FinanceController.createDeliveryChallan);

// Invoices
router.get('/invoices', FinanceController.getInvoices);
router.post('/invoices', requirePermission('invoice.create'), FinanceController.createInvoice);

// Payments Received & Advances
router.get('/payments-received', FinanceController.getPaymentsReceived);
router.post('/payments-received', FinanceController.recordPaymentReceived);
router.post('/customer-advances/apply', FinanceController.applyCustomerAdvance);

// Credit Notes, Refunds & Write-Offs
router.get('/credit-notes', FinanceController.getCreditNotes);
router.post('/credit-notes', requirePermission('invoice.create'), FinanceController.createCreditNote);
router.post('/credit-notes/apply', FinanceController.applyCreditNote);
router.post('/refunds', requirePermission('invoice.create'), FinanceController.recordRefund);
router.post('/write-offs', requirePermission('invoice.create'), FinanceController.recordWriteOff);

// AR Aging & Integrity Verifier
router.get('/ar-aging', FinanceController.getARAging);
router.get('/ar-integrity', FinanceController.getARIntegrity);
router.get('/integrity', FinanceController.getOrganizationIntegrity);

// Comprehensive Financial Reports & Statements
router.get('/reports/general-ledger', FinanceController.getGeneralLedgerReport);
router.get('/reports/trial-balance', FinanceController.getTrialBalance);
router.get('/reports/profit-loss', FinanceController.getProfitLoss);
router.get('/reports/balance-sheet', FinanceController.getBalanceSheet);
router.get('/reports/cash-flow', FinanceController.getCashFlow);
router.get('/reports/customer-statement/:customerId', FinanceController.getCustomerStatement);
router.get('/reports/vendor-statement/:vendorId', FinanceController.getVendorStatement);
router.get('/reports/ar-aging', FinanceController.getARAging);
router.get('/reports/ap-aging', FinanceController.getAPAging);

// Manual & Recurring Journals
router.get('/journals', FinanceController.getJournals);
router.post('/journals', requirePermission('accounting.post'), FinanceController.createJournal);
router.post('/journals/:id/reverse', requirePermission('accounting.post'), FinanceController.reverseJournal);
router.get('/recurring-journals', FinanceController.getRecurringJournals);
router.post('/recurring-journals', requirePermission('accounting.post'), FinanceController.createRecurringJournal);
router.post('/recurring-journals/generate', requirePermission('accounting.post'), FinanceController.generateDueRecurringJournals);

// Budgeting & Cash Forecasting
router.get('/budgets', FinanceController.getBudgets);
router.post('/budgets', requirePermission('settings.manage'), FinanceController.createBudget);
router.get('/reports/budget-vs-actual', FinanceController.getBudgetVsActual);
router.get('/cash-flow-forecast', FinanceController.getCashFlowForecast);

// Fixed Assets
router.get('/fixed-assets', FinanceController.getFixedAssets);
router.post('/fixed-assets', requirePermission('accounting.post'), FinanceController.createFixedAsset);
router.post('/fixed-assets/:id/depreciate', requirePermission('accounting.post'), FinanceController.depreciateFixedAsset);
router.post('/fixed-assets/:id/dispose', requirePermission('accounting.post'), FinanceController.disposeFixedAsset);

// Period Close Workspace
router.get('/period-close/validate', FinanceController.validatePeriodClose);
router.post('/period-close/close', requirePermission('settings.manage'), FinanceController.closePeriod);
router.post('/period-close/reopen', requirePermission('settings.manage'), FinanceController.reopenPeriod);

// Saved Reports
router.get('/saved-reports', FinanceController.getSavedReports);
router.post('/saved-reports', FinanceController.createSavedReport);
router.post('/saved-reports/:id/favorite', FinanceController.toggleFavoriteReport);

// Expenses
router.get('/expenses', FinanceController.getExpenses);
router.post('/expenses', requirePermission('expense.create'), FinanceController.createExpense);

// Bills
router.get('/bills', FinanceController.getBills);
router.post('/bills', requirePermission('bill.create'), FinanceController.createBill);

// Period Locks
router.get('/period-locks', FinanceController.getPeriodLocks);
router.post('/period-locks', requirePermission('settings.manage'), FinanceController.createPeriodLock);

// Audit Logs
router.get('/audit', requirePermission('audit.view'), FinanceController.getAuditLogs);

// LocalStorage Migration
router.post('/migration/import-localstorage', FinanceController.importLocalStorageData);

export default router;
