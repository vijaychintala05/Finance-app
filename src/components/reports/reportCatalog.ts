import { ReportItem } from './reportTypes';

// Only reports backed by tenant-scoped server queries over posted journals or
// explicitly reconciled subledgers belong in this catalog. New entries must not
// be added until their endpoint and integrity semantics are tested.
export const INITIAL_REPORTS_CATALOG: ReportItem[] = [
  {
    id: 'pnl_standard',
    name: 'Profit and Loss',
    category: 'Business Overview',
    description: 'Income and expense activity calculated from posted journal lines for the selected period.',
    createdBy: 'Posted ledger service',
    isFavorite: true,
  },
  {
    id: 'balance_sheet_standard',
    name: 'Balance Sheet',
    category: 'Business Overview',
    description: 'Assets, liabilities, equity, and current earnings from posted journals as of the selected date.',
    createdBy: 'Posted ledger service',
    isFavorite: true,
  },
  {
    id: 'aged_receivables',
    name: 'Accounts Receivable Reconciliation',
    category: 'Receivables',
    description: 'Open customer balances reconciled against the accounts receivable control account.',
    createdBy: 'Reconciled subledger service',
    isFavorite: true,
  },
  {
    id: 'aged_payables',
    name: 'Accounts Payable Reconciliation',
    category: 'Payables',
    description: 'Open vendor balances reconciled against the accounts payable control account.',
    createdBy: 'Reconciled subledger service',
    isFavorite: false,
  },
  {
    id: 'trial_balance',
    name: 'Trial Balance',
    category: 'Accountant',
    description: 'Debit and credit totals for every account, using posted journals only.',
    createdBy: 'Posted ledger service',
    isFavorite: true,
  },
  {
    id: 'general_ledger',
    name: 'General Ledger',
    category: 'Accountant',
    description: 'Posted journal activity grouped by account with source references and exact debit/credit amounts.',
    createdBy: 'Posted ledger service',
    isFavorite: true,
  },
];
