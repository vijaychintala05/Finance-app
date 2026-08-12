import { ParsedStatementResult, ParsedTransactionLine } from '../../../../src/types/banking';
import { CsvXlsxParser } from './CsvXlsxParser';
import { IndiaReferenceExtractor } from './IndiaReferenceExtractor';

export class Mt940Parser {
  public static parse(content: string): ParsedStatementResult {
    const lines = content.split(/\r?\n/);
    const transactions: ParsedTransactionLine[] = [];

    let openingBalance = 0;
    let closingBalance = 0;
    let currency = 'INR';

    let currentTransaction: Partial<ParsedTransactionLine> | null = null;
    let currentNarration = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Opening Balance :60F: or :60M:
      // Format: :60F:C260801INR100000,00
      if (line.startsWith(':60F:') || line.startsWith(':60M:')) {
        const match = line.match(/^:60[FM]:([CD])(\d{6})([A-Z]{3})([\d,.]+)/);
        if (match) {
          const sign = match[1] === 'C' ? 1 : -1;
          currency = match[3];
          openingBalance = sign * parseFloat(match[4].replace(',', '.'));
        }
      }

      // Closing Balance :62F: or :62M:
      if (line.startsWith(':62F:') || line.startsWith(':62M:')) {
        const match = line.match(/^:62[FM]:([CD])(\d{6})([A-Z]{3})([\d,.]+)/);
        if (match) {
          const sign = match[1] === 'C' ? 1 : -1;
          closingBalance = sign * parseFloat(match[4].replace(',', '.'));
        }
      }

      // Transaction Line :61:
      // Format: :61:2608010801CR10000,00NTRFNONREF
      if (line.startsWith(':61:')) {
        if (currentTransaction && currentTransaction.amount) {
          const narration = currentNarration.trim() || 'MT940 Transaction';
          const extracted = IndiaReferenceExtractor.extract(narration);
          transactions.push({
            transactionDate: currentTransaction.transactionDate!,
            valueDate: currentTransaction.valueDate,
            amount: currentTransaction.amount!,
            direction: currentTransaction.direction!,
            narration,
            reference: currentTransaction.reference || extracted.utr || extracted.upiReference,
            transactionType: extracted.transactionType,
            utr: extracted.utr,
            rrn: extracted.rrn,
            upiReference: extracted.upiReference,
            chequeNumber: extracted.chequeNumber,
            counterpartyName: extracted.counterpartyName,
            rawData: { line, narration: currentNarration },
          });
        }

        currentTransaction = {};
        currentNarration = '';

        const m61 = line.match(/^:61:(\d{6})(\d{4})?([CD]D?|CR|DR|RC|RD)(F?)([\d,.]+)([A-Z0-9]{4})?([^\r\n]*)/);
        if (m61) {
          const yyMMdd = m61[1];
          const dateStr = CsvXlsxParser.normalizeDate(yyMMdd);
          const dInd = m61[3];
          const rawAmt = parseFloat(m61[5].replace(',', '.'));
          const ref = m61[7]?.trim();

          const direction = dInd.startsWith('C') ? 'CREDIT' : 'DEBIT';

          currentTransaction = {
            transactionDate: dateStr || new Date().toISOString().substring(0, 10),
            amount: rawAmt,
            direction,
            reference: ref,
          };
        }
      }

      // Narrative :86:
      if (line.startsWith(':86:')) {
        const narr = line.substring(4).trim();
        currentNarration = currentNarration ? `${currentNarration} ${narr}` : narr;
      } else if (line.startsWith('::') || (line.startsWith(':') && !line.startsWith(':61:') && !line.startsWith(':86:'))) {
        // Other tag starts, finalize narration if needed
      } else if (currentTransaction && !line.startsWith(':')) {
        // Multi-line continuation of :86:
        currentNarration += ` ${line}`;
      }
    }

    if (currentTransaction && currentTransaction.amount) {
      const narration = currentNarration.trim() || 'MT940 Transaction';
      const extracted = IndiaReferenceExtractor.extract(narration);
      transactions.push({
        transactionDate: currentTransaction.transactionDate!,
        valueDate: currentTransaction.valueDate,
        amount: currentTransaction.amount!,
        direction: currentTransaction.direction!,
        narration,
        reference: currentTransaction.reference || extracted.utr || extracted.upiReference,
        transactionType: extracted.transactionType,
        utr: extracted.utr,
        rrn: extracted.rrn,
        upiReference: extracted.upiReference,
        chequeNumber: extracted.chequeNumber,
        counterpartyName: extracted.counterpartyName,
        rawData: { narration: currentNarration },
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
