// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountModal } from '../components/coa/AccountModal';

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: [],
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
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
    expect(screen.queryByText(/server validates role\/subtype compatibility/i)).toBeNull();
  });
});
