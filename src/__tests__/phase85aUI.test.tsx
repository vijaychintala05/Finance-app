// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { EstimateDetailsModal } from '../components/invoices/EstimateDetailsModal';
import { quotationApi } from '../services/quotationApi';

vi.mock('../services/quotationApi', () => ({
  quotationApi: {
    getQuotation: vi.fn(),
    getQuotationPdf: vi.fn(),
  },
}));

describe('Phase 8.5A — Quotation PDF UI & Modal Tests', () => {
  const mockEstimate = {
    id: 'est-101',
    quotationNumber: 'QT-2026-001',
    customerName: 'Acme Corp',
    subtotal: 10000,
    taxTotal: 1800,
    totalAmount: 11800,
    status: 'SENT',
    lineItems: [
      { name: 'Software Development', quantity: 1, rate: 10000, lineTotal: 10000 },
    ],
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (quotationApi.getQuotation as any).mockResolvedValue(mockEstimate);
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Renders Download PDF button
  it('1. Renders Download PDF action button in EstimateDetailsModal header', async () => {
    render(
      <EstimateDetailsModal
        isOpen={true}
        onClose={() => {}}
        quotationId="est-101"
        estimate={mockEstimate}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /Download Quotation PDF/i });
    expect(downloadBtn).toBeDefined();
    expect(downloadBtn.textContent).toContain('Download PDF');
  });

  // 2. Clicking Download PDF invokes quotationApi.getQuotationPdf
  it('2. Invokes quotationApi.getQuotationPdf when Download PDF button is clicked', async () => {
    const mockBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
    (quotationApi.getQuotationPdf as any).mockResolvedValue(mockBlob);

    // Mock window.URL.createObjectURL & revokeObjectURL
    window.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test');
    window.URL.revokeObjectURL = vi.fn();

    render(
      <EstimateDetailsModal
        isOpen={true}
        onClose={() => {}}
        quotationId="est-101"
        estimate={mockEstimate}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /Download Quotation PDF/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(quotationApi.getQuotationPdf).toHaveBeenCalledWith('est-101');
    });
  });

  // 3. Displays error banner on download failure
  it('3. Displays error banner when quotation PDF download fails', async () => {
    (quotationApi.getQuotationPdf as any).mockRejectedValue(new Error('Network error generating PDF'));

    render(
      <EstimateDetailsModal
        isOpen={true}
        onClose={() => {}}
        quotationId="est-101"
        estimate={mockEstimate}
      />
    );

    const downloadBtn = screen.getByRole('button', { name: /Download Quotation PDF/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(screen.getByText('Network error generating PDF')).toBeDefined();
    });
  });
});
