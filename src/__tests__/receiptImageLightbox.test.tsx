// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ImageLightboxModal } from '../components/common/ImageLightboxModal';
import { ExpenseDetailsModal } from '../components/expenses/ExpenseDetailsModal';
import { ExpenseModal } from '../components/expenses/ExpenseModal';
import { Expense, Account } from '../types';

const mockAccounts: Account[] = [
  {
    id: 'acc-exp-1',
    code: '6010',
    name: 'Travel & Lodging',
    type: 'Expense',
    subType: 'Travel & Vehicle',
    balance: 500,
    status: 'Active',
    normalBalance: 'Debit',
  },
  {
    id: 'acc-bank-1',
    code: '1010',
    name: 'HDFC Current Bank',
    type: 'Asset',
    subType: 'Bank',
    balance: 10000,
    status: 'Active',
    normalBalance: 'Debit',
  },
];

const mockExpenseWithReceipts: Expense = {
  id: 'exp-test-123',
  referenceNumber: 'EXP-2026-0001',
  date: '2026-09-24',
  amount: 250,
  currency: 'INR',
  accountId: 'acc-exp-1',
  accountName: 'Travel & Lodging',
  paidFromAccountId: 'acc-bank-1',
  paidFromAccountName: 'HDFC Current Bank',
  vendorName: 'Hotel Sunrise',
  paymentStatus: 'Paid',
  status: 'POSTED',
  receiptAttachments: [
    {
      id: 'rcpt-hotel-bill',
      fileName: 'hotel_invoice_sept2026.png',
      mimeType: 'image/png',
      byteSize: 245760, // 240 KB
    },
  ],
  createdAt: '2026-09-24T00:00:00.000Z',
};

vi.mock('../context/BooksContext', () => ({
  useBooks: () => ({
    accounts: mockAccounts,
    refreshAccounts: vi.fn().mockResolvedValue(undefined),
    vendors: [],
    clients: [],
    projects: [],
    expenses: [mockExpenseWithReceipts],
    journalEntries: [],
    settings: {
      currencyCode: 'INR',
      currencySymbol: '₹',
      expensesSettings: {
        defaultMarkupPercentage: 10,
      },
    },
    addExpense: vi.fn().mockResolvedValue(undefined),
    updateExpense: vi.fn().mockResolvedValue(undefined),
    deleteExpense: vi.fn().mockResolvedValue(undefined),
    convertExpenseToInvoice: vi.fn().mockResolvedValue(undefined),
    attachExpenseReceipts: vi.fn().mockResolvedValue({ data: [], requestId: 'req-1', refreshFailed: false }),
  }),
}));

vi.mock('../api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    getBlob: vi.fn().mockImplementation(() => {
      const blob = new Blob(['dummy-image-content'], { type: 'image/png' });
      return Promise.resolve({ data: blob });
    }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
  ApiRequestError: class extends Error {},
}));

describe('Native Image Lightbox & Receipt Viewer', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost:55000/mock-receipt-blob-123');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('ImageLightboxModal component', () => {
    it('does not render when isOpen is false', () => {
      render(
        <ImageLightboxModal
          isOpen={false}
          onClose={vi.fn()}
          imageUrl="blob:http://localhost/test.png"
          title="test.png"
        />
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders with image, title, file size, and controls when isOpen is true', () => {
      const handleClose = vi.fn();
      render(
        <ImageLightboxModal
          isOpen={true}
          onClose={handleClose}
          imageUrl="blob:http://localhost/receipt.png"
          title="receipt.png"
          byteSize={102400}
        />
      );

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('receipt.png')).toBeDefined();
      expect(screen.getByText('100 KB • JPG/PNG/WebP')).toBeDefined();
      expect(screen.getByLabelText('Zoom in')).toBeDefined();
      expect(screen.getByLabelText('Zoom out')).toBeDefined();
      expect(screen.getByLabelText('Reset zoom to 100%')).toBeDefined();
      expect(screen.getByLabelText('Rotate image')).toBeDefined();
      expect(screen.getByLabelText('Download image')).toBeDefined();
      expect(screen.getByLabelText('Close image viewer')).toBeDefined();

      const img = screen.getByAltText('receipt.png') as HTMLImageElement;
      expect(img).toBeDefined();
      expect(img.src).toBe('blob:http://localhost/receipt.png');
    });

    it('handles zoom in and zoom out interactions', () => {
      render(
        <ImageLightboxModal
          isOpen={true}
          onClose={vi.fn()}
          imageUrl="blob:http://localhost/receipt.png"
          title="receipt.png"
        />
      );

      const zoomInBtn = screen.getByLabelText('Zoom in');
      const zoomResetBtn = screen.getByLabelText('Reset zoom to 100%');

      expect(zoomResetBtn.textContent).toBe('100%');

      fireEvent.click(zoomInBtn);
      expect(zoomResetBtn.textContent).toBe('125%');

      fireEvent.click(zoomInBtn);
      expect(zoomResetBtn.textContent).toBe('150%');

      const zoomOutBtn = screen.getByLabelText('Zoom out');
      fireEvent.click(zoomOutBtn);
      expect(zoomResetBtn.textContent).toBe('125%');

      fireEvent.click(zoomResetBtn);
      expect(zoomResetBtn.textContent).toBe('100%');
    });

    it('handles keyboard shortcuts: Escape closes the viewer, + and - zoom', () => {
      const handleClose = vi.fn();
      render(
        <ImageLightboxModal
          isOpen={true}
          onClose={handleClose}
          imageUrl="blob:http://localhost/receipt.png"
          title="receipt.png"
        />
      );

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Press + to zoom in
      const zoomResetBtn = screen.getByLabelText('Reset zoom to 100%');
      fireEvent.keyDown(window, { key: '+' });
      expect(zoomResetBtn.textContent).toBe('125%');

      // Press - to zoom out
      fireEvent.keyDown(window, { key: '-' });
      expect(zoomResetBtn.textContent).toBe('100%');
    });

    it('calls onClose when close button is clicked', () => {
      const handleClose = vi.fn();
      render(
        <ImageLightboxModal
          isOpen={true}
          onClose={handleClose}
          imageUrl="blob:http://localhost/receipt.png"
          title="receipt.png"
        />
      );

      const closeBtn = screen.getByLabelText('Close image viewer');
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('downloads the image file when download button is clicked', () => {
      render(
        <ImageLightboxModal
          isOpen={true}
          onClose={vi.fn()}
          imageUrl="blob:http://localhost/receipt.png"
          title="receipt.png"
        />
      );

      const downloadBtn = screen.getByLabelText('Download image');
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      fireEvent.click(downloadBtn);
      expect(clickSpy).toHaveBeenCalled();
      clickSpy.mockRestore();
    });
  });

  describe('ExpenseDetailsModal integration', () => {
    it('renders receipt attachment button and opens lightbox on click instead of navigating with a target=_blank link', async () => {
      render(
        <ExpenseDetailsModal
          isOpen={true}
          onClose={vi.fn()}
          expense={mockExpenseWithReceipts}
        />
      );

      // Wait for blob url to load
      await waitFor(() => {
        expect(screen.getByTitle('View hotel_invoice_sept2026.png')).toBeDefined();
      });

      const receiptButton = screen.getByTitle('View hotel_invoice_sept2026.png');
      expect(receiptButton.tagName).toBe('BUTTON');

      // Lightbox is closed initially
      expect(screen.queryByRole('dialog', { name: /Receipt Preview/i })).toBeNull();

      // Click the receipt thumbnail
      fireEvent.click(receiptButton);

      // Lightbox should now be visible
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Receipt Preview: hotel_invoice_sept2026.png/i })).toBeDefined();
      });

      // Filename should be displayed in the lightbox header
      expect(screen.getAllByText('hotel_invoice_sept2026.png').length).toBeGreaterThanOrEqual(1);

      // Close the lightbox
      const closeBtn = screen.getByLabelText('Close image viewer');
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Receipt Preview/i })).toBeNull();
      });
    });
  });

  describe('ExpenseModal integration', () => {
    it('displays saved receipt attachments when editing an existing expense and opens lightbox on click', async () => {
      render(
        <ExpenseModal
          isOpen={true}
          onClose={vi.fn()}
          expenseToEdit={mockExpenseWithReceipts}
        />
      );

      // Wait for existing receipt to be loaded into state
      await waitFor(() => {
        expect(screen.getByText('Saved attachments (1)')).toBeDefined();
      });

      expect(screen.getByText('hotel_invoice_sept2026.png')).toBeDefined();
      expect(screen.getByText('Saved')).toBeDefined();

      // Lightbox is closed initially
      expect(screen.queryByRole('dialog', { name: /Receipt Preview/i })).toBeNull();

      // Click the saved attachment
      const savedReceiptItem = screen.getByTitle('Click to view full receipt');
      fireEvent.click(savedReceiptItem);

      // Lightbox should open
      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Receipt Preview: hotel_invoice_sept2026.png/i })).toBeDefined();
      });

      // Close lightbox
      const closeBtn = screen.getByLabelText('Close image viewer');
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Receipt Preview/i })).toBeNull();
      });
    });
  });
});
