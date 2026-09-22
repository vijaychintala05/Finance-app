// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VendorsView } from '../components/purchases/VendorsView';
import { apiClient } from '../api/client';

const { mockBooks } = vi.hoisted(() => ({
  mockBooks: {
    vendors: [] as any[],
    settings: { currencySymbol: '₹', currencyCode: 'INR' },
    accounts: [] as any[],
    addVendor: vi.fn(),
    updateVendor: vi.fn(),
    archiveVendor: vi.fn(),
    restoreVendor: vi.fn(),
  },
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => mockBooks,
}));

describe('VendorsView phone input verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockBooks.addVendor.mockReset();
    mockBooks.updateVendor.mockReset();
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [],
      error: null,
      status: 200,
    } as any);
  });

  afterEach(() => cleanup());

  it('allows full 10-digit phone and mobile numbers without 5-character cutoff', async () => {
    mockBooks.addVendor.mockResolvedValue({ id: 'ven-new-1', name: 'Acme Logistics' });

    render(<VendorsView autoOpenCreateModal={true} />);

    expect(await screen.findByRole('heading', { name: 'New vendor' })).toBeDefined();

    const nameInput = screen.getByLabelText(/display name \*/i);
    fireEvent.change(nameInput, { target: { value: 'Acme Logistics' } });

    // Find Work phone and Mobile inputs
    const workPhoneInput = screen.getByLabelText('Work phone') as HTMLInputElement;
    const mobileInput = screen.getByLabelText('Mobile number') as HTMLInputElement;

    expect(workPhoneInput).toBeDefined();
    expect(mobileInput).toBeDefined();

    // Verify typing full 10 digits
    fireEvent.change(workPhoneInput, { target: { value: '9876543210' } });
    expect(workPhoneInput.value).toBe('9876543210');
    expect(workPhoneInput.value.length).toBe(10);

    // Verify typing international mobile number
    fireEvent.change(mobileInput, { target: { value: '+91 9123456789' } });
    expect(mobileInput.value).toBe('+91 9123456789');

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'Create vendor' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockBooks.addVendor).toHaveBeenCalledTimes(1);
    });

    const callArg = mockBooks.addVendor.mock.calls[0][0];
    expect(callArg.phone).toBe('9876543210');
    expect(callArg.mobile).toBe('+91 9123456789');
    expect(callArg.primaryContact.phone).toBe('9876543210');
    expect(callArg.primaryContact.mobileCode).toBe('+91');
    expect(callArg.primaryContact.mobile).toBe('9123456789');
  });

  it('loads and preserves phone numbers when editing a vendor', async () => {
    const existingVendor = {
      id: 'ven-edit-1',
      name: 'Pioneer Tools',
      companyName: 'Pioneer Tools Ltd',
      phone: '+91 9988776655',
      mobile: '+91 8877665544',
      active: true,
      primaryContact: {
        phoneCode: '+91',
        phone: '9988776655',
        mobileCode: '+91',
        mobile: '8877665544',
      },
    };

    vi.spyOn(apiClient, 'get').mockResolvedValue({
      data: [existingVendor],
      error: null,
      status: 200,
    } as any);

    mockBooks.updateVendor.mockResolvedValue({ ...existingVendor, phone: '+91 9988776600' });

    render(<VendorsView />);

    expect(await screen.findAllByText('Pioneer Tools')).not.toHaveLength(0);

    // Click Edit button (first occurrence)
    const editBtns = screen.getAllByRole('button', { name: 'Edit' });
    fireEvent.click(editBtns[0]);

    expect(await screen.findByRole('heading', { name: 'Edit vendor' })).toBeDefined();

    const workPhoneInput = screen.getByLabelText('Work phone') as HTMLInputElement;
    expect(workPhoneInput.value).toBe('+91 9988776655');

    // Change phone number
    fireEvent.change(workPhoneInput, { target: { value: '+91 9988776600' } });
    expect(workPhoneInput.value).toBe('+91 9988776600');

    // Submit
    const saveBtn = screen.getByRole('button', { name: 'Save changes' });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockBooks.updateVendor).toHaveBeenCalledWith('ven-edit-1', expect.objectContaining({
        phone: '+91 9988776600',
        primaryContact: expect.objectContaining({
          phoneCode: '+91',
          phone: '9988776600',
        }),
      }));
    });
  });
});
