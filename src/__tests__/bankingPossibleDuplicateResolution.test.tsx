/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankAccountWorkspace } from '../components/banking/BankAccountWorkspace';

const serviceMocks = vi.hoisted(() => ({
  getWorkspace: vi.fn(),
  ignoreTransaction: vi.fn(),
}));

vi.mock('../services/bankingService', () => ({
  BankingService: serviceMocks,
}));

const account = {
  id: 'ledger-1',
  code: '1010',
  name: 'Operating Bank',
  type: 'Asset',
  subType: 'Bank',
  balance: 1000,
  status: 'Active',
} as any;

const bankAccount = {
  id: 'bank-1',
  organizationId: 'org-1',
  ledgerAccountId: 'ledger-1',
  accountName: 'Operating Bank',
  accountNumber: '12345678',
  maskedAccountNumber: 'XXXX5678',
  bankName: 'Example Bank',
  accountType: 'Checking',
  currency: 'INR',
  country: 'IN',
  currentBalance: 1000,
  statementImportEnabled: true,
  status: 'Active',
  isActive: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as any;

const possibleDuplicate = {
  id: 'tx-possible-1',
  organizationId: 'org-1',
  bankAccountId: 'bank-1',
  statementImportId: 'import-1',
  transactionDate: '2026-09-20',
  amount: 250,
  direction: 'DEBIT',
  narration: 'Possible duplicate card charge',
  currency: 'INR',
  reconciliationStatus: 'POSSIBLE_DUPLICATE',
  fingerprint: 'fingerprint-1',
  createdAt: '2026-09-20T00:00:00.000Z',
};

const workspaceResponse = {
  balances: { bookBalance: 1000, statementBalance: 1000, difference: 0 },
  transactions: [possibleDuplicate],
};

const renderWorkspace = () => render(
  <BankAccountWorkspace
    account={account}
    bankAccount={bankAccount}
    journalEntries={[]}
    currencySymbol="INR"
    onBackToOverview={vi.fn()}
    onImportStatement={vi.fn()}
    onReconcile={vi.fn()}
    onTransferFunds={vi.fn()}
    onRecordTransaction={vi.fn()}
    onOpenMatch={vi.fn()}
    onOpenCategorize={vi.fn()}
    onSelectTxDetails={vi.fn()}
    onRefresh={vi.fn()}
  />
);

describe('Banking possible duplicate resolution', () => {
  beforeEach(() => {
    serviceMocks.getWorkspace.mockResolvedValue(workspaceResponse);
    serviceMocks.ignoreTransaction.mockResolvedValue({ isIgnored: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('makes the duplicate queue discoverable and keeps a candidate for normal review', async () => {
    renderWorkspace();

    await screen.findByRole('button', { name: 'Possible duplicates (1)' });
    expect(screen.getByText('Possible duplicate card charge')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Keep as new' }));

    await waitFor(() => {
      expect(serviceMocks.ignoreTransaction).toHaveBeenCalledWith('tx-possible-1', false);
    });
    expect(await screen.findByRole('button', { name: 'To Review (0)' })).toBeDefined();
  });

  it('lets the user ignore a candidate without posting to the ledger', async () => {
    renderWorkspace();

    await screen.findByText('Possible duplicate card charge');
    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));

    await waitFor(() => {
      expect(serviceMocks.ignoreTransaction).toHaveBeenCalledWith('tx-possible-1', true);
    });
  });
});
