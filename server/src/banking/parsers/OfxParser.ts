import { ParsedStatementResult, ParsedTransactionLine } from '../../../../src/types/banking';
import { CsvXlsxParser } from './CsvXlsxParser';
import { IndiaReferenceExtractor } from './IndiaReferenceExtractor';

export class OfxParser {
  public static parse(content: string): ParsedStatementResult {
    const transactions: ParsedTransactionLine[] = [];
    let openingBalance = 0;
    let closingBalance = 0;
    let currency = 'INR';

    // Currency
    const curMatch = content.match(/<CURDEF>([A-Z]{3})/i);
    if (curMatch) currency = curMatch[1];

    // Ledger balance (Closing balance)
    const balMatch = content.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([\d.-]+)/i) || content.match(/<BALAMT>([\d.-]+)/i);
    if (balMatch) {
      closingBalance = parseFloat(balMatch[1]);
    }

    // Statement Transactions <STMTTRN>
    const stmtTrnRegex = /<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>|<\/BANKTRANLIST>))/gi;
    let match: RegExpExecArray | null;

    while ((match = stmtTrnRegex.exec(content)) !== null) {
      const block = match[1];

      const trnType = OfxParser.getTagValue(block, 'TRNTYPE');
      const dtPosted = OfxParser.getTagValue(block, 'DTPOSTED');
      const trnAmt = OfxParser.getTagValue(block, 'TRNAMT');
      const fitId = OfxParser.getTagValue(block, 'FITID');
      const name = OfxParser.getTagValue(block, 'NAME');
      const memo = OfxParser.getTagValue(block, 'MEMO');
      const checkNum = OfxParser.getTagValue(block, 'CHECKNUM');

      if (!trnAmt || !dtPosted) continue;

      const rawAmount = parseFloat(trnAmt);
      if (isNaN(rawAmount)) continue;

      const direction = rawAmount >= 0 ? 'CREDIT' : 'DEBIT';
      const amount = Math.abs(rawAmount);
      const dateStr = CsvXlsxParser.normalizeDate(dtPosted);
      if (!dateStr) continue;

      const narration = [name, memo].filter(Boolean).join(' ') || 'OFX Transaction';
      const extracted = IndiaReferenceExtractor.extract(narration);

      transactions.push({
        transactionDate: dateStr,
        amount,
        direction,
        narration,
        reference: fitId || extracted.utr || extracted.upiReference,
        transactionType: trnType || extracted.transactionType,
        utr: extracted.utr,
        rrn: extracted.rrn,
        upiReference: extracted.upiReference,
        chequeNumber: checkNum || extracted.chequeNumber,
        counterpartyName: extracted.counterpartyName,
        rawData: { fitId, trnType, block },
      });
    }

    const totalCredits = transactions.filter(t => t.direction === 'CREDIT').reduce((s, t) => s + t.amount, 0);
    const totalDebits = transactions.filter(t => t.direction === 'DEBIT').reduce((s, t) => s + t.amount, 0);

    if (closingBalance) {
      openingBalance = Number((closingBalance - totalCredits + totalDebits).toFixed(2));
    } else {
      closingBalance = Number((totalCredits - totalDebits).toFixed(2));
    }

    return {
      openingBalance,
      closingBalance,
      statementFrom: transactions[0]?.transactionDate,
      statementTo: transactions[transactions.length - 1]?.transactionDate,
      currency,
      transactions,
      discrepancy: 0,
    };
  }

  private static getTagValue(block: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
    const match = block.match(regex);
    return match ? match[1].trim() : undefined;
  }
}
