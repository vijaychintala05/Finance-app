// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EstimatesView } from '../components/invoices/EstimatesView';
import { EstimateDetailsModal, QuotationDetailsModal } from '../components/invoices/EstimateDetailsModal';
import { quotationApi } from '../services/quotationApi';
import { customerApi } from '../services/customerApi';
import { BooksProvider } from '../context/BooksContext';

vi.mock('../services/customerApi', () => ({
  customerApi: {
    listCustomers: vi.fn(),
    listProjects: vi.fn(),
    createCustomer: vi.fn(),
    createProject: vi.fn(),
  },
}));

vi.mock('../services/quotationApi', () => ({
  quotationApi: {
    listQuotations: vi.fn(),
    getQuotation: vi.fn(),
    createQuotation: vi.fn(),
    updateQuotation: vi.fn(),
    convertQuotationToInvoice: vi.fn(),
  },
}));

describe('Phase 8.4B.2A — Production Quotation Details & Conversion Test Suite', () => {
  const sampleQuotation = {
    id: 'q-100',
    estimateNumber: 'EST-2026-0100',
    revisionNumber: 1,
    customerId: 'cust-888',
    customerName: 'Orion Dynamics Ltd',
    customerSnapshot: {
      displayName: 'Orion Dynamics Ltd',
      gstin: '27AABCU9603R1ZM',
      email: 'finance@orion.com',
      phone: '+91 98765 43210',
      billingAddress: 'Suite 404, Cyber Towers, Hitec City, Hyderabad 500081',
      placeOfSupply: '36 - Telangana',
    },
    projectId: 'PRJ-505',
    issueDate: '2026-08-11',
    expiryDate: '2026-09-10',
    subtotal: 100000,
    taxTotal: 18000,
    discount: 5000,
    overallDiscount: 5000,
    totalAmount: 113000,
    isGstInclusive: false,
    status: 'DRAFT',
    items: [
      {
        id: 'li-1',
        name: 'Enterprise Cloud Architecture',
        description: 'Multi-region Kubernetes setup & Terraform automation',
        hsnSac: '998313',
        quantity: 2,
        unit: 'Hrs',
        rate: 50000,
        discountPercent: 5,
        discountAmount: 5000,
        taxRate: 18,
        lineTotal: 95000,
      },
    ],
    notes: 'Commercial quotation subject to standard SLA terms.',
    terms: '50% advance upon PO issuance. Remaining 50% on UAT sign-off.',
    validityDays: 30,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (quotationApi.listQuotations as any).mockResolvedValue([sampleQuotation]);
    (quotationApi.getQuotation as any).mockResolvedValue(sampleQuotation);
    (customerApi.listCustomers as any).mockResolvedValue([]);
    (customerApi.listProjects as any).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Clicking quotation row calls quotationApi.getQuotation(id)
  it('1. Clicking quotation row in EstimatesView calls quotationApi.getQuotation(id)', async () => {
    render(
      <BooksProvider>
        <EstimatesView />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('EST-2026-0100')).toBeDefined();
    });

    const row = screen.getByText('EST-2026-0100');
    fireEvent.click(row);

    await waitFor(() => {
      expect(quotationApi.getQuotation).toHaveBeenCalledWith('q-100');
    });
  });

  // 2. Loading state shown while details are fetched
  it('2. Shows loading indicator while quotation details are being fetched', async () => {
    let resolveFetch: (v: any) => void;
    (quotationApi.getQuotation as any).mockImplementation(
      () => new Promise((res) => { resolveFetch = res; })
    );

    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    expect(screen.getByText(/Loading authoritative quotation details.../i)).toBeDefined();

    await act(async () => {
      resolveFetch!(sampleQuotation);
    });

    await waitFor(() => {
      expect(screen.queryByText(/Loading authoritative quotation details.../i)).toBeNull();
    });
  });

  // 3. Fetch error shown cleanly with retry button
  it('3. Displays clean inline error when getQuotation fails and allows retry', async () => {
    (quotationApi.getQuotation as any).mockRejectedValueOnce(new Error('PostgreSQL read error'));

    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/PostgreSQL read error/i)).toBeDefined();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    (quotationApi.getQuotation as any).mockResolvedValueOnce(sampleQuotation);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('EST-2026-0100')).toBeDefined();
    });
  });

  // 4. Details render quotation number
  it('4. Renders authoritative quotation number', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('EST-2026-0100')).toBeDefined();
    });
  });

  // 5. Customer snapshot renders actual saved customer data
  it('5. Renders saved customer snapshot data including GSTIN, email, phone, and billing address', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Orion Dynamics Ltd')).toBeDefined();
      expect(screen.getByText(/GSTIN: 27AABCU9603R1ZM/i)).toBeDefined();
      expect(screen.getByText('finance@orion.com')).toBeDefined();
      expect(screen.getByText('+91 98765 43210')).toBeDefined();
      expect(screen.getByText(/Suite 404, Cyber Towers/i)).toBeDefined();
    });
  });

  // 6. Project renders when present
  it('6. Renders linked project when present', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('PRJ-505')).toBeDefined();
    });
  });

  // 7. Issue + expiry dates render
  it('7. Renders formatted issue and expiry dates', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Issued: Aug 11, 2026/i)).toBeDefined();
      expect(screen.getByText(/Expires: Sep 10, 2026/i)).toBeDefined();
    });
  });

  // 8. Line name + description render
  it('8. Renders line item name and description', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Enterprise Cloud Architecture/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Multi-region Kubernetes setup/i).length).toBeGreaterThan(0);
    });
  });

  // 9. HSN/SAC renders
  it('9. Renders line item HSN/SAC code', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/998313/i).length).toBeGreaterThan(0);
    });
  });

  // 10. Quantity + unit render
  it('10. Renders quantity and unit', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/2/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Hrs/i).length).toBeGreaterThan(0);
    });
  });

  // 11. Rate renders
  it('11. Renders rate / unit price', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/50,000/).length).toBeGreaterThan(0);
    });
  });

  // 12. Line discount renders
  it('12. Renders line discount percent', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/5%/i).length).toBeGreaterThan(0);
    });
  });

  // 13. Line GST rate renders
  it('13. Renders line GST rate without relying on global default rate', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/18%/i).length).toBeGreaterThan(0);
    });
  });

  // 14. Overall discount renders
  it('14. Renders document overall discount', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Overall Discount/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/-₹5,000.00/i).length).toBeGreaterThan(0);
    });
  });

  // 15. Taxable total renders
  it('15. Renders taxable subtotal', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Taxable Amount/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/95,000/).length).toBeGreaterThan(0);
    });
  });

  // 16. Saved tax total renders
  it('16. Renders saved tax total accurately labeled GST / Tax', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/GST \/ Tax/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/18,000/).length).toBeGreaterThan(0);
    });
  });

  // 17. Grand total renders
  it('17. Renders final grand total', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Grand Total/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/113,000/).length).toBeGreaterThan(0);
    });
  });

  // 18. GST Inclusive indicator renders when applicable
  it('18. Renders GST Inclusive indicator when isGstInclusive is true', async () => {
    (quotationApi.getQuotation as any).mockResolvedValue({
      ...sampleQuotation,
      isGstInclusive: true,
    });

    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Prices include GST/i).length).toBeGreaterThan(0);
    });
  });

  // 19. Notes render
  it('19. Renders quotation notes', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Commercial quotation subject to standard SLA terms/i)).toBeDefined();
    });
  });

  // 20. Terms render
  it('20. Renders terms & conditions', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/50% advance upon PO issuance/i)).toBeDefined();
    });
  });

  // 21. Real conversion calls quotationApi.convertQuotationToInvoice(id)
  it('21. Clicking Convert to Invoice calls quotationApi.convertQuotationToInvoice(id) and NOT BooksContext', async () => {
    (quotationApi.convertQuotationToInvoice as any).mockResolvedValue({
      id: 'inv-999',
      invoiceNumber: 'INV-2026-0999',
    });

    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('EST-2026-0100')).toBeDefined();
    });

    const convertBtn = screen.getByRole('button', { name: /Convert to Invoice/i });
    await act(async () => {
      fireEvent.click(convertBtn);
    });

    expect(quotationApi.convertQuotationToInvoice).toHaveBeenCalledWith('q-100');
  });

  // 22. Successful conversion triggers onConverted callback and updates status to CONVERTED
  it('22. Successful conversion triggers onConverted callback and displays converted status banner', async () => {
    const handleConverted = vi.fn();
    (quotationApi.convertQuotationToInvoice as any).mockResolvedValue({
      id: 'inv-999',
      invoiceNumber: 'INV-2026-0999',
    });

    render(
      <BooksProvider>
        <EstimateDetailsModal
          isOpen={true}
          quotationId="q-100"
          onClose={vi.fn()}
          onConverted={handleConverted}
        />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('EST-2026-0100')).toBeDefined();
    });

    const convertBtn = screen.getByRole('button', { name: /Convert to Invoice/i });
    await act(async () => {
      fireEvent.click(convertBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(handleConverted).toHaveBeenCalledWith(expect.objectContaining({ id: 'inv-999' }));
    expect(screen.getByText(/Quote Has Been Converted to Invoice/i)).toBeDefined();
  });

  // 23. Backend status CONVERTED hides convert button
  it('23. Hides Convert to Invoice button when quotation status is CONVERTED', async () => {
    (quotationApi.getQuotation as any).mockResolvedValue({
      ...sampleQuotation,
      status: 'CONVERTED',
    });

    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Convert to Invoice/i })).toBeNull();
      expect(screen.getByText(/Quote Has Been Converted to Invoice/i)).toBeDefined();
    });
  });

  // 24. Conversion API failure shows non-destructive error alert and allows retry
  it('24. Shows inline conversion error banner when API fails and permits retry', async () => {
    (quotationApi.convertQuotationToInvoice as any).mockRejectedValueOnce(new Error('Tax engine lock timeout'));

    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('EST-2026-0100')).toBeDefined();
    });

    const convertBtn = screen.getByRole('button', { name: /Convert to Invoice/i });
    await act(async () => {
      fireEvent.click(convertBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText(/Tax engine lock timeout/i)).toBeDefined();
    expect(screen.getByText('EST-2026-0100')).toBeDefined();

    const retryBtn = screen.getByRole('button', { name: /Retry Conversion/i });
    (quotationApi.convertQuotationToInvoice as any).mockResolvedValueOnce({ id: 'inv-100' });
    await act(async () => {
      fireEvent.click(retryBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText(/Quote Has Been Converted to Invoice/i)).toBeDefined();
  });

  // 25. No Delete Quote action in production details modal
  it('25. Confirms production quotation details modal contains NO Delete Quote action', async () => {
    render(
      <BooksProvider>
        <EstimateDetailsModal isOpen={true} quotationId="q-100" onClose={vi.fn()} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('EST-2026-0100')).toBeDefined();
    });

    expect(screen.queryByText(/Delete Quote/i)).toBeNull();
  });
});
