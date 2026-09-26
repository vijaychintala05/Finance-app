// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DeliveryChallanDetailsModal } from '../components/sales/DeliveryChallanDetailsModal';

const challan = {
  id: 'dc-1', challanNumber: 'DC-2026-001', clientName: 'Example Customer', dispatchDate: '2026-09-20',
  deliveryAddress: '12 Example Street', itemsSummary: '2 service units', status: 'In Transit' as const,
};

describe('Delivery challan details actions', () => {
  it('shows only supported actions and explains audited status ownership', () => {
    render(<DeliveryChallanDetailsModal isOpen onClose={vi.fn()} challan={challan} />);

    expect(screen.getByRole('status').textContent).toContain('audited sales-order fulfillment workflow');
    expect(screen.queryByText('Delete Challan')).toBeNull();
    expect(screen.queryByText('Mark Goods as Delivered')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More challan actions' }));
    expect(screen.getByText('Print Challan Slip')).toBeTruthy();
    expect(screen.queryByText('Delete Challan')).toBeNull();
  });
});
