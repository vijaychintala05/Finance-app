// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '../api/client';
import * as BooksContext from '../context/BooksContext';
import { ClientModal } from '../components/clients/ClientModal';
import { ClientsView } from '../components/clients/ClientsView';
import type { Client } from '../types';

const customer: Client = {
  id: 'customer-1',
  name: 'Asha Rao',
  companyName: 'Asha Trading',
  email: 'asha@example.com',
  phone: '',
  billingAddress: '',
  taxId: '',
  currency: 'INR',
  paymentTerms: 'Net 30',
  notes: '',
  createdAt: '2026-09-20T00:00:00Z',
};

describe('Customer master-data actions', () => {
  let addClient: ReturnType<typeof vi.fn>;
  let updateClient: ReturnType<typeof vi.fn>;
  let archiveClient: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    addClient = vi.fn().mockResolvedValue({ data: customer, requestId: 'req-create-1', refreshFailed: false });
    updateClient = vi.fn().mockResolvedValue({ data: customer, requestId: 'req-edit-1', refreshFailed: false });
    archiveClient = vi.fn().mockResolvedValue({ data: { id: customer.id, active: false, changed: true }, requestId: 'req-archive-1', refreshFailed: false });
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      clients: [customer],
      invoices: [],
      projects: [],
      settings: { currencyCode: 'INR', currencySymbol: '₹' },
      addClient,
      updateClient,
      archiveClient,
    } as any);
  });

  afterEach(() => cleanup());

  it('awaits customer edit and displays the committed request receipt', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    render(<ClientModal isOpen onClose={vi.fn()} clientToEdit={customer} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. John Smith'), { target: { value: 'Asha R.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Client' }));

    await waitFor(() => expect(updateClient).toHaveBeenCalledWith(customer.id, expect.objectContaining({ name: 'Asha R.' })));
    expect(await screen.findByText('Customer updated')).toBeTruthy();
    expect(screen.getByText('req-edit-1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Client' }).hasAttribute('disabled')).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('does not invite a second submit when the edit committed but refresh failed', async () => {
    updateClient.mockResolvedValueOnce({ data: customer, requestId: 'req-edit-stale', refreshFailed: true });
    render(<ClientModal isOpen onClose={vi.fn()} clientToEdit={customer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Client' }));

    expect(await screen.findByText('Customer updated; list refresh failed')).toBeTruthy();
    expect(screen.getByText('req-edit-stale')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Client' }).hasAttribute('disabled')).toBe(true);
  });

  it('warns on a case-insensitive exact email match while allowing the customer to be saved', async () => {
    render(<ClientModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('e.g. John Smith'), { target: { value: 'New contact' } });
    fireEvent.change(screen.getByPlaceholderText('billing@company.com'), { target: { value: ' ASHA@EXAMPLE.COM ' } });

    expect(screen.getByRole('status').textContent).toContain('Asha Trading');
    expect(screen.getByRole('status').textContent).toContain('You can still save');
    fireEvent.click(screen.getByRole('button', { name: 'Save Client' }));
    await waitFor(() => expect(addClient).toHaveBeenCalledWith(expect.objectContaining({ email: 'ASHA@EXAMPLE.COM' })));
  });

  it('does not flag the customer being edited as its own duplicate', () => {
    render(<ClientModal isOpen onClose={vi.fn()} clientToEdit={customer} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('retains the archive dialog and displays a server failure without claiming success', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('Browser confirm should not be called'); });
    archiveClient.mockRejectedValueOnce(new ApiRequestError({ data: null, error: 'Customer has active work', status: 409, requestId: 'req-blocked-1', errorCode: 'CUSTOMER_ACTIVE_WORK' }, 'Archive failed'));
    render(<ClientsView />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Archive Asha Rao' })[0]);
    expect(screen.getByRole('dialog', { name: 'Archive customer?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Archive customer' }));

    await waitFor(() => expect(archiveClient).toHaveBeenCalledWith(customer.id));
    expect(await screen.findByText('Customer archive was not completed')).toBeTruthy();
    expect(screen.getByText('req-blocked-1')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Archive customer?' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('shows a persistent archive receipt after server commitment', async () => {
    render(<ClientsView />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Archive Asha Rao' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive customer' }));

    expect(await screen.findByText('Customer archived')).toBeTruthy();
    expect(screen.getByText('req-archive-1')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Archive customer?' })).toBeNull();
  });
});
