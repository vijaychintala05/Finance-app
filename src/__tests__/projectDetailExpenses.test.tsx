// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as BooksContext from '../context/BooksContext';
import { ProjectDetailModal } from '../components/projects/ProjectDetailModal';
import { ProjectsView } from '../components/projects/ProjectsView';
import { Expense, Project } from '../types';

let mockExpenseDetailsModalProps: any = null;
vi.mock('../components/expenses/ExpenseDetailsModal', () => ({
  ExpenseDetailsModal: (props: any) => {
    mockExpenseDetailsModalProps = props;
    if (!props.isOpen) return null;
    return (
      <div data-testid="expense-details-modal">
        <span>Expense Details: {props.expense?.referenceNumber}</span>
        <button
          type="button"
          onClick={() => props.onEdit?.(props.expense)}
        >
          Edit Expense From Modal
        </button>
        <button type="button" onClick={props.onClose}>
          Close Expense Details
        </button>
      </div>
    );
  },
}));

let mockExpenseModalProps: any = null;
vi.mock('../components/expenses/ExpenseModal', () => ({
  ExpenseModal: (props: any) => {
    mockExpenseModalProps = props;
    if (!props.isOpen) return null;
    return (
      <div data-testid="expense-editor-modal">
        <span>
          {props.expenseToEdit ? `Editing ${props.expenseToEdit.referenceNumber}` : 'New Expense'}
        </span>
        <button type="button" onClick={props.onClose}>
          Close Expense Modal
        </button>
      </div>
    );
  },
}));

vi.mock('../components/invoices/InvoicePreviewModal', () => ({ InvoicePreviewModal: () => null }));
vi.mock('../components/invoices/InvoiceEditorModal', () => ({ InvoiceEditorModal: () => null }));
vi.mock('../components/projects/LogTimeModal', () => ({ LogTimeModal: () => null }));
vi.mock('../components/projects/NewProjectModal', () => ({ NewProjectModal: () => null }));
vi.mock('../components/projects/EditProjectModal', () => ({ EditProjectModal: () => null }));

describe('Project Detail Expenses Integration', () => {
  const project: Project = {
    id: 'proj-123',
    code: 'PRJ-123',
    name: 'Office Renovation',
    clientId: 'client-1',
    clientName: 'Acme Corp',
    status: 'Active',
    budgetType: 'Fixed Cost',
    totalBudget: 50000,
    hourlyRate: 150,
  };

  const sampleExpense: Expense = {
    id: 'exp-456',
    referenceNumber: 'EXP-456',
    date: '2026-09-21',
    accountId: 'acc-supplies',
    accountName: 'Construction Supplies',
    amount: 1250,
    paymentStatus: 'Paid',
    paymentMethod: 'Bank Transfer',
    paidFromAccountId: 'acc-bank',
    paidFromAccountName: 'Main Checking',
    projectId: 'proj-123',
    clientId: 'client-1',
    vendorName: 'Hardware Depot',
    description: 'Drywall and screws',
    createdAt: '2026-09-21T10:00:00.000Z',
    updatedAt: '2026-09-21T10:00:00.000Z',
  };

  const summary = {
    totalInvoiced: 10000,
    totalCollected: 8000,
    directExpenses: 1250,
    unbilledHoursAmount: 0,
    totalLoggedHours: 20,
    netProfit: 8750,
    profitMarginPercent: 87.5,
    budgetUsedPercent: 25,
    totalUnbilledHours: 0,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockExpenseDetailsModalProps = null;
    mockExpenseModalProps = null;

    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      settings: { currencySymbol: '$' },
      getProjectSummary: () => summary,
      timeEntries: [],
      expenses: [sampleExpense],
      invoices: [],
      clients: [{ id: 'client-1', name: 'Acme Corp', companyName: 'Acme Corp' }],
      projects: [project],
      archiveProject: vi.fn(),
      timeOperationGuards: [],
      beginTimeOperation: vi.fn(),
      completeTimeOperation: vi.fn(),
      holdTimeOperationGuard: vi.fn(),
      refreshTimeOperationStatus: vi.fn(),
      deleteTimeEntry: vi.fn(),
      convertUnbilledTimeToInvoice: vi.fn(),
    } as any);
  });

  afterEach(() => cleanup());

  it('opens expense details directly when clicking an expense row in the Expenses tab', () => {
    render(
      <ProjectDetailModal
        project={project}
        initialTab="expenses"
        onClose={vi.fn()}
        onOpenLogTime={vi.fn()}
      />
    );

    // Expect the table to display the expense
    expect(screen.getByText('EXP-456')).toBeTruthy();
    expect(screen.getByText('Construction Supplies')).toBeTruthy();
    expect(screen.getByText('Hardware Depot')).toBeTruthy();
    expect(screen.getByText('View Expense →')).toBeTruthy();

    // Click on the View Expense button
    fireEvent.click(screen.getByText('View Expense →'));

    // ExpenseDetailsModal should now be open
    expect(screen.getByTestId('expense-details-modal')).toBeTruthy();
    expect(screen.getByText('Expense Details: EXP-456')).toBeTruthy();
    expect(mockExpenseDetailsModalProps?.expense?.id).toBe('exp-456');

    // Trigger edit from inside details modal
    fireEvent.click(screen.getByText('Edit Expense From Modal'));

    // Should close details modal and open ExpenseModal with expenseToEdit
    expect(screen.queryByTestId('expense-details-modal')).toBeNull();
    expect(screen.getByTestId('expense-editor-modal')).toBeTruthy();
    expect(screen.getByText('Editing EXP-456')).toBeTruthy();
  });

  it('switches to expenses tab when clicking the Direct Expenses summary card in Overview', () => {
    render(
      <ProjectDetailModal
        project={project}
        initialTab="overview"
        onClose={vi.fn()}
        onOpenLogTime={vi.fn()}
      />
    );

    // Click the Direct Expenses card on overview
    const directExpensesCard = screen.getByTitle('Click to view direct project expenses');
    fireEvent.click(directExpensesCard);

    // Should now show the expenses table and button
    expect(screen.getByText('Direct Project Expenses')).toBeTruthy();
    expect(screen.getByText('EXP-456')).toBeTruthy();
  });

  it('opens expense details when clicking an expense entry in the Recent Activity feed', () => {
    render(
      <ProjectDetailModal
        project={project}
        initialTab="overview"
        onClose={vi.fn()}
        onOpenLogTime={vi.fn()}
      />
    );

    const activity = screen.getByRole('region', { name: 'Recent project activity' });
    const expenseActivityItem = within(activity).getByText('Expense: Construction Supplies');
    fireEvent.click(expenseActivityItem);

    expect(screen.getByTestId('expense-details-modal')).toBeTruthy();
    expect(screen.getByText('Expense Details: EXP-456')).toBeTruthy();
  });

  it('opens project directly to expenses tab when clicking Expenses mini-card in ProjectsView', () => {
    render(<ProjectsView />);

    // In project grid, find the Expenses mini-card
    const expensesCard = screen.getByTitle('Click to view project expenses');
    fireEvent.click(expensesCard);

    // ProjectDetailModal should open directly into the Expenses tab
    expect(screen.getByText('Direct Project Expenses')).toBeTruthy();
    expect(screen.getByText('EXP-456')).toBeTruthy();
    expect(screen.getByText('View Expense →')).toBeTruthy();
  });
});
