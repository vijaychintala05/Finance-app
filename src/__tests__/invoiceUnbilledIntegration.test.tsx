// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { InvoiceEditorModal } from '../components/invoices/InvoiceEditorModal';
import { Account, Expense, Client, Project } from '../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-rev-1',
    code: '4010',
    name: 'Consulting Revenue',
    type: 'Revenue',
    subType: 'Operating',
    balance: 50000,
    status: 'Active',
    normalBalance: 'Credit',
    allowDirectPosting: true,
  },
];

const mockClients: Client[] = [
  {
    id: 'client-1',
    name: 'Acme Corporation',
    companyName: 'Acme Corp Ltd',
    email: 'billing@acme.com',
    status: 'Active',
  },
];

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    code: 'PRJ-101',
    name: 'Website Revamp',
    clientId: 'client-1',
    status: 'Active',
  },
];

const mockExpenses: Expense[] = [
  {
    id: 'exp-1',
    date: '2026-09-17',
    amount: 1000,
    sellingPrice: 1150,
    markupPercentage: 15,
    accountId: 'acc-exp-1',
    accountName: 'Travel & Meals',
    paidFromAccountId: 'acc-bank-1',
    description: 'Travel to client site',
    clientId: 'client-1',
    clientName: 'Acme Corp Ltd',
    isBillable: true,
    isBilled: false,
    referenceNumber: 'EXP-101',
  },
  {
    id: 'exp-2',
    date: '2026-09-17',
    amount: 2000,
    sellingPrice: 2200,
    markupPercentage: 10,
    accountId: 'acc-exp-2',
    accountName: 'Equipment Rental',
    paidFromAccountId: 'acc-bank-1',
    description: 'Specialist testing hardware',
    clientId: 'client-1',
    clientName: 'Acme Corp Ltd',
    isBillable: true,
    isBilled: false,
    referenceNumber: 'EXP-102',
  },
];

const mockAddInvoice = vi.fn().mockResolvedValue({
  id: 'inv-new-1',
  invoiceNumber: 'INV-1001',
  totalAmount: 3350,
  balanceDue: 3350,
  status: 'Sent',
});

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    clients: mockClients,
    projects: mockProjects,
    accounts: mockAccounts,
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    settings: {
      currencyCode: 'INR',
      currencySymbol: '₹',
      defaultTaxRate: 0,
    },
    salespersons: [],
    addInvoice: mockAddInvoice,
    updateInvoice: vi.fn(),
    expenses: mockExpenses,
  }),
}));

describe('InvoiceEditorModal & Unbilled Expenses Integration (Stage 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Detects unbilled expenses for selected client, displays banner, adds to invoice lines, and submits with expenseIds', async () => {
    render(
      <InvoiceEditorModal
        isOpen={true}
        onClose={vi.fn()}
        defaultClientId="client-1"
      />
    );

    // Verify unbilled banner is visible with count 2 and total ₹3,350.00
    await waitFor(() => {
      expect(screen.getByText(/2 Unbilled Expenses Available/i)).toBeTruthy();
      expect(screen.getByText('(₹3,350.00)')).toBeTruthy();
    });

    // Click "Review & Add" button on the banner
    const reviewBtn = screen.getByRole('button', { name: /Review & Add/i });
    fireEvent.click(reviewBtn);

    // Unbilled drawer should open displaying the 2 expenses at customer selling price
    await waitFor(() => {
      expect(screen.getByText('Travel to client site')).toBeTruthy();
      expect(screen.getByText('Specialist testing hardware')).toBeTruthy();
    });

    // Click "Add to Invoice" inside the drawer
    const addToInvBtn = screen.getByRole('button', { name: /Add to Invoice/i });
    fireEvent.click(addToInvBtn);

    // Verify the invoice items now contain the 2 expenses at selling price
    await waitFor(() => {
      const inputs = screen.getAllByDisplayValue('Travel to client site');
      expect(inputs.length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByDisplayValue('Specialist testing hardware').length).toBeGreaterThanOrEqual(1);
    });

    // Total should now be ₹3,350.00
    expect(screen.getAllByText('₹3,350.00').length).toBeGreaterThanOrEqual(1);

    // Submit the invoice form
    const saveButton = screen.getByRole('button', { name: /Create Invoice/i });
    fireEvent.click(saveButton);

    // Verify addInvoice was called with expenseIds: ['exp-1', 'exp-2']
    await waitFor(() => {
      expect(mockAddInvoice).toHaveBeenCalledTimes(1);
      expect(mockAddInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          expenseIds: ['exp-1', 'exp-2'],
          totalAmount: 3350,
        })
      );
    });
  });
});
