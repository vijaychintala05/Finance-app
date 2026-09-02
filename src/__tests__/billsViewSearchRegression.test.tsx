/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BillsView } from '../components/purchases/BillsView';
import * as BooksContext from '../context/BooksContext';
import { Bill } from '../types';

describe('BillsView Deferred Search & Notes Safety Regression', () => {
  const mockBills: Bill[] = [
    {
      id: 'bill-1',
      billNumber: 'BILL-001',
      vendorName: 'Acme Supplies',
      billDate: '2026-03-01',
      dueDate: '2026-03-31',
      totalAmount: 1500,
      amountPaid: 0,
      balanceDue: 1500,
      status: 'Unpaid',
      // Note: notes is omitted to verify undefined notes safety
    },
    {
      id: 'bill-2',
      billNumber: 'BILL-002',
      vendorName: 'Global Cloud Services',
      billDate: '2026-03-02',
      dueDate: '2026-04-01',
      totalAmount: 2500,
      amountPaid: 2500,
      balanceDue: 0,
      status: 'Paid',
      notes: 'Quarterly server hosting',
    },
  ];

  const mockUseBooks = {
    bills: mockBills,
    addBill: vi.fn(),
    vendors: [{ id: 'ven-1', name: 'Acme Supplies', email: 'acme@test.com' }],
    accounts: [
      { id: 'acc-exp', name: 'Office Expense', code: '5001', type: 'Expense', status: 'Active', allowDirectPosting: true },
    ],
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    settings: {
      currencySymbol: '$',
      currencyCode: 'USD',
      dateFormat: 'YYYY-MM-DD',
      companyName: 'Test Org',
    },
  };

  it('renders bills safely when notes are missing and filters by bill number and vendor', async () => {
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue(mockUseBooks as any);

    render(<BillsView />);

    // Both bills should render initially
    expect(screen.getByText('BILL-001')).toBeTruthy();
    expect(screen.getByText('Acme Supplies')).toBeTruthy();
    expect(screen.getByText('BILL-002')).toBeTruthy();
    expect(screen.getByText('Global Cloud Services')).toBeTruthy();

    // Type into search input
    const searchInput = screen.getByPlaceholderText('Search bill #, vendor, notes...');
    fireEvent.change(searchInput, { target: { value: 'Acme' } });

    // Should safely display Acme without throwing on bill-1's undefined notes
    expect(screen.getByText('BILL-001')).toBeTruthy();
    expect(screen.getByText('Acme Supplies')).toBeTruthy();

    // Search for bill number
    fireEvent.change(searchInput, { target: { value: '002' } });
    expect(screen.getByText('BILL-002')).toBeTruthy();
  });
});
