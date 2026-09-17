// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { ExpenseModal } from '../components/expenses/ExpenseModal';
import { Account, Vendor, Client, Project } from '../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-exp-1',
    code: '6010',
    name: 'Travel & Accommodation',
    type: 'Expense',
    subType: 'Travel',
    balance: 500,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-bank-1',
    code: '1010',
    name: 'HDFC Bank Account',
    type: 'Asset',
    subType: 'Bank',
    balance: 10000,
    status: 'Active',
    normalBalance: 'Debit',
  },
];

const mockClients: Client[] = [
  { id: 'client-acme', name: 'Acme Corp', companyName: 'Acme Corp Ltd', status: 'Active' },
  { id: 'client-stark', name: 'Stark Industries', companyName: 'Stark Industries', status: 'Active' },
];

const mockProjects: Project[] = [
  {
    id: 'proj-acme-1',
    code: 'PRJ-ACME',
    name: 'Acme Portal Redesign',
    clientId: 'client-acme',
    clientName: 'Acme Corp Ltd',
    description: 'Portal work',
    status: 'Active',
    budgetType: 'Fixed Cost',
    totalBudget: 50000,
    hourlyRate: 150,
    startDate: '2026-01-01',
    manager: 'Alice',
  },
  {
    id: 'proj-stark-1',
    code: 'PRJ-STARK',
    name: 'Stark Clean Energy',
    clientId: 'client-stark',
    clientName: 'Stark Industries',
    description: 'Clean energy audit',
    status: 'Active',
    budgetType: 'Time & Materials',
    totalBudget: 80000,
    hourlyRate: 200,
    startDate: '2026-02-01',
    manager: 'Tony',
  },
];

const mockAddExpense = vi.fn().mockResolvedValue({ id: 'exp-new-1' });
const mockOnClose = vi.fn();

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    vendors: [],
    projects: mockProjects,
    clients: mockClients,
    addVendor: vi.fn(),
    addExpense: mockAddExpense,
    correctExpense: vi.fn(),
    settings: { currencyCode: 'INR', currencySymbol: '₹', expensesSettings: { defaultMarkupPercentage: 0 } },
  }),
}));

describe('Project & Billable Dialog Procedure Test Suite (Desktop & Mobile)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Desktop Procedure: Select Client -> Shows Project & Billable Dialog -> Toggle Billable -> Asks for Markup with live price', async () => {
    window.innerWidth = 1200;
    window.dispatchEvent(new Event('resize'));

    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    // Enter Amount: 1,000
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '1000' } });

    // Step 1: User selects a Client
    const customerSelect = screen.getByLabelText(/^customer/i);
    fireEvent.change(customerSelect, { target: { value: 'client-acme' } });

    // Step 2: Dialog appears about Project and Billable to Client
    const desktopDialog = await screen.findByTestId('project-billing-dialog-desktop');
    expect(desktopDialog).toBeDefined();
    expect(within(desktopDialog).getByText('Project & Billing Settings')).toBeDefined();
    expect(within(desktopDialog).getByText('Acme Corp Ltd')).toBeDefined();

    // Verify projects are filtered to this client plus "No project"
    const projectSelect = within(desktopDialog).getByLabelText(/project \(optional\)/i);
    expect(within(desktopDialog).getByText(/no project/i)).toBeDefined();
    expect(within(desktopDialog).getByText(/PRJ-ACME — Acme Portal Redesign/i)).toBeDefined();
    expect(within(desktopDialog).queryByText(/PRJ-STARK/i)).toBeNull();

    // Select the project
    fireEvent.change(projectSelect, { target: { value: 'proj-acme-1' } });

    // Step 3: When Billable to Client is toggled ON, ask for Markup!
    const billableSwitch = within(desktopDialog).getByRole('switch', { name: /billable to client/i });
    expect(within(desktopDialog).queryByLabelText(/markup percentage/i)).toBeNull();

    fireEvent.click(billableSwitch);

    // Markup section appears!
    expect(within(desktopDialog).getByLabelText(/markup percentage/i)).toBeDefined();
    expect(within(desktopDialog).getByText(/customer privacy protection/i)).toBeDefined();

    // Click 15% preset pill
    const fifteenPercentPill = within(desktopDialog).getByRole('button', { name: '+15%' });
    fireEvent.click(fifteenPercentPill);

    // Verify live calculation: Cost 1000 -> Markup +150 -> Customer Price 1150
    expect(within(desktopDialog).getByText(/final customer selling price|customer invoice price/i)).toBeDefined();
    expect(within(desktopDialog).getByText('₹ 1150.00')).toBeDefined();

    // Apply Settings
    const applyBtn = within(desktopDialog).getByRole('button', { name: /apply settings/i });
    fireEvent.click(applyBtn);

    // Dialog closes, returning to main form
    expect(screen.queryByTestId('project-billing-dialog-desktop')).toBeNull();

    // Verify main form reflects the markup and customer price
    expect(screen.getByText('+15%')).toBeDefined();
    expect(screen.getByText(/customer price/i)).toBeDefined();

    // Submit expense
    const submitBtn = screen.getByRole('button', { name: /^record expense$/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAddExpense).toHaveBeenCalledTimes(1);
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1000,
          clientId: 'client-acme',
          projectId: 'proj-acme-1',
          isBillable: true,
          markupPercentage: 15,
          sellingPrice: 1150,
        })
      );
    });
  });

  it('2. Mobile Procedure: Select Client via sheet -> Shows Project & Billable Sheet -> Toggle Billable -> Asks for Markup', async () => {
    window.innerWidth = 390;
    window.dispatchEvent(new Event('resize'));

    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    const modal = screen.getByTestId('mobile-expense-modal');

    // Enter Amount: 2,000
    const amountInput = within(modal).getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '2000' } });

    // Step 1: Tap Customer row to select client
    fireEvent.click(within(modal).getByText('Customer'));
    expect(screen.getByText('Select Customer')).toBeDefined();

    // Pick Stark Industries
    fireEvent.click(screen.getByText('Stark Industries'));

    // Step 2: The Project & Billing bottom sheet appears immediately!
    const mobileDialog = await screen.findByTestId('project-billing-dialog-mobile');
    expect(mobileDialog).toBeDefined();
    expect(within(mobileDialog).getByText('Project & Billing')).toBeDefined();
    expect(within(mobileDialog).getByText(/client: stark industries/i)).toBeDefined();

    // Step 3: Turn on Billable to Client
    const billableSwitch = within(mobileDialog).getByRole('switch', { name: /billable to client/i });
    fireEvent.click(billableSwitch);

    // Markup section is revealed!
    expect(within(mobileDialog).getByLabelText(/markup percentage/i)).toBeDefined();

    // Select 20% markup preset
    const twentyPercentPill = within(mobileDialog).getByRole('button', { name: '+20%' });
    fireEvent.click(twentyPercentPill);

    // Verify calculation: Cost 2000 + 20% markup = 2400 customer price
    expect(within(mobileDialog).getByText('₹ 2400.00')).toBeDefined();

    // Tap Apply & Save
    const applyBtn = within(mobileDialog).getByRole('button', { name: /apply & save/i });
    fireEvent.click(applyBtn);

    // Mobile sheet closes
    expect(screen.queryByTestId('project-billing-dialog-mobile')).toBeNull();

    // Save the expense
    const saveBtn = within(modal).getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAddExpense).toHaveBeenCalledTimes(1);
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2000,
          clientId: 'client-stark',
          isBillable: true,
          markupPercentage: 20,
          sellingPrice: 2400,
        })
      );
    });
  });

  it('3. Explicit 0% (At Cost) markup sets sellingPrice equal to cost basis', async () => {
    window.innerWidth = 1200;
    window.dispatchEvent(new Event('resize'));

    render(<ExpenseModal isOpen={true} onClose={mockOnClose} />);

    // Enter Amount: 500
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '500' } });

    // Select customer
    const customerSelect = screen.getByLabelText(/^customer/i);
    fireEvent.change(customerSelect, { target: { value: 'client-acme' } });

    const desktopDialog = await screen.findByTestId('project-billing-dialog-desktop');
    const billableSwitch = within(desktopDialog).getByRole('switch', { name: /billable to client/i });
    fireEvent.click(billableSwitch);

    // Choose 0% (At Cost)
    const costPill = within(desktopDialog).getByRole('button', { name: /0% \(cost\)/i });
    fireEvent.click(costPill);

    // Verify price is 500.00
    expect(within(desktopDialog).getAllByText('₹ 500.00').length).toBeGreaterThanOrEqual(1);

    // Apply
    fireEvent.click(within(desktopDialog).getByRole('button', { name: /apply settings/i }));

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /^record expense$/i }));

    await waitFor(() => {
      expect(mockAddExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          clientId: 'client-acme',
          isBillable: true,
          markupPercentage: 0,
          sellingPrice: 500,
        })
      );
    });
  });
});
