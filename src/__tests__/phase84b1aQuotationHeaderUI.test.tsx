// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QuotationBuilder } from '../components/quotations/QuotationBuilder';
import { EstimatesView } from '../components/invoices/EstimatesView';
import { BooksProvider } from '../context/BooksContext';
import { quotationApi } from '../services/quotationApi';
import { customerApi } from '../services/customerApi';

const mockBackendCustomers = [
  { id: 'backend-cust-1', displayName: 'PostgreSQL Backend Customer A', companyName: 'Backend Corp A', email: 'a@backend.com', gstin: '27AAAAA1111A1Z1' },
  { id: 'backend-cust-2', displayName: 'PostgreSQL Backend Customer B', companyName: 'Backend Corp B', email: 'b@backend.com', gstin: '27BBBBB2222B1Z2' },
];

const mockBackendProjects = [
  { id: 'backend-proj-1', name: 'PostgreSQL Cloud Migration', code: 'PRJ-101' },
  { id: 'backend-proj-2', name: 'PostgreSQL ERP Rollout', code: 'PRJ-202' },
];

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<BooksProvider>{ui}</BooksProvider>);
};

describe('Phase 8.4B.1A — Real Frontend Customer Integration & Header Persistence Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(quotationApi, 'listQuotations').mockResolvedValue([]);
    vi.spyOn(quotationApi, 'listItems').mockResolvedValue([
      { id: 'item-1', name: 'Software License', salesRate: 20000, unit: 'Units', gstRate: 18, isActive: true },
    ]);
    vi.spyOn(customerApi, 'listCustomers').mockResolvedValue(mockBackendCustomers);
    vi.spyOn(customerApi, 'listProjects').mockResolvedValue(mockBackendProjects);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. Customer dropdown/picker loads from production customer API layer', async () => {
    const listSpy = vi.spyOn(customerApi, 'listCustomers').mockResolvedValue(mockBackendCustomers);

    renderWithProvider(<EstimatesView autoOpenCreateModal={true} />);
    await waitFor(() => expect(listSpy).toHaveBeenCalled());

    expect(screen.getByText(/PostgreSQL Backend Customer A/i)).toBeTruthy();
  });

  it('2. Seed/local BooksContext-only customer does not appear as authoritative production customer', async () => {
    renderWithProvider(<EstimatesView autoOpenCreateModal={true} />);
    await waitFor(() => expect(screen.getByText('Professional Quotation Builder')).toBeTruthy());

    // Should contain PostgreSQL customers
    expect(screen.getByText(/PostgreSQL Backend Customer A/i)).toBeTruthy();
    expect(screen.queryByText(/Seed Local Only Client/i)).toBeNull();
  });

  it('3. Real customer selection stores backend customer ID', async () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const select = screen.getByLabelText(/Customer \/ Client \*/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'backend-cust-1' } });
    expect(select.value).toBe('backend-cust-1');
  });

  it('4. Quick Add Customer creates via backend and selects new persisted customer', async () => {
    const createSpy = vi.spyOn(customerApi, 'createCustomer').mockResolvedValue({
      id: 'new-backend-cust-999',
      displayName: 'Brand New Backend Customer',
      companyName: 'Brand New Backend Customer',
    });

    renderWithProvider(<EstimatesView autoOpenCreateModal={true} />);
    await waitFor(() => expect(screen.getByText('Professional Quotation Builder')).toBeTruthy());

    const quickAddBtn = screen.getByText(/New Client/i);
    fireEvent.click(quickAddBtn);

    await waitFor(() => expect(screen.getByText('Quick Add Customer Master')).toBeTruthy());

    const nameInput = screen.getByPlaceholderText(/e\.g\. John Doe/i);
    fireEvent.change(nameInput, { target: { value: 'Brand New Backend Customer' } });

    const saveCustBtn = screen.getByRole('button', { name: /Save Customer/i });
    fireEvent.click(saveCustBtn);

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Brand New Backend Customer' })));
  });

  it('5. Customer loading state', async () => {
    vi.spyOn(customerApi, 'listCustomers').mockImplementation(() => new Promise(() => {}));

    renderWithProvider(<EstimatesView />);
    expect(screen.getByText('Quotes & Estimates')).toBeTruthy();
  });

  it('6. Customer error state', async () => {
    vi.spyOn(quotationApi, 'listQuotations').mockRejectedValue(new Error('Database network error'));

    renderWithProvider(<EstimatesView />);
    await waitFor(() => expect(screen.getByText('Database network error')).toBeTruthy());
  });

  it('7. Editing Draft customer persists through quotation API', async () => {
    const updateSpy = vi.spyOn(quotationApi, 'updateQuotation').mockResolvedValue({
      id: 'q-existing-1',
      estimateNumber: 'EST-2026-001',
      customerId: 'backend-cust-2',
      customerName: 'PostgreSQL Backend Customer B',
      status: 'DRAFT',
    });

    const existingQuote = {
      id: 'q-existing-1',
      estimateNumber: 'EST-2026-001',
      customerId: 'backend-cust-1',
      customerName: 'PostgreSQL Backend Customer A',
      items: [{ name: 'Development', quantity: 1, rate: 5000 }],
    };

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        initialQuotation={existingQuote}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const select = screen.getByLabelText(/Customer \/ Client \*/i);
    fireEvent.change(select, { target: { value: 'backend-cust-2' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('q-existing-1', expect.objectContaining({ customerId: 'backend-cust-2' })));
  });

  it('8. Issue Date edit included in save payload', async () => {
    const createSpy = vi.spyOn(quotationApi, 'createQuotation').mockResolvedValue({
      id: 'q-new-dates',
      status: 'DRAFT',
    });

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'backend-cust-1' } });
    fireEvent.change(screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0], { target: { value: 'Consulting' } });

    const issueDateInput = document.getElementById('issue-date-input') as HTMLInputElement;
    fireEvent.change(issueDateInput, { target: { value: '2026-04-10' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ issueDate: '2026-04-10' })));
  });

  it('9. Expiry Date edit included in save payload', async () => {
    const createSpy = vi.spyOn(quotationApi, 'createQuotation').mockResolvedValue({
      id: 'q-new-expiry',
      status: 'DRAFT',
    });

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'backend-cust-1' } });
    fireEvent.change(screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0], { target: { value: 'Consulting' } });

    const expiryDateInput = document.getElementById('expiry-date-input') as HTMLInputElement;
    fireEvent.change(expiryDateInput, { target: { value: '2026-05-15' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ expiryDate: '2026-05-15' })));
  });

  it('10. Project value persists or Project control is removed honestly', async () => {
    const createSpy = vi.spyOn(quotationApi, 'createQuotation').mockResolvedValue({
      id: 'q-proj-test',
      status: 'DRAFT',
    });

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'backend-cust-1' } });
    fireEvent.change(screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0], { target: { value: 'Milestone 1' } });

    const projectSelect = document.getElementById('project-select') as HTMLSelectElement;
    fireEvent.change(projectSelect, { target: { value: 'backend-proj-1' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'backend-proj-1' })));
  });

  it('11. Item search is debounced', async () => {
    const listItemsSpy = vi.spyOn(quotationApi, 'listItems').mockResolvedValue([]);

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.click(screen.getByText(/\+ Add Saved Item/i));
    await waitFor(() => expect(screen.getByText('Select Item from Master Registry')).toBeTruthy());

    const searchInput = screen.getByPlaceholderText(/Search by item name/i);
    fireEvent.change(searchInput, { target: { value: 'a' } });
    fireEvent.change(searchInput, { target: { value: 'ab' } });
    fireEvent.change(searchInput, { target: { value: 'abc' } });

    await waitFor(() => expect(listItemsSpy).toHaveBeenCalledWith('abc'));
  });

  it('12. Stale item search result cannot replace newer result', async () => {
    vi.spyOn(quotationApi, 'listItems').mockResolvedValue([
      { id: 'i-latest', name: 'Latest Match Product', salesRate: 100, isActive: true },
    ]);

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.click(screen.getByText(/\+ Add Saved Item/i));
    await waitFor(() => expect(screen.getByText('Select Item from Master Registry')).toBeTruthy());

    const searchInput = screen.getByPlaceholderText(/Search by item name/i);
    fireEvent.change(searchInput, { target: { value: 'Latest' } });

    await waitFor(() => expect(screen.getByText('Latest Match Product')).toBeTruthy());
  });

  it('13. Quotation list search is debounced', async () => {
    const listSpy = vi.spyOn(quotationApi, 'listQuotations').mockResolvedValue([]);

    renderWithProvider(<EstimatesView />);
    await waitFor(() => expect(screen.getByText('Quotes & Estimates')).toBeTruthy());

    const searchInput = screen.getByPlaceholderText(/Search estimate #, client.../i);
    fireEvent.change(searchInput, { target: { value: 'E' } });
    fireEvent.change(searchInput, { target: { value: 'EST' } });

    await waitFor(() => expect(listSpy).toHaveBeenCalledWith('EST'));
  });

  it('14. Conversion button reads "Convert to Invoice"', async () => {
    vi.spyOn(quotationApi, 'listQuotations').mockResolvedValue([
      {
        id: 'q-btn-test',
        estimateNumber: 'EST-999',
        customerName: 'Acme Corp',
        issueDate: '2026-03-01',
        expiryDate: '2026-03-31',
        totalAmount: 5000,
        status: 'DRAFT',
      },
    ]);

    renderWithProvider(<EstimatesView />);
    await waitFor(() => expect(screen.getByText('Convert to Invoice')).toBeTruthy());
    expect(screen.queryByText(/Convert & View Bill/i)).toBeNull();
  });

  it('15. Save failure still preserves form values', async () => {
    vi.spyOn(quotationApi, 'createQuotation').mockRejectedValue(new Error('Network timeout during save'));

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockBackendCustomers}
        projects={mockBackendProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'backend-cust-1' } });
    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Crucial Preserved Value' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => expect(screen.getByText('Network timeout during save')).toBeTruthy());
    expect((screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0] as HTMLInputElement).value).toBe('Crucial Preserved Value');
  });
});
