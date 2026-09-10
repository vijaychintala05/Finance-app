// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SearchableAccountPicker } from '../components/expenses/SearchableAccountPicker';
import { Account } from '../types';

describe('SearchableAccountPicker Component', () => {
  const mockAccounts: Account[] = [
    {
      id: 'acc-1',
      code: '6010',
      name: 'Travel & Lodging',
      type: 'Expense',
      subType: 'Operating Expense',
      status: 'Active',
      isLocked: false,
    },
    {
      id: 'acc-2',
      code: '6020',
      name: 'Meals & Entertainment',
      type: 'Expense',
      subType: 'Operating Expense',
      status: 'Active',
      isLocked: false,
    },
    {
      id: 'acc-3',
      code: '6030',
      name: 'Office Supplies & Stationery',
      type: 'Expense',
      subType: 'Operating Expense',
      status: 'Active',
      isLocked: false,
    },
    {
      id: 'acc-4',
      code: '5010',
      name: 'Direct Project Consulting',
      type: 'Expense',
      subType: 'Direct Expense / Cost of Goods',
      status: 'Active',
      isLocked: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders closed with placeholder when no account is selected', () => {
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={vi.fn()}
        accounts={mockAccounts}
      />
    );

    expect(screen.getByText('Select expense account...')).toBeTruthy();
    const triggerBtn = screen.getByRole('button', { name: /expense category: select expense account/i });
    expect(triggerBtn.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders closed with selected account code and name', () => {
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value="acc-1"
        onChange={vi.fn()}
        accounts={mockAccounts}
      />
    );

    expect(screen.getByText('6010 - Travel & Lodging')).toBeTruthy();
  });

  it('opens dropdown on click, displays all categories and count', () => {
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={vi.fn()}
        accounts={mockAccounts}
      />
    );

    const triggerBtn = screen.getByRole('button');
    fireEvent.click(triggerBtn);

    expect(triggerBtn.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByText('4 categories found')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search category by name or code...')).toBeTruthy();

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(4);
  });

  it('filters categories by code and by name, ranking matches', () => {
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={vi.fn()}
        accounts={mockAccounts}
      />
    );

    fireEvent.click(screen.getByRole('button'));

    const searchInput = screen.getByPlaceholderText('Search category by name or code...');

    // Search by code: 6020
    fireEvent.change(searchInput, { target: { value: '6020' } });
    expect(screen.getByText('1 categories found')).toBeTruthy();
    expect(screen.getByRole('option', { name: /meals & entertainment/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /travel & lodging/i })).toBeNull();

    // Search by name: "travel"
    fireEvent.change(searchInput, { target: { value: 'travel' } });
    expect(screen.getByText('1 categories found')).toBeTruthy();
    expect(screen.getByRole('option', { name: /travel & lodging/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /office supplies/i })).toBeNull();
  });

  it('highlights matched substring and allows clearing search input', () => {
    const { container } = render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={vi.fn()}
        accounts={mockAccounts}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('Search category by name or code...');

    fireEvent.change(searchInput, { target: { value: 'supplies' } });

    // Mark tag highlighting "Supplies"
    const marks = container.querySelectorAll('mark');
    expect(marks.length).toBeGreaterThanOrEqual(1);
    expect(marks[0].textContent?.toLowerCase()).toBe('supplies');

    // Clear search query using the clear button
    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    fireEvent.click(clearBtn);

    expect((searchInput as HTMLInputElement).value).toBe('');
    expect(screen.getByText('4 categories found')).toBeTruthy();
  });

  it('selects an account on click and calls onChange with accountId, then closes dropdown', () => {
    const mockOnChange = vi.fn();
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={mockOnChange}
        accounts={mockAccounts}
      />
    );

    fireEvent.click(screen.getByRole('button'));

    const option = screen.getByRole('option', { name: /6030 - office supplies/i });
    fireEvent.click(option);

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnChange).toHaveBeenCalledWith('acc-3');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes dropdown on Escape key', () => {
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={vi.fn()}
        accounts={mockAccounts}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeTruthy();

    const searchInput = screen.getByPlaceholderText('Search category by name or code...');
    fireEvent.keyDown(searchInput, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not open when disabled', () => {
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={vi.fn()}
        accounts={mockAccounts}
        disabled={true}
      />
    );

    const triggerBtn = screen.getByRole('button');
    expect(triggerBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.click(triggerBtn);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('displays empty state when no accounts match query', () => {
    render(
      <SearchableAccountPicker
        id="test-picker"
        label="Expense Category"
        placeholder="Select expense account..."
        value=""
        onChange={vi.fn()}
        accounts={mockAccounts}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('Search category by name or code...');

    fireEvent.change(searchInput, { target: { value: 'nonexistent-xyz' } });

    expect(screen.getByText(/No expense categories match/i)).toBeTruthy();
    expect(screen.getByText('0 categories found')).toBeTruthy();
  });
});
