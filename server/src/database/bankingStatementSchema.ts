import { DbQueryClient } from './db';

export async function applyBankingStatementSchema(client: DbQueryClient): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS bank_statement_import_observations (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      statement_import_id VARCHAR(64) NOT NULL,
      statement_transaction_id VARCHAR(64) NOT NULL,
      row_number INT NOT NULL,
      raw_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS reconciled_through_date DATE`,
    `ALTER TABLE bank_statement_imports ADD COLUMN IF NOT EXISTS closing_balance_verified BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE bank_statement_imports ADD COLUMN IF NOT EXISTS balance_discrepancy NUMERIC(15, 2)`,
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS categorization_data JSONB`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS review_decision VARCHAR(20)`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(64)`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS review_duplicate_candidates JSONB`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_stmt_disposition_target
       ON bank_statement_transactions (organization_id, id, bank_account_id)`,
    `CREATE TABLE IF NOT EXISTS bank_statement_line_dispositions (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      bank_account_id VARCHAR(64) NOT NULL,
      statement_transaction_id VARCHAR(64) NOT NULL,
      kind VARCHAR(32) NOT NULL CHECK (kind IN ('CONFIRMED_DUPLICATE', 'PROVEN_ARTIFACT')),
      target_statement_transaction_id VARCHAR(64),
      reason TEXT NOT NULL,
      evidence JSONB NOT NULL,
      decided_by VARCHAR(64) NOT NULL,
      decided_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_by VARCHAR(64),
      revoked_at TIMESTAMP WITH TIME ZONE,
      revocation_reason TEXT,
      CHECK ((kind = 'CONFIRMED_DUPLICATE' AND target_statement_transaction_id IS NOT NULL AND target_statement_transaction_id <> statement_transaction_id)
          OR (kind = 'PROVEN_ARTIFACT' AND target_statement_transaction_id IS NULL)),
      FOREIGN KEY (organization_id, statement_transaction_id, bank_account_id)
        REFERENCES bank_statement_transactions (organization_id, id, bank_account_id) ON DELETE RESTRICT,
      FOREIGN KEY (organization_id, target_statement_transaction_id, bank_account_id)
        REFERENCES bank_statement_transactions (organization_id, id, bank_account_id) ON DELETE RESTRICT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_statement_disposition_org_id
       ON bank_statement_line_dispositions (organization_id, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_statement_active_disposition
       ON bank_statement_line_dispositions (organization_id, statement_transaction_id)
       WHERE revoked_at IS NULL`,
    `CREATE INDEX IF NOT EXISTS idx_bank_statement_disposition_target
       ON bank_statement_line_dispositions (organization_id, target_statement_transaction_id)
       WHERE revoked_at IS NULL AND kind = 'CONFIRMED_DUPLICATE'`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_reconciliation_session_org_id
       ON bank_reconciliation_sessions (organization_id, id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS uk_bank_statement_import_org_id
       ON bank_statement_imports (organization_id, id)`,
    `CREATE TABLE IF NOT EXISTS bank_reconciliation_session_items (
      id VARCHAR(64) PRIMARY KEY,
      organization_id VARCHAR(64) NOT NULL,
      session_id VARCHAR(64) NOT NULL,
      bank_account_id VARCHAR(64) NOT NULL,
      statement_transaction_id VARCHAR(64) NOT NULL,
      statement_import_id VARCHAR(64) NOT NULL,
      resolution_kind VARCHAR(32) NOT NULL CHECK (resolution_kind IN ('ALLOCATED', 'CONFIRMED_DUPLICATE', 'PROVEN_ARTIFACT')),
      allocation_snapshot JSONB NOT NULL,
      observation_ids JSONB NOT NULL,
      disposition_id VARCHAR(64),
      target_statement_transaction_id VARCHAR(64),
      evidence_hash VARCHAR(128) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (organization_id, session_id, statement_transaction_id),
      FOREIGN KEY (organization_id, session_id)
        REFERENCES bank_reconciliation_sessions (organization_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (organization_id, statement_transaction_id, bank_account_id)
        REFERENCES bank_statement_transactions (organization_id, id, bank_account_id) ON DELETE RESTRICT,
      FOREIGN KEY (organization_id, statement_import_id)
        REFERENCES bank_statement_imports (organization_id, id) ON DELETE RESTRICT,
      FOREIGN KEY (organization_id, disposition_id)
        REFERENCES bank_statement_line_dispositions (organization_id, id) ON DELETE RESTRICT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_stmt_obs_tx ON bank_statement_import_observations (organization_id, statement_transaction_id)`,
    `CREATE INDEX IF NOT EXISTS idx_stmt_obs_imp ON bank_statement_import_observations (organization_id, statement_import_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bank_stmt_tx_org_acc_date ON bank_statement_transactions (organization_id, bank_account_id, transaction_date)`,
    `CREATE INDEX IF NOT EXISTS idx_bank_stmt_tx_org_acc_status ON bank_statement_transactions (organization_id, bank_account_id, reconciliation_status)`
  ];

  for (const sql of statements) {
    try {
      await client.query(sql);
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
    }
  }
}
