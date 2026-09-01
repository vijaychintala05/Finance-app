import { Router } from 'express';
import { FinanceController } from '../controllers/financeController';
import { requirePermission } from '../middleware/organizationIsolation.middleware';
import { protectAsyncRoutes } from './asyncRouter';
import { requireTrustedFinanceFeature } from '../middleware/trustedFeature.middleware';

const router = Router();

// Accountant Workspace Overview
router.get('/accountant/overview', requirePermission(['audit.view', 'reports.audit']), requireTrustedFinanceFeature('accountant-overview'), FinanceController.getAccountantOverview);
router.get('/gst/return-summary', requirePermission(['reports.gst', 'reports.view']), FinanceController.getGSTReturnSummary);

// Accounts & Transactions
router.get('/accounts', requirePermission(['accounts.view', 'accounting.view']), FinanceController.getAccounts);
router.get('/accounting-defaults', requirePermission(['accounts.view', 'accounting.view']), FinanceController.getAccountingDefaults);
router.patch('/accounting-defaults/:systemRole', requirePermission(['accounts.edit', 'settings.manage_accounts']), FinanceController.updateAccountingDefault);
router.post('/accounts', requirePermission(['accounts.create', 'settings.manage_accounts']), FinanceController.createAccount);
router.patch('/accounts/:id', requirePermission(['accounts.edit', 'settings.manage_accounts']), FinanceController.updateAccount);
router.get('/accounts/:id/transactions', requirePermission(['accounts.view', 'accounting.view']), FinanceController.getAccountTransactions);

// Clients, Customers & Vendors
router.get('/clients', requirePermission(['customers.view', 'invoices.view']), FinanceController.getClients);
router.post('/clients', requirePermission(['customers.create', 'invoices.create']), FinanceController.createClient);
router.get('/customers', requirePermission(['customers.view', 'invoices.view']), FinanceController.getCustomers);
router.post('/customers', requirePermission(['customers.create', 'invoices.create']), FinanceController.createCustomer);
router.get('/customers/:id/summary', requirePermission(['customers.view', 'invoices.view']), FinanceController.getCustomerSummary);
router.get('/vendors', requirePermission(['vendors.view', 'purchases.view']), FinanceController.getVendors);
router.post('/vendors', requirePermission(['vendors.create', 'purchases.create']), FinanceController.createVendor);

// Projects
router.get('/projects', requirePermission(['projects.view', 'invoices.view']), FinanceController.getProjects);
router.post('/projects', requirePermission(['projects.create', 'invoices.create']), FinanceController.createProject);
router.get('/project-summaries', requirePermission(['projects.view', 'invoices.view']), FinanceController.getProjectSummaries);
router.get('/time-entries', requirePermission(['projects.time_entries', 'projects.view', 'invoices.view']), FinanceController.getTimeEntries);
router.post('/time-entries', requirePermission(['projects.time_entries', 'invoices.create']), FinanceController.createTimeEntry);
router.put('/time-entries/:id', requirePermission(['projects.edit', 'invoices.edit']), FinanceController.updateTimeEntry);
router.delete('/time-entries/:id', requirePermission(['projects.edit', 'invoices.edit']), FinanceController.deleteTimeEntry);
router.post('/projects/:id/invoice-unbilled-time', requirePermission(['projects.invoice_time', 'invoices.create']), FinanceController.invoiceUnbilledTime);

// Estimates
router.get('/estimates', requirePermission(['estimates.view', 'invoices.view']), FinanceController.getEstimates);
router.post('/estimates', requirePermission(['estimates.create', 'invoices.create']), FinanceController.createEstimate);
router.post('/estimates/:id/revise', requirePermission(['estimates.edit', 'invoices.edit']), FinanceController.reviseEstimate);

// Sales Orders
router.get('/sales-orders', requirePermission(['sales_orders.view', 'invoices.view']), FinanceController.getSalesOrders);
router.post('/sales-orders', requirePermission(['sales_orders.create', 'invoices.create']), FinanceController.createSalesOrder);

// Delivery Challans
router.get('/delivery-challans', requirePermission(['delivery_challans.view', 'invoices.view']), FinanceController.getDeliveryChallans);
router.post('/delivery-challans', requirePermission(['delivery_challans.create', 'invoices.create']), requireTrustedFinanceFeature('delivery-challans'), FinanceController.createDeliveryChallan);

// Invoices
router.get('/invoices', requirePermission(['invoices.view']), FinanceController.getInvoices);
router.get('/invoices/:id', requirePermission(['invoices.view']), FinanceController.getInvoice);
router.post('/invoices', requirePermission(['invoices.create']), FinanceController.createInvoice);
router.post('/invoices/:id/post-approved', requirePermission(['invoices.create', 'accounting.post']), FinanceController.postApprovedInvoice);

// Payments Received & Advances
router.get('/payments-received', requirePermission(['customer_payments.view', 'invoices.view']), FinanceController.getPaymentsReceived);
router.post('/payments-received', requirePermission(['customer_payments.create', 'invoices.receive_payment']), FinanceController.recordPaymentReceived);
router.post('/payments-received/:id/post-approved', requirePermission(['customer_payments.create', 'invoices.receive_payment', 'accounting.post']), FinanceController.postApprovedPaymentReceived);
router.post('/payments-received/:id/reverse', requirePermission(['customer_payments.reverse', 'invoices.receive_payment']), FinanceController.reversePaymentReceived);
router.get('/customer-advances', requirePermission(['customer_payments.view', 'invoices.view']), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.getCustomerAdvances);
router.get('/customer-advance-applications', requirePermission(['customer_payments.view', 'invoices.view']), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.getCustomerAdvanceApplications);
router.post('/customer-advances/apply', requirePermission(['customer_payments.allocate', 'invoices.receive_payment']), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.applyCustomerAdvance);
router.post('/customer-advance-applications/:id/reverse', requirePermission(['customer_payments.reverse', 'invoices.receive_payment']), requireTrustedFinanceFeature('customer-advance-application'), FinanceController.reverseCustomerAdvanceApplication);

// Credit Notes, Refunds & Write-Offs
router.get('/credit-notes', requirePermission(['credit_notes.view', 'invoices.view']), FinanceController.getCreditNotes);
router.post('/credit-notes', requirePermission(['credit_notes.create', 'invoices.create']), requireTrustedFinanceFeature('credit-notes'), FinanceController.createCreditNote);
router.post('/credit-notes/apply', requirePermission(['credit_notes.apply', 'invoices.edit']), requireTrustedFinanceFeature('credit-notes'), FinanceController.applyCreditNote);
router.post('/credit-notes/:id/reverse', requirePermission(['credit_notes.void', 'invoices.edit']), requireTrustedFinanceFeature('credit-notes'), FinanceController.reverseCreditNote);
router.post('/refunds', requirePermission(['credit_notes.refund', 'invoices.edit']), requireTrustedFinanceFeature('customer-refunds'), FinanceController.recordRefund);
router.get('/refunds', requirePermission(['credit_notes.view', 'invoices.view']), requireTrustedFinanceFeature('customer-refunds'), FinanceController.getCustomerRefunds);
router.post('/refunds/:id/reverse', requirePermission(['credit_notes.void', 'invoices.edit']), requireTrustedFinanceFeature('customer-refunds'), FinanceController.reverseCustomerRefund);
router.post('/write-offs', requirePermission('invoices.write_off'), requireTrustedFinanceFeature('receivable-write-offs'), FinanceController.recordWriteOff);
router.get('/write-offs', requirePermission(['invoices.view']), requireTrustedFinanceFeature('receivable-write-offs'), FinanceController.getReceivableWriteOffs);
router.post('/write-offs/:id/reverse', requirePermission('invoices.write_off'), requireTrustedFinanceFeature('receivable-write-offs'), FinanceController.reverseReceivableWriteOff);

// Vendor Payments, Advances, Credits & Write-Offs
router.get('/vendor-payments', requirePermission(['vendor_payments.view', 'purchases.view']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.getVendorPayments);
router.post('/vendor-payments', requirePermission(['vendor_payments.create', 'purchases.pay']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.recordVendorPayment);
router.post('/vendor-payments/:id/post-approved', requirePermission(['vendor_payments.create', 'purchases.pay', 'accounting.post']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.postApprovedVendorPayment);
router.post('/vendor-payments/:id/reverse', requirePermission(['vendor_payments.reverse', 'purchases.pay']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.reverseVendorPayment);
router.get('/vendor-advances', requirePermission(['vendor_advances.view', 'purchases.view']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.getVendorAdvances);
router.get('/vendor-advance-applications', requirePermission(['vendor_advances.view', 'purchases.view']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.getVendorAdvanceApplications);
router.post('/vendor-advances', requirePermission(['vendor_advances.create', 'purchases.create']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.recordVendorAdvance);
router.post('/vendor-advances/:id/reverse', requirePermission(['vendor_advances.reverse', 'purchases.create']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.reverseVendorAdvance);
router.post('/vendor-advances/apply', requirePermission(['vendor_advances.apply', 'purchases.pay']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.applyVendorAdvance);
router.post('/vendor-advance-applications/:id/reverse', requirePermission(['vendor_advances.reverse', 'purchases.pay']), requireTrustedFinanceFeature('vendor-settlements'), FinanceController.reverseVendorAdvanceApplication);
router.get('/debit-notes', requirePermission(['vendor_credits.view', 'purchases.view']), requireTrustedFinanceFeature('vendor-credits'), FinanceController.getDebitNotes);
router.post('/debit-notes', requirePermission(['vendor_credits.create', 'purchases.create']), requireTrustedFinanceFeature('vendor-credits'), FinanceController.createDebitNote);
router.post('/debit-notes/:id/reverse', requirePermission(['vendor_credits.void', 'purchases.create']), requireTrustedFinanceFeature('vendor-credits'), FinanceController.reverseVendorCredit);
router.post('/ap-write-offs', requirePermission(['bills.void', 'purchases.create']), requireTrustedFinanceFeature('payable-write-offs'), FinanceController.recordAPWriteOff);
router.get('/ap-write-offs', requirePermission(['bills.view', 'purchases.view']), requireTrustedFinanceFeature('payable-write-offs'), FinanceController.getPayableWriteOffs);
router.post('/ap-write-offs/:id/reverse', requirePermission(['bills.void', 'purchases.create']), requireTrustedFinanceFeature('payable-write-offs'), FinanceController.reversePayableWriteOff);

// AR Aging & Integrity Verifier
router.get('/ar-aging', requirePermission(['reports.receivables', 'reports.view']), FinanceController.getARAging);
router.get('/ar-integrity', requirePermission(['reports.audit', 'audit.view']), FinanceController.getARIntegrity);
router.get('/integrity', requirePermission(['reports.audit', 'audit.view']), FinanceController.getOrganizationIntegrity);

// Comprehensive Financial Reports & Statements
router.get('/reports/general-ledger', requirePermission(['reports.financial_statements', 'reports.view']), FinanceController.getGeneralLedgerReport);
router.get('/reports/trial-balance', requirePermission(['reports.financial_statements', 'reports.view']), FinanceController.getTrialBalance);
router.get('/reports/profit-loss', requirePermission(['reports.financial_statements', 'reports.view']), FinanceController.getProfitLoss);
router.get('/reports/balance-sheet', requirePermission(['reports.financial_statements', 'reports.view']), FinanceController.getBalanceSheet);
router.get('/reports/cash-flow', requirePermission(['reports.financial_statements', 'reports.view']), requireTrustedFinanceFeature('cash-flow-classification'), FinanceController.getCashFlow);
router.get('/reports/customer-statement/:customerId', requirePermission(['reports.receivables', 'reports.view']), requireTrustedFinanceFeature('customer-statements'), FinanceController.getCustomerStatement);
router.get('/reports/vendor-statement/:vendorId', requirePermission(['reports.payables', 'reports.view']), requireTrustedFinanceFeature('vendor-statements'), FinanceController.getVendorStatement);
router.get('/reports/ar-aging', requirePermission(['reports.receivables', 'reports.view']), FinanceController.getARAging);
router.get('/reports/ap-aging', requirePermission(['reports.payables', 'reports.view']), FinanceController.getAPAging);

// Manual & Recurring Journals
router.get('/journals', requirePermission(['journals.view', 'accounting.view']), FinanceController.getJournals);
router.post('/journals', requirePermission(['journals.post', 'accounting.post']), FinanceController.createJournal);
router.post('/journals/:id/post-approved', requirePermission(['journals.post', 'accounting.post']), FinanceController.postApprovedJournal);
router.post('/journals/bulk', requirePermission(['journals.post', 'accounting.post']), FinanceController.createBulkJournals);
router.post('/journals/:id/reverse', requirePermission(['journals.reverse', 'accounting.post']), FinanceController.reverseJournal);
router.get('/recurring-journals', requirePermission(['journals.view', 'accounting.view']), FinanceController.getRecurringJournals);
router.post('/recurring-journals', requirePermission(['journals.post', 'accounting.post']), FinanceController.createRecurringJournal);
router.post('/recurring-journals/generate', requirePermission(['journals.post', 'accounting.post']), requireTrustedFinanceFeature('recurring-journal-generation'), FinanceController.generateDueRecurringJournals);

// Budgeting & Cash Forecasting
router.get('/budgets', requirePermission(['reports.view']), FinanceController.getBudgets);
router.post('/budgets', requirePermission(['settings.manage_budgets', 'reports.view']), FinanceController.createBudget);
router.get('/reports/budget-vs-actual', requirePermission(['reports.view']), requireTrustedFinanceFeature('budget-reporting'), FinanceController.getBudgetVsActual);
router.get('/cash-flow-forecast', requirePermission(['reports.bank', 'reports.view']), requireTrustedFinanceFeature('cash-flow-forecasting'), FinanceController.getCashFlowForecast);

// Fixed Assets
router.get('/fixed-assets', requirePermission(['fixed_assets.view', 'accounting.view']), FinanceController.getFixedAssets);
router.post('/fixed-assets', requirePermission(['fixed_assets.manage', 'accounting.post']), requireTrustedFinanceFeature('fixed-assets'), FinanceController.createFixedAsset);
router.post('/fixed-assets/:id/depreciate', requirePermission(['fixed_assets.manage', 'accounting.post']), requireTrustedFinanceFeature('fixed-assets'), FinanceController.depreciateFixedAsset);
router.post('/fixed-assets/:id/dispose', requirePermission(['fixed_assets.manage', 'accounting.post']), requireTrustedFinanceFeature('fixed-assets'), FinanceController.disposeFixedAsset);
router.post('/fixed-assets/:id/depreciation/reverse', requirePermission(['fixed_assets.manage', 'accounting.post']), requireTrustedFinanceFeature('fixed-assets'), FinanceController.reverseFixedAssetDepreciation);
router.post('/fixed-assets/:id/disposal/reverse', requirePermission(['fixed_assets.manage', 'accounting.post']), requireTrustedFinanceFeature('fixed-assets'), FinanceController.reverseFixedAssetDisposal);

// Period Close Workspace
router.get('/period-close/validate', requirePermission(['periods.view', 'accounting.view']), FinanceController.validatePeriodClose);
router.get('/period-close/workspace', requirePermission(['periods.view', 'accounting.view']), FinanceController.getPeriodCloseWorkspace);
router.put('/period-close/review', requirePermission(['periods.close', 'settings.close_period']), FinanceController.savePeriodCloseReview);
router.post('/period-close/close', requirePermission(['periods.close', 'settings.close_period']), requireTrustedFinanceFeature('period-close'), FinanceController.closePeriod);
router.post('/period-close/reopen', requirePermission('periods.unlock'), requireTrustedFinanceFeature('period-close'), FinanceController.reopenPeriod);

// Saved Reports
router.get('/saved-reports', requirePermission(['reports.view']), FinanceController.getSavedReports);
router.post('/saved-reports', requirePermission(['reports.view']), FinanceController.createSavedReport);
router.post('/saved-reports/:id/favorite', requirePermission(['reports.view']), FinanceController.toggleFavoriteReport);

// Expenses
router.get('/expenses', requirePermission(['expenses.view']), FinanceController.getExpenses);
router.post('/expenses', requirePermission(['expenses.create']), FinanceController.createExpense);
router.get('/expenses/:id/receipts/:receiptId', requirePermission(['expenses.view', 'expenses.attach_receipt']), FinanceController.getExpenseReceipt);
router.post('/expenses/:id/void', requirePermission(['expenses.void', 'expenses.create']), FinanceController.voidExpense);

// Bills
router.get('/bills', requirePermission(['bills.view', 'purchases.view']), FinanceController.getBills);
router.post('/bills', requirePermission(['bills.create', 'purchases.create']), FinanceController.createBill);
router.post('/bills/:id/post-approved', requirePermission(['bills.create', 'purchases.create', 'accounting.post']), FinanceController.postApprovedBill);
router.post('/bills/:id/void', requirePermission(['bills.void', 'purchases.delete']), FinanceController.voidBill);

// Period Locks
router.get('/period-locks', requirePermission(['periods.view', 'accounting.view']), FinanceController.getPeriodLocks);
router.post('/period-locks', requirePermission(['periods.lock', 'settings.close_period']), FinanceController.createPeriodLock);

// Audit Logs
router.get('/audit', requirePermission(['audit.view', 'reports.audit']), FinanceController.getAuditLogs);

export default protectAsyncRoutes(router);
