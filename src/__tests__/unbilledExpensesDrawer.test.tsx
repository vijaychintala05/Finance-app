// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UnbilledExpensesDrawer } from '../components/invoices/UnbilledExpensesDrawer';
import { Expense } from '../types';

describe('UnbilledExpensesDrawer Component Certification (Stage 2)', () => {
  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      date: '2026-09-17',
      amount: 1000,
      sellingPrice: 1150,
      markupPercentage: 15,
      accountId: 'acc-exp-1',
      accountName: 'Travel & Meals',
      paidFromAccountId: 'acc-bank-1',
      description: 'Flight to customer site',
      clientId: 'cli-1',
      clientName: 'Acme Corp',
      isBillable: true,
      isBilled: false,
      referenceNumber: 'EXP-101',
    },
    {
      id: 'exp-2',
      date: '2026-09-17',
      amount: 2000,
      sellingPrice: 2200,
      markupPercentage: 10,
      accountId: 'acc-exp-2',
      accountName: 'Equipment Rental',
      paidFromAccountId: 'acc-bank-1',
      description: '3D Laser scanner rental',
      clientId: 'cli-1',
      clientName: 'Acme Corp',
      isBillable: true,
      isBilled: false,
      referenceNumber: 'EXP-102',
    },
  ];

  afterEach(() => {
    cleanup();
  });

  it('1. Loads and renders unbilled billable expenses at customer selling price', async () => {
    render(
      <UnbilledExpensesDrawer
        isOpen={true}
        onClose={() => {}}
        clientId="cli-1"
        clientName="Acme Corp"
        currencySymbol="₹"
        expenses={mockExpenses}
        onApply={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Flight to customer site')).toBeTruthy();
      expect(screen.getByText('3D Laser scanner rental')).toBeTruthy();
    });

    // Check pre-calculated selling prices
    expect(screen.getAllByText('₹1,150.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('₹2,200.00').length).toBeGreaterThanOrEqual(1);

    // Check markups
    expect(screen.getByText('+15% markup')).toBeTruthy();
    expect(screen.getByText('+10% markup')).toBeTruthy();

    // Check privacy guarantee
    expect(screen.getByText(/Customer Privacy Guarantee:/i)).toBeTruthy();

    // Total selected should be 1,150 + 2,200 = 3,350
    expect(screen.getAllByText('₹3,350.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2\s*expenses\s*selected/i)).toBeTruthy();
  });

  it('2. Multi-selection toggle and selective applying to invoice', async () => {
    let appliedResult: Expense[] = [];
    let closed = false;

    render(
      <UnbilledExpensesDrawer
        isOpen={true}
        onClose={() => { closed = true; }}
        clientId="cli-1"
        clientName="Acme Corp"
        currencySymbol="₹"
        expenses={mockExpenses}
        onApply={(selected) => { appliedResult = selected; }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Flight to customer site')).toBeTruthy();
    });

    // Uncheck first expense by clicking its card
    fireEvent.click(screen.getByText('Flight to customer site'));

    // Now only exp-2 (2,200) should be selected
    expect(screen.getByText(/1\s*expense\s*selected/i)).toBeTruthy();
    expect(screen.getAllByText('₹2,200.00').length).toBeGreaterThanOrEqual(1);

    // Click "Add to Invoice"
    const addBtn = screen.getByRole('button', { name: /Add to Invoice/i });
    fireEvent.click(addBtn);

    expect(appliedResult.length).toBe(1);
    expect(appliedResult[0].id).toBe('exp-2');
    expect(closed).toBe(true);
  });

  it('3. Filters out already selected expenses from the drawer', async () => {
    render(
      <UnbilledExpensesDrawer
        isOpen={true}
        onClose={() => {}}
        clientId="cli-1"
        clientName="Acme Corp"
        currencySymbol="₹"
        expenses={mockExpenses}
        alreadySelectedExpenseIds={['exp-1']}
        onApply={() => {}}
      />
    );

    await waitFor(() => {
      // exp-1 is filtered out because it's already added to invoice
      expect(screen.queryByText('Flight to customer site')).toBeNull();
      // exp-2 remains
      expect(screen.getByText('3D Laser scanner rental')).toBeTruthy();
    });

    expect(screen.getByText(/1\s*expense\s*selected/i)).toBeTruthy();
    expect(screen.getAllByText('₹2,200.00').length).toBeGreaterThanOrEqual(1);
  });
});
