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
    expect(screen.queryByText('Verified Supplier')).toBeNull();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /record payment/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /edit profile/i })).toBeDefined();
  });

  it('2. Does not display financial dashboard or aging radar cards in details page', () => {
    render(
      <VendorWorkspace
        vendor={mockVendor}
        onBack={vi.fn()}
        onEdit={vi.fn()}
      />,
      { wrapper }
    );

    // Dashboard widgets should not exist on vendor details page
    expect(screen.queryByText('Total Payables Due')).toBeNull();
    expect(screen.queryByText('Total Lifetime Billed')).toBeNull();
    expect(screen.queryByText('Total Payments Made')).toBeNull();
    expect(screen.queryByText('Vendor Credits / Advances')).toBeNull();
    expect(screen.queryByText(/Payables Aging Radar & Supplier Terms/i)).toBeNull();
    expect(screen.queryByText('Current (0-30d)')).toBeNull();
    expect(screen.queryByText('31-60 Days')).toBeNull();

    // Directly focuses on details & profile information
    expect(screen.getByText('Contact & Identity Information')).toBeDefined();
    expect(screen.getByText('Commercial & Tax Settings')).toBeDefined();
  });

  it('3. Successfully switches between the four tabs and 7 transaction sub-views in VendorWorkspace', () => {
    render(
      <VendorWorkspace
        vendor={mockVendor}
        onBack={vi.fn()}
        onEdit={vi.fn()}
      />,
      { wrapper }
    );

    // 1. Default tab: Overview
    expect(screen.getByText('Contact & Identity Information')).toBeDefined();
    expect(screen.getByText('Commercial & Tax Settings')).toBeDefined();
    expect(screen.getByText('Unified Procurement Audit Trail')).toBeDefined();

    // 2. Switch to Comments
    const commentsTab = screen.getByRole('button', { name: /^comments$/i });
    fireEvent.click(commentsTab);
    expect(screen.getByText('Vendor comments')).toBeDefined();

    // 3. Switch to Transactions tab and verify all 7 sub-views
    const transactionsTab = screen.getByRole('button', { name: /^transactions$/i });
    fireEvent.click(transactionsTab);

    // Sub-view 1: Bills
    const billsSub = screen.getByRole('button', { name: /^bills/i });
    fireEvent.click(billsSub);
    expect(screen.getByText('Bill Number')).toBeDefined();

    // Sub-view 2: Bill Payments
    const paymentsSub = screen.getByRole('button', { name: /^bill payments/i });
    fireEvent.click(paymentsSub);
    expect(screen.getByText('Amount Disbursed')).toBeDefined();

    // Sub-view 3: Expenses
    const expensesSub = screen.getByRole('button', { name: /^expenses/i });
    fireEvent.click(expensesSub);
    expect(screen.getByText('Category Account')).toBeDefined();

    // Sub-view 4: Recurring Bills
    const recurringSub = screen.getByRole('button', { name: /^recurring bills/i });
    fireEvent.click(recurringSub);
    expect(screen.getByText('Recurring Amount')).toBeDefined();

    // Sub-view 5: Purchase Orders
    const poSub = screen.getByRole('button', { name: /^purchase orders/i });
    fireEvent.click(poSub);
    expect(screen.getByText('PO Number')).toBeDefined();

    // Sub-view 6: Vendor Credits
    const creditsSub = screen.getByRole('button', { name: /^vendor credits/i });
    fireEvent.click(creditsSub);
    expect(screen.getByText('Total Credit')).toBeDefined();

    // Sub-view 7: Journals
    const journalsSub = screen.getByRole('button', { name: /^journals/i });
    fireEvent.click(journalsSub);
    expect(screen.getByText('Accounts Involved')).toBeDefined();

    // 4. Switch to Mails and Statements
    const statementTab = screen.getByRole('button', { name: /statement of account/i });
    fireEvent.click(statementTab);
    expect(screen.getByText('Vendor Statement of Account')).toBeDefined();
    expect(screen.getByRole('button', { name: /print statement/i })).toBeDefined();

    // Verify Mails sub-view in Mails and Statements
    const mailsBtn = screen.getByRole('button', { name: /mails & communication/i });
    fireEvent.click(mailsBtn);
    expect(screen.getByText('Send Mail to Vendor')).toBeDefined();
    expect(screen.getByText('Sent Mails & Communication History')).toBeDefined();
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
