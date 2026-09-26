// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ApiRequestError } from '../api/client';
import * as BooksContext from '../context/BooksContext';
import { NewProjectModal } from '../components/projects/NewProjectModal';

describe('Project creation receipts', () => {
  let addProject: ReturnType<typeof vi.fn>;
  const onClose = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onClose.mockReset();
    addProject = vi.fn().mockResolvedValue({
      data: { id: 'project-1', name: 'Migration project' },
      requestId: 'req-project-create',
      refreshFailed: false,
    });
    vi.spyOn(BooksContext, 'useBooks').mockReturnValue({
      clients: [{ id: 'customer-1', name: 'Asha Rao', companyName: 'Asha Trading' }],
      settings: { currencyCode: 'INR' },
      addProject,
    } as any);
  });

  afterEach(() => cleanup());

  const enterProjectName = () => {
    fireEvent.change(screen.getByPlaceholderText('e.g., Enterprise Cloud Migration & Security Audit'), {
      target: { value: 'Migration project' },
    });
  };

  it('shows a request-aware success receipt and prevents duplicate creation', async () => {
    render(<NewProjectModal isOpen onClose={onClose} />);
    enterProjectName();
    fireEvent.click(screen.getByRole('button', { name: 'Save Project' }));

    expect(await screen.findByText('Project created')).toBeTruthy();
    expect(screen.getByText('req-project-create')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Project saved' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Project saved' }));
    expect(addProject).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a rejected project draft open and shows the server cause', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    addProject.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'The selected customer is no longer available for new projects',
      status: 409,
      requestId: 'req-project-rejected',
      errorCode: 'CUSTOMER_ARCHIVED',
    }, 'Project creation failed'));
    render(<NewProjectModal isOpen onClose={onClose} />);
    enterProjectName();
    fireEvent.click(screen.getByRole('button', { name: 'Save Project' }));

    expect(await screen.findByText('Project creation was not completed')).toBeTruthy();
    expect(screen.getByText('req-project-rejected')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g., Enterprise Cloud Migration & Security Audit')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('keeps the committed receipt visible when refreshing projects fails', async () => {
    addProject.mockResolvedValueOnce({
      data: { id: 'project-1', name: 'Migration project' },
      requestId: 'req-project-stale',
      refreshFailed: true,
    });
    render(<NewProjectModal isOpen onClose={onClose} />);
    enterProjectName();
    fireEvent.click(screen.getByRole('button', { name: 'Save Project' }));

    expect(await screen.findByText('Project created; project list refresh failed')).toBeTruthy();
    expect(screen.getByText('req-project-stale')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Project saved' }).hasAttribute('disabled')).toBe(true);
  });

  it('blocks resubmission after an uncertain server outcome without claiming it was saved', async () => {
    addProject.mockRejectedValueOnce(new ApiRequestError({
      data: null,
      error: 'The connection ended before the server result was confirmed',
      status: 0,
      requestId: 'req-project-uncertain',
      errorCode: 'NETWORK_FAILURE',
    }, 'Project outcome is uncertain'));
    render(<NewProjectModal isOpen onClose={onClose} />);
    enterProjectName();
    fireEvent.click(screen.getByRole('button', { name: 'Save Project' }));

    expect(await screen.findByText('Project creation could not be confirmed')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Awaiting verification' }).hasAttribute('disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Project saved' })).toBeNull();
    expect(addProject).toHaveBeenCalledTimes(1);
  });
});
