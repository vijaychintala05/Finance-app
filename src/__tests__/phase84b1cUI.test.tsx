// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EstimatesView } from '../components/invoices/EstimatesView';
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

describe('Phase 8.4B.1D — Real Production Tree Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (quotationApi.listQuotations as any).mockResolvedValue([]);
    (customerApi.listCustomers as any).mockResolvedValue([
      { id: 'cust-1', name: 'Alpha Corp', displayName: 'Alpha Corp' },
    ]);
    (customerApi.listProjects as any).mockResolvedValue([
      { id: 'prj-1', name: 'Alpha Project', code: 'PRJ-1' },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  // Helper to wait until customer select dropdown is rendered
  const waitForCustomerSelect = async () => {
    await waitFor(() => {
      const select = document.querySelector('#customer-select') as HTMLSelectElement;
      expect(select).not.toBeNull();
    });
    return document.querySelector('#customer-select') as HTMLSelectElement;
  };

  // 1. Real Customer Search Test
  it('1. Typing query into real customer search input debounces listCustomers API call for ~300ms and updates picker', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    const searchInput = screen.getByPlaceholderText(/Search by customer/i);
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });

    expect(customerApi.listCustomers).not.toHaveBeenCalledWith('Alpha');

    vi.advanceTimersByTime(300);

    expect(customerApi.listCustomers).toHaveBeenCalledWith('Alpha');
  });

  // 2. Real Stale Search Test
  it('2. Older slow customer response does NOT replace newer fast response in rendered UI', async () => {
    let resolveAl: (val: any) => void;
    let resolveAlpha: (val: any) => void;

    const pAl = new Promise((res) => { resolveAl = res; });
    const pAlpha = new Promise((res) => { resolveAlpha = res; });

    (customerApi.listCustomers as any)
      .mockImplementation((q?: string) => {
        if (q === 'Al') return pAl;
        if (q === 'Alpha') return pAlpha;
        return Promise.resolve([{ id: 'cust-1', displayName: 'Initial Cust' }]);
      });

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    const searchInput = screen.getByPlaceholderText(/Search by customer/i);

    // Type "Al"
    fireEvent.change(searchInput, { target: { value: 'Al' } });
    vi.advanceTimersByTime(300);

    // Type "Alpha"
    fireEvent.change(searchInput, { target: { value: 'Alpha' } });
    vi.advanceTimersByTime(300);

    // Resolve "Alpha" first
    resolveAlpha!([{ id: 'cust-2', displayName: 'Alpha Latest', name: 'Alpha Latest' }]);
    await pAlpha;

    // Resolve "Al" later (stale)
    resolveAl!([{ id: 'cust-1', displayName: 'Old Result', name: 'Old Result' }]);
    await pAl;

    // Check rendered DOM options
    await waitForCustomerSelect();
    expect(screen.queryByText(/Old Result/i)).toBeNull();
  });

  // 3. Real Quick Add Customer Test
  it('3. Submitting QuickAddClientModal auto-selects newly created customer in real builder picker', async () => {
    (customerApi.createCustomer as any).mockResolvedValue({
      id: 'cust-created-999',
      displayName: 'Brand New Client',
      name: 'Brand New Client',
    });

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    // Click "New Client"
    const newClientBtn = screen.getByRole('button', { name: /New Client/i });
    fireEvent.click(newClientBtn);

    // Fill modal input
    const nameInput = screen.getByLabelText(/Customer \/ Contact Name \*/i);
    fireEvent.change(nameInput, { target: { value: 'Brand New Client' } });

    // Submit modal
    const saveBtn = screen.getByRole('button', { name: /Save Customer/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(customerApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Brand New Client' })
      );
    });

    // Check auto-selection in customer select element
    const select = document.querySelector('#customer-select') as HTMLSelectElement;
    expect(select.value).toBe('cust-created-999');
    expect(screen.getAllByText(/Brand New Client/i).length).toBeGreaterThan(0);
  });

  // 4. Real Quick Add Project Test
  it('4. Submitting QuickAddProjectModal auto-selects newly created project in real builder picker', async () => {
    (customerApi.createProject as any).mockResolvedValue({
      id: 'prj-created-888',
      name: 'Project Orion',
      code: 'PRJ-888',
    });

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    // Click "New Project"
    const newProjBtn = screen.getByRole('button', { name: /New Project/i });
    fireEvent.click(newProjBtn);

    // Fill modal input
    const projNameInput = screen.getByPlaceholderText(/Website Redesign/i);
    fireEvent.change(projNameInput, { target: { value: 'Project Orion' } });

    // Submit modal
    const saveBtn = screen.getByRole('button', { name: /Save & Select Project/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(customerApi.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Project Orion' })
      );
    });

    // Check auto-selection in project select element
    const projSelect = document.querySelector('#project-select') as HTMLSelectElement;
    expect(projSelect.value).toBe('prj-created-888');
  });

  // 5. Project Error Through Real Tree
  it('5. Project API failure displays project error banner while customer selector remains usable', async () => {
    (customerApi.listProjects as any).mockRejectedValue(new Error('Database timeout on projects'));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to load projects: Database timeout on projects/i)).toBeDefined();
      expect(screen.queryByText(/Unable to load customers/i)).toBeNull();
    });

    const custSelect = await waitForCustomerSelect();
    expect(custSelect).toBeDefined();
  });

  // 6. Customer Loading Through Real Tree
  it('6. Displays Loading customers... text in DOM while listCustomers promise is pending', async () => {
    (customerApi.listCustomers as any).mockReturnValue(new Promise(() => {}));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    expect(screen.getByText(/Loading customers.../i)).toBeDefined();
  });

  // 7. Project Loading Prop Wiring Through Real Tree
  it('7. Displays Loading projects... text in DOM while listProjects promise is pending', async () => {
    (customerApi.listProjects as any).mockReturnValue(new Promise(() => {}));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    expect(screen.getByText(/Loading projects.../i)).toBeDefined();
  });

  // 8. Customer Selection Survives Subsequent Search
  it('8. Selected customer remains persisted in picker when a subsequent search query excludes it', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    const custSelect = await waitForCustomerSelect();
    fireEvent.change(custSelect, { target: { value: 'cust-1' } });

    // Perform new search that returns Beta Corp only
    (customerApi.listCustomers as any).mockResolvedValue([
      { id: 'cust-2', name: 'Beta Corp', displayName: 'Beta Corp' },
    ]);

    const searchInput = screen.getByPlaceholderText(/Search by customer/i);
    fireEvent.change(searchInput, { target: { value: 'Beta' } });
    vi.advanceTimersByTime(300);

    await waitFor(() => {
      expect(custSelect.value).toBe('cust-1');
    });
  });

  // 9. Selecting Customer Assigns Real UUID
  it('9. Selecting a customer assigns exact customer UUID to select value', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    const custSelect = await waitForCustomerSelect();
    fireEvent.change(custSelect, { target: { value: 'cust-1' } });
    expect(custSelect.value).toBe('cust-1');
  });

  // 10. Customer Error Inline Alert
  it('10. Customer API failure renders inline customer error message in real tree', async () => {
    (customerApi.listCustomers as any).mockRejectedValue(new Error('Network disconnect customer fetch'));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to load customers. Network disconnect customer fetch/i)).toBeDefined();
    });
  });

  // 11. Quotation Builder Operates when Project API Fails
  it('11. Quotation Builder remains functional when project loading fails', async () => {
    (customerApi.listProjects as any).mockRejectedValue(new Error('Project API failed'));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    const custSelect = await waitForCustomerSelect();
    fireEvent.change(custSelect, { target: { value: 'cust-1' } });
    expect(custSelect.value).toBe('cust-1');
  });

  // 12. Search Query Delegates to customerApi
  it('12. Search input change passes search query string to customerApi.listCustomers', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    const searchInput = screen.getByPlaceholderText(/Search by customer/i);
    fireEvent.change(searchInput, { target: { value: 'Gamma' } });
    vi.advanceTimersByTime(300);

    expect(customerApi.listCustomers).toHaveBeenCalledWith('Gamma');
  });
});
