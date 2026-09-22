import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { BankStatementParserFactory } from '../banking/parsers/BankStatementParserFactory';

describe('Secure XLSX statement boundary', () => {
  it('parses a real XLSX workbook without SheetJS', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Statement');
    sheet.addRows([
      ['HDFC Bank Statement - Account No: 50100234567890'],
      ['Date', 'Narration', 'Ref No', 'Withdrawal', 'Deposit', 'Balance'],
      [new Date('2026-09-05T00:00:00.000Z'), 'Client remittance', 'UTR-100', '', 50000, 60000],
      [new Date('2026-09-08T00:00:00.000Z'), 'Office rent', 'CHQ-101', 15000, '', 45000],
    ]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    const parsed = await BankStatementParserFactory.parseStatement(
      file.toString('base64'),
      'bank-xlsx-1',
      'XLSX',
      undefined,
      'HDFC-September.xlsx',
    );

    expect(parsed.parserVersion).toBe('3.0');
    expect(parsed.detectedBankName).toContain('HDFC');
    expect(parsed.detectedAccountNumber).toBe('50100234567890');
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0]).toEqual(expect.objectContaining({
      transactionDate: '2026-09-05',
      direction: 'CREDIT',
      amount: 50000,
    }));
  });

  it('rejects legacy binary XLS with an actionable safe-conversion message', async () => {
    const legacyHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

    await expect(BankStatementParserFactory.parseStatement(
      legacyHeader.toString('base64'),
      'bank-xls-1',
      'XLS',
      undefined,
      'legacy-statement.xls',
    )).rejects.toThrow(/LEGACY_XLS_BINARY_UNSUPPORTED.*CSV or XLSX/);
  });
});
