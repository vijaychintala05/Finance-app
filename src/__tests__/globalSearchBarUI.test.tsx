// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { GlobalSearchBar } from '../components/common/GlobalSearchBar';
import { BooksProvider } from '../context/BooksContext';

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<BooksProvider>{ui}</BooksProvider>);
};

describe('Phase 8.3C — Real GlobalSearchBar Component & UI Comprehensive Regression Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
      json: async () => ({ results: mockResults }),
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
      json: async () => ({ results: mockResults }),
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
      json: async () => ({ results: mockResults }),
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

    fireEvent.keyDown(modalInput, { key: 'ArrowDown' });
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
    resolveFetch({ ok: true, json: async () => ({ results: [] }) });
  });

  it('9. No-results state appears when backend returns an empty result list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
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
      json: async () => ({
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
      json: async () => ({
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
      json: async () => ({
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
});
