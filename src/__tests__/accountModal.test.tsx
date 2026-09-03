// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AccountModal, getNextAvailableAccountCode } from '../components/coa/AccountModal';
import { Account } from '../types';

afterEach(() => {
  cleanup();
});

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    code: '1010',
    name: 'Petty Cash',
    type: 'Asset',
    subType: 'Cash',
    balance: 100,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-2',
    code: '6010',
    name: 'Office Rent',
    type: 'Expense',
    subType: 'Office & Administrative',
    balance: 500,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-3',
    code: '6020',
    name: 'Archived Subscriptions',
    type: 'Expense',
    subType: 'Software & Subscriptions',
    balance: 0,
    status: 'Archived',
    normalBalance: 'Debit',
  },
];

const mockAddAccount = vi.fn();
const mockUpdateAccount = vi.fn();
const mockDeleteAccount = vi.fn();

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    addAccount: mockAddAccount,
    updateAccount: mockUpdateAccount,
    deleteAccount: mockDeleteAccount,
  }),
}));

describe('AccountModal', () => {
  it('keeps account creation focused and moves advanced controls out of the primary flow', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByLabelText(/account type/i)).toBeTruthy();
    expect(screen.getByLabelText(/account name/i)).toBeTruthy();
    expect(screen.getByLabelText(/account code/i)).toBeTruthy();
    expect(screen.getByLabelText(/description/i)).toBeTruthy();
    expect(screen.getByText('Additional account settings')).toBeTruthy();
    expect(screen.getByText('Opening balance')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save account' })).toBeTruthy();
  });

  it('suggests the next available code avoiding collisions and reserved codes', () => {
    const nextAssetCode = getNextAvailableAccountCode('Asset', mockAccounts);
    expect(nextAssetCode).toBeTruthy();
    expect(nextAssetCode).not.toBe('1010'); // 1010 is taken
    expect(nextAssetCode).not.toBe('1000'); // 1000 is reserved

    const nextExpenseCode = getNextAvailableAccountCode('Expense', mockAccounts);
    expect(nextExpenseCode).toBeTruthy();
    expect(nextExpenseCode).not.toBe('6010'); // taken
    expect(nextExpenseCode).not.toBe('6020'); // archived but taken
    expect(nextExpenseCode).not.toBe('6000'); // reserved
  });

  it('uses the in-app searchable picker to select an expense subtype', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByLabelText(/account type: asset - bank/i));
    const search = screen.getByPlaceholderText('Search account types');
    fireEvent.click(screen.getByRole('button', { name: 'Expense', exact: true }));

    expect(screen.getByRole('option', { name: 'Expense: Payroll' })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'software' } });
    expect(screen.getByRole('option', { name: 'Expense: Software & Subscriptions' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Expense: Payroll' })).toBeNull();

    fireEvent.click(screen.getByRole('option', { name: 'Expense: Software & Subscriptions' }));
    expect(screen.getByLabelText(/account type: expense - software & subscriptions/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search account types')).toBeNull();
  });

  it('detects collision with active account code and displays warning', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    const codeInput = screen.getByLabelText(/account code/i);
    fireEvent.change(codeInput, { target: { value: '1010' } });

    expect(screen.getByText(/already in use by "Petty Cash"/i)).toBeTruthy();
    const saveButton = screen.getByRole('button', { name: 'Save account' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
  });

  it('detects collision with archived account code and explains how to restore it', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    const codeInput = screen.getByLabelText(/account code/i);
    fireEvent.change(codeInput, { target: { value: '6020' } });

    expect(screen.getByText(/belongs to archived account "Archived Subscriptions"/i)).toBeTruthy();
  });

  it('reveals a compatible parent picker when creating a sub-account', () => {
    render(<AccountModal isOpen onClose={vi.fn()} />);

    const toggle = screen.getByRole('checkbox', { name: /make this a sub-account/i });
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText(/^parent account/i)).toBeNull();

    fireEvent.click(toggle);

    const parentPicker = screen.getByLabelText(/^parent account/i) as HTMLSelectElement;
    expect(parentPicker.required).toBe(true);
    expect(screen.getByRole('option', { name: '1010 - Petty Cash' })).toBeTruthy();
    fireEvent.change(parentPicker, { target: { value: 'acc-1' } });
    expect(parentPicker.value).toBe('acc-1');
  });

  it('shows Restore to Active button when viewing an archived account', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const archivedAccount = mockAccounts.find((a) => a.id === 'acc-3')!;
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={archivedAccount} />);

    expect(screen.getByRole('button', { name: /restore to active/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^archive$/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /restore to active/i }));
    // User confirmation via window.confirm
    expect(mockUpdateAccount).toHaveBeenCalledWith('acc-3', { status: 'Active' });
  });

  it('offers deletion for a custom account and delegates the eligibility check to the server', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const account = mockAccounts.find((candidate) => candidate.id === 'acc-3')!;
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={account} />);

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(mockDeleteAccount).toHaveBeenCalledWith('acc-3');
  });

  it('does not offer deletion for a system account', () => {
    const systemAccount = { ...mockAccounts[0], isSystemAccount: true };
    render(<AccountModal isOpen onClose={vi.fn()} accountToEdit={systemAccount} />);

    expect(screen.queryByRole('button', { name: /^delete$/i })).toBeNull();
  });
});
