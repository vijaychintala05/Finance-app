// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ExpenseModal } from '../components/expenses/ExpenseModal';
import { Account } from '../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-exp-1',
    code: '6010',
    name: 'Office Rent',
    type: 'Expense',
    subType: 'Office & Administrative',
    balance: 500,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-cogs-1',
    code: '5010',
    name: 'Raw Materials & Hardware',
    type: 'Cost of Goods Sold',
    subType: 'Materials',
    balance: 1200,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-oth-1',
    code: '6900',
    name: 'Interest & Finance Charges',
    type: 'Other Expense',
    subType: 'Interest Expense',
    balance: 50,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-bank-1',
    code: '1010',
    name: 'HDFC Current Bank Account',
    type: 'Asset',
    subType: 'Bank',
    balance: 10000,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-cc-1',
    code: '2110',
    name: 'Corporate Amex Credit Card',
    type: 'Liability',
    subType: 'Credit Cards',
    balance: 2500,
    status: 'Active',
    normalBalance: 'Credit',
  },
];

const mockRefreshAccounts = vi.fn().mockResolvedValue(undefined);
const mockAddExpense = vi.fn().mockResolvedValue(undefined);

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    refreshAccounts: mockRefreshAccounts,
    vendors: [],
    projects: [],
    addExpense: mockAddExpense,
    settings: { currencyCode: 'INR' },
  }),
}));

describe('ExpenseModal Realtime Chart of Accounts Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('triggers realtime account fetch when opened', () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    expect(mockRefreshAccounts).toHaveBeenCalled();
  });

  it('populates Expense, Cost of Goods Sold, and Other Expense in the searchable account picker', () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /expense account:/i }));

    expect(screen.getByRole('option', { name: /6010 - Office Rent \(Expense, Office & Administrative\)/i })).toBeDefined();
    expect(screen.getByRole('option', { name: /5010 - Raw Materials & Hardware \(Cost of Goods Sold, Materials\)/i })).toBeDefined();
    expect(screen.getByRole('option', { name: /6900 - Interest & Finance Charges \(Other Expense, Interest Expense\)/i })).toBeDefined();
  });

  it('populates Bank and Credit Card accounts in the Paid through dropdown', () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/1010 — HDFC Current Bank Account \(Bank\)/i)).toBeDefined();
    expect(screen.getByText(/2110 — Corporate Amex Credit Card \(Credit Cards\)/i)).toBeDefined();
  });

  it('provides a manual Refresh button that re-queries the backend in real time', async () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    expect(refreshBtn).toBeDefined();

    fireEvent.click(refreshBtn);
    expect(mockRefreshAccounts).toHaveBeenCalledTimes(2); // once on open, once on click
  });

  it('provides quick-add buttons for creating new expense or payment accounts directly from the modal', () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /new account/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /new bank\/card/i })).toBeDefined();
  });
});
