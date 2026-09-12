export interface RecoveryTableSchema {
  name: string;
  columns: readonly string[];
  stagingKeyColumns?: readonly string[];
  selectSql: string;
  deleteSql: string;
  tenantColumn?: 'organization_id';
}

function tenantTable(name: string, columns: readonly string[], stagingKeyColumns?: readonly string[]): RecoveryTableSchema {
  const orderCol = columns.includes('id') ? 'id' : columns[0];
  return {
    name,
    columns,
    stagingKeyColumns: stagingKeyColumns || (columns.includes('id') ? ['id'] : ['organization_id']),
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
// Tables are ordered topologically so deletion in reverse and insertion forward
// preserves all foreign key constraints.
export const POINT1_RECOVERY_SCHEMA: readonly RecoveryTableSchema[] = [
  tenantTable('organization_profiles', ['organization_id', 'legal_name', 'trade_name', 'tax_id', 'gstin', 'pan', 'address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country', 'phone', 'email', 'website', 'fiscal_year_start', 'default_payment_terms', 'invoice_prefix', 'estimate_prefix', 'po_prefix', 'bill_prefix', 'logo_url', 'invoice_notes', 'bank_name', 'bank_account_number', 'bank_ifsc_swift', 'updated_at']),
  tenantTable('accounts', ['id', 'organization_id', 'code', 'name', 'type', 'sub_type', 'balance', 'is_system_account', 'is_locked', 'status', 'parent_account_id', 'reporting_group', 'normal_balance', 'normal_balance_is_explicit', 'allow_direct_posting', 'system_role', 'financial_statement', 'cash_flow_classification', 'currency_code', 'archived_at', 'archived_by', 'created_at']),
  tenantTable('accounting_defaults', ['organization_id', 'system_role', 'account_id', 'created_at', 'updated_at'], ['organization_id', 'system_role']),
  tenantTable('bank_accounts', ['id', 'organization_id', 'ledger_account_id', 'account_name', 'account_number', 'masked_account_number', 'bank_name', 'account_type', 'currency', 'country', 'current_balance', 'opening_balance_date', 'statement_import_enabled', 'status', 'is_active', 'created_at', 'updated_at']),
  tenantTable('clients', ['id', 'organization_id', 'name', 'company_name', 'email', 'phone', 'billing_address', 'tax_id', 'currency', 'payment_terms', 'notes', 'receivables_balance', 'created_at']),
  tenantTable('customers', ['id', 'organization_id', 'customer_id', 'display_name', 'legal_name', 'customer_type', 'gst_status', 'gstin', 'pan', 'billing_address', 'shipping_addresses', 'place_of_supply', 'primary_contact', 'additional_contacts', 'email', 'phone', 'currency', 'payment_terms', 'credit_limit', 'price_list_id', 'tax_preferences', 'default_sales_account_id', 'salesperson_id', 'notes', 'attachments', 'active', 'opening_balance', 'receivables_balance', 'unused_credits', 'advance_balance', 'created_at']),
  tenantTable('vendors', ['id', 'organization_id', 'name', 'company_name', 'email', 'phone', 'currency', 'billing_address', 'payables_balance', 'created_at']),
  tenantTable('salespersons', ['id', 'organization_id', 'name', 'email', 'phone', 'commission_rate', 'created_at']),
  tenantTable('projects', ['id', 'organization_id', 'code', 'name', 'client_id', 'client_name', 'description', 'status', 'budget_type', 'total_budget', 'hourly_rate', 'manager', 'created_at']),
  tenantTable('time_entries', ['id', 'organization_id', 'project_id', 'project_name', 'client_name', 'staff_name', 'task_name', 'date', 'hours', 'hourly_rate', 'is_billable', 'is_billed', 'description', 'created_at', 'invoice_id']),
  tenantTable('items', ['id', 'organization_id', 'name', 'sku', 'description', 'hsn_sac', 'unit', 'sales_rate', 'purchase_rate', 'gst_rate', 'sales_account_id', 'purchase_account_id', 'is_active', 'created_at', 'updated_at']),
  tenantTable('quotation_templates', ['id', 'organization_id', 'name', 'template_type', 'primary_color', 'font_family', 'show_logo', 'logo_url', 'company_info', 'show_tax_breakdown', 'show_signature', 'terms_and_conditions', 'bank_details', 'footer_note', 'is_default', 'created_at', 'updated_at']),
  tenantTable('document_sequences', ['id', 'organization_id', 'document_type', 'prefix', 'suffix', 'financial_year', 'next_number', 'padding_length', 'created_at']),
  tenantTable('estimates', ['id', 'organization_id', 'estimate_number', 'client_id', 'client_name', 'issue_date', 'expiry_date', 'subtotal', 'tax_total', 'discount', 'round_off_amount', 'is_gst_inclusive', 'total_amount', 'status', 'created_at']),
  tenantTable('estimate_revisions', ['id', 'organization_id', 'estimate_id', 'revision_number', 'change_summary', 'snapshot', 'created_by', 'created_at']),
  tenantTable('quotation_revisions', ['id', 'organization_id', 'quotation_id', 'revision_number', 'revision_data', 'total_amount', 'status', 'change_summary', 'created_by', 'created_at', 'template_snapshot']),
  tenantTable('sales_orders', ['id', 'organization_id', 'sales_order_number', 'estimate_id', 'customer_id', 'customer_name', 'order_date', 'expected_delivery', 'subtotal', 'tax_total', 'discount', 'total_amount', 'fulfilled_amount', 'invoiced_amount', 'status', 'line_items', 'project_id', 'notes', 'created_at']),
  tenantTable('delivery_challans', ['id', 'organization_id', 'challan_number', 'customer_id', 'customer_name', 'sales_order_id', 'delivery_date', 'status', 'reason', 'line_items', 'transport_details', 'notes', 'created_at']),
  tenantTable('recurring_invoice_profiles', ['id', 'organization_id', 'profile_name', 'frequency', 'start_date', 'end_date', 'next_generation_date', 'customer_id', 'customer_name', 'line_items', 'payment_terms', 'auto_send', 'status', 'created_at']),
  tenantTable('invoices', ['id', 'organization_id', 'invoice_number', 'sales_order_id', 'estimate_id', 'client_id', 'customer_id', 'client_name', 'client_email', 'project_id', 'issue_date', 'due_date', 'subtotal', 'tax_total', 'discount', 'round_off_amount', 'total_amount', 'paid_amount', 'amount_credited', 'amount_written_off', 'balance_due', 'status', 'notes', 'created_at']),
  tenantTable('invoice_items', ['id', 'organization_id', 'invoice_id', 'description', 'account_id', 'quantity', 'unit_price', 'tax_rate', 'amount']),
  tenantTable('payments_received', ['id', 'organization_id', 'payment_number', 'client_id', 'client_name', 'payment_date', 'amount', 'payment_mode', 'deposit_to_account_id', 'reference', 'notes', 'unallocated_amount', 'status', 'created_at']),
  tenantTable('payment_received_allocations', ['id', 'organization_id', 'payment_id', 'invoice_id', 'amount']),
  tenantTable('bills', ['id', 'organization_id', 'bill_number', 'vendor_id', 'vendor_name', 'bill_date', 'due_date', 'total_amount', 'amount_paid', 'status', 'notes', 'created_at']),
  tenantTable('purchase_orders', ['id', 'organization_id', 'purchase_order_number', 'vendor_id', 'vendor_name', 'order_date', 'expected_delivery', 'subtotal', 'tax_total', 'discount', 'total_amount', 'billed_amount', 'status', 'line_items', 'notes', 'created_at']),
  tenantTable('goods_service_receipts', ['id', 'organization_id', 'receipt_number', 'purchase_order_id', 'vendor_id', 'vendor_name', 'receipt_date', 'status', 'line_items', 'notes', 'created_at']),
  tenantTable('payments_made', ['id', 'organization_id', 'payment_number', 'vendor_id', 'vendor_name', 'payment_date', 'amount', 'payment_mode', 'paid_from_account_id', 'reference', 'notes', 'unallocated_amount', 'status', 'journal_entry_id', 'created_at']),
  tenantTable('payment_made_allocations', ['id', 'organization_id', 'payment_id', 'bill_id', 'amount']),
  tenantTable('credit_notes', ['id', 'organization_id', 'credit_note_number', 'client_id', 'client_name', 'date', 'total_amount', 'remaining_credit', 'status', 'reason', 'created_at']),
  tenantTable('vendor_credits', ['id', 'organization_id', 'credit_number', 'vendor_id', 'vendor_name', 'date', 'total_amount', 'remaining_credit', 'status', 'reason', 'created_at']),
  tenantTable('expenses', ['id', 'organization_id', 'expense_number', 'expense_account_id', 'paid_from_account_id', 'vendor_id', 'vendor_name', 'vendor_invoice_number', 'date', 'amount', 'tax_rate', 'tax_amount', 'tax_account_id', 'is_tax_inclusive', 'is_rcm', 'rcm_tax_account_id', 'tds_rate', 'tds_amount', 'tds_section', 'tds_account_id', 'description', 'project_id', 'client_id', 'is_billable', 'is_billed', 'invoice_id', 'created_at']),
  tenantTable('expense_receipt_attachments', ['id', 'organization_id', 'expense_id', 'file_name', 'mime_type', 'byte_size', 'content_base64', 'created_at']),
  tenantTable('employee_claims', ['id', 'organization_id', 'claim_number', 'claimant_id', 'claimant_name', 'claim_date', 'title', 'description', 'total_amount', 'approved_amount', 'paid_amount', 'status', 'payable_account_id', 'claim_journal_entry_id', 'reversal_journal_id', 'submitted_at', 'submitted_by', 'approved_at', 'approved_by', 'rejected_at', 'rejected_by', 'rejection_reason', 'created_at', 'updated_at']),
  tenantTable('employee_claim_items', ['id', 'organization_id', 'claim_id', 'expense_account_id', 'date', 'amount', 'tax_rate', 'tax_amount', 'description', 'project_id', 'client_id', 'receipt_url', 'created_at']),
  tenantTable('employee_reimbursement_payments', ['id', 'organization_id', 'payment_number', 'claim_id', 'claimant_id', 'payment_date', 'amount', 'paid_from_account_id', 'payable_account_id', 'payment_method', 'reference', 'notes', 'status', 'journal_entry_id', 'reversal_journal_id', 'created_by', 'created_at']),
  tenantTable('journal_entries', ['id', 'organization_id', 'entry_number', 'date', 'reference', 'description', 'status', 'created_at', 'reversal_of_journal_id', 'reversed_by_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  journalChildTable('journal_lines', ['id', 'journal_entry_id', 'organization_id', 'account_id', 'account_code', 'account_name', 'debit', 'credit', 'description']),
  tenantTable('customer_advances', ['id', 'organization_id', 'customer_id', 'payment_id', 'amount', 'unapplied_amount', 'received_date', 'status', 'journal_entry_id', 'created_at']),
  tenantTable('customer_advance_applications', ['id', 'organization_id', 'advance_id', 'invoice_id', 'amount_applied', 'applied_date', 'journal_entry_id', 'status', 'created_at', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('customer_refunds', ['id', 'organization_id', 'refund_number', 'customer_id', 'credit_note_id', 'payment_id', 'refund_date', 'amount', 'refund_account_id', 'reference', 'notes', 'journal_entry_id', 'created_at', 'status', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('ar_write_offs', ['id', 'organization_id', 'invoice_id', 'customer_id', 'write_off_date', 'amount', 'write_off_account_id', 'reason', 'user_id', 'journal_entry_id', 'created_at', 'status', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('credit_note_applications', ['id', 'organization_id', 'credit_note_id', 'invoice_id', 'amount_applied', 'applied_date', 'created_at', 'status', 'reversed_at', 'reversed_by']),
  tenantTable('vendor_advances', ['id', 'organization_id', 'vendor_id', 'payment_id', 'amount', 'unapplied_amount', 'paid_date', 'status', 'journal_entry_id', 'created_at', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('vendor_advance_applications', ['id', 'organization_id', 'advance_id', 'bill_id', 'amount_applied', 'applied_date', 'journal_entry_id', 'status', 'created_at', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('debit_note_applications', ['id', 'organization_id', 'debit_note_id', 'bill_id', 'amount_applied', 'applied_date', 'created_at', 'status', 'reversed_at', 'reversed_by']),
  tenantTable('ap_write_offs', ['id', 'organization_id', 'bill_id', 'vendor_id', 'write_off_date', 'amount', 'write_off_account_id', 'reason', 'user_id', 'journal_entry_id', 'created_at', 'status', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('vendor_refunds', ['id', 'organization_id', 'refund_number', 'vendor_id', 'debit_note_id', 'payment_id', 'refund_date', 'amount', 'deposit_to_account_id', 'reference', 'notes', 'status', 'journal_entry_id', 'created_at', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']),
  tenantTable('financial_reversals', ['id', 'organization_id', 'source_type', 'source_id', 'reversal_journal_id', 'reason', 'created_by', 'created_at']),
  tenantTable('bank_transfers', ['id', 'organization_id', 'transfer_number', 'transfer_date', 'from_bank_account_id', 'to_bank_account_id', 'from_ledger_account_id', 'to_ledger_account_id', 'amount', 'reference', 'description', 'status', 'journal_entry_id', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason', 'created_by', 'created_at']),
  tenantTable('treasury_transactions', ['id', 'organization_id', 'transaction_number', 'transaction_type', 'transaction_date', 'monetary_account_id', 'counter_account_id', 'amount', 'principal_amount', 'interest_amount', 'interest_expense_account_id', 'employee_name', 'reference', 'description', 'status', 'journal_entry_id', 'reversal_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason', 'created_by', 'created_at']),
  tenantTable('bank_statement_imports', ['id', 'organization_id', 'bank_account_id', 'source_format', 'original_filename', 'file_hash', 'parser_version', 'statement_from', 'statement_to', 'opening_balance', 'closing_balance', 'currency', 'imported_by', 'imported_at', 'transaction_count', 'status']),
  tenantTable('bank_statement_transactions', ['id', 'organization_id', 'bank_account_id', 'statement_import_id', 'transaction_date', 'value_date', 'amount', 'direction', 'running_balance', 'narration', 'reference', 'transaction_type', 'utr', 'rrn', 'upi_reference', 'cheque_number', 'counterparty_name', 'currency', 'reconciliation_status', 'fingerprint', 'raw_data', 'created_at']),
  tenantTable('bank_reconciliation_rules', ['id', 'organization_id', 'rule_name', 'priority', 'narration_pattern', 'direction', 'suggested_category', 'suggested_account_id', 'is_enabled', 'created_at']),
  tenantTable('bank_reconciliation_sessions', ['id', 'organization_id', 'bank_account_id', 'statement_end_date', 'statement_closing_balance', 'ledger_balance', 'difference', 'reconciled_by', 'reconciled_at', 'status']),
  tenantTable('bank_reconciliation_matches', ['id', 'organization_id', 'statement_transaction_id', 'accounting_transaction_type', 'accounting_transaction_id', 'matched_amount', 'match_confidence', 'match_reasons', 'matched_by', 'matched_at', 'status']),
  tenantTable('bank_feed_connections', ['id', 'organization_id', 'bank_account_id', 'provider', 'connection_status', 'credentials_encrypted', 'created_at', 'updated_at']),
  tenantTable('period_locks', ['id', 'organization_id', 'year', 'month', 'period_name', 'is_locked', 'lock_date', 'region', 'locked_by', 'locked_at', 'reason', 'status']),
  tenantTable('period_close_checklists', ['id', 'organization_id', 'period_key', 'status', 'checklist_data', 'closed_by', 'closed_at', 'created_at']),
  tenantTable('accounting_period_closes', ['id', 'organization_id', 'period_key', 'period_start', 'period_end', 'status', 'closed_by', 'closed_at', 'reopened_by', 'reopened_at', 'reopen_reason', 'checklist_summary', 'created_at', 'close_evidence', 'state_version']),
  tenantTable('accounting_period_close_events', ['id', 'organization_id', 'period_key', 'event_type', 'event_at', 'actor_id', 'reason', 'evidence']),
  tenantTable('fixed_assets', ['id', 'organization_id', 'asset_code', 'name', 'description', 'asset_category', 'purchase_date', 'in_service_date', 'purchase_value', 'residual_value', 'useful_life_months', 'depreciation_method', 'asset_account_id', 'accumulated_depreciation_account_id', 'depreciation_expense_account_id', 'vendor_id', 'bill_id', 'project_id', 'location_id', 'status', 'disposal_date', 'disposal_proceeds', 'disposal_journal_id', 'created_at']),
  tenantTable('fixed_asset_depreciation_entries', ['id', 'organization_id', 'asset_id', 'period_key', 'depreciation_amount', 'journal_entry_id', 'posted_date', 'created_at', 'reversed_at', 'status', 'reversed_by', 'reversal_reason', 'reversal_journal_id']),
  tenantTable('fixed_asset_events', ['id', 'organization_id', 'asset_id', 'event_type', 'effective_date', 'amount', 'journal_entry_id', 'reversal_of_event_id', 'reversed_by_event_id', 'metadata', 'created_by', 'created_at']),
  tenantTable('fixed_asset_lifecycle_events', ['id', 'organization_id', 'asset_id', 'event_type', 'event_date', 'journal_entry_id', 'amount', 'status', 'evidence', 'created_by', 'reversed_at', 'reversed_by', 'reversal_reason', 'reversal_journal_id', 'created_at']),
  tenantTable('recurring_transaction_profiles', ['id', 'organization_id', 'kind', 'name', 'status', 'frequency', 'interval_count', 'start_date', 'next_run_date', 'end_date', 'anchor_day', 'timezone', 'catch_up_policy', 'max_catch_up', 'template', 'auto_post', 'created_by', 'paused_at', 'version', 'created_at', 'updated_at']),
  tenantTable('recurring_transaction_occurrences', ['id', 'organization_id', 'profile_id', 'occurrence_key', 'scheduled_for', 'kind', 'status', 'attempt_count', 'lease_owner', 'lease_expires_at', 'next_attempt_at', 'document_type', 'document_id', 'last_error_code', 'last_error_message', 'started_at', 'completed_at', 'quarantined_at', 'created_at', 'updated_at']),
  tenantTable('recurring_journal_profiles', ['id', 'organization_id', 'name', 'description', 'frequency', 'start_date', 'end_date', 'next_run_date', 'journal_template', 'auto_post', 'status', 'created_by', 'created_at']),
  tenantTable('budgets', ['id', 'organization_id', 'name', 'financial_year', 'version', 'status', 'created_by', 'created_at']),
  tenantTable('budget_lines', ['id', 'organization_id', 'budget_id', 'account_id', 'project_id', 'business_line', 'location_id', 'cost_center_id', 'period_key', 'amount', 'created_at']),
  tenantTable('saved_reports', ['id', 'organization_id', 'user_id', 'name', 'report_type', 'visibility', 'is_favorite', 'config', 'created_at']),
  tenantTable('approval_rules', ['id', 'organization_id', 'entity_type', 'is_required', 'threshold_amount', 'approver_role', 'allow_self_approval'], ['organization_id', 'entity_type']),
  tenantTable('approval_requests', ['id', 'organization_id', 'entity_type', 'entity_id', 'submitted_by', 'submitted_at', 'status', 'approved_by', 'approved_at', 'rejection_reason', 'amount', 'document_hash', 'document_version']),
  tenantTable('background_jobs', ['id', 'organization_id', 'job_type', 'payload', 'status', 'attempt_count', 'max_retries', 'backoff_seconds', 'next_attempt_at', 'lease_owner', 'lease_expires_at', 'idempotency_key', 'started_at', 'completed_at', 'last_error', 'result', 'created_at', 'updated_at']),
  tenantTable('background_job_runs', ['id', 'job_id', 'organization_id', 'attempt_number', 'worker_id', 'status', 'error_message', 'duration_ms', 'created_at']),
  tenantTable('payment_intents', ['id', 'organization_id', 'customer_id', 'invoice_id', 'gateway', 'provider_session_id', 'provider_reference', 'currency', 'amount', 'status', 'idempotency_key', 'checkout_url', 'metadata', 'payment_id', 'gateway_event_id', 'expires_at', 'created_at', 'updated_at']),
  tenantTable('organization_payment_gateways', ['id', 'organization_id', 'gateway', 'is_active', 'key_id', 'key_secret', 'webhook_secret', 'config', 'created_at', 'updated_at']),
  tenantTable('payment_gateway_events', ['id', 'organization_id', 'gateway', 'event_id', 'event_type', 'payload', 'status', 'payment_id', 'invoice_id', 'settlement_reference', 'processed_at', 'error_message', 'created_at']),
  tenantTable('document_inbox', ['id', 'organization_id', 'filename', 'file_url', 'mime_type', 'file_size', 'status', 'ocr_data', 'linked_document_type', 'linked_document_id', 'uploaded_by', 'created_at', 'updated_at']),
  tenantTable('customer_portal_tokens', ['id', 'organization_id', 'customer_id', 'token', 'token_hash', 'is_active', 'expires_at', 'created_at']),
  tenantTable('saved_views', ['id', 'organization_id', 'user_id', 'entity_type', 'name', 'filters', 'is_default', 'created_at']),
  tenantTable('organization_invitations', ['id', 'organization_id', 'email', 'role', 'token_hash', 'invited_by_user_id', 'accepted_by_user_id', 'expires_at', 'accepted_at', 'revoked_at', 'revoked_by_user_id', 'created_at']),
] as const;
