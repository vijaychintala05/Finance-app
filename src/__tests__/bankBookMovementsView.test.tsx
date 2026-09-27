/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankAccountWorkspace } from '../components/banking/BankAccountWorkspace';

const serviceMocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  getBookMovements: vi.fn(),
}));

vi.mock('../services/bankingService', () => ({ BankingService: serviceMocks }));

const account = {
  id: 'ledger-book-view', code: '1001', name: 'Operating Bank', type: 'Asset',
  subType: 'Bank', balance: 1000, status: 'Active',
} as any;
const bankAccount = {
  id: 'bank-book-view', organizationId: 'org-book-view', ledgerAccountId: account.id,
  accountName: 'Operating Bank', accountNumber: '1234', bankName: 'Example Bank',
  accountType: 'Checking', currency: 'INR', currentBalance: 1000, statementImportEnabled: true,
  status: 'Active', isActive: true, createdAt: '2026-09-01', updatedAt: '2026-09-01',
} as any;

const renderWorkspace = (refreshTrigger = 1) => render(
  <BankAccountWorkspace
    account={account}
    bankAccount={bankAccount}
    journalEntries={[]}
    currencySymbol="₹"
    onBackToOverview={vi.fn()}
    onImportStatement={vi.fn()}
    onReconcile={vi.fn()}
    onTransferFunds={vi.fn()}
    onRecordTransaction={vi.fn()}
    onOpenMatch={vi.fn()}
    onOpenCategorize={vi.fn()}
    onSelectTxDetails={vi.fn()}
    onRefresh={vi.fn()}
    refreshTrigger={refreshTrigger}
  />
);

const emptyPage = { movements: [], total: 30, inflowTotal: 0, outflowTotal: 0, limit: 25, offset: 0, hasMore: true };

describe('FirmBooks bank movements view', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reloads on refresh and resets server pagination when search changes', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ balances: {}, transactions: [] });
    serviceMocks.getBookMovements.mockResolvedValue(emptyPage);
    const view = renderWorkspace(1);
    fireEvent.click(screen.getByRole('button', { name: 'Transactions in FirmBooks' }));
    await waitFor(() => expect(serviceMocks.getBookMovements).toHaveBeenCalledWith(bankAccount.id, expect.objectContaining({ offset: 0 })));

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(serviceMocks.getBookMovements).toHaveBeenCalledWith(bankAccount.id, expect.objectContaining({ offset: 25 })));
    fireEvent.change(screen.getByPlaceholderText('Search description, reference, party...'), { target: { value: 'rent' } });
    await waitFor(() => expect(serviceMocks.getBookMovements).toHaveBeenCalledWith(bankAccount.id, expect.objectContaining({ search: 'rent', offset: 0 })));

    const callsBeforeRefresh = serviceMocks.getBookMovements.mock.calls.length;
    view.rerender(
      <BankAccountWorkspace
        account={account} bankAccount={bankAccount} journalEntries={[]} currencySymbol="₹"
        onBackToOverview={vi.fn()} onImportStatement={vi.fn()} onReconcile={vi.fn()}
        onTransferFunds={vi.fn()} onRecordTransaction={vi.fn()} onOpenMatch={vi.fn()}
        onOpenCategorize={vi.fn()} onSelectTxDetails={vi.fn()} onRefresh={vi.fn()} refreshTrigger={2}
      />
    );
    await waitFor(() => expect(serviceMocks.getBookMovements.mock.calls.length).toBeGreaterThan(callsBeforeRefresh));
    expect(serviceMocks.getBookMovements).toHaveBeenLastCalledWith(bankAccount.id, expect.objectContaining({ search: 'rent', offset: 0 }));
  });

  it('shows failed loads as errors rather than zero-result books', async () => {
    serviceMocks.getWorkspace.mockResolvedValue({ balances: {}, transactions: [] });
    serviceMocks.getBookMovements.mockRejectedValue(new Error('Ledger service unavailable'));
    renderWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Transactions in FirmBooks' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ledger service unavailable');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('No posted ledger movements found for this bank account.')).toBeNull();
  });
});
