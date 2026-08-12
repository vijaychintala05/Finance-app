import type { QueryClient } from '../accounting/postingEngine';
import { newId } from '../utils/ids';

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Operating Bank Account', type: 'Asset', subType: 'Bank' },
  { code: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Accounts Receivable' },
  { code: '1200', name: 'Input Tax Receivable', type: 'Asset', subType: 'Other Current Asset' },
  { code: '2000', name: 'Accounts Payable', type: 'Liability', subType: 'Accounts Payable' },
  { code: '2100', name: 'Customer Advances', type: 'Liability', subType: 'Other Current Liability' },
  { code: '2200', name: 'Sales Tax Payable', type: 'Liability', subType: 'Tax Payable' },
  { code: '3000', name: 'Owner Equity', type: 'Equity', subType: 'Owner Equity' },
  { code: '4000', name: 'Sales & Services Revenue', type: 'Income', subType: 'Operating Revenue' },
  { code: '4900', name: 'Rounding Gain', type: 'Income', subType: 'Other Income' },
  { code: '5800', name: 'Bad Debt Expense', type: 'Expense', subType: 'Operating Expense' },
  { code: '5900', name: 'Rounding Loss', type: 'Expense', subType: 'Other Expense' },
  { code: '6000', name: 'Operating Expense', type: 'Expense', subType: 'Operating Expense' },
] as const;

export class OrganizationProvisioningService {
  public static async provisionDefaultChart(client: QueryClient, organizationId: string): Promise<void> {
    for (const account of DEFAULT_ACCOUNTS) {
      await client.query(
        `INSERT INTO accounts
         (id, organization_id, code, name, type, sub_type, balance, is_system_account, status)
         VALUES ($1, $2, $3, $4, $5, $6, 0, TRUE, 'Active')
         ON CONFLICT (organization_id, code) DO NOTHING`,
        [newId('acc'), organizationId, account.code, account.name, account.type, account.subType]
      );
    }
  }

  public static async resolveAccountId(
    client: QueryClient,
    organizationId: string,
    code: string,
    expectedTypes: string[] = []
  ): Promise<string> {
    const result = await client.query(
      `SELECT id, type FROM accounts WHERE organization_id = $1 AND code = $2 AND status = 'Active'`,
      [organizationId, code]
    );
    if (result.rows.length !== 1) {
      throw new Error(`Required control account ${code} is missing or ambiguous`);
    }
    if (expectedTypes.length > 0 && !expectedTypes.includes(result.rows[0].type)) {
      throw new Error(`Required control account ${code} has invalid type ${result.rows[0].type}`);
    }
    return result.rows[0].id;
  }
}
