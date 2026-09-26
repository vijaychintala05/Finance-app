// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiRequestError } from '../api/client';
import * as BooksContext from '../context/BooksContext';
import { EditProjectModal } from '../components/projects/EditProjectModal';

describe('Project master edit receipts', () => {
  let updateProject: ReturnType<typeof vi.fn>;
  const onClose = vi.fn();
  const project = {
    id: 'project-1',
    code: 'PRJ-1',
    name: 'Platform migration',
    clientId: 'customer-1',
    clientName: 'Northwind Trading',
    status: 'Active',
    budgetType: 'Fixed Cost',
    totalBudget: 12000,
    hourlyRate: 150,
    startDate: '2026-08-01',
    manager: 'Sarah',
    description: 'Existing engagement',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    onClose.mockReset();
    updateProject = vi.fn().mockResolvedValue({
      data: { ...project, name: 'Platform migration phase 2', changed: true },
      requestId: 'req-project-update',
      refreshFailed: false,
    });
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      clients: [{ id: 'customer-1', name: 'Northwind Trading', companyName: 'Northwind Trading' }],
      settings: { currencySymbol: '₹' },
      updateProject,
    } as any);
  });

  afterEach(() => cleanup());

  it('sends project fields and shows the committed server receipt', async () => {
    const { rerender } = render(<EditProjectModal isOpen project={project as any} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Platform migration phase 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Project updated')).toBeTruthy();
    expect(screen.getByText('req-project-update')).toBeTruthy();
    expect(updateProject).toHaveBeenCalledWith('project-1', expect.objectContaining({
      code: 'PRJ-1',
      name: 'Platform migration phase 2',
      clientId: 'customer-1',
      startDate: '2026-08-01',
    }));
    expect(screen.getByRole('button', { name: 'Project saved' }).hasAttribute('disabled')).toBe(true);
    rerender(<EditProjectModal isOpen project={{ ...project, name: 'Platform migration phase 2' } as any} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Project saved' }).hasAttribute('disabled')).toBe(true);
    expect(updateProject).toHaveBeenCalledOnce();
  });

  it('blocks duplicate submission when the server outcome is uncertain', async () => {
    updateProject.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'The connection ended before the server result was confirmed',
      status: 0,
      requestId: 'req-project-uncertain',
      errorCode: 'NETWORK_FAILURE',
    }, 'Project outcome is uncertain'));
    const { rerender } = render(<EditProjectModal isOpen project={project as any} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Project update could not be confirmed')).toBeTruthy();
    expect(screen.getByText('req-project-uncertain')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Awaiting verification' }).every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Close project editor' }).hasAttribute('disabled')).toBe(true);
    expect(updateProject).toHaveBeenCalledTimes(1);
  });
});
