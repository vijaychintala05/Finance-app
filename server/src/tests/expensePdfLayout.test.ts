import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExpensePdfService } from '../services/ExpensePdfService';
import { DocumentTemplateService } from '../services/DocumentTemplateService';
import { types } from 'pg';

type Position = { text: string; page: number; y: number; height: number };

async function positions(buffer: Buffer): Promise<Position[]> {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse(Uint8Array.from(buffer));
  try {
    await parser.getText();
    const result: Position[] = [];
    for (let pageNumber = 1; pageNumber <= parser.doc.numPages; pageNumber++) {
      const page = await parser.doc.getPage(pageNumber);
      const content = await page.getTextContent();
      result.push(...content.items.filter((item: any) => typeof item.str === 'string').map((item: any) => ({
        text: item.str, page: pageNumber, y: item.transform[5], height: item.height,
      })));
      page.cleanup();
    }
    return result;
  } finally {
    await parser.destroy();
  }
}

function expectBefore(items: Position[], first: string, second: string) {
  const a = items.find((item) => item.text.includes(first));
  const b = items.find((item) => item.text.includes(second));
  expect(a, first).toBeDefined();
  expect(b, second).toBeDefined();
  if (a!.page === b!.page) expect(a!.y).toBeGreaterThan(b!.y + b!.height);
  else expect(a!.page).toBeLessThan(b!.page);
}

describe('Expense voucher measured geometry', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fits the compact fixture with PostgreSQL-parsed dates without changing fonts or content', async () => {
    vi.spyOn(DocumentTemplateService, 'resolve').mockResolvedValue({
      id: 'template', organizationId: 'org', category: 'expenses', modelId: 'petty-cash',
      name: 'Compact voucher', paperSize: 'A5', orientation: 'landscape', layoutFamily: 'compact',
      isActive: true, isSystem: true,
      configuration: {
        paperSize: 'A5', orientation: 'landscape', fontFamily: 'Courier', headerLayout: 'centered',
        templateTitle: 'CUSTOM EXPENSE CONFIGURATION', showAmountInWords: false, showExpenseCategory: false,
      },
    });
    const query = vi.fn(async (sql: string) => {
      expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
      if (sql.includes('FROM expenses')) return { rows: [{
        id: 'expense-12345678', amount: 125, status: 'POSTED', date: types.getTypeParser(1082)('2026-08-11'),
        expense_number: 'EXP-2026-0001', expense_account_id: 'cost', paid_from_account_id: 'bank',
        journal_entry_id: 'journal', description: 'Template configuration regression',
        created_by: 'usr-12345678-1234-1234-1234-123456789012',
      }] };
      if (sql.includes('FROM organizations')) return { rows: [{ name: 'Voucher Org A 1790419326006', country: 'Test Jurisdiction', base_currency: 'USD' }] };
      if (sql.includes('FROM accounts')) return { rows: [
        { id: 'cost', name: 'Operating Expense', code: '6000' },
        { id: 'bank', name: 'Operating Bank Account', code: '1000' },
      ] };
      if (sql.includes('FROM journal_entries')) return { rows: [
        { id: 'debit', account_name: 'Operating Expense', description: '', debit: 125, credit: 0 },
        { id: 'credit', account_name: 'Operating Bank Account', description: '', debit: 0, credit: 125 },
      ] };
      return { rows: [] };
    });
    const pdf = await ExpensePdfService.generateExpensePdf({ query } as any, 'org', 'expense');
    const items = await positions(pdf);
    const text = items.map((item) => item.text).join(' ').replace(/\s+/g, ' ');
    expect(new Set(items.map((item) => item.page)).size).toBe(1);
    expect(text.match(/Page 1 of 1/g)).toHaveLength(1);
    expect(text).toContain('CUSTOM EXPENSE CONFIGURATION');
    expect(text).toContain('Template configuration regression');
    expect(text).toContain('Claimant: Not specified');
    expect(text).toContain('Posting total: USD 125.00');
    expect(pdf.toString('latin1')).toContain('/Courier');
    const footer = items.find((item) => item.text.includes('Page 1 of 1'))!;
    const reimbursement = items.find((item) => item.text.includes('Reimbursement:'))!;
    expect(reimbursement.y).toBeGreaterThan(footer.y + footer.height + 8);
  });

  for (const fontFamily of ['Helvetica', 'Courier', 'Times-Roman']) {
    for (const orientation of ['portrait', 'landscape']) {
      for (const headerLayout of ['split', 'centered']) {
        it(`${fontFamily} A5 ${orientation} ${headerLayout} keeps wrapped sections separate`, async () => {
          const postingAmount = orientation === 'portrait' ? 1234567890.25 : 125;
          vi.spyOn(DocumentTemplateService, 'resolve').mockResolvedValue({
            id: 'template', organizationId: 'org', category: 'expenses', modelId: 'petty-cash',
            name: 'Petty cash', paperSize: 'A5', orientation, layoutFamily: 'compact',
            isActive: true, isSystem: true,
            configuration: {
              fontFamily, paperSize: 'A5', orientation, headerLayout,
              templateTitle: 'CUSTOM_HEADER_END', showExpenseCategory: false,
              showAmountInWords: orientation === 'portrait', showReceiptsAttached: true,
            },
          });
          const query = vi.fn(async (sql: string) => {
            expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
            if (sql.includes('FROM expenses')) return { rows: [{
              id: 'expense', amount: postingAmount, status: 'POSTED', date: '2026-09-26',
              expense_number: `REF-${'LONGREFERENCE'.repeat(4)}-END`,
              vendor_name: `${'Vendor name wraps safely '.repeat(8)}VENDOR_END`,
              created_by: 'recorder-not-claimant', expense_account_id: 'cost',
              paid_from_account_id: 'bank', journal_entry_id: 'journal',
              payment_method: 'Bank transfer',
              vendor_invoice_number: `${'Supplier reference '.repeat(5)}SUPPLIER_END`,
            }] };
            if (sql.includes('FROM organizations')) return { rows: [{
              name: `${'Organization name wraps '.repeat(6)}ORGANIZATION_END`,
              address: 'ADDRESS_START Street 100', base_currency: 'INR',
            }] };
            if (sql.includes('FROM accounts')) return { rows: [
              { id: 'cost', name: 'Operating expense', code: '5000', type: 'Expense' },
              { id: 'bank', name: 'Business bank', code: '1000', type: 'Asset' },
            ] };
            if (sql.includes('FROM journal_entries')) return { rows: [
              { id: 'debit', account_name: 'Operating expense', description: 'Recorded expense', debit: postingAmount, credit: 0 },
              { id: 'credit', account_name: 'Business bank', description: 'Recorded bank payment', debit: 0, credit: postingAmount },
            ] };
            if (sql.includes('FROM expense_receipt_attachments')) return { rows: [{
              file_name: 'receipt-evidence.png', mime_type: 'image/png', byte_size: 100,
              content_base64: Buffer.from('invalid image').toString('base64'),
            }] };
            return { rows: [] };
          });
          const pdf = await ExpensePdfService.generateExpensePdf({ query } as any, 'org', 'expense');
          const items = await positions(pdf);
          expectBefore(items, 'PETTY CASH VOUCHER', 'CUSTOM_HEADER_END');
          expectBefore(items, 'CUSTOM_HEADER_END', 'REF-');
          expectBefore(items, 'ORGANIZATION_END', 'ADDRESS_START');
          expectBefore(items, 'VENDOR_END', 'ACCOUNT / CATEGORY');
          const traceStart = items.findIndex((item) => item.text.includes('POSTING TRACE'));
          expect(traceStart).toBeGreaterThanOrEqual(0);
          expectBefore(items.slice(traceStart + 1), '-END', 'Reimbursement:');
          if (orientation === 'portrait') expectBefore(items, 'Only', 'RECORDED DOCUMENT');
          const annexureStart = items.findIndex((item) => item.text.includes('Supporting documentation'));
          expect(annexureStart).toBeGreaterThanOrEqual(0);
          expectBefore(items.slice(annexureStart), 'attachment)', 'Receipt 1:');
          const text = items.map((item) => item.text).join(' ').replace(/\s+/g, ' ');
          expect(text).toContain('Claimant: Not specified');
          expect(text).not.toContain('Claimant: recorder-not-claimant');
          expect(text).not.toContain('CASH DISBURSEMENT');
          expect(text).not.toContain('CASH RECIPIENT');
          expect(text).toContain(`Posting total: ${ExpensePdfService.formatAmount(postingAmount, 'INR')}`);
          expect(text).toContain('[Receipt image preview could not be rendered]');
        });
      }
    }
  }
});
