// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TransactionHistoryTab } from '../components/common/TransactionHistoryTab';
import { historyApi } from '../services/historyApi';
import { apiClient } from '../api/client';
import { JournalDetailsModal } from '../components/journals/JournalDetailsModal';
import { BooksProvider } from '../context/BooksContext';

describe('Transaction History & Audit Trail Feature', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('accepts the finance API raw-array history contract', async () => {
    const event = {
      id: 'evt-api-1',
      action: 'INVOICE_CREATED',
      actionLabel: 'Invoice Created',
      entityType: 'Invoice',
      entityId: 'inv-api-1',
      timestamp: '2026-09-22T08:00:00.000Z',
      userName: 'API Owner',
      summary: 'Invoice created',
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [event], error: null, status: 200 } as any);

    await expect(historyApi.getEntityHistory('Invoice', 'inv-api-1')).resolves.toEqual([event]);
  });

  it('1. Fetches and renders transaction history timeline with creation time and user', async () => {
    vi.spyOn(historyApi, 'getEntityHistory').mockResolvedValue([
      {
        id: 'evt-1',
        action: 'EXPENSE_CREATED',
        actionLabel: 'Expense Created',
        entityType: 'Expense',
        entityId: 'exp-100',
        timestamp: '2026-09-20T10:30:00.000Z',
        userName: 'Asha Sharma',
        userEmail: 'asha@example.com',
        summary: 'Expense #EXP-001 created for ₹4,500.00',
        details: { amount: 4500, status: 'Posted' },
      },
    ]);

    render(<TransactionHistoryTab entityType="Expense" entityId="exp-100" />);

    expect(screen.getByText('Expense History & Audit Trail')).toBeTruthy();
    expect(screen.getByText(/Retrieving audit timeline/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Expense Created')).toBeTruthy();
    });

    expect(screen.getByText('Expense #EXP-001 created for ₹4,500.00')).toBeTruthy();
    expect(screen.getByText('Asha Sharma')).toBeTruthy();
    expect(screen.getByText('(asha@example.com)')).toBeTruthy();
  });

  it('2. Prominently displays the reason for modification and before/after diffs', async () => {
    vi.spyOn(historyApi, 'getEntityHistory').mockResolvedValue([
      {
        id: 'evt-2',
        action: 'EXPENSE_CORRECTED',
        actionLabel: 'Expense Corrected',
        entityType: 'Expense',
        entityId: 'exp-100',
        timestamp: '2026-09-21T14:15:00.000Z',
        userName: 'Vijay Chintala',
        userEmail: 'vijay@example.com',
        reason: 'Vendor updated bill number after invoice correction',
        summary: 'Expense corrected: Vendor invoice ref updated',
        beforeState: { invoiceNumber: 'V-100' },
        afterState: { invoiceNumber: 'V-101' },
      },
    ]);

    render(<TransactionHistoryTab entityType="Expense" entityId="exp-100" />);

    await waitFor(() => {
      expect(screen.getByText('Expense Corrected')).toBeTruthy();
    });

    // Reason box verification
    expect(screen.getByText('Reason for Modification')).toBeTruthy();
    expect(screen.getByText('"Vendor updated bill number after invoice correction"')).toBeTruthy();

    // Toggle details diff
    const toggleBtn = screen.getByText('View Changes');
    fireEvent.click(toggleBtn);

    expect(screen.getByText('Before State:')).toBeTruthy();
    expect(screen.getByText('After State:')).toBeTruthy();
    expect(screen.getByText('Hide Details')).toBeTruthy();

    // Verify human-readable normal text representation
    expect(screen.getByText(/Changes Summary/i)).toBeTruthy();
    expect(screen.getAllByText('Invoice Number').length).toBeGreaterThan(0);
    expect(screen.getAllByText('V-100').length).toBeGreaterThan(0);
    expect(screen.getAllByText('V-101').length).toBeGreaterThan(0);
    // Verify no raw JSON curly brace dump
    expect(screen.queryByText(/\{\s*"invoiceNumber":/)).toBeNull();
  });

  it('3. Renders baseline fallback creation event when server has legacy record', async () => {
    vi.spyOn(historyApi, 'getEntityHistory').mockResolvedValue([]);

    const legacyEntity = {
      id: 'inv-legacy',
      amount: 15000,
      createdAt: '2026-08-01T09:00:00.000Z',
      userName: 'Accounting Admin',
      status: 'Posted',
    };

    render(
      <TransactionHistoryTab
        entityType="Invoice"
        entityId="inv-legacy"
        entity={legacyEntity}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Invoice Created')).toBeTruthy();
    });

    expect(screen.getByText('Invoice initial record created')).toBeTruthy();
  });

  it('4. JournalDetailsModal renders Voucher Details and History & Audit Trail tabs', async () => {
    vi.spyOn(historyApi, 'getEntityHistory').mockResolvedValue([
      {
        id: 'jrn-evt-1',
        action: 'MANUAL_JOURNAL_CREATED',
        actionLabel: 'Journal Entry Posted',
        entityType: 'JournalEntry',
        entityId: 'jrn-1',
        timestamp: '2026-09-15T11:00:00.000Z',
        userName: 'Chief Accountant',
        summary: 'Journal #JRN-2026-0001 posted (Depreciation entry)',
      },
    ]);

    const mockJournal: any = {
      id: 'jrn-1',
      entryNumber: 'JRN-2026-0001',
      date: '2026-09-15',
      reference: 'DEP-SEP26',
      description: 'Monthly asset depreciation adjustment',
      status: 'Posted',
      lines: [
        { id: 'l1', accountCode: '6100', accountName: 'Depreciation Expense', debit: 1200, credit: 0 },
        { id: 'l2', accountCode: '1590', accountName: 'Accumulated Depreciation', debit: 0, credit: 1200 },
      ],
    };

    render(
      <BooksProvider>
        <JournalDetailsModal isOpen={true} onClose={vi.fn()} journal={mockJournal} />
      </BooksProvider>
    );

    // Initial tab: Voucher Details
    expect(screen.getByText('Voucher Details')).toBeTruthy();
    expect(screen.getByText('History & Audit Trail')).toBeTruthy();
    expect(screen.getByText('Monthly asset depreciation adjustment')).toBeTruthy();
    expect(screen.getByText('Depreciation Expense')).toBeTruthy();
    expect(screen.getByText('Accumulated Depreciation')).toBeTruthy();

    // Switch to History tab
    const historyTabBtn = screen.getByRole('tab', { name: /History & Audit Trail/i });
    fireEvent.click(historyTabBtn);

    await waitFor(() => {
      expect(screen.getByText('Journal Entry Posted')).toBeTruthy();
    });

    expect(screen.getByText('Journal #JRN-2026-0001 posted (Depreciation entry)')).toBeTruthy();
    expect(screen.getByText('Chief Accountant')).toBeTruthy();
  });

  it('5. Renders multi-field changes in human-friendly normal text with formatted currency and labels', async () => {
    vi.spyOn(historyApi, 'getEntityHistory').mockResolvedValue([
      {
        id: 'evt-multi-diff',
        action: 'EXPENSE_UPDATED',
        actionLabel: 'Expense Modified',
        entityType: 'Expense',
        entityId: 'exp-multi',
        timestamp: '2026-09-22T12:00:00.000Z',
        userName: 'Priya Patel',
        reason: 'Adjusted GST rate and updated vendor invoice number',
        summary: 'Expense #EXP-088 modified',
        beforeState: {
          amount: 4500,
          vendorInvoiceNumber: 'INV-2026-001',
          taxRate: 12,
          isItemized: false,
          paymentMode: 'CASH',
        },
        afterState: {
          amount: 5310,
          vendorInvoiceNumber: 'INV-2026-001-REV',
          taxRate: 18,
          isItemized: true,
          paymentMode: 'BANK_TRANSFER',
        },
      },
    ]);

    render(<TransactionHistoryTab entityType="Expense" entityId="exp-multi" />);

    await waitFor(() => {
      expect(screen.getByText('Expense Modified')).toBeTruthy();
    });

    // Expand details
    const viewBtn = screen.getByText('View Changes');
    fireEvent.click(viewBtn);

    // Verify Changes Summary header
    expect(screen.getByText(/Changes Summary/i)).toBeTruthy();

    // Verify humanized labels
    expect(screen.getAllByText('Amount').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vendor Invoice #').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tax Rate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Itemized Expense').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Payment Mode').length).toBeGreaterThan(0);

    // Verify formatted values (currency, percentages, booleans)
    expect(screen.getAllByText('₹4,500.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₹5,310.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('18%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('INV-2026-001').length).toBeGreaterThan(0);
    expect(screen.getAllByText('INV-2026-001-REV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);

    // Verify no JSON or code blocks exist in DOM
    expect(screen.queryByText(/\{"amount":/)).toBeNull();
    expect(screen.queryByText(/\{"vendorInvoiceNumber":/)).toBeNull();
  });
});
