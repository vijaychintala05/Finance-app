// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { CustomerWorkspace } from '../components/clients/CustomerWorkspace';
import { VendorWorkspace } from '../components/purchases/VendorWorkspace';
import { ExpenseModal } from '../components/expenses/ExpenseModal';
import { BooksProvider } from '../context/BooksContext';
import { Client, Vendor } from '../types';

import { apiClient } from '../api/client';

describe('T5: Expense Receipts & Period Statements Unit Test Suite', () => {
  const mockClient: Client = {
    id: 'client-101',
    name: 'Acme Corp',
    companyName: 'Acme Technologies Pvt Ltd',
    email: 'finance@acme.com',
    phone: '+91 99887 76655',
    billingAddress: '123 Tech Park, Bangalore',
    taxId: '29ABCDE1234F1Z5',
    currency: 'INR',
    paymentTerms: 'Net 30',
    createdAt: '2026-01-01T00:00:00Z',
  };

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
    // Mock URL createObjectURL and revokeObjectURL for jsdom
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn((file: File | Blob) => `blob:http://localhost/${(file as File).name || 'blob'}`);
    }
    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    cleanup();
  });

  // ---------------------------------------------------------------------------
  // T5a: Expense Modal Receipt Attachments & Previews
  // ---------------------------------------------------------------------------
  describe('T5a: Expense Receipt Image Previews & Lifecycle', () => {
    it('1. Renders receipt upload picker and handles image selection with thumbnail previews', async () => {
      render(
        <ExpenseModal
          isOpen={true}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      expect(screen.getByText(/Receipt images \(optional\)/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /add images/i })).toBeDefined();

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(fileInput).toBeDefined();

      const file1 = new File(['sample image bytes 1'], 'receipt_store.jpg', { type: 'image/jpeg' });
      const file2 = new File(['sample image bytes 2'], 'bill_invoice.png', { type: 'image/png' });

      fireEvent.change(fileInput, {
        target: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(screen.getByText('receipt_store.jpg')).toBeDefined();
        expect(screen.getByText('bill_invoice.png')).toBeDefined();
      });

      // Verify images are rendered with object URLs
      const renderedImages = document.querySelectorAll('img[alt="receipt_store.jpg"], img[alt="bill_invoice.png"]');
      expect(renderedImages.length).toBe(2);
    });

    it('2. Allows individual removal of prepared receipt images before posting', async () => {
      render(
        <ExpenseModal
          isOpen={true}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file1 = new File(['bytes 1'], 'receipt1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['bytes 2'], 'receipt2.jpg', { type: 'image/jpeg' });

      fireEvent.change(fileInput, {
        target: { files: [file1, file2] },
      });

      await waitFor(() => {
        expect(screen.getByText('receipt1.jpg')).toBeDefined();
        expect(screen.getByText('receipt2.jpg')).toBeDefined();
      });

      // Remove the first receipt
      const removeButtons = screen.getAllByTitle(/Remove receipt/i);
      expect(removeButtons.length).toBe(2);
      fireEvent.click(removeButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText('receipt1.jpg')).toBeNull();
        expect(screen.getByText('receipt2.jpg')).toBeDefined();
      });
    });

    it('3. Enforces 3 image attachment limit and shows validation warning', async () => {
      render(
        <ExpenseModal
          isOpen={true}
          onClose={vi.fn()}
        />,
        { wrapper }
      );

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [
        new File(['1'], 'img1.jpg', { type: 'image/jpeg' }),
        new File(['2'], 'img2.jpg', { type: 'image/jpeg' }),
        new File(['3'], 'img3.jpg', { type: 'image/jpeg' }),
        new File(['4'], 'img4.jpg', { type: 'image/jpeg' }),
      ];

      fireEvent.change(fileInput, {
        target: { files },
      });

      await waitFor(() => {
        expect(screen.getByText(/Attach up to three receipt images/i)).toBeDefined();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // T5b: Customer Period Statement
  // ---------------------------------------------------------------------------
  describe('T5b: Customer Statement Period Filtering & Reconciled Balances', () => {
    it('1. Switches to Statement tab and displays period metrics and date range', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue({
        data: {
          customerId: mockClient.id,
          customerName: mockClient.companyName,
          fromDate: '2026-04-01',
          toDate: '2026-09-01',
          openingBalance: 1000,
          totalInvoices: 5000,
          totalPayments: 2000,
          totalCredits: 0,
          closingBalance: 4000,
          transactions: [
            {
              date: '2026-05-10',
              type: 'Invoice',
              reference: 'INV-001',
              debit: 5000,
              credit: 0,
              runningBalance: 6000,
            },
          ],
        },
      } as any);

      render(
        <CustomerWorkspace
          client={mockClient}
          onBack={vi.fn()}
          onEdit={vi.fn()}
        />,
        { wrapper }
      );

      const statementTab = screen.getByRole('button', { name: /statement/i });
      fireEvent.click(statementTab);

      expect(screen.getByText(/Customer Statement of Account/i)).toBeDefined();

      // Period filters
      expect(screen.getByRole('button', { name: /^mtd$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^last month$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^qtd$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^ytd$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^all$/i })).toBeDefined();
    });

    it('2. Clicking period buttons updates date range and triggers server fetch', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        data: {
          customerId: mockClient.id,
          customerName: mockClient.companyName,
          fromDate: '1970-01-01',
          toDate: new Date().toISOString().slice(0, 10),
          openingBalance: 0,
          totalInvoices: 10000,
          totalPayments: 5000,
          totalCredits: 0,
          closingBalance: 5000,
          transactions: [],
        },
      } as any);

      render(
        <CustomerWorkspace
          client={mockClient}
          onBack={vi.fn()}
          onEdit={vi.fn()}
        />,
        { wrapper }
      );

      const statementTab = screen.getByRole('button', { name: /statement/i });
      fireEvent.click(statementTab);

      const allBtn = screen.getByRole('button', { name: /^all$/i });
      fireEvent.click(allBtn);

      await waitFor(() => {
        expect(screen.getByText(/All Time/i)).toBeDefined();
        expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('fromDate=1970-01-01'));
      });
    });

    it('3. Customer statement print button triggers browser print dialogue', () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      render(
        <CustomerWorkspace
          client={mockClient}
          onBack={vi.fn()}
          onEdit={vi.fn()}
        />,
        { wrapper }
      );

      const statementTab = screen.getByRole('button', { name: /statement/i });
      fireEvent.click(statementTab);

      const printBtn = screen.getByRole('button', { name: /print statement/i });
      fireEvent.click(printBtn);

      expect(printSpy).toHaveBeenCalled();
    });

    it('4. Customer statement fetches and renders authoritative server statement data', async () => {
      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        const urlObj = new URL(`http://localhost${url}`);
        const fromDate = urlObj.searchParams.get('fromDate') || '2026-04-01';
        const toDate = urlObj.searchParams.get('toDate') || '2026-09-01';
        return {
          data: {
            customerId: mockClient.id,
            customerName: mockClient.companyName,
            fromDate,
            toDate,
            openingBalance: 2500,
            totalInvoices: 15000,
            totalPayments: 5000,
            totalCredits: 1000,
            closingBalance: 11500,
            transactions: [
              {
                date: '2026-05-15',
                type: 'Invoice',
                reference: 'INV-AUTH-100',
                debit: 15000,
                credit: 0,
                runningBalance: 17500,
              },
            ],
          },
        } as any;
      });

      render(
        <CustomerWorkspace
          client={mockClient}
          onBack={vi.fn()}
          onEdit={vi.fn()}
        />,
        { wrapper }
      );

      const statementTab = screen.getByRole('button', { name: /statement/i });
      fireEvent.click(statementTab);

      await waitFor(() => {
        expect(screen.getByText('Opening Balance')).toBeDefined();
        expect(screen.getByText('INV-AUTH-100')).toBeDefined();
      });
    });

    it('5. Switching customer date range clears previous statement, shows loading state, and guarantees stale figures never render under the new period label', async () => {
      let resolvePromise: (val: any) => void = () => {};
      let delayCount = 0;

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        delayCount++;
        const urlObj = new URL(`http://localhost${url}`);
        const fromDate = urlObj.searchParams.get('fromDate') || '';
        const toDate = urlObj.searchParams.get('toDate') || '';

        if (delayCount === 1) {
          // First fetch (YTD) returns immediately
          return {
            data: {
              customerId: mockClient.id,
              customerName: mockClient.companyName,
              fromDate,
              toDate,
              openingBalance: 9999,
              totalInvoices: 9999,
              totalPayments: 0,
              totalCredits: 0,
              closingBalance: 19998,
              transactions: [
                {
                  date: fromDate,
                  type: 'Invoice',
                  reference: 'OLD-STALE-INV',
                  debit: 9999,
                  credit: 0,
                  runningBalance: 19998,
                },
              ],
            },
          } as any;
        }

        // Second fetch is delayed
        return new Promise((resolve) => {
          resolvePromise = () =>
            resolve({
              data: {
                customerId: mockClient.id,
                customerName: mockClient.companyName,
                fromDate,
                toDate,
                openingBalance: 123,
                totalInvoices: 456,
                totalPayments: 0,
                totalCredits: 0,
                closingBalance: 579,
                transactions: [
                  {
                    date: fromDate,
                    type: 'Invoice',
                    reference: 'NEW-FRESH-INV',
                    debit: 456,
                    credit: 0,
                    runningBalance: 579,
                  },
                ],
              },
            } as any);
        });
      });

      render(
        <CustomerWorkspace
          client={mockClient}
          onBack={vi.fn()}
          onEdit={vi.fn()}
        />,
        { wrapper }
      );

      const statementTab = screen.getByRole('button', { name: /statement/i });
      fireEvent.click(statementTab);

      // Verify old period loaded
      await waitFor(() => {
        expect(screen.getByText('OLD-STALE-INV')).toBeDefined();
      });

      // Switch to All Time
      const allBtn = screen.getByRole('button', { name: /^all$/i });
      fireEvent.click(allBtn);

      // Verify loading state is shown and old stale transaction is immediately removed
      await waitFor(() => {
        expect(screen.getByTestId('statement-loading')).toBeDefined();
        expect(screen.queryByText('OLD-STALE-INV')).toBeNull();
      });

      // Resolve delayed promise
      resolvePromise(null);

      // Verify fresh statement is rendered
      await waitFor(() => {
        expect(screen.getByText('NEW-FRESH-INV')).toBeDefined();
        expect(screen.queryByTestId('statement-loading')).toBeNull();
      });
    });

    it('6. Customer statement fails closed on server error: displays error alert with retry button and does not show local calculation', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network gateway timeout'));

      render(
        <CustomerWorkspace
          client={mockClient}
          onBack={vi.fn()}
          onEdit={vi.fn()}
        />,
        { wrapper }
      );

      const statementTab = screen.getByRole('button', { name: /statement/i });
      fireEvent.click(statementTab);

      await waitFor(() => {
        expect(screen.getByTestId('statement-error')).toBeDefined();
        expect(screen.getByText(/Unable to load statement/i)).toBeDefined();
        expect(screen.getByText(/Network gateway timeout/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
      });

      // Verify no statement table or metric cards leaked through fallback
      expect(screen.queryByText('Opening Balance Forward')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // T5b: Vendor Period Statement
  // ---------------------------------------------------------------------------
  describe('T5b: Vendor Statement Period Filtering & Reconciled Balances', () => {
    it('1. Switches to Statement tab and displays period metrics and date range', () => {
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

      expect(screen.getByText(/Vendor Statement of Account/i)).toBeDefined();

      // Period filters
      expect(screen.getByRole('button', { name: /^mtd$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^last month$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^qtd$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^ytd$/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /^all$/i })).toBeDefined();
    });

    it('2. Clicking period buttons updates date range and triggers server fetch', async () => {
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        data: {
          vendorId: mockVendor.id,
          vendorName: mockVendor.name,
          fromDate: '1970-01-01',
          toDate: new Date().toISOString().slice(0, 10),
          openingBalance: 0,
          totalBills: 12000,
          totalPayments: 8000,
          totalDebits: 0,
          closingBalance: 4000,
          transactions: [],
        },
      } as any);

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

      const allBtn = screen.getByRole('button', { name: /^all$/i });
      fireEvent.click(allBtn);

      await waitFor(() => {
        expect(screen.getByText(/All Time/i)).toBeDefined();
        expect(getSpy).toHaveBeenCalledWith(expect.stringContaining('fromDate=1970-01-01'));
      });
    });

    it('3. Vendor statement print button triggers browser print dialogue', () => {
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

    it('4. Vendor statement fetches and renders authoritative server statement data', async () => {
      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        const urlObj = new URL(`http://localhost${url}`);
        const fromDate = urlObj.searchParams.get('fromDate') || '2026-04-01';
        const toDate = urlObj.searchParams.get('toDate') || '2026-09-01';
        return {
          data: {
            vendorId: mockVendor.id,
            vendorName: mockVendor.name,
            fromDate,
            toDate,
            openingBalance: 4000,
            totalBills: 20000,
            totalPayments: 10000,
            totalDebits: 2000,
            closingBalance: 12000,
            transactions: [
              {
                date: '2026-05-20',
                type: 'Bill',
                reference: 'BILL-AUTH-500',
                debit: 20000,
                credit: 0,
                runningBalance: 24000,
              },
            ],
          },
        } as any;
      });

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

      await waitFor(() => {
        expect(screen.getByText('Opening Balance')).toBeDefined();
        expect(screen.getByText(/BILL-AUTH-500/i)).toBeDefined();
      });
    });

    it('5. Switching vendor date range clears previous statement, shows loading state, and guarantees stale figures never render under the new period label', async () => {
      let resolvePromise: (val: any) => void = () => {};
      let delayCount = 0;

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        delayCount++;
        const urlObj = new URL(`http://localhost${url}`);
        const fromDate = urlObj.searchParams.get('fromDate') || '';
        const toDate = urlObj.searchParams.get('toDate') || '';

        if (delayCount === 1) {
          return {
            data: {
              vendorId: mockVendor.id,
              vendorName: mockVendor.name,
              fromDate,
              toDate,
              openingBalance: 5000,
              totalBills: 5000,
              totalPayments: 0,
              totalDebits: 0,
              closingBalance: 10000,
              transactions: [
                {
                  date: fromDate,
                  type: 'Bill',
                  reference: 'OLD-STALE-BILL',
                  debit: 5000,
                  credit: 0,
                  runningBalance: 10000,
                },
              ],
            },
          } as any;
        }

        return new Promise((resolve) => {
          resolvePromise = () =>
            resolve({
              data: {
                vendorId: mockVendor.id,
                vendorName: mockVendor.name,
                fromDate,
                toDate,
                openingBalance: 500,
                totalBills: 1500,
                totalPayments: 0,
                totalDebits: 0,
                closingBalance: 2000,
                transactions: [
                  {
                    date: fromDate,
                    type: 'Bill',
                    reference: 'NEW-FRESH-BILL',
                    debit: 1500,
                    credit: 0,
                    runningBalance: 2000,
                  },
                ],
              },
            } as any);
        });
      });

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

      // Verify old period loaded
      await waitFor(() => {
        expect(screen.getByText(/OLD-STALE-BILL/i)).toBeDefined();
      });

      // Switch to All Time
      const allBtn = screen.getByRole('button', { name: /^all$/i });
      fireEvent.click(allBtn);

      // Verify loading state is shown and old stale transaction is immediately removed
      await waitFor(() => {
        expect(screen.getByTestId('statement-loading')).toBeDefined();
        expect(screen.queryByText(/OLD-STALE-BILL/i)).toBeNull();
      });

      // Resolve delayed promise
      resolvePromise(null);

      // Verify fresh statement is rendered
      await waitFor(() => {
        expect(screen.getByText(/NEW-FRESH-BILL/i)).toBeDefined();
        expect(screen.queryByTestId('statement-loading')).toBeNull();
      });
    });

    it('6. Vendor statement fails closed on server error: displays error alert with retry button and does not show local calculation', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Vendor service unavailable'));

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

      await waitFor(() => {
        expect(screen.getByTestId('statement-error')).toBeDefined();
        expect(screen.getByText(/Unable to load statement/i)).toBeDefined();
        expect(screen.getByText(/Vendor service unavailable/i)).toBeDefined();
        expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
      });

      // Verify no statement table or metric cards leaked through fallback
      expect(screen.queryByText('Opening Balance Forward')).toBeNull();
    });
  });
});
