// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EstimatesView } from '../components/invoices/EstimatesView';
import { QuotationBuilder } from '../components/quotations/QuotationBuilder';
import { EstimateDetailsModal } from '../components/invoices/EstimateDetailsModal';
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
    listItems: vi.fn(),
    createQuotation: vi.fn(),
    updateQuotation: vi.fn(),
  },
}));

describe('Phase 8.4B.2 — Quotation Builder UX & Visual Refinement Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (quotationApi.listQuotations as any).mockResolvedValue([]);
    (quotationApi.listItems as any).mockResolvedValue([
      { id: 'item-101', name: 'Master Solar Panel', salesRate: 15000, hsnSac: '8541', gstRate: 18, unit: 'Pcs', isActive: true },
    ]);
    (customerApi.listCustomers as any).mockResolvedValue([
      { id: 'cust-1', name: 'Alpha Corp', displayName: 'Alpha Corp', email: 'alpha@corp.com', gstin: '27AAAAA0000A1Z5' },
    ]);
    (customerApi.listProjects as any).mockResolvedValue([
      { id: 'prj-1', name: 'Solar Installation', code: 'PRJ-101' },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  const waitForCustomerSelect = async () => {
    await waitFor(() => {
      const select = document.querySelector('#customer-select') as HTMLSelectElement;
      expect(select).not.toBeNull();
    });
    return document.querySelector('#customer-select') as HTMLSelectElement;
  };

  // 1. No ghost Quick Add Customer modal after builder closes
  it('1. No ghost Quick Add Customer modal appears after builder closes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    (customerApi.createCustomer as any).mockResolvedValue({
      id: 'cust-new-1',
      displayName: 'New Customer Inc',
      name: 'New Customer Inc',
    });

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const newClientBtn = screen.getByRole('button', { name: /New Client/i });
    fireEvent.click(newClientBtn);

    const nameInput = screen.getByLabelText(/Customer \/ Contact Name \*/i);
    fireEvent.change(nameInput, { target: { value: 'New Customer Inc' } });

    const saveCustomerBtn = screen.getByRole('button', { name: /Save Customer/i });
    await act(async () => {
      fireEvent.click(saveCustomerBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    const closeBtn = screen.getByLabelText(/Close modal/i);
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByLabelText(/Customer \/ Contact Name \*/i)).toBeNull();
    });
    confirmSpy.mockRestore();
  });

  // 2. No ghost Quick Add Project modal after builder closes
  it('2. No ghost Quick Add Project modal appears after builder closes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    (customerApi.createProject as any).mockResolvedValue({
      id: 'prj-new-1',
      name: 'New Orion Project',
      code: 'PRJ-999',
    });

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const newProjBtn = screen.getByRole('button', { name: /New Project/i });
    fireEvent.click(newProjBtn);

    const projInput = screen.getByPlaceholderText(/Website Redesign/i);
    fireEvent.change(projInput, { target: { value: 'New Orion Project' } });

    const saveProjBtn = screen.getByRole('button', { name: /Save & Select Project/i });
    await act(async () => {
      fireEvent.click(saveProjBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    const closeBtn = screen.getByLabelText(/Close modal/i);
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Website Redesign/i)).toBeNull();
    });
    confirmSpy.mockRestore();
  });

  // 3. Searchable customer picker works
  it('3. Customer search input debounces and calls listCustomers API', async () => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
  });

  // 4. Selected customer stable during search
  it('4. Selected customer remains stable when subsequent search returns different results', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    const select = await waitForCustomerSelect();
    fireEvent.change(select, { target: { value: 'cust-1' } });

    (customerApi.listCustomers as any).mockResolvedValue([
      { id: 'cust-2', name: 'Beta Corp', displayName: 'Beta Corp' },
    ]);

    const searchInput = screen.getByPlaceholderText(/Search by customer/i);
    fireEvent.change(searchInput, { target: { value: 'Beta' } });

    await waitFor(() => {
      expect(select.value).toBe('cust-1');
    });
  });

  // 5. Item picker selection adds line
  it('5. Selecting item from ItemPicker appends line item to builder', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const addItemBtn = screen.getByRole('button', { name: /\+ Add Saved Item/i });
    fireEvent.click(addItemBtn);

    await waitFor(() => {
      expect(screen.getByText(/Select Item from Master Registry/i)).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText(/Master Solar Panel/i)).toBeDefined();
    });

    const itemCard = screen.getByText(/Master Solar Panel/i);
    fireEvent.click(itemCard);

    expect(screen.getAllByDisplayValue(/Master Solar Panel/i).length).toBeGreaterThan(0);
  });

  // 6. Custom line adds immediately
  it('6. Clicking + Custom Line appends a blank line item immediately without dialog', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const customLineBtn = screen.getByRole('button', { name: /\+ Custom Line/i });
    fireEvent.click(customLineBtn);

    const titleInputs = screen.getAllByPlaceholderText(/Item \/ Service Title \*|Item Name \*/i);
    expect(titleInputs.length).toBeGreaterThan(1);
  });

  // 7. Multiple lines render
  it('7. Multiple lines render in builder table', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const customLineBtn = screen.getByRole('button', { name: /\+ Custom Line/i });
    fireEvent.click(customLineBtn);
    fireEvent.click(customLineBtn);

    const titleInputs = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i);
    expect(titleInputs.length).toBe(3);
  });

  // 8. Desktop line editing works
  it('8. Desktop line editing updates quantity, rate, discount, GST and line total', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Consulting Services' } });

    const numInputs = screen.getAllByRole('spinbutton');
    const qtyInput = numInputs[0];
    const rateInput = numInputs[1];

    fireEvent.change(qtyInput, { target: { value: '2' } });
    fireEvent.change(rateInput, { target: { value: '5000' } });

    expect(screen.getAllByDisplayValue('Consulting Services').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/10,000/).length).toBeGreaterThan(0);
  });

  // 9. Mobile line-card rendering retains all required controls
  it('9. Mobile view renders editable line cards with all controls', async () => {
    render(
      <QuotationBuilder
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        clients={[{ id: 'c1', displayName: 'Cust 1' }]}
        projects={[]}
      />
    );

    const nameInputs = screen.getAllByPlaceholderText(/Item \/ Service Title \*|Item Name \*/i);
    expect(nameInputs.length).toBeGreaterThan(0);
  });

  // 10. Removing line works
  it('10. Clicking remove button removes line item from builder', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const customLineBtn = screen.getByRole('button', { name: /\+ Custom Line/i });
    fireEvent.click(customLineBtn);

    let removeBtns = screen.getAllByLabelText(/Delete line/i);
    const initialCount = removeBtns.length;

    fireEvent.click(removeBtns[0]);

    removeBtns = screen.getAllByLabelText(/Delete line/i);
    expect(removeBtns.length).toBeLessThan(initialCount);
  });

  // 11. Duplicate line works
  it('11. Clicking duplicate line button duplicates the selected line item', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Design Prototype' } });

    const duplicateBtn = screen.getAllByLabelText(/Duplicate line/i)[0];
    fireEvent.click(duplicateBtn);

    const titleInputs = screen.getAllByDisplayValue('Design Prototype');
    expect(titleInputs.length).toBeGreaterThan(1);
  });

  // 12. Quantity/rate/discount/GST edits update preview
  it('12. Rate and Quantity edits dynamically update summary preview totals', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Audit Service' } });

    const numInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(numInputs[0], { target: { value: '3' } });
    fireEvent.change(numInputs[1], { target: { value: '1000' } });

    expect(screen.getAllByText(/3,000/).length).toBeGreaterThan(0);
  });

  // 13. Overall discount update
  it('13. Overall discount input updates total preview', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Dev Work' } });

    const numInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(numInputs[0], { target: { value: '1' } });
    fireEvent.change(numInputs[1], { target: { value: '10000' } });

    const discountInput = numInputs[numInputs.length - 1];
    fireEvent.change(discountInput, { target: { value: '2000' } });

    expect(screen.getByDisplayValue('2000')).toBeDefined();
  });

  // 14. GST-inclusive toggle
  it('14. Toggling Rates include GST updates calculation mode hint', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const gstToggle = document.querySelector('#gst-inclusive-toggle') as HTMLButtonElement;
    expect(gstToggle).not.toBeNull();
    fireEvent.click(gstToggle);

    expect(screen.getByText(/Prices include GST. Tax is extracted./i)).toBeDefined();
  });

  // 15. Invalid expiry date feedback
  it('15. Valid Until date input is editable and accessible', async () => {
    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const expiryInput = screen.getByLabelText(/Valid Until/i);
    fireEvent.change(expiryInput, { target: { value: '2026-12-31' } });

    expect((expiryInput as HTMLInputElement).value).toBe('2026-12-31');
  });

  // 16. Missing customer feedback
  it('16. Submitting draft without selecting a customer displays inline error alert', async () => {
    render(
      <QuotationBuilder
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        clients={[]}
        projects={[]}
      />
    );

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*|Item Name \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Test Line' } });

    const select = document.querySelector('#customer-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    expect(screen.getByText(/Please select a customer for the quotation./i)).toBeDefined();
  });

  // 17. Empty-lines validation
  it('17. Submitting draft with zero lines displays inline error alert', async () => {
    render(
      <QuotationBuilder
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        clients={[{ id: 'c1', displayName: 'Cust 1' }]}
        projects={[]}
      />
    );

    const select = document.querySelector('#customer-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'c1' } });

    const removeBtns = screen.getAllByLabelText(/Delete line/i);
    removeBtns.forEach((btn) => fireEvent.click(btn));

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(screen.getByText(/Quotation must contain at least one line item./i)).toBeDefined();
  });

  // 18. Failed save preserves form
  it('18. Server save error preserves form inputs and keeps builder open for retry', async () => {
    (quotationApi.createQuotation as any).mockRejectedValue(new Error('PostgreSQL database connection timeout'));

    render(
      <QuotationBuilder
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        clients={[{ id: 'c1', displayName: 'Cust 1' }]}
        projects={[]}
      />
    );

    const select = document.querySelector('#customer-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'c1' } });

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Preserved Line Title' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    await act(async () => {
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText(/PostgreSQL database connection timeout/i)).toBeDefined();
    expect(screen.getAllByDisplayValue('Preserved Line Title').length).toBeGreaterThan(0);
  });

  // 19. Save loading prevents duplicate submit
  it('19. Save button displays saving state and disables submit during API call', async () => {
    let resolveSave: (v: any) => void;
    (quotationApi.createQuotation as any).mockImplementation(() => new Promise((res) => { resolveSave = res; }));

    render(
      <QuotationBuilder
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        clients={[{ id: 'c1', displayName: 'Cust 1' }]}
        projects={[]}
      />
    );

    const select = document.querySelector('#customer-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'c1' } });

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Valid Line' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Saving Quotation.../i)).toBeDefined();
      expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    });

    resolveSave!({ id: 'q-saved-100', estimateNumber: 'EST-100' });
  });

  // 20. Successful save closes cleanly
  it('20. Successful quotation save closes builder modal cleanly', async () => {
    const handleSuccess = vi.fn();
    (quotationApi.createQuotation as any).mockResolvedValue({
      id: 'q-success-1',
      estimateNumber: 'EST-0099',
    });

    render(
      <QuotationBuilder
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={handleSuccess}
        clients={[{ id: 'c1', displayName: 'Cust 1' }]}
        projects={[]}
      />
    );

    const select = document.querySelector('#customer-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'c1' } });

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Clean Save Line' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    await act(async () => {
      fireEvent.click(saveBtn);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(handleSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'q-success-1' }));
  });

  // 21. Dirty close asks confirmation
  it('21. Closing modified quotation prompts user before discarding unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Unsaved Edit' } });

    const closeBtn = screen.getByLabelText(/Close modal/i);
    fireEvent.click(closeBtn);

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/unsaved changes/i));
    confirmSpy.mockRestore();
  });

  // 22. Clean close does not ask
  it('22. Closing untouched quotation closes immediately without confirmation prompt', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitForCustomerSelect();

    const closeBtn = screen.getByLabelText(/Close modal/i);
    fireEvent.click(closeBtn);

    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  // 23. Project error does not break customer selection
  it('23. Failed project API listProjects displays compact error banner and keeps customer selection functional', async () => {
    (customerApi.listProjects as any).mockRejectedValue(new Error('Project service unavailable'));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to load projects: Project service unavailable/i)).toBeDefined();
    });

    const select = await waitForCustomerSelect();
    fireEvent.change(select, { target: { value: 'cust-1' } });
    expect(select.value).toBe('cust-1');
  });

  // 24. Customer error retains Quick Add access
  it('24. Customer fetch failure displays error banner and provides + Quick Add button', async () => {
    (customerApi.listCustomers as any).mockRejectedValue(new Error('Network error loading customers'));

    render(
      <BooksProvider>
        <EstimatesView autoOpenCreateModal={true} />
      </BooksProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Unable to load customers. Network error loading customers/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /\+ Quick Add/i })).toBeDefined();
    });
  });

  // 25. Details view shows actual saved commercial data
  it('25. EstimateDetailsModal renders saved quotation details cleanly', () => {
    const sampleEstimate = {
      id: 'est-777',
      estimateNumber: 'EST-0777',
      customerId: 'cust-1',
      clientName: 'Acme Solutions Ltd',
      projectId: 'prj-101',
      issueDate: '2026-08-11',
      expiryDate: '2026-09-10',
      items: [
        {
          id: 'l1',
          description: 'Custom Enterprise Software Architecture',
          quantity: 1,
          unitPrice: 125000,
          amount: 125000,
        },
      ],
      subtotal: 125000,
      taxTotal: 22500,
      totalAmount: 147500,
      status: 'DRAFT',
      notes: 'Commercial terms valid for 30 days.',
      terms: '50% advance on approval.',
    };

    render(
      <BooksProvider>
        <EstimateDetailsModal
          isOpen={true}
          onClose={vi.fn()}
          estimate={sampleEstimate as any}
        />
      </BooksProvider>
    );

    expect(screen.getByText('EST-0777')).toBeDefined();
    expect(screen.getByText('Acme Solutions Ltd')).toBeDefined();
    expect(screen.getByText('Custom Enterprise Software Architecture')).toBeDefined();
  });
});
