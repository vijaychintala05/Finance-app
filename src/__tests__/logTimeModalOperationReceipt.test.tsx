// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LogTimeModal } from '../components/projects/LogTimeModal';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), createIdempotencyKey: vi.fn(() => 'modal-operation-key-123456'), getTimeEntryCreateOperationStatus: vi.fn() }));

vi.mock('../api/client', () => ({ apiClient: apiMocks }));

const mocks = vi.hoisted(() => ({
  addTimeEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  currentOrg: { id: 'org-time-modal' },
  projectName: 'Migration',
  clientName: 'Northwind',
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    currentOrg: mocks.currentOrg,
    projects: [{ id: 'project-1', code: 'PRJ-1', name: mocks.projectName, clientId: 'client-1', hourlyRate: 120 }],
    clients: [{ id: 'client-1', name: mocks.clientName }],
    timeEntries: [],
    addTimeEntry: mocks.addTimeEntry,
    getTimeEntryCreateOperationStatus: (...args: any[]) => apiMocks.getTimeEntryCreateOperationStatus(...args),
    updateTimeEntry: mocks.updateTimeEntry,
  }),
}));

describe('LogTimeModal operation receipt', () => {
  const onClose = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    apiMocks.get.mockResolvedValue({ data: [], error: null, status: 200 });
    apiMocks.getTimeEntryCreateOperationStatus.mockResolvedValue({ data: { state: 'UNKNOWN' }, error: null, status: 200 });
    mocks.currentOrg.id = 'org-time-modal';
    mocks.projectName = 'Migration';
    mocks.clientName = 'Northwind';
    mocks.addTimeEntry.mockRejectedValueOnce({ message: 'Network timeout', response: { status: 409, error: 'An identical request is already being processed', errorCode: 'COMMAND_IN_PROGRESS', requestId: 'req-time-modal' } })
      .mockResolvedValueOnce({ data: { id: 'time-modal-1' }, requestId: 'req-time-modal-commit', refreshFailed: true });
    mocks.updateTimeEntry.mockResolvedValue(true);
  });
  afterEach(() => { cleanup(); sessionStorage.clear(); });

  it('restores an uncertain create as verification-only after unmount', async () => {
    mocks.addTimeEntry.mockReset().mockRejectedValueOnce({ message: 'Success without an ID', response: { status: 201, requestId: 'req-restored-time', retryable: true } });
    const first = render(<LogTimeModal isOpen onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('e.g., FHIR API Security Audit & Testing'), { target: { value: 'Review contracts' } });
    fireEvent.submit(first.container.querySelector('form')!);
    expect(await screen.findByRole('alert')).toBeTruthy();
    first.unmount();

    render(<LogTimeModal isOpen onClose={onClose} />);
    expect((await screen.findByRole('alert')).textContent).toContain('A prior time-entry save is unresolved');
    expect((screen.getByRole('button', { name: 'Verify in Time Logs' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.addTimeEntry).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('firmbooks_pending_time_entry_create')).toContain('verify_only');
  });
  it('does not treat an identical historical row as proof of this operation', async () => {
    const payload = { projectId: 'project-1', projectName: 'Migration', clientName: 'Northwind', staffName: 'Sarah Jenkins', taskName: 'Review contracts', date: '2026-09-24', hours: 8, hourlyRate: 120, isBillable: true, isBilled: false, description: '' };
    sessionStorage.setItem('firmbooks_pending_time_entry_create', JSON.stringify({ payload, organizationId: 'org-time-modal', idempotencyKey: 'modal-operation-key-123456', status: 'retryable', source: 'modal' }));
    apiMocks.get.mockResolvedValue({ data: [{ id: 'historical-identical-time', ...payload }], error: null, status: 200 });
    render(<LogTimeModal isOpen onClose={onClose} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Retry same entry' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText(/historical-identical-time/)).toBeNull();
    expect(sessionStorage.getItem('firmbooks_pending_time_entry_create')).toContain('retryable');
    expect(sessionStorage.getItem('firmbooks_committed_time_entry_receipt')).toBeNull();
    expect(mocks.addTimeEntry).not.toHaveBeenCalled();
  });

  it('uses the server receipt ID to confirm an uncertain entry after remount', async () => {
    const payload = { projectId: 'project-1', projectName: 'Migration', clientName: 'Northwind', staffName: 'Sarah Jenkins', taskName: 'Review contracts', date: '2026-09-24', hours: 8, hourlyRate: 120, isBillable: true, isBilled: false, description: '' };
    sessionStorage.setItem('firmbooks_pending_time_entry_create', JSON.stringify({ payload, organizationId: 'org-time-modal', idempotencyKey: 'modal-operation-key-123456', status: 'retryable', source: 'modal' }));
    apiMocks.getTimeEntryCreateOperationStatus.mockResolvedValue({ data: { state: 'COMPLETED', responseStatus: 201, entryId: 'server-confirmed-time' }, error: null, status: 200 });
    render(<LogTimeModal isOpen onClose={onClose} />);
    expect(await screen.findByText(/Time entry server-confirmed-time was committed/)).toBeTruthy();
    expect(sessionStorage.getItem('firmbooks_pending_time_entry_create')).toBeNull();
    expect(sessionStorage.getItem('firmbooks_committed_time_entry_receipt')).toContain('server-confirmed-time');
    expect(mocks.addTimeEntry).not.toHaveBeenCalled();
  });

  it('retries the unchanged uncertain create and retains a committed refresh receipt', async () => {
    const { container, unmount } = render(<LogTimeModal isOpen onClose={onClose} />);
    fireEvent.change(screen.getByPlaceholderText('e.g., FHIR API Security Audit & Testing'), { target: { value: 'Reconcile opening balances' } });
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    const uncertain = await screen.findByRole('alert');
    expect(uncertain.textContent).toContain('Retry only the exact same entry');
    expect(uncertain.textContent).toContain('req-time-modal');
    expect((screen.getByRole('button', { name: 'Retry same entry' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByPlaceholderText('e.g., FHIR API Security Audit & Testing').closest('fieldset') as HTMLFieldSetElement).disabled).toBe(true);

    const firstRequest = mocks.addTimeEntry.mock.calls[0];
    unmount();
    mocks.projectName = 'Renamed after the first request';
    mocks.clientName = 'Different client after the first request';
    mocks.currentOrg.id = 'org-switched-during-recovery';
    apiMocks.getTimeEntryCreateOperationStatus.mockResolvedValue({ data: { state: 'PROCESSING' }, error: null, status: 200 });
    render(<LogTimeModal isOpen onClose={onClose} />);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Retry same entry' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Retry same entry' }));
    await waitFor(() => expect(screen.getByText(/Time entry time-modal-1 was committed/).textContent).toContain('Time entry time-modal-1 was committed'));
    expect(mocks.addTimeEntry).toHaveBeenCalledTimes(2);
    expect(mocks.addTimeEntry.mock.calls[1]).toEqual(firstRequest);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /Saved — close/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Start another entry' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Start another entry' }));
    expect((screen.getByRole('button', { name: 'Log Time' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
