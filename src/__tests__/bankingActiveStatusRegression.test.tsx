/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as BooksContext from '../context/BooksContext';
import { BankingView } from '../components/banking/BankingView';

vi.mock('../services/bankingService', () => ({
  BankingService: {
    getAccounts: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../components/banking/BankAccountsSummaryCards', () => ({
  BankAccountsSummaryCards: () => <div data-testid="summary" />,
}));

vi.mock('../components/banking/BankAccountsListSidebar', () => ({
  BankAccountsListSidebar: ({ currentCategoryAccounts }: { currentCategoryAccounts: Array<{ name: string }> }) => (
    <div data-testid="bank-account-list">{currentCategoryAccounts.map((account) => account.name).join(', ')}</div>
  ),
}));

vi.mock('../components/banking/BankTransactionsFeed', () => ({
  BankTransactionsFeed: () => <div data-testid="transactions" />,
}));

vi.mock('../components/common/QuickAddAccountModal', () => ({ QuickAddAccountModal: () => null }));
vi.mock('../components/banking/BankTransactionDetailsModal', () => ({ BankTransactionDetailsModal: () => null }));
vi.mock('../components/banking/RecordBankTransactionModal', () => ({ RecordBankTransactionModal: () => null }));
vi.mock('../components/banking/ReconcileBankModal', () => ({ ReconcileBankModal: () => null }));
vi.mock('../components/banking/ImportStatementModal', () => ({ ImportStatementModal: () => null }));
vi.mock('../components/banking/DeleteBankAccountModal', () => ({ DeleteBankAccountModal: () => null }));
vi.mock('../components/banking/TransferFundsModal', () => ({ TransferFundsModal: () => null }));
vi.mock('../components/banking/TreasuryTransactionModal', () => ({ TreasuryTransactionModal: () => null }));

describe('BankingView active-status regression', () => {
  it('lists an API Active bank account while the Active filter is selected', async () => {
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      accounts: [
        {
          id: 'bank-1',
          code: '1020',
          name: 'Operating Bank',
          type: 'Asset',
          subType: 'Bank',
          status: 'Active',
          balance: 0,
        },
      ],
      journalEntries: [],
      expenses: [],
      paymentsReceived: [],
      settings: { currencySymbol: 'INR' },
      refreshAccounts: vi.fn(),
    } as any);

    render(<BankingView />);

    await waitFor(() => {
      expect(screen.getByTestId('bank-account-list').textContent).toContain('Operating Bank');
    });
  });
});
