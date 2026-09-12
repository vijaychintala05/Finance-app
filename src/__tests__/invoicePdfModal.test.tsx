// @vitest-environment jsdom
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { InvoicePreviewModal } from '../components/invoices/InvoicePreviewModal';
import { invoiceApi } from '../services/invoiceApi';
import { Invoice } from '../types';

vi.mock('../services/invoiceApi', () => ({
  invoiceApi: {
    getInvoicePdf: vi.fn(),
  },
}));

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    settings: {
      firmName: 'Apex Advisory Services Pvt Ltd',
      firmAddress: '100 Financial District, Mumbai, MH 400001',
      firmEmail: 'billing@apexadvisory.com',
      firmPhone: '+91 22 1234 5678',
      taxId: '27AABCA1234F1Z5',
      currencySymbol: 'INR',
      currencyCode: 'INR',
      logoText: 'Tax & Accounting Excellence',
    },
    invoices: [],
  }),
}));

describe('Invoice Preview Modal & PDF UI Tests', () => {
  const mockInvoice: Invoice = {
    id: 'inv-test-999',
    invoiceNumber: 'INV/2026-27/0101',
    clientId: 'cli-101',
    clientName: 'Tata Consultancy Services',
    clientEmail: 'tcs.procurement@tata.com',
    issueDate: '2026-09-01',
    dueDate: '2026-09-30',
    createdAt: '2026-09-01T10:00:00.000Z',
    subtotal: 50000,
    taxTotal: 9000,
    discount: 0,
    totalAmount: 59000,
    paidAmount: 0,
    balanceDue: 59000,
    status: 'Sent',
    items: [
      {
        id: 'item-1',
        description: 'Quarterly Corporate Tax Audit & Filing',
        quantity: 1,
        unitPrice: 50000,
        taxRate: 18,
        amount: 50000,
        accountId: 'acc-sales-1',
      },
    ],
    notes: 'Thank you for your business.',
    terms: 'Payment due within 30 days.',
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renders TAX INVOICE header, firm branding, and Download PDF button', () => {
    render(<InvoicePreviewModal invoice={mockInvoice} onClose={() => {}} />);

    // Document header
    expect(screen.getByText('TAX INVOICE')).toBeDefined();
    expect(screen.getAllByText('INV/2026-27/0101').length).toBeGreaterThanOrEqual(1);

    // Firm branding
    expect(screen.getAllByText(/Apex Advisory Services Pvt Ltd/).length).toBeGreaterThanOrEqual(1);

    // Download PDF button
    const downloadBtn = screen.getByRole('button', { name: /Download PDF/i });
    expect(downloadBtn).toBeDefined();

    // Print button
    const printBtn = screen.getByRole('button', { name: /Print/i });
    expect(printBtn).toBeDefined();
  });

  it('2. Clicking Download PDF invokes invoiceApi.getInvoicePdf and handles file download', async () => {
    const mockBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    (invoiceApi.getInvoicePdf as any).mockResolvedValue(mockBlob);

    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-invoice.pdf');
    window.URL.revokeObjectURL = vi.fn();

    render(<InvoicePreviewModal invoice={mockInvoice} onClose={() => {}} />);

    const downloadBtn = screen.getByRole('button', { name: /Download PDF/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(invoiceApi.getInvoicePdf).toHaveBeenCalledWith('inv-test-999');
      expect(window.URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
    });
  });

  it('3. Renders official Authorized Signatory block and payment instructions without dev disclaimers', () => {
    render(<InvoicePreviewModal invoice={mockInvoice} onClose={() => {}} />);

    // Authorized signatory
    expect(screen.getByText('Authorized Signatory')).toBeDefined();
    expect(screen.getByText('For Apex Advisory Services Pvt Ltd')).toBeDefined();

    // Should NOT contain dev placeholder disclaimers
    expect(screen.queryByText(/Browser-rendered copy; no PO reference/i)).toBeNull();
    expect(screen.queryByText(/No verified digital signature or organization seal/i)).toBeNull();
    expect(screen.queryByText(/No verified remittance instructions are configured/i)).toBeNull();
  });

  it('4. Displays an error banner if PDF generation fails', async () => {
    (invoiceApi.getInvoicePdf as any).mockRejectedValue(new Error('Backend PDF rendering error'));

    render(<InvoicePreviewModal invoice={mockInvoice} onClose={() => {}} />);

    const downloadBtn = screen.getByRole('button', { name: /Download PDF/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(screen.getByText('Backend PDF rendering error')).toBeDefined();
    });
  });

  it('5. keeps invoice document sections visible in print media', () => {
    const printStyles = fs.readFileSync(path.resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(printStyles).toContain('.space-y-6:not(#printable-bill-area)');
  });
});
