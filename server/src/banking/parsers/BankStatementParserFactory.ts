import crypto from 'crypto';
import * as XLSX from 'xlsx';
import { BankStatementSourceFormat, ParsedStatementResult, ParsedTransactionLine } from '../../../../src/types/banking';
import { CsvXlsxParser } from './CsvXlsxParser';

export class BankStatementParserFactory {
  public static parseStatement(
    content: string,
    bankAccountId: string,
    sourceFormat?: BankStatementSourceFormat,
    csvMapping?: any,
    filename: string = 'statement.csv'
  ): ParsedStatementResult & { fileHash: string; parserVersion: string; detectedBankName?: string; detectedAccountNumber?: string; statementHealthWarning?: string } {
    // 1. Strict format validation
    BankStatementParserFactory.validateAllowedFormat(filename, content, sourceFormat);

    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const parserVersion = '2.0';

    let csvContent = content;

    // 2. Handle XLSX / XLS binary or base64
    const lowerFilename = filename.toLowerCase();
    const isExcel = lowerFilename.endsWith('.xlsx') || lowerFilename.endsWith('.xls') || sourceFormat === 'XLSX' || sourceFormat === 'XLS';
    
    if (isExcel) {
      try {
        let buf: Buffer;
        if (content.startsWith('data:') && content.includes('base64,')) {
          buf = Buffer.from(content.split('base64,')[1], 'base64');
        } else if (/^[A-Za-z0-9+/=\r\n]+$/.test(content.trim()) && content.trim().length > 100) {
          buf = Buffer.from(content.trim(), 'base64');
        } else {
          buf = Buffer.from(content, 'binary');
        }
        const workbook = XLSX.read(buf, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        if (firstSheetName && workbook.Sheets[firstSheetName]) {
          csvContent = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
        }
      } catch (err: any) {
        // If it was already raw CSV text, continue with csvContent
        if (!csvContent.includes(',') && !csvContent.includes('\t') && !csvContent.includes(';')) {
          throw new Error(`EXCEL_PARSE_ERROR: Failed to read Excel workbook: ${err.message}`);
        }
      }
    }

    // 3. Parse CSV content
    const result = CsvXlsxParser.parse(csvContent, csvMapping);

    // If filename has bank name hints and none detected, infer from filename
    let detectedBank = result.detectedBankName;
    if (!detectedBank) {
      if (/hdfc/i.test(filename)) detectedBank = 'HDFC Bank';
      else if (/icici/i.test(filename)) detectedBank = 'ICICI Bank';
      else if (/sbi|state\s*bank/i.test(filename)) detectedBank = 'State Bank of India';
      else if (/axis/i.test(filename)) detectedBank = 'Axis Bank';
      else if (/kotak/i.test(filename)) detectedBank = 'Kotak Mahindra Bank';
      else if (/baroda|bob/i.test(filename)) detectedBank = 'Bank of Baroda';
      else if (/pnb/i.test(filename)) detectedBank = 'Punjab National Bank';
      else if (/indusind/i.test(filename)) detectedBank = 'IndusInd Bank';
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

    return {
      ...result,
      transactions: transactionsWithFingerprints,
      fileHash,
      parserVersion,
      detectedBankName: detectedBank,
      detectedAccountNumber: result.detectedAccountNumber,
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
      throw new Error('UNSUPPORTED_FORMAT: OFX, MT940, and CAMT053 formats are not accepted. FirmBooks Banking accepts only CSV, XLSX, and XLS statement files.');
    }

    // Check extension
    const hasValidExtension = lowerFilename.endsWith('.csv') || lowerFilename.endsWith('.xlsx') || lowerFilename.endsWith('.xls');
    if (filename && filename !== 'statement.csv' && !hasValidExtension) {
      throw new Error(`UNSUPPORTED_FORMAT: File "${filename}" is not supported. FirmBooks Banking accepts only CSV, XLSX, and XLS statement files.`);
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
