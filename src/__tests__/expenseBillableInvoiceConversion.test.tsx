// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ExpenseModal } from '../components/expenses/ExpenseModal';
import { ExpenseDetailsModal } from '../components/expenses/ExpenseDetailsModal';
import { ExpensesView } from '../components/expenses/ExpensesView';
import { Account, Expense, Client, Project } from '../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-exp-1',
    code: '6010',
    name: 'Travel & Lodging',
    type: 'Expense',
    subType: 'Travel',
    balance: 500,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-bank-1',
    code: '1010',
    name: 'HDFC Current Bank',
    type: 'Asset',
    subType: 'Bank',
    balance: 10000,
    status: 'Active',
    normalBalance: 'Debit',
  },
];

const mockClients: Client[] = [
  {
    id: 'client-1',
    name: 'Acme Corporation',
    companyName: 'Acme Corp Ltd',
    email: 'billing@acme.com',
    currency: 'INR',
  },
  {
    id: 'client-2',
    name: 'Stark Enterprises',
    companyName: 'Stark Industries',
    email: 'tony@stark.com',
    currency: 'INR',
  },
];

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    code: 'PRJ-ACME-01',
    name: 'Acme ERP Rollout',
    clientId: 'client-1',
    clientName: 'Acme Corp Ltd',
    budgetType: 'Fixed Cost',
    totalBudget: 50000,
    status: 'In Progress',
  },
];

const mockAddExpense = vi.fn().mockResolvedValue(undefined);
const mockDeleteExpense = vi.fn().mockResolvedValue(undefined);
const mockAttachExpenseReceipts = vi.fn().mockResolvedValue([]);
const mockConvertExpenseToInvoice = vi.fn().mockResolvedValue({
  invoice: {
    id: 'inv-999',
    invoiceNumber: 'INV-2026-0999',
    customerId: 'client-1',
    totalAmount: 1200,
  },
  expense: {
    id: 'exp-1',
    isBillable: true,
    isBilled: true,
    invoiceId: 'inv-999',
    invoiceNumber: 'INV-2026-0999',
  },
});

let mockExpenses: Expense[] = [];
let mockJournalEntries: any[] = [];

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    vendors: [],
    clients: mockClients,
    projects: mockProjects,
    expenses: mockExpenses,
    journalEntries: mockJournalEntries,
    addExpense: mockAddExpense,
    deleteExpense: mockDeleteExpense,
    attachExpenseReceipts: mockAttachExpenseReceipts,
    convertExpenseToInvoice: mockConvertExpenseToInvoice,
    settings: { currencyCode: 'INR', currencySymbol: '₹' },
  }),
}));

// Mock window.confirm and alert
vi.stubGlobal('confirm', vi.fn(() => true));
vi.stubGlobal('alert', vi.fn());

describe('Zoho Books Billable Expense & Invoice Conversion UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExpenses = [];
    mockJournalEntries = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('1. renders Customer selector and Billable to Customer checkbox in ExpenseModal', () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByLabelText(/^customer/i)).toBeDefined();
    expect(screen.getByLabelText(/project/i)).toBeDefined();
    expect(screen.getByLabelText(/billable to customer/i)).toBeDefined();

    // Check that clients are in the customer dropdown
    expect(screen.getByRole('option', { name: /acme corp ltd/i })).toBeDefined();
    expect(screen.getByRole('option', { name: /stark industries/i })).toBeDefined();
  });

  it('2. allows selecting a customer and checking Billable to Customer, submitting with isBillable = true', async () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    // Fill Amount
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '1500' } });

    // Select Customer
    const customerSelect = screen.getByLabelText(/^customer/i);
    fireEvent.change(customerSelect, { target: { value: 'client-1' } });

    // Check Billable
    const billableCheckbox = screen.getByLabelText(/billable to customer/i);
    fireEvent.click(billableCheckbox);
    expect((billableCheckbox as HTMLInputElement).checked).toBe(true);

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /^record expense$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAddExpense).toHaveBeenCalledTimes(1);
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1500,
          clientId: 'client-1',
          isBillable: true,
        })
      );
    });
  });

  it('3. selecting a project auto-selects its assigned customer', () => {
    render(<ExpenseModal isOpen={true} onClose={vi.fn()} />);

    const projectSelect = screen.getByLabelText(/project/i);
    fireEvent.change(projectSelect, { target: { value: 'proj-1' } });

    const customerSelect = screen.getByLabelText(/^customer/i) as HTMLSelectElement;
    expect(customerSelect.value).toBe('client-1');
  });

  it('4. displays "Billable (Unbilled)" badge and "Convert to Invoice" button in ExpenseDetailsModal', async () => {
    const unbilledExpense: Expense = {
      id: 'exp-1',
      referenceNumber: 'EXP-101',
      accountId: 'acc-exp-1',
      accountName: 'Travel & Lodging',
      paidFromAccountId: 'acc-bank-1',
      paidFromAccountName: 'HDFC Current Bank',
      clientId: 'client-1',
      clientName: 'Acme Corp Ltd',
      amount: 1200,
      taxAmount: 0,
      date: '2026-08-16',
      description: 'Flight tickets for onsite deployment',
      isBillable: true,
      isBilled: false,
      paymentStatus: 'Paid',
      createdAt: '2026-08-16T10:00:00Z',
    };

    render(<ExpenseDetailsModal isOpen={true} onClose={vi.fn()} expense={unbilledExpense} />);

    expect(screen.getByText('Billable (Unbilled)')).toBeDefined();
    const convertBtn = screen.getAllByRole('button', { name: /convert to invoice/i })[0];
    expect(convertBtn).toBeDefined();

    // Click Convert to Invoice
    fireEvent.click(convertBtn);

    await waitFor(() => {
      expect(mockConvertExpenseToInvoice).toHaveBeenCalledWith('exp-1');
    });

    // Badge updates to Billed
    await waitFor(() => {
      expect(screen.getByText('Billed to Customer')).toBeDefined();
      expect(screen.getByText('Inv #INV-2026-0999')).toBeDefined();
    });
  });

  it('5. renders "Billed" badge on already-billed expenses in ExpensesView table', () => {
    mockExpenses = [
      {
        id: 'exp-1',
        referenceNumber: 'EXP-101',
        accountId: 'acc-exp-1',
        accountName: 'Travel & Lodging',
        paidFromAccountId: 'acc-bank-1',
        paidFromAccountName: 'HDFC Current Bank',
        clientId: 'client-1',
        clientName: 'Acme Corp Ltd',
        amount: 1200,
        taxAmount: 0,
        date: '2026-08-16',
        description: 'Flight tickets',
        isBillable: true,
        isBilled: true,
        invoiceId: 'inv-999',
        customerInvoiceNumber: 'INV-2026-0999',
        paymentStatus: 'Paid',
        createdAt: '2026-08-16T10:00:00Z',
      },
      {
        id: 'exp-2',
        referenceNumber: 'EXP-102',
        accountId: 'acc-exp-1',
        accountName: 'Travel & Lodging',
        paidFromAccountId: 'acc-bank-1',
        paidFromAccountName: 'HDFC Current Bank',
        clientId: 'client-2',
        clientName: 'Stark Industries',
        amount: 800,
        taxAmount: 0,
        date: '2026-08-17',
        description: 'Hotel stay',
        isBillable: true,
        isBilled: false,
        paymentStatus: 'Paid',
        createdAt: '2026-08-17T10:00:00Z',
      },
    ];

    render(<ExpensesView />);

    expect(screen.getAllByText('Billed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Billable (Unbilled)').length).toBeGreaterThanOrEqual(1);

    // Test Unbilled filter chip
    const unbilledChip = screen.getByRole('button', { name: /unbilled/i });
    fireEvent.click(unbilledChip);

    // Only unbilled expense EXP-102 should now be visible in table
    expect(screen.queryAllByText('EXP-102').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('EXP-101').length).toBe(0);
  });

  it('6. handles error gracefully when convertExpenseToInvoice rejects', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);

    mockConvertExpenseToInvoice.mockRejectedValueOnce(new Error('Server error: Customer credit limit reached'));

    const unbilledExpense: Expense = {
      id: 'exp-err',
      referenceNumber: 'EXP-ERR',
      accountId: 'acc-exp-1',
      paidFromAccountId: 'acc-bank-1',
      clientId: 'client-1',
      clientName: 'Acme Corp Ltd',
      amount: 500,
      taxAmount: 0,
      date: '2026-08-16',
      description: 'Consulting services',
      isBillable: true,
      isBilled: false,
      paymentStatus: 'Paid',
    };

    render(<ExpenseDetailsModal isOpen={true} onClose={vi.fn()} expense={unbilledExpense} />);

    const convertBtn = screen.getAllByRole('button', { name: /convert to invoice/i })[0];
    fireEvent.click(convertBtn);

    await waitFor(() => {
      expect(alertMock).toHaveBeenCalledWith(
        'Failed to convert expense to invoice: Server error: Customer credit limit reached'
      );
    });
  });

  it('7. displays the balanced posting journal from an expense detail view', () => {
    mockJournalEntries = [{
      id: 'jrnl-exp-1',
      entryNumber: 'JRN-EXP-exp-09e19f15-909c-419c-b35c-e4eb20ba9605',
      date: '2026-08-16',
      reference: 'EXP-101',
      description: 'Flight tickets for onsite deployment',
      status: 'Posted',
      createdAt: '2026-08-16T10:00:00Z',
      lines: [
        { id: 'line-1', accountId: 'acc-exp-1', accountCode: '6010', accountName: 'Travel & Lodging', debit: 1200, credit: 0 },
        { id: 'line-2', accountId: 'acc-bank-1', accountCode: '1010', accountName: 'HDFC Current Bank', debit: 0, credit: 1200 },
      ],
    }];
    const expense: Expense = {
      id: 'exp-1', referenceNumber: 'EXP-101', accountId: 'acc-exp-1', accountName: 'Travel & Lodging',
      paidFromAccountId: 'acc-bank-1', paidFromAccountName: 'HDFC Current Bank', vendorName: 'Airline Services',
      invoiceNumber: 'AIR-091', amount: 1200, taxAmount: 0, date: '2026-08-16', description: 'Flight tickets for onsite deployment',
      isBillable: false, paymentStatus: 'Paid', journalEntryId: 'jrnl-exp-1', createdAt: '2026-08-16T10:00:00Z',
    };

    render(<ExpenseDetailsModal isOpen={true} onClose={vi.fn()} expense={expense} />);

    expect(screen.getByText('Accounting impact')).toBeDefined();
    expect(screen.getByText('Drag and drop receipts here')).toBeDefined();
    expect(screen.getByText('Vendor ref AIR-091')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Display journal' }));
    expect(screen.queryByText('JRN-EXP-exp-09e19f15-909c-419c-b35c-e4eb20ba9605')).toBeNull();
    expect(screen.getAllByText('Posted journal').length).toBeGreaterThan(0);
    expect(screen.getByText('6010 - Travel & Lodging')).toBeDefined();
    expect(screen.getByText('1010 - HDFC Current Bank')).toBeDefined();
    fireEvent.click(screen.getByRole('tab', { name: 'Voucher view' }));
    expect(screen.getByRole('tabpanel', { name: 'Voucher view' })).toBeDefined();
    expect(screen.getByText('Expense payment voucher')).toBeDefined();
  });
});
