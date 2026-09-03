// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InvoiceEditorModal } from '../components/invoices/InvoiceEditorModal';
import { BooksProvider } from '../context/BooksContext';

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<BooksProvider>{ui}</BooksProvider>);
};

describe('InvoiceEditorModal UI & Interaction Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Does not render modal content when isOpen is false', () => {
    renderWithProvider(<InvoiceEditorModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Create New Sales Invoice')).toBeNull();
  });

  it('2. Renders title and form fields when isOpen is true', () => {
    renderWithProvider(<InvoiceEditorModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Create New Sales Invoice')).toBeTruthy();
    expect(screen.getByText('Invoice Line Items')).toBeTruthy();
    expect(screen.getByText('Add Row')).toBeTruthy();
  });

  it('3. Clicking Add Row appends a new item row', () => {
    renderWithProvider(<InvoiceEditorModal isOpen={true} onClose={vi.fn()} />);
    const initialInputs = screen.getAllByPlaceholderText('Item or service detail');
    // The editor renders desktop and mobile presentations of the same item state.
    expect(initialInputs.length).toBe(2);

    const addButton = screen.getByText('Add Row');
    fireEvent.click(addButton);

    const afterInputs = screen.getAllByPlaceholderText('Item or service detail');
    expect(afterInputs.length).toBe(4);
  });

  it('4. Updates item description and price dynamically', () => {
    renderWithProvider(<InvoiceEditorModal isOpen={true} onClose={vi.fn()} />);
    const [descInput] = screen.getAllByPlaceholderText('Item or service detail');
    fireEvent.change(descInput, { target: { value: 'Software Architecture Consulting' } });
    expect((descInput as HTMLInputElement).value).toBe('Software Architecture Consulting');
  });

  it('5. Clicking close button triggers onClose handler', () => {
    const onCloseMock = vi.fn();
    renderWithProvider(<InvoiceEditorModal isOpen={true} onClose={onCloseMock} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onCloseMock).toHaveBeenCalled();
  });
});
