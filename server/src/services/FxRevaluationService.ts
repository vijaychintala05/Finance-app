import { db, type DbQueryClient } from '../database/db';
import { newId } from '../utils/ids';
import { ServerPostingEngine } from '../accounting/postingEngine';

export interface FxVarianceResult {
  originalBase: number;
  settlementBase: number;
  varianceAmount: number;
  isGain: boolean;
}

export interface PostFxEntryParams {
  organizationId: string;
  invoiceId: string;
  paymentId: string;
  varianceAmount: number;
  isGain: boolean;
  date: string;
  reference?: string;
  currency: string;
}

export class FxRevaluationService {
  /**
   * Calculates realized FX gain or loss on settlement of a foreign-currency invoice/bill.
   */
  public static calculateFxVariance(params: {
    originalAmount: number;
    originalFxRate: number;
    settlementAmount: number;
    settlementFxRate: number;
  }): FxVarianceResult {
    const originalBase = Math.round(params.originalAmount * params.originalFxRate * 100) / 100;
    const settlementBase = Math.round(params.settlementAmount * params.settlementFxRate * 100) / 100;
    const diff = Math.round((settlementBase - originalBase) * 100) / 100;

    return {
      originalBase,
      settlementBase,
      varianceAmount: Math.abs(diff),
      isGain: diff >= 0,
    };
  }

  /**
   * Resolves or provisions system FX gain/loss accounts for an organization.
   */
  private static async resolveFxAccount(
    client: DbQueryClient,
    organizationId: string,
    isGain: boolean
  ): Promise<string> {
    const code = isGain ? '4900' : '6900';
    const name = isGain ? 'Foreign Exchange Gain' : 'Foreign Exchange Loss';
    const type = isGain ? 'Revenue' : 'Expense';
    const subType = isGain ? 'OtherRevenue' : 'OtherExpense';

    const existing = await client.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [organizationId, code]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }

    const newAccountId = newId('acc');
    await client.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, sub_type, balance, is_system_account, status)
       VALUES ($1, $2, $3, $4, $5, $6, 0.00, true, 'Active')
       ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [newAccountId, organizationId, code, name, type, subType]
    );

    return newAccountId;
  }

  /**
   * Posts an automated, balanced Realized Foreign Exchange Gain/Loss journal entry.
   */
  public static async postRealizedFxEntry(
    client: DbQueryClient,
    params: PostFxEntryParams
  ): Promise<{ entryId: string; varianceAmount: number; isGain: boolean }> {
    const { organizationId, invoiceId, paymentId, varianceAmount, isGain, date, reference, currency } = params;

    if (varianceAmount <= 0) {
      throw new Error('FX_VARIANCE_ZERO: No exchange variance to post');
    }

    // 1. Resolve FX Gain/Loss account
    const fxAccountId = await this.resolveFxAccount(client, organizationId, isGain);

    // 2. Resolve AR/Clearing account to absorb exchange rate differential
    const arRes = await client.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND (code = '1100' OR type = 'Asset') AND status = 'Active' LIMIT 1`,
      [organizationId]
    );
    if (arRes.rows.length === 0) throw new Error('AR_ACCOUNT_NOT_FOUND');
    const arAccountId = arRes.rows[0].id;

    // 3. Construct balanced journal lines
    // If GAIN: Debit AR (to absorb surplus base currency), Credit FX Gain (Revenue)
    // If LOSS: Debit FX Loss (Expense), Credit AR
    const lines = isGain
      ? [
          { accountId: arAccountId, debit: varianceAmount, credit: 0, description: `FX Gain adjustment for ${currency}` },
          { accountId: fxAccountId, debit: 0, credit: varianceAmount, description: `Realized FX Gain on ${reference || invoiceId}` },
        ]
      : [
          { accountId: fxAccountId, debit: varianceAmount, credit: 0, description: `Realized FX Loss on ${reference || invoiceId}` },
          { accountId: arAccountId, debit: 0, credit: varianceAmount, description: `FX Loss adjustment for ${currency}` },
        ];

    const entryNumber = `FX-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const posting = await ServerPostingEngine.postEntry({
      organizationId,
      entryNumber,
      date,
      reference: reference || `FX-SETTLE-${paymentId.slice(-8)}`,
      description: `Automated realized FX ${isGain ? 'Gain' : 'Loss'} on invoice ${invoiceId} settlement (${currency})`,
      lines,
    }, client);

    await client.query(
      `INSERT INTO audit_logs (id, organization_id, user_id, action, entity_type, entity_id, after_state)
       VALUES ($1, $2, 'system-fx-engine', $3, 'Invoice', $4, $5)`,
      [
        newId('aud'),
        organizationId,
        isGain ? 'REALIZED_FX_GAIN_POSTED' : 'REALIZED_FX_LOSS_POSTED',
        invoiceId,
        JSON.stringify({ paymentId, varianceAmount, currency, journalEntryId: posting.entryId }),
      ]
    );

    return {
      entryId: posting.entryId,
      varianceAmount,
      isGain,
    };
  }
}
