import type { QueryClient } from '../accounting/postingEngine';
import { newId } from '../utils/ids';

export type SystemAccountRole =
  | 'BANK_OPERATING' | 'AR_CONTROL' | 'GST_INPUT' | 'TDS_RECEIVABLE' | 'VENDOR_ADVANCE' | 'PAYMENT_CLEARING'
  | 'AP_CONTROL' | 'CUSTOMER_ADVANCE' | 'GST_OUTPUT' | 'TDS_PAYABLE'
  | 'OWNER_CAPITAL' | 'RETAINED_EARNINGS' | 'OPENING_BALANCE'
  | 'SALES_REVENUE' | 'ROUNDING_GAIN' | 'DIRECT_COSTS' | 'BAD_DEBT' | 'ROUNDING_LOSS' | 'OPERATING_EXPENSE';

export const SYSTEM_ACCOUNT_ROLE_TYPES: Record<SystemAccountRole, string[]> = {
  BANK_OPERATING: ['Asset'], AR_CONTROL: ['Asset'], GST_INPUT: ['Asset'], TDS_RECEIVABLE: ['Asset'], VENDOR_ADVANCE: ['Asset'], PAYMENT_CLEARING: ['Asset'],
  AP_CONTROL: ['Liability'], CUSTOMER_ADVANCE: ['Liability'], GST_OUTPUT: ['Liability'], TDS_PAYABLE: ['Liability'],
  OWNER_CAPITAL: ['Equity'], RETAINED_EARNINGS: ['Equity'], OPENING_BALANCE: ['Equity'],
  SALES_REVENUE: ['Income', 'Revenue', 'Other Income'], ROUNDING_GAIN: ['Income', 'Revenue', 'Other Income'],
  DIRECT_COSTS: ['Expense', 'Cost of Goods Sold'], BAD_DEBT: ['Expense', 'Cost of Goods Sold'], ROUNDING_LOSS: ['Expense', 'Cost of Goods Sold'], OPERATING_EXPENSE: ['Expense', 'Cost of Goods Sold'],
};

type ProvisionedAccount = {
  code: string;
  name: string;
  type: string;
  subType: string;
  financialStatement: 'BALANCE_SHEET' | 'PROFIT_AND_LOSS';
  cashFlow?: 'OPERATING' | 'INVESTING' | 'FINANCING';
  normalBalance?: 'Debit' | 'Credit';
};

type SystemProvisionedAccount = ProvisionedAccount & {
  role: SystemAccountRole;
};

const SYSTEM_DEFAULT_ACCOUNTS: SystemProvisionedAccount[] = [
  { code: '1000', name: 'Operating Bank Account', type: 'Asset', subType: 'Bank', role: 'BANK_OPERATING', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1100', name: 'Accounts Receivable', type: 'Asset', subType: 'Accounts Receivable', role: 'AR_CONTROL', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1150', name: 'Vendor Advances', type: 'Asset', subType: 'Other Current Asset', role: 'VENDOR_ADVANCE', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1200', name: 'Input GST Receivable', type: 'Asset', subType: 'Other Current Asset', role: 'GST_INPUT', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1400', name: 'TDS Receivable', type: 'Asset', subType: 'Other Current Asset', role: 'TDS_RECEIVABLE', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1600', name: 'Payment Clearing', type: 'Asset', subType: 'Payment Clearing', role: 'PAYMENT_CLEARING', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
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

// Ordinary starter accounts follow Zoho Books India's account model, while the
// system defaults above remain the stable accounts used by the posting engine.
export const INDIA_STARTER_ACCOUNTS: ProvisionedAccount[] = [
  { code: '1030', name: 'Petty Cash', type: 'Asset', subType: 'Cash', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1040', name: 'Undeposited Funds', type: 'Asset', subType: 'Undeposited Funds', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1050', name: 'Advance Tax', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1060', name: 'Employee Advance', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1070', name: 'Prepaid Expenses', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1080', name: 'Contract Assets', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1210', name: 'Input CGST', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1220', name: 'Input SGST', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1230', name: 'Input IGST', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1240', name: 'GST TDS Receivable', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1250', name: 'GST TCS Receivable', type: 'Asset', subType: 'Other Current Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1300', name: 'Inventory Asset', type: 'Asset', subType: 'Inventory', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1310', name: 'Finished Goods', type: 'Asset', subType: 'Inventory', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1320', name: 'Work In Progress', type: 'Asset', subType: 'Inventory', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1330', name: 'Goods In Transit', type: 'Asset', subType: 'Inventory', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '1700', name: 'Furniture and Equipment', type: 'Asset', subType: 'Fixed Assets', financialStatement: 'BALANCE_SHEET', cashFlow: 'INVESTING' },
  { code: '1710', name: 'Accumulated Depreciation - Furniture and Equipment', type: 'Asset', subType: 'Accumulated Depreciation', financialStatement: 'BALANCE_SHEET', normalBalance: 'Credit' },
  { code: '1800', name: 'Investments', type: 'Asset', subType: 'Other Asset', financialStatement: 'BALANCE_SHEET', cashFlow: 'INVESTING' },
  { code: '1900', name: 'Deferred Tax Asset', type: 'Asset', subType: 'Deferred Tax Asset', financialStatement: 'BALANCE_SHEET' },

  { code: '2130', name: 'Unearned Revenue', type: 'Liability', subType: 'Other Current Liability', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2140', name: 'Deferred Revenue', type: 'Liability', subType: 'Other Current Liability', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2210', name: 'Output CGST', type: 'Liability', subType: 'Taxes Payable', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2220', name: 'Output SGST', type: 'Liability', subType: 'Taxes Payable', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2230', name: 'Output IGST', type: 'Liability', subType: 'Taxes Payable', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2240', name: 'Reverse Charge GST Payable', type: 'Liability', subType: 'Taxes Payable', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2260', name: 'Tax Payable', type: 'Liability', subType: 'Taxes Payable', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2300', name: 'Credit Card Payable', type: 'Liability', subType: 'Credit Cards', financialStatement: 'BALANCE_SHEET', cashFlow: 'OPERATING' },
  { code: '2400', name: 'Construction Loan', type: 'Liability', subType: 'Long Term Liability', financialStatement: 'BALANCE_SHEET', cashFlow: 'FINANCING' },
  { code: '2410', name: 'Mortgage Payable', type: 'Liability', subType: 'Long Term Liability', financialStatement: 'BALANCE_SHEET', cashFlow: 'FINANCING' },
  { code: '2500', name: 'Deferred Tax Liability', type: 'Liability', subType: 'Deferred Tax Liability', financialStatement: 'BALANCE_SHEET' },

  { code: '3100', name: 'Drawings', type: 'Equity', subType: 'Drawings', financialStatement: 'BALANCE_SHEET', cashFlow: 'FINANCING', normalBalance: 'Debit' },

  { code: '4020', name: 'Design Revenue', type: 'Income', subType: 'Services', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4030', name: 'Execution Revenue', type: 'Income', subType: 'Services', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4040', name: 'General Income', type: 'Income', subType: 'Other Operating Income', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4050', name: 'Interest Income', type: 'Income', subType: 'Interest Income', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4060', name: 'Late Fee Income', type: 'Income', subType: 'Other Income', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4070', name: 'Shipping Charge Income', type: 'Income', subType: 'Other Operating Income', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4080', name: 'Other Charges Income', type: 'Income', subType: 'Other Income', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '4090', name: 'Discount Given', type: 'Income', subType: 'Sales Returns', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING', normalBalance: 'Debit' },
  { code: '4095', name: 'Exchange Gain', type: 'Income', subType: 'Other Income', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },

  { code: '5100', name: 'Materials', type: 'Cost of Goods Sold', subType: 'Materials', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5110', name: 'Direct Labor', type: 'Cost of Goods Sold', subType: 'Direct Labor', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5120', name: 'Subcontractor Costs', type: 'Cost of Goods Sold', subType: 'Subcontractors', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5130', name: 'Freight', type: 'Cost of Goods Sold', subType: 'Freight', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5140', name: 'Site Expenses', type: 'Cost of Goods Sold', subType: 'Site Expenses', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5150', name: 'Job Costing', type: 'Cost of Goods Sold', subType: 'Other Direct Costs', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5160', name: 'Project Acquisition Costs', type: 'Cost of Goods Sold', subType: 'Other Direct Costs', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '5170', name: 'Raw Materials and Consumables', type: 'Cost of Goods Sold', subType: 'Materials', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },

  { code: '6100', name: 'Salaries and Employee Wages', type: 'Expense', subType: 'Payroll', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6110', name: 'Salary and Bonus', type: 'Expense', subType: 'Payroll', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6120', name: 'Advertising and Marketing', type: 'Expense', subType: 'Sales & Marketing', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6130', name: 'Automobile Expense', type: 'Expense', subType: 'Travel & Vehicle', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6140', name: 'Bank Fees and Charges', type: 'Expense', subType: 'Financial Expenses', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6150', name: 'Consultant Expense', type: 'Expense', subType: 'Professional Services', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6160', name: 'Credit Card Charges', type: 'Expense', subType: 'Financial Expenses', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6170', name: 'Depreciation Expense', type: 'Expense', subType: 'Depreciation & Amortization', financialStatement: 'PROFIT_AND_LOSS' },
  { code: '6180', name: 'Employee Reimbursements', type: 'Expense', subType: 'Payroll', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6190', name: 'Fuel and Mileage Expenses', type: 'Expense', subType: 'Travel & Vehicle', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6200', name: 'IT and Internet Expenses', type: 'Expense', subType: 'Utilities & Communication', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6210', name: 'Janitorial Expense', type: 'Expense', subType: 'Office & Administrative', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6220', name: 'Lodging', type: 'Expense', subType: 'Travel & Vehicle', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6230', name: 'Meals and Entertainment', type: 'Expense', subType: 'Travel & Vehicle', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6240', name: 'Office Supplies', type: 'Expense', subType: 'Office & Administrative', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6250', name: 'Parking', type: 'Expense', subType: 'Travel & Vehicle', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6260', name: 'Postage', type: 'Expense', subType: 'Office & Administrative', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6270', name: 'Printing and Stationery', type: 'Expense', subType: 'Office & Administrative', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6280', name: 'Rent Expense', type: 'Expense', subType: 'Office & Administrative', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6290', name: 'Repairs and Maintenance', type: 'Expense', subType: 'Repairs & Maintenance', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6300', name: 'Telephone Expense', type: 'Expense', subType: 'Utilities & Communication', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6310', name: 'Transportation Expense', type: 'Expense', subType: 'Travel & Vehicle', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6320', name: 'Travel Expense', type: 'Expense', subType: 'Travel & Vehicle', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6330', name: 'Software and Subscriptions', type: 'Expense', subType: 'Software & Subscriptions', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6340', name: 'Project Overheads', type: 'Expense', subType: 'Operating Expense', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '6350', name: 'Other Operating Expenses', type: 'Expense', subType: 'Miscellaneous Expenses', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },

  { code: '7000', name: 'Interest Expense', type: 'Other Expense', subType: 'Interest Expense', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '7010', name: 'Asset Disposal Loss', type: 'Other Expense', subType: 'Asset Losses', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'INVESTING' },
  { code: '7020', name: 'Exchange Loss', type: 'Other Expense', subType: 'Other Expenses', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
  { code: '7030', name: 'Tax Adjustments', type: 'Other Expense', subType: 'Other Expenses', financialStatement: 'PROFIT_AND_LOSS', cashFlow: 'OPERATING' },
];

function normalBalanceFor(account: ProvisionedAccount): 'Debit' | 'Credit' {
  return account.normalBalance ?? (
    ['Asset', 'Expense', 'Cost of Goods Sold', 'Other Expense'].includes(account.type) ? 'Debit' : 'Credit'
  );
}

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
    for (const account of SYSTEM_DEFAULT_ACCOUNTS) {
      await client.query(
        `INSERT INTO accounts
          (id, organization_id, code, name, type, sub_type, balance, is_system_account, status, normal_balance, normal_balance_is_explicit, system_role, financial_statement, cash_flow_classification)
          VALUES ($1, $2, $3, $4, $5, $6, 0, TRUE, 'Active', $7, TRUE, $8, $9, $10)
          ON CONFLICT (organization_id, code) DO UPDATE
            SET is_system_account = TRUE,
                system_role = EXCLUDED.system_role,
                type = EXCLUDED.type,
                sub_type = EXCLUDED.sub_type,
                financial_statement = EXCLUDED.financial_statement,
                cash_flow_classification = EXCLUDED.cash_flow_classification,
                normal_balance = EXCLUDED.normal_balance,
                normal_balance_is_explicit = TRUE`,
        [newId('acc'), organizationId, account.code, account.name, account.type, account.subType,
          normalBalanceFor(account), account.role, account.financialStatement, account.cashFlow || null]
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

    for (const account of INDIA_STARTER_ACCOUNTS) {
      await client.query(
        `INSERT INTO accounts
          (id, organization_id, code, name, type, sub_type, balance, is_system_account, status, normal_balance, normal_balance_is_explicit, financial_statement, cash_flow_classification)
          VALUES ($1, $2, $3, $4, $5, $6, 0, FALSE, 'Active', $7, TRUE, $8, $9)
          ON CONFLICT (organization_id, code) DO NOTHING`,
        [newId('acc'), organizationId, account.code, account.name, account.type, account.subType,
          normalBalanceFor(account), account.financialStatement, account.cashFlow || null]
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
