/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExpensesView } from '../components/expenses/ExpensesView';
import * as BooksContext from '../context/BooksContext';
import { Expense } from '../types';

describe('ExpensesView Pagination & Smart Search', () => {
  // Generate 25 sample expenses
  const mockExpenses: Expense[] = Array.from({ length: 25 }, (_, i) => {
    const num = i + 1;
    return {
      id: `exp-${num}`,
      referenceNumber: `EXP-${String(num).padStart(3, '0')}`,
      accountId: num % 2 === 0 ? 'acc-software' : 'acc-travel',
      accountName: num % 2 === 0 ? 'Software Subscriptions' : 'Travel & Lodging',
      paidFromAccountId: 'acc-bank',
      paidFromAccountName: 'Business Checking Account',
      date: `2026-09-${String(Math.min(num, 28)).padStart(2, '0')}`,
      amount: num === 5 ? 450 : num * 100,
      vendorName: num === 5 ? 'AWS Cloud Hosting' : num % 3 === 0 ? 'Delta Airlines' : 'Office Depot',
      invoiceNumber: num === 5 ? 'AWS-2026-450' : undefined,
      description: num === 5 ? 'Monthly cloud computing infrastructure' : `Business expense notes ${num}`,
      isBillable: num % 4 === 0,
      isItemized: num % 5 === 0,
      status: num === 25 ? 'VOIDED' : 'POSTED',
      receiptFileName: num % 3 === 0 ? `receipt-${num}.jpg` : undefined,
    } as Expense;
  });

  const mockAccounts = [
    { id: 'acc-software', name: 'Software Subscriptions', code: '5100', type: 'Expense' },
    { id: 'acc-travel', name: 'Travel & Lodging', code: '5200', type: 'Expense' },
    { id: 'acc-bank', name: 'Business Checking Account', code: '1000', type: 'Asset' },
  ];

  const mockUseBooks = {
    expenses: mockExpenses,
    accounts: mockAccounts,
    settings: {
      currencySymbol: '$',
      currencyCode: 'USD',
      dateFormat: 'YYYY-MM-DD',
      companyName: 'Acme Test Corp',
    },
  };

  beforeEach(() => {
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue(mockUseBooks as any);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders default 10 expenses per page when 25 expenses exist', () => {
    render(<ExpensesView />);

    // Check summary text
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 10 of 25 expenses');

    // Ref EXP-001 through EXP-010 should be visible
    expect(screen.getAllByText('EXP-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EXP-010').length).toBeGreaterThan(0);

    // EXP-011 should NOT be visible on page 1
    expect(screen.queryByText('EXP-011')).toBeNull();
  });

  it('navigates to page 2 when Next button is clicked and back to page 1 with Prev button', () => {
    render(<ExpensesView />);

    const nextBtn = screen.getByRole('button', { name: 'Next page' });
    fireEvent.click(nextBtn);

    // Page 2: Showing 11 to 20 of 25 expenses
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 11 to 20 of 25 expenses');
    expect(screen.getAllByText('EXP-011').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EXP-020').length).toBeGreaterThan(0);
    expect(screen.queryByText('EXP-001')).toBeNull();

    // Click Previous page button
    const prevBtn = screen.getByRole('button', { name: 'Previous page' });
    fireEvent.click(prevBtn);

    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 10 of 25 expenses');
    expect(screen.getAllByText('EXP-001').length).toBeGreaterThan(0);
  });

  it('changes page size from 10 to 25 and shows all 25 expenses on page 1', () => {
    render(<ExpensesView />);

    const select = screen.getByRole('combobox', { name: 'Expenses per page' });
    fireEvent.change(select, { target: { value: '25' } });

    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 25 of 25 expenses');
    expect(screen.getAllByText('EXP-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EXP-025').length).toBeGreaterThan(0);
  });

  it('performs smart search by amount, description, vendor, and multi-token keywords', () => {
    render(<ExpensesView />);

    const searchInput = screen.getByPlaceholderText(/Search ref #, vendor, category/);

    // Search by amount 450
    fireEvent.change(searchInput, { target: { value: '450' } });
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 1 of 1 expenses');
    expect(screen.getAllByText('EXP-005').length).toBeGreaterThan(0);
    expect(screen.queryByText('EXP-001')).toBeNull();

    // Search by description keyword
    fireEvent.change(searchInput, { target: { value: 'infrastructure' } });
    expect(screen.getAllByText('EXP-005').length).toBeGreaterThan(0);

    // Multi-token search (vendor + amount)
    fireEvent.change(searchInput, { target: { value: 'AWS 450' } });
    expect(screen.getAllByText('EXP-005').length).toBeGreaterThan(0);

    // Search by the vendor-issued reference displayed in the register
    fireEvent.change(searchInput, { target: { value: 'AWS-2026-450' } });
    expect(screen.getAllByText('EXP-005').length).toBeGreaterThan(0);

    // Clear search with X button
    const clearBtn = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clearBtn);
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 10 of 25 expenses');
  });

  it('filters expenses using Quick Filter Chips (Receipts, Billable, Voided)', () => {
    render(<ExpensesView />);

    // Filter by Receipts
    const receiptsFilter = screen.getByRole('button', { name: /Receipts \(/ });
    fireEvent.click(receiptsFilter);

    // Receipts: num % 3 === 0 (3, 6, 9, 12, 15, 18, 21, 24 = 8 total)
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 8 of 8 expenses');
    expect(screen.getAllByText('EXP-003').length).toBeGreaterThan(0);

    // Reset to All before testing Voided
    const allFilter = screen.getByRole('button', { name: /All \(/ });
    fireEvent.click(allFilter);

    // Filter by Voided
    const voidedFilter = screen.getByRole('button', { name: /Voided \(/ });
    fireEvent.click(voidedFilter);

    // Voided: 1 total (EXP-025)
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 1 of 1 expenses');
    expect(screen.getAllByText('EXP-025').length).toBeGreaterThan(0);
  });

  it('resets page to 1 automatically when search is performed from page 2', () => {
    render(<ExpensesView />);

    // Go to page 2
    const nextBtn = screen.getByRole('button', { name: 'Next page' });
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 11 to 20 of 25 expenses');

    // Type in search
    const searchInput = screen.getByPlaceholderText(/Search ref #, vendor, category/);
    fireEvent.change(searchInput, { target: { value: 'Travel' } });

    // Page must reset to page 1
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 10 of');
  });

  it('disables previous button on page 1 and disables next button on the last page', () => {
    render(<ExpensesView />);

    const prevBtn = screen.getByRole('button', { name: 'Previous page' });
    expect(prevBtn.hasAttribute('disabled')).toBe(true);

    // Jump to page 3 (last page of 25 items at 10/page)
    const page3Btn = screen.getByRole('button', { name: 'Page 3' });
    fireEvent.click(page3Btn);

    expect(screen.getByText(/Showing/).textContent).toContain('Showing 21 to 25 of 25 expenses');
    const nextBtn = screen.getByRole('button', { name: 'Next page' });
    expect(nextBtn.hasAttribute('disabled')).toBe(true);
  });

  it('filters itemized expenses when the Itemized filter chip is clicked', () => {
    render(<ExpensesView />);

    const itemizedFilter = screen.getByRole('button', { name: /Itemized \(/i });
    fireEvent.click(itemizedFilter);

    // Items with num % 5 === 0 (5, 10, 15, 20, 25 = 5 total)
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 5 of 5 expenses');
    expect(screen.getAllByText('EXP-005').length).toBeGreaterThan(0);
    expect(screen.getAllByText('EXP-010').length).toBeGreaterThan(0);
    expect(screen.queryByText('EXP-001')).toBeNull();
  });

  it('filters the register by category and vendor without losing the operational columns', () => {
    render(<ExpensesView />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by expense category' }), {
      target: { value: 'acc-travel' },
    });
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 10 of 13 expenses');
    expect(screen.getByText('Paid Through')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by vendor' }), {
      target: { value: 'AWS Cloud Hosting' },
    });
    expect(screen.getByText(/Showing/).textContent).toContain('Showing 1 to 1 of 1 expenses');
    expect(screen.getAllByText(/AWS-2026-450/).length).toBeGreaterThan(0);
  });
});
