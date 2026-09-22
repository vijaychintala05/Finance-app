import crypto from 'crypto';
import ExcelJS from 'exceljs';
import {
  BANK_STATEMENT_FORMAT_LABEL,
  BankStatementSourceFormat,
  isSupportedBankStatementExtension,
  ParsedStatementResult,
  ParsedTransactionLine,
} from '../../../../src/types/banking';
import { CsvXlsxParser } from './CsvXlsxParser';

export class BankStatementParserFactory {
  private static readonly MAX_XLSX_BYTES = 8 * 1024 * 1024;
  private static readonly MAX_XLSX_ENTRIES = 500;
  private static readonly MAX_XLSX_EXPANDED_BYTES = 64 * 1024 * 1024;
  private static readonly MAX_XLSX_ROWS = 50_000;
  private static readonly MAX_XLSX_COLUMNS = 100;
  private static readonly MAX_XLSX_CELLS = 500_000;

  private static decodeFileContent(content: string): Buffer {
    if (content.startsWith('data:') && content.includes('base64,')) {
      return Buffer.from(content.slice(content.indexOf('base64,') + 7), 'base64');
    }
    if (/^(?:UEsDB|0M8R4KGx)/.test(content.trim()) || (/^[A-Za-z0-9+/=\r\n]+$/.test(content.trim()) && content.trim().length > 100)) {
      return Buffer.from(content.trim(), 'base64');
    }
    return Buffer.from(content, 'utf8');
  }

  private static decodeHtmlText(value: string): string {
    return value
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;|&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private static htmlTableToCsv(html: string): string {
    const rows: string[] = [];
    for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = Array.from(rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi))
        .map((cellMatch) => this.decodeHtmlText(cellMatch[1]));
      if (cells.length > 0) {
        rows.push(cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','));
      }
    }
    if (rows.length === 0) {
      throw new Error('EXCEL_PARSE_ERROR: The HTML bank export does not contain a readable transaction table. Export it as CSV or XLSX and retry.');
    }
    return rows.join('\n');
  }

  private static assertSafeXlsxArchive(buffer: Buffer): void {
    if (buffer.length > this.MAX_XLSX_BYTES) {
      throw new Error(`XLSX_FILE_TOO_LARGE: Excel statements must be ${this.MAX_XLSX_BYTES / 1024 / 1024} MB or smaller.`);
    }

    const eocdSignature = 0x06054b50;
    const centralSignature = 0x02014b50;
    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocdOffset = -1;
    for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
      if (buffer.readUInt32LE(offset) === eocdSignature) {
        eocdOffset = offset;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error('XLSX_ARCHIVE_INVALID: The Excel file is not a valid XLSX archive.');

    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    const centralSize = buffer.readUInt32LE(eocdOffset + 12);
    const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error('XLSX_ZIP64_UNSUPPORTED: ZIP64 Excel statements are not accepted. Export a smaller CSV or XLSX file.');
    }
    if (entryCount < 1 || entryCount > this.MAX_XLSX_ENTRIES) {
      throw new Error(`XLSX_ENTRY_LIMIT: Excel statements may contain at most ${this.MAX_XLSX_ENTRIES} archive entries.`);
    }
    if (centralOffset + centralSize > eocdOffset || centralOffset < 0) {
      throw new Error('XLSX_ARCHIVE_INVALID: The Excel archive directory is malformed.');
    }

    let offset = centralOffset;
    let expandedBytes = 0;
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralSignature) {
        throw new Error('XLSX_ARCHIVE_INVALID: The Excel archive contains a malformed entry.');
      }
      const flags = buffer.readUInt16LE(offset + 8);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      if ((flags & 0x1) !== 0) throw new Error('XLSX_ENCRYPTED_UNSUPPORTED: Password-protected Excel statements are not accepted.');
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
        throw new Error('XLSX_ZIP64_UNSUPPORTED: ZIP64 Excel statements are not accepted. Export a smaller CSV or XLSX file.');
      }
      expandedBytes += uncompressedSize;
      if (expandedBytes > this.MAX_XLSX_EXPANDED_BYTES) {
        throw new Error(`XLSX_EXPANSION_LIMIT: Expanded Excel content may not exceed ${this.MAX_XLSX_EXPANDED_BYTES / 1024 / 1024} MB.`);
      }
      offset += 46 + fileNameLength + extraLength + commentLength;
    }
  }

  private static excelCellText(cell: ExcelJS.Cell): string {
    const value = cell.value as any;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (value && typeof value === 'object' && 'formula' in value) {
      const result = value.result;
      return result === null || result === undefined || typeof result === 'object' ? '' : String(result);
    }
    return cell.text || '';
  }

  private static worksheetToCsv(worksheet: ExcelJS.Worksheet): string {
    if (worksheet.rowCount > this.MAX_XLSX_ROWS || worksheet.columnCount > this.MAX_XLSX_COLUMNS) {
      throw new Error(`XLSX_SHEET_LIMIT: Statements may contain at most ${this.MAX_XLSX_ROWS} rows and ${this.MAX_XLSX_COLUMNS} columns.`);
    }
    if (worksheet.rowCount * worksheet.columnCount > this.MAX_XLSX_CELLS) {
      throw new Error(`XLSX_CELL_LIMIT: Statements may contain at most ${this.MAX_XLSX_CELLS} cells.`);
    }

    const rows: string[] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let column = 1; column <= worksheet.columnCount; column += 1) {
        const text = this.excelCellText(row.getCell(column)).replace(/\r?\n/g, ' ');
        cells.push(`"${text.replace(/"/g, '""')}"`);
      }
      rows.push(cells.join(','));
    });
    return rows.join('\n');
  }

  public static async parseStatement(
    content: string,
    bankAccountId: string,
    sourceFormat?: BankStatementSourceFormat,
    csvMapping?: any,
    filename: string = 'statement.csv'
  ): Promise<ParsedStatementResult & { fileHash: string; parserVersion: string; detectedBankName?: string; detectedAccountNumber?: string; statementHealthWarning?: string }> {
    // 1. Strict format validation
    BankStatementParserFactory.validateAllowedFormat(filename, content, sourceFormat);

    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const parserVersion = '3.0';

    let csvContent = content;

    // 2. Parse XLSX safely; preserve common text/HTML exports carrying an .xls extension.
    const lowerFilename = filename.toLowerCase();
    const isExcel = lowerFilename.endsWith('.xlsx') || lowerFilename.endsWith('.xls') || sourceFormat === 'XLSX' || sourceFormat === 'XLS';

    if (isExcel) {
      const buffer = this.decodeFileContent(content);
      const isXlsxArchive = buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      const isLegacyBinaryXls = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));

      if (isXlsxArchive) {
        this.assertSafeXlsxArchive(buffer);
        try {
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(buffer, {
            ignoreNodes: ['dataValidations', 'extLst', 'hyperlinks', 'picture', 'drawing'],
          });
          const worksheet = workbook.worksheets[0];
          if (!worksheet) throw new Error('The workbook does not contain a worksheet.');
          csvContent = this.worksheetToCsv(worksheet);
        } catch (error: any) {
          if (String(error?.message || '').startsWith('XLSX_')) throw error;
          throw new Error(`EXCEL_PARSE_ERROR: The XLSX workbook could not be read safely: ${error?.message || 'invalid workbook'}`);
        }
      } else if (isLegacyBinaryXls) {
        throw new Error('LEGACY_XLS_BINARY_UNSUPPORTED: Binary .xls workbooks are not accepted. Export the statement as CSV or XLSX; text/HTML bank exports named .xls remain supported.');
      } else {
        csvContent = buffer.toString('utf8');
        if (!csvContent.includes(',') && !csvContent.includes('\t') && !csvContent.includes(';') && !/<(?:table|tr|td)\b/i.test(csvContent)) {
          throw new Error('EXCEL_PARSE_ERROR: The file is neither a valid XLSX workbook nor a supported text/HTML bank export. Export it as CSV or XLSX and retry.');
        }
        if (/<(?:table|tr|td)\b/i.test(csvContent)) csvContent = this.htmlTableToCsv(csvContent);
      }
    }

    // 3. Parse CSV content
    const result = CsvXlsxParser.parse(csvContent, csvMapping);

    // If filename has bank name hints and none detected, infer from filename
    let detectedBank = result.detectedBankName;
    if (!detectedBank) {
      if (/optransactionhistory/i.test(filename) || /icici/i.test(filename)) detectedBank = 'ICICI Bank';
      else if (/state\s*bank|sbi/i.test(filename)) detectedBank = 'State Bank of India';
      else if (/hdfc/i.test(filename)) detectedBank = 'HDFC Bank';
      else if (/axis/i.test(filename)) detectedBank = 'Axis Bank';
      else if (/kotak/i.test(filename)) detectedBank = 'Kotak Mahindra Bank';
      else if (/baroda|bob/i.test(filename)) detectedBank = 'Bank of Baroda';
      else if (/pnb/i.test(filename)) detectedBank = 'Punjab National Bank';
      else if (/indusind/i.test(filename)) detectedBank = 'IndusInd Bank';
      else if (/canara/i.test(filename)) detectedBank = 'Canara Bank';
      else if (/federal/i.test(filename)) detectedBank = 'Federal Bank';
      else if (/idfc/i.test(filename)) detectedBank = 'IDFC FIRST Bank';
    }

    // 4. Attach deterministic fingerprints
    const transactionsWithFingerprints = result.transactions.map((tx) => {
      const fpString = `${bankAccountId || 'unbound'}:${tx.transactionDate}:${tx.valueDate || ''}:${Number(tx.amount).toFixed(2)}:${tx.direction}:${(tx.reference || '').trim()}:${(tx.narration || '').trim().toLowerCase()}`;
      const fingerprint = crypto.createHash('sha256').update(fpString).digest('hex');
      return {
        ...tx,
        fingerprint,
      };
    });

    // If account number detected or can be extracted from raw content or csvContent (preserve leading zeros)
    let detectedAccount = result.detectedAccountNumber;
    const originalText = typeof content === 'string' ? content.replace(/<[^>]*>/g, ' ') : '';
    const origAccMatch = originalText.match(/(?:account\s*(?:no|number|num)?|a\/c\s*(?:no|number|num)?)\s*[:\-,\t\s]*([0-9Xx]{6,24})/i);
    if (origAccMatch && origAccMatch[1]) {
      const origNum = origAccMatch[1].replace(/[\s,]+/g, '').trim();
      if (!detectedAccount || origNum.endsWith(detectedAccount) || detectedAccount.endsWith(origNum)) {
        detectedAccount = origNum;
      }
    } else if (typeof csvContent === 'string') {
      const csvAccMatch = csvContent.match(/(?:account\s*(?:no|number|num)?|a\/c\s*(?:no|number|num)?)\s*[:\-,\t\s]*([0-9Xx]{6,24})/i);
      if (csvAccMatch && csvAccMatch[1]) {
        const csvNum = csvAccMatch[1].replace(/[\s,]+/g, '').trim();
        if (!detectedAccount || csvNum.endsWith(detectedAccount) || detectedAccount.endsWith(csvNum)) {
          detectedAccount = csvNum;
        }
      }
    }

    return {
      ...result,
      transactions: transactionsWithFingerprints,
      fileHash,
      parserVersion,
      detectedBankName: detectedBank,
      detectedAccountNumber: detectedAccount,
      statementHealthWarning: result.statementHealthWarning,
    };
  }

  public static validateAllowedFormat(filename: string, content: string, sourceFormat?: string): void {
    const trimmed = content.trim();
    const lowerFilename = (filename || '').toLowerCase();

    // Check for Google Sheets URL
    if (lowerFilename.includes('docs.google.com') || trimmed.includes('docs.google.com/spreadsheets')) {
      throw new Error('GOOGLE_SHEETS_NOT_ALLOWED: Direct Google Sheet links are not supported. Please export your Google Sheet as CSV or XLSX and upload the file.');
    }

    // Check for PDF or image
    if (lowerFilename.endsWith('.pdf') || trimmed.startsWith('%PDF-') || trimmed.includes('/PDF-1.')) {
      throw new Error('UNSUPPORTED_FORMAT: PDF statements and scanned files are not supported. Please upload a CSV, XLSX, or XLS file from your netbanking portal.');
    }

    if (/\.(png|jpe?g|gif|webp|svg|bmp|tiff)$/i.test(lowerFilename) || trimmed.startsWith('\x89PNG') || trimmed.startsWith('\xFF\xD8\xFF')) {
      throw new Error('UNSUPPORTED_FORMAT: Image files are not supported. Please upload a CSV, XLSX, or XLS file.');
    }

    // Check for OFX, MT940, CAMT
    if (
      sourceFormat === 'OFX' ||
      sourceFormat === 'MT940' ||
      sourceFormat === 'CAMT053' ||
      lowerFilename.endsWith('.ofx') ||
      lowerFilename.endsWith('.qif') ||
      lowerFilename.endsWith('.xml') ||
      lowerFilename.endsWith('.sta') ||
      lowerFilename.endsWith('.mt940') ||
      trimmed.includes('<OFX>') ||
      trimmed.includes('<OFXHEADER') ||
      trimmed.includes('<BkToCstmrStmt>') ||
      trimmed.includes('urn:iso:std:iso:20022:tech:xsd:camt.053')
    ) {
      throw new Error(`UNSUPPORTED_FORMAT: OFX, MT940, and CAMT053 formats are not accepted. FirmBooks Banking accepts only ${BANK_STATEMENT_FORMAT_LABEL} statement files.`);
    }

    // Check extension
    const extension = lowerFilename.split('.').pop();
    const hasValidExtension = isSupportedBankStatementExtension(extension);
    if (filename && filename !== 'statement.csv' && !hasValidExtension) {
      throw new Error(`UNSUPPORTED_FORMAT: File "${filename}" is not supported. FirmBooks Banking accepts only ${BANK_STATEMENT_FORMAT_LABEL} statement files.`);
    }
  }

  public static detectFormat(content: string): BankStatementSourceFormat {
    const trimmed = content.trim();
    if (trimmed.includes('<OFX>') || trimmed.includes('<OFXHEADER')) return 'OFX';
    if (trimmed.includes('<BkToCstmrStmt>')) return 'CAMT053';
    if (trimmed.includes(':20:') && trimmed.includes(':60F:')) return 'MT940';
    return 'CSV';
  }
}
