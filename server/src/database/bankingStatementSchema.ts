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
    `ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE bank_statement_transactions ADD COLUMN IF NOT EXISTS categorization_data JSONB`,
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
