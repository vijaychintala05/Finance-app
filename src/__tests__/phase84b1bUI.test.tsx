// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuickAddClientModal } from '../components/common/QuickAddClientModal';
import { QuickAddProjectModal } from '../components/common/QuickAddProjectModal';
import { QuotationHeaderForm } from '../components/quotations/QuotationHeaderForm';
import { customerApi } from '../services/customerApi';

vi.mock('../services/customerApi', () => ({
  customerApi: {
    createCustomer: vi.fn(),
    createProject: vi.fn(),
    listCustomers: vi.fn(),
    listProjects: vi.fn(),
  },
}));

describe('Phase 8.4B.1B — Real Frontend Master Data, Quick Add & Debounce UI Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // 11. QuickAddClientModal operates without BooksProvider
  it('11. QuickAddClientModal functions cleanly without BooksProvider dependency', async () => {
    const handleCreated = vi.fn();
    (customerApi.createCustomer as any).mockResolvedValue({
      id: 'cust-new-123',
      name: 'Acme Corp',
      displayName: 'Acme Corp',
    });

    render(
      <QuickAddClientModal
        isOpen={true}
        onClose={vi.fn()}
        onClientCreated={handleCreated}
      />
    );

    const input = screen.getByLabelText(/Customer \/ Contact Name \*/i);
    fireEvent.change(input, { target: { value: 'Acme Corp' } });

    const submitBtn = screen.getByRole('button', { name: /Save Customer/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(customerApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Acme Corp',
          displayName: 'Acme Corp',
        })
      );
      expect(handleCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'cust-new-123' })
      );
    });
  });

  // 13. QuickAddProjectModal calls backend API directly without BooksContext
  it('13. QuickAddProjectModal calls customerApi.createProject directly without BooksContext', async () => {
    const handleProjectCreated = vi.fn();
    (customerApi.createProject as any).mockResolvedValue({
      id: 'prj-persisted-999',
      code: 'PRJ-84B',
      name: 'New ERP Rollout',
    });

    render(
      <QuickAddProjectModal
        isOpen={true}
        onClose={vi.fn()}
        onProjectCreated={handleProjectCreated}
        clients={[{ id: 'cust-1', displayName: 'Customer One' }]}
      />
    );

    const nameInput = screen.getByPlaceholderText(/Website Redesign/i);
    fireEvent.change(nameInput, { target: { value: 'New ERP Rollout' } });

    const submitBtn = screen.getByRole('button', { name: /Save & Select Project/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(customerApi.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New ERP Rollout',
        })
      );
      expect(handleProjectCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'prj-persisted-999' })
      );
    });
  });

  // 15. Customer loading state renders loading indicator
  it('15. Customer loading state renders loading indicator UI', () => {
    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={vi.fn()}
        setCustomerName={vi.fn()}
        clients={[]}
        onOpenQuickClient={vi.fn()}
        projectId=""
        setProjectId={vi.fn()}
        projects={[]}
        onOpenQuickProject={vi.fn()}
        issueDate="2026-08-11"
        setIssueDate={vi.fn()}
        expiryDate="2026-09-10"
        setExpiryDate={vi.fn()}
        isGstInclusive={false}
        setIsGstInclusive={vi.fn()}
        customersLoading={true}
      />
    );

    expect(screen.getByText(/Loading customers.../i)).toBeDefined();
  });

  // 16. Customer API failure renders customer-specific error UI
  it('16. Customer API failure renders customer error message UI', () => {
    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={vi.fn()}
        setCustomerName={vi.fn()}
        clients={[]}
        onOpenQuickClient={vi.fn()}
        projectId=""
        setProjectId={vi.fn()}
        projects={[]}
        onOpenQuickProject={vi.fn()}
        issueDate="2026-08-11"
        setIssueDate={vi.fn()}
        expiryDate="2026-09-10"
        setExpiryDate={vi.fn()}
        isGstInclusive={false}
        setIsGstInclusive={vi.fn()}
        customerError="Network connection lost"
      />
    );

    expect(screen.getByText(/Unable to load customers. Network connection lost/i)).toBeDefined();
  });

  // 17. Customer search filtering operates correctly
  it('17. Customer search input filters customer list correctly', () => {
    const clientsMock = [
      { id: 'c1', displayName: 'Alpha Logistics', customerCode: 'CUST-001' },
      { id: 'c2', displayName: 'Beta Software', customerCode: 'CUST-002' },
    ];

    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={vi.fn()}
        setCustomerName={vi.fn()}
        clients={clientsMock}
        onOpenQuickClient={vi.fn()}
        projectId=""
        setProjectId={vi.fn()}
        projects={[]}
        onOpenQuickProject={vi.fn()}
        issueDate="2026-08-11"
        setIssueDate={vi.fn()}
        expiryDate="2026-09-10"
        setExpiryDate={vi.fn()}
        isGstInclusive={false}
        setIsGstInclusive={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search by customer name, code/i);
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    expect(screen.getByText(/Alpha Logistics/i)).toBeDefined();
    expect(screen.queryByText(/Beta Software/i)).toBeNull();
  });

  // 18. Empty customer state offers Quick Add Customer
  it('18. Empty customer list renders Quick Add Customer offer button', () => {
    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={vi.fn()}
        setCustomerName={vi.fn()}
        clients={[]}
        onOpenQuickClient={vi.fn()}
        projectId=""
        setProjectId={vi.fn()}
        projects={[]}
        onOpenQuickProject={vi.fn()}
        issueDate="2026-08-11"
        setIssueDate={vi.fn()}
        expiryDate="2026-09-10"
        setExpiryDate={vi.fn()}
        isGstInclusive={false}
        setIsGstInclusive={vi.fn()}
      />
    );

    expect(screen.getByText(/No customers found/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /\+ Quick Add Customer/i })).toBeDefined();
  });
});
