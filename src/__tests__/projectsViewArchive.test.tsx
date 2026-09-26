// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiRequestError } from '../api/client';
import * as BooksContext from '../context/BooksContext';
import { ProjectsView } from '../components/projects/ProjectsView';

vi.mock('../components/projects/ProjectDetailModal', () => ({
  ProjectDetailModal: ({ onArchive, isNewWorkBlocked, archiveNotice }: any) => (
    <section>
      <button type="button" onClick={onArchive}>Archive current project</button>
      <span>{isNewWorkBlocked ? 'new work blocked' : 'new work allowed'}</span>
      {archiveNotice && <><p>{archiveNotice.title}</p><p>{archiveNotice.requestId}</p></>}
    </section>
  ),
}));
vi.mock('../components/projects/LogTimeModal', () => ({ LogTimeModal: () => null }));
vi.mock('../components/projects/NewProjectModal', () => ({ NewProjectModal: () => null }));
vi.mock('../components/invoices/InvoiceEditorModal', () => ({ InvoiceEditorModal: () => null }));
vi.mock('../components/expenses/ExpenseModal', () => ({ ExpenseModal: () => null }));

describe('ProjectsView archive flow', () => {
  let archiveProject: ReturnType<typeof vi.fn>;
  const projects = [{
    id: 'project-1',
    code: 'PRJ-1',
    name: 'Platform migration',
    clientName: 'Northwind Trading',
    status: 'Active',
    budgetType: 'Fixed Cost',
    totalBudget: 12000,
  }];

  beforeEach(() => {
    vi.restoreAllMocks();
    archiveProject = vi.fn().mockResolvedValue({
      data: { id: 'project-1', archived: true, changed: true, archivedAt: '2026-09-23T09:00:00.000Z' },
      requestId: 'req-project-archive',
      refreshFailed: false,
    });
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      projects,
      settings: { currencySymbol: '₹' },
      getProjectSummary: () => ({ totalInvoiced: 0, totalCollected: 0, directExpenses: 0, netProfit: 0, budgetUsedPercent: 0, totalLoggedHours: 0, unbilledHoursAmount: 0 }),
      archiveProject,
    } as any);
  });

  afterEach(() => cleanup());

  const openArchiveDialog = () => {
    render(<ProjectsView />);
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive current project' }));
  };

  it('requires an in-app confirmation and displays the committed receipt', async () => {
    openArchiveDialog();
    expect(screen.getByRole('alertdialog', { name: 'Archive project?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));

    expect(await screen.findByText('Project archived')).toBeTruthy();
    expect(screen.getByText('req-project-archive')).toBeTruthy();
    expect(archiveProject).toHaveBeenCalledOnce();
    expect(archiveProject).toHaveBeenCalledWith('project-1');
  });

  it('blocks duplicate archive and new work while the outcome is uncertain', async () => {
    archiveProject.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'The connection ended before the server result was confirmed',
      status: 0,
      requestId: 'req-project-archive-uncertain',
      errorCode: 'NETWORK_FAILURE',
    }, 'Project outcome is uncertain'));
    openArchiveDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));

    expect((await screen.findAllByText('Project archive could not be confirmed')).length).toBe(2);
    expect(screen.getByText('new work blocked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Awaiting verification' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive current project' }));
    expect(screen.getByText('new work blocked')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Awaiting verification' }).hasAttribute('disabled')).toBe(true);
    expect(archiveProject).toHaveBeenCalledOnce();
  });
});
