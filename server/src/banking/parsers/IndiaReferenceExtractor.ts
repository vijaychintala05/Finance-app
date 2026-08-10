export interface ExtractedIndiaReferences {
  transactionType?: string;
  utr?: string;
  rrn?: string;
  upiReference?: string;
  chequeNumber?: string;
  counterpartyName?: string;
}

export class IndiaReferenceExtractor {
  public static extract(narration: string): ExtractedIndiaReferences {
    if (!narration) return {};

    const clean = narration.trim().toUpperCase();
    const result: ExtractedIndiaReferences = {};

    // 1. Transaction Type Detection
    if (clean.includes('UPI')) {
      result.transactionType = 'UPI';
    } else if (clean.includes('NEFT')) {
      result.transactionType = 'NEFT';
    } else if (clean.includes('RTGS')) {
      result.transactionType = 'RTGS';
    } else if (clean.includes('IMPS')) {
      result.transactionType = 'IMPS';
    } else if (clean.includes('CHQ') || clean.includes('CHEQUE') || clean.includes('CLG')) {
      result.transactionType = 'Cheque';
    } else if (clean.includes('ACH') || clean.includes('NACH')) {
      result.transactionType = 'ACH';
    } else if (clean.includes('BANK CHARGE') || clean.includes('CHG') || clean.includes('FEE')) {
      result.transactionType = 'Bank Charges';
    } else if (clean.includes('INT') || clean.includes('INTEREST')) {
      result.transactionType = 'Interest';
    } else if (clean.includes('TRANSFER') || clean.includes('TRF') || clean.includes('IFT')) {
      result.transactionType = 'Bank Transfer';
    }

    // 2. UPI Reference Extraction (12 digits)
    const upiMatch = clean.match(/UPI[/-]?([0-9]{12})/i) || clean.match(/([0-9]{12})\/UPI/i) || clean.match(/UPI\/[A-Z0-9_-]+\/([0-9]{12})/i);
    if (upiMatch && upiMatch[1]) {
      result.upiReference = upiMatch[1];
      result.utr = result.utr || upiMatch[1];
    }

    // 3. UTR / RRN Extraction (NEFT, RTGS, IMPS)
    const neftMatch = clean.match(/NEFT[/-]?([A-Z0-9]{10,22})/i);
    if (neftMatch && neftMatch[1]) {
      result.utr = neftMatch[1];
    }

    const rtgsMatch = clean.match(/RTGS[/-]?([A-Z0-9]{10,22})/i);
    if (rtgsMatch && rtgsMatch[1]) {
      result.utr = rtgsMatch[1];
    }

    const impsMatch = clean.match(/IMPS[/-]?[A-Z0-9]*[/-]?([0-9]{12})/i);
    if (impsMatch && impsMatch[1]) {
      result.rrn = impsMatch[1];
      result.utr = result.utr || impsMatch[1];
    }

    const generalUtrMatch = clean.match(/UTR[/-]?([A-Z0-9]{10,22})/i);
    if (generalUtrMatch && generalUtrMatch[1]) {
      result.utr = generalUtrMatch[1];
    }

    // 4. Cheque Number Extraction (6 digits)
    const chqMatch = clean.match(/(?:CHQ|CHEQUE|CLG)[/\s#-]*([0-9]{6})/i) || clean.match(/NO[.\s]*([0-9]{6})/i);
    if (chqMatch && chqMatch[1]) {
      result.chequeNumber = chqMatch[1];
    }

    // 5. Counterparty Name Extraction
    const parts = clean.split(/[/|-]/).map(p => p.trim()).filter(Boolean);
    const excludeSet = new Set([
      'UPI', 'NEFT', 'RTGS', 'IMPS', 'CHQ', 'CHEQUE', 'CLG', 'TRANSFER', 'TRF', 'CR', 'DR', 'P2A', 'P2M', 'INF', 'BY', 'TO', 'REV', 'NO',
      result.utr, result.rrn, result.upiReference, result.chequeNumber
    ].filter(Boolean));

    for (const part of parts) {
      if (
        part.length >= 3 &&
        !excludeSet.has(part) &&
        !/^[0-9]+$/.test(part) &&
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(part) // IFSC code pattern
      ) {
        result.counterpartyName = part;
        break;
      }
    }

    return result;
  }
}
