// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExpenseModal } from '../components/expenses/ExpenseModal';
import { Account } from '../types';

afterEach(() => {
  cleanup();
});

const accounts: Account[] = [
  {
    id: 'payment-account', code: '1000', name: 'Operating Bank Account', type: 'Asset', subType: 'Bank', balance: 0, status: 'Active',
  },
  {
    id: 'plywood-account', code: '5010', name: 'Plywood', type: 'Cost of Goods Sold', subType: 'Materials', balance: 0, status: 'Active',
  },
  {
    id: 'labour-account', code: '5110', name: 'Direct Labor', type: 'Cost of Goods Sold', subType: 'Direct Labor', balance: 0, status: 'Active',
  },
  {
    id: 'rent-account', code: '6100', name: 'Office Rent', type: 'Expense', subType: 'Office & Administrative', balance: 0, status: 'Active',
  },
];

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts,
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    vendors: [],
    projects: [],
    addExpense: vi.fn(),
    settings: { currencyCode: 'INR' },
  }),
}));

describe('ExpenseModal account picker', () => {
  it('uses an in-app searchable picker instead of the browser account menu', () => {
    render(<ExpenseModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /expense account:/i }));
    const search = screen.getByPlaceholderText('Search expense accounts');
    fireEvent.change(search, { target: { value: 'plywood' } });

    expect(screen.getByRole('option', { name: /5010 - plywood/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /5110 - direct labor/i })).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: /5010 - plywood/i }));
    expect(screen.getByRole('button', { name: /expense account: 5010 - plywood/i })).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search expense accounts')).toBeNull();
  });
});
