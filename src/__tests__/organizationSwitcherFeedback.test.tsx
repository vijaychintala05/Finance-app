// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { OrganizationSwitcherModal } from '../components/organization/OrganizationSwitcherModal';
import { useBooks } from '../context/BooksContext';

vi.mock('../context/BooksContext', () => ({ useBooks: vi.fn() }));

afterEach(() => cleanup());

describe('OrganizationSwitcherModal feedback', () => {
  it('keeps the switcher open and explains when a listed organization is no longer available', () => {
    const onClose = vi.fn();
    const switchOrganization = vi.fn(() => false);
    vi.mocked(useBooks).mockReturnValue({
      organizations: [
        { id: 'org-a', name: 'Primary', publicOrgId: 'PUB-A' },
        { id: 'org-b', name: 'Other', publicOrgId: 'PUB-B' },
      ],
      currentOrg: { id: 'org-a' },
      switchOrganization,
    } as any);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    render(<OrganizationSwitcherModal isOpen onClose={onClose} onOpenWizard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Other/ }));

    expect(switchOrganization).toHaveBeenCalledWith('org-b');
    expect(screen.getByRole('alert').textContent).toContain('no longer available');
    expect(onClose).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('closes only after the organization switch succeeds', () => {
    const onClose = vi.fn();
    const switchOrganization = vi.fn(() => true);
    vi.mocked(useBooks).mockReturnValue({
      organizations: [
        { id: 'org-a', name: 'Primary', publicOrgId: 'PUB-A' },
        { id: 'org-b', name: 'Other', publicOrgId: 'PUB-B' },
      ],
      currentOrg: { id: 'org-a' },
      switchOrganization,
    } as any);

    render(<OrganizationSwitcherModal isOpen onClose={onClose} onOpenWizard={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Other/ }));

    expect(switchOrganization).toHaveBeenCalledWith('org-b');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});