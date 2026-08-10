import crypto from 'crypto';
import { BankStatementSourceFormat, ParsedStatementResult, ParsedTransactionLine } from '../../../../src/types/banking';
import { Camt053Parser } from './Camt053Parser';
import { CsvXlsxParser } from './CsvXlsxParser';
import { Mt940Parser } from './Mt940Parser';
import { OfxParser } from './OfxParser';

export class BankStatementParserFactory {
  public static parseStatement(
    content: string,
    bankAccountId: string,
    sourceFormat?: BankStatementSourceFormat,
    csvMapping?: any
  ): ParsedStatementResult & { fileHash: string; parserVersion: string } {
    const fileHash = crypto.createHash('sha256').update(content).digest('hex');
    const parserVersion = '1.0';

    let format = sourceFormat || BankStatementParserFactory.detectFormat(content);
    let result: ParsedStatementResult;

    switch (format) {
      case 'OFX':
        result = OfxParser.parse(content);
        break;
      case 'MT940':
        result = Mt940Parser.parse(content);
        break;
      case 'CAMT053':
        result = Camt053Parser.parse(content);
        break;
      case 'XLSX':
      case 'CSV':
      default:
        result = CsvXlsxParser.parse(content, csvMapping);
        break;
    }

    // Attach fingerprint to every parsed transaction line
    const transactionsWithFingerprints = result.transactions.map((tx) => {
      const fpString = `${bankAccountId}:${tx.transactionDate}:${tx.valueDate || ''}:${tx.amount}:${tx.direction}:${tx.reference || ''}:${tx.narration.trim()}`;
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
    };
  }

  public static detectFormat(content: string): BankStatementSourceFormat {
    const trimmed = content.trim();
    if (trimmed.includes('<OFX>') || trimmed.includes('<OFXHEADER') || trimmed.includes('OFXHEADER:')) {
      return 'OFX';
    }
    if (trimmed.includes('<BkToCstmrStmt>') || trimmed.includes('urn:iso:std:iso:20022:tech:xsd:camt.053')) {
      return 'CAMT053';
    }
    if (trimmed.includes(':20:') && (trimmed.includes(':25:') || trimmed.includes(':60F:') || trimmed.includes(':61:'))) {
      return 'MT940';
    }
    return 'CSV';
  }
}
