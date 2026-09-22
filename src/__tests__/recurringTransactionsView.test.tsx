// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringTransactionsView } from '../components/recurring/RecurringTransactionsView';

const { booksMock, getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  booksMock: {
    clients: [{ id: 'client-1', name: 'Acme Customer' }],
    vendors: [{ id: 'vendor-1', name: 'Supply Partner' }],
    accounts: [],
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    settings: { currencySymbol: '₹' },
  },
}));

vi.mock('../api/client', () => ({
  apiClient: { get: getMock, post: postMock },
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => booksMock,
}));

const profile = {
  id: 'profile-1',
  name: 'Monthly Retainer',
  kind: 'INVOICE',
  frequency: 'MONTHLY',
  next_run_date: '2026-10-01',
  status: 'ACTIVE',
  template: { lineItems: [{ amount: 2500 }] },
};

const occurrence = {
  id: 'occurrence-1',
  profile_id: 'profile-1',
  kind: 'INVOICE',
  scheduled_for: '2026-09-01',
  status: 'SUCCEEDED',
  attempt_count: 1,
  document_id: 'invoice-101',
  document_type: 'INVOICE',
  last_error_code: null,
  last_error_message: null,
  next_attempt_at: null,
  completed_at: '2026-09-01T01:02:03.000Z',
};

describe('RecurringTransactionsView authoritative workspace', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    getMock.mockImplementation(async (endpoint: string) => ({
      data: endpoint === '/recurring/profiles' ? [profile] : [occurrence],
      error: null,
      status: 200,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows generated-document lineage and execution evidence', async () => {
    render(<RecurringTransactionsView kind="INVOICE" />);

    expect((await screen.findAllByText('Monthly Retainer')).length).toBe(2);
    expect(screen.getByText('Generated document history')).toBeTruthy();
    expect(screen.getByText(/INVOICE · invoice-101/)).toBeTruthy();
    expect(screen.getByText(/Completed/)).toBeTruthy();
    expect(getMock).toHaveBeenCalledWith('/recurring/occurrences');
  });

  it('surfaces retry and quarantine evidence rather than hiding worker failures', async () => {
    getMock.mockImplementation(async (endpoint: string) => ({
      data: endpoint === '/recurring/profiles' ? [profile] : [{
        ...occurrence,
        status: 'QUARANTINED',
        attempt_count: 5,
        document_id: null,
        document_type: null,
        completed_at: null,
        last_error_code: 'RECURRING_DOCUMENT_CREATION_FAILED',
        last_error_message: 'Customer account is archived',
      }],
      error: null,
      status: 200,
    }));
    render(<RecurringTransactionsView kind="INVOICE" />);

    expect(await screen.findByText('QUARANTINED')).toBeTruthy();
    expect(screen.getByText('Customer account is archived')).toBeTruthy();
    expect(screen.getByText('Not generated')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry occurrence' })).toBeTruthy();
  });

  it('queues a quarantined occurrence through the guarded retry endpoint', async () => {
    getMock.mockImplementation(async (endpoint: string) => ({
      data: endpoint === '/recurring/profiles' ? [profile] : [{
        ...occurrence,
        status: 'QUARANTINED',
        document_id: null,
        document_type: null,
        completed_at: null,
        last_error_message: 'Posting failed',
      }],
      error: null,
      status: 200,
    }));
    postMock.mockResolvedValue({ data: { id: 'occurrence-1', status: 'RETRY' }, error: null, status: 200 });
    render(<RecurringTransactionsView kind="INVOICE" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Retry occurrence' }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/recurring/occurrences/occurrence-1/retry'));
    expect(await screen.findByText('Occurrence queued for retry')).toBeTruthy();
  });

  it('uses a persistent uncertain-outcome receipt for pause requests', async () => {
    postMock.mockResolvedValue({
      data: null,
      error: 'Connection closed before response',
      status: 500,
      errorCode: 'NETWORK_FAILURE',
    });
    render(<RecurringTransactionsView kind="INVOICE" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Pause Monthly Retainer' }));
    expect(await screen.findByText('Schedule pause could not be confirmed')).toBeTruthy();
    expect(screen.getByText(/may already be paused/i)).toBeTruthy();
    expect(postMock).toHaveBeenCalledWith('/recurring/profiles/profile-1/pause');
  });

  it('marks a committed schedule as stale instead of inviting duplicate creation', async () => {
    let failRefresh = false;
    getMock.mockImplementation(async (endpoint: string) => failRefresh
      ? { data: null, error: 'Refresh unavailable', status: 503 }
      : { data: endpoint === '/recurring/profiles' ? [profile] : [], error: null, status: 200 });
    postMock.mockImplementation(async () => {
      failRefresh = true;
      return { data: { ...profile, id: 'profile-2' }, error: null, status: 201 };
    });
    render(<RecurringTransactionsView kind="INVOICE" />);

    await screen.findByText('Monthly Retainer');
    fireEvent.click(screen.getByRole('button', { name: /new schedule/i }));
    expect(screen.getByRole('dialog', { name: /new recurring invoice/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Schedule name'), { target: { value: 'Quarterly Advisory' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Schedule' }));

    expect(await screen.findByText('Schedule created, but the list is stale')).toBeTruthy();
    expect(screen.getByText(/do not submit it again/i)).toBeTruthy();
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
  });
});
