// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChartOfAccountsView } from '../components/coa/ChartOfAccountsView';
import { AccountLedgerModal } from '../components/coa/AccountLedgerModal';
import { Account } from '../types';

afterEach(() => {
  cleanup();
});

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    code: '1010',
    name: 'Petty Cash',
    type: 'Asset',
    subType: 'Cash',
    balance: 1250,
    status: 'Active',
    normalBalance: 'Debit',
    subCategory: 'Cash Float',
  },
  {
    id: 'acc-2',
    code: '5010',
    name: 'Direct Project Materials',
    type: 'Cost of Goods Sold',
    subType: 'Materials',
    balance: 4500,
    status: 'Active',
    normalBalance: 'Debit',
    description: 'Hardware, plywood, and adhesives',
  },
  {
    id: 'acc-3',
    code: '6010',
    name: 'Office Rent & Facilities',
    type: 'Expense',
    subType: 'Office & Administrative',
    balance: 850,
    status: 'Active',
    normalBalance: 'Debit',
  },
];

const mockExpenses = [
  {
    id: 'exp-1',
    accountId: 'acc-2',
    accountName: 'Direct Project Materials',
    amount: 1500,
    date: '2026-08-15',
    referenceNumber: 'EXP-101',
    vendorName: 'Timber Supply Co',
    description: 'Marine plywood delivery',
    projectName: 'Villa renovation',
    paymentStatus: 'Paid',
  },
];

const mockInvoices: any[] = [];
const mockJournalEntries: any[] = [];

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    expenses: mockExpenses,
    invoices: mockInvoices,
    journalEntries: mockJournalEntries,
    settings: { currencySymbol: '$' },
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}));

describe('Chart of Accounts Mobile Optimization Suite', () => {
  it('1. renders Table view with responsive mobile card feed and touch-accessible buttons', () => {
    render(<ChartOfAccountsView />);

    // Header title and status
    expect(screen.getByText('Chart of Accounts')).toBeTruthy();
    expect(screen.getByLabelText(/account status/i)).toBeTruthy();

    // Verify accounts in mobile card feed
    expect(screen.getAllByText('Petty Cash').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Direct Project Materials').length).toBeGreaterThanOrEqual(1);

    // Edit and View Ledger buttons are rendered and accessible
    const editPettyCashButtons = screen.getAllByRole('button', { name: /edit petty cash/i });
    expect(editPettyCashButtons.length).toBeGreaterThanOrEqual(1);

    const viewLedgerButtons = screen.getAllByRole('button', { name: /view ledger for petty cash/i });
    expect(viewLedgerButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('2. opens AccountModal when mobile Edit button is tapped', () => {
    render(<ChartOfAccountsView />);

    const editButtons = screen.getAllByRole('button', { name: /edit petty cash/i });
    fireEvent.click(editButtons[0]);

    // Modal opens with account details
    expect(screen.getByText('Account details: Petty Cash')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });

  it('3. opens AccountLedgerModal with mobile transactions feed when View Ledger is tapped', () => {
    render(<ChartOfAccountsView />);

    const ledgerButtons = screen.getAllByRole('button', { name: /view ledger for direct project materials/i });
    fireEvent.click(ledgerButtons[0]);

    // Ledger modal opens
    expect(screen.getByText('NET LEDGER BALANCE')).toBeTruthy();
    expect(screen.getAllByText('EXP-101').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Timber Supply Co').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Marine plywood delivery').length).toBeGreaterThanOrEqual(1);
  });

  it('4. switches between Tree view and Table view cleanly with responsive actions', () => {
    render(<ChartOfAccountsView />);

    // Switch to tree view
    const treeButton = screen.getByRole('button', { name: /hierarchy view/i });
    fireEvent.click(treeButton);

    // Tree sections appear
    expect(screen.getByRole('heading', { name: 'Assets' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeTruthy();

    // Actions under sub-types in tree view
    const addSubItemButtons = screen.getAllByRole('button', { name: /add sub-item/i });
    expect(addSubItemButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('5. AccountLedgerModal renders filter tabs and transaction details on mobile', () => {
    const handleClose = vi.fn();
    render(
      <AccountLedgerModal
        isOpen={true}
        account={mockAccounts[1]}
        onClose={handleClose}
      />
    );

    // Header net balance
    expect(screen.getByText('NET LEDGER BALANCE')).toBeTruthy();
    expect(screen.getByText('5010')).toBeTruthy();

    // Filter tabs
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Expense' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Invoice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Journal Entry' })).toBeTruthy();

    // Transaction card fields
    expect(screen.getAllByText('EXP-101').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Timber Supply Co').length).toBeGreaterThanOrEqual(1);
  });
});
