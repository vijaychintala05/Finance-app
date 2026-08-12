import { CSVColumnMapping, ParsedStatementResult, ParsedTransactionLine } from '../../../../src/types/banking';
import { IndiaReferenceExtractor } from './IndiaReferenceExtractor';

export class CsvXlsxParser {
  public static parse(
    content: string,
    mapping?: Partial<CSVColumnMapping>
  ): ParsedStatementResult {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return {
        openingBalance: 0,
        closingBalance: 0,
        currency: 'INR',
        transactions: [],
      };
    }

    // Default mapping
    const colMap: CSVColumnMapping = {
      dateColumn: mapping?.dateColumn || 'Date',
      valueDateColumn: mapping?.valueDateColumn || 'Value Date',
      narrationColumn: mapping?.narrationColumn || 'Narration',
      referenceColumn: mapping?.referenceColumn || 'Ref No',
      debitColumn: mapping?.debitColumn || 'Debit',
      creditColumn: mapping?.creditColumn || 'Credit',
      amountColumn: mapping?.amountColumn || 'Amount',
      balanceColumn: mapping?.balanceColumn || 'Balance',
      chequeNumberColumn: mapping?.chequeNumberColumn || 'Cheque No',
      dateFormat: mapping?.dateFormat || 'YYYY-MM-DD',
    };

    // Header detection
    let headerIdx = 0;
    let headers: string[] = [];

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const parts = CsvXlsxParser.parseCsvRow(lines[i]);
      const lower = parts.map(p => p.toLowerCase());
      if (
        lower.some(p => p.includes('date') || p.includes('narration') || p.includes('description') || p.includes('amount') || p.includes('debit') || p.includes('credit') || p.includes('deposit') || p.includes('withdrawal'))
      ) {
        headerIdx = i;
        headers = parts.map(p => p.trim());
        break;
      }
    }

    if (headers.length === 0 && lines.length > 0) {
      headers = CsvXlsxParser.parseCsvRow(lines[0]).map(p => p.trim());
    }

    const findColIndex = (name: string, synonyms: string[] = []): number => {
      if (!headers.length) return -1;

      if (name) {
        const cleanName = name.toLowerCase();
        const exact = headers.findIndex(h => h.toLowerCase() === cleanName);
        if (exact !== -1) return exact;
        const partial = headers.findIndex(h => h.toLowerCase().includes(cleanName));
        if (partial !== -1) return partial;
      }

      for (const syn of synonyms) {
        const idx = headers.findIndex(h => h.toLowerCase() === syn || h.toLowerCase().includes(syn));
        if (idx !== -1) return idx;
      }

      return -1;
    };

    const dateColIdx = findColIndex(colMap.dateColumn, ['date', 'txn date', 'transaction date']);
    const valueDateColIdx = findColIndex(colMap.valueDateColumn || '', ['value date', 'val date']);
    const narrationColIdx = findColIndex(colMap.narrationColumn, ['narration', 'description', 'particulars', 'remarks', 'details']);
    const refColIdx = findColIndex(colMap.referenceColumn || '', ['ref no', 'refno', 'ref_no', 'ref.no', 'ref', 'reference', 'utr', 'rrn', 'txn id', 'transaction id', 'chq/ref no']);
    const debitColIdx = findColIndex(colMap.debitColumn || '', ['debit', 'withdrawal', 'dr', 'out', 'paid out', 'spent', 'debit amount']);
    const creditColIdx = findColIndex(colMap.creditColumn || '', ['credit', 'deposit', 'cr', 'in', 'paid in', 'received', 'credit amount']);
    const amountColIdx = findColIndex(colMap.amountColumn || '', ['amount', 'net amount', 'txn amount']);
    const balanceColIdx = findColIndex(colMap.balanceColumn || '', ['balance', 'running balance', 'closing balance']);
    const chqColIdx = findColIndex(colMap.chequeNumberColumn || '', ['cheque no', 'chq no', 'cheque number']);

    const transactions: ParsedTransactionLine[] = [];
    let openingBalance = 0;
    let closingBalance = 0;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = CsvXlsxParser.parseCsvRow(lines[i]);
      if (row.length === 0 || row.every(cell => !cell.trim())) continue;

      const rawDate = dateColIdx !== -1 ? row[dateColIdx] : row[0];
      const parsedDate = CsvXlsxParser.normalizeDate(rawDate, colMap.dateFormat);
      if (!parsedDate) continue;

      const rawValueDate = valueDateColIdx !== -1 ? row[valueDateColIdx] : undefined;
      const parsedValueDate = rawValueDate ? CsvXlsxParser.normalizeDate(rawValueDate, colMap.dateFormat) : undefined;

      const narration = narrationColIdx !== -1 ? row[narrationColIdx] || '' : row.join(' ');
      const reference = refColIdx !== -1 ? row[refColIdx] : undefined;
      const chequeNo = chqColIdx !== -1 ? row[chqColIdx] : undefined;

      let debitAmount = 0;
      let creditAmount = 0;

      if (debitColIdx !== -1 && row[debitColIdx]) {
        debitAmount = Math.abs(CsvXlsxParser.parseAmount(row[debitColIdx]));
      }
      if (creditColIdx !== -1 && row[creditColIdx]) {
        creditAmount = Math.abs(CsvXlsxParser.parseAmount(row[creditColIdx]));
      }

      if (debitAmount === 0 && creditAmount === 0 && amountColIdx !== -1 && row[amountColIdx]) {
        const val = CsvXlsxParser.parseAmount(row[amountColIdx]);
        if (val < 0) {
          debitAmount = Math.abs(val);
        } else {
          creditAmount = val;
        }
      }

      if (debitAmount === 0 && creditAmount === 0) continue;

      const direction = creditAmount > 0 ? 'CREDIT' : 'DEBIT';
      const amount = creditAmount > 0 ? creditAmount : debitAmount;

      const rawBalance = balanceColIdx !== -1 ? row[balanceColIdx] : undefined;
      const runningBalance = rawBalance ? CsvXlsxParser.parseAmount(rawBalance) : undefined;

      // Extract India references from narration
      const extracted = IndiaReferenceExtractor.extract(narration);

      transactions.push({
        transactionDate: parsedDate,
        valueDate: parsedValueDate,
        amount,
        direction,
        runningBalance,
        narration,
        reference: reference || extracted.utr || extracted.upiReference,
        transactionType: extracted.transactionType,
        utr: extracted.utr,
        rrn: extracted.rrn,
        upiReference: extracted.upiReference,
        chequeNumber: chequeNo || extracted.chequeNumber,
        counterpartyName: extracted.counterpartyName,
        rawData: { row, headers },
      });
    }

    if (transactions.length > 0) {
      const firstBal = transactions[0].runningBalance;
      const lastBal = transactions[transactions.length - 1].runningBalance;

      if (firstBal !== undefined && lastBal !== undefined) {
        if (transactions[0].direction === 'CREDIT') {
          openingBalance = firstBal - transactions[0].amount;
        } else {
          openingBalance = firstBal + transactions[0].amount;
        }
        closingBalance = lastBal;
      }
    }

    const totalCredits = transactions.filter(t => t.direction === 'CREDIT').reduce((s, t) => s + t.amount, 0);
    const totalDebits = transactions.filter(t => t.direction === 'DEBIT').reduce((s, t) => s + t.amount, 0);
    const calculatedClosing = Number((openingBalance + totalCredits - totalDebits).toFixed(2));
    const discrepancy = closingBalance ? Number((closingBalance - calculatedClosing).toFixed(2)) : 0;

    return {
      openingBalance,
      closingBalance: closingBalance || calculatedClosing,
      statementFrom: transactions[0]?.transactionDate,
      statementTo: transactions[transactions.length - 1]?.transactionDate,
      currency: 'INR',
      transactions,
      discrepancy,
    };
  }

  private static parseCsvRow(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === '\t' || char === ';') && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  public static parseAmount(str: string): number {
    if (!str) return 0;
    const clean = str.replace(/[^\d.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  public static normalizeDate(raw: string, formatPreference: string = 'YYYY-MM-DD'): string | null {
    if (!raw) return null;
    const clean = raw.trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      return clean.substring(0, 10);
    }

    const ddmmyyyy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (ddmmyyyy) {
      if (formatPreference === 'MM/DD/YYYY') {
        const m = ddmmyyyy[1].padStart(2, '0');
        const d = ddmmyyyy[2].padStart(2, '0');
        const y = ddmmyyyy[3];
        return `${y}-${m}-${d}`;
      } else {
        const d = ddmmyyyy[1].padStart(2, '0');
        const m = ddmmyyyy[2].padStart(2, '0');
        const y = ddmmyyyy[3];
        return `${y}-${m}-${d}`;
      }
    }

    if (/^\d{8}/.test(clean)) {
      const y = clean.substring(0, 4);
      const m = clean.substring(4, 6);
      const d = clean.substring(6, 8);
      return `${y}-${m}-${d}`;
    }

    const dateObj = new Date(clean);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().substring(0, 10);
    }

    return null;
  }
}
