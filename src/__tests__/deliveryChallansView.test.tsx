// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryChallansView } from '../components/sales/DeliveryChallansView';
import { useBooks } from '../context/BooksContext';

vi.mock('../context/BooksContext', () => ({ useBooks: vi.fn() }));

describe('delivery challan list actions', () => {
  const addDeliveryChallan = vi.fn();
  const useBooksMock = vi.mocked(useBooks);
  const challan = {
    id: 'dc-1', challanNumber: 'DC-1001', clientName: 'Acme', dispatchDate: '2026-09-20',
    deliveryAddress: '1 Main Street', itemsSummary: '3 cartons', status: 'Draft' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    addDeliveryChallan.mockReset();
    useBooksMock.mockReturnValue({
      deliveryChallans: [challan],
      addDeliveryChallan,
      clients: [{ id: 'customer-1', name: 'Acme' }],
    } as any);
  });

  afterEach(() => cleanup());

  it('offers detail navigation and no unsupported Mark Delivered mutation', () => {
    render(<DeliveryChallansView />);
    expect(screen.queryByRole('button', { name: /mark delivered/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View details for DC-1001' }));
    expect(screen.getByText('Delivery status is updated through the audited sales-order fulfillment workflow.')).toBeDefined();
  });

  it('waits for the server receipt and creates a standalone challan as Draft', async () => {
    let resolveCreate!: (value: any) => void;
    addDeliveryChallan.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    render(<DeliveryChallansView />);

    fireEvent.click(screen.getByRole('button', { name: 'New Delivery Challan' }));
    fireEvent.change(screen.getByPlaceholderText('Street, City, State, ZIP'), { target: { value: '42 Market Road' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. 5x Workstations, 2x Monitors...'), { target: { value: '4 equipment crates' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Draft Challan' }));

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDefined();
    expect(screen.getByText('Create Delivery Challan')).toBeDefined();
    expect(addDeliveryChallan.mock.calls[0][0]).toMatchObject({
      clientName: 'Acme', deliveryAddress: '42 Market Road', itemsSummary: '4 equipment crates', status: 'Draft',
    });

    resolveCreate({ ...challan, challanNumber: 'DC-2026-0042', status: 'Draft' });
    await waitFor(() => expect(screen.queryByText('Create Delivery Challan')).toBeNull());
    expect(await screen.findByText('Delivery challan DC-2026-0042 was created as Draft.')).toBeDefined();
  });
});