// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { BrandingSettings } from '../components/settings/BrandingSettings';
import { PdfTemplatesSettings } from '../components/settings/PdfTemplatesSettings';
import { CATEGORY_TEMPLATES, isLegacyUnsupportedPresetTitle } from '../components/settings/PdfTemplatesSettings';
import { SettingsView } from '../components/settings/SettingsView';
import { apiClient } from '../api/client';

const mockOrganizationState = vi.hoisted(() => ({ id: 'org-test-101', creditReasonVisible: true, quoteTitle: 'FORMAL ESTIMATE', invoiceTitle: 'TAX INVOICE', invoiceDefault: 'standard' }));

// Mock BooksContext
const mockUpdateSettings = vi.fn();
const mockRefreshOrganizations = vi.fn().mockResolvedValue(undefined);

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    currentOrg: {
      id: mockOrganizationState.id,
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
        'credit-notes': {
          defaultTemplate: 'statutory',
          showReturnReason: mockOrganizationState.creditReasonVisible,
        },
        quotes: {
          defaultTemplate: 'proposal',
          templateTitle: mockOrganizationState.quoteTitle,
          showHsnSac: true,
          showDiscount: true,
        },
        invoices: {
          defaultTemplate: mockOrganizationState.invoiceDefault,
          templateTitle: mockOrganizationState.invoiceTitle,
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
    getBlob: vi.fn(),
  },
}));

describe('Company Branding & PDF Templates Studio Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOrganizationState.id = 'org-test-101';
    mockOrganizationState.creditReasonVisible = true;
    mockOrganizationState.quoteTitle = 'FORMAL ESTIMATE';
    mockOrganizationState.invoiceTitle = 'TAX INVOICE';
    mockOrganizationState.invoiceDefault = 'standard';
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === '/finance/documents/quotes/templates') {
        return Promise.resolve({ status: 200, data: {
          defaultTemplateId: 'saved-proposal', defaultModelId: 'proposal',
          templates: [{ id: 'saved-proposal', modelId: 'proposal', configuration: { templateTitle: mockOrganizationState.quoteTitle } }],
        } });
      }
      if (url === '/finance/documents/credit-notes/templates') {
        return Promise.resolve({ status: 200, data: {
          defaultTemplateId: 'saved-statutory', defaultModelId: 'statutory',
          templates: [{ id: 'saved-statutory', modelId: 'statutory', configuration: { showReturnReason: mockOrganizationState.creditReasonVisible } }],
        } });
      }
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
                  defaultTemplate: 'proposal',
                  templateTitle: mockOrganizationState.quoteTitle,
                },
                invoices: {
                  defaultTemplate: mockOrganizationState.invoiceDefault,
                  templateTitle: mockOrganizationState.invoiceTitle,
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

  it('uses accurate copy for presets with presentation-only differences', () => {
    const preset = (category: keyof typeof CATEGORY_TEMPLATES, id: string) =>
      CATEGORY_TEMPLATES[category].find((template) => template.id === id)!;

    expect(preset('invoices', 'export')).toMatchObject({
      name: 'Alternate Ledger Invoice',
      tagline: 'Ledger Header',
      presetTitle: 'INVOICE',
      description: expect.stringContaining('export-specific fields are not included'),
    });
    expect(preset('bills', 'matching')).toMatchObject({
      name: 'Compact Vendor Bill',
      presetTitle: 'VENDOR BILL',
      description: expect.stringContaining('compact header layout'),
    });
    expect(preset('expenses', 'petty-cash')).toMatchObject({
      name: 'Compact Expense Voucher',
      presetTitle: 'EXPENSE VOUCHER',
      description: expect.stringContaining('compact header layout'),
    });
    expect(preset('vendor-payments', 'cheque-disbursement')).toMatchObject({
      name: 'Compact Vendor Payment',
      presetTitle: 'VENDOR PAYMENT',
      description: expect.stringContaining('compact header layout'),
    });
    expect(preset('delivery-challans', 'jobwork')).toMatchObject({
      name: 'Compact Challan Layout',
      tagline: 'Compact Header',
      presetTitle: 'DELIVERY CHALLAN',
      description: 'Challan details arranged in the compact header layout.',
    });
    expect(preset('vendor-credits', 'debit-note')).toMatchObject({
      name: 'Standard Vendor Credit',
      badgeText: 'Vendor Credit',
      presetTitle: 'VENDOR CREDIT',
    });
    expect(preset('payment-receipts', 'cash-receipt')).toMatchObject({
      name: 'Compact Receipt Layout',
      presetTitle: 'PAYMENT RECEIPT',
    });
    expect(preset('journals', 'audit-voucher')).toMatchObject({
      name: 'Ledger Journal Voucher',
      presetTitle: 'ADJUSTING JOURNAL VOUCHER',
    });
    expect(isLegacyUnsupportedPresetTitle('invoices', 'export', 'COMMERCIAL EXPORT INVOICE')).toBe(true);
    expect(isLegacyUnsupportedPresetTitle('invoices', 'export', 'My customer invoice')).toBe(false);
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

  it('shows the selected customer and vendor statement layout without fabricated aging buckets', async () => {
    const openStatementPreview = async (
      category: 'customer-statements' | 'vendor-statements',
      name: string,
      templateId: string,
    ) => {
      fireEvent.click(screen.getByRole('button', { name: `Preview ${name}` }));
      const preview = await screen.findByRole('dialog', { name: `Full Preview: ${name}` });
      expect(within(preview).getByText('Layout sample only')).toBeDefined();
      await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
        `/finance/documents/${category}/preview/pdf?templateId=${templateId}`,
        'org-test-101',
      ));
      fireEvent.click(within(preview).getByRole('button', { name: 'Close full preview' }));
    };

    const { unmount } = render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getByText('Quote Templates')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Customer Statements/i }));
    await screen.findByText('Receivables Activity Summary');
    expect(screen.getAllByText('Transaction / reference').length).toBeGreaterThan(0);
    expect(screen.queryByText(/1-30 Days|31-60 Days|61-90 Days|90\+ Days/)).toBeNull();
    await openStatementPreview('customer-statements', 'Detailed Transaction Ledger', 'running-ledger');
    await openStatementPreview('customer-statements', 'Receivables Activity Summary', 'aging-statement');
    await openStatementPreview('customer-statements', 'Account Summary', 'open-summary');

    unmount();
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Vendor Statements/i }));
    await screen.findByText('Payables Activity Summary');
    expect(screen.getAllByText('Transaction / reference').length).toBeGreaterThan(0);
    expect(screen.queryByText(/1-30 Days|31-60 Days|61-90 Days|90\+ Days/)).toBeNull();
    await openStatementPreview('vendor-statements', 'Vendor Transaction Ledger', 'vendor-ledger');
    await openStatementPreview('vendor-statements', 'Payables Activity Summary', 'payables-aging');
    await openStatementPreview('vendor-statements', 'Vendor Balance Overview', 'reconciliation');
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

  it('exposes package details and only supported delivery challan PDF fields', async () => {
    render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Delivery Challans/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Delivery Challans/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Customize Standard Delivery Challan' }));
    fireEvent.click(await screen.findByRole('button', { name: /Specialized Fields/i }));

    expect(screen.getByText('Package Details Column')).toBeDefined();
    expect(screen.queryByText(/E-Way Bill.*Barcode/i)).toBeNull();
  });
  it('shows only renderer-backed invoice and expense PDF options in their categories', async () => {
    const { unmount } = render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Invoices/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Invoices/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Customize Standard Tax Invoice' }));
    fireEvent.click(await screen.findByRole('button', { name: /Specialized Fields/i }));

    await waitFor(() => expect(screen.getByText('Paid Stamp')).toBeDefined());
    expect(screen.queryByText(/UPI.*QR/i)).toBeNull();
    unmount();

    render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Expenses/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Expenses/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Customize Standard Expense Voucher' }));
    fireEvent.click(await screen.findByRole('button', { name: /Specialized Fields/i }));

    await waitFor(() => expect(screen.getByText('TDS Deduction (Tax Withholding)')).toBeDefined());
    expect(screen.queryByText(/Reimbursement.*Status/i)).toBeNull();
  });

  it('limits credit-note settings and previews to fields backed by the saved note', async () => {
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Credit Notes/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Customize Standard Credit Note' }));
    fireEvent.click(await screen.findByRole('button', { name: /Specialized Fields/i }));

    expect(screen.getByText('Return / Credit Allowance Reason')).toBeDefined();
    expect(screen.queryByText(/Original Invoice Reference|Reverse CGST|Credit Amount in Words/i)).toBeNull();
    expect(screen.queryByText(/Hydraulic Pressure Gaskets|Returned Qty|Reverse GST|Original Invoice Ref:/i)).toBeNull();
    expect(CATEGORY_TEMPLATES['credit-notes'][0].description).toMatch(/no unsupported item or tax split/i);
  });

  it('shows the formal credit-note composition in its gallery and opens its server PDF', async () => {
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Credit Notes/i }));
    const card = screen.getByRole('button', { name: 'Preview Standard Credit Note' }).closest('article') as HTMLElement;
    expect(within(card).getByText('CREDIT NOTE DETAILS')).toBeDefined();
    expect(within(card).getByText('CREDIT NOTE VALUE')).toBeDefined();
    expect(within(card).getByText('Quality rejection / return')).toBeDefined();
    expect(within(card).queryByText(/Hydraulic Pressure Gaskets|Returned Qty|Reverse GST|Original Invoice Ref:/i)).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Standard Credit Note' }));
    const preview = await screen.findByRole('dialog', { name: 'Full Preview: Standard Credit Note' });
    expect(within(preview).getByText('Layout sample only')).toBeDefined();
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/credit-notes/preview/pdf?templateId=statutory', 'org-test-101',
    ));
  });

  it('opens the server PDF for the distinct sales-return and adjustment credit-note templates', async () => {
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Credit Notes/i }));

    const returnCard = screen.getByRole('button', { name: 'Preview Credit Application Ledger' }).closest('article') as HTMLElement;
    expect(within(returnCard).getByText('APPLIED')).toBeDefined();
    expect(within(returnCard).getByText('REMAINING')).toBeDefined();
    expect(within(returnCard).getByText('INV-1042')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Credit Application Ledger' }));
    const returnPreview = await screen.findByRole('dialog', { name: 'Full Preview: Credit Application Ledger' });
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/credit-notes/preview/pdf?templateId=goods-return', 'org-test-101',
    ));
    fireEvent.click(within(returnPreview).getByRole('button', { name: 'Close full preview' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Preview Compact Credit Note' }));
    const adjustmentCard = screen.getByRole('button', { name: 'Preview Compact Credit Note' }).closest('article') as HTMLElement;
    expect(within(adjustmentCard).getByText('CREDIT ADJUSTMENT SLIP')).toBeDefined();
    expect(within(adjustmentCard).getByText('ADJUSTMENT REASON')).toBeDefined();
    const adjustmentPreview = await screen.findByRole('dialog', { name: 'Full Preview: Compact Credit Note' });
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/credit-notes/preview/pdf?templateId=adjustment', 'org-test-101',
    ));
    expect(within(adjustmentPreview).getByText('Layout sample only')).toBeDefined();
  });

  it('keeps gallery and full-size credit-note previews in sync with hidden-reason settings', async () => {
    mockOrganizationState.creditReasonVisible = false;
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Credit Notes/i }));

    await waitFor(() => expect(screen.queryAllByText('Quality rejection / return')).toHaveLength(0));
    fireEvent.click(await screen.findByRole('button', { name: 'Preview Standard Credit Note' }));
    const preview = await screen.findByRole('dialog', { name: 'Full Preview: Standard Credit Note' });
    expect(within(preview).getByText('Layout sample only')).toBeDefined();
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/credit-notes/preview/pdf?templateId=statutory', 'org-test-101',
    ));
  });

  it('does not show expense TDS settings under vendor payments', async () => {
    render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Vendor Payments/i })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Vendor Payments/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Customize Standard Vendor Payment Advice' }));
    fireEvent.click(await screen.findByRole('button', { name: /Specialized Fields/i }));

    expect(screen.queryByText(/TDS Deduction/i)).toBeNull();
  });
  it('6. Renders template gallery with visual preview and DEFAULT badge', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getByText('Quote Templates')).toBeDefined();
    });

    expect(screen.getAllByText('Ledger Quote').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Standard Quote').length).toBeGreaterThan(0);
    expect(screen.getByText('Proposal / Bid')).toBeDefined();
    expect(screen.getByText('Compact Quote')).toBeDefined();
    expect(screen.queryByText('New Template')).toBeNull();
    expect(screen.queryByText('Add Template')).toBeNull();

    const defaultTemplateControl = screen.getByRole('button', { name: 'Default template: Standard Quote' });
    expect(defaultTemplateControl.getAttribute('aria-pressed')).toBe('true');
    expect(defaultTemplateControl).toHaveProperty('disabled', true);
  });

  it('6a. Template cards expose preview, customize, and default controls without hover and do not fake template creation', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Standard Quote' })).toBeDefined());

    expect(screen.getByRole('button', { name: 'Customize Standard Quote' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Set Compact Quote as default' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Default template: Standard Quote' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /new template|add template/i })).toBeNull();
    expect(screen.getByRole('region', { name: 'Template gallery controls' })).toBeDefined();
    expect(screen.getByRole('combobox', { name: 'Filter Quotes templates' })).toBeDefined();
  });

  it('shows each saved template title and colors in its own gallery sheet', async () => {
    const existingGet = (apiClient.get as any).getMockImplementation();
    (apiClient.get as any).mockImplementation((url: string, organizationId?: string) => {
      if (url === '/finance/documents/quotes/templates') return Promise.resolve({ status: 200, data: { templates: [
        { id: 'saved-proposal', modelId: 'proposal', configuration: { templateTitle: 'BRIGHT PROPOSAL', primaryColor: '#f8fafc', accentColor: '#ef4444' } },
        { id: 'saved-commercial', modelId: 'commercial', configuration: { templateTitle: 'DARK LEDGER', primaryColor: '#0f172a', accentColor: '#22c55e' } },
      ] } });
      return existingGet(url, organizationId);
    });

    render(<PdfTemplatesSettings />);
    const proposal = (await screen.findByRole('button', { name: 'Preview Standard Quote' })).closest('article') as HTMLElement;
    const ledger = screen.getByRole('button', { name: 'Preview Ledger Quote' }).closest('article') as HTMLElement;
    await waitFor(() => expect(within(proposal).getByText('BRIGHT PROPOSAL')).toBeDefined());
    expect(within(ledger).getByText('DARK LEDGER')).toBeDefined();
    expect(within(proposal).getByText('BRIGHT PROPOSAL').closest('[style*="border-color"]')?.getAttribute('style')).toContain('border-color: rgb(248, 250, 252)');
    expect(within(ledger).getByText('DARK LEDGER').closest('[style*="border-color"]')?.getAttribute('style')).toContain('border-color: rgb(15, 23, 42)');
  });

  it('6b. Full preview opens the server-generated sample PDF for the selected template', async () => {
    render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Standard Quote' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Preview Standard Quote' }));
    await waitFor(() => expect(screen.getByText('Layout sample only')).toBeDefined());

    (apiClient.getBlob as any).mockResolvedValueOnce({ data: null, error: 'Preview request reached server', status: 200 });
    fireEvent.click(screen.getByRole('button', { name: 'Open sample PDF' }));

    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/quotes/preview/pdf?templateId=proposal',
      'org-test-101',
    ));
    await waitFor(() => expect(screen.getByText('Preview request reached server')).toBeDefined());
  });

  it('marks the visual fallback as illustrative and preserves custom saved titles without a legacy warning', async () => {
    mockOrganizationState.quoteTitle = 'My customer copy';
    render(<PdfTemplatesSettings />);
    const quoteCard = (await screen.findByRole('button', { name: 'Preview Standard Quote' })).closest('article') as HTMLElement;

    expect(within(quoteCard).getByText('Illustrative layout · sample content')).toBeDefined();
    expect(within(quoteCard).getByText('Saved title: My customer copy')).toBeDefined();
    expect(within(quoteCard).queryByLabelText('Review legacy title')).toBeNull();
  });

  it('flags a known misleading built-in saved title while keeping that title visible', async () => {
    const existingGet = (apiClient.get as any).getMockImplementation();
    (apiClient.get as any).mockImplementation((url: string, organizationId?: string) => {
      if (url === '/finance/documents/invoices/templates') return Promise.resolve({ status: 200, data: {
        defaultModelId: 'export', templates: [{ id: 'saved-export', modelId: 'export', configuration: { templateTitle: 'COMMERCIAL EXPORT INVOICE' } }],
      } });
      return existingGet(url, organizationId);
    });
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Invoices/i }));
    const invoiceCard = (await screen.findByRole('button', { name: 'Preview Alternate Ledger Invoice' })).closest('article') as HTMLElement;

    expect(within(invoiceCard).getByText('Saved title: COMMERCIAL EXPORT INVOICE')).toBeDefined();
    expect(within(invoiceCard).getByLabelText('Review legacy title')).toBeDefined();
  });

  it('labels notes and terms controls accurately across quote, sales order, and purchase order settings', async () => {
    const cases = [
      ['Quotes', 'Standard Quote'],
      ['Sales Orders', 'Standard Sales Order'],
      ['Purchase Orders', 'Standard Purchase Order'],
    ];

    for (const [category, template] of cases) {
      render(<PdfTemplatesSettings />);
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(category, 'i') }));
      fireEvent.click(await screen.findByRole('button', { name: `Customize ${template}` }));
      fireEvent.click(await screen.findByRole('button', { name: /Specialized Fields/i }));
      expect(screen.getByText('Show Notes and Terms')).toBeDefined();
      cleanup();
    }
  });

  it('shows project recovery fields in the billable expense card and opens both server PDFs', async () => {
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Expenses/i }));

    const recoveryCard = screen.getByRole('button', { name: 'Preview Project Recovery Voucher' }).closest('article');
    const reimbursementCard = screen.getByRole('button', { name: 'Preview Standard Expense Voucher' }).closest('article');
    expect(recoveryCard).not.toBeNull();
    expect(reimbursementCard).not.toBeNull();
    expect(within(recoveryCard as HTMLElement).getByText('Project Recovery')).toBeDefined();
    expect(within(recoveryCard as HTMLElement).getByText('Year-End Controls Modernization')).toBeDefined();
    expect(within(recoveryCard as HTMLElement).getByText('Not yet invoiced')).toBeDefined();
    expect(within(recoveryCard as HTMLElement).getByText('₹24,500.00')).toBeDefined();
    expect(within(recoveryCard as HTMLElement).getByText('₹29,400.00')).toBeDefined();
    expect(within(recoveryCard as HTMLElement).getByText('20%')).toBeDefined();
    expect(within(reimbursementCard as HTMLElement).queryByText('Project Recovery')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Preview Project Recovery Voucher' }));
    const preview = await screen.findByRole('dialog', { name: 'Full Preview: Project Recovery Voucher' });
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/expenses/preview/pdf?templateId=project-billable', 'org-test-101',
    ));
    fireEvent.click(within(preview).getByRole('button', { name: 'Close full preview' }));

    fireEvent.click(screen.getByRole('button', { name: 'Preview Standard Expense Voucher' }));
    const standardPreview = await screen.findByRole('dialog', { name: 'Full Preview: Standard Expense Voucher' });
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/expenses/preview/pdf?templateId=reimbursement', 'org-test-101',
    ));
  });
  it('shows an amount-forward receipt preview only for the compact receipt variant', async () => {
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Payment Receipts/i }));

    const compactCard = screen.getByRole('button', { name: 'Preview Compact Receipt Layout' }).closest('article');
    const standardCard = screen.getByRole('button', { name: 'Preview Standard Receipt Voucher' }).closest('article');
    expect(compactCard).not.toBeNull();
    expect(standardCard).not.toBeNull();
    expect(within(compactCard as HTMLElement).getByText('AMOUNT RECEIVED')).toBeDefined();
    expect(within(compactCard as HTMLElement).getByText('INV-2026-1042')).toBeDefined();
    expect(within(compactCard as HTMLElement).getByText('₹1,25,000.00')).toBeDefined();
    expect(within(compactCard as HTMLElement).getAllByText('Nexus Global Software Solutions Ltd').length).toBeGreaterThan(0);
    expect(within(standardCard as HTMLElement).queryByText('AMOUNT RECEIVED')).toBeNull();
    expect(within(standardCard as HTMLElement).getByText('# REC-SAMPLE-0544')).toBeDefined();
    expect(within(standardCard as HTMLElement).getByText('NEFT / RTGS Wire Transfer')).toBeDefined();
    expect(within(standardCard as HTMLElement).getByText('UTR: CMS904481023812')).toBeDefined();
    expect(within(standardCard as HTMLElement).getByText(/Rupees One Lakh Twenty Five Thousand Only/)).toBeDefined();
    expect(within(standardCard as HTMLElement).getByText('Settling: INV-2026-1042 & INV-2026-1049')).toBeDefined();
    expect(within(compactCard as HTMLElement).getByText('Payment Mode: NEFT / RTGS Wire Transfer')).toBeDefined();
    expect(within(compactCard as HTMLElement).getByText('UTR Reference: CMS904481023812')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Preview Compact Receipt Layout' }));
    const compactPreview = await screen.findByRole('dialog', { name: 'Full Preview: Compact Receipt Layout' });
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/payment-receipts/preview/pdf?templateId=cash-receipt', 'org-test-101',
    ));
    fireEvent.click(within(compactPreview).getByRole('button', { name: 'Close full preview' }));

    fireEvent.click(screen.getByRole('button', { name: 'Preview Standard Receipt Voucher' }));
    const standardPreview = await screen.findByRole('dialog', { name: 'Full Preview: Standard Receipt Voucher' });
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith(
      '/finance/documents/payment-receipts/preview/pdf?templateId=receipt-voucher', 'org-test-101',
    ));
  });

  it('7. Clicking "Set as Default" updates template in real-time and calls PATCH', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getAllByText('Standard Quote').length).toBeGreaterThan(0);
    });

    // Find and click Set as Default button on the first non-default template
    const setDefaultBtn = screen.getByRole('button', { name: /Set Compact Quote as default/i });
    fireEvent.click(setDefaultBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/finance/documents/quotes/templates/compact/default',
        undefined,
        'org-test-101',
      );
      expect(apiClient.get).toHaveBeenCalledWith('/finance/documents/quotes/templates', 'org-test-101');
    });
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('8. Opening "Configure PDF Options" allows customizing Document Title and saves in real-time', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Customize Ledger Quote' })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Customize Ledger Quote' }));

    // Options modal should open
    await waitFor(() => {
      expect(screen.getByText(/PDF Options: Quote/i)).toBeDefined();
    });

    // Change Document Title to PROFORMA INVOICE
    const titleInput = screen.getByLabelText('Document Title');
    fireEvent.change(titleInput, { target: { value: 'PROFORMA INVOICE' } });

    // Save options
    (apiClient.patch as any).mockResolvedValueOnce({
      status: 200,
      data: { category: 'quotes', template: { id: 'commercial', configuration: { templateTitle: 'PROFORMA INVOICE' } } },
    });
    const saveBtn = screen.getByRole('button', { name: /Save & Apply in Real Time/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/finance/documents/quotes/templates/commercial/configuration',
        { configuration: expect.objectContaining({ templateTitle: 'PROFORMA INVOICE' }) },
        'org-test-101',
      );
      expect(mockUpdateSettings.mock.calls.some(([update]) => update.documentTemplates?.quotes?.templateTitle === 'PROFORMA INVOICE')).toBe(false);
      expect(mockRefreshOrganizations).not.toHaveBeenCalled();
    });
  });

  it('saves Zoho-style page, font, and color choices for the selected PDF template', async () => {
    render(<PdfTemplatesSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Customize Standard Quote' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'PDF paper size' }), { target: { value: 'Letter' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'PDF orientation' }), { target: { value: 'landscape' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'PDF font' }), { target: { value: 'Times-Roman' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teal PDF color theme' }));
    expect(screen.getByRole('button', { name: 'Teal PDF color theme' }).getAttribute('aria-pressed')).toBe('true');

    (apiClient.patch as any).mockResolvedValueOnce({
      status: 200,
      data: { template: { id: 'proposal', configuration: { paperSize: 'Letter', orientation: 'landscape', fontFamily: 'Times-Roman', primaryColor: '#0f766e', accentColor: '#134e4a' } } },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & Apply in Real Time/i }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith(
      '/finance/documents/quotes/templates/proposal/configuration',
      { configuration: expect.objectContaining({ paperSize: 'Letter', orientation: 'landscape', fontFamily: 'Times-Roman', primaryColor: '#0f766e', accentColor: '#134e4a' }) },
      'org-test-101',
    ));
  });

  it('keeps a nondefault template edit isolated from the default gallery and editor', async () => {
    const existingGet = (apiClient.get as any).getMockImplementation();
    (apiClient.get as any).mockImplementation((url: string, organizationId?: string) => {
      if (url === '/finance/documents/quotes/templates') return Promise.resolve({ status: 200, data: { templates: [
        { id: 'saved-proposal', modelId: 'proposal', configuration: { templateTitle: 'DEFAULT PROPOSAL', primaryColor: '#1e40af', showDiscount: true } },
        { id: 'saved-commercial', modelId: 'commercial', configuration: { templateTitle: 'LEDGER BEFORE', primaryColor: '#0f172a', showDiscount: false } },
      ] } });
      return existingGet(url, organizationId);
    });
    render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getByText('LEDGER BEFORE')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Customize Ledger Quote' }));
    fireEvent.change(screen.getByLabelText('Document Title'), { target: { value: 'LEDGER AFTER' } });
    (apiClient.patch as any).mockResolvedValueOnce({ status: 200, data: { template: { id: 'saved-commercial', modelId: 'commercial', configuration: { templateTitle: 'LEDGER AFTER', primaryColor: '#0f172a', showDiscount: false } } } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Apply in Real Time/i }));
    await waitFor(() => expect(screen.getByText('LEDGER AFTER')).toBeDefined());
    expect(screen.getByText('DEFAULT PROPOSAL')).toBeDefined();
    expect(mockUpdateSettings.mock.calls.some(([update]) => update.documentTemplates?.quotes?.templateTitle === 'LEDGER AFTER')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Customize Standard Quote' }));
    expect((screen.getByLabelText('Document Title') as HTMLInputElement).value).toBe('DEFAULT PROPOSAL');
    expect((screen.getByLabelText('Primary PDF color') as HTMLInputElement).value).toBe('#1e40af');
  });

  it('requests server PDF thumbnails only for the visible category', async () => {
    (apiClient.getBlob as any).mockResolvedValue({ data: new Blob(['%PDF-sample']), error: null });
    render(<PdfTemplatesSettings />);

    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith('/finance/documents/quotes/preview/pdf?templateId=proposal', 'org-test-101'));
    expect(apiClient.getBlob.mock.calls.every(([url]: [string]) => url.includes('/quotes/'))).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: /Invoices/i }));
    await waitFor(() => expect(apiClient.getBlob).toHaveBeenCalledWith('/finance/documents/invoices/preview/pdf?templateId=tax-invoice', 'org-test-101'));
    expect(screen.queryByRole('img', { name: 'Standard Quote rendered PDF page' })).toBeNull();
  });

  it('falls back to the category sheet when the server thumbnail request fails', async () => {
    (apiClient.getBlob as any).mockRejectedValue(new Error('sample generation failed'));
    render(<PdfTemplatesSettings />);
    await waitFor(() => expect(screen.getAllByText('PDF unavailable').length).toBeGreaterThan(0));
    expect(screen.getByText('FORMAL ESTIMATE')).toBeDefined();
  });

  it('hydrates default selection and editor configuration from the assigned template, not the stale profile default', async () => {
    (apiClient.get as any).mockImplementation((url: string) => {
      if (url === '/organizations/current') {
        return Promise.resolve({ status: 200, data: { profile: { documentTemplates: {
          quotes: { defaultTemplate: 'proposal', templateTitle: 'STALE PROFILE TITLE' },
        } } } });
      }
      if (url === '/finance/documents/quotes/templates') {
        return Promise.resolve({ status: 200, data: { defaultTemplateId: 'registry-template-1', defaultModelId: 'commercial', templates: [
          { id: 'registry-template-1', modelId: 'commercial', configuration: { templateTitle: 'SAVED VERSION TITLE' } },
          { id: 'registry-template-2', modelId: 'proposal', configuration: { templateTitle: 'OTHER VERSION TITLE' } },
        ] } });
      }
      return Promise.resolve({ status: 200, data: {} });
    });

    render(<PdfTemplatesSettings />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/finance/documents/quotes/templates', 'org-test-101'));
    expect(screen.getByRole('button', { name: /Quotes/i }).textContent).toContain('Ledger');
    fireEvent.click(screen.getByRole('button', { name: 'Customize Ledger Quote' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Document Title') as HTMLInputElement).value).toBe('SAVED VERSION TITLE');
    });
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('8c. Discards late template responses and keeps a draft scoped to its organization', async () => {
    const organizationA = 'org-test-101';
    const organizationB = 'org-test-202';
    let resolveOrganizationATemplates!: (value: any) => void;
    const organizationATemplates = new Promise<any>((resolve) => { resolveOrganizationATemplates = resolve; });
    (apiClient.get as any).mockImplementation((url: string, organizationId?: string) => {
      if (url === '/finance/documents/quotes/templates' && organizationId === organizationA) return organizationATemplates;
      if (url === '/finance/documents/quotes/templates' && organizationId === organizationB) {
        return Promise.resolve({ status: 200, data: { templates: [
          { id: 'registry-b', modelId: 'commercial', configuration: { templateTitle: 'ORG B VERSION TITLE' } },
        ] } });
      }
      if (url === '/organizations/current' && organizationId === organizationB) {
        return Promise.resolve({ status: 200, data: { profile: { documentTemplates: { quotes: { defaultTemplate: 'proposal' } } } } });
      }
      return Promise.resolve({ status: 200, data: {} });
    });
    const view = render(<PdfTemplatesSettings />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/finance/documents/quotes/templates', organizationA));

    mockOrganizationState.id = organizationB;
    view.rerender(<PdfTemplatesSettings />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/finance/documents/quotes/templates', organizationB));
    resolveOrganizationATemplates({ status: 200, data: { templates: [
      { id: 'registry-a', modelId: 'commercial', configuration: { templateTitle: 'ORG A PRIVATE DRAFT' } },
    ] } });

    fireEvent.click(screen.getByRole('button', { name: 'Customize Ledger Quote' }));
    await waitFor(() => expect((screen.getByLabelText('Document Title') as HTMLInputElement).value).toBe('ORG B VERSION TITLE'));
    expect(screen.queryByDisplayValue('ORG A PRIVATE DRAFT')).toBeNull();

    (apiClient.patch as any).mockResolvedValueOnce({
      status: 200,
      data: { category: 'quotes', template: { id: 'registry-b', configuration: { templateTitle: 'ORG B UPDATED TITLE' } } },
    });
    fireEvent.change(screen.getByLabelText('Document Title'), { target: { value: 'ORG B UPDATED TITLE' } });
    fireEvent.click(screen.getByRole('button', { name: /Save & Apply in Real Time/i }));
    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledWith(
      '/finance/documents/quotes/templates/commercial/configuration',
      { configuration: expect.objectContaining({ templateTitle: 'ORG B UPDATED TITLE' }) },
      organizationB,
    ));
  });
  it('8a. Failed template configuration save does not persist optimistically', async () => {
    render(<PdfTemplatesSettings />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Customize Ledger Quote' })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Customize Ledger Quote' }));
    await waitFor(() => expect(screen.getByText(/PDF Options: Quote/i)).toBeDefined());

    (apiClient.patch as any).mockResolvedValueOnce({ error: 'Configuration save failed' });
    mockUpdateSettings.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Save & Apply in Real Time/i }));

    await waitFor(() => expect(screen.getByText('Configuration save failed')).toBeDefined());
    expect(mockUpdateSettings).not.toHaveBeenCalled();
    expect(screen.getByText(/PDF Options: Quote/i)).toBeDefined();
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
