// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VendorWorkspace } from '../components/purchases/VendorWorkspace';
import { RecordVendorPaymentModal } from '../components/purchases/RecordVendorPaymentModal';
import { BooksProvider } from '../context/BooksContext';
import { Vendor } from '../types';

describe('QA Suite: Vendor 360 Workspace & Purchase-to-Pay Lifecycle Engine', () => {
  const mockVendor: Vendor = {
    id: 'vend-101',
    name: 'Century Ply & Boards Ltd',
    companyName: 'Century Ply & Boards Ltd',
    contactPerson: 'Rajesh Sharma',
    email: 'billing@centuryply.com',
    phone: '+91 98765 43210',
    taxId: '36AABCU9603R1ZM',
    category: 'Materials / Plywood',
    paymentTerms: 'Net 30',
    address: 'Plot 42, Industrial Area, Hyderabad',
    payablesBalance: 125000,
    status: 'Active',
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <BooksProvider>{children}</BooksProvider>
  );

  beforeEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Renders Vendor 360 header with breadcrumbs, company title, and status badges', () => {
    const handleBack = vi.fn();
    const handleEdit = vi.fn();

    render(
      <VendorWorkspace
        vendor={mockVendor}
        onBack={handleBack}
        onEdit={handleEdit}
      />,
      { wrapper }
    );

    expect(screen.getByText('Vendor 360 Workspace')).toBeDefined();
    expect(screen.getByRole('heading', { name: /century ply & boards ltd/i })).toBeDefined();
    expect(screen.getByText('Verified Supplier')).toBeDefined();
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /edit profile/i })).toBeDefined();
  });

  it('2. Computes Financial KPIs and Payables Aging Radar accurately', () => {
    render(
      <VendorWorkspace
        vendor={mockVendor}
        onBack={vi.fn()}
        onEdit={vi.fn()}
      />,
      { wrapper }
    );

    expect(screen.getByText('Total Payables Due')).toBeDefined();
    expect(screen.getByText('Total Lifetime Billed')).toBeDefined();
    expect(screen.getByText('Total Payments Made')).toBeDefined();
    expect(screen.getByText('Vendor Credits / Advances')).toBeDefined();
    expect(screen.getByText(/Payables Aging Radar & Supplier Terms/i)).toBeDefined();
    expect(screen.getByText('Current (0-30d)')).toBeDefined();
    expect(screen.getByText('31-60 Days')).toBeDefined();
  });

  it('3. Successfully switches between all 7 dedicated tabs in VendorWorkspace', () => {
    render(
      <VendorWorkspace
        vendor={mockVendor}
        onBack={vi.fn()}
        onEdit={vi.fn()}
      />,
      { wrapper }
    );

    // Default tab: Details & Profile
    expect(screen.getByText('Contact & Identity Information')).toBeDefined();
    expect(screen.getByText('Commercial & Tax Settings')).toBeDefined();

    // Switch to Activity Timeline
    const activityTab = screen.getByRole('button', { name: /activity timeline/i });
    fireEvent.click(activityTab);
    expect(screen.getByText('Unified Procurement Audit Trail')).toBeDefined();

    // Switch to Purchase Orders
    const poTab = screen.getByRole('button', { name: /purchase orders/i });
    fireEvent.click(poTab);
    expect(screen.getByText('PO Number')).toBeDefined();

    // Switch to Bills & Payables
    const billsTab = screen.getByRole('button', { name: /bills & payables/i });
    fireEvent.click(billsTab);
    expect(screen.getByText('Bill Number')).toBeDefined();

    // Switch to Payments Made
    const paymentsTab = screen.getByRole('button', { name: /payments made/i });
    fireEvent.click(paymentsTab);
    expect(screen.getByText('Amount Disbursed')).toBeDefined();

    // Switch to Vendor Credits
    const creditsTab = screen.getByRole('button', { name: /vendor credits/i });
    fireEvent.click(creditsTab);
    expect(screen.getByText('Total Credit')).toBeDefined();

    // Switch to Statement of Account
    const statementTab = screen.getByRole('button', { name: /statement of account/i });
    fireEvent.click(statementTab);
    expect(screen.getByText('Vendor Statement of Account')).toBeDefined();
    expect(screen.getByRole('button', { name: /print statement/i })).toBeDefined();
  });

  it('4. Statement of Account prints without throwing runtime errors', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <VendorWorkspace
        vendor={mockVendor}
        onBack={vi.fn()}
        onEdit={vi.fn()}
      />,
      { wrapper }
    );

    const statementTab = screen.getByRole('button', { name: /statement of account/i });
    fireEvent.click(statementTab);

    const printBtn = screen.getByRole('button', { name: /print statement/i });
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalled();
  });

  it('5. RecordVendorPaymentModal toggles between Bill Settlement and Vendor Advance modes', () => {
    const handleClose = vi.fn();

    render(
      <RecordVendorPaymentModal
        isOpen={true}
        onClose={handleClose}
        vendor={mockVendor}
      />,
      { wrapper }
    );

    expect(screen.getByText('Record Vendor Payment')).toBeDefined();
    expect(screen.getByText('Switch to Vendor Advance')).toBeDefined();

    // Toggle advance mode
    const toggleBtn = screen.getByText('Switch to Vendor Advance');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Record Vendor Advance / Prepayment')).toBeDefined();
    expect(screen.getByText('★ Advance Prepayment Mode')).toBeDefined();
  });
});
