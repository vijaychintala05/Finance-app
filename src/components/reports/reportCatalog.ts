import { ReportCategory, ReportItem } from './reportTypes';

type CatalogEntry = [id: string, name: string, category: ReportCategory, description: string, favorite?: boolean];

const entries: CatalogEntry[] = [
  ['pnl_standard', 'Profit and Loss', 'Business Overview', 'Income, direct costs and expenses from posted journal lines.', true],
  ['comparative_profit_loss', 'Comparative Profit and Loss', 'Business Overview', 'Compare the selected period with the immediately preceding period.', true],
  ['balance_sheet_standard', 'Balance Sheet', 'Business Overview', 'Assets, liabilities, equity and current earnings as of a selected date.', true],
  ['comparative_balance_sheet', 'Comparative Balance Sheet', 'Business Overview', 'Compare current balances with the same date one year earlier.'],
  ['cash_flow_statement', 'Cash Flow Statement', 'Business Overview', 'Operating, investing and financing cash movements from posted journals.', true],
  ['movement_of_equity', 'Movement of Equity', 'Business Overview', 'Opening equity, period movements and closing equity.'],
  ['business_ratio_analysis', 'Business Ratio Analysis', 'Business Overview', 'Profitability, return and leverage ratios derived from financial statements.'],
  ['budget_vs_actual', 'Budget vs Actual', 'Business Overview', 'Approved budget compared with posted ledger actuals.'],
  ['cash_flow_forecast', 'Cash Flow Forecast', 'Business Overview', 'Ninety-day cash projection based on open invoices and bills.'],
  ['sales_by_customer', 'Sales by Customer', 'Sales', 'Invoice value, collections and balances grouped by customer.', true],
  ['sales_by_item', 'Sales by Item', 'Sales', 'Quantity, sales value and average price by item or service.'],
  ['sales_by_salesperson', 'Sales by Salesperson', 'Sales', 'Invoice value and collections attributed to salespeople.'],
  ['invoice_details', 'Invoice Details', 'Sales', 'Detailed invoice register with tax, receipts and balances.', true],
  ['payments_received', 'Payments Received', 'Payments Received', 'Customer receipts, deposit accounts and unallocated amounts.', true],
  ['time_to_get_paid', 'Time to Get Paid', 'Receivables', 'Elapsed days from invoice issue to allocated customer payment.'],
  ['customer_balance_summary', 'Customer Balance Summary', 'Receivables', 'Open invoice balances summarized by customer.'],
  ['aged_receivables', 'Accounts Receivable Aging', 'Receivables', 'Open customer balances reconciled against the AR control account.', true],
  ['expense_details', 'Expense Details', 'Purchases and Expenses', 'Paid expenses with account, vendor, project, tax and billing status.', true],
  ['expenses_by_category', 'Expenses by Category', 'Purchases and Expenses', 'Paid expenses grouped by chart-of-account category.'],
  ['expenses_by_vendor', 'Expenses by Vendor', 'Purchases and Expenses', 'Paid expenses grouped by vendor.'],
  ['expenses_by_project', 'Expenses by Project', 'Purchases and Expenses', 'Paid expenses grouped by project.'],
  ['billable_expense_details', 'Billable Expense Details', 'Purchases and Expenses', 'Customer-chargeable expenses and invoicing status.'],
  ['bill_details', 'Bill Details', 'Purchases and Expenses', 'Detailed vendor bill register with payments and balances.', true],
  ['purchases_by_vendor', 'Purchases by Vendor', 'Purchases and Expenses', 'Vendor bill value, payments and balances grouped by vendor.'],
  ['payments_made', 'Payments Made', 'Payables', 'Vendor settlements, payment accounts and unallocated amounts.'],
  ['vendor_balance_summary', 'Vendor Balance Summary', 'Payables', 'Open bill balances summarized by vendor.'],
  ['aged_payables', 'Accounts Payable Aging', 'Payables', 'Open vendor balances reconciled against the AP control account.', true],
  ['project_profitability', 'Project Profitability', 'Projects and Timesheet', 'Revenue, direct cost, margin, collections and unbilled time by project.', true],
  ['timesheet_details', 'Timesheet Details', 'Projects and Timesheet', 'Logged, billable and billed hours by project, task and staff.'],
  ['bank_reconciliation_summary', 'Bank Reconciliation Summary', 'Banking', 'FirmBooks book balance compared with the latest statement balance.', true],
  ['bank_transaction_details', 'Bank Transaction Details', 'Banking', 'Uploaded statement entries and their matching status.'],
  ['gst_summary', 'GST Summary', 'Taxes', 'Recorded output and input GST evidence for the selected period.', true],
  ['tds_summary', 'TDS Summary', 'Taxes', 'TDS recorded on paid expenses, grouped by section.'],
  ['trial_balance', 'Trial Balance', 'Accountant', 'Debit and credit balances for every account from posted journals.', true],
  ['general_ledger', 'General Ledger', 'Accountant', 'Posted journal activity grouped by account with source references.', true],
  ['journal_report', 'Journal Report', 'Accountant', 'Chronological journals with debit-credit equality.'],
  ['fixed_asset_register', 'Fixed Asset Register', 'Accountant', 'Asset cost, accumulated depreciation and net book value.'],
  ['activity_logs', 'Activity Logs', 'Activity', 'Audited user and system activity for the selected period.'],
];

export const INITIAL_REPORTS_CATALOG: ReportItem[] = entries.map(([id, name, category, description, isFavorite = false]) => ({
  id,
  name,
  category,
  description,
  createdBy: ['aged_receivables', 'aged_payables', 'payments_received', 'payments_made', 'bank_reconciliation_summary', 'bank_transaction_details'].includes(id)
    ? 'Reconciled subledger service'
    : ['activity_logs', 'timesheet_details', 'cash_flow_forecast'].includes(id)
      ? 'Operational reporting service'
      : 'Posted ledger and document service',
  isFavorite,
}));
