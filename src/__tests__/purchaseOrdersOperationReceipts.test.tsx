// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PurchaseOrdersView } from '../components/purchases/PurchaseOrdersView';
import * as BooksContext from '../context/BooksContext';
import type { Bill, PurchaseOrder, Vendor } from '../types';

describe('Purchase order operation receipts', () => {
  const vendor: Vendor = {
    id: 'vendor-1',
    name: 'Acme Supplies',
    companyName: 'Acme Supplies',
    status: 'Active',
    payablesBalance: 0,
  };

  const purchaseOrder: PurchaseOrder = {
    id: 'po-1',
    poNumber: 'PO-2026-001',
    vendorId: vendor.id,
    vendorName: vendor.name,
    orderDate: '2026-09-20',
    expectedDate: '2026-10-04',
    totalAmount: 7500,
    status: 'Issued',
    notes: 'Office supplies',
  };

  const bill: Bill = {
    id: 'bill-1',
    billNumber: 'BILL-2026-001',
    vendorId: vendor.id,
    vendorName: vendor.name,
    purchaseOrderId: purchaseOrder.id,
    billDate: '2026-09-22',
    dueDate: '2026-10-22',
    totalAmount: 7500,
    amountPaid: 0,
    balanceDue: 7500,
    status: 'Unpaid',
  };

  let addPurchaseOrder: ReturnType<typeof vi.fn>;
  let deletePurchaseOrder: ReturnType<typeof vi.fn>;
  let convertPurchaseOrderToBill: ReturnType<typeof vi.fn>;
  let receivePurchaseOrder: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    addPurchaseOrder = vi.fn().mockResolvedValue({ data: purchaseOrder, requestId: 'req-po-create', refreshFailed: false });
    deletePurchaseOrder = vi.fn().mockResolvedValue({ data: { ...purchaseOrder, status: 'Cancelled' }, requestId: 'req-po-cancel', refreshFailed: true });
    convertPurchaseOrderToBill = vi.fn().mockResolvedValue({ data: bill, requestId: 'req-po-convert', refreshFailed: false });
    receivePurchaseOrder = vi.fn().mockResolvedValue({ data: { id: 'receipt-1' }, requestId: 'req-po-receive', refreshFailed: false });

    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      purchaseOrders: [purchaseOrder],
      vendors: [vendor],
      settings: { currencySymbol: '₹', currencyCode: 'INR' },
      addPurchaseOrder,
      updatePurchaseOrder: vi.fn(),
      deletePurchaseOrder,
      convertPurchaseOrderToBill,
      receivePurchaseOrder,
    } as any);
  });

  afterEach(() => cleanup());

  it('issues a purchase order with the selected vendor ID and shows a request-aware receipt', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<PurchaseOrdersView />);

    fireEvent.click(screen.getByRole('button', { name: 'New Purchase Order' }));
    fireEvent.change(screen.getByLabelText('Order Amount (₹)'), { target: { value: '8200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue Purchase Order' }));

    await waitFor(() => expect(addPurchaseOrder).toHaveBeenCalledWith(expect.objectContaining({
      vendorId: 'vendor-1',
      vendorName: 'Acme Supplies',
      totalAmount: 8200,
    })));
    expect(await screen.findByText('Purchase order issued')).toBeTruthy();
    expect(screen.getByText('req-po-create')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('converts a purchase order from the list and keeps the generated bill evidence visible', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<PurchaseOrdersView />);

    fireEvent.click(screen.getByRole('button', { name: 'Convert to Bill' }));

    await waitFor(() => expect(convertPurchaseOrderToBill).toHaveBeenCalledWith('po-1'));
    expect(await screen.findByText('Bill created from purchase order')).toBeTruthy();
    expect(screen.getByText(/BILL-2026-001 was created from PO-2026-001/)).toBeTruthy();
    expect(screen.getByText('req-po-convert')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('records goods receipt without a blocking alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<PurchaseOrdersView />);

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark Received' }));

    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledWith('po-1'));
    expect(await screen.findByText('Goods receipt recorded')).toBeTruthy();
    expect(screen.getByText('req-po-receive')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('requires a cancellation reason and treats refresh failure as a committed cancellation', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    render(<PurchaseOrdersView />);

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel PO' }));
    expect(screen.getByRole('dialog', { name: 'Cancel purchase order PO-2026-001?' })).toBeTruthy();
    expect(deletePurchaseOrder).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reason for cancellation'), { target: { value: 'Supplier cannot fulfil the order' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel purchase order' }));

    await waitFor(() => expect(deletePurchaseOrder).toHaveBeenCalledWith('po-1', 'Supplier cannot fulfil the order'));
    expect(await screen.findByText('Purchase order cancelled; refreshed state unavailable')).toBeTruthy();
    expect(screen.getByText(/Use Verify status here before taking any further action/i)).toBeTruthy();
    expect(screen.getByText('req-po-cancel')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
