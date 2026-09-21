// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { BrandingSettings } from '../components/settings/BrandingSettings';
import { PdfTemplatesSettings } from '../components/settings/PdfTemplatesSettings';
import { SettingsView } from '../components/settings/SettingsView';
import { apiClient } from '../api/client';

// Mock BooksContext
const mockUpdateSettings = vi.fn();
const mockRefreshOrganizations = vi.fn().mockResolvedValue(undefined);

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    currentOrg: {
      id: 'org-test-101',
      name: 'Emerald Advisory Group',
      publicOrgId: 'PUB-EMERALD',
      orgCode: 'EMERALD',
      baseCurrency: 'INR',
      currencySymbol: '₹',
      country: 'India',
      status: 'Active',
    },
    settings: {
      firmName: 'Emerald Advisory Group',
      firmAddress: '104 Corporate Tower, Mumbai',
      taxId: '27AABCE1234F1Z5',
      currencySymbol: '₹',
      branding: {
        primaryColor: '#1e40af',
        accentColor: '#0f172a',
        fontFamily: 'Inter, sans-serif',
        authorizedSignatoryTitle: 'Authorized Signatory',
        footerNote: 'Thank you for your business.',
        termsAndConditions: 'Payment is due within payment terms.',
      },
      documentTemplates: {
        quotes: {
          defaultTemplate: 'spreadsheet',
          templateTitle: 'COMMERCIAL QUOTATION',
          showHsnSac: true,
          showDiscount: true,
        },
        invoices: {
          defaultTemplate: 'standard',
          templateTitle: 'TAX INVOICE',
          showHsnSac: true,
          showDiscount: true,
        },
      },
    },
    updateSettings: mockUpdateSettings,
    refreshOrganizations: mockRefreshOrganizations,
  }),
}));

// Mock apiClient
vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('Company Branding & PDF Templates Studio Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === '/organizations/current') {
        return Promise.resolve({
          status: 200,
          data: {
            profile: {
              logoUrl: '',
              branding: {
                primaryColor: '#1e40af',
                accentColor: '#0f172a',
                fontFamily: 'Inter, sans-serif',
                authorizedSignatoryTitle: 'Authorized Signatory',
                footerNote: 'Thank you for your business.',
                termsAndConditions: 'Payment is due within payment terms.',
              },
              documentTemplates: {
                quotes: {
                  defaultTemplate: 'spreadsheet',
                  templateTitle: 'COMMERCIAL QUOTATION',
                },
                invoices: {
                  defaultTemplate: 'standard',
                  templateTitle: 'TAX INVOICE',
                },
              },
            },
          },
        });
      }
      return Promise.resolve({ status: 200, data: {} });
    });

    (apiClient.patch as any).mockResolvedValue({
      status: 200,
      data: { success: true },
    });
  });

  afterEach(() => {
    cleanup();
  });

  // --- BRANDING PAGE TESTS ---
  it('1. Company Branding page loads logo controls and live Brand Identity Card', async () => {
    render(<BrandingSettings />);

    await waitFor(() => {
      expect(screen.getByText('Company Branding')).toBeDefined();
    });

    expect(screen.getByText('Company Logo')).toBeDefined();
    expect(screen.getByText('Brand Color Palette')).toBeDefined();
    expect(screen.getByText('Live Brand Identity Card')).toBeDefined();

    const primaryHexInput = screen.getByLabelText('Primary Brand Color Hex') as HTMLInputElement;
    expect(primaryHexInput.value.toLowerCase()).toBe('#1e40af');
  });

  it('2. Selecting a curated palette preset updates colors in form controls and preview', async () => {
    render(<BrandingSettings />);

    await waitFor(() => {
      expect(screen.getByText('Forest Emerald')).toBeDefined();
    });

    const emeraldPresetBtn = screen.getByRole('button', { name: /Forest Emerald/i });
    fireEvent.click(emeraldPresetBtn);

    const primaryHexInput = screen.getByLabelText('Primary Brand Color Hex') as HTMLInputElement;
    expect(primaryHexInput.value.toLowerCase()).toBe('#059669');

    const accentHexInput = screen.getByLabelText('Accent Brand Color Hex') as HTMLInputElement;
    expect(accentHexInput.value.toLowerCase()).toBe('#064e3b');
  });

  it('3. Saving branding calls PATCH /organizations/current and updates BooksContext', async () => {
    render(<BrandingSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Branding/i })).toBeDefined();
    });

    const primaryHexInput = screen.getByLabelText('Primary Brand Color Hex');
    fireEvent.change(primaryHexInput, { target: { value: '#059669' } });

    const saveBtn = screen.getByRole('button', { name: /Save Branding/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/organizations/current',
        expect.objectContaining({
          branding: expect.objectContaining({
            primaryColor: '#059669',
          }),
        })
      );
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          branding: expect.objectContaining({
            primaryColor: '#059669',
          }),
        })
      );
    });
  });

  // --- PDF & DOCUMENT TEMPLATES STUDIO TESTS ---
  it('4. PDF Templates Studio displays 14 document categories in the left sidebar', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getByText('Templates')).toBeDefined();
    });

    // Check all 14 categories exist
    expect(screen.getByRole('button', { name: /Quotes/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Sales Orders/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Delivery Challans/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Invoices/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Credit Notes/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Purchase Orders/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Payment Receipts/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Customer Statements/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Bills/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Expenses/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Vendor Credits/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Vendor Payments/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Vendor Statements/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Journals/i })).toBeDefined();
  });

  it('5. Switching category from Quotes to Invoices updates title and gallery', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getByText('Quote Templates')).toBeDefined();
    });

    // Click Invoices tab
    const invoicesBtn = screen.getByRole('button', { name: /Invoices/i });
    fireEvent.click(invoicesBtn);

    expect(screen.getByText('Invoice Templates')).toBeDefined();
  });

  it('6. Renders template gallery with visual preview and DEFAULT badge', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getByText('Quote Templates')).toBeDefined();
    });

    expect(screen.getByText('Spreadsheet Template')).toBeDefined();
    expect(screen.getByText('Standard Template')).toBeDefined();
    expect(screen.getByText('Modern Minimalist')).toBeDefined();
    expect(screen.getByText('Compact Slip Template')).toBeDefined();
    expect(screen.getByText('New Template')).toBeDefined();

    // Verify DEFAULT badge exists on Spreadsheet Template
    expect(screen.getByText('DEFAULT')).toBeDefined();
  });

  it('7. Clicking "Set as Default" updates template in real-time and calls PATCH', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getByText('Standard Template')).toBeDefined();
    });

    // Find and click Set as Default button on the first non-default template
    const setDefaultBtn = screen.getAllByRole('button', { name: /Set as Default/i })[0];
    fireEvent.click(setDefaultBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/organizations/current',
        expect.objectContaining({
          documentTemplates: expect.any(Object),
        })
      );
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          documentTemplates: expect.any(Object),
        })
      );
    });
  });

  it('8. Opening "Configure PDF Options" allows customizing Document Title and saves in real-time', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Configure PDF Options/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Configure PDF Options/i }));

    // Options modal should open
    await waitFor(() => {
      expect(screen.getByText(/PDF Options: Quote/i)).toBeDefined();
    });

    // Change Document Title to PROFORMA INVOICE
    const titleInput = screen.getByLabelText('Document Title');
    fireEvent.change(titleInput, { target: { value: 'PROFORMA INVOICE' } });

    // Save options
    const saveBtn = screen.getByRole('button', { name: /Save & Apply in Real Time/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/organizations/current',
        expect.objectContaining({
          documentTemplates: expect.objectContaining({
            quotes: expect.objectContaining({
              templateTitle: 'PROFORMA INVOICE',
            }),
          }),
        })
      );
      expect(mockUpdateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          documentTemplates: expect.objectContaining({
            quotes: expect.objectContaining({
              templateTitle: 'PROFORMA INVOICE',
            }),
          }),
        })
      );
    });
  });

  it('9. SettingsView displays separate Company Branding and PDF Templates tabs and routes cleanly', async () => {
    render(<SettingsView />);

    expect(screen.getByText('Company Branding')).toBeDefined();
    expect(screen.getByText('PDF & Document Templates')).toBeDefined();

    // Navigate to Company Branding
    const brandingCard = screen.getByRole('button', { name: /Company Branding/i });
    fireEvent.click(brandingCard);

    await waitFor(() => {
      expect(screen.getByText('Brand Color Palette')).toBeDefined();
    });

    // Cross-link to PDF Templates
    const toPdfBtn = screen.getByRole('button', { name: /Open PDF & Document Templates/i });
    fireEvent.click(toPdfBtn);

    await waitFor(() => {
      expect(screen.getByText('Quote Templates')).toBeDefined();
    });

    // Cross-link back to Company Branding
    const toBrandingBtn = screen.getByRole('button', { name: /Edit Logo & Brand Colors/i });
    fireEvent.click(toBrandingBtn);

    await waitFor(() => {
      expect(screen.getByText('Brand Color Palette')).toBeDefined();
    });
  });
});
