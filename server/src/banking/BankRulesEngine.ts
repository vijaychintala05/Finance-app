import { BankReconciliationRule, BankStatementTransaction } from '../../../src/types/banking';

export interface ExtendedReconciliationRule extends BankReconciliationRule {
  minAmount?: number;
  maxAmount?: number;
  patternType?: 'CONTAINS' | 'STARTS_WITH' | 'EXACT' | 'REGEX';
  counterpartyPattern?: string;
}

export interface RuleSuggestionResult {
  ruleId: string;
  ruleName: string;
  suggestedCategory?: string;
  suggestedAccountId?: string;
  matchExplanation: string;
}

export class BankRulesEngine {
  public static evaluateRules(
    transaction: BankStatementTransaction,
    rules: ExtendedReconciliationRule[]
  ): RuleSuggestionResult | null {
    const activeRules = rules
      .filter((r) => r.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of activeRules) {
      // 1. Direction Filter
      if (rule.direction !== 'BOTH' && rule.direction !== transaction.direction) {
        continue;
      }

      // 2. Amount Range
      if (rule.minAmount !== undefined && transaction.amount < rule.minAmount) {
        continue;
      }
      if (rule.maxAmount !== undefined && transaction.amount > rule.maxAmount) {
        continue;
      }

      // 3. Counterparty Match
      if (rule.counterpartyPattern && rule.counterpartyPattern.trim()) {
        const cpTarget = (transaction.counterpartyName || '').toLowerCase();
        const cpPattern = rule.counterpartyPattern.trim().toLowerCase();
        if (!cpTarget.includes(cpPattern)) {
          continue;
        }
      }

      // 4. Narration Pattern Match
      const pattern = (rule.narrationPattern || '').trim().toLowerCase();
      const narration = (transaction.narration || '').toLowerCase();

      let matched = false;
      const patternType = rule.patternType || 'CONTAINS';

      if (!pattern) {
        // If no narration pattern specified, matches based on amount/counterparty
        matched = true;
      } else {
        switch (patternType) {
          case 'STARTS_WITH':
            matched = narration.startsWith(pattern);
            break;
          case 'EXACT':
            matched = narration === pattern;
            break;
          case 'REGEX':
            try {
              const regex = new RegExp(rule.narrationPattern, 'i');
              matched = regex.test(transaction.narration);
            } catch {
              matched = narration.includes(pattern);
            }
            break;
          case 'CONTAINS':
          default:
            matched = narration.includes(pattern);
            break;
        }
      }

      if (matched) {
        const explanations: string[] = [];
        if (pattern) explanations.push(`narration ${patternType.toLowerCase()} "${rule.narrationPattern}"`);
        if (rule.minAmount !== undefined || rule.maxAmount !== undefined) {
          explanations.push(`amount within range [${rule.minAmount ?? 0}, ${rule.maxAmount ?? '∞'}]`);
        }
        if (rule.counterpartyPattern) {
          explanations.push(`counterparty matches "${rule.counterpartyPattern}"`);
        }

        return {
          ruleId: rule.id,
          ruleName: rule.ruleName,
          suggestedCategory: rule.suggestedCategory,
          suggestedAccountId: rule.suggestedAccountId,
          matchExplanation: `Rule "${rule.ruleName}" matched: ${explanations.join(', ')}`,
        };
      }
    }

    return null;
  }
}
