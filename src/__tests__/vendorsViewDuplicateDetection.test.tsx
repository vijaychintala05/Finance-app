// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { apiClient } from '../api/client';
import { VendorsView } from '../components/purchases/VendorsView';

const { mockBooks } = vi.hoisted(() => ({
  mockBooks: {
    vendors: [] as any[],
    settings: { currencyCode: 'INR', currencySymbol: '₹' },
    accounts: [] as any[],
    addVendor: vi.fn(),
    updateVendor: vi.fn(),
    archiveVendor: vi.fn(),
    restoreVendor: vi.fn(),
  },
}));

vi.mock('../context/BooksContext', () => ({ useBooks: () => mockBooks }));

describe('Vendor duplicate detection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockBooks.vendors = [];
    mockBooks.addVendor.mockReset();
    mockBooks.updateVendor.mockReset();
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [], error: null, status: 200 } as any);
  });

  afterEach(() => cleanup());

  it('warns on an exact GSTIN match and still permits an intentional save', async () => {
    mockBooks.vendors = [{ id: 'vendor-existing', name: 'Harborline Supply', gstin: '27AABCS9912E1Z2', active: true }];
    mockBooks.addVendor.mockResolvedValue({ id: 'vendor-new', name: 'Harborline Reseller' });
    render(<VendorsView autoOpenCreateModal />);

    fireEvent.change(screen.getByLabelText(/display name \*/i), { target: { value: 'Harborline Reseller' } });
    fireEvent.change(screen.getByLabelText('GSTIN'), { target: { value: ' 27aabcs9912e1z2 ' } });

    expect(screen.getByRole('status').textContent).toContain('Harborline Supply');
    expect(screen.getByRole('status').textContent).toContain('same GSTIN');
    expect(screen.getByRole('status').textContent).toContain('You can still save');

    fireEvent.click(screen.getByRole('button', { name: 'Create vendor' }));
    await waitFor(() => expect(mockBooks.addVendor).toHaveBeenCalledOnce());
  });

  it('warns on an exact email match, treating it as a review hint rather than a block', () => {
    mockBooks.vendors = [{ id: 'vendor-existing', name: 'Harborline Supply', primaryContact: { email: 'ap@harborline.test' } }];
    render(<VendorsView autoOpenCreateModal />);
    fireEvent.change(screen.getByLabelText(/display name \*/i), { target: { value: 'Harborline Reseller' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' AP@HARBORLINE.TEST ' } });

    expect(screen.getByRole('status').textContent).toContain('same email');
    expect(screen.getByRole('button', { name: 'Create vendor' }).hasAttribute('disabled')).toBe(false);
  });

  it('warns on an exact PAN match after trimming and normalizing case', () => {
    mockBooks.vendors = [{ id: 'vendor-existing', name: 'Harborline Supply', pan: 'AABCS9912E' }];
    render(<VendorsView autoOpenCreateModal />);
    fireEvent.change(screen.getByLabelText(/display name \*/i), { target: { value: 'Harborline Reseller' } });
    fireEvent.change(screen.getByLabelText('PAN'), { target: { value: ' aabcs9912e ' } });

    expect(screen.getByRole('status').textContent).toContain('same PAN');
  });
  it('does not report the vendor being edited as its own duplicate', async () => {
    const existing = { id: 'vendor-edit', name: 'Harborline Supply', gstin: '27AABCS9912E1Z2', active: true };
    mockBooks.vendors = [existing];
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [existing], error: null, status: 200 } as any);
    render(<VendorsView />);
    await screen.findAllByText('Harborline Supply');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    expect(screen.getByLabelText('GSTIN')).toHaveProperty('value', '27AABCS9912E1Z2');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
