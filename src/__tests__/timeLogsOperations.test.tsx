// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiRequestError } from '../api/client';
import * as BooksContext from '../context/BooksContext';
import { TimeLogsView } from '../components/projects/TimeLogsView';

describe('Time Logs operation receipts', () => {
  let deleteTimeEntry: ReturnType<typeof vi.fn>;
  let convertUnbilledTimeToInvoice: ReturnType<typeof vi.fn>;
  let timeOperationGuards: any[];
  let beginTimeOperation: ReturnType<typeof vi.fn>;
  let completeTimeOperation: ReturnType<typeof vi.fn>;
  let holdTimeOperationGuard: ReturnType<typeof vi.fn>;
  let refreshTimeOperationStatus: ReturnType<typeof vi.fn>;
  const project = { id: 'project-1', code: 'P-1', name: 'Website refresh', clientId: 'customer-1', clientName: 'Northwind', status: 'Active' };
  const entry = { id: 'time-1', projectId: 'project-1', projectName: 'Website refresh', clientName: 'Northwind', date: '2026-09-20', staffName: 'Alex', taskName: 'Design review', description: '', hours: 2, hourlyRate: 100, isBillable: true, isBilled: false };

  beforeEach(() => {
    vi.restoreAllMocks();
    deleteTimeEntry = vi.fn().mockResolvedValue({ data: undefined, requestId: 'req-delete-time', refreshFailed: false });
    timeOperationGuards = [];
    beginTimeOperation = vi.fn((key: string, projectId: string) => timeOperationGuards.push({ key, projectId, status: 'pending', notice: { tone: 'warning', title: 'In progress', message: 'Wait for confirmation.' } }));
    completeTimeOperation = vi.fn((key: string) => { timeOperationGuards.splice(0, timeOperationGuards.length, ...timeOperationGuards.filter((guard) => guard.key !== key)); });
    holdTimeOperationGuard = vi.fn((key: string, projectId: string, notice: any) => { timeOperationGuards.splice(0, timeOperationGuards.length, ...timeOperationGuards.filter((guard) => guard.key !== key), { key, projectId, status: 'uncertain', notice }); });
    refreshTimeOperationStatus = vi.fn().mockResolvedValue(false);
    convertUnbilledTimeToInvoice = vi.fn().mockResolvedValue({ data: { id: 'invoice-1', invoiceNumber: 'INV-2401' }, requestId: 'req-invoice-time', refreshFailed: false });
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      timeEntries: [entry],
      projects: [project],
      settings: { currencySymbol: '₹' },
      deleteTimeEntry,
      convertUnbilledTimeToInvoice,
      timeOperationGuards,
      beginTimeOperation,
      completeTimeOperation,
      holdTimeOperationGuard,
      refreshTimeOperationStatus,
    } as any);
  });

  afterEach(() => cleanup());

  it('requires an in-app confirmation and shows the committed deletion receipt', async () => {
    render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry Design review' }));
    expect(screen.getByRole('alertdialog', { name: 'Delete time entry?' })).toBeTruthy();
    expect(deleteTimeEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry' }));

    expect(await screen.findByText('Time entry deleted')).toBeTruthy();
    expect(screen.getByText('req-delete-time')).toBeTruthy();
    expect(deleteTimeEntry).toHaveBeenCalledWith('time-1');
  });

  it('blocks another deletion after an uncertain server outcome', async () => {
    deleteTimeEntry.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'The connection ended before the server result was confirmed',
      status: 0,
      requestId: 'req-delete-uncertain',
      errorCode: 'NETWORK_FAILURE',
    }, 'Time-entry outcome is uncertain'));
    render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry Design review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry' }));

    expect(await screen.findByText('Time entry deletion could not be confirmed')).toBeTruthy();
    expect(screen.getByText('req-delete-uncertain')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete time entry Design review' }).hasAttribute('disabled')).toBe(true);
    expect(deleteTimeEntry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Verify status' }));
    expect(await screen.findByText('Time operation status is still unavailable')).toBeTruthy();
    expect(screen.getByText('req-delete-uncertain')).toBeTruthy();
  });

  it('shows invoice posting evidence without opening a new invoice editor', async () => {
    const onOpenLogTime = vi.fn();
    render(<TimeLogsView onOpenLogTime={onOpenLogTime} />);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'project-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert Unbilled to Invoice' }));

    expect(await screen.findByText('Invoice INV-2401 created')).toBeTruthy();
    expect(screen.getByText('req-invoice-time')).toBeTruthy();
    expect(convertUnbilledTimeToInvoice).toHaveBeenCalledWith('project-1', 'customer-1');
    expect(onOpenLogTime).not.toHaveBeenCalled();
  });

  it('keeps a committed invoice receipt when list refresh fails', async () => {
    convertUnbilledTimeToInvoice.mockResolvedValueOnce({ data: { id: 'invoice-1', invoiceNumber: 'INV-2401' }, requestId: 'req-invoice-stale', refreshFailed: true });
    const first = render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    const projectFilter = screen.getAllByRole('combobox')[0];
    fireEvent.change(projectFilter, { target: { value: 'project-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert Unbilled to Invoice' }));

    expect(await screen.findByText('Invoice INV-2401 posted; list not refreshed')).toBeTruthy();
    expect(screen.getByText('req-invoice-stale')).toBeTruthy();
    first.unmount();

    render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    expect(screen.getByText('req-invoice-stale')).toBeTruthy();
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'project-1' } });
    expect(screen.getByRole('button', { name: 'Convert Unbilled to Invoice' }).hasAttribute('disabled')).toBe(true);
  });

  it('retains an uncertain invoice receipt and retry lock after leaving and reopening Time Logs', async () => {
    convertUnbilledTimeToInvoice.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'The connection ended before the server result was confirmed',
      status: 0,
      requestId: 'req-invoice-remount',
      errorCode: 'NETWORK_FAILURE',
    }, 'Invoice outcome is uncertain'));
    const first = render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'project-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert Unbilled to Invoice' }));
    expect(await screen.findByText('Invoice outcome could not be confirmed')).toBeTruthy();
    first.unmount();

    render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'project-1' } });
    expect(screen.getByText('req-invoice-remount')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Convert Unbilled to Invoice' }).hasAttribute('disabled')).toBe(true);
  });
  it('blocks another deletion until authoritative state refreshes after a committed stale response', async () => {
    deleteTimeEntry.mockResolvedValueOnce({ data: undefined, requestId: 'req-delete-stale', refreshFailed: true });
    render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry Design review' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete time entry' }));

    expect(await screen.findByText('Time entry deleted; list not refreshed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete time entry Design review' }).hasAttribute('disabled')).toBe(true);
  });

  it('treats a definitive no-unbilled-time conflict as a rejection, not an uncertain commit', async () => {
    convertUnbilledTimeToInvoice.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'No unbilled billable time was found for this project',
      status: 409,
      requestId: 'req-invoice-empty',
      errorCode: 'CONFLICT',
    }, 'No unbilled time'));
    render(<TimeLogsView onOpenLogTime={vi.fn()} />);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'project-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Convert Unbilled to Invoice' }));

    expect(await screen.findByText('Invoice was not created')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Convert Unbilled to Invoice' }).hasAttribute('disabled')).toBe(false);
  });
});
