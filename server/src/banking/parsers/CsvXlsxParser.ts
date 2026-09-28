import { CSVColumnMapping, ParsedStatementResult, ParsedTransactionLine } from '../../../../src/types/banking';
import { IndiaReferenceExtractor } from './IndiaReferenceExtractor';

export class CsvXlsxParser {
  public static parse(
    content: string,
    mapping?: Partial<CSVColumnMapping>
  ): ParsedStatementResult {
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const sourceRowNumbers = content.split(/\r?\n/).map((line, index) => line.trim() ? index + 1 : null).filter((row): row is number => row !== null);
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

    // Header detection using multi-criteria scoring across the first 60 lines
    let headerIdx = 0;
    let headers: string[] = [];
    let bestScore = 0;

    for (let i = 0; i < Math.min(60, lines.length); i++) {
      const parts = CsvXlsxParser.parseCsvRow(lines[i]);
      const lower = parts.map((p) => p.toLowerCase());
      let score = 0;
      if (lower.some((p) => (p.includes('date') || p === 'dt') && !p.includes('statement') && !p.includes('period') && !p.includes('birth'))) score += 2;
      if (lower.some((p) => p.includes('narration') || p.includes('description') || p.includes('particulars') || p.includes('remarks') || p.includes('details') || p.includes('memo'))) score += 2;
      if (lower.some((p) => p.includes('debit') || p.includes('withdrawal') || p.includes('dr') || p.includes('paid out') || p.includes('spent'))) score += 2;
      if (lower.some((p) => p.includes('credit') || p.includes('deposit') || p.includes('cr') || p.includes('paid in') || p.includes('received'))) score += 2;
      if (lower.some((p) => p.includes('amount') || p.includes('balance') || p.includes('bal'))) score += 1;
      if (lower.some((p) => p.includes('cheque') || p.includes('chq') || p.includes('ref'))) score += 1;

      if (score > bestScore) {
        bestScore = score;
        headerIdx = i;
        headers = parts.map((p) => p.trim());
      }
    }

    if (bestScore < 3 && lines.length > 0) {
      for (let i = 0; i < Math.min(15, lines.length); i++) {
        const parts = CsvXlsxParser.parseCsvRow(lines[i]);
        const lower = parts.map((p) => p.toLowerCase());
        if (
          lower.some((p) => p.includes('date') || p.includes('narration') || p.includes('description') || p.includes('amount') || p.includes('debit') || p.includes('credit') || p.includes('deposit') || p.includes('withdrawal'))
        ) {
          headerIdx = i;
          headers = parts.map((p) => p.trim());
          break;
        }
      }
    }

    if (headers.length === 0 && lines.length > 0) {
      headers = CsvXlsxParser.parseCsvRow(lines[0]).map((p) => p.trim());
    }

    const findColIndex = (name: string, synonyms: string[] = []): number => {
      if (!headers.length) return -1;

      // 1. Exact match with primary name
      if (name) {
        const cleanName = name.toLowerCase();
        const exact = headers.findIndex((h) => h.toLowerCase() === cleanName);
        if (exact !== -1) return exact;
      }

      // 2. Exact match with synonyms
      for (const syn of synonyms) {
        const exactSyn = headers.findIndex((h) => h.toLowerCase() === syn.toLowerCase());
        if (exactSyn !== -1) return exactSyn;
      }

      // 3. Partial match with synonyms (in declared order of priority)
      for (const syn of synonyms) {
        if (syn.trim().length <= 2) continue;
        const idx = headers.findIndex((h) => h.toLowerCase().includes(syn.toLowerCase()));
        if (idx !== -1) return idx;
      }

      // 4. Partial match with primary name
      if (name) {
        const cleanName = name.toLowerCase();
        const partial = headers.findIndex((h) => h.toLowerCase().includes(cleanName));
        if (partial !== -1) return partial;
      }

      return -1;
    };

    // Date column: prefer explicit "Transaction Date" / "Txn Date" over "Value Date"
    let dateColIdx = findColIndex('', [
      'transaction date', 'txn date', 'tran date', 'trans date', 'booking date', 'date', 'posting date'
    ]);
    if (dateColIdx === -1) {
      dateColIdx = findColIndex(colMap.dateColumn, ['date', 'txn date', 'transaction date', 'dt']);
    }
    const valueDateColIdx = findColIndex(colMap.valueDateColumn || '', ['value date', 'val date', 'value dt']);
    const narrationColIdx = findColIndex(colMap.narrationColumn, [
      'transaction remarks', 'narration', 'description', 'particulars', 'transaction details', 'remarks', 'details', 'memo', 'transaction description'
    ]);
    const refColIdx = findColIndex(colMap.referenceColumn || '', [
      'chq / ref no', 'chq/ref no', 'chq/ref.no.', 'ref no/cheque no', 'ref no.', 'ref no', 'refno', 'ref.no', 'ref_no', 'reference number', 'reference no', 'reference', 'utr', 'rrn', 'txn id', 'transaction id'
    ]);
    const debitColIdx = findColIndex(colMap.debitColumn || '', [
      'withdrawal amount', 'withdrawal amt', 'withdrawal (dr)', 'withdrawal', 'debit amount', 'debit amt', 'debit', 'dr amount', 'dr.', 'dr', 'paid out', 'spent', 'out', 'payment'
    ]);
    const creditColIdx = findColIndex(colMap.creditColumn || '', [
      'deposit amount', 'deposit amt', 'deposit (cr)', 'deposit', 'credit amount', 'credit amt', 'credit', 'cr amount', 'cr.', 'cr', 'paid in', 'received', 'in', 'receipt'
    ]);
    const amountColIdx = findColIndex(colMap.amountColumn || '', ['net amount', 'transaction amount', 'txn amount', 'amount', 'total']);
    const balanceColIdx = findColIndex(colMap.balanceColumn || '', ['balance (inr )', 'balance (inr)', 'balance', 'running balance', 'closing balance', 'bal']);
    const chqColIdx = findColIndex(colMap.chequeNumberColumn || '', ['cheque no', 'chq no', 'cheque number', 'chq.no']);

    const transactions: ParsedTransactionLine[] = [];
    const unparsedTransactionRows: Array<{ rowNumber: number; raw: string[] }> = [];
    let openingBalance = 0;
    let closingBalance = 0;

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const row = CsvXlsxParser.parseCsvRow(lines[i]);
      if (row.length === 0 || row.every((cell) => !cell.trim())) continue;

      const rawDate = dateColIdx !== -1 ? row[dateColIdx] : row[0];
      const parsedDate = CsvXlsxParser.normalizeDate(rawDate, colMap.dateFormat);
      if (!parsedDate || !CsvXlsxParser.isCalendarDate(parsedDate)) {
        const monetaryValues = [debitColIdx, creditColIdx, amountColIdx].filter((index) => index >= 0)
          .map((index) => row[index] || '').filter(Boolean);
        const repeatedHeader = headers.length > 0 && row.length === headers.length && row.every((cell, index) => cell.trim().toLowerCase() === headers[index].trim().toLowerCase());
        const controlRow = row.some((cell) => /^(opening balance|closing balance|brought forward|carried forward|grand total|page\s+\d+)$/i.test(cell.trim()));
        const hasNonzeroOrMalformedMoney = monetaryValues.some((value) => {
          const parsed = CsvXlsxParser.strictAmount(value);
          return parsed === null || parsed !== 0;
        });
        const hasContent = row.some((cell) => cell.trim() !== '');
        if (!repeatedHeader && (hasNonzeroOrMalformedMoney || (hasContent && !controlRow))) {
          unparsedTransactionRows.push({ rowNumber: sourceRowNumbers[i] || i + 1, raw: row });
        }
        continue;
      }

      const rawValueDate = valueDateColIdx !== -1 ? row[valueDateColIdx] : undefined;
      const parsedValueDate = rawValueDate ? CsvXlsxParser.normalizeDate(rawValueDate, colMap.dateFormat) : undefined;

      const narration = narrationColIdx !== -1 ? row[narrationColIdx] || '' : row.join(' ');
      const reference = refColIdx !== -1 ? row[refColIdx] : undefined;
      const chequeNo = chqColIdx !== -1 ? row[chqColIdx] : undefined;

      let debitAmount = 0;
      let creditAmount = 0;

      if (debitColIdx !== -1 && row[debitColIdx]) {
        const parsedDebit = CsvXlsxParser.strictAmount(row[debitColIdx]);
        if (parsedDebit === null) {
          unparsedTransactionRows.push({ rowNumber: sourceRowNumbers[i] || i + 1, raw: row });
          continue;
        }
        debitAmount = Math.abs(parsedDebit);
      }
      if (creditColIdx !== -1 && row[creditColIdx]) {
        const parsedCredit = CsvXlsxParser.strictAmount(row[creditColIdx]);
        if (parsedCredit === null) {
          unparsedTransactionRows.push({ rowNumber: sourceRowNumbers[i] || i + 1, raw: row });
          continue;
        }
        creditAmount = Math.abs(parsedCredit);
      }

      if (debitAmount === 0 && creditAmount === 0 && amountColIdx !== -1 && row[amountColIdx]) {
        const rawAmountVal = row[amountColIdx];
        const strictValue = CsvXlsxParser.strictAmount(rawAmountVal);
        if (strictValue === null) {
          unparsedTransactionRows.push({ rowNumber: sourceRowNumbers[i] || i + 1, raw: row });
          continue;
        }
        const val = strictValue;
        if (val < 0) {
          debitAmount = Math.abs(val);
        } else {
          creditAmount = val;
        }
      }

      if ((debitAmount > 0 && creditAmount > 0) || (debitAmount === 0 && creditAmount === 0)) {
        unparsedTransactionRows.push({ rowNumber: sourceRowNumbers[i] || i + 1, raw: row });
        continue;
      }

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
        rawData: { row, headers, rowNumber: sourceRowNumbers[i] || i + 1 },
      });
    }

    // Only metadata before the transaction header can prove statement controls
    // or identify the bank/account. Transaction narration is untrusted text.
    const preambleLines = lines.slice(0, headerIdx);
    const preambleText = preambleLines.join(' ');
    const closeMatch = preambleText.match(/(?:closing\s*balance|close\s*bal)\s*[:\-,\t]?\s*(-?[0-9,]+(?:\.\d{1,2})?)/i);
    const openMatch = preambleText.match(/(?:opening\s*balance|open\s*bal)\s*[:\-,\t]?\s*(-?[0-9,]+(?:\.\d{1,2})?)/i);
    const hasExplicitClosingBalance = Boolean(closeMatch?.[1]);
    const chronologicalTransactions = [...transactions].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    const firstTransaction = chronologicalTransactions[0];
    const lastTransaction = chronologicalTransactions[chronologicalTransactions.length - 1];
    const sameDayLatestCount = transactions.filter((transaction) => transaction.transactionDate === lastTransaction?.transactionDate).length;
    const hasLastRowBalance = lastTransaction?.runningBalance !== undefined;
    const hasRunningBalanceClose = hasLastRowBalance && sameDayLatestCount === 1;
    const earliestDateCount = transactions.filter((transaction) => transaction.transactionDate === firstTransaction?.transactionDate).length;
    // A first-row running balance can estimate opening cash, but cannot prove
    // the file starts at the declared statement boundary. Close needs an
    // independent bank-supplied opening balance or a separately verified carry-forward.
    const openingBalanceVerified = Boolean(openMatch?.[1]);
    if (openingBalanceVerified) openingBalance = CsvXlsxParser.parseAmount(openMatch![1]);
    else if (firstTransaction?.runningBalance !== undefined && earliestDateCount === 1) {
      openingBalance = firstTransaction.runningBalance - (firstTransaction.direction === 'CREDIT' ? firstTransaction.amount : -firstTransaction.amount);
    }
    if (hasExplicitClosingBalance) closingBalance = CsvXlsxParser.parseAmount(closeMatch![1]);
    else if (hasLastRowBalance) closingBalance = lastTransaction.runningBalance!;

    // Detect metadata from statement header/preamble (scanning strictly before transaction table rows)
    let detectedBankName: string | undefined;
    let detectedAccountNumber: string | undefined;
    if (/icici|optransactionhistory/i.test(preambleText)) detectedBankName = 'ICICI Bank';
    else if (/state\s*bank\s*of\s*india|\bsbi\b/i.test(preambleText)) detectedBankName = 'State Bank of India';
    else if (/\bhdfc\b/i.test(preambleText)) detectedBankName = 'HDFC Bank';
    else if (/\baxis\b/i.test(preambleText)) detectedBankName = 'Axis Bank';
    else if (/\bkotak\b/i.test(preambleText)) detectedBankName = 'Kotak Mahindra Bank';
    else if (/bank\s*of\s*baroda|\bbob\b/i.test(preambleText)) detectedBankName = 'Bank of Baroda';
    else if (/punjab\s*national|\bpnb\b/i.test(preambleText)) detectedBankName = 'Punjab National Bank';
    else if (/\bindusind\b/i.test(preambleText)) detectedBankName = 'IndusInd Bank';
    else if (/\bcanara\b/i.test(preambleText)) detectedBankName = 'Canara Bank';
    else if (/\bidfc\b/i.test(preambleText)) detectedBankName = 'IDFC FIRST Bank';
    else if (/\bfederal\b/i.test(preambleText)) detectedBankName = 'Federal Bank';

    const accMatch = preambleText.match(/(?:account\s*(?:no|number|num)?|a\/c\s*(?:no|number|num)?)\s*[:\-,\t\s]*([0-9Xx]{6,24})/i);
    if (accMatch && accMatch[1]) {
      detectedAccountNumber = accMatch[1].replace(/[\s,]+/g, '').trim();
    }

    const totalCredits = transactions.filter((t) => t.direction === 'CREDIT').reduce((s, t) => s + t.amount, 0);
    const totalDebits = transactions.filter((t) => t.direction === 'DEBIT').reduce((s, t) => s + t.amount, 0);
    const calculatedClosing = Number((openingBalance + totalCredits - totalDebits).toFixed(2));
    const balanceDiscrepancy = openingBalanceVerified && (hasRunningBalanceClose || hasExplicitClosingBalance)
      ? Number((closingBalance - calculatedClosing).toFixed(2))
      : null;
    const discrepancy = balanceDiscrepancy ?? 0;
    const currency = (mapping as any)?.currency || 'INR';

    const statementHealthWarning = Math.abs(discrepancy) >= 0.01 && (openingBalance !== 0 || closingBalance !== 0)
      ? `Opening balance + Money In - Money Out differs from closing balance by ${currency} ${Math.abs(discrepancy).toFixed(2)}`
      : undefined;

    return {
      openingBalance,
      closingBalance: hasLastRowBalance || hasExplicitClosingBalance ? closingBalance : calculatedClosing,
      closingBalanceVerified: hasRunningBalanceClose || hasExplicitClosingBalance,
      balanceDiscrepancy,
      statementFrom: firstTransaction?.transactionDate,
      statementTo: lastTransaction?.transactionDate,
      currency,
      transactions,
      discrepancy,
      detectedBankName,
      detectedAccountNumber,
      statementHealthWarning,
      ...(unparsedTransactionRows.length ? { unparsedTransactionRows } : {}),
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

  private static strictAmount(str: string): number | null {
    let clean = String(str || '').trim().replace(/[₹$€£,\s]/g, '');
    const suffix = /(?:dr|debit|cr|credit)$/i.exec(clean)?.[0]?.toLowerCase();
    if (suffix) clean = clean.slice(0, -suffix.length);
    const parenthesized = /^\((.+)\)$/.exec(clean);
    if (parenthesized) clean = `-${parenthesized[1]}`;
    if (!/^[-+]?\d+(?:\.\d{1,2})?$/.test(clean) || !Number.isFinite(Number(clean))) return null;
    let value = Number(clean);
    if (suffix === 'dr' || suffix === 'debit') value = -Math.abs(value);
    if (suffix === 'cr' || suffix === 'credit') value = Math.abs(value);
    return value;
  }

  private static isCalendarDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() + 1 === Number(match[2]) && date.getUTCDate() === Number(match[3]);
  }

  public static parseAmount(str: string): number {
    if (!str) return 0;
    const clean = str.replace(/[^\d.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  public static normalizeDate(raw: string, formatPreference: string = 'YYYY-MM-DD'): string | null {
    if (!raw) return null;
    // Strip quotes and timestamps (e.g. "13/09/2026 14:32:00" -> "13/09/2026")
    const clean = raw.trim().replace(/^"|"$/g, '').split(/[T\s]/)[0].trim();
    if (!clean) return null;

    // 1. ISO format: YYYY-MM-DD or YYYY/MM/DD
    if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/.test(clean)) {
      const parts = clean.split(/[/-]/);
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }

    // 2. Day-Month-Year with 4-digit or 2-digit year (e.g. 13/09/2026, 2/9/26, 13-09-2026, 05-09-26)
    const ddmmyyMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (ddmmyyMatch) {
      const [, p1, p2, yr] = ddmmyyMatch;
      const y = yr.length === 2 ? (parseInt(yr, 10) < 70 ? '20' + yr : '19' + yr) : yr;
      const n1 = parseInt(p1, 10);
      const n2 = parseInt(p2, 10);

      if (formatPreference === 'MM/DD/YYYY') {
        return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
      } else {
        // Standard Indian / UK netbanking format: DD/MM/YYYY
        if (n2 > 12 && n1 <= 12) {
          return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
        }
        return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
      }
    }

    // 3. DD-MMM-YYYY or DD-MMM-YY (e.g. 13-Sep-2026, 02-Jan-26, 15-OCT-2025)
    const monthNames: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const mmmMatch = clean.match(/^(\d{1,2})[/-]([A-Za-z]{3,9})[/-](\d{2,4})$/);
    if (mmmMatch) {
      const day = mmmMatch[1].padStart(2, '0');
      const monKey = mmmMatch[2].slice(0, 3).toLowerCase();
      const yr = mmmMatch[3];
      const y = yr.length === 2 ? (parseInt(yr, 10) < 70 ? '20' + yr : '19' + yr) : yr;
      if (monthNames[monKey]) {
        return `${y}-${monthNames[monKey]}-${day}`;
      }
    }

    // 4. Compact YYYYMMDD or YYYYMMDDHHMMSS (e.g. 20260913 or 20260810120000)
    if (/^\d{8}/.test(clean)) {
      const y = clean.substring(0, 4);
      const m = clean.substring(4, 6);
      const d = clean.substring(6, 8);
      return `${y}-${m}-${d}`;
    }

    // 5. JavaScript Date fallback
    const dateObj = new Date(clean);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().substring(0, 10);
    }

    return null;
  }
}
