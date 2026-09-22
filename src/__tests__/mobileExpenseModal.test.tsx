// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { ExpenseModal } from '../components/expenses/ExpenseModal';
import { Account, Vendor, Client } from '../types';

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
    id: 'acc-exp-2',
    code: '6020',
    name: 'Studio Supplies',
    type: 'Expense',
    subType: 'Office & Administrative',
    balance: 300,
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
];

const mockVendors: Vendor[] = [
  { id: 'ven-1', name: 'Design Supply Co', companyName: 'Design Supply Co', paymentTerms: 'Net 30', status: 'Active' },
];

const mockClients: Client[] = [
  {
    id: 'cli-1',
    name: 'Acme Corp',
    companyName: 'Acme Corp',
    email: 'billing@acme.com',
    phone: '555-0100',
    billingAddress: '123 Main St',
    currency: 'INR',
    paymentTerms: 'Net 30',
    createdAt: '2026-01-01',
  },
];

const mockAddExpense = vi.fn().mockResolvedValue({ id: 'exp-new-1' });
const mockUpdateExpense = vi.fn().mockResolvedValue(undefined);
const mockCorrectExpense = vi.fn().mockResolvedValue(undefined);
const mockOnClose = vi.fn();

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    vendors: mockVendors,
    projects: [],
    clients: mockClients,
    addVendor: vi.fn(),
    addExpense: mockAddExpense,
    updateExpense: mockUpdateExpense,
    correctExpense: mockCorrectExpense,
    settings: { currencyCode: 'INR', currencySymbol: '₹' },
  }),
}));

describe('Mobile Expense Modal (Light Mode) Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Simulate iPhone screen viewport width
    window.innerWidth = 390;
    window.dispatchEvent(new Event('resize'));
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renders mobile iOS-styled header, cards, and labels matching reference', () => {
    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    const modal = screen.getByTestId('mobile-expense-modal');
    expect(modal).toBeDefined();

    // Top Bar
    expect(within(modal).getByRole('button', { name: 'Cancel' })).toBeDefined();
    expect(within(modal).getByText('Add Expense')).toBeDefined();
    expect(within(modal).getByRole('button', { name: 'Save' })).toBeDefined();

    // Card 1
    expect(within(modal).getByText('Date')).toBeDefined();
    expect(within(modal).getByText('Itemize Expense')).toBeDefined();
    expect(within(modal).getByText('Expense Account')).toBeDefined();
    expect(within(modal).getByText('Paid Through')).toBeDefined();

    // Card 2
    expect(within(modal).getByText('Amount')).toBeDefined();
    expect(within(modal).getByText('Currency')).toBeDefined();
    expect(within(modal).getByText('INR')).toBeDefined();
    expect(within(modal).getByText('Vendor')).toBeDefined();

    // Card 3
    expect(within(modal).getByText('Reference#')).toBeDefined();
    expect(within(modal).getByText('Notes')).toBeDefined();

    // Card 4 & 5
    expect(within(modal).getByText('Customer')).toBeDefined();
    expect(within(modal).getByText('Attachments')).toBeDefined();
  });

  it('2. Opens slide-up sheet to pick Expense Account and Paid Through', () => {
    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    const modal = screen.getByTestId('mobile-expense-modal');

    // Tap Expense Account row
    fireEvent.click(within(modal).getByText('Expense Account'));
    expect(screen.getByText('Select Expense Account')).toBeDefined();
    expect(screen.getByText('6020 - Studio Supplies')).toBeDefined();

    // Pick Studio Supplies
    fireEvent.click(screen.getByText('6020 - Studio Supplies'));
    expect(screen.queryByText('Select Expense Account')).toBeNull();
    expect(within(modal).getByText('Studio Supplies')).toBeDefined();

    // Tap Paid Through row
    fireEvent.click(within(modal).getByText('Paid Through'));
    expect(screen.getByText('Select Paid Through')).toBeDefined();
    expect(screen.getByText('1010 - HDFC Current Bank Account')).toBeDefined();

    // Pick HDFC Bank
    fireEvent.click(screen.getByText('1010 - HDFC Current Bank Account'));
    expect(screen.queryByText('Select Paid Through')).toBeNull();
    expect(within(modal).getByText('HDFC Current Bank Account')).toBeDefined();
  });

  it('3. Selects Vendor and Customer via mobile sheets and reveals Billable toggle', () => {
    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    const modal = screen.getByTestId('mobile-expense-modal');

    // Pick Vendor
    fireEvent.click(within(modal).getByText('Vendor'));
    expect(screen.getByText('Select Vendor')).toBeDefined();
    fireEvent.click(screen.getByText('Design Supply Co'));
    expect(within(modal).getByText('Design Supply Co')).toBeDefined();

    // Pick Customer
    fireEvent.click(within(modal).getByText('Customer'));
    expect(screen.getByText('Select Customer')).toBeDefined();
    fireEvent.click(screen.getByText('Acme Corp'));
    expect(within(modal).getByText('Acme Corp')).toBeDefined();

    // Verify Billable toggle appears
    expect(within(modal).getByText('Billable to Customer')).toBeDefined();
  });

  it('4. Toggles Itemize Expense mode on and off', () => {
    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    const modal = screen.getByTestId('mobile-expense-modal');
    const itemizeSwitch = within(modal).getByRole('switch', { name: 'Itemize Expense' });

    // Toggle ON
    fireEvent.click(itemizeSwitch);
    expect(within(modal).getByText('Split Line Items')).toBeDefined();
    expect(within(modal).getByText('Add Line')).toBeDefined();

    // Toggle OFF
    fireEvent.click(itemizeSwitch);
    expect(within(modal).queryByText('Split Line Items')).toBeNull();
    expect(within(modal).getByText('Expense Account')).toBeDefined();
  });

  it('5. Successfully saves expense from mobile form when Save button is pressed', async () => {
    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    const modal = screen.getByTestId('mobile-expense-modal');

    // Fill Amount
    const amountInput = within(modal).getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '850.50' } });

    // Fill Reference#
    const refInput = within(modal).getByPlaceholderText('Tap to Enter');
    fireEvent.change(refInput, { target: { value: 'INV-2026-99' } });

    // Fill Notes
    const notesInput = within(modal).getByPlaceholderText('Add notes about this expense...');
    fireEvent.change(notesInput, { target: { value: 'Office stationery and printer ink' } });

    // Tap Save
    const saveBtn = within(modal).getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAddExpense).toHaveBeenCalledTimes(1);
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 850.5,
          invoiceNumber: 'INV-2026-99',
          description: 'Office stationery and printer ink',
          accountId: 'acc-exp-1',
          paidFromAccountId: 'acc-bank-1',
        })
      );
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('6. Changes posting date on mobile form and persists new date on submission', async () => {
    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    const modal = screen.getByTestId('mobile-expense-modal');
    const dateInput = within(modal).getByLabelText('Posting date');

    // Change date to a custom date
    fireEvent.change(dateInput, { target: { value: '2026-08-15' } });

    // Verify formatDisplayDate updates in the row (15/08/2026)
    expect(within(modal).getByText('15/08/2026')).toBeDefined();

    // Fill amount and submit
    const amountInput = within(modal).getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '250.00' } });

    const saveBtn = within(modal).getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          date: '2026-08-15',
          amount: 250,
        })
      );
    });
  });

  it('7. When editing expense, correctly displays existing date and updates when user changes date', async () => {
    const existingExpense = {
      id: 'exp-edit-1',
      referenceNumber: 'EXP-2026-001',
      date: '2026-07-20',
      amount: 1200,
      taxAmount: 0,
      accountId: 'acc-exp-1',
      accountName: 'Office Rent',
      paidFromAccountId: 'acc-bank-1',
      paidFromAccountName: 'HDFC Current Bank Account',
      description: 'Monthly office space rental',
    };

    render(<ExpenseModal isOpen={true} onClose={mockOnClose} expenseToEdit={existingExpense} />);

    const modal = screen.getByTestId('mobile-expense-modal');
    expect(within(modal).getByText('20/07/2026')).toBeDefined();

    const dateInput = within(modal).getByLabelText('Posting date');
    expect((dateInput as HTMLInputElement).value).toBe('2026-07-20');

    // Change date to 2026-07-25
    fireEvent.change(dateInput, { target: { value: '2026-07-25' } });
    expect(within(modal).getByText('25/07/2026')).toBeDefined();

    // Fill edit reason
    const reasonInput = within(modal).getByPlaceholderText('e.g., Updated amount, vendor invoice correction...');
    fireEvent.change(reasonInput, { target: { value: 'Corrected invoice posting date' } });

    const saveBtn = within(modal).getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockUpdateExpense).toHaveBeenCalledWith(
        'exp-edit-1',
        expect.objectContaining({
          date: '2026-07-25',
        }),
        'Corrected invoice posting date'
      );
    });
  });
});
