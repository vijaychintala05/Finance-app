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

function isEligibleMonetaryAccount(type: string, subType: string, direction: MonetaryAccountDirection): boolean {
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
      `SELECT id, code, name, type, sub_type
         FROM accounts
        WHERE organization_id = $1
          AND (id = $2 OR code = $2)
          AND status = 'Active'
          AND COALESCE(is_locked, FALSE) = FALSE
          AND COALESCE(allow_direct_posting, TRUE) = TRUE
        ORDER BY CASE WHEN id = $2 THEN 0 ELSE 1 END
        LIMIT 1`,
      [organizationId, requested]
    );

    if (result.rows.length !== 1) {
      throw new Error(`${fieldName.toUpperCase()}_INVALID: Account is unavailable in this organization`);
    }

    const row = result.rows[0];
    if (!isEligibleMonetaryAccount(String(row.type || ''), String(row.sub_type || ''), direction)) {
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
