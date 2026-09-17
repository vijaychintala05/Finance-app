// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RecordBankTransactionModal } from '../components/banking/RecordBankTransactionModal';

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: [
      { id: 'bank-1', code: '1000', name: 'Operating Bank', type: 'Asset', subType: 'Bank', status: 'Active', balance: 100 },
      { id: 'bank-2', code: '1010', name: 'Reserve Bank', type: 'Asset', subType: 'Bank', status: 'Active', balance: 200 },
      { id: 'expense-1', code: '5000', name: 'Office Expense', type: 'Expense', subType: 'General', status: 'Active', balance: 0 },
    ],
    addJournalEntry: vi.fn(),
    settings: { currencySymbol: '₹', currencyCode: 'INR' },
  }),
}));

describe('record bank transaction account choice', () => {
  afterEach(() => cleanup());

  it('requires an explicit bank and counter-account when opened from the overview', () => {
    render(<RecordBankTransactionModal isOpen onClose={vi.fn()} />);
    expect((screen.getByLabelText('Bank, cash, or wallet account') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Counter-account') as HTMLSelectElement).value).toBe('');
  });

  it('preserves the selected bank from its workspace but still requires a counter-account', () => {
    render(<RecordBankTransactionModal isOpen defaultAccountId="bank-2" onClose={vi.fn()} />);
    expect((screen.getByLabelText('Bank, cash, or wallet account') as HTMLSelectElement).value).toBe('bank-2');
    expect((screen.getByLabelText('Counter-account') as HTMLSelectElement).value).toBe('');
  });
});
