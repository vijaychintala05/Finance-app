// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { VendorWorkspace } from '../components/purchases/VendorWorkspace';

const { mockBooks, mockApiGet, mockApiDelete } = vi.hoisted(() => ({
  mockBooks: {
    bills: [],
    purchaseOrders: [{
      id: 'po-42',
      poNumber: 'PO-42',
      vendorId: 'vend-101',
      vendorName: 'Century Ply & Boards Ltd',
      orderDate: '2026-09-22',
      expectedDate: '2026-10-22',
      totalAmount: 12500,
      status: 'Open',
      notes: '',
    }],
    paymentsMade: [],
    expenses: [],
    journalEntries: [],
    settings: { currencySymbol: '₹', currencyCode: 'INR' },
    accounts: [],
    archiveVendor: vi.fn(),
    restoreVendor: vi.fn(),
  },
  mockApiGet: vi.fn().mockResolvedValue({ data: [], error: null, status: 200 }),
  mockApiDelete: vi.fn().mockResolvedValue({ data: { id: 'doc-1', archived: true }, error: null, status: 200, requestId: 'req-doc-archive' }),
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => mockBooks,
}));

vi.mock('../api/client', () => ({
  apiClient: {
    get: mockApiGet,
    delete: mockApiDelete,
    getBlob: vi.fn(),
  },
}));

beforeEach(() => {
  mockBooks.archiveVendor.mockReset().mockResolvedValue(undefined);
  mockApiGet.mockReset().mockResolvedValue({ data: [], error: null, status: 200 });
  mockApiDelete.mockReset().mockResolvedValue({ data: { id: 'doc-1', archived: true }, error: null, status: 200, requestId: 'req-doc-archive' });
});

afterEach(() => cleanup());

describe('VendorWorkspace purchase-order navigation', () => {
  const vendor = {
    id: 'vend-101',
    name: 'Century Ply & Boards Ltd',
    companyName: 'Century Ply & Boards Ltd',
    email: 'billing@centuryply.com',
    payablesBalance: 12500,
    status: 'Active' as const,
  };

  it('opens the selected purchase order through its owning workflow', () => {
    const onNavigateToPurchaseOrder = vi.fn();
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(
      <VendorWorkspace
        vendor={vendor}
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onNavigateToPurchaseOrder={onNavigateToPurchaseOrder}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^transactions$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^purchase orders/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open purchase order PO-42' }));

    expect(onNavigateToPurchaseOrder).toHaveBeenCalledWith('po-42');
    expect(alert).not.toHaveBeenCalled();
  });

  it('loads vendor documents and archives one with an accessible confirmation and receipt', async () => {
    mockApiGet.mockImplementation((path: string) => Promise.resolve({
      data: path.endsWith('/attachments') ? [{ id: 'doc-1', fileName: 'supplier-contract.pdf', mimeType: 'application/pdf', byteSize: 2048, createdAt: '2026-09-22' }] : [],
      error: null,
      status: 200,
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<VendorWorkspace vendor={vendor} onBack={vi.fn()} onEdit={vi.fn()} />);

    const removeButton = await screen.findByRole('button', { name: 'Remove supplier-contract.pdf' });
    fireEvent.click(removeButton);
    expect(screen.getByRole('alertdialog', { name: 'Remove vendor document?' })).toBeTruthy();
    expect(mockApiDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep document' }));
    expect(mockApiDelete).not.toHaveBeenCalled();

    fireEvent.click(removeButton);
    fireEvent.click(screen.getByRole('button', { name: 'Remove document' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/supplier-contract\.pdf was removed.*req-doc-archive/i);
    expect(mockApiDelete).toHaveBeenCalledWith('/finance/vendors/vend-101/attachments/doc-1');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Remove supplier-contract.pdf' })).toBeNull();
  });

  it('shows vendor archive failures inline without a browser alert', async () => {
    mockBooks.archiveVendor.mockRejectedValueOnce(new Error('Vendor archive was rejected'));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<VendorWorkspace vendor={vendor} onBack={vi.fn()} onEdit={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Archive vendor'));

    expect((await screen.findByRole('alert')).textContent).toContain('Vendor archive was rejected');
    expect(alert).not.toHaveBeenCalled();
  });
});
