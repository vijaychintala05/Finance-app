import type { QueryClient } from '../accounting/postingEngine';
import { newId } from '../utils/ids';

export type SystemAccountRole =
  | 'BANK_OPERATING' | 'AR_CONTROL' | 'GST_INPUT' | 'TDS_RECEIVABLE' | 'VENDOR_ADVANCE' | 'PAYMENT_CLEARING'
  | 'AP_CONTROL' | 'CUSTOMER_ADVANCE' | 'GST_OUTPUT' | 'TDS_PAYABLE'
  | 'OWNER_CAPITAL' | 'RETAINED_EARNINGS' | 'OPENING_BALANCE'
  | 'SALES_REVENUE' | 'ROUNDING_GAIN' | 'DIRECT_COSTS' | 'BAD_DEBT' | 'ROUNDING_LOSS' | 'OPERATING_EXPENSE';

const DEFAULT_ACCOUNTS: Array<{
  code: string; name: string; type: string; subType: string; role: SystemAccountRole;
  financialStatement: 'BALANCE_SHEET' | 'PROFIT_AND_LOSS'; cashFlow?: 'OPERATING' | 'INVESTING' | 'FINANCING';
}> = [
  { code: '1000', name: 'Operating Bank Account', type: 'Asset', subType: 'Bank', role: 'BANK_OPERATING', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Accounts Receivable', role: 'AR_CONTROL', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1150', name: 'Vendor Advances', type: 'Asset', subType: 'Other Current Asset', role: 'VENDOR_ADVANCE', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1200', name: 'Input GST Receivable', type: 'Asset', subType: 'Other Current Asset', role: 'GST_INPUT', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1400', name: 'TDS Receivable', type: 'Asset', subType: 'Other Current Asset', role: 'TDS_RECEIVABLE', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1600', name: 'Payment Clearing', type: 'Asset', subType: 'Undeposited Funds', role: 'PAYMENT_CLEARING', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2000', name: 'Accounts Payable', type: 'Liability', subType: 'Accounts Payable', role: 'AP_CONTROL', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2100', name: 'Customer Advances', type: 'Liability', subType: 'Other Current Liability', role: 'CUSTOMER_ADVANCE', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2200', name: 'Output GST Payable', type: 'Liability', subType: 'Taxes Payable', role: 'GST_OUTPUT', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2250', name: 'TDS Payable', type: 'Liability', subType: 'Other Current Liability', role: 'TDS_PAYABLE', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '3000', name: 'Owner Equity', type: 'Equity', subType: 'Equity', role: 'OWNER_CAPITAL', financialStatement: 'BALANCE_SHEET', cashFlow: 'FINANCING' },
  { code: '3400', name: 'Retained Earnings', type: 'Equity', subType: 'Retained Earnings', role: 'RETAINED_EARNINGS', financialStatement: 'BALANCE_SHEET' },
  { code: '3500', name: 'Opening Balance Equity', type: 'Equity', subType: 'Equity', role: 'OPENING_BALANCE', financialStatement: 'BALANCE_SHEET' },
  { code: '4000', name: 'Sales & Services Revenue', type: 'Income', subType: 'Operating Revenue', role: 'SALES_REVENUE', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4900', name: 'Rounding Gain', type: 'Income', subType: 'Other Income', role: 'ROUNDING_GAIN', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5000', name: 'Direct Project Costs', type: 'Expense', subType: 'Direct Expense / Cost of Goods', role: 'DIRECT_COSTS', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5800', name: 'Bad Debt Expense', type: 'Expense', subType: 'Operating Expense', role: 'BAD_DEBT', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5900', name: 'Rounding Loss', type: 'Expense', subType: 'Other Expenses', role: 'ROUNDING_LOSS', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6000', name: 'Operating Expense', type: 'Expense', subType: 'Operating Expense', role: 'OPERATING_EXPENSE', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
];

const LEGACY_CODE_ROLES: Record<string, SystemAccountRole> = {
  '1000': 'BANK_OPERATING', '1100': 'AR_CONTROL', '1150': 'VENDOR_ADVANCE', '1200': 'GST_INPUT',
  '1400': 'TDS_RECEIVABLE', '1600': 'PAYMENT_CLEARING', '2000': 'AP_CONTROL', '2100': 'CUSTOMER_ADVANCE',
  '2200': 'GST_OUTPUT', '2250': 'TDS_PAYABLE', '3000': 'OWNER_CAPITAL', '3400': 'RETAINED_EARNINGS',
  '3500': 'OPENING_BALANCE', '4000': 'SALES_REVENUE', '4900': 'ROUNDING_GAIN', '5000': 'DIRECT_COSTS',
  '5800': 'BAD_DEBT', '5900': 'ROUNDING_LOSS', '6000': 'OPERATING_EXPENSE',
};

const LEGACY_ROLE_CODES: Record<SystemAccountRole, string[]> = {
  BANK_OPERATING: ['1000', '1010', '1020'], AR_CONTROL: ['1100'], GST_INPUT: ['1200'], TDS_RECEIVABLE: ['1400'], VENDOR_ADVANCE: ['1150', '1200'], PAYMENT_CLEARING: ['1600'],
  AP_CONTROL: ['2000'], CUSTOMER_ADVANCE: ['2100'], GST_OUTPUT: ['2200', '2110', '2100'], TDS_PAYABLE: ['2250'],
  OWNER_CAPITAL: ['3000'], RETAINED_EARNINGS: ['3400', '3000'], OPENING_BALANCE: ['3500'],
  SALES_REVENUE: ['4000', '4010'], ROUNDING_GAIN: ['4900'], DIRECT_COSTS: ['5000', '5010'], BAD_DEBT: ['5800', '6000'], ROUNDING_LOSS: ['5900'], OPERATING_EXPENSE: ['6000', '6010', '6020', '6030'],
};

export class OrganizationProvisioningService {
  public static async provisionDefaultChart(client: QueryClient, organizationId: string): Promise<void> {
    for (const account of DEFAULT_ACCOUNTS) {
      await client.query(
        `INSERT INTO accounts
          (id, organization_id, code, name, type, sub_type, balance, is_system_account, status, normal_balance, normal_balance_is_explicit, system_role, financial_statement, cash_flow_classification)
          VALUES ($1, $2, $3, $4, $5, $6, 0, TRUE, 'Active', $7, TRUE, $8, $9, $10)
          ON CONFLICT (organization_id, code) DO UPDATE
            SET is_system_account = TRUE,
                system_role = EXCLUDED.system_role,
               financial_statement = EXCLUDED.financial_statement,
               cash_flow_classification = EXCLUDED.cash_flow_classification,
                normal_balance = EXCLUDED.normal_balance,
                normal_balance_is_explicit = TRUE`,
        [newId('acc'), organizationId, account.code, account.name, account.type, account.subType,
          ['Asset', 'Expense'].includes(account.type) ? 'Debit' : 'Credit', account.role, account.financialStatement, account.cashFlow || null]
      );
      const resolved = await client.query(
        `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2`, [organizationId, account.code]
      );
      await client.query(
        `INSERT INTO accounting_defaults (organization_id, system_role, account_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, system_role) DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = CURRENT_TIMESTAMP`,
        [organizationId, account.role, resolved.rows[0].id]
      );
    }
  }

  public static async resolveAccountId(
    client: QueryClient,
    organizationId: string,
    code: string,
    expectedTypes: string[] = []
  ): Promise<string> {
    const role = LEGACY_CODE_ROLES[code];
    if (role) return this.resolveSystemAccountId(client, organizationId, role, expectedTypes);
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

  public static async resolveSystemAccountId(
    client: QueryClient,
    organizationId: string,
    systemRole: SystemAccountRole,
    expectedTypes: string[] = []
  ): Promise<string> {
    const result = await client.query(
      `SELECT a.id, a.type, a.status
         FROM accounting_defaults d
         JOIN accounts a ON a.organization_id = d.organization_id AND a.id = d.account_id
        WHERE d.organization_id = $1 AND d.system_role = $2`,
      [organizationId, systemRole]
    );
    if (result.rows.length !== 1 || result.rows[0].status !== 'Active') {
      const byRole = await client.query(
        `SELECT id, type, status FROM accounts WHERE organization_id = $1 AND system_role = $2 AND status = 'Active' ORDER BY code ASC LIMIT 1`,
        [organizationId, systemRole]
      );
      const legacyCodes = LEGACY_ROLE_CODES[systemRole];
      const fallback = byRole.rows.length === 1 ? byRole : await client.query(
        `SELECT id, type, status FROM accounts WHERE organization_id = $1 AND code = ANY($2) AND status = 'Active' ORDER BY code ASC LIMIT 1`,
        [organizationId, legacyCodes]
      );
      if (fallback.rows.length !== 1) throw new Error(`Required system account ${systemRole} is missing or inactive`);
      if (expectedTypes.length > 0 && !expectedTypes.includes(fallback.rows[0].type)) {
        throw new Error(`Required system account ${systemRole} has invalid type ${fallback.rows[0].type}`);
      }
      return fallback.rows[0].id;
    }
    if (expectedTypes.length > 0 && !expectedTypes.includes(result.rows[0].type)) {
      throw new Error(`Required system account ${systemRole} has invalid type ${result.rows[0].type}`);
    }
    return result.rows[0].id;
  }
}
