// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MasterItemsView } from '../components/items/MasterItemsView';
import { apiClient } from '../api/client';

vi.mock('../context/BooksContext', () => ({ useBooks: () => ({ currentOrg: { id: 'org-items-test' } }) }));

const item = { id: 'item-1', name: 'Consulting', unit: 'Hour', salesRate: 120, purchaseRate: 0, gstRate: 18, isActive: true };

describe('MasterItemsView permissions and catalog states', () => {
  beforeEach(() => vi.spyOn(apiClient, 'get').mockResolvedValue({ data: { items: [item] }, error: null, status: 200 } as any));
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders a read-only catalog without create, edit, or archive actions', async () => {
    render(<MasterItemsView permissions={{ itemsView: true, itemsCreate: false, itemsEdit: false, itemsArchive: false }} />);
    expect(await screen.findByText('Consulting')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add New Item / Service' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Consulting' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive Consulting' })).toBeNull();
    expect(apiClient.get).toHaveBeenCalledWith('/items?search=', 'org-items-test');
  });

  it('locks an item after an uncertain archive and retries the unchanged request', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { items: [item] }, error: null, status: 200 } as any).mockResolvedValueOnce({ data: { items: [] }, error: null, status: 200 } as any);
    const archive = vi.spyOn(apiClient, 'delete')
      .mockResolvedValueOnce({ data: null, error: 'Network communication failure', status: 500, errorCode: 'NETWORK_FAILURE', retryable: true } as any)
      .mockResolvedValueOnce({ data: { archived: true }, error: null, status: 200 } as any);
    render(<MasterItemsView permissions={{ itemsView: true, itemsCreate: false, itemsEdit: true, itemsArchive: true }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Consulting' }));
    expect(screen.getByRole('dialog', { name: 'Archive Consulting?' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Archive item' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Retry the archive unchanged');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Retry archive Consulting' })));
    expect((screen.getByRole('button', { name: 'Edit Consulting' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByPlaceholderText('Search by name, SKU or HSN/SAC...') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry archive Consulting' }));
    await waitFor(() => expect(archive).toHaveBeenCalledTimes(2));
    expect(archive).toHaveBeenNthCalledWith(1, '/items/item-1', 'org-items-test');
    expect(archive).toHaveBeenNthCalledWith(2, '/items/item-1', 'org-items-test');
    await waitFor(() => expect(screen.queryByText('Consulting')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Items & Services' }));
  });
  it('cancels archive from the accessible confirmation without sending a mutation', async () => {
    const archive = vi.spyOn(apiClient, 'delete');
    render(<MasterItemsView permissions={{ itemsView: true, itemsCreate: false, itemsEdit: false, itemsArchive: true }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Archive Consulting' }));
    const dialog = screen.getByRole('dialog', { name: 'Archive Consulting?' });
    const keepItem = screen.getByRole('button', { name: 'Keep item' });
    const archiveItem = screen.getByRole('button', { name: 'Archive item' });
    expect(document.activeElement).toBe(keepItem);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(archiveItem);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(keepItem);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Archive Consulting?' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Archive Consulting' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive Consulting' }));
    expect(screen.getByRole('dialog', { name: 'Archive Consulting?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep item' }));
    expect(screen.queryByRole('dialog', { name: 'Archive Consulting?' })).toBeNull();
    expect(archive).not.toHaveBeenCalled();
  });
  it('freezes an item create after an uncertain response and retries the unchanged draft', async () => {
    const create = vi.spyOn(apiClient, 'post')
      .mockResolvedValueOnce({ data: null, error: 'Network communication failure', status: 500, errorCode: 'NETWORK_FAILURE', retryable: true } as any)
      .mockResolvedValueOnce({ data: { item: { ...item, name: 'New Consulting' } }, error: null, status: 201 } as any);
    render(<MasterItemsView permissions={{ itemsView: true, itemsCreate: true, itemsEdit: false, itemsArchive: false }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add New Item / Service' }));
    const name = screen.getByRole('textbox', { name: /Item \/ Service Name/ });
    fireEvent.change(name, { target: { value: 'New Consulting' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Retry without changing the form');
    expect((screen.getByRole('textbox', { name: /Item \/ Service Name/ }) as HTMLInputElement).matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry unchanged save' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    expect(create.mock.calls[0][0]).toBe('/items');
    expect(create.mock.calls[0][2]).toBe('org-items-test');
  });
  it('distinguishes a failed catalog read from an empty catalog', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: null, error: 'Permission check failed', status: 403 } as any);
    render(<MasterItemsView permissions={{ itemsView: true, itemsCreate: false, itemsEdit: false, itemsArchive: false }} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Permission check failed');
    expect(screen.queryByText('No items found.')).toBeNull();
  });
});
