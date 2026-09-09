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

const ASSET_MONEY_SUBTYPES = new Set([
  'bank',
  'cash',
  'cash & bank',
  'cash and cash equivalents',
  'digital wallet',
  'undeposited funds',
  'payment clearing',
]);

const OUTFLOW_LIABILITY_SUBTYPES = new Set([
  'credit card',
  'credit cards',
  'loan/credit',
]);

function isEligibleMonetaryAccount(
  type: string,
  subType: string,
  direction: MonetaryAccountDirection,
  hasBankProfile: boolean
): boolean {
  if (hasBankProfile) return true;
  const normalizedType = type.trim().toLowerCase();
  const normalizedSubType = subType.trim().toLowerCase();

  if (normalizedType === 'bank' || normalizedType === 'cash') return true;
  if (normalizedType === 'asset' && ASSET_MONEY_SUBTYPES.has(normalizedSubType)) return true;
  return direction === 'OUTFLOW'
    && normalizedType === 'liability'
    && OUTFLOW_LIABILITY_SUBTYPES.has(normalizedSubType);
}

export class MonetaryAccountPolicy {
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
    let hasBankProfile = false;
    try {
      const bankProfile = await client.query(
        `SELECT id FROM bank_accounts
          WHERE organization_id = $1 AND ledger_account_id = $2 AND COALESCE(is_active, TRUE) = TRUE
          LIMIT 1`,
        [organizationId, row.id]
      );
      hasBankProfile = bankProfile.rows.length > 0;
    } catch {
      // bank_accounts table may not be queried in memory
    }

    if (!isEligibleMonetaryAccount(String(row.type || ''), String(row.sub_type || ''), direction, hasBankProfile)) {
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
