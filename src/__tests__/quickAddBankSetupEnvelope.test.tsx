// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useBooks } from '../context/BooksContext';
import { QuickAddAccountModal } from '../components/common/QuickAddAccountModal';

vi.mock('../context/BooksContext', () => ({ useBooks: vi.fn() }));

const makeResponse = (body: unknown, status = 201) => new Response(
  body === undefined ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json', 'x-request-id': 'req-bank-malformed' } },
);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('active_organization_id', 'org-a');
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('Quick Add bank setup envelope recovery', () => {
  it.each([
    ['empty 2xx body', undefined, 201],
    ['unsuccessful 2xx envelope', { success: false, error: 'Bank setup failed' }, 200],
    ['receipt linked to another ledger account', { success: true, data: { id: 'bank-1', organizationId: 'org-a', ledgerAccountId: 'different-ledger' } }, 201],
  ])('keeps the modal open for a %s', async (_label, responseBody, status) => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(responseBody, status));
    const onClose = vi.fn();
    const addAccount = vi.fn().mockResolvedValue({
      data: { id: 'ledger-1', code: '1010', name: 'Operating Bank', type: 'Asset', subType: 'Bank', balance: 0 },
      requestId: 'req-ledger-create', refreshFailed: false,
    });
    vi.mocked(useBooks).mockReturnValue({ accounts: [], addAccount, settings: { currencyCode: 'USD' } } as any);

    render(<QuickAddAccountModal isOpen onClose={onClose} defaultCategory="Bank" />);
    fireEvent.change(screen.getByPlaceholderText('e.g. HDFC Operating Checking Account'), { target: { value: 'Operating Bank' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 1010'), { target: { value: '1010' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. HDFC Bank'), { target: { value: 'HDFC Bank' } });
    fireEvent.change(screen.getByPlaceholderText('4–34 letters or digits'), { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Account' }));

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('Ledger account saved; bank setup outcome needs review');
    expect(notice.textContent).toContain('req-bank-malformed');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('e.g. HDFC Operating Checking Account')).toBeTruthy();
    expect(addAccount).toHaveBeenCalledTimes(1);
  });
});
