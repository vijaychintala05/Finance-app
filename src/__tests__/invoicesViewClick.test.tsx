// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { InvoicesView } from '../components/invoices/InvoicesView';
import * as BooksContextModule from '../context/BooksContext';

describe('InvoicesView Click to Show Invoice Tests', () => {
  const sampleInvoices = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV/2026-27/0001',
      clientId: 'cli-1',
      clientName: 'Acme Global Technologies Inc.',
      clientEmail: 'billing@acmeglobal.com',
      issueDate: '2026-08-17T00:00:00.000Z',
      dueDate: '2026-09-16T00:00:00.000Z',
      items: [
        {
          id: 'item-1',
          description: 'Architecture & Cloud Migration',
          accountId: 'acc-1',
          quantity: 1,
          unitPrice: 15000,
          taxRate: 0,
          amount: 15000,
        },
      ],
      subtotal: 15000,
      taxTotal: 0,
      discount: 0,
      totalAmount: 15000,
      paidAmount: 0,
      balanceDue: 15000,
      status: 'Sent' as const,
      notes: 'Thank you for your business.',
      createdAt: '2026-08-17T00:00:00.000Z',
    },
    {
      id: 'inv-2',
      invoiceNumber: 'INV/2026-27/0002',
      clientId: 'cli-2',
      clientName: 'Starlight Digital Media LLC',
      clientEmail: 'ap@starlightmedia.io',
      issueDate: '2026-09-01T00:00:00.000Z',
      dueDate: '2026-10-01T00:00:00.000Z',
      // items undefined to test robustness
      items: undefined as any,
      subtotal: 8500,
      taxTotal: 0,
      discount: 0,
      totalAmount: 8500,
      paidAmount: 0,
      balanceDue: 8500,
      status: 'Sent' as const,
      notes: '',
      createdAt: '2026-09-01T00:00:00.000Z',
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renders invoices in InvoicesView and clicking row opens InvoicePreviewModal', async () => {
    vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
      invoices: sampleInvoices as any,
      clients: [],
      projects: [],
      salespersons: [],
      accounts: [],
      settings: {
        firmName: 'FirmBooks Demo',
        firmAddress: '100 Silicon Ave',
        firmEmail: 'demo@firmbooks.local',
        currencySymbol: '$',
        currencyCode: 'USD',
      } as any,
      deleteInvoice: vi.fn(),
    } as any);

    render(<InvoicesView />);

    expect(screen.getAllByText('INV/2026-27/0001').length).toBeGreaterThanOrEqual(1);

    // Click on the first invoice row
    const row = screen.getAllByText('INV/2026-27/0001')[0];
    fireEvent.click(row);

    // Check if TAX INVOICE modal is shown
    expect(screen.getByText('TAX INVOICE')).toBeDefined();
    expect(screen.getByText('Architecture & Cloud Migration')).toBeDefined();
    expect(screen.getAllByText(/FirmBooks Demo/).length).toBeGreaterThanOrEqual(1);

    // Close the modal
    const closeBtn = screen.getByTitle('Close window');
    fireEvent.click(closeBtn);

    // Modal should disappear
    expect(screen.queryByText('TAX INVOICE')).toBeNull();
  });

  it('2. Clicking the Eye preview button opens InvoicePreviewModal', async () => {
    vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
      invoices: sampleInvoices as any,
      clients: [],
      projects: [],
      salespersons: [],
      accounts: [],
      settings: {
        firmName: 'FirmBooks Demo',
        firmAddress: '100 Silicon Ave',
        firmEmail: 'demo@firmbooks.local',
        currencySymbol: '$',
        currencyCode: 'USD',
      } as any,
      deleteInvoice: vi.fn(),
    } as any);

    render(<InvoicesView />);

    const eyeBtns = screen.getAllByTitle('View / Print Invoice');
    expect(eyeBtns.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(eyeBtns[0]);

    expect(screen.getByText('TAX INVOICE')).toBeDefined();
    expect(screen.getAllByText('INV/2026-27/0001').length).toBeGreaterThanOrEqual(1);
  });

  it('3. Clicking on an invoice with undefined items does NOT crash and displays modal safely', async () => {
    vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
      invoices: sampleInvoices as any,
      clients: [],
      projects: [],
      salespersons: [],
      accounts: [],
      settings: {
        firmName: 'FirmBooks Demo',
        firmAddress: '100 Silicon Ave',
        firmEmail: 'demo@firmbooks.local',
        currencySymbol: '$',
        currencyCode: 'USD',
      } as any,
      deleteInvoice: vi.fn(),
    } as any);

    render(<InvoicesView />);

    expect(screen.getAllByText('INV/2026-27/0002').length).toBeGreaterThanOrEqual(1);

    // Click on the second invoice row (items is undefined)
    const row = screen.getAllByText('INV/2026-27/0002')[0];
    fireEvent.click(row);

    // Should not crash and should show TAX INVOICE
    expect(screen.getByText('TAX INVOICE')).toBeDefined();
    expect(screen.getAllByText('Starlight Digital Media LLC').length).toBeGreaterThanOrEqual(1);
  });

  it('4. Clicking Edit Invoice inside preview modal opens the editor modal', async () => {
    vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
      invoices: sampleInvoices as any,
      clients: [{ id: 'cli-1', name: 'Acme Global Technologies Inc.' }],
      projects: [],
      salespersons: [],
      accounts: [],
      settings: {
        firmName: 'FirmBooks Demo',
        firmAddress: '100 Silicon Ave',
        firmEmail: 'demo@firmbooks.local',
        currencySymbol: '$',
        currencyCode: 'USD',
      } as any,
      deleteInvoice: vi.fn(),
    } as any);

    render(<InvoicesView />);

    const row = screen.getAllByText('INV/2026-27/0001')[0];
    fireEvent.click(row);

    const editBtn = screen.getByTitle('Edit this invoice');
    fireEvent.click(editBtn);

    // Editor modal should open with Revision Mode
    expect(screen.getByText(/Edit Invoice/)).toBeDefined();
    expect(screen.getByText('Revision Mode')).toBeDefined();
  });

  it('shows the received payment amount separately from the invoice total and balance due', () => {
    vi.spyOn(BooksContextModule, 'useBooks').mockReturnValue({
      invoices: [{ ...sampleInvoices[0], paidAmount: 6500, balanceDue: 8500, status: 'Partially Paid' }] as any,
      clients: [],
      projects: [],
      salespersons: [],
      accounts: [],
      settings: {
        firmName: 'FirmBooks Demo',
        currencySymbol: '$',
        currencyCode: 'USD',
      } as any,
      deleteInvoice: vi.fn(),
    } as any);

    render(<InvoicesView />);

    expect(screen.getAllByText('Payments Received').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('$6,500.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('$8,500.00').length).toBeGreaterThanOrEqual(2);
  });
});
