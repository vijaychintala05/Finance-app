import { AccountingTransactionType, BankStatementTransaction, MatchReason, MatchSuggestion } from '../../../src/types/banking';

export interface AccountingCandidate {
  id: string;
  type: AccountingTransactionType;
  referenceNumber: string;
  date: string;
  amount: number;
  unallocatedAmount?: number;
  entityName?: string;
  entityId?: string;
  description?: string;
  bankAccountId?: string;
}

export class BankMatchingEngine {
  public static findMatches(
    statementTx: BankStatementTransaction,
    candidates: AccountingCandidate[],
    toleranceFee: number = 1000 // Support bank fee tolerance up to ₹1,000
  ): MatchSuggestion[] {
    const suggestions: MatchSuggestion[] = [];

    for (const candidate of candidates) {
      // 1. Direction Filter
      const isCredit = statementTx.direction === 'CREDIT';
      const isDebit = statementTx.direction === 'DEBIT';

      let isDirectionCompatible = false;
      if (isCredit) {
        isDirectionCompatible = ['payment_received', 'invoice', 'transfer', 'journal'].includes(candidate.type);
      } else if (isDebit) {
        isDirectionCompatible = ['payment_made', 'bill', 'expense', 'transfer', 'journal'].includes(candidate.type);
      }

      if (!isDirectionCompatible) continue;

      let score = 0;
      const reasons: MatchReason[] = [];

      const candidateAmt = candidate.unallocatedAmount !== undefined ? candidate.unallocatedAmount : candidate.amount;
      const diffAmt = Math.abs(statementTx.amount - candidateAmt);

      // 2. Amount Matching
      if (diffAmt === 0) {
        score += 35;
        reasons.push({ code: 'EXACT_AMOUNT', description: `Exact amount match (₹${statementTx.amount.toLocaleString()})`, weight: 35 });
      } else if (diffAmt <= toleranceFee && isCredit && candidate.type === 'invoice') {
        // Bank fee / gateway charge deduction scenario (e.g. Invoice 100,000, Bank 99,500, Fee 500)
        score += 25;
        reasons.push({
          code: 'AMOUNT_WITH_BANK_FEE',
          description: `Amount match with potential bank charge difference (₹${diffAmt} fee)`,
          weight: 25,
        });
      } else if (diffAmt <= candidateAmt * 0.1) {
        score += 15;
        reasons.push({ code: 'CLOSE_AMOUNT', description: `Partial/close amount difference (₹${diffAmt})`, weight: 15 });
      }

      // 3. UTR / Reference / RRN Matching
      const txRef = (statementTx.reference || statementTx.utr || statementTx.upiReference || statementTx.chequeNumber || '').toUpperCase().trim();
      const candRef = (candidate.referenceNumber || '').toUpperCase().trim();

      if (txRef && candRef && (txRef === candRef || txRef.includes(candRef) || candRef.includes(txRef))) {
        score += 40;
        reasons.push({ code: 'EXACT_REFERENCE', description: `Matching reference/UTR/RRN (${candRef})`, weight: 40 });
      }

      // 4. Date Proximity
      const txDate = new Date(statementTx.transactionDate).getTime();
      const candDate = new Date(candidate.date).getTime();
      const daysDiff = Math.abs(txDate - candDate) / (1000 * 3600 * 24);

      if (daysDiff <= 1) {
        score += 25;
        reasons.push({ code: 'DATE_PROXIMITY_HIGH', description: `Date within 1 day (${candidate.date})`, weight: 25 });
      } else if (daysDiff <= 5) {
        score += 15;
        reasons.push({ code: 'DATE_PROXIMITY_MED', description: `Date within 5 days (${candidate.date})`, weight: 15 });
      } else if (daysDiff <= 14) {
        score += 5;
        reasons.push({ code: 'DATE_PROXIMITY_LOW', description: `Date within 14 days (${candidate.date})`, weight: 5 });
      }

      // 5. Entity Name in Narration
      if (candidate.entityName) {
        const cleanNarration = statementTx.narration.toLowerCase();
        const cleanEntity = candidate.entityName.toLowerCase();
        if (cleanNarration.includes(cleanEntity) || (statementTx.counterpartyName && statementTx.counterpartyName.toLowerCase().includes(cleanEntity))) {
          score += 20;
          reasons.push({ code: 'ENTITY_NAME_MATCH', description: `Entity name matched (${candidate.entityName})`, weight: 20 });
        }
      }

      // 6. Reference Number in Narration
      if (candRef && statementTx.narration.toUpperCase().includes(candRef)) {
        score += 20;
        reasons.push({ code: 'NARRATION_REF_MATCH', description: `Reference number in narration (${candRef})`, weight: 20 });
      }

      const finalScore = Math.min(100, score);

      if (finalScore >= 30) {
        suggestions.push({
          accountingTransactionType: candidate.type,
          accountingTransactionId: candidate.id,
          confidenceScore: finalScore,
          matchedAmount: Math.min(statementTx.amount, candidateAmt),
          reasons,
          details: {
            referenceNumber: candidate.referenceNumber,
            entityName: candidate.entityName,
            date: candidate.date,
            totalAmount: candidate.amount,
            description: candidate.description,
          },
        });
      }
    }

    // Sort by confidenceScore descending
    return suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }
}
