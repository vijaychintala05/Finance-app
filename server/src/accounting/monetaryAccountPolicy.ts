import type { DbQueryClient } from '../database/db';
import { OrganizationProvisioningService } from '../services/OrganizationProvisioningService';

export type MonetaryAccountDirection = 'INFLOW' | 'OUTFLOW' | 'TRANSFER';

export interface MonetaryAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  subType: string;
}

export const ASSET_MONEY_SUBTYPES = new Set([
  'bank',
  'cash',
  'cash & bank',
  'cash and cash equivalents',
  'checking',
  'savings',
  'digital wallet',
  'undeposited funds',
  'payment clearing',
]);

export const OUTFLOW_LIABILITY_SUBTYPES = new Set([
  'credit card',
  'credit cards',
  'loan/credit',
]);

export class MonetaryAccountPolicy {
  /**
   * Used for Dashboard, Cash Flow Statements, and Bank Balances.
   * Strictly requires Asset/Bank/Cash with an approved liquid money subtype.
   * Non-asset accounts (Expense, Liability, Equity, Income) can NEVER qualify,
   * regardless of whether a bank_accounts profile was associated with them.
   */
  public static isLiquidCashAsset(account: { type: string; sub_type?: string; subType?: string }): boolean {
    const normType = String(account.type || '').trim().toLowerCase();
    const normSubType = String(account.sub_type || account.subType || '').trim().toLowerCase();

    if (['expense', 'cost of goods sold', 'other expense', 'liability', 'equity', 'income', 'revenue'].includes(normType)) {
      return false;
    }

    if (normType === 'bank' || normType === 'cash') return true;
    return normType === 'asset' && ASSET_MONEY_SUBTYPES.has(normSubType);
  }

  /**
   * Backward-compatible alias for isLiquidCashAsset.
   */
  public static isMonetaryAsset(account: { type: string; sub_type?: string; subType?: string }): boolean {
    return MonetaryAccountPolicy.isLiquidCashAsset(account);
  }

  /**
   * Used for payment, transfer, and credit-card selection.
   * For INFLOW and TRANSFER, requires a liquid cash asset.
   * For OUTFLOW, allows liquid cash assets OR qualifying liability credit-card/credit lines.
   */
  public static isEligiblePaymentAccount(
    direction: MonetaryAccountDirection,
    account: { type: string; sub_type?: string; subType?: string }
  ): boolean {
    if (MonetaryAccountPolicy.isLiquidCashAsset(account)) {
      return true;
    }

    if (direction === 'OUTFLOW') {
      const normType = String(account.type || '').trim().toLowerCase();
      const normSubType = String(account.sub_type || account.subType || '').trim().toLowerCase();
      return normType === 'liability' && OUTFLOW_LIABILITY_SUBTYPES.has(normSubType);
    }

    return false;
  }

  /**
   * Authoritative SQL WHERE-clause condition for identifying liquid monetary assets.
   * Guaranteed to match isLiquidCashAsset logic.
   */
  public static getMonetaryAccountSqlCondition(tableAlias: string = 'a'): string {
    return `(
      (UPPER(${tableAlias}.type) IN ('BANK', 'CASH') OR (
        UPPER(${tableAlias}.type) = 'ASSET' AND UPPER(COALESCE(${tableAlias}.sub_type, '')) IN (
          'BANK', 'CASH', 'CASH & BANK', 'CASH AND CASH EQUIVALENTS',
          'CHECKING', 'SAVINGS', 'DIGITAL WALLET', 'UNDEPOSITED FUNDS', 'PAYMENT CLEARING'
        )
      ))
      AND UPPER(${tableAlias}.type) NOT IN ('EXPENSE', 'COST OF GOODS SOLD', 'OTHER EXPENSE', 'LIABILITY', 'EQUITY', 'INCOME', 'REVENUE')
    )`;
  }

  public static async resolve(
    client: DbQueryClient,
    organizationId: string,
    accountIdOrCode: string | undefined,
    direction: MonetaryAccountDirection,
    fieldName: string
  ): Promise<MonetaryAccount> {
    let requested = String(accountIdOrCode || '').trim();
    if (!requested) {
      requested = await OrganizationProvisioningService.resolveSystemAccountId(
        client,
        organizationId,
        'BANK_OPERATING',
        ['Asset']
      );
    }

    const result = await client.query(
      `SELECT a.id, a.code, a.name, a.type, a.sub_type
         FROM accounts a
        WHERE a.organization_id = $1
          AND (a.id = $2 OR a.code = $2)
          AND a.status = 'Active'
          AND COALESCE(a.is_locked, FALSE) = FALSE
          AND COALESCE(a.allow_direct_posting, TRUE) = TRUE
        ORDER BY CASE WHEN a.id = $2 THEN 0 ELSE 1 END
        LIMIT 1`,
      [organizationId, requested]
    );

    if (result.rows.length !== 1) {
      throw new Error(`${fieldName.toUpperCase()}_INVALID: Account is unavailable in this organization`);
    }

    const row = result.rows[0];

    let isEligible = MonetaryAccountPolicy.isEligiblePaymentAccount(direction, { type: row.type, sub_type: row.sub_type });
    if (!isEligible && String(row.type || '').trim().toLowerCase() === 'asset') {
      try {
        const bankProfile = await client.query(
          `SELECT id FROM bank_accounts
            WHERE organization_id = $1 AND ledger_account_id = $2 AND COALESCE(is_active, TRUE) = TRUE
            LIMIT 1`,
          [organizationId, row.id]
        );
        if (bankProfile.rows.length > 0) {
          isEligible = true;
        }
      } catch {
        // bank_accounts table may not exist in test schema
      }
    }

    if (!isEligible) {
      const allowed = direction === 'OUTFLOW'
        ? 'bank, cash, wallet, clearing, or credit-card account'
        : 'bank, cash, wallet, or clearing account';
      throw new Error(`${fieldName.toUpperCase()}_TYPE_INVALID: Select a ${allowed}`);
    }

    return {
      id: String(row.id),
      code: String(row.code || ''),
      name: String(row.name || ''),
      type: String(row.type || ''),
      subType: String(row.sub_type || ''),
    };
  }
}
