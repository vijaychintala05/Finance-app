// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { BulkUpdatesView } from '../components/accounting/BulkUpdatesView';
import { BooksProvider } from '../context/BooksContext';
import { apiClient } from '../api/client';

vi.mock('../context/BooksContext', () => ({
  BooksProvider: ({ children }: { children: React.ReactNode }) => children,
  useBooks: () => ({
    accounts: [
      { id: 'cash', code: '1000', name: 'Cash', status: 'Active', isLocked: false },
      { id: 'expense', code: '5000', name: 'Office Expense', status: 'Active', isLocked: false },
    ],
  }),
}));

describe('BulkUpdatesView Component', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BooksProvider>{children}</BooksProvider>
  );

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders correctly when crypto.randomUUID is undefined (mobile/HTTP origin)', () => {
    const originalRandomUUID = globalThis.crypto?.randomUUID;
    // Simulate non-secure context where crypto.randomUUID is undefined
    if (globalThis.crypto) {
      // @ts-ignore
      delete globalThis.crypto.randomUUID;
    }

    render(<BulkUpdatesView />, { wrapper });

    expect(screen.getByText('Bulk Journal Entry')).toBeTruthy();
    expect(screen.getByText('3 entries')).toBeTruthy();
    expect(screen.getByText('CSV Template')).toBeTruthy();

    // Restore if existed
    if (originalRandomUUID && globalThis.crypto) {
      globalThis.crypto.randomUUID = originalRandomUUID;
    }
  });

  it('allows adding and removing rows', () => {
    render(<BulkUpdatesView />, { wrapper });

    expect(screen.getByText('3 entries')).toBeTruthy();

    const addBtn = screen.getByRole('button', { name: /add row/i });
    fireEvent.click(addBtn);

    expect(screen.getByText('4 entries')).toBeTruthy();

    const removeBtns = screen.getAllByTitle('Remove entry');
    expect(removeBtns.length).toBe(4);
    fireEvent.click(removeBtns[0]);

    expect(screen.getByText('3 entries')).toBeTruthy();
  });

  it('validates incomplete entries before submission', async () => {
    render(<BulkUpdatesView />, { wrapper });

    const postBtn = screen.getByRole('button', { name: /post 3 entries/i });
    fireEvent.click(postBtn);

    expect(
      await screen.findByText(/Complete every row with a date, two different accounts, and a positive amount/i)
    ).toBeTruthy();
  });

  it('includes valid Indian-formatted amounts in the batch total and posting payload', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { count: 3 },
      error: null,
      status: 201,
    });
    render(<BulkUpdatesView />, { wrapper });

    for (let index = 1; index <= 3; index += 1) {
      fireEvent.change(screen.getByLabelText(`Debit account ${index}`), { target: { value: 'expense' } });
      fireEvent.change(screen.getByLabelText(`Credit account ${index}`), { target: { value: 'cash' } });
      fireEvent.change(screen.getByLabelText(`Amount ${index}`), { target: { value: '1,00,000.50' } });
    }

    expect(screen.getByText('Total: 300,001.50')).toBeTruthy();
    expect(screen.getByText('(3 of 3 valid)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /post 3 entries/i }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const payload = post.mock.calls[0]?.[1] as { entries: Array<{ lines: unknown[] }> };
    expect(payload.entries).toHaveLength(3);
    expect(payload.entries[0].lines).toMatchObject([
      { accountId: 'expense', debit: 100000.5, credit: 0 },
      { accountId: 'cash', debit: 0, credit: 100000.5 },
    ]);
  });

  it('correctly handles international standard grouped amounts (e.g. 1,250.75)', () => {
    render(<BulkUpdatesView />, { wrapper });

    fireEvent.change(screen.getByLabelText('Debit account 1'), { target: { value: 'expense' } });
    fireEvent.change(screen.getByLabelText('Credit account 1'), { target: { value: 'cash' } });
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '1,250.75' } });

    expect(screen.getByText('(1 of 3 valid)')).toBeTruthy();
    expect(screen.getByText('Total: 1,250.75')).toBeTruthy();
  });

  it('rejects invalid amounts with more than 2 decimals or invalid characters from valid count', () => {
    render(<BulkUpdatesView />, { wrapper });

    fireEvent.change(screen.getByLabelText('Debit account 1'), { target: { value: 'expense' } });
    fireEvent.change(screen.getByLabelText('Credit account 1'), { target: { value: 'cash' } });
    // More than 2 decimal places: 100.999
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: '100.999' } });

    expect(screen.getByText('(0 of 3 valid)')).toBeTruthy();

    // Invalid non-numeric character
    fireEvent.change(screen.getByLabelText('Amount 1'), { target: { value: 'abc50' } });
    expect(screen.getByText('(0 of 3 valid)')).toBeTruthy();
  });
});
