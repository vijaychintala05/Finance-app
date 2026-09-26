/* @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { apiClient } from '../api/client';
import { RolesPermissionsSettings } from '../components/settings/RolesPermissionsSettings';

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({ currentOrg: { id: 'org-role-delete-test' } }),
}));

const role = {
  id: 'role-temp-reviewer',
  organizationId: 'org-role-delete-test',
  name: 'Temporary Reviewer',
  description: 'Temporary role',
  isSystemRole: false,
  permissions: ['invoices.view'],
};

let currentRoles = [role];

describe('RolesPermissionsSettings custom role deletion recovery', () => {
  beforeEach(() => {
    currentRoles = [role];
    localStorage.clear();
    vi.spyOn(apiClient, 'createIdempotencyKey').mockReturnValue('role-delete-key-1234');
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/security/roles') return { data: { roles: currentRoles }, error: null, status: 200 } as any;
      return { data: { permissions: [] }, error: null, status: 200 } as any;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('uses an accessible confirmation, supports cancel, and accepts only the exact deletion receipt', async () => {
    const remove = vi.spyOn(apiClient, 'delete').mockImplementation(async () => {
      currentRoles = [];
      return { data: { id: role.id, deleted: true }, error: null, status: 200 } as any;
    });
    render(<RolesPermissionsSettings />);

    expect(await screen.findByRole('heading', { name: role.name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete custom role?' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove).toHaveBeenCalledWith('/security/roles/' + role.id, 'org-role-delete-test', 'role-delete-key-1234');
    expect(await screen.findByText('Role Temporary Reviewer deleted.')).toBeTruthy();
    expect(screen.queryByText(role.name)).toBeNull();
  });

  it('persists an uncertain attempt and retries the exact saved key after verification', async () => {
    const remove = vi.spyOn(apiClient, 'delete')
      .mockResolvedValueOnce({ data: null, error: 'Network communication failure', status: 500 } as any)
      .mockImplementationOnce(async () => {
        currentRoles = [];
        return { data: { id: role.id, deleted: true }, error: null, status: 200 } as any;
      });
    const firstRender = render(<RolesPermissionsSettings />);
    expect(await screen.findByRole('heading', { name: role.name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete role' }));
    expect(await screen.findByText(/server still lists Temporary Reviewer/)).toBeTruthy();
    firstRender.unmount();

    render(<RolesPermissionsSettings />);
    expect(await screen.findByRole('heading', { name: role.name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/unresolved outcome/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry same delete' }));
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(remove.mock.calls[0]).toEqual(remove.mock.calls[1]);
    expect(remove.mock.calls[0]).toEqual(['/security/roles/' + role.id, 'org-role-delete-test', 'role-delete-key-1234']);
    expect(await screen.findByText('Role Temporary Reviewer deleted.')).toBeTruthy();
  });
  it('keeps the durable retry guard when the authoritative role-list read fails', async () => {
    let roleListReads = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/security/roles') {
        roleListReads += 1;
        if (roleListReads === 2) return { data: null, error: 'Database unavailable', status: 500 } as any;
        return { data: { roles: currentRoles }, error: null, status: 200 } as any;
      }
      return { data: { permissions: [] }, error: null, status: 200 } as any;
    });
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      data: null,
      error: 'Network communication failure',
      status: 500,
    } as any);

    render(<RolesPermissionsSettings />);
    expect(await screen.findByRole('heading', { name: role.name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete role' }));

    expect(await screen.findByText(/outcome is still unknown/)).toBeTruthy();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(currentRoles.some((item) => item.id === role.id)).toBe(true);
    const guard = localStorage.getItem('firmbooks.role-delete.v1:org-role-delete-test:role-temp-reviewer');
    expect(guard).toBeTruthy();
    expect(JSON.parse(guard!).attempted).toBe(true);
  });
  it('keeps the retry guard when a 404 cannot be verified against the role list', async () => {
    let roleListReads = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/security/roles') {
        roleListReads += 1;
        if (roleListReads === 2) return { data: null, error: 'Database unavailable', status: 500 } as any;
        return { data: { roles: currentRoles }, error: null, status: 200 } as any;
      }
      return { data: { permissions: [] }, error: null, status: 200 } as any;
    });
    const remove = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      data: null,
      error: 'Role not found',
      status: 404,
    } as any);

    render(<RolesPermissionsSettings />);
    expect(await screen.findByRole('heading', { name: role.name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete role' }));

    expect(await screen.findByText(/outcome is still unknown/)).toBeTruthy();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(currentRoles.some((item) => item.id === role.id)).toBe(true);
    const guard = localStorage.getItem('firmbooks.role-delete.v1:org-role-delete-test:role-temp-reviewer');
    expect(guard).toBeTruthy();
    expect(JSON.parse(guard!).attempted).toBe(true);
  });
});

function withinDialogButton(dialog: HTMLElement, name: string): HTMLButtonElement {
  return Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent?.trim() === name)!;
}