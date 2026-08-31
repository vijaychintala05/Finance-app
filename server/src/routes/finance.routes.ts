import { Router } from 'express';
import { FinanceController } from '../controllers/financeController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';

const router = Router();

// Accountant Workspace Overview
router.get('/accountant/overview', requirePermission('audit.view'), requireTrustedFinanceFeature('accountant-overview'), FinanceController.getAccountantOverview);
router.get('/gst/return-summary', requirePermission('reports.view'), FinanceController.getGSTReturnSummary);

// Accounts & Transactions
router.get('/accounts', requirePermission('accounting.view'), FinanceController.getAccounts);
router.post('/accounts', requirePermission('settings.manage_accounts'), FinanceController.createAccount);
router.patch('/accounts/:id', requirePermission('settings.manage_accounts'), FinanceController.updateAccount);
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
router.get('/project-summaries', requirePermission(['invoices.view', 'purchases.view']), FinanceController.getProjectSummaries);
router.get('/time-entries', requirePermission('invoices.view'), FinanceController.getTimeEntries);
router.post('/time-entries', requirePermission('invoices.create'), FinanceController.createTimeEntry);
router.put('/time-entries/:id', requirePermission('invoices.edit'), FinanceController.updateTimeEntry);
router.delete('/time-entries/:id', requirePermission('invoices.edit'), FinanceController.deleteTimeEntry);
router.post('/projects/:id/invoice-unbilled-time', requirePermission('invoices.create'), FinanceController.invoiceUnbilledTime);

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
router.post('/payments-received/:id/reverse', requirePermission('invoices.receive_payment'), FinanceController.reversePaymentReceived);
router.get('/customer-advances', requirePermission('invoices.view'), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.getCustomerAdvances);
router.get('/customer-advance-applications', requirePermission('invoices.view'), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.getCustomerAdvanceApplications);
router.post('/customer-advances/apply', requirePermission('invoices.receive_payment'), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.applyCustomerAdvance);
router.post('/customer-advance-applications/:id/reverse', requirePermission('invoices.receive_payment'), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.reverseCustomerAdvanceApplication);

// Credit Notes, Refunds & Write-Offs
router.get('/credit-notes', requirePermission('invoices.view'), FinanceController.getCreditNotes);
router.post('/credit-notes', requirePermission('invoices.create'), requireTrustedFinanceFeature('credit-notes'), FinanceController.createCreditNote);
router.post('/credit-notes/apply', requirePermission('invoices.edit'), requireTrustedFinanceFeature('credit-notes'), FinanceController.applyCreditNote);
router.post('/credit-notes/:id/reverse', requirePermission('invoices.edit'), requireTrustedFinanceFeature('credit-notes'), FinanceController.reverseCreditNote);
router.post('/refunds', requirePermission('invoices.edit'), requireTrustedFinanceFeature('customer-refunds'), FinanceController.recordRefund);
router.get('/refunds', requirePermission('invoices.view'), requireTrustedFinanceFeature('customer-refunds'), FinanceController.getCustomerRefunds);
router.post('/refunds/:id/reverse', requirePermission('invoices.edit'), requireTrustedFinanceFeature('customer-refunds'), FinanceController.reverseCustomerRefund);
router.post('/write-offs', requirePermission('invoices.delete'), requireTrustedFinanceFeature('receivable-write-offs'), FinanceController.recordWriteOff);
router.get('/write-offs', requirePermission('invoices.view'), requireTrustedFinanceFeature('receivable-write-offs'), FinanceController.getReceivableWriteOffs);
router.post('/write-offs/:id/reverse', requirePermission('invoices.delete'), requireTrustedFinanceFeature('receivable-write-offs'), FinanceController.reverseReceivableWriteOff);

// Vendor Payments, Advances, Credits & Write-Offs
router.get('/vendor-payments', requirePermission('purchases.view'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.getVendorPayments);
router.post('/vendor-payments', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.recordVendorPayment);
router.post('/vendor-payments/:id/reverse', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.reverseVendorPayment);
router.get('/vendor-advances', requirePermission('purchases.view'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.getVendorAdvances);
router.get('/vendor-advance-applications', requirePermission('purchases.view'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.getVendorAdvanceApplications);
router.post('/vendor-advances', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.recordVendorAdvance);
router.post('/vendor-advances/:id/reverse', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.reverseVendorAdvance);
router.post('/vendor-advances/apply', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.applyVendorAdvance);
router.post('/vendor-advance-applications/:id/reverse', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.reverseVendorAdvanceApplication);
router.get('/debit-notes', requirePermission('purchases.view'), requireTrustedFinanceFeature('vendor-credits'), FinanceController.getDebitNotes);
router.post('/debit-notes', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-credits'), FinanceController.createDebitNote);
router.post('/debit-notes/:id/reverse', requirePermission('purchases.create'), requireTrustedFinanceFeature('vendor-credits'), FinanceController.reverseVendorCredit);
router.post('/ap-write-offs', requirePermission('purchases.create'), requireTrustedFinanceFeature('payable-write-offs'), FinanceController.recordAPWriteOff);
router.get('/ap-write-offs', requirePermission('purchases.view'), requireTrustedFinanceFeature('payable-write-offs'), FinanceController.getPayableWriteOffs);
router.post('/ap-write-offs/:id/reverse', requirePermission('purchases.create'), requireTrustedFinanceFeature('payable-write-offs'), FinanceController.reversePayableWriteOff);

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
router.post('/journals/bulk', requirePermission('accounting.post'), FinanceController.createBulkJournals);
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
router.post('/fixed-assets/:id/depreciation/reverse', requirePermission('accounting.post'), requireTrustedFinanceFeature('fixed-assets'), FinanceController.reverseFixedAssetDepreciation);
router.post('/fixed-assets/:id/disposal/reverse', requirePermission('accounting.post'), requireTrustedFinanceFeature('fixed-assets'), FinanceController.reverseFixedAssetDisposal);

// Period Close Workspace
router.get('/period-close/validate', requirePermission('accounting.view'), FinanceController.validatePeriodClose);
router.get('/period-close/workspace', requirePermission('accounting.view'), FinanceController.getPeriodCloseWorkspace);
router.put('/period-close/review', requirePermission('settings.close_period'), FinanceController.savePeriodCloseReview);
router.post('/period-close/close', requirePermission('settings.close_period'), requireTrustedFinanceFeature('period-close'), FinanceController.closePeriod);
router.post('/period-close/reopen', requirePermission('settings.close_period'), requireTrustedFinanceFeature('period-close'), FinanceController.reopenPeriod);

// Saved Reports
router.get('/saved-reports', requirePermission('reports.view'), FinanceController.getSavedReports);
router.post('/saved-reports', requirePermission('reports.view'), FinanceController.createSavedReport);
router.post('/saved-reports/:id/favorite', requirePermission('reports.view'), FinanceController.toggleFavoriteReport);

// Expenses
router.get('/expenses', requirePermission('expenses.view'), FinanceController.getExpenses);
router.post('/expenses', requirePermission('expenses.create'), FinanceController.createExpense);
router.get('/expenses/:id/receipts/:receiptId', requirePermission('expenses.view'), FinanceController.getExpenseReceipt);
router.post('/expenses/:id/void', requirePermission('expenses.create'), FinanceController.voidExpense);

// Bills
router.get('/bills', requirePermission('purchases.view'), FinanceController.getBills);
router.post('/bills', requirePermission('purchases.create'), FinanceController.createBill);
router.post('/bills/:id/void', requirePermission('purchases.create'), FinanceController.voidBill);

// Period Locks
router.get('/period-locks', requirePermission('accounting.view'), FinanceController.getPeriodLocks);
router.post('/period-locks', requirePermission('settings.close_period'), FinanceController.createPeriodLock);

// Audit Logs
router.get('/audit', requirePermission('audit.view'), FinanceController.getAuditLogs);

// Raw browser-state imports are intentionally not exposed in the live API. A
// financial migration must run through a validated, reconciling import job.

export default protectAsyncRoutes(router);
