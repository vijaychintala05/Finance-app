// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ApiRequestError } from '../api/client';
import * as BooksContext from '../context/BooksContext';
import { ProjectDetailModal } from '../components/projects/ProjectDetailModal';

vi.mock('../components/invoices/InvoicePreviewModal', () => ({ InvoicePreviewModal: () => null }));
vi.mock('../components/invoices/InvoiceEditorModal', () => ({ InvoiceEditorModal: () => null }));
vi.mock('../components/expenses/ExpenseModal', () => ({ ExpenseModal: () => null }));

describe('Project detail time operations', () => {
  let deleteTimeEntry: ReturnType<typeof vi.fn>;
  let convertUnbilledTimeToInvoice: ReturnType<typeof vi.fn>;
  let timeOperationGuards: any[];
  let beginTimeOperation: ReturnType<typeof vi.fn>;
  let completeTimeOperation: ReturnType<typeof vi.fn>;
  let holdTimeOperationGuard: ReturnType<typeof vi.fn>;
  let refreshTimeOperationStatus: ReturnType<typeof vi.fn>;
  const project = { id: 'project-1', code: 'P-1', name: 'Website refresh', clientId: 'customer-1', clientName: 'Northwind', status: 'Active', budgetType: 'Fixed Cost', totalBudget: 10000, hourlyRate: 100 };
  const entry = { id: 'time-1', projectId: 'project-1', projectName: 'Website refresh', clientName: 'Northwind', date: '2026-09-20', staffName: 'Alex', taskName: 'Design review', description: '', hours: 2, hourlyRate: 100, isBillable: true, isBilled: false };
  const summary = { totalInvoiced: 0, totalCollected: 0, directExpenses: 0, unbilledHoursAmount: 200, totalLoggedHours: 2, netProfit: 200, profitMarginPercent: 100, budgetUsedPercent: 2, totalUnbilledHours: 2 };

  beforeEach(() => {
    vi.restoreAllMocks();
    deleteTimeEntry = vi.fn().mockResolvedValue({ data: undefined, requestId: 'req-project-delete', refreshFailed: false });
    timeOperationGuards = [];
    beginTimeOperation = vi.fn((key: string, projectId: string) => timeOperationGuards.push({ key, projectId, status: 'pending', notice: { tone: 'warning', title: 'In progress', message: 'Wait for confirmation.' } }));
    completeTimeOperation = vi.fn((key: string) => { timeOperationGuards.splice(0, timeOperationGuards.length, ...timeOperationGuards.filter((guard) => guard.key !== key)); });
    holdTimeOperationGuard = vi.fn((key: string, projectId: string, notice: any) => { timeOperationGuards.splice(0, timeOperationGuards.length, ...timeOperationGuards.filter((guard) => guard.key !== key), { key, projectId, status: 'uncertain', notice }); });
    refreshTimeOperationStatus = vi.fn().mockResolvedValue(false);
    convertUnbilledTimeToInvoice = vi.fn().mockResolvedValue({ data: { id: 'invoice-1', invoiceNumber: 'INV-2401' }, requestId: 'req-project-invoice', refreshFailed: false });
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      settings: { currencySymbol: '₹' },
      getProjectSummary: () => summary,
      timeEntries: [entry],
      expenses: [],
      invoices: [],
      clients: [{ id: 'customer-1', name: 'Northwind', companyName: 'Northwind' }],
      projects: [project],
      convertUnbilledTimeToInvoice,
      timeOperationGuards,
      beginTimeOperation,
      completeTimeOperation,
      holdTimeOperationGuard,
      refreshTimeOperationStatus,
      deleteTimeEntry,
    } as any);
  });

  afterEach(() => cleanup());

  it('shows time activity as hours and billing state instead of a transaction amount', () => {
    render(<ProjectDetailModal project={project as any} onClose={vi.fn()} onOpenLogTime={vi.fn()} />);
    const activity = screen.getByRole('region', { name: 'Recent project activity' });

    expect(within(activity).getByText('2 hours · Billable · Unbilled')).toBeTruthy();
    expect(within(activity).queryByText('₹200.00')).toBeNull();
  });

  it('confirms project-detail deletion and shows the server receipt', async () => {
    render(<ProjectDetailModal project={project as any} onClose={vi.fn()} onOpenLogTime={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Time Logs/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry Design review' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete time entry?' })).toBeTruthy();
    expect(deleteTimeEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry', exact: true }));

    expect(await screen.findByText('Time entry deleted')).toBeTruthy();
    expect(screen.getByText('req-project-delete')).toBeTruthy();
    expect(deleteTimeEntry).toHaveBeenCalledWith('time-1');
  });

  it('locks all project invoice-conversion entry points while the outcome is uncertain', async () => {
    convertUnbilledTimeToInvoice.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'The connection ended before the server result was confirmed',
      status: 0,
      requestId: 'req-project-invoice-uncertain',
      errorCode: 'NETWORK_FAILURE',
    }, 'Invoice outcome is uncertain'));
    const first = render(<ProjectDetailModal project={project as any} onClose={vi.fn()} onOpenLogTime={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Invoice Now →' }));

    expect(await screen.findByText('Invoice outcome could not be confirmed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Convert to Invoice Now →' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('req-project-invoice-uncertain')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Verify status' }));
    expect(await screen.findByText('Time operation status is still unavailable')).toBeTruthy();
    expect(screen.getByText('req-project-invoice-uncertain')).toBeTruthy();
    first.unmount();

    render(<ProjectDetailModal project={project as any} onClose={vi.fn()} onOpenLogTime={vi.fn()} />);
    expect(screen.getByText('req-project-invoice-uncertain')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Convert to Invoice Now →' }).hasAttribute('disabled')).toBe(true);
  });

  it('locks project invoice conversion while the request is pending', async () => {
    let resolveInvoice!: (value: unknown) => void;
    convertUnbilledTimeToInvoice.mockReturnValueOnce(new Promise((resolve) => { resolveInvoice = resolve; }));
    render(<ProjectDetailModal project={project as any} onClose={vi.fn()} onOpenLogTime={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Convert to Invoice Now →' }));
    expect(screen.getByRole('button', { name: 'Convert to Invoice Now →' }).hasAttribute('disabled')).toBe(true);
    resolveInvoice({ data: { id: 'invoice-1', invoiceNumber: 'INV-2401' }, requestId: 'req-project-invoice', refreshFailed: false });
    expect(await screen.findByText('Invoice INV-2401 created')).toBeTruthy();
  });
});