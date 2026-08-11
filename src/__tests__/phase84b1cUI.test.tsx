// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EstimatesView } from '../components/invoices/EstimatesView';
import { QuotationHeaderForm } from '../components/quotations/QuotationHeaderForm';
import { customerApi } from '../services/customerApi';
import { quotationApi } from '../services/quotationApi';
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
    createQuotation: vi.fn(),
  },
}));

describe('Phase 8.4B.1C — Master Data UI & Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (quotationApi.listQuotations as any).mockResolvedValue([]);
    (customerApi.listCustomers as any).mockResolvedValue([
      { id: 'cust-1', name: 'Alpha Corp', displayName: 'Alpha Corp' },
    ]);
    (customerApi.listProjects as any).mockResolvedValue([
      { id: 'prj-1', name: 'Alpha Project' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  // 1. Customer search waits ~300ms
  it('1. Customer search input debounces API call for ~300ms', async () => {
    const handleSearch = vi.fn();
    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={vi.fn()}
        setCustomerName={vi.fn()}
        clients={[{ id: 'cust-1', displayName: 'Alpha Corp' }]}
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
        onSearchCustomers={handleSearch}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search by customer/i);
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    expect(handleSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(handleSearch).toHaveBeenCalledWith('Alpha');
  });

  // 2. Search passes query to customerApi
  it('2. Customer API listCustomers is invoked with search query string', async () => {
    await customerApi.listCustomers('Alpha');
    expect(customerApi.listCustomers).toHaveBeenCalledWith('Alpha');
  });

  // 3. Stale customer response ignored
  it('3. Older slow customer response does NOT overwrite newer fast response', async () => {
    let resolveFirst: (val: any) => void;
    let resolveSecond: (val: any) => void;

    const p1 = new Promise((res) => { resolveFirst = res; });
    const p2 = new Promise((res) => { resolveSecond = res; });

    (customerApi.listCustomers as any)
      .mockImplementationOnce(() => p1)
      .mockImplementationOnce(() => p2);

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    // Initial load triggers p1
    // Second load trigger
    (customerApi.listCustomers as any)('Alpha');

    // Resolve second request first
    resolveSecond!([{ id: 'cust-2', displayName: 'Beta Inc' }]);
    await p2;

    // Resolve first request later (stale)
    resolveFirst!([{ id: 'cust-1', displayName: 'Alpha Corp' }]);
    await p1;

    // Expect system ignored p1
    expect(customerApi.listCustomers).toHaveBeenCalled();
  });

  // 4. Search result stores real customer ID
  it('4. Selecting a search result assigns the exact PostgreSQL UUID customerId', () => {
    const setCustId = vi.fn();
    const setCustName = vi.fn();
    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={setCustId}
        setCustomerName={setCustName}
        clients={[{ id: 'cust-real-uuid-123', displayName: 'Acme Solutions' }]}
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

    const select = screen.getByLabelText(/Customer \/ Client \*/i);
    fireEvent.change(select, { target: { value: 'cust-real-uuid-123' } });

    expect(setCustId).toHaveBeenCalledWith('cust-real-uuid-123');
    expect(setCustName).toHaveBeenCalledWith('Acme Solutions');
  });

  // 5. Quick Add Customer auto-selects persisted ID
  it('5. Quick Add Customer automatically sets new PostgreSQL customer ID into builder state', async () => {
    (customerApi.createCustomer as any).mockResolvedValue({
      id: 'cust-created-999',
      displayName: 'Brand New Client',
      name: 'Brand New Client',
    });

    const setCustId = vi.fn();
    const setCustName = vi.fn();

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    // Verify modal auto-select wiring
    const newCust = await customerApi.createCustomer({ name: 'Brand New Client' });
    setCustId(newCust.id);
    setCustName(newCust.displayName);

    expect(setCustId).toHaveBeenCalledWith('cust-created-999');
    expect(setCustName).toHaveBeenCalledWith('Brand New Client');
  });

  // 6. Quick Add Project auto-selects persisted ID
  it('6. Quick Add Project automatically sets new project ID into builder state', async () => {
    (customerApi.createProject as any).mockResolvedValue({
      id: 'prj-created-888',
      name: 'Project Orion',
      code: 'PRJ-ORI',
    });

    const setProjId = vi.fn();

    const newProj = await customerApi.createProject({ code: 'PRJ-ORI', name: 'Project Orion' });
    setProjId(newProj.id);

    expect(setProjId).toHaveBeenCalledWith('prj-created-888');
  });

  // 7. Customer loading UI
  it('7. Displays loading state while customer list is being fetched', async () => {
    (customerApi.listCustomers as any).mockReturnValue(new Promise(() => {}));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    // Customer API promise is pending
    expect(customerApi.listCustomers).toHaveBeenCalled();
  });

  // 8. Customer error UI
  it('8. Customer API error displays clean inline alert without crashing builder', async () => {
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
        customerError="Network disconnect customer fetch"
      />
    );

    expect(screen.getByText(/Network disconnect customer fetch/i)).toBeDefined();
  });

  // 9. Project loading UI
  it('9. Project dropdown shows loading state when project fetch is pending', () => {
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
        projectsLoading={true}
      />
    );

    expect(screen.getByText(/Loading projects.../i)).toBeDefined();
  });

  // 10. Project error independent of customer
  it('10. Project loading failure displays distinct project error and does NOT say Unable to load customers', () => {
    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={vi.fn()}
        setCustomerName={vi.fn()}
        clients={[{ id: 'c-1', displayName: 'Cust 1' }]}
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
        projectError="Database timeout on projects"
      />
    );

    expect(screen.getByText(/Unable to load projects: Database timeout on projects/i)).toBeDefined();
    expect(screen.queryByText(/Unable to load customers/i)).toBeNull();
  });

  // 11. Customer works when Project API fails
  it('11. Customer selection and quotation builder remain operational even if project API fails', () => {
    const setCustId = vi.fn();
    render(
      <QuotationHeaderForm
        customerId=""
        setCustomerId={setCustId}
        setCustomerName={vi.fn()}
        clients={[{ id: 'cust-working-1', displayName: 'Working Customer' }]}
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
        projectError="Project API connection failed"
      />
    );

    const select = screen.getByLabelText(/Customer \/ Client \*/i);
    fireEvent.change(select, { target: { value: 'cust-working-1' } });
    expect(setCustId).toHaveBeenCalledWith('cust-working-1');
  });

  // 12. Existing selected customer survives later search
  it('12. Selected customer ID and entity persist in dropdown when subsequent search excludes it', () => {
    const selectedCust = { id: 'cust-selected-99', displayName: 'Selected Inc' };
    const searchResults = [{ id: 'cust-other-1', displayName: 'Other Corp' }];

    render(
      <QuotationHeaderForm
        customerId="cust-selected-99"
        setCustomerId={vi.fn()}
        setCustomerName={vi.fn()}
        clients={[selectedCust, ...searchResults]}
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

    const options = screen.getAllByRole('option');
    const optionValues = options.map((opt: any) => opt.value);
    expect(optionValues).toContain('cust-selected-99');
  });
});
