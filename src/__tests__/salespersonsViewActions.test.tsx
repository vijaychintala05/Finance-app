// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as BooksContext from '../context/BooksContext';
import { SalespersonsView } from '../components/salespersons/SalespersonsView';

const salesperson = {
  id: 'sp-1', name: 'Morgan Chen', code: 'MOR-1', email: 'morgan@example.com', phone: '555-0100',
  commissionRate: 3.5, region: 'West', notes: '', status: 'Active' as const, createdAt: '2026-09-01',
};

describe('Salesperson deactivation confirmation', () => {
  let deleteSalesperson: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    deleteSalesperson = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      salespersons: [salesperson], addSalesperson: vi.fn(), updateSalesperson: vi.fn(), deleteSalesperson, restoreSalesperson: vi.fn(),
    } as any);
  });

  afterEach(() => cleanup());

  it('uses an accessible confirmation and retains it with an API error', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => { throw new Error('Browser confirm should not be called'); });
    deleteSalesperson.mockRejectedValueOnce(new Error('Reassign active customers first'));
    render(<SalespersonsView />);

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate Morgan Chen' }));
    expect(screen.getByRole('alertdialog', { name: 'Deactivate salesperson?' })).toBeTruthy();
    expect(screen.getByRole('alertdialog', { name: 'Deactivate salesperson?' }).textContent).toContain('Morgan Chen');
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate salesperson' }));

    await waitFor(() => expect(deleteSalesperson).toHaveBeenCalledWith(salesperson.id));
    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate salesperson?' });
    expect(dialog.querySelector('[role=alert]')?.textContent).toContain('Reassign active customers first');
    expect(screen.getByRole('alertdialog', { name: 'Deactivate salesperson?' })).toBeTruthy();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
