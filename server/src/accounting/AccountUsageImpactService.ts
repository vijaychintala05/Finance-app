import type { DbQueryClient } from '../database/db';
import { LedgerQueryService } from '../services/LedgerQueryService';

export interface AccountUsageReference {
  label: string;
  count: number;
}

export interface AccountUsageImpact {
  accountId: string;
  balance: number;
  totalReferences: number;
  references: AccountUsageReference[];
  accountingDefaults: string[];
  archiveBlockers: string[];
  deleteBlockers: string[];
  inventoryComplete: boolean;
  inventoryScope: 'tenant-scoped-account-reference-registry-v1';
  unclassifiedAccountReferenceColumns: string[];
}

/**
 * Account dependencies taken from the canonical migration and recovery schemas.
 * Every query is constrained by organization_id. journal_lines permits legacy rows
 * without organization_id only when their parent journal establishes the tenant.
 * Keep new account-reference columns from migrations in this registry.
 */
const ACCOUNT_REFERENCE_QUERIES: ReadonlyArray<{ label: string; sql: string }> = [
  { label: 'child accounts', sql: `SELECT COUNT(*)::int AS count FROM accounts WHERE organization_id = $1 AND parent_account_id = $2` },
  { label: 'accounting defaults', sql: `SELECT COUNT(*)::int AS count FROM accounting_defaults WHERE organization_id = $1 AND account_id = $2` },
  { label: 'bank account profiles', sql: `SELECT COUNT(*)::int AS count FROM bank_accounts WHERE organization_id = $1 AND ledger_account_id = $2` },
  { label: 'bank reconciliation rules', sql: `SELECT COUNT(*)::int AS count FROM bank_reconciliation_rules WHERE organization_id = $1 AND suggested_account_id = $2` },
  { label: 'invoice lines', sql: `SELECT COUNT(*)::int AS count FROM invoice_items WHERE organization_id = $1 AND account_id = $2` },
  { label: 'customer payments', sql: `SELECT COUNT(*)::int AS count FROM payments_received WHERE organization_id = $1 AND deposit_to_account_id = $2` },
  { label: 'vendor payments', sql: `SELECT COUNT(*)::int AS count FROM payments_made WHERE organization_id = $1 AND paid_from_account_id = $2` },
  { label: 'expenses and tax allocations', sql: `SELECT COUNT(*)::int AS count FROM expenses WHERE organization_id = $1 AND $2 IN (expense_account_id, paid_from_account_id, tax_account_id, rcm_tax_account_id, tds_account_id)` },
  { label: 'journal entry lines', sql: `SELECT COUNT(*)::int AS count FROM journal_lines jl LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id WHERE jl.account_id = $2 AND COALESCE(jl.organization_id, je.organization_id) = $1` },
  { label: 'customer defaults', sql: `SELECT COUNT(*)::int AS count FROM customers WHERE organization_id = $1 AND default_sales_account_id = $2` },
  { label: 'vendor defaults', sql: `SELECT COUNT(*)::int AS count FROM vendors WHERE organization_id = $1 AND default_expense_account_id = $2` },
  { label: 'customer refunds', sql: `SELECT COUNT(*)::int AS count FROM customer_refunds WHERE organization_id = $1 AND refund_account_id = $2` },
  { label: 'vendor refunds', sql: `SELECT COUNT(*)::int AS count FROM vendor_refunds WHERE organization_id = $1 AND deposit_to_account_id = $2` },
  { label: 'receivable write-offs', sql: `SELECT COUNT(*)::int AS count FROM ar_write_offs WHERE organization_id = $1 AND write_off_account_id = $2` },
  { label: 'payable write-offs', sql: `SELECT COUNT(*)::int AS count FROM ap_write_offs WHERE organization_id = $1 AND write_off_account_id = $2` },
  { label: 'budget lines', sql: `SELECT COUNT(*)::int AS count FROM budget_lines WHERE organization_id = $1 AND account_id = $2` },
  { label: 'fixed assets', sql: `SELECT COUNT(*)::int AS count FROM fixed_assets WHERE organization_id = $1 AND $2 IN (asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id)` },
  { label: 'item defaults', sql: `SELECT COUNT(*)::int AS count FROM items WHERE organization_id = $1 AND $2 IN (sales_account_id, purchase_account_id)` },
  { label: 'employee claim payable accounts', sql: `SELECT COUNT(*)::int AS count FROM employee_claims WHERE organization_id = $1 AND payable_account_id = $2` },
  { label: 'employee claim expense accounts', sql: `SELECT COUNT(*)::int AS count FROM employee_claim_items WHERE organization_id = $1 AND expense_account_id = $2` },
  { label: 'employee reimbursement payments', sql: `SELECT COUNT(*)::int AS count FROM employee_reimbursement_payments WHERE organization_id = $1 AND $2 IN (paid_from_account_id, payable_account_id)` },
  { label: 'bank transfers', sql: `SELECT COUNT(*)::int AS count FROM bank_transfers WHERE organization_id = $1 AND $2 IN (from_ledger_account_id, to_ledger_account_id)` },
  { label: 'treasury transactions', sql: `SELECT COUNT(*)::int AS count FROM treasury_transactions WHERE organization_id = $1 AND $2 IN (monetary_account_id, counter_account_id, interest_expense_account_id)` },
  { label: 'ledger monthly summaries', sql: `SELECT COUNT(*)::int AS count FROM ledger_monthly_summaries WHERE organization_id = $1 AND account_id = $2` },
];

const REGISTERED_ACCOUNT_REFERENCE_COLUMNS = new Set([
  'accounts.parent_account_id',
  'accounting_defaults.account_id',
  'bank_accounts.ledger_account_id',
  'bank_reconciliation_rules.suggested_account_id',
  'invoice_items.account_id',
  'payments_received.deposit_to_account_id',
  'payments_made.paid_from_account_id',
  'expenses.expense_account_id', 'expenses.paid_from_account_id', 'expenses.tax_account_id', 'expenses.rcm_tax_account_id', 'expenses.tds_account_id',
  'journal_lines.account_id',
  'customers.default_sales_account_id', 'vendors.default_expense_account_id',
  'customer_refunds.refund_account_id', 'vendor_refunds.deposit_to_account_id',
  'ar_write_offs.write_off_account_id', 'ap_write_offs.write_off_account_id',
  'budget_lines.account_id',
  'fixed_assets.asset_account_id', 'fixed_assets.accumulated_depreciation_account_id', 'fixed_assets.depreciation_expense_account_id',
  'items.sales_account_id', 'items.purchase_account_id',
  'employee_claims.payable_account_id', 'employee_claim_items.expense_account_id',
  'employee_reimbursement_payments.paid_from_account_id', 'employee_reimbursement_payments.payable_account_id',
  'bank_transfers.from_ledger_account_id', 'bank_transfers.to_ledger_account_id',
  'treasury_transactions.monetary_account_id', 'treasury_transactions.counter_account_id', 'treasury_transactions.interest_expense_account_id',
  'ledger_monthly_summaries.account_id',
]);

// These IDs point to bank profiles or external systems, not ledger accounts. Their
// ledger-account relationships are covered by the registered bank/transfer queries.
const NON_LEDGER_ACCOUNT_ID_COLUMNS = new Set([
  'bank_statement_imports.bank_account_id', 'bank_statement_transactions.bank_account_id',
  'bank_reconciliation_sessions.bank_account_id', 'bank_feed_connections.bank_account_id',
  'bank_transfers.from_bank_account_id', 'bank_transfers.to_bank_account_id',
  'payment_gateway_events.external_account_id', 'bank_feed_connections.external_account_id',
]);

export class AccountUsageImpactService {
  static async get(client: DbQueryClient, organizationId: string, accountId: string): Promise<AccountUsageImpact | null> {
    const accountResult = await client.query(
      `SELECT id, balance, status, is_system_account, is_locked FROM accounts WHERE organization_id = $1 AND id = $2`,
      [organizationId, accountId],
    );
    const account = accountResult.rows[0];
    if (!account) return null;

    const [referenceResults, defaultsResult, activeChildrenResult, ledgerBalances] = await Promise.all([
      Promise.all(ACCOUNT_REFERENCE_QUERIES.map(async (dependency) => {
        const result = await client.query(dependency.sql, [organizationId, accountId]);
        return { label: dependency.label, count: Number(result.rows[0]?.count || 0) };
      })),
      client.query(
        `SELECT system_role FROM accounting_defaults WHERE organization_id = $1 AND account_id = $2 ORDER BY system_role`,
        [organizationId, accountId],
      ),
      client.query(
        `SELECT COUNT(*)::int AS count FROM accounts WHERE organization_id = $1 AND parent_account_id = $2 AND status = 'Active'`,
        [organizationId, accountId],
      ),
      LedgerQueryService.getAccountBalances(organizationId, { accountIds: [accountId] }, client),
    ]);

    const totalReferences = referenceResults.reduce((total, reference) => total + reference.count, 0);
    const accountingDefaults = defaultsResult.rows.map((row) => String(row.system_role));
    const balance = Number(ledgerBalances[0]?.netBalance ?? 0);
    let inventoryComplete = false;
    let unclassifiedAccountReferenceColumns: string[] = [];
    try {
      const schemaColumns = await client.query(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
      );
      const accountIdColumns = schemaColumns.rows
        .map((row) => ({ table: String(row.table_name), column: String(row.column_name) }))
        .filter(({ column }) => column === 'account_id' || column.endsWith('_account_id'));
      unclassifiedAccountReferenceColumns = accountIdColumns.filter(({ table, column }) => {
        const key = `${table}.${column}`;
        return !REGISTERED_ACCOUNT_REFERENCE_COLUMNS.has(key) && !NON_LEDGER_ACCOUNT_ID_COLUMNS.has(key);
      }).map(({ table, column }) => `${table}.${column}`);
      inventoryComplete = unclassifiedAccountReferenceColumns.length === 0;
    } catch {
      // Missing schema-inspection capability is an unknown inventory, never a green light.
      inventoryComplete = false;
    }
    const archiveBlockers: string[] = [];
    const deleteBlockers: string[] = [];
    if (!inventoryComplete) {
      archiveBlockers.push('Account reference inventory is incomplete; archive safety is unknown.');
      deleteBlockers.push('Account reference inventory is incomplete; deletion is blocked.');
    }
    if (balance !== 0) {
      archiveBlockers.push('Account balance must be zero before archiving.');
      deleteBlockers.push('Account balance must be zero before deletion.');
    }
    if (Number(activeChildrenResult.rows[0]?.count || 0) > 0) archiveBlockers.push('Active child accounts must be reassigned or archived first.');
    const operationalDefaults = referenceResults.filter((reference) => ['customer defaults', 'vendor defaults', 'item defaults'].includes(reference.label));
    if (accountingDefaults.length > 0 || operationalDefaults.some((reference) => reference.count > 0)) archiveBlockers.push('Reassign accounting or customer, vendor, and item defaults before archiving this account.');
    if (account.is_system_account || account.is_locked) {
      archiveBlockers.push('System and locked accounts cannot be archived.');
      deleteBlockers.push('System and locked accounts cannot be deleted.');
    }
    if (totalReferences > 0) deleteBlockers.push('Remove all listed references before deleting this account.');

    return {
      accountId: String(account.id),
      balance,
      totalReferences,
      references: referenceResults,
      accountingDefaults,
      archiveBlockers,
      deleteBlockers,
      // Complete only when live account-reference columns are all classified and every
      // registered tenant-scoped query above completed successfully.
      inventoryComplete,
      inventoryScope: 'tenant-scoped-account-reference-registry-v1',
      unclassifiedAccountReferenceColumns,
    };
  }
}
