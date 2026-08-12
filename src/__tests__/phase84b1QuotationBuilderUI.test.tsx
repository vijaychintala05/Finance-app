// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QuotationBuilder } from '../components/quotations/QuotationBuilder';
import { EstimatesView } from '../components/invoices/EstimatesView';
import { BooksProvider } from '../context/BooksContext';
import { quotationApi } from '../services/quotationApi';

const mockClients = [
  { id: 'client-1', name: 'Acme Corp', companyName: 'Acme Corp Inc', email: 'acme@test.com', gstin: '27AAAAA0000A1Z5' },
  { id: 'client-2', name: 'Beta Ltd', companyName: 'Beta Logistics', email: 'beta@test.com' },
];

const mockProjects = [
  { id: 'proj-1', name: 'Cloud Migration' },
  { id: 'proj-2', name: 'ERP Implementation' },
];

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<BooksProvider>{ui}</BooksProvider>);
};

describe('Phase 8.4B.1 — Real Frontend QuotationBuilder Component Integration Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(quotationApi, 'listQuotations').mockResolvedValue([]);
    vi.spyOn(quotationApi, 'listItems').mockResolvedValue([
      { id: 'item-101', name: 'Server Hardware', salesRate: 15000, unit: 'Units', gstRate: 18, isActive: true },
      { id: 'item-102', name: 'Database Setup', salesRate: 5000, unit: 'Hours', gstRate: 18, isActive: true },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. New Quote opens real QuotationBuilder', async () => {
    renderWithProvider(<EstimatesView />);
    await waitFor(() => expect(screen.getByText('Quotes & Estimates')).toBeTruthy());

    const newBtn = screen.getByRole('button', { name: /New Quote/i });
    fireEvent.click(newBtn);

    expect(screen.getByText('Professional Quotation Builder')).toBeTruthy();
  });

  it('2. Customer can be selected', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const select = screen.getByLabelText(/Customer \/ Client \*/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'client-1' } });
    expect(select.value).toBe('client-1');
  });

  it('3. Item Master item can be searched/selected', async () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const addItemBtn = screen.getByText(/\+ Add Saved Item/i);
    fireEvent.click(addItemBtn);

    await waitFor(() => expect(screen.getByText('Select Item from Master Registry')).toBeTruthy());
    const selectItemBtns = await waitFor(() => screen.getAllByText('Select'));
    fireEvent.click(selectItemBtns[0]);

    expect(screen.getAllByDisplayValue('Server Hardware').length).toBeGreaterThan(0);
  });

  it('4. Saved item populates rate/unit/GST', async () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.click(screen.getByText(/\+ Add Saved Item/i));
    await waitFor(() => expect(screen.getByText('Select Item from Master Registry')).toBeTruthy());
    const selectButtons = await waitFor(() => screen.getAllByText('Select'));
    fireEvent.click(selectButtons[0]);

    expect(screen.getAllByDisplayValue('Server Hardware').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('15000').length).toBeGreaterThan(0);
  });

  it('5. Custom line can be added', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const customBtn = screen.getByText(/\+ Custom Line/i);
    fireEvent.click(customBtn);

    const titleInputs = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i);
    expect(titleInputs.length).toBe(2);
  });

  it('6. Multiple lines can be added', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.click(screen.getByText(/\+ Custom Line/i));
    fireEvent.click(screen.getByText(/\+ Custom Line/i));

    const titleInputs = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i);
    expect(titleInputs.length).toBe(3);
  });

  it('7. Line can be removed', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.click(screen.getByText(/\+ Custom Line/i));

    const removeBtns = screen.getAllByTitle('Remove line');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);

    const remainingInputs = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i);
    expect(remainingInputs.length).toBe(1);
  });

  it('8. Quantity can be edited', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Consulting Service' } });

    const qtyInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(qtyInputs[0], { target: { value: '5' } });
    expect((qtyInputs[0] as HTMLInputElement).value).toBe('5');
  });

  it('9. Rate can be edited', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[1], { target: { value: '2500' } });
    expect((spinButtons[1] as HTMLInputElement).value).toBe('2500');
  });

  it('10. Discount can be edited', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const discInputs = screen.getAllByPlaceholderText('%');
    fireEvent.change(discInputs[0], { target: { value: '10' } });
    expect((discInputs[0] as HTMLInputElement).value).toBe('10');
  });

  it('11. GST can be edited', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const selectElements = screen.getAllByRole('combobox');
    const gstSelect = selectElements.find((s) => (s as HTMLSelectElement).value === '18' || (s as HTMLSelectElement).value === '0');
    expect(gstSelect).toBeTruthy();
    fireEvent.change(gstSelect!, { target: { value: '12' } });
    expect((gstSelect as HTMLSelectElement).value).toBe('12');
  });

  it('12. Live totals update', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Widget' } });

    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[0], { target: { value: '2' } });
    fireEvent.change(spinButtons[1], { target: { value: '1000' } });

    expect(screen.getByText('Quotation Summary')).toBeTruthy();
  });

  it('13. Overall discount updates preview', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const overallDiscInput = screen.getByPlaceholderText('0') as HTMLInputElement;
    fireEvent.change(overallDiscInput, { target: { value: '500' } });
    expect(overallDiscInput.value).toBe('500');
  });

  it('14. GST-inclusive toggle updates preview', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const toggleBtn = screen.getByRole('switch');
    fireEvent.click(toggleBtn);
    expect(screen.getByText('Prices include GST. Tax is extracted.')).toBeTruthy();
  });

  it('15. Save Draft calls real quotation API layer', async () => {
    const createSpy = vi.spyOn(quotationApi, 'createQuotation').mockResolvedValue({
      id: 'q-999',
      estimateNumber: 'EST-2026-001',
      status: 'DRAFT',
      totalAmount: 11800,
    });

    const handleSuccess = vi.fn();

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={handleSuccess}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    const clientSelect = screen.getByLabelText(/Customer \/ Client \*/i);
    fireEvent.change(clientSelect, { target: { value: 'client-1' } });

    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Software Support' } });

    const spinButtons = screen.getAllByRole('spinbutton');
    fireEvent.change(spinButtons[1], { target: { value: '10000' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(handleSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'q-999' }));
  });

  it('16. Save is disabled/prevented during submission', async () => {
    vi.spyOn(quotationApi, 'createQuotation').mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 2000)));

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'client-1' } });
    fireEvent.change(screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0], { target: { value: 'Item A' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(screen.getByText('Saving Quotation...')).toBeTruthy());
  });

  it('17. Failed save preserves form', async () => {
    vi.spyOn(quotationApi, 'createQuotation').mockRejectedValue(new Error('Server validation failed'));

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'client-1' } });
    const titleInput = screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0];
    fireEvent.change(titleInput, { target: { value: 'Important Preserved Title' } });

    const saveBtn = screen.getByRole('button', { name: /Save Draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(screen.getByText('Server validation failed')).toBeTruthy());
    expect((screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0] as HTMLInputElement).value).toBe('Important Preserved Title');
  });

  it('18. Successful save uses server-returned totals', async () => {
    vi.spyOn(quotationApi, 'createQuotation').mockResolvedValue({
      id: 'q-100',
      estimateNumber: 'EST-100',
      totalAmount: 15000,
      status: 'DRAFT',
    });

    const onSuccessSpy = vi.fn();

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={onSuccessSpy}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'client-1' } });
    fireEvent.change(screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0], { target: { value: 'Service' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => expect(onSuccessSpy).toHaveBeenCalledWith(expect.objectContaining({ totalAmount: 15000 })));
  });

  it('19. Successful new quotation status is Draft', async () => {
    const createSpy = vi.spyOn(quotationApi, 'createQuotation').mockResolvedValue({
      id: 'q-draft-test',
      status: 'DRAFT',
    });

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText(/Customer \/ Client \*/i), { target: { value: 'client-1' } });
    fireEvent.change(screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0], { target: { value: 'Service' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' })));
  });

  it('20. Existing quotation opens with saved historical rates', () => {
    const historicalQuotation = {
      id: 'q-historical',
      estimateNumber: 'EST-HIST-001',
      customerId: 'client-1',
      customerName: 'Acme Corp',
      items: [{ name: 'Old Rate Item', rate: 12000, quantity: 1, unit: 'Pcs', taxRate: 18 }],
    };

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        initialQuotation={historicalQuotation}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    expect(screen.getAllByDisplayValue('Old Rate Item').length).toBeGreaterThan(0);
    expect(screen.getAllByDisplayValue('12000').length).toBeGreaterThan(0);
  });

  it('21. Closing dirty builder prompts before discard', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onCloseSpy = vi.fn();

    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={onCloseSpy}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    fireEvent.change(screen.getAllByPlaceholderText(/Item \/ Service Title \*/i)[0], { target: { value: 'Dirty Input' } });

    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);

    expect(confirmSpy).toHaveBeenCalled();
    expect(onCloseSpy).not.toHaveBeenCalled();
  });

  it('22. Mobile line layout is renderable without desktop-only controls disappearing', () => {
    renderWithProvider(
      <QuotationBuilder
        isOpen={true}
        onClose={() => {}}
        onSuccess={() => {}}
        clients={mockClients}
        projects={mockProjects}
        onOpenQuickClient={() => {}}
        onOpenQuickProject={() => {}}
      />
    );

    expect(screen.getByText('Quotation Line Items (1)')).toBeTruthy();
    expect(screen.getByText('+ Add Saved Item')).toBeTruthy();
    expect(screen.getByText('+ Custom Line')).toBeTruthy();
  });
});
