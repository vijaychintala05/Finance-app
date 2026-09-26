// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesOrdersView } from '../components/sales/SalesOrdersView';
import { useBooks } from '../context/BooksContext';
import { ApiRequestError } from '../api/client';

vi.mock('../context/BooksContext', () => ({ useBooks: vi.fn() }));

describe('sales-order create operation receipt', () => {
  const addSalesOrder = vi.fn();
  const useBooksMock = vi.mocked(useBooks);

  beforeEach(() => {
    vi.clearAllMocks();
    addSalesOrder.mockReset();
    useBooksMock.mockReturnValue({
      salesOrders: [],
      addSalesOrder,
      convertSalesOrderToInvoice: vi.fn(),
      clients: [{ id: 'client-1', name: 'Acme' }],
      settings: { currencySymbol: 'USD' },
      currentOrg: { id: 'org-1', name: 'Primary Org' },
    } as any);
  });

  afterEach(() => cleanup());

  const openCreateForm = () => {
    render(<SalesOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /New Sales Order/i }));
    return screen.getByRole('button', { name: /Save Sales Order/i });
  };

  it('retains the exact order request and retries it after an uncertain result', async () => {
    addSalesOrder.mockRejectedValueOnce(new ApiRequestError({
      data: null, error: 'Connection timed out', status: 500, errorCode: 'NETWORK_FAILURE',
      requestId: 'req-sales-order-uncertain', recovery: 'Verify before creating another order.',
    }, 'Sales order could not be created'));

    const saveButton = openCreateForm();
    fireEvent.click(saveButton);
    expect(await screen.findByText('Sales order outcome could not be confirmed')).toBeDefined();
    expect(screen.getByText(/req-sales-order-uncertain/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Retry same sales order/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /New Sales Order/i })).toHaveProperty('disabled', true);
    const originalPayload = addSalesOrder.mock.calls[0][0];
    expect(screen.getByRole('spinbutton')).toHaveProperty('disabled', true);

    addSalesOrder.mockResolvedValueOnce({
      data: { id: 'so-1', orderNumber: 'SO-2026-01', clientName: 'Acme', totalAmount: 12000 },
      requestId: 'req-sales-order-confirmed', refreshFailed: false,
    });
    fireEvent.click(screen.getByRole('button', { name: /Retry same sales order/i }));
    await waitFor(() => expect(addSalesOrder).toHaveBeenCalledTimes(2));
    expect(addSalesOrder.mock.calls[1][0]).toEqual(originalPayload);
    expect(addSalesOrder.mock.calls[0][1]).toBe('org-1');
    expect(addSalesOrder.mock.calls[1][1]).toBe('org-1');
    expect(await screen.findByText('Sales order created')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Save Sales Order/i })).toBeNull();
  });

  it('does not retry an uncertain create under a different organization', async () => {
    addSalesOrder.mockRejectedValueOnce(new ApiRequestError({
      data: null, error: 'Connection timed out', status: 500, errorCode: 'NETWORK_FAILURE', requestId: 'req-org-switch',
    }, 'Sales order could not be created'));

    const { rerender } = render(<SalesOrdersView />);
    fireEvent.click(screen.getByRole('button', { name: /New Sales Order/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save Sales Order/i }));
    expect(await screen.findByText('Sales order outcome could not be confirmed')).toBeDefined();

    useBooksMock.mockReturnValue({
      salesOrders: [], addSalesOrder, convertSalesOrderToInvoice: vi.fn(),
      clients: [{ id: 'client-1', name: 'Acme' }], settings: { currencySymbol: 'USD' },
      currentOrg: { id: 'org-2', name: 'Other Org' },
    } as any);
    rerender(<SalesOrdersView />);

    const retryButton = screen.getByRole('button', { name: /Retry same sales order/i });
    expect((retryButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/belongs to Primary Org.*Switch back to that organization/i)).toBeDefined();
    fireEvent.click(retryButton);
    expect(addSalesOrder).toHaveBeenCalledTimes(1);
  });

  it('reports a committed order when only the authoritative refresh failed', async () => {
    addSalesOrder.mockResolvedValueOnce({
      data: { id: 'so-2', orderNumber: 'SO-2026-02', clientName: 'Acme', totalAmount: 12000 },
      requestId: 'req-sales-order-committed', refreshFailed: true,
    });

    const saveButton = openCreateForm();
    fireEvent.click(saveButton);
    expect(await screen.findByText(/Sales order SO-2026-02 was created; refreshed list unavailable/i)).toBeDefined();
    expect(screen.getByText(/Do not create it again/i)).toBeDefined();
    expect(screen.queryByRole('button', { name: /Retry same sales order/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save Sales Order/i })).toBeNull();
  });
});
