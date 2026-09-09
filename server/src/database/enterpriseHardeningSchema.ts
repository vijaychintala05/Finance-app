import { DbQueryClient, db } from './db';

export const TENANT_SCOPED_TABLES = [
  'accounts',
  'bank_accounts',
  'bank_transfers',
  'treasury_transactions',
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
  'vendor_refunds',
  'expenses',
  'expense_receipt_attachments',
  'journal_entries',
  'journal_lines',
  'payment_gateway_events',
  'payment_intents',
  'organization_payment_gateways',
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
      content_base64 TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_expense_receipt_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE RESTRICT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_expense_receipts_org_expense ON expense_receipt_attachments (organization_id, expense_id)`,
    `CREATE TABLE IF NOT EXISTS ledger_monthly_summaries (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      account_id VARCHAR(64) NOT NULL,
      fiscal_year INT NOT NULL,
      month INT NOT NULL,
      debit_turnover NUMERIC(15, 2) DEFAULT 0.00,
      credit_turnover NUMERIC(15, 2) DEFAULT 0.00,
      net_turnover NUMERIC(15, 2) DEFAULT 0.00,
      closing_balance NUMERIC(15, 2) DEFAULT 0.00,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_ledger_summary UNIQUE (organization_id, account_id, fiscal_year, month)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_ledger_summaries_lookup ON ledger_monthly_summaries (organization_id, fiscal_year, month)`,
    // 1. Audit Log Hash-Chaining Columns
    `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64)`,
    `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS current_hash VARCHAR(64)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_org_prev_hash ON audit_logs (organization_id, previous_hash)`,

    // High-Performance Query & Subledger Composite Indexes
    `CREATE INDEX IF NOT EXISTS idx_journal_lines_org_account ON journal_lines (organization_id, account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_journal_lines_org_acc_entry ON journal_lines (organization_id, account_id, journal_entry_id)`,
    `CREATE INDEX IF NOT EXISTS idx_invoices_org_status_date ON invoices (organization_id, status, issue_date)`,
    `CREATE INDEX IF NOT EXISTS idx_bills_org_status_date ON bills (organization_id, status, bill_date)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_received_org_client_date ON payments_received (organization_id, client_id, payment_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_made_org_vend_date ON payments_made (organization_id, vendor_id, payment_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON expenses (organization_id, date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_expenses_org_account ON expenses (organization_id, expense_account_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_received_org_date ON payments_received (organization_id, payment_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_made_org_date ON payments_made (organization_id, payment_date DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_org_status_type ON accounts (organization_id, status, type)`,

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
        END $$;
      `;
      try {
        await client.query(rlsSql);
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          throw err;
        }
      }
    }

    const accountingIntegritySql = `
      CREATE OR REPLACE FUNCTION prevent_posted_journal_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        IF UPPER(OLD.status) = 'POSTED' THEN
          IF TG_OP = 'DELETE' OR
             (to_jsonb(NEW) - ARRAY['reversed_by_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']) <>
             (to_jsonb(OLD) - ARRAY['reversed_by_journal_id', 'reversed_at', 'reversed_by', 'reversal_reason']) THEN
            RAISE EXCEPTION 'Posted journal entries are immutable. Adjustments require reversal entries.';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION firmbooks_assert_journal_balanced()
      RETURNS TRIGGER AS $$
      DECLARE
        target_entry_id VARCHAR(64);
        target_org_id VARCHAR(64);
        line_count BIGINT;
        debit_total NUMERIC(20, 2);
        credit_total NUMERIC(20, 2);
      BEGIN
        target_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
        target_org_id := COALESCE(NEW.organization_id, OLD.organization_id);
        IF EXISTS (
          SELECT 1 FROM journal_entries
           WHERE id = target_entry_id AND organization_id = target_org_id AND UPPER(status) = 'POSTED'
        ) THEN
          SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
            INTO line_count, debit_total, credit_total
            FROM journal_lines
           WHERE journal_entry_id = target_entry_id AND organization_id = target_org_id;
          IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
            RAISE EXCEPTION 'POSTED_JOURNAL_UNBALANCED: journal % has % lines, debit %, credit %',
              target_entry_id, line_count, debit_total, credit_total;
          END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION firmbooks_assert_posted_journal_header()
      RETURNS TRIGGER AS $$
      DECLARE
        line_count BIGINT;
        debit_total NUMERIC(20, 2);
        credit_total NUMERIC(20, 2);
      BEGIN
        IF UPPER(NEW.status) = 'POSTED' THEN
          SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
            INTO line_count, debit_total, credit_total
            FROM journal_lines
           WHERE journal_entry_id = NEW.id AND organization_id = NEW.organization_id;
          IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total THEN
            RAISE EXCEPTION 'POSTED_JOURNAL_UNBALANCED: journal % has % lines, debit %, credit %',
              NEW.id, line_count, debit_total, credit_total;
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_journal_lines_balanced ON journal_lines;
      CREATE CONSTRAINT TRIGGER trg_journal_lines_balanced
        AFTER INSERT OR UPDATE OR DELETE ON journal_lines
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION firmbooks_assert_journal_balanced();

      DROP TRIGGER IF EXISTS trg_journal_header_balanced ON journal_entries;
      CREATE CONSTRAINT TRIGGER trg_journal_header_balanced
        AFTER INSERT OR UPDATE OF status ON journal_entries
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION firmbooks_assert_posted_journal_header();

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payment_received_final_journal') THEN
          ALTER TABLE payments_received ADD CONSTRAINT ck_payment_received_final_journal
          CHECK (UPPER(status) IN ('SUBMITTED', 'DRAFT') OR journal_entry_id IS NOT NULL) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_payment_made_final_journal') THEN
          ALTER TABLE payments_made ADD CONSTRAINT ck_payment_made_final_journal
          CHECK (UPPER(status) IN ('SUBMITTED', 'DRAFT') OR journal_entry_id IS NOT NULL) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_customer_advance_journal') THEN
          ALTER TABLE customer_advances ADD CONSTRAINT ck_customer_advance_journal
          CHECK (journal_entry_id IS NOT NULL) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vendor_advance_journal') THEN
          ALTER TABLE vendor_advances ADD CONSTRAINT ck_vendor_advance_journal
          CHECK (journal_entry_id IS NOT NULL) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_customer_refund_journal') THEN
          ALTER TABLE customer_refunds ADD CONSTRAINT ck_customer_refund_journal
          CHECK (journal_entry_id IS NOT NULL) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_vendor_refund_journal') THEN
          ALTER TABLE vendor_refunds ADD CONSTRAINT ck_vendor_refund_journal
          CHECK (journal_entry_id IS NOT NULL) NOT VALID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_gateway_processed_journal') THEN
          ALTER TABLE payment_gateway_events ADD CONSTRAINT ck_gateway_processed_journal
          CHECK (UPPER(status) <> 'PROCESSED' OR journal_entry_id IS NOT NULL) NOT VALID;
        END IF;
      END $$;
    `;
    await client.query(accountingIntegritySql);
  }
}
