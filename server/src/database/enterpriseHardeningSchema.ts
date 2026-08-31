import { DbQueryClient, db } from './db';

export const TENANT_SCOPED_TABLES = [
  'accounts',
  'bank_accounts',
  'bank_statement_imports',
  'bank_statement_transactions',
  'bank_reconciliation_matches',
  'bank_reconciliation_rules',
  'bank_reconciliation_sessions',
  'clients',
  'customers',
  'vendors',
  'salespersons',
  'projects',
  'time_entries',
  'estimates',
  'estimate_revisions',
  'sales_orders',
  'delivery_challans',
  'recurring_invoice_profiles',
  'invoices',
  'invoice_items',
  'payments_received',
  'payment_received_allocations',
  'credit_notes',
  'credit_note_applications',
  'customer_advances',
  'customer_advance_applications',
  'customer_refunds',
  'ar_write_offs',
  'bills',
  'purchase_orders',
  'goods_service_receipts',
  'payments_made',
  'payment_made_allocations',
  'vendor_credits',
  'debit_note_applications',
  'vendor_advances',
  'vendor_advance_applications',
  'ap_write_offs',
  'expenses',
  'expense_receipt_attachments',
  'journal_entries',
  'period_locks',
  'period_close_checklists',
  'accounting_period_closes',
  'accounting_period_close_events',
  'fixed_assets',
  'fixed_asset_depreciation_entries',
  'fixed_asset_events',
  'fixed_asset_lifecycle_events',
  'budgets',
  'budget_lines',
  'saved_reports',
  'items',
  'document_sequences',
  'recurring_transaction_profiles',
  'recurring_transaction_occurrences',
  'recurring_journal_profiles',
  'financial_reversals',
  'recovery_artifacts',
  'recovery_restore_jobs',
  'recovery_staging_rows',
  'audit_logs',
];

export async function applyEnterpriseHardeningSchema(client: DbQueryClient): Promise<void> {
  const additiveStatements = [
    `CREATE TABLE IF NOT EXISTS expense_receipt_attachments (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      expense_id VARCHAR(64) NOT NULL,
      file_name VARCHAR(180) NOT NULL,
      mime_type VARCHAR(32) NOT NULL,
      byte_size INTEGER NOT NULL,
      content BYTEA NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_expense_receipt_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_expense_receipts_org_expense ON expense_receipt_attachments (organization_id, expense_id)`,
    // 1. Audit Log Hash-Chaining Columns
    `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64)`,
    `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS current_hash VARCHAR(64)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_org_prev_hash ON audit_logs (organization_id, previous_hash)`,

    // 2. In-Engine Accounting Integrity Diagnostic Views
    `CREATE OR REPLACE VIEW vw_ledger_trial_balance_summary AS
     SELECT organization_id,
            COALESCE(SUM(debit), 0) AS total_debit,
            COALESCE(SUM(credit), 0) AS total_credit,
            ABS(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)) AS imbalance
       FROM journal_lines
      GROUP BY organization_id`,

    `CREATE OR REPLACE VIEW vw_ar_subledger_discrepancies AS
     SELECT i.organization_id,
            i.id AS invoice_id,
            i.invoice_number,
            i.total_amount,
            i.paid_amount,
            i.balance_due,
            COALESCE(SUM(pra.amount), 0) AS total_allocated,
            (i.total_amount - i.paid_amount - i.amount_credited - i.amount_written_off - i.balance_due) AS discrepancy
       FROM invoices i
       LEFT JOIN payment_received_allocations pra ON pra.organization_id = i.organization_id AND pra.invoice_id = i.id
      GROUP BY i.organization_id, i.id, i.invoice_number, i.total_amount, i.paid_amount, i.amount_credited, i.amount_written_off, i.balance_due`,

    `CREATE OR REPLACE VIEW vw_ap_subledger_discrepancies AS
     SELECT b.organization_id,
            b.id AS bill_id,
            b.bill_number,
            b.total_amount,
            b.amount_paid,
            b.balance_due,
            COALESCE(SUM(pma.amount), 0) AS total_allocated,
            (b.total_amount - b.amount_paid - b.amount_debited - b.amount_written_off - b.balance_due) AS discrepancy
       FROM bills b
       LEFT JOIN payment_made_allocations pma ON pma.organization_id = b.organization_id AND pma.bill_id = b.id
      GROUP BY b.organization_id, b.id, b.bill_number, b.total_amount, b.amount_paid, b.amount_debited, b.amount_written_off, b.balance_due`,
  ];

  for (const statement of additiveStatements) {
    try {
      if (db.isMemoryMode() && (statement.includes('CREATE OR REPLACE VIEW') || statement.includes('ALTER TABLE audit_logs ADD COLUMN'))) {
        // Safe execution in memory mode
        await client.query(statement).catch(() => {});
        continue;
      }
      await client.query(statement);
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
    }
  }

  // 3. PostgreSQL Native Row-Level Security (RLS) Policies
  if (!db.isMemoryMode()) {
    for (const table of TENANT_SCOPED_TABLES) {
      const rlsSql = `
        DO $$ BEGIN
          EXECUTE 'ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY';
          EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_policy ON ${table}';
          EXECUTE 'CREATE POLICY tenant_isolation_policy ON ${table}
                   USING (organization_id = NULLIF(current_setting(''app.current_org_id'', true), ''''))
                   WITH CHECK (organization_id = NULLIF(current_setting(''app.current_org_id'', true), ''''))';
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END $$;
      `;
      try {
        await client.query(rlsSql);
      } catch (err) {
        // Non-blocking in dev/test
        if (process.env.NODE_ENV === 'production') {
          console.warn(`[RLS Warning] Could not apply policy to ${table}:`, err);
        }
      }
    }
  }
}
