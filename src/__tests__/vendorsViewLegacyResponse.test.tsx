// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VendorsView } from '../components/purchases/VendorsView';
import { apiClient } from '../api/client';

const { mockBooks } = vi.hoisted(() => ({
  mockBooks: {
    vendors: [] as any[],
    settings: { currencySymbol: '$' },
    accounts: [] as any[],
    addVendor: vi.fn(),
    updateVendor: vi.fn(),
    archiveVendor: vi.fn(),
    restoreVendor: vi.fn(),
  },
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => mockBooks,
}));

describe('VendorsView server response compatibility', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => cleanup());

  it('renders vendors when the server returns its legacy array response', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [{
        id: 'vendor-demo-1',
        name: 'DEMO - Harborline Office Supply Co.',
        companyName: 'Harborline Office Supply Co.',
        email: 'ap@harborline.example',
        phone: '4155550101',
        active: true,
        payablesBalance: 0,
        unusedCredits: 0,
        advanceBalance: 0,
      }, {
        id: 'vendor-demo-2',
        name: 'DEMO - Archived Supplier',
        active: false,
        payablesBalance: 0,
        unusedCredits: 0,
        advanceBalance: 0,
      }],
      error: null,
      status: 200,
    } as any);

    render(<VendorsView />);

    expect(await screen.findAllByText('DEMO - Harborline Office Supply Co.')).not.toHaveLength(0);
    expect(screen.queryByText('DEMO - Archived Supplier')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('1–1 of 1')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'inactive' }));
    expect(await screen.findAllByText('DEMO - Archived Supplier')).not.toHaveLength(0);
    expect(screen.queryByText('DEMO - Harborline Office Supply Co.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'all' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search vendors' }), { target: { value: 'harborline' } });
    expect(await screen.findAllByText('DEMO - Harborline Office Supply Co.')).not.toHaveLength(0);
    expect(screen.queryByText('DEMO - Archived Supplier')).toBeNull();
    expect(screen.getByText('1–1 of 1')).toBeDefined();
  });
});
