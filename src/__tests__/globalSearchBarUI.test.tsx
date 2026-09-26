// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GlobalSearchBar } from '../components/common/GlobalSearchBar';
import { BooksProvider } from '../context/BooksContext';
import * as BooksContextModule from '../context/BooksContext';

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<BooksProvider>{ui}</BooksProvider>);
};

describe('Phase 8.3C — Real GlobalSearchBar Component & UI Comprehensive Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(BooksContextModule, 'useBooks').mockImplementation(() => ({
      currentOrg: { id: 'org-test', name: 'Test Organization' },
    } as any));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });

  it('1. Renders desktop search bar trigger with shortcut badge', () => {
    renderWithProvider(<GlobalSearchBar />);
    const input = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    expect(input).toBeTruthy();
    expect(screen.getByText('⌘K')).toBeTruthy();
  });

  it('2. Clicking desktop input opens full modal palette', () => {
    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    expect(modalInput).toBeTruthy();
  });

  it('3. Typing query shorter than 2 characters does NOT trigger fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderWithProvider(<GlobalSearchBar />);
    
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'A' } });

    await new Promise((r) => setTimeout(r, 350));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('4. Typing 2+ characters triggers debounced API search request', async () => {
    const mockResults = [
      {
        id: 'inv-101',
        category: 'Invoice',
        title: 'INV-2026-999',
        subtitle: 'Acme Corp • ₹50,000',
        amount: 50000,
        linkRoute: '/sales/invoices?id=inv-101',
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify ({ results: mockResults }),
    } as Response);

    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'INV-2026' } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    }, { timeout: 1500 });

    await waitFor(() => {
      expect(screen.getByText('INV-2026-999')).toBeTruthy();
      expect(screen.getByText(/Acme Corp/i)).toBeTruthy();
    });
  });

  it('5. Clicking a search result calls onNavigate with correct tab and entityId', async () => {
    const onNavigate = vi.fn();
    const mockResults = [
      {
        id: 'vend-505',
        category: 'Vendor',
        title: 'AWS Cloud Services',
        subtitle: 'aws@amazon.com',
        linkRoute: '/purchases/vendors?id=vend-505',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify ({ results: mockResults }),
    } as Response);

    renderWithProvider(<GlobalSearchBar onNavigate={onNavigate} />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'AWS' } });

    await waitFor(() => {
      expect(screen.getByText('AWS Cloud Services')).toBeTruthy();
    });

    const resultItem = screen.getByText('AWS Cloud Services');
    fireEvent.click(resultItem);

    expect(onNavigate).toHaveBeenCalledWith('vendors', { entityId: 'vend-505' });
  });

  it('6. Keyboard navigation (ArrowDown, ArrowUp, Enter) selects item and navigates', async () => {
    const onNavigate = vi.fn();
    const mockResults = [
      {
        id: 'cn-1',
        category: 'Credit Note',
        title: 'CN-2026-001',
        subtitle: 'Client Credit • ₹5,000',
        linkRoute: '/sales/credit_notes?id=cn-1',
      },
      {
        id: 'vc-1',
        category: 'Vendor Credit',
        title: 'VCR-2026-001',
        subtitle: 'Vendor Rebate • ₹3,000',
        linkRoute: '/purchases/vendor_credits?id=vc-1',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify ({ results: mockResults }),
    } as Response);

    renderWithProvider(<GlobalSearchBar onNavigate={onNavigate} />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'Credit' } });

    await waitFor(() => {
      expect(screen.getByText('CN-2026-001')).toBeTruthy();
      expect(screen.getByText('VCR-2026-001')).toBeTruthy();
    });

    expect(screen.getByRole('dialog', { name: 'Global search' })).toBeTruthy();
    expect(modalInput.getAttribute('role')).toBe('combobox');
    expect(modalInput.getAttribute('aria-expanded')).toBe('true');
    const optionsBeforeMove = screen.getAllByRole('option');
    expect(optionsBeforeMove[0].getAttribute('aria-selected')).toBe('true');
    expect(modalInput.getAttribute('aria-activedescendant')).toBe(optionsBeforeMove[0].id);

    fireEvent.keyDown(modalInput, { key: 'ArrowDown' });
    const optionsAfterMove = screen.getAllByRole('option');
    expect(optionsAfterMove[0].getAttribute('aria-selected')).toBe('false');
    expect(optionsAfterMove[1].getAttribute('aria-selected')).toBe('true');
    expect(modalInput.getAttribute('aria-activedescendant')).toBe(optionsAfterMove[1].id);
    fireEvent.keyDown(modalInput, { key: 'Enter' });

    expect(onNavigate).toHaveBeenCalledWith('vendor_credits', { entityId: 'vc-1' });
  });

  it('7. Pressing Escape closes the search palette', async () => {
    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    expect(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...')).toBeNull();
    });
  });

  it('8. Loading state appears while search request is pending', async () => {
    let resolveFetch: (value: any) => void = () => {};
    const pendingPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => pendingPromise as any);

    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'PendingSearch' } });

    await waitFor(() => {
      expect(screen.getByText(/Searching .* database.../i)).toBeTruthy();
    });

    // Cleanup promise
    resolveFetch({ ok: true, text: async () => JSON.stringify ({ results: [] }) });
  });

  it('9. No-results state appears when backend returns an empty result list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify ({ results: [] }),
    } as Response);

    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'NonExistentXYZ99' } });

    await waitFor(() => {
      expect(screen.getByText(/No matching records found for/i)).toBeTruthy();
      expect(screen.getByText('NonExistentXYZ99')).toBeTruthy();
    });
  });

  it('10. Clearing the input clears displayed results and returns to idle state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify ({
        results: [
          {
            id: 'so-1',
            category: 'Sales Order',
            title: 'SO-2026-001',
            subtitle: 'Client Order',
            linkRoute: '/sales/orders?id=so-1',
          },
        ],
      }),
    } as Response);

    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'SO-2026' } });

    await waitFor(() => {
      expect(screen.getByText('SO-2026-001')).toBeTruthy();
    });

    // Clear input
    fireEvent.change(modalInput, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.queryByText('SO-2026-001')).toBeNull();
      expect(screen.getByText(/Search Organization Workspace/i)).toBeTruthy();
    });
  });

  it('11. Stale older response cannot overwrite a newer search result (controlled deferred promises)', async () => {
    let resolveFirst: (value: any) => void = () => {};
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    let resolveSecond: (value: any) => void = () => {};
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });

    vi.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => firstPromise as any)
      .mockImplementationOnce(() => secondPromise as any);

    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');

    // 1st search: "OldQuery"
    fireEvent.change(modalInput, { target: { value: 'OldQuery' } });
    await new Promise((r) => setTimeout(r, 350));

    // 2nd search: "NewQuery"
    fireEvent.change(modalInput, { target: { value: 'NewQuery' } });
    await new Promise((r) => setTimeout(r, 350));

    // Resolve 2nd (newer) request first
    resolveSecond({
      ok: true,
      text: async () => JSON.stringify ({
        results: [
          {
            id: 'new-1',
            category: 'Invoice',
            title: 'INV-NEW-RESULT',
            subtitle: 'New Client',
            linkRoute: '/sales/invoices?id=new-1',
          },
        ],
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('INV-NEW-RESULT')).toBeTruthy();
    });

    // Now resolve 1st (older) request with stale data
    resolveFirst({
      ok: true,
      text: async () => JSON.stringify ({
        results: [
          {
            id: 'old-1',
            category: 'Invoice',
            title: 'INV-OLD-STALE-RESULT',
            subtitle: 'Old Client',
            linkRoute: '/sales/invoices?id=old-1',
          },
        ],
      }),
    });

    // Wait and verify old stale result does NOT overwrite the new result
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByText('INV-NEW-RESULT')).toBeTruthy();
    expect(screen.queryByText('INV-OLD-STALE-RESULT')).toBeNull();
  });

  it('12. Cmd+K and Ctrl+K shortcuts open Global Search palette', () => {
    renderWithProvider(<GlobalSearchBar />);

    // Press Cmd+K
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...')).toBeTruthy();

    // Close palette
    fireEvent.keyDown(window, { key: 'Escape' });

    // Press Ctrl+K
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...')).toBeTruthy();
  });

  it('13. Backend failure displays "Search is temporarily unavailable." and does NOT expose BooksContext cached financial data', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network offline'));

    renderWithProvider(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);

    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'BrokenQuery' } });

    await waitFor(() => {
      expect(screen.getByText('Search is temporarily unavailable.')).toBeTruthy();
    });
  });

  it('shows an unavailable state when a successful response has no results array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ unexpected: true }),
    } as Response);

    renderWithProvider(<GlobalSearchBar />);
    fireEvent.click(screen.getByPlaceholderText('Search invoices, customers, bills, accounts... (⌘K)'));
    fireEvent.change(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...'), { target: { value: 'Malformed' } });

    expect(await screen.findByText('Search is temporarily unavailable.')).toBeTruthy();
    expect(screen.queryByText(/No matching records found/i)).toBeNull();
  });
  it('invalidates an in-flight response when the query becomes too short', async () => {
    let resolveSearch: (value: any) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }) as any);

    renderWithProvider(<GlobalSearchBar />);
    fireEvent.click(screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i));
    const input = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(input, { target: { value: 'OldQuery' } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    fireEvent.change(input, { target: { value: 'O' } });
    resolveSearch({ ok: true, text: async () => JSON.stringify({ results: [{ id: 'old-1', category: 'Invoice', title: 'Stale invoice', subtitle: 'Old tenant' }] }) });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(screen.queryByText('Stale invoice')).toBeNull();
    expect(screen.queryByRole('listbox', { name: 'Search results' })).toBeNull();
  });

  it('rejects malformed search rows before they reach React rendering', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ results: [
        { id: 'valid-1', category: 'Invoice', title: 'Valid result', subtitle: 'Ready' },
        { id: 'bad-1', category: 'Invoice', title: { text: 'not renderable' }, subtitle: 'Malformed' },
      ] }),
    } as Response);

    renderWithProvider(<GlobalSearchBar />);
    fireEvent.click(screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i));
    fireEvent.change(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...'), { target: { value: 'MalformedRow' } });

    expect(await screen.findByText('Search is temporarily unavailable.')).toBeTruthy();
    expect(screen.queryByText('Valid result')).toBeNull();
  });
  it('offers in-memory recent records on reopen and keeps them keyboard navigable without stale financial metadata', async () => {
    const onNavigate = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ results: [{
        id: 'inv-recent-1',
        category: 'Invoice',
        title: 'INV-RECENT-001',
        subtitle: 'Northwind · ₹50,000',
        status: 'Sent',
        amount: 50000,
        date: '2026-09-22',
        linkRoute: '/sales/invoices?id=inv-recent-1',
      }] }),
    } as Response);

    renderWithProvider(<GlobalSearchBar onNavigate={onNavigate} />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);
    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'INV-RECENT' } });
    fireEvent.click(await screen.findByText('INV-RECENT-001'));
    expect(onNavigate).toHaveBeenLastCalledWith('invoices', { entityId: 'inv-recent-1' });

    fireEvent.click(trigger);
    const recentOption = await screen.findByRole('option', { name: /INV-RECENT-001, Invoice, Open this recent record/i });
    expect(screen.getByRole('listbox', { name: 'Recent records' })).toBeTruthy();
    expect(recentOption.getAttribute('aria-selected')).toBe('true');
    expect(recentOption.textContent).not.toContain('50,000');
    expect(recentOption.textContent).not.toContain('Sent');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...'), { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenLastCalledWith('invoices', { entityId: 'inv-recent-1' });
  });
  it('routes only explicit supported categories with the active organization and keeps unknown results non-navigable', async () => {
    const onSearchResult = vi.fn();
    vi.spyOn(BooksContextModule, 'useBooks').mockImplementation(() => ({ currentOrg: { id: 'org-search-safe', name: 'Safe Org' } } as any));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ results: [
        { id: 'expense-1', category: 'Expense', title: 'Office supplies', subtitle: '₹25', linkRoute: 'https://evil.example' },
        { id: 'unknown-1', category: 'Unrecognized', title: 'Unknown record', subtitle: 'No route' },
        { id: 'proto-1', category: '__proto__', title: 'Prototype category', subtitle: 'No route' },
        { id: 'constructor-1', category: 'constructor', title: 'Constructor category', subtitle: 'No route' },
        { id: 'credit-1', category: 'Credit Note', title: 'Credit note', subtitle: 'Unsupported exact view' },
      ] })
    } as Response);

    renderWithProvider(<GlobalSearchBar onSearchResult={onSearchResult} />);
    fireEvent.click(screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i));
    fireEvent.change(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...'), { target: { value: 'Office' } });
    const expense = await screen.findByText('Office supplies');
    const searchRequest = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(new Headers(searchRequest[1]?.headers).get('x-organization-id')).toBe('org-search-safe');
    fireEvent.click(expense);
    expect(onSearchResult).toHaveBeenCalledWith({ tab: 'expenses', entityId: 'expense-1', organizationId: 'org-search-safe' });

    fireEvent.click(screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i));
    fireEvent.change(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...'), { target: { value: 'Unknown' } });
    const unknown = await screen.findByRole('option', { name: /Unknown record, Unrecognized, No route, No direct view/i });
    expect(unknown.getAttribute('aria-disabled')).toBe('true');
    expect((await screen.findByRole('option', { name: /Prototype category, __proto__, No route, No direct view/i })).getAttribute('aria-disabled')).toBe('true');
    expect((await screen.findByRole('option', { name: /Constructor category, constructor, No route, No direct view/i })).getAttribute('aria-disabled')).toBe('true');
    expect(onSearchResult).toHaveBeenCalledTimes(1);
  });

  it('does not show recent records after the active organization changes', async () => {
    let activeOrganization = { id: 'org-recent-a', name: 'Organization A' };
    vi.spyOn(BooksContextModule, 'useBooks').mockImplementation(() => ({ currentOrg: activeOrganization } as any));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ results: [{ id: 'vendor-org-a', category: 'Vendor', title: 'Private Vendor', subtitle: 'private@example.test' }] }),
    } as Response);

    const view = render(<GlobalSearchBar />);
    const trigger = screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i);
    fireEvent.click(trigger);
    fireEvent.change(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...'), { target: { value: 'Private' } });
    fireEvent.click(await screen.findByText('Private Vendor'));

    activeOrganization = { id: 'org-recent-b', name: 'Organization B' };
    view.rerender(<GlobalSearchBar />);
    fireEvent.click(trigger);

    expect(screen.queryByRole('listbox', { name: 'Recent records' })).toBeNull();
    expect(screen.queryByText('Private Vendor')).toBeNull();
  });
  it('discards an in-flight search when the active organization changes', async () => {
    let activeOrganization = { id: 'org-pending-a', name: 'Organization A' };
    vi.spyOn(BooksContextModule, 'useBooks').mockImplementation(() => ({ currentOrg: activeOrganization } as any));
    let resolveSearch: (value: any) => void = () => {};
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }) as any);

    const view = render(<GlobalSearchBar />);
    fireEvent.click(screen.getByPlaceholderText(/Search invoices, customers, bills, accounts... \(⌘K\)/i));
    const modalInput = screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...');
    fireEvent.change(modalInput, { target: { value: 'Private' } });
    await new Promise((resolve) => setTimeout(resolve, 350));

    activeOrganization = { id: 'org-pending-b', name: 'Organization B' };
    view.rerender(<GlobalSearchBar />);
    expect(screen.getByPlaceholderText('Search across all invoices, quotes, bills, customers, accounts...').getAttribute('value')).not.toBe('Private');
    resolveSearch({ ok: true, text: async () => JSON.stringify({ results: [{ id: 'old-private', category: 'Vendor', title: 'Old organization vendor', subtitle: 'private@example.test' }] }) });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(screen.queryByText('Old organization vendor')).toBeNull();
    expect(screen.queryByRole('listbox', { name: 'Search results' })).toBeNull();
  });
});
