export interface RecoveryTableSchema {
  name: string;
  columns: readonly string[];
  selectSql: string;
  deleteSql: string;
  tenantColumn?: 'organization_id';
}

function tenantTable(name: string, columns: readonly string[]): RecoveryTableSchema {
  const orderCol = columns.includes('id') ? 'id' : columns[0];
  return {
    name,
    columns,
    tenantColumn: 'organization_id',
    selectSql: `SELECT ${columns.join(', ')} FROM ${name} WHERE organization_id = $1 ORDER BY ${orderCol}`,
    deleteSql: `DELETE FROM ${name} WHERE organization_id = $1`,
  };
}

function journalChildTable(name: string, columns: readonly string[]): RecoveryTableSchema {
  return {
    name,
    columns,
    selectSql: `SELECT ${columns.map((column) => `child.${column}`).join(', ')} FROM ${name} child
      JOIN journal_entries journal ON journal.id = child.journal_entry_id
      WHERE journal.organization_id = $1 ORDER BY child.id`,
    deleteSql: `DELETE FROM ${name} WHERE journal_entry_id IN
      (SELECT id FROM journal_entries WHERE organization_id = $1)`,
  };
}

// This is the only source of exportable table and column names. Request data is
// never used to construct SQL identifiers or accepted as an artifact schema.
export const POINT1_RECOVERY_SCHEMA: readonly RecoveryTableSchema[] = [
  tenantTable('organization_profiles', ['organization_id', 'legal_name', 'trade_name', 'tax_id', 'gstin', 'pan', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'phone', 'email', 'website', 'fiscal_year_start', 'default_payment_terms', 'invoice_prefix', 'estimate_prefix', 'po_prefix', 'bill_prefix', 'logo_url', 'invoice_notes', 'bank_name', 'bank_account_number', 'bank_ifsc_swift', 'updated_at']),
  tenantTable('accounts', ['id', 'organization_id', 'code', 'name', 'type', 'sub_type', 'balance', 'is_system_account', 'is_locked', 'status', 'created_at']),
  tenantTable('accounting_defaults', ['organization_id', 'system_role', 'account_id', 'created_at', 'updated_at']),
  tenantTable('clients', ['id', 'organization_id', 'name', 'company_name', 'email', 'phone', 'billing_address', 'tax_id', 'currency', 'payment_terms', 'notes', 'receivables_balance', 'created_at']),
  tenantTable('customers', ['id', 'organization_id', 'customer_id', 'display_name', 'legal_name', 'customer_type', 'gst_status', 'gstin', 'pan', 'billing_address', 'shipping_addresses', 'place_of_supply', 'primary_contact', 'additional_contacts', 'email', 'phone', 'currency', 'payment_terms', 'credit_limit', 'price_list_id', 'tax_preferences', 'default_sales_account_id', 'salesperson_id', 'notes', 'attachments', 'active', 'opening_balance', 'receivables_balance', 'unused_credits', 'advance_balance', 'created_at']),
  tenantTable('vendors', ['id', 'organization_id', 'name', 'company_name', 'email', 'phone', 'currency', 'billing_address', 'payables_balance', 'created_at']),
  tenantTable('invoices', ['id', 'organization_id', 'invoice_number', 'sales_order_id', 'estimate_id', 'client_id', 'customer_id', 'client_name', 'client_email', 'project_id', 'issue_date', 'due_date', 'subtotal', 'tax_total', 'discount', 'round_off_amount', 'total_amount', 'paid_amount', 'amount_credited', 'amount_written_off', 'balance_due', 'status', 'notes', 'created_at']),
  tenantTable('invoice_items', ['id', 'organization_id', 'invoice_id', 'description', 'account_id', 'quantity', 'unit_price', 'tax_rate', 'amount']),
  tenantTable('payments_received', ['id', 'organization_id', 'payment_number', 'client_id', 'client_name', 'payment_date', 'amount', 'payment_mode', 'deposit_to_account_id', 'reference', 'notes', 'unallocated_amount', 'status', 'created_at']),
  tenantTable('payment_received_allocations', ['id', 'organization_id', 'payment_id', 'invoice_id', 'amount']),
  tenantTable('bills', ['id', 'organization_id', 'bill_number', 'vendor_id', 'vendor_name', 'bill_date', 'due_date', 'total_amount', 'amount_paid', 'status', 'notes', 'created_at']),
  tenantTable('payments_made', ['id', 'organization_id', 'payment_number', 'vendor_id', 'vendor_name', 'payment_date', 'amount', 'payment_mode', 'paid_from_account_id', 'reference', 'notes', 'unallocated_amount', 'status', 'journal_entry_id', 'created_at']),
  tenantTable('payment_made_allocations', ['id', 'organization_id', 'payment_id', 'bill_id', 'amount']),
  tenantTable('credit_notes', ['id', 'organization_id', 'credit_note_number', 'client_id', 'client_name', 'date', 'total_amount', 'remaining_credit', 'status', 'reason', 'created_at']),
  tenantTable('vendor_credits', ['id', 'organization_id', 'credit_number', 'vendor_id', 'vendor_name', 'date', 'total_amount', 'remaining_credit', 'status', 'reason', 'created_at']),
  tenantTable('expenses', ['id', 'organization_id', 'expense_number', 'expense_account_id', 'paid_from_account_id', 'vendor_name', 'date', 'amount', 'tax_rate', 'description', 'created_at']),
  tenantTable('expense_receipt_attachments', ['id', 'organization_id', 'expense_id', 'file_name', 'mime_type', 'byte_size', 'content_base64', 'created_at']),
  tenantTable('journal_entries', ['id', 'organization_id', 'entry_number', 'date', 'reference', 'description', 'status', 'created_at', 'reversal_of_journal_id', 'reversed_by_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  journalChildTable('journal_lines', ['id', 'journal_entry_id', 'account_id', 'account_code', 'account_name', 'debit', 'credit', 'description']),
  tenantTable('customer_advances', ['id', 'organization_id', 'customer_id', 'payment_id', 'amount', 'unapplied_amount', 'received_date', 'status', 'journal_entry_id', 'created_at']),
  tenantTable('customer_advance_applications', ['id', 'organization_id', 'advance_id', 'invoice_id', 'amount_applied', 'applied_date', 'journal_entry_id', 'status', 'created_at', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('customer_refunds', ['id', 'organization_id', 'refund_number', 'customer_id', 'credit_note_id', 'payment_id', 'refund_date', 'amount', 'refund_account_id', 'reference', 'notes', 'journal_entry_id', 'created_at', 'status', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('ar_write_offs', ['id', 'organization_id', 'invoice_id', 'customer_id', 'write_off_date', 'amount', 'write_off_account_id', 'reason', 'user_id', 'journal_entry_id', 'created_at', 'status', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('credit_note_applications', ['id', 'organization_id', 'credit_note_id', 'invoice_id', 'amount_applied', 'applied_date', 'created_at', 'status', 'reversed_at', 'reversed_by']),
  tenantTable('vendor_advances', ['id', 'organization_id', 'vendor_id', 'payment_id', 'amount', 'unapplied_amount', 'paid_date', 'status', 'journal_entry_id', 'created_at', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('vendor_advance_applications', ['id', 'organization_id', 'advance_id', 'bill_id', 'amount_applied', 'applied_date', 'journal_entry_id', 'status', 'created_at', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('debit_note_applications', ['id', 'organization_id', 'debit_note_id', 'bill_id', 'amount_applied', 'applied_date', 'created_at', 'status', 'reversed_at', 'reversed_by']),
  tenantTable('ap_write_offs', ['id', 'organization_id', 'bill_id', 'vendor_id', 'write_off_date', 'amount', 'write_off_account_id', 'reason', 'user_id', 'journal_entry_id', 'created_at', 'status', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('financial_reversals', ['id', 'organization_id', 'source_type', 'source_id', 'reversal_journal_id', 'reason', 'created_by', 'created_at']),
  tenantTable('period_locks', ['id', 'organization_id', 'year', 'month', 'period_name', 'is_locked', 'lock_date', 'region', 'locked_by', 'locked_at', 'reason', 'status']),
  tenantTable('accounting_period_closes', ['id', 'organization_id', 'period_key', 'period_start', 'period_end', 'status', 'closed_by', 'closed_at', 'reopened_by', 'reopened_at', 'reopen_reason', 'checklist_summary', 'created_at', 'close_evidence', 'state_version']),
  tenantTable('fixed_assets', ['id', 'organization_id', 'asset_code', 'name', 'description', 'asset_category', 'purchase_date', 'in_service_date', 'purchase_value', 'residual_value', 'useful_life_months', 'depreciation_method', 'asset_account_id', 'accumulated_depreciation_account_id', 'depreciation_expense_account_id', 'vendor_id', 'bill_id', 'project_id', 'location_id', 'status', 'disposal_date', 'disposal_proceeds', 'disposal_journal_id', 'created_at']),
  tenantTable('fixed_asset_depreciation_entries', ['id', 'organization_id', 'asset_id', 'period_key', 'depreciation_amount', 'journal_entry_id', 'posted_date', 'created_at', 'reversed_at', 'status', 'reversed_by', 'reversal_reason', 'reversal_journal_id']),
  tenantTable('recurring_transaction_profiles', ['id', 'organization_id', 'kind', 'name', 'status', 'frequency', 'interval_count', 'start_date', 'next_run_date', 'end_date', 'anchor_day', 'timezone', 'catch_up_policy', 'max_catch_up', 'template', 'auto_post', 'created_by', 'paused_at', 'version', 'created_at', 'updated_at']),
  tenantTable('recurring_transaction_occurrences', ['id', 'organization_id', 'profile_id', 'occurrence_key', 'scheduled_for', 'kind', 'status', 'attempt_count', 'lease_owner', 'lease_expires_at', 'next_attempt_at', 'document_type', 'document_id', 'last_error_code', 'last_error_message', 'started_at', 'completed_at', 'quarantined_at', 'created_at', 'updated_at']),
] as const;
