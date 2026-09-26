// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesOrderDetailsModal } from '../components/sales/SalesOrderDetailsModal';
import { useBooks } from '../context/BooksContext';
import { ApiRequestError } from '../api/client';

vi.mock('../context/BooksContext', () => ({ useBooks: vi.fn() }));

describe('sales-order cancellation receipt', () => {
  const deleteSalesOrder = vi.fn();
  const useBooksMock = vi.mocked(useBooks);
  const order = {
    id: 'so-1', orderNumber: 'SO-2026-01', clientName: 'Acme', totalAmount: 1200,
    orderDate: '2026-09-01', expectedDeliveryDate: '2026-09-20', notes: '', status: 'Confirmed' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    deleteSalesOrder.mockReset();
    useBooksMock.mockReturnValue({
      settings: { currencySymbol: 'USD' }, currentOrg: { id: 'org-1', name: 'Primary Org' }, switchOrganization: vi.fn(),
      updateSalesOrder: vi.fn(), deleteSalesOrder, convertSalesOrderToInvoice: vi.fn(),
    } as any);
  });
  afterEach(() => cleanup());

  const openCancelDialog = () => {
    render(<SalesOrderDetailsModal isOpen onClose={vi.fn()} order={order} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sales order actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Order' }));
  };

  it('does not allow a manual Shipped status without delivery evidence', () => {
    render(<SalesOrderDetailsModal isOpen onClose={vi.fn()} order={order} />);
    expect((screen.getByRole('button', { name: 'Shipped' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/creating a delivery challan; this status cannot be set manually/i)).toBeDefined();
  });

  it('routes the fulfillment Cancelled status action through the audited reason dialog', async () => {
    render(<SalesOrderDetailsModal isOpen onClose={vi.fn()} order={order} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));
    expect(screen.getByRole('dialog', { name: /Cancel sales order SO-2026-01/ })).toBeDefined();
    expect(screen.getByLabelText('Reason for cancellation')).toBeDefined();
    expect(deleteSalesOrder).not.toHaveBeenCalled();
  });

  it('requires an audited reason and retries the identical request after an uncertain result', async () => {
    deleteSalesOrder.mockRejectedValueOnce(new ApiRequestError({
      data: null, error: 'Connection timed out', status: 500, errorCode: 'NETWORK_FAILURE', requestId: 'req-cancel-uncertain',
    }, 'Sales order could not be cancelled'));
    openCancelDialog();
    const cancelButton = screen.getByRole('button', { name: 'Cancel sales order' }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason for cancellation'), { target: { value: 'Customer withdrew the order' } });
    fireEvent.click(cancelButton);
    expect(await screen.findByText('Cancellation outcome could not be confirmed')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry same cancellation' })).toBeDefined();
    const original = deleteSalesOrder.mock.calls[0];
    expect(original).toEqual(['so-1', 'Customer withdrew the order', 'org-1']);

    deleteSalesOrder.mockResolvedValueOnce({ data: { ...order, status: 'Cancelled' }, requestId: 'req-cancel-ok', refreshFailed: false });
    fireEvent.click(screen.getByRole('button', { name: 'Retry same cancellation' }));
    await waitFor(() => expect(deleteSalesOrder).toHaveBeenCalledTimes(2));
    expect(deleteSalesOrder.mock.calls[1]).toEqual(original);
    expect(await screen.findByText('Sales order cancelled')).toBeDefined();
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'In Production' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Mark Invoiced' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Cancelled' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Sales order actions' }));
    expect((screen.getByRole('button', { name: 'Cancel Order' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Retry same cancellation' })).toBeNull();
  });

  it('blocks uncertain retry if the active organization changed', async () => {
    deleteSalesOrder.mockRejectedValueOnce(new ApiRequestError({ data: null, error: 'Connection timed out', status: 500, errorCode: 'NETWORK_FAILURE' }, 'failed'));
    const { rerender } = render(<SalesOrderDetailsModal isOpen onClose={vi.fn()} order={order} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sales order actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Order' }));
    fireEvent.change(screen.getByLabelText('Reason for cancellation'), { target: { value: 'Customer withdrew the order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sales order' }));
    expect(await screen.findByText('Cancellation outcome could not be confirmed')).toBeDefined();

    useBooksMock.mockReturnValue({ settings: { currencySymbol: 'USD' }, currentOrg: { id: 'org-2', name: 'Other Org' }, switchOrganization: vi.fn(), updateSalesOrder: vi.fn(), deleteSalesOrder, convertSalesOrderToInvoice: vi.fn() } as any);
    rerender(<SalesOrderDetailsModal isOpen onClose={vi.fn()} order={order} />);
    const retry = screen.getByRole('button', { name: 'Retry same cancellation' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(screen.getAllByRole('status').some((node) => node.textContent?.includes('Switch back to Primary Org'))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Switch back to Primary Org' }));
    expect(useBooksMock.mock.results.at(-1)?.value.switchOrganization).toHaveBeenCalledWith('org-1');
    fireEvent.click(retry);
    expect(deleteSalesOrder).toHaveBeenCalledTimes(1);
  });

  it('reports a committed cancellation with a failed refresh without offering another retry', async () => {
    deleteSalesOrder.mockResolvedValueOnce({ data: { ...order, status: 'Cancelled' }, requestId: 'req-cancel-committed', refreshFailed: true });
    openCancelDialog();
    fireEvent.change(screen.getByLabelText('Reason for cancellation'), { target: { value: 'Duplicate order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sales order' }));
    expect(await screen.findByText(/Sales order cancellation committed; refreshed state unavailable/)).toBeDefined();
    expect(screen.getByText(/Do not submit the cancellation again/)).toBeDefined();
    expect((screen.getByRole('button', { name: 'In Production' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Mark Invoiced' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Retry same cancellation' })).toBeNull();
  });
});
