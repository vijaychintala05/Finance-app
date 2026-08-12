import { BankReconciliationRule, BankStatementTransaction } from '../../../src/types/banking';

export interface RuleSuggestionResult {
  ruleId: string;
  ruleName: string;
  suggestedCategory?: string;
  suggestedAccountId?: string;
}

export class BankRulesEngine {
  public static evaluateRules(
    transaction: BankStatementTransaction,
    rules: BankReconciliationRule[]
  ): RuleSuggestionResult | null {
    const activeRules = rules
      .filter((r) => r.isEnabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of activeRules) {
      if (rule.direction !== 'BOTH' && rule.direction !== transaction.direction) {
        continue;
      }

      const pattern = rule.narrationPattern.trim().toLowerCase();
      const narration = transaction.narration.toLowerCase();

      if (pattern && narration.includes(pattern)) {
        return {
          ruleId: rule.id,
          ruleName: rule.ruleName,
          suggestedCategory: rule.suggestedCategory,
          suggestedAccountId: rule.suggestedAccountId,
        };
      }
    }

    return null;
  }
}
