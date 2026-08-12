import { ParsedStatementResult, ParsedTransactionLine } from '../../../../src/types/banking';
import { CsvXlsxParser } from './CsvXlsxParser';
import { IndiaReferenceExtractor } from './IndiaReferenceExtractor';

export class Camt053Parser {
  public static parse(xmlContent: string): ParsedStatementResult {
    const transactions: ParsedTransactionLine[] = [];
    let openingBalance = 0;
    let closingBalance = 0;
    let currency = 'INR';

    // Currency check
    const curMatch = xmlContent.match(/Ccy="([A-Z]{3})"/i);
    if (curMatch) currency = curMatch[1];

    // Opening Balance (OPBD or PRCD)
    const opbdMatch = xmlContent.match(/<Bal>[\s\S]*?<Cd>OPBD<\/Cd>[\s\S]*?<Amt[^>]*>([\d.]+)</i) || xmlContent.match(/<Bal>[\s\S]*?<Cd>PRCD<\/Cd>[\s\S]*?<Amt[^>]*>([\d.]+)</i);
    if (opbdMatch) {
      openingBalance = parseFloat(opbdMatch[1]);
    }

    // Closing Balance (CLBD)
    const clbdMatch = xmlContent.match(/<Bal>[\s\S]*?<Cd>CLBD<\/Cd>[\s\S]*?<Amt[^>]*>([\d.]+)</i);
    if (clbdMatch) {
      closingBalance = parseFloat(clbdMatch[1]);
    }

    // Extract entries <Ntry>
    const ntryRegex = /<Ntry>([\s\S]*?)<\/Ntry>/gi;
    let match: RegExpExecArray | null;

    while ((match = ntryRegex.exec(xmlContent)) !== null) {
      const block = match[1];

      const amtMatch = block.match(/<Amt[^>]*>([\d.]+)/i);
      const cdtDbtMatch = block.match(/<CdtDbtInd>(CRDT|DBIT)<\/CdtDbtInd>/i);
      const bookgDtMatch = block.match(/<BookgDt>[\s\S]*?<Dt>([\d-]+)/i) || block.match(/<BookgDt>[\s\S]*?<DtTm>([\d-]+)/i);
      const valDtMatch = block.match(/<ValDt>[\s\S]*?<Dt>([\d-]+)/i);
      const ustrdMatch = block.match(/<Ustrd>([^<]+)<\/Ustrd>/i);
      const addtlInfMatch = block.match(/<AddtlNtryInf>([^<]+)<\/AddtlNtryInf>/i);
      const nmMatch = block.match(/<Nm>([^<]+)<\/Nm>/i);
      const endToEndMatch = block.match(/<EndToEndId>([^<]+)<\/EndToEndId>/i) || block.match(/<Utr>([^<]+)<\/Utr>/i);

      if (!amtMatch || !cdtDbtMatch) continue;

      const amount = parseFloat(amtMatch[1]);
      const direction = cdtDbtMatch[1] === 'CRDT' ? 'CREDIT' : 'DEBIT';
      const rawDate = bookgDtMatch ? bookgDtMatch[1] : new Date().toISOString().substring(0, 10);
      const dateStr = CsvXlsxParser.normalizeDate(rawDate) || new Date().toISOString().substring(0, 10);

      const valDateStr = valDtMatch ? CsvXlsxParser.normalizeDate(valDtMatch[1]) : undefined;

      const narration = [ustrdMatch?.[1], addtlInfMatch?.[1], nmMatch?.[1]].filter(Boolean).join(' ') || 'CAMT.053 Entry';
      const extracted = IndiaReferenceExtractor.extract(narration);

      transactions.push({
        transactionDate: dateStr,
        valueDate: valDateStr,
        amount,
        direction,
        narration,
        reference: endToEndMatch?.[1] || extracted.utr || extracted.upiReference,
        transactionType: extracted.transactionType,
        utr: extracted.utr,
        rrn: extracted.rrn,
        upiReference: extracted.upiReference,
        chequeNumber: extracted.chequeNumber,
        counterpartyName: nmMatch?.[1] || extracted.counterpartyName,
        rawData: { block },
      });
    }

    const totalCredits = transactions.filter(t => t.direction === 'CREDIT').reduce((s, t) => s + t.amount, 0);
    const totalDebits = transactions.filter(t => t.direction === 'DEBIT').reduce((s, t) => s + t.amount, 0);

    if (!closingBalance) {
      closingBalance = Number((openingBalance + totalCredits - totalDebits).toFixed(2));
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
}
